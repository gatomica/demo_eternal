/**
 * lesson.ts — the tutorial: a fight against the guide in four scripted turns, with the guide
 * speaking to you in a box at the bottom of the screen. Its words write themselves one letter at
 * a time (E finishes them at once), and nothing else can be done meanwhile. Once they are
 * written, only the next key the lesson is asking for works: the lesson walks you through
 * choosing a target, focusing on it (opening its wheel), lighting an option and taking it.
 *
 * The guide's side (Hum, Hum, Halo Blast, Halo Blast, from the back line) is the "tutorial"
 * encounter in core/encounters.ts. The turns:
 *   1. Attack. 2. Rest. 3. Fall back from its halo (a Dodge, on your own wheel). 4. Block the same halo yourself.
 */
import type { PlayerAction } from "../core/types";
import type { Dir } from "../ui/input";

/** An action the lesson asks for. */
export type Want = "attack" | "rest" | "dodge" | "block";

/** How far a step of the lesson wants you to get. */
export type Until =
  | "select"    // the cursor is on the target
  | "open"      // and its wheel is open (focused)
  | "highlight" // and the wanted option is lit
  | "commit";   // and you have taken it: the turn plays

export interface Goal {
  /** Whom the cursor must be on: you, or the guide. */
  on: "player" | "guide";
  until: Until;
  /** The option to light and take (for `highlight` and `commit`). */
  want?: Want;
}

/** One thing the guide says, and what it asks of you. */
export interface Beat {
  /** The guide's words. */
  say: string;
  /** The instruction (or reminder) under them, in brackets. */
  hint: string;
  /** What it asks of you. Without one, the beat is only read, and E goes on. */
  goal?: Goal;
}

/** The wheel's direction for each option (an enemy's wheel has Attack, Dodge and Block; yours, Rest). */
export const WANT_DIR: Record<Want, Dir> = { attack: "up", dodge: "left", block: "right", rest: "down" };

/** Whether this is the action asked for. */
export function isWanted(a: PlayerAction, want: Want): boolean {
  return want === "dodge" ? a.type === "maneuver" : a.type === want;
}

/** The lesson, in order. The turns play out after the beats that commit an action. */
export const LESSON: Beat[] = [
  // Turn 1: attack
  { say: "Over here, sleepless one.", hint: "Press E to focus on your target", goal: { on: "guide", until: "open" } },
  { say: "Come, prove your strength to me.", hint: "Press E to Attack focused target", goal: { on: "guide", until: "commit", want: "attack" } },
  { say: "Promising...", hint: "Attacks deal damage in exchange for fatiguing yourself" },
  // Turn 2: rest
  { say: "Gather yourself...", hint: "Change your target to yourself with WASD", goal: { on: "player", until: "select" } },
  { say: "Catch your breath.", hint: "Select Rest with E", goal: { on: "player", until: "commit", want: "rest" } },
  // Turn 3: dodge
  { say: "Let's change pace.", hint: "Focused, use WASD to switch action to Dodge", goal: { on: "player", until: "highlight", want: "dodge" } },
  { say: "Stand back now...", hint: "Press E to fall back avoiding incoming attacks", goal: { on: "player", until: "commit", want: "dodge" } },
  // Turn 4: block, on your own
  { say: "Do not look away, brace thyself.", hint: "Select Block and press E to fend off a target's incoming attack", goal: { on: "guide", until: "commit", want: "block" } },
  // The end (placeholder words)
  { say: "Well done...", hint: "That is everything the guide can teach you here" },
];

/** What the guide says when you have focused on the wrong one (its wheel is open): until you cancel. (Placeholder words.) */
export const DETOUR: Beat = { say: "Not that one, sleepless one.", hint: "Press Q to cancel" };

/** What the screen knows when asking whether a key is allowed. */
export interface Stand {
  /** The cursor is on the one the goal names. */
  onTarget: boolean;
  wheelOpen: boolean;
  highlight: Dir | null;
}

/**
 * Whether the lesson lets this key through. You may explore: move the cursor, open a wheel, light
 * other options, close it again (Q) and so on; the lesson follows (see `lessonMet`: a step you undo
 * brings back the previous instruction). The only thing held back is taking an action: E takes it
 * only when it is the one asked for, on the one it was asked of. Focusing on the wrong one is allowed too. Directions are "up", "left", "down", "right"; "select" is E.
 */
export function lessonAllows(goal: Goal, key: string, at: Stand): boolean {
  const isDir = key === "up" || key === "left" || key === "down" || key === "right";
  if (isDir) return true;
  if (key === "back") return at.wheelOpen;
  if (key !== "select") return false;
  // With the wheel shut, E opens it on whoever the cursor is on, even if that is the wrong one (the guide then says so).
  if (!at.wheelOpen) return true;
  return at.onTarget && goal.until === "commit" && !!goal.want && at.highlight === WANT_DIR[goal.want];
}

/** Whether this goal is met by the cursor, wheel and lit option alone (a `commit` is met when the action is taken). */
export function lessonMet(goal: Goal, at: Pick<Stand, "onTarget" | "wheelOpen" | "highlight">): boolean {
  if (!at.onTarget) return false;
  if (goal.until === "select") return true;
  if (goal.until === "open") return at.wheelOpen;
  if (goal.until === "highlight") return at.wheelOpen && !!goal.want && at.highlight === WANT_DIR[goal.want];
  return false;
}

/** How long a letter takes to be written, and the extra beat after punctuation. */
export const TYPE_MS = 30;
export const TYPE_PAUSE_MS = 150;
/** The pause after writing a letter: longer after a comma or a full stop. */
export const typeDelay = (text: string, written: number) => (/[.,]/.test(text[written - 1] ?? "") ? TYPE_PAUSE_MS : TYPE_MS);
