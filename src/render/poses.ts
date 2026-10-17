/**
 * poses.ts — every pose a figure can take (the Warden's are in warden/skeleton.ts), and which one a
 * fighter shows.
 */
import { ENEMY_KINDS } from "../core/bestiary";
import type { Enemy } from "../core/types";
import type { Pt } from "./geom";
import { WARDEN_POSES, type WardenPoseName } from "../warden/skeleton";

export interface Skeleton {
  head: Pt;
  neck: Pt;
  hip: Pt;
  /** The arm that holds the weapon. */
  weaponArm: { elbow: Pt; hand: Pt };
  /** The empty hand. */
  freeArm: { elbow: Pt; hand: Pt };
  /** The leg toward the facing direction, and the one behind it. */
  leadLeg: { knee: Pt; foot: Pt };
  rearLeg: { knee: Pt; foot: Pt };
  /** Grip position and blade angle in degrees (0 = facing direction, -90 = up). */
  weapon: { at: Pt; angle: number };
  /** Something held: a wax lump or a small flame. */
  prop?: { kind: "wax" | "flame"; at: Pt };
}

/**
 * idle, attack, block, maneuver, rest: what a fighter is about to do (the telegraphs).
 * ready, intimidating, cautious: a sleepwalker's stances, hinting at a few actions at once.
 * strike: the impact frame, shown during playback the moment an attack lands.
 * fallen: an enemy staggered, down on the ground and struggling to rise.
 * kneel: the player staggered, down on one knee and struggling to stand.
 * punch: the impact frame of a bare-handed attack.
 * w-…: the waxed, always on their knees (see the waxed poses below).
 */
export type PoseName =
  | "idle" | "attack" | "block" | "maneuver" | "rest"
  | "ready" | "intimidating" | "cautious"
  | "strike" | "fallen" | "kneel" | "punch"
  | "w-idle" | "w-hands" | "w-scratch" | "w-wax-hand" | "w-hurl"
  | "w-cower" | "w-crawl" | "w-slither" | "w-cradle" | "w-clutch" | "w-fallen" | "w-flinch" | "flinch"
  | WardenPoseName;

/**
 * The waxed kneel, shins bound together and laid behind them. Seen at a 3/4 angle, "behind"
 * runs back and away from the camera: up the screen, partly hidden by the body.
 */
const KNEELING = {
  leadLeg: { knee: [58, 111] as Pt, foot: [38, 107] as Pt },
  rearLeg: { knee: [51, 112] as Pt, foot: [31, 108] as Pt },
};

/** The waxed carry nothing; the grip just follows a hand (and isn't drawn). */
const bare = (hand: Pt) => ({ at: hand, angle: 0 });

