/**
 * skeleton.ts — the Penitent Warden's poses, and where things are on him (his flail, his rip, his swat).
 */
import { createContext } from "react";
import { add, lerp, type Pt } from "../render/geom";
import type { Skeleton } from "../render/poses";
import { type BoneAdjust, fitLimbs, type Mounts, rigged } from "../render/rig";

/** The flail is on fire (phase two, after Clutch Arm): its head burns, its trails are flame. */
export const FlailFire = createContext(false);

export type CandleArm = "lit" | "out" | "scorched";

/** A Warden pose: the skeleton (weaponArm = the flail arm, freeArm = the candle arm) plus the flail's head. */
export interface WardenSkeleton extends Skeleton {
  /** Where the flail's head is. */
  ball: Pt;
  /** The flail whirling: behind him (a vertical circle) or overhead (a flat one). */
  spin?: "behind" | "over";
  /** The trail of a full spin the flail has just finished (like a weapon's swing trail). */
  spinTrail?: boolean;
  /** Flail Slam: a trail of the flail's head coming down from overhead to where it hits the floor
   *  (and the shockwave starts there, not at a fist). */
  slamTrail?: boolean;
  /** The flail arm is in front of his body (drawn over the cloak), not behind it. */
  flailArmOver?: boolean;
  /** Flail Swing: the first of the spin trails is the blow, a level sweep across his front. */
  swingTrail?: boolean;
  /** Rising Flail: the first of the spin trails is the blow, swung up from below through you;
   *  the spins after it whirl level overhead. */
  risingTrail?: boolean;
  /** The pose he moves on to: the last spin trail is centered on where its flail spins. */
  trailEndsAt?: WardenPoseName;
  /** Fire pouring from the candle hand. It's the hand's own flame, stretched out by the motion,
   *  so the usual flame on the hand isn't drawn. */
  burst?: "fan" | "blast";
  /** Head tilt in degrees: negative lifts the chin (looking down his beak at you). */
  tilt?: number;
  /** He looks back over his shoulder: the hood and beak face the other way. */
  faceBack?: boolean;
  /** Turned flail shoulder first: the flail arm's forearm and the flail go behind his body (only
   *  the upper arm comes out over it). */
  flailForearmBehind?: boolean;
  /** His shoulders twisted further than his hips (same scale as `turn`, which keeps the cloak
   *  and legs): the arms are placed and layered by this, and the rip's sealed seam twists with it. */
  shoulderTurn?: number;
  /** His back is to you (turned all the way round): no face, no drool or stain, and the rip's
   *  waxed edge runs down the other side of the cloak. */
  backView?: boolean;
  /** How much his face turns toward the camera, 0 (profile) to 1: the opening widens toward the
   *  middle of the hood and the beak shortens, pointing more at you. */
  faceFront?: number;
  /** The flail's handle, in degrees (0 = facing direction). Default: pointing toward its head. */
  handle?: number;
  /** The flail's head is held (in the candle hand), not hanging: `ball` is used as given. */
  held?: boolean;
  /** The candle hand holds the flail's chain: it runs from the handle to that hand, and the head
   *  hangs just below it. Drawn over his body. */
  chainInHand?: boolean;
  /** The chain held in the candle hand is pulled taut (straight), not sagging. */
  chainTaut?: boolean;
  /** The head hanging from the candle hand is behind the arm, not in front of it. */
  headBehindArm?: boolean;
  /** His far (right) knee is raised under the cloak: the cloak's front runs flat over his thigh
   *  out to the knee, then drops to the ground. */
  kneeUnderCloak?: boolean;
  /** The candle hand grips the flail's head, pulling it up (the chain taut from the handle). */
  headInHand?: boolean;
  /** Clutch Arm: as he moves on to his next pose, a wide wax trail sweeps from where the head
   *  was, through his candle hand there, to where the head ends up (he has rewaxed his arm). */
  rewaxTrail?: boolean;
  /** Wax Guard's swat: Fan Flames' backhand, with a wax trail and no fire. */
  swat?: boolean;
  /** The candle hand goes behind his head (drawn under the hood). */
  armBehindHead?: boolean;
  /** A swing trail behind the candle fist, from where it was drawn back to where it struck: in
   *  the flame's colours, or the wax's for a punch with the cold wax fist. */
  punchTrail?: boolean | "wax";
  /** The candle arm starts from his armpit, where the rip in his cloak begins (turned sideways,
   *  that's further toward you than his usual shoulder). */
  shoulderAtRip?: boolean;
  /** How far he has turned his candle side toward you: 0 is his usual 3/4, 1 fully sideways,
   *  and negative turns the other way (flail shoulder toward you). */
  turn?: number;
}

