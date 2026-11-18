/**
 * skills.ts — weapon skills: actions a weapon gives you, paid with Eternity, taking the place of the weapons' old always-on effects.
 *
 * A skill has an Eternity scaling (0 to 1): it spends that share of your max Eternity, in full, the moment its action is made, however much
 * its effect turns out to help; what your Eternity can't pay becomes Death on you (all of it, with an ordinary weapon). Its effect is as big as
 * what was paid (Eternity and Death alike): one for one in Fatigue or Death, half that in damage or healing.
 *
 * An **Area** attack (`Skill.area`; an enemy's `#area` tag) hits everything in its range, each at half: half the damage, half the Poise and Deadly,
 * half the skill's effect. Its cost is paid once, in full.
 */
import { kindOf } from "./bestiary";
import { blowShares, type HeldWeapon, heldStats, type WeaponStats } from "./rules";
import type { CombatState, Enemy, Hand, Player, Side, Stance, Swing, WeaponItem, WeaponTier } from "./types";

export type SkillId = "stab" | "hookshot" | "reap" | "knockback" | "usurp" | "flameblast" | "chisel";

export interface Skill {
  name: string;
  /**
   * The kind of action it is. `attack`: made with the weapon's own numbers (its cost, damage, Poise, Deadly), changed by the skill. `rest`: a Rest
   * (Reap: it readies the weapon for the attack that follows, which is the skill's attack and pays its price).
   */
  type: "attack" | "rest";
  /** The share of your max Eternity it spends (0 to 1). */
  scaling: number;
  /** Only at an enemy on the front line (Close). */
  close?: boolean;
  /** Only at an enemy on the back line (Far). */
  far?: boolean;
  /** Only at certain enemies: `waxed`, one with the Waxed status; `usurpable`, one staggered while Waxed (sealed in wax), or a waxed cradling its flame. */
  aim?: "waxed" | "usurpable";
  /** A ranged attack: you stay where you are, a Block sends nothing back, and it can always be dodged. */
  ranged?: boolean;
  /**
   * What the Eternity paid does: `cheaper`, the attack's Fatigue cost is cut by it; `tire`, it is put on the target as Fatigue (unless the attack is
   * dodged); `death`, as Death on the target (unless dodged); `damage`, half of it as more damage in the blow.
   */
  effect: "cheaper" | "tire" | "death" | "damage";
  /** Its own weapon modifiers, in place of the weapon's Poise, Deadly and Light (Hookshot: 0.25 Light, 0.25 Poise, whatever sickle throws it). */
  mods?: Partial<WeaponStats>;
  /** It pulls its target to you, onto the front line, unless it is dodged (Hookshot). */
  pull?: boolean;
  /** It pushes its target away from you, onto the back line, unless it is dodged; you do not close in (Knockback). */
  push?: boolean;
  /** An Area attack (see above): `close`, at every enemy on the front line; `all`, at every enemy. */
  area?: "close" | "all";
  /** Made with both hands (Reap's attack): from the two-handed base, the weapon held alone in both. */
  both?: boolean;
  /** What it does to its weapon: `light`, a Waxed Torch it lands with becomes Flaming (Usurp Flame); `spend`, making it puts the flame out (Flame Blast). */
  flame?: "light" | "spend";
  /** Landed on one that is always Waxed (a waxed, a Wax Blob's part), it seals it whole in wax: dead on the spot (Usurp Flame). */
  seals?: boolean;
  /** Landed, it takes the Waxed status off its target, where it can come off (Chisel). */
  unwax?: boolean;
  /**
   * How an attack skill is drawn, whatever your stance. `stab`: a thrust (`p3-stab-up` into `p3-stab`). `hook`: an overhead throw, then a sideways pull
   * (`hookSwing`). `usurp`: a Stab's wind-up, then the weapon raised high overhead (the Hookshot's wind-up). `overhead`: an overhead, from any stance. `chisel`: an overhead with the
   * weapon in a reverse grip, point down (`p3-chisel-up` into `p3-chisel`), as the Waxbound's. `openhand`: its hand's Openhand (a Swing Left, the left
   * hand's mirrored), whatever the stance (Reap's attack, held in both hands). Otherwise it swings as the
   * stance swings.
   */
  swing?: "stab" | "hook" | "usurp" | "overhead" | "chisel" | "openhand";
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
  // Reap (the Barbarian's Axe): a Rest that takes the axe up in both hands. Until your next attack you can only Attack and Block with both hands, and
  // attack only Close enemies; that attack is an Area one at every Close enemy, and its price is paid as it is made, put on them as Death.
  reap: {
    name: "Reap", type: "rest", scaling: 0.25, close: true, effect: "death", area: "close", both: true, swing: "openhand",
    text: "Takes the axe up in both hands. Its next attack reaps every nearby enemy. Inflicts Death.",
  },
  // Knockback (the Brick Hammer): an attack that drives its target back onto the back line (you stay where you are), all it spends put on it as Fatigue.
  knockback: { name: "Knockback", type: "attack", scaling: 0.1, effect: "tire", push: true, text: "Knocks an enemy away from you. Tires it further." },
  // Usurp Flame (the Waxed Torch): at a waxed cradling its flame, or one sealed in wax by a stagger; 0.25 Light and 0.25 Deadly, all it spends put on its
  // target as more Death. Landed, it lights the torch (Flaming), and one that is always Waxed dies sealed in wax.
  usurp: {
    name: "Usurp Flame", type: "attack", scaling: 0.05, aim: "usurpable", effect: "death", mods: { light: 0.25, deadly: 0.25 }, flame: "light", seals: true, swing: "usurp",
    text: "Takes the flame of a waxed enemy cradling it, or sealed in wax. Inflicts Death. Kills the waxed. Sets the torch Flaming.",
  },
  // Flame Blast (the Flaming torch's, in place of Usurp Flame): an Area attack at every enemy, all it spends put on them as Death. It puts the flame out.
  flameblast: {
    name: "Flame Blast", type: "attack", scaling: 0.2, ranged: true, effect: "death", area: "all", flame: "spend", swing: "overhead",
    text: "Blasts every enemy with the torch's flame. Inflicts Death. Puts the flame out.",
  },
  // Chisel (the Broken Shortsword): at a Waxed enemy only, half of what it spends as more damage; it chips the wax off, where it can come off.
  chisel: { name: "Chisel", type: "attack", scaling: 0.1, aim: "waxed", effect: "damage", unwax: true, swing: "chisel", text: "Chips the wax off a waxed enemy. More damage." },
};

