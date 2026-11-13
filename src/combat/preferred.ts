/**
 * preferred.ts — which alternative of an action you last used (selection.ts `alternatives`), kept for you: it is what the action does
 * when its wheel is not opened up, and the part highlighted when it is. It lives in the browser (localStorage), so quitting, resting
 * and leaving a fight keep it.
 */
import type { SubSlot } from "./selection";

const KEY = "demo-eternal-preferred-alternatives";

/** The actions that have alternatives. */
export type AlternativeAction = "attack";

const read = (): Partial<Record<AlternativeAction, SubSlot>> => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") ?? {}; } catch { return {}; }
};

/** The alternative you last used for this action (the main one, the first time). */
export function preferredAlternative(action: AlternativeAction): SubSlot {
  const s = read()[action];
  return s === "left" || s === "right" ? s : "right";
}

/** Remember the alternative you just used. */
export function rememberAlternative(action: AlternativeAction, slot: SubSlot) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...read(), [action]: slot })); } catch { /* (a browser that will not keep it: it is forgotten) */ }
}
