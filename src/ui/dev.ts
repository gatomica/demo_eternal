/**
 * dev.ts — the developer tools, kept secret: nothing on screen says they exist. F4 turns them on and off (anywhere); while on, the
 * main menu also offers the test screens and viewers, and a fight's pause menu also offers Restart fight, Skip battle and Main menu.
 * Only the dev servers can turn them on (`DEV_BUILD`); in the production build (`npm run build`, what Netlify ships) they stay off.
 */
import { useSyncExternalStore } from "react";

/**
 * Whether this is a dev server's build, where the developer tools may be turned on. Vite's mode, not `import.meta.env.DEV`:
 * `npm run dev:fast` sets NODE_ENV to production (for React's production build), which turns `DEV` off, but its mode is still
 * "development"; `npm run build`'s is "production".
 */
export const DEV_BUILD = import.meta.env.MODE === "development";

let on = false;
const listeners = new Set<() => void>();

export const isDev = () => on;

export function toggleDev() {
  if (!DEV_BUILD) return;
  on = !on;
  listeners.forEach(l => l());
}

/** Whether the developer tools are on (the screen draws again when it changes). */
export function useDev() {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => { listeners.delete(cb); }; }, isDev);
}
