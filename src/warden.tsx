/**
 * warden.tsx — how the Penitent Warden is drawn. Drawing only; his rules live in bestiary.ts.
 *
 * A tall figure in a gray cloak, its hem dirtied with wax, the hood hiding his face but for a
 * waxed, beak-like mask. Right hand: the flail (once an incense burner, now full of wax) on a
 * chain. Left arm: encased in wax, a candle. Its look follows his flame:
 *  - lit: Unsealed, the wax arm burns at the hand like a candle.
 *  - out: Sealed, a cold wax arm, smoke rising from the hand.
 *  - scorched: phase two, the wax torn off: a black, burnt arm, the hand engulfed in flames.
 *
 * Poses are drawn facing right like every figure (the scene mirrors enemies). Seen from the
 * front at a 3/4 angle while facing left, his right arm is the far one and the candle arm the
 * near one, so the flail sits behind his body and the candle arm in front of it.
 */
import { createContext, useContext, useEffect, useId, useState, type ReactNode } from "react";
import type { Skeleton } from "./render";

/** The flail is on fire (phase two, after Clutch Arm): its head burns, its trails are flame. */
const FlailFire = createContext(false);

type Pt = readonly [number, number];
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
  extra: Partial<Omit<WardenSkeleton, keyof Skeleton | "ball">> = {},
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
  | "wd-wound-up" | "wd-wax-swat" | "wd-usurp-dash" | "wd-flinch";

export const WARDEN_POSES: Record<WardenPoseName, WardenSkeleton> = {
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
  // Staggered: fallen to a knee, propped on the flail's handle, head hanging.
  "wd-fallen": pose(
    { head: [66, 58], neck: [60, 66], hip: [44, 86], ...legs([58, 98], [62, 114], [40, 112], [24, 114]) },
    { elbow: [64, 84], hand: [70, 99], ball: [87, 112] },
    { elbow: [54, 82], hand: [58, 100] },
  ),
};

/* ============================================================
 * Drawing
 * ============================================================ */

const limb = (...pts: Pt[]) => pts.map(p => p.join(",")).join(" ");
const add = (a: Pt, b: Pt, k = 1): Pt => [a[0] + b[0] * k, a[1] + b[1] * k];
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** A teardrop flame standing on (x, y), `s` times the base size. */
function Flame({ at, s = 1, className = "" }: { at: Pt; s?: number; className?: string }) {
  const [x, y] = at;
  const h = 11 * s, w = 4.2 * s;
  return (
    <g className={`fig-flame ${className}`}>
      <path d={`M${x} ${y - h} C${x + w * 1.1} ${y - h * 0.45} ${x + w} ${y} ${x} ${y} C${x - w} ${y} ${x - w * 1.1} ${y - h * 0.45} ${x} ${y - h} Z`} />
      <path
        d={`M${x} ${y - h * 0.5} C${x + w * 0.45} ${y - h * 0.2} ${x + w * 0.45} ${y} ${x} ${y} C${x - w * 0.45} ${y} ${x - w * 0.45} ${y - h * 0.2} ${x} ${y - h * 0.5} Z`}
        className="fig-flame-core"
      />
    </g>
  );
}

/** Which way across his body his ripped (waxed, left) side is, on the page. */
function ripSide(s: WardenSkeleton): Pt {
  const [nx, ny] = s.neck;
  const [hx, hy] = s.hip;
  const len = Math.hypot(hx - nx, hy - ny) || 1;
  const n: Pt = [-(hy - ny) / len, (hx - nx) / len];
  const { knee, foot } = (s.turn ?? 0) >= 0.5 ? s.leadLeg : s.rearLeg; // his left leg
  const out = (knee[0] + foot[0]) / 2 >= hx ? 1 : -1;
  return n[0] * out >= 0 ? n : [-n[0], -n[1]];
}

/** Where the rip in his cloak begins: at his left armpit. */
const ripArmpit = (s: WardenSkeleton): Pt => add(lerp(s.neck, s.hip, 0.18), ripSide(s), 3);

/** Where the cloak's hem drags: on the ground. */
const HEM_Y = 113;

/**
 * The cloak: from the shoulders all the way to the ground, its hem dirtied with wax. It is torn
 * along his waxed side: sealed shut with wax from the armpit to the hip, then failing, gaping
 * open down to the ground. Only that leg (his left, the near one) shows through.
 */
