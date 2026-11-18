/**
 * attacks.ts — a turn's first phase: attacks, the player first. Your action goes first: your
 * attack lands, or your Block or dodge (aimed at an enemy) meets the attack of the enemy you
 * aimed it at, which follows at once (every part of its body, for a multi-part one). The other
 * enemies' attacks then play one at a time in random order (at you, or at the ally one is aimed at:
 * the Warden's Usurp Flame on a waxed). Each is answered by the target's
 * Block or dodge, if it has one. After every blow, anyone killed or staggered loses whatever
 * they hadn't done yet: their attack, a Block for later attacks, a Rest, a move.
 */
import { kindOf } from "../bestiary";
import { addDeath, BLOCK_SENDS_BACK, blowShares, bothHands, dodgeFatigue, ETERNAL_EFFECT, ETERNAL_SHARE, ETERNITY_PRICE, flamed, ITEM_SHARE, resistance, spendEternity, WEAPON_EFFECTS, WEAPON_LIKE, weaponOf } from "../rules";
import type { CombatEvent, Enemy, Fighter, Player, Rng, Side, WeaponTier } from "../types";
import { bodyOf } from "../body";
import { AREA_SHARE, bothHeld, canTarget, foeCanTarget, foeHasSkill, foeSkillPrice, handHasSkill, type Skill, type SkillId, SKILL_RATE, SKILLS, skillPrice, skillStats } from "../skills";
import { waxOn } from "./statuses";
import type { Turn } from "./turn";

