/**
 * rules.ts — combat's numbers: weapon and armor tables, and the costs, damage and Fatigue they
 * make.
 *
 * Units: weights and costs are written in sixteenths of the fighter's max health, matching the
 * design doc. `sixteenths(n, maxHP)` turns them into real numbers.
 */
import type { ArmorTier, Fighter, Player, Side, Tier, WeaponItem, WeaponTier } from "./types";

/* ============================================================
 * Tuning tables (sixteenths of max health)
 * ============================================================ */

/**
 * Every attack starts the same: it costs this share of its attacker's max health in Fatigue, and deals as much damage. A weapon's modifiers
 * (`WeaponStats`) move it from there.
 */
export const ATTACK_BASE = 0.25;

/**
 * An attack made with both hands (the top part of Attack): a higher base, a third of its attacker's max health in damage, for half of it in Fatigue,
 * moved by the two hands' modifiers averaged (`bothHands`).
 */
export const TWO_HANDED_BASE = { cost: 0.5, damage: 1 / 3 };

/**
 * What a weapon does, besides the base every attack has (`ATTACK_BASE`), each a share of its attacker's max health, kept small so the weapons
 * are much alike:
 *  - `poise`: the attack costs that much more Fatigue, and puts as much Fatigue on its target, unless it is dodged (a hit or a Block alike).
 *  - `deadly`: the attack costs that much more Fatigue, and puts as much Death on its target, unless it is dodged.
 *  - `light`: the attack deals that much less damage, and costs twice that much less Fatigue.
 *  - `defense`: the share of a blow a Block made with it stops (0 to 1; see `strike` in resolve/attacks.ts).
 *  - `subtype`: a kind of weapon that is handled apart. `pole`: a long haft (the Brick Hammer, the Barbarian's Axe): held alone about the middle of
 *    its haft, the second hand near its end (its model's `grips` in render/gear3d.ts).
 */
export interface WeaponStats { poise: number; deadly: number; light: number; defense: number; subtype?: WeaponSubtype }

/** A kind of weapon handled apart (see `WeaponStats.subtype`). */
export type WeaponSubtype = "pole";

/** By weight, the weapon of that weight in this demo (`name`; its eternal version is "Eternal <name>") and its stats. Bare hands are the Kick's too. */
export const WEAPONS: Record<WeaponTier, WeaponStats & { weight: number; label: string; name: string }> = {
  baseline: { weight: 0, poise: 0, deadly: 0, light: 0.1, defense: 0.2, label: "None", name: "Bare hands" },
  light:  { weight: 0.5, poise: 0, deadly: 0.2, light: 0.1, defense: 0.25, label: "Light", name: "Jagged Chisel" },
  normal: { weight: 1, poise: 0.2, deadly: 0, light: 0.1, defense: 0.25, label: "Normal", name: "Waxed Torch" },
  heavy:  { weight: 1.5, poise: 0.1, deadly: 0, light: 0, defense: 0.5, label: "Heavy", name: "Brick Hammer", subtype: "pole" },
};

/** The starting classes' own weapons' stats (not their weight's). */
export const ITEM_WEAPONS: Record<WeaponItem, WeaponStats> = {
  shortsword: { poise: 0, deadly: 0, light: 0, defense: 0.5 },
  axe: { poise: 0, deadly: 0.1, light: 0, defense: 0.25, subtype: "pole" },
  sickle: { poise: 0, deadly: 0, light: 0.05, defense: 0.25 },
};

/**
 * The weapons an action can be like, by name, for the enemies' actions that are no blow of what they hold (`like chisel` in a pattern: see
 * patterns.ts): each weapon's stats, and `plain`, an attack with none of a weapon's modifiers (and no Defense).
 */
export const WEAPON_LIKE = {
  bare: WEAPONS.baseline, chisel: WEAPONS.light, torch: WEAPONS.normal, hammer: WEAPONS.heavy,
  shortsword: ITEM_WEAPONS.shortsword, axe: ITEM_WEAPONS.axe, sickle: ITEM_WEAPONS.sickle,
  plain: { poise: 0, deadly: 0, light: 0, defense: 0 },
} satisfies Record<string, WeaponStats>;
export type WeaponLike = keyof typeof WEAPON_LIKE;

/** A weapon's stats: the class's own weapon's, or its weight's. */
export const weaponOf = (weight: WeaponTier, item?: WeaponItem): WeaponStats => (item !== undefined ? ITEM_WEAPONS[item] : WEAPONS[weight]);

/** A weapon with a long haft (`subtype` "pole": the Brick Hammer, the Barbarian's Axe). */
export const isPole = (weight: WeaponTier, item?: WeaponItem): boolean => weaponOf(weight, item).subtype === "pole";