function Cloak({ s }: { s: WardenSkeleton }) {
  const clipId = `rip${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [nx, ny] = s.neck;
  const [hx, hy] = s.hip;
  const len = Math.hypot(hx - nx, hy - ny) || 1;
  const n: Pt = [-(hy - ny) / len, (hx - nx) / len]; // across the body
  const shA = add([nx, ny + 2], n, 7), shB = add([nx, ny + 2], n, -7);
  const waA = add([hx, hy], n, 10), waB = add([hx, hy], n, -10);
  // Turned the other way (flail shoulder toward you), the ripped side faces away: no rip to see,
  // but his left leg can stick out past the cloak's edge, behind it.
  const away = (s.turn ?? 0) <= -0.5;
  const xs = away
    ? [s.leadLeg.knee[0], s.leadLeg.foot[0], hx]
    : [s.leadLeg.knee[0], s.leadLeg.foot[0], s.rearLeg.knee[0], s.rearLeg.foot[0], hx];
  const hemF: Pt = [Math.max(...xs) + 6, HEM_Y], hemB: Pt = [Math.min(...xs) - 6, HEM_Y];
  // Keep the sides from crossing: the side of the body facing forward meets the front of the hem.
  const [waF, waBk, shF, shBk] = waA[0] >= waB[0] ? [waA, waB, shA, shB] : [waB, waA, shB, shA];
  // Over a raised knee the front runs flat along the top of the thigh, rounds the knee, then
  // drops to the ground; otherwise it falls straight from the waist.
  const kn = s.leadLeg.knee;
  const front = s.kneeUnderCloak
    ? [
        `L${hemF[0]} ${hemF[1]}`,
        `L${kn[0] + 5} ${kn[1] + 3}`,
        `Q${kn[0] + 5.5} ${kn[1] - 5} ${kn[0] - 1} ${kn[1] - 5}`,
        `L${waF[0]} ${Math.min(waF[1], kn[1] - 5)}`,
        `Q${waF[0] + 1} ${(waF[1] + shF[1]) / 2} ${shF[0]} ${shF[1]}`,
      ]
    : [`L${hemF[0]} ${hemF[1]}`, `Q${waF[0] + 3} ${waF[1]} ${shF[0]} ${shF[1]}`];
  const d = [
    `M${shBk[0]} ${shBk[1]}`,
    `Q${waBk[0] - 3} ${waBk[1]} ${hemB[0]} ${hemB[1]}`,
    ...front,
    "Z",
  ].join(" ");

  // His near leg is his left: from the front at 3/4 it's the one further back; turned sideways
  // (candle side toward you), the one stepping forward.
  const nearLeg = (s.turn ?? 0) >= 0.5 ? s.leadLeg : s.rearLeg;
  const { knee, foot } = nearLeg;
  // The rip runs down his waxed side. From the armpit to the hip it's sealed shut with wax; from
  // the hip down the wax is failing, and it gapes wider toward the ground.
  const side = ripSide(s);
  // Shoulders twisted further than the hips: the top of the seam twists round with the wax
  // shoulder, toward the edge of his body.
  const twist = s.shoulderTurn !== undefined ? (s.turn ?? 0) - s.shoulderTurn : 0;
  const armpit = add(ripArmpit(s), ripSide(s), twist * 5);
  // The leg hangs from the side of his hips, not from the middle of the stick.
  const hipJoint = add(s.hip, side, 5);
  const thigh: Pt = [knee[0] - hipJoint[0], knee[1] - hipJoint[1]];
  const tl = Math.hypot(thigh[0], thigh[1]) || 1;
  const across: Pt = [-thigh[1] / tl, thigh[0] / tl];
  const top = lerp(hipJoint, knee, 0.1);
  const seam = `M${armpit[0]} ${armpit[1]} Q${add(lerp(armpit, top, 0.5), side, 1.5).join(" ")} ${top[0]} ${top[1]}`;
  const stitches = [0.2, 0.45, 0.7, 0.92].map(t => lerp(armpit, top, t));
  const kneeA = add(knee, across, 4.5), kneeB = add(knee, across, -4.5);
  const footA: Pt = [Math.min(foot[0], knee[0]) - 6, HEM_Y], footB: Pt = [Math.max(foot[0], knee[0]) + 6, HEM_Y];
  const [kL, kR] = kneeA[0] <= kneeB[0] ? [kneeA, kneeB] : [kneeB, kneeA];
  const rimL = `M${top[0]} ${top[1]} Q${kL[0]} ${kL[1]} ${footA[0]} ${footA[1]}`;
  const rimR = `M${top[0]} ${top[1]} Q${kR[0]} ${kR[1]} ${footB[0]} ${footB[1]}`;
  const gap = `${rimL} L${footB[0]} ${footB[1]} Q${kR[0]} ${kR[1]} ${top[0]} ${top[1]} Z`;
  // The last strands of wax still bridging the rip: close together near the hip, giving out below.
  const strands = [0.12, 0.26, 0.45].map(t => {
    const l = lerp(lerp(top, kL, t), lerp(kL, footA, t), t);
    const r = lerp(lerp(top, kR, t), lerp(kR, footB, t), t);
    return { l, r };
  });
  if (away) {
    // The rip runs along the cloak's back edge now: wax lines it from the hip down to the ground.
    // With his back fully to you it's the other edge.
    const [eS, eW, eH, eOut] = s.backView ? [shF, waF, hemF, 3] : [shBk, waBk, hemB, -3];
    const q = (t: number): Pt => [
      (1 - t) ** 2 * eS[0] + 2 * t * (1 - t) * (eW[0] + eOut) + t ** 2 * eH[0],
      (1 - t) ** 2 * eS[1] + 2 * t * (1 - t) * eW[1] + t ** 2 * eH[1],
    ];
    const edge: Pt[] = [];
    for (let i = 0; i <= 20; i++) { const p = q(i / 20); if (p[1] >= hy - 2) edge.push(p); }
    return (
      <g>
        <polyline points={limb(hipJoint, knee, foot)} className="fig-limb fig-far" />
        <path d={d} className="fig-cloak" />
        <polyline points={limb(...edge)} className="fig-rip-wax" />
        <line x1={hemB[0]} y1={HEM_Y} x2={hemF[0]} y2={HEM_Y} className="fig-cloak-wax" />
      </g>
    );
  }
  return (
    <g>
      <path d={d} className="fig-cloak" />
      <path d={gap} className="fig-cloak-inside" />
      {/* The leg shows only through the rip: over the cloak's lining, under the cloak itself. */}
      <clipPath id={clipId}><path d={gap} /></clipPath>
      <polyline points={limb(hipJoint, knee, foot)} className="fig-limb" clipPath={`url(#${clipId})`} />
      <path d={rimL} className="fig-rip-wax" />
      <path d={rimR} className="fig-rip-wax" />
      <path d={seam} className="fig-seam" />
      <path d={seam} className="fig-seam-wax" />
      {stitches.map((p, i) => (
        <line key={`st${i}`} x1={p[0] - 2.2} y1={p[1] - 0.8} x2={p[0] + 2.2} y2={p[1] + 0.8} className="fig-rip-strand" />
      ))}
      {strands.map(({ l, r }, i) => (
        <path key={i} d={`M${l[0]} ${l[1]} Q${(l[0] + r[0]) / 2} ${(l[1] + r[1]) / 2 + 3} ${r[0]} ${r[1]}`} className="fig-rip-strand" />
      ))}
      {/* The wax-crusted hem, broken where the rip opens. */}
      <line x1={hemB[0]} y1={HEM_Y} x2={Math.max(hemB[0], footA[0])} y2={HEM_Y} className="fig-cloak-wax" />
      <line x1={Math.min(hemF[0], footB[0])} y1={HEM_Y} x2={hemF[0]} y2={HEM_Y} className="fig-cloak-wax" />
    </g>
  );
}

/**
 * Which way his chest faces on the page: forward (+1) as usual, or backward (-1) when he has
 * turned flail shoulder first, his chest swung around away from you.
 */
const frontSide = (s: WardenSkeleton) => ((s.turn ?? 0) <= -0.5 ? -1 : 1);

/**
 * The stain where wax from his beak has run down the front of his cloak for years: dull, wide and
 * streaked, under the fresh drool. Only seen while the cloak's front faces you.
 */
function Stain({ s }: { s: WardenSkeleton }) {
  if ((s.turn ?? 0) >= 0.5 || s.backView) return null;
  const [nx, ny] = s.neck;
  const [hx, hy] = s.hip;
  const len = Math.hypot(hx - nx, hy - ny) || 1;
  let n: Pt = [-(hy - ny) / len, (hx - nx) / len];
  if (n[0] * frontSide(s) < 0) n = [-n[0], -n[1]]; // toward the front
  const along = (t: number, out: number) => add(lerp(s.neck, s.hip, t), n, out);
  const d = [
    `M${along(0.1, 2)[0]} ${along(0.1, 2)[1]}`,
    `Q${along(0.35, 1)[0]} ${along(0.35, 1)[1]} ${along(0.6, 2.5)[0]} ${along(0.6, 2.5)[1]}`,
    `Q${along(0.66, 4)[0]} ${along(0.66, 4)[1]} ${along(0.72, 5)[0]} ${along(0.72, 5)[1]}`,
    `Q${along(0.62, 6.5)[0]} ${along(0.62, 6.5)[1]} ${along(0.56, 7.5)[0]} ${along(0.56, 7.5)[1]}`,
    `Q${along(0.3, 8.5)[0]} ${along(0.3, 8.5)[1]} ${along(0.1, 8)[0]} ${along(0.1, 8)[1]}`,
    "Z",
  ].join(" ");
  const run = (t0: number, t1: number, out: number) =>
    `M${along(t0, out)[0]} ${along(t0, out)[1]} L${along(t1, out)[0]} ${along(t1, out)[1]}`;
  return (
    <g>
      <path d={d} className="fig-stain" />
      <path d={`${run(0.5, 0.86, 3.5)} ${run(0.55, 0.8, 6.5)}`} className="fig-stain-run" />
    </g>
  );
}

