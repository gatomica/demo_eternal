/**
 * fight.ts — starting a fight: your loadout, health and revives, and the opening scene if it has
 * one (the Warden taking a waxed's flame).
 */
import { createCombat, openingOf } from "../core/setup";
import type { ArmorTier, CombatConfig, CombatState, EnemySetup, Opening, WeaponTier } from "../core/types";

/** What you carry into a fight. */
export interface Loadout {
  weapon: WeaponTier;
  armor: ArmorTier;
  /** The weapon is eternal (its blows carry its eternal effect, paid with Eternity). */
  eternal?: boolean;
}

/** Your starting health (the tutorial's). */
export const PLAYER_MAX_HP = 20;

/** Your revives in a fight, unless it says otherwise. */
const REVIVE_CHARGES = 2;

/** A fight against these enemies, with its opening scene if it has one. `eternity`: what you bring of it (default: full). */
export function newFight(enemies: EnemySetup[], loadout: Loadout, charges = REVIVE_CHARGES, config: CombatConfig = {}, eternity?: number): { state: CombatState; opening?: Opening } {
  const state = createCombat({ maxHP: PLAYER_MAX_HP, weapon: loadout.weapon, armor: loadout.armor, eternal: loadout.eternal, eternity, charges }, enemies, config);
  return openingOf(state, enemies);
}
