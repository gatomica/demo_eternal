/**
 * poses.ts — every pose a figure can take (the Warden's are in warden/skeleton.ts), and which one a
 * fighter shows.
 */
import { ENEMY_KINDS } from "../core/bestiary";
import type { Enemy, Side } from "../core/types";
import type { Pt } from "./geom";
import { GUIDE_POSES, type GuidePoseName } from "../guide/poses";
import { flailOf, WARDEN_POSES, type WardenPoseName } from "../warden/skeleton";
import { checkAdjust, type BoneAdjust } from "./rig";
import { PLAYER_POSES_BUILT } from "./playerPoses";

/** Where an arm puts its hand in the 3D rig: see `arms3`. */
export type ArmPlan =
  | { plant: { out: number; reach?: number; bend?: readonly [number, number, number]; shift?: number } }
  | { to: readonly [number, number, number]; bend?: readonly [number, number, number] }
  /** The two bones' directions, as they end up on the figure (sideways, up, ahead; any length): the upper arm from the shoulder, then the forearm from the elbow. */
  | { dirs: readonly [readonly [number, number, number], readonly [number, number, number]] }
  /** The whole arm, shoulder to hand, points `dir` as it ends up on the figure (any length), `reach` of its length (default 1: straight; under: bent), the elbow bending toward `bend`: a direction, or "shoulders" (along the shoulder line, outward from the arm's own shoulder: the arm bends in the plane that holds the shoulder line) or "-shoulders" (inward). */
  | { aim: { dir: readonly [number, number, number]; reach?: number; bend?: readonly [number, number, number] | "shoulders" | "-shoulders" } };

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
  /**
   * A strike's swing trail: how many degrees it sweeps round the neck (clockwise on the page when positive), ending at the weapon's tip.
   * Default 140 (the overhead swing).
   */
  sweep?: number;
  /** A level swing: the trail is a flat crescent at the weapon's height, this much of a full circle's height (0 to 1). */
  flat?: number;
  /**
   * The 3D rig only (rig3d.ts), for the waxed: the legs mirror each other, both knees at the average of the pose's two and both
   * feet at the average of its two feet, the knees this far to each side of the middle and the feet this far (figure units).
   * Without it the shins are bound close together all the way.
   * `sit`: sitting back on the heels: the pelvis lowered to this height (figure units) and, with it, the whole upper body; the knees and
   * the bound shins lie on the floor (knees in front and apart, the shins running back to the feet), the thighs resting on top of them.
   * `ahead` instead: the knees this far ahead of the pelvis (figure units; negative: behind it), which sets how high the pelvis is (a thigh's
   * length from the knees on the floor), the shins running back from the knees along the floor.
   * `swing`: the legs lean sideways (positive: to the figure's own right): the feet swing out this many figure units, and the pelvis, with
   * the whole body above it, and the knees a quarter of that, so the bound legs trail back on a diagonal.
   */
  legs3?: { knees: number; feet: number; sit?: number; ahead?: number; swing?: number };
  /**
   * The 3D rig only: the upper body leans sideways (positive: to the figure's own right). The spine curves over from the pelvis, the waist
   * `shift` figure units over to the right at a quarter of the way, the neck all of it, the head a little more, and the shoulders roll
   * (the right one `tilt` lower, the left one `tilt` higher): weight on the right hand.
   */
  lean3?: { shift: number; tilt: number };
  /**
   * The 3D rig only, for the waxed: where each hand goes (the figure's own right and left), reached by its arm (the arm's `adjust` lengths).
   * `plant`: resting on the floor, `out` figure units to the outside of its shoulder, `reach` of the arm's full length from the shoulder
   * (default 1: straight; under that: bent, the more the lower), so the height of the shoulders decides how far in front of them it lands;
   * the elbow bends toward `bend` (default: back and a little out); `shift` moves the hand that many figure units forward (negative: back).
   * `to`: a spot [sideways, height off the floor, ahead of the pelvis], in figure units; the elbow bends toward `bend` (default: back and out).
   */
  arms3?: { right: ArmPlan; left: ArmPlan };
  /**
   * The 3D rig only: everything above the pelvis pitched up this many degrees about the pelvis, as one block (the back straightens, the
   * head and shoulders swing up and back): the angles between the lower spine, ribcage, neck and head do not change. Done before the arms
   * reach their spots, so the hands stay where `arms3` puts them and the arms re-solve.
   */
  pitch3?: number;
  /**
   * The 3D rig only: the face looks straight at what the weapon hand holds (`"prop"`, the flame): the head bows toward it (a share of the
   * way, as far as the neck lets it) and the face points at it. Or, given outright, where the head is and the way the face points (sideways, up, ahead; figure units; the gaze any length), for a pose
   * whose arms move the held thing away from where it was (the rest after Clutch Flame keeps the clutch pose's face).
   */
  look3?: "prop" | { head: readonly [number, number, number]; gaze: readonly [number, number, number] };
  /** The 3D rig only: the held thing is not drawn (it is gone: the flame was eaten); it still says where the face looks. */
  hideProp3?: boolean;
  /**
   * The 3D rig only: which of the figure's hands the pose's `weaponArm` is (default: the kind's weapon hand, the right). The flat pose's
   * arms are mirrored to the other sides: the arm drawn as the weapon arm goes to the left if this is "left". What is held in the weapon
   * hand (a lump of wax) goes with it, and so does the weapon of an armed Waxed, which is held in the other hand.
   */
  hand3?: Side;
  /**
   * The 3D rig only: the head tipped back from the neck this many degrees (negative: forward), in the plane the figure faces along, away
   * from what it faces; its distance from the neck does not change.
   */
  head3?: number;
  /**
   * The 3D rig only: a whole arm (elbow and hand, from its shoulder, which does not move) tipped back this many degrees (negative: forward), in
   * the plane the figure faces along, so a raised arm comes down as it swings back; its bones keep their lengths. Done before `forearm3`.
   */
  arm3?: { right?: number; left?: number };
  /**
   * The 3D rig only: a whole arm swung sideways about the vertical through its shoulder, degrees, positive toward the figure's right: an arm
   * that points forward goes out to its right, one that points back goes out to its left (so the same positive angle opens both arms away
   * from the body when one points forward and the other back). Done with `arm3`; the bones keep their lengths.
   */
  spread3?: { right?: number; left?: number };
  /**
   * The 3D rig only: a forearm (from its elbow, so the elbow does not move) tipped back this many degrees (negative: forward), the same way
   * as `head3`. Done after the ribcage is turned, so the elbow's and hand's places already include that.
   */
  forearm3?: { right?: number; left?: number };
  /**
   * The 3D rig only: the ribcage turned about its own axis (the line from the waist to the neck), degrees, right-handed about the way
   * that axis points from the waist to the neck: with an upright back, positive turns the chest to the figure's right (its right shoulder
   * goes back and its left one forward), negative to its left. The shoulders (and so the ribcage, whose width follows them) and the arms on
   * them turn rigidly together, so each arm keeps its place in the shoulders' own frame (its position and direction relative to the shoulder
   * line); the head and the spine do not move.
   */
  spin3?: number;
  /**
   * The 3D rig only: the shoulders and ribcage twisted about the spine, this many degrees, the figure's right shoulder going down and its
   * left one up (negative: the other way). The arms re-solve to their hands; the head and the spine itself do not move.
   */
  roll3?: number;
  /**
   * The 3D rig only: everything above the pelvis turned (yawed) as one block, this many degrees to the figure's own right (negative: left),
   * about the vertical through the pelvis. Everything below the pelvis stays put; nothing above it changes relative to anything else above
   * it (the arms and their hands turn with the body); only the angle between the pelvis and the spine does.
   */
  turn3?: number;
  /**
   * The 3D rig only: both shoulders rounded forward this many figure units (and a third of that down), the arms with them unless the pose reaches
   * them to their spots (`arms3`), which then hang from the shoulders where they are: a slouch.
   */
  hunch3?: number;
  /**
   * The 3D rig only, free legs (`freeLegs`): each leg swung out to its own side this many degrees about its hip (round the way it faces), the
   * feet set wider apart: a splayed stance. The body is lowered so the feet stay on the floor.
   */
  splay3?: number;
  /** The 3D rig only: the shoulders turned, the figure's right one this many figure units back and the left one as far forward (negative: the other way). */
  twist3?: number;
  /**
   * The 3D rig only, for the sleepwalkers: the way the weapon points, in body space as it ends up (sideways, up, ahead; any length). Without it
   * the weapon points at the flat pose's angle, in the side plane, turned with the body (`turn3`).
   */
  weapon3?: readonly [number, number, number];
  /** The 3D rig only: this pose drawn in 3D with these fields changed (the flat drawing, on the map, keeps the pose as written). */
  for3d?: Partial<Omit<Skeleton, "for3d">>;
  /**
   * The player's body as it is really turned (see body.ts): the shoulders and the pelvis each turned this many degrees (positive: to the right,
   * so the left side leads). With it the player's right side is the near one, and the shoulders and hips are placed from these angles.
   */
  yaw?: { shoulders: number; hips: number };
  /** The player standing facing the camera (the inventory, the class screen): shoulders and hips turned that way too. */
  faceCamera?: boolean;
  /** With `yaw`: the weapon's forearm and blade pass behind the torso (a weapon held across the chest). */
  foreBehind?: boolean;
  /** With `yaw`: which side of the torso an arm is drawn on, whatever the turn says (a weapon held out in front of the player is behind the torso, seen from behind). */
  weaponLayer?: "behind" | "front"; freeLayer?: "behind" | "front";
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
  | "low" | "low-left" | "low-right" | "dodge-fwd" | "dodge-back" | "rest-in"
  | "swing-right-up" | "swing-right" | "swing-left-up" | "swing-left" | "stand"
  | "ready" | "intimidating" | "cautious"
  | "strike" | "fallen" | "kneel" | "punch"
  | "t-pose" | "t-pose-b" | "w-t" | "w-t-b"
  | "sw-windup" | "sw-brace" | "sw-flinch" | "sw-down" | "sw-idle" | "sw-charging" | "sw-struggling" | "sw-shoulder-in"
  | "sw-overhead" | "sw-overhead-leap" | "sw-dead" | "p3-idle" | "p3-low" | "sw-chop" | "sw-overhead-strike" | "sw-swing-l-windup" | "sw-swing-l" | "sw-swing-r-windup" | "sw-swing-r" | "sw-parry" | "sw-charge" | "sw-backstep" | "p3-backstep" | "sw-despair"
  | "w-idle" | "w-hands" | "w-scratch" | "w-wax-hand" | "w-hurl"
  | "w-staggered" | "w-dead" | "w-cower" | "w-reared" | "w-hurl-windup" | "w-clutch-eat" | "w-brace" | "w-brace-block" | "w-overhead-windup" | "w-overhead-strike" | "w-crawl" | "w-low-windup" | "w-low-strike" | "w-drag" | "w-slither" | "w-cradle" | "w-clutch" | "w-fallen" | "w-flinch" | "flinch"
  | WardenPoseName
  | GuidePoseName;

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

