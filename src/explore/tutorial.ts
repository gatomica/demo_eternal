/**
 * tutorial.ts — the guide's teaching, in the order it happens. You wake in a room whose exits are
 * sealed in wax. The guide drops down from the raised platform beside it and tells you what it
 * wants to see: you, beating the Waxed lying in the corner (walk up to it), with the coach beside
 * you. Then it asks you to come closer and rest with it; you sleep, and when you wake the guide
 * gives you the knot and the wax melts. The coach's steps and tips are in combat/training.ts.
 */

/** How the tutorial stands. */
export interface TutorialState {
  /** The guide has spoken to you (the first time you interact with it). */
  greeted: boolean;
  /** The Waxed in the room is beaten; the guide now asks you to rest with it. */
  beaten: boolean;
  /** You have rested with the guide, and woken to the knot; the wax is gone for good. */
  done: boolean;
  /** Times that fight has beaten you. The guide remembers every one. */
  attempts: number;
}

export const NEW_TUTORIAL: TutorialState = { greeted: false, beaten: false, done: false, attempts: 0 };

/** The map enemy you must beat (see foes.ts). */
export const TUTORIAL_FOE = "start-waxed";

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

/** What the guide does once it has said everything: nothing, or (after the gift) let the wax go. */
export type After = "none" | "melt";

export interface Talk {
  lines: string[];
  after: After;
}

/** The first time you speak to it: the lesson. */
export const GREETING: Talk = {
  after: "none",
  lines: [
    "Ah... you've finally woken up.",
    "Forgive the entrance. I have watched over you from up there for a long while.",
    "The wardens sealed these doors in wax to keep us in the warm and the quiet. I can loosen it, but not for someone who will lie down in the first corridor.",
    "You will not fight it bare-handed. There is a broken sword lying near where you woke. Take it, and equip it: open your inventory with Esc.",
    "Then the Waxed lying in the corner, long past knowing you. Walk up to it. Show me you can stand and fight: strike, block, slip away, fall back, rest. Then finish it.",
  ],
};

/** Speaking again before you have beaten it. */
const REMINDER: Talk = {
  after: "none",
  lines: ["Take the broken sword near where you woke, and equip it (Esc). Then the Waxed in the corner: strike, block, slip away, fall back, rest, and then finish it. The wax will not give way before."],
};

/** Waking after it has beaten you. */
const AGAIN: Talk = {
  after: "none",
  lines: [
    "You're back. Good.",
    "I felt you drifting. That cozy drowsiness is how the others went. One moment they were resting, the next they were kneeling in wax.",
    "Don't let it claim you. Go to it again, with the broken sword in hand, and this time finish it.",
  ],
};

/** The Waxed is beaten: relief, and the invitation to rest. */
export const RELIEF: Talk = {
  after: "none",
  lines: [
    "...You did it. All of it.",
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

/** What the guide says when you speak to it before you have beaten the Waxed. */
export const guideTalk = (t: TutorialState): Talk => (!t.greeted ? GREETING : t.attempts === 0 ? REMINDER : AGAIN);
