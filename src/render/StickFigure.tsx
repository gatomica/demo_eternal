/**
 * StickFigure.tsx — a figure: the stick body, its gear, wax and held props (the Warden is drawn
 * in warden/). Drawing only; no game rules live here.
 *
 * The camera looks at the fight from a 3/4 angle: the player stands on the left, seen from
 * behind and facing right into the scene; enemies stand on the right, seen from the front
 * and facing left toward the player.
 *
 * Both use the same poses, drawn facing right. What changes is depth:
 *  - The player's weapon arm is the far arm, so it and the weapon are drawn behind the body.
 *  - An enemy carries its weapon in its right hand too: the far arm, drawn behind the body, and the
 *    figure is mirrored. (The waxed carry nothing: their arms keep their own depth.)
 * Gear attaches to joints: the weapon to the weapon hand, armor to the torso, shoulders and head.
 */
import { memo } from "react";
import type { Variant } from "../core/bestiary";
import type { ArmorTier, Side, WeaponTier } from "../core/types";
import { lerp, limb, type Pt } from "./geom";
import { lookOf } from "./looks";
import { ALL_POSES, type PoseName, type Skeleton } from "./poses";
import { fitLimbs, fitTorso } from "./rig";
import { SideTags } from "./SideTags";
import type { CandleArm, WardenPoseName } from "../warden/skeleton";

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

/**
 * A foe's frail torso: a spine as thick as its limbs rising from the hips to a filled, skinny
 * ribcage, where the shoulders and, through a neck as thick as the limbs, the head attach. The ribs
 * are thin shaded moons lying sideways (flat bowls), in two columns, one per half of the ribcage.
 * Straight on the columns match. At 3/4 the near half is the prominent one: its ribs sit close to the
 * middle and run long, while the far half's are short and pressed against the edge.
 * `nearSide`: which way on the page the near shoulder is (-1, 1, or 0 straight on).
 * Seen from behind the ribs are typically on the front only: none straight on, and at 3/4 just the short moons
 * at the edge of the prominent (near) side, where the ribs wrap around.
 */
