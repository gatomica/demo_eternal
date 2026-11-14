/**
 * tutorial.ts — how far along the guide's teaching you are. A new game opens in the labyrinth's first room, already
 * speaking with the guide (`WAKE` in dialogues.ts); the first time you try to leave that room, it stops you (`DOORWAY`), and the second time, it lets you go (`LET_GO`).
 * The first time you speak with it at the second safe spot, on the first floor past the ladder, it asks whether you will go on, and gives you the knot either way (`PERSIST`). At the end of the last corridor, at the foot of the wall of
 * wax, it makes its last offer (`FINAL`): to sleep one more time, and descend; accepting ends the demo. (The old lesson fight against the guide,
 * combat/lesson.ts, is only in Test combat now.)
 */

/** How the tutorial stands. */
export interface TutorialState {
  /** The lesson is passed. */
  beaten: boolean;
  /** The guide has given you the knot (at the first floor's safe spot). */
  done: boolean;
  /** The guide has shown you how to unwind memories (its menu opened on them, the first time you brought one). */
  unwound?: boolean;
  /** The guide has opened Empower Self for you, the first time you had String enough for it (from then on it is just one of its options). */
  empowered?: boolean;
  /** The guide has woken you (a new game opens in that talk). Missing on old saves: counted as done. */
  greeted?: boolean;
  /** The guide has stopped you at the start room's doorway, the first time you tried to leave it. Missing on old saves: counted as done. */
  warned?: boolean;
  /** The second time you tried to leave it, the guide let you go. Missing on old saves: counted as done. */
  letGo?: boolean;
  /** The guide has made its last offer, at the end of the last corridor (from then on, Talk makes it again). */
  offered?: boolean;
}

export const NEW_TUTORIAL: TutorialState = { beaten: false, done: false, greeted: false, warned: false, letGo: false };

/** The safe spot (a keeper's id) where the guide gives you the knot: the first one after the labyrinth. */
export const FIRST_FLOOR_KEEPER = "floor1";

/**
 * The knot: your one revive for this demo. Absent until the guide gives it. "wound": it will
 * keep you from fading once; "unwound": it has been spent, and sleeping by the guide winds it again.
 */
export type Knot = "wound" | "unwound";

/** Revives you carry into a fight. */
export const knotCharges = (k: Knot | undefined) => (k === "wound" ? 1 : 0);

