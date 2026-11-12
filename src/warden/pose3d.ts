/**
 * pose3d.ts — the Penitent Warden's poses on the 3D rig (`render/Warden3D.tsx`).
 *
 * His flat poses (skeleton.ts) were tuned to trick the eye in the 3/4 view: their shoulders, hips and flags (`turn`, `faceBack`, `backView`,
 * `flailArmOver`...) are not real positions. So his 3D turn is not translated from them: each pose says how far his HIPS and his SHOULDERS really
 * face (`WARDEN_STANCE`), read from the two things the art commits to: the opening of his robe (his left side, sealed from armpit to hip, gaping
 * below it) and his wax shoulder (the left one, the candle arm): which way each faces, and so how far the chest has turned on the hips.
 * The flat poses only say where his hands, flail and feet go.
 *
 * Angles are degrees from facing whoever he fights, positive when his LEFT side (the robe's opening, the wax shoulder) swings toward them, negative
 * when his right (flail) shoulder leads and the wax side turns away.
 */
import { METERS_PER_UNIT as U, type Cam, type Vec } from "../render/camera";
import type { Side } from "../core/types";
import { RIG } from "../render/rig";
import { JOINTS, liftPose, type P3, placeRig, type Rig3 } from "../render/rig3d";
import type { Skeleton } from "../render/poses";
import { WARDEN_POSES, type WardenPoseName, type WardenSkeleton } from "./skeleton";

/**
 * How far a pose turns his hips and his shoulders (degrees; see the file's note), and anything else the 3D rig should do differently for it.
 * `head`: where his face turns, the same way (by default as near whoever he fights as his neck lets him).
 * `lean`: all of him tipped over toward his right (degrees; negative: his left), pivoting on that foot, as he springs away. He is built upright and tipped
 * as one piece, cloth and all, so his robe hangs along him as if its pull had swung over with the lean: a dodge's motion throws it back the other way.
 */
export interface Stance {
  hips: number; shoulders: number; head?: number; lean?: number; for3d?: Skeleton["for3d"];
  /** How far up his face points (degrees; negative: down), in his own frame, in place of the flat pose's `tilt`: with a lean, what makes his gaze level. */
  pitch?: number;
  /**
   * The flail held its own way in 3D, in body space (x his right, y up, z ahead, as his hips face; any length): the way the handle points from his
   * fist toward the chain's end, and the way the chain runs from there to the head (it hangs that way, straight, unless the floor stops it).
   * `held`: his candle hand holds the chain this far (figure units) from the head: the chain runs from the handle to that hand, and on from it, the way
   * `chain` says, to the head. Or `taut`: his candle hand holds it pulled straight from the handle, and the rest of its length runs on past the hand to the head.
   */
  flail?: { handle: P3; chain: P3; held?: number; taut?: boolean };
  /** The pelvis egg's axis swung this share of the way toward the spine (the line up to the chest egg's middle): for a pose whose chest is turned well away from its hips. */
  pelvisAlign?: number;
}

const S = (hips: number, shoulders: number): Stance => ({ hips, shoulders });

const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Idle's arms in space: the flail arm hanging a little out from his side, the forearm out a little further (the flat pose spreads the hands across the
 * picture, which the lift would make a swing forward and back); the wax arm further out and back, so that from the camera it stands clear of his
 * body. Directions in body space (x his right, y up, z ahead): upper arm, then forearm.
 */
export const IDLE_ARMS: Skeleton["arms3"] = {
  right: { dirs: [[0.3, -0.95, 0.05], [0.45, -0.88, 0.15]] },
  left: { dirs: [[-0.45, -0.85, -0.25], [-0.55, -0.7, -0.45]] },
};