/** Wax that has run from under his beak down the front of his cloak, like a long beard. */
function Beard({ s }: { s: WardenSkeleton }) {
  if (s.backView) return null;
  const [x, y] = s.head;
  // Looking back over his shoulder, everything about the face is mirrored.
  const f = s.faceBack ? -1 : 1;
  const t = (f * (s.tilt ?? 0) * Math.PI) / 180;
  const rot = (p: Pt): Pt => {
    const dx = p[0] - x, dy = p[1] - y;
    return [x + dx * Math.cos(t) - dy * Math.sin(t), y + dx * Math.sin(t) + dy * Math.cos(t)];
  };
  // It runs out of the hood's opening, from under the beak.
  const from = rot([x + f * (5.5 - 2.6 * (s.faceFront ?? 0)), y + 5]);
  const w = 3.2;
  // Turned sideways either way (his front out of sight, or swung around), or looking back, only
  // the bit hanging from the hood shows.
  if (Math.abs(s.turn ?? 0) >= 0.5 || s.faceBack) {
    const tipY = from[1] + 9;
    return (
      <g className="fig-beard">
        <path d={`M${from[0] - w} ${from[1]} Q${from[0] - 1.5} ${tipY - 3} ${from[0]} ${tipY} Q${from[0] + 1.5} ${tipY - 3} ${from[0] + w} ${from[1]} Z`} />
        <circle cx={from[0]} cy={tipY + 1.5} r={1.5} />
      </g>
    );
  }
  // Facing you: down along the front of the cloak, ending in a few drips.
  const [nx, ny] = s.neck;
  const [hx, hy] = s.hip;
  const len = Math.hypot(hx - nx, hy - ny) || 1;
  let n: Pt = [-(hy - ny) / len, (hx - nx) / len];
  if (n[0] * frontSide(s) < 0) n = [-n[0], -n[1]]; // toward the front
  const chest = add(lerp(s.neck, s.hip, 0.3), n, 4);
  const end = add(lerp(s.neck, s.hip, 0.62), n, 3);
  const d = [
    `M${from[0] - w} ${from[1]}`,
    `Q${chest[0] - w} ${chest[1]} ${end[0] - 1} ${end[1]}`,
    `Q${end[0]} ${end[1] + 3} ${end[0] + 1} ${end[1]}`,
    `Q${chest[0] + w} ${chest[1]} ${from[0] + w} ${from[1]}`,
    "Z",
  ].join(" ");
  const drip2 = add(lerp(s.neck, s.hip, 0.45), n, 6.5);
  return (
    <g className="fig-beard">
      <path d={d} />
      <path d={`M${from[0] + 2} ${from[1] + 2} Q${chest[0] + 4} ${chest[1]} ${drip2[0]} ${drip2[1]}`} className="fig-beard-strand" />
      <circle cx={end[0]} cy={end[1] + 1} r={1.8} />
      <circle cx={drip2[0]} cy={drip2[1] + 0.5} r={1.2} />
    </g>
  );
}

/** The hood, shadowed, with only the waxed beak of his mask poking out. */
function Hood({ s }: { s: WardenSkeleton }) {
  const [x, y] = s.head;
  const k = s.faceFront ?? 0;
  const bx = x + 3 - 2.6 * k; // where the beak leaves the mask
  // The round of the hood and its point behind, one flat color with no outline. A raised chin
  // tilts only the mask inside, so the hood keeps its point.
  return (
    <g transform={s.faceBack ? `translate(${2 * x} 0) scale(-1 1)` : undefined}>
      <path d={`M${x - 3} ${y - 8} L${x - 12} ${y - 12} L${x - 9} ${y + 1} Z`} className="fig-hood" />
      {/* From behind, just the tip of the beak peeks out past the side of the hood. */}
      {s.backView && (
        <g transform={`${s.tilt ? `rotate(${s.tilt} ${x} ${y}) ` : ""}translate(-4 0)`}>
          <path d={`M${bx} ${y - 1.5} Q${bx + 9} ${y + 1} ${bx + 13} ${y + 9} Q${bx + 6} ${y + 6.5} ${bx} ${y + 5} Z`} className="fig-beak" />
        </g>
      )}
      <circle cx={x} cy={y} r={9.5} className="fig-hood" />
      {!s.backView && <g transform={s.tilt ? `rotate(${s.tilt} ${x} ${y})` : undefined}>
        <ellipse cx={x + 3.5 - 2.6 * k} cy={y + 1.5} rx={4.6 + k} ry={6} className="fig-hood-dark" />
        {/* The beak: wax, curving forward and down (shorter as it turns toward the camera). */}
        <path d={`M${bx} ${y - 1.5} Q${bx + 9 - 5 * k} ${y + 1 + k} ${bx + 13 - 8 * k} ${y + 9 + 3 * k} Q${bx + 6 - 3 * k} ${y + 6.5 + k} ${bx} ${y + 5} Z`} className="fig-beak" />
      </g>}
    </g>
  );
}

/** Half the handle's length: held in the middle, the chain hangs from its far end. */
const HANDLE_HALF = 15;
/** The chain's length, the same in every pose. Each pose's `ball` only says which way it hangs. */
const CHAIN = 34;
/** Where the ground is: the flail's head rests on it rather than going through. */
const GROUND = 108;

/** The flail's head: a lump of old wax, built up over years of drips, a few hanging off it. */
function FlailHead({ at }: { at: Pt }) {
  const [x, y] = at;
  const fire = useContext(FlailFire);
  return (
    <g className="fig-flail-head">
      {fire && <circle cx={x} cy={y - 6} r={11} className="fig-glow" />}
      {/* Drips hanging from its underside. */}
      <path d={`M${x - 3.2} ${y + 4} q0.4 3.6 -0.3 5 q-0.9 0.9 -1.1 -0.4 q-0.2 -2.4 0.2 -4.4 Z`} className="fig-head-wax" />
      <path d={`M${x + 2.4} ${y + 4.6} q0.3 2.4 -0.2 3.4 q-0.8 0.7 -0.9 -0.3 q-0.1 -1.6 0.1 -3 Z`} className="fig-head-wax" />
      {/* The lumpy round of it. */}
      <path d={`M${x - 6.2} ${y + 0.4} C${x - 6.4} ${y - 4.4} ${x - 2.6} ${y - 6.6} ${x + 0.6} ${y - 6.2} C${x + 4.6} ${y - 5.8} ${x + 6.6} ${y - 2.6} ${x + 6.1} ${y + 1} C${x + 5.8} ${y + 4.6} ${x + 2.6} ${y + 6.4} ${x - 0.6} ${y + 6.1} C${x - 4} ${y + 5.8} ${x - 6} ${y + 3.8} ${x - 6.2} ${y + 0.4} Z`} className="fig-head-wax" />
      {/* Older, darker layers, and a shine. */}
      <path d={`M${x - 4.6} ${y + 2.4} q2.2 2.4 5.6 1.9 q2.2 -0.4 3.6 -2.2`} className="fig-head-layer" />
      <ellipse cx={x - 2} cy={y - 3} rx={1.8} ry={1.1} transform={`rotate(-30 ${x - 2} ${y - 3})`} className="fig-head-shine" />
      {/* Set alight: flames wrapping it. */}
      {fire && (
        <>
          <Flame at={[x - 3, y + 2]} s={0.9} className="fig-flame-b" />
          <Flame at={[x + 3, y + 2]} s={1} className="fig-flame-c" />
          <Flame at={[x, y + 3]} s={1.4} />
        </>
      )}
    </g>
  );
}

