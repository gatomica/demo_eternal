/**
 * Warden3D.tsx — the Penitent Warden drawn from a skeleton in 3D space, as the Sleepwalker and the Waxed are (the shared pieces are in figure3d.tsx):
 * his joints placed on the combat scene's floor, facing a way, projected through the scene's camera and connected far to near.
 *
 * His poses are the flat ones' limbs lifted into space, but how his hips and shoulders are turned comes from the robe's opening and his wax shoulder
 * (warden/pose3d.ts), not from the flat poses' camera tricks. FIRST PASS: the body, the cloak with its rip, the hood and beak, the wax candle arm with
 * its flame, and the flail in his hand; the trails the flat figure draws (spins, swings, bursts) are still to be done in 3D.
 *
 * The cloak is one tube from his collar to the ground, as wide as his shoulders at the top and flaring to the hem, twisting from the way his shoulders
 * face to the way his hips do, and bulging where a leg or knee pushes it out. It is drawn as the Hunter's cloak is, in a near wall and a far one, so the
 * body parts sort in between. The rip is laid on the near wall, on his left side: a wax seam from the armpit to the hip, and below it a gape (the
 * lining showing) through which his left leg is seen.
 */
import { memo, type ReactNode, useContext, useId } from "react";
import { type Cam, METERS_PER_UNIT as U, type Vec } from "./camera";
import { SHOULDER_HALF } from "./body";
import { DebugLimbsContext } from "./debugLimbs";
import { visibleCap } from "./hoodCap";
import { canvas3d, ellipsoidPart, Figure3DSvg, sameDrawing } from "./figure3d";
import type { PoseName } from "./poses";
import type { P3 } from "./rig3d";
import { FlailFire, type CandleArm } from "../warden/skeleton";
import { Flame, FlailHead } from "../warden/parts";
import { LittleFlame } from "./LittleFlame";
import { flail3, placeWarden } from "../warden/pose3d";

