/**
 * save.ts — keeping your progress on the map between visits: where you stand, who is beaten, the
 * tutorial, the knot, your gear and where you last rested. It lives in the browser (localStorage);
 * if that isn't available, the game just plays without saving.
 */
import type { Journey } from "./Exploration";

const KEY = "demo-eternal-journey-v1";

/** Writes your progress down (without the one-off note about what the last fight dropped). */
export function saveJourney(journey: Journey) {
  try {
    const { found: _found, ...keep } = journey;
    localStorage.setItem(KEY, JSON.stringify(keep));
  } catch {
    // No storage: nothing to keep it in.
  }
}

/** Your saved progress, if there is any and it still makes sense. */
export function loadJourney(): Journey | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as Journey;
    return Array.isArray(j.defeated) && j.tutorial && j.inventory && Array.isArray(j.inventory.bag) ? { ...j, taken: j.taken ?? [] } : null;
  } catch {
    return null;
  }
}

export const hasSave = () => loadJourney() !== null;

/** Forgets it, for a new game. */
export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
