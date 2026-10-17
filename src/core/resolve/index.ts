/**
 * resolve — resolving a turn: what everyone committed to plays out, step by step.
 *
 * `resolveTurn` takes a CombatState and returns a new one (the old one is left untouched), so
 * the UI only has to call it and render whatever comes back.
 *
 * Positions lock at the start: what the player saw during planning is what they fight.
 * 1. Attacks, fastest weapon first (attacks.ts).
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

  const { s } = t;
  s.lastTurn = t.steps;
  s.turn += 1;
  if (s.status === "playing") chooseIntents(s, rng);
  return s;
}