type Limbs = Pick<WardenSkeleton, "head" | "neck" | "hip" | "leadLeg" | "rearLeg">;

const pose = (
  body: Limbs,
  flail: { elbow: Pt; hand: Pt; ball: Pt },
  candle: { elbow: Pt; hand: Pt },
  extra: Partial<Omit<WardenSkeleton, "head" | "neck" | "hip" | "leadLeg" | "rearLeg" | "weaponArm" | "freeArm" | "weapon" | "ball">> = {},
): WardenSkeleton => ({
  ...body,
  weaponArm: { elbow: flail.elbow, hand: flail.hand },
  freeArm: candle,
  weapon: { at: flail.hand, angle: 0 },
  ball: flail.ball,
  ...extra,
});

const legs = (lk: Pt, lf: Pt, rk: Pt, rf: Pt) => ({ leadLeg: { knee: lk, foot: lf }, rearLeg: { knee: rk, foot: rf } });

export type WardenPoseName =
  | "wd-idle" | "wd-shoulder" | "wd-arm-back" | "wd-arm-chest" | "wd-clutch-flail"
  | "wd-spin-behind" | "wd-spin-over" | "wd-kneel"
  | "wd-swing" | "wd-rising" | "wd-slam" | "wd-punch" | "wd-fan" | "wd-blast"
  | "wd-chain-guard" | "wd-wax-guard" | "wd-stride" | "wd-usurp" | "wd-clutch-arm" | "wd-fallen"
  | "wd-wound-up" | "wd-wax-swat" | "wd-usurp-dash" | "wd-flinch"
  | "wd-t" | "wd-t-b";