/** The flail's handle: iron, with splashes of wax caked along it. */
function FlailHandle({ from, to }: { from: Pt; to: Pt }) {
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
  const n: Pt = [-(to[1] - from[1]) / len, (to[0] - from[0]) / len];
  const blobs = [
    { t: 0.18, w: 2.2, l: 2.6, side: 0.6 },
    { t: 0.46, w: 1.8, l: 3.4, side: -0.5 },
    { t: 0.7, w: 2.4, l: 2.2, side: 0.4 },
    { t: 0.9, w: 1.6, l: 1.8, side: -0.3 },
  ];
  const ang = (Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI;
  return (
    <g>
      <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} className="fig-flail-handle" />
      {blobs.map(({ t, w, l, side }, i) => {
        const c = add(lerp(from, to, t), n, side);
        return (
          <g key={i}>
            <ellipse cx={c[0]} cy={c[1]} rx={l} ry={w} transform={`rotate(${ang} ${c[0]} ${c[1]})`} className="fig-handle-wax" />
            {/* A drip run down from it. */}
            {i % 2 === 0 && <line x1={c[0]} y1={c[1]} x2={c[0]} y2={c[1] + 2.6} className="fig-handle-drip" />}
          </g>
        );
      })}
    </g>
  );
}

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

/**
 * A flail spinning too fast to see: no clear head, just a faint ring where it travels and a few
 * copies of the chain, each with a smudge of a head, flashing at random spots around the ring.
 */
function ChainBlur({ tip, r, flat }: { tip: Pt; r: number; flat?: boolean }) {
  // Behind him it spins upright (squeezed sideways, seen at an angle); overhead it spins level
  // (squashed flat, seen from a little above).
  const [sx, sy] = flat ? [1, 0.3] : [0.75, 1];
  // 3 to 5 at a time, spread out: each in its own slice of the circle, nudged a little within it,
  // so no two are ever close.
  const pick = () => {
    const n = 3 + Math.floor(Math.random() * 3);
    const slice = (Math.PI * 2) / n, start = Math.random() * Math.PI * 2;
    return Array.from({ length: n }, (_, i) => start + slice * (i + (Math.random() - 0.5) * 0.4));
  };
  const [angles, setAngles] = useState<number[]>(() => [0, 1, 2, 3].map(i => (i / 4) * Math.PI * 2));
  useEffect(() => {
    const id = window.setInterval(() => setAngles(pick()), 110);
    return () => window.clearInterval(id);
  }, []);
  return (
    <g>
      {/* The chain's sweep, a faint disc, and the path the head travels, a faint ring. */}
      {/* The disc stops where the ring's band starts, so the band looks the same all the way across. */}
      <ellipse cx={tip[0]} cy={tip[1]} rx={r * sx - 4} ry={r * sy - 4} className="fig-spin-disc" />
      <ellipse cx={tip[0]} cy={tip[1]} rx={r * sx} ry={r * sy} className="fig-spin-path" />
      {angles.map((a, i) => {
        const end: Pt = [tip[0] + Math.cos(a) * r * sx, tip[1] + Math.sin(a) * r * sy];
        // The head smears along its path: stretched along the circle's tangent.
        const along = (Math.atan2(Math.cos(a) * r * sy, -Math.sin(a) * r * sx) * 180) / Math.PI;
        return (
          // Each chain and its head flicker together.
          <g key={i} className="fig-chain-blur" style={{ animationDelay: `${(i * 0.09) % 0.4}s` }}>
            <line x1={tip[0]} y1={tip[1]} x2={end[0]} y2={end[1]} className="fig-chain" />
            <ellipse cx={end[0]} cy={end[1]} rx={4.4} ry={2.6} transform={`rotate(${along} ${end[0]} ${end[1]})`} className="fig-censer-smudge" />
          </g>
        );
      })}
    </g>
  );
}

/** The flail: the handle held at its middle, the chain from its tip, the wax-filled censer at the end. */
function Flail({ s }: { s: WardenSkeleton }) {
  const { tip, butt, ball, resting } = flailOf(s);
  const [bx, by] = ball;
  // The chain sags between the handle and the head; resting on the ground, it lies slack.
  const mid = lerp(tip, ball, 0.5);
  const sag: Pt = s.spin ? mid : resting ? [mid[0] + 3, by + 2] : add(mid, [0, 3]);
  // Just done spinning: the trails show where the head went (see SpinTrail); no head hangs yet.
  if (s.spinTrail || s.chainInHand || s.headInHand) return <FlailHandle from={butt} to={tip} />;
  if (s.spin) {
    return (
      <g>
        <ChainBlur tip={tip} r={Math.hypot(bx - tip[0], by - tip[1])} flat={s.spin === "over"} />
        <FlailHandle from={butt} to={tip} />
      </g>
    );
  }
  return (
    <g>
      <FlailHandle from={butt} to={tip} />
      <path d={`M${tip[0]} ${tip[1]} Q${sag[0]} ${sag[1]} ${bx} ${by}`} className="fig-chain" />
      <FlailHead at={[bx, by]} />
    </g>
  );
}

/**
 * The trails of the spins just finished: three of them, one after the other, each a tapered
 * crescent (thickest at its end, fading) with a flash of chain and head out to where it ends.
 * The first swings wide around his shoulder and always ends up and away from him; the second
 * circles the end of the handle; the third circles where the flail keeps spinning in his next
 * pose. Drawn first, so the warden covers them.
 */