export function resolveAttacks(t: Turn, rng: Rng) {
  const { p } = t;
  const shuffled = <T,>(list: T[]): T[] => {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // The enemy your action is aimed at (its whole body): its attack answers yours at once.
  const aimedId = t.act && t.act.type !== "rest" && t.act.target !== "self" ? t.act.target : undefined;
  const aimed = aimedId ? t.s.enemies.find(e => e.id === aimedId) : undefined;
  const aimedBody = new Set(aimed ? bodyOf(t.s.enemies, aimed).map(m => m.id) : []);
  const strikers = t.alive.filter(e => e.intent.type === "attack");

  const queue: { attacker: Fighter; target: Fighter }[] = [];
  if (t.act?.type === "attack") queue.push({ attacker: p, target: t.byId(t.act.target)! });
  // (An enemy's attack aimed at an ally strikes that ally; one whose ally is long gone strikes nothing, see `strike`.)
  const targetOf = (e: Enemy): Fighter => (e.intent.target ? t.s.enemies.find(x => x.id === e.intent.target) ?? p : p);
  for (const e of [...shuffled(strikers.filter(e => aimedBody.has(e.id))), ...shuffled(strikers.filter(e => !aimedBody.has(e.id)))]) queue.push({ attacker: e, target: targetOf(e) });

  queue.forEach(({ attacker, target }) => {
    strike(t, attacker, target);
    // An Area attack of yours (Reap, Flame Blast) goes on to hit everything else in its range, in the same beat: each its share, its own Block or dodge
    // answering it (a body of several parts is hit once).
    if (attacker === p) for (const other of areaTargets(t, target)) { if (t.out.has(p.id)) break; strike(t, p, other, true); }
    areaSplash(t, attacker);
    // An attack it dies of (a lit waxed's Flame Immolation): it dies the moment its blast goes out, sealed in wax (no candle left to burn); it falls
    // with this very blow, below.
    if (attacker !== p && !t.cancelled.has(attacker.id)) {
      const self = attacker as Enemy;
      if (self.intent.action && kindOf(self).fatalActions?.includes(self.intent.action)) {
        self.hp = 0;
        self.fatigue = 0;
        self.staggered = false;
        self.fate = "encased";
      }
    }
    // After each blow, falls and staggers take effect before the next one.
    settleFalls(t);
    t.endStep(); // each attack is its own beat
  });
}

/** Falls and staggers take effect: anyone at 0 Health falls, anyone whose Fatigue has filled their Health staggers, and is out of the rest of the turn. */
export function settleFalls(t: Turn) {
  for (const f of t.fighters) {
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
}

/**
 * The weapon a fighter acts with this turn, its stats: yours, the one in the hand it is made with (a Kick, or an action with a weight of its own:
 * that weight's); an enemy's, the weapon its action is like (its pattern's `like`, or its kind's `blowLike`), else its action's weight or its
 * weapon's.
 */
function weaponNow(t: Turn, f: Fighter) {
  if (f !== t.p) {
    // (Modifiers of its own go over the weapon it is like, or over none.)
    const e = f as Enemy, like = e.intent.like ?? kindOf(e).blowLike?.(e), mods = e.intent.mods;
    if (like || mods) return { ...WEAPON_LIKE[like ?? "plain"], ...mods };
  }
  // (both hands: the two weapons averaged, or the one held in both, or bare hands clasped)
  // (while Reap holds the axe up in both hands, the axe alone: the other hand's weapon is set aside)
  if (f === t.p && (t.act?.type === "attack" || t.act?.type === "block") && t.act.both) return bothHands(...bothHeld(t.p));
  const weight = t.weightOf(f), hand = t.handOf(f);
  const own = weaponOf(weight, weight === hand.weapon ? hand.weaponItem : undefined);
  // (a Flaming Waxed Torch: its Poise and Deadly swapped)
  const w = weight === hand.weapon && hand.flaming ? flamed(own) : own;
  // (a skill, yours or an enemy's, may have modifiers of its own, over the weapon's: the Hookshot's, Usurp Flame's)
  const skill = skillMade(t, f);
  return skill ? skillStats(w, skill) : w;
}

/**
 * The skill a fighter's attack this turn is, as far as its weapon's numbers go: yours, the one you chose; an enemy's, the one its intent names, if its
 * weapon gives it (or once it has been made: a Flame Blast puts out the flame that gave it, but is still a Flame Blast).
 */
function skillMade(t: Turn, f: Fighter): SkillId | undefined {
  if (f === t.p) return t.act?.type === "attack" ? t.act.skill : undefined;
  const e = f as Enemy, skill = e.intent.skill;
  if (e.intent.type !== "attack" || !skill) return undefined;
  return t.skillsPaid.get(e.id)?.skill ?? (foeHasSkill(e, skill) ? skill : undefined);
}

/** The Defense of the weapon a fighter blocks with this turn (an enemy's Block may have its own: `defense` in its pattern). */
const blockDefense = (t: Turn, f: Fighter): number => weaponNow(t, f).defense;

/**
 * What an attack costs its attacker in Fatigue, and what it deals (damage; and the Fatigue and Death it puts on its target unless dodged): its
 * weapon's (`blowShares`), shares of its attacker's max health. Every attack is built so, from the same base.
 */
function blowOf(t: Turn, f: Fighter): { cost: number; damage: number; poise: number; deadly: number } {
  // (yours made with both hands: from the higher two-handed base)
  const w = blowShares(weaponNow(t, f), f === t.p && t.act?.type === "attack" && !!t.act.both);
  return { cost: w.cost * f.maxHP, damage: w.damage * f.maxHP, poise: w.poise * f.maxHP, deadly: w.deadly * f.maxHP };
}

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

/** Death put on a fighter by a blow (a Deadly weapon's): none in the model viewer, nor on enemies in the guide's training. A body's parts share it. */
function deathOn(t: Turn, target: Fighter, amount: number) {
  const { dummy, sparring } = t.s.config;
  if (dummy || amount <= 0 || (sparring && target !== t.p)) return;
  for (const mate of bodyOf(t.s.enemies, target)) addDeath(mate, amount);
}

/** An enemy's Area attack (`#area`: a lit waxed's Flame Immolation, the Warden's flaming Flail Slam and Flame Blast), while its kind lets it be one. */
const enemyArea = (t: Turn, f: Fighter) => {
  if (f === t.p) return false;
  const self = f as Enemy;
  return !!self.intent.tags?.includes("area") && kindOf(self).area?.(self) !== false;
};

/**
 * An enemy's Area attack sweeping through the fight after its blow: its allies take their share of it (`AREA_SHARE`: half its damage, Poise and
 * Deadly, as the one it was aimed at did) as a direct hit, with no Block or dodge to answer it.
 */
function areaSplash(t: Turn, attacker: Fighter) {
  if (attacker === t.p || t.cancelled.has(attacker.id) || !enemyArea(t, attacker)) return;
  const self = attacker as Enemy, blow = blowOf(t, self);
  // (a skill's effect too, each its share: a Patrol Warden's Flame Blast puts its Death on its allies as well)
  const paid = t.skillsPaid.get(self.id), effect = paid ? SKILLS[paid.skill].effect : undefined, worth = paid?.worth ?? 0;
  const dmg = (blow.damage + (effect === "damage" ? worth * SKILL_RATE.damage : 0)) * AREA_SHARE;
  const poise = (blow.poise + (effect === "tire" ? worth * SKILL_RATE.fatigue : 0)) * AREA_SHARE;
  const deadly = (blow.deadly + (effect === "death" ? worth * SKILL_RATE.death : 0)) * AREA_SHARE;
  for (const ally of t.alive) {
    if (ally === self || !ally.alive || t.out.has(ally.id) || t.isReviving(ally)) continue;
    const resisted = dmg * resistance(ally);
    // (on one already staggered, that Fatigue is half as much damage: `tire`)
    const burst = t.tire(ally, resisted + poise);
    const through = dmg - resisted;
    if (through + burst > 0) hurt(t, ally);
    loseHealth(t, ally, through);
    deathOn(t, ally, deadly);
    t.emit({ kind: "splash", attacker: self.id, target: ally.id, damage: through + burst, fatigue: burst > 0 ? 0 : resisted + poise });
  }
}

/**
 * The skill an attack is, if it is one and can be made at this target: yours, if its hand holds the weapon that gives it (Reap's: the axe held up);
 * an enemy's, if its weapon gives it and the skill's rules let it be aimed at this target (`foeCanTarget`). Otherwise the attack is a plain blow.
 */
function skillAt(t: Turn, attacker: Fighter, target: Fighter): SkillId | undefined {
  const { p, act } = t;
  if (attacker !== p) {
    const e = attacker as Enemy, skill = e.intent.skill, made = t.skillsPaid.get(e.id);
    if (e.intent.type !== "attack" || !skill) return undefined;
    if (made) return made.skill;
    return foeHasSkill(e, skill) && foeCanTarget(skill, e, target, t.s) ? skill : undefined;
  }
  if (act?.type !== "attack" || !act.skill || target === p) return undefined;
  // (once it has been made, it is that skill for the rest of the turn: a Flame Blast puts out the flame that gave it, but still hits all it reaches)
  const made = t.skillsPaid.get(p.id);
  if (made) return canTarget(made.skill, target as Enemy) ? made.skill : undefined;
  const hand = act.hand ?? "right";
  const has = act.skill === "reap" ? p.reaping === hand && !!act.both && handHasSkill(p, hand, "reap") : handHasSkill(p, hand, act.skill);
  return has && canTarget(act.skill, target as Enemy) ? act.skill : undefined;
}

/**
 * Everything else your Area attack hits, after the one it is aimed at (`Skill.area`): every other enemy on the front line (`close`), or every other
 * enemy (`all`), as the turn started; one part of each body.
 */
function areaTargets(t: Turn, aimed: Fighter): Enemy[] {
  const skill = t.cancelled.has(t.p.id) ? undefined : skillAt(t, t.p, aimed);
  const area = skill ? SKILLS[skill].area : undefined;
  if (!area) return [];
  const seen = new Set(bodyOf(t.s.enemies, aimed).map(m => m.id));
  const out: Enemy[] = [];
  for (const e of t.alive) {
    if (seen.has(e.id) || t.fallen.has(e.id) || !e.alive || (area === "close" && e.line !== "front")) continue;
    for (const m of bodyOf(t.s.enemies, e)) seen.add(m.id);
    out.push(e);
  }
  return out;
}

/**
 * One attack landing: passing through someone reviving, dodged, blocked, or hitting. `more`: a further target of your Area attack (its cost and its
 * skill's price already paid at the first; you do not close in on it).
 */
function strike(t: Turn, attacker: Fighter, target: Fighter, more = false) {
  const { p } = t;
  if (t.out.has(attacker.id)) {
    t.cancelled.add(attacker.id);
    t.emit({ kind: "canceled", who: attacker.id, action: "attack", reason: t.fallen.has(attacker.id) ? "fallen" : "staggered" });
    return;
  }
  if (t.fallen.has(target.id) || (target !== p && !(target as Enemy).alive)) {
    t.cancelled.add(attacker.id);
    t.emit({ kind: "canceled", who: attacker.id, action: "attack", reason: "no target" });
    return;
  }
  // (How your own blow swings, from your stance.)
  const swing = attacker === p ? t.swing : undefined, offSwing = attacker === p ? t.offSwing : undefined;
  const weight = t.weightOf(attacker);
  const ranged = t.isRanged(attacker);
  // (An Area attack, yours or an enemy's: each target takes its share.)
  const act = attacker === p ? t.act : undefined;
  const skill = skillAt(t, attacker, target), sk = skill ? SKILLS[skill] : undefined;
  const area = sk?.area || enemyArea(t, attacker) ? AREA_SHARE : 1;
  const full = blowOf(t, attacker);
  const blow = { ...full, damage: full.damage * area, poise: full.poise * area, deadly: full.deadly * area };
  let dmg = blow.damage;
  let cost = more ? 0 : blow.cost;
  // The Bronze Shortsword: attacking again right after an attack costs you less Fatigue, for Eternity.
  const hand = t.handOf(attacker);
  if (WEAPON_EFFECTS && attacker === p && hand.weaponItem === "shortsword" && hand.eternal && !t.s.config.dummy && p.lastAction === "attack" && isWeaponBlow(t, attacker, weight)) {
    const saved = Math.min(cost, dmg * ITEM_SHARE);
    // Only the Fatigue it really spares counts: what would have gone past a full bar anyway (into the stagger) is no saving, and costs no Eternity.
    const room = fatigueRoom(attacker);
    const spared = Math.min(cost, room) - Math.min(cost - saved, room);
    if (spared > 1e-9) {
      cost -= saved;
      const paid = spendEternity(p, spared * ETERNITY_PRICE.shortsword, !!hand.mortal);
      t.emit({ kind: "eternal", attacker: p.id, target: target.id, effect: "shortsword", damage: 0, fatigue: spared, ...paid });
    }
  }
  // A skill: paid in full as the attack is made (an Area attack's once, at its first target), whatever its effect turns out to do. Stab's cuts the
  // attack's Fatigue cost by what was paid, one for one; the Hookshot's and Knockback's is put on the target as Fatigue as the blow lands (below),
  // unless it is dodged; Usurp Flame's, Reap's and Flame Blast's goes into the blow's Death, Chisel's (half) into its damage. A Flame Blast puts the
  // torch's flame out as it is made.
  // (An enemy's skill is paid the same way, from its own Eternity: its max health's worth, and it never runs out, so it never pays in Death.)
  /** The skill's payment, and the Fatigue it is to put on the target (the Hookshot's, Knockback's), for when the blow lands. */
  let skillPaid: { spent: number; death: number; tire: number } | undefined;
  /** The hand the skill is made with (an enemy's: its weapon hand). */
  const skillHand: Side = attacker === p ? act?.hand ?? "right" : "right";
  if (skill && sk) {
    let made = t.skillsPaid.get(attacker.id);
    if (!more || !made) {
      const price = attacker === p ? skillPrice(p, skill) : foeSkillPrice(attacker as Enemy, skill);
      // (The Model viewer's dummy fight spends nothing, as it takes nothing.)
      // (an ordinary weapon's skill draws on your Eternity too, as an eternal one's)
      const paid = attacker !== p || t.s.config.dummy ? { spent: price, death: 0 } : spendEternity(p, price, false);
      made = { skill, ...paid, worth: paid.spent + paid.death };
      t.skillsPaid.set(attacker.id, made);
      if (sk.flame === "spend") setFlaming(t, attacker, skillHand, false);
    }
    const { worth } = made, paid = { spent: more ? 0 : made.spent, death: more ? 0 : made.death };
    if (sk.effect === "cheaper") {
      cost = Math.max(0, cost - worth * SKILL_RATE.fatigue);
      t.emit({ kind: "eternal", attacker: attacker.id, target: target.id, effect: skill, damage: 0, fatigue: worth, ...paid });
    } else if (sk.effect === "tire") skillPaid = { ...paid, tire: worth * SKILL_RATE.fatigue * area };
    else {
      if (sk.effect === "death") blow.deadly += worth * SKILL_RATE.death * area;
      else dmg += worth * SKILL_RATE.damage * area;
      t.emit({ kind: "eternal", attacker: attacker.id, target: target.id, effect: skill, damage: 0, fatigue: 0, ...paid });
    }
  }
  /** The Hookshot's and Knockback's effect, as its blow lands (`tire`: the Fatigue it puts on the target; none when it is dodged). */
  const skillLands = (tire: number) => {
    if (!skill || !skillPaid) return;
    const burst = t.tire(target, tire);
    if (burst > 0) hurt(t, target);
    t.emit({ kind: "eternal", attacker: attacker.id, target: target.id, effect: skill, damage: burst, fatigue: burst > 0 ? 0 : tire, spent: skillPaid.spent, death: skillPaid.death });
  };
  /** A skill that pulls its target to you (the Hookshot), or knocks it away (Knockback), only does so if it lands. */
  const pulling = !!sk?.pull, pushing = !!sk?.push;
  t.tire(attacker, cost);
  // Melee closes in on the target (yours: on the one it is aimed at, not the rest of an Area attack's; not a Knockback's, which drives it away); a
  // ranged attacker stays where it is. An enemy striking an ally tries to step onto the ally's line instead (forward from the back line, back from
  // the front; not at all when they share one), which your Maneuver can undo.
  if (attacker === p) { if (!pulling && !pushing && !more && !ranged) t.pulls.set(target.id, p.id); }
  else if (target !== p) { if (!ranged && (target as Enemy).line !== (attacker as Enemy).line) t.shifts.set(attacker.id, (target as Enemy).line); }
  else if (!ranged && !pushing) t.pulls.set(attacker.id, attacker.id);
  // Whom it attacked with its weapon this turn, however the blow goes (for the Broken Shortsword, next turn; not a Hurl Wax).
  if (isWeaponBlow(t, attacker, weight) && !more) t.attacked.set(attacker.id, target.id);

  if (t.isReviving(target)) {
    // The blow passes through someone reviving.
    t.emit({ kind: "attack", attacker: attacker.id, target: target.id, result: "dodged", damage: 0, fatigue: 0, ranged, swing, offSwing });
    return;
  }
  if (t.isDodging(target, attacker)) {
    // Out of the way: no damage, only the effort of the dodge.
    const effort = dodgeFatigue(target, dmg);
    t.tire(target, effort);
    t.emit({ kind: "attack", attacker: attacker.id, target: target.id, result: "dodged", damage: 0, fatigue: effort, ranged, swing, offSwing });
    skillLands(0);
    return;
  }
  const blocking = t.isBlocking(target, attacker);
  if (blocking) t.blocked.add(target.id);
  // A Block: the weapon it is made with stops its Defense's share of the blow, and what comes through is met by Resistance like any blow (that
  // share of it turns into Fatigue on the blocker, the rest is damage). A blocked melee blow tires its attacker by twice what came through; a
  // ranged one, made from afar, by nothing.
  const comes = blocking ? dmg * (1 - blockDefense(t, target)) : dmg;
  const resisted = comes * resistance(target);
  // (On a target already staggered, the Fatigue a blow puts on it, the share its armor turns into Fatigue and its weapon's Poise below, is half as much
  // damage instead: `tire`. It shows as the blow's damage.)
  let burst = t.tire(target, resisted);
  const sentBack = blocking && !ranged ? comes * BLOCK_SENDS_BACK : 0;
  t.tire(attacker, sentBack);
  const through = comes - resisted;
  loseHealth(t, target, through);
  // Its weapon's Poise and Deadly land whether the blow is blocked or not (only a dodge escapes them): that much Fatigue, and that much Death.
  burst += t.tire(target, blow.poise);
  if (through + burst > 0) hurt(t, target);
  deathOn(t, target, blow.deadly);
  const self = attacker !== p ? (attacker as Enemy) : undefined;
  t.emit({ kind: "attack", attacker: attacker.id, target: target.id, result: blocking ? "blocked" : "hit", damage: through + burst, fatigue: blocking ? sentBack : burst > 0 ? 0 : resisted + blow.poise, ranged, fire: !!self?.intent.tags?.includes("fire") || (isWeaponBlow(t, attacker, weight) && !!t.handOf(attacker).flaming), swing, offSwing });
  // (the Hookshot, landed, blocked or not: its Fatigue, and it pulls its target to you. It is an attack: a direct hit breaks a Rest, though it deals
  // no damage.)
  skillLands(skillPaid?.tire ?? 0);
  if (skill && !blocking) hurt(t, target);
  if (pulling && target !== p) t.pulls.set(target.id, attacker.id);
  // (an enemy's Knockback on you: you fall back, as your own Maneuver would)
  if (pushing) { if (target === p) t.knocked = attacker.id; else t.pushes.set(target.id, attacker.id); }
  if (sk) skillLanded(t, attacker, sk, target, skillHand);
  // The Waxed Torch waxes whatever it hits, blocked or not, and the Broken Shortsword what it hits directly, yours or an enemy's (as the Warden's flail
  // does: on wax already there, a direct hit adds a little more Fatigue); not a Chisel, which chips the wax off, nor one already dead.
  const waxes = waxingOf(t, attacker, weight);
  if (waxes && (waxes === "any" || !blocking) && !sk?.unwax && target.hp > 0) waxOn(t, target, blocking ? 0 : through, !blocking);
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
      seal: () => sealWhole(t, target),
      event: (ev: CombatEvent) => t.emit(ev),
    });
  }
}

