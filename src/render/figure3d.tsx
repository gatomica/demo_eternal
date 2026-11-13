/**
 * figure3d.tsx — what every figure drawn from a 3D rig (rig3d.ts) shares: the drawing box its projected joints are put in, the bones
 * between them, the ribcage (a real solid in space, as the sleepwalkers and the waxed have), the weapon modelled in 3D in its hand, and the
 * depth sort that draws what is far first. `Waxed3D` and `Sleepwalker3D` are built from these.
 */
import { isValidElement, type ReactNode, type Ref } from "react";
import type { WeaponTier } from "../core/types";
import { type Cam, eyeSpace, facingVec, METERS_PER_UNIT as U, onScreen, right as rightOf, toCamera, type Vec } from "./camera";
import { type ArcCircle, type Joint, type P3, type placeRig, ribcageOf, type Rig3, type Seen, type swingArc, weaponFrame } from "./rig3d";
import { drawGear, type GearModel, type V3 } from "./gear3d";
import { GearShape } from "./GearShape";
import { HeldWeapon } from "./StickFigure";

/**
 * Whether two sets of props of a 3D figure draw the same picture, so it need not be worked out again (`memo`): every prop equal, or an object (a camera, a spot, a
 * box, the gear it wears) whose own fields are. The scene redraws every figure on every frame of a shot and on every change in the fight, and a figure that has not
 * moved is the same picture each time.
 */
export function sameDrawing(a: object, b: object): boolean {
  const x = a as Record<string, unknown>, y = b as Record<string, unknown>;
  // (no sets or spreads: this runs for every figure on every frame of a shot)
  let n = 0;
  for (const k in x) {
    n++;
    const p = x[k], q = y[k];
    if (p === q) continue;
    if (!p || !q || typeof p !== "object" || typeof q !== "object" || Array.isArray(p) || isValidElement(p) || isValidElement(q)) return false;
    const u = p as Record<string, unknown>, v = q as Record<string, unknown>;
    let m = 0;
    for (const f in u) { m++; if (u[f] !== v[f]) return false; }
    m -= Object.keys(v).length;
    if (m !== 0) return false;
  }
  return n === Object.keys(y).length;
}

/** One thing drawn, and how far from the camera it is (far first). */
export interface Part { key: string; depth: number; node: ReactNode }

/** The figure's box on the screen (the scene's `figureBox`): it draws into the same 100 × 120 units a flat figure does. */
export type Box = { x: number; y: number; w: number; h: number };

