/**
 * playerPoses.ts — the player's poses, built from how the body is really turned (see body.ts) instead of written point by point: the pelvis and
 * shoulders are each turned by their own angle, the feet stand on the floor where that turn puts them (a stride along the way the body points,
 * a width across it), the knees bend forward, and the arms reach hands that are given relative to the hips. The rig then fits every bone to its
 * true length. The staggered and dead poses (kneel, fallen) are not here: they stay as they were.
 *
 * "Pointing": the line through the shoulders (or the hips), extended from the chosen shoulder, reaches what it points at. In a stance with the
 * left leg leading the left shoulder and hip point at the enemy (turned 90 degrees to the right: the line runs along the way to the enemy), and with
 * the right leg leading the right ones do (turned 90 degrees to the left).
 *
 * A stance: `psiS` the shoulders' turn, `psiH` the pelvis's (positive: turned right, so the left side leads and the right (weapon) shoulder
 * draws back), `D` the stride (positive: the left foot ahead, negative: the right), `W` half the width of the feet, `c` how far the hips sink,
 * `lean` how far the body leans forward (px). Hands are offsets from the hips; the weapon points at `angle` degrees (0: forward).
 */
import type { Pt } from "./geom";
import { HIP_HALF, onBody, SHOULDER_HALF } from "./body";
import { reachArm, RIG } from "./rig";
import type { Skeleton } from "./poses";

interface Stand {
  psiS: number; psiH: number; D: number; W: number; c: number; lean: number;
  /** The way the feet are lined up (degrees; default the pelvis's turn): a bladed stance's feet stand along the way to the enemy, whatever way the hips face. */
  psiF?: number;
  /** Head tipped back (negative) or forward (positive), px. */
  head?: number;
  weaponHand: Pt; angle: number; weaponElbowUp?: boolean;
  freeHand: Pt; freeElbowUp?: boolean;
  /** The elbows placed by hand, relative to their shoulders (px); the forearm then runs from the elbow toward the hand. */
  weaponElbow?: Pt; freeElbow?: Pt;
  /** The weapon forearm foreshortened (a multiple of its length): a hand brought close to its elbow, the forearm pointing away from the camera. */
  weaponFore?: number;
  weaponLayer?: "behind" | "front"; freeLayer?: "behind" | "front";
  /** Standing straight: the shins and the forearms hang plumb vertical, the knees and elbows bent outward, away from the body. */
  plumb?: boolean;
  /** The right knee points toward the camera (down on the page), not forward. */
  rightKneeCamera?: boolean;
  /** The weapon's forearm and blade pass behind the torso (across the chest, away from the camera). */
  foreBehind?: boolean;
  sweep?: number; flat?: number;
  gaze?: number;
  /**
   * The feet placed on the page by hand (offsets from the hips: left, right), instead of from the turn: for a stance with the RIGHT leg leading, whose leading
   * foot is the far one (higher on the page) yet still toward the enemy (to the right), which the turn alone cannot give.
   */
  feet?: { left: Pt; right: Pt };
}

const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];