function SpinTrail({ s, shoulder, layer = "back" }: { s: WardenSkeleton; shoulder: Pt; layer?: "back" | "front" }) {
  // Whether the first spin was Flail Swing's blow, fixed when the trails appear (he may already
  // have moved on to his next pose while they fade).
  const [swing] = useState(() => !!(s.swingTrail || s.risingTrail));
  // Rising Flail: the spins after the blow whirl level over his head, not upright behind him.
  const [flat] = useState(() => !!s.risingTrail);
  const [first] = useState(() => s);
  // Where it spins is fixed when the trails appear, so they stay put if he moves on to his next
  // pose while they're still fading.
  const [{ tip, last, r, arm }] = useState(() => {
    const f = flailOf(s);
    // The last spin is already where he'll keep spinning it in his next pose.
    const next = s.trailEndsAt ? flailOf(WARDEN_POSES[s.trailEndsAt]).tip : f.tip;
    return { tip: f.tip, last: next, r: Math.hypot(f.ball[0] - f.tip[0], f.ball[1] - f.tip[1]), arm: shoulder };
  });
  // Seen at an angle, the upright circle behind him is squeezed sideways.
  const SQUEEZE = 0.75;
  const [sx, sy] = flat ? [1, 0.3] : [SQUEEZE, 1];
  const at = (c: Pt, radius: number, a: number): Pt => [c[0] + Math.cos(a) * radius * sx, c[1] + Math.sin(a) * radius * sy];
  // The first spin always ends with the head up and away from him; each after it ends about half
  // a turn on from the last. Each covers three quarters of the circle.
  const FIRST = Math.atan2(-0.8, -0.6); // up and back
  const [spins] = useState(() => {
    let end = FIRST;
    return [0, 1, 2].map(i => {
      if (i) end += Math.PI + (Math.random() - 0.5) * 0.6;
      return { end, sweep: (270 * Math.PI) / 180 };
    });
  });
  const trail = (c: Pt, radius: number, end: number, sweep: number) => {
    const outer: string[] = [], inner: string[] = [];
    for (let i = 0; i <= 24; i++) {
      const k = i / 24;
      const a = end + sweep * (1 - k); // it comes round this way
      const thick = (0.22 * r * k) / radius; // thin where it starts, thick at its end
      const o = at(c, radius, a), n = at(c, radius * (1 - thick), a);
      outer.push(`${i ? "L" : "M"}${o[0]} ${o[1]}`);
      inner.unshift(`L${n[0]} ${n[1]}`);
    }
    return `${outer.join(" ")} ${inner.join(" ")} Z`;
  };
  return (
    <g>
      {spins.map(({ end, sweep }, i) => {
        // Flail Swing: the first spin is the blow itself, a flat sweep across his front (drawn
        // over him); the rest spin on behind him as usual.
        const swingArc = swing && i === 0;
        // Flail Swing's blow is drawn over him; Rising Flail's goes behind his cloak.
        const overHim = swingArc && !first.risingTrail;
        if ((layer === "front") !== overHim) return null;
        if (swingArc) return first.risingTrail ? <RisingArc key={i} s={first} r={r} tip={tip} /> : <SwingArc key={i} s={first} tip={tip} />;
        const c = i === spins.length - 1 ? last : tip;
        const head = at(c, r, end);
        // The first spin's trail swings around his shoulder, the whole arm in it: a wider circle
        // through the same end point, as if winding up from further out.
        let ring = { c, radius: r, end };
        if (i === 0) {
          const dx = (head[0] - arm[0]) / sx, dy = (head[1] - arm[1]) / sy;
          ring = { c: arm, radius: Math.hypot(dx, dy), end: Math.atan2(dy, dx) };
        }
        // One every 0.15 s: each trail lasts 0.3 s, its chain and head only 0.15 s. The third
        // appears just as he switches to his next pose (REST_POSE_MS in App.tsx, 0.3 s).
        const delay = { animationDelay: `${i * 0.15}s`, animationDuration: "0.3s" };
        const chainDelay = { animationDelay: `${i * 0.15}s`, animationDuration: "0.15s" };
        const [hx, hy] = head;
        return (
          <g key={i}>
            {/* With the 2nd spin, the whole circle flashes as a ring, gone by the pose change. */}
            {i === 1 && (
              <ellipse cx={c[0]} cy={c[1]} rx={r * sx} ry={r * sy} className="fig-ring-flash" style={{ animationDelay: "0.15s", animationDuration: "0.15s" }} />
            )}
            <path d={trail(ring.c, ring.radius, ring.end, sweep)} className="fig-trail-seq" style={delay} />
            {/* The chain and the flail's head at the end of the trail, flickering in together. */}
            <g className="fig-chain-seq" style={chainDelay}>
              <line x1={c[0]} y1={c[1]} x2={hx} y2={hy} className="fig-chain" />
              <FlailHead at={[hx, hy]} />
            </g>
          </g>
        );
      })}
    </g>
  );
}

/** The candle arm, from the shoulder: wax and lit, wax and cold, or scorched black and burning. */
function CandleArmEl({ s, shoulder, arm, part = "all" }: {
  s: WardenSkeleton;
  shoulder: Pt;
  arm: CandleArm;
  /** Draw only the arm, only its flame (or smoke), or both. */
  part?: "arm" | "fist" | "flame" | "all";
}) {
  const { elbow, hand } = s.freeArm;
  const pts = limb(shoulder, elbow, hand);
  const drip = (t: number, l: number) => {
    const p = lerp(elbow, hand, t);
    return <line x1={p[0]} y1={p[1] + 2} x2={p[0]} y2={p[1] + 2 + l} className="fig-arm-drip" />;
  };
  const top = add(hand, [0, -3]);
  // The forearm swells toward the hand, thick with wax.
  const fl = Math.hypot(hand[0] - elbow[0], hand[1] - elbow[1]) || 1;
  const across: Pt = [-(hand[1] - elbow[1]) / fl, (hand[0] - elbow[0]) / fl];
  const forearm = [add(elbow, across, 3.5), add(hand, across, 5), add(hand, across, -5), add(elbow, across, -3.5)];
  const skin = arm === "scorched" ? "fig-hand-burnt" : "fig-hand-wax";
  const body = (
    <>
      <polyline points={limb(shoulder, elbow)} className={arm === "scorched" ? "fig-arm-burnt" : "fig-arm-wax"} />
      <polygon points={limb(...forearm)} className={skin} />
      <circle cx={elbow[0]} cy={elbow[1]} r={3.5} className={skin} />
      {arm === "scorched" && <polyline points={pts} className="fig-arm-embers" />}
      <circle cx={hand[0]} cy={hand[1]} r={5.4} className={skin} />
      {arm !== "scorched" && <>{drip(0.3, 3)}{drip(0.7, 4)}</>}
    </>
  );
  if (part === "arm") return <g>{body}</g>;
  if (part === "fist") return <circle cx={hand[0]} cy={hand[1]} r={5.4} className={skin} />;
  // Mid-swat (Fan Flames) the flame isn't put out: it's blown flat, streaming back the way the hand
  // came (toward his body), smudged by the speed.
  const fanning = s.burst === "fan";
  const inFlight = (flame: ReactNode) => {
    if (!fanning) return flame;
    // Swept straight back along the trail, at the angle the trail meets the hand.
    const { mid } = fanSweep(s);
    const back: Pt = [mid[0] - hand[0], mid[1] - hand[1]];
    const deg = (Math.atan2(back[1], back[0]) * 180) / Math.PI + 90; // the flame points up (-y)
    return (
      <g className="fig-flame-smudge" transform={`rotate(${deg} ${hand[0]} ${hand[1]}) translate(${hand[0]} ${hand[1]}) scale(1.1 1.7) translate(${-hand[0]} ${-hand[1]})`}>
        {flame}
      </g>
    );
  };
  return (
    <g>
      {part === "all" && body}
      {arm === "lit" && (!s.burst || fanning) && inFlight(
        <>
          <circle cx={hand[0]} cy={hand[1] - 7} r={9} className="fig-glow" />
          <Flame at={top} s={0.8} />
        </>,
      )}
      {arm === "out" && (
        <>
          <path d={`M${top[0]} ${top[1]} q-3 -5 0 -9 q3 -4 -1 -9`} className="fig-smoke" />
        </>
      )}
      {arm === "scorched" && (!s.burst || fanning) && inFlight(
        <>
          <circle cx={hand[0]} cy={hand[1] - 6} r={13} className="fig-glow" />
          <Flame at={add(hand, [-3, 3])} s={1.1} className="fig-flame-b" />
          <Flame at={add(hand, [3, 3])} s={1.2} />
          <Flame at={add(hand, [0, 4])} s={1.6} className="fig-flame-c" />
        </>,
      )}
    </g>
  );
}