/** A weapon's Defense: the share of a blow a Block made with it stops. */
export const defenseOf = (weight: WeaponTier, item?: WeaponItem): number => weaponOf(weight, item).defense;

/**
 * What an attack with this weapon costs, and what it deals: shares of the attacker's max health (`poise`, `deadly`: as in `WeaponStats`). `twoHanded`:
 * made with both hands, from `TWO_HANDED_BASE` instead of `ATTACK_BASE`.
 */
export function blowShares(w: WeaponStats, twoHanded = false): { cost: number; damage: number; poise: number; deadly: number } {
  const cost = twoHanded ? TWO_HANDED_BASE.cost : ATTACK_BASE, damage = twoHanded ? TWO_HANDED_BASE.damage : ATTACK_BASE;
  return { cost: Math.max(0, cost + w.poise + w.deadly - 2 * w.light), damage: Math.max(0, damage - w.light), poise: w.poise, deadly: w.deadly };
}

/** A hand's weapon, as the wheel and the rules name it: its weight ("baseline": empty) and which class's own it is. */
export interface HeldWeapon { tier: WeaponTier; item?: WeaponItem }

/**
 * The weapon both hands make together, for an Attack or Block made with both: two weapons' stats averaged (Poise, Deadly, Light and Defense alike);
 * a weapon and an empty hand, that weapon's own (the free hand joins it on the grip); both empty, bare hands'.
 */
export function bothHands(right: HeldWeapon, left: HeldWeapon): WeaponStats {
  const r = right.tier !== "baseline" ? weaponOf(right.tier, right.item) : null, l = left.tier !== "baseline" ? weaponOf(left.tier, left.item) : null;
  if (!r || !l) return r ?? l ?? WEAPONS.baseline;
  return { poise: (r.poise + l.poise) / 2, deadly: (r.deadly + l.deadly) / 2, light: (r.light + l.light) / 2, defense: (r.defense + l.defense) / 2 };
}

/**
 * The hand that leads a two-handed Attack or Block: the right, unless only the left holds a weapon (then the right hand joins the left's grip, and the
 * blow is drawn as the left hand's).
 */
export const bothHandsLead = (right: HeldWeapon, left: HeldWeapon): Side => (right.tier === "baseline" && left.tier !== "baseline" ? "left" : "right");

/** Both hands hold a weapon: a two-handed blow swings both, each its own way (dual wielding), rather than one held in both hands. */
export const dualWielding = (right: HeldWeapon, left: HeldWeapon) => right.tier !== "baseline" && left.tier !== "baseline";

/** Whether the weapons' own effects work (the Chisel's, the Torch's, the class weapons'...). Off for now, while the weapons' stats are reworked. */
export const WEAPON_EFFECTS = false;

/**
 * What each eternal weapon does besides its blow. Chisel: more damage on a direct hit against
 * whoever it also attacked last turn (two attacks running on the same one). Torch: more Fatigue on a direct hit, and the target looks
 * waxed (looks only). Hammer: more Fatigue to a target that Blocks it.
 */
export type EternalEffect = "chisel" | "torch" | "hammer" | "shortsword" | "axe" | "sickle";
export const ETERNAL_EFFECT: Record<Tier, EternalEffect> = { light: "chisel", normal: "torch", heavy: "hammer" };

/** Every eternal effect is this share of the weapon's damage. */
export const ETERNAL_SHARE = 1 / 4;

/** The effects of the starting classes' weapons are this share of the weapon's damage (the others' are `ETERNAL_SHARE`). */
export const ITEM_SHARE = 1 / 2;

/** Eternity paid per point of an effect: Fatigue costs its amount, damage (or healing) twice it. */
export const ETERNITY_PRICE: Record<EternalEffect, number> = { chisel: 2, torch: 1, hammer: 1, shortsword: 1, axe: 2, sickle: 2 };

/**
 * weight: what a piece of armor or head gear of this class weighs, a share of a blow (0 to 1), unless the piece has a weight of its own
 * (`ITEMS`, `GearSpec.weight`). What you wear adds up (body and head alike), and that total is both your Resistance (that share of every
 * blow taken turns into Fatigue instead of damage) and what a dodge costs on top of its base (see `wornWeight`). Armor leans to looks:
 * the weights are small.
 */
export const ARMOR: Record<ArmorTier, { weight: number; label: string }> = {
  none:   { weight: 0, label: "None" },
  light:  { weight: 0.05, label: "Light" },
  normal: { weight: 0.1, label: "Normal" },
  heavy:  { weight: 0.15, label: "Heavy" },
};

const headOf = (f: Fighter): ArmorTier => (f as Partial<Player>).head ?? "none";