/** Hands Raised: both hands up, fingers hooked, about to claw (the drawing the Reared Back stance and the Overhead Attack start from). */
const HANDS_2D: Skeleton = {
  head: [54, 43], neck: [52, 55], hip: [47, 88],
  adjust: { torso: 1.043, leadThigh: 1.041, leadShin: 0.832, rearShin: 0.832, weaponUpper: 1.414, weaponFore: 1.04, freeUpper: 1.172, freeFore: 1.04 },
  weaponArm: { elbow: [63, 45], hand: [67, 31] },
  freeArm: { elbow: [45, 44], hand: [49, 30] },
  ...KNEELING, weapon: bare([67, 31]),
};

/** Scratch: thrown forward from the knees, both hands raking down (the flat drawing; the Overhead Attack's strike starts from its body). */
const SCRATCH_2D: Skeleton = {
  head: [78, 54], neck: [69, 62], hip: [52, 88],
  adjust: { torso: 0.971, leadThigh: 0.97, leadShin: 0.832, rearThigh: 0.98, rearShin: 0.832, weaponUpper: 1.088, weaponFore: 1.163, freeUpper: 0.319, freeFore: 1.055 },
  weaponArm: { elbow: [80, 72], hand: [91, 84] },
  freeArm: { elbow: [76, 66], hand: [89, 73] },
  ...KNEELING, weapon: bare([91, 84]),
};

