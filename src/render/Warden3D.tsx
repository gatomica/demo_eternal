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
import { Fragment, memo, type ReactNode, useContext, useEffect, useId, useState } from "react";
import { type Cam, METERS_PER_UNIT as U, type Vec } from "./camera";
import { DebugLimbsContext } from "./debugLimbs";
import { visibleCap } from "./hoodCap";
import { canvas3d, Figure3DSvg, sameDrawing, trailPart } from "./figure3d";
import type { PoseName } from "./poses";
import { type P3, ribcageOf, swingArc } from "./rig3d";
import { FlailFire, type CandleArm, WARDEN_POSES, type WardenPoseName } from "../warden/skeleton";
import { LittleFlame, LittleKnot } from "./LittleFlame";
import { CANDLE_FIST, FLAIL_CHAIN, flail3, isWardenPose, PELVIS_MIDDLE, PELVIS_TOP_HEIGHT, placeWarden, SPINE_IN, WARDEN_STANCE, wardenFlame, wardenRig } from "../warden/pose3d";

/** His hood's round and the thickness of his limbs (figure units, before perspective). */
/** The hood's opening: its hem, pulled down over his eyes, hangs this far below where he looks at the front (radians) and this far below the level of his head at the back of his neck; his face's size and its two eyes (how far either side of where he looks, radians, and their size). */
const BROW = 0.05, NAPE = 1.2, HEAD_R = 7.5, EYE_APART = 0.42, EYE_R = 1.8, BEAK_R = 5.2, BEAK_LEN = 8.5, BEAK_DOWN = 0.5;
/** Her ribcage, one smooth egg: how far its top is tipped back and its bottom forward (radians), how wide it is across and how deep front to back (shares of the usual ribcage's), and how far its middle is moved forward (a share of that depth) and up (a share of the ribcage's half height; the fullness sits higher on the chest). */
const RIB_TILT = 0.587, RIB_DEPTH = 1.3, RIB_FORWARD = 0.2, RIB_RAISE = 0.12, RIB_WIDTH = 1;
/** How much wider (and deeper) its bottom is than its top: the egg's section at the bottom end of its axis is this much bigger than the plain ellipsoid's, and as much smaller at the top (a share). */
const RIB_EGG = 0.3;
/** Narrower side to side (not front to back), more so toward its bottom: at its middle, and at its bottom, these shares of the width it would have
 *  (`Egg.narrow`). */
const RIB_NARROW = { mid: 0.88, low: 0.8 };
/** How tall it is, a share of the usual ribcage's height (its widths stay as they are): shorter at both ends, about its middle. */
const RIB_HEIGHT = 0.88;
/** And smaller all over but across: its height and depth this share of what they would be (its width side to side as it is). The tilt (`RIB_TILT`, 0.25
 *  before) was raised to make up for it, so her bust reaches as far forward as it did. */
const RIB_SIZE = 0.9;
/** Its upper half reaches on, tipped back less than its lower half, up by her neck (nearly where its top was before it was made smaller and tilted, which was
 *  0.25: a little more tilt than that keeps its front an egg's, curving out all the way, not dipping in above the bust like a pear's). */
const RIB_TOP_TILT = 0.32;
/** How gradual the bend between its two halves is: the axis eases from one to the other from this far below its middle to as far above (a share of its half
 *  height), so the surface (and the toga's opening cut across it) runs smooth there. */
const RIB_BEND = 1;
/** Her pelvis, an egg leaned the other way (its lower half as `PELVIS_TILT` and `PELVIS_HEIGHT` say; its upper half bends at the middle, leaning less, `PELVIS_TOP_TILT`, and reaching higher, `PELVIS_TOP_HEIGHT`, up into the bust) (its top forward, its bottom back, radians): its width as a share of what reaches both hip joints (its section at the pelvis is as wide as the hips are, and a leg's thickness more), its depth as a share of the ribcage's, its half height as a share of the spine's length, and where its middle is along the spine (a share of it up from the pelvis), and how much wider its bottom is than its top, front to back and (less, so its top is wide) side to side. */
const PELVIS_TILT = 0.3, PELVIS_TOP_TILT = 0.22, PELVIS_WIDTH = 1, PELVIS_DEPTH = 1.2, PELVIS_HEIGHT = 0.75, PELVIS_EGG = 0.3, PELVIS_EGG_W = 0.1;
/** How thick her thigh is at the hip (figure units); it thins to a limb's thickness at the knee. */
const THIGH_R = 4;
/** Her thighs are fuller at their backs: a second run of rounds along each, set this far behind the bone and this big (shares of the thigh's thickness there),
 *  at the hip; toward the knee it eases back into the thigh itself, so at the knee the thigh is as thick as the shin it meets. */
const THIGH_BACK = { off: 0.45, size: 0.85 };
/** The fuller back's round at a share `t` of the way from the knee (0) to the hip (1): how far behind the bone, and how big, as shares of the thigh's thickness there. */
const thighBackAt = (t: number) => { const c = Math.max(0, Math.min(1, t)), w = c * c * (3 - 2 * c); return { off: THIGH_BACK.off * w, size: 1 - (1 - THIGH_BACK.size) * w }; };
/** Her robe's top: how much bigger than the ribcage it stands (a share), and its opening on her right, a round hole like the hood's laid on the egg: its middle's height
 *  (-1 the bottom of the ribcage's egg, 1 its top) and angle round (0 her side, π/2 her front, so negative is behind her side), and how far it reaches each way (the height
 *  share, and radians round): from the right of her neck, down past the armpit, to the side of her bust, and round to the middle of her back. */
const ROBE_GAP = 0.08;
/**
 * The toga's opening on her right: a plane cutting the robe over her chest, square to this way (along the egg's side, up and front: out to her right, a little up)
 * and standing at this share of the egg's reach that way. Everything beyond it is bare: its highest point a little above the top of her shoulder (the robe's point nearest
 * the top of her arm, half the arm's thickness above the shoulder joint), and from there it runs down round the arm's root, her armpit bare, to the side of her bust.
 * Clear of her neck and the middle of her back.
 */
const TOGA_CUT = { n: [1, 0.3, 0] as [number, number, number], at: 0.8 };
/** His neck's cone: its radius at the neck and where it meets the hood (figure units), and how high the band that closes its open front is (a share of the cone's height). */
const CONE_BASE = 4, CONE_TOP = 7.5, CONE_BAND = 0.5, NECK_RAISE = 3;
/** The width of the outline the neck cone's strips are drawn with (`.fig-neck-cone` and `.fig-neck-lining` in index.css; drawing units). */
const CONE_STROKE = 0.6;
/** The opening in the robe's bottom for her left leg: a plane cutting through the pelvis egg, square to this way (her side, up, front: toward her left and down) and standing this share of the egg's reach out that way, so what is beyond it is open. */
const PELVIS_CUT = { n: [-1, -0.45, 0] as [number, number, number], at: 0.45 };
/** Her belt of wax: where it is along the pelvis egg's axis (-1 the bottom, 0 the middle), how tall it is either side of that (the same measure), and how far it stands out of the egg (a share). */
const BELT_AT = -0.15, BELT_HALF = 0.1, BELT_OUT = 1.05;
/** Her skirt: how far above her feet its hem is (figure units) and how much wider it is at the hem than at the belt (a share). */
const SKIRT_HEM = 4, SKIRT_FLARE = 0.18;
/** How far the cloth stands off her right leg where it lies over it (figure units), and how far out the cloth that reaches the floor spreads, as a share of how much of it is left over there. */
const SKIRT_THICK = 0.6, CRUMPLE = 0.6;
/** How far up and down from each joint of the skirt's parts the cloth bends round (a share of the part on either side). */
const SKIRT_JOIN = 0.3;
/** How far (figure units) the simplified skirt may stray from the full one: a ring that lies this close to the straight run of the cloth between its neighbours is left out, and so are
 *  every other column round when the straight edges between the rest stay this close to the cloth's round. */
const SKIRT_TOL = 0.15;
/** The flail: its wax ball's radius, and its chain's links: how long and wide each oval is, how thick its iron, and how far apart the links sit (figure units). */
const FLAIL_BALL = 6.2, LINK_LONG = 3.4, LINK_WIDE = 2.2, LINK_WIRE = 0.8, LINK_PITCH = 2.5;
/** The black iron dome capping the flail's handle, where the chain hangs from: its radius, its height, and how far the short iron sleeve under it, as wide as the
 *  dome, runs down the handle (figure units). */
const DOME_R = 2, DOME_H = 1.7, DOME_SLEEVE = 3;
/** How thick the spine is (figure units). */
const SPINE = 6.5;
/** And how wide it is side to side (figure units): wider than it is thick, a flat oval round. */
const SPINE_WIDE = 9.5;
/** Where her right hand holds the flail, that stretch of the handle is white like the hand: how far it runs either side of the hand, and how thick it is (a little
 *  more than the handle) (figure units). */
/** How big the red knot in his wax hand is in his second form, as the height of the little flame it would be the heart of (figure units). */
const RED_KNOT = 13;
/** How tall the red little flame round the flail's head is while the flail is on fire (figure units). */
const FIRE_FLAME = 28;
const GRIP_HALF = 1.5, GRIP_THICK = 3;
const HOOD_R = 8.9, WAX_SHOULDER = 3.2, WAX_ELBOW = 4.4, FIST = CANDLE_FIST, LIMB = 5;

/** An egg in space: its middle, its three axes, its half sizes along them, and how much wider its bottom is than its top. */
interface Egg { middle: P3; side: P3; up: P3; fwd: P3; halfW: number; halfD: number; halfH: number; taper: number;
  /** How much wider its bottom is than its top across (side to side), if that is not the same as front to back. */
  taperW?: number;
  /** Narrower side to side, more so toward its bottom: `mid` of the width it would have at its middle and `low` at its bottom (shares), and on in the same
   *  straight line above (a share that changes steadily along it, so the outline stays an egg's, curving out everywhere, never pinched in like a pear's). */
  narrow?: { mid: number; low: number };
  /** A different axis for its upper half (above its middle): the egg then bends there, its top reaching on along its own way and height. With `blend`, the
   *  bend is gradual, the axis easing from the lower half's to the upper half's from this far below its middle to as far above it (a share of the half height),
   *  so the surface has no crease there. */
  upper?: { up: P3; fwd: P3; halfH: number; blend?: number } }

type Box = { x: number; y: number; w: number; h: number };