/** His hood's round and the thickness of his limbs (figure units, before perspective). */
/** The hood's opening (as the Night Hunter's): its radius on the hood's round (radians) and how far its middle is tipped down from where he looks; his face's size and its two eyes (how far either side of where he looks, radians, and their size). */
const OPENING_HALF = 0.85, OPENING_TIP = 0.55, HEAD_R = 7.5, EYE_APART = 0.42, EYE_R = 1.8, BEAK_R = 5.2, BEAK_LEN = 8.5, BEAK_DOWN = 0.5;
const HOOD_R = 8.9, SLEEVE = 8, WAX_SHOULDER = 3.2, WAX_ELBOW = 4.4, FIST = 5.4, LIMB = 5;
/** How far a leg must stay inside the cloak (figure units), and the most the cloak will bulge for one. */
const LEG_PAD = 4.5, BULGE_MAX = 26;
/** The cloak's widest half width at the hem, and its depth there (front to back; figure units). */
const HEM_WIDTH = 13.5, HEM_DEPTH = 10;
/** How wide the gape in the rip gets at the hem (radians round the cloak, either side of the middle of his left side). */
const GAPE = 0.42;

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
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const UP: P3 = [0, 1, 0];
/** An angle brought into (-π, π]. */
const wrap = (x: number) => ((((x + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;

/** The outline of a set of points on the screen (a convex hull: the silhouette of a cone is its tip and its base's outline together). */
function hull(ps: [number, number][]): [number, number][] {
  const pts = [...ps].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const turn = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [], upper: [number, number][] = [];
  for (const p of pts) { while (lower.length >= 2 && turn(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (const p of [...pts].reverse()) { while (upper.length >= 2 && turn(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** One ring of the cloak: how it stands at a height (its middle, which way it faces, how wide and deep it is). */
interface Ring { y: number; c: [number, number]; f: P3; s: P3; W: number; Df: number; Db: number }

function Warden3DView({ pose, arm = "lit", phase2Look, flailFire, dead, charred, title, cam, at, yaw, scale = 1, w, h, box }: Warden3DProps) {
  const clip = `wd3${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const debug = useContext(DebugLimbsContext);
  const { wr, placed } = placeWarden(pose, at, yaw, cam, w, h, scale);
  const c = canvas3d(placed, box);
  const { seen, see, X, Y, scaleAt, depthOf, mid, parts, bones, ball } = c;
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

  /* ---------- The cloak ---------- */
  const yNeck = j.neck[1], yHem = 1 * U, pel = j.pelvis;
  const shoulderMid = mix(j.shoulderR, j.shoulderL, 0.5);
  const feetMid = mix(j.footR, j.footL, 0.5);
  const total = (yNeck - yHem) / U;
  /** His collar's width, then his shoulders', flaring out to the hem; its depth likewise. */
  const widthAt = (d: number) => {
    const sh = SHOULDER_HALF + 2.6;
    return d < 2 ? 4.6 + (sh - 4.6) * (d / 2) : sh + (HEM_WIDTH - sh) * Math.min(1, (d - 2) / Math.max(1, total - 2));
  };
  const depthAt = (d: number) => (d < 2 ? 4 + d / 2 : 5 + (HEM_DEPTH - 5) * Math.min(1, (d - 2) / Math.max(1, total - 2)));
  /** Where the cloak's middle is at a height: down the spine to the pelvis, then drifting toward his feet. */
  const centreAt = (y: number): [number, number] => {
    if (y >= pel[1]) {
      const t = clamp01((y - pel[1]) / Math.max(1e-6, shoulderMid[1] - pel[1]));
      return [pel[0] + (shoulderMid[0] - pel[0]) * t, pel[2] + (shoulderMid[2] - pel[2]) * t];
    }
    const u = clamp01((pel[1] - y) / Math.max(1e-6, pel[1] - yHem)), k = u * u * 0.5;
    return [pel[0] + (feetMid[0] - pel[0]) * k, pel[2] + (feetMid[2] - pel[2]) * k];
  };
  const legBones: [string, string][] = [["hipR", "kneeR"], ["kneeR", "footR"], ["hipL", "kneeL"], ["kneeL", "footL"]];
  const makeRing = (y: number): Ring => {
    const d = (yNeck - y) / U, c0 = centreAt(y);
    const ease = clamp01((y - pel[1]) / Math.max(1e-6, shoulderMid[1] - pel[1]));
    const psi = wr.turn * ease * ease * (3 - 2 * ease);
    const f: P3 = [Math.sin(psi), 0, Math.cos(psi)], s: P3 = [Math.cos(psi), 0, -Math.sin(psi)];
    let W = widthAt(d), Df = depthAt(d), Db = Df;
    // A leg that pushes against the cloak (a knee raised under it) bulges it.
    for (const [a, b] of legBones) {
      const pa = j[a as keyof typeof j], pb = j[b as keyof typeof j];
      if (y < Math.min(pa[1], pb[1]) - 1e-6 || y > Math.max(pa[1], pb[1]) + 1e-6) continue;
      const t = Math.abs(pb[1] - pa[1]) < 1e-6 ? 0 : (y - pa[1]) / (pb[1] - pa[1]), p = mix(pa, pb, t);
      const dx = p[0] - c0[0], dz = p[2] - c0[1], fwd = (dx * f[0] + dz * f[2]) / U, sid = (dx * s[0] + dz * s[2]) / U;
      Df = Math.max(Df, Math.min(BULGE_MAX, fwd + LEG_PAD));
      Db = Math.max(Db, Math.min(BULGE_MAX, -fwd + LEG_PAD));
      W = Math.max(W, Math.min(BULGE_MAX, Math.abs(sid) + LEG_PAD));
    }
    return { y, c: c0, f, s, W: W * U, Df: Df * U, Db: Db * U };
  };
  /** A point on a ring, `a` radians round it: 0 to his right, π/2 straight ahead of him, π to his left. */
  const ringAt = (r: Ring, a: number): P3 => {
    const ca = Math.cos(a), sa = Math.sin(a), D = sa >= 0 ? r.Df : r.Db;
    return [r.c[0] + r.s[0] * r.W * ca + r.f[0] * D * sa, r.y, r.c[1] + r.s[2] * r.W * ca + r.f[2] * D * sa];
  };
  const fractions = [0, 0.03, 0.1, 0.2, 0.35, 0.5, 0.68, 0.85, 1];
  const rings = fractions.map(fr => makeRing(yNeck + (yHem - yNeck) * fr));
  /** For each ring, the angle round it where the wall turns from facing the viewer to facing away (its silhouette): the near half is centred on `toward + π`. */
  const sils = rings.map(r => {
    const lk = look3At([r.c[0], r.y, r.c[1]]), D = (r.Df + r.Db) / 2;
    return Math.atan2(dot(lk, r.f) / D, dot(lk, r.s) / r.W);
  });
  /** The silhouette angle at any height, between the rings'. */
  const silAt = (y: number) => {
    for (let k = 0; k + 1 < rings.length; k++) {
      if (y <= rings[k].y && y >= rings[k + 1].y) {
        const t = (rings[k].y - y) / Math.max(1e-9, rings[k].y - rings[k + 1].y);
        return sils[k] + wrap(sils[k + 1] - sils[k]) * t;
      }
    }
    return y > rings[0].y ? sils[0] : sils[sils.length - 1];
  };
  /** An angle on a wall pulled onto the half that faces the viewer (so what is laid on the wall never shows through it). */
  const nearClamp = (a: number, sil: number) => sil + Math.PI + Math.max(-Math.PI / 2, Math.min(Math.PI / 2, wrap(a - (sil + Math.PI))));
  /** Whether a point of the wall, `a` round it, faces the viewer. */
  const faces = (a: number, sil: number, slack = 0.03) => Math.abs(wrap(a - (sil + Math.PI))) < Math.PI / 2 - slack;
  const N = rings.length - 1;
  const arc = (r: Ring, from: number, steps = 20) => Array.from({ length: steps + 1 }, (_, i) => ringAt(r, from + (Math.PI * i) / steps));
  const wall = (side: 0 | 1) => {
    // side 0: the near wall (from the silhouette round through the near half); side 1: the far wall.
    const off = side === 0 ? Math.PI / 2 : -Math.PI / 2;
    const left = rings.map((r, k) => ringAt(r, sils[k] + off)), right = rings.map((r, k) => ringAt(r, sils[k] + off + Math.PI));
    return [...left, ...arc(rings[N], sils[N] + off).slice(1), ...right.reverse(), ...arc(rings[0], sils[0] + off).reverse().slice(1)];
  };
  const mid2 = rings[Math.floor(N / 2)], midSil = sils[Math.floor(N / 2)];
  // The near wall is drawn over the body parts inside it, the far one under them.
  const inside = Math.min(seen.neck.depth, seen.pelvis.depth), insideFar = Math.max(seen.neck.depth, seen.pelvis.depth);
  const nearDepth = Math.min(see(ringAt(mid2, midSil + Math.PI)).depth, inside) - 0.0005;
  const farDepth = Math.max(see(ringAt(mid2, midSil)).depth, insideFar) + 0.0005;
  parts.push({ key: "cloak-far", depth: farDepth, node: <polygon key="cloak-far" points={pts(wall(1))} className="fig-cloak fig-cloak-shade" /> });
  parts.push({ key: "cloak-near", depth: nearDepth, node: <polygon key="cloak-near" points={pts(wall(0))} className="fig-cloak" /> });
  /** Something laid on the near wall, just over it. */
  const onWall = (key: string, node: ReactNode, over: number) => parts.push({ key, depth: nearDepth - over, node });
  // Folds down the cloak, the ones that face the viewer; and the wax-crusted hem along its bottom edge.
  for (const [n, a] of [-1.2, -0.55, 0.55, 1.2, Math.PI - 0.9, Math.PI + 0.9].entries()) {
    const run = rings.filter((_, k) => k >= 2 && faces(a + Math.PI / 2, sils[k])).map(r => ringAt(r, a + Math.PI / 2));
    if (run.length >= 2) onWall(`fold${n}`, <polyline key={`fold${n}`} points={pts(run)} className="fig-cloak-fold" />, 0.0003);
  }
  onWall("hem", <polyline key="hem" points={pts(arc(rings[N], sils[N] + Math.PI / 2))} className="fig-cloak-wax" />, 0.0003);
  // The wax drool down his chest, from the collar, where it faces the viewer.
  {
    const run = rings.slice(0, 5).filter((_, k) => faces(Math.PI / 2, sils[k])).map(r => ringAt(r, Math.PI / 2));
    if (run.length >= 2) onWall("drool", <polyline key="drool" points={pts(run)} className="fig-cloak-wax" />, 0.0004);
  }

  /* ---------- The rip on his left side ---------- */
  // A wax seam from the armpit to the hip, and below it the gape, which widens to the hem: the lining shows in it, and his left leg.
  const armpitY = yNeck - 5 * U, hipY = Math.max(yHem + 4 * U, pel[1] - 2 * U);
  const LEFT = Math.PI;
  {
    const ys = Array.from({ length: 8 }, (_, i) => armpitY + ((hipY - armpitY) * i) / 7);
    const seam = ys.filter(y => faces(LEFT, silAt(y))).map(y => ringAt(makeRing(y), LEFT));
    if (seam.length >= 2) onWall("rip-seam", <polyline key="rip-seam" points={pts(seam)} className="fig-cloak-wax" />, 0.001);
    const down = Array.from({ length: 9 }, (_, i) => hipY + ((yHem - hipY) * i) / 8);
    const half = (y: number) => GAPE * Math.pow(clamp01((hipY - y) / Math.max(1e-6, hipY - yHem)), 0.8);
    const front = down.map(y => ringAt(makeRing(y), nearClamp(LEFT - half(y), silAt(y)))), back = down.map(y => ringAt(makeRing(y), nearClamp(LEFT + half(y), silAt(y))));
    const gape = [...front, ...back.reverse()];
    // (only if some of it faces the viewer: a gape on the far side is not seen, nor his leg through it)
    const shown = down.some(y => faces(LEFT, silAt(y), -0.2));
    if (shown) {
      onWall("rip-gape", <polygon key="rip-gape" points={pts(gape)} className="fig-cloak-inside" />, 0.0006);
      bones("legL", ["hipL", "kneeL", "footL"], "fig-limb", LIMB);
      const leg = parts.find(p => p.key === "legL");
      if (leg) {
        leg.depth = nearDepth - 0.0009;
        leg.node = <g key="legL" clipPath={`url(#${clip})`}><clipPath id={clip}><polygon points={pts(gape)} /></clipPath>{leg.node}</g>;
      }
    }
  }

  /* ---------- Arms ---------- */
  const farOf = (base: string, ...js: P3[]) => (js.reduce((n, p) => n + see(p).depth, 0) / js.length > mid + 0.02 ? `${base} ${base}-far` : base);
  // His right arm (the flail's): a grey sleeve.
  bones("R-sleeve", ["shoulderR", "elbowR", "handR"], `${farOf("fig-sleeve", j.shoulderR, j.elbowR, j.handR)}${debug ? " dbg-red" : ""}`, SLEEVE);
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
  parts.push({ key: "hood", depth: hs.depth - 0.01, node: <circle key="hood" cx={X(hs)} cy={Y(hs)} r={HOOD_R * kh} className="fig-hood" /> });
  {
    // His neck only reaches the bottom of the hood (not up into the face, which sits in its opening), and lies under the hood whichever way he is seen.
    const dirN = unit(minus(headAt, j.neck)), end = see(plus(headAt, dirN, -HEAD_R * 0.7 * U));
    bones("neck", ["neck", end], "fig-sleeve", LIMB * 1.4);
    const neck = parts.find(p => p.key === "neck");
    if (neck) neck.depth = Math.max(neck.depth, hs.depth + 0.002);
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
    const f = unit(look), sideA = unit(cross(UP, f)), upA = unit(cross(f, sideA));
    const gaze3 = unit(plus(f.map(v => v * Math.cos(OPENING_TIP)) as unknown as P3, upA, -Math.sin(OPENING_TIP)));
    const sideC = unit(cross(UP, gaze3)), upC = unit(cross(gaze3, sideC));
    // (Seen from the side the opening is still there: its edge is cut to the half of the hood that faces the viewer, a point of it round the back being pulled
    // onto the hood's outline instead, so what shows is the part of the opening that is on the near side.)
    const headLook = look3At(headAt);
    const dirs = Array.from({ length: 72 }, (_, i) => (i / 72) * Math.PI * 2).map(a => unit(plus(plus(gaze3, sideC, Math.tan(OPENING_HALF) * Math.cos(a)), upC, Math.tan(OPENING_HALF) * Math.sin(a))));
    const inside = (v: P3) => { const g = dot(v, gaze3); return g > 0 && (dot(v, sideC) / g) ** 2 + (dot(v, upC) / g) ** 2 < Math.tan(OPENING_HALF) ** 2; };
    const capDirs = visibleCap(dirs, headLook, inside);
    if (capDirs.length) {
      /** The part of the opening that faces the viewer, laid on a ball round the head of this radius. */
      const cap = (radius: number) => capDirs.map(d => see(plus(headAt, d, radius * U)));
      // (the hood's round, with its hollow inside black; and, set back inside it, the face's own round, a smaller ball: the same opening laid on it. Seen from in front
      // the face fills all but a rim of the opening; from the side the two shift against each other, and the dark of the inside shows between them.)
      const ring = cap(HOOD_R), faceCap = cap(HEAD_R);
      // (all of it inside the hood's own outline: its edge is worked out for a ball seen from the middle of the head, and in perspective may stray a hair past it)
      const hoodClip = `${clip}-hood`;
      parts.push({ key: "hood-dark", depth: hs.depth - 0.012, node: <g key="hood-dark" clipPath={`url(#${hoodClip})`}><clipPath id={hoodClip}><circle cx={X(hs)} cy={Y(hs)} r={HOOD_R * kh} /></clipPath><polygon points={ring.map(p => `${X(p)},${Y(p)}`).join(" ")} className="fig-hood-dark" /></g> });
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
              {eyes}
            </g>
          </g>
        ),
      });
    }
    // His beak: the top half of a cone of wax, low on the face (under his eyes, by the mouth), pointing the way he looks, a little down. The curved top
    // is the cone's own surface (its base a half circle, drawn in many short steps, so it is round, not faceted); the underside is flat, a triangle from the tip
    // to the base's straight edge, in a darker wax. Whichever of the two faces the viewer is drawn over the other.
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
    const arc = Array.from({ length: 25 }, (_, i) => (Math.PI * i) / 24).map(t => see(onFace(plus(plus(baseAt, sideB, Math.cos(t) * R), upB, Math.sin(t) * R))));
    const straight = Array.from({ length: 13 }, (_, i) => see(onFace(plus(baseAt, sideB, R * (1 - i / 6))))); // (the base's straight edge, from one side to the other)
    const tipS = see(tipAt);
    const curved = hull([...arc, tipS].map(p => [X(p), Y(p)] as [number, number]));
    const lk = look3At(baseAt), flatFaces = dot([-upB[0], -upB[1], -upB[2]], lk) < 0;

    const depth = (see(baseAt).depth + tipS.depth) / 2 - 0.0005;
    // (his face turned toward the viewer, even only just: the beak stands out in front of the hood's dark and of the face, not under them)
    const inFront = dot(f, headLook) < 0.15 ? Math.min(depth, hs.depth - 0.0135) - depth : 0;
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

  /* ---------- Which side of the cloak an arm is on ---------- */
  // An arm hangs by the body, and the near wall of the cloak would hide one that is on the viewer's side: it is drawn over the wall instead (all its parts
  // together, the flail with the right arm), unless it is up beside his head, where the hood decides. One behind the body stays under the wall.
  const axisDepth = (seen.neck.depth + seen.pelvis.depth) / 2;
  const over = nearDepth - 0.002;
  const lifted = (prefix: string, ...at: P3[]) => {
    if (at.reduce((n, p) => n + see(p).depth, 0) / at.length >= axisDepth || (prefix === "R-" && j.handR[1] > yNeck) || (prefix === "L-" && j.handL[1] > yNeck)) return;
    const group = parts.filter(p => p.key.startsWith(prefix));
    const low = Math.min(...group.map(p => p.depth));
    if (low > over) for (const p of group) p.depth += over - low;
  };
  lifted("R-", j.shoulderR, j.elbowR, j.handR);
  lifted("L-", j.shoulderL, j.elbowL, j.handL);

  /* ---------- His head is always over his cloak ---------- */
  // The cloak's near wall is drawn nearer than his head's middle (it is as thick as the cloak is deep), so wherever it overlaps the hood on the screen (from behind
  // or from below, as the camera goes round) it would cover it. But his hood is above the cloak, never under it: the whole head (hood, its point, the dark
  // and the face, the beak) is brought just over the near wall, all together so their order is kept, and an arm or the flail that was in front of it, up beside his head, goes with it.
  {
    const headKeys = new Set(["hood", "hood-point", "hood-dark", "hood-face", "beak", "beak-flat", "beak-line"]);
    const headParts = parts.filter(p => headKeys.has(p.key));
    const target = nearDepth - 0.003, lowest = Math.min(...headParts.map(p => p.depth));
    if (lowest > target) {
      const delta = target - lowest, hoodWas = hs.depth - 0.01;
      for (const p of headParts) p.depth += delta;
      for (const p of parts) if ((p.key.startsWith("R-") || p.key.startsWith("L-")) && p.depth < hoodWas) p.depth += delta;
    }
  }

  return <FlailFire.Provider value={!!flailFire}><Figure3DSvg parts={parts} title={title} className={className} /></FlailFire.Provider>;
}

/** How high the dropped flail's head lies (figure units), and the radius of the flail's whirl: the chain's length. */
const HEAD_REST_Y = 6, CHAIN_R = 34;

/** The Warden, worked out again only when something it is drawn from has changed (`sameDrawing`). */
export const Warden3D = memo(Warden3DView, sameDrawing);
