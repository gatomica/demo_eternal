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

/** How close you must stand to a keeper to rest by it, in tiles. */
export const KEEPER_REACH = 1.1;

/** How long the line after resting stays up. */
export const REST_NOTE_MS = 2600;
