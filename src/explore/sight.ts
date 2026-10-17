/**
 * sight.ts — what you can see from where you stand: a flood over the tiles, held back at doorways.
 *
 * No geometry: sight spreads from your tile across walkable tiles, one step at a time, until it
 * runs out of range. Narrow passages (doorways, corridors, stairs: anything with walls on both
 * sides) are told apart from open space once, when the map loads. Whenever sight crosses
 * between the two, it can only carry GAP_PEEK tiles further. So from a room you see just the
 * mouth of a corridor, and from a corridor just the near corner of the room ahead, until you
 * step through.
 */
import { GAP_PEEK, VISION_RADIUS } from "./tuning";
import { inside, isAir, isRamp, LEVELS, tileAt, VOID, walkable, WORLD } from "./world";

/** Tiles sight travels over on level z: walkable ones, plus the space above stairs from below. */
const seesThrough = (z: number, x: number, y: number) => walkable(tileAt(z, x, y)) || isRamp(tileAt(z - 1, x, y));

/** The same, worked out once per tile when the map loads (sight asks it many times a frame). */
const SEE = WORLD.levels.map((_, z) => {
  const out = new Uint8Array(WORLD.w * WORLD.h);
  for (let y = 0; y < WORLD.h; y++) for (let x = 0; x < WORLD.w; x++) if (seesThrough(z, x, y)) out[y * WORLD.w + x] = 1;
  return out;
});

export const seeThrough = (z: number, x: number, y: number) =>
  z >= 0 && z < LEVELS && inside(x, y) ? SEE[z][y * WORLD.w + x] === 1 : seesThrough(z, x, y);

/**
 * Per level, 1 for tiles in a narrow passage. A tile is open space if it's part of some 2x2
 * block of tiles you can see across, as every tile of a room is; anything else (corridors and
 * their corners, doorways, bridges, staircases) is narrow.
 */
const NARROW = WORLD.levels.map((_, z) => {
  const out = new Uint8Array(WORLD.w * WORLD.h);
  const open = (x: number, y: number) =>
    seeThrough(z, x, y) && seeThrough(z, x + 1, y) && seeThrough(z, x, y + 1) && seeThrough(z, x + 1, y + 1);
  for (let y = 0; y < WORLD.h; y++) for (let x = 0; x < WORLD.w; x++) {
    if (!seeThrough(z, x, y)) continue;
    if (!(open(x, y) || open(x - 1, y) || open(x, y - 1) || open(x - 1, y - 1))) out[y * WORLD.w + x] = 1;
  }
  return out;
});

/**
 * How much sight is left on each tile of every level, seen by you at (px, py) and height `alt`:
 * negative where you can't see at all, counting down from VISION_RADIUS with distance.
 * Sight spreads across your own level and, over the edge of a ledge, drops down onto the floor
 * below, carrying only GAP_PEEK further (you glimpse what's down there, like around a corner).
 * Worked out into `left` (one array per level), if given.
 */
export function sight(px: number, py: number, alt: number, left = WORLD.levels.map(() => new Float32Array(WORLD.w * WORLD.h))) {
  const { w, h } = WORLD, N = w * h;
  for (const l of left) l.fill(-1);
  const sx = Math.floor(px), sy = Math.floor(py);
  const queue: number[] = [];
  const relax = (z: number, i: number, v: number) => {
    if (v < 0 || v <= left[z][i]) return;
    left[z][i] = v;
    queue.push(z * N + i);
  };
  // Your own tile and the ones around it are measured from exactly where you stand, so sight
  // shifts smoothly as you walk rather than jumping from tile to tile. On stairs, you see from
  // both the level you're leaving and the one you're heading to.
  const lo = Math.floor(alt + 1e-3), hi = Math.max(lo, Math.ceil(alt - 1e-3));
  for (let z = lo; z <= Math.min(hi, LEVELS - 1); z++) {
    if (!seeThrough(z, sx, sy)) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = sx + dx, ny = sy + dy, ni = ny * w + nx;
      if (!seeThrough(z, nx, ny)) continue;
      if (dx && dy && (!seeThrough(z, sx + dx, sy) || !seeThrough(z, sx, sy + dy))) continue;
      let v = VISION_RADIUS - Math.hypot(px - (nx + 0.5), py - (ny + 0.5));
      if (NARROW[z][ni] !== NARROW[z][sy * w + sx]) v = Math.min(v, GAP_PEEK);
      relax(z, ni, v);
    }
  }
  while (queue.length) {
    const e = queue.pop()!, z = Math.floor(e / N), i = e % N, x = i % w, y = (i - x) / w;
    const here = left[z][i], narrow = NARROW[z];
    // Stairs and ladders join two levels: sight passes along them from one level to the
    // other, glimpsing only a little way onto the far floor (like past a doorway).
    if (isRamp(tileAt(z, x, y)) && z + 1 < LEVELS) relax(z + 1, i, Math.min(here, GAP_PEEK));
    if (z > 0 && isRamp(tileAt(z - 1, x, y))) relax(z - 1, i, Math.min(here, GAP_PEEK));
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy, ni = ny * w + nx;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (seeThrough(z, nx, ny)) {
        // No squeezing diagonally between two corners.
        if (dx && dy && (!seeThrough(z, x + dx, y) || !seeThrough(z, x, y + dy))) continue;
        let next = here - (dx && dy ? Math.SQRT2 : 1);
        if (narrow[ni] !== narrow[i]) next = Math.min(next, GAP_PEEK);
        relax(z, ni, next);
      } else if (!dx !== !dy && isAir(z, nx, ny)) {
        // Over a ledge: down to the first thing below. If that's floor, you glimpse it.
        for (let k = z - 1; k >= 0; k--) {
          if (tileAt(k, nx, ny) === VOID) continue;
          if (seeThrough(k, nx, ny)) relax(k, ni, Math.min(here - 1, GAP_PEEK));
          break;
        }
      }
    }
  }
  return left;
}
