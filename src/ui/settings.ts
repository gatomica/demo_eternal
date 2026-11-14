/**
 * settings.ts — the player's settings: the text size and the key bindings, kept in the browser
 * (localStorage) so they last between visits. The Settings panel (`ui/SettingsPanel.tsx`) changes them;
 * `ui/input.ts` reads the bindings for every key the game takes, and `<Kbd>` shows them in hints.
 */
import { useSyncExternalStore } from "react";

/** What a bound key does: the four directions, Yes (choose, go on) and No (back, cancel). */
export type Binding = "up" | "left" | "down" | "right" | "yes" | "no";

export const BINDINGS: { id: Binding; label: string }[] = [
  { id: "up", label: "Up" },
  { id: "left", label: "Left" },
  { id: "down", label: "Down" },
  { id: "right", label: "Right" },
  { id: "yes", label: "Yes" },
  { id: "no", label: "No" },
];

export const DEFAULT_KEYS: Record<Binding, string> = { up: "w", left: "a", down: "s", right: "d", yes: "e", no: "q" };

/** The text size, as a multiple of the normal one (the slider's range and step). */
export const TEXT_SCALE = { min: 0.8, max: 1.6, step: 0.1 } as const;

export interface Settings {
  /** Each binding's key, as `KeyboardEvent.key` lower-cased (" " is Space). */
  keys: Record<Binding, string>;
  textScale: number;
}

const STORE = "settings";

function load(): Settings {
  const fresh: Settings = { keys: { ...DEFAULT_KEYS }, textScale: 1 };
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return fresh;
    const saved = JSON.parse(raw) as Partial<Settings>;
    const keys = { ...DEFAULT_KEYS };
    for (const b of BINDINGS) { const k = saved.keys?.[b.id]; if (typeof k === "string" && k) keys[b.id] = k; }
    const t = Number(saved.textScale);
    return { keys, textScale: Number.isFinite(t) ? clampScale(t) : 1 };
  } catch {
    return fresh; // (Storage blocked or the save broken: the defaults.)
  }
}

const clampScale = (t: number) => Math.min(TEXT_SCALE.max, Math.max(TEXT_SCALE.min, Math.round(t * 10) / 10));

let settings = load();
const listeners = new Set<() => void>();

function commit(next: Settings) {
  settings = next;
  try { localStorage.setItem(STORE, JSON.stringify(next)); } catch { /* Storage blocked: they last this visit only. */ }
  applyTextScale();
  for (const l of listeners) l();
}

/** The text scales with the root font size: the game's text is sized in rem. */
function applyTextScale() {
  if (typeof document !== "undefined") document.documentElement.style.fontSize = settings.textScale === 1 ? "" : `${settings.textScale * 100}%`;
}
applyTextScale();

export const getSettings = () => settings;

export function setTextScale(t: number) {
  const textScale = clampScale(t);
  if (textScale !== settings.textScale) commit({ ...settings, textScale });
}

/** Binds `key` to `binding`. A key already bound to something else swaps over to this binding's old key, so no key does two things. */
export function bindKey(binding: Binding, key: string) {
  const keys = { ...settings.keys };
  const other = BINDINGS.find(b => b.id !== binding && keys[b.id] === key);
  if (other) keys[other.id] = keys[binding];
  keys[binding] = key;
  commit({ ...settings, keys });
}

export function resetKeys() {
  commit({ ...settings, keys: { ...DEFAULT_KEYS } });
}

function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

/** The settings, re-rendering the component when they change. */
export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings);
}

/** How a key is written on screen: "E", "Space", "↑", "Enter"... */
export function keyLabel(key: string): string {
  switch (key) {
    case " ": return "Space";
    case "arrowup": return "↑";
    case "arrowdown": return "↓";
    case "arrowleft": return "←";
    case "arrowright": return "→";
  }
  if (key.length === 1) return key.toUpperCase();
  return key[0].toUpperCase() + key.slice(1);
}

/* ---------- the Settings panel's visibility (one panel, over whatever screen opened it) ---------- */

let shown = false;
const shownListeners = new Set<() => void>();
const setShown = (v: boolean) => { shown = v; for (const l of shownListeners) l(); };

export const openSettings = () => setShown(true);
export const closeSettings = () => setShown(false);
export function useSettingsShown(): boolean {
  return useSyncExternalStore(l => { shownListeners.add(l); return () => { shownListeners.delete(l); }; }, () => shown);
}
