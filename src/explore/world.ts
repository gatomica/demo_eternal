/**
 * world.ts — the map as tiles: levels, stairs and ladders, and the questions asked of it.
 */
import type { Dir } from "../ui/input";
import { LEVEL_PLANS } from "./plans";

export const VOID = 0, FLOOR = 1, WALL = 2, STAIRS = 3, LADDER = 4;

export type { Dir };

const DIR_STEP: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

const STAIR_CHARS: Record<string, Dir> = { "^": "up", v: "down", "<": "left", ">": "right" };

/** A stairs or ladder tile: which way is uphill, and where it sits in its run of ramp tiles. */
export interface Ramp { dir: Dir; index: number; length: number }

interface Level {
  tiles: Uint8Array;
  ramps: Map<number, Ramp>;
  /** 1 where this level is empty but something walkable lies below (so it's open air, not rock). */
  open: Uint8Array;
}

interface World { w: number; h: number; levels: Level[]; start: { x: number; y: number; z: number } }

export const walkable = (t: number) => t === FLOOR || t === STAIRS || t === LADDER;

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
    plan.forEach((row, y) => [...row].forEach((c, x) => {
      const i = (y + 1) * w + x + 1;
      if (c === "." || c === "@") tiles[i] = FLOOR;
      else if (c === "#") tiles[i] = WALL;
      else if (c === "H") { tiles[i] = LADDER; d[i] = "up"; }
      else if (c in STAIR_CHARS) { tiles[i] = STAIRS; d[i] = STAIR_CHARS[c]; }
      if (c === "@") start = { x: x + 1, y: y + 1, z };
    }));
    dirs.push(d);
    return { tiles, ramps: new Map(), open: new Uint8Array(w * h) };
  });

  // Ramps: find each tile's place in its run, so a long staircase rises evenly along its length.
  levels.forEach((lv, z) => {
    const d = dirs[z];
    const same = (x: number, y: number, t: number, dir: Dir) =>
      x >= 0 && y >= 0 && x < w && y < h && lv.tiles[y * w + x] === t && d[y * w + x] === dir;
    for (let i = 0; i < w * h; i++) {
      const t = lv.tiles[i];
      if (!isRamp(t)) continue;
      const dir = d[i]!, [sx, sy] = DIR_STEP[dir], x = i % w, y = Math.floor(i / w);
      let back = 0, fwd = 0;
      while (same(x - sx * (back + 1), y - sy * (back + 1), t, dir)) back++;
      while (same(x + sx * (fwd + 1), y + sy * (fwd + 1), t, dir)) fwd++;
      lv.ramps.set(i, { dir, index: back, length: back + fwd + 1 });
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
  return z + (r.index + along) / r.length;
}

/** The highest level below z with something solid at (x, y), for how far a ledge drops. */
export function groundBelow(z: number, x: number, y: number) {
  for (let k = z - 1; k >= 0; k--) if (tileAt(k, x, y) !== VOID) return k;
  return z - 1;
}
