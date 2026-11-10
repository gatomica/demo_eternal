/**
 * HealthBar.tsx — the health bar, and the shards a stagger bursts into.
 */
import { type CSSProperties, useEffect, useRef, useState } from "react";
import type { Fighter, Player } from "../core/types";
import { KnotMark, StringCounter, type StringPop } from "./StringCounter";

/* ============================================================
 * Health bar
 * ============================================================ */

/**
 * Bars grow with max health. A fighter with this much max health fills the whole bar track
 * (the --bar-track width in index.css); anything less gets a proportionally shorter bar.
 * (60: a bar is twice as long per point as it was at 120.)
 */
const BAR_FULL_HP = 60;

/** What a Rest would give back (see `restRecovery`), shown on the bar before you take it. */
export interface Recovery {
  fatigue: number;
  /** The Death cleared (the black going back to waking room). */
  heal: number;
  /** The Health restored after that (the bar's health growing). */
  health?: number;
}

export interface BarValues {
  hp: number;
  fatigue: number;
  death: number;
}

const barPct = (x: number, maxHP: number) => `${(Math.max(0, x) / maxHP) * 100}%`;

function Segments({ v, maxHP, preview = 0, recover }: { v: BarValues; maxHP: number; preview?: number; recover?: Recovery }) {
  const hp = Math.max(0, v.hp);
  // Fatigue fills current health and can't spill past it, even for a moment mid-turn.
  const fatigue = Math.min(Math.max(0, v.fatigue), hp);
  // A cost about to be paid takes its share of the room that is left, flickering beside the Fatigue.
  const cost = Math.min(Math.max(0, preview), hp - fatigue);
  // A Rest about to be taken: the Fatigue it clears and the Health it returns flicker where they are now.
  const gone = Math.min(Math.max(0, recover?.fatigue ?? 0), fatigue);
  const healed = Math.min(Math.max(0, recover?.heal ?? 0), Math.max(0, v.death));
  // ...and, once the Death is all cleared, the Health that is restored: it flickers where the bar's health will grow into, just after.
  const restored = Math.min(Math.max(0, recover?.health ?? 0), Math.max(0, maxHP - hp - (v.death - healed)));
  return (
    <>
      <i className="bar-room" style={{ width: barPct(hp - fatigue - cost, maxHP) }} />
      {cost > 0 && <i className="bar-preview" style={{ width: barPct(cost, maxHP) }} />}
      {gone > 0 && <i className="bar-recover" style={{ width: barPct(gone, maxHP) }} />}
      <i className="bar-fatigue" style={{ width: barPct(fatigue - gone, maxHP) }} />
      {healed > 0 && <i className="bar-heal" style={{ width: barPct(healed, maxHP) }} />}
      <i className="bar-death" style={{ width: barPct(v.death - healed, maxHP) }} />
      {restored > 0 && <i className="bar-heal" style={{ width: barPct(restored, maxHP) }} />}
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
export function HealthBar({ fighter, before, className, mirrored, preview, recover, gain = 0, eternalFlash }: {
  /** An eternal effect touched this bar (extra Fatigue or damage given, Fatigue saved): it flashes pale blue (a new key flashes again). */
  eternalFlash?: string;
  fighter: Fighter;
  before?: BarValues;
  /** Fatigue about to be paid (an action you are hovering): shown flickering on the bar, before it is committed. */
  preview?: number;
  /** A Rest you are hovering: the Fatigue it would clear and the Health it would return, flickering on the bar. */
  recover?: Recovery;
  className?: string;
  mirrored?: boolean;
  /** Max health about to be added (raising a stat): the bar is drawn that much longer, the new part flickering at its end. */
  gain?: number;
}) {
  const maxHP = fighter.maxHP + gain;
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
      aria-label={`${fighter.name}: health ${Math.round(now.hp)} of ${fighter.maxHP}, Fatigue ${Math.round(now.fatigue)}${fighter.staggered ? ", staggered" : ""}`}
      style={{ width: `calc(var(--bar-track) * ${Math.min(maxHP, BAR_FULL_HP) / BAR_FULL_HP})` }}
    >
      {/* The trail only shows health that was just lost, in a light red, sliding away. */}
      <span className="bar-layer bar-trail"><i className="bar-lost" style={{ width: barPct(trail.hp, maxHP) }} /></span>
      <span className="bar-layer bar-now">
        <Segments v={now} maxHP={maxHP} preview={preview} recover={recover} />
        {gain > 0 && <i className="bar-gain" style={{ width: barPct(gain, maxHP) }} />}
      </span>
      {flash > 0 && <span key={`flash-${flash}`} className="bar-flash" />}
      {eternalFlash && <span key={`eternal-${eternalFlash}`} className="bar-flash is-eternal" />}
      {shatter > 0 && <Shards key={`shatter-${shatter}`} count={8} small />}
    </div>
  );
}

/* ============================================================
 * Your bars: health, revives and Eternity
 * ============================================================ */

/** 1 → I, 4 → IV, 9 → IX... */
function roman(n: number): string {
  const table: [number, string][] = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [value, numeral] of table) {
    while (n >= value) {
      out += numeral;
      n -= value;
    }
  }
  return out;
}

