/**
 * HealthBar.tsx — the health bar, and the shards a stagger bursts into.
 */
import { type CSSProperties, useEffect, useRef, useState } from "react";
import type { Fighter } from "../core/types";

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

function Segments({ v, maxHP, preview = 0 }: { v: BarValues; maxHP: number; preview?: number }) {
  const hp = Math.max(0, v.hp);
  // Fatigue fills current health and can't spill past it, even for a moment mid-turn.
  const fatigue = Math.min(Math.max(0, v.fatigue), hp);
  // A cost about to be paid takes its share of the room that is left, flickering beside the Fatigue.
  const cost = Math.min(Math.max(0, preview), hp - fatigue);
  return (
    <>
      <i className="bar-room" style={{ width: barPct(hp - fatigue - cost, maxHP) }} />
      {cost > 0 && <i className="bar-preview" style={{ width: barPct(cost, maxHP) }} />}
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
export function HealthBar({ fighter, before, className, mirrored, preview }: {
  fighter: Fighter;
  before?: BarValues;
  /** Fatigue about to be paid (an action you are hovering): shown flickering on the bar, before it is committed. */
  preview?: number;
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
      <span className="bar-layer bar-now"><Segments v={now} maxHP={maxHP} preview={preview} /></span>
      {flash > 0 && <span key={`flash-${flash}`} className="bar-flash" />}
      {shatter > 0 && <Shards key={`shatter-${shatter}`} count={8} small />}
    </div>
  );
}

/* ============================================================
 * Stagger: white shards bursting outward
 * ============================================================ */

/** A direct hit: drops of blood flung out of the wound and splashed on the body, as the blow lands. */
export function Blood({ count = 13 }: { count?: number }) {
  return (
    <span className="blood" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => {
        // Thrown to either side, most up and out, then falling; a little fixed jitter so it isn't mechanical.
        const side = i % 2 ? 1 : -1;
        const style = {
          "--dx": `${side * (12 + ((i * 37) % 40))}px`,
          "--rise": `${-(10 + ((i * 23) % 30))}px`,
          "--fall": `${8 + ((i * 41) % 46)}px`,
          "--size": `${3 + ((i * 17) % 5)}px`,
          "--t": `${0.5 + ((i * 13) % 25) / 100}s`,
        } as CSSProperties;
        return <b key={i} className="blood-drop" style={style}><i /></b>;
      })}
      {[[-14, -6, 15], [10, 6, 12], [-4, 20, 10], [16, -14, 9], [-18, 12, 8]].map(([x, y, size], i) => (
        <u key={i} className="blood-splat" style={{ "--x": `${x}px`, "--y": `${y}px`, "--size": `${size}px` } as CSSProperties} />
      ))}
    </span>
  );
}

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