/** The poses as written; `WARDEN_POSES` (below) is these fitted to the rig. */
export const RAW_WARDEN_POSES: Record<WardenPoseName, WardenSkeleton> = {
  /* ---------- Stances ---------- */
  // Idle: chest out and leaning back, chin raised, looking down his beak at everyone. Both
  // hands held a little out from his sides; the flail's head rests on the ground beside him.
  "wd-idle": pose(
    { head: [46, 19], neck: [48, 31], hip: [52, 66], ...legs([56, 90], [59, 114], [48, 90], [44, 114]) },
    { elbow: [59, 49], hand: [66, 60], ball: [77, 108] },
    { elbow: [41, 49], hand: [35, 60] },
    { tilt: -18, handle: 70 },
  ),
  // The candle arm flexed high, elbow up near his shoulder, the hand tucked behind his head.
  // Behind him, the flail held low and pointing back, its head resting on the ground.
  "wd-shoulder": pose(
    { head: [52, 22], neck: [51, 33], hip: [48, 66], ...legs([58, 90], [64, 114], [42, 91], [36, 114]) },
    { elbow: [45, 53], hand: [38, 70], ball: [5, 107] },
    { elbow: [65, 33], hand: [44, 14] },
    { armBehindHead: true, turn: 1 },
  ),
  // Wind Up Flail, as the Rest goes through: like Wax Shoulder In but hunched lower, the wax
  // arm bent with its elbow toward you instead of raised behind his head, the flail arm
  // stretched far back and raised a little, the trails of its last spins fading around the
  // handle's end (no head drawn: it's still whirling).
  "wd-wound-up": pose(
    { head: [55, 28], neck: [52, 39], hip: [47, 71], ...legs([59, 93], [66, 114], [40, 94], [33, 114]) },
    { elbow: [38, 52], hand: [29, 53], ball: [12, 130] },
    // The wax arm bent, its elbow pointing at you (foreshortened): a short forearm tucked in
    // under his head, its flame (or smoke) still showing beside the hood.
    { elbow: [71, 55], hand: [66, 50] },
    { handle: 238, shoulderAtRip: true, armBehindHead: true, turn: 1, spinTrail: true, trailEndsAt: "wd-spin-behind" },
  ),
  // Wax Arm Back: turned flail shoulder first, hunched low and leaning back, his weight sunk
  // onto his left leg (bent sharply, knee poking out behind), looking back over his shoulder,
  // the candle arm coiled to punch, elbow raised behind him. The flail drags on the floor behind. His left leg, stretched
  // back, pokes out of the cloak through the rip (on his far side now, out of sight).
  "wd-arm-back": pose(
    { head: [40, 38], neck: [44, 48], hip: [49, 77], ...legs([64, 96], [77, 114], [20, 95], [37, 114]) },
    { elbow: [58, 63], hand: [57, 78], ball: [18, 122] },
    // Pointing away from you, the arm is foreshortened: a short upper arm back to the raised
    // elbow, then the forearm showing beside his head, angled slightly down to the fist.
    { elbow: [31, 37], hand: [24, 41] },
    { turn: -1, handle: 155, faceBack: true, faceFront: 0.6, tilt: 22 },
  ),
  // Arm Over Chest: hunched, the candle arm folded up across his chest (elbow low, fist raised
  // before it); the flail hand held a little up at his side as in Idle, but the handle raised
  // almost level, the flail hanging from it in the air.
  "wd-arm-chest": pose(
    { head: [55, 26], neck: [53, 37], hip: [49, 68], ...legs([57, 91], [61, 114], [44, 91], [40, 114]) },
    { elbow: [61, 50], hand: [67, 58], ball: [83, 120] },
    { elbow: [47, 60], hand: [62, 47] },
    { handle: 8 },
  ),
  // Flail Clutched: Wax Arm Back, but the wax fist has hauled the flail up off the floor by its
  // chain, the head hanging just below it, behind the arm.
  "wd-clutch-flail": pose(
    { head: [40, 38], neck: [44, 48], hip: [49, 77], ...legs([64, 96], [77, 114], [20, 95], [37, 114]) },
    { elbow: [58, 63], hand: [57, 78], ball: [0, 0] },
    { elbow: [29, 37], hand: [18, 41] },
    { turn: -1, handle: 155, faceBack: true, faceFront: 0.6, tilt: 22, chainInHand: true, headBehindArm: true },
  ),
  // Flail Spinning Behind: like Wind Up Flail's rest pose but hunched even lower, the wax arm
  // bent with its elbow toward you, the flail whirling in a circle behind him.
  "wd-spin-behind": pose(
    { head: [58, 34], neck: [54, 45], hip: [47, 75], ...legs([60, 95], [67, 114], [38, 97], [31, 114]) },
    { elbow: [36, 63], hand: [25, 71], ball: [0, 96] },
    { elbow: [73, 61], hand: [68, 56] },
    { handle: 172, shoulderAtRip: true, armBehindHead: true, turn: 1, spin: "behind" },
  ),
  // Flail Spinning Overhead: the flail arm raised, the handle pointing up and away from you, the
  // flail whirling level above him (a blur of chains, like Flail Spinning Behind).
  "wd-spin-over": pose(
    { head: [50, 22], neck: [50, 33], hip: [50, 67], ...legs([59, 90], [65, 114], [42, 90], [36, 114]) },
    { elbow: [58, 22], hand: [55, 10], ball: [30, 0] },
    { elbow: [41, 46], hand: [45, 56] },
    { spin: "over", handle: 245 },
  ),
  // Kneeling: one knee down, head bowed. The flail hand holds the handle by his shoulder, pointing
  // diagonally down and forward (as in Chain Guard), its elbow raised behind his hood; the wax
  // hand, down at his side, holds the chain, the head hanging just below it.
  "wd-kneel": pose(
    { head: [58, 46], neck: [55, 57], hip: [48, 84], ...legs([66, 88], [68, 114], [42, 112], [26, 114]) },
    { elbow: [47, 50], hand: [55.7, 55.4], ball: [0, 0] },
    { elbow: [42, 72], hand: [45, 88] },
    { handle: 35, chainInHand: true, kneeUnderCloak: true },
  ),

  /* ---------- Actions ---------- */
  // Flail Swing lands: Wind Up Flail's pose, but its first spin is the blow, sweeping level across
  // his front through you; the next two spin on behind him, into Flail Spinning Behind.
  "wd-swing": pose(
    { head: [55, 28], neck: [52, 39], hip: [47, 71], ...legs([59, 93], [66, 114], [40, 94], [33, 114]) },
    { elbow: [38, 52], hand: [29, 53], ball: [12, 130] },
    { elbow: [71, 55], hand: [66, 50] },
    { handle: 238, shoulderAtRip: true, armBehindHead: true, turn: 1, spinTrail: true, swingTrail: true, trailEndsAt: "wd-spin-behind" },
  ),
  // Rising Flail lands: Flail Spinning Overhead's pose, hips and legs seen almost from the front,
  // but the shoulders twisted round, flail shoulder forward and the wax one back; the flail arm
  // and handle angled further back. His upper body leans away from you, his weight sinking onto
  // his left leg (its knee bent back). Its first spin trail is the blow, swung up from below through you; the next
  // two whirl level over his head, into Flail Spinning Overhead.
  "wd-rising": pose(
    { head: [42, 25], neck: [45, 36], hip: [49, 70], ...legs([60, 92], [66, 114], [32, 93], [38, 114]) },
    { elbow: [46, 27], hand: [39, 15], ball: [30, 0] },
    { elbow: [35, 49], hand: [39, 59] },
    { handle: 225, faceBack: true, faceFront: 0.6, tilt: 22, turn: -0.4, shoulderTurn: -1, spinTrail: true, risingTrail: true, trailEndsAt: "wd-spin-over" },
  ),
  // Flail Slam lands: down on one knee as in Kneeling, head bowed and looking down (Wax Arm
  // Back's head); the flail arm angled down and back, its hand almost touching the ground, the
  // flail lying along the floor out before him (slanting toward you, the floor seen at an angle),
  // a trail bringing its head down from overhead; the wax arm flung up, elbow above his shoulder.
  "wd-slam": pose(
    { head: [58, 46], neck: [55, 57], hip: [48, 84], ...legs([66, 88], [68, 114], [42, 112], [26, 114]) },
    { elbow: [53, 78], hand: [45, 101], ball: [104, 121] },
    { elbow: [43, 47], hand: [34, 56] },
    { held: true, slamTrail: true, flailArmOver: true, kneeUnderCloak: true, faceBack: true, faceFront: 0.6, tilt: 22 },
  ),
  // Wax Punch lands: Flame Blast's punch with the cold wax fist. He kneels, flail raised over his
  // shoulder, and drives the wax fist into the ground; a wax-coloured trail follows it.
  "wd-punch": pose(
    { head: [65, 52], neck: [58, 61], hip: [47, 87], ...legs([64, 90], [67, 114], [41, 108], [24, 114]) },
    { elbow: [50, 38], hand: [62, 44], ball: [86, 127] },
    { elbow: [54, 89], hand: [71, 108] },
    { tilt: 28, punchTrail: "wax", handle: 70 },
  ),
  // Fan Flames lands: a backhand swat out of Wax Shoulder In. He turns the other way (flail
  // shoulder in, right leg forward, stance low), the candle arm flung out straight behind him,
  // pointing away from you. The fan of flames it throws flies at you (see the scene's projectiles).
  "wd-fan": pose(
    { head: [61, 31], neck: [57, 42], hip: [50, 74], ...legs([67, 94], [78, 114], [37, 96], [25, 114]) },
    { elbow: [72, 58], hand: [70, 72], ball: [78, 120] },
    { elbow: [33, 45], hand: [20, 42] },
    { burst: "fan", turn: -1, handle: 80 },
  ),
  // Wax Guard, as the blow lands: Fan Flames' backhand swat, knocking it aside, a wax trail behind
  // the hand instead of fire.
  "wd-wax-swat": pose(
    { head: [61, 31], neck: [57, 42], hip: [50, 74], ...legs([67, 94], [78, 114], [37, 96], [25, 114]) },
    { elbow: [72, 58], hand: [70, 72], ball: [78, 120] },
    { elbow: [33, 45], hand: [20, 42] },
    { swat: true, turn: -1, handle: 80 },
  ),
  // Flame Blast: dropped to his left knee (almost touching the ground), head bowed, looking down,
  // the wax arm punching the ground before him. The fireball bursts from the blow and the
  // shockwave spreads from there (see the scene's projectiles).
  "wd-blast": pose(
    { head: [65, 52], neck: [58, 61], hip: [47, 87], ...legs([64, 90], [67, 114], [41, 108], [24, 114]) },
    { elbow: [50, 38], hand: [62, 44], ball: [86, 127] },
    { elbow: [54, 89], hand: [71, 108] },
    { burst: "blast", tilt: 28, punchTrail: true, handle: 70 },
  ),
  // Chain Guard, as the blow lands: braced, catching it on the chain. As in Kneeling, the flail
  // hand holds the handle up in front of him and the wax hand grips the chain, but here it's
  // pulled taut, held diagonally out in front of him (the wax forearm foreshortened, pointing
  // almost at you); both elbows raised. The head swings below the wax fist.
  "wd-chain-guard": pose(
    { head: [56, 25], neck: [54, 36], hip: [49, 68], ...legs([63, 90], [71, 114], [40, 92], [29, 114]) },
    { elbow: [52, 24], hand: [64, 17], ball: [0, 0] },
    { elbow: [45, 57], hand: [53, 60] },
    { handle: 39, chainInHand: true, chainTaut: true, turn: 1 },
  ),
  // Wax Guard: the wax forearm raised upright before his mask.
  "wd-wax-guard": pose(
    { head: [48, 24], neck: [49, 35], hip: [49, 68], ...legs([59, 92], [64, 114], [40, 92], [35, 114]) },
    { elbow: [42, 50], hand: [38, 62], ball: [35, 85] },
    { elbow: [61, 50], hand: [61, 24] },
  ),
  // Stride (as he dodges and backs off): spun around on his right leg to turn his back on you,
  // leaning over that leg, the left one swinging out behind. Both arms trail after the spin: the
  // wax arm raised a little; the flail arm's upper arm leads the spin at shoulder height, its
  // forearm swung back behind him, the flail flung out almost level after it.
  "wd-stride": pose(
    { head: [23, 47], neck: [30, 57], hip: [45, 84], ...legs([33, 100], [44, 114], [61, 100], [77, 110]) },
    { elbow: [17, 56], hand: [33, 52], ball: [97, 57] },
    { elbow: [49, 64], hand: [61, 68] },
    { turn: -1, faceBack: true, backView: true, handle: 2, flailForearmBehind: true },
  ),
  // Usurp Flame, before he springs: Wax Arm Back, crouched even lower, the wax arm drawn back
  // below his shoulder, looking at the flame he's after.
  "wd-usurp": pose(
    { head: [38, 47], neck: [42, 57], hip: [48, 85], ...legs([65, 100], [78, 114], [18, 102], [36, 114]) },
    { elbow: [57, 71], hand: [56, 86], ball: [18, 122] },
    { elbow: [30, 67], hand: [21, 64] },
    { turn: -1, handle: 155, faceFront: 0.4, tilt: 12 },
  ),
  // A Rest broken by a blow: knocked off balance, almost stumbling: his rear pushed back, bent
  // forward over it, both arms flung open to his sides.
  "wd-flinch": pose(
    { head: [56, 34], neck: [51, 44], hip: [38, 74], ...legs([56, 94], [64, 114], [36, 96], [26, 114]) },
    { elbow: [64, 52], hand: [76, 58], ball: [86, 110] },
    { elbow: [36, 50], hand: [24, 58] },
    { tilt: 14 },
  ),
  // Usurp Flame, the dash: lunging low, the wax hand reaching out for the flame.
  "wd-usurp-dash": pose(
    { head: [62, 32], neck: [58, 42], hip: [47, 70], ...legs([63, 92], [72, 114], [36, 94], [26, 114]) },
    { elbow: [46, 54], hand: [40, 66], ball: [36, 89] },
    { elbow: [72, 52], hand: [86, 46] },
  ),
  // Clutch Arm, as the Rest goes through: hunched lower, the wax hand gripping the flail's head
  // (smothering his flame in it) while the flail hand yanks the handle up overhead, the chain
  // pulled taut between them. He goes straight on into Wax Shoulder In, rewaxed.
  "wd-clutch-arm": pose(
    { head: [61, 40], neck: [55, 50], hip: [47, 77], ...legs([59, 95], [63, 114], [40, 96], [35, 114]) },
    { elbow: [63, 36], hand: [75, 27], ball: [0, 0] },
    { elbow: [66, 72], hand: [79, 62] },
    { handle: 8, headInHand: true, rewaxTrail: true },
  ),
  // The T-pose, for the Model viewer: standing straight, both arms out (the rig lays them out), the
  // flail hanging from his hand by its handle. `wd-t-b` is seen from behind.
  "wd-t": pose(
    { head: [50, 22], neck: [50, 33], hip: [50, 65], ...legs([50, 89.5], [50, 114], [50, 89.5], [50, 114]) },
    { elbow: [36, 35], hand: [22, 35], ball: [22, 90] },
    { elbow: [64, 35], hand: [78, 35] },
    { handle: 90, faceFront: 0.5, armsOut: -1, legsDown: true },
  ),
  "wd-t-b": pose(
    { head: [50, 22], neck: [50, 33], hip: [50, 65], ...legs([50, 89.5], [50, 114], [50, 89.5], [50, 114]) },
    { elbow: [64, 35], hand: [78, 35], ball: [78, 90] },
    { elbow: [36, 35], hand: [22, 35] },
    { handle: 90, backView: true, faceBack: true, armsOut: 1, legsDown: true },
  ),
  // Staggered: fallen to a knee, propped on the flail's handle, head hanging.
  "wd-fallen": pose(
    { head: [66, 58], neck: [60, 66], hip: [44, 86], ...legs([58, 98], [62, 114], [40, 112], [24, 114]) },
    { elbow: [64, 84], hand: [70, 99], ball: [87, 112] },
    { elbow: [54, 82], hand: [58, 100] },
  ),
};