/**
 * What a fighter wears weighs, all its pieces together (a share of a blow): its own pieces' weights (`Fighter.worn`, yours), or else its armor's
 * and head gear's classes'.
 */
export const wornWeight = (f: Fighter) => f.worn ?? ARMOR[f.armor].weight + ARMOR[headOf(f)].weight;

/** Even unburdened, a dodge turns half the damage dodged into Fatigue (8 sixteenths). */
export const DODGE_BASE = 8;

/** A blocked melee blow tires its attacker by this many times the damage that came through the Block. */
export const BLOCK_SENDS_BACK = 2;


/** Rest clears this much Fatigue. */
export const REST_CLEARS = 8;

/* ============================================================
 * Derived numbers
 * ============================================================ */

export const sixteenths = (n: number, maxHP: number) => (n / 16) * maxHP;

/** What an attack with this weapon (its weight, and which class's own it is) costs its attacker in Fatigue. */
export const attackCost = (f: Fighter, weight: WeaponTier = f.weapon, item?: WeaponItem) => blowShares(weaponOf(weight, item)).cost * f.maxHP;

/** What an attack with this weapon deals in damage. */
export const attackDamage = (f: Fighter, weight: WeaponTier = f.weapon, item?: WeaponItem) => blowShares(weaponOf(weight, item)).damage * f.maxHP;

export const restAmount = (f: Fighter) => sixteenths(REST_CLEARS, f.maxHP);

/**
 * What a Rest would give back right now (for the preview on the bar): the Fatigue it clears, and
 * what returns if it clears more than there is (half the excess): the Death it clears first (the lost Health, shown black), then the Health it restores.
 */
export function restRecovery(f: Fighter): { fatigue: number; heal: number; health: number } {
  const amount = restAmount(f);
  const fatigue = Math.min(f.fatigue, amount);
  const excess = amount - f.fatigue;
  // Healing clears Death first (`heal` below), and what is left of it restores Health (`health`, as far as there is Health missing).
  const healing = excess > 0 ? excess / 2 : 0, heal = Math.min(healing, f.death);
  return { fatigue, heal, health: Math.min(healing - heal, Math.max(0, f.maxHP - f.hp)) };
}

/**
 * Share of incoming damage turned into Fatigue (0..1): what you wear weighs (`wornWeight`). A Block has nothing to do with it: its weapon
 * stops a share of the blow first (`defenseOf`), and Resistance meets what comes through.
 */
export const resistance = (f: Fighter) => Math.min(1, wornWeight(f));

/**
 * The share of a dodged attack's damage that turns into Fatigue: half (the base) plus what you wear weighs (a 0.1 chestplate: 0.6). Only what
 * you wear weighs on a dodge: the weapons in your hands do not. A Maneuver that dodges nothing costs nothing at all.
 */
export const dodgeShare = (f: Fighter) => DODGE_BASE / 16 + wornWeight(f);

export const dodgeFatigue = (f: Fighter, damage: number) => damage * dodgeShare(f);

/** Healing clears Death first, then restores health. */
export function heal(f: Fighter, amount: number) {
  const fromDeath = Math.min(f.death, amount);
  f.death -= fromDeath;
  f.hp = Math.min(f.maxHP, f.hp + amount - fromDeath);
}

/**
 * Death: it fills missing health, and only that: whatever finds no missing health to fill is lost, and Death never takes Health
 * itself. All it does is eat healing (see `heal`), a revive's too. (Only the living take it: a felled one has nothing left to fill.)
 */
export function addDeath(f: Fighter, amount: number) {
  if (amount <= 0 || f.hp <= 0) return;
  f.death += Math.min(amount, Math.max(0, f.maxHP - f.hp - f.death));
}

/**
 * Up again with a revive: healed "to full", but healing clears Death first, so whatever Death it carried when it fell is taken off
 * the Health it comes back with (and cleared by it). Fresh: no Fatigue, not staggered.
 */
export function reviveHealth(f: Fighter) {
  f.hp = Math.max(0, f.hp);
  heal(f, f.maxHP);
  f.fatigue = 0;
  f.staggered = false;
}

/**
 * Pays an eternal effect from your Eternity; whatever it can't pay becomes Death on you. An ordinary weapon's effect can't use Eternity: it
 * is all Death (`mortal`: the weapon that carried it is an ordinary one).
 */
export function spendEternity(p: Player, amount: number, mortal: boolean): { spent: number; death: number } {
  const spent = mortal ? 0 : Math.min(Math.max(0, p.eternity), amount);
  p.eternity -= spent;
  const death = amount - spent;
  addDeath(p, death);
  return { spent, death };
}