export interface Warden3DProps {
  pose: PoseName;
  /** His candle arm: lit, out or scorched. */
  arm?: CandleArm;
  /** Phase two's look: the wax fading to and fro between its colour and the knot's red, burning inside (the `svg.wd-phase2` styles). */
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
  /** Lifted this far off the floor (meters): in the air, mid-jump. */
  rise?: number;
  /** The pose he has just moved on from, while what it left behind still shows (Clutch Arm's rewaxing trail). */
  lingerFrom?: WardenPoseName;
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

/**
 * What of his body depends only on his pose, not on the camera: his eggs' surface points, the cuts and openings in the robe, the skirt's rings and their
 * simplified grid, the belt. Worked out the first time a pose is drawn and kept with it (`wardenRig` gives the same rig for a pose every time), so a frame
 * only projects these through the camera and decides what faces the viewer.
 */
class PoseGeometry {
  private kept = new Map<string, unknown>();
  get<T>(key: string, make: () => T): T {
    if (!this.kept.has(key)) this.kept.set(key, make());
    return this.kept.get(key) as T;
  }
}
const poseGeometry = new WeakMap<object, PoseGeometry>();
const geometryOf = (wr: object): PoseGeometry => {
  let g = poseGeometry.get(wr);
  if (!g) poseGeometry.set(wr, g = new PoseGeometry());
  return g;
};

function Warden3DView({ pose, arm = "lit", phase2Look, flailFire, dead, charred, title, cam, at, yaw, scale = 1, rise = 0, lingerFrom, w, h, box }: Warden3DProps) {
  const clip = `wd3${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const debug = useContext(DebugLimbsContext);
  // (Dead, she kneels in `wd-dead`, fully encased in wax under her robes.)
  const { wr, placed } = placeWarden(dead ? "wd-dead" : pose, at, yaw, cam, w, h, scale, rise);
  // (his right arm and her left leg are always the one white: the robe's opening shows them, and with the robe on nothing white is beside them for the far-limb shade
  // to tell them from. What stays under the robe, her right leg, is always in the shade.)
  const c = canvas3d(placed, box, { unshaded: key => key === "R-arm" || key === "legL" || key === "neck" });
  const { seen, see, X, Y, scaleAt, depthOf, parts, bones, ball, behind } = c;
  const j = wr.rig.joints;
  const geo = geometryOf(wr);
  // (his second form's look, for the scene that ignites it and for the rest of the fight, his candle arm scorched)
  const className = `wd-figure${phase2Look || arm === "scorched" ? " wd-phase2" : ""}${flailFire ? " wd-flaming" : ""}${dead ? " wd-encased" : ""}${dead && charred ? " is-charred" : ""}`;
  const pts = (ps: P3[]) => ps.map(p => { const q = see(p); return `${X(q)},${Y(q)}`; }).join(" ");
  /** The way the viewer looks at a point, in body space: where depth grows fastest. */
  const look3At = (p: P3): P3 => {
    const d0 = see(p).depth;
    return unit([0, 1, 2].map(i => see(plus(p, [0, 1, 2].map(k => (k === i ? 0.01 : 0)) as unknown as P3)).depth - d0) as unknown as P3);
  };
  /** The cylinder trick: of a band round a rod from `a` to `b` (radius `r`, figure units), the half of its outside that faces the viewer, as one outline: along
   *  the near half of the circle round `a`, then back along the near half of the circle round `b`. Its two edges curve as a cylinder's do, and the rest of it,
   *  turned away, is never drawn. */
  const nearBand = (a: P3, b: P3, r: number): P3[] => {
    const axis = unit(minus(b, a)), t = Math.abs(axis[1]) < 0.9 ? UP : ([1, 0, 0] as P3), e0 = unit(cross(axis, t)), e1 = cross(axis, e0), look = look3At(mix(a, b, 0.5));
    // (the way round that faces the viewer most, and the half circle either side of it)
    const face = Math.atan2(-dot(e1, look), -dot(e0, look)), STEPS = 12;
    const half = (c: P3) => Array.from({ length: STEPS + 1 }, (_, i) => { const ang = face - Math.PI / 2 + (Math.PI * i) / STEPS; return plus(plus(c, e0, Math.cos(ang) * r * U), e1, Math.sin(ang) * r * U); });
    return [...half(a), ...half(b).reverse()];
  };
  /** The flail's head: a ball of wax, lit from above (its top half lighter, wherever it is seen from), with no outline. Set alight, a big red little flame wraps it. */
  const waxBall = (key: string, c: P3, fire: boolean, motion?: P3) => {
    const q = see(c), k = scaleAt(q), x = X(q), y = Y(q), r = FLAIL_BALL * k;
    // (where its top is on the screen, from its middle: seen from the side a whole radius up, seen from above at its middle)
    const top = see(plus(c, UP, FLAIL_BALL * U)), tx = X(top) - x, ty = Y(top) - y, id = `${clip}-${key}`;
    parts.push({
      key, depth: q.depth - 0.003,
      node: (
        <g key={key}>
          <clipPath id={id}><circle cx={x} cy={y} r={r} /></clipPath>
          <circle cx={x} cy={y} r={r} className="fig-ball-wax" />
          <circle cx={x + tx * 0.35} cy={y + ty * 0.35} r={r * 0.9} className="fig-ball-lit" clipPath={`url(#${id})`} />
        </g>
      ),
    });
    // On fire: a big red little flame round it, with no knot (the middle of its round part on the ball's), over the ball and the chain's end, which show through it.
    if (fire) {
      // Where the head is going (`motion`, a way in space): the flame's wick trails behind it, streaming back the other way and stretched, as a flame does on something swung through the air.
      const base = y + 0.34 * FIRE_FLAME * k;
      let lean = "";
      if (motion) {
        const ahead = see(plus(c, motion, 5 * U)), vx = X(ahead) - x, vy = Y(ahead) - y, vl = Math.hypot(vx, vy);
        if (vl > 1e-6) lean = `translate(${x} ${base}) rotate(${(Math.atan2(-1.1 * vx / vl, 0.8 + 1.1 * vy / vl) * 180) / Math.PI}) scale(1 1.3) translate(${-x} ${-base})`;
      }
      const flame = <LittleFlame x={x} y={base} height={FIRE_FLAME * k} red knot={false} />;
      parts.push({ key: `${key}-fire`, depth: q.depth - FLAIL_BALL * U * 1.5, node: lean ? <g key={`${key}-fire`} transform={lean}>{flame}</g> : <Fragment key={`${key}-fire`}>{flame}</Fragment> });
    }
  };

  /** The black iron dome on the end of the handle from `butt` to `tip`, on a short sleeve of iron as wide as it running back down the handle (like a band, so the
   *  cap looks long and straight along the handle): one shape, its outline the hull of the sleeve's lower rim and the dome's curved top. The sleeve is a hollow
   *  ring, like the belt: its far side is never seen. Seen into its open end, the handle is outside the sleeve up to that end, so over the iron there, and
   *  through the opening only the dark inside round the handle shows. Gives back the dome's top, where the chain hangs from. */
  const dome = (key: string, butt: P3, tip: P3): P3 => {
    const axis = unit(minus(tip, butt)), t = Math.abs(axis[1]) < 0.9 ? UP : ([1, 0, 0] as P3), e0 = unit(cross(axis, t)), e1 = cross(axis, e0), skin: [number, number][] = [];
    const rim = (r: number) => Array.from({ length: 24 }, (_, m) => {
      const b = (m / 24) * Math.PI * 2;
      return plus(plus(plus(tip, axis, -DOME_SLEEVE * U), e0, Math.cos(b) * r * U), e1, Math.sin(b) * r * U);
    });
    for (let i = 0; i <= 4; i++) for (let m = 0; m < 16; m++) {
      const a = (i / 4) * (Math.PI / 2), b = (m / 16) * Math.PI * 2, r = Math.cos(a) * DOME_R * U;
      const q = see(plus(plus(plus(tip, axis, Math.sin(a) * DOME_H * U), e0, Math.cos(b) * r), e1, Math.sin(b) * r));
      skin.push([X(q), Y(q)]);
    }
    for (const p of rim(DOME_R)) { const q = see(p); skin.push([X(q), Y(q)]); }
    // (its open end faces the viewer when they look along the handle from the butt's side)
    const mouth = dot(axis, look3At(tip)) > 0, id = `${clip}-${key}-mouth`, a = see(butt), b = see(tip), m = see(plus(tip, axis, -DOME_SLEEVE * U));
    // (over the iron, the handle is drawn back from the opening only as far as the sleeve can reach on the screen, so it stays under her hand further down)
    const out = see(plus(tip, axis, -(DOME_SLEEVE + 3 * DOME_R) * U));
    const haft = { strokeWidth: 2.6 * scaleAt(a, b) };
    // (the handle goes into the sleeve, so the iron is always over the wood)
    parts.push({
      key, depth: Math.min(see(plus(tip, axis, ((DOME_H - DOME_SLEEVE) / 2) * U)).depth, ...parts.filter(x => x.key.endsWith("-handle")).map(x => x.depth)) - 0.0005,
      node: (
        <g key={key}>
          <path d={smooth(hull(skin))} className="fig-flail-dome" />
          {mouth && (
            <>
              <clipPath id={id}><polygon points={pts(rim(DOME_R - 0.35))} /></clipPath>
              <polygon points={pts(rim(DOME_R - 0.35))} className="fig-flail-dome-in" />
              {/* (the handle up to the opening, over the sleeve, cut square there; past it, only within the opening) */}
              <line x1={X(out)} y1={Y(out)} x2={X(m)} y2={Y(m)} className="fig-flail-haft" style={{ ...haft, strokeLinecap: "butt" }} />
              <line x1={X(a)} y1={Y(a)} x2={X(b)} y2={Y(b)} className="fig-flail-haft" style={haft} clipPath={`url(#${id})`} />
            </>
          )}
        </g>
      ),
    });
    return plus(tip, axis, DOME_H * U);
  };


  /* ---------- The body under the robe ---------- */
  // (the robe is gone, to be modelled again in parts; this is the body it will go over: a woman's, two smooth eggs, no ribs drawn. The ribcage is an egg on the spine,
  // its top tipped back and its bottom brought forward, so that seen from the side it is full and rounded low on the front, as a bust hangs, and slopes back above.
  // The pelvis is an egg leaned the other way, its top forward and its round bottom back: its narrow top is the waist, going up under the ribcage, and its full
  // bottom her hips and seat. Then both legs)
  /** An egg in space (convex, so its outline on the screen is the hull of its surface's points, drawn as a smooth curve): its sections along its axis are an ellipse's, each
   *  scaled by how far down it is, wider below the middle and narrower above. */
  const eggRing = (u: number, taper: number) => Math.sqrt(Math.max(0, 1 - u * u)) * (1 - taper * u * (1 - 0.3 * u * u));
  /** An egg's section across (side to side) at `u`, as a share of its half width: its own taper across, and narrowed (`narrow`), steadily along it. */
  const ringAcross = (E: Egg, u: number) => {
    const ring = eggRing(u, E.taperW ?? E.taper), n = E.narrow;
    return n ? ring * (n.mid + (n.mid - n.low) * u) : ring;
  };
  /** A point on an egg's surface: `u` along its axis (-1 the bottom, 1 the top), `a` round it (0 to its side, π/2 to its front). */
  /** An egg's axis at `u`: its own, or above its middle its upper half's (eased from one to the other across the bend, when it has a `blend`). */
  const axisAt = (E: Egg, u: number): { up: P3; fwd: P3; halfH: number } => {
    const T = E.upper;
    if (!T) return { up: E.up, fwd: E.fwd, halfH: E.halfH };
    if (!T.blend) return u > 0 ? T : { up: E.up, fwd: E.fwd, halfH: E.halfH };
    const c = Math.max(0, Math.min(1, (u + T.blend) / (2 * T.blend))), w = c * c * (3 - 2 * c);
    return { up: unit(mix(E.up, T.up, w)), fwd: unit(mix(E.fwd, T.fwd, w)), halfH: E.halfH + (T.halfH - E.halfH) * w };
  };
  const eggPoint = (E: Egg, u: number, a: number): P3 => {
    const ring = eggRing(u, E.taper), ringW = ringAcross(E, u), A = axisAt(E, u);
    return [0, 1, 2].map(i => E.middle[i] + A.up[i] * A.halfH * u + E.side[i] * E.halfW * ringW * Math.cos(a) + A.fwd[i] * E.halfD * ring * Math.sin(a)) as unknown as P3;
  };
  /** The way a point of an egg's surface faces (a unit vector out of it), from the surface's true slope, the cross of the two ways along it. The slope matters: an egg that widens
   *  toward its bottom has a lower half that tilts up to a viewer above it, which a plain "outward from the axis" would count as turned away. */
  const eggNormal = (E: Egg, u: number, a: number): P3 => {
    const e = 0.01, uu = Math.max(-1 + e, Math.min(1 - e, u));
    const du = minus(eggPoint(E, uu + e, a), eggPoint(E, uu - e, a)), da = minus(eggPoint(E, uu, a + e), eggPoint(E, uu, a - e));
    let nrm = unit(cross(du, da));
    const out = minus(eggPoint(E, uu, a), eggPoint({ ...E, halfW: 0, halfD: 0 }, uu, a));
    if (dot(nrm, out) < 0) nrm = [-nrm[0], -nrm[1], -nrm[2]];
    return nrm;
  };
  /** How much a point of an egg's surface faces the viewer (positive: toward them, 1 square on). */
  const eggFacing = (E: Egg, u: number, a: number, look: P3): number => -dot(eggNormal(E, u, a), look);
  /** How far a point is outside an egg (above 0: outside, below: inside), roughly, in shares of its size. (Above its middle, a bent egg's upper half's axis.) */
  const outsideOf = (E0: Egg, p: P3): number => {
    const d = minus(p, E0.middle), E = E0.upper && dot(d, E0.upper.up) > 0 ? { ...E0, ...E0.upper } : E0, u = dot(d, E.up) / E.halfH;
    if (Math.abs(u) >= 1) return u * u - 1;
    const s = dot(d, E.side) / (E.halfW * Math.max(1e-3, ringAcross(E, u))), f = dot(d, E.fwd) / (E.halfD * Math.max(1e-3, eggRing(u, E.taper)));
    return Math.max(s * s + f * f - 1, u * u - 1);
  };
  /** Whether a point is in sight past an egg (above 0) or behind it (below): how far outside the egg the line from it toward the viewer stays, at its closest. */
  const clearOf = (E: Egg, p: P3, viewer?: P3): number => {
    const toViewer = viewer ?? look3At(p), reach = 2.5 * Math.max(E.halfH, E.halfW, E.halfD), STEPS = 24;
    let least = Infinity;
    for (let s = 0; s <= STEPS; s++) least = Math.min(least, outsideOf(E, plus(p, toViewer, (-reach * s) / STEPS)));
    return least;
  };
  /** An egg's outline on the screen (the hull of its surface's points, as a smooth curve). Its points are the same in every frame of a pose (kept); an egg is asked for
   *  more than once a frame (the thigh's mask), so each is outlined once. */
  const outlines = new Map<string, string>();
  const eggOutline = (E: Egg, key: string) => {
    let d = outlines.get(key);
    if (d === undefined) {
      const surface = geo.get(`skin:${key}`, () => Array.from({ length: 21 }, (_, n) => -Math.cos((Math.PI * n) / 20)).flatMap(u => Array.from({ length: 36 }, (_, m) => eggPoint(E, u, (m / 36) * Math.PI * 2))));
      d = smooth(hull(surface.map(p => { const q = see(p); return [X(q), Y(q)] as [number, number]; })));
      outlines.set(key, d);
    }
    return d;
  };
  const egg = (key: string, E: Egg, cls = "fig-ribcage", over = 0) => {
    parts.push({ key, depth: see(E.middle).depth - over, node: <path key={key} d={eggOutline(E, key)} className={cls} /> });
  };
  /** A plane cutting an egg (`cutOpening`): positive where a point of its surface is beyond it. */
  const cutPlane = (E: Egg, at: { n: [number, number, number]; at: number }, key: string) => {
    // (the plane and how far the egg reaches along it: the same every frame of a pose)
    const { n, reach } = geo.get(`cut:${key}`, () => {
      const n = unit([0, 1, 2].map(i => E.side[i] * at.n[0] + E.up[i] * at.n[1] + E.fwd[i] * at.n[2]) as unknown as P3);
      let reach = 0;
      for (let u = -1; u <= 1; u += 0.1) for (let k = 0; k < 24; k++) reach = Math.max(reach, dot(minus(eggPoint(E, u, (k / 24) * Math.PI * 2), E.middle), n));
      return { n, reach };
    });
    return (u: number, a: number) => (dot(minus(eggPoint(E, u, a), E.middle), n) - reach * at.at) / (reach || 1);
  };
  /** An opening cut in a robe egg by a plane, drawn as skin over it: everything of the egg's surface beyond the plane, which is square to `at.n` (given along the egg's side, up and
   *  front) and stands at `at.at` of the egg's reach that way, seen as the round, ellipse-like edge where a plane meets an egg. Only the part facing the viewer shows.
   *  Its edge is traced as a contour through a fine grid of the egg's surface (marching squares, each crossing placed by interpolation, so it is a smooth line and not
   *  steps), the part beyond the plane and the part facing the viewer being two fields whose smaller is the opening. */
  const cutOpening = (E: Egg, key: string, at: { n: [number, number, number]; at: number }, depth: number, hiddenBy?: Egg) => {
    const beyond = cutPlane(E, at, key), NU = 48, NA = 72, TAU = Math.PI * 2;
    const look = look3At(E.middle);
    /** Positive where the surface is in the opening: beyond the plane, facing the viewer and (with `hiddenBy`) not behind that egg. */
    const field = (u: number, a: number) => {
      const f = Math.min(beyond(u, a), eggFacing(E, u, a, look));
      return f <= 0 || !hiddenBy ? f : Math.min(f, clearOf(hiddenBy, eggPoint(E, u, a), look));
    };
    // (the rows stop just short of the egg's two ends: at an end every point round is the same point, and the field there would be noise)
    const U_END = 0.995, uOf = (i: number) => -U_END + (2 * U_END * i) / NU, aOf = (j: number) => (j / NA) * TAU;
    // (each node of the grid: its point, which way it faces, how far beyond the plane it is. The same every frame of a pose, so kept: a frame only asks which face the viewer)
    const nodes = geo.get(`open:${key}`, () => {
      const out = new Float64Array((NU + 1) * NA * 7);
      for (let i = 0; i <= NU; i++) for (let j = 0; j < NA; j++) {
        const u = uOf(i), a = aOf(j), p = eggPoint(E, u, a), n = eggNormal(E, u, a);
        out.set([p[0], p[1], p[2], n[0], n[1], n[2], beyond(u, a)], (i * NA + j) * 7);
      }
      return out;
    });
    const f: number[] = [];
    for (let i = 0; i <= NU; i++) {
      for (let j = 0; j < NA; j++) {
        const o = (i * NA + j) * 7;
        let v = Math.min(nodes[o + 6], -(nodes[o + 3] * look[0] + nodes[o + 4] * look[1] + nodes[o + 5] * look[2]));
        if (v > 0 && hiddenBy) v = Math.min(v, clearOf(hiddenBy, [nodes[o], nodes[o + 1], nodes[o + 2]], look));
        f.push(v);
      }
    }
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
        else if (hit.length === 4) {
          // (a saddle: the contour crosses all four sides. Which pairs it joins depends on the middle of the cell: if the middle is on the first corner's side, the
          // first and third corners are joined through it, and the second and fourth are each cut off on their own; otherwise the first and third are. The
          // crossings are listed by side, the first side running from the first corner to the second)
          const mid = field(uOf(i + 0.5), aOf(j + 0.5)) > 0;
          if (mid === on[0]) { join(hit[0], hit[1]); join(hit[2], hit[3]); } else { join(hit[3], hit[0]); join(hit[1], hit[2]); }
        }
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
  /** The way to the back of a thigh: across it, square to it and to the line of the hips, away from the way the legs face. */
  const thighBack = (hip: P3, knee: P3): P3 => {
    const d = unit(minus(knee, hip)), hipLine = unit(minus(j.hipR, j.hipL));
    return unit(cross(hipLine, d));
  };
  /** Where the spine meets each egg: near the top of the bottom one, near the bottom of the ribcage's (`SPINE_IN` of the way from the middle to that end). */
  let spineLow: P3 = j.pelvis, spineHigh: P3 = j.waist;
  let skirtOf: Egg | null = null, ribMiddle: P3 = j.waist, pelvisMiddle: P3 = j.pelvis, ribEgg: Egg | null = null, pelvisEgg: Egg | null = null, robeEgg: Egg | null = null, robeDepth = -Infinity;
  {
    const rc = ribcageOf(wr.rig), ct = Math.cos(RIB_TILT), st = Math.sin(RIB_TILT);
    const up = unit([0, 1, 2].map(i => rc.up[i] * ct - rc.fwd[i] * st) as unknown as P3), fwd = unit([0, 1, 2].map(i => rc.fwd[i] * ct + rc.up[i] * st) as unknown as P3);
    const middle = [0, 1, 2].map(i => rc.centre[i] + rc.fwd[i] * rc.halfDepth * RIB_FORWARD + rc.up[i] * rc.halfHeight * RIB_RAISE) as unknown as P3;
    ribMiddle = middle;
    // (its upper half bends at the middle, up to where the top of the larger, less tilted egg was: by her neck)
    const tt = Math.cos(RIB_TOP_TILT), ts = Math.sin(RIB_TOP_TILT);
    const upTop = unit([0, 1, 2].map(i => rc.up[i] * tt - rc.fwd[i] * ts) as unknown as P3), fwdTop = unit([0, 1, 2].map(i => rc.fwd[i] * tt + rc.up[i] * ts) as unknown as P3);
    ribEgg = {
      middle, side: rc.side, up, fwd, halfW: rc.halfWidth * RIB_WIDTH, halfD: rc.halfDepth * RIB_DEPTH * RIB_SIZE, halfH: rc.halfHeight * RIB_HEIGHT * RIB_SIZE, taper: RIB_EGG, narrow: RIB_NARROW,
      upper: { up: upTop, fwd: fwdTop, halfH: rc.halfHeight * RIB_HEIGHT, blend: RIB_BEND },
    };
    egg("ribcage", ribEgg);
    spineHigh = plus(middle, up, -ribEgg.halfH * SPINE_IN);
  }
  {
    // (its axis runs from the pelvis up to the waist, its width along the line of the hips, square to the axis; it reaches a little below the pelvis and above the waist)
    // (standing along the line it stood along before her upper body was pulled back with it, if it was: `pelvisLift`)
    const lift = wr.pelvisLift ?? unit(minus(j.waist, j.pelvis)), line = minus(j.hipR, j.hipL), along = dot(line, lift);
    const side = unit(minus(line, lift.map(v => v * along) as unknown as P3)), fwd0 = unit(cross(side, lift));
    const run = wr.pelvisRun ?? Math.hypot(...minus(j.waist, j.pelvis)), ct = Math.cos(PELVIS_TILT), st = Math.sin(PELVIS_TILT), ctt = Math.cos(PELVIS_TOP_TILT), stt = Math.sin(PELVIS_TOP_TILT);
    // (a pose may tip it back about the pelvis, `pelvisBack`, so it stays round her hips where her legs join it; the spine, from near its top up to the
    // ribcage, then leans forward to meet the chest where it is)
    const tb = ((wr.pelvisBack ?? 0) * Math.PI) / 180, cb = Math.cos(tb), sb = Math.sin(tb);
    const tLift = unit([0, 1, 2].map(i => lift[i] * cb - fwd0[i] * sb) as unknown as P3), tFwd = unit([0, 1, 2].map(i => fwd0[i] * cb + lift[i] * sb) as unknown as P3);
    const up = unit([0, 1, 2].map(i => tLift[i] * ct + tFwd[i] * st) as unknown as P3), fwd = unit([0, 1, 2].map(i => tFwd[i] * ct - tLift[i] * st) as unknown as P3);
    let upTop = unit([0, 1, 2].map(i => tLift[i] * ctt + tFwd[i] * stt) as unknown as P3), fwdTop = unit([0, 1, 2].map(i => tFwd[i] * ctt - tLift[i] * stt) as unknown as P3);
    const middle = plus(j.pelvis, tLift, run * PELVIS_MIDDLE);
    spineLow = plus(middle, tLift, run * PELVIS_TOP_HEIGHT * SPINE_IN);
    // (a pose may swing it toward the spine, the line from its middle up to the ribcage's, `pelvisAlign`: its axis turned that share of the way, both halves,
    // where her chest is turned away from her hips and the spine leans off the hips' own up)
    let upL = up, fwdL = fwd, sideL = side;
    const align = wr.pelvisAlign ?? 0;
    if (align > 0) {
      const spineWay = unit(minus(ribMiddle, middle));
      upL = unit(mix(up, spineWay, align));
      sideL = unit(minus(side, upL.map(v => v * dot(side, upL)) as unknown as P3));
      fwdL = unit(cross(sideL, upL));
      upTop = unit(mix(upTop, spineWay, align));
      fwdTop = unit(cross(unit(minus(sideL, upTop.map(v => v * dot(sideL, upTop)) as unknown as P3)), upTop));
    }
    // (a pose may turn it about its own axis toward her right, `pelvisTurn`: the robe's bottom then does not follow a left leg reaching forward)
    const turnTo = ((wr.pelvisTurn ?? 0) * Math.PI) / 180;
    if (turnTo) {
      const c = Math.cos(turnTo), s = Math.sin(turnTo), turned = (a: P3, b: P3): P3 => [a[0] * c + b[0] * s, a[1] * c + b[1] * s, a[2] * c + b[2] * s];
      const side0 = sideL, fwd0b = fwdL;
      fwdL = turned(fwd0b, side0);
      sideL = turned(side0, [-fwd0b[0], -fwd0b[1], -fwd0b[2]]);
      fwdTop = turned(fwdTop, side0);
    }
    pelvisMiddle = middle;
    // (its section at the pelvis, a little under the middle, must reach out to the outer edge of each hip: the hips' half width and a leg's radius)
    const u0 = -PELVIS_MIDDLE / PELVIS_HEIGHT, at0 = Math.sqrt(1 - u0 * u0) * (1 - PELVIS_EGG_W * u0 * (1 - 0.3 * u0 * u0));
    pelvisEgg = { middle, side: sideL, up: upL, fwd: fwdL, halfW: ((Math.hypot(...line) / 2 + (LIMB / 2) * U) / at0) * PELVIS_WIDTH, halfD: ribcageOf(wr.rig).halfDepth * PELVIS_DEPTH, halfH: run * PELVIS_HEIGHT, taper: PELVIS_EGG, taperW: PELVIS_EGG_W, upper: { up: upTop, fwd: fwdTop, halfH: run * PELVIS_TOP_HEIGHT } };
    egg("pelvis", pelvisEgg, "fig-robe-top");
  }
  // The spine joins the two eggs, from near the top of the bottom one to near the bottom of the ribcage (`spineLow`, `spineHigh`). The robe will hide it from
  // every side; it is here to keep the body's proportions and lengths true when it twists and bends (the eggs move on its ends).
  // (a tube with an oval round, wider side to side, `SPINE_WIDE`, than front to back, `SPINE`: its outline the hull of the ovals round its two ends and its middle)
  {
    const axis = unit(minus(spineHigh, spineLow)), side0 = ribEgg?.side ?? pelvisEgg?.side ?? ([1, 0, 0] as P3);
    const sideS = unit(plus(side0, axis, -dot(side0, axis))), fwdS = cross(axis, sideS);
    const ring = [0, 0.5, 1].flatMap(t => {
      const c = mix(spineLow, spineHigh, t);
      return Array.from({ length: 36 }, (_, m) => {
        const a = (m / 36) * Math.PI * 2, q = see(plus(plus(c, sideS, Math.cos(a) * (SPINE_WIDE / 2) * U), fwdS, Math.sin(a) * (SPINE / 2) * U));
        return [X(q), Y(q)] as [number, number];
      });
    });
    parts.push({ key: "spine", depth: depthOf(see(spineLow), see(spineHigh)), node: <path key="spine" d={smooth(hull(ring))} className="fig-spine-robe" /> });
  }
  behind("spine", "ribcage", "pelvis"); // (under both eggs, so it never shows)

  /* ---------- The robe, the top of it ---------- */
  // A gray robe over the ribcage, an egg a little bigger than it, like the hood over the head. It is open on her right, as a toga is: the opening runs from the right
  // side of her neck, down past the armpit, to the side of her bust, and round to the back of that side, leaving her skin bare (the ribcage's own colour) there.
  // It is cut by a plane (`TOGA_CUT`), so it follows the egg however it is shaped and bent.
  if (ribEgg) {
    const E: Egg = { ...ribEgg, halfW: ribEgg.halfW * (1 + ROBE_GAP), halfD: ribEgg.halfD * (1 + ROBE_GAP) };
    const over = Math.min(see(E.middle).depth, see(pelvisMiddle).depth) - 0.0005;
    robeDepth = over;
    robeEgg = E;
    egg("robe-top", E, "fig-robe-top", see(E.middle).depth - over);
    cutOpening(E, "robe-top-open", TOGA_CUT, over - 0.0005);
  }
  // (the line of the hips is not drawn any more: the pelvis joints are still there, and the pelvis egg is placed from them, so the distances stay as they were)
  // (the shin is a limb; the thigh above the knee thickens up to the hip)
  for (const side of ["R", "L"] as const) {
    const hip = j[`hip${side}` as const], knee = j[`knee${side}` as const];
    bones(`leg${side}`, [`knee${side}`, `foot${side}`], side === "R" ? "fig-limb fig-far" : "fig-limb", LIMB);
    // (one smooth shape, not a chain of pieces: the outline of a cone with rounded ends, the hull of a few circles that grow from the knee to the hip, each drawn as many
    // points round, and the hull rounded off as a curve)
    // (and a second run behind the bone, `THIGH_BACK`: the back of the thigh fuller. "Behind" is across the thigh, away from the way the legs face: down, for a
    // thigh raised to the front)
    const back = thighBack(hip, knee);
    const rounds = Array.from({ length: 6 }, (_, i) => i / 5).flatMap(t => {
      const r0 = LIMB / 2 + (THIGH_R - LIMB / 2) * t, c = mix(knee, hip, t);
      const b = thighBackAt(t);
      return [{ at: c, r: r0 }, { at: plus(c, back, r0 * b.off * U), r: r0 * b.size }];
    });
    const circles = (rs: typeof rounds) => rs.flatMap(({ at, r: rr }) => {
      const q = see(at), r = rr * scaleAt(q);
      return Array.from({ length: 24 }, (_, m) => [X(q) + r * Math.cos((m / 24) * Math.PI * 2), Y(q) + r * Math.sin((m / 24) * Math.PI * 2)] as [number, number]);
    });
    const far = side === "R", depth = depthOf(seen[`hip${side}` as const], seen[`knee${side}` as const]);
    let thigh = <path d={smooth(hull(circles(rounds)))} />;
    // Her left thigh comes out of the robe's bottom through its opening. Drawn in front of the bottom egg (a thigh coming forward), the part of it still inside the
    // egg would show over the gray round the opening: so over the egg's outline only the rounds of it the egg does not hide are drawn (seen through the opening,
    // the rest is the opening's own skin, the same white).
    if (!far && pelvisEgg && depth < see(pelvisEgg.middle).depth) {
      const shown = rounds.filter(({ at }) => clearOf(pelvisEgg!, at) > 0), m = `${clip}-thighL`;
      thigh = (
        <g>
          <mask id={m} maskUnits="userSpaceOnUse" x={-1e4} y={-1e4} width={2e4} height={2e4}>
            <rect x={-1e4} y={-1e4} width={2e4} height={2e4} style={{ fill: "white", stroke: "none" }} />
            <path d={eggOutline(pelvisEgg, "pelvis")} style={{ fill: "black", stroke: "none" }} />
            {shown.length > 0 && <path d={smooth(hull(circles(shown)))} style={{ fill: "white", stroke: "none" }} />}
          </mask>
          <g mask={`url(#${m})`}>{thigh}</g>
        </g>
      );
    }
    parts.push({ key: `thigh${side}`, depth, node: <g key={`thigh${side}`} className="fig-ribcage" style={far ? { fill: "var(--ink-far)" } : undefined}>{thigh}</g> });
  }
  // Which leg is over the other: each part is sorted by the depth of its middle, which a long limb pointing toward or away from the viewer (a knee raised to
  // the front) gets wrong against the other leg. So where the two legs come nearest each other on the screen, the one nearer the viewer there is drawn over
  // the other, all of it (thigh and shin), just in front of the other leg's nearest part.
  {
    const along = (side: "R" | "L") => {
      const hip = j[`hip${side}` as const], knee = j[`knee${side}` as const], foot = j[`foot${side}` as const];
      return Array.from({ length: 25 }, (_, i) => { const t = i / 24, p = t < 0.5 ? mix(hip, knee, t * 2) : mix(knee, foot, t * 2 - 1); return see(p); });
    };
    const a = along("R"), b = along("L");
    let best = Infinity, nearR = false;
    for (const p of a) for (const q of b) { const d = Math.hypot(X(p) - X(q), Y(p) - Y(q)); if (d < best) { best = d; nearR = p.depth < q.depth; } }
    // (only where they overlap: limbs a thigh's width apart or more do not cover each other)
    if (best < THIGH_R * 2 * scaleAt(seen.pelvis)) {
      const [nearSide, farSide] = nearR ? ["R", "L"] : ["L", "R"];
      const farParts = parts.filter(x => x.key === `thigh${farSide}` || x.key === `leg${farSide}`), nearParts = parts.filter(x => x.key === `thigh${nearSide}` || x.key === `leg${nearSide}`);
      const front = Math.min(...farParts.map(x => x.depth)) - 0.0001;
      for (const x of nearParts) x.depth = Math.min(x.depth, front);
    }
  }
  // The pelvis egg is the robe's bottom, gray; it is open on her left, in a round opening like the toga's, for her left leg (bare, in white). Her right thigh is under it.
  // (only what of it the robe's top does not hide is drawn, and that over the robe's top, the ribcage and the spine: from below, the bottom egg is in front of them all)
  const openDepth = Math.min(see(pelvisEgg?.middle ?? j.pelvis).depth - 0.0002, (Number.isFinite(robeDepth) ? robeDepth : Infinity) - 0.0008, ...parts.filter(x => ["ribcage", "spine"].includes(x.key)).map(x => x.depth - 0.0002));
  if (pelvisEgg) cutOpening(pelvisEgg, "pelvis-open", PELVIS_CUT, openDepth, robeEgg ?? undefined);
  // A belt of wax round her, slightly above the pelvis: a band on the pelvis egg's surface, a little proud of it, as tall as `BELT_HALF` either side of `BELT_AT` (heights along the egg's
  // axis), all the way round. Only the strips of it that face the viewer are drawn, over the robe.
  if (pelvisEgg) {
    const B: Egg = { ...pelvisEgg, halfW: pelvisEgg.halfW * BELT_OUT, halfD: pelvisEgg.halfD * BELT_OUT }, look = look3At(B.middle), SECT = 72;
    const quads: string[] = [];
    // (each strip's corners and which way it faces: the same every frame of a pose)
    const strips = geo.get("belt", () => Array.from({ length: SECT }, (_, n) => {
      const a0 = (n / SECT) * Math.PI * 2, a1 = ((n + 1) / SECT) * Math.PI * 2;
      return { facing: eggNormal(B, BELT_AT, (a0 + a1) / 2), corners: [eggPoint(B, BELT_AT - BELT_HALF, a0), eggPoint(B, BELT_AT - BELT_HALF, a1), eggPoint(B, BELT_AT + BELT_HALF, a1), eggPoint(B, BELT_AT + BELT_HALF, a0)] };
    }));
    for (const { facing, corners } of strips) {
      if (-dot(facing, look) <= 0) continue;
      quads.push(`M${pts(corners).replace(/ /g, "L")}z`);
    }
    skirtOf = B;
    if (quads.length) parts.push({ key: "belt", depth: Math.min(Number.isFinite(robeDepth) ? robeDepth : Infinity, see(pelvisEgg.middle).depth, openDepth - 0.0002) - 0.0006, node: <path key="belt" d={quads.join("")} className="fig-belt" /> });
  }
  // (her right thigh is under the robe's bottom; this is settled before the skirt, whose inside is put under everything there is by then, the thigh too)
  behind("thighR", "pelvis");
  // The robe's skirt, hanging from the lower edge of the belt over her seat and her right leg (see below), the hem a little above her feet. Like a cloak it is a near wall
  // and a far wall, with her legs sorted between them. It is open on her left, where the bottom egg's opening meets the belt's lower edge: the angles round the belt there at
  // which that opening's plane has cut the egg are left out, all the way down, so her left leg shows through.
  if (pelvisEgg && skirtOf) {
    const B = skirtOf, beyond = cutPlane(pelvisEgg, PELVIS_CUT, "pelvis-open"), uLow = BELT_AT - BELT_HALF;
    const TAU = Math.PI * 2, LOOK = 360, axisC = eggPoint({ ...B, halfW: 0, halfD: 0 }, uLow, 0), floorY = Math.min(j.footL[1], j.footR[1]), floorTop = floorY + 0.2 * U;
    // The skirt is a stack of cylinders, like the Hunter's coat: rings round her, each a level ellipse, and between each two the cloth runs straight. The belt's lower
    // edge is the first ring. The top part, stiff, runs from it down to a ring just below the bottom of the bottom egg, wide enough to take in all of the egg there is
    // under the belt (so where she bends and her seat pushes out, the back of the robe goes out over it, then down). The middle part runs from there to a ring at
    // her right knee's height, taking in her thighs and knees (a knee coming forward or out tents it). The bottom part, the rest, runs to the hem, taking in her
    // shins. Each ring widens a little more than the last (the flare). At each joint the cloth bends round in a short curved strip (a few rings in between), not at a
    // sharp corner. The skirt is as long as it hangs standing straight, the hem a little above her feet; where that would go through the floor (a low stance) it
    // reaches the floor and the rest spreads out over it, in a ruffled ring.
    // (all of what follows, down to the grid, is the skirt's shape in the body's own space: it depends on the pose alone, so it is worked out once for it, and simplified)
    const skirt = geo.get("skirt", () => {
    const lift = unit(minus(j.waist, j.pelvis)), hipMid = mix(j.hipL, j.hipR, 0.5);
    const legLen = Math.hypot(...minus(j.kneeR, j.hipR)) + Math.hypot(...minus(j.footR, j.kneeR));
    const level = (v: P3): P3 => unit([v[0], 0, v[2]]);
    const hs = level(B.side), hf = unit(plus(level(B.fwd), hs, -dot(level(B.fwd), hs)));
    /** A ring of the skirt: a level ellipse, its middle (across and forward of the belt's middle, and its height), its round stretched by a 2×2 matrix, and how
     *  much it ruffles (a share of its size, for the hem spread on the floor). */
    type Ring = { x: number; z: number; y: number; m: [number, number, number, number]; wave: number;
      /** Raised round one way only (the lap over a knee higher than the belt): `up` higher at the angle `at`, easing back down to the ring's height `width` either side. */
      hump?: { at: number; up: number; width: number } };
    const onRing = (r: Ring, a: number): P3 => {
      const c = Math.cos(a), s = Math.sin(a), k = 1 + r.wave * (0.8 * Math.sin(5 * a + 1.3) + 0.2 * Math.sin(11 * a + 0.4));
      const u = r.x + (r.m[0] * c + r.m[1] * s) * k, v = r.z + (r.m[2] * c + r.m[3] * s) * k;
      // (a hump: raised round one way only, smoothly)
      let y = r.y;
      if (r.hump) { const off = Math.abs(((a - r.hump.at + Math.PI * 3) % (Math.PI * 2)) - Math.PI); if (off < r.hump.width) y += r.hump.up * 0.5 * (1 + Math.cos((Math.PI * off) / r.hump.width)); }
      return [axisC[0] + hs[0] * u + hf[0] * v, y, axisC[2] + hs[2] * u + hf[2] * v];
    };
    /** Widens a ring, as little as it can, so that it takes in a point (looked at from above), `pad` beyond it: its middle moves toward the point and it stretches
     *  that way, and a little across, so all it took in before it still does. */
    const takeIn = (r: Ring, p: P3, pad = 0) => {
      const dx = p[0] - axisC[0], dz = p[2] - axisC[2];
      let px = dx * hs[0] + dz * hs[2] - r.x, pz = dx * hf[0] + dz * hf[2] - r.z;
      const l = Math.hypot(px, pz) || 1;
      px += (px / l) * pad; pz += (pz / l) * pad;
      const [a, b, c, d] = r.m, det = a * d - b * c;
      if (Math.abs(det) < 1e-12) return;
      const nx = (d * px - b * pz) / det, nz = (-c * px + a * pz) / det, q = Math.hypot(nx, nz);
      if (q <= 1) return;
      const ex = nx / q, ez = nz / q, s = (q + 1) / 2, t = (q + 1) / (2 * Math.sqrt(q));
      r.x += ((a * ex + b * ez) * (q - 1)) / 2; r.z += ((c * ex + d * ez) * (q - 1)) / 2;
      const s00 = t + (s - t) * ex * ex, s01 = (s - t) * ex * ez, s11 = t + (s - t) * ez * ez;
      r.m = [a * s00 + b * s01, a * s01 + b * s11, c * s00 + d * s01, c * s01 + d * s11];
    };
    const grown = (r: Ring, y: number, k: number): Ring => ({ ...r, y, m: r.m.map(v => v * k) as Ring["m"] });
    // (how long it hangs, and the heights of its rings: the seat's just below the egg, the knee's at her right knee, never below the hem)
    const L = legLen + dot(minus(axisC, hipMid), lift) - SKIRT_HEM * U, natural = axisC[1] - L, floorHem = floorTop + (wr.skirtLift ?? 0) * U, yHem = Math.max(natural, floorHem), extra = Math.max(0, floorHem - natural);
    const eggUnder: P3[] = [];
    for (let i = 0; i <= 8; i++) for (let k = 0; k < 24; k++) eggUnder.push(eggPoint(B, -1 + ((uLow + 1) * i) / 8, (k / 24) * TAU));
    const ySeat = Math.max(yHem, Math.min(...eggUnder.map(p => p[1])) - 1 * U), yKnee = Math.max(yHem, Math.min(ySeat - 0.5 * U, j.kneeR[1]));
    const flare = (from: number, to: number) => 1 + (SKIRT_FLARE * (from - to)) / (L || 1);
    const rx = Math.abs(dot(minus(eggPoint(B, uLow, 0), axisC), hs)), rz = Math.abs(dot(minus(eggPoint(B, uLow, Math.PI / 2), axisC), hf));
    // (her skirt hangs back from her motion forward, `skirtDrag`: the seat's ring a little, the knee's more, the hem's all the way; the cloth still goes round her legs, which push it out)
    const SEAT_DRAG = 0.4, KNEE_DRAG = 0.75, back = (wr.skirtDrag ?? 0) * U, dragX = -back * hs[2], dragZ = -back * hf[2];
    const seat: Ring = { x: SEAT_DRAG * dragX, z: SEAT_DRAG * dragZ, y: ySeat, m: [rx * flare(axisC[1], ySeat), 0, 0, rz * flare(axisC[1], ySeat)], wave: 0 };
    for (const p of eggUnder) takeIn(seat, p);
    // (and each thigh where it is as high as the seat's ring or higher, a knee raised to the front, so it does not come out through the top part. Her right leg
    // is under the skirt, and carries it wherever it goes; her left leg comes out through the opening, and only pushes the cloth where some of it is against
    // cloth: a point of it round the skirt where the cloth hangs (not where it is open), stepping back or out into the cloth behind or beside it)
    const LEGS = [[j.hipR, j.kneeR, j.footR, false], [j.hipL, j.kneeL, j.footL, true]] as const;
    /** Whether the skirt hangs, on this ring, at the way round it of this point (looked at from above): not in the opening on her left. */
    const clothAt = (r: Ring, p: P3) => {
      const dx = p[0] - axisC[0], dz = p[2] - axisC[2], px = dx * hs[0] + dz * hs[2] - r.x, pz = dx * hf[0] + dz * hf[2] - r.z;
      const [a, b, c, d] = r.m, det = a * d - b * c;
      if (Math.abs(det) < 1e-12) return true;
      return beyond(uLow, Math.atan2((-c * px + a * pz) / det, (d * px - b * pz) / det)) <= 0;
    };
    /** Takes a leg's point (and its round, `pad`) into a ring: any of her right leg's, her left leg's only where some of its round is against the cloth (its middle,
     *  or either side of it, round the ring). */
    const push = (r: Ring, p: P3, pad: number, left: boolean) => {
      if (left && wr.skirtFreeLeftLeg) return;
      if (left) {
        const dx = p[0] - axisC[0], dz = p[2] - axisC[2], l = Math.hypot(dx, dz) || 1, across: P3 = [-dz / l, 0, dx / l];
        if (![0, 1, -1].some(k => clothAt(r, plus(p, across, k * pad)))) return;
      }
      // (a smoother skirt takes the cloth out round her right leg a little further, so the bulge it makes is broad, not a point)
      takeIn(r, p, pad + (wr.skirtSmooth && !left ? 1.5 * U : 0));
    };
    // (each thigh's fuller back too: its second run of rounds, `THIGH_BACK`)
    const thighAt = (hip: P3, kn: P3, t: number) => {
      const r0 = LIMB / 2 + (THIGH_R - LIMB / 2) * (1 - t), c = mix(hip, kn, t);
      const b = thighBackAt(1 - t);
      return [{ p: c, r: r0 }, { p: plus(c, thighBack(hip, kn), r0 * b.off * U), r: r0 * b.size }];
    };
    // A thigh raised high, up near the belt (a knee raised to the front while she kneels low), would come out through the top part, which runs straight down
    // from the belt: there the skirt has a lap, a ring of its own just under the belt, as high as the tops of those thighs, taking them in, so the cloth runs
    // out from the belt over the lap and only then falls (the seat's ring hangs from the lap's edge). Lower down, the seat's ring takes the thighs in.
    // (only for a leg whose knee is raised that high: every thigh starts up there, at the hip, inside the egg)
    const high = (p: P3) => (axisC[1] - p[1]) / ((axisC[1] - ySeat) || 1e-6) < 0.5;
    const thighs = LEGS.filter(([, , , left]) => !(left && wr.skirtFreeLeftLeg)).flatMap(([hip, kn, , left]) => Array.from({ length: 7 }, (_, i) => thighAt(hip, kn, i / 6).map(x => ({ ...x, left, raised: high(kn) }))).flat()).filter(x => x.p[1] >= ySeat);
    const lapping = thighs.filter(x => x.raised && high(x.p));
    let lap: Ring | null = null;
    if (lapping.length) {
      // (just under the belt all round her; but where a knee comes up higher than that, a hump rises over it, round its side only: the cloth goes up from the
      // belt over the knee and falls from there, and behind her and on her other side it stays under the belt)
      const top = Math.max(...lapping.map(x => x.p[1] + (x.r + SKIRT_THICK) * U)), yLap = Math.max(ySeat + 1 * U, Math.min(axisC[1] - 0.5 * U, top));
      lap = { x: 0, z: 0, y: yLap, m: [rx * flare(axisC[1], yLap), 0, 0, rz * flare(axisC[1], yLap)], wave: 0 };
      if (top > yLap) {
        const peak = lapping.reduce((b, x) => (x.p[1] > b.p[1] ? x : b)), d = minus(peak.p, axisC);
        lap.hump = { at: Math.atan2(dot(d, hf) / (rz || 1), dot(d, hs) / (rx || 1)), up: top - yLap, width: 1.1 };
      }
      for (const p of eggUnder) if (p[1] >= yLap) takeIn(lap, p);
      // (with a little room over them: the bend from the lap down into the skirt is rounded off, which would cut in just over a knee)
      for (const { p, r, left } of lapping) push(lap, p, (r + SKIRT_THICK + 1.5) * U, left);
      for (let i = 0; i < 24; i++) takeIn(seat, [...onRing(lap, (i / 24) * TAU)] as P3);
    }
    for (const { p, r, left, raised } of thighs) if (!lap || !raised || !high(p)) push(seat, p, (r + SKIRT_THICK) * U, left);
    const knee = grown(seat, yKnee, flare(ySeat, yKnee));
    knee.x += (KNEE_DRAG - SEAT_DRAG) * dragX; knee.z += (KNEE_DRAG - SEAT_DRAG) * dragZ;
    // (pulled back against gravity, `skirtLift`: what is longer than she is high, down to a hem that stays off the floor, runs backward instead, the knee's ring part of the way)
    if (wr.skirtLift) { knee.x -= 0.4 * extra * hs[2]; knee.z -= 0.4 * extra * hf[2]; }
    for (const [hip, kn, , left] of LEGS) for (const t of [0.4, 0.7, 1]) for (const { p, r } of thighAt(hip, kn, t)) push(knee, p, (r + SKIRT_THICK) * U, left);
    const hemRing = grown(knee, yHem, flare(yKnee, yHem));
    hemRing.x += (1 - KNEE_DRAG) * dragX; hemRing.z += (1 - KNEE_DRAG) * dragZ;
    if (wr.skirtLift) { hemRing.x -= extra * hs[2]; hemRing.z -= extra * hf[2]; }
    for (const [, kn, ft, left] of LEGS) for (const t of [0, 1 / 3, 2 / 3, 1]) push(hemRing, mix(kn, ft, t), (LIMB / 2 + SKIRT_THICK) * U, left);
    // (a smoother skirt: the knee's ring faired between the seat's and the hem's, and its bends rounder)
    const join = wr.skirtSmooth ? 0.5 : SKIRT_JOIN;
    if (wr.skirtSmooth) {
      const above = { ...seat }, below = { ...hemRing };
      knee.x = 0.5 * knee.x + 0.25 * (above.x + below.x);
      knee.z = 0.5 * knee.z + 0.25 * (above.z + below.z);
      knee.m = knee.m.map((v, i) => 0.5 * v + 0.25 * (above.m[i] + below.m[i])) as typeof knee.m;
    }
    const rings: ((a: number) => P3)[] = [a => eggPoint(B, uLow, a), ...(lap ? [(a: number) => onRing(lap!, a)] : []), a => onRing(seat, a), a => onRing(knee, a)];
    if (extra > 0 && !wr.skirtLift) {
      // (it meets the floor as wide as it hangs, then the rest of it spreads out over the floor)
      const size = Math.sqrt(Math.abs(hemRing.m[0] * hemRing.m[3] - hemRing.m[1] * hemRing.m[2])), spread = extra * CRUMPLE;
      const touch = grown(hemRing, floorTop + Math.min(0.5 * U, Math.max(0, yKnee - floorTop)), 1), wide = grown(hemRing, floorTop, (size + spread) / (size || 1));
      wide.wave = (0.3 * spread) / (size + spread || 1);
      rings.push(a => onRing(touch, a), a => onRing(wide, a));
    } else rings.push(a => onRing(hemRing, a));
    // (each joint rounded off: from a little above it to a little below, a curve with the joint as its corner)
    const levels: ((a: number) => P3)[] = [rings[0]];
    for (let k = 1; k < rings.length - 1; k++) {
      const [up, at, down] = [rings[k - 1], rings[k], rings[k + 1]];
      for (const t of [0, 0.5, 1]) levels.push(a => {
        const c = at(a), p = mix(c, up(a), join), q = mix(c, down(a), join);
        return [0, 1, 2].map(i => (1 - t) * (1 - t) * p[i] + 2 * t * (1 - t) * c[i] + t * t * q[i]) as unknown as P3;
      });
    }
    levels.push(rings[rings.length - 1]);
    // The cloth runs round the belt from where the opening closes to where it opens again, found exactly (where the opening's plane crosses the belt's lower edge), so
    // its two edges hanging down are clean lines and not steps
    let aFrom = 0, aSpan = TAU;
    {
      let open: number | null = null, close: number | null = null;
      for (let k = 0; k < LOOK; k++) {
        const x0 = (k / LOOK) * TAU, x1 = ((k + 1) / LOOK) * TAU, f0 = beyond(uLow, x0), f1 = beyond(uLow, x1);
        if ((f0 > 0) === (f1 > 0)) continue;
        const ac = x0 + (x1 - x0) * (f0 / (f0 - f1));
        if (f1 > 0) open = ac; else close = ac;
      }
      if (open !== null && close !== null) { aFrom = close; aSpan = (((open - close) % TAU) + TAU) % TAU; }
    }
    // The rim of the opening in front of her drops almost straight down from the belt (`skirtRimDrop`), however the cloth beside it is dragged: each ring is brought back, toward
    // the point straight under the belt's, as it nears that edge, and wholly there at the edge itself.
    if (wr.skirtRimDrop && aSpan < TAU - 1e-6) {
      const last = levels[levels.length - 1], front = last(aFrom)[2] >= last(aFrom + aSpan)[2] ? aFrom : aFrom + aSpan, top = levels[0](front), SPREAD = 0.45;
      for (let k = 1; k < levels.length; k++) {
        const level = levels[k];
        levels[k] = (a: number): P3 => {
          const p = level(a), near = Math.abs(((a - front + 3 * Math.PI) % TAU) - Math.PI), share = Math.max(0, 1 - near / SPREAD) ** 2;
          return [p[0] + (top[0] - p[0]) * share, p[1], p[2] + (top[2] - p[2]) * share];
        };
      }
    }
    const whole = aSpan >= TAU - 1e-6;
    // The grid at its finest first (rings by columns, a multiple of four columns so that they can be thinned), and how the cloth slants at each of its points.
    const K0 = levels.length, N0 = Math.ceil(Math.max(8, Math.round((48 * aSpan) / TAU)) / 4) * 4;
    const grid0 = levels.map(lv => Array.from({ length: N0 + 1 }, (_, n) => lv(aFrom + (aSpan * n) / N0)));
    const slant0 = (k: number, n: number): P3 => cross(minus(grid0[Math.min(K0 - 1, k + 1)][n], grid0[Math.max(0, k - 1)][n]), minus(grid0[k][Math.min(N0, n + 1)], grid0[k][Math.max(0, n - 1)]));
    // (which way round that slant points out of the cloth, found once where the cloth is surely upright: the seat's ring, halfway round)
    const mid0 = Math.round(N0 / 2), kUp = Math.min(K0 - 1, 2), sideways = minus(grid0[kUp][mid0], axisC), outward = dot(slant0(kUp, mid0), [sideways[0], 0, sideways[2]]) >= 0 ? 1 : -1;
    // Then simplified, where the cloth runs straight. A ring that lies on the straight run between the rings either side of it (every point of it, to within `SKIRT_TOL`) is
    // not needed: that cloth is a plain cone there, and the rounding at a joint that is hardly a bend goes with it. The ring that departs least goes first, until each left bends.
    const tol = SKIRT_TOL * U;
    const strays = (above: number, k: number, below: number) => {
      let worst = 0;
      for (let n = 0; n <= N0; n++) {
        const p = grid0[k][n], a = grid0[above][n], b = grid0[below][n], la = Math.hypot(...minus(p, a)), lb = Math.hypot(...minus(b, p));
        worst = Math.max(worst, Math.hypot(...minus(p, mix(a, b, la / (la + lb || 1)))));
      }
      return worst;
    };
    const rows = Array.from({ length: K0 }, (_, k) => k);
    for (;;) {
      let drop = -1, least = tol;
      for (let m = 1; m < rows.length - 1; m++) { const d = strays(rows[m - 1], rows[m], rows[m + 1]); if (d < least) { drop = m; least = d; } }
      if (drop < 0) break;
      rows.splice(drop, 1);
    }
    // And every other column (or three in four), when the straight edges between those left stay as close to the round of every ring that is left.
    const thinBy = (f: number) => N0 % f === 0 && N0 / f >= 8 && rows.every(k => {
      for (let n = 0; n < N0; n++) {
        const c0 = Math.floor(n / f) * f;
        if (Math.hypot(...minus(grid0[k][n], mix(grid0[k][c0], grid0[k][c0 + f], (n - c0) / f))) > tol) return false;
      }
      return true;
    });
    const thin = [4, 2].find(thinBy) ?? 1, N = N0 / thin;
    const grid = rows.map(k => Array.from({ length: N + 1 }, (_, n) => grid0[k][n * thin]));
    const slants = rows.map(k => Array.from({ length: N + 1 }, (_, n) => slant0(k, n * thin)));
    // (a ring's middle, what the viewer's way is taken at)
    const centres = grid.map(row => mix(row[0], row[Math.round(N / 2)], 0.5));
    return { levels: rows.map(k => levels[k]), aFrom, aSpan, whole, N, K: rows.length, grid, slants, centres, outward };
    });
    const { levels, aFrom, aSpan, whole, N, K, grid, slants, centres, outward } = skirt;
    const uOf = (n: number) => (aSpan * n) / N, on = (k: number, u: number) => levels[k](aFrom + u);
    // Which side of the cloth the viewer sees, along each ring: its outside or its inside, from the cloth's own slant there (round the ring, and down the cloth), the viewer's way
    // taken once for each ring.
    const looks = centres.map(c => look3At(c));
    const facing = slants.map((row, k) => {
      let last = 1;
      return row.map(s => {
        if (Math.hypot(...s) < 1e-12) return last;
        return (last = -dot(s, looks[k]) * outward);
      });
    });
    /** The stretches of a ring the viewer sees the outside of (`near`) and the inside of, as stretches of the way round from where the cloth starts. */
    type Run = { near: boolean; lo: number; hi: number };
    const runs: Run[][] = facing.map(f => {
      const out: Run[] = [];
      let lo = 0;
      for (let n = 0; n < N; n++) {
        if ((f[n] > 0) === (f[n + 1] > 0)) continue;
        const u = uOf(n) + (uOf(n + 1) - uOf(n)) * (f[n] / (f[n] - f[n + 1]));
        out.push({ near: f[n] > 0, lo, hi: u });
        lo = u;
      }
      out.push({ near: f[N] > 0, lo, hi: aSpan });
      return out;
    });
    /** A stretch of a ring, as its points: its two ends exactly, and the grid's points between. */
    const arc = (k: number, lo: number, hi: number): P3[] => {
      const ps = [on(k, lo)];
      for (let n = 0; n <= N; n++) if (uOf(n) > lo + 1e-9 && uOf(n) < hi - 1e-9) ps.push(grid[k][n]);
      ps.push(on(k, hi));
      return ps;
    };
    /** A closed shape, its corners always turning the same way on the screen (the pieces are one path each: pieces turning opposite ways would cancel out where they overlap). */
    const shape = (ps: P3[]) => {
      const s = ps.map(p => { const q = see(p); return [X(q), Y(q)] as const; });
      const area = s.reduce((n, p, i) => { const r = s[(i + 1) % s.length]; return n + p[0] * r[1] - r[0] * p[1]; }, 0);
      return `M${(area < 0 ? [...s].reverse() : s).map(p => `${p[0]},${p[1]}`).join("L")}z`;
    };
    const line = (ps: P3[]) => `M${pts(ps).replace(/ /g, "L")}`;
    // Each wall is one piece from the belt to the hem: its outside (over the legs) between the lines where the viewer's sight grazes the cloth, its inside (under
    // them) the rest. Where the cloth turns so that a ring is seen in more or fewer stretches than the one above it (seen from above or below, round a knee), the
    // pieces are cut there and go on below.
    const near: string[] = [], far: string[] = [], hem: string[] = [], hemFar: string[] = [];
    const same = (a: Run[], b: Run[]) => a.length === b.length && a.every((r, i) => r.near === b[i].near);
    for (let k0 = 0; k0 < K - 1; ) {
      let k1 = k0 + 1;
      const chained = same(runs[k0], runs[k1]);
      if (chained) while (k1 < K - 1 && same(runs[k1], runs[k1 + 1])) k1++;
      const runOf = (k: number, i: number) => (chained ? runs[k][i] : runs[k0][i]);
      const down = Array.from({ length: k1 - k0 + 1 }, (_, m) => k0 + m).slice(1, -1);
      runs[k0].forEach((r, i) => {
        const top = runOf(k0, i), bottom = runOf(k1, i);
        if (top.hi - top.lo < 1e-6 && bottom.hi - bottom.lo < 1e-6) return;
        const ps = [...arc(k0, top.lo, top.hi), ...down.map(k => on(k, runOf(k, i).hi)), ...arc(k1, bottom.lo, bottom.hi).reverse(), ...[...down].reverse().map(k => on(k, runOf(k, i).lo))];
        (r.near ? near : far).push(shape(ps));
      });
      k0 = k1;
    }
    // (the hem's wax runs along the cloth's very edge, so it shows from outside the skirt and from within it alike; so do the opening's two edges, from the belt down)
    for (const r of runs[K - 1]) (r.near ? hem : hemFar).push(line(arc(K - 1, r.lo, r.hi)));
    if (!whole) {
      for (let k = 0; k < K - 1; k++) {
        (runs[k][0].near ? hem : hemFar).push(line([grid[k][0], grid[k + 1][0]]));
        (runs[k][runs[k].length - 1].near ? hem : hemFar).push(line([grid[k][N], grid[k + 1][N]]));
      }
    }
    // (her left leg comes out through the opening, and is not always under the cloth: it is sorted with it by how far it is, in front where it is nearer)
    const inside = parts.filter(x => ["pelvis", "pelvis-open", "thighR", "legR"].includes(x.key)).map(x => x.depth);
    // (the far wall, the inside of the skirt, is under everything already drawn: the legs, the eggs, the belt, the robe's top, the opening's skin)
    const nearDepth = Math.min(...inside) - 0.001, farDepth = Math.max(...parts.map(x => x.depth)) + 0.001;
    // (a left leg the cloth ignores, `skirtFreeLeftLeg`, is out in front of the skirt's outer face, which lies behind it: it is drawn over it)
    if (wr.skirtFreeLeftLeg) for (const x of parts) if (x.key === "thighL" || x.key === "legL") x.depth = Math.min(x.depth, nearDepth - 0.0005);
    // Her right thigh is always under the robe: what of it the straight run of the cloth would leave outside (a knee raised to the front, the thigh level at the
    // height of the belt) is cut away, so only what is within the skirt's outline shows (through the opening, from within); above that the bottom egg covers it.
    const thighR = parts.find(x => x.key === "thighR");
    if (thighR && (near.length || far.length)) {
      thighR.node = <g key="thighR" clipPath={`url(#${clip}-skirt)`}>{thighR.node}</g>;
      parts.push({ key: "skirt-clip", depth: Infinity, node: <clipPath key="skirt-clip" id={`${clip}-skirt`}><path d={[...near, ...far].join("")} /></clipPath> });
    }
    if (far.length) {
      parts.push({ key: "skirt-far", depth: farDepth, node: <path key="skirt-far" d={far.join("")} className="fig-skirt-inner" /> });
      parts.push({ key: "skirt-hem-far", depth: farDepth - 0.0003, node: <path key="skirt-hem-far" d={hemFar.join("")} className="fig-skirt-edge" /> });
    }
    if (near.length) {
      parts.push({ key: "skirt-near", depth: nearDepth, node: <path key="skirt-near" d={near.join("")} className="fig-skirt" /> });
      parts.push({ key: "skirt-hem", depth: nearDepth - 0.0003, node: <path key="skirt-hem" d={hem.join("")} className="fig-skirt-edge" /> });
    }
    // The opening's edge on the bottom egg, from the top of the belt up, bordered with wax too: where the plane meets the egg, traced row by row up the egg (one crossing
    // where the opening begins round the row, one where it ends), the two lines joined over its top, and only the stretches that face the viewer drawn, over the opening's skin.
    {
      const lookP = look3At(pelvisEgg.middle);
      // (the line itself, with each point's place and which way it faces, is the same every frame of a pose: kept)
      const edge = geo.get("pelvis-open-edge", () => {
        const uTop = BELT_AT + BELT_HALF, ROWS = 60, sideA: [number, number][] = [], sideB: [number, number][] = [];
        for (let r = 0; r <= ROWS; r++) {
          const u = uTop + ((0.999 - uTop) * r) / ROWS;
          let ia: number | null = null, ib: number | null = null;
          for (let k = 0; k < LOOK; k++) {
            const x0 = (k / LOOK) * TAU, x1 = ((k + 1) / LOOK) * TAU, f0 = beyond(u, x0), f1 = beyond(u, x1);
            if ((f0 > 0) === (f1 > 0)) continue;
            const ac = x0 + (x1 - x0) * (f0 / (f0 - f1));
            if (f1 > 0) ia ??= ac; else ib ??= ac;
          }
          if (ia === null || ib === null) { if (sideA.length) break; continue; }
          sideA.push([u, ia]); sideB.push([u, ib]);
        }
        return [...sideA, ...sideB.reverse()].map(([u, a]) => ({ p: eggPoint(pelvisEgg, u, a), n: eggNormal(pelvisEgg, u, a) }));
      });
      const runs: string[] = [];
      let run: string[] = [];
      for (const { p, n } of edge) {
        if (-dot(n, lookP) > 0 && (!robeEgg || clearOf(robeEgg, p, lookP) > 0)) { const q = see(p); run.push(`${X(q)},${Y(q)}`); }
        else { if (run.length > 1) runs.push(`M${run.join("L")}`); run = []; }
      }
      if (run.length > 1) runs.push(`M${run.join("L")}`);
      if (runs.length) parts.push({ key: "pelvis-open-edge", depth: openDepth - 0.0001, node: <path key="pelvis-open-edge" d={runs.join("")} className="fig-skirt-edge" /> });
    }
    // (the belt goes over the skirt it holds)
    const belt = parts.find(x => x.key === "belt");
    if (belt) belt.depth = Math.min(belt.depth, nearDepth - 0.0005);
  }
  // (her left thigh is sorted by its own depth, like any limb: the robe's bottom is over it where the robe is nearer, and the opening's white, drawn on the robe, melts into the
  // thigh where it comes out of it)

  /* ---------- Arms ---------- */
  // His right arm (the flail's): bare, like the rest of the body under the robe.
  bones("R-arm", ["shoulderR", "elbowR", "handR"], `fig-limb${debug ? " dbg-red" : ""}`, LIMB);
  // His left arm (the candle's): wax, thick toward the fist (in his second form it fades between the wax's colour and red with the rest of his wax).
  const skin = "fig-hand-wax";
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
  // (the flame is over the fist and the arm wherever they are turned: it is see-through, so it shows through the hand)
  const handDepth = Math.min(fist.depth, ...parts.filter(x => x.key === "L-arm" || x.key === "L-fist").map(x => x.depth));
  const flame = (key: string, node: ReactNode) => parts.push({ key, depth: handDepth - 0.003, node });
  // The little flame (or its smoke) sits at the very tip of the fist, past the hand along the forearm; a stance can move it (`flameAt`). Its light on her
  // and round her is the scene's (`Scene.tsx`), from the same spot.
  const above = see(wardenFlame(wr, false));
  if (arm === "lit") {
    flame("L-flame", <g key="L-flame"><LittleFlame x={X(above)} y={Y(above)} height={10 * fk} /></g>);
  } else if (arm === "out") {
    const x = X(above), y = Y(above);
    flame("L-smoke", <path key="L-smoke" d={`M${x} ${y} q${-3 * fk} ${-5 * fk} 0 ${-9 * fk} q${3 * fk} ${-4 * fk} ${-1 * fk} ${-9 * fk}`} className="fig-smoke" />);
  } else {
    // His second form: no flame on his hand (only its red light round him, the scene's, `Scene.tsx`), but the knot is still in it, red, in the middle of the
    // fist and seen through the wax
    flame("L-knot", <LittleKnot key="L-knot" x={X(fist)} y={Y(fist)} height={RED_KNOT * fk} red />);
  }

  /* ---------- The flail ---------- */
  // (a head resting on the floor stays there however he leans: `grounded`)
  const fl0 = flail3(wr), grounded = "grounded" in placed ? placed.grounded : undefined, flat = wr.flat;
  const fl = fl0.resting && grounded ? { ...fl0, ball: grounded(fl0.ball) } : fl0;
  // The handle is plain dark wood, like the axe's haft, capped with a dome of black iron the chain hangs from. Its two halves, either side of her fist, are
  // sorted on their own (each by how far it is): one may pass over her forearm while the other runs under it.
  bones("R-handle-butt", [see(fl.butt), see(j.handR)], "fig-flail-haft", 2.6);
  bones("R-handle-tip", [see(j.handR), see(fl.tip)], "fig-flail-haft", 2.6);
  const knob = dome("R-dome", fl.butt, fl.tip);
  // Her right hand round the handle: the stretch of handle in her fist is white like the hand (so from any side it reads as the hand wrapped round it), always
  // over the handle, so the flail always looks held. It is a band round the handle, drawn as a cylinder is: only its outside's half that faces the viewer, so its
  // two edges are the near halves of the circles round the handle, curving as a cylinder's do.
  {
    const way = unit(minus(fl.tip, fl.butt)), g0 = plus(j.handR, way, -GRIP_HALF * U), g1 = plus(j.handR, way, GRIP_HALF * U);
    const under = parts.filter(x => x.key === "R-handle-butt" || x.key === "R-handle-tip" || x.key === "R-dome");
    parts.push({ key: "R-grip", depth: Math.min(see(j.handR).depth, ...under.map(x => x.depth)) - 0.0002, node: <polygon key="R-grip" points={pts(nearBand(g0, g1, GRIP_THICK / 2))} className={`fig-flail-hand${debug ? " dbg-red" : ""}`} /> });
  }
  /**
   * A run of chain from `a` to `b`, sagging `sag` units in the middle: oval links of black iron, each a ring in space turned a quarter round from the last (one
   * seen flat, the next edge on), each sorted by its own depth. A link whose opening faces the viewer has a thin gray line along the inside of its two long sides,
   * so the links stand apart (not round its ends, which would cross the links before and after it). With `head`, it ends at the
   * wax ball whose middle is `b`: the links stop at its surface, and the last one, going into it, is sealed in the wax.
   */
  const chain = (key: string, a: P3, b: P3, sag: number, head = false) => {
    const line = Array.from({ length: 17 }, (_, i) => { const t = i / 16, p = mix(a, b, t); return [p[0], p[1] - sag * U * Math.sin(Math.PI * t), p[2]] as P3; });
    const lens = line.slice(1).map((p, i) => Math.hypot(...minus(p, line[i]))), total = lens.reduce((n, l) => n + l, 0);
    /** The point `s` along the chain, and the way it runs there. */
    const along = (s: number): [P3, P3] => {
      for (let i = 0; i < lens.length; i++) { if (s <= lens[i] || i === lens.length - 1) return [mix(line[i], line[i + 1], lens[i] ? Math.min(1, s / lens[i]) : 0), unit(minus(line[i + 1], line[i]))]; s -= lens[i]; }
      return [b, unit(minus(b, a))];
    };
    // (with a head, the chain ends where it meets the ball's surface)
    let end = total;
    if (head) { end = 0; while (end < total && Math.hypot(...minus(along(end)[0], b)) > FLAIL_BALL * U) end += 0.25 * U; }
    const linksEnd = head ? Math.max(0, end - LINK_LONG * U) : end, n = Math.max(1, Math.round(linksEnd / (LINK_PITCH * U)));
    for (let i = 0; i < n && linksEnd > 0; i++) {
      const [c, d] = along(((i + 0.5) * linksEnd) / n), [e0, e1] = (() => { const t = Math.abs(d[1]) < 0.9 ? UP : ([1, 0, 0] as P3), x = unit(cross(d, t)); return [x, cross(d, x)]; })();
      const e = i % 2 ? e1 : e0, q = see(c), k = scaleAt(q);
      const onRing = (t: number, inset: number) => plus(plus(c, d, Math.cos(t) * (LINK_LONG / 2 - inset) * U), e, Math.sin(t) * (LINK_WIDE / 2 - inset) * U);
      const ring = Array.from({ length: 16 }, (_, m) => onRing((m / 16) * Math.PI * 2, 0));
      // (the opening faces the viewer when the link's flat side is turned toward them; the gray runs only along the long sides, a little short of the ends)
      const open = Math.abs(dot(cross(d, e), look3At(c))) > 0.55;
      const side = (mid: number) => Array.from({ length: 5 }, (_, m) => onRing(mid + (m / 4 - 0.5) * 1.2, LINK_WIRE / 2));
      parts.push({
        key: `${key}-${i}`, depth: q.depth,
        node: (
          <g key={`${key}-${i}`}>
            <polygon points={pts(ring)} className="fig-chain-link" style={{ strokeWidth: LINK_WIRE * k }} />
            {open && [Math.PI / 2, -Math.PI / 2].map(mid => <polyline key={mid} points={pts(side(mid))} className="fig-chain-link-in" style={{ strokeWidth: 0.35 * k }} />)}
          </g>
        ),
      });
    }
    if (head) {
      // The last link, sealed in wax where it goes into the ball: a thick run of wax from where the links stop to just inside the ball's surface.
      const [p0] = along(linksEnd), [p1, d1] = along(end), into = plus(p1, d1, 0.8 * U);
      bones(`${key}-sealed`, [see(p0), see(into)], "fig-flail-wax", LINK_WIDE + 0.8);
    }
  };
  const head = (key: string, p: P3, motion?: P3) => waxBall(key, p, !!flailFire, motion);
  /** The way the flail's head is travelling in this pose, if it is swung in it (a blow, a slam, a swing): its flame trails behind. */
  let ballMotion: P3 | undefined;
  const F: P3 = [Math.sin(wr.turn), 0, Math.cos(wr.turn)], R: P3 = [Math.cos(wr.turn), 0, -Math.sin(wr.turn)];
  // The trail of a swing just made (`Stance.arch`), as every trail is drawn (`trailPart`): round her flail shoulder in a plane like the one the flail whirls
  // in (upright, along the way her chest faces), through the flail's head, centred level with her flail shoulder; from low in front of her, up, and curving
  // back over to the head, as thick there as the head.
  /** That circle, for a pose: its centre, radius, and the angle the head is at round it (in the plane of `F` and `UP`). */
  const archOf = (rig: typeof wr) => {
    const ball = flail3(rig).ball, sh = rig.rig.joints.shoulderR, centre = plus(sh, R, dot(minus(ball, sh), R)), v = minus(ball, centre);
    return { centre, radius: Math.hypot(dot(v, F), dot(v, UP)) || 1e-6, end: Math.atan2(dot(v, UP), dot(v, F)) };
  };
  if (isWardenPose(pose) && WARDEN_STANCE[pose].arch) {
    const { centre, radius, end } = archOf(wr);
    // (it goes round the circle the way the trail does: up and back over)
    ballMotion = unit(plus([F[0] * -Math.sin(end), F[1] * -Math.sin(end), F[2] * -Math.sin(end)], UP, Math.cos(end)));
    parts.push(trailPart(c, "R-arch", { centre, e1: F, e2: UP, radius, a0: end - (160 * Math.PI) / 180, a1: end, thick: 2 * FLAIL_BALL * U }));
  }
  // The second (`Stance.arch2`): that pose's arch carried on, round the same circle the same way, from where it had the flail's head (over her head) until
  // it meets the ring of the whirl here (or, going round outside it, where it passes nearest it, running along it the same way, within its band); in the
  // whirl's own plane, so it ends on its ring.
  const arch2 = isWardenPose(pose) ? WARDEN_STANCE[pose].arch2 : undefined;
  if (arch2 && flat.spin === "behind") {
    const first = archOf(wardenRig(arch2)), ring = CHAIN_R * U, T = fl.tip;
    // (in the plane's own terms: how far along `F` and up; the two circles' centres, and where on the first it first comes to the ring, going on round)
    const c1 = [dot(first.centre, F), dot(first.centre, UP)], c2 = [dot(T, F), dot(T, UP)];
    const off = (a: number) => Math.hypot(c1[0] + Math.cos(a) * first.radius - c2[0], c1[1] + Math.sin(a) * first.radius - c2[1]) - ring;
    let hit = NaN, best = Infinity, bestAt = first.end;
    for (let i = 1, was = off(first.end); i <= 360 && Number.isNaN(hit); i++) {
      const a = first.end + (i / 360) * Math.PI * 2, now = off(a);
      if (Math.abs(now) < best) { best = Math.abs(now); bestAt = a; }
      if ((was > 0) !== (now > 0)) hit = a - ((now / (now - was)) * Math.PI * 2) / 360;
      was = now;
    }
    const centre = plus(first.centre, R, dot(minus(T, first.centre), R));
    parts.push(trailPart(c, "R-arch2", { centre, e1: F, e2: UP, radius: first.radius, a0: first.end, a1: Number.isNaN(hit) ? bestAt : hit, thick: 2 * FLAIL_BALL * U }));
  }
  // The trail of a blow swung up to the flail's head (`Stance.blowArc`): from where the pose says, bowing out before her chest (the way it faces) halfway,
  // up to the head, as thick there as it (or as many times that as the pose says); as every trail is drawn.
  const blow = isWardenPose(pose) ? WARDEN_STANCE[pose].blowArc : undefined;
  if (blow) {
    // (`reaching`: toward whoever she fights, which is straight ahead of where she faces before her hips turn, instead of before her chest)
    const out: P3 = blow.reaching ? [-Math.sin(wr.yaw), 0, Math.cos(wr.yaw)] : F, mid = plus(mix(blow.from, fl.ball, 0.5), out, blow.bulge);
    // (its thick end centred on the head: the circle widened by half its thickness, so the head is in the middle of the band, not on its outer edge)
    const round = swingArc(blow.from, fl.ball, 2 * FLAIL_BALL * U * (blow.thick ?? 1), mid).circle;
    ballMotion = unit(minus(fl.ball, mid));
    parts.push(trailPart(c, "R-blow", { ...round, radius: round.radius + round.thick / 2 }));
  }
  // The trail of the flail brought down from a whirl overhead (`Stance.slamFrom`): from that pose's ring (its tip, on the level, out as far as the chain goes)
  // at the back of it, away from where the head comes down, up over and down to the head here, bowing up and forward as a blow does; its thick end on the head.
  const slamFrom = isWardenPose(pose) ? WARDEN_STANCE[pose].slamFrom : undefined;
  if (slamFrom) {
    const over = flail3(wardenRig(slamFrom)).tip, flatWay = unit([fl.ball[0] - over[0], 0, fl.ball[2] - over[2]]);
    const start = plus(over, flatWay, -CHAIN_R * U), round = swingArc(start, fl.ball, 2 * FLAIL_BALL * U).circle;
    ballMotion = unit(plus(flatWay, UP, -1.2));
    parts.push(trailPart(c, "R-slam", { ...round, radius: round.radius + round.thick / 2 }));
  }
  // (a pose that swings the flail without a trail to say how: `Stance.flailMotion`)
  const stanceMotion = isWardenPose(pose) ? WARDEN_STANCE[pose].flailMotion : undefined;
  if (stanceMotion && !ballMotion) ballMotion = unit(stanceMotion);
  // Clutch Arm's rewaxing, drawn on the pose he moves on to while it fades (`rewaxTrail` on the pose moved on from, as the sprite has it): a wide sweep of wax
  // from where the flail's head was, held just under his wax fist there, through his wax hand now, to where the head hangs now; as every trail is drawn.
  if (lingerFrom && WARDEN_POSES[lingerFrom]?.rewaxTrail && isWardenPose(lingerFrom)) {
    const was = wardenRig(lingerFrom), turn = was.yaw - wr.yaw, ct = Math.cos(turn), st = Math.sin(turn);
    // (a point of that pose, as this one's body has it: both stand on the same spot facing the same way, their hips turned differently)
    const here = (p: P3): P3 => [p[0] * ct + p[2] * st, p[1], p[2] * ct - p[0] * st];
    const from = here(plus(was.rig.joints.handL, UP, -6 * U));
    parts.push(trailPart(c, "R-rewax", swingArc(from, fl.ball, 8 * U, j.handL).circle));
  }
  if (flat.spin) {
    // Whirling too fast to see: a faint ring where the head travels.
    // (or, `Stance.spinSquare`, square to the handle: round its line, upright; or, `Stance.spinFacing`, facing whoever she fights: square to the way to them,
    // which is straight ahead of where she faces before her hips turn, upright)
    const st = isWardenPose(pose) ? WARDEN_STANCE[pose] : undefined, along = unit(minus(fl.tip, fl.butt));
    const across = unit(cross(UP, along)), squareUp = unit(cross(along, across)), toYou: P3 = [-Math.sin(wr.yaw), 0, Math.cos(wr.yaw)];
    const r = CHAIN_R * U, [a1, a2] = st?.spinFacing ? [unit(cross(UP, toYou)), UP] : st?.spinSquare ? [across, squareUp] : flat.spin === "behind" ? [F, UP] : [R, F];
    const round = (a: number) => plus(plus(fl.tip, a1, Math.cos(a) * r), a2, Math.sin(a) * r);
    const ring = Array.from({ length: 32 }, (_, i) => round((i / 32) * Math.PI * 2));
    // (drawn as the flail is: the disc the chain sweeps in its links' iron, faint, and the band the head runs round in its wax, as wide as the head there)
    parts.push({ key: "R-spin", depth: see(fl.tip).depth - 0.002, node: <polygon key="R-spin" points={pts(ring)} className="fig-whirl-disc" /> });
    parts.push({ key: "R-spin-path", depth: see(fl.tip).depth - 0.0021, node: <polygon key="R-spin-path" points={pts(ring)} className="fig-whirl-path" style={{ strokeWidth: 2 * FLAIL_BALL * scaleAt(see(fl.tip)) }} /> });
    // And three whole flails, chain and head, going round it (`SpinningFlails`): each drawn once here at every step round the ring, far parts under near ones.
    // (each drawn only when it is shown, and once: only three of the twenty-four are on the screen at a time)
    const frames = Array.from({ length: SPIN_STEPS }, (_, n) => {
      let drawn: ReactNode;
      return () => drawn ??= (() => {
        const end = round((n / SPIN_STEPS) * Math.PI * 2), from = parts.length;
        chain(`R-whirl${n}`, knob, end, 0, true);
        // (going round the ring the way the whirl turns: its flame trails behind along it)
        head(`R-whirl${n}-head`, end, unit(minus(round(((n + 0.5) / SPIN_STEPS) * Math.PI * 2), round(((n - 0.5) / SPIN_STEPS) * Math.PI * 2))));
        const mine = parts.splice(from).sort((a, b) => b.depth - a.depth);
        return <g key={n}>{mine.map(p => p.node)}</g>;
      })();
    });
    parts.push({ key: "R-whirl", depth: see(fl.tip).depth - 0.0025, node: <SpinningFlails key="R-whirl" frames={frames} /> });
  } else if (fl.grip) {
    // (his candle hand holds the chain: it runs from the handle to that hand, and on from it to the head. Between the handle and the hand there is more
    // chain than the gap: it hangs slack, sagging as much as its length leaves it, a parabola's)
    const gap = Math.hypot(...minus(fl.grip, knob)) / U, slack = Math.max(0, FLAIL_CHAIN - Math.hypot(...minus(fl.ball, fl.grip)) / U), sag = !wr.flailDirs?.taut && gap < slack ? Math.sqrt((3 * gap * (slack - gap)) / 8) : 0;
    chain("R-chain", knob, fl.grip, sag);
    chain("R-chain-low", fl.grip, fl.ball, 0, true);
    head("R-head", fl.ball, ballMotion);
  } else if (flat.chainInHand) {
    chain("R-chain", knob, j.handL, flat.chainTaut ? 0 : 4);
    // (and from his other hand, the rest of the chain down to the head hanging from it)
    chain("R-chain-low", j.handL, fl.ball, 0, true);
    head("R-head", fl.ball, ballMotion);
  } else if (flat.headInHand) {
    chain("R-chain", knob, fl.ball, 0, true);
    head("R-head", fl.ball, ballMotion);
  } else if (!flat.spinTrail || wr.flailDirs) {
    // (just done spinning, no head hangs yet: it is still whirling; unless the 3D pose holds it its own way, `Stance.flail`, and shows it where it is)
    // (bowed as the pose says, `Stance.chainBow`: up, for a flail whipped up)
    chain("R-chain", knob, fl.ball, (isWardenPose(pose) ? WARDEN_STANCE[pose].chainBow : undefined) ?? (fl.resting ? -1 : 3), true);
    head("R-head", fl.ball, ballMotion);
  }

  /* ---------- The head: his hood, the dark of its opening, and his beak ---------- */
  const hs = seen.head, kh = scaleAt(hs), headAt = j.head, look = wr.gaze;
  /** Seen from well below, his neck is in front of his head (it comes up into the hood through the opening). */
  const neckFront = look3At(headAt)[1] > 0.3;
  parts.push({ key: "hood", depth: hs.depth - 0.01, node: <circle key="hood" cx={X(hs)} cy={Y(hs)} r={HOOD_R * kh} className="fig-hood" /> });
  // The hood's opening is everything below a hem that runs round the head: low over his brow in front (over his eyes), lower down the sides, and lowest at the back,
  // where it wraps round the nape of his neck.
  const f = unit(look), faceUp = unit(minus(UP, f.map(v => v * dot(UP, f)) as unknown as P3)), fh = unit([f[0], 0, f[2]]), sideH = unit(cross(UP, fh)), el0 = Math.asin(Math.max(-1, Math.min(1, f[1])));
  const hemAt = (c: number) => el0 * c - (BROW + (NAPE - BROW) * (1 - c) / 2);
  const inside = (v: P3) => { const hz = Math.hypot(v[0], v[2]) || 1; return Math.asin(Math.max(-1, Math.min(1, v[1]))) < hemAt(dot(v, fh) / hz); };
  /** The neck cone's strips whose gray outside is seen, and how far each is (the beak is drawn over those farther than it). */
  const coneOutside: { key: string; nat: number }[] = [];
  {
    // His neck is a cylinder of wax up into the hood, cut flat at both ends (the circle there seen as the ellipse it looks like, as a limb's cut end is: `bones`' `cut`; the
    // top where the cylinder meets the hood's round, as far down from the head's middle as the ball's surface is at the neck's own radius), and round it a gray cone
    // that opens up from the neck to the hood, its top rim on the hood's round. The cone is open in front: the strips of it whose top reaches the hood within the hood's
    // opening are not drawn. What is left is a collar: the gray outside where it faces the viewer, the lining's wax inside where it is seen from within.
    const dirN = unit(minus(headAt, j.neck)), coreR = LIMB / 2;
    // (the wax neck starts a little above the neck joint, so its foot does not lie over her chest; the cone round it stays down at the joint, a little over the robe)
    const nb = plus(j.neck, dirN, NECK_RAISE * U);
    const top = plus(headAt, dirN, -Math.sqrt(HOOD_R * HOOD_R - coreR * coreR) * U);
    bones("neck", [see(nb), see(top)], "fig-wax-shell", coreR * 2, 0, { start: { at: nb, axis: dirN }, end: { at: top, axis: dirN } });    const entries: { key: string; nat: number; outside: boolean }[] = [{ key: "neck", nat: depthOf(see(nb), see(top)), outside: false }];
    const rimC = plus(headAt, dirN, -Math.sqrt(HOOD_R * HOOD_R - CONE_TOP * CONE_TOP) * U);
    // (where the cone is open, a thin band of it is left at the bottom: the same cone, a share of its height, which does not reach the hood)
    const bandC = mix(j.neck, rimC, CONE_BAND), bandR = CONE_BASE + (CONE_TOP - CONE_BASE) * CONE_BAND;
    const e1 = unit(minus(fh, dirN.map(v => v * dot(fh, dirN)) as unknown as P3)), e2 = cross(dirN, e1), look0 = look3At(rimC), SECT = 40;
    const ringAt = (c: P3, r: number, a: number): P3 => plus(plus(c, e1, Math.cos(a) * r * U), e2, Math.sin(a) * r * U);
    /**
     * Where the cone's foot is at angle `a`: down its slant from its top there (the rim, or the band's), on to where it meets the robe over her chest, so it sits
     * on the chest egg's top however that lies. (Past the neck joint's ring if the robe is lower there, short of it if higher; at the ring if it never meets it.)
     */
    const footAt = (top: P3, a: number): P3 => {
      const ring = ringAt(j.neck, CONE_BASE, a), d = minus(ring, top);
      if (!robeEgg) return ring;
      const at = (t: number) => plus(top, d, t), STEPS = 40, FAR = 1.8;
      let prev = 0;
      for (let k = 1; k <= STEPS; k++) {
        const t = (FAR * k) / STEPS;
        if (outsideOf(robeEgg, at(t)) <= 0) {
          // (found the robe between the last step and this one: closed in on it)
          let lo = prev, hi = t;
          for (let r = 0; r < 12; r++) { const m = (lo + hi) / 2; if (outsideOf(robeEgg, at(m)) <= 0) hi = m; else lo = m; }
          return at(hi);
        }
        prev = t;
      }
      return ring;
    };
    for (let n = 0; n < SECT; n++) {
      const a0 = (n / SECT) * Math.PI * 2, a1 = ((n + 1) / SECT) * Math.PI * 2, am = (a0 + a1) / 2;
      const open = inside(unit(minus(ringAt(rimC, CONE_TOP, am), headAt))), upC = open ? bandC : rimC, upR = open ? bandR : CONE_TOP;
      // (its strips are outlined in their own colour, `.fig-neck-cone`'s stroke, so no seam shows between them; that outline would stand past the rim by half
      // its width, so where the rim meets the hood it is drawn that much in, toward the head's middle, and the edge lands on the hood's surface)
      const inset = CONE_STROKE / 2 / Math.max(1e-6, kh);
      const onHood = (p: P3): P3 => (open ? p : plus(headAt, unit(minus(p, headAt)), Math.max(0, Math.hypot(...minus(p, headAt)) / U - inset) * U));
      const t0 = onHood(ringAt(upC, upR, a0)), t1 = onHood(ringAt(upC, upR, a1));
      const quad = [footAt(t0, a0), footAt(t1, a1), t1, t0];
      const outward = [0, 1, 2].map(i => e1[i] * Math.cos(am) + e2[i] * Math.sin(am)) as unknown as P3, outside = dot(outward, look0) < 0;
      const key = `neck-cone${n}`, nat = depthOf(...quad.map(q => see(q)));
      entries.push({ key, nat, outside });
      if (outside) coneOutside.push({ key, nat });
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
    // (all in the head's own frame: "down" is down her face, square to where she looks, so the beak is the same however far up or down she looks)
    const drop = 0.6 + BEAK_R, reach = Math.sqrt(Math.max(1, HEAD_R ** 2 - drop * drop));
    const baseAt = plus(plus(headAt, f, reach * U), faceUp, -drop * U), tipAt = plus(baseAt, plus(f.map(v => v * Math.cos(BEAK_DOWN)) as unknown as P3, faceUp, -Math.sin(BEAK_DOWN)), BEAK_LEN * U);
    const axis = unit(minus(tipAt, baseAt)), sideB = unit(cross(faceUp, axis));
    let upB = unit(cross(axis, sideB));
    if (dot(upB, faceUp) < 0) upB = [-upB[0], -upB[1], -upB[2]];
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
      // (below as her face is: along its own down, square to where she looks)
      const waxDepth = dot(minus(headAt, onFace(plus(baseAt, sideB, R))), faceUp) / (HEAD_R * U), waxCap: ReturnType<typeof see>[] = [];
      if (waxDepth > -1 && waxDepth < 1) {
        const ct = waxDepth, st = Math.sqrt(1 - ct * ct), down: P3 = [-faceUp[0], -faceUp[1], -faceUp[2]];
        const e1 = unit(cross(faceUp, f)), e2 = unit(cross(down, e1));
        const wdirs = Array.from({ length: 72 }, (_, i) => (i / 72) * Math.PI * 2).map(a => unit(plus(plus(down.map(v => v * ct) as unknown as P3, e1, st * Math.cos(a)), e2, st * Math.sin(a))));
        for (const d of visibleCap(wdirs, headLook, v => dot(v, down) > ct)) waxCap.push(see(plus(headAt, d, HEAD_R * U)));
      }
      // (all of it inside the hood's own outline: its edge is worked out for a ball seen from the middle of the head, and in perspective may stray a hair past it)
      const hoodClip = `${clip}-hood`;
      parts.push({ key: "hood-dark", depth: hs.depth - 0.012, node: <g key="hood-dark" clipPath={`url(#${hoodClip})`}><clipPath id={hoodClip}><circle cx={X(hs)} cy={Y(hs)} r={HOOD_R * kh} /></clipPath><polygon points={ring.map(p => `${X(p)},${Y(p)}`).join(" ")} className="fig-hood-wax" /></g> });
      // His two eyes: half moons lying on the face's surface, turned the way he looks (each point laid back onto the ball, so they turn and narrow with the head).
      const eyes = [-1, 1].flatMap(sg => {
        // (spread round the face's own up, so they sit across her face however far up or down she looks)
        const a = sg * EYE_APART, ca = Math.cos(a), sa = Math.sin(a), vx = cross(faceUp, f);
        const dir = [0, 1, 2].map(i => f[i] * ca + vx[i] * sa) as unknown as P3;
        if (see(plus(headAt, dir, HEAD_R * U)).depth >= hs.depth) return [];
        const side = unit(cross(faceUp, dir)), upE = unit(cross(dir, side)), r = EYE_R / HEAD_R;
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
    // The hood is a shell, and the beak stands inside it: in front of its far wall (the dark of its inside, and the face), behind its near cloth. So the beak is drawn
    // over the hood's round, the dark and the face, and the hood's near side is drawn again over the beak: the hood's round with the opening cut out of it (seen
    // through the opening, the beak is not hidden), and with the stretch of the beak that sticks out of the hood's ball in front of it cut out too (its tip, seen from
    // the front, is nearer than any of the hood). Seen from behind, the opening is out of sight and the near side hides all of the beak inside the hood's round.
    const beakAt = Math.min(depth, hs.depth - 0.0135);
    {
      const ballHit = (p: P3, d: P3, c: P3, r: number): boolean => {
        const m = minus(p, c), b = dot(m, d), disc = b * b - (dot(m, m) - r * r);
        return disc >= 0 && -b + Math.sqrt(disc) > 0;
      };
      // (the beak's points out of the hood's ball with nothing of the ball between them and the viewer, on its curved top and its flat underside, base to tip)
      const out: [number, number][] = [];
      for (let s = 0; s <= 8; s++) {
        const ring = [
          ...Array.from({ length: 13 }, (_, i) => onFace(plus(plus(baseAt, sideB, Math.cos((Math.PI * i) / 12) * R), upB, Math.sin((Math.PI * i) / 12) * R))),
          ...Array.from({ length: 7 }, (_, i) => onFace(plus(baseAt, sideB, R * (1 - i / 3)))),
        ];
        for (const b0 of ring) {
          const p = mix(b0, tipAt, s / 8), d = look3At(p);
          if (Math.hypot(...minus(p, headAt)) <= HOOD_R * U || ballHit(p, [-d[0], -d[1], -d[2]], headAt, HOOD_R * U)) continue;
          const q = see(p);
          out.push([X(q), Y(q)]);
        }
      }
      const poke = out.length >= 3 ? hull(out) : [];
      const m = `${clip}-hoodover`, r = HOOD_R * kh;
      parts.push({
        // (and when his neck is in front of the head, the hood's near side is over the neck too: it shows only through the opening)
        key: "hood-over", depth: Math.min(beakAt - 0.0003, neckFront ? hs.depth - 0.014 : Infinity),
        node: (
          <g key="hood-over">
            <mask id={m} maskUnits="userSpaceOnUse" x={X(hs) - 2 * r} y={Y(hs) - 2 * r} width={4 * r} height={4 * r}>
              <circle cx={X(hs)} cy={Y(hs)} r={r} fill="white" />
              {openingRing && <polygon points={openingRing} fill="black" />}
              {poke.length > 0 && <polygon points={poke.map(p => p.join(",")).join(" ")} fill="black" />}
            </mask>
            <circle cx={X(hs)} cy={Y(hs)} r={r} className="fig-hood" mask={`url(#${m})`} />
          </g>
        ),
      });
    }
    // The collar's gray outside is drawn over the hood; but where a strip of it is farther than the beak (seen from above, the sides and back of the collar, behind
    // the beak hanging in front), the beak is over it: the strip is cut where the beak is.
    {
      const m = `${clip}-nobeak`, beakShape = (
        <>
          <polygon points={curved.map(p => p.join(",")).join(" ")} fill="black" />
          <polygon points={[tipS, ...straight].map(p => `${X(p)},${Y(p)}`).join(" ")} fill="black" />
        </>
      );
      let any = false;
      // (only with his face turned toward the viewer: from the side or behind, the hood's near side is over the beak anyway)
      for (const e of dot(f, headLook) < 0.15 ? coneOutside : []) {
        if (e.nat <= depth) continue;
        const part = parts.find(x => x.key === e.key);
        if (!part) continue;
        any = true;
        part.node = <g key={e.key} mask={`url(#${m})`}>{part.node}</g>;
      }
      if (any) parts.push({ key: "beak-mask", depth: 1e9, node: <mask key="beak-mask" id={m} maskUnits="userSpaceOnUse" x={-1e4} y={-1e4} width={2e4} height={2e4}><rect x={-1e4} y={-1e4} width={2e4} height={2e4} fill="white" />{beakShape}</mask> });
    }
    parts.push({ key: "beak", depth: beakAt + (flatFaces ? 0.0002 : 0), node: <polygon key="beak" points={curved.map(p => p.join(",")).join(" ")} className="fig-beak fig-beak-solid" /> });
    parts.push({ key: "beak-flat", depth: beakAt + (flatFaces ? 0 : 0.0002), node: <polygon key="beak-flat" points={[tipS, ...straight].map(p => `${X(p)},${Y(p)}`).join(" ")} className="fig-beak fig-beak-solid fig-beak-flat" /> });
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
        if (behind <= STEPS / 2) parts.push({ key: `beak-line${n}`, depth: beakAt - 0.0001, node: <polyline key={`beak-line${n}`} points={[corner, tipAt].map(q => { const o = see(q); return `${X(o)},${Y(o)}`; }).join(" ")} className="fig-beak-line" /> });
      });
    }
  }

  // (her right leg is not drawn in a pose whose skirt covers it all: `hideRightLeg`)
  const shown = wr.hideRightLeg ? parts.filter(x => x.key !== "thighR" && x.key !== "legR") : parts;
  return <FlailFire.Provider value={!!flailFire}><Figure3DSvg parts={shown} title={title} className={className} /></FlailFire.Provider>;
}

