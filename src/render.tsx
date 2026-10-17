/**
 * render.tsx — drawing only. No game rules live here.
 *
 * The camera looks at the fight from a 3/4 angle: the player stands on the left, seen from
 * behind and facing right into the scene; enemies stand on the right, seen from the front
 * and facing left toward the player.
 *
 * Both use the same poses, drawn facing right. What changes is depth:
 *  - The player's weapon arm is the far arm, so it and the weapon are drawn behind the body.
 *  - An enemy's weapon arm is the near arm, so it's drawn in front, and the figure is mirrored.
 * Gear attaches to joints: the weapon to the weapon hand, armor to the torso, shoulders and head.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { ArmorTier, Enemy, Fighter, WeaponTier } from "./combat";
import { ENEMY_KINDS } from "./bestiary";
import { ARENA_PROPS, PROP_FLAME, PROP_SCALE, SealedSleeper } from "./arena";
import { WARDEN_POSES, WardenFigure, type CandleArm, type WardenPoseName, type WardenSkeleton } from "./warden";
import { HORIZON, NEAR, FIGURE_HEIGHT, ease, lerpAngle, lerpCam, lerpVec, planningCamera, project, right, screenOf, toCamera, type Cam, type Vec } from "./scene";

/* ============================================================
 * Skeleton and poses
 * ============================================================ */

type Pt = readonly [number, number];

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
const ALL_POSES: Record<PoseName, Skeleton> = { ...POSES, ...WARDEN_POSES };

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

/* ============================================================
 * Gear
 * ============================================================ */

/** Weapons are drawn along +x from the grip at (0, 0). */
function Weapon({ tier }: { tier: WeaponTier }) {
  switch (tier) {
    case "baseline": // bare hands
      return null;
    case "light": // dagger
      return (
        <g>
          <line x1={-3} y1={0} x2={2} y2={0} className="fig-grip" />
          <line x1={2} y1={-3} x2={2} y2={3} className="fig-metal" strokeWidth={2} />
          <path d="M2 -1.6 L15 0 L2 1.6 Z" className="fig-blade" />
        </g>
      );
    case "normal": // sword
      return (
        <g>
          <line x1={-5} y1={0} x2={3} y2={0} className="fig-grip" />
          <line x1={3} y1={-4.5} x2={3} y2={4.5} className="fig-metal" strokeWidth={2.5} />
          <path d="M3 -1.9 L30 -1.2 L34 0 L30 1.2 L3 1.9 Z" className="fig-blade" />
        </g>
      );
    case "heavy": // maul
      return (
        <g>
          <line x1={-6} y1={0} x2={34} y2={0} className="fig-grip" strokeWidth={3} />
          <rect x={30} y={-7} width={11} height={14} rx={1.5} className="fig-metal-fill" />
        </g>
      );
  }
}

const ARMOR_WIDTH: Record<ArmorTier, number> = { none: 0, light: 9, normal: 11, heavy: 14 };

function Armor({ tier, s, near }: { tier: ArmorTier; s: Skeleton; near: Pt }) {
  if (tier === "none") return null;
  const [nx, ny] = s.neck;
  const [hx, hy] = s.hip;
  const ex = nx + (hx - nx) * 0.86;
  const ey = ny + (hy - ny) * 0.86;
  return (
    <g>
      <line x1={nx} y1={ny + 2} x2={ex} y2={ey} className="fig-armor" strokeWidth={ARMOR_WIDTH[tier]} />
      {tier !== "light" && <circle cx={near[0]} cy={near[1]} r={tier === "heavy" ? 6.5 : 4.5} className="fig-armor-fill" />}
    </g>
  );
}

function Helmet({ s }: { s: Skeleton }) {
  const [x, y] = s.head;
  return <path d={`M${x - 8.5} ${y + 2} A8.5 8.5 0 0 1 ${x + 8.5} ${y + 2} L${x + 8.5} ${y + 5} L${x - 8.5} ${y + 5} Z`} className="fig-armor-fill" />;
}

/** How far each weapon reaches from the grip, so the strike trail ends at its tip. */
const WEAPON_REACH: Record<WeaponTier, number> = { baseline: 0, light: 15, normal: 34, heavy: 41 };

/**
 * The swing trail on a strike: a tapered crescent around the shoulder, sweeping from where the
 * weapon was raised (up and behind) to its tip, fading out as it plays.
 */
function StrikeTrail({ s, tier }: { s: Skeleton; tier: WeaponTier }) {
  const reach = WEAPON_REACH[tier];
  const rad = (s.weapon.angle * Math.PI) / 180;
  const tip: Pt = [s.weapon.at[0] + Math.cos(rad) * reach, s.weapon.at[1] + Math.sin(rad) * reach];
  const pivot = s.neck;
  const r = Math.hypot(tip[0] - pivot[0], tip[1] - pivot[1]);
  const end = Math.atan2(tip[1] - pivot[1], tip[0] - pivot[0]);
  const start = end - (140 * Math.PI) / 180; // the swing covers 140 degrees
  const at = (radius: number, angle: number): Pt => [pivot[0] + Math.cos(angle) * radius, pivot[1] + Math.sin(angle) * radius];
  const from = at(r, start);
  const innerEnd = at(r * 0.8, end);
  const d = [
    `M${from[0]} ${from[1]}`,
    `A${r} ${r} 0 0 1 ${tip[0]} ${tip[1]}`,      // outer edge, following the tip
    `L${innerEnd[0]} ${innerEnd[1]}`,
    `A${r * 0.9} ${r * 0.9} 0 0 0 ${from[0]} ${from[1]}`, // inner edge, tapering back to a point
    "Z",
  ].join(" ");
  return <path d={d} className="fig-trail" />;
}

/* ============================================================
 * The figure
 * ============================================================ */

const limb = (...pts: Pt[]) => pts.map(p => p.join(",")).join(" ");

interface StickFigureProps {
  /** "back": the player, seen from behind, facing right.
   *  "front": an enemy, seen from the front, facing left toward the player. */
  view: "front" | "back";
  pose: PoseName;
  weapon: WeaponTier;
  armor: ArmorTier;
  title?: string;
  /** "waxed": kneeling, shins bound together and head sealed in wax. "warden": the Penitent Warden. */
  variant?: "waxed" | "warden";
  /** The Warden's candle arm. */
  arm?: CandleArm;
  /** The Warden: the rest pose he has just left, whose trails keep fading. */
  lingerFrom?: WardenPoseName;
  /** The Warden: his flame went out this long ago (ms), smoke still leaving his hand. */
  smokeAgo?: number;
  /** The Warden: phase two's look whatever his arm. */
  phase2Look?: boolean;
  /** The Warden: his flail is on fire. */
  flailFire?: boolean;
  /** Wax caked on it (Waxed, still standing). */
  waxCaked?: boolean;
  /** Sealed whole in wax: every limb, the body and the head. */
  encased?: boolean;
}

