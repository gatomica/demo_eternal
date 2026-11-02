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
 */
import { CHUNK, CHUNK_PAD_TOP, makeCanvas, paintChunk } from "./paint";
import { seeThrough } from "./sight";
import { BODY_ABOVE_FEET, COLORS, GHOST_ALPHA, RISE, SIGHT_EASE, TILES_TALL, VISION_FULL, VISION_RADIUS, wallFade } from "./tuning";
import { CLIFFS, DIAG, diagSide, FLOOR, isHoleDiag, isRamp, levelOf, LEVELS, roomLimit, shaftDiagSide, slopeAt, STAIRS, tileAt, WALL, wallFacesInto, WORLD } from "./world";

/** Draws what stands on level z (enemies, keepers, gear...) whose feet are in a row passing `test`. */
export type ActorDrawer = (ctx: CanvasRenderingContext2D, z: number, ox: number, oy: number, T: number, test: (y: number) => boolean) => void;

/** Whoever the view is looking from, drawn between the layers. `solid` is the real figure; otherwise its faint outline. */
export interface ViewPlayer {
  draw(ctx: CanvasRenderingContext2D, px: number, py: number, T: number, solid: boolean): void;
}

export interface View {
  /** Where the camera looks, in tiles on screen (a height lifts it up the screen). */
  camX: number; camY: number;
  /** The viewpoint on the grid, and its height in storeys. */
  x: number; y: number; alt: number;
  /** How much of each level is in sight (see `sight`): negative where not at all. */
  seen: Float32Array[];
  actors?: ActorDrawer;
  player?: ViewPlayer;
}

/** Sight for a view with no light radius: everything on the levels at or below `alt`, and nothing above it. */
export function seeAll(alt: number, into = WORLD.levels.map(() => new Float32Array(WORLD.w * WORLD.h))) {
  into.forEach((l, z) => l.fill(z <= alt + 1e-3 ? 1e6 : -1));
  return into;
}

/** Per level, the tiles that hold a wall, a diagonal's wall half or a cliff block (sight asks for them every frame). */
const WALL_TILES = WORLD.levels.map((_, z) => {
  const out: { x: number; y: number }[] = [];
  for (let y = 0; y < WORLD.h; y++) for (let x = 0; x < WORLD.w; x++) {
    const t = tileAt(z, x, y);
    if (t === WALL || t === DIAG || shaftDiagSide(z, x, y) >= 0 || CLIFFS[z].has(y * WORLD.w + x)) out.push({ x, y });
  }
  return out;
});

