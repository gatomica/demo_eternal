/**
 * MainMenu.tsx — the main menu.
 */
import { useEffect, useState } from "react";
import { isMuted, play, prepare, setMuted } from "../audio/sfx";
import { useKeys, wrapIndex } from "../ui/input";
import { hasSave } from "../explore/save";
import { MenuButtons } from "../ui/Menu";

export type Screen = "menu" | "test" | "explore" | "explore-new" | "explore-skip" | "viewer" | "map";

/** Exploration offers to carry on if you left progress behind. */
const menuOptions = (): { label: string; screen: Screen }[] => [
  { label: "Test combat", screen: "test" },
  ...(hasSave()
    ? [{ label: "Continue exploration", screen: "explore" as const }, { label: "New exploration", screen: "explore-new" as const }]
    : [{ label: "Exploration", screen: "explore" as const }]),
  { label: "Exploration (skip tutorial)", screen: "explore-skip" },
  { label: "Model viewer", screen: "viewer" },
  { label: "Map viewer", screen: "map" },
];

export function MainMenu({ onStart }: { onStart: (screen: Screen) => void }) {
  const [focus, setFocus] = useState(0);
  const [MENU_OPTIONS] = useState(menuOptions);
  const [muted, setMute] = useState(isMuted);
  // Load the sounds while you're choosing, so the first blow of a fight doesn't wait for them.
  useEffect(() => { prepare(); }, []);
  useKeys(key => {
    if (key === "up" || key === "down") setFocus(i => wrapIndex(i, key === "up" ? -1 : 1, MENU_OPTIONS.length));
    if (key === "select") onStart(MENU_OPTIONS[focus].screen);
  });
  return (
    <main className="menu">
      <h1 className="menu-title">Demo</h1>
      <nav className="menu-options" aria-label="Main menu">
        <MenuButtons options={MENU_OPTIONS.map(o => ({ label: o.label, run: () => onStart(o.screen) }))} focus={focus} onFocus={setFocus} />
      </nav>
      {/* Sounds start after a click or key press, so this is also where you can check them. */}
      <button className="hud-button" onClick={() => { setMuted(!muted); setMute(!muted); if (muted) play("clang"); }}>
        Sound: {muted ? "off" : "on"}
      </button>
    </main>
  );
}