export const WARDEN_STANCE: Record<WardenPoseName, Stance> = {
  // Stances
  "wd-idle": { hips: 22.5, shoulders: 0, head: 0, for3d: { arms3: IDLE_ARMS } }, // chest out, hands a little out from his sides, the flail on the floor; hips turned 22.5° to his right, the chest and head facing you
  "wd-shoulder": S(45, 60), // the wax shoulder forward, its elbow raised, the hand behind his head; the flail arm trails low behind
  "wd-arm-back": S(-60, -75), // flail shoulder first, the wax side away, looking back over it; the rip is on his far side
  "wd-arm-chest": S(0, 15), // the wax arm folded across his chest turns that shoulder in a little
  "wd-clutch-flail": S(-60, -75), // Wax Arm Back, the flail hauled up by its chain
  "wd-spin-behind": S(50, 80), // the wax elbow pointing at you, the flail whirling behind him
  "wd-spin-over": S(0, -10), // hips front; the flail arm raised overhead draws its shoulder forward
  "wd-kneel": S(0, 10), // facing you, head bowed, the right knee raised under the cloak
  // Actions
  "wd-swing": S(45, 70),
  "wd-rising": S(-25, -70), // hips nearly front, the shoulders twisted so the flail shoulder is forward and the wax one back
  "wd-slam": S(0, -30), // kneeling, the flail arm driven down and back, the wax arm flung up
  "wd-punch": S(10, 35), // kneeling, the wax fist driven into the ground: the left shoulder forward
  "wd-fan": S(-50, -70), // the backhand: the wax arm flung straight back, away from you
  "wd-blast": S(10, 35),
  "wd-chain-guard": S(30, 50), // the wax fist holds the taut chain out in front, its forearm foreshortened toward you
  "wd-wax-guard": S(0, 10),
  // Idle turned a quarter round to his right, his chest on round to give you his back and his head further still, to his right, leaning away from you (toward his right), his robe swung with him
  // (her left knee raised to the front, the thigh well up, the shin bent back under it, the foot off the floor)
  // (her wax arm reaching back toward you along the flail's line, stretched nearly straight, the elbow a little low, the hand on the chain pulled taut: the
  // flail trails in a straight line the way she springs from)
  // (her flail arm: the upper arm pointing nearly straight away from you (her hips' right), a little above her shoulder; the elbow bent back so the fist comes
  // round in front of her chest, a little raised. The handle level in it, pointing back toward you, the chain and head trailing after it, away from where she
  // springs, past the left side of her head)
  "wd-turn-away": {
    // (her face pointed up as far as the lean tips it down, so she looks level: her gaze runs along the line the lean tips over)
    hips: 90, shoulders: 160, head: 182.5, lean: 22, pitch: 22, pelvisAlign: 0.7,
    for3d: { arms3: { right: { dirs: [[0.9, 0.2, -0.35], [-0.42, 0.1, 0.9]] }, left: { aim: { dir: [-0.822, -0.546, 0.16], reach: 0.974, bend: [0, -1, 0] } } }, legDirs3: { left: [[-0.1, -0.45, 0.89], [0, -0.85, -0.53]] } },
    // (written in her own frame, which the lean tips: the handle there points a little down so that, leaned, it is level; the chain more so, so that it trails
    // downward toward you)
    flail: { handle: [-0.9, -0.364, 0.45], chain: [-1, -0.728, 0], taut: true },
  },
  "wd-stride": S(-160, -170), // his back to you, spun on his right leg; the arms trail the spin
  "wd-usurp": S(-50, -60), // Wax Arm Back, crouched lower; only his head turns to the flame
  "wd-clutch-arm": S(0, 15),
  "wd-fallen": S(0, 10), // on a knee, propped on the flail's handle, head hanging
  "wd-wound-up": S(45, 70),
  "wd-wax-swat": S(-50, -70),
  "wd-usurp-dash": S(0, 25), // a low lunge, the wax hand reaching ahead
  "wd-flinch": S(0, 0), // thrown off balance, leaning, not twisting
  "wd-chain-ready": S(30, 45),
  "wd-wax-ready": S(0, 10),
  "wd-winding-up": S(40, 55),
  "wd-clutch-ready": S(0, 20),
  // The viewer's T-poses are turned by the viewer itself
  "wd-t": S(0, 0),
  "wd-t-b": S(0, 0),
};

/** How far his head may turn from his shoulders (degrees): he looks at you over a turned shoulder, as far as his neck lets him. */
const NECK_TURN = 75;


/** A pose lifted into space, and how it is turned. */
export interface WardenRig {
  rig: Rig3;
  /** The flat pose it comes from. */
  flat: WardenSkeleton;
  /** The yaw (radians, to his right) his hips add to the way he faces. */
  yaw: number;
  /** How far his shoulders are turned on his hips (radians, to his right): the rig's `turn3`. */
  turn: number;
  /** Which way his face points, in body space. */
  gaze: P3;
  /** The flail held its own way (`Stance.flail`). */
  flailDirs?: Stance["flail"];
  /** How far his pelvis egg's axis is swung toward his spine (`Stance.pelvisAlign`). */
  pelvisAlign?: number;
}

const cache = new Map<string, WardenRig>();

