/**
 * hoodCap.ts — the opening of a hood, laid on the ball of the head and cut to the half of the ball that faces the viewer.
 *
 * The opening is a small patch of the ball (a cap), given as a ring of directions from the head's middle. Seen from somewhere, only the part of it on the near
 * half shows, and that part is bounded by the ball's outline (its silhouette) where the cap runs round the back. `visibleCap` returns the ring of directions of
 * what shows: the cap's own edge where it is on the near half, joined across the silhouette where it goes round. (Pulling each hidden point onto the outline instead
 * sends a cap that is mostly behind the ball out across the whole disc.)
 */
import type { P3 } from "./rig3d";

const dot = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (v: P3): P3 => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

/**
 * The visible part of a cap: `dirs` its edge as a ring of unit directions, `away` the way the viewer looks (from the head's middle: where depth grows), `inside`
 * whether a direction is inside the cap (to pick which way round the outline the visible part is closed). All of it if all of it faces the viewer, none (an empty
 * list) if none does.
 */
export function visibleCap(dirs: readonly P3[], away: P3, inside: (d: P3) => boolean, arcSteps = 24): P3[] {
  const n = dirs.length, d = dirs.map(v => dot(v, away));
  if (d.every(x => x < 0)) return [...dirs];
  if (d.every(x => x >= 0)) return [];
  /** Where the edge between two directions, one on each side, crosses the outline. */
  const crossing = (i: number, j: number): P3 => {
    const t = d[i] / (d[i] - d[j]), a = dirs[i], b = dirs[j];
    return unit([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
  };
  // From where the edge comes onto the near half, round the part that shows, to where it goes off it.
  let k = 0;
  while (!(d[k] >= 0 && d[(k + 1) % n] < 0)) k++;
  const run: P3[] = [crossing(k, (k + 1) % n)];
  let i = (k + 1) % n;
  for (let guard = 0; guard < n && d[i] < 0; guard++) {
    run.push(dirs[i]);
    const j = (i + 1) % n;
    if (d[j] >= 0) { run.push(crossing(i, j)); break; }
    i = j;
  }
  // Closed along the outline, from where it goes off to where it comes on: the way round that is inside the cap.
  const e1 = unit(cross(away, Math.abs(away[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), e2 = cross(away, e1);
  const angle = (v: P3) => Math.atan2(dot(v, e2), dot(v, e1));
  const a0 = angle(run[run.length - 1]), a1 = angle(run[0]);
  const up = ((a1 - a0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI), down = up - 2 * Math.PI;
  const at = (a: number): P3 => [e1[0] * Math.cos(a) + e2[0] * Math.sin(a), e1[1] * Math.cos(a) + e2[1] * Math.sin(a), e1[2] * Math.cos(a) + e2[2] * Math.sin(a)];
  const delta = inside(at(a0 + up / 2)) === inside(at(a0 + down / 2)) ? (Math.abs(up) <= Math.abs(down) ? up : down) : inside(at(a0 + up / 2)) ? up : down;
  for (let s = 1; s < arcSteps; s++) run.push(at(a0 + (delta * s) / arcSteps));
  return run;
}