/**
 * The candle fist's swing trail: a flame-coloured streak running almost straight from where the
 * fist was drawn back (up behind him) down to where it struck, bowing slightly in toward his
 * shoulder, thickest at the fist.
 */
function PunchTrail({ s, shoulder }: { s: WardenSkeleton; shoulder: Pt }) {
  const hand = s.freeArm.hand;
  const R = Math.hypot(hand[0] - shoulder[0], hand[1] - shoulder[1]);
  const a1 = Math.atan2(hand[1] - shoulder[1], hand[0] - shoulder[0]);
  const a0 = a1 - (190 * Math.PI) / 180;
  const from: Pt = [shoulder[0] + Math.cos(a0) * (R + 2), shoulder[1] + Math.sin(a0) * (R + 2)];
  const len = Math.hypot(hand[0] - from[0], hand[1] - from[1]) || 1;
  let n: Pt = [-(hand[1] - from[1]) / len, (hand[0] - from[0]) / len];
  // bow away from him, out past the shoulder
  const mid = lerp(from, hand, 0.5);
  if (n[0] * (shoulder[0] - mid[0]) + n[1] * (shoulder[1] - mid[1]) > 0) n = [-n[0], -n[1]];
  return <FlameTrail wax={s.punchTrail === "wax"} at={t => add(lerp(from, hand, t), n, Math.sin(Math.PI * t) * len * 0.07)} />;
}

/**
 * A fading streak of flame along a path (t from 0 at its tail to 1 at the hand), thin at the tail
 * and widest at the hand, in the candle flame's colours.
 */
function FlameTrail({ at, width = 5, wax }: { at: (t: number) => Pt; width?: number; wax?: boolean }) {
  const N = 24;
  const pts = Array.from({ length: N + 1 }, (_, i) => at(i / N));
  const band = (wmax: number) => {
    const l: string[] = [], r: string[] = [];
    pts.forEach((c, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N, i + 1)];
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const nrm: Pt = [-(b[1] - a[1]) / d, (b[0] - a[0]) / d];
      const w = wmax * (i / N);
      const p = add(c, nrm, w), q = add(c, nrm, -w);
      l.push(`${i ? "L" : "M"}${p[0]} ${p[1]}`);
      r.unshift(`L${q[0]} ${q[1]}`);
    });
    return `${l.join(" ")} ${r.join(" ")} Z`;
  };
  return (
    <g className="fig-trail-flame">
      <path d={band(width)} className={wax ? "fig-trail-wax-outer" : "fig-trail-flame-outer"} />
      <path d={band(width * 0.44)} className={wax ? "fig-trail-wax-core" : "fig-trail-flame-core"} />
    </g>
  );
}

/**
 * Flail Slam's trail: the flail's head brought down from where it whirled overhead, over in a
 * high arc and down onto the floor before him; thin where it starts, widest where it lands.
 */
function SlamTrail({ s }: { s: WardenSkeleton }) {
  const { ball } = flailOf(s);
  const from: Pt = [s.head[0] - 20, s.head[1] - 46];
  const ctl: Pt = [ball[0] + 18, s.head[1] - 60];
  const at = (t: number): Pt => {
    const u = 1 - t;
    return [u * u * from[0] + 2 * u * t * ctl[0] + t * t * ball[0], u * u * from[1] + 2 * u * t * ctl[1] + t * t * ball[1]];
  };
  const N = 28;
  const pts = Array.from({ length: N + 1 }, (_, i) => at(i / N));
  const l: string[] = [], r: string[] = [];
  pts.forEach((c, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N, i + 1)];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nrm: Pt = [-(b[1] - a[1]) / d, (b[0] - a[0]) / d];
    const w = 7 * (i / N);
    const p = add(c, nrm, w), q = add(c, nrm, -w);
    l.push(`${i ? "L" : "M"}${p[0]} ${p[1]}`);
    r.unshift(`L${q[0]} ${q[1]}`);
  });
  return <path d={`${l.join(" ")} ${r.join(" ")} Z`} className="fig-trail" />;
}

/** The Fan Flames swat's path: from in front of him (`from`) curving through `mid` out to the hand. */
function fanSweep(s: WardenSkeleton): { from: Pt; mid: Pt } {
  const [nx, ny] = s.neck;
  const [x, y] = s.freeArm.hand;
  const from: Pt = [nx + 22, ny + 4];
  return { from, mid: [(from[0] + x) / 2, Math.max(from[1], y) + 12] };
}

/** The chain held in the candle hand: sagging from the handle's tip to the hand, the head hanging
 *  just below the fist. */
function ChainInHand({ s, part = "all" }: { s: WardenSkeleton; part?: "chain" | "head" | "all" }) {
  const { tip } = flailOf(s);
  const hand = s.freeArm.hand;
  const mid = add(lerp(tip, hand, 0.5), [0, s.chainTaut ? 0 : 4]);
  // Tucked behind the arm, it hangs only a little below the fist, partly hidden.
  const bx = hand[0], by = hand[1] + (s.headBehindArm ? 16 : 12);
  return (
    <g>
      {part !== "head" && <path d={`M${tip[0]} ${tip[1]} Q${mid[0]} ${mid[1]} ${hand[0]} ${hand[1]}`} className="fig-chain" />}
      {part !== "chain" && <HangingHead hand={hand} bx={bx} by={by} />}
    </g>
  );
}

function HangingHead({ hand, bx, by }: { hand: Pt; bx: number; by: number }) {
  return (
    <g>
      <line x1={hand[0]} y1={hand[1]} x2={bx} y2={by} className="fig-chain" />
      <FlailHead at={[bx, by]} />
    </g>
  );
}

/**
 * Flail Swing's blow: the flail's first spin, one wide ellipse drawn over him. It starts low
 * behind him (about where the head hung in Flail Clutched), swoops down almost to the floor, out
 * past you, up over him and round to up and away behind him; thin where it starts, thickest where
 * the head is, with the chain (from the handle) and head flickering in at its end. Timed like the
 * first of the spin trails.
 */
function SwingArc({ s, tip }: { s: WardenSkeleton; tip: Pt }) {
  // Centered on his middle, reaching from just above the floor to above his head.
  const cx = (s.neck[0] + s.hip[0]) / 2 + 3;
  const bottom = GROUND - 2, top = s.head[1] - 12;
  const cy = (bottom + top) / 2, ry = (bottom - top) / 2, rx = ry * 1.15;
  const A0 = Math.PI - 0.12; // low behind him
  const A1 = -Math.PI + 0.6; // up and away behind him, after going all the way round the front
  const at = (a: number, k = 1): Pt => [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k];
  const outer: string[] = [], inner: string[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const a = A0 + (A1 - A0) * t;
    const o = at(a), n = at(a, 1 - 0.18 * t); // thin where it starts, thick at the head
    outer.push(`${i ? "L" : "M"}${o[0]} ${o[1]}`);
    inner.unshift(`L${n[0]} ${n[1]}`);
  }
  const [hx, hy] = at(A1, 0.91);
  const delay = { animationDelay: "0s", animationDuration: "0.3s" };
  return (
    <g>
      <path d={`${outer.join(" ")} ${inner.join(" ")} Z`} className="fig-trail-seq" style={delay} />
      <g className="fig-chain-seq" style={{ animationDelay: "0s", animationDuration: "0.15s" }}>
        <line x1={tip[0]} y1={tip[1]} x2={hx} y2={hy} className="fig-chain" />
        <FlailHead at={[hx, hy]} />
      </g>
    </g>
  );
}

