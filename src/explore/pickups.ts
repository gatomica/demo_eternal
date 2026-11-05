/**
 * pickups.ts — gear lying on the map, waiting to be picked up (E). Once taken it stays taken. On the
 * floor every piece looks the same: a small glowing ball of yarn (light blue if eternal; `drawPickup`).
 */
import type { GearSpec } from "./gear";

export interface Pickup {
  id: string;
  /** Where it lies: on the floor, in tiles on the world grid. */
  at: { x: number; y: number; z: number };
  gear?: GearSpec;
  /** ...or a lump of eternal string (no memory: it goes to the eternal String counter). */
  eternalString?: number;
}

/** Set on the map by hand. Most are a lump of eternal string (+10), the Gallery's two are eternal memories; coordinates are plan + 1 (a tile's middle is a half). */
export const PICKUPS: Pickup[] = [
  // The labyrinth: the dead end of the ring (the top of the stub up the west side)...
  { id: "string-lab-deadend", at: { x: 21.5, y: 16.5, z: 0 }, eternalString: 10 },
  // ...the raised south room (reached by dropping down from the south chapel above)...
  { id: "string-lab-south", at: { x: 25.5, y: 28.5, z: 1 }, eternalString: 10 },
  // ...and the north room.
  { id: "string-lab-north", at: { x: 26.5, y: 9.5, z: 0 }, eternalString: 10 },

  // The dungeon's first floor (the wheel on level 6, the wax rooms raised to level 7 and 8).
  // The SE diagonal corridor: down the stairs, before the metal bars.
  { id: "string-a-se-corridor", at: { x: 36.5, y: 25.5, z: 6 }, eternalString: 10 },
  // The corner of the west chapel, with the sleepwalkers.
  { id: "string-a-west", at: { x: 7.5, y: 21.5, z: 6 }, eternalString: 10 },
  // The south corridor's ledge, right before the drop into the dug-out SW hall.
  { id: "string-a-south-ledge", at: { x: 19.5, y: 27.5, z: 6 }, eternalString: 10 },
  // The north wall of the wax-filled north chapel.
  { id: "string-a-north-chapel", at: { x: 27.5, y: 5.5, z: 7 }, eternalString: 10 },
  // The NE diagonal corridor's ledge, right before it drops into the Nave.
  { id: "string-a-ne-ledge", at: { x: 35.5, y: 14.5, z: 8 }, eternalString: 10 },
  // The east corridor's ledge, right before it drops onto the SE hall.
  { id: "string-a-east-ledge", at: { x: 39.5, y: 25.5, z: 8 }, eternalString: 10 },

  // The second floor, the Gallery (level 10).
  // The north wall of the wax-covered room, north of the east room: the memory of the Waxed Torch.
  { id: "memory-b-torch", at: { x: 45.5, y: 7.5, z: 10 }, gear: { slot: "weapon", tier: "normal", eternal: true } },
  // A corner of the south room (the south-west one): the memory of the Jagged Chisel.
  { id: "memory-b-chisel", at: { x: 24.5, y: 32.5, z: 10 }, gear: { slot: "weapon", tier: "light", eternal: true } },
];

/** Gear lying where something fell or where you let it go, not set on the map: picked up like the rest. */
export interface GroundItem {
  id: string;
  at: { x: number; y: number; z: number };
  /** The gear lying there... */
  gear?: GearSpec;
  /** ...or a pile of String (what you lost on dying with no enemy to hold it: half of it, to gather). */
  string?: number;
  /** ...or eternal string, dropped by an enemy or set on the map: it goes to the eternal String counter, which death never empties. */
  eternalString?: number;
  /** The enemy it dropped from (a key of the journey's corpses): it goes when that one gets up again, and comes back when it falls. Missing: you left it there. */
  from?: string;
}


/** How close you must stand to pick something up, in tiles. */
export const PICKUP_REACH = 0.9;
