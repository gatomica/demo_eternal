/**
 * input.ts — keys: the game is played on the keyboard, with the mouse as a convenience. The keys
 * are the player's bindings (`ui/settings.ts`: WASD, E for Yes and Q for No unless changed);
 * the arrow keys, Enter, Space and Escape always work too, unless one of them is bound to something else.
 */
import { useEffect, useRef } from "react";
import { play } from "../audio/sfx";
import { getSettings } from "./settings";

export type Dir = "up" | "left" | "down" | "right";

export type Key = Dir | "select" | "back" | "pause";

/** What a key (`KeyboardEvent.key`) does: the player's bindings first, then the fixed keys. */
export function keyOf(key: string): Key | null {
  const k = key.toLowerCase();
  const b = getSettings().keys;
  if (k === b.up) return "up";
  if (k === b.left) return "left";
  if (k === b.down) return "down";
  if (k === b.right) return "right";
  if (k === b.yes) return "select";
  if (k === b.no) return "back";
  switch (k) {
    case "arrowup": return "up";
    case "arrowleft": return "left";
    case "arrowdown": return "down";
    case "arrowright": return "right";
    case "enter": case " ": return "select";
    case "escape": return "pause";
    default: return null;
  }
}

/** The direction a key stands for (the bound directions or the arrows), if any. */
export function dirOf(key: string): Dir | null {
  const k = keyOf(key);
  return k === "up" || k === "left" || k === "down" || k === "right" ? k : null;
}

function readKey(e: KeyboardEvent): Key | null {
  return keyOf(e.key);
}

export function useKeys(handler: (key: Key) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const key = readKey(e);
      if (!key) return;
      e.preventDefault();
      ref.current(key);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/** The menus' sounds for a key: a faint tic for changing option (WASD), a tac for choosing (E). Call it from a menu's key handler. */
export function menuSound(key: Key) {
  if (key === "select") play("tac");
  else if (key === "up" || key === "down" || key === "left" || key === "right") play("tic");
}

/** Index `i` moved `by` places through a list of `n`, wrapping around at either end. */
export const wrapIndex = (i: number, by: number, n: number) => (i + by + n) % n;

/** The item `by` places from `current` in `list`, wrapping around at either end. */
export const cycle = <T,>(list: readonly T[], current: T, by: number): T => list[wrapIndex(list.indexOf(current), by, list.length)];
