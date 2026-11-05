/**
 * render.ts — drawing the map: every level of the stack, one on top of the next, cut down to what
 * is in sight. The exploration screen and the Map viewer both draw through this, so the viewer
 * shows exactly what the game does.
 *
 * Each storey is drawn RISE tiles higher on screen than the one below, so stairs visibly climb. Walls
 * and cliffs are blocks on their own levels, seen wherever no floor is in the way, and fade with
 * their distance from your level (`wallFade`). Floors below you fade the same way; floors above
 * you are never drawn. Walls above you are split at your row: what's behind you is drawn first,
 * then whoever stands there (the player), then what's in front.
 *
 * How sight is drawn: no screen-sized masks. Each level keeps a short list of the tiles you can
 * see (`surfOps`, `wallOps`, `cliffOps`), worked out only when sight changes, and each is copied
 * straight from the level's pre-painted chunk. A tile that is fully lit, with every neighbour
 * fully lit, goes down in one piece at full strength; only tiles on the edge of your sight
 * (a short band where the light fades) go through a small scratch tile and are blended
 * smoothly, pixel by pixel, between their neighbours' brightness.
 */
import { CHUNK, CHUNK_PAD_TOP, makeCanvas, paintChunk } from "./paint";
import { createStatsOverlay } from "./gl/stats";
import { groupRows, type Light, type MapRenderer, type View, WALL_TILES } from "./view";
import { lampX, lampY, seeThrough } from "./sight";
import { BODY_ABOVE_FEET, COLORS, GAP_PEEK, GHOST_ALPHA, MAX_PIXEL_RATIO, RENDER_SCALE, RISE, SIGHT_EASE, TILES_TALL, VISION_FADE, VISION_RADIUS, wallFade } from "./tuning";
import { CLIFFS, DIAG, diagSide, FLOOR, isHoleDiag, isRamp, levelOf, LEVELS, onShaftOpen, roomLimit, shaftDiagSide, slopeAt, STAIRS, tileAt, WALL, wallFacesInto, WORLD } from "./world";

/** A tile and the eight round it all this bright (of 1) count as fully lit. */
const FULL = 0.998;
/** Numbers per tile in a list of tiles to draw: x, y, pixels it reaches above its row, clip shape (0 none, 1 and 2 the cliff bands), how it is cut (see `pushTile`), the brightness of it and its eight neighbours (row by row, from the north-west), and the centre of the doorway light it is lit by on its level (-1: you). */
const OPS = 16;

type Kind = "surface" | "walls" | "cliffs";
type Chunk = ({ [K in Kind]: HTMLCanvasElement } & { used: number; shade: { cur: number; layers: { [K in Kind]?: HTMLCanvasElement } } }) | null;

