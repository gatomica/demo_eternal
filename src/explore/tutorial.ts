/**
 * tutorial.ts — the guide's teaching, in the order it happens. You wake in a room whose exits are
 * sealed in wax. The guide drops down from the raised platform beside it, and when you speak to it
 * the lesson begins: a fight against the guide itself, bare-handed (the scripted turns are in
 * combat/lesson.ts). Then it asks you to come closer and rest with it; you sleep, and when you wake
 * the guide gives you the knot and the wax melts. (The guide's words here are placeholders, to be remade.)
 */

/** How the tutorial stands. */
export interface TutorialState {
  /** The guide has spoken to you (the first time you interact with it). */
  greeted: boolean;
  /** The lesson is passed; the guide now asks you to rest with it. */
  beaten: boolean;
  /** You have rested with the guide, and woken to the knot; the wax is gone for good. */
  done: boolean;
}

export const NEW_TUTORIAL: TutorialState = { greeted: false, beaten: false, done: false };

/**
 * The knot: your one revive for this demo. Absent until the guide gives it. "wound": it will
 * keep you from fading once; "unwound": it has been spent, and resting with the guide winds it again.
 */
export type Knot = "wound" | "unwound";

/** Revives you carry into a fight. */
export const knotCharges = (k: Knot | undefined) => (k === "wound" ? 1 : 0);

/** Where the guide sits when you first wake: on the raised platform east of the room (level 3). */
export const PERCH = { x: 9.6, y: 7.6, z: 3 };
/** Where it lands in the room, at the platform's foot, before walking to its place. */
export const LANDING = { x: 8.5, y: 7.5, z: 2 };
/** The guide waits this long on the platform after you wake, then drops. */
export const DROP_DELAY_MS = 2600;
/** The drop itself, and the walk to its place after it (tiles per second). */
export const DROP_MS = 650;
export const GUIDE_WALK = 2.4;

/** What the guide does once it has said everything: nothing, begin the lesson (a fight against it), or (after the gift) let the wax go. */
export type After = "none" | "fight" | "melt";

export interface Talk {
  lines: string[];
  after: After;
}

/** The first time you speak to it: the lesson begins. (Placeholder words.) */
export const GREETING: Talk = {
  after: "fight",
  lines: [
    "Ah... you've finally woken up.",
    "Forgive the entrance. I have watched over you from up there for a long while.",
    "Show me you can stand and fight. Come.",
  ],
};

/** Speaking again before you have passed the lesson. */
const REMINDER: Talk = {
  after: "fight",
  lines: ["Again, then. Show me you can stand and fight."],
};

/** The lesson is passed: relief, and the invitation to rest. */
export const RELIEF: Talk = {
  after: "none",
  lines: [
    "...You did it.",
    "Forgive me. I had stopped hoping to find another soul who is still sane in this world.",
    "Come closer. Rest with me a moment, here by the candle.",
  ],
};

/** You have woken from resting with it: the knot, and then the wax. */
export const GIFT: Talk = {
  after: "melt",
  lines: [
    "There. Wherever I fade in beside you, rest, and should you fall you will wake there.",
    "Take this. A knot, tangled past all undoing. Look for its ends and you won't find them: no beginning, no end.",
    "Should you fade, it will unwind in your place, and you will not slip away. But only once. Then it hangs slack.",
    "Rest with me again, and I will wind it back for you.",
    "Now stand still. The wax gives way for those who are awake.",
  ],
};

/** What the guide says when you speak to it before you have passed the lesson. */
export const guideTalk = (t: TutorialState): Talk => (!t.greeted ? GREETING : REMINDER);