/**
 * Her shins are this much longer than the rig's (a share of its length) and her thighs this much shorter; her hips are raised on her body by the difference,
 * so her thighs start closer to the belt, and her knees stand where the longer shins put them.
 */
export const SHIN_LONGER = 1.15, THIGH_SHORTER = 0.92;

/**
 * Her legs: each hip raised on her body by the shin's extra length less what the thigh is shorter by, the thigh hung from it its way (shorter), the shin from
 * the knee its way, longer. Then all of her let down (or up) so the lower foot is as low as it was: a standing leg's foot stays on the floor, her body where it was.
 */
function longerShins(rig: Rig3): Rig3 {
  const j = { ...rig.joints }, low = Math.min(j.footR[1], j.footL[1]);
  const raise = (RIG.shin * (SHIN_LONGER - 1) - RIG.thigh * (1 - THIGH_SHORTER)) * U;
  for (const side of ["R", "L"] as const) {
    const hip = j[`hip${side}`], knee = j[`knee${side}`], foot = j[`foot${side}`];
    const hip2: P3 = [hip[0], hip[1] + raise, hip[2]], knee2 = plus(hip2, [knee[0] - hip[0], knee[1] - hip[1], knee[2] - hip[2]], THIGH_SHORTER);
    j[`hip${side}`] = hip2;
    j[`knee${side}`] = knee2;
    j[`foot${side}`] = plus(knee2, [foot[0] - knee[0], foot[1] - knee[1], foot[2] - knee[2]], SHIN_LONGER);
  }
  const down = Math.min(j.footR[1], j.footL[1]) - low;
  if (Math.abs(down) > 1e-9) for (const k of JOINTS) j[k] = [j[k][0], j[k][1] - down, j[k][2]];
  return { ...rig, joints: j };
}

/**
 * His arms at their true lengths from the shoulders they hang from. (The lift fits an arm from the neck and then sets its shoulder out to the
 * side and a little lower, which stretches or shortens the upper arm by up to a tenth.) Each bone keeps its direction: the elbow slides along
 * the upper arm, and the forearm follows it.
 */
function trueArms(rig: Rig3): Rig3 {
  const j = { ...rig.joints };
  for (const side of ["R", "L"] as const) {
    const sh = j[`shoulder${side}`], el = j[`elbow${side}`], hd = j[`hand${side}`];
    const u: P3 = [el[0] - sh[0], el[1] - sh[1], el[2] - sh[2]], f: P3 = [hd[0] - el[0], hd[1] - el[1], hd[2] - el[2]];
    const ul = Math.hypot(...u) || 1, fl = Math.hypot(...f) || 1;
    const elbow = plus(sh, u, (RIG.upperArm * U) / ul);
    j[`elbow${side}`] = elbow;
    j[`hand${side}`] = plus(elbow, f, (RIG.forearm * U) / fl);
  }
  return { ...rig, joints: j };
}

/** Whether a pose name is one of the Warden's. */
export const isWardenPose = (pose: string): pose is WardenPoseName => pose in WARDEN_STANCE;

/** The Warden's pose on the rig (worked out once). */
export function wardenRig(pose: string): WardenRig {
  const name: WardenPoseName = isWardenPose(pose) ? pose : "wd-idle";
  const hit = cache.get(name);
  if (hit) return hit;
  // (A 3D pose of its own may lift another's body: `pose3d`.)
  const flat = WARDEN_POSES[WARDEN_POSES[name].pose3d ?? name], st = WARDEN_STANCE[name];
  // His left leg is the one the rip shows: the lead leg while his candle side is toward you, the rear one otherwise.
  const leadSide: Side = (flat.turn ?? 0) >= 0.5 ? "left" : "right";
  // In space every bone is its true length: the flat poses' stretches (`adjust`: a punch that reaches further, a forearm shortened for the 3/4
  // view) are left to the flat sprites. Each bone keeps the direction its pose gives it.
  const sk: WardenSkeleton = { ...flat, adjust: undefined, leadSide, for3d: { ...flat.for3d, ...st.for3d, turn3: st.shoulders - st.hips } };
  const rig = longerShins(trueArms(liftPose(sk, "right", { freeLegs: true })));
  // His head looks at whoever he fights, as far as his neck allows from his shoulders, chin raised or lowered by the pose's `tilt`.
  const headAbs = st.head ?? Math.max(st.shoulders - NECK_TURN, Math.min(st.shoulders + NECK_TURN, 0)), yaw = rad(headAbs - st.hips), pitch = rad(st.pitch ?? -(flat.tilt ?? 0));
  const gaze: P3 = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
  const made: WardenRig = { rig: { ...rig, gaze }, flat, yaw: rad(st.hips), turn: rad(st.shoulders - st.hips), gaze, flailDirs: st.flail, pelvisAlign: st.pelvisAlign };
  cache.set(name, made);
  return made;
}

