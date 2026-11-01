/**
 * world.ts — the map as tiles: levels, stairs and ladders, and the questions asked of it.
 */
import type { Dir } from "../ui/input";
import { LEVEL_PLANS } from "./plans";

export const VOID = 0, FLOOR = 1, WALL = 2, STAIRS = 3, LADDER = 4, DIAG = 5;

export type { Dir };

const DIR_STEP: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

const STAIR_CHARS: Record<string, Dir> = { "^": "up", v: "down", "<": "left", ">": "right" };

/**
 * The plan characters for a diagonal tile: a floor triangle and a wall triangle split along a
 * diagonal. The character shows where the floor is: ◤ the north-west half, ◥ north-east, ◣ south-west,
 * ◢ south-east. Their index is what `Level.diags` holds.
 */
export const DIAG_CHARS = "◤◥◣◢";

/**
 * Diagonal tiles at the edge of a hole: ◸ ◹ ◺ ◿ are floor in the north-west, north-east, south-west or south-east half, and open air
 * in the other (a diagonal rim; walkable on its floor half). In a shaft's walls, ▛ ▜ ▙ ▟ are wall in the north-west, north-east,
 * south-west or south-east half, and open air in the other.
 */
export const HOLE_DIAG_CHARS = "◸◹◺◿";
export const SHAFT_DIAG_CHARS = "▛▜▙▟";

/** A stairs or ladder tile: which way is uphill (every ramp is one tile, rising one level). */
export interface Ramp { dir: Dir; index: number; length: number }

interface Level {
  tiles: Uint8Array;
  ramps: Map<number, Ramp>;
  /** 1 where this level is empty but something walkable lies below (so it's open air, not rock). */
  open: Uint8Array;
  /** For diagonal tiles: which half is floor (an index into DIAG_CHARS). */
  diags: Uint8Array;
  /** 1 for a cell of open air inside a shaft (':' in the plan): empty, but lit and seen through like floor, so the walls round it show. */
  shaft: Uint8Array;
  /** 1 for a diagonal tile whose other half is open air, not wall (the diagonal edge of a hole). */
  holes: Uint8Array;
}

interface World { w: number; h: number; levels: Level[]; start: { x: number; y: number; z: number } }

export const walkable = (t: number) => t === FLOOR || t === STAIRS || t === LADDER || t === DIAG;

export const isRamp = (t: number) => t === STAIRS || t === LADDER;

function buildWorld(plans: string[][]): World {
  // One tile of margin all round, so the walls that grow around the edge fit.
  const w = Math.max(...plans.flat().map(r => r.length)) + 2;
  const h = Math.max(...plans.map(p => p.length)) + 2;
  let start = { x: 1, y: 1, z: 0 };
  const dirs: (Dir | null)[][] = [];
  const levels: Level[] = plans.map((plan, z) => {
    const tiles = new Uint8Array(w * h);
    const d: (Dir | null)[] = new Array(w * h).fill(null);
    const diags = new Uint8Array(w * h);
    const shaft = new Uint8Array(w * h);
    const holes = new Uint8Array(w * h);
    plan.forEach((row, y) => [...row].forEach((c, x) => {
      const i = (y + 1) * w + x + 1;
      if (c === "." || c === "@") tiles[i] = FLOOR;
      else if (c === "#") tiles[i] = WALL;
      else if (c === ":") shaft[i] = 1;
      else if (SHAFT_DIAG_CHARS.includes(c)) shaft[i] = 2 + SHAFT_DIAG_CHARS.indexOf(c);
      else if (HOLE_DIAG_CHARS.includes(c)) { tiles[i] = DIAG; diags[i] = HOLE_DIAG_CHARS.indexOf(c); holes[i] = 1; }
      else if (DIAG_CHARS.includes(c)) { tiles[i] = DIAG; diags[i] = DIAG_CHARS.indexOf(c); }
      else if (c === "H") { tiles[i] = LADDER; d[i] = "up"; }
      else if (c in STAIR_CHARS) { tiles[i] = STAIRS; d[i] = STAIR_CHARS[c]; }
      if (c === "@") start = { x: x + 1, y: y + 1, z };
    }));
    dirs.push(d);
    return { tiles, ramps: new Map(), open: new Uint8Array(w * h), diags, shaft, holes };
  });

  // Ramps climb at 45 degrees: each stairs or ladder tile rises one whole level by itself (so a
  // ramp is always a single tile, and the tile past its top end is on the next level up).
  levels.forEach((lv, z) => {
    const d = dirs[z];
    for (let i = 0; i < w * h; i++) if (isRamp(lv.tiles[i])) lv.ramps.set(i, { dir: d[i]!, index: 0, length: 1 });
  });

  // Open air: empty cells with something walkable somewhere below.
  levels.forEach((lv, z) => {
    for (let i = 0; i < w * h; i++) {
      if (lv.tiles[i] !== VOID) continue;
      for (let k = 0; k < z; k++) if (walkable(levels[k].tiles[i])) { lv.open[i] = 1; break; }
    }
  });

  // Walls: any empty cell touching a walkable one (diagonals too) becomes wall, unless it's open air.
  levels.forEach(lv => {
    const grown = lv.tiles.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (lv.tiles[i] !== VOID || lv.open[i]) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && walkable(lv.tiles[ny * w + nx])) grown[i] = WALL;
      }
    }
    lv.tiles = grown;
  });

  return { w, h, levels, start };
}

export const WORLD = buildWorld(LEVEL_PLANS);

export const LEVELS = WORLD.levels.length;

export const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < WORLD.w && y < WORLD.h;

export const tileAt = (z: number, x: number, y: number) =>
  z < 0 || z >= LEVELS || !inside(x, y) ? VOID : WORLD.levels[z].tiles[y * WORLD.w + x];

