/**
 * rules.ts — combat's numbers: weapon and armor tables, and the costs, damage and Fatigue they
 * make.
 *
 * Units: weights and costs are written in sixteenths of the fighter's max health, matching the
 * design doc. `sixteenths(n, maxHP)` turns them into real numbers.
 */
import type { ArmorTier, Fighter, WeaponTier } from "./types";

/* ============================================================
 * Tuning tables (sixteenths of max health)
 * ============================================================ */

/** `speed` orders attacks within a turn: lower goes first, equal speeds land together. */
export const WEAPONS: Record<WeaponTier, { weight: number; cost: number; damage: number; block: number; speed: number; label: string }> = {
  baseline: { weight: 0, cost: 1, damage: 1, block: 0, speed: 0, label: "None" },
  light:  { weight: 2, cost: 1, damage: 2, block: 2, speed: 1, label: "Light" },
  normal: { weight: 3, cost: 3, damage: 3, block: 3, speed: 2, label: "Normal" },
  heavy:  { weight: 4, cost: 8, damage: 4, block: 4, speed: 3, label: "Heavy" },
};

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
