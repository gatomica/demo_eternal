/**
 * setup.ts — setting up a fight, and its opening scene.
 */
import { ENEMY_KINDS } from "./bestiary";
import { chooseIntents, describeAction } from "./intents";
import { snapshotOf } from "./resolve";
import type { CombatConfig, CombatEvent, CombatState, Enemy, EnemySetup, Opening, Player, PlayerSetup, Rng } from "./types";

/**
 * The fight's opening scene, if its setup has one: a Warden takes the flame an offering waxed
 * cradles (Usurp Flame), showing the mechanic before the fight begins. He starts Sealed, his
 * flame out; the scene leaves him Unsealed, the waxed encased for good, and every first intent
 * chosen afresh (his comes from "Usurp Flame >": Idle). Returns the fight after it.
 */
export function openingOf(state: CombatState, setups: EnemySetup[], rng: Rng = Math.random): { state: CombatState; opening?: Opening } {
  const offering = state.enemies.find((e, i) => setups[i]?.offering && e.kind === "waxed");
  const warden = state.enemies.find(e => e.kind === "warden");
  if (!offering || !warden) return { state };
  const kind = (k: string) => ENEMY_KINDS[k];
  const usurp = kind("warden").pattern.actions.get("usurp flame");
  const clutch = kind("waxed").pattern.actions.get("clutch flame");
  if (!usurp || !clutch) return { state };

  // After: the flame his, the waxed sealed whole in wax, and everyone's first move chosen.
  const after = structuredClone(state);
  const w = after.enemies.find(e => e.id === warden.id)!;
  const o = after.enemies.find(e => e.id === offering.id)!;
  w.flags.sealed = false;
  w.last = { name: "Usurp Flame", outcome: "done" };
  o.alive = false;
  o.fate = "encased";
  o.hp = 0;
  o.fatigue = 0;
  after.lastTurn = [];
  chooseIntents(after, rng);

  // Before: the same (so the others hold the stances they'll fight from), but his flame out
  // and the waxed holding its own out to him.
  const from = structuredClone(after);
  const w0 = from.enemies.find(e => e.id === warden.id)!;
  const o0 = from.enemies.find(e => e.id === offering.id)!;
  w0.flags.sealed = true;
  w0.last = null;
  w0.intent = { ...describeAction("warden", w0.line, "Idle", usurp), target: o0.id, dir: "retreat" };
  o0.alive = true;
  o0.fate = undefined;
  o0.hp = o0.maxHP;
  o0.intent = describeAction("waxed", o0.line, "Cradle Flame", clutch);

  const events: CombatEvent[] = [
    { kind: "usurp", who: w.id, target: o.id },
    { kind: "encased", who: o.id },
    { kind: "flag", who: w.id, flag: "sealed", on: false },
  ];
  return { state: after, opening: { from, steps: [{ events, after: snapshotOf(after.player, after.enemies) }] } };
}

export function createCombat(
  player: PlayerSetup,
  enemies: EnemySetup[],
  config: Partial<CombatConfig> = {},
  rng: Rng = Math.random,
): CombatState {
  const p: Player = {
    id: "player",
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
      staggered: false,
      line: setup.line ?? "back",
      alive: true,
      script: setup.script ?? [],
      intent: { type: "block", dir: "advance", forced: false }, // replaced below
      last: null,
      waxed: false,
      flags: { ...kind.flags },
      revives: kind.revives ?? 0,
      reviving: false,
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
