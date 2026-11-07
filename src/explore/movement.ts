/**
 * movement.ts — walking: bumping into walls, sliding along them, stepping up and dropping down.
 */
import { ACCEL, CORNER_ASSIST, HALF_D, HALF_W, STEP_TOLERANCE } from "./tuning";
import { barsAt, boxDiagDepth, boxOnDiagFloor, boxTouchesDiagFloor, type Dir, DIAG, diagSide, FLOOR, isHoleDiag, isRamp, LADDER, onDiagFloor, LEVELS, rampAt, rampHeight, slopeAt, slopeRise, tileAt, WALL } from "./world";

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
    // Bars across a tile: it is shut to anyone at its height (they are seen through, never walked through).
    if (barsAt(z, tx, ty) && z <= alt + 1e-3 && alt < z + 1) return null;
    if (t === WALL && z <= alt + 1e-3) wall = z;
    if (t === FLOOR) { const slope = slopeAt(z, tx, ty); hgt = slope ? z + slopeRise(slope, px, py) : z; }
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
    if (hgt !== null && hgt > alt + STEP_TOLERANCE) {
      // A stair (or the tilt beside diagonal stairs) too high to step onto is solid from its top end as from its sides, as long as you are at its height: else you would walk into its column and drop through to whatever lies below.
      if ((isRamp(t) || (t === DIAG && slopeAt(z, tx, ty))) && t !== LADDER && z <= alt + 1e-3) wall = Math.max(wall, z);
      continue;
    }
    if (hgt === null) continue;
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
 * Whether moving your footprint from (fromX, fromY) to (x, y) gets it no deeper into the wall half of the diagonal tile (tx, ty) than it already is
 * (clear of it stays clear). False unless the footprint really is in a diagonal wall there at your height.
 */
function noDeeperInDiagonals(tx: number, ty: number, x: number, y: number, fromX: number, fromY: number, hw: number, hd: number, alt: number) {
  let any = false;
  for (let z = 0; z < LEVELS; z++) {
    if (tileAt(z, tx, ty) !== DIAG || z > alt + 1e-3 || alt - z > 1 - 1e-3 || isHoleDiag(z, tx, ty)) continue;
    const before = boxDiagDepth(z, tx, ty, fromX - hw, fromY - hd, fromX + hw, fromY + hd);
    if (before >= -1e-6) continue; // (not in it: the usual rules say what it may do)
    any = true;
    const after = boxDiagDepth(z, tx, ty, x - hw, y - hd, x + hw, y + hd);
    if (after < before - 1e-6) return false;
  }
  return any;
}

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
    // (A diagonal wall always counts: you can stand beside it, never in it. But a footprint that has come to be in one, dropped there from above,
    // may always move so as to get no deeper into it: out of it, or along it.)
    if (overlaps(fromX, fromY, tx, ty, hw, hd) && (!hasDiagonal(tx, ty) || noDeeperInDiagonals(tx, ty, x, y, fromX, fromY, hw, hd, alt))) continue;
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

/* ============================================================
 * Diagonal walls: gliding along them, and getting out of them
 * ============================================================ */

/** Which way is out of the wall of each kind of diagonal tile (a unit vector toward its floor half), by `diagSide`. */
const DIAG_OUT: [number, number][] = [[-Math.SQRT1_2, -Math.SQRT1_2], [Math.SQRT1_2, -Math.SQRT1_2], [-Math.SQRT1_2, Math.SQRT1_2], [Math.SQRT1_2, Math.SQRT1_2]];

/**
 * The diagonal walls a walker at (x, y) is touching, or within `margin` tiles of, that refuse a footprint at `at`: for each, the way out of it
 * (a unit vector) and how deep the footprint is in it (negative: inside). Only walls at your height count; the open rims of holes are no walls.
 */
function diagonalWallsNear(me: Walker, margin: number, at: [number, number] = [me.x, me.y]): { out: [number, number]; depth: number; tx: number; ty: number; z: number }[] {
  const [hw, hd] = halves(me);
  const found: { out: [number, number]; depth: number; tx: number; ty: number; z: number }[] = [];
  const x0 = me.x - hw - margin, x1 = me.x + hw + margin, y0 = me.y - hd - margin, y1 = me.y + hd + margin;
  for (let ty = Math.floor(y0); ty <= Math.floor(y1); ty++) for (let tx = Math.floor(x0); tx <= Math.floor(x1); tx++) {
    for (let z = 0; z < LEVELS; z++) {
      if (tileAt(z, tx, ty) !== DIAG || z > me.alt + 1e-3 || me.alt - z > 1 - 1e-3 || isHoleDiag(z, tx, ty)) continue;
      const depth = boxDiagDepth(z, tx, ty, me.x - hw, me.y - hd, me.x + hw, me.y + hd);
      if (boxDiagDepth(z, tx, ty, x0, y0, x1, y1) >= 0) continue;
      // (Only if the tile really refuses a footprint at `at`: a floor above it, as at the head of a stair, can cover the wall half.)
      if (surfaceNear(tx, ty, at[0], at[1], me.alt, true, hw, hd)) continue;
      found.push({ out: DIAG_OUT[diagSide(z, tx, ty)], depth, tx, ty, z });
    }
  }
  return found;
}

