/**
 * training.ts — the coach for the tutorial fight against the Waxed in the start room: the five
 * actions you are asked to show, one at a time, and a tip or warning after every turn.
 */
import type { CombatState, PlayerAction } from "../core/types";

/** One thing the guide asks of you. */
export interface CoachStep {
  title: string;
  /** What to do, with the keys. */
  text: string;
  /** Whether this choice is the one asked for. */
  matches: (a: PlayerAction) => boolean;
}

/** In the order the guide teaches them. */
export const TRAINING_STEPS: CoachStep[] = [
  {
    title: "Attack",
    text: "Strike it. Select the Waxed, press E, then E again to Attack (W).",
    matches: a => a.type === "attack",
  },
  {
    title: "Block",
    text: "It's about to scratch at you. Press E on the Waxed, then Block (D). A Block catches its blows.",
    matches: a => a.type === "block",
  },
  {
    title: "Maneuver",
    text: "Press E on the Waxed, then Maneuver (A). You slip out of the way of its next blow and draw it to the front.",
    matches: a => a.type === "maneuver" && a.target !== "self",
  },
  {
    title: "Fall back",
    text: "Select yourself (S), press E, then Fall back (A). It pushes everyone back out of reach.",
    matches: a => a.type === "maneuver" && a.target === "self",
  },
  {
    title: "Rest",
    text: "Select yourself (S), press E, then Rest (S). Resting lets you recover, but a blow breaks it.",
    matches: a => a.type === "rest",
  },
];

/**
 * The Waxed in the start room cradles its flame every fourth turn and scratches in between, so
 * Block and Maneuver have a blow to answer and a Rest has a moment. (It is a real fight; until
 * every step is done, `CombatConfig.sparring` keeps it from ending early: the Waxed staggers but
 * never falls, and you never drop below 1.)
 */
export const TRAINING_SCRIPT = Array.from({ length: 60 }, (_, i) => (i % 4 === 0 ? "Clutch Flame" : "Scratch"));

/** A line under the instruction, after a turn: what just happened, or a warning. */
export interface Tip {
  text: string;
  warn: boolean;
}

/**
 * What the guide says about the turn that just played (the most important thing only), or null.
 * Warnings come first: a stagger, low Health, Fatigue close to your Health.
 */
export function tipAfter(s: CombatState): Tip | null {
  const events = s.lastTurn.flatMap(step => step.events);
  const p = s.player;
  const attacks = events.filter((e): e is Extract<typeof e, { kind: "attack" }> => e.kind === "attack");
  const struck = attacks.find(a => a.target === "player");

  if (events.some(e => e.kind === "stagger" && e.who === "player")) {
    return { warn: true, text: "Staggered! Your Fatigue reached your Health, so your next turn is a forced Rest and you can't act. Keep an eye on the Fatigue bar before it fills." };
  }
  if (events.some(e => e.kind === "stagger" && e.who !== "player")) {
    return { warn: false, text: "You staggered it: its Fatigue reached its Health, so it loses its next turn. Press the advantage. (The guide keeps this one from falling.)" };
  }
  if (p.hp <= p.maxHP / 2) {
    return { warn: true, text: "Careful: your Health is low. Fatigue is the one that goes away by Resting; Health only returns once your Fatigue is gone, and only partly." };
  }
  if (p.fatigue >= p.hp / 2) {
    return { warn: true, text: "Warning: your Fatigue is high. When it reaches your Health you are Staggered and lose a turn. Resting clears it (a hit breaks the Rest)." };
  }
  if (struck?.result === "hit" && struck.damage > 0) {
    return { warn: false, text: "That hurt: the blow took Health, and what your armor resisted became Fatigue. Blocking or dodging turns more of it into Fatigue instead of damage." };
  }
  if (struck?.result === "blocked") {
    return { warn: false, text: "Blocked. Most of the blow became Fatigue, sent back at the attacker. A Block only answers attacks from its target and from the back line." };
  }
  if (struck?.result === "dodged") {
    return { warn: false, text: "Dodged: no Health lost, but a dodge still costs some Fatigue, more the heavier you are." };
  }
  if (events.some(e => e.kind === "rest" && e.who === "player" && e.result === "interrupted")) {
    return { warn: true, text: "A blow broke your Rest, so nothing was recovered. Rest when nothing is about to hit you." };
  }
  if (events.some(e => e.kind === "rest" && e.who === "player" && e.result === "rested")) {
    return { warn: false, text: "Rested: some of your Fatigue is gone. Rest past zero and half of the excess heals your Health." };
  }
  if (attacks.some(a => a.attacker === "player")) {
    return { warn: false, text: "Every attack tires you: look at your Fatigue bar. A bar that fills up to your Health means a Stagger." };
  }
  return null;
}