/**
 * Sealed whole in wax, its flame taken (Usurp Flame): an enemy dies on the spot, encased, and is out of the rest of the turn; you
 * are encased (no longer just Waxed) until you get back up.
 */
function sealWhole(t: Turn, target: Fighter) {
  if (target === t.p) {
    t.p.waxed = false;
    t.p.encased = true;
    return;
  }
  const e = target as Enemy;
  e.hp = 0;
  e.fatigue = 0;
  e.staggered = false;
  e.fate = "encased";
  t.out.add(e.id);
  t.fallen.add(e.id);
  t.emit({ kind: "encased", who: e.id });
}

/** A Waxed Torch lit (Usurp Flame) or put out (Flame Blast): yours, in that hand; an enemy's (its `flaming` flag). */
function setFlaming(t: Turn, who: Fighter, hand: Side, on: boolean) {
  if (who !== t.p) {
    const e = who as Enemy;
    if (!!e.flags.flaming === on) return;
    e.flags.flaming = on;
    t.emit({ kind: "flag", who: e.id, flag: "flaming", on });
    return;
  }
  if (hand === "left") t.p.offhand = { ...t.p.offhand, flaming: on || undefined };
  else t.p.flaming = on || undefined;
}

/**
 * What a skill does once its blow has landed (hit or blocked; not dodged), whoever made it: Usurp Flame lights the torch, and seals whole in wax one
 * that is always Waxed (dead on the spot); Chisel takes the Waxed status off, where it can come off (yours too).
 */