function Ribcage({ s, nearSide, behind }: { s: Skeleton; nearSide: number; behind: boolean }) {
  const [nx, ny] = s.neck;
  // The ribcage follows the spine from the neck to the waist, if it has one (an arched back), else to the hip.
  const [px, py] = s.waist ?? s.hip;
  const len = s.waist ? Math.hypot(px - nx, py - ny) + Math.hypot(s.hip[0] - px, s.hip[1] - py) : Math.hypot(px - nx, py - ny);
  const mid = lerp(s.neck, s.waist ?? s.hip, s.waist ? (0.25 * len) / Math.hypot(px - nx, py - ny) : 0.25);
  const turn = (Math.atan2(nx - px, py - ny) * 180) / Math.PI; // the spine's lean, from straight down
  const ry = len * 0.3;
  const rows = [-0.55, -0.05, 0.45].map(k => k * ry);
  const EDGE = 6.6; // half the ribcage's width
  // Each column runs from `from` to `to` across the page, measured from the middle of the ribcage.
  const farColumn = { from: -nearSide * 4.6, to: -nearSide * EDGE };
  const columns = behind
    ? nearSide === 0 ? [] : [{ from: nearSide * 4.6, to: nearSide * EDGE }]
    : nearSide === 0
      ? [{ from: -1, to: -6 }, { from: 1, to: 6 }]
      : [{ from: nearSide * 0.6, to: nearSide * 5.6 }, farColumn];
  /** A thin sideways moon: a flat bowl, and the flatter one back inside it. */
  const moon = (from: number, to: number, y: number) => {
    const lo = Math.min(from, to), hi = Math.max(from, to), half = (hi - lo) / 2;
    return `M${lo} ${y} A${half} 1.8 0 0 0 ${hi} ${y} A${half} 0.7 0 0 1 ${lo} ${y} Z`;
  };
  return (
    <g>
      <polyline points={limb(s.head, s.neck)} className="fig-limb" />
      <polyline points={s.waist ? limb(s.neck, s.waist, s.hip) : limb(s.neck, s.hip)} className="fig-limb" />
      <g transform={`translate(${mid[0]} ${mid[1]}) rotate(${turn})`}>
        <ellipse cx={0} cy={0} rx={EDGE} ry={ry} className="fig-ribcage" />
        {columns.flatMap(c => rows.map(y => <path key={`${c.from}${y}`} d={moon(c.from, c.to, y)} className="fig-rib" />))}
      </g>
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

interface StickFigureProps {
  /** "back": the player, seen from behind, facing right.
   *  "front": an enemy, seen from the front, facing left toward the player. */
  view: "front" | "back";
  pose: PoseName;
  weapon: WeaponTier;
  armor: ArmorTier;
  title?: string;
  /** "waxed": kneeling, shins bound together and head sealed in wax. "warden": the Penitent Warden. */
  variant?: Variant;
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
  /**
   * Seen straight on, not at a 3/4 angle (the Model viewer): `front` facing the camera, `back` away from it.
   * The shoulders and hips sit level and apart, nothing is mirrored, and no limb is layered by depth.
   */
  straight?: boolean;
  /** An enemy (frail, a ribcage and no solid torso), whichever way it's seen. Default: seen from the front. */
  foe?: boolean;
  /** The hand that holds the weapon (default right). */
  hand?: Side;
  /** Label the hands and feet R and L (the Model stance). */
  sides?: boolean;
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
  const back = lerp(s.neck, s.hip, 0.35);
  const arm = lerp(s.freeArm.elbow, s.freeArm.hand, 0.4);
  const thigh = lerp(s.hip, s.leadLeg.knee, 0.5);
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

/** Colour the right arm and leg while posing (dev server only): see `debug` in StickFigure below. Off for now. */
const DEBUG_LIMB_COLORS = import.meta.env.DEV && false;

/** How much a T-pose's sideways arms are foreshortened in a 3/4 view (they run across the view). */
const ACROSS_34 = 0.72;

/** A figure, redrawn only when something about its look changes (the scene redraws every frame). */
export const StickFigure = memo(function StickFigure({ view, pose, weapon, armor, title, variant, arm, lingerFrom, smokeAgo, phase2Look, flailFire, waxCaked, encased, straight = false, foe, hand = "right", sides = false }: StickFigureProps) {
  const raw = ALL_POSES[pose];
  const front = view === "front";
  // A look that draws itself (the Warden), in its own poses.
  const own = lookOf(variant)?.figure;
  if (own?.owns(raw)) {
    return (
      <svg viewBox="0 0 100 120" className={`figure figure-${view}`} role="img" aria-label={title}>
        {title && <title>{title}</title>}
        <ellipse cx={50} cy={115} rx={own.shadow.rx} ry={own.shadow.ry} className="fig-shadow" />
        <g transform={front && !straight ? "translate(100 0) scale(-1 1)" : undefined}>
          {own.draw({ s: raw, front, straight, sides, arm, lingerFrom, smokeAgo, phase2Look, flailFire })}
        </g>
      </svg>
    );
  }
  const waxed = variant === "waxed";
  // The player and the foes are re-solved to the rig (rig.ts): each bone keeps its direction from the
  // pose but has its true length. First the torso, which the shoulders and hips are placed on.
  const base = fitTorso(raw);
  const [hx, hy] = base.head;
  const [nx, ny] = base.neck;
  // Turned 3/4, the shoulders sit slightly apart: the near one lower, toward the camera. A foe
  // (not the waxed) turns its left shoulder toward the player, ahead of it, and its right, with the
  // weapon, away; the player and the waxed have it the other way round.
  // Foes (but the waxed) are frail: a thin spine and a skinny ribcage rather than a solid torso.
  const frail = (foe ?? front) && !waxed;
  // A crossing strike twists the shoulders and hips the other way, brings the weapon arm across in
  // front of the body, and puts the right leg forward, the left behind.
  const crossing = !!raw.crossing && !waxed;
  const turned = front && !waxed && !crossing || !front && crossing;
  // (A crossing strike twists them in depth: the right shoulder swung to the front, toward the
  // camera and so lower on screen, the left to the back, away from it and higher, both staying
  // close to the middle of the ribcage. Remember the 3/4 view: front and back are depth.)
  // Seen straight on, the shoulders sit level either side of the neck, the weapon (right) one toward -x
  // from the front (the figure's right is the page's left), +x from behind.
  const side = front ? -1 : 1;
  // The model (a T-pose seen at 3/4): the body is yawed toward the camera, so the right (weapon) shoulder
  // is on the player's side of the page, from the front (the far one), and on the other, from behind (the
  // near one). Always the weapon arm goes out toward its own side: the same side as straight on.
  // A pose can be turned like the model too (`torso34`): then the model's 3/4 body, whichever way it's seen from.
  const yaw = raw.torso34 ?? (raw.armsOut ? (front ? "front" : "back") : undefined);
  const yawFront = yaw === "front";
  const modelled = !!yaw && !straight;
  const nearShoulder: Pt = straight ? [nx - 6 * side, ny + 2] : modelled ? [nx + (yawFront ? -5 : 5), ny + 3] : crossing ? [nx + 2, ny + 7] : [nx + (turned ? 3 : -3), ny + 4];
  const farShoulder: Pt = straight ? [nx + 6 * side, ny + 2] : modelled ? [nx + (yawFront ? 5 : -5), ny + 3] : crossing ? [nx - 2, ny - 1] : [nx + (turned ? -3 : 3), ny + 2];
  // The hips are set apart the same way, so the legs read as a left and a right: the near hip
  // carries the leading leg, the far hip the one behind. (The waxed kneel, legs bound as one.)
  // Straight on the hips are level. (A crossing strike has its own twist.)
  // In the model the shoulders and the hips are each level, and the hips close together, nearly square to the
  // player. Each hip is on its own side of the body, the same page side as the shoulder above it (the right one
  // toward +x, like the weapon arm), and nearer or farther like that shoulder: from the front the right side is
  // the far one, from behind the near one.
  const nearHip: Pt = waxed ? base.hip : modelled ? [base.hip[0] + (yawFront ? -2 : 2), base.hip[1]] : straight ? [base.hip[0] - 3.5 * side, base.hip[1]] : [base.hip[0] + (turned ? 2 : -2), base.hip[1] + 1];
  const farHip: Pt = waxed ? base.hip : modelled ? [base.hip[0] + (yawFront ? 2 : -2), base.hip[1]] : straight ? [base.hip[0] + 3.5 * side, base.hip[1]] : [base.hip[0] + (turned ? -2 : 2), base.hip[1] - 1];

  // Which side is which. The right shoulder is the near one when crossing, in the model seen from behind, and
  // for the waxed seen from the front; otherwise (the default 3/4 views, straight on) it's the far one. The
  // hips are twisted the other way in the crossing strike (the right hip is the far one then); in the model
  // each hip is as near or far as the shoulder on its side.
  const rightIsNear = straight ? false : modelled ? !yawFront : crossing ? true : front && waxed;
  const rightHipNear = waxed ? false : modelled ? rightIsNear : crossing ? !rightIsNear : rightIsNear;
  const shoulderOf = (side: Side) => ((side === "right") === rightIsNear ? nearShoulder : farShoulder);
  const hipOf = (side: Side) => ((side === "right") === rightHipNear ? nearHip : farHip);
  // The weapon is held in the `hand` hand (the right, by default): that arm and its shoulder, and the leading
  // leg from the hip of its own side.
  const weaponShoulder = shoulderOf(hand);
  const freeShoulder = shoulderOf(hand === "right" ? "left" : "right");
  const leadSide = raw.leadSide ?? "left";
  const leadHip = hipOf(leadSide);
  const rearHip = hipOf(leadSide === "right" ? "left" : "right");
  const leadIsNear = (leadSide === "right") === rightHipNear;
  // An arm in front of the body is the near one; straight on, both arms sit behind it, in one tone.
  // The weapon arm can also cross in front of the body from the far shoulder (`weaponOver`): then it is drawn over
  // the torso, and the other arm keeps to its own side.
  const weaponShoulderNear = (hand === "right") === rightIsNear;
  const weaponBehind = straight || (!weaponShoulderNear && !raw.weaponOver);
  const freeBehind = straight || weaponShoulderNear;
  // Then the limbs from them, and how far the figure drops so its feet stay where the pose put them.
  const fit = fitLimbs(base, { weaponShoulder, freeShoulder, leadHip, rearHip, across: straight ? 1 : ACROSS_34, weaponLength: WEAPON_REACH[weapon] });
  const s = fit.skeleton;
  // Debugging: the right arm and the right leg are coloured (set DEBUG_LIMB_COLORS). Blue: the far one. Red: the near
  // arm, or the leading leg. Purple: a leg that is both far and leading. (Not for the waxed.)
  const debug = (far: boolean, lead: boolean) => (!DEBUG_LIMB_COLORS || waxed ? "" : far && lead ? " dbg-both" : lead ? " dbg-lead" : far ? " dbg-far" : "");
  const rightArmDebug = debug(!rightIsNear, rightIsNear);
  const rightLeadDebug = leadSide === "right";
  // The weapon arm's upper arm (shoulder to elbow) can be drawn behind everything while its forearm stays in front
  // (`upperArmBehind`, for an arm crossing the body): the upper arm in the far tone, drawn first.
  const upperBehind = !!raw.upperArmBehind && !weaponBehind;
  const weaponDebug = hand === "right" ? rightArmDebug : "";
  const weaponUpperArm = upperBehind && (
    <polyline points={limb(weaponShoulder, s.weaponArm.elbow)} className={`fig-limb fig-far${weaponDebug}`} />
  );
  const weaponArm = (
    <polyline points={upperBehind ? limb(s.weaponArm.elbow, s.weaponArm.hand) : limb(weaponShoulder, s.weaponArm.elbow, s.weaponArm.hand)} className={`fig-limb ${weaponBehind && !straight ? "fig-far" : ""}${weaponDebug}`} />
  );
  const freeArm = (
    <polyline points={limb(freeShoulder, s.freeArm.elbow, s.freeArm.hand)} className={`fig-limb ${freeBehind && !straight ? "fig-far" : ""}${hand === "left" ? rightArmDebug : ""}`} />
  );
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
      <g transform={front && !straight ? "translate(100 0) scale(-1 1)" : undefined}>
       <g transform={fit.drop ? `translate(0 ${fit.drop})` : undefined}>
        {(pose === "strike" || pose === "sw-chop") && weapon !== "baseline" && <StrikeTrail s={s} tier={weapon} />}
        {weaponUpperArm}
        {weaponBehind && weaponEl}
        {weaponBehind && weaponArm}
        {freeBehind && freeArm}
        <polyline points={leadIsNear ? limb(rearHip, s.rearLeg.knee, s.rearLeg.foot) : limb(leadHip, s.leadLeg.knee, s.leadLeg.foot)} className={`fig-limb ${straight ? "" : "fig-far"}${rightHipNear ? "" : debug(true, rightLeadDebug)}`} />
        {waxed && <WaxBinding s={s} />}
        <polyline points={limb(farShoulder, nearShoulder)} className="fig-limb" />
        {frail ? <Ribcage s={s} nearSide={straight ? 0 : Math.sign(nearShoulder[0] - nx)} behind={yaw ? !yawFront : !front || !!raw.ribsBehind} /> : <polyline points={s.waist ? limb(s.neck, s.waist, s.hip) : limb(s.neck, s.hip)} className="fig-limb" />}
        {!waxed && <polyline points={limb(farHip, nearHip)} className="fig-limb" />}
        <Armor tier={armor} s={s} near={nearShoulder} />
        <circle cx={hx} cy={hy} r={7.5} className="fig-head" />
        {armor === "heavy" && <Helmet s={s} />}
        {front && !waxed && (
          // Only enemies show a face, turned toward the player (or the camera, straight on). The player is
          // always seen from behind.
          <g className="fig-eyes">
            {straight ? (
              <>
                <circle cx={hx - 2.8} cy={hy + (raw.gaze ?? 0)} r={1.3} />
                <circle cx={hx + 2.8} cy={hy + (raw.gaze ?? 0)} r={1.3} />
              </>
            ) : (
              <>
                <circle cx={hx + 2} cy={hy + (raw.gaze ?? 0)} r={1.3} />
                <circle cx={hx + 5.4} cy={hy + (raw.gaze ?? 0)} r={1.2} />
              </>
            )}
          </g>
        )}
        {/* The waxed's shins are under the binding, behind the body: only the thigh shows in front. */}
        <polyline points={waxed ? limb(s.hip, s.leadLeg.knee) : leadIsNear ? limb(leadHip, s.leadLeg.knee, s.leadLeg.foot) : limb(rearHip, s.rearLeg.knee, s.rearLeg.foot)} className={`fig-limb${rightHipNear ? debug(false, rightLeadDebug) : ""}`} />
        {waxed && <WaxHead s={s} />}
        {!freeBehind && freeArm}
        {!weaponBehind && weaponEl}
        {!weaponBehind && weaponArm}
        {s.prop && <Prop prop={s.prop} />}
        {waxCaked && <WaxCaked s={s} near={nearShoulder} />}
        {encased && <WaxShell s={s} near={nearShoulder} far={farShoulder} />}
        {sides && <SideTags s={s} hand={hand} flip={front && !straight} />}
       </g>
      </g>
    </svg>
  );
});
