/**
 * attacks.ts — a turn's first phase: attacks, fastest weapon first (bare hands, light, normal,
 * heavy). Each is answered by the target's Block or dodge, if it has one. Attacks of the same
 * speed play one at a time in random order, but all of them land: a fighter dropped or staggered
 * by a tied attack grits through to finish its own. After each speed group, anyone killed or
 * staggered loses whatever they hadn't done yet: a slower attack, a Block for later attacks, a
 * Rest, a move.
 */
import { kindOf } from "../bestiary";
import { attackCost, attackDamage, dodgeFatigue, resistance, WEAPONS } from "../rules";
import type { Enemy, Fighter, Rng } from "../types";
import { waxOn } from "./statuses";
import type { Turn } from "./turn";

export function resolveAttacks(t: Turn, rng: Rng) {
  const { p, fighters } = t;
  const pending: { attacker: Fighter; target: Fighter }[] = [];
  if (t.act?.type === "attack") pending.push({ attacker: p, target: t.byId(t.act.target)! });
  for (const e of t.alive) if (e.intent.type === "attack") pending.push({ attacker: e, target: p });
  const speeds = [...new Set(pending.map(a => WEAPONS[t.weightOf(a.attacker)].speed))].sort((a, b) => a - b);

  for (const speed of speeds) {
    // Ties play one at a time, in random order.
    const group = pending.filter(a => WEAPONS[t.weightOf(a.attacker)].speed === speed);
    for (let i = group.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [group[i], group[j]] = [group[j], group[i]];
    }
    group.forEach(({ attacker, target }, n) => {
      if (n > 0) t.endStep(); // each attack is its own beat
      strike(t, attacker, target);
    });

    // After the group lands: falls and staggers take effect before the next, slower group.
    for (const f of fighters) {
      if (t.out.has(f.id)) continue;
      if (t.isReviving(f)) continue; // untouchable, and still at 0 until the revive lands
      if (f.hp <= 0) {
        t.out.add(f.id);
        t.fallen.add(f.id);
        t.emit({ kind: "fall", who: f.id });
      } else if (!f.staggered && f.fatigue >= f.hp) {
        t.out.add(f.id);
        f.staggered = true;
        t.emit({ kind: "stagger", who: f.id });
      }
    }
    t.pinStaggered();
    t.endStep();
  }
}

/** Health lost to a blow or a burn. Nothing in the model viewer; in the guide's training, only you, and never your last point. */
function loseHealth(t: Turn, target: Fighter, amount: number) {
  const { dummy, sparring } = t.s.config;
  if (dummy) return;
  if (!sparring) target.hp -= amount;
  else if (target === t.p) target.hp = Math.max(1, target.hp - amount);
}

/** One attack landing: passing through someone reviving, dodged, blocked, or hitting. */
function strike(t: Turn, attacker: Fighter, target: Fighter) {
  const { p } = t;
  if (t.out.has(attacker.id)) {
    t.cancelled.add(attacker.id);
    t.emit({ kind: "canceled", who: attacker.id, action: "attack", reason: t.fallen.has(attacker.id) ? "fallen" : "staggered" });
    return;
  }
  if (t.fallen.has(target.id)) {
    t.cancelled.add(attacker.id);
    t.emit({ kind: "canceled", who: attacker.id, action: "attack", reason: "no target" });
    return;
  }
  const grit = attacker.hp <= 0 || (!attacker.staggered && attacker.fatigue >= attacker.hp);
  const weight = t.weightOf(attacker);
  const ranged = t.isRanged(attacker);
  t.tire(attacker, attackCost(attacker, weight));
  // Melee closes in on the target; a ranged attacker stays where it is.
  if (attacker === p) t.pulls.set(target.id, p.id);
  else if (!ranged) t.pulls.set(attacker.id, attacker.id);
  const dmg = attackDamage(attacker, weight);

  if (t.isReviving(target)) {
    // The blow passes through someone reviving.
    t.emit({ kind: "attack", attacker: attacker.id, target: target.id, result: "dodged", damage: 0, fatigue: 0, ranged, grit });
    return;
  }
  if (t.isDodging(target, attacker)) {
    // Out of the way: no damage, only the effort of the dodge.
    const effort = dodgeFatigue(target, dmg);
    t.tire(target, effort);
    t.emit({ kind: "attack", attacker: attacker.id, target: target.id, result: "dodged", damage: 0, fatigue: effort, ranged, grit });
    return;
  }
  const blocking = t.isBlocking(target, attacker);
  if (blocking) t.blockedSomething.add(target.id);
  const resisted = dmg * resistance(target, blocking ? t.weightOf(target) : null);
  // On a Block, everything resisted goes back to the attacker; unless the attack is ranged,
  // when it simply stops there.
  if (!blocking) t.tire(target, resisted);
  else if (!ranged) t.tire(attacker, resisted);
  const through = dmg - resisted;
  if (through > 0) t.hurt.add(target.id);
  loseHealth(t, target, through);
  const sentBack = blocking && ranged ? 0 : resisted;
  t.emit({ kind: "attack", attacker: attacker.id, target: target.id, result: blocking ? "blocked" : "hit", damage: through, fatigue: sentBack, ranged, grit });
  // A direct hit may do more, by the attacker's own rules (the Warden's flail waxes, or burns).
  const self = attacker !== p ? (attacker as Enemy) : undefined;
  const onHit = self && kindOf(self).onDirectHit;
  if (!blocking && self && onHit) {
    onHit({
      self, target, damage: through, tags: self.intent.tags ?? [],
      burn: amount => {
        loseHealth(t, target, amount);
        if (amount > 0) t.hurt.add(target.id);
        t.emit({ kind: "burned", who: target.id, damage: amount });
      },
      wax: () => waxOn(t, target, through),
    });
  }
}
