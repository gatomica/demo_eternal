/**
 * poses.ts — every pose a figure can take (the Warden's are in warden/skeleton.ts), and which one a
 * fighter shows.
 */
import { ENEMY_KINDS } from "../core/bestiary";
import type { Enemy, Side } from "../core/types";
import type { Pt } from "./geom";
import { flailOf, WARDEN_POSES, type WardenPoseName } from "../warden/skeleton";
import { checkAdjust, type BoneAdjust } from "./rig";

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
  /**
   * Bones this pose shortens for perspective, each a multiple of its true length in the rig
   * (rig.ts): the figures are re-solved to the rig, so a bone's length only changes through this.
   */
  adjust?: BoneAdjust;
  /**
   * A T-pose: both arms straight out sideways, each away from the middle of the body (toward -x for the
   * weapon arm when this is -1, +x when it's 1, only if its shoulder is level with the neck), whatever the
   * elbows and hands say. The rig lays them out, foreshortened in the 3/4 views.
   */
  armsOut?: 1 | -1;
  /** Standing straight: both legs hang straight down from the hips. */
  legsDown?: boolean;
  /**
   * The torso is turned as in the model's 3/4 view: `front` toward the player (as the model's 3/4 front), `back`
   * away from it. The shoulders, hips and ribcage follow the model (level, each on its own side, the right
   * shoulder toward the player from the front), and the arms' elbows should be authored to match.
   */
  torso34?: "front" | "back";
  /**
   * A waist: the spine bends here, so the ribcage (neck to waist) and the lower torso (waist to hip) lean
   * separately, as when the back arches. Without one the torso is a single straight bone, neck to hip.
   */
  waist?: Pt;
  /** Where it looks: how far down its eyes sit on its face (default 0, straight ahead). */
  gaze?: number;
  /** The weapon arm crosses in front of the body even from the far shoulder (drawn over the torso). */
  weaponOver?: boolean;
  /** With `weaponOver`: only the forearm crosses in front; the upper arm (shoulder to elbow) is drawn behind everything. */
  upperArmBehind?: boolean;
  /**
   * Held in both hands: the free hand holds the weapon too, just behind the weapon hand (`true`) or, supporting
   * it, at its middle (`"middle"`); rig.ts reaches it.
   */
  grip?: boolean | "middle";
  /**
   * Its back is to the camera: the ribcage is drawn as in the 3/4 back view of the model: only the short
   * moons at the edge of the side whose shoulder is the nearer one (the arm in front), where the ribs wrap
   * around.
   */
  ribsBehind?: boolean;
  /** Which of the figure's legs `leadLeg` is (default left; the crossing strike leads with the right). */
  leadSide?: Side;
  /** A strike that crosses the body: the weapon arm sweeps across in front of it and the hips twist the other way. */
  crossing?: boolean;
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
 * sw-…: the depraved sleepwalker's own: hunched, heavy-armed, never the player's trained stances.
 * w-…: the waxed, always on their knees (see the waxed poses below).
 */
export type PoseName =
  | "idle" | "attack" | "block" | "maneuver" | "rest"
  | "ready" | "intimidating" | "cautious"
  | "strike" | "fallen" | "kneel" | "punch"
  | "t-pose" | "t-pose-b" | "w-t" | "w-t-b"
  | "sw-windup" | "sw-brace" | "sw-flinch" | "sw-down" | "sw-idle" | "sw-charging" | "sw-struggling" | "sw-guarded"
  | "sw-overhead" | "sw-chop" | "sw-parry" | "sw-charge" | "sw-backstep" | "sw-despair"
  | "w-idle" | "w-hands" | "w-scratch" | "w-wax-hand" | "w-hurl"
  | "w-dead" | "w-cower" | "w-crawl" | "w-slither" | "w-cradle" | "w-clutch" | "w-fallen" | "w-flinch" | "flinch"
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

