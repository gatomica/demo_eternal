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
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { ArmorTier, Enemy, Fighter, Tier } from "./combat";

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
}

export type PoseName = "idle" | "attack" | "block" | "maneuver" | "rest";

/** Drawn facing right in a 100 × 120 box, feet on y = 114. */
export const POSES: Record<PoseName, Skeleton> = {
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
};

/** Which pose an enemy shows for what it's about to do. */
export const poseForIntent = (e: Enemy): PoseName => (e.alive ? e.intent.type : "rest");

/* ============================================================
 * Gear
 * ============================================================ */

/** Weapons are drawn along +x from the grip at (0, 0). */
function Weapon({ tier }: { tier: Tier }) {
  switch (tier) {
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

/* ============================================================
 * The figure
 * ============================================================ */

const limb = (...pts: Pt[]) => pts.map(p => p.join(",")).join(" ");

export interface StickFigureProps {
  /** "back": the player, seen from behind, facing right.
   *  "front": an enemy, seen from the front, facing left toward the player. */
  view: "front" | "back";
  pose: PoseName;
  weapon: Tier;
  armor: ArmorTier;
  dim?: boolean;
  className?: string;
  title?: string;
}

export function StickFigure({ view, pose, weapon, armor, dim, className, title }: StickFigureProps) {
  const s = POSES[pose];
  const front = view === "front";
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
  const weaponEl = (
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
        {!front && weaponEl}
        {!front && weaponArm}
        {front && freeArm}
        <polyline points={limb(s.hip, s.rearLeg.knee, s.rearLeg.foot)} className="fig-limb fig-far" />
        <polyline points={limb(farShoulder, nearShoulder)} className="fig-limb" />
        <line x1={nx} y1={ny} x2={s.hip[0]} y2={s.hip[1]} className="fig-limb" />
        <Armor tier={armor} s={s} near={nearShoulder} />
        <circle cx={hx} cy={hy} r={7.5} className="fig-head" />
        {armor === "heavy" && <Helmet s={s} />}
        {front && (
          // Only enemies show a face, turned toward the player. The player is always seen from behind.
          <g className="fig-eyes">
            <circle cx={hx + 2} cy={hy} r={1.3} />
            <circle cx={hx + 5.4} cy={hy} r={1.2} />
          </g>
        )}
        <polyline points={limb(s.hip, s.leadLeg.knee, s.leadLeg.foot)} className="fig-limb" />
        {!front && freeArm}
        {front && weaponEl}
        {front && weaponArm}
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

function Segments({ v, maxHP }: { v: BarValues; maxHP: number }) {
  const pct = (x: number) => `${(Math.max(0, x) / maxHP) * 100}%`;
  return (
    <>
      <i className="bar-room" style={{ width: pct(v.hp - v.fatigue) }} />
      <i className="bar-fatigue" style={{ width: pct(v.fatigue) }} />
      <i className="bar-death" style={{ width: pct(v.death) }} />
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
 * A guard break bursts into shards.
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
  const wasBroken = useRef(fighter.broken);

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
    if (fighter.broken && !wasBroken.current) setShatter(n => n + 1);
    wasBroken.current = fighter.broken;
  }, [fighter.broken]);

  return (
    <div
      className={`bar ${mirrored ? "is-mirrored" : ""} ${fighter.broken ? "is-broken" : ""} ${className ?? ""}`}
      role="img"
      aria-label={`${fighter.name}: health ${Math.round(now.hp)} of ${maxHP}, Fatigue ${Math.round(now.fatigue)}${fighter.broken ? ", guard broken" : ""}`}
      style={{ width: `calc(var(--bar-track) * ${Math.min(maxHP, BAR_FULL_HP) / BAR_FULL_HP})` }}
    >
      <span className="bar-layer bar-trail"><Segments v={trail} maxHP={maxHP} /></span>
      <span className="bar-layer bar-now"><Segments v={now} maxHP={maxHP} /></span>
      {flash > 0 && <span key={flash} className="bar-flash" />}
      {shatter > 0 && <Shards key={shatter} count={8} small />}
    </div>
  );
}

/* ============================================================
 * Guard break: white shards bursting outward
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