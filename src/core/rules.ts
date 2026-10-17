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
  light:  { weight: 1, cost: 1, damage: 2, block: 2, speed: 1, label: "Light" },
  normal: { weight: 3, cost: 3, damage: 3, block: 3, speed: 2, label: "Normal" },
  heavy:  { weight: 8, cost: 8, damage: 4, block: 4, speed: 3, label: "Heavy" },
};

/**
 * resist: Resistance, in sixteenths ("none" is the base 1/16).
 * weight: how much it burdens you, in sixteenths. Together with your weapon's, it sets how
 * tiring a dodge is (see dodgeFatigue).
 */
export const ARMOR: Record<ArmorTier, { resist: number; weight: number; label: string }> = {
  none:   { resist: 1, weight: 0, label: "None" },
  light:  { resist: 2, weight: 1, label: "Light" },
  normal: { resist: 3, weight: 3, label: "Normal" },
  heavy:  { resist: 4, weight: 8, label: "Heavy" },
};

/** Even unburdened, a dodge costs this many sixteenths of the damage dodged. */
export const DODGE_BASE = 1;

/** A flaming flail's direct hit deals this much of its damage again, as extra damage. */
export const FLAMING_BONUS = 1 / 4;

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

/** Share of incoming damage turned into Fatigue (0..1), with a Block of the given weight or none. */
export const resistance = (f: Fighter, blockWeight: WeaponTier | null) =>
  Math.min(1, (ARMOR[f.armor].resist + (blockWeight ? WEAPONS[blockWeight].block : 0)) / 16);

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
