/**
 * attacks.ts — a turn's first phase: attacks, fastest weapon first (bare hands, light, normal,
 * heavy). Each is answered by the target's Block or dodge, if it has one. Attacks of the same
 * speed play one at a time in random order, but all of them land: a fighter dropped or staggered
 * by a tied attack grits through to finish its own. After each speed group, anyone killed or
 * staggered loses whatever they hadn't done yet: a slower attack, a Block for later attacks, a
 * Rest, a move.
 */
import { kindOf } from "../bestiary";
import { attackCost, attackDamage, dodgeFatigue, ETERNAL_EFFECT, ETERNAL_SHARE, ETERNITY_PRICE, ITEM_SHARE, resistance, sixteenths, spendEternity, WEAPONS } from "../rules";
import type { Enemy, Fighter, Player, Rng, WeaponTier } from "../types";
import { bodyOf } from "../body";
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
      shockwave(t, attacker);
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

/** What an attack costs its attacker in Fatigue, and how much it deals: its action's own numbers when it sets them, otherwise its weight's. */
const costOf = (f: Fighter, weight: WeaponTier) => {
  const own = (f as Partial<Enemy>).intent?.cost;
  return own !== undefined ? sixteenths(own, f.maxHP) : attackCost(f, weight);
};
const damageOf = (f: Fighter, weight: WeaponTier) => {
  const own = (f as Partial<Enemy>).intent?.damage;
  return own !== undefined ? sixteenths(own, f.maxHP) : attackDamage(f, weight);
};

/** Took health damage this turn, which breaks a Rest (a multi-target enemy's whole body shares the damage). */
function hurt(t: Turn, f: Fighter) {
  for (const m of bodyOf(t.s.enemies, f)) t.hurt.add(m.id);
}

/**
 * Health lost to a blow or a burn. Nothing in the model viewer; in the guide's training, only you, and never your last point.
 * The parts of a multi-target enemy (the Wax Blob) share one pool: the loss is every part's.
 */
function loseHealth(t: Turn, target: Fighter, amount: number) {
  const { dummy, sparring } = t.s.config;
  if (dummy) return;
  if (!sparring) for (const mate of bodyOf(t.s.enemies, target)) mate.hp -= amount;
  else if (target === t.p) target.hp = Math.max(1, target.hp - amount);
}

/**
 * A shockwave (`#shockwave`: the Warden's flaming slam, his flame blast) sweeping through the fight
 * after the blow: the attacker's allies take it as a direct hit, with no Block or dodge to answer it.
 */