function skillLanded(t: Turn, attacker: Fighter, sk: Skill, target: Fighter, hand: Side) {
  if (sk.flame === "light") setFlaming(t, attacker, hand, true);
  const always = target !== t.p && !!kindOf(target as Enemy).alwaysWaxed;
  if (sk.seals && always && !t.s.config.dummy && !t.fallen.has(target.id)) sealWhole(t, target);
  if (sk.unwax && !always) {
    target.waxed = false;
    target.coated = false;
  }
}

/**
 * Whether a blow's weapon waxes what it hits: the Waxed Torch any hit (`any`: blocked too), the Broken Shortsword a direct hit (`direct`). Only a blow
 * of the weapon itself (not a class's own weapon, bare hands or a Kick, nor an action of an enemy's that is like another weapon), whoever holds it, and
 * not while it is Flaming (the Warden's flail is a Waxed Torch by the rules: it waxes so too).
 */
function waxingOf(t: Turn, attacker: Fighter, weight: WeaponTier): "any" | "direct" | undefined {
  if (weight !== "normal" && weight !== "light") return undefined;
  if (t.handOf(attacker).weaponItem || !isWeaponBlow(t, attacker, weight)) return undefined;
  // (a Flaming torch burns what it hits, and leaves no wax)
  if (t.handOf(attacker).flaming) return undefined;
  return weight === "normal" ? "any" : "direct";
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
 * A blow of the fighter's weapon itself (yours: of the weapon in the hand you strike with): not bare hands (nor a Kick), and not an action
 * with a weight, a weapon it is like or modifiers of its own (an armed waxed's Hurl Wax, thrown with its other hand).
 */
function isWeaponBlow(t: Turn, attacker: Fighter, weight: WeaponTier) {
  if (weight !== t.handOf(attacker).weapon || weight === "baseline") return false;
  const own = (attacker as Partial<Enemy>).intent;
  return !own || (own.weight === undefined && own.like === undefined && own.mods === undefined);
}

/**
 * An eternal weapon's effect, as its blow lands (only a blow of the weapon itself, see `isWeaponBlow`).
 * Each is a quarter of the blow's damage: the Broken Shortsword
 * bites that much deeper on a direct hit into whoever it also attacked last turn (hit or not); the Waxed Torch's direct hit tires
 * that much more and leaves the target looking waxed; the Brick Hammer tires a target that Blocks
 * it by that much. You pay for it with Eternity (twice over for damage), and what Eternity can't
 * pay becomes Death on you. Enemies' effects are free.
 */
function eternalEffect(t: Turn, attacker: Fighter, target: Fighter, result: "hit" | "blocked", ranged: boolean, weight: WeaponTier, dmg: number) {
  const hand = t.handOf(attacker);
  if (!WEAPON_EFFECTS || !hand.eternal || !isWeaponBlow(t, attacker, weight) || t.s.config.dummy) return;
  // Your class's weapon has an effect of its own (half the damage); every other weapon's follows its weight (a quarter).
  const item = attacker === t.p ? hand.weaponItem : undefined;
  const effect = item ?? ETERNAL_EFFECT[weight as keyof typeof ETERNAL_EFFECT];
  const amount = dmg * (item ? ITEM_SHARE : ETERNAL_SHARE);
  let damage = 0, fatigue = 0;
  /** What the effect is paid by, where that is not simply the damage or Fatigue it ended up doing (the Torch's wax). */
  let waxedFor = 0;
  // The effects that bite deeper (damage): which one applies here, if any.
  const bites = (effect === "axe" && result === "hit" && t.p.lastAction === "rest") // the Barbarian's Axe: a direct hit after a turn of rest
    || (effect === "sickle" && result === "hit" && t.wasStaggered.has(target.id)) // the Nomadic Sickle: a direct hit on a staggered enemy
    || (effect === "chisel" && result === "hit" && hand.lastTarget === target.id); // the Broken Shortsword: into whoever this hand also attacked last turn
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
  const paid = attacker === t.p ? spendEternity(attacker as Player, (waxedFor || damage || fatigue) * ETERNITY_PRICE[effect], !!hand.mortal) : { spent: 0, death: 0 };
  t.emit({ kind: "eternal", attacker: attacker.id, target: target.id, effect, damage, fatigue, ...paid });
}
