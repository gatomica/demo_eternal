/**
 * geom.ts — small 2D helpers for drawing figures (points in a figure's 100 × 120 box).
 */

export type Pt = readonly [number, number];

/** A polyline's points through these joints. */
export const limb = (...pts: Pt[]) => pts.map(p => p.join(",")).join(" ");

/** `a` moved by `b` times `k`. */
export const add = (a: Pt, b: Pt, k = 1): Pt => [a[0] + b[0] * k, a[1] + b[1] * k];

/** The point `t` of the way from `a` to `b`. */
export const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