function stand(o: Stand): Skeleton {
  const hip: Pt = [50, 66 + o.c];
  const neck: Pt = [hip[0] + o.lean, hip[1] - 32];
  const head: Pt = [neck[0] + (o.head ?? o.lean * 0.5), neck[1] - 11];
  // The joints as the figure will place them (see StickFigure): the shoulders on the neck, the hips on the pelvis.
  const rightShoulder = add([neck[0], neck[1] + 3], onBody(0, SHOULDER_HALF, o.psiS));
  const leftShoulder = add([neck[0], neck[1] + 3], onBody(0, -SHOULDER_HALF, o.psiS));
  const rightHip = add(hip, onBody(0, HIP_HALF, o.psiH));
  const leftHip = add(hip, onBody(0, -HIP_HALF, o.psiH));
  // The feet on the floor: the left one ahead by half the stride and out to the left by half the width, the right the other way, in the pelvis's own turn.
  const psiF = o.psiF ?? o.psiH;
  // Plumb legs: each foot stands straight below its knee, which is as far out from its hip as the thigh needs.
  const plumbFoot = (hipP: Pt, out: number): Pt => {
    const dx = 2;
    return [hipP[0] + out * dx - hip[0], 114 - hip[1]];
  };
  const lf = o.plumb ? plumbFoot(leftHip, Math.sign(leftHip[0] - hip[0]) || -1) : o.feet ? o.feet.left : onBody(o.D / 2, -o.W, psiF), rf = o.plumb ? plumbFoot(rightHip, Math.sign(rightHip[0] - hip[0]) || 1) : o.feet ? o.feet.right : onBody(-o.D / 2, o.W, psiF);
  const lowest = Math.max(lf[1], rf[1]);
  // Both feet on the floor (the camera is not above the player: a foot farther away is not drawn floating higher).
  void lowest;
  const leftFoot: Pt = [hip[0] + lf[0], 114];
  const rightFoot: Pt = [hip[0] + rf[0], 114];
  // The knees: see below.
  const knee = (from: Pt, foot: Pt, left: boolean): Pt => {
    const dx = foot[0] - from[0], dy = foot[1] - from[1], len = Math.hypot(dx, dy) || 1;
    const out = Math.sqrt(Math.max(0, RIG.thigh * RIG.thigh - (len / 2) ** 2));
    // A knee pointing away from the camera (the left leg's) or toward it (the right's) shows on the page as a knee a little above or below the line of the
    // leg, not bent sideways: the way it points is depth, not a bend to the left or right. Only a little of the bend shows, the rest is foreshortened.
    if (o.plumb) return [foot[0], foot[1] - RIG.shin];
    if (left) return [(from[0] + foot[0]) / 2, (from[1] + foot[1]) / 2 - Math.min(out, 5)];
    if (o.rightKneeCamera) return [(from[0] + foot[0]) / 2, (from[1] + foot[1]) / 2 + Math.min(out, 5)];
    // The right leg's knee bends forward, to the right, as it always did.
    let px = -dy / len, py = dx / len;
    if (px < 0) { px = -px; py = -py; }
    return [(from[0] + foot[0]) / 2 + px * out, (from[1] + foot[1]) / 2 + py * out];
  };
  const leftLeg = { knee: knee(leftHip, leftFoot, true), foot: leftFoot };
  const rightLeg = { knee: knee(rightHip, rightFoot, false), foot: rightFoot };
  const leftLeads = o.D >= 0;
  // A leg whose knee points toward or away from the camera is foreshortened: its bones are shortened (the rig's `adjust`) so that the foot still lands on the
  // floor where it is meant to, instead of the leg stretching past it.
  const shorten = (hipP: Pt, foot: Pt) => {
    const half = Math.hypot(foot[0] - hipP[0], foot[1] - hipP[1]) / 2, off = Math.min(5, Math.sqrt(Math.max(0, RIG.thigh * RIG.thigh - half * half)));
    return Math.min(1, (2 * Math.hypot(half, off)) / (RIG.thigh + RIG.shin));
  };
  const kL = shorten(leftHip, leftFoot), kR = o.rightKneeCamera ? shorten(rightHip, rightFoot) : 1;
  const [kLead, kRear] = leftLeads ? [kL, kR] : [kR, kL];
  const adjust = { ...(o.weaponFore ? { weaponFore: o.weaponFore } : {}), leadThigh: kLead, leadShin: kLead, rearThigh: kRear, rearShin: kRear };
  // The arms: hands relative to the hips, the elbows bending down (or up).
  const reach = (shoulder: Pt, rel: Pt, up?: boolean) => {
    const hand = add(hip, rel);
    const mid: Pt = [(shoulder[0] + hand[0]) / 2, (shoulder[1] + hand[1]) / 2];
    return reachArm(shoulder, hand, RIG.upperArm, RIG.forearm, [mid[0], mid[1] + (up ? -10 : 10)]);
  };
  /** An arm with its elbow set relative to the shoulder: the forearm runs from there toward the hand. */
  const withElbow = (shoulder: Pt, rel: Pt, handRel: Pt, fore = 1) => {
    const elbow: Pt = [shoulder[0] + rel[0], shoulder[1] + rel[1]];
    const h = add(hip, handRel), dx = h[0] - elbow[0], dy = h[1] - elbow[1], d = Math.hypot(dx, dy) || 1;
    return { elbow, hand: [elbow[0] + (dx / d) * RIG.forearm * fore, elbow[1] + (dy / d) * RIG.forearm * fore] as Pt };
  };
  // Plumb arms: the elbow out from the shoulder, the forearm straight down from it.
  const plumbArm = (shoulder: Pt) => {
    const out = Math.sign(shoulder[0] - neck[0]) || 1, dx = 4, elbow: Pt = [shoulder[0] + out * dx, shoulder[1] + Math.sqrt(RIG.upperArm * RIG.upperArm - dx * dx)];
    return { elbow, hand: [elbow[0], elbow[1] + RIG.forearm] as Pt };
  };
  const weaponArm = o.plumb ? plumbArm(rightShoulder) : o.weaponElbow ? withElbow(rightShoulder, o.weaponElbow, o.weaponHand, o.weaponFore ?? 1) : reach(rightShoulder, o.weaponHand, o.weaponElbowUp);
  const freeArm = o.plumb ? plumbArm(leftShoulder) : o.freeElbow ? withElbow(leftShoulder, o.freeElbow, o.freeHand) : reach(leftShoulder, o.freeHand, o.freeElbowUp);
  return {
    head, neck, hip,
    weaponArm, freeArm,
    leadLeg: leftLeads ? leftLeg : rightLeg,
    rearLeg: leftLeads ? rightLeg : leftLeg,
    leadSide: leftLeads ? "left" : "right",
    weapon: { at: weaponArm.hand, angle: o.angle },
    yaw: { shoulders: o.psiS, hips: o.psiH },
    weaponLayer: o.weaponLayer, freeLayer: o.freeLayer,
    adjust,
    foreBehind: o.foreBehind, sweep: o.sweep, flat: o.flat, gaze: o.gaze,
  };
}

