/**
 * keepers.ts — the hooded keepers: figures you can rest by. The last one you rested by is where
 * you wake after falling in a fight.
 */

interface Keeper {
  id: string;
  /** Where it stands (feet, in tiles on the world grid). You wake just in front of it. */
  at: { x: number; y: number; z: number };
}

export const KEEPERS: Keeper[] = [
  // Beside where you first wake.
  { id: "start", at: { x: 7.5, y: 2.6, z: 2 } },
  // Down in the cellar's cold room.
  { id: "cellar", at: { x: 5.5, y: 23.6, z: 1 } },
  // At the top of the stairs into the gallery, halfway up.
  { id: "gallery", at: { x: 37.5, y: 6.6, z: 4 } },
  // In the antechamber, right before the Warden.
  { id: "sanctum", at: { x: 69.5, y: 13.6, z: 6 } },
];

/** The keeper who speaks to you (see tutorial.ts): the one beside where you first wake. They are all the one guide. */
export const GUIDE = "start";

/**
 * The guide isn't always there: it fades in as you come near a place you can rest, fully visible
 * by FADE_NEAR tiles and not at all beyond FADE_FAR.
 */
export const FADE_NEAR = 1.9;
export const FADE_FAR = 3.6;

/** How close you must stand to a keeper to rest by it, in tiles. */
export const KEEPER_REACH = 1.1;

/** How long the line after resting stays up. */
export const REST_NOTE_MS = 2600;
