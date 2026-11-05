/**
 * dev.ts — the developer tools, kept secret: nothing on screen says they exist. F4 turns them on and off (anywhere); while on, the
 * main menu also offers the test screens and viewers, and a fight's pause menu also offers Restart fight, Skip battle and Main menu.
 */
import { useSyncExternalStore } from "react";

let on = false;
const listeners = new Set<() => void>();

export const isDev = () => on;

export function toggleDev() {
  on = !on;
  listeners.forEach(l => l());
}

/** Whether the developer tools are on (the screen draws again when it changes). */
export function useDev() {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => { listeners.delete(cb); }; }, isDev);
}
