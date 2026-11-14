/**
 * SettingsPanel.tsx — the Settings panel, opened from the main menu and from the pause menus (`openSettings`).
 * It sits over whatever screen opened it, and while it is open it takes every key press first, so the
 * screen under it does nothing. Rows: the text size (a slider), one row per key binding (Yes on it,
 * then press the new key; Escape cancels), Reset keys, Back.
 */
import { useEffect, useRef, useState } from "react";
import { play } from "../audio/sfx";
import { keyOf, menuSound, wrapIndex } from "./input";
import { BINDINGS, TEXT_SCALE, bindKey, closeSettings, keyLabel, resetKeys, setTextScale, useSettings, useSettingsShown, type Binding } from "./settings";
import { Kbd } from "./Kbd";
import { useScrollFocus } from "./scrollFocus";

type Row = { kind: "text" } | { kind: "bind"; id: Binding; label: string } | { kind: "reset" } | { kind: "back" };

const ROWS: Row[] = [
  { kind: "text" },
  ...BINDINGS.map(b => ({ kind: "bind" as const, id: b.id, label: b.label })),
  { kind: "reset" },
  { kind: "back" },
];

/** Keys that can't be bound: Escape (it cancels, and pauses), the modifiers alone, and the function keys (the developer's). */
const unbindable = (k: string) => k === "escape" || k === "tab" || ["shift", "control", "alt", "meta", "capslock", "os", "dead", "unidentified"].includes(k) || /^f\d+$/.test(k);

/** The panel, shown while `openSettings()` has it open. Rendered once, by `App`. */
export function SettingsOverlay() {
  const shown = useSettingsShown();
  return shown ? <SettingsPanel /> : null;
}

function SettingsPanel() {
  const settings = useSettings();
  const [focus, setFocus] = useState(0);
  /** The binding waiting for its new key, if any. */
  const [listening, setListening] = useState<Binding | null>(null);
  // (Taller than the screen, it scrolls with the focus.)
  const panelRef = useRef<HTMLDivElement>(null);
  useScrollFocus(panelRef, focus);

  const run = (row: Row) => {
    if (row.kind === "bind") setListening(row.id);
    else if (row.kind === "reset") resetKeys();
    else if (row.kind === "back") closeSettings();
  };

  const handler = useRef<(e: KeyboardEvent) => void>(() => {});
  handler.current = e => {
    // (The screen under the panel must not see the key at all.)
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat && listening) return;
    const k = e.key.toLowerCase();
    if (listening) {
      if (k === "escape") { setListening(null); return; }
      if (unbindable(k)) return;
      bindKey(listening, k);
      play("tac");
      setListening(null);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const key = keyOf(e.key);
    if (!key) return;
    const row = ROWS[focus];
    if (key === "back" || key === "pause") { if (!e.repeat) { menuSound(key); closeSettings(); } return; }
    if (key === "up" || key === "down") { menuSound(key); setFocus(i => wrapIndex(i, key === "up" ? -1 : 1, ROWS.length)); return; }
    if ((key === "left" || key === "right") && row.kind === "text") {
      menuSound(key);
      setTextScale(settings.textScale + (key === "left" ? -TEXT_SCALE.step : TEXT_SCALE.step));
      return;
    }
    if (key === "select" && !e.repeat) { menuSound(key); run(row); }
  };

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => handler.current(e);
    // (Capture, on the window: before any screen's own key handler.)
    window.addEventListener("keydown", onDown, true);
    return () => window.removeEventListener("keydown", onDown, true);
  }, []);

  return (
    <div className="result settings-overlay" role="dialog" aria-label="Settings">
      <div className="settings-panel" ref={panelRef}>
        <h2 className="settings-title">Settings</h2>
        {ROWS.map((row, i) => {
          const cls = `settings-row ${i === focus ? "is-focused" : ""}`;
          if (row.kind === "text") return (
            <div key="text" className={cls} onMouseEnter={() => setFocus(i)}>
              <span className="settings-label">Text size</span>
              <input
                type="range" min={TEXT_SCALE.min * 100} max={TEXT_SCALE.max * 100} step={TEXT_SCALE.step * 100}
                value={Math.round(settings.textScale * 100)} aria-label="Text size"
                onChange={e => setTextScale(Number(e.target.value) / 100)}
              />
              <span className="settings-value">{Math.round(settings.textScale * 100)}%</span>
            </div>
          );
          if (row.kind === "bind") return (
            <button key={row.id} type="button" className={`${cls} settings-bind`} onMouseEnter={() => setFocus(i)} onClick={() => { play("tac"); run(row); }}>
              <span className="settings-label">{row.label}</span>
              <span className="settings-value">{listening === row.id ? <span className="settings-listening">Press a key…</span> : <kbd>{keyLabel(settings.keys[row.id])}</kbd>}</span>
            </button>
          );
          return (
            <button key={row.kind} type="button" className={`${cls} settings-action`} onMouseEnter={() => setFocus(i)} onClick={() => { play("tac"); run(row); }}>
              {row.kind === "reset" ? "Reset keys" : "Back"}
            </button>
          );
        })}
        <div className="settings-keys">
          {listening
            ? <>Press the new key · <kbd>Esc</kbd> cancel</>
            : <><Kbd k="up" /><Kbd k="down" /> choose · <Kbd k="left" /><Kbd k="right" /> size · <Kbd k="yes" /> change · <Kbd k="no" /> back</>}
        </div>
      </div>
    </div>
  );
}
