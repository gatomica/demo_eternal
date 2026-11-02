/**
 * world.ts — the map as tiles: levels, stairs and ladders, and the questions asked of it.
 */
import type { Dir } from "../ui/input";
import { LEVEL_PLANS } from "./plans";

export const VOID = 0, FLOOR = 1, WALL = 2, STAIRS = 3, LADDER = 4, DIAG = 5;

export type { Dir };

/** Which way a ramp goes uphill: straight, or (for a diagonal corridor's stairs) toward a corner. */
export type RampDir = Dir | "ne" | "nw" | "se" | "sw";

const DIR_STEP: Record<RampDir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0], ne: [1, -1], nw: [-1, -1], se: [1, 1], sw: [-1, 1] };

const STAIR_CHARS: Record<string, RampDir> = { "^": "up", v: "down", "<": "left", ">": "right", "↖": "nw", "↗": "ne", "↙": "sw", "↘": "se" };

/** Whether a ramp goes uphill toward a corner. */
export const isDiagonalRamp = (dir: RampDir) => dir === "ne" || dir === "nw" || dir === "se" || dir === "sw";

/** How far up a ramp going `dir` the point (fx, fy) of its tile is: 0 at its foot, 1 at its head, and on past them outside the tile. */
export function rampAlong(dir: RampDir, fx: number, fy: number) {
  switch (dir) {
    case "up": return 1 - fy;
    case "down": return fy;
    case "right": return fx;
    case "left": return 1 - fx;
    case "se": return (fx + fy) / 2;
    case "nw": return 1 - (fx + fy) / 2;
    case "ne": return (fx + 1 - fy) / 2;
    case "sw": return (1 - fx + fy) / 2;
  }
}

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
export interface Ramp { dir: RampDir; index: number; length: number }

/** The diagonal stairs a diagonal tile beside them tilts with: the tile's floor half lies on the same slope. */
export interface Slope { x: number; y: number; dir: RampDir }

interface Level {
  tiles: Uint8Array;
  ramps: Map<number, Ramp>;
  /** For the diagonal tiles beside diagonal stairs, by tile index. */
  slopes: Map<number, Slope>;
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
  const dirs: (RampDir | null)[][] = [];
  const levels: Level[] = plans.map((plan, z) => {
    const tiles = new Uint8Array(w * h);
    const d: (RampDir | null)[] = new Array(w * h).fill(null);
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
    return { tiles, ramps: new Map(), slopes: new Map(), open: new Uint8Array(w * h), diags, shaft, holes };
  });