/** Wax on Hand: leaning back, a lump of wax torn from itself held behind the shoulder (the flat drawing; the Hurl Wax's wind-up starts from it too). */
const WAX_HAND_2D: Skeleton = {
  head: [45, 44], neck: [46, 55], hip: [48, 88],
  adjust: { torso: 1.033, leadThigh: 1.024, leadShin: 0.832, rearThigh: 0.987, rearShin: 0.832, weaponUpper: 0.707, weaponFore: 0.909, freeUpper: 0.759, freeFore: 0.735 },
  weaponArm: { elbow: [36, 52], hand: [27, 43] },
  freeArm: { elbow: [57, 64], hand: [66, 59] },
  ...KNEELING, weapon: bare([27, 43]), prop: { kind: "wax", at: [25, 40] },
};

/**
 * Wax on Hand in 3D: it is the left hand that tears the wax off and holds it; the arms are their full length, not the flat drawing's shortened
 * ones; the torso is turned 20° to its left, the right shoulder toward the player and the left one away; and both arms are swung 35° out to the
 * sides, so his head does not cover them from other angles.
 */
const WAX_HAND_3D: NonNullable<Skeleton["for3d"]> = {
  hand3: "left", spin3: -20, spread3: { right: 35, left: 35 },
  adjust: { torso: 1.033, leadThigh: 1.024, leadShin: 0.832, rearThigh: 0.987, rearShin: 0.832, weaponUpper: 1.2, weaponFore: 1.2, freeUpper: 1.2, freeFore: 1.2 },
};

/** Clutch Flame: folded over it, head bowed, hugging the flame to its belly (the flat drawing; the rest after it starts from its body too). */
const CLUTCH_2D: Skeleton = {
  head: [64, 60], neck: [58, 68], hip: [46, 90],
  adjust: { torso: 0.783, leadThigh: 0.987, leadShin: 0.832, rearThigh: 0.921, rearShin: 0.832, weaponUpper: 1.466, weaponFore: 0.452, freeUpper: 1.445, freeFore: 0.385 },
  weaponArm: { elbow: [70, 86], hand: [64, 84] },
  freeArm: { elbow: [58, 90], hand: [60, 85] },
  ...KNEELING, weapon: bare([64, 84]), prop: { kind: "flame", at: [62, 84] },
};

/** Reared Back in 3D (the stance, and the base of the Overhead Attack's wind-up): see the pose `w-reared`. */
const REARED_3D: NonNullable<Skeleton["for3d"]> = {
  legs3: { knees: 7, feet: 0.8, sit: 23 }, pitch3: 8, spin3: -35, head3: 15, arm3: { left: 45 }, forearm3: { right: 49, left: -35 },
  waist: [49.2, 73.6], neck: [47.1, 54.9], head: [49.1, 43.1],
  weaponArm: { elbow: [58.1, 45.1], hand: [62.1, 31.1] },
  freeArm: { elbow: [40.1, 44.1], hand: [44.1, 30.1] },
  weapon: bare([62.1, 31.1]),
};

/** Crawling's flat drawing (also the map's), the base of the Low Attack's poses as well. */
const CRAWL_2D: Omit<Skeleton, "for3d"> = {
  head: [74, 71], neck: [65, 78], hip: [43, 93],
  adjust: { torso: 0.832, leadThigh: 0.763, leadShin: 0.832, rearThigh: 0.777, rearShin: 0.873, weaponUpper: 1.152, weaponFore: 1.197, freeUpper: 1.221, freeFore: 1.178 },
  weaponArm: { elbow: [70, 96], hand: [75, 112] },
  freeArm: { elbow: [62, 96], hand: [66, 112] },
  leadLeg: { knee: [48, 111], foot: [28, 107] },
  rearLeg: { knee: [42, 112], foot: [21, 108] },
  weapon: bare([75, 112]),
};

/**
 * Crawling in 3D: the back nearly straight (a slight rise at the waist), the ribcage level, the head lifted a little, the elbows bent,
 * the hands on the floor beside the shoulders (the left a little ahead of the right, the shoulders turned with them). The right arm is
 * nearly straight, out to the side and behind the shoulder, the hand on the floor.
 */
const CRAWL_3D: NonNullable<Skeleton["for3d"]> = {
  head: [79.3, 78.5], neck: [72.8, 85], waist: [54.8, 85.5],
  adjust: { leadThigh: 0.763, leadShin: 0.832, rearThigh: 0.777, rearShin: 0.873, weaponUpper: 1.2, weaponFore: 1.2, freeUpper: 1.2, freeFore: 1.2 },
  twist3: 1.5,
  arms3: {
    right: { to: [20, 2.5, 12.8], bend: [0.9, 0.35, -0.4] },
    left: { plant: { out: 1.5, reach: 0.8, bend: [0.9, 0.35, -0.4], shift: -3.6 } },
  },
};

/**
 * The Low Attack in 3D, before it is turned (the wind-up turns it to the right, the strike to the left): the crawl, the left hand on the floor
 * as in the crawl, the elbow out toward the watchers, the right arm fully extended back and up, the hand above the shoulders.
 */
const LOW_ATTACK_3D: NonNullable<Skeleton["for3d"]> = {
  ...CRAWL_3D,
  arms3: {
    right: { to: [17.7, 40.9, -0.1], bend: [0.9, 0.35, -0.4] },
    // (In a scene, what watches is on the figure's left and a little ahead of it: the elbow points out to the left and forward, at it.)
    left: { to: [7.5, 2.5, 37.4], bend: [0.86, 0.1, 0.51] },
  },
};

/**
 * Drawn facing right in a 100 × 120 box, feet on y = 114. The figures are 2D drawings of a 3/4 view:
 * to the front means toward the camera (lower on screen), to the back away from it (higher).
 */
