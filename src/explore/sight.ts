/**
 * sight.ts — what you can see from where you stand: a flood over the tiles, held back at doorways.
 *
 * No geometry: sight spreads from your tile across walkable tiles, one step at a time, until it
 * runs out of range. The map is cut into rooms once, when it loads (see `rooms`: a corridor, a
 * doorway or a stair is a room of its own; a hall with its bridges and the floors under them is
 * one). Whenever sight steps from one room into another, that is a doorway: what lies past it is
 * lit only by a small light of its own there, and it can only carry GAP_PEEK tiles further. So
 * from a room you see just the mouth of a corridor, and from a corridor just the near corner of
 * the room ahead, until you step through. Past a doorway the doorway's light is the only light:
 * the circle of your sight never lights another room by itself.
 */
import { lampRadius, SIGHT_REACH } from "./tuning";
import { NARROW, ROOM, seeThrough } from "./rooms";
import { isAir, isRamp, isShaft, LEVELS, tileAt, VOID, WORLD } from "./world";

export { NARROW, seeThrough };

/**
 * The light of a doorway is centred on the middle of the line between the two rooms: the point
 * halfway between the centres of the last tile of one and the first of the other. It is written
 * (in `origin`) in half tiles, as `y * 128 + x`; these give it back in tiles.
 */
export const lampX = (o: number) => (o & 127) / 2;
export const lampY = (o: number) => (o >> 7) / 2;

/**
 * How much sight is left on each tile of every level, seen by you at (px, py) and height `alt`:
 * negative where you can't see at all, counting down from VISION_RADIUS with distance.
 * Sight spreads across your own level and, over the edge of a ledge, drops down onto the floor
 * below and spreads on there, as far as your sight reaches.
 * Worked out into `left` (one array per level), if given. With `origin` (one array per level too),
 * also where each tile's light comes from: -1 for you, or the middle of the line (see `lampX`) at the
 * doorway or corridor mouth it was seen through, which then is a source of light of its own, GAP_PEEK
 * wide at most (less the farther you stand from it).
 * With `touched`, also 1 for every level that sight reached anywhere.
 */
export function sight(px: number, py: number, alt: number, left = WORLD.levels.map(() => new Float32Array(WORLD.w * WORLD.h)), origin?: Int32Array[], touched?: Uint8Array) {
  const { w, h } = WORLD, N = w * h;
  for (const l of left) l.fill(-1);
  if (origin) for (const o of origin) o.fill(-1);
  if (touched) touched.fill(0);
  const sx = Math.floor(px), sy = Math.floor(py);
  const queue: number[] = [];
  /** The middle of the line between tile i and tile j (on one grid), in half tiles. */
  const mid = (i: number, j: number) => (Math.floor(i / w) + Math.floor(j / w) + 1) * 128 + ((i % w) + (j % w) + 1);
  /**
   * How much sight is left just past a doorway, whatever is left of yours: the reach of its light
   * (how far it shines, which depends on how far you are) and a tile more, so that where sight stops lies
   * beyond where the light has faded and the two don't each fade the picture.
   */
  const past = (o: number) => lampRadius(Math.hypot(px - lampX(o), py - lampY(o))) + 1;
  const relax = (z: number, i: number, v: number, from = -1) => {
    if (v < 0 || v <= left[z][i]) return;
    left[z][i] = v;
    if (origin) origin[z][i] = from;
    if (touched) touched[z] = 1;
    queue.push(z * N + i);
  };
  // Your own tile and the ones around it are measured from exactly where you stand, so sight
  // shifts smoothly as you walk rather than jumping from tile to tile. On stairs, you see from
  // both the level you're leaving and the one you're heading to.
  const lo = Math.floor(alt + 1e-3), hi = Math.max(lo, Math.ceil(alt - 1e-3));
  const seed = (z: number) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = sx + dx, ny = sy + dy, ni = ny * w + nx;
      if (!seeThrough(z, nx, ny)) continue;
      if (dx && dy && (!seeThrough(z, sx + dx, sy) || !seeThrough(z, sx, sy + dy))) continue;
      let v = SIGHT_REACH - Math.hypot(px - (nx + 0.5), py - (ny + 0.5));
      let from = -1;
      if (ROOM[z][ni] !== ROOM[z][sy * w + sx]) { from = mid(sy * w + sx, ni); v = past(from); }
      relax(z, ni, v, from);
    }
  };
  let seeded = false;
  for (let z = lo; z <= Math.min(hi, LEVELS - 1); z++) {
    if (!seeThrough(z, sx, sy)) continue;
    seed(z);
    seeded = true;
  }
  // Falling past rock (off the side of some stairs, say): you see from the floor you're falling toward.
  if (!seeded) for (let z = Math.min(lo, LEVELS) - 1; z >= 0; z--) {
    if (seeThrough(z, sx, sy)) { seed(z); break; }
  }
  while (queue.length) {
    const e = queue.pop()!, z = Math.floor(e / N), i = e % N, x = i % w, y = (i - x) / w;
    const here = left[z][i], room = ROOM[z], from = origin ? origin[z][i] : -1;
    // Stairs and ladders join two levels: sight passes along them from one level to the
    // other, glimpsing only a little way onto the far floor (like past a doorway).
    if (isRamp(tileAt(z, x, y)) && z + 1 < LEVELS) {
      const enters = from < 0 && ROOM[z + 1][i] !== room[i];
      relax(z + 1, i, enters ? past(mid(i, i)) : here, enters ? mid(i, i) : from);
    }
    if (z > 0 && isRamp(tileAt(z - 1, x, y))) {
      const enters = from < 0 && ROOM[z - 1][i] !== room[i];
      relax(z - 1, i, enters ? past(mid(i, i)) : here, enters ? mid(i, i) : from);
    }
    // Inside a shaft the light runs straight down (and up) its length, as far as it is open.
    if (isShaft(z, x, y) && z > 0 && seeThrough(z - 1, x, y)) relax(z - 1, i, here, from);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy, ni = ny * w + nx;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (seeThrough(z, nx, ny)) {
        // No squeezing diagonally between two corners.
        if (dx && dy && (!seeThrough(z, x + dx, y) || !seeThrough(z, x, y + dy))) continue;
        let next = here - (dx && dy ? Math.SQRT2 : 1);
        let source = from;
        if (from < 0 && room[ni] !== room[i]) { source = mid(i, ni); next = past(source); }
        relax(z, ni, next, source);
      } else if (!dx !== !dy && isAir(z, nx, ny)) {
        // Over a ledge: down to the first thing below. If that's floor, sight lands on it and spreads on as usual.
        for (let k = z - 1; k >= 0; k--) {
          if (tileAt(k, nx, ny) === VOID && !isShaft(k, nx, ny)) continue;
          if (seeThrough(k, nx, ny)) relax(k, ni, here - 1, from);
          break;
        }
      }
    }
  }
  return left;
}