function shockwave(t: Turn, attacker: Fighter) {
  if (attacker === t.p || t.cancelled.has(attacker.id)) return;
  const self = attacker as Enemy;
  if (!self.intent.tags?.includes("shockwave") || kindOf(self).shockwave?.(self) === false) return;
  const dmg = damageOf(self, t.weightOf(self));
  for (const ally of t.alive) {
    if (ally === self || !ally.alive || t.out.has(ally.id) || t.isReviving(ally)) continue;
    const resisted = dmg * resistance(ally, null);
    t.tire(ally, resisted);
    const through = dmg - resisted;
    if (through > 0) hurt(t, ally);
    loseHealth(t, ally, through);
    t.emit({ kind: "splash", attacker: self.id, target: ally.id, damage: through, fatigue: resisted });
  }
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
  // (How your own blow swings, from your stance.)
  const swing = attacker === p ? t.swing : undefined;
  const grit = attacker.hp <= 0 || (!attacker.staggered && attacker.fatigue >= attacker.hp);
  const weight = t.weightOf(attacker);
  const ranged = t.isRanged(attacker);
  const dmg = damageOf(attacker, weight);
  let cost = costOf(attacker, weight);
  // The Bronze Shortsword: attacking again right after an attack costs you less Fatigue, for Eternity.
  if (attacker === p && p.weaponItem === "shortsword" && p.eternal && !t.s.config.dummy && p.lastAction === "attack" && isWeaponBlow(attacker, weight)) {
    const saved = Math.min(cost, dmg * ITEM_SHARE);
    // Only the Fatigue it really spares counts: what would have gone past a full bar anyway (into the stagger) is no saving, and costs no Eternity.
    const room = fatigueRoom(attacker);
    const spared = Math.min(cost, room) - Math.min(cost - saved, room);
    if (spared > 1e-9) {
      cost -= saved;
      const paid = spendEternity(p, spared * ETERNITY_PRICE.shortsword);
      t.emit({ kind: "eternal", attacker: p.id, target: target.id, effect: "shortsword", damage: 0, fatigue: spared, ...paid });
    }
  }
  t.tire(attacker, cost);
  // Melee closes in on the target; a ranged attacker stays where it is.
  if (attacker === p) t.pulls.set(target.id, p.id);
  else if (!ranged) t.pulls.set(attacker.id, attacker.id);
  // Whom it attacked with its weapon this turn, however the blow goes (for the Jagged Chisel, next turn; not a Hurl Wax).
  if (isWeaponBlow(attacker, weight)) t.attacked.set(attacker.id, target.id);

  if (t.isReviving(target)) {
    // The blow passes through someone reviving.
    t.emit({ kind: "attack", attacker: attacker.id, target: target.id, result: "dodged", damage: 0, fatigue: 0, ranged, grit, swing });
    return;
  }
  if (t.isDodging(target, attacker)) {
    // Out of the way: no damage, only the effort of the dodge.
    const effort = dodgeFatigue(target, dmg);
    t.tire(target, effort);
    t.emit({ kind: "attack", attacker: attacker.id, target: target.id, result: "dodged", damage: 0, fatigue: effort, ranged, grit, swing });
    return;
  }
  const blocking = t.isBlocking(target, attacker);
  const resisted = dmg * resistance(target, blocking ? t.weightOf(target) : null);
  // On a Block, everything resisted goes back to the attacker; unless the attack is ranged,
  // when it simply stops there.
  if (!blocking) t.tire(target, resisted);
  else if (!ranged) t.tire(attacker, resisted);
  const through = dmg - resisted;
  if (through > 0) hurt(t, target);
  loseHealth(t, target, through);
  const sentBack = blocking && ranged ? 0 : resisted;
  const self = attacker !== p ? (attacker as Enemy) : undefined;
  t.emit({ kind: "attack", attacker: attacker.id, target: target.id, result: blocking ? "blocked" : "hit", damage: through, fatigue: sentBack, ranged, grit, fire: !!self?.intent.tags?.includes("fire"), swing });
  eternalEffect(t, attacker, target, blocking ? "blocked" : "hit", ranged, weight, dmg);
  // A blocked melee blow can still leave something (the Warden's flail leaves its wax).
  const onBlocked = self && blocking && !ranged ? kindOf(self).onBlocked : undefined;
  if (onBlocked) onBlocked({ self: self!, target, tags: self!.intent.tags ?? [], wax: () => waxOn(t, target, 0, false) });
  // A direct hit may do more, by the attacker's own rules (the Warden's flail waxes, or burns).
  const onHit = self && kindOf(self).onDirectHit;
  if (!blocking && self && onHit) {
    onHit({
      self, target, damage: through, tags: self.intent.tags ?? [],
      burn: amount => {
        loseHealth(t, target, amount);
        if (amount > 0) hurt(t, target);
        t.emit({ kind: "burned", who: target.id, damage: amount });
      },
      wax: () => waxOn(t, target, through),
    });
  }
}

/** How much more Fatigue a fighter's bar can take before it staggers: none once staggered, and what goes past a full bar is lost. */
const fatigueRoom = (f: Fighter) => (f.staggered ? 0 : Math.max(0, f.hp - f.fatigue));

/** How much more Health a fighter can lose to an effect: none where the fight takes no Health (the guide's training spares enemies, and your last point), and none past zero. */
const damageRoom = (t: Turn, f: Fighter) => {
  const { sparring } = t.s.config;
  if (sparring && f !== t.p) return 0;
  return Math.max(0, f.hp - (sparring ? 1 : 0));
};

