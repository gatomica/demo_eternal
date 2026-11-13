/**
 * fight.ts — starting a fight: your loadout, health and revives, and the opening scene if it has
 * one (the Warden taking a waxed's flame).
 */
import { createCombat, openingOf } from "../core/setup";
import type { ArmorItem, ArmorTier, CombatConfig, CombatState, EnemySetup, HeadItem, Opening, WeaponItem, WeaponTier } from "../core/types";

/** What you carry into a fight. */
export interface Loadout {
  weapon: WeaponTier;
  armor: ArmorTier;
  /** The class's own weapon and armor, if you wear them (see `explore/items.ts`). */
  weaponItem?: WeaponItem;
  armorItem?: ArmorItem;
  /** Your head gear's tier, and which of the classes' own it is, if any. */
  head?: ArmorTier;
  headItem?: HeadItem;
  /** The weapon is eternal: its effect is paid with Eternity (an ordinary weapon's effect is paid in Death). */
  eternal?: boolean;
}

/** Your starting health (the tutorial's). */
export const PLAYER_MAX_HP = 10;

/** Your revives in a fight, unless it says otherwise. */
const REVIVE_CHARGES = 2;

/** A fight against these enemies, with its opening scene if it has one. `eternity`: what you bring of it (default: full); `stats`: your max health and max Eternity as you have raised them. */
export function newFight(enemies: EnemySetup[], loadout: Loadout, charges = REVIVE_CHARGES, config: CombatConfig = {}, eternity?: number, stats?: { maxHP: number; maxEternity: number }): { state: CombatState; opening?: Opening } {
  const state = createCombat({ maxHP: stats?.maxHP ?? PLAYER_MAX_HP, maxEternity: stats?.maxEternity, weapon: loadout.weapon, armor: loadout.armor, weaponItem: loadout.weaponItem, armorItem: loadout.armorItem, head: loadout.head, headItem: loadout.headItem, eternal: loadout.eternal, eternity, charges }, enemies, config);
  return openingOf(state, enemies);
}
