/**
 * Kbd.tsx — a key in a hint, written as the player has bound it (`ui/settings.ts`), so the hints
 * follow the Settings' key bindings.
 */
import { type Binding, keyLabel, useSettings, getSettings } from "./settings";

/** The key bound to `k`, in a key cap. */
export function Kbd({ k }: { k: Binding }) {
  const { keys } = useSettings();
  return <kbd>{keyLabel(keys[k])}</kbd>;
}

/** The four movement keys written together: "WASD", or "W/A/S/D" when one of them is longer than a letter. */
export function moveKeys(): string {
  const { keys } = getSettings();
  const labels = [keys.up, keys.left, keys.down, keys.right].map(keyLabel);
  return labels.every(l => l.length === 1) ? labels.join("") : labels.join("/");
}

/**
 * A text with its keys written as bound: `{yes}`, `{no}`, `{up}`, `{left}`, `{down}`, `{right}`
 * become those keys, and `{move}` the four movement keys ("Press {yes} to attack" → "Press E to attack").
 */
export function keyText(text: string): string {
  const { keys } = getSettings();
  return text.replace(/\{(yes|no|up|left|down|right|move)\}/g, (_, b: Binding | "move") => (b === "move" ? moveKeys() : keyLabel(keys[b])));
}

/** `keyText` that re-renders when the bindings change. */
export function useKeyText(text: string): string {
  useSettings();
  return keyText(text);
}