/** Drawn facing right in a 100 × 120 box, feet on y = 114. */
const POSES: Record<Exclude<PoseName, WardenPoseName>, Skeleton> = {
  idle: {
    head: [50, 22], neck: [50, 33], hip: [50, 66],
    weaponArm: { elbow: [58, 47], hand: [64, 58] },
    freeArm: { elbow: [43, 48], hand: [41, 62] },
    leadLeg: { knee: [56, 90], foot: [61, 114] },
    rearLeg: { knee: [44, 90], foot: [39, 114] },
    weapon: { at: [64, 58], angle: -55 },
  },
  // Weapon reared back over the head, free hand reaching forward, legs wide.
  attack: {
    head: [47, 24], neck: [48, 35], hip: [53, 66],
    weaponArm: { elbow: [39, 38], hand: [31, 27] },
    freeArm: { elbow: [59, 45], hand: [67, 52] },
    leadLeg: { knee: [64, 88], foot: [72, 114] },
    rearLeg: { knee: [41, 89], foot: [32, 114] },
    weapon: { at: [31, 27], angle: -115 },
  },
  // Crouched behind the weapon, held upright as a guard.
  block: {
    head: [47, 33], neck: [48, 44], hip: [48, 74],
    weaponArm: { elbow: [60, 50], hand: [63, 40] },
    freeArm: { elbow: [56, 55], hand: [61, 46] },
    leadLeg: { knee: [59, 94], foot: [63, 114] },
    rearLeg: { knee: [38, 94], foot: [34, 114] },
    weapon: { at: [63, 44], angle: -88 },
  },
  // Low to the ground, ready to move.
  maneuver: {
    head: [63, 62], neck: [57, 68], hip: [38, 79],
    weaponArm: { elbow: [66, 82], hand: [74, 92] },
    freeArm: { elbow: [48, 84], hand: [45, 98] },
    leadLeg: { knee: [51, 96], foot: [59, 114] },
    rearLeg: { knee: [27, 95], foot: [16, 114] },
    weapon: { at: [74, 92], angle: 15 },
  },
  // Clasping the head, looking up. The weapon lies on the ground.
  rest: {
    head: [50, 19], neck: [50, 30], hip: [50, 66],
    weaponArm: { elbow: [64, 30], hand: [56, 17] },
    freeArm: { elbow: [36, 30], hand: [44, 17] },
    leadLeg: { knee: [54, 91], foot: [57, 114] },
    rearLeg: { knee: [46, 91], foot: [44, 114] },
    weapon: { at: [58, 112], angle: -3 },
  },
  // Flinch: a Rest broken by a blow, recoiling back, arms up before the face.
  flinch: {
    head: [42, 22], neck: [45, 33], hip: [52, 67],
    weaponArm: { elbow: [57, 40], hand: [52, 25] },
    freeArm: { elbow: [36, 40], hand: [42, 26] },
    leadLeg: { knee: [59, 91], foot: [63, 114] },
    rearLeg: { knee: [47, 91], foot: [39, 114] },
    weapon: { at: [52, 25], angle: -120 },
  },
  // Ready: en garde. Knees bent, weight forward, the blade levelled at you, free arm back for balance.
  ready: {
    head: [53, 30], neck: [52, 41], hip: [47, 72],
    weaponArm: { elbow: [59, 54], hand: [67, 47] },
    freeArm: { elbow: [41, 50], hand: [35, 57] },
    leadLeg: { knee: [63, 89], foot: [67, 114] },
    rearLeg: { knee: [35, 92], foot: [29, 114] },
    weapon: { at: [67, 47], angle: -22 },
  },
  // Intimidating: standing tall and open, chest out, arms flung wide, the weapon held low and out.
  intimidating: {
    head: [48, 17], neck: [48, 28], hip: [50, 64],
    weaponArm: { elbow: [35, 38], hand: [23, 46] },
    freeArm: { elbow: [62, 34], hand: [75, 27] },
    leadLeg: { knee: [61, 89], foot: [70, 114] },
    rearLeg: { knee: [40, 89], foot: [31, 114] },
    weapon: { at: [23, 46], angle: 140 },
  },
  // Cautious: low and leaning back, the blade held crosswise in front of the face like a bar,
  // the free hand bracing it.
  cautious: {
    head: [42, 46], neck: [43, 56], hip: [40, 82],
    weaponArm: { elbow: [56, 66], hand: [62, 52] },
    freeArm: { elbow: [52, 64], hand: [50, 50] },
    leadLeg: { knee: [58, 96], foot: [64, 114] },
    rearLeg: { knee: [28, 97], foot: [21, 114] },
    weapon: { at: [62, 52], angle: -168 },
  },
  // Follow-through: lunging forward, the weapon swept down and out past the body.
  strike: {
    head: [60, 30], neck: [57, 41], hip: [47, 70],
    weaponArm: { elbow: [70, 50], hand: [81, 60] },
    freeArm: { elbow: [43, 52], hand: [33, 60] },
    leadLeg: { knee: [67, 92], foot: [79, 114] },
    rearLeg: { knee: [36, 94], foot: [22, 114] },
    weapon: { at: [81, 60], angle: 28 },
  },
  // Down on the ground, propped on one arm, head lifted, trying to rise. The weapon has fallen away.
  fallen: {
    head: [70, 86], neck: [62, 94], hip: [38, 106],
    weaponArm: { elbow: [66, 104], hand: [68, 113] },
    freeArm: { elbow: [74, 100], hand: [82, 108] },
    leadLeg: { knee: [26, 102], foot: [14, 112] },
    rearLeg: { knee: [28, 111], foot: [12, 114] },
    weapon: { at: [86, 113], angle: 6 },
  },
  // One knee on the ground, leaning on the planted weapon, head bowed, struggling to stand.
  kneel: {
    head: [57, 45], neck: [54, 56], hip: [48, 84],
    weaponArm: { elbow: [62, 72], hand: [68, 80] },
    freeArm: { elbow: [56, 76], hand: [62, 90] },
    leadLeg: { knee: [64, 92], foot: [64, 114] },
    rearLeg: { knee: [42, 112], foot: [26, 114] },
    weapon: { at: [68, 80], angle: 84 },
  },
  // A bare-handed blow: the free fist driven forward, the weapon held back and low.
  punch: {
    head: [59, 29], neck: [56, 40], hip: [48, 70],
    weaponArm: { elbow: [44, 56], hand: [40, 66] },
    freeArm: { elbow: [70, 42], hand: [84, 40] },
    leadLeg: { knee: [66, 91], foot: [76, 114] },
    rearLeg: { knee: [37, 93], foot: [24, 114] },
    weapon: { at: [40, 66], angle: 120 },
  },

  /* ---------- The waxed: kneeling, head sealed in a lump of wax ---------- */
  // Slumped on its knees, arms hanging.
  "w-idle": {
    head: [53, 45], neck: [51, 56], hip: [47, 88],
    weaponArm: { elbow: [55, 72], hand: [57, 86] },
    freeArm: { elbow: [45, 72], hand: [47, 86] },
    ...KNEELING, weapon: bare([57, 86]),
  },
  // Hands Raised: both hands up, fingers hooked, about to claw.
  "w-hands": {
    head: [54, 43], neck: [52, 55], hip: [47, 88],
    weaponArm: { elbow: [63, 45], hand: [67, 31] },
    freeArm: { elbow: [45, 44], hand: [49, 30] },
    ...KNEELING, weapon: bare([67, 31]),
  },
  // Scratch: thrown forward from the knees, both hands raking down.
  "w-scratch": {
    head: [78, 54], neck: [69, 62], hip: [52, 88],
    weaponArm: { elbow: [80, 72], hand: [91, 84] },
    freeArm: { elbow: [76, 66], hand: [89, 73] },
    ...KNEELING, weapon: bare([91, 84]),
  },
  // Wax on Hand: leaning back, a lump of wax torn from itself held behind the shoulder.
  "w-wax-hand": {
    head: [45, 44], neck: [46, 55], hip: [48, 88],
    weaponArm: { elbow: [36, 52], hand: [27, 43] },
    freeArm: { elbow: [57, 64], hand: [66, 59] },
    ...KNEELING, weapon: bare([27, 43]), prop: { kind: "wax", at: [25, 40] },
  },
  // Hurl Wax: the throwing arm whipped forward, the other flung back.
  "w-hurl": {
    head: [63, 46], neck: [58, 56], hip: [49, 88],
    weaponArm: { elbow: [70, 48], hand: [83, 44] },
    freeArm: { elbow: [46, 68], hand: [37, 77] },
    ...KNEELING, weapon: bare([83, 44]),
  },
  // Cowering Sideways: twisted away and low, arms wrapped over the head.
  "w-cower": {
    head: [36, 55], neck: [39, 65], hip: [47, 90],
    weaponArm: { elbow: [50, 56], hand: [40, 46] },
    freeArm: { elbow: [47, 63], hand: [33, 51] },
    ...KNEELING, weapon: bare([40, 46]),
  },
  // Crawling: on its hands, dragging its bound legs.
  "w-crawl": {
    head: [74, 71], neck: [65, 78], hip: [43, 93],
    weaponArm: { elbow: [70, 96], hand: [75, 112] },
    freeArm: { elbow: [62, 96], hand: [66, 112] },
    leadLeg: { knee: [48, 111], foot: [28, 107] },
    rearLeg: { knee: [42, 112], foot: [21, 108] },
    weapon: bare([75, 112]),
  },
  // Slither Back: sat down, dragging itself backwards on its rear, hands planted behind it,
  // bound legs stretched out toward you, heels digging in, head still turned your way.
  "w-slither": {
    head: [42, 72], neck: [36, 83], hip: [47, 107],
    weaponArm: { elbow: [27, 95], hand: [22, 112] },
    freeArm: { elbow: [31, 97], hand: [28, 112] },
    leadLeg: { knee: [61, 103], foot: [80, 111] },
    rearLeg: { knee: [59, 105], foot: [78, 113] },
    weapon: bare([22, 112]),
  },
  // Cradle Flame: hands cupped at the chest around a small flame.
  "w-cradle": {
    head: [56, 46], neck: [53, 57], hip: [47, 88],
    weaponArm: { elbow: [64, 80], hand: [64, 72] },
    freeArm: { elbow: [52, 80], hand: [56, 73] },
    ...KNEELING, weapon: bare([64, 72]), prop: { kind: "flame", at: [60, 70] },
  },
  // Clutch Flame: folded over it, head bowed, hugging the flame to its belly.
  "w-clutch": {
    head: [64, 60], neck: [58, 68], hip: [46, 90],
    weaponArm: { elbow: [70, 86], hand: [64, 84] },
    freeArm: { elbow: [58, 90], hand: [60, 85] },
    ...KNEELING, weapon: bare([64, 84]), prop: { kind: "flame", at: [62, 84] },
  },
  // A Rest broken by a blow: jerked upright and back, arms thrown up.
  "w-flinch": {
    head: [38, 50], neck: [42, 60], hip: [48, 89],
    weaponArm: { elbow: [53, 62], hand: [47, 51] },
    freeArm: { elbow: [40, 67], hand: [33, 57] },
    ...KNEELING, weapon: bare([47, 51]),
  },
  // Staggered: toppled forward onto its sealed head, arms limp.
  "w-fallen": {
    head: [76, 106], neck: [66, 103], hip: [45, 98],
    weaponArm: { elbow: [66, 112], hand: [76, 113] },
    freeArm: { elbow: [55, 111], hand: [62, 114] },
    ...KNEELING, weapon: bare([76, 113]),
  },
};