export function createMapRenderer(canvas: HTMLCanvasElement) {
  const g = canvas.getContext("2d")!;
  let T = 0;
  // Painted chunks of each level, as they've come into view (dropped once long out of view).
  type Chunk = { surface: HTMLCanvasElement; walls: HTMLCanvasElement; cliffs: HTMLCanvasElement; used: number } | null;
  const chunks = new Map<string, Chunk>();
  let frameNo = 0;
  const chunkAt = (z: number, cx: number, cy: number): Chunk => {
    const key = `${z},${cx},${cy}`;
    let c = chunks.get(key);
    if (c === undefined) {
      const p = paintChunk(z, T, cx, cy);
      c = p && { ...p, used: frameNo };
      chunks.set(key, c);
    }
    if (c) c.used = frameNo;
    return c;
  };
  /** Keeps the cache small: chunks not drawn for a while go (they're repainted if needed). */
  const evictChunks = () => {
    if (chunks.size < 240) return;
    for (const [k, c] of chunks) if (!c || frameNo - c.used > 120) chunks.delete(k);
  };
  // The world is composed here, level by level, before going on screen.
  const scene = makeCanvas(1, 1);
  const sg = scene.getContext("2d")!;
  // What you can see of each level this frame: white where visible, shaded by distance.
  const lights = WORLD.levels.map(() => makeCanvas(1, 1));
  // What you can see of each level's walls and cliffs this frame.
  const wallLights = WORLD.levels.map(() => makeCanvas(1, 1));
  // How brightly you see each tile from any level at or below yours (walls take their light from it).
  const column = new Float32Array(WORLD.w * WORLD.h);
  // How brightly you currently see each tile of each level (eased toward what you see now).
  const glow = WORLD.levels.map(() => new Float32Array(WORLD.w * WORLD.h));
  // Brightness of sight, one pixel per tile, stretched (and smoothly blended) over the map.
  const softCanvas = makeCanvas(WORLD.w, WORLD.h);
  const sfg = softCanvas.getContext("2d")!;
  const soft = sfg.createImageData(WORLD.w, WORLD.h);
  // Scratch layer where one view of a level is worked out before joining that level's sight.
  const maskCanvas = makeCanvas(1, 1);
  const mg = maskCanvas.getContext("2d")!;
  // Scratch layer where each slice of a level is cut down to what you can see of it.
  const layer = makeCanvas(1, 1);
  const yg = layer.getContext("2d")!;

  const fit = () => {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.round(canvas.clientWidth * dpr), height = Math.round(canvas.clientHeight * dpr);
    if (width === canvas.width && height === canvas.height && T) return;
    canvas.width = width;
    canvas.height = height;
    for (const c of [scene, layer, maskCanvas, ...lights, ...wallLights]) { c.width = canvas.width; c.height = canvas.height; }
    const next = Math.max(8, Math.round(Math.min(canvas.height / TILES_TALL, canvas.width / 13)));
    if (next !== T) {
      T = next;
      chunks.clear();
    }
  };
  fit();
  window.addEventListener("resize", fit);

  // The level drawn last frame: when it changes, what shows and what goes happens at once, not as a fade.
  let lastLevel = -1;
  // The room you stand in, worked out again only when you step onto another tile.
  let limitKey = "";
  let limit: Int16Array | null = null;
  const draw = (v: View, dtMs: number) => {
    const cur = levelOf(v.x, v.y, v.alt);
    // With someone standing there, what they see depends on the room they're in (the Map viewer's free camera has no room).
    const key = `${cur},${Math.floor(v.x)},${Math.floor(v.y)}`;
    if (key !== limitKey) {
      limitKey = key;
      limit = roomLimit(cur, Math.floor(v.x), Math.floor(v.y));
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

    // Sight, one mask per level.
    // - Levels at or below you: pinned to that level's own height, so they never slide as you
    //   climb, and seen across that level's own grid (from a bridge you look out over the hall
    //   below). If that level is solid rock where you stand, your own level's sight is used.
    // - Levels above you: their floors are not drawn at all. On stairs you count as on the lower level until you
    //   reach their top end, then the level above is drawn and, in the same moment, the rest.
    const seenAll = v.seen;
    const strip = Math.ceil(T / 12) + 1, rise = RISE * T, fadeOver = VISION_RADIUS * (1 - VISION_FULL);
    const { w: MW, h: MH } = WORLD;
    const ease = cur !== lastLevel ? 1 : 1 - Math.exp(-SIGHT_EASE * dtMs / 1000);
    lastLevel = cur;
    /**
     * Paints into `lights[z]` what you see of a level, judged by sight `left` on level gz's
     * tiles, placed with its top row at `top`. `shown` holds the eased brightness per tile.
     */
    const paintSight = (z: number, gz: number, left: Float32Array, top: number, shown: Float32Array): boolean => {
      let any = false;
      // Ease each tile's brightness toward what you see now, so sight fades in and out.
      for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
        const i = y * MW + x;
        const target = seeThrough(gz, x, y) && left[i] >= 0 && !walledOff(x, y) ? Math.min(1, left[i] / fadeOver) : 0;
        shown[i] += (target - shown[i]) * ease;
        if (shown[i] < 0.002) shown[i] = 0;
        else any = true;
      }
      // Nothing of this level in sight: nothing to paint.
      if (!any) return false;
      const lit = (x: number, y: number) =>
        x >= 0 && y >= 0 && x < MW && y < MH && seeThrough(gz, x, y) ? shown[y * MW + x] : 0;
      // Tiles with light, or right next to some: the soft brightness below fades out across
      // these, so nothing switches on abruptly at the edge of your sight.
      const near = (x: number, y: number) => {
        if (!seeThrough(gz, x, y) || walledOff(x, y)) return false;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (lit(x + dx, y + dy) > 0) return true;
        return false;
      };

      // The shape of what you see, crisp at the walls: every tile near light.
      mg.globalCompositeOperation = "source-over";
      mg.clearRect(0, 0, W, H);
      mg.fillStyle = "#fff";
      for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
        const px = ox + x * T, py = top + y * T;
        if (near(x, y)) {
          // Stairs, and the diagonal tiles tilting with them, rise over the tile behind them.
          const up = isRamp(tileAt(gz, x, y)) || slopeAt(gz, x, y) ? rise : 0;
          mg.fillRect(px, py - up, T, T + up);
        }
      }

      // How brightly: one value per tile, blended smoothly between tiles. Walls take the
      // brightness of the floor beside them.
      const pix = soft.data;
      for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
        let a = lit(x, y);
        if (!seeThrough(gz, x, y)) a = Math.max(lit(x, y - 1), lit(x, y + 1), lit(x - 1, y), lit(x + 1, y));
        const k = (y * MW + x) * 4;
        pix[k] = pix[k + 1] = pix[k + 2] = 255;
        pix[k + 3] = Math.round(a * 255);
      }
      sfg.putImageData(soft, 0, 0);
      mg.globalCompositeOperation = "destination-in";
      mg.imageSmoothingEnabled = true;
      mg.drawImage(softCanvas, ox, top, MW * T, MH * T);
      const lg = lights[z].getContext("2d")!;
      lg.drawImage(maskCanvas, 0, 0);
      return true;
    };

    // Levels with nothing in sight are skipped altogether below.
    const inSight: boolean[] = [];
    frameNo++;
    for (let z = 0; z < LEVELS; z++) {
      lights[z].getContext("2d")!.clearRect(0, 0, W, H);
      // What sight reaches of this level, pinned to the level's own height.
      // A level above the one you stand on is never drawn: climbing stairs, you stay on the lower
      // level until you reach the top, and the hole above them is not shown.
      inSight[z] = z <= cur && paintSight(z, z, seenAll[z], levelY(z), glow[z]);
    }

    // The light on walls and cliffs: how brightly each tile, or a tile beside it, is seen on any level up to yours.
    column.fill(0);
    for (let z = 0; z <= Math.min(cur, LEVELS - 1); z++) if (inSight[z]) {
      const l = glow[z];
      for (let i = 0; i < column.length; i++) if (l[i] > column[i]) column[i] = l[i];
    }
    const colAt = (x: number, y: number) => (x >= 0 && y >= 0 && x < MW && y < MH ? column[y * MW + x] : 0);
    {
      const pix = soft.data;
      for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
        const k = (y * MW + x) * 4;
        pix[k] = pix[k + 1] = pix[k + 2] = 255;
        pix[k + 3] = Math.round(Math.max(colAt(x, y), colAt(x, y + 1), colAt(x, y - 1), colAt(x - 1, y), colAt(x + 1, y)) * 255);
      }
      sfg.putImageData(soft, 0, 0);
    }
    /** Whether a floor between you and level k, at tile (x, y), hides what's behind it. */
    const floorInWay = (k: number, x: number, y: number) => {
      const lo = k > cur ? cur + 1 : k + 1, hi = k > cur ? k : cur;
      for (let j = lo; j <= hi; j++) {
        const t = tileAt(j, x, y);
        if (t === FLOOR || t === STAIRS || t === DIAG) return true;
      }
      return false;
    };
    /** Paints into `wallLights[k]` the part of level k's walls and cliffs you can see: faces lit from the tile in front of them. */
    const paintWallSight = (k: number) => {
      mg.globalCompositeOperation = "source-over";
      mg.clearRect(0, 0, W, H);
      mg.fillStyle = "#fff";
      const top = levelY(k);
      const seen = (x: number, y: number) => colAt(x, y) > 0 && !floorInWay(k, x, y);
      if (!(k > cur && noWallsAbove)) for (const { x, y } of WALL_TILES[k]) {
        const px = ox + x * T, py = top + y * T, t = tileAt(k, x, y);
        const block = CLIFFS[k].get(y * MW + x);
        // A cliff shows only from its own floor's level or above: from below, that floor isn't drawn, and neither is what hangs from it.
        if (block && block.z <= cur && (colAt(x, y) > 0 || colAt(x, y + 1) > 0) && !floorInWay(k, x, y + 1)) {
          if (block.diag < 0) mg.fillRect(px, py, T, T);
          else {
            // Exactly the slanted band: another level's cliff may be stored in the row it reaches into.
            mg.beginPath();
            if (block.diag === 0) { mg.moveTo(px + T, py - T); mg.lineTo(px, py); mg.lineTo(px, py + T); mg.lineTo(px + T, py); }
            else { mg.moveTo(px, py - T); mg.lineTo(px + T, py); mg.lineTo(px + T, py + T); mg.lineTo(px, py); }
            mg.closePath();
            mg.fill();
          }
        }
        if (t === WALL) {
          if (wallFacesInto(k, x, y + 1) && seen(x, y + 1)) mg.fillRect(px, py - strip, T, T + strip);
        } else if (((t === DIAG && !isHoleDiag(k, x, y)) || shaftDiagSide(k, x, y) >= 0) && (colAt(x, y) > 0 || colAt(x, y + 1) > 0)) {
          // Which corner its wall half is in. A north corner has a face rising a level; a south corner faces away and shows nothing.
          const corner = t === DIAG ? 3 - diagSide(k, x, y) : shaftDiagSide(k, x, y);
          if (corner >= 2) continue;
          // A diagonal's wall half above you is under the floor half of its own tile.
          if (k > cur && floorInWay(k, x, y)) continue;
          mg.fillRect(px, py - T, T, 2 * T);
        }
      }
      mg.globalCompositeOperation = "destination-in";
      mg.imageSmoothingEnabled = true;
      mg.drawImage(softCanvas, ox, top, MW * T, MH * T);
      const lg = wallLights[k].getContext("2d")!;
      lg.clearRect(0, 0, W, H);
      lg.drawImage(maskCanvas, 0, 0);
    };
    for (let z = 0; z < LEVELS; z++) if (wallFade(Math.abs(z - cur)) > 0) paintWallSight(z);

    // Only the chunks on screen, and only the slice of rows asked for.
    const cx0 = Math.max(0, Math.floor(-ox / T / CHUNK)), cx1 = Math.min(Math.ceil(WORLD.w / CHUNK) - 1, Math.floor((W - ox) / T / CHUNK));
    const cyMax = Math.ceil(WORLD.h / CHUNK) - 1;
    /** Draws rows r0..r1 of one layer of level z's chunks onto the scratch layer. */
    const chunkRows = (z: number, kind: "surface" | "walls" | "cliffs", r0: number, r1: number) => {
      const top = levelY(z);
      const vr0 = Math.max(r0, Math.floor(-top / T) - 1), vr1 = Math.min(r1, Math.ceil((H - top) / T) + 1);
      if (vr1 <= vr0) return;
      // North to south (each chunk's top pad holds what reaches into the row above).
      for (let cy = Math.max(0, Math.floor(vr0 / CHUNK)); cy <= Math.min(cyMax, Math.floor(vr1 / CHUNK) + 1); cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const c = chunkAt(z, cx, cy);
          if (!c) continue;
          const from = cy * CHUNK - CHUNK_PAD_TOP;
          const a = Math.max(vr0, from), b = Math.min(vr1, cy * CHUNK + CHUNK);
          if (b <= a) continue;
          const sy = (a - from) * T, sw = CHUNK * T, sh = (b - a) * T;
          yg.drawImage(c[kind], 0, sy, sw, sh, ox + cx * CHUNK * T, top + a * T, sw, sh);
        }
      }
    };
    /** Draws rows r0..r1 of level z's walls or cliffs, cut down to what you can see of them and darkened by their distance from you: they stay solid, covering what's behind them. */
    const blocks = (z: number, kind: "walls" | "cliffs", r0: number, r1: number) => {
      const fade = wallFade(Math.abs(z - cur));
      if (fade <= 0 || r1 <= r0) return;
      yg.globalCompositeOperation = "source-over";
      yg.clearRect(0, 0, W, H);
      chunkRows(z, kind, r0, r1);
      yg.globalCompositeOperation = "source-atop";
      yg.fillStyle = `rgb(0 0 0 / ${1 - fade})`;
      yg.fillRect(0, 0, W, H);
      yg.globalCompositeOperation = "destination-in";
      yg.drawImage(wallLights[z], 0, 0);
      sg.drawImage(layer, 0, 0);
    };
    /** What's on the scratch layer joins the scene, cut down to what you can see of level z. A level below you is darkened by its distance: it stays solid, so what's under it doesn't show through. */
    const place = (z: number, mask: HTMLCanvasElement = lights[z]) => {
      if (z < cur) {
        yg.globalCompositeOperation = "source-atop";
        yg.fillStyle = `rgb(0 0 0 / ${1 - wallFade(cur - z)})`;
        yg.fillRect(0, 0, W, H);
      }
      yg.globalCompositeOperation = "destination-in";
      yg.drawImage(mask, 0, 0);
      sg.drawImage(layer, 0, 0);
    };
    /** Draws level z's floor. */
    const floors = (z: number) => {
      yg.globalCompositeOperation = "source-over";
      yg.clearRect(0, 0, W, H);
      chunkRows(z, "surface", 0, WORLD.h);
      // A floor hides everything under it, however dimly it is lit itself: what's below it is wiped before it goes down.
      sg.globalCompositeOperation = "destination-out";
      sg.drawImage(layer, 0, 0);
      sg.globalCompositeOperation = "source-over";
      place(z);
    };
    /** Draws the actors on level z whose feet are in a row passing `test`. */
    const actorsOnly = (z: number, test: (y: number) => boolean) => {
      if (!v.actors) return;
      yg.globalCompositeOperation = "source-over";
      yg.clearRect(0, 0, W, H);
      v.actors(yg, z, ox, oy, T, test);
      // From inside a walled room, whoever stands in a doorway is cut off at the wall over it.
      if (v.player && limit) {
        yg.globalCompositeOperation = "destination-out";
        yg.fillStyle = "#000";
        for (let x = 0; x < MW; x++) yg.fillRect(ox + x * T, 0, T, levelY(z) + limit[x] * T);
      }
      // Their bodies rise above the floor they're lit on (over a wall behind them, say), so the light reaches up with them.
      mg.globalCompositeOperation = "source-over";
      mg.clearRect(0, 0, W, H);
      for (let up = 0; up <= 2; up++) mg.drawImage(lights[z], 0, -up * T);
      place(z, maskCanvas);
    };

    // Going up the stack: each level's walls, its floor, the cliffs hanging in front of that floor,
    // and only then whoever stands there, so no block of their own level covers them. Levels at or
    // below you go down whole. Above you there are only walls, split at your row: the part behind
    // you first, then whoever stands on your level north of you, then you, then the part in front,
    // then whoever is south of you. With nobody standing there, every level goes down whole.
    sg.clearRect(0, 0, W, H);
    const base = cur;
    const split = v.player ? Math.max(0, Math.min(WORLD.h, Math.floor(v.y))) : WORLD.h;
    for (let z = 0; z < LEVELS; z++) {
      const end = z <= base ? WORLD.h : split;
      blocks(z, "walls", 0, end);
      // (Even a level with nothing in sight: its floors still cover what's under them.)
      if (z <= base && wallFade(cur - z) > 0) floors(z);
      blocks(z, "cliffs", 0, end);
      if (z < base && inSight[z] && wallFade(cur - z) > 0) actorsOnly(z, () => true);
    }
    if (inSight[base]) actorsOnly(base, y => !v.player || y <= v.y);
    if (v.player) {
      v.player.draw(sg, fx, fy - BODY_ABOVE_FEET * T, T, true);
      for (let z = base + 1; z < LEVELS; z++) {
        blocks(z, "walls", split, WORLD.h);
        blocks(z, "cliffs", split, WORLD.h);
      }
      if (inSight[base]) actorsOnly(base, y => y > v.y);
    }
    evictChunks();

    g.fillStyle = COLORS.void;
    g.fillRect(0, 0, W, H);
    g.drawImage(scene, 0, 0);
    // Your outline shows faintly through anything covering you (it vanishes into you otherwise).
    if (v.player) {
      g.globalAlpha = GHOST_ALPHA;
      v.player.draw(g, fx, fy - BODY_ABOVE_FEET * T, T, false);
      g.globalAlpha = 1;
    }
  };

  return {
    draw,
    /** Pixels per tile right now. */
    get T() { return T; },
    dispose: () => window.removeEventListener("resize", fit),
  };
}