/**
 * Your bars in their fixed place at the top left (the same in a fight and in the inventory): the
 * health bar, the Eternity bar under it, and your revives left as a red Roman numeral beside it
 * (nothing once they're gone). Your String counter sits at the top right, on the same row.
 */
export function PlayerBars({ player, preview, recover, string, stringPops, eternalString, gain, eternalFlash, knot }: { player: Player; /** You have the revive knot (its symbol shows even when it is spent). */ knot?: boolean; /** Eternal effects this beat: which of your bars they touched (a new key flashes it again). */ eternalFlash?: { health?: string; eternity?: string }; preview?: number; recover?: Recovery; string?: number; stringPops?: StringPop[]; eternalString?: number; /** Max health and max Eternity about to be raised: shown on the bars before they are paid for. */ gain?: { health?: number; eternity?: number } }) {
  return (
    <>
      {/* (A fixed slot, so nothing else on screen can push it around.) */}
      <div className="bar-slot bar-slot-player">
        {/* The knot: its symbol, with the number of revives you have left in red over its white middle (the middle goes black when none is left).
            Only once you have a knot (or a revive from elsewhere). */}
        {(knot || player.charges > 0) && (
          <span className={`revive-count ${player.charges > 0 ? "" : "is-empty"}`} aria-label={`${player.charges} revives left`}>
            <KnotMark className="revive-knot" empty={player.charges <= 0} />
            {player.charges > 0 && <span className={`revive-num ${roman(player.charges).length > 2 ? "is-long" : ""}`}>{roman(player.charges)}</span>}
          </span>
        )}
        <div className="bar-stack">
          <HealthBar fighter={player} preview={preview} recover={recover} gain={gain?.health} eternalFlash={eternalFlash?.health} />
          <EternityBar player={player} gain={gain?.eternity} flash={eternalFlash?.eternity} />
        </div>
      </div>
      {/* Your String, at the top right on the same row, wherever your bars are. */}
      {string !== undefined && <StringCounter amount={string} pops={stringPops} eternal={eternalString} />}
    </>
  );
}

/* ============================================================
 * Eternity bar
 * ============================================================ */

/**
 * Your Eternity: a thin, pale blue bar right under your health bar, as long as the health bar of that
 * many points (it holds as much as your max Eternity, raised separately from your health). Eternal weapons' effects drain it; it only fills again when you reawaken.
 * Like the health bar, a change cuts at once with a flash, and a trail of the old value slides after.
 */
export function EternityBar({ player, gain = 0, flash: spent }: { player: Player; /** Eternity was just spent: the bar flashes pale blue (a new key flashes again). */ flash?: string; /** Max Eternity about to be added: the bar is drawn that much longer, the new part flickering at its end. */ gain?: number }) {
  const { eternity } = player;
  const maxEternity = player.maxEternity + gain;
  const [trail, setTrail] = useState(eternity);
  const [flash, setFlash] = useState(0);
  const last = useRef(eternity);
  useEffect(() => {
    if (eternity !== last.current) { last.current = eternity; setFlash(f => f + 1); }
    const timer = window.setTimeout(() => setTrail(eternity), 30);
    return () => window.clearTimeout(timer);
  }, [eternity]);
  const pct = (x: number) => `${(Math.max(0, Math.min(x, maxEternity)) / maxEternity) * 100}%`;
  return (
    <div
      className="bar-eternity"
      role="img"
      aria-label={`Eternity ${Math.round(eternity)} of ${player.maxEternity}`}
      style={{ width: `calc(var(--bar-track) * ${Math.min(maxEternity, BAR_FULL_HP) / BAR_FULL_HP})` }}
    >
      <i className="bar-eternity-trail" style={{ width: pct(trail) }} />
      <i className="bar-eternity-now" style={{ width: pct(eternity) }} />
      {gain > 0 && <i className="bar-eternity-gain" style={{ width: pct(gain) }} />}
      {flash > 0 && <span key={`flash-${flash}`} className="bar-flash" />}
      {spent && <span key={`spent-${spent}`} className="bar-flash is-eternal" />}
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
