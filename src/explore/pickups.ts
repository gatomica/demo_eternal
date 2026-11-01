/**
 * pickups.ts — gear lying on the map, waiting to be picked up (E). Once taken it stays taken.
 */
import type { GearSpec } from "./gear";

export interface Pickup {
  id: string;
  /** Where it lies: on the floor, in tiles on the world grid. */
  at: { x: number; y: number; z: number };
  gear: GearSpec;
  /** How it looks lying there. */
  look: "broken-sword" | "sword" | "armor";
}

export const PICKUPS: Pickup[] = [];

/** Gear lying where something fell or where you let it go, not set on the map: picked up like the rest. */
export interface GroundItem {
  id: string;
  at: { x: number; y: number; z: number };
  gear: GearSpec;
  /** The enemy it dropped from (a key of the journey's corpses): it goes when that one gets up again, and comes back when it falls. Missing: you left it there. */
  from?: string;
}

/** How a piece of gear lies on the floor. */
export const lookOfGear = (g: GearSpec): Pickup["look"] => (g.slot === "weapon" ? "sword" : "armor");

/** How close you must stand to pick something up, in tiles. */
export const PICKUP_REACH = 0.9;