/** A placed rig, ready to draw into its box: screen points to box units, sizes by perspective, and the list of parts to sort. */
export function canvas3d(placed: ReturnType<typeof placeRig>, box: Box, opts: { unshaded?: (key: string) => boolean } = {}) {
  const { seen, see, origin } = placed;
  const ux = box.w / 100, uy = box.h / 120;
  // (To hundredths of a drawing unit: a figure is some thousand points a frame, and their digits are most of its markup, which the browser parses every frame.)
  const X = (p: Seen) => Math.round(((p.sx - box.x) / ux) * 100) / 100, Y = (p: Seen) => Math.round(((p.sy - box.y) / uy) * 100) / 100;
  /** A size there, relative to what it is at the figure's feet. */
  const scaleAt = (...ps: Seen[]) => ps.reduce((n, p) => n + p.ppm, 0) / ps.length / origin.ppm;
  const depthOf = (...ps: Seen[]) => ps.reduce((n, p) => n + p.depth, 0) / ps.length;
  // Anything farther than the middle of the body is in its shade.
  const mid = seen.pelvis.depth;
  const parts: Part[] = [];
  /**
   * A run of bones through these joints (or points already on the screen), `width` units thick at the figure's own distance. A limb or a wax
   * shell behind the middle of the body is in the far tone, unless `opts.unshaded` says that part never is.
   *
   * `cut`: which of its ends are cut across the limb instead of rounded, where it meets another run end to end (an arm and its glove): each given as
   * the point in space where it is cut and the way the limb runs there. A limb is a cylinder, so a cut end is the circle across it, an ellipse seen
   * from anywhere (as the end of a rod is in the gear viewer): the run stops square there and the ellipse is laid over its end, in its colour. Of the
   * two runs that meet there, the one nearer the viewer is drawn over the other (`meet`), so the line between them is the near half of that circle.
   */
  const bones = (key: string, js: (Joint | Seen)[], cls: string, width: number, extra = 0, cut?: { start?: Cut; end?: Cut }) => {
    const ps = js.map(j => (typeof j === "string" ? seen[j] : j));
    const depth = depthOf(...ps);
    const far = depth > mid + 0.02 && (cls.startsWith("fig-limb") || cls === "fig-wax-shell") && !opts.unshaded?.(key);
    const className = `${cls}${far ? " fig-far" : ""}`, strokeWidth = width * scaleAt(...ps);
    const line = (pts: Seen[], k: string, cap?: "butt") => <polyline key={k} points={pts.map(p => `${X(p)},${Y(p)}`).join(" ")} className={className} style={{ strokeWidth, strokeLinecap: cap }} />;
    /** A round end: a dot. A cut one: the circle across the limb there, as the ellipse it looks like (a dot squashed and turned to it). */
    const end = (p: Seen, c: Cut | undefined, k: string) => {
      if (!c) return line([p, p], k);
      const r = (strokeWidth / scaleAt(p) / 2) * U, ax = norm3(c.axis), [u, w] = across(ax);
      const onScreen = (v: P3): [number, number] => { const q = see([0, 1, 2].map(i => c.at[i] + v[i] * r) as unknown as P3); return [X(q) - X(p), Y(q) - Y(p)]; };
      const e = ellipseOf([onScreen(u), onScreen(w)]), x = X(p), y = Y(p);
      return <polyline key={k} points={`${x},${y} ${x},${y}`} className={className} style={{ strokeWidth: 2 * e.rx }} transform={`rotate(${e.angle} ${x} ${y}) translate(${x} ${y}) scale(1 ${e.rx > 1e-6 ? e.ry / e.rx : 1}) translate(${-x} ${-y})`} />;
    };
    const node = !cut ? line(ps, key) : (
      <g key={key} className={className}>
        {line(ps, "run", "butt")}
        {end(ps[0], cut.start, "start")}
        {end(ps[ps.length - 1], cut.end, "end")}
      </g>
    );
    parts.push({ key, depth: depth - extra, node });
  };
  /**
   * Two runs of a limb meeting end to end at a cut (`bones`' `cut`): the one whose end there is nearer the viewer is drawn over the other, as the
   * nearer half of a cylinder hides the cut face of the farther. `a` runs into the cut from `aFrom`, `b` out of it toward `bTo` (points in space).
   * Only the smaller (`b`, the glove, the boot) is moved in the order, just over or under the other.
   */
  const meet = (a: string, b: string, aFrom: P3, bTo: P3) => {
    const pa = parts.find(x => x.key === a), pb = parts.find(x => x.key === b);
    if (!pa || !pb) return;
    const bNearer = see(bTo).depth < see(aFrom).depth;
    if (bNearer && pb.depth >= pa.depth) pb.depth = pa.depth - 0.0001;
    if (!bNearer && pb.depth <= pa.depth) pb.depth = pa.depth + 0.0001;
  };
  /** A ball in space, `r` units across at the figure's own distance. */
  const ball = (key: string, at: P3, r: number, cls: string, extra = 0) => {
    const p = see(at);
    parts.push({ key, depth: p.depth - extra, node: <circle key={key} cx={X(p)} cy={Y(p)} r={r * scaleAt(p)} className={cls} /> });
  };
  /** Keeps `key` drawn under the parts `of` (joined to them, never over them, whichever way it is seen). */
  const behind = (key: string, ...of: string[]) => {
    const p = parts.find(x => x.key === key);
    if (p) p.depth = Math.max(p.depth, ...of.map(k => parts.find(x => x.key === k)?.depth ?? 0)) + 0.001;
  };
  return { ...placed, ux, uy, X, Y, scaleAt, depthOf, mid, parts, bones, ball, behind, meet };
}
export type Canvas3D = ReturnType<typeof canvas3d>;

