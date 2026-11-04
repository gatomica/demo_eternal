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
  // The start room's safe spot, by its north wall.
  { id: "start", at: { x: 16.5, y: 11.6, z: 0 } },
  // The Nave's safe spot, in line with the top of the ladder and a few tiles north of it: the guide gives you the knot here.
  { id: "floor1", at: { x: 27.5, y: 14.6, z: 7 } },
  // The Gallery's west room, before the stairs up to the last floor.
  { id: "floor2", at: { x: 15.5, y: 18.6, z: 10 } },
];


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
