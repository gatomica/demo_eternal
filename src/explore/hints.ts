/**
 * hints.ts — the control hints of the game's opening stretch (there is no tutorial: the game tells you how to do
 * things, and lets you find out what they do). Keys fade in and out where they act: WASD round you on the map until you
 * leave the first room, "E Open Inventory" until you first open it, and in the first fights the keys on the target mark
 * and the action wheel. Keys for what you have never tried flash faster (see `combat/WheelHints.tsx`). They are all gone
 * for good once you climb out of the shaft into the dungeon proper (`DUNGEON_ALT`).
 *
 * Kept in the browser, apart from the journey (a new game forgets them with the save: `resetHints`).
 */
import { useSyncExternalStore } from "react";

/** The level where the dungeon proper starts (the top of the shaft's ladder: Floor A's outer wheel); the music changes there too. */
export const DUNGEON_ALT = 6;

export interface Hints {
  /** All hints are over: you reached the dungeon proper. */
  off: boolean;
  /** You left the room you woke in (the WASD round you are gone). */
  leftRoom: boolean;
  /** You opened the inventory once ("E Open Inventory" is gone). */
  inventory: boolean;
  /** The actions you have taken at least once in a fight, by `actionKey`. */
  tried: string[];
}

const STORE = "demo-eternal-hints-v1";
const FRESH: Hints = { off: false, leftRoom: false, inventory: false, tried: [] };

function load(): Hints {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return { ...FRESH };
    const h = JSON.parse(raw) as Partial<Hints>;
    return { off: !!h.off, leftRoom: !!h.leftRoom, inventory: !!h.inventory, tried: Array.isArray(h.tried) ? h.tried.filter(t => typeof t === "string") : [] };
  } catch {
    return { ...FRESH };
  }
}

let hints = load();
const listeners = new Set<() => void>();

function set(next: Hints) {
  hints = next;
  try { localStorage.setItem(STORE, JSON.stringify(next)); } catch { /* No storage: they last this visit only. */ }
  for (const l of listeners) l();
}

export const getHints = () => hints;

export function useHints(): Hints {
  return useSyncExternalStore(l => { listeners.add(l); return () => { listeners.delete(l); }; }, getHints);
}

/** A new game: every hint again. */
export const resetHints = () => set({ ...FRESH });

export const hintsOff = () => { if (!hints.off) set({ ...hints, off: true }); };
export const leftFirstRoom = () => { if (!hints.leftRoom) set({ ...hints, leftRoom: true }); };
export const openedInventory = () => { if (!hints.inventory) set({ ...hints, inventory: true }); };

/**
 * What names an action on the wheel, for knowing whether it was ever tried: whose wheel it is (yours or an enemy's), its
 * direction, and for an action opened into alternatives, the part ("enemy:up:left" is the Punch).
 */
export const actionKey = (on: "player" | "enemy", dir: string, slot?: string) => (slot ? `${on}:${dir}:${slot}` : `${on}:${dir}`);

export function triedAction(key: string) {
  if (!hints.tried.includes(key)) set({ ...hints, tried: [...hints.tried, key] });
}