/** Where a limb is cut across (`bones`): the point in space (body space), and the way the limb runs there. */
export interface Cut { at: P3; axis: P3 }

const norm3 = (v: P3): P3 => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
/** Two ways square to `n` (a unit way) and to each other. */
function across(n: P3): [P3, P3] {
  const helper: P3 = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = norm3([n[1] * helper[2] - n[2] * helper[1], n[2] * helper[0] - n[0] * helper[2], n[0] * helper[1] - n[1] * helper[0]]);
  return [u, [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]]];
}
/** The ellipse a circle looks like, from where two of its radii (square to each other) land on the screen: its half-sizes and its tilt (degrees). */
export function ellipseOf(axes: [number, number][]): { rx: number; ry: number; angle: number } {
  const sxx = axes.reduce((n, v) => n + v[0] * v[0], 0), syy = axes.reduce((n, v) => n + v[1] * v[1], 0), sxy = axes.reduce((n, v) => n + v[0] * v[1], 0);
  const mean = (sxx + syy) / 2, spread = Math.sqrt(((sxx - syy) / 2) ** 2 + sxy * sxy);
  return { rx: Math.sqrt(mean + spread), ry: Math.sqrt(Math.max(0, mean - spread)), angle: (Math.atan2(2 * sxy, sxx - syy) * 90) / Math.PI };
}

/**
 * The ribcage: a skinny ellipsoid (an oblate spheroid) standing along the spine, with two columns of rib moons lying on its front. It is a
 * real solid in space, so it turns and narrows with the body, it follows a bent spine, and the ribs on the half that faces away disappear.
 */
export function ribcagePart(c: Canvas3D, rig: Rig3, look: { cls?: string; ribs?: boolean; sternum?: string } = {}): Part {
  const { see, X, Y } = c;
  const rc = ribcageOf(rig);
  /** A point on its surface: `th` round it (0 = straight ahead of the body), `up` as a share of its half height (-1 to 1). */
  const at3 = (th: number, up: number, deep = 1): Seen => {
    const ring = Math.sqrt(Math.max(0, 1 - up * up));
    const a = rc.halfWidth * ring * Math.sin(th), b = rc.halfDepth * ring * Math.cos(th) * deep, h = rc.halfHeight * up;
    const p: P3 = [0, 1, 2].map(i => rc.centre[i] + rc.side[i] * a + rc.fwd[i] * b + rc.up[i] * h) as unknown as P3;
    return see(p);
  };
  const centre = see(rc.centre as P3);
  // An ellipsoid seen from anywhere has an ellipse for its outline: worked out from where its three axes land on the screen.
  const axisOnScreen = (v: readonly number[], len: number): [number, number] => {
    const e = see([0, 1, 2].map(i => rc.centre[i] + v[i] * len) as unknown as P3);
    return [X(e) - X(centre), Y(e) - Y(centre)];
  };
  const axes = [axisOnScreen(rc.side, rc.halfWidth), axisOnScreen(rc.fwd, rc.halfDepth), axisOnScreen(rc.up, rc.halfHeight)];
  const sxx = axes.reduce((n, v) => n + v[0] * v[0], 0), syy = axes.reduce((n, v) => n + v[1] * v[1], 0), sxy = axes.reduce((n, v) => n + v[0] * v[1], 0);
  const mean = (sxx + syy) / 2, spread = Math.sqrt(((sxx - syy) / 2) ** 2 + sxy * sxy);
  const outline = { rx: Math.sqrt(mean + spread), ry: Math.sqrt(Math.max(0, mean - spread)), angle: (Math.atan2(2 * sxy, sxx - syy) * 90) / Math.PI };
  const crescents: ReactNode[] = [];
  const COLUMNS: [number, number][] = [[0.1, 1.08], [-1.08, -0.1]]; // the radians of each half, either side of the breastbone
  for (const [lo, hi] of look.ribs === false ? [] : COLUMNS) {
    for (const row of [0.55, 0.05, -0.45]) {
      const steps = Array.from({ length: 13 }, (_, i) => lo + ((hi - lo) * i) / 12);
      // Only the part of the rib on the near side of the ribcage shows.
      const shown = steps.map((t, i) => ({ t, i, front: at3(t, row).depth <= centre.depth + 1e-4 })).filter(s => s.front);
      if (shown.length < 2) continue;
      const top = shown.map(s => at3(s.t, row));
      // A flat bowl: the lower edge sags in the middle and meets the upper at the ends.
      const low = shown.map(s => at3(s.t, row - (1.6 * U * Math.sin((Math.PI * s.i) / 12)) / rc.halfHeight, 0.92));
      const pts = [...top, ...low.reverse()].map(p => `${X(p)},${Y(p)}`).join(" ");
      crescents.push(<polygon key={`${row}:${lo}`} points={pts} className="fig-rib" />);
    }
  }
  // A breastplate's one indent (`sternum`, its class): a line down the middle of its front, from high on the chest to below the pecs, splitting them;
  // only what is on the near side shows.
  if (look.sternum) {
    const line = Array.from({ length: 9 }, (_, i) => 0.72 - (0.7 * i) / 8).map(up => at3(0, up)).filter(p => p.depth <= centre.depth + 1e-4);
    if (line.length >= 2) crescents.push(<polyline key="sternum" points={line.map(p => `${X(p)},${Y(p)}`).join(" ")} className={look.sternum} />);
  }
  return {
    key: "ribcage", depth: centre.depth - 0.004,
    node: <g key="ribcage"><ellipse cx={X(centre)} cy={Y(centre)} rx={outline.rx} ry={outline.ry} transform={`rotate(${outline.angle} ${X(centre)} ${Y(centre)})`} className={look.cls ?? "fig-ribcage"} />{crescents}</g>,
  };
}

