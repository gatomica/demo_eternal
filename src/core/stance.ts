/**
 * stance.ts — the player's stance: what you hold between turns, and how your attacks swing from it. It is only a matter of how you
 * look and move (no number of the rules depends on it), but it is part of the fight's state, so it lasts from turn to turn.
 *
 *  - Idle: where you start, and where a Rest, a stagger and its recovery leave you.
 *  - Lowered (`low`): knees bent, neither leg leading, centred: after a Block, after an overhead swing, or after flinching (a Rest broken by a blow).
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

/**
 * Which leg a Kick throws from this stance: from Left Lead the right leg (spinning on the left foot, it lands as Right Lead with the right leg out),
 * from Right Lead the left (its mirror); from a stance with no leg leading, either, at random. A Kick the action names the leg of keeps it.
 */
export function kickFor(stance: Stance, leg: true | "left" | "right", rng: () => number = Math.random): Swing {
  if (leg !== true) return leg === "right" ? "kick-right" : "kick-left";
  if (stance === "lead-left") return "kick-right";
  if (stance === "lead-right") return "kick-left";
  return rng() < 0.5 ? "kick-right" : "kick-left";
}

/** A stance as a mirror shows it: the leading leg is the other one. */
export const mirrorStance = (st: Stance): Stance => (st === "lead-left" ? "lead-right" : st === "lead-right" ? "lead-left" : st);

/**
 * The stance you take after acting. A Punch, thrown with the left hand, is the mirror of a right-hand blow: it swings (`swingFor`) as the right hand
 * would from the mirrored stance, and leaves you in the mirrored stance the right hand would. So each leading stance offers both sideways swings,
 * the Openhand (a Swing Left, or its mirror) and the Backhand (a Swing Right, or its mirror), the stance deciding which hand throws which: left leg
 * leading, the right hand's Openhand or the left hand's Backhand; right leg leading, the right hand's Backhand or the left hand's Openhand. Either
 * leaves the other leg leading. A Kick lands in the stance of the leg it kicked with.
 */
export function stanceAfter(act: PlayerAction, swing: Swing | undefined): Stance {
  // A Kick lands in the stance its body ends in: the right leg's in Right Lead, the left leg's in Left Lead.
  if (swing === "kick-right") return "lead-right";
  if (swing === "kick-left") return "lead-left";
  const st = stanceAfterRight(act, swing);
  return act.type === "attack" && act.hand === "left" ? mirrorStance(st) : st;
}

function stanceAfterRight(act: PlayerAction, swing: Swing | undefined): Stance {
  switch (act.type) {
    case "attack":
      // (a Stab lunges in with the right shoulder and leg: it lands in Right Lead; a Hookshot's pull lands as the sideways swing it is)
      return swing === "right" || swing === "hook-right" ? "lead-left" : swing === "left" || swing === "hook-left" || swing === "stab" ? "lead-right" : "low";
    case "block":
      return "low";
    case "maneuver":
      return act.target === "self" ? "lead-right" : "lead-left";
    default:
      return "idle";
  }
}