/** Every pose, the Warden's included. */
export const ALL_POSES: Record<PoseName, Skeleton> = { ...POSES, ...WARDEN_POSES };

/** A pose name from game data, if it's one we can draw. */
export const asPose = (name: string | undefined, fallback: PoseName): PoseName =>
  name && name in ALL_POSES ? (name as PoseName) : fallback;

/** How an enemy kind looks when it isn't doing anything in particular, and when it's staggered. */
export const idlePoseOf = (e: Enemy): PoseName => asPose(ENEMY_KINDS[e.kind]?.idlePose, "idle");

export const downPoseOf = (e: Enemy): PoseName => asPose(ENEMY_KINDS[e.kind]?.downPose, "fallen");

export const flinchPoseOf = (e: Enemy): PoseName => asPose(ENEMY_KINDS[e.kind]?.flinchPose, "flinch");

/**
 * Which pose an enemy shows while you plan: its stance if it has one (a sleepwalker hides its
 * action), otherwise the action itself. A staggered enemy is down on the ground.
 */
export const poseForIntent = (e: Enemy): PoseName =>
  e.staggered || e.intent.forced ? downPoseOf(e) : asPose(e.intent.pose, e.intent.type);

/** The pose for what an enemy is actually doing, revealed once the turn plays. */
export const actionPose = (e: Enemy): PoseName =>
  e.staggered || e.intent.forced ? downPoseOf(e) : asPose(e.intent.actPose, e.intent.type);

/** An enemy's attack as it winds up (closing in) and as it lands. */
export const windUpPose = (e: Enemy): PoseName => asPose(e.intent.actPose, "attack");

export const strikePose = (e: Enemy): PoseName => asPose(e.intent.strikePose, "strike");

/** Where a figure's own flame is, in figure units: a flame it holds, or else a candle above its head. */
export function flameOf(pose: PoseName): readonly [number, number] {
  // The Warden's is the candle in his fist.
  const wd = WARDEN_POSES[pose as WardenPoseName];
  if (wd) return [wd.freeArm.hand[0], wd.freeArm.hand[1] - 4];
  const sk = ALL_POSES[pose] as Skeleton | undefined;
  if (sk?.prop?.kind === "flame") return sk.prop.at;
  return [sk?.head?.[0] ?? 50, (sk?.head?.[1] ?? 20) - 12];
}
