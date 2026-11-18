/**
 * statuses.ts — when the player's statuses come and go. Waxed: covered in wax by a direct
 * waxing hit; it lasts while there's Fatigue to hold it. Encased: sealed whole in wax (its flame
 * taken), until it gets back up.
 */
import { kindOf } from "../bestiary";
import { bodyOf } from "../body";
import { deathDecay } from "../rules";
import type { Enemy, Fighter } from "../types";
import type { Turn } from "./turn";

/** The waxed and the Wax Blob's parts always have the Waxed status: nothing takes it off them. */
const alwaysWaxed = (f: Fighter) => "kind" in f && !!kindOf(f as Enemy).alwaysWaxed;

/**
 * Covered in wax by a waxing blow of the Warden's flail, whether it lands or is blocked; on wax already there, a direct hit also tires
 * (1/8 of its damage, `direct`).
 */
export function waxOn(t: Turn, f: Fighter, damage: number, direct = true) {
  const bonus = f.waxed && direct ? damage / 8 : 0;
  t.tire(f, bonus);
  f.waxed = true;
  t.emit({ kind: "waxed", who: f.id, bonus });
}

/**
 * Before the next turn is planned (the last beat of a turn, after movement): everyone's Death decays (`deathDecay` in rules.ts: half of it, at least 0.5, all of it when there is less), and half of what it
 * loses is dealt as damage, which no armor stops. A body of several parts shares its Death and Health: it decays once. Its own beat, after the turn's
 * Rests and movement; it breaks no Rest (it is no blow), but it can stagger or kill (`settleFalls`), which the turn's end then settles. Nothing in the Model viewer; in the guide's training, as any
 * damage (enemies lose none, you never your last point).
 */
export function decayDeath(t: Turn, settle: () => void) {
  const { dummy, sparring } = t.s.config;
  if (dummy) return;
  const done = new Set<string>();
  for (const f of t.fighters) {
    if (done.has(f.id) || f.hp <= 0 || t.isReviving(f)) continue;
    const body = bodyOf(t.s.enemies, f);
    for (const m of body) done.add(m.id);
    const { lost, damage } = deathDecay(f.death);
    if (lost <= 0) continue;
    const dealt = sparring ? (f === t.p ? Math.max(0, Math.min(damage, f.hp - 1)) : 0) : damage;
    for (const m of body) {
      m.death = Math.max(0, m.death - lost);
      m.hp -= dealt;
    }
    t.emit({ kind: "decay", who: f.id, death: lost, damage: dealt });
  }
  if (!t.events.length) return;
  settle();
  t.endStep();
}

/** Its Fatigue gone: so is the wax that hung on it. */
export function fatigueGone(f: Fighter) {
  f.waxed = alwaysWaxed(f);
  f.coated = false;
}

/** Back on its feet (recovered or revived): the wax on it, and any sealing it whole, breaks away. */
export function backOnFeet(f: Fighter) {
  f.waxed = alwaysWaxed(f);
  f.coated = false;
  f.encased = false;
}
