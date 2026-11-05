/**
 * stance.ts — the player's stance: what you hold between turns, and how your attacks swing from it. It is only a matter of how you
 * look and move (no number of the rules depends on it), but it is part of the fight's state, so it lasts from turn to turn.
 *
 *  - Idle: where you start, and where a Rest, a stagger and its recovery leave you.
 *  - Lowered (`low`): knees bent, neither leg leading: after a Block, or after an overhead swing.
 *  - Left leg leading (`lead-left`): after a swing to the right, or after dodging forward (a Maneuver on an enemy).
 *  - Right leg leading (`lead-right`): after a swing to the left, or after dodging back (falling back).
 *
 * Your next attack swings: overhead from idle, and at a back-line or staggered enemy from any stance; otherwise to the left from the
 * lowered and the left-leading stances, to the right from the right-leading one. ("Right" and "left" are the screen's: right is toward the
 * enemies.)
 */
import type { Enemy, PlayerAction, Stance, Swing } from "./types";

/** How your attack at this enemy swings from this stance. */
export function swingFor(stance: Stance, target?: Pick<Enemy, "line" | "staggered">): Swing {
  if (stance === "idle" || !target || target.line === "back" || target.staggered) return "overhead";
  return stance === "lead-right" ? "right" : "left";
}

/** The stance you take after acting. */
export function stanceAfter(act: PlayerAction, swing: Swing | undefined): Stance {
  switch (act.type) {
    case "attack":
      return swing === "right" ? "lead-left" : swing === "left" ? "lead-right" : "low";
    case "block":
      return "low";
    case "maneuver":
      return act.target === "self" ? "lead-right" : "lead-left";
    default:
      return "idle";
  }
}
