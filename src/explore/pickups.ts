/**
 * pickups.ts — gear lying on the map, waiting to be picked up (E). Once taken it stays taken. On the
 * floor every piece looks the same: a small glowing ball of yarn (light blue if eternal; `drawPickup`).
 */
import type { GearSpec } from "./gear";

export interface Pickup {
  id: string;
  /** Where it lies: on the floor, in tiles on the world grid. */
  at: { x: number; y: number; z: number };
  gear: GearSpec;
}

export const PICKUPS: Pickup[] = [
  // On the wheel's south corridor, at its west end: the ledge before the drop into the dug-out SW hall
  // (not the brick sliver with the ladder).
  { id: "eternal-hammer-south", at: { x: 19.5, y: 28, z: 6 }, gear: { slot: "weapon", tier: "heavy", eternal: true } },
];

/** Gear lying where something fell or where you let it go, not set on the map: picked up like the rest. */
export interface GroundItem {
  id: string;
  at: { x: number; y: number; z: number };
  gear: GearSpec;
  /** The enemy it dropped from (a key of the journey's corpses): it goes when that one gets up again, and comes back when it falls. Missing: you left it there. */
  from?: string;
}


/** How close you must stand to pick something up, in tiles. */
export const PICKUP_REACH = 0.9;
