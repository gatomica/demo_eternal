/**
 * rules.ts — combat's numbers: weapon and armor tables, and the costs, damage and Fatigue they
 * make.
 *
 * Units: weights and costs are written in sixteenths of the fighter's max health, matching the
 * design doc. `sixteenths(n, maxHP)` turns them into real numbers.
 */
import type { ArmorTier, Fighter, Player, Tier, WeaponTier } from "./types";

/* ============================================================
 * Tuning tables (sixteenths of max health)
 * ============================================================ */

/** `speed` orders attacks within a turn: lower goes first, equal speeds land together. */
/** `name`: the weapon of that weight in this demo (its eternal version is "Eternal <name>"). */
export const WEAPONS: Record<WeaponTier, { weight: number; cost: number; damage: number; block: number; speed: number; label: string; name: string }> = {
  baseline: { weight: 0, cost: 1, damage: 1, block: 0, speed: 0, label: "None", name: "Bare hands" },
  light:  { weight: 2, cost: 1, damage: 2, block: 2, speed: 1, label: "Light", name: "Jagged Chisel" },
  normal: { weight: 3, cost: 3, damage: 3, block: 3, speed: 2, label: "Normal", name: "Waxed Torch" },
  heavy:  { weight: 4, cost: 5, damage: 4, block: 4, speed: 3, label: "Heavy", name: "Brick Hammer" },
};

/**
 * What each eternal weapon does besides its blow. Chisel: more damage on a direct hit against
 * whoever it also attacked last turn (two attacks running on the same one). Torch: more Fatigue on a direct hit, and the target looks
 * waxed (looks only). Hammer: more Fatigue to a target that Blocks it.
 */
export type EternalEffect = "chisel" | "torch" | "hammer";
export const ETERNAL_EFFECT: Record<Tier, EternalEffect> = { light: "chisel", normal: "torch", heavy: "hammer" };

/** Every eternal effect is this share of the weapon's damage. */
export const ETERNAL_SHARE = 1 / 4;

/** Eternity paid per point of an effect: Fatigue costs its amount, damage (or healing) twice it. */
export const ETERNITY_PRICE: Record<EternalEffect, number> = { chisel: 2, torch: 1, hammer: 1 };

/**
 * resist: Resistance, in sixteenths ("none" is the base 1/16).
 * weight: how much it burdens you, in sixteenths. Together with your weapon's, it sets how
 * tiring a dodge is (see dodgeFatigue).
 */
export const ARMOR: Record<ArmorTier, { resist: number; weight: number; label: string }> = {
  none:   { resist: 1, weight: 0, label: "None" },
  light:  { resist: 2, weight: 2, label: "Light" },
  normal: { resist: 3, weight: 3, label: "Normal" },
  heavy:  { resist: 4, weight: 4, label: "Heavy" },
};

/** Even unburdened, a dodge turns half the damage dodged into Fatigue (8 sixteenths). */
export const DODGE_BASE = 8;

/** A Block adds this much Resistance (half the damage) on top of armor and weapon. */
export const BLOCK_BASE = 8;


/** Rest clears this much Fatigue. */
export const REST_CLEARS = 8;

/* ============================================================
 * Derived numbers
 * ============================================================ */

export const sixteenths = (n: number, maxHP: number) => (n / 16) * maxHP;

/** Attacks and Blocks use the weight of the action when it has one, otherwise the fighter's weapon. */
export const attackCost = (f: Fighter, weight: WeaponTier = f.weapon) => sixteenths(WEAPONS[weight].cost, f.maxHP);

export const attackDamage = (f: Fighter, weight: WeaponTier = f.weapon) => sixteenths(WEAPONS[weight].damage, f.maxHP);

export const restAmount = (f: Fighter) => sixteenths(REST_CLEARS, f.maxHP);

/**
 * What a Rest would give back right now (for the preview on the bar): the Fatigue it clears, and
 * the Health that returns if it clears more than there is (half the excess; the lost Health, shown black).
 */
export function restRecovery(f: Fighter): { fatigue: number; heal: number } {
  const amount = restAmount(f);
  const fatigue = Math.min(f.fatigue, amount);
  const excess = amount - f.fatigue;
  return { fatigue, heal: excess > 0 ? Math.min(excess / 2, f.death) : 0 };
}

/**
 * Share of incoming damage turned into Fatigue (0..1). Armor alone when not blocking; a Block
 * adds the baseline and its weight's bonus.
 */
export const resistance = (f: Fighter, blockWeight: WeaponTier | null) =>
  Math.min(1, (ARMOR[f.armor].resist + (blockWeight ? BLOCK_BASE + WEAPONS[blockWeight].block : 0)) / 16);

/**
 * The Fatigue a dodged attack of this much damage turns into: (base + armor weight + weapon
 * weight) sixteenths of it. True weight: what you carry, whatever the action. A Maneuver that
 * dodges nothing costs nothing at all.
 */
export const dodgeWeight = (f: Fighter) => DODGE_BASE + ARMOR[f.armor].weight + WEAPONS[f.weapon].weight;

export const dodgeFatigue = (f: Fighter, damage: number) => (damage * dodgeWeight(f)) / 16;

/** Healing clears Death first, then restores health. */
export function heal(f: Fighter, amount: number) {
  const fromDeath = Math.min(f.death, amount);
  f.death -= fromDeath;
  f.hp = Math.min(f.maxHP, f.hp + amount - fromDeath);
}

/**
 * Death: it fills missing health first. Past that, the excess lowers Health by half of what is
 * left over, and the lowered Health is filled with Death too, which takes from the excess as well:
 * so every point of Health lost costs three of the excess. (1 missing, 0 Death, +4 Death: the room
 * takes 1, the other 3 lower Health by 1; now 2 missing, all Death.)
 */
export function addDeath(f: Fighter, amount: number) {
  if (amount <= 0) return;
  const room = Math.max(0, f.maxHP - f.hp - f.death);
  if (amount <= room) { f.death += amount; return; }
  f.hp -= (amount - room) / 3;
  f.death = f.maxHP - Math.max(0, f.hp);
}

/** Pays an eternal effect from your Eternity; whatever it can't pay becomes Death on you. */
export function spendEternity(p: Player, amount: number): { spent: number; death: number } {
  const spent = Math.min(Math.max(0, p.eternity), amount);
  p.eternity -= spent;
  const death = amount - spent;
  addDeath(p, death);
  return { spent, death };
}