/** The two lowered stances' bodies, shared by the swings that wind up in one and land in the other. */
const LEFT_LEADS = { rightKneeCamera: true, weaponLayer: "front", freeLayer: "behind", psiS: 90, psiH: 90, psiF: 8, D: 34, W: 4, c: 10, lean: 4 } as const;
const RIGHT_LEADS = { psiS: -90, psiH: -90, D: -34, W: 6, c: 10, lean: 3, feet: { left: [-17, 0], right: [16, 0] } } as const;

/** The player's poses. */
export const PLAYER_POSES_BUILT = {
  // Idle: standing easy and straight, the arms and legs relaxed, the body turned a little, the weapon hanging low, the free hand at the side.
  idle: stand({ plumb: true, psiS: 15, psiH: 10, D: 6, W: 5, c: -1, lean: 0, weaponHand: [9, 4], angle: 66, freeHand: [-6, 3] }),
  // The lowered stance, neither leg leading: square to the enemy, the feet wide apart across the body (not along it), the knees bent and out, the
  // weight low and even, the weapon at the side a little raised, the free hand up before the belly.
  low: stand({ psiS: 0, psiH: 0, D: 0, W: 20, c: 5, lean: 2, weaponHand: [15, -11], angle: -38, freeHand: [10, -17] }),
  // Lowered, the left leg leading (an orthodox stance): the pelvis and shoulders turned right, the left side toward the enemy and the weapon shoulder
  // drawn back, the weapon held back behind the hip, away from the enemy, the free hand reaching forward.
  "low-left": stand({ rightKneeCamera: true, weaponLayer: "front", freeLayer: "behind", psiS: 90, psiH: 90, psiF: 8, D: 34, W: 4, c: 10, lean: 4, weaponHand: [-19, -6], angle: 158, freeHand: [24, -20] }),
  // Lowered, the right leg leading: the pelvis and shoulders turned left so far that the right side swings round to the far side of the body (seen from
  // behind the right leg is the far one, still reaching toward the enemy, and the right shoulder points at the enemies, right and away from the camera);
  // the weapon arm is behind the body, the weapon held back across the chest.
  "low-right": stand({ psiS: -90, psiH: -90, D: -34, W: 6, c: 10, lean: 3, weaponHand: [-8, -25], angle: 172, weaponElbow: [14, 0], freeHand: [-16, -9], feet: { left: [-17, 0], right: [16, 0] } }),
  // Dodging forward: thrown forward in a long lunge, the left leg leading, the shoulders squared to run, the weapon trailing, the free hand out ahead.
  "dodge-fwd": stand({ psiS: -8, psiH: 8, D: 52, W: 5, c: 15, lean: 13, head: 7, weaponHand: [-17, -3], angle: 160, freeHand: [20, 4] }),
  // Dodging back: thrown back off the feet, the body leant away from the enemy, the right leg planted ahead, the weapon hanging, the free arm flung out.
  "dodge-back": stand({ psiS: -90, psiH: -90, D: -26, W: 6, c: 8, lean: -12, head: -8, weaponHand: [3, 13], angle: 100, freeHand: [-20, -22], freeElbowUp: true, feet: { left: [-13, 0], right: [11, 0] } }),
  // Rest's windup: a deep breath in: the chest lifted, the head tipped back a little, the left hand over the chest, the weapon hanging.
  "rest-in": stand({ psiS: 8, psiH: 4, D: 4, W: 6, c: 0, lean: -1, head: -2, weaponHand: [9, 6], angle: 68, freeHand: [1, -28], freeElbowUp: true }),
  // Rest: the breath out: the shoulders drop, the head lowers a little, the left hand still on the chest.
  rest: stand({ psiS: 8, psiH: 4, D: 4, W: 6, c: 1, lean: 2, head: 3, weaponHand: [9, 8], angle: 70, freeHand: [1, -25] }),
  // A Rest broken by a blow: jerked back, the arms thrown up before the face.
  flinch: stand({ psiS: 15, psiH: 8, D: 6, W: 6, c: 0, lean: -8, head: -4, weaponHand: [6, -33], angle: -120, weaponElbowUp: true, freeHand: [-6, -35], freeElbowUp: true }),
  // The overhead swing, wound up: the weapon reared back over the head, the free hand reaching forward, the legs wide.
  attack: stand({ psiS: 40, psiH: 25, D: 26, W: 6, c: 6, lean: -2, weaponHand: [-11, -43], angle: 135, weaponElbowUp: true, freeHand: [-20, -12], freeElbow: [-12, 3] }),
  // ...and as it lands: lunging forward, the weapon swept down and out past the body, the right shoulder thrown forward.
  strike: stand({ psiS: -35, psiH: 0, D: 34, W: 6, c: 10, lean: 8, weaponHand: [31, -6], angle: 28, freeHand: [-20, -12], freeElbow: [-12, 3] }),
  // Block: crouched behind the weapon, held upright as a guard, the free hand bracing it.
  block: stand({ psiS: 0, psiH: 0, D: 12, W: 6, c: 12, lean: 4, weaponHand: [22, -27], weaponFore: 0.3, angle: 172, weaponElbow: [13, 3], freeHand: [-2, -27], freeElbow: [-13, 3], weaponLayer: "behind", freeLayer: "behind" }),
  // A bare-handed blow: the free fist driven forward, the weapon hand drawn back and low.
  punch: stand({ psiS: 30, psiH: 15, D: 30, W: 6, c: 8, lean: 6, weaponHand: [-12, -6], angle: 120, freeHand: [28, -22] }),
  // Low to the ground, ready to move (kept as the lowered stance).
  maneuver: stand({ psiS: 0, psiH: 0, D: 0, W: 20, c: 5, lean: 2, weaponHand: [15, -11], angle: -38, freeHand: [10, -17] }),
  // A swing to the right (toward the enemy), wound up: the shoulders turned right as far as they go, the weapon drawn back level at the height of the chest.
  "swing-right-up": stand({ ...LEFT_LEADS, weaponHand: [-19, -6], angle: 180, freeHand: [24, -20] }),
  // ...and as it lands: unwound, the shoulders turned left, the weapon swept level out to the right, the left leg still leading.
  "swing-right": stand({ ...RIGHT_LEADS, weaponHand: [31, -17], angle: 0, freeHand: [-16, -9], sweep: -165, flat: 0.28 }),
  // A swing to the left, wound up: the weapon level out toward the enemy, the shoulders turned left, the right leg leading.
  "swing-left-up": stand({ ...RIGHT_LEADS, weaponHand: [31, -17], angle: 0, freeHand: [-16, -9] }),
  // ...and as it lands: swept level back across the chest to the left (the forearm and blade behind the torso), the shoulders turned right.
  "swing-left": stand({ ...LEFT_LEADS, weaponHand: [-19, -6], angle: 180, freeHand: [24, -20], sweep: 165, flat: 0.28 }),
};