/** Which weapon gives skills: a class's own (by its item), or a weapon by its weight (the Broken Shortsword, the Waxed Torch, the Brick Hammer). */
export type WeaponKey = WeaponItem | "chisel" | "torch" | "hammer";
const TIER_KEY: Partial<Record<WeaponTier, WeaponKey>> = { light: "chisel", normal: "torch", heavy: "hammer" };
export const weaponKey = (tier: WeaponTier, item?: WeaponItem): WeaponKey | undefined => item ?? TIER_KEY[tier];

/** The skills each weapon gives the hand that holds it. */
export const WEAPON_SKILLS: Partial<Record<WeaponKey, SkillId[]>> = {
  shortsword: ["stab"],
  sickle: ["hookshot"],
  axe: ["reap"],
  hammer: ["knockback"],
  torch: ["usurp"],
  chisel: ["chisel"],
};

/** A weapon's skills (a Flaming Waxed Torch has Flame Blast in place of Usurp Flame). */
export const skillsOfWeapon = (w?: HeldWeapon): SkillId[] => {
  const key = w ? weaponKey(w.tier, w.item) : undefined;
  if (key === "torch" && w?.flaming) return ["flameblast"];
  return key ? WEAPON_SKILLS[key] ?? [] : [];
};

/** The hand on that side, as the rules see it. */
export const handOn = (p: Player, side: Side): Hand =>
  side === "left" ? p.offhand : { weapon: p.weapon, weaponItem: p.weaponItem, eternal: p.eternal, mortal: p.mortalWeapon, flaming: p.flaming };

/** A hand's weapon as the wheel and the rules name it (`HeldWeapon`). */
export const heldOn = (p: Player, side: Side): HeldWeapon => {
  const h = handOn(p, side);
  return { tier: h.weapon, item: h.weaponItem, flaming: h.flaming };
};

/**
 * The weapons both hands make together (`HeldWeapon`s for `bothHands`): what they hold, or, while Reap holds the axe up in both, the axe alone (the
 * other hand's weapon set aside).
 */
export const bothHeld = (p: Player): [HeldWeapon, HeldWeapon] => {
  const none: HeldWeapon = { tier: "baseline" };
  if (p.reaping) return p.reaping === "left" ? [none, heldOn(p, "left")] : [heldOn(p, "right"), none];
  return [heldOn(p, "right"), heldOn(p, "left")];
};