export const rampAt = (z: number, x: number, y: number) => WORLD.levels[z]?.ramps.get(y * WORLD.w + x);

export const isAir = (z: number, x: number, y: number) =>
  tileAt(z, x, y) === VOID && inside(x, y) && z < LEVELS && WORLD.levels[z].open[y * WORLD.w + x] === 1;

/** Whether the ramp at (nx, ny) on level z-1 tops out into (x, y) on level z. */
export function isArrival(z: number, x: number, y: number, nx: number, ny: number) {
  const r = z > 0 ? rampAt(z - 1, nx, ny) : undefined;
  if (!r || r.index !== r.length - 1) return false;
  const [sx, sy] = DIR_STEP[r.dir];
  return nx + sx === x && ny + sy === y;
}

/** The height of a ramp tile at point (px, py) (clamped into the tile). */
export function rampHeight(z: number, x: number, y: number, r: Ramp, px: number, py: number) {
  const fx = Math.min(1, Math.max(0, px - x)), fy = Math.min(1, Math.max(0, py - y));
  const along = r.dir === "up" ? 1 - fy : r.dir === "down" ? fy : r.dir === "right" ? fx : 1 - fx;
  return z + along;
}

/** The highest level below z with something solid at (x, y), for how far a ledge drops. */
export function groundBelow(z: number, x: number, y: number) {
  for (let k = z - 1; k >= 0; k--) if (tileAt(k, x, y) !== VOID) return k;
  return z - 1;
}

/**
 * The level you are on, as a whole number, for what to draw. On stairs or a ladder it is the
 * level the ramp stands on (the lower one) until you reach its top end; stepping onto a ramp
 * from above switches to that lower level straight away.
 */
export function levelOf(x: number, y: number, alt: number) {
  const tx = Math.floor(x), ty = Math.floor(y);
  for (const k of [Math.ceil(alt - 1e-3) - 1, Math.round(alt)]) {
    if (k >= 0 && k < LEVELS && isRamp(tileAt(k, tx, ty)) && alt < k + 1 - 0.04) return k;
  }
  return Math.max(0, Math.min(LEVELS - 1, Math.round(alt)));
}

/**
 * How far inside the floor half of a diagonal tile the point (fx, fy) is, where fx and fy are
 * the point's place in the tile (0 to 1, y downwards): positive on the floor side, negative in
 * the wall half, zero on the diagonal itself.
 */
function diagDepth(side: number, fx: number, fy: number) {
  return side === 0 ? 1 - fx - fy : side === 1 ? fx - fy : side === 2 ? fy - fx : fx + fy - 1;
}

/** Whether the point (px, py) of a diagonal tile on level z is on its floor half. */
export function onDiagFloor(z: number, tx: number, ty: number, px: number, py: number) {
  return diagDepth(WORLD.levels[z].diags[ty * WORLD.w + tx], px - tx, py - ty) >= -1e-6;
}

/** Whether the box [x0, x1] x [y0, y1] stays clear of the wall half of the diagonal tile (tx, ty) on level z (the part of the box outside the tile doesn't count). */
export function boxOnDiagFloor(z: number, tx: number, ty: number, x0: number, y0: number, x1: number, y1: number) {
  const side = WORLD.levels[z].diags[ty * WORLD.w + tx];
  const ax = Math.max(x0, tx) - tx, bx = Math.min(x1, tx + 1) - tx, ay = Math.max(y0, ty) - ty, by = Math.min(y1, ty + 1) - ty;
  // Depth is linear, so the worst place is a corner of the part of the box inside the tile.
  return Math.min(diagDepth(side, ax, ay), diagDepth(side, bx, ay), diagDepth(side, ax, by), diagDepth(side, bx, by)) >= -1e-6;
}

/** Which half of the diagonal tile (x, y) on level z is floor (an index into DIAG_CHARS). */
export const diagSide = (z: number, x: number, y: number) => WORLD.levels[z].diags[y * WORLD.w + x];

/**
 * The ladder at tile (x, y) that you are on at height `alt`: ladders stacked on consecutive levels
 * at one tile are a single tall ladder. `bottom` is the height of its foot, `top` that of its head
 * (the floor you step onto lies north of it, at that height). Null if there is no ladder there.
 */
export function ladderSpan(x: number, y: number, alt: number) {
  const start = [Math.floor(alt + 1e-3), Math.ceil(alt - 1e-3) - 1].find(k => tileAt(k, x, y) === LADDER);
  if (start === undefined) return null;
  let lo = start, hi = start;
  while (tileAt(lo - 1, x, y) === LADDER) lo--;
  while (tileAt(hi + 1, x, y) === LADDER) hi++;
  return { bottom: lo, top: hi + 1 };
}

/** Whether (x, y) on level z is open air inside a shaft (':' or a shaft diagonal in the plan): not floor, but seen through. */
export const isShaft = (z: number, x: number, y: number) => z >= 0 && z < LEVELS && inside(x, y) && WORLD.levels[z].shaft[y * WORLD.w + x] > 0;

/** Whether the diagonal tile (x, y) on level z has open air, not wall, in its other half (the rim of a hole). */
export const isHoleDiag = (z: number, x: number, y: number) => tileAt(z, x, y) === DIAG && WORLD.levels[z].holes[y * WORLD.w + x] === 1;

/** For a shaft's diagonal wall tile: which corner its wall half is in (an index into DIAG_CHARS: 0 north-west, 1 north-east, 2 south-west, 3 south-east); otherwise -1. */
export function shaftDiagSide(z: number, x: number, y: number) {
  const v = z >= 0 && z < LEVELS && inside(x, y) ? WORLD.levels[z].shaft[y * WORLD.w + x] : 0;
  return v >= 2 ? v - 2 : -1;
}
