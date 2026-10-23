/**
 * movement.ts — walking: bumping into walls, sliding along them, stepping up and dropping down.
 */
import { sealedAt } from "./seals";
import { CORNER_ASSIST, HALF_D, HALF_W, STEP_TOLERANCE } from "./tuning";
import { type Dir, FLOOR, isRamp, LEVELS, rampAt, rampHeight, tileAt } from "./world";

/* ============================================================
 * Standing and moving: surfaces near your height
 * ============================================================ */

export interface Walker {
  /** Where your feet are, in tiles (floats; the center of a tile is n + 0.5). */
  x: number; y: number;
  /** Your height, in storeys (0 = ground level). Fractional while on stairs or ladders. */
  alt: number;
  /** Current velocity, in tiles per second. */
  vx: number; vy: number;
  facing: Dir;
  /** Distance walked since you last stood still, which drives the walk cycle. */
  walked: number;
  climbing: boolean;
  /** How fast you're falling, in storeys per second (0 = on solid ground). */
  fall: number;
  /** The height of whatever is beneath you, where your shadow falls. */
  ground: number;
}

/**
 * The surface you'd end up on in tile (tx, ty), at point (px, py), coming from height `alt`:
 * the highest floor or ramp there that isn't more than a step above you. Anything lower is
 * fair game — you step down onto it, or drop down onto it from a ledge.
 */
export function surfaceNear(tx: number, ty: number, px: number, py: number, alt: number) {
  let best: { h: number; t: number } | null = null;
  for (let z = 0; z < LEVELS; z++) {
    const t = tileAt(z, tx, ty);
    let hgt: number | null = null;
    if (t === FLOOR) hgt = sealedAt(z, tx, ty) ? null : z; // wax closes a tile like a wall
    else if (isRamp(t)) hgt = rampHeight(z, tx, ty, rampAt(z, tx, ty)!, px, py);
    if (hgt === null || hgt > alt + STEP_TOLERANCE) continue;
    if (!best || hgt > best.h) best = { h: hgt, t };
  }
  return best;
}

/** Whether your footprint, with feet at (x, y), overlaps tile (tx, ty). */
const overlaps = (x: number, y: number, tx: number, ty: number) =>
  x + HALF_W > tx && x - HALF_W < tx + 1 && y + HALF_D > ty && y - HALF_D < ty + 1;

/**
 * Whether moving your footprint from (fromX, fromY) to (x, y), at height `alt`, would push it
 * into anything you can't stand on. Tiles you already overlap never block the edges of your
 * footprint: after dropping off the side of some stairs, say, you can always walk away from
 * them. Your feet still can't step onto them.
 */
function blocked(x: number, y: number, alt: number, fromX: number, fromY: number) {
  // Your feet themselves must always land on something you can stand on.
  if (!surfaceNear(Math.floor(x), Math.floor(y), x, y, alt)) return true;
  const x0 = Math.floor(x - HALF_W), x1 = Math.floor(x + HALF_W - 1e-6);
  const y0 = Math.floor(y - HALF_D), y1 = Math.floor(y + HALF_D - 1e-6);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (overlaps(fromX, fromY, tx, ty)) continue;
    if (!surfaceNear(tx, ty, x, y, alt)) return true;
  }
  return false;
}

/** Moves along one axis as far as the walls allow; stops flush against them. */
export function slide(me: Walker, axis: "x" | "y", amount: number): number {
  const at = (v: number) => (axis === "x" ? blocked(v, me.y, me.alt, me.x, me.y) : blocked(me.x, v, me.alt, me.x, me.y));
  const from = me[axis], to = from + amount;
  if (!at(to)) return to;
  const half = axis === "x" ? HALF_W : HALF_D;
  const edge = amount > 0 ? Math.floor(to + half) - half - 1e-4 : Math.ceil(to - half) + half + 1e-4;
  return (amount > 0 ? edge >= from : edge <= from) && !at(edge) ? edge : from;
}

/**
 * When you walk straight into a wall but are nearly lined up with an opening beside it,
 * drift sideways toward the opening so you slip in instead of snagging on the corner.
 */
export function cornerNudge(me: Walker, axis: "x" | "y", dir: number, step: number): number {
  const other = axis === "x" ? me.y : me.x;
  const probe = 0.05 * dir;
  const free = (o: number) => (axis === "x" ? !blocked(me.x + probe, o, me.alt, me.x, me.y) : !blocked(o, me.y + probe, me.alt, me.x, me.y));
  const center = Math.floor(other) + 0.5;
  const lanes = [center, center - 1, center + 1].sort((a, b) => Math.abs(a - other) - Math.abs(b - other));
  for (const lane of lanes) {
    const off = lane - other;
    if (Math.abs(off) > CORNER_ASSIST || Math.abs(off) < 1e-3) continue;
    if (!free(lane)) continue;
    return Math.sign(off) * Math.min(Math.abs(off), step);
  }
  return 0;
}
