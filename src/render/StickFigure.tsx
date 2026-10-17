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
 *  - An enemy's weapon arm is the near arm, so it's drawn in front, and the figure is mirrored.
 * Gear attaches to joints: the weapon to the weapon hand, armor to the torso, shoulders and head.
 */
import { memo } from "react";
import type { Variant } from "../core/bestiary";
import type { ArmorTier, WeaponTier } from "../core/types";
import { lerp, limb, type Pt } from "./geom";
import { lookOf } from "./looks";
import { ALL_POSES, type PoseName, type Skeleton } from "./poses";
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

/** A figure, redrawn only when something about its look changes (the scene redraws every frame). */
export const StickFigure = memo(function StickFigure({ view, pose, weapon, armor, title, variant, arm, lingerFrom, smokeAgo, phase2Look, flailFire, waxCaked, encased }: StickFigureProps) {
  const s = ALL_POSES[pose];
  const front = view === "front";
  // A look that draws itself (the Warden), in its own poses.
  const own = lookOf(variant)?.figure;
  if (own?.owns(s)) {
    return (
      <svg viewBox="0 0 100 120" className={`figure figure-${view}`} role="img" aria-label={title}>
        {title && <title>{title}</title>}
        <ellipse cx={50} cy={115} rx={own.shadow.rx} ry={own.shadow.ry} className="fig-shadow" />
        <g transform={front ? "translate(100 0) scale(-1 1)" : undefined}>
          {own.draw({ s, front, arm, lingerFrom, smokeAgo, phase2Look, flailFire })}
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
});