/** The radius of the flail's whirl: the chain's length (figure units). */
const CHAIN_R = 34;

/** The Warden, worked out again only when something it is drawn from has changed (`sameDrawing`). */
/** How many steps round its ring a whirling flail is drawn at, and how long it takes to go round once (ms). */
const SPIN_STEPS = 24, SPIN_TURN_MS = 400;
/**
 * Each whirling flail's fading, over and over: it rises from half seen to solid and back down over `SPIN_SHOW_MS` (the 2D trails' 0.3 s), then stays half
 * seen, as faded as it goes, for `SPIN_FADED_MS`. And how far out of step the three are (shares of that round).
 */
const SPIN_SHOW_MS = 300, SPIN_FADED_MS = 450, SPIN_PHASES = [0, 0.37, 0.71];

/**
 * A flail whirling too fast to follow (Flail Spinning Behind, Overhead): three whole flails, a third of the way round from each other, going round its ring,
 * each fading up to solid and back down to half seen, and staying half seen a while, out of step with the others. It moves on its own, every frame, without the rest of the figure being drawn
 * again: `frames` is the flail drawn once at each step round the ring.
 */
function SpinningFlails({ frames }: { frames: (() => ReactNode)[] }) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    let raf = 0;
    const tick = () => { setNow(performance.now()); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <g>
      {SPIN_PHASES.map((phase, i) => {
        const round = (now / SPIN_TURN_MS + i / 3) % 1, step = Math.floor(round * frames.length) % frames.length;
        const cycle = SPIN_SHOW_MS + SPIN_FADED_MS, at = ((now / cycle + phase) % 1) * cycle;
        const fade = at >= SPIN_SHOW_MS ? 0.5 : 0.5 + 0.5 * Math.sin((Math.PI * at) / SPIN_SHOW_MS) ** 2;
        return <g key={i} opacity={fade}>{frames[step]()}</g>;
      })}
    </g>
  );
}

export const Warden3D = memo(Warden3DView, sameDrawing);