/**
 * He stands on the floor at `at`, facing `yaw` (toward whoever he fights) with his hips turned as his pose says, seen through the camera; tipped over as
 * the pose leans (`Stance.lean`): every point, the joints and all that is built on them, is turned about the foot he leans toward as it is seen.
 */
export function placeWarden(pose: string, at: Vec, yaw: number, cam: Cam, w: number, h: number, scale = 1) {
  const wr = wardenRig(pose), base = placeRig(wr.rig, at, yaw + wr.yaw, cam, w, h, scale);
  const lean = isWardenPose(pose) ? WARDEN_STANCE[pose].lean ?? 0 : 0;
  if (!lean) return { wr, placed: base };
  // (about the line along his facing through the foot he leans toward: up tips toward his right for a positive lean)
  const j = wr.rig.joints, foot = lean > 0 ? (j.footR[0] > j.footL[0] ? j.footR : j.footL) : (j.footR[0] < j.footL[0] ? j.footR : j.footL);
  const c = Math.cos(rad(lean)), s = Math.sin(rad(lean));
  const tip = (p: P3): P3 => { const x = p[0] - foot[0], y = p[1] - foot[1]; return [foot[0] + x * c + y * s, foot[1] - x * s + y * c, p[2]]; };
  const see = (p: P3) => base.see(tip(p));
  const seen = Object.fromEntries(JOINTS.map(k => [k, see(j[k])])) as typeof base.seen;
  /** A point that lies on the floor (the flail's head resting there) stays on it: where to put it so that, tipped, it is back down at its height. */
  const grounded = (p: P3): P3 => {
    const t = tip(p), x = t[0] - foot[0], y = p[1] - foot[1];
    return [foot[0] + x * c - y * s, foot[1] + x * s + y * c, p[2]];
  };
  return { wr, placed: { ...base, see, seen, grounded, prop: wr.rig.prop && { kind: wr.rig.prop.kind, at: see(wr.rig.prop.at) }, origin: see([0, 0, 0]) } };
}

/**
 * The flail's handle is this long (figure units), held at its middle (as the flat figure's); its chain runs this far from the handle's tip to the
 * middle of its head: the whirl's length (34, as far as the spin's chain runs) and the head's radius beyond it, so a hanging chain shows as many
 * links as a whirling one. (The flat figure's is 34 to the head's middle.)
 */
const HANDLE_HALF = 15, CHAIN = 40;
/** The chain's length (figure units, the handle's tip to the head's middle). */
export const FLAIL_CHAIN = CHAIN;
/** How high the head's middle is when it rests on the floor (figure units). */
const HEAD_REST = 6;

/** The flail in space: the handle's ends, where the head hangs (or is held), and whether it lies on the floor; `grip`: where his candle hand holds the chain. */
export interface Flail3 { butt: P3; tip: P3; ball: P3; resting: boolean; grip?: P3 }

const plus = (a: P3, b: P3, k = 1): P3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