/** Sickly yellow wax binding the shins together (drawn behind the body). */
function WaxBinding({ s }: { s: Skeleton }) {
  return (
    <g className="fig-wax">
      <polyline points={limb(s.leadLeg.knee, s.leadLeg.foot)} className="fig-wax-bind" />
      <polyline points={limb(s.rearLeg.knee, s.rearLeg.foot)} className="fig-wax-bind" />
    </g>
  );
}

/** The lump of wax sealing the head. */
function WaxHead({ s }: { s: Skeleton }) {
  const [hx, hy] = s.head;
  return (
    <g className="fig-wax">
      <ellipse cx={hx} cy={hy} rx={9.5} ry={10} className="fig-wax-head" />
      <path d={`M${hx - 4} ${hy + 8} q1 5 0 7 M${hx + 3} ${hy + 9} q1 3 0 4`} className="fig-wax-drip" />
    </g>
  );
}

/**
 * Wax caked on a fighter still standing (Waxed): splashed over a shoulder and the back, gobbets
 * stuck to an arm and a thigh, a run of it down the head.
 */
function WaxCaked({ s, near }: { s: Skeleton; near: Pt }) {
  const [hx, hy] = s.head;
  const back = lerp2(s.neck, s.hip, 0.35);
  const arm = lerp2(s.freeArm.elbow, s.freeArm.hand, 0.4);
  const thigh = lerp2(s.hip, s.leadLeg.knee, 0.5);
  return (
    <g className="fig-wax">
      <ellipse cx={near[0]} cy={near[1]} rx={6} ry={4.2} className="fig-wax-head" />
      <path d={`M${near[0] - 3} ${near[1] + 3} q-0.6 4 0.2 6 M${near[0] + 2} ${near[1] + 3.5} q0.5 3 0 4.5`} className="fig-wax-drip" />
      <ellipse cx={back[0]} cy={back[1]} rx={4.4} ry={5.5} className="fig-wax-head" />
      <circle cx={arm[0]} cy={arm[1]} r={3.2} className="fig-wax-head" />
      <circle cx={thigh[0]} cy={thigh[1]} r={3.6} className="fig-wax-head" />
      <path d={`M${hx - 6} ${hy - 4} q4 -5 9 -2 q-2 3 -4 3 q-1 4 -2 6 q-1 -3 -3 -7 Z`} className="fig-wax-head" />
    </g>
  );
}
const lerp2 = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** Sealed whole in wax: a thick coat over every limb, the body and the head, drips running off it. */
function WaxShell({ s, near, far }: { s: Skeleton; near: Pt; far: Pt }) {
  const [hx, hy] = s.head;
  const parts: Pt[][] = [
    [s.hip, s.rearLeg.knee, s.rearLeg.foot],
    [s.hip, s.leadLeg.knee, s.leadLeg.foot],
    [far, near],
    [s.neck, s.hip],
    [near, s.weaponArm.elbow, s.weaponArm.hand],
    [far, s.freeArm.elbow, s.freeArm.hand],
  ];
  return (
    <g className="fig-wax">
      {parts.map((pts, i) => <polyline key={i} points={limb(...pts)} className="fig-wax-shell" />)}
      <ellipse cx={hx} cy={hy} rx={10.5} ry={11} className="fig-wax-head" />
      <path d={`M${s.hip[0] - 4} ${s.hip[1] + 4} q-1 6 0 9 M${s.hip[0] + 5} ${s.hip[1] + 3} q1 4 0 6 M${hx + 5} ${hy + 9} q1 4 0 6`} className="fig-wax-drip" />
    </g>
  );
}

/** A held wax lump, or a small flame. */
function Prop({ prop }: { prop: NonNullable<Skeleton["prop"]> }) {
  const [x, y] = prop.at;
  if (prop.kind === "wax") return <circle cx={x} cy={y} r={4.5} className="fig-wax-head" />;
  return (
    <g className="fig-flame">
      <path d={`M${x} ${y - 6} C${x + 3.3} ${y - 2} ${x + 2.7} ${y + 2} ${x} ${y + 2} C${x - 2.7} ${y + 2} ${x - 3.3} ${y - 2} ${x} ${y - 6} Z`} />
      <path d={`M${x} ${y - 2.6} C${x + 1.3} ${y - 0.6} ${x + 1.3} ${y + 1.4} ${x} ${y + 1.4} C${x - 1.3} ${y + 1.4} ${x - 1.3} ${y - 0.6} ${x} ${y - 2.6} Z`} className="fig-flame-core" />
    </g>
  );
}

export function StickFigure({ view, pose, weapon, armor, title, variant, arm, lingerFrom, smokeAgo, phase2Look, flailFire, waxCaked, encased }: StickFigureProps) {
  const s = ALL_POSES[pose];
  const front = view === "front";
  if (variant === "warden" && "ball" in s) {
    return (
      <svg viewBox="0 0 100 120" className={`figure figure-${view}`} role="img" aria-label={title}>
        {title && <title>{title}</title>}
        <ellipse cx={50} cy={115} rx={28} ry={3.2} className="fig-shadow" />
        <g transform={front ? "translate(100 0) scale(-1 1)" : undefined}>
          <WardenFigure s={s as WardenSkeleton} front={front} arm={arm ?? "lit"} lingerFrom={lingerFrom} smokeAgo={smokeAgo} phase2Look={phase2Look} flailFire={flailFire} />
        </g>
      </svg>
    );
  }
  const [hx, hy] = s.head;
  const [nx, ny] = s.neck;
  // Turned 3/4, the shoulders sit slightly apart: the near one lower, toward the camera.
  const nearShoulder: Pt = [nx - 3, ny + 4];
  const farShoulder: Pt = [nx + 3, ny + 2];

  // From behind, the weapon arm is the far arm; from the front, it's the near one.
  const weaponShoulder = front ? nearShoulder : farShoulder;
  const freeShoulder = front ? farShoulder : nearShoulder;
  const weaponArm = (
    <polyline points={limb(weaponShoulder, s.weaponArm.elbow, s.weaponArm.hand)} className={`fig-limb ${front ? "" : "fig-far"}`} />
  );
  const freeArm = (
    <polyline points={limb(freeShoulder, s.freeArm.elbow, s.freeArm.hand)} className={`fig-limb ${front ? "fig-far" : ""}`} />
  );
  const waxed = variant === "waxed";
  const weaponEl = waxed ? null : (
    <g transform={`translate(${s.weapon.at[0]} ${s.weapon.at[1]}) rotate(${s.weapon.angle})`}>
      <Weapon tier={weapon} />
    </g>
  );

  return (
    <svg viewBox="0 0 100 120" className={`figure figure-${view}`} role="img" aria-label={title}>
      {title && <title>{title}</title>}
      <ellipse cx={50} cy={115} rx={26} ry={3} className="fig-shadow" />
      {/* Enemies face left: mirror the whole drawing. */}
      <g transform={front ? "translate(100 0) scale(-1 1)" : undefined}>
        {pose === "strike" && weapon !== "baseline" && <StrikeTrail s={s} tier={weapon} />}
        {!front && weaponEl}
        {!front && weaponArm}
        {front && freeArm}
        <polyline points={limb(s.hip, s.rearLeg.knee, s.rearLeg.foot)} className="fig-limb fig-far" />
        {waxed && <WaxBinding s={s} />}
        <polyline points={limb(farShoulder, nearShoulder)} className="fig-limb" />
        <line x1={nx} y1={ny} x2={s.hip[0]} y2={s.hip[1]} className="fig-limb" />
        <Armor tier={armor} s={s} near={nearShoulder} />
        <circle cx={hx} cy={hy} r={7.5} className="fig-head" />
        {armor === "heavy" && <Helmet s={s} />}
        {front && !waxed && (
          // Only enemies show a face, turned toward the player. The player is always seen from behind.
          <g className="fig-eyes">
            <circle cx={hx + 2} cy={hy} r={1.3} />
            <circle cx={hx + 5.4} cy={hy} r={1.2} />
          </g>
        )}
        {/* The waxed's shins are under the binding, behind the body: only the thigh shows in front. */}
        <polyline points={waxed ? limb(s.hip, s.leadLeg.knee) : limb(s.hip, s.leadLeg.knee, s.leadLeg.foot)} className="fig-limb" />
        {waxed && <WaxHead s={s} />}
        {!front && freeArm}
        {front && weaponEl}
        {front && weaponArm}
        {s.prop && <Prop prop={s.prop} />}
        {waxCaked && <WaxCaked s={s} near={nearShoulder} />}
        {encased && <WaxShell s={s} near={nearShoulder} far={farShoulder} />}
      </g>
    </svg>
  );
}