/**
 * Drawn facing right in a 100 × 120 box, feet on y = 114. The figures are 2D drawings of a 3/4 view:
 * to the front means toward the camera (lower on screen), to the back away from it (higher).
 */
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
    adjust: { freeFore: 0.76 },
    weaponArm: { elbow: [39, 38], hand: [31, 27] },
    freeArm: { elbow: [59, 45], hand: [67, 52] },
    leadLeg: { knee: [64, 88], foot: [72, 114] },
    rearLeg: { knee: [41, 89], foot: [32, 114] },
    weapon: { at: [31, 27], angle: -115 },
  },
  // Crouched behind the weapon, held upright as a guard.
  block: {
    head: [47, 33], neck: [48, 44], hip: [48, 74],
    adjust: { weaponUpper: 0.7, weaponFore: 0.75, freeFore: 0.74 },
    weaponArm: { elbow: [60, 50], hand: [63, 40] },
    freeArm: { elbow: [56, 55], hand: [61, 46] },
    leadLeg: { knee: [59, 94], foot: [63, 114] },
    rearLeg: { knee: [38, 94], foot: [34, 114] },
    weapon: { at: [63, 44], angle: -88 },
  },
  // Low to the ground, ready to move.
  maneuver: {
    head: [63, 62], neck: [57, 68], hip: [38, 79],
    adjust: { torso: 0.69, rearThigh: 0.79 },
    weaponArm: { elbow: [66, 82], hand: [74, 92] },
    freeArm: { elbow: [48, 84], hand: [45, 98] },
    leadLeg: { knee: [51, 96], foot: [59, 114] },
    rearLeg: { knee: [27, 95], foot: [16, 114] },
    weapon: { at: [74, 92], angle: 15 },
  },
  // Clasping the head, looking up. The weapon lies on the ground.
  rest: {
    head: [50, 19], neck: [50, 30], hip: [50, 66],
    adjust: { weaponUpper: 0.8 },
    weaponArm: { elbow: [64, 30], hand: [56, 17] },
    freeArm: { elbow: [36, 30], hand: [44, 17] },
    leadLeg: { knee: [54, 91], foot: [57, 114] },
    rearLeg: { knee: [46, 91], foot: [44, 114] },
    weapon: { at: [58, 112], angle: -3 },
  },
  // Flinch: a Rest broken by a blow, recoiling back, arms up before the face.
  flinch: {
    head: [42, 22], neck: [45, 33], hip: [52, 67],
    adjust: { weaponUpper: 0.74, freeUpper: 0.48 },
    weaponArm: { elbow: [57, 40], hand: [52, 25] },
    freeArm: { elbow: [36, 40], hand: [42, 26] },
    leadLeg: { knee: [59, 91], foot: [63, 114] },
    rearLeg: { knee: [47, 91], foot: [39, 114] },
    weapon: { at: [52, 25], angle: -120 },
  },
  // Ready: en garde. Knees bent, weight forward, the blade levelled at you, free arm back for balance.
  ready: {
    head: [53, 30], neck: [52, 41], hip: [47, 72],
    adjust: { weaponFore: 0.76, freeUpper: 0.67, freeFore: 0.66 },
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
    adjust: { leadShin: 0.77, rearThigh: 0.78, rearShin: 0.75 },
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
    adjust: { leadThigh: 0.52, leadShin: 0.64, rearThigh: 0.46, rearShin: 0.66, weaponUpper: 0.58, weaponFore: 0.66 },
    weaponArm: { elbow: [66, 104], hand: [68, 113] },
    freeArm: { elbow: [74, 100], hand: [82, 108] },
    leadLeg: { knee: [26, 102], foot: [14, 112] },
    rearLeg: { knee: [28, 111], foot: [12, 114] },
    weapon: { at: [86, 113], angle: 6 },
  },
  // One knee on the ground, leaning on the planted weapon, head bowed, struggling to stand.
  kneel: {
    head: [57, 45], neck: [54, 56], hip: [48, 84],
    adjust: { leadThigh: 0.73, rearShin: 0.66, weaponFore: 0.71 },
    weaponArm: { elbow: [62, 72], hand: [68, 80] },
    freeArm: { elbow: [56, 76], hand: [62, 90] },
    leadLeg: { knee: [64, 92], foot: [64, 114] },
    rearLeg: { knee: [42, 112], foot: [26, 114] },
    weapon: { at: [68, 80], angle: 84 },
  },
  // A bare-handed blow: the free fist driven forward, the weapon held back and low.
  punch: {
    head: [59, 29], neck: [56, 40], hip: [48, 70],
    adjust: { weaponFore: 0.77 },
    weaponArm: { elbow: [44, 56], hand: [40, 66] },
    freeArm: { elbow: [70, 42], hand: [84, 40] },
    leadLeg: { knee: [66, 91], foot: [76, 114] },
    rearLeg: { knee: [37, 93], foot: [24, 114] },
    weapon: { at: [40, 66], angle: 120 },
  },

  /* ---------- T-poses, for the Model viewer: the rig's proportions laid out ---------- */
  // Standing straight, arms out, the weapon held up in the right hand. `-b` is seen from behind,
  // where the right arm is on the other side of the page.
  "t-pose": {
    head: [50, 22], neck: [50, 33], hip: [50, 65],
    weaponArm: { elbow: [36, 35], hand: [22, 35] },
    freeArm: { elbow: [64, 35], hand: [78, 35] },
    leadLeg: { knee: [50, 89.5], foot: [50, 114] },
    rearLeg: { knee: [50, 89.5], foot: [50, 114] },
    weapon: { at: [22, 35], angle: -90 }, armsOut: -1, legsDown: true,
  },
  "t-pose-b": {
    head: [50, 22], neck: [50, 33], hip: [50, 65],
    weaponArm: { elbow: [64, 35], hand: [78, 35] },
    freeArm: { elbow: [36, 35], hand: [22, 35] },
    leadLeg: { knee: [50, 89.5], foot: [50, 114] },
    rearLeg: { knee: [50, 89.5], foot: [50, 114] },
    weapon: { at: [78, 35], angle: -90 }, armsOut: 1, legsDown: true,
  },
  // The waxed's: kneeling as ever, upright, arms out.
  "w-t": {
    head: [47, 45], neck: [47, 56], hip: [47, 88],
    weaponArm: { elbow: [33, 58], hand: [19, 58] },
    freeArm: { elbow: [61, 58], hand: [75, 58] },
    ...KNEELING, weapon: bare([19, 58]), armsOut: -1,
    adjust: { leadThigh: 1.04, leadShin: 0.833, rearShin: 0.833 },
  },
  "w-t-b": {
    head: [47, 45], neck: [47, 56], hip: [47, 88],
    weaponArm: { elbow: [61, 58], hand: [75, 58] },
    freeArm: { elbow: [33, 58], hand: [19, 58] },
    ...KNEELING, weapon: bare([75, 58]), armsOut: 1,
    adjust: { leadThigh: 1.04, leadShin: 0.833, rearShin: 0.833 },
  },

  /* ---------- The depraved sleepwalker: hunched and lurching, the weapon too heavy for it ---------- */
  // Slumped forward, the weapon's tip dragging along the ground.
  "sw-idle": {
    head: [54, 31], neck: [51, 42], hip: [46, 70],
    weaponArm: { elbow: [52, 58], hand: [58, 76] },
    freeArm: { elbow: [42, 57], hand: [40, 75] },
    leadLeg: { knee: [54, 92], foot: [58, 114] },
    rearLeg: { knee: [42, 92], foot: [38, 114] },
    weapon: { at: [58, 76], angle: 62 },
  },
  // Charging: head thrust out ahead of the body, the weapon arm drawn back with the elbow slightly
  // bent and the weapon pointing forward, the free hand grasping.
  "sw-charging": {
    head: [66, 36], neck: [58, 46], hip: [42, 72],
    adjust: { weaponFore: 0.59, freeUpper: 0.75 },
    weaponArm: { elbow: [39, 53.5], hand: [34, 47] },
    freeArm: { elbow: [64, 60], hand: [72, 70] },
    leadLeg: { knee: [58, 90], foot: [64, 114] },
    rearLeg: { knee: [36, 94], foot: [24, 112] },
    weapon: { at: [34, 47], angle: -15 }, ribsBehind: true,
  },
  // Struggling: hunched right over, head bowed and looking down at the ground, knees bent, swaying; one hand
  // pressed to the face, the weapon dragging from the other. The chest is turned toward the player as in the
  // model's 3/4 front: the right arm (the weapon's) on the player's side. The left hand is flat over the face,
  // its hand just hiding the bottom of the eyes, the elbow low in front. The back arches: the ribcage stays hunched forward while the lower
  // torso leans back from the waist, the hips pushed forward. The right leg steps forward (from the right
  // hip, on the player's side), so the legs don't cross.
  "sw-struggling": {
    head: [62, 47], neck: [56, 54], waist: [48.6, 70.3], hip: [52.8, 83.6],
    adjust: { leadThigh: 0.88, rearThigh: 0.88, leadShin: 0.9, rearShin: 0.9 },
    weaponArm: { elbow: [63, 69], hand: [60, 83] },
    freeArm: { elbow: [61, 66.5], hand: [65.7, 53.2] },
    leadLeg: { knee: [68, 97], foot: [62, 114] },
    rearLeg: { knee: [38, 98], foot: [30, 114] },
    weapon: { at: [60, 83], angle: 125 }, torso34: "front", leadSide: "right", gaze: 3.5,
  },
  // Despair's windup, from the start of the turn: Struggling's pose (same body, legs and gaze down), but both hands
  // clutch the sides of his head, the weapon still in the right hand, hanging down behind him.
  "sw-windup": {
    head: [62, 47], neck: [56, 54], waist: [48.6, 70.3], hip: [52.8, 83.6],
    adjust: { leadThigh: 0.88, rearThigh: 0.88, leadShin: 0.9, rearShin: 0.9 },
    weaponArm: { elbow: [74.3, 60.9], hand: [69, 48] },
    freeArm: { elbow: [40.5, 47.5], hand: [54.5, 48] },
    leadLeg: { knee: [68, 97], foot: [62, 114] },
    rearLeg: { knee: [38, 98], foot: [30, 114] },
    weapon: { at: [69, 48], angle: 100 }, torso34: "front", leadSide: "right", gaze: 3.5,
  },
  // Flinch, a Rest broken by a blow: the windup pose knocked apart. He is thrown back off balance and hunches over, the
  // head ducked down, one foot lifted off the ground and the other knee buckling, the hands torn off his head and held just
  // clear of it, the weapon swung up and back, away from the player.
  "sw-flinch": {
    head: [50, 52], neck: [47, 57], waist: [44.5, 71.5], hip: [50, 85],
    adjust: { leadThigh: 0.8, leadShin: 0.8, rearThigh: 0.85, rearShin: 0.8 },
    weaponArm: { elbow: [65.6, 63.6], hand: [62, 50] },
    freeArm: { elbow: [28, 59.8], hand: [38, 50] },
    leadLeg: { knee: [64, 98], foot: [58, 114] },
    rearLeg: { knee: [42, 97], foot: [34, 105] },
    weapon: { at: [62, 50], angle: -145 }, torso34: "front", leadSide: "right", gaze: 5,
  },
  // Staggered: kneeling on one knee, hunched right over and dejected, the head hanging and the eyes on the ground. The
  // right knee is raised, the foot flat on the ground ahead of him; the left knee is down, the shin lying back along the
  // ground, away from the camera, at the 3/4 angle. The arms hang limp, splayed out to his sides, and the weapon rests
  // on the ground from his right hand, pointing toward the player. The body is turned like the other poses (the model's 3/4 front), the right side nearer the player.
  "sw-down": {
    head: [71, 66], neck: [64, 66], hip: [50, 88],
    adjust: { torso: 0.81, leadThigh: 0.91, leadShin: 0.9, rearShin: 0.87 },
    weaponArm: { elbow: [78, 80], hand: [84, 92] },
    freeArm: { elbow: [50, 80], hand: [44, 92] },
    leadLeg: { knee: [74, 92], foot: [72, 114] },
    rearLeg: { knee: [50, 113], foot: [32, 108] },
    weapon: { at: [84, 92], angle: 40 }, torso34: "front", leadSide: "right", gaze: 5,
  },
  // Guarded: a low, wide crouch, lower than Struggling's, the chest turned toward the player as in the model's 3/4
  // front. The right arm (the weapon's) crosses in front of the body, the blade held slantwise up toward the left
  // shoulder; the left hand is raised in front of it, ready to take hold of the blade. The feet are close to the
  // middle: the right leg steps forward, the left stays back.
  "sw-guarded": {
    head: [55, 52], neck: [52, 63], hip: [48, 89],
    adjust: { torso: 0.85, leadThigh: 0.8, rearThigh: 0.8, leadShin: 0.65, rearShin: 0.65 },
    weaponArm: { elbow: [66, 80], hand: [49, 77] },
    freeArm: { elbow: [41, 76], hand: [53, 72] },
    leadLeg: { knee: [62, 100], foot: [66, 114] },
    rearLeg: { knee: [38, 101], foot: [32, 114] },
    weapon: { at: [49, 77], angle: -140 }, torso34: "front", leadSide: "right", weaponOver: true,
  },
  // Weapon Strike, winding up: the weapon hauled up over the head in both hands, elbows bent and
  // splayed, the blade laid back at a slant, leaning back, away from the player. The chest is turned toward the player (the model's
  // 3/4 front): the right arm, with the weapon, on the player's side, the left hand reaching across to the grip. He has just jumped: the left leg pushes off behind, the right
  // knee is drawn up and the foot lifted off the ground.
  "sw-overhead": {
    head: [38, 36], neck: [39, 47], hip: [44, 74],
    weaponArm: { elbow: [50, 31], hand: [36, 20] },
    freeArm: { elbow: [27, 34], hand: [40, 22] },
    leadLeg: { knee: [62, 82], foot: [52, 100] },
    rearLeg: { knee: [36, 94], foot: [28, 114] },
    weapon: { at: [36, 20], angle: -160 }, torso34: "front", grip: true, leadSide: "right",
  },
  // Weapon Strike, landing: a cross strike. The whole body dropped after the blow, the right arm
  // swept across the chest so the weapon ends low on the far side, the free arm flung up and back, away from the player.
  "sw-chop": {
    head: [64, 42], neck: [58, 52], hip: [44, 76],
    adjust: { weaponUpper: 0.72 },
    weaponArm: { elbow: [54.5, 67.5], hand: [38, 74] },
    freeArm: { elbow: [46, 39], hand: [34, 30] },
    leadLeg: { knee: [64, 96], foot: [74, 114] },
    rearLeg: { knee: [34, 96], foot: [24, 114] },
    weapon: { at: [38, 74], angle: 120 }, crossing: true, leadSide: "right",
  },
  // Parry's windup, from the start of the turn: Guarded's crouch and body, bracing for the blow. The blade is raised
  // steeper, the handle lifted a little, and the left hand comes to rest on the middle of the blade, ready.
  "sw-brace": {
    head: [55, 52], neck: [52, 63], hip: [48, 89],
    adjust: { torso: 0.85, leadThigh: 0.8, rearThigh: 0.8, leadShin: 0.65, rearShin: 0.65 },
    weaponArm: { elbow: [66, 78], hand: [50, 71] },
    freeArm: { elbow: [41, 76], hand: [44, 62] },
    leadLeg: { knee: [62, 100], foot: [66, 114] },
    rearLeg: { knee: [38, 101], foot: [32, 114] },
    weapon: { at: [50, 71], angle: -120 }, torso34: "front", leadSide: "right", weaponOver: true, grip: "middle",
  },
  // Parry: Guarded's crouch and legs, but he rocks back from the blow: the upper body leans away from the player,
  // the weapon handle raised high at the neck and the blade pointing down across to his left hip, held there in a
  // block; the left hand supports the middle of the blade.
  "sw-parry": {
    head: [44, 52], neck: [41, 63], hip: [48, 89],
    adjust: { torso: 0.85, leadThigh: 0.77, rearThigh: 0.77, leadShin: 0.62, rearShin: 0.62 },
    weaponArm: { elbow: [55, 64], hand: [43, 56] },
    freeArm: { elbow: [26, 74], hand: [41, 70] },
    leadLeg: { knee: [64, 99], foot: [66, 114] },
    rearLeg: { knee: [35, 100], foot: [32, 114] },
    weapon: { at: [43, 56], angle: 100 }, torso34: "front", leadSide: "right", weaponOver: true, upperArmBehind: true, grip: "middle",
  },
  // Charge: the Charging pose's body (same head, straight back, ribcage and free arm), but he has thrown himself off
  // the ground: both legs trail behind him, leaning away from the player, feet well off the floor. The weapon now
  // points back, away from the player, the arm nearly straight. His hips are where Charging's are, so the two blend.
  "sw-charge": {
    head: [72.6, 37.5], neck: [64.6, 47.5], hip: [42, 70.14],
    adjust: { freeUpper: 0.75, leadThigh: 0.82, leadShin: 0.79, rearThigh: 0.95, rearShin: 0.7 },
    weaponArm: { elbow: [49.57, 53.48], hand: [37.57, 53.48] },
    freeArm: { elbow: [70.57, 61.48], hand: [78.57, 71.49] },
    leadLeg: { knee: [33, 88.14], foot: [22, 104.14] },
    rearLeg: { knee: [56, 78], foot: [44, 96] },
    weapon: { at: [37.57, 53.48], angle: 165 }, ribsBehind: true,
  },
  // Backstep: Struggling's pose (same body turn, hunched look, facepalm, weapon dragging), but thrown back off his
  // feet: the body leans well back away from the player, the left leg planted, straight and leaning toward the player,
  // the right lifted off the ground with the knee bent in across it.
  "sw-backstep": {
    head: [36, 44], neck: [40, 54], waist: [48, 70], hip: [52, 84],
    adjust: { leadThigh: 0.75, leadShin: 0.7, rearThigh: 0.75, rearShin: 0.75 },
    weaponArm: { elbow: [52, 70], hand: [50, 83] },
    freeArm: { elbow: [48.4, 61.2], hand: [39.7, 50.2] },
    leadLeg: { knee: [64, 92], foot: [54, 104] },
    rearLeg: { knee: [61.5, 98.4], foot: [72, 114] },
    weapon: { at: [50, 83], angle: 125 }, torso34: "front", leadSide: "right",
  },
  // Despair: sinking down, his back arching: the lower torso leans back from the hips, the ribcage further, and the
  // neck and head thrown right back with the eyes turned up. Each hand clutches a side of his head. He still holds his
  // weapon in the right hand, which hangs down behind him, the blade pointing down. The body is turned like
  // Struggling's (the model's 3/4 front): the right side, with the weapon, on the player's side and the far one, the
  // right leg forward.
  "sw-despair": {
    head: [24, 49.5], neck: [33, 58.3], waist: [43.8, 72.7], hip: [48, 86],
    adjust: { leadThigh: 0.75, leadShin: 0.66, rearShin: 0.52 },
    weaponArm: { elbow: [45.3, 49.6], hand: [31.5, 47.5] },
    freeArm: { elbow: [14, 61.2], hand: [16.5, 47.5] },
    leadLeg: { knee: [62, 98], foot: [60, 114] },
    rearLeg: { knee: [38, 104], foot: [30, 114] },
    weapon: { at: [31.5, 47.5], angle: 100 }, torso34: "front", leadSide: "right", gaze: -3.5,
  },

  /* ---------- The waxed: kneeling, head sealed in a lump of wax ---------- */
  // Slumped on its knees, arms hanging.
  "w-idle": {
    head: [53, 45], neck: [51, 56], hip: [47, 88],
    adjust: { leadThigh: 1.041, leadShin: 0.832, rearShin: 0.832, freeUpper: 1.189 },
    weaponArm: { elbow: [55, 72], hand: [57, 86] },
    freeArm: { elbow: [45, 72], hand: [47, 86] },
    ...KNEELING, weapon: bare([57, 86]),
  },
  // Dead: folded right down onto its knees, hunched low over itself, head bowed to its knees, arms
  // wrapped round its own body, hugging itself.
  "w-dead": {
    head: [70, 101], neck: [60, 94], hip: [44, 105],
    adjust: { torso: 0.6, leadThigh: 0.6, leadShin: 0.832, rearThigh: 0.6, rearShin: 0.832, weaponUpper: 0.95, weaponFore: 0.9, freeUpper: 0.9, freeFore: 0.9 },
    weaponArm: { elbow: [68, 106], hand: [50, 98] },
    freeArm: { elbow: [57, 108], hand: [47, 100] },
    ...KNEELING, weapon: bare([50, 98]),
  },
  // Hands Raised: both hands up, fingers hooked, about to claw.
  "w-hands": {
    head: [54, 43], neck: [52, 55], hip: [47, 88],
    adjust: { torso: 1.043, leadThigh: 1.041, leadShin: 0.832, rearShin: 0.832, weaponUpper: 1.414, weaponFore: 1.04, freeUpper: 1.172, freeFore: 1.04 },
    weaponArm: { elbow: [63, 45], hand: [67, 31] },
    freeArm: { elbow: [45, 44], hand: [49, 30] },
    ...KNEELING, weapon: bare([67, 31]),
  },
  // Scratch: thrown forward from the knees, both hands raking down.
  "w-scratch": {
    head: [78, 54], neck: [69, 62], hip: [52, 88],
    adjust: { torso: 0.971, leadThigh: 0.97, leadShin: 0.832, rearThigh: 0.98, rearShin: 0.832, weaponUpper: 1.088, weaponFore: 1.163, freeUpper: 0.319, freeFore: 1.055 },
    weaponArm: { elbow: [80, 72], hand: [91, 84] },
    freeArm: { elbow: [76, 66], hand: [89, 73] },
    ...KNEELING, weapon: bare([91, 84]),
  },
  // Wax on Hand: leaning back, a lump of wax torn from itself held behind the shoulder.
  "w-wax-hand": {
    head: [45, 44], neck: [46, 55], hip: [48, 88],
    adjust: { torso: 1.033, leadThigh: 1.024, leadShin: 0.832, rearThigh: 0.987, rearShin: 0.832, weaponUpper: 0.707, weaponFore: 0.909, freeUpper: 0.759, freeFore: 0.735 },
    weaponArm: { elbow: [36, 52], hand: [27, 43] },
    freeArm: { elbow: [57, 64], hand: [66, 59] },
    ...KNEELING, weapon: bare([27, 43]), prop: { kind: "wax", at: [25, 40] },
  },
  // Hurl Wax: the throwing arm whipped forward, the other flung back.
  "w-hurl": {
    head: [63, 46], neck: [58, 56], hip: [49, 88],
    adjust: { torso: 1.039, leadShin: 0.832, rearThigh: 0.983, rearShin: 0.832, weaponUpper: 1.372, weaponFore: 0.972, freeUpper: 1.288, freeFore: 0.909 },
    weaponArm: { elbow: [70, 48], hand: [83, 44] },
    freeArm: { elbow: [46, 68], hand: [37, 77] },
    ...KNEELING, weapon: bare([83, 44]),
  },
  // Cowering Sideways: twisted away and low, arms wrapped over the head.
  "w-cower": {
    head: [36, 55], neck: [39, 65], hip: [47, 90],
    adjust: { torso: 0.82, leadThigh: 0.968, leadShin: 0.832, rearThigh: 0.913, rearShin: 0.832, weaponUpper: 1.365, freeUpper: 0.457, freeFore: 1.317 },
    weaponArm: { elbow: [50, 56], hand: [40, 46] },
    freeArm: { elbow: [47, 63], hand: [33, 51] },
    ...KNEELING, weapon: bare([40, 46]),
  },
  // Crawling: on its hands, dragging its bound legs.
  "w-crawl": {
    head: [74, 71], neck: [65, 78], hip: [43, 93],
    adjust: { torso: 0.832, leadThigh: 0.763, leadShin: 0.832, rearThigh: 0.777, rearShin: 0.873, weaponUpper: 1.152, weaponFore: 1.197, freeUpper: 1.221, freeFore: 1.178 },
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
    adjust: { torso: 0.825, leadThigh: 0.594, leadShin: 0.841, rearThigh: 0.497, rearShin: 0.841, weaponUpper: 0.714, weaponFore: 1.266, freeUpper: 1.03, freeFore: 1.093 },
    weaponArm: { elbow: [27, 95], hand: [22, 112] },
    freeArm: { elbow: [31, 97], hand: [28, 112] },
    leadLeg: { knee: [61, 103], foot: [80, 111] },
    rearLeg: { knee: [59, 105], foot: [78, 113] },
    weapon: bare([22, 112]),
  },
  // Cradle Flame: hands cupped at the chest around a small flame.
  "w-cradle": {
    head: [56, 46], neck: [53, 57], hip: [47, 88],
    adjust: { torso: 0.987, leadThigh: 1.041, leadShin: 0.832, rearShin: 0.832, weaponUpper: 1.686, weaponFore: 0.571, freeUpper: 1.527, freeFore: 0.576 },
    weaponArm: { elbow: [64, 80], hand: [64, 72] },
    freeArm: { elbow: [52, 80], hand: [56, 73] },
    ...KNEELING, weapon: bare([64, 72]), prop: { kind: "flame", at: [60, 70] },
  },
  // Clutch Flame: folded over it, head bowed, hugging the flame to its belly.
  "w-clutch": {
    head: [64, 60], neck: [58, 68], hip: [46, 90],
    adjust: { torso: 0.783, leadThigh: 0.987, leadShin: 0.832, rearThigh: 0.921, rearShin: 0.832, weaponUpper: 1.466, weaponFore: 0.452, freeUpper: 1.445, freeFore: 0.385 },
    weaponArm: { elbow: [70, 86], hand: [64, 84] },
    freeArm: { elbow: [58, 90], hand: [60, 85] },
    ...KNEELING, weapon: bare([64, 84]), prop: { kind: "flame", at: [62, 84] },
  },
  // A Rest broken by a blow: jerked upright and back, arms thrown up.
  "w-flinch": {
    head: [38, 50], neck: [42, 60], hip: [48, 89],
    adjust: { torso: 0.925, leadThigh: 0.986, leadShin: 0.832, rearThigh: 0.947, rearShin: 0.832, weaponFore: 0.895, freeUpper: 0.505, freeFore: 0.872 },
    weaponArm: { elbow: [53, 62], hand: [47, 51] },
    freeArm: { elbow: [40, 67], hand: [33, 57] },
    ...KNEELING, weapon: bare([47, 51]),
  },
  // Staggered: toppled forward onto its sealed head, arms limp.
  "w-fallen": {
    head: [76, 106], neck: [66, 103], hip: [45, 98],
    adjust: { torso: 0.675, leadThigh: 0.75, leadShin: 0.832, rearThigh: 0.622, rearShin: 0.832, weaponUpper: 0.416, weaponFore: 0.718, freeUpper: 1.088, freeFore: 0.544 },
    weaponArm: { elbow: [66, 112], hand: [76, 113] },
    freeArm: { elbow: [55, 111], hand: [62, 114] },
    ...KNEELING, weapon: bare([76, 113]),
  },
};

