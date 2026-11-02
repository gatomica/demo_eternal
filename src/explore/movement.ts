/**
 * movement.ts — walking: bumping into walls, sliding along them, stepping up and dropping down.
 */
import { CORNER_ASSIST, HALF_D, HALF_W, STEP_TOLERANCE } from "./tuning";
import { boxOnDiagFloor, boxTouchesDiagFloor, type Dir, DIAG, FLOOR, isHoleDiag, isRamp, LADDER, onDiagFloor, LEVELS, rampAt, rampHeight, slopeAt, slopeRise, tileAt, WALL } from "./world";

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
  /** A body wider than yours: the radius of its round footprint, in tiles. A big one cannot fit down a one-tile corridor. */
  half?: number;
}

/** Half the width and depth of a walker's footprint, and whether it is round (a big body) rather than a box. */
const halves = (me: { half?: number }): [number, number, boolean] => (me.half ? [me.half, me.half, true] : [HALF_W, HALF_D, false]);

/**
 * The surface you'd end up on in tile (tx, ty), at point (px, py), coming from height `alt`
 * (`box`: for your whole footprint around the point, which matters at a diagonal wall):
 * the highest floor or ramp there that isn't more than a step above you. Anything lower is
 * fair game — you step down onto it, or drop down onto it from a ledge. But a wall at or below your
 * height, above that surface, stands in the way: you can't walk through it to what's under it.
 */
export function surfaceNear(tx: number, ty: number, px: number, py: number, alt: number, box = false, hw = HALF_W, hd = HALF_D) {
  let best: { h: number; t: number } | null = null;
  let wall = -1;
  for (let z = 0; z < LEVELS; z++) {
    const t = tileAt(z, tx, ty);
    let hgt: number | null = null;
    if (t === WALL && z <= alt + 1e-3) wall = z;
    if (t === FLOOR) hgt = z;
    else if (t === DIAG) {
      // Only its floor half: a point must be on it. With `box` your whole footprint must be, if the other half is a wall
      // you could bump into. The rim of a hole has open air there, and a diagonal far below you is no wall at your height: touching is enough.
      const x0 = px - hw, y0 = py - hd, x1 = px + hw, y1 = py + hd;
      const slope = slopeAt(z, tx, ty);
      const open = isHoleDiag(z, tx, ty) || (alt - z > STEP_TOLERANCE && !slope);
      if (!box ? onDiagFloor(z, tx, ty, px, py) : open ? boxTouchesDiagFloor(z, tx, ty, x0, y0, x1, y1) : boxOnDiagFloor(z, tx, ty, x0, y0, x1, y1)) hgt = slope ? z + slopeRise(slope, px, py) : z;
      // Into its wall half: as solid as any wall, whatever lies under it.
      else if (!isHoleDiag(z, tx, ty) && z <= alt + 1e-3) wall = z;
    } else if (t === LADDER) {
      // A ladder is climbed in place: whatever height you are at, within its level.
      hgt = Math.min(z + 1, Math.max(z, alt));
    } else if (isRamp(t)) hgt = rampHeight(z, tx, ty, rampAt(z, tx, ty)!, px, py);
    if (hgt === null || hgt > alt + STEP_TOLERANCE) continue;
    if (!best || hgt > best.h) best = { h: hgt, t };
  }
  return best && wall > best.h ? null : best;
}

/** Whether your footprint, with feet at (x, y), overlaps tile (tx, ty). */
const overlaps = (x: number, y: number, tx: number, ty: number, hw: number, hd: number) =>
  x + hw > tx && x - hw < tx + 1 && y + hd > ty && y - hd < ty + 1;

/** Whether any level has a diagonal tile at (tx, ty). */
const hasDiagonal = (tx: number, ty: number) => Array.from({ length: LEVELS }, (_, z) => tileAt(z, tx, ty)).includes(DIAG);

/**
 * Whether moving your footprint from (fromX, fromY) to (x, y), at height `alt`, would push it
 * into anything you can't stand on. Tiles you already overlap never block the edges of your
 * footprint: after dropping off the side of some stairs, say, you can always walk away from
 * them. Your feet still can't step onto them.
 */
function blocked(x: number, y: number, alt: number, fromX: number, fromY: number, hw = HALF_W, hd = HALF_D, round = false) {
  // Your feet themselves must always land on something you can stand on.
  if (!surfaceNear(Math.floor(x), Math.floor(y), x, y, alt)) return true;
  if (round) {
    // A big round body: every point round its edge must be on something it can stand on.
    for (let k = 0; k < 24; k++) {
      const a = (k * Math.PI) / 12, px = x + hw * Math.cos(a), py = y + hw * Math.sin(a);
      if (!surfaceNear(Math.floor(px), Math.floor(py), px, py, alt)) return true;
    }
    return false;
  }
  const x0 = Math.floor(x - hw), x1 = Math.floor(x + hw - 1e-6);
  const y0 = Math.floor(y - hd), y1 = Math.floor(y + hd - 1e-6);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    // (A diagonal wall always counts: you can stand beside it, never in it.)
    if (overlaps(fromX, fromY, tx, ty, hw, hd) && !hasDiagonal(tx, ty)) continue;
    if (!surfaceNear(tx, ty, x, y, alt, true, hw, hd)) return true;
  }
  return false;
}

/** Moves along one axis as far as the walls allow; stops flush against them. */
export function slide(me: Walker, axis: "x" | "y", amount: number): number {
  const [hw, hd, round] = halves(me);
  const at = (v: number) => (axis === "x" ? blocked(v, me.y, me.alt, me.x, me.y, hw, hd, round) : blocked(me.x, v, me.alt, me.x, me.y, hw, hd, round));
  const from = me[axis], to = from + amount;
  if (!at(to)) return to;
  const half = axis === "x" ? hw : hd;
  const edge = amount > 0 ? Math.floor(to + half) - half - 1e-4 : Math.ceil(to - half) + half + 1e-4;
  const flush = (amount > 0 ? edge >= from : edge <= from) && !at(edge) ? edge : from;
  // A diagonal wall isn't at a tile's edge: close in on it as far as the footprint allows.
  let lo = flush, hi = to;
  for (let i = 0; i < 10; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid)) hi = mid; else lo = mid;
  }
  return lo;
}

/**
 * When you walk straight into a wall but are nearly lined up with an opening beside it,
 * drift sideways toward the opening so you slip in instead of snagging on the corner.
 */
export function cornerNudge(me: Walker, axis: "x" | "y", dir: number, step: number): number {
  const other = axis === "x" ? me.y : me.x;
  const probe = 0.05 * dir;
  const [hw, hd, round] = halves(me);
  const free = (o: number) => (axis === "x" ? !blocked(me.x + probe, o, me.alt, me.x, me.y, hw, hd, round) : !blocked(o, me.y + probe, me.alt, me.x, me.y, hw, hd, round));
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
