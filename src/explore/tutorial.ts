/**
 * tutorial.ts — the guide's teaching, in the order it happens. A new game opens inside the lesson:
 * you wake in the dark and the guide's light comes toward you, then a fight against the guide itself,
 * bare-handed (the scripted turns are in combat/lesson.ts). Passed, you are in the labyrinth's
 * first room, with a safe spot to rest by, and the way on is yours. At the second safe spot, on the
 * first floor, the guide gives you the knot. (The guide's words here are placeholders, to be remade.)
 */

/** How the tutorial stands. */
export interface TutorialState {
  /** The lesson is passed. */
  beaten: boolean;
  /** You have reached the first floor's safe spot and been given the knot. */
  done: boolean;
}

export const NEW_TUTORIAL: TutorialState = { beaten: false, done: false };

/** The safe spot (a keeper's id) where the guide gives you the knot: the first one after the labyrinth. */
export const FIRST_FLOOR_KEEPER = "floor1";

/**
 * The knot: your one revive for this demo. Absent until the guide gives it. "wound": it will
 * keep you from fading once; "unwound": it has been spent, and resting with the guide winds it again.
 */
export type Knot = "wound" | "unwound";

/** Revives you carry into a fight. */
export const knotCharges = (k: Knot | undefined) => (k === "wound" ? 1 : 0);

/** What follows the guide's last words: nothing, or the knot. */
export type After = "none" | "knot";

export interface Talk {
  lines: string[];
  after: After;
}

/** The first time you rest at the first floor's safe spot: the knot. (Placeholder words.) */
export const GIFT: Talk = {
  after: "knot",
  lines: [
    "There. Wherever I fade in beside you, rest, and should you fall you will wake there.",
    "Take this. A knot, tangled past all undoing. Look for its ends and you won't find them: no beginning, no end.",
    "Should you fade, it will unwind in your place, and you will not slip away. But only once. Then it hangs slack.",
    "Rest with me again, and I will wind it back for you.",
  ],
};