/**
 * A solid ellipsoid in space (like the ribcage, a body part that is wider one way than the other), drawn as the ellipse its outline is from where the
 * viewer is: round at both ends, turning and narrowing with the body. `side`, `fwd` and `up` are its three axes (unit ways, in body space) and `halfW`,
 * `halfD`, `halfH` its half sizes along them (meters).
 */
export function ellipsoidPart(c: Canvas3D, key: string, centre: P3, side: P3, fwd: P3, up: P3, halfW: number, halfD: number, halfH: number, cls: string): Part {
  const { see, X, Y } = c;
  const mid = see(centre);
  const onScreen = (v: readonly number[], len: number): [number, number] => {
    const e = see([0, 1, 2].map(i => centre[i] + v[i] * len) as unknown as P3);
    return [X(e) - X(mid), Y(e) - Y(mid)];
  };
  const o = ellipseOf([onScreen(side, halfW), onScreen(fwd, halfD), onScreen(up, halfH)]);
  return { key, depth: mid.depth, node: <ellipse key={key} cx={X(mid)} cy={Y(mid)} rx={o.rx} ry={o.ry} transform={`rotate(${o.angle} ${X(mid)} ${Y(mid)})`} className={cls} /> };
}

/** A swing's arch (`swingArc`), drawn as it fades when the strike ends (`fig-trail`), in front of the figure. */
export function arcPart(c: Canvas3D, arc: { circle: ArcCircle }): Part {
  return trailPart(c, "swing", arc.circle);
}

/**
 * A trail along a stretch of a circle in space (`ArcCircle`), drawn as the sprites draw theirs (`StrikeTrail`): a crescent of two true arcs, not points
 * joined up, so it costs next to nothing to draw. The circle is an ellipse on the screen (its two ways in its plane, seen from here, are two of its half
 * diameters): its outer edge is that ellipse's arc, a line across its blunt end as thick as the trail is there, and its inner edge a slightly smaller arc
 * back to where it starts, a point. It fades as it is drawn (`fig-trail`), in front of the figure.
 */
