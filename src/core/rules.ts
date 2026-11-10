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

/** `name`: the weapon of that weight in this demo (its eternal version is "Eternal <name>"). */
export const WEAPONS: Record<WeaponTier, { weight: number; cost: number; damage: number; block: number; label: string; name: string }> = {
  baseline: { weight: 0, cost: 1, damage: 1, block: 0, label: "None", name: "Bare hands" },
  light:  { weight: 0.5, cost: 1, damage: 2, block: 0.5, label: "Light", name: "Jagged Chisel" },
  normal: { weight: 1, cost: 3, damage: 3, block: 1, label: "Normal", name: "Waxed Torch" },
  heavy:  { weight: 1.5, cost: 5, damage: 4, block: 1.5, label: "Heavy", name: "Brick Hammer" },
};

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
 * resist: Resistance, in sixteenths (none has none: only a Block gives a base, and gear adds a little to it).
 * weight: how much it burdens you, in sixteenths (the same as its resist). Together with your weapon's, it sets how
 * tiring a dodge is (see dodgeFatigue).
 */
export const ARMOR: Record<ArmorTier, { resist: number; weight: number; label: string }> = {
  none:   { resist: 0, weight: 0, label: "None" },
  light:  { resist: 0.5, weight: 0.5, label: "Light" },
  normal: { resist: 1, weight: 1, label: "Normal" },
  heavy:  { resist: 1.5, weight: 1.5, label: "Heavy" },
};

/** Head gear counts for this share of the resistance and weight of armor of its tier (and adds to what the body armor gives). */
export const HEAD_SHARE = 1 / 2;
const headOf = (f: Fighter): ArmorTier => (f as Partial<Player>).head ?? "none";
const headResist = (f: Fighter) => (headOf(f) === "none" ? 0 : ARMOR[headOf(f)].resist * HEAD_SHARE);
const headWeight = (f: Fighter) => (headOf(f) === "none" ? 0 : ARMOR[headOf(f)].weight * HEAD_SHARE);

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
 * Share of incoming damage turned into Fatigue (0..1). Armor alone when not blocking; a Block
 * adds the baseline and its weight's bonus.
 */
export const resistance = (f: Fighter, blockWeight: WeaponTier | null) =>
  Math.min(1, (ARMOR[f.armor].resist + headResist(f) + (blockWeight ? BLOCK_BASE + WEAPONS[blockWeight].block : 0)) / 16);

/**
 * The Fatigue a dodged attack of this much damage turns into: (base + armor weight + weapon
 * weight) sixteenths of it. True weight: what you carry, whatever the action. A Maneuver that
 * dodges nothing costs nothing at all.
 */
export const dodgeWeight = (f: Fighter) => DODGE_BASE + ARMOR[f.armor].weight + headWeight(f) + WEAPONS[f.weapon].weight;

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
