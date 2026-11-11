/**
 * Warden3D.tsx — the Penitent Warden drawn from a skeleton in 3D space, as the Sleepwalker and the Waxed are (the shared pieces are in figure3d.tsx):
 * his joints placed on the combat scene's floor, facing a way, projected through the scene's camera and connected far to near.
 *
 * His poses are the flat ones' limbs lifted into space, but how his hips and shoulders are turned comes from the robe's opening and his wax shoulder
 * (warden/pose3d.ts), not from the flat poses' camera tricks. FIRST PASS: the hood and beak, the wax candle arm with its flame, the flail in his hand and
 * bare legs; the trails the flat figure draws (spins, swings, bursts) are still to be done in 3D.
 *
 * The robe was removed from this drawing (it is to be modelled again, in parts, from scratch); only the fallen heap (`dead`) still draws a cloak.
 */
import { memo, type ReactNode, useContext, useId } from "react";
import { type Cam, METERS_PER_UNIT as U, type Vec } from "./camera";
import { DebugLimbsContext } from "./debugLimbs";
import { visibleCap } from "./hoodCap";
import { canvas3d, ellipsoidPart, Figure3DSvg, sameDrawing } from "./figure3d";
import type { PoseName } from "./poses";
import { type P3, ribcageOf } from "./rig3d";
import { FlailFire, type CandleArm } from "../warden/skeleton";
import { Flame, FlailHead } from "../warden/parts";
import { LittleFlame } from "./LittleFlame";
import { flail3, placeWarden } from "../warden/pose3d";

/** His hood's round and the thickness of his limbs (figure units, before perspective). */
/** The hood's opening: its hem, pulled down over his eyes, hangs this far below where he looks at the front (radians) and this far below the level of his head at the back of his neck; his face's size and its two eyes (how far either side of where he looks, radians, and their size). */
const BROW = 0.05, NAPE = 1.2, HEAD_R = 7.5, EYE_APART = 0.42, EYE_R = 1.8, BEAK_R = 5.2, BEAK_LEN = 8.5, BEAK_DOWN = 0.5;
/** Her ribcage, one smooth egg: how far its top is tipped back and its bottom forward (radians), how wide it is across and how deep front to back (shares of the usual ribcage's), and how far its middle is moved forward (a share of that depth) and up (a share of the ribcage's half height; the fullness sits higher on the chest). */
const RIB_TILT = 0.25, RIB_DEPTH = 1.3, RIB_FORWARD = 0.2, RIB_RAISE = 0.12, RIB_WIDTH = 1;
/** How much wider (and deeper) its bottom is than its top: the egg's section at the bottom end of its axis is this much bigger than the plain ellipsoid's, and as much smaller at the top (a share). */
const RIB_EGG = 0.3;
/** Her pelvis, an egg leaned the other way (its lower half as `PELVIS_TILT` and `PELVIS_HEIGHT` say; its upper half bends at the middle, leaning less, `PELVIS_TOP_TILT`, and reaching higher, `PELVIS_TOP_HEIGHT`, up into the bust) (its top forward, its bottom back, radians): its width as a share of what reaches both hip joints (its section at the pelvis is as wide as the hips are, and a leg's thickness more), its depth as a share of the ribcage's, its half height as a share of the spine's length, and where its middle is along the spine (a share of it up from the pelvis), and how much wider its bottom is than its top, front to back and (less, so its top is wide) side to side. */
const PELVIS_TILT = 0.3, PELVIS_TOP_TILT = 0.22, PELVIS_WIDTH = 1, PELVIS_DEPTH = 1.2, PELVIS_HEIGHT = 0.75, PELVIS_TOP_HEIGHT = 1, PELVIS_MIDDLE = 0.5, PELVIS_EGG = 0.3, PELVIS_EGG_W = 0.1;
/** How thick her thigh is at the hip (figure units); it thins to a limb's thickness at the knee. */
const THIGH_R = 4;
/** Her robe's top: how much bigger than the ribcage it stands (a share), and its opening on her right, a round hole like the hood's laid on the egg: its middle's height
 *  (-1 the bottom of the ribcage's egg, 1 its top) and angle round (0 her side, π/2 her front, so negative is behind her side), and how far it reaches each way (the height
 *  share, and radians round): from the right of her neck, down past the armpit, to the side of her bust, and round to the middle of her back. */
const ROBE_GAP = 0.08, OPEN_U = 0.32, OPEN_RU = 0.65, OPEN_A = -0.45, OPEN_RA = 1.1;
/** His neck's cone: its radius at the neck and where it meets the hood (figure units), and how high the band that closes its open front is (a share of the cone's height). */
const CONE_BASE = 4, CONE_TOP = 7.5, CONE_BAND = 0.5, NECK_RAISE = 3;
/** The opening in the robe's bottom for her left leg: a plane cutting through the pelvis egg, square to this way (her side, up, front: toward her left and down) and standing this share of the egg's reach out that way, so what is beyond it is open. */
const PELVIS_CUT = { n: [-1, -0.45, 0] as [number, number, number], at: 0.45 };
/** Her belt of wax: where it is along the pelvis egg's axis (-1 the bottom, 0 the middle), how tall it is either side of that (the same measure), and how far it stands out of the egg (a share). */
const BELT_AT = -0.15, BELT_HALF = 0.1, BELT_OUT = 1.05;
/** Her skirt: how far above her feet its hem is (figure units) and how much wider it is at the hem than at the belt (a share). */
const SKIRT_HEM = 4, SKIRT_FLARE = 0.18;
const HOOD_R = 8.9, WAX_SHOULDER = 3.2, WAX_ELBOW = 4.4, FIST = 5.4, LIMB = 5;

/** An egg in space: its middle, its three axes, its half sizes along them, and how much wider its bottom is than its top. */
interface Egg { middle: P3; side: P3; up: P3; fwd: P3; halfW: number; halfD: number; halfH: number; taper: number;
  /** How much wider its bottom is than its top across (side to side), if that is not the same as front to back. */
  taperW?: number;
  /** A different axis for its upper half (above its middle): the egg then bends there, its top reaching on along its own way and height. */
  upper?: { up: P3; fwd: P3; halfH: number } }

type Box = { x: number; y: number; w: number; h: number };

export interface Warden3DProps {
  pose: PoseName;
  /** His candle arm: lit, out or scorched. */
  arm?: CandleArm;
  /** Phase two's look: black wax, burning inside (the `wd-phase2` styles). */
  phase2Look?: boolean;
  /** His flail is on fire. */
  flailFire?: boolean;
  /** He has fallen: the cloak lies in a heap. */
  dead?: boolean;
  /** Fallen in his second form: the wax is burnt black. */
  charred?: boolean;
  title?: string;
  cam: Cam;
  /** Where he stands on the floor, and the yaw he faces (before his hips turn it). */
  at: Vec;
  yaw: number;
  scale?: number;
  w: number;
  h: number;
  box: Box;
}

const dot = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (v: P3): P3 => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const plus = (a: P3, b: P3, k = 1): P3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const minus = (a: P3, b: P3): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mix = (a: P3, b: P3, t: number): P3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const UP: P3 = [0, 1, 0];