/* ============================================================
 * Health bar
 * ============================================================ */

/**
 * Bars grow with max health. A fighter with this much max health fills the whole bar track
 * (the --bar-track width in index.css); anything less gets a proportionally shorter bar.
 * 120 leaves room above the late-game 100 for passives and buffs.
 */
const BAR_FULL_HP = 120;

export interface BarValues {
  hp: number;
  fatigue: number;
  death: number;
}

const barPct = (x: number, maxHP: number) => `${(Math.max(0, x) / maxHP) * 100}%`;

function Segments({ v, maxHP }: { v: BarValues; maxHP: number }) {
  const hp = Math.max(0, v.hp);
  // Fatigue fills current health and can't spill past it, even for a moment mid-turn.
  const fatigue = Math.min(Math.max(0, v.fatigue), hp);
  return (
    <>
      <i className="bar-room" style={{ width: barPct(hp - fatigue, maxHP) }} />
      <i className="bar-fatigue" style={{ width: barPct(fatigue, maxHP) }} />
      <i className="bar-death" style={{ width: barPct(v.death, maxHP) }} />
    </>
  );
}

/**
 * The shared bar: waking room, then white Fatigue filling current health, then black Death
 * filling missing health, then what's left empty.
 *
 * Changes cut instantly, with a flash, while a lighter trail of the old values slowly catches up.
 * `before` lets a freshly shown bar start from earlier values, so it still animates the change.
 * `mirrored` anchors the bar on the right and fills it right to left, for enemies.
 * A stagger bursts into shards.
 */
export function HealthBar({ fighter, before, className, mirrored }: {
  fighter: Fighter;
  before?: BarValues;
  className?: string;
  mirrored?: boolean;
}) {
  const { maxHP } = fighter;
  const now: BarValues = { hp: fighter.hp, fatigue: fighter.fatigue, death: fighter.death };
  const sig = `${now.hp}|${now.fatigue}|${now.death}`;
  const startSig = before ? `${before.hp}|${before.fatigue}|${before.death}` : sig;

  const [trail, setTrail] = useState<BarValues>(before ?? now);
  const [flash, setFlash] = useState(startSig !== sig ? 1 : 0);
  const [shatter, setShatter] = useState(0);
  const lastSig = useRef(sig);
  const wasStaggered = useRef(fighter.staggered);

  useEffect(() => {
    if (sig !== lastSig.current) {
      lastSig.current = sig;
      setFlash(f => f + 1);
    }
    // Let the old values paint first, then move the trail so its transition plays.
    const timer = window.setTimeout(() => setTrail({ hp: fighter.hp, fatigue: fighter.fatigue, death: fighter.death }), 30);
    return () => window.clearTimeout(timer);
  }, [sig, fighter.hp, fighter.fatigue, fighter.death]);

  useEffect(() => {
    if (fighter.staggered && !wasStaggered.current) setShatter(n => n + 1);
    wasStaggered.current = fighter.staggered;
  }, [fighter.staggered]);

  return (
    <div
      className={`bar ${mirrored ? "is-mirrored" : ""} ${fighter.staggered ? "is-staggered" : ""} ${className ?? ""}`}
      role="img"
      aria-label={`${fighter.name}: health ${Math.round(now.hp)} of ${maxHP}, Fatigue ${Math.round(now.fatigue)}${fighter.staggered ? ", staggered" : ""}`}
      style={{ width: `calc(var(--bar-track) * ${Math.min(maxHP, BAR_FULL_HP) / BAR_FULL_HP})` }}
    >
      {/* The trail only shows health that was just lost, in a light red, sliding away. */}
      <span className="bar-layer bar-trail"><i className="bar-lost" style={{ width: barPct(trail.hp, maxHP) }} /></span>
      <span className="bar-layer bar-now"><Segments v={now} maxHP={maxHP} /></span>
      {flash > 0 && <span key={flash} className="bar-flash" />}
      {shatter > 0 && <Shards key={shatter} count={8} small />}
    </div>
  );
}

/* ============================================================
 * Stagger: white shards bursting outward
 * ============================================================ */

function Shards({ count = 14, small }: { count?: number; small?: boolean }) {
  return (
    <span className={`shards ${small ? "is-small" : ""}`} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => {
        // Spread evenly around the circle, with a little fixed jitter so it doesn't look mechanical.
        const angle = (i / count) * 360 + ((i * 37) % 23) - 11;
        const dist = (small ? 18 : 46) + ((i * 53) % (small ? 14 : 34));
        const style = { "--a": `${angle}deg`, "--d": `${dist}px`, "--s": `${0.7 + ((i * 29) % 7) / 10}` } as CSSProperties;
        return <i key={i} style={style} />;
      })}
    </span>
  );
}

/* ============================================================
 * The scene: everyone on the floor, seen through the camera
 * ============================================================ */

/** The figure's drawing (100 × 120 box) spans this many units from head to feet. */
const FIGURE_UNITS = 102;
const FEET_Y = 114;