export function trailPart(c: Canvas3D, key: string, arc: ArcCircle, className = "fig-trail"): Part {
  const { see, X, Y } = c, { centre: C, e1, e2, radius: r, a0, a1, thick } = arc;
  const along = (v: P3, k: number): P3 => [C[0] + v[0] * k, C[1] + v[1] * k, C[2] + v[2] * k];
  const c0 = see(C), pe = see(along(e1, r)), qe = see(along(e2, r));
  const cx = X(c0), cy = Y(c0), p = [X(pe) - cx, Y(pe) - cy], q = [X(qe) - cx, Y(qe) - cy];
  // (the ellipse's own axes, from the two half diameters)
  const s00 = p[0] * p[0] + q[0] * q[0], s11 = p[1] * p[1] + q[1] * q[1], s01 = p[0] * p[1] + q[0] * q[1];
  const spread = Math.sqrt(((s00 - s11) / 2) ** 2 + s01 * s01), rx = Math.sqrt((s00 + s11) / 2 + spread), ry = Math.sqrt(Math.max(1e-6, (s00 + s11) / 2 - spread));
  const tilt = (Math.atan2(2 * s01, s00 - s11) / 2) * (180 / Math.PI);
  const sweep = (a1 > a0) === (p[0] * q[1] - p[1] * q[0] > 0) ? 1 : 0, big = Math.abs(a1 - a0) > Math.PI ? 1 : 0, k = Math.min(0.9, thick / r);
  // (its ends where they really are, seen in perspective: the arcs run between them, the ellipse only giving their bend)
  const onCircle = (a: number, kk = 1): [number, number] => { const q2 = see([0, 1, 2].map(i => C[i] + (e1[i] * Math.cos(a) + e2[i] * Math.sin(a)) * r * kk) as unknown as P3); return [X(q2), Y(q2)]; };
  const from = onCircle(a0), to = onCircle(a1), innerEnd = onCircle(a1, 1 - k), f = (v: number) => Math.round(v * 100) / 100;
  const d = `M${f(from[0])} ${f(from[1])} A${f(rx)} ${f(ry)} ${f(tilt)} ${big} ${sweep} ${f(to[0])} ${f(to[1])} L${f(innerEnd[0])} ${f(innerEnd[1])} A${f(rx * (1 - k / 2))} ${f(ry * (1 - k / 2))} ${f(tilt)} ${big} ${1 - sweep} ${f(from[0])} ${f(from[1])} Z`;
  return { key, depth: Math.min(c0.depth, pe.depth, qe.depth) - 0.05, node: <path key={key} d={d} className={className} /> };
}

/**
 * The weapon in the hand, held along `held` (from the hand, the way it points): its 3D model (gear3d.ts) turned to the hand, its broad face
 * leaning toward `face` (or as upright as it can be), gripped `slide` units up from the end of its handle; or, with no model, the flat sprite
 * laid along that line, as long as it looks from where we are. In a swing (`swing`: its arch, and whether this pose is its wind-up, 0, or its strike, 1)
 * a weapon with an edge side (`edge` on its model) is turned so that side leads, lying in the arch's plane: facing the way the far end is about to go,
 * or was going as it landed.
 */
