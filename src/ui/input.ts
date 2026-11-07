/**
 * input.ts — keys: the game is played on the keyboard (WASD, like exploring), with the mouse as a
 * convenience. Arrow keys, Enter and Escape mirror WASD, E and Q.
 */
import { useEffect, useRef } from "react";
import { play } from "../audio/sfx";

export type Dir = "up" | "left" | "down" | "right";

type Key = Dir | "select" | "back" | "pause";

/** The direction a key stands for (WASD or the arrows), if any. */
export function dirOf(key: string): Dir | null {
  switch (key.toLowerCase()) {
    case "w": case "arrowup": return "up";
    case "a": case "arrowleft": return "left";
    case "s": case "arrowdown": return "down";
    case "d": case "arrowright": return "right";
    default: return null;
  }
}

function readKey(e: KeyboardEvent): Key | null {
  const dir = dirOf(e.key);
  if (dir) return dir;
  switch (e.key.toLowerCase()) {
    case "e": case "enter": case " ": return "select";
    case "q": return "back";
    case "escape": return "pause";
    default: return null;
  }
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