/** Which way across his body his ripped (waxed, left) side is, on the page. */
export function ripSide(s: WardenSkeleton): Pt {
  const [nx, ny] = s.neck;
  const [hx, hy] = s.hip;
  const len = Math.hypot(hx - nx, hy - ny) || 1;
  const n: Pt = [-(hy - ny) / len, (hx - nx) / len];
  const { knee, foot } = (s.turn ?? 0) >= 0.5 ? s.leadLeg : s.rearLeg; // his left leg
  const out = (knee[0] + foot[0]) / 2 >= hx ? 1 : -1;
  return n[0] * out >= 0 ? n : [-n[0], -n[1]];
}

/** Where the rip in his cloak begins: at his left armpit. */
export const ripArmpit = (s: WardenSkeleton): Pt => add(lerp(s.neck, s.hip, 0.18), ripSide(s), 3);

/** Where the cloak's hem drags: on the ground. */
export const HEM_Y = 113;

/**
 * Which way his chest faces on the page: forward (+1) as usual, or backward (-1) when he has
 * turned flail shoulder first, his chest swung around away from you.
 */
export const frontSide = (s: WardenSkeleton) => ((s.turn ?? 0) <= -0.5 ? -1 : 1);

/** Half the handle's length: held in the middle, the chain hangs from its far end. */
const HANDLE_HALF = 15;