/**
 * Rising Flail's blow: the flail swung up from below, an upright ellipse behind his cloak, from low
 * behind him, under and up through you, to high over his head; thin where it starts, thickest
 * where the head is, with the chain (from the handle) and head flickering in at its end. Timed
 * like the first of the spin trails; the spins after it whirl level over his head.
 */
function RisingArc({ s, r, tip }: { s: WardenSkeleton; r: number; tip: Pt }) {
  const [cx, cy] = s.neck;
  const rx = r * 1.15, ry = r * 1.35;
  const A0 = (3 * Math.PI) / 4; // low behind him
  const A1 = -Math.PI / 2 - 0.35; // high over his head, just past the top
  const at = (a: number, k = 1): Pt => [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k];
  const outer: string[] = [], inner: string[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const a = A0 + (A1 - A0) * t;
    const o = at(a), n = at(a, 1 - 0.18 * t);
    outer.push(`${i ? "L" : "M"}${o[0]} ${o[1]}`);
    inner.unshift(`L${n[0]} ${n[1]}`);
  }
  const [hx, hy] = at(A1, 0.91);
  return (
    <g>
      <path d={`${outer.join(" ")} ${inner.join(" ")} Z`} className="fig-trail-seq" style={{ animationDelay: "0s", animationDuration: "0.3s" }} />
      <g className="fig-chain-seq" style={{ animationDelay: "0s", animationDuration: "0.15s" }}>
        <line x1={tip[0]} y1={tip[1]} x2={hx} y2={hy} className="fig-chain" />
        <FlailHead at={[hx, hy]} />
      </g>
    </g>
  );
}

/** The flail's head gripped in the candle hand, the chain pulled taut up to it from the handle. */
function HeadInHand({ s }: { s: WardenSkeleton }) {
  const { tip } = flailOf(s);
  const [bx, by] = add(s.freeArm.hand, [0, 6]); // gripped from above
  return (
    <g>
      <line x1={tip[0]} y1={tip[1]} x2={bx} y2={by} className="fig-chain" />
      <FlailHead at={[bx, by]} />
    </g>
  );
}

/**
 * Clutch Arm's trail, drawn on the pose he moves on to: a wide wax sweep from where the head was
 * (in his fist), through his candle hand now, to where the head hangs now.
 */
function RewaxTrail({ from, s, fire }: { from: WardenSkeleton; s: WardenSkeleton; fire?: boolean }) {
  const [{ a, m, c }] = useState(() => ({
    a: add(from.freeArm.hand, [0, 6]),
    m: s.freeArm.hand,
    c: flailOf(s).ball,
  }));
  // A curve through all three: the control point that puts his hand right at its middle.
  const ctl: Pt = [2 * m[0] - 0.5 * (a[0] + c[0]), 2 * m[1] - 0.5 * (a[1] + c[1])];
  const at = (t: number): Pt => {
    const u = 1 - t;
    return [u * u * a[0] + 2 * u * t * ctl[0] + t * t * c[0], u * u * a[1] + 2 * u * t * ctl[1] + t * t * c[1]];
  };
  return <FlameTrail wax={!fire} width={8} at={at} />;
}

/** A point along the swat's sweep: t = 0 in front of him, 1 at the hand. */
function sweepAt(s: WardenSkeleton) {
  const { from, mid } = fanSweep(s);
  const to = s.freeArm.hand;
  return (t: number): Pt => {
    const u = 1 - t;
    return [u * u * from[0] + 2 * u * t * mid[0] + t * t * to[0], u * u * from[1] + 2 * u * t * mid[1] + t * t * to[1]];
  };
}

/** Fire poured from the candle hand: a fan of tongues, or one long blast. */
function Burst({ s, kind }: { s: WardenSkeleton; kind: "fan" | "blast" }) {
  const [x, y] = s.freeArm.hand;
  if (kind === "blast") {
    // The flare at the palm as the fireball leaves it: a burst of tongues around the hand.
    const rays = [0, 45, 90, 135, 180, 225, 270, 315].map(a => {
      const r = (a * Math.PI) / 180;
      const len = a % 90 === 0 ? 12 : 8;
      const tip: Pt = [x + Math.cos(r) * len, y + Math.sin(r) * len];
      const l: Pt = [x + Math.cos(r + 0.35) * 4, y + Math.sin(r + 0.35) * 4];
      const rr: Pt = [x + Math.cos(r - 0.35) * 4, y + Math.sin(r - 0.35) * 4];
      return `M${l[0]} ${l[1]} L${tip[0]} ${tip[1]} L${rr[0]} ${rr[1]} Z`;
    });
    return (
      <g className="fig-burst">
        {rays.map((d, i) => <path key={i} d={d} className="fig-burst-outer" />)}
        <circle cx={x} cy={y} r={6.5} className="fig-burst-outer" />
        <circle cx={x} cy={y} r={4} className="fig-burst-inner" />
      </g>
    );
  }
  // The swat's trail: a fading sweep of flame around his side, from in front of him out to the
  // hand, dipping toward you as it passes (seen at an angle, a level circle looks like this).
  // Fades out like the punch trail, widest at the hand.
  return <FlameTrail width={6} at={sweepAt(s)} />;
}

/**
 * A puff of smoke leaving the candle hand as its flame is put out: a few wisps curling up and
 * away. `ago` is how long ago it went out (ms), so it carries on smoothly if redrawn.
 */
function SmokePuff({ at, ago }: { at: Pt; ago: number }) {
  const [x, y] = at;
  const wisps = [
    `M${x} ${y} q-4 -6 0 -11 q4 -5 -1 -11`,
    `M${x - 2} ${y + 1} q-6 -4 -5 -10 q1 -6 -5 -9`,
    `M${x + 2} ${y + 1} q5 -5 3 -10 q-2 -5 4 -9`,
  ];
  return (
    <g className="fig-smoke-puff" style={{ animationDelay: `${-ago}ms` }}>
      <circle cx={x} cy={y - 2} r={4} className="fig-smoke-cloud" style={{ animationDelay: `${-ago}ms` }} />
      {wisps.map((d, i) => <path key={i} d={d} className="fig-smoke-wisp" style={{ animationDelay: `${-ago + i * 60}ms` }} />)}
    </g>
  );
}