checkAdjust(POSES);

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

/** A strike that spins on into its next stance (Flail Swing): the pose it hands off to, its trails still fading. */
export const handOffOf = (strike?: string): PoseName | undefined => WARDEN_POSES[strike as WardenPoseName]?.trailEndsAt;

/**
 * Where a blow struck in this pose meets the floor, in figure units (its shockwave starts there):
 * the fist, or a flail's head brought down on the floor. Unset for poses that don't say.
 */
export function impactPoint(strike?: string): Pt | undefined {
  const landing = WARDEN_POSES[strike as WardenPoseName];
  if (!landing) return undefined;
  return landing.slamTrail ? flailOf(landing).ball : landing.freeArm.hand;
}

// Every pose a kind names must be one we can draw, checked when the game loads (like its pattern).
for (const [id, kind] of Object.entries(ENEMY_KINDS)) {
  const named = [
    ...Object.values(kind.stancePoses), kind.idlePose, kind.downPose, kind.flinchPose, kind.modelPoses?.front, kind.modelPoses?.back,
    ...Object.values(kind.actionPoses ?? {}).flatMap(p => [p.act, p.strike, p.rest, p.windup, p.guard]),
  ];
  for (const name of named) if (name && !(name in ALL_POSES)) throw new Error(`${kind.name} (${id}): no pose named "${name}"`);
}

/** Where a figure's own flame is, in figure units: a flame it holds, or else a candle above its head. */
export function flameOf(pose: PoseName): readonly [number, number] {
  // The Warden's is the candle in his fist.
  const wd = WARDEN_POSES[pose as WardenPoseName];
  if (wd) return [wd.freeArm.hand[0], wd.freeArm.hand[1] - 4];
  const sk = ALL_POSES[pose] as Skeleton | undefined;
  if (sk?.prop?.kind === "flame") return sk.prop.at;
  return [sk?.head?.[0] ?? 50, (sk?.head?.[1] ?? 20) - 12];
}
