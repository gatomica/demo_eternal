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
import { WARDEN_POSES, WardenFigure, type CandleArm, type WardenPoseName, type WardenSkeleton } from "./warden";
import { HORIZON, NEAR, FIGURE_HEIGHT, ease, lerpAngle, lerpCam, lerpVec, planningCamera, project, screenOf, toCamera, type Cam, type Vec } from "./scene";

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
  | "w-cower" | "w-crawl" | "w-cradle" | "w-clutch" | "w-fallen"
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
export const POSES: Record<Exclude<PoseName, WardenPoseName>, Skeleton> = {
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

export interface StickFigureProps {
  /** "back": the player, seen from behind, facing right.
   *  "front": an enemy, seen from the front, facing left toward the player. */
  view: "front" | "back";
  pose: PoseName;
  weapon: WeaponTier;
  armor: ArmorTier;
  dim?: boolean;
  className?: string;
  title?: string;
  /** "waxed": kneeling, shins bound together and head sealed in wax. "warden": the Penitent Warden. */
  variant?: "waxed" | "warden";
  /** The Warden's candle arm. */
  arm?: CandleArm;
  /** The Warden: keep the trails of the spins he just finished fading. */
  lingerTrail?: boolean;
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

export function StickFigure({ view, pose, weapon, armor, dim, className, title, variant, arm, lingerTrail }: StickFigureProps) {
  const s = ALL_POSES[pose];
  const front = view === "front";
  if (variant === "warden" && "ball" in s) {
    return (
      <svg viewBox="0 0 100 120" className={`figure figure-${view} ${dim ? "is-dim" : ""} ${className ?? ""}`} role="img" aria-label={title}>
        {title && <title>{title}</title>}
        <ellipse cx={50} cy={115} rx={28} ry={3.2} className="fig-shadow" />
        <g transform={front ? "translate(100 0) scale(-1 1)" : undefined}>
          <WardenFigure s={s as WardenSkeleton} front={front} arm={arm ?? "lit"} lingerTrail={lingerTrail} />
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
    <svg viewBox="0 0 100 120" className={`figure figure-${view} ${dim ? "is-dim" : ""} ${className ?? ""}`} role="img" aria-label={title}>
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
export const BAR_FULL_HP = 120;

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

export function Shards({ count = 14, small }: { count?: number; small?: boolean }) {
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

/** Where a figure standing at `p` appears on screen: its 100 × 120 drawing box, and its depth. */
/** `scale`: how much bigger than a normal figure (the Warden towers over everyone). */
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
  lingerTrail?: boolean;
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

/**
 * Draws the floor and every figure through the camera. When a new shot arrives, everyone (and
 * the camera) moves from wherever they are right now to the new spots, over the shot's duration.
 */
/** Something thrown across the field during a beat: from a figure to another, passing through it. */
export interface Projectile {
  from: string;
  to: string;
  kind: "fan" | "blast" | "wax";
  /** Changes every beat, so the flight replays. */
  key: string;
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

/**
 * Flame Blast's shockwave: a ring lying flat on the floor (an ellipse, the floor seen at an
 * angle) centered at (cx, cy), spreading out to `reach`. Only the side facing `toward` (radians,
 * in the ring's own unsquashed terms) burns: flames tallest straight ahead, dying away around the
 * sides, nothing behind or inside. The ring grows but its flames keep their size, so it reads as
 * a widening ring rather than something coming at the camera; they only grow taller as it
 * advances. Drawn in screen pixels.
 */
function Shockwave({ cx, cy, reach, toward, flame }: { cx: number; cy: number; reach: number; toward: number; flame: number }) {
  const [p, setP] = useState(0);
  useEffect(() => {
    const start = performance.now() + SHOCK_DELAY_MS;
    let raf = 0;
    const tick = () => {
      const k = Math.min(1, Math.max(0, (performance.now() - start) / SHOCK_MS));
      setP(k);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  if (p <= 0) return null;
  const SQUASH = 0.3;
  const eased = 1 - (1 - p) ** 2.2;
  const rx = reach * (0.08 + 0.92 * eased), ry = rx * SQUASH;
  const opacity = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
  // Flames sit evenly along the burning arc, a fixed distance apart, whatever the ring's size.
  const spacing = flame * 0.16;
  const step = Math.max(0.035, spacing / rx);
  const flames: { y: number; d: string; core: string }[] = [];
  const arc: string[] = [];
  for (let off = -1.47; off <= 1.47; off += step) {
    const t = toward + off;
    const w = Math.cos(off);
    const x = cx + rx * Math.cos(t), y = cy + ry * Math.sin(t);
    arc.push(`${arc.length ? "L" : "M"}${x} ${y}`);
    if (w < 0.2) continue;
    // The flames rise as the wave advances: low as it leaves his feet, full height by the time
    // it reaches you.
    const hgt = flame * (0.25 + 0.95 * eased) * w ** 1.6;
    const half = flame * (0.06 + 0.04 * w);
    const lean = Math.cos(t) * flame * 0.05; // flames lean outward a little
    const tongue = (k: number) => {
      const hh = hgt * k, ww = half * k;
      return `M${x - ww} ${y} Q${x - ww * 0.6 + lean * 0.5 * k} ${y - hh * 0.55} ${x + lean * k} ${y - hh} Q${x + ww * 0.7 + lean * 0.4 * k} ${y - hh * 0.45} ${x + ww} ${y} Z`;
    };
    flames.push({ y, d: tongue(1), core: tongue(0.5) });
  }
  flames.sort((m, n) => m.y - n.y); // farther ones first
  return (
    <svg className="shockwave" style={{ opacity }} aria-hidden="true">
      {/* The glowing edge goes underneath, so the flames hide it where they stand. */}
      <path d={arc.join(" ")} className="shockwave-ring" />
      <path d={arc.join(" ")} className="shockwave-ring-inner" />
      {flames.map((f, i) => (
        <g key={i}>
          <path d={f.d} className="fig-burst-outer" />
          <path d={f.core} className="fig-burst-inner" />
        </g>
      ))}
    </svg>
  );
}

export function Scene({ figures, shot, projectiles = [] }: { figures: SceneFigure[]; shot: SceneShot; projectiles?: Projectile[] }) {
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

  return (
    <div className="scene" ref={boxRef}>
      <div className="scene-floor" style={{ top: `${HORIZON * 100}%` }} />
      {w > 0 && <FloorGrid cam={c} w={w} h={h} />}
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
            <StickFigure view={f.view} pose={f.pose} weapon={f.weapon} armor={f.armor} variant={f.variant} arm={f.arm} lingerTrail={f.lingerTrail} />
            {f.classes.includes("fx-break") && <Shards />}
          </div>
        </button>
      ))}
      {projectiles.map(pr => {
        const a = placed.find(x => x.f.id === pr.from)?.box;
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
        if (pr.kind === "blast") {
          // A giant fireball flashes in before him and fades fast; a shockwave of flame follows
          // through, spreading flat across the floor from his feet. Seen at the same 3/4 angle
          // as the fan, it's a ring, but only burns on the side heading for the target: tall
          // flames there, dying away around the sides, nothing behind him and nothing inside.
          const ax = a.x + a.w / 2, ay = a.y + a.h * 0.95, bx = tx, by = b.y + b.h * 0.95;
          const SQUASH = 0.3; // the floor seen at an angle: circles become flat ellipses
          const toward = Math.atan2((by - ay) / SQUASH, bx - ax);
          const reach = Math.hypot(bx - ax, (by - ay) / SQUASH) * 1.25; // passes through the target
          const fx = ax + (bx - ax) * 0.2, fy = (a.y + a.h * 0.45) + (ty - (a.y + a.h * 0.45)) * 0.2;
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
              <Shockwave cx={ax} cy={ay} reach={reach} toward={toward} flame={b.h * 0.75} />
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