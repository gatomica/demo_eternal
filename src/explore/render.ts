/**
 * render.ts — drawing the map: every level of the stack, one on top of the next, cut down to what
 * is in sight. The exploration screen and the Map viewer both draw through this, so the viewer
 * shows exactly what the game does.
 *
 * Each storey is drawn RISE tiles higher on screen than the one below, so ledges get cliff faces
 * and stairs visibly climb. Levels above the viewpoint are split at its row: what's behind it is
 * drawn first, then whoever stands there (the player), then what's in front or overhead (only where
 * sight reaches it: a floor above you is not drawn just for being above you).
 */
import { CHUNK, CHUNK_PAD_BOTTOM, CHUNK_PAD_TOP, makeCanvas, paintChunk } from "./paint";
import { seeThrough } from "./sight";
import { BODY_ABOVE_FEET, COLORS, DEPTH_DIM, GHOST_ALPHA, RISE, SIGHT_EASE, TILES_TALL, VISION_FULL, VISION_RADIUS } from "./tuning";
import { FLOOR, groundBelow, isAir, isHoleDiag, isRamp, levelOf, LEVELS, tileAt, WORLD } from "./world";

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

export function createMapRenderer(canvas: HTMLCanvasElement) {
  const g = canvas.getContext("2d")!;
  let T = 0;
  // Painted chunks of each level, as they've come into view (dropped once long out of view).
  type Chunk = { surface: HTMLCanvasElement; faces: HTMLCanvasElement; used: number } | null;
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
    for (const c of [scene, layer, maskCanvas, ...lights]) { c.width = canvas.width; c.height = canvas.height; }
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
  const draw = (v: View, dtMs: number) => {
    const cur = levelOf(v.x, v.y, v.alt);
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
    // - Levels above you: not drawn at all. On stairs you count as on the lower level until you
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
        const target = seeThrough(gz, x, y) && left[i] >= 0 ? Math.min(1, left[i] / fadeOver) : 0;
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
        if (!seeThrough(gz, x, y)) return false;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (lit(x + dx, y + dy) > 0) return true;
        return false;
      };

      // The shape of what you see, crisp at the walls: every tile near light, plus the
      // near edges of the walls around them (their rim, and their face if it's toward you).
      mg.globalCompositeOperation = "source-over";
      mg.clearRect(0, 0, W, H);
      mg.fillStyle = "#fff";
      for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
        const px = ox + x * T, py = top + y * T;
        if (near(x, y)) {
          const t = tileAt(gz, x, y);
          // Stairs rise over the tile behind them; ledges hang a face over the tile in front.
          const up = isRamp(t) ? rise : 0;
          const down = (t === FLOOR || isHoleDiag(gz, x, y)) && isAir(gz, x, y + 1) ? (gz - groundBelow(gz, x, y + 1)) * rise : 0;
          mg.fillRect(px, py - up, T, T + up + down);
        } else if (!seeThrough(gz, x, y)) {
          if (lit(x, y - 1) > 0) mg.fillRect(px, py, T, strip);
          if (lit(x, y + 1) > 0) mg.fillRect(px, py + T - rise - strip, T, rise + strip);
          if (lit(x - 1, y) > 0) mg.fillRect(px, py, strip, T);
          if (lit(x + 1, y) > 0) mg.fillRect(px + T - strip, py, strip, T);
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

    /**
     * Draws rows r0..r1 of level z, with the actors standing in them that pass `test`,
     * cut down to what you can see of that level.
     */
    const rows = (z: number, r0: number, r1: number, test: (y: number) => boolean = () => true) => {
      if (r1 <= r0) return;
      yg.globalCompositeOperation = "source-over";
      yg.clearRect(0, 0, W, H);
      // Only the chunks on screen, and only the slice of rows asked for.
      const top = levelY(z);
      const vr0 = Math.max(r0, Math.floor(-top / T) - 1), vr1 = Math.min(r1, Math.ceil((H - top) / T) + 1);
      const cx0 = Math.max(0, Math.floor(-ox / T / CHUNK)), cx1 = Math.min(Math.ceil(WORLD.w / CHUNK) - 1, Math.floor((W - ox) / T / CHUNK));
      const cyMax = Math.ceil(WORLD.h / CHUNK) - 1;
      const piece = (img: HTMLCanvasElement, cx: number, from: number, a: number, b: number, shift: number) => {
        // Rows a..b of a chunk layer whose first row is `from`.
        if (b <= a) return;
        const sx = 0, sy = (a - from) * T, sw = CHUNK * T, sh = (b - a) * T;
        yg.drawImage(img, sx, sy, sw, sh, ox + cx * CHUNK * T, top + a * T + shift, sw, sh);
      };
      if (vr1 > vr0) {
        // The cliff faces first (each hangs one row below the tile it belongs to, and may run on), so that this level's own floor,
        // nearer the camera, covers whatever of a tall face runs on past the edge it hangs from.
        for (let cy = Math.max(0, Math.floor((vr0 - CHUNK_PAD_BOTTOM) / CHUNK)); cy <= Math.min(cyMax, Math.floor(vr1 / CHUNK)); cy++) {
          for (let cx = cx0; cx <= cx1; cx++) {
            const c = chunkAt(z, cx, cy);
            if (!c) continue;
            const from = cy * CHUNK;
            piece(c.faces, cx, from, Math.max(vr0, from), Math.min(vr1, from + CHUNK + CHUNK_PAD_BOTTOM), T);
          }
        }
        // Then the surfaces, north to south (each chunk's top pad holds stairs rising into the row above).
        for (let cy = Math.max(0, Math.floor(vr0 / CHUNK)); cy <= Math.min(cyMax, Math.floor(vr1 / CHUNK) + 1); cy++) {
          for (let cx = cx0; cx <= cx1; cx++) {
            const c = chunkAt(z, cx, cy);
            if (!c) continue;
            const from = cy * CHUNK - CHUNK_PAD_TOP;
            piece(c.surface, cx, from, Math.max(vr0, from), Math.min(vr1, cy * CHUNK + CHUNK), 0);
          }
        }
      }
      v.actors?.(yg, z, ox, oy, T, y => y >= r0 && y < r1 && test(y));
      yg.globalCompositeOperation = "destination-in";
      yg.drawImage(lights[z], 0, 0);
      sg.drawImage(layer, 0, 0);
    };
    /** Actors alone on level z, cut down to what you can see of it (those in front of you). */
    const actorsOnly = (z: number, test: (y: number) => boolean) => {
      yg.globalCompositeOperation = "source-over";
      yg.clearRect(0, 0, W, H);
      v.actors?.(yg, z, ox, oy, T, test);
      yg.globalCompositeOperation = "destination-in";
      yg.drawImage(lights[z], 0, 0);
      sg.drawImage(layer, 0, 0);
    };

    // Levels at or below you go down whole. Levels above are split at your row: the part
    // behind you first, then you, then the part in front of or over you. With nobody standing
    // there, every level goes down whole.
    sg.clearRect(0, 0, W, H);
    const base = cur;
    const split = v.player ? Math.max(0, Math.min(WORLD.h, Math.floor(v.y))) : WORLD.h;
    // On your own level, actors further down the screen than you go in front of you.
    for (let z = 0; z < LEVELS; z++) {
      if (inSight[z]) rows(z, 0, z <= base ? WORLD.h : split, y => z !== base || !v.player || y <= v.y);
      // Whatever lies below you is dimmed, more so the further down: it reads as depth.
      const below = Math.min(1, Math.max(0, cur - z));
      if (below > 0 && z < LEVELS - 1) {
        sg.fillStyle = `rgb(0 0 0 / ${DEPTH_DIM * below})`;
        sg.fillRect(0, 0, W, H);
      }
    }
    if (v.player) {
      v.player.draw(sg, fx, fy - BODY_ABOVE_FEET * T, T, true);
      if (base < LEVELS && inSight[base]) actorsOnly(base, y => y > v.y);
      for (let z = base + 1; z < LEVELS; z++) if (inSight[z]) rows(z, split, WORLD.h);
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
