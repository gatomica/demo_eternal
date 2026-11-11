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
import { liftPose, type P3, placeRig, type Rig3 } from "../render/rig3d";
import type { Skeleton } from "../render/poses";
import { WARDEN_POSES, type WardenPoseName, type WardenSkeleton } from "./skeleton";

/** How far a pose turns his hips and his shoulders (degrees; see the file's note), and anything else the 3D rig should do differently for it. */
export interface Stance { hips: number; shoulders: number; for3d?: Skeleton["for3d"] }

const S = (hips: number, shoulders: number): Stance => ({ hips, shoulders });

export const WARDEN_STANCE: Record<WardenPoseName, Stance> = {
  // Stances
  "wd-idle": S(0, 0), // chest out, both hands at his sides, the flail on the floor: neutral
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

const rad = (deg: number) => (deg * Math.PI) / 180;

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
}

const cache = new Map<string, WardenRig>();

/** Whether a pose name is one of the Warden's. */
export const isWardenPose = (pose: string): pose is WardenPoseName => pose in WARDEN_STANCE;

/** The Warden's pose on the rig (worked out once). */
export function wardenRig(pose: string): WardenRig {
  const name: WardenPoseName = isWardenPose(pose) ? pose : "wd-idle";
  const hit = cache.get(name);
  if (hit) return hit;
  const flat = WARDEN_POSES[name], st = WARDEN_STANCE[name];
  // His left leg is the one the rip shows: the lead leg while his candle side is toward you, the rear one otherwise.
  const leadSide: Side = (flat.turn ?? 0) >= 0.5 ? "left" : "right";
  const sk: WardenSkeleton = { ...flat, leadSide, for3d: { ...flat.for3d, ...st.for3d, turn3: st.shoulders - st.hips } };
  const rig = liftPose(sk, "right", { freeLegs: true });
  // His head looks at whoever he fights, as far as his neck allows from his shoulders, chin raised or lowered by the pose's `tilt`.
  const headAbs = Math.max(st.shoulders - NECK_TURN, Math.min(st.shoulders + NECK_TURN, 0)), yaw = rad(headAbs - st.hips), pitch = rad(-(flat.tilt ?? 0));
  const gaze: P3 = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
  const made: WardenRig = { rig: { ...rig, gaze }, flat, yaw: rad(st.hips), turn: rad(st.shoulders - st.hips), gaze };
  cache.set(name, made);
  return made;
}

/** He stands on the floor at `at`, facing `yaw` (toward whoever he fights) with his hips turned as his pose says, seen through the camera. */
export function placeWarden(pose: string, at: Vec, yaw: number, cam: Cam, w: number, h: number, scale = 1) {
  const wr = wardenRig(pose);
  return { wr, placed: placeRig(wr.rig, at, yaw + wr.yaw, cam, w, h, scale) };
}

/** The flail's handle is this long (figure units), held at its middle; its chain is this long. As the flat figure's. */
const HANDLE_HALF = 15, CHAIN = 34;
/** How high the head's middle is when it rests on the floor (figure units). */
const HEAD_REST = 6;

/** The flail in space: the handle's ends, where the head hangs (or is held), and whether it lies on the floor. */
export interface Flail3 { butt: P3; tip: P3; ball: P3; resting: boolean }

const plus = (a: P3, b: P3, k = 1): P3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

/** The flail in his hand: the handle at the flat pose's angle (turned with his shoulders), the head where that pose hangs or holds it. */
export function flail3(wr: WardenRig): Flail3 {
  const { rig, flat, turn } = wr, j = rig.joints, hand = j.handR;
  // A way in the flat pose's side plane (ahead, down), turned with his shoulders into space.
  const lift = (dx: number, dy: number): P3 => [dx * Math.sin(turn), -dy, dx * Math.cos(turn)];
  const [hx, hy] = flat.weaponArm.hand;
  const deg = flat.handle ?? (Math.atan2(flat.ball[1] - hy, flat.ball[0] - hx) * 180) / Math.PI;
  const dir = lift(Math.cos(rad(deg)), Math.sin(rad(deg)));
  const tip = plus(hand, dir, HANDLE_HALF * U), butt = plus(hand, dir, -HANDLE_HALF * U);
  const left = j.handL;
  if (flat.chainInHand) return { butt, tip, ball: plus(left, [0, -1, 0], (flat.headBehindArm ? 16 : 12) * U), resting: false };
  if (flat.headInHand) return { butt, tip, ball: plus(left, [0, -1, 0], 6 * U), resting: false };
  if (flat.held) return { butt, tip, ball: plus(hand, lift(flat.ball[0] - hx, flat.ball[1] - hy), U), resting: false };
  // Hanging from the tip toward where the pose has the head, the chain's length.
  const tipFlat: [number, number] = [hx + Math.cos(rad(deg)) * HANDLE_HALF, hy + Math.sin(rad(deg)) * HANDLE_HALF];
  const vx = flat.ball[0] - tipFlat[0], vy = flat.ball[1] - tipFlat[1], len = Math.hypot(vx, vy);
  const way = len > 0.01 ? lift(vx / len, vy / len) : lift(0, 1);
  let ball = plus(tip, way, CHAIN * U);
  const floor = HEAD_REST * U;
  if (ball[1] >= floor) return { butt, tip, ball, resting: false };
  // Resting on the floor: the chain lies along it, as far as its length goes.
  const drop = Math.max(0, tip[1] - floor), run = Math.sqrt(Math.max(0, (CHAIN * U) ** 2 - drop * drop));
  const flatLen = Math.hypot(way[0], way[2]) || 1;
  ball = [tip[0] + (way[0] / flatLen) * run, floor, tip[2] + (way[2] / flatLen) * run];
  return { butt, tip, ball, resting: true };
}

/** Where a blow of his lands from: his flail's head for the Slam, else his candle fist (body space). */
export function wardenFist(pose: string): P3 {
  const wr = wardenRig(pose);
  return wr.flat.slamTrail ? flail3(wr).ball : wr.rig.joints.handL;
}