/**
 * A blow of the fighter's weapon itself: not bare hands, and not an action with a weight or damage of
 * its own (an armed waxed's Hurl Wax, thrown with its other hand).
 */
function isWeaponBlow(attacker: Fighter, weight: WeaponTier) {
  if (weight !== attacker.weapon || weight === "baseline") return false;
  const own = (attacker as Partial<Enemy>).intent;
  return !own || (own.damage === undefined && own.weight === undefined);
}

/**
 * An eternal weapon's effect, as its blow lands (only a blow of the weapon itself, see `isWeaponBlow`).
 * Each is a quarter of the blow's damage: the Jagged Chisel
 * bites that much deeper on a direct hit into whoever it also attacked last turn (hit or not); the Waxed Torch's direct hit tires
 * that much more and leaves the target looking waxed; the Brick Hammer tires a target that Blocks
 * it by that much. You pay for it with Eternity (twice over for damage), and what Eternity can't
 * pay becomes Death on you. Enemies' effects are free.
 */
function eternalEffect(t: Turn, attacker: Fighter, target: Fighter, result: "hit" | "blocked", ranged: boolean, weight: WeaponTier, dmg: number) {
  if (!attacker.eternal || !isWeaponBlow(attacker, weight) || t.s.config.dummy) return;
  // Your class's weapon has an effect of its own (half the damage); every other weapon's follows its weight (a quarter).
  const item = attacker === t.p ? t.p.weaponItem : undefined;
  const effect = item ?? ETERNAL_EFFECT[weight as keyof typeof ETERNAL_EFFECT];
  const amount = dmg * (item ? ITEM_SHARE : ETERNAL_SHARE);
  let damage = 0, fatigue = 0;
  /** What the effect is paid by, where that is not simply the damage or Fatigue it ended up doing (the Torch's wax). */
  let waxedFor = 0;
  // The effects that bite deeper (damage): which one applies here, if any.
  const bites = (effect === "axe" && result === "hit" && t.p.lastAction === "rest") // the Barbarian's Axe: a direct hit after a turn of rest
    || (effect === "sickle" && result === "hit" && t.wasStaggered.has(target.id)) // the Nomadic Sickle: a direct hit on a staggered enemy
    || (effect === "chisel" && result === "hit" && attacker.lastTarget === target.id); // the Jagged Chisel: into whoever it also attacked last turn
  if (bites) {
    // (Only the Health that is really left to take counts: what goes past it, or what the fight takes no Health for, is no effect, and costs nothing.)
    damage = Math.min(amount, damageRoom(t, target));
    if (damage <= 1e-9) return;
    hurt(t, target);
    loseHealth(t, target, damage);
  } else if (effect === "torch" && !(result === "blocked" && ranged)) {
    // The Waxed Torch waxes whatever is not waxed yet, whether the blow lands or is blocked, and tires it more with it. A target already
    // staggered has nothing left to tire, so it is no effect (nothing happens, nothing is paid). But one that this very blow (or its extra
    // Fatigue) is about to stagger is waxed all the same, and goes down sealed in wax.
    if (target.waxed || target.staggered) return;
    fatigue = Math.min(amount, fatigueRoom(target));
    t.tire(target, fatigue);
    target.waxed = true;
    target.coated = true;
    waxedFor = amount;
  } else if (effect === "hammer" && result === "blocked" && !ranged) {
    fatigue = Math.min(amount, fatigueRoom(target));
    if (fatigue <= 1e-9) return;
    t.tire(target, fatigue);
  } else return;
  const paid = attacker === t.p ? spendEternity(attacker as Player, (waxedFor || damage || fatigue) * ETERNITY_PRICE[effect]) : { spent: 0, death: 0 };
  t.emit({ kind: "eternal", attacker: attacker.id, target: target.id, effect, damage, fatigue, ...paid });
}