export function weaponParts(c: Canvas3D, o: {
  weapon: WeaponTier; model?: GearModel; reach: number; held: { hand: P3; axis: P3; tip: P3 }; face?: P3; slide?: number;
  swing?: { arc: ReturnType<typeof swingArc>; at: 0 | 1 };
  /** Where the wielder's body is (its middle, body space): out of a swing, the edge side is turned away from it, so it never faces the wielder. */
  wielder?: P3;
  /** Where the wielder stands on the floor, the yaw it faces, and the camera and screen it is seen on (as its rig was placed). */
  at: Vec; yaw: number; cam: Cam; w: number; h: number; scale: number; box: Box; eternalFlash?: string;
}): Part[] {
  const { see, X, Y, ux, uy, origin, scaleAt } = c;
  const { model, held, slide = 0, at, yaw, cam, w, h, scale, box, eternalFlash } = o;
  const out: Part[] = [];
  if (model) {
    // The model is drawn in its own space (x along the weapon from the grip, y across its broad face, z its thickness) turned to the hand.
    // Body space is a mirror of the weapon's, so its third axis is the cross product turned round (`weaponFrame`).
    const ax = held.axis;
    // (in a swing, its edge side leads; out of one, it faces away from the wielder, the side it swings with: never toward them)
    const { ay, az } = edgeFrame(ax, model.edge, o.swing) ?? awayFrame(ax, model.edge, held, o.wielder) ?? weaponFrame(ax, o.face);
    const bodyF = facingVec(yaw), bodyR = rightOf(yaw), camR = rightOf(cam.yaw), camF = facingVec(cam.yaw);
    // View space (as in the Gear viewer): x to the eye's right, y down, z away along where it looks, in figure units from the eye, through the same
    // camera as the rig (its eye height and tilt, `eyeSpace`); the lens (`onScreen`) puts it on the screen.
    const feet = toCamera(cam, at);
    const view = (q: V3): V3 => {
      const m = [0, 1, 2].map(i => held.hand[i] + (ax[i] * (q[0] - slide) + ay[i] * q[1] + az[i] * q[2]) * U);
      const fx = (bodyR.x * m[0] + bodyF.x * m[2]) * scale, fz = (bodyR.z * m[0] + bodyF.z * m[2]) * scale;
      const e = eyeSpace(cam, feet.u + fx * camR.x + fz * camR.z, m[1] * scale, feet.v + fx * camF.x + fz * camF.z);
      return [e.u / U, -e.up / U, e.ahead / U];
    };
    const lens = (v: V3) => onScreen({ u: v[0] * U, up: -v[1] * U, ahead: v[2] * U }, w, h);
    const project = (v: V3): readonly [number, number] => { const l = lens(v); return [+((l.sx - box.x) / ux).toFixed(2), +((l.sy - box.y) / uy).toFixed(2)]; };
    // (a figure unit is a box unit at the figure's feet, and smaller the farther it is)
    const drawn = drawGear(model.prims, { view, project, scale: v => (origin.depth / Math.max(v[2] * U, 0.05)) * scale });
    const shapes = drawn.map((d, i) => <GearShape key={i} d={d} />);
    const nearest = (drawn.length ? Math.min(...drawn.map(d => d.depth)) * U : origin.depth);
    drawn.forEach((d, i) => out.push({ key: `weapon-${i}`, depth: d.depth * U - 0.005, node: shapes[i] }));
    if (eternalFlash) {
      out.push({ key: "weapon-flash", depth: nearest - 0.02, node: <g key={eternalFlash} className={`fig-eternal-flash ${eternalFlash.startsWith("death|") ? "is-death" : ""}`} aria-hidden="true">{shapes}</g> });
    }
  } else {
    const grip = see(held.hand), tip = see(held.tip);
    const dx = X(tip) - X(grip), dy = Y(tip) - Y(grip);
    out.push({
      key: "weapon", depth: grip.depth - 0.02,
      node: (
        <g key="weapon" transform={`translate(${X(grip)} ${Y(grip)}) rotate(${(Math.atan2(dy, dx) * 180) / Math.PI}) scale(${Math.hypot(dx, dy) / o.reach} ${scaleAt(grip)})`}>
          <HeldWeapon tier={o.weapon} flash={eternalFlash} />
        </g>
      ),
    });
  }
  return out;
}

/**
 * The frame that turns a weapon's edge side (`edge`, in its own y and z) to lead through a swing: the edge pointing in the arch's plane, square to the
 * weapon, the way its far end moves there (as the arch starts, for the wind-up; as it ends, for the strike). Undefined if it has no edge, there is no
 * swing, or the weapon points along the way it moves (no side leads).
 */