const POSES: Record<Exclude<PoseName, WardenPoseName | GuidePoseName>, Skeleton> = {
  // The player standing easy, at 3/4 to the camera (turned toward the screen's right, the way the inventory's slots and the class screen's preview are): for
  // the inventory and the class screen. Arms and legs straight and relaxed, the weapon hanging; the right (near) side toward the camera, the left a little behind.
  stand: {
    head: [52, 21], neck: [50.5, 32.5], hip: [50, 65],
    // Plumb: the shins and the forearms hang straight down, the knees and elbows bent outward, away from the body (the legs only a little apart).
    weaponArm: { elbow: [41.9, 49], hand: [41.9, 63] },
    freeArm: { elbow: [58.5, 49], hand: [58.5, 63] },
    leadLeg: { knee: [54.2, 89.5], foot: [54.2, 114] },
    rearLeg: { knee: [45.6, 89.5], foot: [45.6, 114] },
    weapon: { at: [41.9, 63], angle: 84 }, faceCamera: true,
  },
  // The player's own, built from how the body is turned (see playerPoses.ts).
  ...PLAYER_POSES_BUILT,
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
    // The body turned with its front toward the enemies (the shoulders and the pelvis a little round to the right), like the player's other poses.
    yaw: { shoulders: 10, hips: 5 },
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
    // In 3D, slouched right over: the lower back leaning forward a little, the upper back rounded far over it, the neck thrust out ahead with the
    // head held up on it, the shoulders rounded forward and both arms hanging limp from them, a little out to the sides.
    for3d: {
      waist: [51, 57], neck: [62, 45], head: [71, 39], hunch3: 3,
      // (the upper arms hanging out a little to the sides, the forearms almost straight down from the elbows)
      arms3: { right: { dirs: [[0.38, -0.92, 0.1], [0.06, -1, 0.08]] }, left: { dirs: [[-0.38, -0.92, 0.1], [-0.06, -1, 0.08]] } },
    },
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
    // In 3D the chest is turned to its right, the weapon arm trailing straight out behind it and the weapon pointing back, as in the Chase
    // (`sw-charge`'s arm, moved to this pose's shoulder).
    for3d: {
      turn3: 35, adjust: { freeUpper: 0.75 },
      weaponArm: { elbow: [43, 52], hand: [31, 52] }, weapon: { at: [31, 52], angle: 165 },
      // (the weapon arm straight, from the shoulder to where the hand trailed; the free arm as the flat pose lifts it)
      arms3: { right: { dirs: [[-0.563, -0.137, -0.804], [-0.563, -0.137, -0.804]] }, left: { dirs: [[0.26, -0.892, 0.371], [0.358, -0.781, 0.512]] } },
    },
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
  // Shoulder In (the old Guarded): a low, wide crouch, lower than Struggling's, the chest turned toward the player as in the model's 3/4
  // front. The right arm (the weapon's) crosses in front of the body, the blade held slantwise up toward the left
  // shoulder; the left hand is raised in front of it, ready to take hold of the blade. The feet are close to the
  // middle: the right leg steps forward, the left stays back.
  "sw-shoulder-in": {
    head: [55, 52], neck: [52, 63], hip: [48, 89],
    adjust: { torso: 0.85, leadThigh: 0.8, rearThigh: 0.8, leadShin: 0.65, rearShin: 0.65 },
    weaponArm: { elbow: [66, 80], hand: [49, 77] },
    freeArm: { elbow: [41, 76], hand: [53, 72] },
    leadLeg: { knee: [62, 100], foot: [66, 114] },
    rearLeg: { knee: [38, 101], foot: [32, 114] },
    weapon: { at: [49, 77], angle: -140 }, torso34: "front", leadSide: "right", weaponOver: true,
    // In 3D, as its name says: turned to its left, its right shoulder presented to the player; the right arm crossed in front of the body, held out
    // to his left, still bent at the elbow (the elbow ahead), the left pulled back behind the body.
    for3d: {
      turn3: -40,
      arms3: { right: { aim: { dir: [-0.7, -0.4, 0.6], reach: 0.8, bend: [0.3, 0, 1] } }, left: { aim: { dir: [-0.3, -0.55, -0.8], reach: 0.85 } } },
      // (the weapon pointing out to his left, angled down and a little back, ready for the Swing Right)
      weapon3: [-0.8, -0.45, -0.3],
    },
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
    // In 3D, as the Arms Overhead stance, he stands on both feet: the right foot set down ahead, the left behind.
    for3d: { hip: [44, 76], leadLeg: { knee: [54, 95], foot: [57, 114] }, rearLeg: { knee: [38, 95], foot: [33, 114] } },
  },
  // The player's Idle in 3D (the rest of the player's 3D poses are the Sleepwalker's: `player3dPose` below): standing upright, at ease, the
  // shoulders square and the back straight, the head up looking ahead, the arms hanging by its sides, the weapon held low ahead of it.
  "p3-idle": {
    head: [52, 30], neck: [50, 41], hip: [49, 69],
    weaponArm: { elbow: [51, 56], hand: [53, 70] },
    freeArm: { elbow: [47, 56], hand: [46, 70] },
    leadLeg: { knee: [52, 92], foot: [53, 114] },
    // (the right leg straight: its knee on the line from the hip to the foot, not bent back behind it)
    rearLeg: { knee: [47.5, 92], foot: [46, 114] },
    weapon: { at: [53, 70], angle: 60 },
    for3d: {
      arms3: { right: { dirs: [[0.16, -0.99, 0.02], [0.08, -0.93, 0.36]] }, left: { dirs: [[-0.16, -0.99, 0], [-0.08, -0.99, 0.1]] } },
      weapon3: [0.08, -0.55, 0.83],
    },
  },
  // The player's Lowered stance in 3D: centred, square to what it faces, neither leg leading (the feet set apart either side), the knees bent into a
  // crouch, the back straight over them; the arms lowered at its sides, the weapon pointing down ahead.
  "p3-low": {
    head: [52, 54], neck: [50, 65], hip: [48, 91],
    adjust: { torso: 0.85 },
    weaponArm: { elbow: [56, 74], hand: [62, 68] },
    freeArm: { elbow: [44, 76], hand: [52, 70] },
    // (in 3D both legs the same, the knees bent forward over the feet, which stand level with each other either side)
    leadLeg: { knee: [57, 101], foot: [49, 114] },
    rearLeg: { knee: [57, 101], foot: [49, 114] },
    weapon: { at: [62, 68], angle: -45 },
    for3d: {
      splay3: 12,
      // (the arms lowered, hanging at its sides, the forearms a little forward; the weapon pointing down ahead)
      arms3: { right: { dirs: [[0.22, -0.97, 0.08], [0.1, -0.93, 0.35]] }, left: { dirs: [[-0.22, -0.97, 0.08], [-0.1, -0.95, 0.3]] } },
      weapon3: [0.08, -0.5, 0.86],
    },
  },
  // Dead (3D only; the flat remains are `Remains.tsx`): the body laid out straight as if standing, everything in the one plane, which the 3D figure
  // tips onto its back on the floor (`fallen` in Sleepwalker3D.tsx). So here "ahead" (x) is the height off the floor once it lies, and "up" (y)
  // runs along the floor from its feet to its head. The head rolled a little to its right; the right arm flung out from the side, the left up past
  // the head; the left knee raised a little, the right leg flat.
  "sw-dead": {
    head: [54, 31], neck: [50, 42], hip: [50, 70],
    weaponArm: { elbow: [50, 56], hand: [50, 70] },
    freeArm: { elbow: [50, 56], hand: [50, 70] },
    leadLeg: { knee: [55, 92], foot: [47, 114] },
    rearLeg: { knee: [47, 92], foot: [46, 114] },
    weapon: { at: [50, 70], angle: 90 },
    for3d: { arms3: { right: { dirs: [[0.8, -0.55, -0.12], [0.5, -0.85, -0.12]] }, left: { dirs: [[-0.6, 0.78, -0.12], [-0.3, 0.95, -0.12]] } } },
  },
  // Overhead Strike, winding up: Arms Overhead's, but leaping: in 3D he rears further back (the upper body pitched back) and both feet are off
  // the ground, the right knee drawn up, the left leg trailing below. It comes down into the strike (`sw-overhead-strike`).
  "sw-overhead-leap": {
    head: [38, 36], neck: [39, 47], hip: [44, 74],
    weaponArm: { elbow: [50, 31], hand: [36, 20] },
    freeArm: { elbow: [27, 34], hand: [40, 22] },
    leadLeg: { knee: [62, 82], foot: [52, 100] },
    rearLeg: { knee: [36, 94], foot: [28, 114] },
    weapon: { at: [36, 20], angle: -160 }, torso34: "front", grip: true, leadSide: "right",
    for3d: { pitch3: 18, hip: [44, 66], leadLeg: { knee: [62, 72], foot: [54, 90] }, rearLeg: { knee: [38, 84], foot: [28, 101] } },
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
  // Overhead Strike, landing: from Arms Overhead (`sw-overhead`) the weapon brought straight down in both hands ahead of him, the body dropped after
  // it. (Flat, it is the cross strike's body with the weapon arm down in front; in 3D both hands are on the weapon, pointing down and ahead.)
  "sw-overhead-strike": {
    head: [64, 42], neck: [58, 52], hip: [44, 76],
    weaponArm: { elbow: [62, 60], hand: [72, 68] },
    freeArm: { elbow: [56, 62], hand: [68, 70] },
    leadLeg: { knee: [64, 96], foot: [74, 114] },
    rearLeg: { knee: [34, 96], foot: [24, 114] },
    weapon: { at: [72, 68], angle: 60 }, leadSide: "right", grip: true,
    // (in 3D the arms brought down low, the weapon pointing down ahead, a little higher than the arms point: about 45 degrees down to their 57)
    for3d: { arms3: { right: { aim: { dir: [0.15, -1, 0.65] } }, left: { aim: { dir: [0, -1, 0.65], reach: 0.9 } } }, weapon3: [0.07, -0.7, 0.7] },
  },
  // Each swing runs between the two turned stances, its wind-up and its landing close to them: Swing Left from Charging (turned to its right) into
  // Shoulder In (turned to its left), Swing Right the other way. Their bodies, legs and free arms are those stances'; only the weapon arm and the turn
  // go further. (Flat, they are those stances' drawings.)
  // Swing Left, winding up: Charging, turned a little further, the straight weapon arm drawn back behind him, the weapon pointing back, a little up.
  "sw-swing-l-windup": {
    head: [66, 36], neck: [58, 46], hip: [42, 72],
    adjust: { weaponFore: 0.59, freeUpper: 0.75 },
    weaponArm: { elbow: [39, 53.5], hand: [34, 47] },
    freeArm: { elbow: [64, 60], hand: [72, 70] },
    leadLeg: { knee: [58, 90], foot: [64, 114] },
    rearLeg: { knee: [36, 94], foot: [24, 112] },
    weapon: { at: [34, 47], angle: 165 }, ribsBehind: true,
    for3d: {
      turn3: 45, adjust: { freeUpper: 0.75 },
      arms3: { right: { dirs: [[-0.25, 0, -0.97], [-0.25, 0, -0.97]] }, left: { dirs: [[0.26, -0.892, 0.371], [0.358, -0.781, 0.512]] } }, weapon3: [-0.1, 0.05, -1],
    },
  },
  // Swing Left, landing: swept round to his left into Shoulder In's crouch, turned a little further: the right arm across his body out to his left,
  // reaching further than in the stance, the weapon out to his left and down, a little ahead of where the stance holds it; the left arm pulled back.
  "sw-swing-l": {
    head: [55, 52], neck: [52, 63], hip: [48, 89],
    adjust: { torso: 0.85, leadThigh: 0.8, rearThigh: 0.8, leadShin: 0.65, rearShin: 0.65 },
    weaponArm: { elbow: [66, 80], hand: [49, 77] },
    freeArm: { elbow: [41, 76], hand: [53, 72] },
    leadLeg: { knee: [62, 100], foot: [66, 114] },
    rearLeg: { knee: [38, 101], foot: [32, 114] },
    weapon: { at: [49, 77], angle: -140 }, torso34: "front", leadSide: "right", weaponOver: true,
    for3d: {
      turn3: -50,
      arms3: { right: { aim: { dir: [-0.85, -0.35, 0.45], reach: 0.9, bend: [0.3, 0, 1] } }, left: { aim: { dir: [-0.3, -0.55, -0.8], reach: 0.85 } } }, weapon3: [-0.85, -0.4, 0.05],
    },
  },
  // Swing Right, winding up: Shoulder In, coiled a little further: the arm across the body to his left, the weapon drawn further back on his left,
  // nearly level, for a backhand to his right.
  "sw-swing-r-windup": {
    head: [55, 52], neck: [52, 63], hip: [48, 89],
    adjust: { torso: 0.85, leadThigh: 0.8, rearThigh: 0.8, leadShin: 0.65, rearShin: 0.65 },
    weaponArm: { elbow: [66, 80], hand: [49, 77] },
    freeArm: { elbow: [41, 76], hand: [53, 72] },
    leadLeg: { knee: [62, 100], foot: [66, 114] },
    rearLeg: { knee: [38, 101], foot: [32, 114] },
    weapon: { at: [49, 77], angle: -140 }, torso34: "front", leadSide: "right", weaponOver: true,
    for3d: {
      turn3: -50,
      arms3: { right: { aim: { dir: [-0.7, -0.3, 0.5], reach: 0.75, bend: [0.3, 0, 1] } }, left: { aim: { dir: [-0.3, -0.55, -0.8], reach: 0.85 } } }, weapon3: [-0.75, -0.25, -0.6],
    },
  },
  // Swing Right, landing: the backhand swept round to his right into Charging's body, turned to its right: the straight weapon arm swept round past his
  // right to straight back behind him, the weapon with it, nearly trailing as Charging holds it.
  "sw-swing-r": {
    head: [66, 36], neck: [58, 46], hip: [42, 72],
    adjust: { weaponFore: 0.59, freeUpper: 0.75 },
    weaponArm: { elbow: [39, 53.5], hand: [34, 47] },
    freeArm: { elbow: [64, 60], hand: [72, 70] },
    leadLeg: { knee: [58, 90], foot: [64, 114] },
    rearLeg: { knee: [36, 94], foot: [24, 112] },
    weapon: { at: [34, 47], angle: 165 }, ribsBehind: true,
    for3d: {
      turn3: 40, adjust: { freeUpper: 0.75 },
      arms3: { right: { dirs: [[0.1, -0.14, -0.985], [0.1, -0.14, -0.985]] }, left: { dirs: [[0.26, -0.892, 0.371], [0.358, -0.781, 0.512]] } }, weapon3: [0.2, -0.2, -0.96],
    },
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
    // (in 3D the weapon hand raised in front of the face, not at the chest: the weapon standing up before it, the free hand on its middle)
    for3d: { weaponArm: { elbow: [68, 66], hand: [67, 53] }, weapon: { at: [67, 53], angle: -120 } },
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
    // (in 3D the weapon hand held out in front of the face, not in it: the weapon up before it, the free hand on its middle)
    for3d: {
      weaponArm: { elbow: [60, 67], hand: [58, 55] }, weapon: { at: [58, 55], angle: 100 },
      // (the weapon hand reached out ahead of the shoulder, up at the face; the free hand then takes the weapon's middle, `grip`)
      arms3: { right: { aim: { dir: [0, 0.8, 1], reach: 0.75 } }, left: { aim: { dir: [0, -0.5, 1], reach: 0.7 } } },
    },
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
    // In 3D the weapon arm straight out behind him, a little down; the free arm as the flat pose lifts it.
    for3d: { arms3: { right: { dirs: [[0, -0.138, -0.99], [0, -0.138, -0.99]] }, left: { dirs: [[0, -0.892, 0.451], [0, -0.781, 0.624]] } } },
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
  // The player's Retreat in 3D (`p3-backstep`): the Backstep's throw back off the feet (the left leg planted, leaning toward the player, the right
  // lifted with the knee bent across it), but the upper body is Shoulder In's, so it lands neatly in that stance: the chest turned to its left, the
  // right arm crossed in front of the body with the weapon slanting up toward the left shoulder, the left hand pulled back, the body leaning away.
  "p3-backstep": {
    head: [47, 51], neck: [44, 62], hip: [52, 86],
    adjust: { torso: 0.85, leadThigh: 0.75, leadShin: 0.7, rearThigh: 0.75, rearShin: 0.75 },
    weaponArm: { elbow: [58, 79], hand: [41, 76] },
    freeArm: { elbow: [33, 75], hand: [45, 71] },
    leadLeg: { knee: [64, 93], foot: [54, 104] },
    rearLeg: { knee: [61.5, 99], foot: [72, 114] },
    weapon: { at: [41, 76], angle: -140 }, torso34: "front", leadSide: "right", weaponOver: true,
    for3d: {
      turn3: -40, pitch3: 14,
      arms3: { right: { aim: { dir: [-0.7, -0.4, 0.6], reach: 0.8, bend: [0.3, 0, 1] } }, left: { aim: { dir: [-0.3, -0.55, -0.8], reach: 0.85 } } },
      weapon3: [-0.8, -0.45, -0.3],
    },
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
  // Slouching, sat back on its heels: the lower spine arched back a little (15°), the ribcage leaning forward over it (the angle the arms decide: their length, stretched 20%, puts the shoulders about 35 units up), the head lifted to look at the player, the arms down at its sides with the hands on the floor.
  "w-idle": {
    head: [61, 53], neck: [57, 62], waist: [43, 74], hip: [47, 88],
    adjust: { leadThigh: 1.041, leadShin: 0.832, rearShin: 0.832, weaponUpper: 1.2, weaponFore: 1.2, freeUpper: 1.2, freeFore: 1.2 },
    weaponArm: { elbow: [59, 77], hand: [61, 91] },
    freeArm: { elbow: [53, 77], hand: [55, 91] },
    ...KNEELING, weapon: bare([61, 91]), legs3: { knees: 7, feet: 0.8, sit: 11 }, arms3: { right: { plant: { out: 1.5, reach: 0.975 } }, left: { plant: { out: 1.5, reach: 0.975 } } },
  },
  // Staggered: the hunched Dead pose, but sat straighter up, as in Idle (the lower spine arched back, the ribcage about 41° above level): still on its knees,
  // the head hanging forward, the arms crossed over the chest, the hands on the opposite shoulders.
  "w-staggered": {
    head: [64, 62], neck: [57, 62], waist: [43, 74], hip: [47, 88],
    adjust: { weaponUpper: 1.2, weaponFore: 1.2, freeUpper: 1.2, freeFore: 1.2 },
    weaponArm: { elbow: [60, 80], hand: [54, 72] },
    freeArm: { elbow: [58, 80], hand: [66, 72] },
    ...KNEELING, weapon: bare([54, 72]), legs3: { knees: 7, feet: 0.8, sit: 11 },
    arms3: {
      // The arms crossed over the chest: each hand on the other shoulder, the right forearm over the left, the elbows out and down.
      right: { to: [-5, 25.3, 8.6], bend: [1, -0.8, 0] },
      left: { to: [-5, 26.4, 7.7], bend: [1, -0.8, 0] },
    },
  },
  // Dead: still on its knees, but hunched far over, a slouchier Idle: the lower spine arched back a little, the ribcage collapsed forward (a touch
  // below level), the head hanging; the arms crossed over the chest, the hands on the opposite shoulders.
  "w-dead": {
    head: [65, 77], neck: [60, 73], waist: [42, 76], hip: [47, 88],
    adjust: { weaponUpper: 1.2, weaponFore: 1.2, freeUpper: 1.2, freeFore: 1.2 },
    weaponArm: { elbow: [60, 90], hand: [54, 83] },
    freeArm: { elbow: [58, 90], hand: [66, 83] },
    ...KNEELING, weapon: bare([54, 83]), legs3: { knees: 7, feet: 0.8, sit: 11 },
    arms3: {
      // The arms crossed over the chest: each hand on the other shoulder, the right forearm over the left, the elbows out and down.
      right: { to: [-5, 18.2, 5.7], bend: [1, -0.8, 0] },
      left: { to: [-5, 19.6, 5.5], bend: [1, -0.8, 0] },
    },
  },
  // Hands Raised: both hands up, fingers hooked, about to claw.
  "w-hands": HANDS_2D,
  // Reared Back (the stance): the hands-up drawing, in 3D with the ribcage bent back 15° more at the waist (it leaned forward 8.6° of vertical;
  // now it leans back 6.4°), the head, shoulders and raised arms going with it; and the ribcage turned 35° about its own axis, to its
  // left, so the right shoulder is nearer the front (the arms turn with the shoulders, keeping their place relative to them);
  // the head tipped back 15° from the neck, away from the player, and the right forearm tipped back 49° from its elbow the same way (leaning back about 45° from vertical); the left arm tipped back
  // 45° from its shoulder (its elbow and hand lower) with the forearm folded up 35° toward the shoulder (the elbow bent more); the hips
  // a little lower (the pelvis at 23, from 26) and everything above them pitched back 8° more, as one block.
  "w-reared": { ...HANDS_2D, for3d: REARED_3D },
  // Brace, wind-up (what it holds until the blow lands): the Reared Back pose with both arms lowered about 20° (the right one tipped forward 25°,
  // the left one back 20° more) and the elbows bent more (the right forearm tipped back further, the left one folded up further).
  "w-brace": { ...HANDS_2D, for3d: { ...REARED_3D, arm3: { left: 65, right: -25 }, forearm3: { right: 105, left: -85 } } },
  // Brace, block (what it takes as the blow lands, coming from the wind-up): the hips lower (17), and the forearms crossed in front of the face,
  // each hand reaching over to the other side above the eyes, the elbows low and out to the sides.
  "w-brace-block": {
    ...HANDS_2D,
    for3d: {
      ...REARED_3D,
      legs3: { knees: 7, feet: 0.8, sit: 17 }, arm3: undefined, forearm3: undefined,
      adjust: { ...HANDS_2D.adjust, weaponUpper: 1.2, weaponFore: 1.2, freeUpper: 1.2, freeFore: 1.2 },
      arms3: {
        right: { to: [-9, 69, 8], bend: [1, -0.7, 0.2] },
        left: { to: [-9, 66, 4], bend: [1, -0.7, 0.2] },
      },
    },
  },
  // Overhead Attack, wind-up: the Reared Back pose, the whole body above the hip leaning 14° further back (the pitch from 8° to 22°).
  "w-overhead-windup": { ...HANDS_2D, for3d: { ...REARED_3D, pitch3: 22 } },
  // Scratch: thrown forward from the knees, both hands raking down.
  "w-scratch": SCRATCH_2D,
  // Overhead Attack, strike: the Scratch's body (thrown forward from the knees), in 3D with real arms (the flat drawing's shorten the left upper
  // arm to 3.9): both hands brought together low in front, almost down to the ground (18 up), the elbows bowed out to the sides.
  "w-overhead-strike": {
    ...SCRATCH_2D,
    for3d: {
      adjust: { ...SCRATCH_2D.adjust, weaponUpper: 1.3, weaponFore: 1.3, freeUpper: 1.3, freeFore: 1.3 },
      arms3: {
        right: { to: [0.9, 18, 26.4], bend: [1, 0, 0] },
        left: { to: [0.9, 18, 26.4], bend: [1, 0, 0] },
      },
    },
  },
  // Wax on Hand: leaning back, a lump of wax torn from itself held behind the shoulder.
  "w-wax-hand": { ...WAX_HAND_2D, for3d: WAX_HAND_3D },
  // Hurl Wax, wind-up: the Wax on Hand pose, rearing back for the throw (the whole upper body pitched back 12° from the hip); the right arm angled slightly
  // upward with the elbow less bent (46°, from 64°); the left, throwing arm lowered further (its upper arm tipped back 25° more, to 13° below horizontal);
  // and both arms swung 35° out to his sides, so his head does not cover them from other angles.
  "w-hurl-windup": {
    ...WAX_HAND_2D,
    for3d: { ...WAX_HAND_3D, pitch3: 12, arm3: { right: 12, left: 25 }, forearm3: { right: -20 } },
  },
  // Hurl Wax: the throwing arm whipped forward, the other flung back.
  "w-hurl": {
    head: [63, 46], neck: [58, 56], hip: [49, 88],
    adjust: { torso: 1.039, leadShin: 0.832, rearThigh: 0.983, rearShin: 0.832, weaponUpper: 1.372, weaponFore: 0.972, freeUpper: 1.288, freeFore: 0.909 },
    weaponArm: { elbow: [70, 48], hand: [83, 44] },
    freeArm: { elbow: [46, 68], hand: [37, 77] },
    ...KNEELING, weapon: bare([83, 44]),
    // (In 3D it is the left hand that throws; the arms are their full length, equal, not the flat drawing's; and the torso is turned 20° the other way from
    // Wax on Hand, to its right: the left shoulder toward the player, the right one away.)
    for3d: {
      hand3: "left", spin3: 20,
      adjust: { torso: 1.039, leadShin: 0.832, rearThigh: 0.983, rearShin: 0.832, weaponUpper: 1.2, weaponFore: 1.2, freeUpper: 1.2, freeFore: 1.2 },
    },
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
  // In 3D the hips are raised (7 higher than the Low Attack's crawl, set back so the waist and shoulders stay where they were) and the
  // legs go back with them: the thighs nearly upright, the knees on the floor a little behind the hips instead of under the belly, the
  // bound shins trailing behind. (The legs here are written at their true lengths, so the figure does not shift up or down.)
  "w-crawl": {
    ...CRAWL_2D,
    for3d: {
      ...CRAWL_3D,
      hip: [40.8, 86],
      leadLeg: { knee: [37.1, 110.2], foot: [13.1, 105.4] },
      rearLeg: { knee: [35.9, 110], foot: [11.8, 105.4] },
      adjust: { weaponUpper: 1.2, weaponFore: 1.2, freeUpper: 1.2, freeFore: 1.2 },
    },
  },
  // Low Attack, wind-up: the crawl, with everything above the pelvis turned 40° to its right as one block (the legs and pelvis stay put); the
  // left arm as in the crawl's lean, the elbow out toward the watchers; the right arm fully extended back and up, the hand above the
  // shoulders, pointing away from the target.
  "w-low-windup": { ...CRAWL_2D, for3d: { ...LOW_ATTACK_3D, turn3: 40 } },
  // Low Attack, strike: the wind-up, turned the other way: 40° to its left; the hips lower (sat back) and the back straighter (the whole
  // upper body pitched up 38° from the pelvis, the spine and ribcage keeping the angle between them), the shoulders and ribcage twisted
  // about the spine 65°: the right shoulder down toward the ground, the left one up; the right arm straight out to its left and down, the
  // left arm clear of the ground: the upper arm up and back from the raised shoulder to the elbow, which has not moved, the forearm then pointing
  // the exact opposite way to before (back across to its left, where it had pointed to its right).
  "w-low-strike": {
    ...CRAWL_2D,
    for3d: {
      ...LOW_ATTACK_3D, turn3: -40, legs3: { knees: 7, feet: 0.8, sit: 14 }, pitch3: 38, roll3: 65,
      arms3: {
        // The right arm fully extended, away from him to his left, angled down; the left arm bent, the forearm pointing the opposite way.
        right: { dirs: [[-0.85, -0.5, 0.15], [-0.85, -0.5, 0.15]] },
        left: { dirs: [[0.3898, 0.7928, -0.4685], [-0.9736, -0.0092, -0.2279]] },
      },
      // (Sat back, the legs are their true length: the crawl's shorter thighs are for how it is seen lying flat.)
      adjust: { weaponUpper: 1.2, weaponFore: 1.2, freeUpper: 1.2, freeFore: 1.2 },
    },
  },
  // Drag Forward: the hips thrown forward, the knees trailing well behind them, the whole body leaning far forward as if catching itself
  // from a fall, head up toward you; the right hand planted ahead on the floor, about to pull, the left swept back off it, having just pulled.
  "w-drag": {
    head: [83, 73], neck: [77, 79], waist: [60, 82], hip: [47, 88],
    adjust: { leadThigh: 1.041, leadShin: 0.832, rearShin: 0.832, weaponUpper: 1.2, weaponFore: 1.2, freeUpper: 1.2, freeFore: 1.2 },
    weaponArm: { elbow: [83, 92], hand: [88, 108] },
    freeArm: { elbow: [68, 88], hand: [58, 94] },
    ...KNEELING, weapon: bare([88, 108]), legs3: { knees: 7, feet: 0.8, ahead: -12, swing: 8 }, lean3: { shift: 3, tilt: 1.8 },
    arms3: { right: { plant: { out: 1.5, reach: 0.985 } }, left: { to: [9, 16, 6], bend: [-0.3, 1, -0.4] } },
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
    for3d: { look3: "prop" }, // (the face looks straight at the flame)
  },
  // Clutch Flame: folded over it, head bowed, hugging the flame to its belly.
  "w-clutch": { ...CLUTCH_2D, for3d: { look3: "prop" } },
  // Clutch Flame, rest (what it takes once the rest goes through): the clutch pose with the flame gone, doused as it pressed its hands against its wax
  // mouth, as if it ate it (the hands at the mouth, the face still bowed where the flame was).
  "w-clutch-eat": {
    ...CLUTCH_2D,
    prop: undefined,
    for3d: {
      // (The face is where the clutch pose's is: bowed, looking down where the flame was.)
      look3: { head: [0, 47.5, 17.88], gaze: [0.319, -0.882, -0.346] }, hideProp3: true,
      adjust: { ...CLUTCH_2D.adjust, weaponUpper: 1.2, weaponFore: 1.2, freeUpper: 1.2, freeFore: 1.2 },
      arms3: {
        // Both hands pressed against the wax mouth, the elbows out and down.
        right: { to: [2.2, 38.8, 15.4], bend: [0.8, -1, -0.2] },
        left: { to: [2.2, 38.8, 15.4], bend: [0.8, -1, -0.2] },
      },
    },
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
export const ALL_POSES: Record<PoseName, Skeleton> = { ...POSES, ...WARDEN_POSES, ...GUIDE_POSES };

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

/**
 * The player drawn in 3D: its body, stances and actions are the Sleepwalker's (which were made after the player's own), except for its Idle (standing
 * upright, `p3-idle`) and its Rest (its own Catch Breath, `rest-in` and `rest`, where the Sleepwalker has Struggling and Despair). Its flat pose names
 * (the stances and the swings) are turned into these here; the sideways swings have names of their own (`swing-*`), since in the flat drawings they use
 * the stances.
 */
export const PLAYER_3D_POSES: Partial<Record<PoseName, PoseName>> = {
  idle: "p3-idle",
  // the stances: lowered its own, centred (`p3-low`), left-leading Charging's, right-leading Shoulder In's
  low: "p3-low", "low-left": "sw-charging", "low-right": "sw-shoulder-in",
  // the overhead swing (bare-handed, the same), the swings to each side
  attack: "sw-overhead-leap", strike: "sw-overhead-strike", punch: "sw-overhead-strike",
  "swing-left-up": "sw-swing-l-windup", "swing-left": "sw-swing-l", "swing-right-up": "sw-swing-r-windup", "swing-right": "sw-swing-r",
  // a Block is a Parry, a dodge forward the Chase, back the Retreat; staggered, flinching, fallen
  block: "sw-parry", "dodge-fwd": "sw-charge", "dodge-back": "p3-backstep", maneuver: "sw-charge",
  kneel: "sw-down", flinch: "sw-flinch", fallen: "sw-dead",
};
export const player3dPose = (pose: PoseName): PoseName => PLAYER_3D_POSES[pose] ?? pose;

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