/** The map drawn on a plain 2D canvas, tile by tile. The fallback for the WebGL renderer (see `render.ts`). */
export function createMapRenderer2D(canvas: HTMLCanvasElement): MapRenderer {
  const g = canvas.getContext("2d", { alpha: false })!;
  const ghostCanvas = document.createElement("canvas"), ghostCtx = ghostCanvas.getContext("2d")!;
  const { w: MW, h: MH } = WORLD;
  let T = 0;
  // Painted chunks of each level, as they've come into view (dropped once long out of view).
  const chunks = new Map<number, Chunk>();
  let frameNo = 0;
  const chunkAt = (z: number, cx: number, cy: number): Chunk => {
    const key = (z * 256 + cy) * 256 + cx;
    let c = chunks.get(key);
    if (c === undefined) {
      const p = paintChunk(z, T, cx, cy);
      c = p && { ...p, used: frameNo, shade: { cur: -1, layers: {} } };
      chunks.set(key, c);
    }
    if (c) c.used = frameNo;
    return c;
  };
  /**
   * A chunk's layer darkened for its depth below (or height above) the level you stand on. The
   * darkening depends only on that depth, so it is done once per chunk and kept until you change
   * level, instead of being painted over the screen every frame.
   */
  const shaded = (c: NonNullable<Chunk>, kind: Kind, fade: number, cur: number) => {
    if (fade >= 1) return c[kind];
    if (c.shade.cur !== cur) c.shade = { cur, layers: {} };
    let s = c.shade.layers[kind];
    if (!s) {
      const src = c[kind];
      s = makeCanvas(src.width, src.height);
      const sc = s.getContext("2d")!;
      sc.drawImage(src, 0, 0);
      sc.globalCompositeOperation = "source-atop";
      sc.fillStyle = `rgb(0 0 0 / ${1 - fade})`;
      sc.fillRect(0, 0, s.width, s.height);
      c.shade.layers[kind] = s;
    }
    return s;
  };
  /** Keeps the cache small: chunks not drawn for a while go (they're repainted if needed). */
  const evictChunks = () => {
    if (chunks.size < 240) return;
    for (const [k, c] of chunks) if (!c || frameNo - c.used > 120) chunks.delete(k);
  };
  // The world is composed here, level by level, before going on screen.
  const scene = makeCanvas(1, 1);
  const sg = scene.getContext("2d")!;
  // Scratch layer where the actors of a level are drawn before joining the scene.
  const layer = makeCanvas(1, 1);
  const yg = layer.getContext("2d")!;
  // How brightly you currently see each tile of each level (eased toward what you see now).
  const glow = WORLD.levels.map(() => new Float32Array(MW * MH));
  // The same, as the floor shows it: a wall takes the brightness of the floor beside it.
  const floorLight = WORLD.levels.map(() => new Float32Array(MW * MH));
  // How brightly you see each tile from any level at or below yours.
  const column = new Float32Array(MW * MH);
  // And what walls and cliffs take from it: the brightest of a tile and the four beside it.
  const wallLight = new Float32Array(MW * MH);
  const wallNear = new Float32Array(MW * MH);
  // Per level, the tiles to draw (see OPS): floors, walls, cliffs.
  const surfOps: number[][] = WORLD.levels.map(() => []);
  const wallOps: number[][] = WORLD.levels.map(() => []);
  const cliffOps: number[][] = WORLD.levels.map(() => []);

  // Depth tracking. What you saw last frame, so a still frame costs almost nothing: the sight key
  // (where the map sits on screen, your level, your room), which levels have anything in sight,
  // and the finished picture of every level up to yours (kept while nothing on those levels moves).
  let sightKey = "";
  const inSight: boolean[] = WORLD.levels.map(() => false);
  const baseCache = makeCanvas(1, 1);
  let baseKey = "";
  // Whether a floor lies between your level and level k at a tile: depends on your level alone, so worked out once per tile until you change level.
  const inWay = WORLD.levels.map(() => new Uint8Array(MW * MH));
  let inWayCur = -1;

  // Where an edge tile is cut down to its light: the tile on its own, then the brightness of it and its neighbours as a 3 x 3 picture stretched over them.
  const tileCanvas = makeCanvas(1, 1);
  const tg = tileCanvas.getContext("2d")!;
  const fieldCanvas = makeCanvas(3, 3);
  const fg = fieldCanvas.getContext("2d")!;
  const field = fg.createImageData(3, 3);

  const fit = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO) * RENDER_SCALE;
    const width = Math.round(canvas.clientWidth * dpr), height = Math.round(canvas.clientHeight * dpr);
    if (width === canvas.width && height === canvas.height && T) return;
    canvas.width = width;
    canvas.height = height;
    for (const c of [scene, layer, baseCache]) { c.width = canvas.width; c.height = canvas.height; }
    sightKey = "";
    baseKey = "";
    const next = Math.max(8, Math.round(Math.min(canvas.height / TILES_TALL, canvas.width / 13)));
    if (next !== T) {
      T = next;
      chunks.clear();
    }
    tileCanvas.width = T;
    tileCanvas.height = 2 * T;
  };
  fit();
  window.addEventListener("resize", fit);
  const stopStats = createStatsOverlay(() => `map (2D canvas: the OLD renderer, not WebGL)  T ${T}px  ${canvas.width}x${canvas.height}`);

  // Where the light is centred this frame (the circle of your sight), when there is one.
  let circle = false, viewX = 0, viewY = 0, viewAlt = 0;
  /**
   * Where the circle's centre is on level z's own grid, in tiles. Each level is drawn RISE higher
   * on screen than the one below, so for the circle to be one circle round you on screen, its
   * centre on another level sits that much further up (or down) the grid than you do.
   */
  const centreY = (z: number) => viewY + (z - viewAlt) * RISE;

  /**
   * Adds a tile to a list of tiles to draw, with the brightness `m` gives it and its neighbours.
   * Nothing is added if it is dark everywhere, or wholly outside the circle of your sight. How it
   * is cut: 0 not at all (fully lit all round, well inside the circle), +1 to the shape of what
   * you see (the blend between its neighbours' brightness), +2 to the circle's fade, +8 to the
   * fade of the circle of light round the doorway it is seen through (`lamp`: that doorway's tile,
   * on level `lampZ`, or -1 if it is lit by you).
   * (Walls are lit from `wallLight`, which spreads a tile into the rock round them, so blending
   * with their neighbours doesn't darken their tops.)
   */
  const pushTile = (ops: number[], m: Float32Array, x: number, y: number, up: number, shape: number, z: number, lamp = -1, lampZ = z) => {
    let mode = 0, lx = -1, ly = -1;
    if (circle) {
      // The nearest and the farthest the tile (with what reaches up from it) gets from you, in tiles.
      const cy = centreY(z), x0 = x - viewX, x1 = x0 + 1, y0 = y - up / T - cy, y1 = y + 1 - cy;
      const nx = x0 > 0 ? x0 : x1 < 0 ? x1 : 0, ny = y0 > 0 ? y0 : y1 < 0 ? y1 : 0;
      if (nx * nx + ny * ny >= VISION_RADIUS * VISION_RADIUS) return;
      const fx = Math.max(-x0, x1), fy = Math.max(-y0, y1), inner = VISION_RADIUS - VISION_FADE;
      if (fx * fx + fy * fy > inner * inner) mode = 2;
    }
    if (lamp >= 0) {
      // The doorway is a light of its own, GAP_PEEK wide, on the level it lies on (as that level is drawn, in this one's grid).
      lx = lampX(lamp);
      ly = lampY(lamp) + (z - lampZ) * RISE;
      const x0 = x - lx, x1 = x0 + 1, y0 = y - up / T - ly, y1 = y + 1 - ly;
      const nx = x0 > 0 ? x0 : x1 < 0 ? x1 : 0, ny = y0 > 0 ? y0 : y1 < 0 ? y1 : 0;
      if (nx * nx + ny * ny >= GAP_PEEK * GAP_PEEK) return;
      const fx = Math.max(-x0, x1), fy = Math.max(-y0, y1), inner = GAP_PEEK - VISION_FADE;
      if (fx * fx + fy * fy > inner * inner) mode |= 8;
    }
    const at = (dx: number, dy: number) => {
      const nx = x + dx, ny = y + dy;
      return nx >= 0 && ny >= 0 && nx < MW && ny < MH ? m[ny * MW + nx] : 0;
    };
    const c = at(0, 0), l = at(-1, 0), r = at(1, 0), u = at(0, -1), d = at(0, 1);
    const ul = at(-1, -1), ur = at(1, -1), dl = at(-1, 1), dr = at(1, 1);
    if (Math.max(c, l, r, u, d, ul, ur, dl, dr) < 1 / 255) return;
    if (Math.min(c, l, r, u, d, ul, ur, dl, dr) < FULL) mode |= 1;
    ops.push(x, y, up, shape, mode, ul, u, ur, l, c, r, dl, d, dr, lx, ly);
  };

  /** What easing a level's sight found: whether any tile's brightness moved, and the box of tiles with any light (empty: bx1 < 0). */
  interface Eased { moved: boolean; bx0: number; bx1: number; by0: number; by1: number }

  // The level drawn last frame: when it changes, what shows and what goes happens at once, not as a fade.
  let lastLevel = -1;
  // The room you stand in, worked out again only when you step onto another tile.
  let limitKey = "";
  let limit: Int16Array | null = null;
  const draw = (v: View, dtMs: number) => {
    const cur = levelOf(v.x, v.y, v.alt);
    // With someone standing there, what they see depends on the room they're in (the Map viewer's free camera has no room).
    const tx = Math.floor(v.x), ty = Math.floor(v.y);
    // Under the wall half of a shaft's diagonal wall you are outside the room; hugging it, on its open side, you are in it.
    const underWall = shaftDiagSide(cur + 1, tx, ty) >= 0 && !onShaftOpen(cur + 1, tx, ty, v.x, v.y);
    const key = `${cur},${tx},${ty},${underWall}`;
    if (key !== limitKey) {
      limitKey = key;
      limit = roomLimit(cur, tx, ty, underWall);
    }
    /** What's north of your room's north wall is covered by it: pitch black. */
    const walledOff = (x: number, y: number) => !!v.player && !!limit && y < limit[x];
    /** Under or outside a walled room, the walls above you don't draw: they would only cover you. */
    const noWallsAbove = !!v.player && !limit;
    const W = canvas.width, H = canvas.height;
    // Snap to whole pixels so the tiles don't shimmer while scrolling.
    const ox = Math.round(W / 2 - v.camX * T);
    const oy = Math.round(H / 2 - (v.camY - BODY_ABOVE_FEET) * T);
    const levelY = (z: number) => oy - Math.round(z * RISE * T);
    const fx = ox + v.x * T, fy = oy + (v.y - v.alt * RISE) * T;

    // Sight, one list of tiles per level.
    // - Levels at or below you: pinned to that level's own height, so they never slide as you
    //   climb, and seen across that level's own grid (from a bridge you look out over the hall
    //   below). If that level is solid rock where you stand, your own level's sight is used.
    // - Levels above you: their floors are not drawn at all. On stairs you count as on the lower level until you
    //   reach their top end, then the level above is drawn and, in the same moment, the rest.
    const seenAll = v.seen;
    const strip = Math.ceil(T / 12) + 1, rise = Math.round(RISE * T);
    const ease = cur !== lastLevel ? 1 : 1 - Math.exp(-SIGHT_EASE * dtMs / 1000);
    lastLevel = cur;
    /** Eases each tile's brightness toward what you see now, so sight fades in and out. */
    const easeSight = (gz: number, left: Float32Array, shown: Float32Array): Eased => {
      const e: Eased = { moved: false, bx0: MW, bx1: -1, by0: MH, by1: -1 };
      for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
        const i = y * MW + x;
        // (Everything sight reaches is fully lit: where it fades is the circle round you, or round the doorway it comes through.)
        const target = seeThrough(gz, x, y) && left[i] >= 0 && !walledOff(x, y) ? 1 : 0;
        let n = shown[i] + (target - shown[i]) * ease;
        // Close enough to settle (a sixth of a grey level): it lands on its target, so a still view stops changing.
        if (Math.abs(target - n) < 1 / 1536) n = target;
        if (n < 0.002) n = 0;
        if (n !== shown[i]) { shown[i] = n; e.moved = true; }
        if (n !== 0) {
          if (x < e.bx0) e.bx0 = x;
          if (x > e.bx1) e.bx1 = x;
          if (y < e.by0) e.by0 = y;
          if (y > e.by1) e.by1 = y;
        }
      }
      return e;
    };

    // Everything that depends on sight (the lists of what's lit, the light on walls) is worked out
    // again only when it can have changed: you moved, changed level or room, or a fade is still going.
    circle = !!v.player;
    viewX = v.x;
    viewY = v.y;
    viewAlt = v.alt;
    const nowKey = `${ox},${oy},${cur},${limitKey}${circle ? `,${v.x},${v.y},${v.alt}` : ""}`;
    let changed = nowKey !== sightKey;
    const eased: (Eased | null)[] = [];
    for (let z = 0; z < LEVELS; z++) {
      // A level above the one you stand on is never drawn: climbing stairs, you stay on the lower
      // level until you reach the top, and the hole above them is not shown.
      const e = z <= cur ? easeSight(z, seenAll[z], glow[z]) : null;
      eased.push(e);
      if (e?.moved) changed = true;
    }
    frameNo++;
    if (changed) {
      sightKey = nowKey;
      if (inWayCur !== cur) { for (const a of inWay) a.fill(0); inWayCur = cur; }

      /** The doorway tile (in the level) the light on a tile of level z comes through, or -1 if it comes from you. */
      const orgAt = (z: number, i: number) => v.origin?.[z]?.[i] ?? -1;
      // The floors: for each level, the tiles with light or right next to some.
      for (let z = 0; z < LEVELS; z++) {
        surfOps[z].length = 0;
        const e = eased[z];
        inSight[z] = !!e && e.bx1 >= 0;
        if (!e || e.bx1 < 0) continue;
        const shown = glow[z], map = floorLight[z];
        const x0 = Math.max(0, e.bx0 - 1), x1 = Math.min(MW - 1, e.bx1 + 1), y0 = Math.max(0, e.by0 - 1), y1 = Math.min(MH - 1, e.by1 + 1);
        const lit = (x: number, y: number) => (x >= 0 && y >= 0 && x < MW && y < MH && seeThrough(z, x, y) ? shown[y * MW + x] : 0);
        map.fill(0);
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          // Walls take the brightness of the floor beside them.
          map[y * MW + x] = seeThrough(z, x, y) ? lit(x, y) : Math.max(lit(x, y - 1), lit(x, y + 1), lit(x - 1, y), lit(x + 1, y));
        }
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          if (!seeThrough(z, x, y) || walledOff(x, y)) continue;
          // Lit, or right next to something lit (a diagonal neighbour counts only if light could step there without squeezing between two corners: no peeking past a wall's corner into the next room).
          let near = lit(x, y) > 0 || lit(x - 1, y) > 0 || lit(x + 1, y) > 0 || lit(x, y - 1) > 0 || lit(x, y + 1) > 0;
          for (let dy = -1; dy <= 1 && !near; dy += 2) for (let dx = -1; dx <= 1; dx += 2) {
            if (lit(x + dx, y + dy) > 0 && seeThrough(z, x + dx, y) && seeThrough(z, x, y + dy)) { near = true; break; }
          }
          if (!near) continue;
          // Stairs, and the diagonal tiles tilting with them, rise over the tile behind them.
          pushTile(surfOps[z], map, x, y, isRamp(tileAt(z, x, y)) || slopeAt(z, x, y) ? rise : 0, 0, z, orgAt(z, y * MW + x), z);
        }
      }

      // The light on walls and cliffs: how brightly each tile, or a tile beside it, is seen on any level up to yours.
      column.fill(0);
      for (let z = 0; z <= Math.min(cur, LEVELS - 1); z++) if (inSight[z]) {
        const l = glow[z];
        for (let i = 0; i < column.length; i++) if (l[i] > column[i]) column[i] = l[i];
      }
      const colAt = (x: number, y: number) => (x >= 0 && y >= 0 && x < MW && y < MH ? column[y * MW + x] : 0);
      // The box of tiles with any light in the column (walls only matter in and just north of it).
      let lx0 = MW, lx1 = -1, ly0 = MH, ly1 = -1;
      for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (column[y * MW + x] > 0) {
        if (x < lx0) lx0 = x;
        if (x > lx1) lx1 = x;
        if (y < ly0) ly0 = y;
        if (y > ly1) ly1 = y;
      }
      const anyColumn = lx1 >= 0;
      if (anyColumn) {
        wallNear.fill(0);
        wallLight.fill(0);
        for (let y = Math.max(0, ly0 - 1); y <= Math.min(MH - 1, ly1 + 1); y++) for (let x = Math.max(0, lx0 - 1); x <= Math.min(MW - 1, lx1 + 1); x++) {
          wallNear[y * MW + x] = Math.max(colAt(x, y), colAt(x, y + 1), colAt(x, y - 1), colAt(x - 1, y), colAt(x + 1, y));
        }
        // The light spreads a tile further into the rock round the walls, so a wall's own neighbours (the rock above it, the wall beside it) are lit as it is, and it blends smoothly with them instead of fading toward dark where it doesn't need to.
        for (let y = Math.max(0, ly0 - 2); y <= Math.min(MH - 1, ly1 + 2); y++) for (let x = Math.max(0, lx0 - 2); x <= Math.min(MW - 1, lx1 + 2); x++) {
          let m = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < MW && ny < MH && wallNear[ny * MW + nx] > m) m = wallNear[ny * MW + nx];
          }
          wallLight[y * MW + x] = m;
        }
      }
      /** Whether a floor between you and level k, at tile (x, y), hides what's behind it. */
      const floorInWay = (k: number, x: number, y: number) => {
        const cached = x >= 0 && y >= 0 && x < MW && y < MH ? inWay[k] : null, ci = y * MW + x;
        if (cached && cached[ci]) return cached[ci] === 2;
        const lo = k > cur ? cur + 1 : k + 1, hi = k > cur ? k : cur;
        let way = false;
        for (let j = lo; j <= hi; j++) {
          const t = tileAt(j, x, y);
          if (t === FLOOR || t === STAIRS || t === DIAG) { way = true; break; }
        }
        if (cached) cached[ci] = way ? 2 : 1;
        return way;
      };
      /** Lists the part of level k's walls and cliffs you can see: faces lit from the tile in front of them. */
      const listWalls = (k: number) => {
        const walls = wallOps[k], cliffs = cliffOps[k], zl = Math.min(k, cur);
        walls.length = 0;
        cliffs.length = 0;
        if (!anyColumn || (k > cur && noWallsAbove)) return;
        const seen = (x: number, y: number) => colAt(x, y) > 0 && !floorInWay(k, x, y);
        for (const { x, y } of WALL_TILES[k]) {
          // A wall tile shows only where it or the tile south of it is lit.
          if (x < lx0 || x > lx1 || y < ly0 - 1 || y > ly1) continue;
          const t = tileAt(k, x, y);
          const block = CLIFFS[k].get(y * MW + x);
          // The doorway its light comes through, if any: the one lighting the floor in front of it.
          const lamp = orgAt(zl, (y + 1) * MW + x) >= 0 ? orgAt(zl, (y + 1) * MW + x) : orgAt(zl, y * MW + x);
          // A corner-cut diagonal south of it (floor in its south half) leaves it no face: the diagonal's slanted band is the face there.
          const cutBelow = tileAt(k, x, y + 1) === DIAG && !isHoleDiag(k, x, y + 1) && diagSide(k, x, y + 1) >= 2;
          // A cliff shows only from its own floor's level or above: from below, that floor isn't drawn, and neither is what hangs from it.
          if (block && block.z <= cur && (colAt(x, y) > 0 || colAt(x, y + 1) > 0) && !floorInWay(k, x, y + 1)) {
            // (A slanted band reaches a row up: exactly the band, another level's cliff may be stored in the row it reaches into.)
            pushTile(cliffs, wallLight, x, y, block.diag < 0 ? 0 : T, block.diag + 1, k, lamp, zl);
          }
          if (t === WALL) {
            if (!cutBelow && wallFacesInto(k, x, y + 1) && seen(x, y + 1)) pushTile(walls, wallLight, x, y, strip, 0, k, lamp, zl);
          } else if (((t === DIAG && !isHoleDiag(k, x, y)) || shaftDiagSide(k, x, y) >= 0) && (colAt(x, y) > 0 || colAt(x, y + 1) > 0)) {
            // Which corner its wall half is in. A north corner has a face rising a level; a south corner faces away and shows nothing.
            const corner = t === DIAG ? 3 - diagSide(k, x, y) : shaftDiagSide(k, x, y);
            if (corner >= 2) continue;
            // A diagonal's wall half above you is under the floor half of its own tile.
            if (k > cur && floorInWay(k, x, y)) continue;
            // Its whole slanted band, a tile tall (it reaches over the tile north of it).
            pushTile(walls, wallLight, x, y, T, corner + 1, k, lamp, zl);
          }
        }
      };
      for (let z = 0; z < LEVELS; z++) {
        if (wallFade(Math.abs(z - cur)) > 0) listWalls(z);
        else { wallOps[z].length = 0; cliffOps[z].length = 0; }
      }
    }

    // The part of the scene drawn so far, in pixels: a floor only has to hide what is inside it.
    let drawn = false;
    let bx0 = 0, by0 = 0, bx1 = 0, by1 = 0;
    const growBox = (x0: number, y0: number, x1: number, y1: number) => {
      if (!drawn) { bx0 = x0; by0 = y0; bx1 = x1; by1 = y1; drawn = true; return; }
      if (x0 < bx0) bx0 = x0;
      if (y0 < by0) by0 = y0;
      if (x1 > bx1) bx1 = x1;
      if (y1 > by1) by1 = y1;
    };
    /**
     * Copies a list of tiles of level z from its chunks onto the scene, rows r0..r1 of them: whole
     * where fully lit, in four quarters at their own brightness where not. `fade` darkens the
     * layer by its distance from you (the chunk keeps its darkened copy): walls and cliffs stay
     * solid, covering what's behind them.
     */
    const drawOps = (ops: number[], z: number, kind: Kind, fade: number, r0: number, r1: number) => {
      if (fade <= 0 || !ops.length) return;
      const top = levelY(z);
      for (let i = 0; i < ops.length; i += OPS) {
        const y = ops[i + 1];
        if (y < r0 || y >= r1) continue;
        const x = ops[i], up = ops[i + 2], shape = ops[i + 3];
        const dx = ox + x * T, dy = top + y * T;
        if (dx + T < 0 || dx > W || dy + T < 0 || dy - up > H) continue;
        const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK);
        const c = chunkAt(z, cx, cy);
        if (!c) continue;
        const src = shaded(c, kind, fade, cur);
        // Where this tile sits in its chunk (whose layers start a pad row above it).
        const sx = (x - cx * CHUNK) * T, sy = (y - cy * CHUNK + CHUNK_PAD_TOP) * T;
        growBox(dx, dy - up, dx + T, dy + T);
        if (shape) {
          sg.save();
          sg.beginPath();
          if (shape === 1) { sg.moveTo(dx + T, dy - T); sg.lineTo(dx, dy); sg.lineTo(dx, dy + T); sg.lineTo(dx + T, dy); }
          else { sg.moveTo(dx, dy - T); sg.lineTo(dx + T, dy); sg.lineTo(dx + T, dy + T); sg.lineTo(dx, dy); }
          sg.closePath();
          sg.clip();
        }
        const mode = ops[i + 4];
        if (!mode) sg.drawImage(src, sx, sy - up, T, T + up, dx, dy - up, T, T + up);
        else {
          // An edge tile: copied onto the scratch tile, then cut down to the light, then placed.
          tg.globalCompositeOperation = "source-over";
          tg.clearRect(0, 0, T, 2 * T);
          tg.drawImage(src, sx, sy - up, T, T + up, 0, 0, T, T + up);
          tg.globalCompositeOperation = "destination-in";
          if (mode & 1) {
            // To the shape of what you see: a picture of the brightness round it (its neighbours', blended smoothly between their centres).
            const px = field.data;
            for (let k = 0; k < 9; k++) {
              px[k * 4] = px[k * 4 + 1] = px[k * 4 + 2] = 255;
              px[k * 4 + 3] = Math.round(ops[i + 5 + k] * 255);
            }
            fg.putImageData(field, 0, 0);
            tg.imageSmoothingEnabled = true;
            tg.drawImage(fieldCanvas, -T, up - T, 3 * T, 3 * T);
          }
          if (mode & 2) {
            // To the circle of your sight: fully lit out to VISION_FADE short of its edge, dark at it, centred on you.
            const gx = (viewX - x) * T, gy = (centreY(z) - y) * T + up;
            const fade = tg.createRadialGradient(gx, gy, (VISION_RADIUS - VISION_FADE) * T, gx, gy, VISION_RADIUS * T);
            fade.addColorStop(0, "rgba(255,255,255,1)");
            fade.addColorStop(1, "rgba(255,255,255,0)");
            tg.fillStyle = fade;
            tg.fillRect(0, 0, T, T + up);
          }
          if (mode & 8) {
            // And to the circle of light round the doorway it is seen through.
            const lx = (ops[i + 14] - x) * T, ly = (ops[i + 15] - y) * T + up;
            const lamp = tg.createRadialGradient(lx, ly, (GAP_PEEK - VISION_FADE) * T, lx, ly, GAP_PEEK * T);
            lamp.addColorStop(0, "rgba(255,255,255,1)");
            lamp.addColorStop(1, "rgba(255,255,255,0)");
            tg.fillStyle = lamp;
            tg.fillRect(0, 0, T, T + up);
          }
          sg.drawImage(tileCanvas, 0, 0, T, T + up, dx, dy - up, T, T + up);
        }
        if (shape) sg.restore();
      }
    };
    // Only the chunks on screen.
    const cx0 = Math.max(0, Math.floor(-ox / T / CHUNK)), cx1 = Math.min(Math.ceil(MW / CHUNK) - 1, Math.floor((W - ox) / T / CHUNK));
    const cyMax = Math.ceil(MH / CHUNK) - 1;
    /** Level z's floor as it lies: the whole of its chunks inside the part of the scene drawn so far, wiped out of the scene. A floor hides everything under it, however dimly it is lit itself. */
    const wipe = (z: number) => {
      const top = levelY(z);
      const x0 = Math.max(cx0, Math.floor((bx0 - ox) / T / CHUNK)), x1 = Math.min(cx1, Math.floor((bx1 - ox) / T / CHUNK));
      const r0 = Math.max(0, Math.floor((by0 - top) / T) - 1), r1 = Math.min(MH, Math.ceil((by1 - top) / T) + 1);
      if (r1 <= r0 || x1 < x0) return;
      sg.save();
      sg.beginPath();
      sg.rect(bx0, by0, bx1 - bx0, by1 - by0);
      sg.clip();
      sg.globalCompositeOperation = "destination-out";
      // North to south (each chunk's top pad holds what reaches into the row above).
      for (let cy = Math.max(0, Math.floor(r0 / CHUNK)); cy <= Math.min(cyMax, Math.floor(r1 / CHUNK) + 1); cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          const c = chunkAt(z, cx, cy);
          if (!c) continue;
          const from = cy * CHUNK - CHUNK_PAD_TOP;
          const a = Math.max(r0, from), b = Math.min(r1, cy * CHUNK + CHUNK);
          if (b <= a) continue;
          const sy = (a - from) * T, sw = CHUNK * T, sh = (b - a) * T;
          sg.drawImage(c.surface, 0, sy, sw, sh, ox + cx * CHUNK * T, top + a * T, sw, sh);
        }
      }
      sg.restore();
    };
    /** Draws level z's floor. */
    const floors = (z: number) => {
      if (drawn) wipe(z);
      drawOps(surfOps[z], z, "surface", z < cur ? wallFade(cur - z) : 1, 0, MH);
    };
    /** How brightly you see a spot of level z: the floor's light, blended smoothly between tile centres. */
    const lightOf = (z: number): Light => {
      const m = floorLight[z];
      const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < MW && y < MH ? m[y * MW + x] : 0);
      return (x, y) => {
        const u = x - 0.5, w = y - 0.5, ix = Math.floor(u), iy = Math.floor(w), fx = u - ix, fy = w - iy;
        const tiles = (at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx) * (1 - fy) + (at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx) * fy;
        // (And the circle's fade, when there is one, and the circle of the doorway it is seen through.)
        let light = circle ? tiles * Math.min(1, Math.max(0, (VISION_RADIUS - Math.hypot(x - viewX, y - centreY(z))) / VISION_FADE)) : tiles;
        const tx = Math.floor(x), ty = Math.floor(y), lamp = v.origin && tx >= 0 && ty >= 0 && tx < MW && ty < MH ? v.origin[z][ty * MW + tx] : -1;
        if (lamp >= 0) light *= Math.min(1, Math.max(0, (GAP_PEEK - Math.hypot(x - lampX(lamp), y - lampY(lamp))) / VISION_FADE));
        return light;
      };
    };
    /** Draws the actors on level z whose feet are in a row passing `test`. */
    const actorsOnly = (z: number, test: (y: number) => boolean) => {
      if (!v.actors) return;
      yg.globalCompositeOperation = "source-over";
      yg.globalAlpha = 1;
      yg.clearRect(0, 0, W, H);
      // (Nobody there: nothing to cut, darken or place.)
      if (v.actors(yg, z, ox, oy, T, test, lightOf(z)) === false) return;
      yg.globalAlpha = 1;
      // From inside a walled room, whoever stands in a doorway is cut off at the wall over it.
      if (v.player && limit) {
        yg.globalCompositeOperation = "destination-out";
        yg.fillStyle = "#000";
        for (let x = 0; x < MW; x++) yg.fillRect(ox + x * T, 0, T, levelY(z) + limit[x] * T);
      }
      // A level below you is darkened by its distance.
      if (z < cur) {
        yg.globalCompositeOperation = "source-atop";
        yg.fillStyle = `rgb(0 0 0 / ${1 - wallFade(cur - z)})`;
        yg.fillRect(0, 0, W, H);
      }
      sg.drawImage(layer, 0, 0);
      // (They can stand anywhere: the next floor wipes the whole scene.)
      growBox(0, 0, W, H);
    };

    // Going up the stack: each level's walls, its floor, the cliffs hanging in front of that floor,
    // and only then whoever stands there, so no block of their own level covers them. Levels at or
    // below you go down whole. Above you there are only walls, split at your row: the part behind
    // you first, then whoever stands on your level north of you, then you, then the part in front,
    // then whoever is south of you. With nobody standing there, every level goes down whole.
    sg.clearRect(0, 0, W, H);
    sg.globalAlpha = 1;
    const base = cur;
    const split = v.player ? Math.max(0, Math.min(MH, Math.floor(v.y))) : MH;
    // With the rows anyone stands in known, the walls above you are drawn between those rows, so each wall covers whoever stands behind it.
    const banded = !!(v.player && v.actorRows);
    /** The walls (and cliffs) of the levels above, rows `from` up to `to`. */
    const wallsAbove = (from: number, to: number) => {
      if (to <= from) return;
      for (let z = base + 1; z < LEVELS; z++) {
        const fade = wallFade(Math.abs(z - cur));
        drawOps(wallOps[z], z, "walls", fade > 0 ? 1 : 0, from, to);
        drawOps(cliffOps[z], z, "cliffs", fade, from, to);
      }
    };
    // The levels up to yours only change when sight does, or when someone moves on a level below
    // you: otherwise their finished picture from last frame goes down in one piece.
    let lowerLive = false;
    if (v.actors) for (let z = 0; z < base; z++) if (!v.actorsOn || v.actorsOn(z)) lowerLive = true;
    let first = 0;
    if (!changed && !lowerLive && baseKey === nowKey) {
      sg.drawImage(baseCache, 0, 0);
      growBox(0, 0, W, H);
      first = base + 1;
    }
    for (let z = first; z < LEVELS; z++) {
      const end = z <= base ? MH : split;
      const fade = wallFade(Math.abs(z - cur));
      const above = banded && z > base; // (drawn between the rows instead)
      // (Walls keep one tone however far their level is from yours; only how far they show depends on it.)
      if (!above) drawOps(wallOps[z], z, "walls", fade > 0 ? 1 : 0, 0, end);
      // (Even a level with nothing in sight: its floor still covers what's under it.)
      if (z <= base && fade > 0 && (drawn || inSight[z])) floors(z);
      if (!above) drawOps(cliffOps[z], z, "cliffs", fade, 0, end);
      if (z < base && inSight[z] && fade > 0) actorsOnly(z, () => true);
      if (z === base) {
        // A still frame with nobody moving below: keep this picture for the next.
        if (!changed && !lowerLive) {
          const bg = baseCache.getContext("2d")!;
          bg.clearRect(0, 0, W, H);
          bg.drawImage(scene, 0, 0);
          baseKey = nowKey;
        } else baseKey = "";
      }
    }
    if (banded) {
      // Whoever is north of you (or in your row), row by row: the walls in front of them are drawn over them.
      let from = 0;
      for (const [r0, r1] of groupRows(v.actorRows!(base).filter(r => r <= split), base)) {
        const to = Math.min(r1 + 1, split);
        wallsAbove(from, to);
        from = Math.max(from, to);
        if (inSight[base]) actorsOnly(base, y => y <= v.y && Math.floor(y) >= r0 && Math.floor(y) <= r1);
      }
      wallsAbove(from, split);
    } else if (inSight[base]) actorsOnly(base, y => !v.player || y <= v.y);
    if (v.player) {
      v.player.draw(sg, fx, fy - BODY_ABOVE_FEET * T, T, true);
      if (v.actorRows) {
        // Whoever is south of you, row by row: the walls in front of each of them are drawn over them.
        let from = split;
        for (const [r0, r1] of groupRows(v.actorRows(base).filter(r => r >= split), base)) {
          wallsAbove(from, r1 + 1);
          if (inSight[base]) actorsOnly(base, y => y > v.y && Math.floor(y) >= r0 && Math.floor(y) <= r1);
          from = r1 + 1;
        }
        wallsAbove(from, MH);
      } else {
        wallsAbove(split, MH);
        if (inSight[base]) actorsOnly(base, y => y > v.y);
      }
    }
    evictChunks();

    g.fillStyle = COLORS.void;
    g.fillRect(0, 0, W, H);
    g.drawImage(scene, 0, 0);
    // Your outline shows faintly through anything covering you (it vanishes into you otherwise).
    if (v.player) {
      // (Drawn whole and opaque on a scratch canvas first, then laid over faintly in one go, so the gear doesn't show the body through it.)
      if (ghostCanvas.width !== W || ghostCanvas.height !== H) { ghostCanvas.width = W; ghostCanvas.height = H; }
      ghostCtx.clearRect(0, 0, W, H);
      v.player.draw(ghostCtx, fx, fy - BODY_ABOVE_FEET * T, T, false);
      g.globalAlpha = GHOST_ALPHA;
      g.drawImage(ghostCanvas, 0, 0);
      g.globalAlpha = 1;
    }
  };

  return {
    draw,
    /** Pixels per tile right now. */
    get T() { return T; },
    warm: () => Promise.resolve(),
    dispose: () => { window.removeEventListener("resize", fit); stopStats(); },
  };
}