function edgeFrame(ax: P3, edge: V3 | undefined, swing: { arc: ReturnType<typeof swingArc>; at: 0 | 1 } | undefined): { ay: P3; az: P3 } | undefined {
  if (!edge || !swing) return undefined;
  const { arc, at } = swing, a = at === 1 ? arc.outer(0.97) : arc.outer(0), b = at === 1 ? arc.outer(1) : arc.outer(0.03);
  const moving: P3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const dot = (u: readonly number[], v: readonly number[]) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const len = (v: P3) => Math.hypot(...v);
  // In the arch's plane, square to the weapon; failing that (the weapon across the plane), the way it moves, square to the weapon.
  const n = arc.normal;
  let e: P3 = [n[1] * ax[2] - n[2] * ax[1], n[2] * ax[0] - n[0] * ax[2], n[0] * ax[1] - n[1] * ax[0]];
  if (len(e) < 0.2) { const k = dot(moving, ax); e = [moving[0] - ax[0] * k, moving[1] - ax[1] * k, moving[2] - ax[2] * k]; }
  if (len(e) < 1e-6) return undefined;
  if (dot(e, moving) < 0) e = [-e[0], -e[1], -e[2]];
  return frameWithEdge(ax, e, edge);
}

/**
 * Out of a swing: the frame that turns a weapon's edge side away from its wielder: the edge pointing from the wielder's middle out to the weapon's,
 * square to the weapon. Undefined if it has no edge, no wielder is given, or the weapon points straight at it or away (no side faces away).
 */
function awayFrame(ax: P3, edge: V3 | undefined, held: { hand: P3; tip: P3 }, wielder: P3 | undefined): { ay: P3; az: P3 } | undefined {
  if (!edge || !wielder) return undefined;
  const m: P3 = [(held.hand[0] + held.tip[0]) / 2 - wielder[0], (held.hand[1] + held.tip[1]) / 2 - wielder[1], (held.hand[2] + held.tip[2]) / 2 - wielder[2]];
  const k = m[0] * ax[0] + m[1] * ax[1] + m[2] * ax[2], e: P3 = [m[0] - ax[0] * k, m[1] - ax[1] * k, m[2] - ax[2] * k];
  if (Math.hypot(...e) < 1e-4) return undefined;
  return frameWithEdge(ax, e, edge);
}

/** The model's frame with its edge side (`edge`, in its own y and z) turned onto the way `e` (square to the weapon, any length). */
function frameWithEdge(ax: P3, e: P3, edge: V3): { ay: P3; az: P3 } {
  const el = Math.hypot(...e) || 1, ay0: P3 = [e[0] / el, e[1] / el, e[2] / el];
  // (the model's third axis as `weaponFrame` makes it: body space is a mirror of the weapon's)
  const az0: P3 = [-(ax[1] * ay0[2] - ax[2] * ay0[1]), -(ax[2] * ay0[0] - ax[0] * ay0[2]), -(ax[0] * ay0[1] - ax[1] * ay0[0])];
  // Turned round the weapon so the model's edge side, not its y, lands on that way.
  const gl = Math.hypot(edge[1], edge[2]) || 1, c = edge[1] / gl, sn = edge[2] / gl;
  return {
    ay: [c * ay0[0] - sn * az0[0], c * ay0[1] - sn * az0[1], c * ay0[2] - sn * az0[2]],
    az: [sn * ay0[0] + c * az0[0], sn * ay0[1] + c * az0[1], sn * ay0[2] + c * az0[2]],
  };
}

/** The figure's drawing: every part, far first. (Its shadow is the scene's, a shade disc on the floor under it.) */
export function Figure3DSvg({ parts, title, className, rootRef }: { parts: Part[]; title?: string; className?: string; rootRef?: Ref<SVGSVGElement> }) {
  const sorted = [...parts].sort((a, b) => b.depth - a.depth);
  return (
    <svg ref={rootRef} viewBox="0 0 100 120" className={`figure figure-front${className ? ` ${className}` : ""}`} role="img" aria-label={title}>
      {title && <title>{title}</title>}
      {sorted.map(p => p.node)}
    </svg>
  );
}
