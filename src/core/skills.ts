/**
 * skills.ts — weapon skills: actions a weapon gives you, paid with Eternity, taking the place of the weapons' old always-on effects.
 *
 * A skill has an Eternity scaling (0 to 1): it spends that share of your max Eternity, in full, the moment its action is made, however much
 * its effect turns out to help; what your Eternity can't pay becomes Death on you (all of it, with an ordinary weapon). Its effect is as big as
 * what was paid (Eternity and Death alike): one for one in Fatigue or Death, half that in damage or healing.
 */
import { blowShares, type WeaponStats } from "./rules";
import type { CombatState, Enemy, Hand, Player, Side, Stance, Swing, WeaponItem } from "./types";

export type SkillId = "stab" | "hookshot";

export interface Skill {
  name: string;
  /** The kind of action it is: an attack is made with the weapon's own numbers (its cost, damage, Poise, Deadly), changed by the skill. */
  type: "attack";
  /** The share of your max Eternity it spends (0 to 1). */
  scaling: number;
  /** Only at an enemy on the front line (Close). */
  close?: boolean;
  /** Only at an enemy on the back line (Far). */
  far?: boolean;
  /** A ranged attack: you stay where you are, a Block sends nothing back, and it can always be dodged. */
  ranged?: boolean;
  /**
   * What the Eternity paid does: `cheaper`, the attack's Fatigue cost is cut by it; `tire`, it is put on the target as Fatigue (unless the attack is
   * dodged).
   */
  effect: "cheaper" | "tire";
  /** Its own weapon modifiers, over the weapon's (Hookshot: 0.25 Light, 0.25 Poise, whatever sickle throws it). */
  mods?: Partial<WeaponStats>;
  /** It pulls its target to you, onto the front line, unless it is dodged (Hookshot). */
  pull?: boolean;
  /**
   * How an attack skill is drawn, whatever your stance. `stab`: a thrust (`p3-stab-up` into `p3-stab`). `hook`: an overhead throw, then a sideways pull
   * (`hookSwing`). Otherwise it swings as the stance swings.
   */
  swing?: "stab" | "hook";
  /** What it does, in plain words (the item card). */
  text: string;
}

export const SKILLS: Record<SkillId, Skill> = {
  // Stab: an attack at a Close enemy whose Fatigue cost is cut by what it spends (a 0.25 attack, less 0.2: 0.05 of your health).
  stab: { name: "Stab", type: "attack", scaling: 0.2, close: true, effect: "cheaper", swing: "stab", text: "Stabs a nearby enemy. Reduced Fatigue cost." },
  // Hookshot: the sickle thrown on its braid at a Far enemy, which it pulls to you: no damage and no cost of its own (0.25 Light), 0.25 Poise, and all
  // it spends put on the target as more Fatigue.
  hookshot: {
    name: "Hookshot", type: "attack", scaling: 0.1, far: true, ranged: true, effect: "tire", mods: { light: 0.25, poise: 0.25 }, pull: true, swing: "hook",
    text: "Hooks a faraway enemy and pulls it close. Tires it further.",
  },
};

/** The skills each weapon gives the hand that holds it. */
export const WEAPON_SKILLS: Partial<Record<WeaponItem, SkillId[]>> = {
  shortsword: ["stab"],
  sickle: ["hookshot"],
};

/** A weapon's skills (by which class's own weapon it is; the other weapons have none yet). */
export const skillsOfWeapon = (item?: WeaponItem): SkillId[] => (item ? WEAPON_SKILLS[item] ?? [] : []);

/** The hand on that side, as the rules see it. */
const handOn = (p: Player, side: Side): Hand =>
  side === "left" ? p.offhand : { weapon: p.weapon, weaponItem: p.weaponItem, eternal: p.eternal, mortal: p.mortalWeapon };

/** Every skill you can use, and the hand whose weapon gives it: the right hand's first. */
export function skillsOf(p: Player): { skill: SkillId; hand: Side }[] {
  return (["right", "left"] as const).flatMap(hand => skillsOfWeapon(handOn(p, hand).weaponItem).map(skill => ({ skill, hand })));
}

/** Whether the hand holds a weapon with this skill. */
export const handHasSkill = (p: Player, hand: Side, skill: SkillId) => skillsOfWeapon(handOn(p, hand).weaponItem).includes(skill);

/** What a skill spends, in Eternity points: its share of your max Eternity. */
export const skillPrice = (p: Player, skill: SkillId) => SKILLS[skill].scaling * p.maxEternity;

/**
 * What a skill would be paid with right now (for the previews): the Eternity spent, and the Death on you for what it can't pay (all of it with an
 * ordinary weapon, `mortal`).
 */
export function skillPayment(p: Player, skill: SkillId, mortal = false): { spent: number; death: number; price: number } {
  const price = skillPrice(p, skill);
  const spent = mortal ? 0 : Math.min(Math.max(0, p.eternity), price);
  return { spent, death: price - spent, price };
}

/** Whether a skill can be aimed at this enemy (Stab: only one Close, on the front line; Hookshot: only one Far, on the back line). */
export const canTarget = (skill: SkillId, e: Enemy) => e.alive && (!SKILLS[skill].close || e.line === "front") && (!SKILLS[skill].far || e.line === "back");

/** The enemies a skill can be aimed at now. */
export const targetsOf = (s: CombatState, skill: SkillId) => s.enemies.filter(e => canTarget(skill, e));

/** Effect per point paid: Fatigue and Death one for one, damage and healing half. */
export const SKILL_RATE = { fatigue: 1, death: 1, damage: 0.5, heal: 0.5 } as const;

/** A weapon's stats as a skill uses them: its own modifiers over the weapon's. */
export const skillStats = (w: WeaponStats, skill: SkillId): WeaponStats => ({ ...w, ...SKILLS[skill].mods });

/**
 * What an attack skill made with this weapon costs and deals, shares of your max health (as `blowShares`), with its effect in: Stab's cost cut by what
 * it pays, Hookshot's Poise grown by it (the Fatigue it puts on its target).
 */
export function skillShares(p: Player, skill: SkillId, w: WeaponStats) {
  const b = blowShares(skillStats(w, skill)), paid = (skillPrice(p, skill) * SKILL_RATE.fatigue) / p.maxHP;
  return SKILLS[skill].effect === "cheaper" ? { ...b, cost: Math.max(0, b.cost - paid) } : { ...b, poise: b.poise + paid };
}

/**
 * How an attack skill swings (`Skill.swing`), from the stance its hand swings from (the left hand's: the mirrored one). A Hookshot pulls its target in
 * sideways: from Right Lead with a backhand (`hook-right`, a Swing Right's landing), from any other stance with an openhand (`hook-left`).
 */
export function skillSwing(skill: SkillId, stance: Stance): Swing | undefined {
  const s = SKILLS[skill].swing;
  if (s === "hook") return stance === "lead-right" ? "hook-right" : "hook-left";
  return s;
}