/**
 * Where a figure standing at `p` appears on screen: its 100 × 120 drawing box, and its depth.
 * `scale`: how much bigger than a normal figure (the Warden towers over everyone).
 */
export function figureBox(cam: Cam, p: Vec, w: number, h: number, scale = 1) {
  const { sx, sy, ppm, depth } = project(cam, p, w, h);
  const unit = (ppm * FIGURE_HEIGHT * scale) / FIGURE_UNITS;
  return { x: sx - 50 * unit, y: sy - FEET_Y * unit, w: 100 * unit, h: 120 * unit, depth };
}

export interface SceneFigure {
  id: string;
  view: "front" | "back";
  pose: PoseName;
  weapon: WeaponTier;
  armor: ArmorTier;
  variant?: "waxed" | "warden";
  arm?: CandleArm;
  lingerFrom?: WardenPoseName;
  /** When (performance.now()) the Warden's flame went out, while its smoke still shows. */
  smokeSince?: number;
  /** A candle burning on its head (the waxed remains, once the arena is lit). */
  candle?: boolean;
  /** Wax caked on it (the player, Waxed). */
  waxCaked?: boolean;
  /** Sealed whole in wax (its flame taken by Usurp Flame). */
  encased?: boolean;
  /** The Warden: phase two's look (black wax, burning inside) whatever his arm. */
  phase2Look?: boolean;
  /** The Warden: his flail is on fire. */
  flailFire?: boolean;
  /** Size relative to a normal figure. */
  scale?: number;
  /** Playback animations (fx-hit, fx-step...). */
  classes: string[];
  /** Changes on every playback beat, so animations replay. */
  stepKey: string;
  selected: boolean;
  disabled: boolean;
  label: string;
  onPick: () => void;
}

/**
 * How the camera is placed: a fixed spot, or riding along behind someone's shoulder (the planning
 * shot), facing `yaw`. A riding camera stays locked to its figure while it moves, so the figure
 * holds still on screen and the world turns around it.
 */
export type ShotCamera = Cam | { follow: string; yaw: number };

/** Where everyone should be and where the camera should look, and how long to take getting there. */
export interface SceneShot {
  positions: Record<string, Vec>;
  camera: ShotCamera;
  ms: number;
  /** Bumped on every new shot, so the scene knows to start moving. */
  version: number;
}

interface Tween<T> { from: T; to: T }

/** The camera a shot ends on. */
export function shotCamera(shot: SceneShot): Cam {
  const c = shot.camera;
  return "follow" in c ? planningCamera(shot.positions[c.follow], c.yaw) : c;
}

/** Something thrown across the field during a beat: from a figure to another, passing through it. */
export interface Projectile {
  from: string;
  to: string;
  kind: "fan" | "blast" | "wax" | "impact";
  /** Changes every beat, so the flight replays. */
  key: string;
  /** A flaming flail's impact: its shockwave burns instead of white spikes. */
  fiery?: boolean;
  /** Where on the thrower it comes from, in figure units (100 × 120, facing right), e.g. its hand. */
  origin?: readonly [number, number];
}

/** The thrown thing itself, drawn pointing right (the scene rotates it to its flight). */
function ProjectileShape({ kind }: { kind: Projectile["kind"] }) {
  if (kind === "wax") {
    return (
      <svg viewBox="-10 -10 20 20" className="projectile-svg">
        <circle cx={0} cy={0} r={6} className="fig-wax-head" />
        <path d="M-6 0 Q-10 1 -9 4" className="fig-beard-strand" />
      </svg>
    );
  }
  // A fan of flame lying flat, like the swat's sweep: a wide, level crescent seen at an angle.
  // It's headed a little toward the player as well as the camera, so its bow leans left and its
  // right end dips. Flame tongues rise from its back edge.
  const L: Pt = [-48, -1], R: Pt = [48, 5];
  const back: Pt = [-14, 8], front: Pt = [-14, 26];
  const at = (c: Pt, t: number): Pt => [
    (1 - t) ** 2 * L[0] + 2 * t * (1 - t) * c[0] + t ** 2 * R[0],
    (1 - t) ** 2 * L[1] + 2 * t * (1 - t) * c[1] + t ** 2 * R[1],
  ];
  const tongues = [0.1, 0.21, 0.32, 0.43, 0.54, 0.65, 0.76, 0.87].map(t => {
    const a = at(back, t - 0.045), b = at(back, t + 0.045), m = at(back, t);
    const h = 10 + 5 * Math.sin(t * Math.PI); // taller in the middle
    // Rooted inside the band (a little below the back edge), so each tongue grows out of it.
    return `M${a[0]} ${a[1] + 3} Q${a[0] + 1} ${m[1] - h * 0.55} ${m[0] + 1.5} ${m[1] - h} Q${b[0] - 0.5} ${m[1] - h * 0.4} ${b[0]} ${b[1] + 3} Z`;
  });
  const band = (f: Pt, b: Pt) => `M${L[0]} ${L[1]} Q${f[0]} ${f[1]} ${R[0]} ${R[1]} Q${b[0]} ${b[1]} ${L[0]} ${L[1]} Z`;
  return (
    <svg viewBox="-50 -18 100 36" className="projectile-svg is-fan">
      {tongues.map((d, i) => <path key={i} d={d} className="fig-burst-outer" />)}
      <path d={band(front, back)} className="fig-burst-outer" />
      <path d={`M-38 3 Q-14 21 38 7 Q-14 12 -38 3 Z`} className="fig-burst-inner" />
    </svg>
  );
}

/** How long the shockwave takes to spread, and how long after the flash it starts. */
const SHOCK_MS = 640;
const SHOCK_DELAY_MS = 120;
/** How long a melee impact's ring takes to spread and fade. */
const IMPACT_MS = 380;

/**
 * A shockwave rolling out along the floor: a ring around `center` (a floor point, in meters)
 * spreading out to `reach` meters, projected through the camera so it lies on the floor however
 * far it goes. Only the side facing `toward` (a world angle: x = cos, z = sin) burns: flames
 * tallest straight ahead, dying away around the sides, nothing behind (or all the way round, for
 * `full`). The flames (`flame` meters tall) keep their size as it spreads, only rising as it
 * advances. `impact`: a melee blow's version, white spikes, quicker.
 */
