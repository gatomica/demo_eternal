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

export const PICKUPS: Pickup[] = [
  // In the start room, near where you wake: the guide has you arm yourself before the Waxed. A
  // broken blade is still a light weapon, and it is eternal: falling doesn't take it from you.
  { id: "broken-sword", at: { x: 3.9, y: 3.4, z: 2 }, gear: { slot: "weapon", tier: "light", name: "Broken sword", eternal: true }, look: "broken-sword" },
  // Down in the cellar, the two big rooms along the way: eternal armor in the first (the cold
  // room, in its far corner), and eternal weapon in the deepest (the ossuary, past its sleepwalker).
  { id: "cellar-armor", at: { x: 13.5, y: 22.6, z: 1 }, gear: { slot: "armor", tier: "normal", eternal: true }, look: "armor" },
  { id: "ossuary-weapon", at: { x: 29.5, y: 30.5, z: 1 }, gear: { slot: "weapon", tier: "normal", eternal: true }, look: "sword" },
  // The rest of the gear, tucked away across the dungeon for those who look. All of it eternal.
  // Light weapon: on the raised platform east of the start room (up the stairs off the south path).
  { id: "platform-weapon", at: { x: 11.5, y: 7.5, z: 3 }, gear: { slot: "weapon", tier: "light", eternal: true }, look: "sword" },
  // Light armor: the hall's south-west corner, out of the way of the stairs and the ladder.
  { id: "hall-armor", at: { x: 13.5, y: 13.4, z: 2 }, gear: { slot: "armor", tier: "light", eternal: true }, look: "armor" },
  // Heavy armor: the belfry, in the far corner of the room with its sleepwalker.
  { id: "belfry-armor", at: { x: 58.5, y: 19.5, z: 5 }, gear: { slot: "armor", tier: "heavy", eternal: true }, look: "armor" },
  // Heavy weapon: the crypt, the deepest place, in the corner furthest from the stairs.
  { id: "crypt-weapon", at: { x: 50.5, y: 31.5, z: 0 }, gear: { slot: "weapon", tier: "heavy", eternal: true }, look: "sword" },
];

/** How close you must stand to pick something up, in tiles. */
export const PICKUP_REACH = 0.9;