/** Every skill you can use, and the hand whose weapon gives it: the right hand's first. (Reap's attack is not one: it is the Attack you make while it lasts.) */
export function skillsOf(p: Player): { skill: SkillId; hand: Side }[] {
  return (["right", "left"] as const).flatMap(hand => skillsOfWeapon(heldOn(p, hand)).map(skill => ({ skill, hand })));
}

/** Whether the hand holds a weapon with this skill. */
export const handHasSkill = (p: Player, hand: Side, skill: SkillId) => skillsOfWeapon(heldOn(p, hand)).includes(skill);

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

/** A waxed cradling its flame (the Waxed's Cradle Flame stance), for Usurp Flame to take. */
const cradling = (e: Enemy) => {
  const flame = kindOf(e).flame;
  return !!flame && e.intent.stance === flame.stance;
};

/**
 * Whether a skill can be aimed at this enemy: Close (front line) or Far (back line) only, where it says; Usurp Flame only at one staggered while Waxed
 * (sealed whole in wax) or a waxed cradling its flame; Chisel only at a Waxed one.
 */
export const canTarget = (skill: SkillId, e: Enemy) => {
  const sk = SKILLS[skill];
  if (!e.alive || (sk.close && e.line !== "front") || (sk.far && e.line !== "back")) return false;
  if (sk.aim === "waxed") return e.waxed;
  if (sk.aim === "usurpable") return (e.staggered && e.waxed) || cradling(e);
  return true;
};

/** The enemies a skill can be aimed at now (a Rest's, Reap: you, so it can always be made). */
export const targetsOf = (s: CombatState, skill: SkillId) => s.enemies.filter(e => canTarget(skill, e));

/** Effect per point paid: Fatigue and Death one for one, damage and healing half. */
export const SKILL_RATE = { fatigue: 1, death: 1, damage: 0.5, heal: 0.5 } as const;

/** What an Area attack does to each thing it hits, a share of what one blow would (see the file's note). */
export const AREA_SHARE = 0.5;

/**
 * A weapon's stats as a skill uses them: a skill with modifiers of its own has those in place of the weapon's Poise, Deadly and Light (any it does not
 * name are 0: Usurp Flame has no Poise, whatever torch makes it), keeping the weapon's Defense and subtype; one without, the weapon's own.
 */
export const skillStats = (w: WeaponStats, skill: SkillId): WeaponStats => {
  const mods = SKILLS[skill].mods;
  return mods ? { ...w, poise: 0, deadly: 0, light: 0, ...mods } : w;
};

/**
 * What an attack skill made with this weapon costs and deals to each target, shares of your max health (as `blowShares`), with its effect in: Stab's cost
 * cut by what it pays, the Hookshot's and Knockback's Poise grown by it (the Fatigue they put on the target), Usurp Flame's, Reap's and Flame Blast's
 * Deadly (the Death), Chisel's damage (half). An Area attack's numbers are each target's: half, but for its cost.
 */
export function skillShares(p: Player, skill: SkillId, w: WeaponStats) {
  const sk = SKILLS[skill], b = blowShares(skillStats(w, skill), !!sk.both), paid = skillPrice(p, skill) / p.maxHP;
  const k = sk.area ? AREA_SHARE : 1;
  const out = { ...b, damage: b.damage * k, poise: b.poise * k, deadly: b.deadly * k };
  switch (sk.effect) {
    case "cheaper": return { ...out, cost: Math.max(0, b.cost - paid * SKILL_RATE.fatigue) };
    case "tire": return { ...out, poise: out.poise + paid * SKILL_RATE.fatigue * k };
    case "death": return { ...out, deadly: out.deadly + paid * SKILL_RATE.death * k };
    case "damage": return { ...out, damage: out.damage + paid * SKILL_RATE.damage * k };
  }
}

/** The weapon a skill of this hand is made with, its stats (Reap's: the axe alone, in both hands; a Flaming torch's, its flame's). */
export const skillWeapon = (p: Player, hand: Side): WeaponStats => heldStats(heldOn(p, hand));

/**
 * How an attack skill swings (`Skill.swing`), from the stance its hand swings from (the left hand's: the mirrored one). A Hookshot pulls its target in
 * sideways: from Right Lead with a backhand (`hook-right`, a Swing Right's landing), from any other stance with an openhand (`hook-left`).
 */
export function skillSwing(skill: SkillId, stance: Stance): Swing | undefined {
  const s = SKILLS[skill].swing;
  if (s === "hook") return stance === "lead-right" ? "hook-right" : "hook-left";
  if (s === "openhand") return "left";
  return s;
}