/** The chain's length, the same in every pose. Each pose's `ball` only says which way it hangs. */
const CHAIN = 34;

/** Where the ground is: the flail's head rests on it rather than going through. */
export const GROUND = 108;

/** The flail as drawn: the handle's ends (the chain hangs from `tip`) and where its head ends up. */
export function flailOf(s: WardenSkeleton) {
  const hand = s.weaponArm.hand;
  const deg = s.handle ?? (Math.atan2(s.ball[1] - hand[1], s.ball[0] - hand[0]) * 180) / Math.PI;
  const dir: Pt = [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
  const tip = add(hand, dir, HANDLE_HALF), butt = add(hand, dir, -HANDLE_HALF);
  if (s.held) return { tip, butt, ball: s.ball, resting: false };
  const to: Pt = [s.ball[0] - tip[0], s.ball[1] - tip[1]];
  const len = Math.hypot(to[0], to[1]);
  let ball: Pt = len > 0.01 ? add(tip, to, CHAIN / len) : add(tip, [0, CHAIN]);
  const resting = ball[1] >= GROUND;
  if (resting) ball = [ball[0], GROUND];
  return { tip, butt, ball, resting };
}

/** The Fan Flames swat's path: from in front of him (`from`) curving through `mid` out to the hand. */
export function fanSweep(s: WardenSkeleton): { from: Pt; mid: Pt } {
  const [nx, ny] = s.neck;
  const [x, y] = s.freeArm.hand;
  const from: Pt = [nx + 22, ny + 4];
  return { from, mid: [(from[0] + x) / 2, Math.max(from[1], y) + 12] };
}

/** A point along the swat's sweep: t = 0 in front of him, 1 at the hand. */
export function sweepAt(s: WardenSkeleton) {
  const { from, mid } = fanSweep(s);
  const to = s.freeArm.hand;
  return (t: number): Pt => {
    const u = 1 - t;
    return [u * u * from[0] + 2 * u * t * mid[0] + t * t * to[0], u * u * from[1] + 2 * u * t * mid[1] + t * t * to[1]];
  };
}

/**
 * Where his arms and legs hang from, on the page: the flail (right) shoulder and the candle (left)
 * shoulder, which turning (`turn`, `shoulderTurn`) swings around, and his hips (no offset under the cloak).
 * Turning his candle side toward you swings that shoulder forward and the flail shoulder back; turned the
 * other way (flail shoulder toward you), the shoulders line up with the camera. Facing you, his flail arm
 * is the far one and the candle arm the near one; from behind, the shoulders sit either side of his back.
 */
export function wardenMounts(s: WardenSkeleton, front: boolean, straight = false): Mounts & { flailShoulder: Pt; candleShoulder: Pt } {
  const [nx, ny] = s.neck;
  // Straight on, the shoulders sit level either side of the neck: the flail (right) one toward -x
  // from the front (his right is the page's left), +x from behind (the pose says which: `armsOut`).
  if (straight) {
    const side = s.armsOut ?? (s.backView ? 1 : -1);
    const flailShoulder: Pt = [nx + 6 * side, ny + 2];
    const candleShoulder: Pt = [nx - 6 * side, ny + 2];
    return { weaponShoulder: flailShoulder, freeShoulder: candleShoulder, leadHip: s.hip, rearHip: s.hip, across: 1, flailShoulder, candleShoulder };
  }
  const turn = s.shoulderTurn ?? s.turn ?? 0;
  const away = Math.max(0, -turn);
  const toward = Math.max(0, turn);
  const nearShoulder: Pt = [nx - 3 + 9 * toward + away, ny + 4 - toward - 3 * away];
  const farShoulder: Pt = [nx + 3 - 9 * toward - away, ny + 2 + 3 * away];
  const back = (k: number): Pt => {
    const [hx, hy] = s.hip;
    const len = Math.hypot(hx - nx, hy - ny) || 1;
    let n: Pt = [-(hy - ny) / len, (hx - nx) / len];
    if (n[0] > 0) n = [-n[0], -n[1]]; // toward the way he faces
    return add([nx, ny + 3], n, k);
  };
  const flailShoulder = s.backView ? back(6) : front ? farShoulder : nearShoulder;
  const candleShoulder = s.backView ? back(-6) : s.shoulderAtRip ? ripArmpit(s) : front ? nearShoulder : farShoulder;
  return { weaponShoulder: flailShoulder, freeShoulder: candleShoulder, leadHip: s.hip, rearHip: s.hip, across: 0.72, flailShoulder, candleShoulder };
}

/**
 * How each pose departs from the rig's true bone lengths (rig.ts), as multiples of them: the poses
 * were tuned by eye before the rig, so these keep every look (his punch really does reach).
 */
const WARDEN_ADJUST: Partial<Record<WardenPoseName, BoneAdjust>> = {
  "wd-idle": { torso: 1.101, leadShin: 0.987, weaponUpper: 1.278, weaponFore: 0.931, freeUpper: 1.04, freeFore: 0.895 },
  "wd-shoulder": { torso: 1.036, leadThigh: 1.061, rearThigh: 1.049, rearShin: 0.97, weaponUpper: 1.286, weaponFore: 1.313, freeUpper: 0.61, freeFore: 2.023 },
  "wd-wound-up": { torso: 1.012, leadThigh: 1.023, leadShin: 0.904, rearThigh: 0.981, rearShin: 0.865, weaponUpper: 0.972, weaponFore: 0.647, freeUpper: 1.397, freeFore: 0.505 },
  "wd-arm-back": { torso: 0.92, leadShin: 0.906, rearThigh: 1.393, rearShin: 1.041, weaponUpper: 1.116, weaponFore: 1.074, freeUpper: 1.163, freeFore: 0.576 },
  "wd-arm-chest": { torso: 0.977, leadShin: 0.953, rearThigh: 0.961, rearShin: 0.953, weaponUpper: 0.863, weaponFore: 0.714, freeUpper: 1.374, freeFore: 1.418 },
  "wd-clutch-flail": { torso: 0.92, leadShin: 0.906, rearThigh: 1.393, rearShin: 1.041, weaponUpper: 1.116, weaponFore: 1.074, freeUpper: 1.264, freeFore: 0.836 },
  "wd-spin-behind": { torso: 0.963, leadThigh: 0.974, leadShin: 0.826, rearThigh: 0.97, rearShin: 0.75, weaponUpper: 1.429, weaponFore: 0.972, freeUpper: 1.427, freeFore: 0.505 },
  "wd-spin-over": { torso: 1.063, weaponFore: 0.884, freeUpper: 0.773, freeFore: 0.769 },
  "wd-kneel": { torso: 0.872, leadThigh: 0.753, leadShin: 1.064, rearThigh: 1.169, rearShin: 0.658, weaponUpper: 1.015, weaponFore: 0.731, freeUpper: 1.062, freeFore: 1.163 },
  "wd-swing": { torso: 1.012, leadThigh: 1.023, leadShin: 0.904, rearThigh: 0.981, rearShin: 0.865, weaponUpper: 0.972, weaponFore: 0.647, freeUpper: 1.397, freeFore: 0.505 },
  "wd-rising": { torso: 1.07, leadShin: 0.931, rearThigh: 1.167, rearShin: 0.891, freeUpper: 1.03, freeFore: 0.769 },
  "wd-slam": { torso: 0.872, leadThigh: 0.753, leadShin: 1.064, rearThigh: 1.169, rearShin: 0.658, weaponUpper: 1.403, weaponFore: 1.739, freeUpper: 1.189, freeFore: 0.909 },
  "wd-punch": { torso: 0.882, leadThigh: 0.705, leadShin: 0.987, rearThigh: 0.891, rearShin: 0.736, weaponUpper: 1.951, weaponFore: 0.958, freeUpper: 1.716, freeFore: 1.821 },
  "wd-fan": { torso: 1.024, leadThigh: 1.071, leadShin: 0.932, rearThigh: 1.043, rearShin: 0.883, weaponUpper: 1.216, freeUpper: 1.578, freeFore: 0.953 },
  "wd-wax-swat": { torso: 1.024, leadThigh: 1.071, leadShin: 0.932, rearThigh: 1.043, rearShin: 0.883, weaponUpper: 1.216, freeUpper: 1.578, freeFore: 0.953 },
  "wd-blast": { torso: 0.882, leadThigh: 0.705, leadShin: 0.987, rearThigh: 0.891, rearShin: 0.736, weaponUpper: 1.951, weaponFore: 0.958, freeUpper: 1.716, freeFore: 1.821 },
  "wd-chain-guard": { torso: 1.012, leadThigh: 1.064, leadShin: 1.033, rearThigh: 1.046, weaponUpper: 1.04, freeUpper: 1.674, freeFore: 0.61 },
  "wd-wax-guard": { torso: 1.031, leadThigh: 1.061, leadShin: 0.921, rearThigh: 1.046, rearShin: 0.921, weaponUpper: 1.172, weaponFore: 0.904, freeUpper: 1.329, freeFore: 1.857 },
  "wd-stride": { torso: 0.965, leadThigh: 0.816, leadShin: 0.727, rearThigh: 0.924, rearShin: 0.77, weaponUpper: 0.742, weaponFore: 1.178, freeUpper: 1.1, freeFore: 0.904 },
  "wd-usurp": { torso: 0.895, leadThigh: 0.925, leadShin: 0.78, rearThigh: 1.407, rearShin: 0.883, weaponUpper: 1.129, weaponFore: 1.074, freeUpper: 0.961, freeFore: 0.678 },
  "wd-flinch": { torso: 1.022, leadThigh: 1.098, leadShin: 0.879, rearThigh: 0.902, rearShin: 0.84, weaponUpper: 0.833, weaponFore: 0.958, freeUpper: 0.869, freeFore: 1.03 },
  "wd-usurp-dash": { torso: 0.94, leadThigh: 1.11, leadShin: 0.97, rearThigh: 1.078, rearShin: 0.913, weaponUpper: 1.288, weaponFore: 0.958, freeUpper: 1.288, freeFore: 1.088 },
  "wd-clutch-arm": { torso: 0.88, leadThigh: 0.883, leadShin: 0.793, rearThigh: 0.826, rearShin: 0.763, weaponUpper: 1.197, weaponFore: 1.071, freeUpper: 1.629, freeFore: 1.172 },
  "wd-fallen": { torso: 0.8, leadThigh: 0.753, leadShin: 0.673, rearThigh: 1.074, rearShin: 0.658, weaponUpper: 1.145, weaponFore: 1.154, freeUpper: 0.884, freeFore: 1.317 },
};

/** In a T-pose the flail hangs straight down from his hand. */
const hangingFrom = (s: WardenSkeleton): Pt => add(s.weaponArm.hand, [0, 80]);

/** A pose seen straight on, not at a 3/4 angle: the arms and legs fitted again from level shoulders. */
export function straightOn(s: WardenSkeleton, front: boolean): WardenSkeleton {
  const { skeleton } = fitLimbs(s, wardenMounts(s, front, true));
  const fitted = { ...s, ...skeleton };
  return s.armsOut ? { ...fitted, ball: hangingFrom(fitted) } : fitted;
}

/** Every pose, fitted to the rig once when the game loads. */
export const WARDEN_POSES = Object.fromEntries(
  Object.entries(RAW_WARDEN_POSES).map(([name, raw]) => [
    name,
    rigged<WardenSkeleton>(
      { ...raw, adjust: WARDEN_ADJUST[name as WardenPoseName] },
      fitted => wardenMounts(fitted as WardenSkeleton, true),
      (fitted, by) => ({ ...fitted, ball: fitted.armsOut ? hangingFrom(fitted) : add(fitted.ball, by) }),
    ),
  ]),
) as Record<WardenPoseName, WardenSkeleton>;