export function WardenFigure({ s, front, arm, lingerFrom, smokeAgo, phase2Look, flailFire }: {
  s: WardenSkeleton;
  front: boolean;
  arm: CandleArm;
  /** The rest pose he has just left: its trails keep fading (he has already moved on). */
  lingerFrom?: WardenPoseName;
  /** His flame has just been put out this long ago (ms): smoke still leaving his hand. */
  smokeAgo?: number;
  /** Phase two's look (black wax, burning inside), whatever his arm is doing. */
  phase2Look?: boolean;
  /** The flail is on fire. */
  flailFire?: boolean;
}) {
  const [nx, ny] = s.neck;
  // Turning his candle side toward you swings that shoulder forward and the flail shoulder back.
  // The shoulders can twist further than the hips and legs (shoulderTurn).
  const turn = s.shoulderTurn ?? s.turn ?? 0;
  // Turned the other way (flail shoulder toward you), the shoulders line up with the camera: the
  // flail shoulder in front of the torso, the candle shoulder hidden behind it.
  const away = Math.max(0, -turn);
  const toward = Math.max(0, turn);
  const nearShoulder: Pt = [nx - 3 + 9 * toward + away, ny + 4 - toward - 3 * away];
  const farShoulder: Pt = [nx + 3 - 9 * toward - away, ny + 2 + 3 * away];
  // Facing you (front view), his right (flail) arm is the far one and the candle arm the near one.
  // From behind, the shoulders sit either side of his back: the flail one on the side he faces,
  // the candle one on the side toward you.
  const back = (k: number): Pt => {
    const [hx, hy] = s.hip;
    const len = Math.hypot(hx - nx, hy - ny) || 1;
    let n: Pt = [-(hy - ny) / len, (hx - nx) / len];
    if (n[0] > 0) n = [-n[0], -n[1]]; // toward the way he faces
    return add([nx, ny + 3], n, k);
  };
  const flailShoulder = s.backView ? back(6) : front ? farShoulder : nearShoulder;
  const candleShoulder = s.backView ? back(-6) : s.shoulderAtRip ? ripArmpit(s) : front ? nearShoulder : farShoulder;
  const sleeveEnd = lerp(flailShoulder, s.weaponArm.elbow, 0.75);
  // Usually the flail arm is the far one (behind the body) and the candle arm the near one.
  // Turned flail shoulder first, they swap: the candle arm goes behind, the flail arm in front.
  const swapped = turn <= -0.5;
  // The forearm (and the flail) behind his body, the upper arm over it.
  const flailBehind = swapped && !!s.flailForearmBehind;
  const flailForearm = (
    <>
      {s.spin !== "behind" && <Flail s={s} />}
      <polyline points={limb(s.weaponArm.elbow, s.weaponArm.hand)} className="fig-limb fig-far" />
    </>
  );
  const flailUpper = (
    <>
      <polyline points={limb(flailShoulder, s.weaponArm.elbow)} className="fig-limb" />
      <polyline points={limb(flailShoulder, sleeveEnd)} className="fig-sleeve" />
    </>
  );
  const flailArm = flailBehind ? flailUpper : (
    <>
      {s.spin !== "behind" && <Flail s={s} />}
      <polyline points={limb(flailShoulder, s.weaponArm.elbow, s.weaponArm.hand)} className={`fig-limb ${swapped || s.flailArmOver ? "" : "fig-far"}`} />
      <polyline points={limb(flailShoulder, sleeveEnd)} className={`fig-sleeve ${swapped || s.flailArmOver ? "" : "fig-sleeve-far"}`} />
    </>
  );
  // Holding the chain: it runs over the arm and into the fist, which closes over it. The head
  // hangs below the fist: in front of the arm, or tucked behind it.
  const candleArm = s.chainInHand ? (
    <>
      {s.headBehindArm && <ChainInHand s={s} part="head" />}
      <CandleArmEl s={s} shoulder={candleShoulder} arm={arm} part="arm" />
      {!swapped && <ChainInHand s={s} part={s.headBehindArm ? "chain" : "all"} />}
      {swapped && !s.headBehindArm && <ChainInHand s={s} part="head" />}
      <CandleArmEl s={s} shoulder={candleShoulder} arm={arm} part="fist" />
      <CandleArmEl s={s} shoulder={candleShoulder} arm={arm} part="flame" />
    </>
  ) : (
    <CandleArmEl s={s} shoulder={candleShoulder} arm={arm} />
  );
  // With the hand tucked under his head, the arm goes under the hood but its flame shows over it.
  const tucked = !swapped && !!s.armBehindHead && !!s.shoulderAtRip;
  return (
    // Phase two: his wax burnt black, the inside of his cloak and hood burning.
    <FlailFire.Provider value={!!flailFire}>
    <g className={`wd-figure ${arm === "scorched" || phase2Look ? "wd-phase2" : ""} ${flailFire ? "wd-flaming" : ""}`}>
      {(s.spinTrail || (lingerFrom && WARDEN_POSES[lingerFrom].spinTrail)) && <SpinTrail s={s} shoulder={flailShoulder} />}
      {/* Whirling behind him, the flail passes behind the cloak. */}
      {s.spin === "behind" && <Flail s={s} />}
      {/* Behind the body: the cloak hides whatever it covers. */}
      {swapped ? candleArm : !s.flailArmOver && flailArm}
      {flailBehind && flailForearm}
      {/* The far leg stays hidden under the cloak; the near one shows through its rip (see Cloak). */}
      <Cloak s={s} />
      <Stain s={s} />
      {!swapped && s.armBehindHead && (tucked ? <CandleArmEl s={s} shoulder={candleShoulder} arm={arm} part="arm" /> : candleArm)}
      {/* The flail arm brought round in front of his body. */}
      {!swapped && s.flailArmOver && flailArm}
      {/* Flail Swing's blow sweeps over him, but under his head. */}
      {(s.swingTrail || s.risingTrail) && <SpinTrail s={s} shoulder={flailShoulder} layer="front" />}
      <Hood s={s} />
      {tucked && <CandleArmEl s={s} shoulder={candleShoulder} arm={arm} part="flame" />}
      {/* The drool hangs from the hood: in front of the far side, behind whatever arm is nearest. */}
      <Beard s={s} />
      {s.headInHand && <HeadInHand s={s} />}
      {/* The wax arm behind him, holding the chain: the chain still crosses over the cloak. */}
      {s.chainInHand && swapped && (
        <>
          <ChainInHand s={s} part="chain" />
          <CandleArmEl s={s} shoulder={candleShoulder} arm={arm} part="fist" />
          <CandleArmEl s={s} shoulder={candleShoulder} arm={arm} part="flame" />
        </>
      )}
      {/* Turned flail shoulder first, the wax arm is behind him: its fist still closes over the head. */}
      {s.headInHand && swapped && (
        <>
          <CandleArmEl s={s} shoulder={candleShoulder} arm={arm} part="fist" />
          <CandleArmEl s={s} shoulder={candleShoulder} arm={arm} part="flame" />
        </>
      )}
      {swapped ? flailArm : !s.armBehindHead && candleArm}
      {/* The punch trail goes over everything but the flare at the fist. */}
      {s.punchTrail && (s.punchTrail === "wax" || arm !== "out") && <PunchTrail s={s} shoulder={candleShoulder} />}
      {s.slamTrail && <SlamTrail s={s} />}
      {smokeAgo !== undefined && <SmokePuff at={add(s.freeArm.hand, [0, -4])} ago={smokeAgo} />}
      {s.burst && arm !== "out" && <Burst s={s} kind={s.burst} />}
      {s.swat && <FlameTrail wax width={6} at={sweepAt(s)} />}
      {lingerFrom && WARDEN_POSES[lingerFrom].rewaxTrail && <RewaxTrail from={WARDEN_POSES[lingerFrom]} s={s} fire={arm === "scorched"} />}
    </g>
    </FlailFire.Provider>
  );
}