/** Whether the walker's footprint, moved to (x, y), would push into anything it can't stand on. */
const blockedAt = (me: Walker, x: number, y: number) => {
  const [hw, hd, round] = halves(me);
  return blocked(x, y, me.alt, me.x, me.y, hw, hd, round);
};

/**
 * Moves the walker by (dx, dy) in one go, as far as it can (a straight line, stopping at the first thing in the way): along a diagonal wall that
 * is the wall's own direction, which two moves along the axes cannot be.
 */
function moveAlong(me: Walker, dx: number, dy: number) {
  if (!blockedAt(me, me.x + dx, me.y + dy)) { me.x += dx; me.y += dy; return; }
  let lo = 0, hi = 1;
  for (let i = 0; i < 10; i++) {
    const mid = (lo + hi) / 2;
    if (blockedAt(me, me.x + dx * mid, me.y + dy * mid)) hi = mid; else lo = mid;
  }
  me.x += dx * lo;
  me.y += dy * lo;
}

/**
 * Gets a walker out of the wall half of a diagonal tile it has come to stand in (dropped beside it from above, say): pushed straight out, a little at a
 * time. Otherwise every step is refused, for the footprint stays in the wall however it moves.
 */
export function unstick(me: Walker) {
  for (let pass = 0; pass < 3; pass++) {
    const inside = diagonalWallsNear(me, 0).filter(w => w.depth < -1e-4).sort((a, b) => a.depth - b.depth)[0];
    if (!inside) return;
    // (Depth changes by the square root of two for each tile moved along the way out.)
    const push = Math.min(0.12, -inside.depth * Math.SQRT1_2 + 1e-3);
    const nx = me.x + inside.out[0] * push, ny = me.y + inside.out[1] * push;
    // (The way out may lead into another wall: then wait, or try the way along.)
    if (!blockedAt(me, nx, ny)) { me.x = nx; me.y = ny; continue; }
    const along: [number, number] = [-inside.out[1], inside.out[0]];
    let moved = false;
    for (const sign of [1, -1]) {
      const ax = me.x + (inside.out[0] * 0.5 + along[0] * sign * 0.5) * push, ay = me.y + (inside.out[1] * 0.5 + along[1] * sign * 0.5) * push;
      if (!blockedAt(me, ax, ay)) { me.x = ax; me.y = ay; moved = true; break; }
    }
    // Wedged between two walls: pushed out anyway, as long as the feet land on something (a wall's edge is no place to be stuck for good).
    if (!moved && surfaceNear(Math.floor(nx), Math.floor(ny), nx, ny, me.alt)) { me.x = nx; me.y = ny; }
  }
}

/**
 * One step of walking: eases toward the speed the held keys ask for (`ix`, `iy`: -1, 0 or 1; diagonals are as fast as straight lines), then moves,
 * one axis at a time so you slide along straight walls. What a diagonal wall stops, you glide along instead: the part of your motion along the wall
 * is kept, and your speed along it with it.
 */
export function walkStep(me: Walker, ix: number, iy: number, dt: number, top: number) {
  unstick(me);
  const startX = me.x, startY = me.y;
  const len = Math.hypot(ix, iy) || 1;
  const k = 1 - Math.exp(-ACCEL * dt);
  me.vx += ((ix / len) * top - me.vx) * k;
  me.vy += ((iy / len) * top - me.vy) * k;
  if (!ix && Math.abs(me.vx) < 0.01) me.vx = 0;
  if (!iy && Math.abs(me.vy) < 0.01) me.vy = 0;
  const vx = me.vx, vy = me.vy;

  // Move one axis at a time, so you slide along walls instead of sticking to them.
  const wantX = vx * dt, wantY = vy * dt;
  me.x = slide(me, "x", wantX);
  if (Math.abs(me.x - startX) < Math.abs(wantX) * 0.5) {
    me.vx = 0;
    if (ix && !iy) me.y = slide(me, "y", cornerNudge(me, "x", ix, top * dt));
  }
  me.y = slide(me, "y", wantY);
  if (Math.abs(me.y - startY) < Math.abs(wantY) * 0.5) {
    me.vy = 0;
    if (iy && !ix) me.x = slide(me, "x", cornerNudge(me, "y", iy, top * dt));
  }

  // What was lost to a diagonal wall: the part of it along the wall is walked on, in a line.
  const lostX = wantX - (me.x - startX), lostY = wantY - (me.y - startY);
  if (Math.hypot(lostX, lostY) < 1e-6) return;
  const walls = diagonalWallsNear(me, 0.06, [startX + wantX, startY + wantY]).filter(w => lostX * w.out[0] + lostY * w.out[1] < -1e-6);
  if (!walls.length) return;
  // (With two walls at once, a corner, the one it is deepest in is the one to follow.)
  const wall = walls.sort((a, b) => a.depth - b.depth)[0];
  const tx = -wall.out[1], ty = wall.out[0];
  const along = lostX * tx + lostY * ty;
  if (Math.abs(along) < 1e-6) return;
  moveAlong(me, along * tx, along * ty);
  // Your speed into the wall is gone; your speed along it stays.
  const sv = vx * tx + vy * ty;
  me.vx = sv * tx;
  me.vy = sv * ty;
}