/** The flail in his hand: the handle at the flat pose's angle (turned with his shoulders), the head where that pose hangs or holds it. */
export function flail3(wr: WardenRig): Flail3 {
  const { rig, flat, turn } = wr, j = rig.joints, hand = j.handR;
  // A way in the flat pose's side plane (ahead, down), turned with his shoulders into space.
  const lift = (dx: number, dy: number): P3 => [dx * Math.sin(turn), -dy, dx * Math.cos(turn)];
  const [hx, hy] = flat.weaponArm.hand;
  // (The 3D figure may hold it otherwise than the flat pose: `flail3d`.)
  const at = flat.flail3d?.ball ?? flat.ball;
  const deg = flat.flail3d?.handle ?? flat.handle ?? (Math.atan2(at[1] - hy, at[0] - hx) * 180) / Math.PI;
  const dir = lift(Math.cos(rad(deg)), Math.sin(rad(deg)));
  // (held where the pose says, `handleGrip` from the handle's middle: the handle slides through the hand)
  const g = flat.handleGrip ?? 0;
  // Held its own way (`Stance.flail`): the handle and the chain each straight along the way given, the head the chain's length on.
  if (wr.flailDirs) {
    const unit3 = (v: P3): P3 => { const n = Math.hypot(...v) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };
    const hd = unit3(wr.flailDirs.handle), cd = unit3(wr.flailDirs.chain);
    const tip3 = plus(hand, hd, (HANDLE_HALF - g) * U), butt3 = plus(hand, hd, -(HANDLE_HALF + g) * U);
    const held = wr.flailDirs.taut ? Math.max(0, CHAIN - Math.hypot(...[0, 1, 2].map(i => j.handL[i] - tip3[i])) / U) : wr.flailDirs.held;
    if (held !== undefined) return { butt: butt3, tip: tip3, grip: j.handL, ball: plus(j.handL, cd, held * U), resting: false };
    const ball3 = plus(tip3, cd, CHAIN * U);
    if (ball3[1] >= HEAD_REST * U) return { butt: butt3, tip: tip3, ball: ball3, resting: false };
  }
  const tip = plus(hand, dir, (HANDLE_HALF - g) * U), butt = plus(hand, dir, -(HANDLE_HALF + g) * U);
  const left = j.handL;
  if (flat.chainInHand) return { butt, tip, ball: plus(left, [0, -1, 0], (flat.headBehindArm ? 16 : 12) * U), resting: false };
  if (flat.headInHand) return { butt, tip, ball: plus(left, [0, -1, 0], 6 * U), resting: false };
  if (flat.held) return { butt, tip, ball: plus(hand, lift(at[0] - hx, at[1] - hy), U), resting: false };
  // Hanging from the tip toward where the pose has the head, the chain's length.
  const tipFlat: [number, number] = [hx + Math.cos(rad(deg)) * (HANDLE_HALF - g), hy + Math.sin(rad(deg)) * (HANDLE_HALF - g)];
  const vx = at[0] - tipFlat[0], vy = at[1] - tipFlat[1], len = Math.hypot(vx, vy);
  const way = len > 0.01 ? lift(vx / len, vy / len) : lift(0, 1);
  let ball = plus(tip, way, CHAIN * U);
  const floor = HEAD_REST * U;
  if (ball[1] >= floor) return { butt, tip, ball, resting: false };
  // Resting on the floor: the chain lies along it, as far as its length goes.
  const drop = Math.max(0, tip[1] - floor), run = Math.sqrt(Math.max(0, (CHAIN * U) ** 2 - drop * drop));
  const flatLen = Math.hypot(way[0], way[2]) || 1;
  // (swung round along the floor as the pose says, `flail3d.lay`: turned about the upright, so a chain lying behind him swings toward his left)
  const lay = rad(flat.flail3d?.lay ?? 0), hx3 = way[0] / flatLen, hz3 = way[2] / flatLen;
  const gx = hx3 * Math.cos(lay) + hz3 * Math.sin(lay), gz = hz3 * Math.cos(lay) - hx3 * Math.sin(lay);
  ball = [tip[0] + gx * run, floor, tip[2] + gz * run];
  return { butt, tip, ball, resting: true };
}

/** The radius of his candle fist, a ball of wax (figure units). */
export const CANDLE_FIST = 5.4;

/**
 * Where the flame on his candle hand stands (body space): the little flame at the very tip of the fist, past the hand along the forearm, moved as the
 * stance says (`flameAt`); in his second form (`centered`), the red flame in the middle of the fist. The 3D figure draws it there and the scene lights from it.
 */
export function wardenFlame(wr: WardenRig, centered: boolean): P3 {
  const j = wr.rig.joints, hand = j.handL;
  if (centered) return hand;
  const [fa, fu, fr] = wr.flat.flameAt ?? [0, 0, 0], f = [hand[0] - j.elbowL[0], hand[1] - j.elbowL[1], hand[2] - j.elbowL[2]] as P3, l = Math.hypot(...f) || 1;
  const side: P3 = [Math.cos(wr.turn), 0, -Math.sin(wr.turn)];
  return plus(plus(plus(hand, f, ((CANDLE_FIST + fa) * U) / l), [0, 1, 0], fu * U), side, fr * U);
}

/** Where a blow of his lands from: his flail's head for the Slam, else his candle fist (body space). */
export function wardenFist(pose: string): P3 {
  const wr = wardenRig(pose);
  return wr.flat.slamTrail ? flail3(wr).ball : wr.rig.joints.handL;
}
