/**
 * setup.ts — setting up a fight, and its opening scene.
 */
import { ENEMY_KINDS, kindOf } from "./bestiary";
import { chooseIntents, describeAction } from "./intents";
import { snapshotOf } from "./resolve";
import type { CombatConfig, CombatState, Enemy, EnemySetup, Opening, Player, PlayerSetup, Rng } from "./types";

/**
 * The fight's opening scene, if its setup has one (the Warden taking a waxed's flame): the first
 * kind in the fight with an opening of its own plays it. Returns the fight after it.
 */
export function openingOf(state: CombatState, setups: EnemySetup[], rng: Rng = Math.random): { state: CombatState; opening?: Opening } {
  for (const self of state.enemies) {
    const scene = kindOf(self).opening?.({ self, state, setups, rng, describe: describeAction, chooseIntents });
    if (scene) return { state: scene.after, opening: { from: scene.from, steps: [{ events: scene.events, after: snapshotOf(scene.after.player, scene.after.enemies) }] } };
  }
  return { state };
}

export function createCombat(
  player: PlayerSetup,
  enemies: EnemySetup[],
  config: Partial<CombatConfig> = {},
  rng: Rng = Math.random,
): CombatState {
  const p: Player = {
    id: "player",
    stance: "idle",
    ...(player.weaponItem && player.weapon !== "baseline" ? { weaponItem: player.weaponItem } : {}),
    ...(player.armorItem && player.armor !== "none" ? { armorItem: player.armorItem } : {}),
    ...(player.head && player.head !== "none" ? { head: player.head } : {}),
    ...(player.headItem && player.head && player.head !== "none" ? { headItem: player.headItem } : {}),
    name: player.name ?? "You",
    maxHP: player.maxHP,
    hp: player.maxHP,
    fatigue: 0,
    death: 0,
    weapon: player.weapon,
    armor: player.armor,
    staggered: false,
    waxed: false,
    charges: player.charges,
    reviving: false,
    eternal: !!player.eternal && player.weapon !== "baseline",
    maxEternity: player.maxEternity ?? player.maxHP,
    eternity: Math.min(player.maxEternity ?? player.maxHP, player.eternity ?? player.maxEternity ?? player.maxHP),
  };

  const letters = "ABCDEFGHIJ";
  const foes: Enemy[] = enemies.map((setup, i) => {
    const kind = ENEMY_KINDS[setup.kind];
    if (!kind) throw new Error(`Unknown enemy kind "${setup.kind}"`);
    const maxHP = kind.maxHP;
    return {
      id: `e${i}`,
      kind: setup.kind,
      name: setup.name ?? (enemies.length > 1 ? `${kind.name} ${letters[i]}` : kind.name),
      maxHP,
      hp: maxHP,
      fatigue: 0,
      death: 0,
      weapon: kind.weapon,
      armor: kind.armor,
      // (An enemy's weapon always carries its effect, but the Warden's own flail.)
      eternal: kind.weapon !== "baseline" && !kind.ownWeapon,
      staggered: false,
      line: setup.line ?? "back",
      alive: true,
      script: setup.script ?? [],
      intent: { type: "block", dir: "advance", forced: false }, // replaced below
      last: null,
      waxed: !!kind.alwaysWaxed,
      flags: { ...kind.flags },
      revives: kind.revives ?? 0,
      reviving: false,
      ...(setup.body ? { body: setup.body, part: setup.part } : {}),
      ...(setup.holds ? { holds: setup.holds } : {}),
    };
  });

  const state: CombatState = {
    turn: 1,
    player: p,
    enemies: foes,
    status: "playing",
    config: { ...config },
    lastTurn: [],
  };
  chooseIntents(state, rng);
  return state;
}