/** A closed outline through these points as a smooth curve: each point is a corner the curve bends round, running from the middle of one edge to the middle of the next. */
function smooth(ps: [number, number][]): string {
  const n = ps.length, m = (i: number): [number, number] => { const a = ps[i % n], b = ps[(i + 1) % n]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
  const f = (v: number) => Math.round(v * 100) / 100, start = m(n - 1);
  return `M${f(start[0])},${f(start[1])}${ps.map((p, i) => { const e = m(i); return `Q${f(p[0])},${f(p[1])} ${f(e[0])},${f(e[1])}`; }).join("")}z`;
}

/** The outline of a set of points on the screen (a convex hull: the silhouette of a cone is its tip and its base's outline together). */
function hull(ps: [number, number][]): [number, number][] {
  const pts = [...ps].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const turn = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [], upper: [number, number][] = [];
  for (const p of pts) { while (lower.length >= 2 && turn(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (const p of [...pts].reverse()) { while (upper.length >= 2 && turn(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function Warden3DView({ pose, arm = "lit", phase2Look, flailFire, dead, charred, title, cam, at, yaw, scale = 1, w, h, box }: Warden3DProps) {
  const clip = `wd3${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const debug = useContext(DebugLimbsContext);
  const { wr, placed } = placeWarden(pose, at, yaw, cam, w, h, scale);
  // (his right arm and her left leg are always the one white: the robe's opening shows them, and with the robe on nothing white is beside them for the far-limb shade
  // to tell them from. What stays under the robe, her right leg, is always in the shade.)
  const c = canvas3d(placed, box, { unshaded: key => key === "R-arm" || key === "legL" || key === "neck" });
  const { seen, see, X, Y, scaleAt, depthOf, parts, bones, ball, behind } = c;
  const j = wr.rig.joints;
  const className = `wd-figure${phase2Look ? " wd-phase2" : ""}${flailFire ? " wd-flaming" : ""}${dead && charred ? " is-charred" : ""}`;
  const pts = (ps: P3[]) => ps.map(p => { const q = see(p); return `${X(q)},${Y(q)}`; }).join(" ");
  /** The way the viewer looks at a point, in body space: where depth grows fastest. */
  const look3At = (p: P3): P3 => {
    const d0 = see(p).depth;
    return unit([0, 1, 2].map(i => see(plus(p, [0, 1, 2].map(k => (k === i ? 0.01 : 0)) as unknown as P3)).depth - d0) as unknown as P3);
  };

  if (dead) {
    // Fallen: the cloak lies in a heap on the floor, the hood on it, the flail dropped beside it.
    const lump = (r: number, k: number, y: number): P3[] => Array.from({ length: 28 }, (_, i) => {
      const a = (i / 28) * Math.PI * 2, rr = (r + 2.2 * Math.sin(3 * a + 1) + 1.2 * Math.sin(5 * a)) * U;
      return [Math.cos(a) * rr * 1.15 * k, y, Math.sin(a) * rr * 0.9 * k];
    });
    const centre = see([0, 0, 0]);
    parts.push({ key: "heap", depth: centre.depth + 1, node: <polygon key="heap" points={pts(lump(15, 1, 0.01 * U))} className="fig-cloak" /> });
    parts.push({ key: "heap-fold", depth: centre.depth, node: <polygon key="heap-fold" points={pts(lump(9, 1, 0))} className="fig-cloak fig-cloak-shade" /> });
    parts.push(ellipsoidPart(c, "hump", [0, 3.5 * U, 0], [1, 0, 0], [0, 0, 1], UP, 10 * U, 8 * U, 4.5 * U, "fig-cloak"));
    parts.push({ key: "pool", depth: centre.depth + 0.5, node: <polygon key="pool" points={pts(lump(6, 1, 0.02 * U).map(p => [p[0] + 14 * U, p[1], p[2] + 9 * U] as P3))} className="fig-wax-puddle" /> });
    ball("dead-hood", [7 * U, 5 * U, 4 * U], HOOD_R * 0.9, "fig-hood");
    bones("dead-handle", [see([-16 * U, 1.5 * U, -10 * U]), see([-30 * U, 1.5 * U, -16 * U])], "fig-flail-handle", 2.6);
    const hd = see([-33 * U, HEAD_REST_Y * U, -17 * U]), k = scaleAt(hd), hx = X(hd), hy = Y(hd);
    parts.push({ key: "dead-head", depth: hd.depth, node: <g key="dead-head" transform={`translate(${hx} ${hy}) scale(${k}) translate(${-hx} ${-hy})`}><FlailHead at={[hx, hy]} /></g> });
    return <FlailFire.Provider value={false}><Figure3DSvg parts={parts} title={title} className={className} /></FlailFire.Provider>;
  }

  /* ---------- The body under the robe ---------- */
  // (the robe is gone, to be modelled again in parts; this is the body it will go over: a woman's, two smooth eggs, no ribs drawn. The ribcage is an egg on the spine,
  // its top tipped back and its bottom brought forward, so that seen from the side it is full and rounded low on the front, as a bust hangs, and slopes back above.
  // The pelvis is an egg leaned the other way, its top forward and its round bottom back: its narrow top is the waist, going up under the ribcage, and its full
  // bottom her hips and seat. Then both legs)
  /** An egg in space (convex, so its outline on the screen is the hull of its surface's points, drawn as a smooth curve): its sections along its axis are an ellipse's, each
   *  scaled by how far down it is, wider below the middle and narrower above. */
  const eggRing = (u: number, taper: number) => Math.sqrt(Math.max(0, 1 - u * u)) * (1 - taper * u * (1 - 0.3 * u * u));
  /** A point on an egg's surface: `u` along its axis (-1 the bottom, 1 the top), `a` round it (0 to its side, π/2 to its front). */
  const eggPoint = (E: Egg, u: number, a: number): P3 => {
    const ring = eggRing(u, E.taper), ringW = eggRing(u, E.taperW ?? E.taper), A = u > 0 && E.upper ? E.upper : { up: E.up, fwd: E.fwd, halfH: E.halfH };
    return [0, 1, 2].map(i => E.middle[i] + A.up[i] * A.halfH * u + E.side[i] * E.halfW * ringW * Math.cos(a) + A.fwd[i] * E.halfD * ring * Math.sin(a)) as unknown as P3;
  };
  /** How much a point of an egg's surface faces the viewer (positive: toward them, 1 square on): from the surface's true slope, the cross of the two ways along it. The slope
   *  matters: an egg that widens toward its bottom has a lower half that tilts up to a viewer above it, which a plain "outward from the axis" would count as turned away. */
  const eggFacing = (E: Egg, u: number, a: number, look: P3): number => {
    const e = 0.01, uu = Math.max(-1 + e, Math.min(1 - e, u));
    const du = minus(eggPoint(E, uu + e, a), eggPoint(E, uu - e, a)), da = minus(eggPoint(E, uu, a + e), eggPoint(E, uu, a - e));
    let nrm = unit(cross(du, da));
    const out = minus(eggPoint(E, uu, a), eggPoint({ ...E, halfW: 0, halfD: 0 }, uu, a));
    if (dot(nrm, out) < 0) nrm = [-nrm[0], -nrm[1], -nrm[2]];
    return -dot(nrm, look);
  };
  const egg = (key: string, E: Egg, cls = "fig-ribcage", over = 0) => {
    const skin = Array.from({ length: 49 }, (_, n) => -1 + n / 24).flatMap(u => Array.from({ length: 64 }, (_, m) => {
      const q = see(eggPoint(E, u, (m / 64) * Math.PI * 2));
      return [X(q), Y(q)] as [number, number];
    }));
    parts.push({ key, depth: see(E.middle).depth - over, node: <path key={key} d={smooth(hull(skin))} className={cls} /> });
  };
  /** A round opening cut in a robe egg, drawn as skin (the opening's class) over it: an ellipse in the egg's own coordinates, `u` and `a` its middle (height along the egg's axis,
   *  angle round it: 0 to its side, π/2 to its front), `ru` and `ra` how far it reaches each way (height share, and radians round). Only the part facing the viewer shows. */
  const opening = (E: Egg, key: string, at: { u: number; ru: number; a: number; ra: number }, depth: number) => {
    const look = look3At(E.middle), left: [number, number][] = [], right: [number, number][] = [];
    for (let r = 0; r <= 48; r++) {
      const u = at.u + at.ru * (1 - (2 * r) / 48), reach = at.ra * Math.sqrt(Math.max(0, 1 - ((u - at.u) / at.ru) ** 2)), ab = at.a - reach, af = at.a + reach;
      // (only the part of this row that faces the viewer shows)
      let first: number | null = null, last: number | null = null;
      for (let k = 0; k <= 48; k++) {
        const a = ab + ((af - ab) * k) / 48;
        if (eggFacing(E, u, a, look) > 0) { if (first === null) first = a; last = a; }
      }
      if (first === null || last === null) continue;
      const q0 = see(eggPoint(E, u, first)), q1 = see(eggPoint(E, u, last));
      left.push([X(q0), Y(q0)]); right.push([X(q1), Y(q1)]);
    }
    if (left.length >= 3) parts.push({ key, depth, node: <path key={key} d={smooth([...left, ...right.reverse()])} className="fig-robe-opening" /> });
  };
  /** A plane cutting an egg (`cutOpening`): positive where a point of its surface is beyond it. */
  const cutPlane = (E: Egg, at: { n: [number, number, number]; at: number }) => {
    const n = unit([0, 1, 2].map(i => E.side[i] * at.n[0] + E.up[i] * at.n[1] + E.fwd[i] * at.n[2]) as unknown as P3);
    let reach = 0;
    for (let u = -1; u <= 1; u += 0.1) for (let k = 0; k < 24; k++) reach = Math.max(reach, dot(minus(eggPoint(E, u, (k / 24) * Math.PI * 2), E.middle), n));
    return (u: number, a: number) => (dot(minus(eggPoint(E, u, a), E.middle), n) - reach * at.at) / (reach || 1);
  };
  /** An opening cut in a robe egg by a plane, drawn as skin over it: everything of the egg's surface beyond the plane, which is square to `at.n` (given along the egg's side, up and
   *  front) and stands at `at.at` of the egg's reach that way, seen as the round, ellipse-like edge where a plane meets an egg. Only the part facing the viewer shows.
   *  Its edge is traced as a contour through a fine grid of the egg's surface (marching squares, each crossing placed by interpolation, so it is a smooth line and not
   *  steps), the part beyond the plane and the part facing the viewer being two fields whose smaller is the opening. */
  const cutOpening = (E: Egg, key: string, at: { n: [number, number, number]; at: number }, depth: number) => {
    const beyond = cutPlane(E, at), NU = 48, NA = 72, TAU = Math.PI * 2;
    const look = look3At(E.middle);
    /** Positive where the surface is in the opening: beyond the plane and facing the viewer. */
    const field = (u: number, a: number) => {
      return Math.min(beyond(u, a), eggFacing(E, u, a, look));
    };
    const uOf = (i: number) => -1 + (2 * i) / NU, aOf = (j: number) => (j / NA) * TAU;
    const f: number[] = [];
    for (let i = 0; i <= NU; i++) for (let j = 0; j < NA; j++) f.push(field(uOf(i), aOf(j)));
    const fv = (i: number, j: number) => f[i * NA + (j % NA)];
    // Where the contour crosses each edge of the grid (an edge is named by its first corner and which way it runs), and which crossings a cell joins.
    const cross2 = new Map<string, P3>(), links = new Map<string, string[]>();
    const crossing = (id: string, i0: number, j0: number, i1: number, j1: number): string => {
      if (!cross2.has(id)) {
        const f0 = fv(i0, j0), f1 = fv(i1, j1), t = f0 / (f0 - f1);
        cross2.set(id, eggPoint(E, uOf(i0) + (uOf(i1) - uOf(i0)) * t, aOf(j0) + (aOf(j1) - aOf(j0)) * t));
      }
      return id;
    };
    const join = (x: string, y: string) => { (links.get(x) ?? links.set(x, []).get(x)!).push(y); (links.get(y) ?? links.set(y, []).get(y)!).push(x); };
    for (let i = 0; i < NU; i++) {
      for (let j = 0; j < NA; j++) {
        const c = [[i, j], [i, j + 1], [i + 1, j + 1], [i + 1, j]] as const, on = c.map(([ci, cj]) => fv(ci, cj) > 0);
        const hit: string[] = [];
        for (let e = 0; e < 4; e++) {
          const [i0, j0] = c[e], [i1, j1] = c[(e + 1) % 4];
          if (on[e] === on[(e + 1) % 4]) continue;
          const lo = [Math.min(i0, i1), Math.min(j0, j1)];
          hit.push(crossing(`${i0 === i1 ? "a" : "b"}${lo[0]},${lo[1] % NA}`, i0, j0, i1, j1));
        }
        if (hit.length === 2) join(hit[0], hit[1]);
        else if (hit.length === 4) { join(hit[0], hit[1]); join(hit[2], hit[3]); }
      }
    }
    // The crossings, chained into closed lines (or, where the opening runs off the egg's end, open ones, closed straight across), each rounded off as a curve.
    const seen2 = new Set<string>(), path: string[] = [];
    const starts = [...links.keys()].sort((x, y) => (links.get(x)!.length - links.get(y)!.length));
    for (const start of starts) {
      if (seen2.has(start)) continue;
      const line: string[] = [];
      let at2: string | undefined = start, from: string | undefined;
      while (at2 && !seen2.has(at2)) {
        seen2.add(at2); line.push(at2);
        const next: string | undefined = links.get(at2)!.find(q => q !== from && !seen2.has(q));
        from = at2; at2 = next;
      }
      if (line.length < 4) continue;
      path.push(smooth(line.map(id => { const q = see(cross2.get(id)!); return [X(q), Y(q)] as [number, number]; })));
    }
    if (path.length) parts.push({ key, depth, node: <path key={key} d={path.join("")} className="fig-robe-opening" /> });
  };
  let skirtOf: Egg | null = null, ribMiddle: P3 = j.waist, pelvisMiddle: P3 = j.pelvis, ribEgg: Egg | null = null, pelvisEgg: Egg | null = null, robeDepth = -Infinity;
  {
    const rc = ribcageOf(wr.rig), ct = Math.cos(RIB_TILT), st = Math.sin(RIB_TILT);
    const up = unit([0, 1, 2].map(i => rc.up[i] * ct - rc.fwd[i] * st) as unknown as P3), fwd = unit([0, 1, 2].map(i => rc.fwd[i] * ct + rc.up[i] * st) as unknown as P3);
    const middle = [0, 1, 2].map(i => rc.centre[i] + rc.fwd[i] * rc.halfDepth * RIB_FORWARD + rc.up[i] * rc.halfHeight * RIB_RAISE) as unknown as P3;
    ribMiddle = middle;
    ribEgg = { middle, side: rc.side, up, fwd, halfW: rc.halfWidth * RIB_WIDTH, halfD: rc.halfDepth * RIB_DEPTH, halfH: rc.halfHeight, taper: RIB_EGG };
    egg("ribcage", ribEgg);
  }
  {
    // (its axis runs from the pelvis up to the waist, its width along the line of the hips, square to the axis; it reaches a little below the pelvis and above the waist)
    const lift = unit(minus(j.waist, j.pelvis)), line = minus(j.hipR, j.hipL), along = dot(line, lift);
    const side = unit(minus(line, lift.map(v => v * along) as unknown as P3)), fwd0 = unit(cross(side, lift));
    const run = Math.hypot(...minus(j.waist, j.pelvis)), ct = Math.cos(PELVIS_TILT), st = Math.sin(PELVIS_TILT), ctt = Math.cos(PELVIS_TOP_TILT), stt = Math.sin(PELVIS_TOP_TILT);
    const up = unit([0, 1, 2].map(i => lift[i] * ct + fwd0[i] * st) as unknown as P3), fwd = unit([0, 1, 2].map(i => fwd0[i] * ct - lift[i] * st) as unknown as P3);
    const upTop = unit([0, 1, 2].map(i => lift[i] * ctt + fwd0[i] * stt) as unknown as P3), fwdTop = unit([0, 1, 2].map(i => fwd0[i] * ctt - lift[i] * stt) as unknown as P3);
    const middle = plus(j.pelvis, lift, run * PELVIS_MIDDLE);
    pelvisMiddle = middle;
    // (its section at the pelvis, a little under the middle, must reach out to the outer edge of each hip: the hips' half width and a leg's radius)
    const u0 = -PELVIS_MIDDLE / PELVIS_HEIGHT, at0 = Math.sqrt(1 - u0 * u0) * (1 - PELVIS_EGG_W * u0 * (1 - 0.3 * u0 * u0));
    pelvisEgg = { middle, side, up, fwd, halfW: ((Math.hypot(...line) / 2 + (LIMB / 2) * U) / at0) * PELVIS_WIDTH, halfD: ribcageOf(wr.rig).halfDepth * PELVIS_DEPTH, halfH: run * PELVIS_HEIGHT, taper: PELVIS_EGG, taperW: PELVIS_EGG_W, upper: { up: upTop, fwd: fwdTop, halfH: run * PELVIS_TOP_HEIGHT } };
    egg("pelvis", pelvisEgg, "fig-robe-top");
  }
  // The spine joins the two eggs, from the middle of the pelvis to the middle of the ribcage. The robe will hide it from every side; it is here to keep the body's
  // proportions and lengths true when it twists and bends (the eggs move on its ends).
  bones("spine", [see(pelvisMiddle), see(ribMiddle)], "fig-limb fig-limb-robe", LIMB);
  behind("spine", "ribcage", "pelvis"); // (under both eggs, so it never shows)

  /* ---------- The robe, the top of it ---------- */
  // A gray robe over the ribcage, an egg a little bigger than it, like the hood over the head. It is open on her right, as a toga is: the opening runs from the right
  // side of her neck, down past the armpit, to the side of her bust, and round to the back of that side, leaving her skin bare (the ribcage's own colour) there.
  if (ribEgg) {
    const E: Egg = { ...ribEgg, halfW: ribEgg.halfW * (1 + ROBE_GAP), halfD: ribEgg.halfD * (1 + ROBE_GAP) };
    const over = Math.min(see(E.middle).depth, see(pelvisMiddle).depth) - 0.0005;
    robeDepth = over;
    egg("robe-top", E, "fig-robe-top", see(E.middle).depth - over);
    opening(E, "robe-top-open", { u: OPEN_U, ru: OPEN_RU, a: OPEN_A, ra: OPEN_RA }, over - 0.0005);
  }
  // (the line of the hips is not drawn any more: the pelvis joints are still there, and the pelvis egg is placed from them, so the distances stay as they were)
  // (the shin is a limb; the thigh above the knee thickens up to the hip)
  for (const side of ["R", "L"] as const) {
    const hip = j[`hip${side}` as const], knee = j[`knee${side}` as const];
    bones(`leg${side}`, [`knee${side}`, `foot${side}`], side === "R" ? "fig-limb fig-far" : "fig-limb", LIMB);
    // (one smooth shape, not a chain of pieces: the outline of a cone with rounded ends, the hull of a few circles that grow from the knee to the hip, each drawn as many
    // points round, and the hull rounded off as a curve)
    const ring = Array.from({ length: 6 }, (_, i) => i / 5).flatMap(t => {
      const q = see(mix(knee, hip, t)), r = (LIMB / 2 + (THIGH_R - LIMB / 2) * t) * scaleAt(q);
      return Array.from({ length: 36 }, (_, m) => [X(q) + r * Math.cos((m / 36) * Math.PI * 2), Y(q) + r * Math.sin((m / 36) * Math.PI * 2)] as [number, number]);
    });
    const far = side === "R";
    parts.push({ key: `thigh${side}`, depth: depthOf(seen[`hip${side}` as const], seen[`knee${side}` as const]), node: <g key={`thigh${side}`} className="fig-ribcage" style={far ? { fill: "var(--ink-far)" } : undefined}><path d={smooth(hull(ring))} /></g> });
  }
  // The pelvis egg is the robe's bottom, gray; it is open on her left, in a round opening like the toga's, for her left leg (bare, in white). Her right thigh is under it.
  if (pelvisEgg) cutOpening(pelvisEgg, "pelvis-open", PELVIS_CUT, see(pelvisEgg.middle).depth - 0.0002);
  // A belt of wax round her, slightly above the pelvis: a band on the pelvis egg's surface, a little proud of it, as tall as `BELT_HALF` either side of `BELT_AT` (heights along the egg's
  // axis), all the way round. Only the strips of it that face the viewer are drawn, over the robe.
  if (pelvisEgg) {
    const B: Egg = { ...pelvisEgg, halfW: pelvisEgg.halfW * BELT_OUT, halfD: pelvisEgg.halfD * BELT_OUT }, look = look3At(B.middle), SECT = 72;
    const quads: string[] = [];
    for (let n = 0; n < SECT; n++) {
      const a0 = (n / SECT) * Math.PI * 2, a1 = ((n + 1) / SECT) * Math.PI * 2;
      if (eggFacing(B, BELT_AT, (a0 + a1) / 2, look) <= 0) continue;
      const q = [eggPoint(B, BELT_AT - BELT_HALF, a0), eggPoint(B, BELT_AT - BELT_HALF, a1), eggPoint(B, BELT_AT + BELT_HALF, a1), eggPoint(B, BELT_AT + BELT_HALF, a0)];
      quads.push(`M${pts(q).replace(/ /g, "L")}z`);
    }
    skirtOf = B;
    if (quads.length) parts.push({ key: "belt", depth: Math.min(Number.isFinite(robeDepth) ? robeDepth : Infinity, see(pelvisEgg.middle).depth) - 0.0006, node: <path key="belt" d={quads.join("")} className="fig-belt" /> });
  }
  // The robe's skirt, hanging from the lower edge of the belt: a cylinder (it flares a little toward the hem), the hem a little above her feet. Like a cloak it is a near wall
  // and a far wall, with her legs sorted between them. It is open on her left, where the bottom egg's opening meets the belt's lower edge: the angles round the belt there at
  // which that opening's plane has cut the egg are left out, all the way down, so her left leg shows through.
  if (pelvisEgg && skirtOf) {
    const B = skirtOf, beyond = cutPlane(pelvisEgg, PELVIS_CUT), uLow = BELT_AT - BELT_HALF, look = look3At(B.middle), SECT = 72;
    const hemY = Math.min(j.footL[1], j.footR[1]) + SKIRT_HEM * U, axisC = eggPoint({ ...B, halfW: 0, halfD: 0 }, uLow, 0);
    /** A point on the skirt: `a` round it, `t` of the way down from the belt (0) to the hem (1). */
    const skirtAt = (a: number, t: number): P3 => {
      const r = eggPoint(B, uLow, a), k = 1 + SKIRT_FLARE * t;
      return [axisC[0] + (r[0] - axisC[0]) * k, r[1] + (hemY - r[1]) * t, axisC[2] + (r[2] - axisC[2]) * k];
    };
    const near: string[] = [], far: string[] = [], hem: string[] = [];
    for (let n = 0; n < SECT; n++) {
      const a0 = (n / SECT) * Math.PI * 2, a1 = ((n + 1) / SECT) * Math.PI * 2, am = (a0 + a1) / 2;
      if (beyond(uLow, am) > 0) continue;
      const r = eggPoint(B, uLow, am), outside = (r[0] - axisC[0]) * look[0] + (r[2] - axisC[2]) * look[2] < 0;
      const strip = `M${pts([skirtAt(a0, 0), skirtAt(a1, 0), skirtAt(a1, 1), skirtAt(a0, 1)]).replace(/ /g, "L")}z`;
      (outside ? near : far).push(strip);
      if (outside) hem.push(`M${pts([skirtAt(a0, 1), skirtAt(a1, 1)]).replace(/ /g, "L")}`);
    }
    const inside = parts.filter(x => ["pelvis", "thighL", "thighR", "legL", "legR"].includes(x.key)).map(x => x.depth);
    // (the far wall, the inside of the skirt, is under everything already drawn: the legs, the eggs, the belt, the robe's top, the opening's skin)
    const nearDepth = Math.min(...inside) - 0.001, farDepth = Math.max(...parts.map(x => x.depth)) + 0.001;
    if (far.length) parts.push({ key: "skirt-far", depth: farDepth, node: <path key="skirt-far" d={far.join("")} className="fig-skirt-inner" /> });
    if (near.length) {
      parts.push({ key: "skirt-near", depth: nearDepth, node: <path key="skirt-near" d={near.join("")} className="fig-skirt" /> });
      parts.push({ key: "skirt-hem", depth: nearDepth - 0.0003, node: <path key="skirt-hem" d={hem.join("")} className="fig-cloak-wax" /> });
    }
    // (the belt goes over the skirt it holds)
    const belt = parts.find(x => x.key === "belt");
    if (belt) belt.depth = Math.min(belt.depth, nearDepth - 0.0005);
  }
  behind("thighR", "pelvis");
  // (her left thigh is sorted by its own depth, like any limb: the robe's bottom is over it where the robe is nearer, and the opening's white, drawn on the robe, melts into the
  // thigh where it comes out of it)

  /* ---------- Arms ---------- */
  // His right arm (the flail's): bare, like the rest of the body under the robe.
  bones("R-arm", ["shoulderR", "elbowR", "handR"], `fig-limb${debug ? " dbg-red" : ""}`, LIMB);
  // His left arm (the candle's): wax, thick toward the fist; scorched black and burning in his second form.
  const scorched = arm === "scorched", skin = scorched ? "fig-hand-burnt" : "fig-hand-wax";
  // The arm is one piece of wax that thickens all the way: from its shoulder to the elbow, and from the elbow to the fist (its radius, in figure units, grows
  // steadily along each bone), drawn as a chain of overlapping discs so the outline runs smooth through the bend.
  {
    const bone = (a: P3, b: P3, r0: number, r1: number, n: number) => Array.from({ length: n }, (_, i) => ({ at: mix(a, b, i / n), r: r0 + (r1 - r0) * (i / n) }));
    const chain = [...bone(j.shoulderL, j.elbowL, WAX_SHOULDER, WAX_ELBOW, 10), ...bone(j.elbowL, j.handL, WAX_ELBOW, FIST, 12), { at: j.handL, r: FIST }];
    const discs = chain.map(({ at: p, r }, i) => { const q = see(p); return <circle key={i} cx={X(q)} cy={Y(q)} r={r * scaleAt(q)} className={skin} />; });
    parts.push({ key: "L-arm", depth: depthOf(seen.shoulderL, seen.elbowL, seen.handL), node: <g key="L-arm">{discs}</g> });
  }
  ball("L-fist", j.handL, FIST, skin, 0.001);
  const fist = seen.handL, fk = scaleAt(fist);
  const flame = (key: string, node: ReactNode) => parts.push({ key, depth: fist.depth - 0.003, node });
  const above = see(plus(j.handL, UP, 3 * U));
  if (arm === "lit") {
    flame("L-flame", <g key="L-flame"><LittleFlame x={X(above)} y={Y(above)} height={10 * fk} /></g>);
  } else if (arm === "out") {
    const x = X(above), y = Y(above);
    flame("L-smoke", <path key="L-smoke" d={`M${x} ${y} q${-3 * fk} ${-5 * fk} 0 ${-9 * fk} q${3 * fk} ${-4 * fk} ${-1 * fk} ${-9 * fk}`} className="fig-smoke" />);
  } else {
    const x = X(fist), y = Y(fist);
    flame("L-flames", (
      <g key="L-flames">
        <circle cx={x} cy={y - 6 * fk} r={13 * fk} className="fig-glow" />
        <Flame at={[x - 3 * fk, y + 3 * fk]} s={1.1 * fk} className="fig-flame-b" />
        <Flame at={[x + 3 * fk, y + 3 * fk]} s={1.2 * fk} />
        <Flame at={[x, y + 4 * fk]} s={1.6 * fk} className="fig-flame-c" />
      </g>
    ));
  }

  /* ---------- The flail ---------- */
  const fl = flail3(wr), flat = wr.flat;
  bones("R-handle", [see(fl.butt), see(fl.tip)], "fig-flail-handle", 2.6);
  // (a few lumps of wax caked along the handle)
  [0.2, 0.5, 0.8].forEach((t, i) => ball(`R-wax${i}`, plus(mix(fl.butt, fl.tip, t), UP, 0.6 * U), 1.9, "fig-handle-wax", -0.0005));
  const chain = (key: string, a: P3, b: P3, sag: number) => {
    const line = Array.from({ length: 9 }, (_, i) => { const t = i / 8, p = mix(a, b, t); return [p[0], p[1] - sag * U * Math.sin(Math.PI * t), p[2]] as P3; });
    parts.push({ key, depth: depthOf(see(a), see(b)), node: <polyline key={key} points={pts(line)} className="fig-chain" /> });
  };
  const head = (key: string, p: P3) => {
    const q = see(p), k = scaleAt(q), x = X(q), y = Y(q);
    parts.push({ key, depth: q.depth - 0.003, node: <g key={key} transform={`translate(${x} ${y}) scale(${k}) translate(${-x} ${-y})`}><FlailHead at={[x, y]} /></g> });
  };
  const F: P3 = [Math.sin(wr.turn), 0, Math.cos(wr.turn)], R: P3 = [Math.cos(wr.turn), 0, -Math.sin(wr.turn)];
  if (flat.spin) {
    // Whirling too fast to see: a faint ring where the head travels, and a few copies of the chain with a smudge of head, spread round it.
    const r = CHAIN_R * U, [a1, a2] = flat.spin === "behind" ? [F, UP] : [R, F];
    const round = (a: number) => plus(plus(fl.tip, a1, Math.cos(a) * r), a2, Math.sin(a) * r);
    const ring = Array.from({ length: 32 }, (_, i) => round((i / 32) * Math.PI * 2));
    parts.push({ key: "R-spin", depth: see(fl.tip).depth - 0.002, node: <polygon key="R-spin" points={pts(ring)} className="fig-spin-disc" /> });
    parts.push({ key: "R-spin-path", depth: see(fl.tip).depth - 0.0021, node: <polygon key="R-spin-path" points={pts(ring)} className="fig-spin-path" /> });
    [0.5, 2.3, 4.2].forEach((a, i) => {
      const end = round(a), q = see(end), k = scaleAt(q);
      chain(`R-spin-chain${i}`, fl.tip, end, 0);
      parts.push({ key: `R-spin-head${i}`, depth: q.depth - 0.003, node: <ellipse key={`R-spin-head${i}`} cx={X(q)} cy={Y(q)} rx={4.4 * k} ry={2.6 * k} className="fig-censer-smudge" /> });
    });
  } else if (flat.chainInHand) {
    chain("R-chain", fl.tip, j.handL, flat.chainTaut ? 0 : 4);
    head("R-head", fl.ball);
  } else if (flat.headInHand) {
    chain("R-chain", fl.tip, fl.ball, 0);
    head("R-head", fl.ball);
  } else if (!flat.spinTrail) {
    // (just done spinning, no head hangs yet: it is still whirling)
    chain("R-chain", fl.tip, fl.ball, fl.resting ? -1 : 3);
    head("R-head", fl.ball);
  }

  /* ---------- The head: his hood, the dark of its opening, and his beak ---------- */
  const hs = seen.head, kh = scaleAt(hs), headAt = j.head, look = wr.gaze;
  /** Seen from well below, his neck is in front of his head (it comes up into the hood through the opening). */
  const neckFront = look3At(headAt)[1] > 0.3;
  parts.push({ key: "hood", depth: hs.depth - 0.01, node: <circle key="hood" cx={X(hs)} cy={Y(hs)} r={HOOD_R * kh} className="fig-hood" /> });
  // The hood's opening is everything below a hem that runs round the head: low over his brow in front (over his eyes), lower down the sides, and lowest at the back,
  // where it wraps round the nape of his neck.
  const f = unit(look), fh = unit([f[0], 0, f[2]]), sideH = unit(cross(UP, fh)), el0 = Math.asin(Math.max(-1, Math.min(1, f[1])));
  const hemAt = (c: number) => el0 * c - (BROW + (NAPE - BROW) * (1 - c) / 2);
  const inside = (v: P3) => { const hz = Math.hypot(v[0], v[2]) || 1; return Math.asin(Math.max(-1, Math.min(1, v[1]))) < hemAt(dot(v, fh) / hz); };
  {
    // His neck is a cylinder of wax up into the hood, cut flat at both ends (the circle there seen as the ellipse it looks like, as a limb's cut end is: `bones`' `cut`; the
    // top where the cylinder meets the hood's round, as far down from the head's middle as the ball's surface is at the neck's own radius), and round it a gray cone
    // that opens up from the neck to the hood, its top rim on the hood's round. The cone is open in front: the strips of it whose top reaches the hood within the hood's
    // opening are not drawn. What is left is a collar: the gray outside where it faces the viewer, the lining's wax inside where it is seen from within.
    const dirN = unit(minus(headAt, j.neck)), coreR = LIMB / 2;
    // (the wax neck starts a little above the neck joint, so its foot does not lie over her chest; the cone round it stays down at the joint, a little over the robe)
    const nb = plus(j.neck, dirN, NECK_RAISE * U);
    const top = plus(headAt, dirN, -Math.sqrt(HOOD_R * HOOD_R - coreR * coreR) * U);
    bones("neck", [see(nb), see(top)], "fig-wax-shell", coreR * 2, 0, { start: { at: nb, axis: dirN }, end: { at: top, axis: dirN } });
    const entries: { key: string; nat: number; outside: boolean }[] = [{ key: "neck", nat: depthOf(see(nb), see(top)), outside: false }];
    const rimC = plus(headAt, dirN, -Math.sqrt(HOOD_R * HOOD_R - CONE_TOP * CONE_TOP) * U);
    // (where the cone is open, a thin band of it is left at the bottom: the same cone, a share of its height, which does not reach the hood)
    const bandC = mix(j.neck, rimC, CONE_BAND), bandR = CONE_BASE + (CONE_TOP - CONE_BASE) * CONE_BAND;
    const e1 = unit(minus(fh, dirN.map(v => v * dot(fh, dirN)) as unknown as P3)), e2 = cross(dirN, e1), look0 = look3At(rimC), SECT = 40;
    const ringAt = (c: P3, r: number, a: number): P3 => plus(plus(c, e1, Math.cos(a) * r * U), e2, Math.sin(a) * r * U);
    for (let n = 0; n < SECT; n++) {
      const a0 = (n / SECT) * Math.PI * 2, a1 = ((n + 1) / SECT) * Math.PI * 2, am = (a0 + a1) / 2;
      const open = inside(unit(minus(ringAt(rimC, CONE_TOP, am), headAt))), upC = open ? bandC : rimC, upR = open ? bandR : CONE_TOP;
      const quad = [ringAt(j.neck, CONE_BASE, a0), ringAt(j.neck, CONE_BASE, a1), ringAt(upC, upR, a1), ringAt(upC, upR, a0)];
      const outward = [0, 1, 2].map(i => e1[i] * Math.cos(am) + e2[i] * Math.sin(am)) as unknown as P3, outside = dot(outward, look0) < 0;
      const key = `neck-cone${n}`, nat = depthOf(...quad.map(q => see(q)));
      entries.push({ key, nat, outside });
      parts.push({ key, depth: nat, node: <polygon key={key} points={pts(quad)} className={outside ? "fig-neck-cone" : "fig-neck-lining"} /> });
    }
    // Where the gray outside of the cone faces the viewer it is over the hood and its wax lining (it stands in front of them). Where only its inside is seen (the wax),
    // seen from above or level it lies under the hood; seen from below, it is in front of the head and hides part of it. Each kind is sorted far to near.
    const inBase = neckFront ? hs.depth - 0.0126 : hs.depth + 0.002, outBase = hs.depth - 0.016;
    for (const outside of [false, true]) {
      entries.filter(e => e.outside === outside).sort((p, q) => q.nat - p.nat).forEach((e, k) => {
        const part = parts.find(x => x.key === e.key);
        // (the cone's inside, its back wall seen through the open front, goes down inside her chest: it is always under the robe's top, so at low angles its wax never
        // shows through the chest; above the chest, where nothing is over it, it is seen as before)
        const base = outside ? outBase : e.key === "neck" ? inBase : Math.max(inBase, robeDepth + 0.0002);
        if (part) part.depth = base - k * 0.000002;
      });
    }
  }
  {
    // Its point: a cone from the back of the hood, up and back, its tip hanging behind the head.
    const horiz = unit([look[0], 0, look[2]]), sideH = unit(cross(UP, horiz));
    const baseAt = plus(plus(headAt, UP, 2.9 * U), horiz, -5.1 * U), tipAt = plus(plus(headAt, UP, 10.2 * U), horiz, -10.4 * U);
    const axis = unit(minus(tipAt, baseAt)), other = unit(cross(axis, sideH));
    const rim = Array.from({ length: 16 }, (_, i) => (i / 16) * Math.PI * 2).map(a => see(plus(plus(baseAt, sideH, Math.cos(a) * 4.6 * U), other, Math.sin(a) * 4.6 * U)));
    const tip = see(tipAt), outline = hull([...rim, tip].map(p => [X(p), Y(p)] as [number, number]));
    parts.push({ key: "hood-point", depth: (see(baseAt).depth + tip.depth) / 2, node: <polygon key="hood-point" points={outline.map(p => p.join(",")).join(" ")} className="fig-hood" /> });
  }
  {
    // The opening, as the Night Hunter's hood has it: a circle on the hood's round that starts at the brows and opens all the way down to the neck (its middle
    // tipped down from where he looks). His face sits back in it, a normal face with two eyes, cut to the opening and a little smaller, so the dark of the
    // hood's inside is left as a rim round it; and out of the face his wax beak sticks out.
    // (the beak's place is worked out first: the wax of his lower face ends along the line of its two base corners)
    // (its base is set on the face's own round, not out at the hood's: as far ahead of the head's middle as the face's surface is at that height)
    const drop = 0.6 + BEAK_R, reach = Math.sqrt(Math.max(1, HEAD_R ** 2 - drop * drop));
    const baseAt = plus(plus(headAt, f, reach * U), UP, -drop * U), tipAt = plus(baseAt, plus(f.map(v => v * Math.cos(BEAK_DOWN)) as unknown as P3, UP, -Math.sin(BEAK_DOWN)), BEAK_LEN * U);
    const axis = unit(minus(tipAt, baseAt)), sideB = unit(cross(UP, axis));
    let upB = unit(cross(axis, sideB));
    if (dot(upB, UP) < 0) upB = [-upB[0], -upB[1], -upB[2]];
    const R = BEAK_R * U;
    // Its base is not flat but follows the face: each point of its edge is slid along the beak's axis until it is on the face's surface (a ball), so the beak
    // comes right up to the face and stops there, never going into it.
    const onFace = (p: P3): P3 => {
      const w = minus(p, headAt), wa = dot(w, axis), disc = wa * wa - (dot(w, w) - (HEAD_R * U) ** 2);
      return plus(p, axis, -wa + Math.sqrt(Math.max(0, disc)));
    };
    // (Seen from the side the opening is still there: its edge is cut to the half of the hood that faces the viewer, a point of it round the back being pulled
    // onto the hood's outline instead, so what shows is the part of the opening that is on the near side.)
    const headLook = look3At(headAt);
    const dirs = Array.from({ length: 72 }, (_, i) => (i / 72) * Math.PI * 2).map(a => {
      const c = Math.cos(a), el = hemAt(c), h = Math.cos(el);
      return unit(plus(plus(fh.map(v => v * c * h) as unknown as P3, sideH, Math.sin(a) * h), UP, Math.sin(el)));
    });
    const capDirs = visibleCap(dirs, headLook, inside);
    let openingRing: string | null = null;
    if (capDirs.length) {
      /** The part of the opening that faces the viewer, laid on a ball round the head of this radius. */
      const cap = (radius: number) => capDirs.map(d => see(plus(headAt, d, radius * U)));
      // (the hood's round, with its hollow inside black; and, set back inside it, the face's own round, a smaller ball: the same opening laid on it. Seen from in front
      // the face fills all but a rim of the opening; from the side the two shift against each other, and the dark of the inside shows between them.)
      const ring = cap(HOOD_R), faceCap = cap(HEAD_R);
      openingRing = ring.map(p => `${X(p)},${Y(p)}`).join(" ");
      // The lower half of his face is wax, not skin: the part of the face's ball below the level of the beak's two base corners (so its border runs through them).
      // It is the cap round straight down, laid on the ball and cut to the near half like the opening; the opening's clip then trims it.
      const waxDepth = (headAt[1] - onFace(plus(baseAt, sideB, R))[1]) / (HEAD_R * U), waxCap: ReturnType<typeof see>[] = [];
      if (waxDepth > -1 && waxDepth < 1) {
        const ct = waxDepth, st = Math.sqrt(1 - ct * ct), down: P3 = [-UP[0], -UP[1], -UP[2]];
        const e1 = unit(cross(UP, f)), e2 = unit(cross(down, e1));
        const wdirs = Array.from({ length: 72 }, (_, i) => (i / 72) * Math.PI * 2).map(a => unit(plus(plus(down.map(v => v * ct) as unknown as P3, e1, st * Math.cos(a)), e2, st * Math.sin(a))));
        for (const d of visibleCap(wdirs, headLook, v => dot(v, down) > ct)) waxCap.push(see(plus(headAt, d, HEAD_R * U)));
      }
      // (all of it inside the hood's own outline: its edge is worked out for a ball seen from the middle of the head, and in perspective may stray a hair past it)
      const hoodClip = `${clip}-hood`;
      parts.push({ key: "hood-dark", depth: hs.depth - 0.012, node: <g key="hood-dark" clipPath={`url(#${hoodClip})`}><clipPath id={hoodClip}><circle cx={X(hs)} cy={Y(hs)} r={HOOD_R * kh} /></clipPath><polygon points={ring.map(p => `${X(p)},${Y(p)}`).join(" ")} className="fig-hood-wax" /></g> });
      // His two eyes: half moons lying on the face's surface, turned the way he looks (each point laid back onto the ball, so they turn and narrow with the head).
      const eyes = [-1, 1].flatMap(sg => {
        const a = sg * EYE_APART, ca = Math.cos(a), sa = Math.sin(a), k = dot(UP, f), vx = cross(UP, f);
        const dir = [0, 1, 2].map(i => f[i] * ca + vx[i] * sa + UP[i] * k * (1 - ca)) as unknown as P3;
        if (see(plus(headAt, dir, HEAD_R * U)).depth >= hs.depth) return [];
        const side = unit(cross(UP, dir)), upE = unit(cross(dir, side)), r = EYE_R / HEAD_R;
        const onHead = (x: number, y: number) => see(plus(headAt, unit(plus(plus(dir, side, x * r), upE, y * r)), HEAD_R * U));
        const rim = Array.from({ length: 11 }, (_, i) => (Math.PI * i) / 10).map(t => onHead(Math.cos(t), -Math.sin(t)));
        return [<polygon key={`eye${sg}`} points={rim.map(p => `${X(p)},${Y(p)}`).join(" ")} className="fig-eyes" />];
      });
      parts.push({
        key: "hood-face", depth: hs.depth - 0.0125,
        node: (
          <g key="hood-face" clipPath={`url(#${clip}-hood)`}>
            <clipPath id={`${clip}-face`}><polygon points={ring.map(p => `${X(p)},${Y(p)}`).join(" ")} /></clipPath>
            <g clipPath={`url(#${clip}-face)`}>
              <polygon points={faceCap.map(p => `${X(p)},${Y(p)}`).join(" ")} className="fig-head" />
              {waxCap.length > 0 && <polygon points={waxCap.map(p => `${X(p)},${Y(p)}`).join(" ")} className="fig-face-wax" />}
              {eyes}
            </g>
          </g>
        ),
      });
    }
    // His beak: the top half of a cone of wax, low on the face (under his eyes, by the mouth), pointing the way he looks, a little down. The curved top
    // is the cone's own surface (its base a half circle, drawn in many short steps, so it is round, not faceted); the underside is flat, a triangle from the tip
    // to the base's straight edge, in a darker wax. Whichever of the two faces the viewer is drawn over the other.
    const arc = Array.from({ length: 25 }, (_, i) => (Math.PI * i) / 24).map(t => see(onFace(plus(plus(baseAt, sideB, Math.cos(t) * R), upB, Math.sin(t) * R))));
    const straight = Array.from({ length: 13 }, (_, i) => see(onFace(plus(baseAt, sideB, R * (1 - i / 6))))); // (the base's straight edge, from one side to the other)
    const tipS = see(tipAt);
    const curved = hull([...arc, tipS].map(p => [X(p), Y(p)] as [number, number]));
    const lk = look3At(baseAt), flatFaces = dot([-upB[0], -upB[1], -upB[2]], lk) < 0;

    const depth = (see(baseAt).depth + tipS.depth) / 2 - 0.0005;
    // (his face turned toward the viewer, even only just: the beak stands out in front of the hood's dark and of the face, not under them)
    const inFront = dot(f, headLook) < 0.15 ? Math.min(depth, hs.depth - 0.0135) - depth : 0;
    // Seen from the side (or from behind) the beak stands inside the hood: the hood's grey cheek is over it, everywhere but the opening. That is the hood drawn
    // again over the beak, with the opening cut out of it. Seen from the front, the beak's tip is nearer than the hood and stays over it.
    if (dot(f, headLook) >= -0.25) {
      const hoodPath = `M${X(hs) - HOOD_R * kh},${Y(hs)}a${HOOD_R * kh},${HOOD_R * kh} 0 1 0 ${2 * HOOD_R * kh},0a${HOOD_R * kh},${HOOD_R * kh} 0 1 0 ${-2 * HOOD_R * kh},0z`;
      const cut = openingRing ? `M${openingRing.replace(/ /g, "L")}z` : "";
      parts.push({
        // (and when his neck is in front of the head, the hood's near side is over the neck too: it shows only through the opening)
        key: "hood-over", depth: Math.min(depth + inFront - 0.0003, neckFront ? hs.depth - 0.014 : Infinity),
        node: <g key="hood-over" clipPath={`url(#${clip}-hoodover)`}><clipPath id={`${clip}-hoodover`}><circle cx={X(hs)} cy={Y(hs)} r={HOOD_R * kh} /></clipPath><path d={hoodPath + cut} fillRule="evenodd" className="fig-hood" /></g>,
      });
    }
    parts.push({ key: "beak", depth: depth + inFront + (flatFaces ? 0.0002 : 0), node: <polygon key="beak" points={curved.map(p => p.join(",")).join(" ")} className="fig-beak fig-beak-solid" /> });
    parts.push({ key: "beak-flat", depth: depth + inFront + (flatFaces ? 0 : 0.0002), node: <polygon key="beak-flat" points={[tipS, ...straight].map(p => `${X(p)},${Y(p)}`).join(" ")} className="fig-beak fig-beak-solid fig-beak-flat" /> });
    // Only its bottom border is outlined: the two edges of the flat underside, from the base to the tip.
    // The two edges of the underside, one along each side of the beak, are both outlined, at once if they are both seen, from any height; but a piece of an edge that is
    // behind the beak's body (seen through it) is left out: each point along it is tested by whether the line from it to the viewer passes through the solid half cone.
    {
      const toViewer: P3 = [-lk[0], -lk[1], -lk[2]], L = BEAK_LEN * U, STEPS = 14;
      /** Whether the beak's solid is between this point of an edge and the viewer. */
      const hidden = (q: P3) => {
        for (let tau = R / 6; tau < 2 * R + L; tau += R / 6) {
          const m = minus(plus(q, toViewer, tau), baseAt), a = dot(m, axis), x = dot(m, sideB), y = dot(m, upB);
          if (a < 0 || a > L || y < 0) continue;
          const r = R * (1 - a / L);
          if (x * x + y * y < (r * 0.97) ** 2) return true;
        }
        return false;
      };
      // (each edge is the straight line from the base's corner, on the face, to the tip: the same line the flat underside's outline is)
      ([[onFace(plus(baseAt, sideB, R))], [onFace(plus(baseAt, sideB, -R))]] as const).forEach(([corner], n) => {
        // (one straight line from the corner to the tip, drawn whole or not at all: it is left out when most of it is behind the beak's body)
        const behind = Array.from({ length: STEPS + 1 }, (_, i) => hidden(mix(corner, tipAt, i / STEPS))).filter(Boolean).length;
        if (behind <= STEPS / 2) parts.push({ key: `beak-line${n}`, depth: depth + inFront - 0.0001, node: <polyline key={`beak-line${n}`} points={[corner, tipAt].map(q => { const o = see(q); return `${X(o)},${Y(o)}`; }).join(" ")} className="fig-beak-line" /> });
      });
    }
  }

  return <FlailFire.Provider value={!!flailFire}><Figure3DSvg parts={parts} title={title} className={className} /></FlailFire.Provider>;
}

/** How high the dropped flail's head lies (figure units), and the radius of the flail's whirl: the chain's length. */
const HEAD_REST_Y = 6, CHAIN_R = 34;

/** The Warden, worked out again only when something it is drawn from has changed (`sameDrawing`). */
export const Warden3D = memo(Warden3DView, sameDrawing);
