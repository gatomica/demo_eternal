/**
 * resolve — resolving a turn: what everyone committed to plays out, step by step.
 *
 * `resolveTurn` takes a CombatState and returns a new one (the old one is left untouched), so
 * the UI only has to call it and render whatever comes back.
 *
 * Positions lock at the start: what the player saw during planning is what they fight.
 * 1. Attacks, yours first, then the enemy you aimed at, then the rest at random (attacks.ts).
 * 2. Revives land and Rests settle (rests.ts).
 * 3. Movement (movement.ts).
 * 4. End of turn: decay, falls and staggers, each kind's own rules (endTurn.ts). Then every
 *    enemy picks its next intent.
 */
import { chooseIntents } from "../intents";
import type { CombatState, PlayerAction, Rng } from "../types";
import { resolveAttacks } from "./attacks";
import { endTurn } from "./endTurn";
import { resolveMovement } from "./movement";
import { settleRests } from "./rests";
import { beginTurn, forcedAction } from "./turn";

export { forcedAction, snapshotOf } from "./turn";

/** Returns why an action can't be taken, or null if it's valid. Costs never block: overcommitting is allowed. */
export function validateAction(state: CombatState, action: PlayerAction): string | null {
  if (state.status !== "playing") return "The fight is over.";
  if (forcedAction(state)) return null; // the forced action replaces whatever was chosen
  const alive = (id?: string) => state.enemies.some(e => e.alive && e.id === id);
  switch (action.type) {
    case "rest":
      return null;
    case "attack":
    case "block":
      return alive(action.target) ? null : "Choose an enemy to target.";
    case "maneuver":
      return action.target === "self" || alive(action.target) ? null : "Choose an enemy, or yourself to fall back.";
  }
}

export function resolveTurn(prev: CombatState, action: PlayerAction, rng: Rng = Math.random): CombatState {
  if (prev.status !== "playing") return prev;
  const problem = validateAction(prev, action);
  if (problem) throw new Error(problem);

  const t = beginTurn(prev, action);
  resolveAttacks(t, rng);
  settleRests(t);
  resolveMovement(t);
  endTurn(t);
  return finishTurn(t, rng);
}

/**
 * The developer tools' Skip battle: a turn in which no one acts (you included), and every enemy still up falls on the spot, as if struck down.
 * The turn ends as any other, so revives still land: the Warden falls, rises with his revive and goes into his second form; skipped again
 * there, he falls for good and the fight is won.
 */
export function resolveSkip(prev: CombatState, rng: Rng = Math.random): CombatState {
  if (prev.status !== "playing") return prev;
  const t = beginTurn(prev, { type: "rest" });
  t.act = null;
  t.resting.clear();
  for (const e of t.alive) {
    e.hp = 0;
    e.fatigue = 0;
    e.staggered = false;
    t.out.add(e.id);
    t.fallen.add(e.id);
    t.emit({ kind: "fall", who: e.id });
  }
  t.endStep();
  endTurn(t);
  return finishTurn(t, rng);
}

/** A resolved turn's last touches: its steps kept, the turn counted, and every enemy's next intent picked. */
function finishTurn(t: ReturnType<typeof beginTurn>, rng: Rng): CombatState {
  const { s } = t;
  s.lastTurn = t.steps;
  s.turn += 1;
  if (s.status === "playing") chooseIntents(s, rng);
  return s;
}