  // Ramps climb at 45 degrees: each stairs or ladder tile rises one whole level by itself (so a
  // ramp is always a single tile, and the tile past its top end is on the next level up).
  levels.forEach((lv, z) => {
    const d = dirs[z];
    for (let i = 0; i < w * h; i++) if (isRamp(lv.tiles[i])) lv.ramps.set(i, { dir: d[i]!, index: 0, length: 1 });
    // You walk a diagonal corridor across the diagonal tiles beside its floor squares, so beside diagonal stairs those tilt too.
    for (const [i, r] of lv.ramps) {
      if (!isDiagonalRamp(r.dir)) continue;
      const x = i % w, y = (i - x) / w;
      for (const n of [i - 1, i + 1, i - w, i + w]) if (lv.tiles[n] === DIAG && !lv.holes[n]) lv.slopes.set(n, { x, y, dir: r.dir });
    }
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

/** The slope the diagonal tile (x, y) on level z tilts with, if it does. */
export const slopeAt = (z: number, x: number, y: number) => (z >= 0 && z < LEVELS && inside(x, y) ? WORLD.levels[z].slopes.get(y * WORLD.w + x) : undefined);

/** How far up a slope the point (px, py) is: 0 at its foot, 1 at its head, and flat beyond them. */
export const slopeRise = (s: Slope, px: number, py: number) => Math.min(1, Math.max(0, rampAlong(s.dir, px - s.x, py - s.y)));

/** Whether the ramp at (nx, ny) on level z-1 tops out into (x, y) on level z. */
export function isArrival(z: number, x: number, y: number, nx: number, ny: number) {
  // A tilted diagonal tile reaches the level above along the edge it shares with (x, y).
  const s = slopeAt(z - 1, nx, ny);
  if (s && slopeRise(s, (x + nx + 1) / 2, (y + ny + 1) / 2) >= 1 - 1e-6) return true;
  const r = z > 0 ? rampAt(z - 1, nx, ny) : undefined;
  if (!r || r.index !== r.length - 1) return false;
  const [sx, sy] = DIR_STEP[r.dir];
  return nx + sx === x && ny + sy === y;
}

/** The height of a ramp tile at point (px, py) (clamped into the tile). */
export function rampHeight(z: number, x: number, y: number, r: Ramp, px: number, py: number) {
  const fx = Math.min(1, Math.max(0, px - x)), fy = Math.min(1, Math.max(0, py - y));
  return z + rampAlong(r.dir, fx, fy);
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
    if (k >= 0 && k < LEVELS && (isRamp(tileAt(k, tx, ty)) || slopeAt(k, tx, ty)) && alt < k + 1 - 0.04) return k;
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

/** Whether any of the box [x0, x1] x [y0, y1] inside the diagonal tile (tx, ty) on level z is on its floor half. */
export function boxTouchesDiagFloor(z: number, tx: number, ty: number, x0: number, y0: number, x1: number, y1: number) {
  const side = WORLD.levels[z].diags[ty * WORLD.w + tx];
  const ax = Math.max(x0, tx) - tx, bx = Math.min(x1, tx + 1) - tx, ay = Math.max(y0, ty) - ty, by = Math.min(y1, ty + 1) - ty;
  if (bx < ax || by < ay) return false;
  return Math.max(diagDepth(side, ax, ay), diagDepth(side, bx, ay), diagDepth(side, ax, by), diagDepth(side, bx, by)) >= -1e-6;
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

/** Whether a wall stands at (x, y) on level z: a wall tile, or a diagonal tile's wall half. */
export const wallStandsAt = (z: number, x: number, y: number) =>
  tileAt(z, x, y) === WALL || shaftDiagSide(z, x, y) >= 0 || (tileAt(z, x, y) === DIAG && !isHoleDiag(z, x, y));

/** Whether a wall beside (x, y) on level z shows its face or rim on that side: there is floor there, or a shaft's open air. */
export const wallFacesInto = (z: number, x: number, y: number) => walkable(tileAt(z, x, y)) || isShaft(z, x, y);

/**
 * If you stand at (x, y) on level z in a walled room open above you (a shaft's open air or a ladder right overhead):
 * for each column of the map, the northernmost row you can still see at floor level. That's the row
 * under the room's north wall (a doorway shows, what's past it doesn't), and past the room's east and
 * west ends the nearest end's row, as if the wall ran on. Null if you are not in such a room.
 */
export function roomLimit(z: number, x: number, y: number) {
  const { w, h } = WORLD;
  const open = (cx: number, cy: number) => isShaft(z + 1, cx, cy) || tileAt(z + 1, cx, cy) === LADDER;
  if (!open(x, y) || shaftDiagSide(z + 1, x, y) >= 0) return null;
  const north = new Int16Array(w).fill(h);
  const seen = new Uint8Array(w * h);
  const stack = [[x, y]];
  seen[y * w + x] = 1;
  while (stack.length) {
    const [cx, cy] = stack.pop()!;
    north[cx] = Math.min(north[cx], cy);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (!inside(nx, ny) || seen[ny * w + nx] || !open(nx, ny)) continue;
      seen[ny * w + nx] = 1;
      stack.push([nx, ny]);
    }
  }
  let first = 0, last = w - 1;
  while (north[first] === h) first++;
  while (north[last] === h) last--;
  const out = new Int16Array(w);
  for (let c = 0; c < w; c++) out[c] = north[Math.max(first, Math.min(last, c))] - 1;
  return out;
}

/** One level's slice of a cliff: the block under a ledge, whose face shows south of it. */
export interface CliffBlock {
  /** The level of the floor it hangs from (its stone's colour). */
  z: number;
  /** Whether it is the block right under that floor, where the edge is. */
  top: boolean;
  /** For the rim of a hole, which half of the tile is floor (0 or 1: the cut slants); otherwise -1. */
  diag: number;
}

/**
 * The blocks of every cliff, per level, by tile index. A tall cliff is a stack of one-level blocks, so
 * each can fade by its own distance from you. In a level's own coordinates a block's face fills
 * its own tile's row, as a wall's face does.
 */
export const CLIFFS: Map<number, CliffBlock>[] = (() => {
  const out = WORLD.levels.map(() => new Map<number, CliffBlock>());
  const stack = (z: number, x: number, y: number, ground: number, diag: number) => {
    for (let k = z - 1; k >= ground; k--) {
      // Where a shaft's diagonal wall already stands, that wall is the face.
      if (shaftDiagSide(k, x, y) < 0) out[k].set(y * WORLD.w + x, { z, top: k === z - 1, diag });
      // A cliff hanging in a hall ends with the hall (a bridge's doesn't carry on down a hole in its floor).
      if (isShaft(k + 1, x, y) && !isShaft(k, x, y)) break;
    }
  };
  for (let z = 1; z < LEVELS; z++) for (let y = 0; y < WORLD.h; y++) for (let x = 0; x < WORLD.w; x++) {
    if (tileAt(z, x, y) === FLOOR && isAir(z, x, y + 1) && !isArrival(z, x, y, x, y + 1)) {
      // A bridge (open air on both sides) is only one block thick; anything else is solid down to what lies below.
      stack(z, x, y, isAir(z, x, y - 1) ? z - 1 : groundBelow(z, x, y + 1), -1);
    }
    else if (isHoleDiag(z, x, y) && diagSide(z, x, y) < 2) stack(z, x, y, groundBelow(z, x, y), diagSide(z, x, y));
  }
  return out;
})();