function Shockwave({ center, reach, toward, flame, proj, impact, full }: {
  center: Vec; reach: number; toward: number; flame: number;
  /** Where a floor point lands on screen (the scene's camera). */
  proj: (p: Vec) => { sx: number; sy: number; ppm: number; depth: number };
  /** Burning all the way round, not just toward one side (the Warden's phase-two flare). */
  full?: boolean;
  /** A melee blow's version: white spikes instead of flames, quicker, starting right away. */
  impact?: boolean;
}) {
  const [p, setP] = useState(0);
  useEffect(() => {
    const start = performance.now() + (impact ? 0 : SHOCK_DELAY_MS);
    const ms = impact ? IMPACT_MS : SHOCK_MS;
    let raf = 0;
    const tick = () => {
      const k = Math.min(1, Math.max(0, (performance.now() - start) / ms));
      setP(k);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  if (p <= 0) return null;
  const eased = 1 - (1 - p) ** 2.2;
  const r = reach * (0.08 + 0.92 * eased);
  const opacity = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
  // Flames sit evenly along the burning arc, a fixed distance apart (in meters), whatever its size.
  const spacing = flame * (impact ? 0.24 : 0.16);
  const step = Math.max(0.02, spacing / r);
  const mid = proj(center);
  const flames: { depth: number; d: string; core: string }[] = [];
  const arc: string[] = [];
  let pen = false;
  const span = full ? Math.PI : 1.47;
  for (let off = -span; off <= span + 1e-6; off += step) {
    const t = toward + off;
    const w = full ? 1 : Math.cos(off);
    const at = proj({ x: center.x + r * Math.cos(t), z: center.z + r * Math.sin(t) });
    // Behind (or right at) the camera: not drawn.
    if (at.depth < NEAR) { pen = false; continue; }
    const { sx: x, sy: y, ppm } = at;
    arc.push(`${pen ? "L" : "M"}${x} ${y}`);
    pen = true;
    if (w < 0.2) continue;
    // The flames rise as the wave advances: low as it leaves him, full height once it's out.
    const hgt = flame * ppm * (0.25 + 0.95 * eased) * w ** 1.6;
    const half = flame * ppm * (0.06 + 0.04 * w) * (impact ? 1.7 : 1);
    const lean = Math.sign(x - mid.sx) * hgt * 0.05; // flames lean outward a little
    const tongue = (k: number) => {
      const hh = hgt * k, ww = half * k;
      return `M${x - ww} ${y} Q${x - ww * 0.6 + lean * 0.5 * k} ${y - hh * 0.55} ${x + lean * k} ${y - hh} Q${x + ww * 0.7 + lean * 0.4 * k} ${y - hh * 0.45} ${x + ww} ${y} Z`;
    };
    flames.push({ depth: at.depth, d: tongue(1), core: tongue(0.5) });
  }
  // Each flame is layered with the figures by its distance, as they are (see Scene), so the far
  // side of the ring stays behind whoever stands in front of it.
  flames.sort((m, n) => n.depth - m.depth); // farther ones first
  const layers = new Map<number, typeof flames>();
  for (const f of flames) {
    const z = 1000 - Math.round(f.depth * 10);
    layers.set(z, [...(layers.get(z) ?? []), f]);
  }
  return (
    <>
      {/* The glowing edge lies on the floor, under everyone. */}
      <svg className="shockwave" style={{ opacity, zIndex: 1 }} aria-hidden="true">
        <path d={arc.join(" ")} className={impact ? "impact-ring" : "shockwave-ring"} />
        {!impact && <path d={arc.join(" ")} className="shockwave-ring-inner" />}
      </svg>
      {[...layers.entries()].map(([z, fs]) => (
        <svg key={z} className="shockwave" style={{ opacity, zIndex: z }} aria-hidden="true">
          {fs.map((f, i) => (
            <g key={i}>
              <path d={f.d} className={impact ? "impact-spike" : "fig-burst-outer"} />
              {!impact && <path d={f.core} className="fig-burst-inner" />}
            </g>
          ))}
        </svg>
      ))}
    </>
  );
}

/**
 * A melee blow's shockwave: a thin white ring lying flat on the floor (squashed like Flame
 * Blast's), quickly spreading out to `reach` and fading, with a brief white flash where it hit.
 * Drawn in screen pixels.
 */
function ImpactRing({ cx, cy, reach }: { cx: number; cy: number; reach: number }) {
  const [p, setP] = useState(0.001);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const k = Math.min(1, (performance.now() - start) / IMPACT_MS);
      setP(k);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  if (p >= 1) return null;
  const eased = 1 - (1 - p) ** 2.5;
  const rx = reach * (0.1 + 0.9 * eased), ry = rx * 0.3;
  const fade = 1 - p;
  const flash = Math.max(0, 1 - p * 3.5);
  return (
    <svg className="shockwave" aria-hidden="true">
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} className="impact-ring" style={{ opacity: fade, strokeWidth: 2 + 4 * fade }} />
      {flash > 0 && <ellipse cx={cx} cy={cy - reach * 0.04} rx={reach * 0.16 * (0.6 + p)} ry={reach * 0.1 * (0.6 + p)} className="impact-flash" style={{ opacity: flash }} />}
    </svg>
  );
}

/** Where a figure's own flame is, in figure units: a flame it holds, or else a candle above its head. */
function flameOf(pose: PoseName): readonly [number, number] {
  // The Warden's is the candle in his fist.
  const wd = WARDEN_POSES[pose as WardenPoseName];
  if (wd) return [wd.freeArm.hand[0], wd.freeArm.hand[1] - 4];
  const sk = ALL_POSES[pose] as Skeleton | undefined;
  if (sk?.prop?.kind === "flame") return sk.prop.at;
  return [sk?.head?.[0] ?? 50, (sk?.head?.[1] ?? 20) - 12];
}

/**
 * The Warden's phase-two scene, `t` ms in (see IGNITE in App.tsx): in the dark, flames kindle all
 * around (the waxed, the sealed sleepwalkers in the floor and walls, and more beyond the edges of
 * the screen); then one by one they stream into his hand, his flame growing; then it flares.
 */
export const IGNITE = { kindle: 1500, draw: 2900, flare: 4700, end: 5700 } as const;
/** A repeatable random number in [0, 1) for each index. */
const rand = (seed: number, i: number) => {
  const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Draws the floor and every figure through the camera. When a new shot arrives, everyone (and
 * the camera) moves from wherever they are right now to the new spots, over the shot's duration.
 */
export function Scene({ figures, shot, projectiles = [], dark, usurpTrail, arena, arenaLit, ignite }: {
  figures: SceneFigure[];
  shot: SceneShot;
  projectiles?: Projectile[];
  /** The light dying (0 to 1, over `ms`), all but one figure's flame, which keeps burning. */
  dark?: { level: number; ms: number; flame?: string };
  /** A flame streaming from one figure, arching over the other, into its candle hand. */
  usurpTrail?: { from: string; to: string; key: string };
  /** The Warden's arena: sleepwalkers sealed into its floor and walls. */
  arena?: boolean;
  /** The sealed sleepwalkers' candles (and the waxed remains') burn. */
  arenaLit?: boolean;
  /** The Warden's phase-two scene: who, how far in (ms), and a seed for its randomness. */
  ignite?: { who: string; t: number; seed: number };
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Tween state lives in refs; a frame counter re-renders while anything is moving.
  // The camera moves from where it was (`from`) to the shot's camera. A riding camera that was
  // already riding just turns (`fromYaw` to the new yaw) while it follows its figure.
  const cam = useRef<{ from: Cam; to: ShotCamera; fromYaw: number | null }>({
    from: shotCamera(shot),
    to: shot.camera,
    fromYaw: "follow" in shot.camera ? shot.camera.yaw : null,
  });
  const pos = useRef(new Map<string, Tween<Vec>>());
  const timing = useRef({ start: 0, ms: 0 });
  const [, setFrame] = useState(0);
  const progress = () => {
    const { start, ms } = timing.current;
    return ms <= 0 ? 1 : Math.min(1, (performance.now() - start) / ms);
  };
  const posNow = (id: string, k = ease(progress())) => {
    const t = pos.current.get(id);
    return t ? lerpVec(t.from, t.to, k) : undefined;
  };
  const camNow = (k = ease(progress())): Cam => {
    const { from, to, fromYaw } = cam.current;
    if (!("follow" in to)) return lerpCam(from, to, k);
    const at = posNow(to.follow, k);
    if (!at) return from;
    const riding = planningCamera(at, lerpAngle(fromYaw ?? from.yaw, to.yaw, k));
    // Already riding: stay locked on. Coming from a fixed shot: ease into the ride.
    return fromYaw !== null ? riding : lerpCam(from, riding, k);
  };

  useLayoutEffect(() => {
    // Start every move from where things are on screen right now.
    const k = ease(progress());
    const prev = cam.current.to;
    const nowCam = camNow(k);
    // Keep riding (and turning from the current angle) if the camera was riding the same figure.
    const stillRiding = "follow" in prev && "follow" in shot.camera && prev.follow === shot.camera.follow;
    const fromYaw = stillRiding && "follow" in prev ? lerpAngle(cam.current.fromYaw ?? prev.yaw, prev.yaw, k) : null;
    for (const [id, to] of Object.entries(shot.positions)) {
      const t = pos.current.get(id);
      pos.current.set(id, { from: t ? lerpVec(t.from, t.to, k) : to, to });
    }
    cam.current = { from: nowCam, to: shot.camera, fromYaw };
    timing.current = { start: performance.now(), ms: shot.ms };
    let raf = 0;
    const tick = () => {
      setFrame(f => f + 1);
      if (progress() < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot.version]);

  const { w, h } = size;
  const c = camNow();
  const placed = figures
    .map(f => {
      const p = posNow(f.id);
      return p && w ? { f, box: figureBox(c, p, w, h, f.scale) } : null;
    })
    .filter((x): x is { f: SceneFigure; box: ReturnType<typeof figureBox> } => !!x && x.box.depth > NEAR)
    .sort((a, b) => b.box.depth - a.box.depth); // far first, so nearer figures draw on top
  // The arena's sealed sleepwalkers, fixed in the world.
  // (Only in the Warden's arena; never right on top of the camera.)
  const props = w && arena
    ? ARENA_PROPS.map(pr => ({ pr, box: figureBox(c, pr.pos, w, h, PROP_SCALE[pr.kind]) })).filter(x => x.box.depth > 3)
    : [];
  const proj = (p: Vec) => project(c, p, w, h);
  /** The floor point under a screen x on a figure standing at `at` (its feet's depth). */
  const floorAt = (at: Vec, sx: number): Vec => {
    const { sx: fx, ppm } = proj(at);
    const r = right(c.yaw), k = (sx - fx) / ppm;
    return { x: at.x + r.x * k, z: at.z + r.z * k };
  };
  const toScreen = (box: { x: number; y: number; w: number; h: number }, p: readonly [number, number], mirror: boolean): Pt =>
    [box.x + (box.w * (mirror ? 100 - p[0] : p[0])) / 100, box.y + (box.h * p[1]) / 120];
  // Lit for good once the arena is lit, or from the moment his flare relights them.
  const propLit = !!arenaLit || (!!ignite && ignite.t >= IGNITE.flare);
  // Every flame the phase-two scene draws on, in screen space: the waxed, the sealed sleepwalkers,
  // and a ring of unseen ones beyond the edges of the screen.
  const igniter = ignite && placed.find(x => x.f.id === ignite.who);
  const sources: { id: string; at: Pt; kindle: number; draw: number; seen: boolean }[] = [];
  if (ignite && igniter) {
    const add = (id: string, at: Pt, seen: boolean) => {
      const i = sources.length;
      sources.push({ id, at, seen, kindle: IGNITE.kindle + rand(ignite.seed, i) * 1200, draw: IGNITE.draw + rand(ignite.seed + 1, i) * 1400 });
    };
    for (const { f, box } of placed) if (f.variant === "waxed") add(f.id, toScreen(box, flameOf(f.pose), f.view === "front"), true);
    for (const { pr, box } of props) add(pr.id, toScreen(box, PROP_FLAME[pr.kind], !!pr.flip), true);
    const [hx, hy] = toScreen(igniter.box, WARDEN_POSES["wd-idle"].freeArm.hand, igniter.f.view === "front");
    const far = Math.max(w, h) * 0.8;
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + rand(ignite.seed + 2, k);
      add(`beyond${k}`, [hx + Math.cos(a) * far, hy + Math.sin(a) * far * 0.7], false);
    }
  }

  return (
    <div className="scene" ref={boxRef}>
      <div className="scene-floor" style={{ top: `${HORIZON * 100}%` }} />
      {w > 0 && <FloorGrid cam={c} w={w} h={h} />}
      {props.map(({ pr, box }) => (
        <div key={pr.id} className="arena-slot" style={{ left: box.x, top: box.y, width: box.w, height: box.h, zIndex: 1000 - Math.round(box.depth * 10), filter: `brightness(${Math.max(0.55, Math.min(1, 1.05 - box.depth * 0.04))})` }}>
          <SealedSleeper kind={pr.kind} flip={pr.flip} lit={propLit} />
        </div>
      ))}
      {placed.map(({ f, box }) => (
        <button
          key={f.id}
          className={`figure-slot ${f.selected ? "is-target" : ""}`}
          data-fig={f.id}
          aria-label={f.label}
          aria-pressed={f.selected}
          disabled={f.disabled}
          onClick={f.onPick}
          style={{
            left: box.x,
            top: box.y,
            width: box.w,
            height: box.h,
            zIndex: 1000 - Math.round(box.depth * 10),
            // Distance haze: the further away, the dimmer.
            filter: `brightness(${Math.max(0.68, Math.min(1, 1.12 - box.depth * 0.06))})`,
          }}
        >
          <div key={f.stepKey} className={`fig-wrap ${f.classes.join(" ")}`}>
            <StickFigure view={f.view} pose={f.pose} weapon={f.weapon} armor={f.armor} variant={f.variant} arm={f.arm} lingerFrom={f.lingerFrom} smokeAgo={f.smokeSince !== undefined ? performance.now() - f.smokeSince : undefined} phase2Look={f.phase2Look} flailFire={f.flailFire} waxCaked={f.waxCaked} encased={f.encased} />
            {f.classes.includes("fx-break") && <Shards />}
          </div>
        </button>
      ))}
      {/* The waxed remains burn as candles once the arena is lit. */}
      {placed.filter(({ f }) => f.candle).map(({ f, box }) => {
        const [fx, fy] = toScreen(box, flameOf(f.pose), f.view === "front");
        const sz = box.h * 0.13;
        return (
          <svg key={`candle-${f.id}`} className="arena-candle-flame" style={{ left: fx - sz / 2, top: fy - sz * 0.8, width: sz, height: sz, zIndex: 1001 - Math.round(box.depth * 10) }} viewBox="-10 -16 20 20" aria-hidden="true">
            <circle cx={0} cy={-3} r={9} className="fig-glow" />
            <g className="fig-flame">
              <path d="M0 -12 C4.6 -5 4.4 0 0 0 C-4.4 0 -4.6 -5 0 -12 Z" />
              <path d="M0 -6 C2 -2.4 2 0 0 0 C-2 0 -2 -2.4 0 -6 Z" className="fig-flame-core" />
            </g>
          </svg>
        );
      })}
      {dark && <div className="scene-dark" style={{ opacity: dark.level, transition: `opacity ${dark.ms}ms ease-in` }} />}
      {dark?.flame && (() => {
        const t = placed.find(x => x.f.id === dark.flame);
        if (!t) return null;
        const [fx, fy] = toScreen(t.box, flameOf(t.f.pose), t.f.view === "front");
        // The size of the figure's own flame (the Warden's candle is a little smaller), so it
        // hands over to it seamlessly as the light comes back.
        const sz = t.box.h * (t.f.variant === "warden" ? 0.12 : 0.16);
        return (
          <svg className="scene-lone-flame" style={{ left: fx - sz / 2, top: fy - sz * 0.8, width: sz, height: sz }} viewBox="-10 -16 20 20" aria-hidden="true">
            <circle cx={0} cy={-3} r={9} className="fig-glow" />
            <g className="fig-flame">
              <path d="M0 -12 C4.6 -5 4.4 0 0 0 C-4.4 0 -4.6 -5 0 -12 Z" />
              <path d="M0 -6 C2 -2.4 2 0 0 0 C-2 0 -2 -2.4 0 -6 Z" className="fig-flame-core" />
            </g>
          </svg>
        );
      })()}
      {usurpTrail && (() => {
        const a = placed.find(x => x.f.id === usurpTrail.from), b = placed.find(x => x.f.id === usurpTrail.to);
        if (!a || !b) return null;
        const from = toScreen(a.box, flameOf(a.f.pose), a.f.view === "front");
        const hand = toScreen(b.box, WARDEN_POSES["wd-idle"].freeArm.hand, b.f.view === "front");
        // Arching up over him: the control point well above both.
        const ctl: Pt = [(from[0] + hand[0]) / 2, Math.min(from[1], hand[1]) - b.box.h * 0.22];
        const N = 28, w = b.box.h * 0.05;
        const pts = Array.from({ length: N + 1 }, (_, i) => {
          const t = i / N, u = 1 - t;
          return [u * u * from[0] + 2 * u * t * ctl[0] + t * t * hand[0], u * u * from[1] + 2 * u * t * ctl[1] + t * t * hand[1]] as Pt;
        });
        const band = (k: number) => {
          const l: string[] = [], r: string[] = [];
          pts.forEach((c, i) => {
            const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(N, i + 1)];
            const d = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1;
            const nx = -(p1[1] - p0[1]) / d, ny = (p1[0] - p0[0]) / d;
            const ww = w * k * (0.25 + 0.75 * (i / N));
            l.push(`${i ? "L" : "M"}${c[0] + nx * ww} ${c[1] + ny * ww}`);
            r.unshift(`L${c[0] - nx * ww} ${c[1] - ny * ww}`);
          });
          return `${l.join(" ")} ${r.join(" ")} Z`;
        };
        return (
          <svg key={usurpTrail.key} className="shockwave usurp-trail-layer" aria-hidden="true">
            <g className="usurp-trail">
              <path d={band(1)} className="fig-trail-flame-outer" />
              <path d={band(0.44)} className="fig-trail-flame-core" />
            </g>
          </svg>
        );
      })()}
      {ignite && igniter && (() => {
        const t = ignite.t;
        const [hx, hy] = toScreen(igniter.box, WARDEN_POSES["wd-idle"].freeArm.hand, igniter.f.view === "front");
        const drawn = sources.filter(src => t >= src.draw).length / Math.max(1, sources.length);
        const flame = (key: string, at: Pt, sz: number, cls = "") => (
          <svg key={key} className={`scene-lone-flame ${cls}`} style={{ left: at[0] - sz / 2, top: at[1] - sz * 0.8, width: sz, height: sz }} viewBox="-10 -16 20 20" aria-hidden="true">
            <circle cx={0} cy={-3} r={9} className="fig-glow" />
            <g className="fig-flame">
              <path d="M0 -12 C4.6 -5 4.4 0 0 0 C-4.4 0 -4.6 -5 0 -12 Z" />
              <path d="M0 -6 C2 -2.4 2 0 0 0 C-2 0 -2 -2.4 0 -6 Z" className="fig-flame-core" />
            </g>
          </svg>
        );
        return (
          <>
            {/* Flames kindling in the dark. */}
            {t < IGNITE.flare && sources.filter(src => src.seen && t >= src.kindle && t < src.draw).map(src => flame(`src-${src.id}`, src.at, igniter.box.h * 0.1, "is-kindling"))}
            {/* Each one streaming into his hand, arching up as it comes. */}
            <svg className="shockwave usurp-trail-layer" aria-hidden="true">
              {sources.filter(src => t >= src.draw && t < src.draw + 700).map(src => {
                const ctl: Pt = [(src.at[0] + hx) / 2, Math.min(src.at[1], hy) - igniter.box.h * 0.35];
                const d = `M${src.at[0]} ${src.at[1]} Q${ctl[0]} ${ctl[1]} ${hx} ${hy}`;
                return (
                  <g key={`trail-${src.id}`} className="ignite-trail">
                    <path d={d} className="ignite-trail-outer" />
                    <path d={d} className="ignite-trail-core" />
                  </g>
                );
              })}
            </svg>
            {/* His flame, growing as they pour in. */}
            {t >= IGNITE.draw && t < IGNITE.flare + 300 && flame("hand", [hx, hy], igniter.box.h * (0.1 + 0.3 * drawn), "is-gathering")}
            {/* Then it flares, and a ring of fire rolls out from him. */}
            {t >= IGNITE.flare && (
              <>
                <div key={`flare-${ignite.seed}`} className="blast-flash ignite-flare" style={{ left: hx, top: hy, width: igniter.box.h * 1.4, height: igniter.box.h * 1.4 }}>
                  <svg viewBox="-50 -50 100 100" className="shockwave-svg">
                    <circle cx={0} cy={0} r={48} className="fig-burst-outer" />
                    <circle cx={-6} cy={4} r={34} className="blast-mid" />
                    <circle cx={-10} cy={6} r={20} className="fig-burst-inner" />
                  </svg>
                </div>
                {posNow(ignite.who) && <Shockwave key={`ring-${ignite.seed}`} center={posNow(ignite.who)!} reach={16} toward={0} flame={0.9} proj={proj} full />}
              </>
            )}
          </>
        );
      })()}
      {projectiles.map(pr => {
        const thrower = placed.find(x => x.f.id === pr.from);
        const a = thrower?.box;
        const b = placed.find(x => x.f.id === pr.to)?.box;
        if (!a || !b) return null;
        // From the thrower's chest height to the target's, and on through it.
        const sx = a.x + a.w / 2, sy = a.y + a.h * 0.42;
        const tx = b.x + b.w / 2, ty = b.y + b.h * 0.45;
        const dx = tx - sx, dy = ty - sy;
        // Past the target it keeps coming, toward the camera: further along, and down the screen.
        const ex = dx * 1.35, ey = dy + b.h * 0.35;
        const size = Math.max(a.h, b.h) * (pr.kind === "wax" ? 0.12 : pr.kind === "fan" ? 1.1 : 0.45);
        const flight = (Math.atan2(dy, dx) * 180) / Math.PI;
        const angle = pr.kind === "fan" ? 0 : flight; // the fan's lean is drawn into its shape
        if (pr.kind === "impact") {
          // A melee blow into the ground: no fire, just a small white ring kicked out flat across
          // the floor from the fist.
          const o = pr.origin;
          const ox = o ? (thrower!.f.view === "front" ? 100 - o[0] : o[0]) / 100 : 0.5;
          const ax = a.x + a.w * ox, ay = o ? a.y + (a.h * o[1]) / 120 : a.y + a.h * 0.95;
          return (
            <div key={pr.key}>
              {!pr.fiery && <ImpactRing cx={ax} cy={ay} reach={a.h * 0.4} />}
              {(() => {
                const A = posNow(pr.from), B = posNow(pr.to);
                if (!A || !B) return null;
                const at = floorAt(A, ax);
                // A flaming flail's burns, like a small Flame Blast.
                return pr.fiery
                  ? <Shockwave center={at} reach={1.8} toward={Math.atan2(B.z - at.z, B.x - at.x)} flame={1} proj={proj} />
                  : <Shockwave center={at} reach={1.5} toward={Math.atan2(B.z - at.z, B.x - at.x)} flame={0.8} proj={proj} impact />;
              })()}
            </div>
          );
        }
        if (pr.kind === "blast") {
          // A giant fireball flashes in before him and fades fast; a shockwave of flame follows
          // through, spreading flat across the floor from his feet. Seen at the same 3/4 angle
          // as the fan, it's a ring, but only burns on the side heading for the target: tall
          // flames there, dying away around the sides, nothing behind him and nothing inside.
          // It all comes from his fist striking the ground (or his feet, without one).
          const o = pr.origin;
          const ox = o ? (thrower!.f.view === "front" ? 100 - o[0] : o[0]) / 100 : 0.5;
          const ax = a.x + a.w * ox, ay = o ? a.y + (a.h * o[1]) / 120 : a.y + a.h * 0.95;
          const bx = tx;
          const fx = o ? ax : ax + (bx - ax) * 0.2, fy = o ? ay - a.h * 0.12 : (a.y + a.h * 0.45) + (ty - (a.y + a.h * 0.45)) * 0.2;
          const ball = a.h * 0.9;
          return (
            <div key={pr.key}>
              <div className="blast-flash" style={{ left: fx, top: fy, width: ball, height: ball }}>
                <svg viewBox="-50 -50 100 100" className="shockwave-svg">
                  <circle cx={0} cy={0} r={48} className="fig-burst-outer" />
                  <circle cx={-6} cy={4} r={34} className="blast-mid" />
                  <circle cx={-10} cy={6} r={20} className="fig-burst-inner" />
                </svg>
              </div>
              {(() => {
                const A = posNow(pr.from), B = posNow(pr.to);
                if (!A || !B) return null;
                const at = floorAt(A, ax);
                // It passes on through the target.
                return <Shockwave center={at} reach={Math.hypot(B.x - at.x, B.z - at.z) * 1.25} toward={Math.atan2(B.z - at.z, B.x - at.x)} flame={1.4} proj={proj} />;
              })()}
            </div>
          );
        }
        return (
          <div
            key={pr.key}
            className={`projectile projectile-${pr.kind}`}
            style={{
              left: sx, top: sy, width: size, height: pr.kind === "fan" ? size * 0.32 : size,
              ["--dx" as string]: `${dx}px`, ["--dy" as string]: `${dy}px`,
              ["--ex" as string]: `${ex}px`, ["--ey" as string]: `${ey}px`, ["--rot" as string]: `${angle}deg`,
            }}
          >
            <ProjectileShape kind={pr.kind} />
          </div>
        );
      })}
    </div>
  );
}

/** Faint lines on the floor, drawn in perspective, so the ground visibly moves when the camera does. */
function FloorGrid({ cam, w, h }: { cam: Cam; w: number; h: number }) {
  const SPACING = 2;
  const RANGE = 40;
  // Snap the grid to whole cells around the camera, so lines stay put in the world as it moves.
  const ox = Math.round(cam.x / SPACING) * SPACING;
  const oz = Math.round(cam.z / SPACING) * SPACING;
  const segment = (a: Vec, b: Vec) => {
    let A = toCamera(cam, a);
    let B = toCamera(cam, b);
    if (A.v < NEAR && B.v < NEAR) return null;
    // Clip the part behind the camera.
    if (A.v < NEAR) A = { u: A.u + ((B.u - A.u) * (NEAR - A.v)) / (B.v - A.v), v: NEAR };
    if (B.v < NEAR) B = { u: B.u + ((A.u - B.u) * (NEAR - B.v)) / (A.v - B.v), v: NEAR };
    const p = screenOf(A.u, A.v, w, h);
    const q = screenOf(B.u, B.v, w, h);
    return `M${p.sx} ${p.sy}L${q.sx} ${q.sy}`;
  };
  const paths: string[] = [];
  for (let i = -RANGE; i <= RANGE; i += SPACING) {
    const s1 = segment({ x: ox + i, z: oz - RANGE }, { x: ox + i, z: oz + RANGE });
    const s2 = segment({ x: ox - RANGE, z: oz + i }, { x: ox + RANGE, z: oz + i });
    if (s1) paths.push(s1);
    if (s2) paths.push(s2);
  }
  return (
    <svg className="scene-grid" width={w} height={h} aria-hidden="true">
      <path d={paths.join("")} />
    </svg>
  );
}