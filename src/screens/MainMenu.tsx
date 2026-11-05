/**
 * MainMenu.tsx — the main menu.
 */
import { useEffect, useState } from "react";
import { isMuted, play, prepare, setMuted } from "../audio/sfx";
import { useKeys, wrapIndex } from "../ui/input";
import { hasSave } from "../explore/save";
import { useDev } from "../ui/dev";
import { MenuButtons } from "../ui/Menu";

export type Screen = "menu" | "test" | "explore" | "class" | "explore-new" | "explore-skip" | "viewer" | "map";

/** The game: Continue (if you left progress behind) and New Game. The developer tools (see `ui/dev.ts`) add the test screens and the viewers. */
const menuOptions = (saved: boolean, dev: boolean): { label: string; screen: Screen }[] => [
  ...(saved ? [{ label: "Continue", screen: "explore" as const }] : []),
  { label: "New Game", screen: "class" },
  ...(dev ? [
    { label: "Test combat", screen: "test" as const },
    { label: "Exploration (skip tutorial)", screen: "explore-skip" as const },
    { label: "Model viewer", screen: "viewer" as const },
    { label: "Map viewer", screen: "map" as const },
  ] : []),
];

export function MainMenu({ onStart }: { onStart: (screen: Screen) => void }) {
  const [focus, setFocus] = useState(0);
  const [saved] = useState(hasSave);
  const dev = useDev();
  const MENU_OPTIONS = menuOptions(saved, dev);
  const [muted, setMute] = useState(isMuted);
  // Load the sounds while you're choosing, so the first blow of a fight doesn't wait for them.
  useEffect(() => { prepare(); }, []);
  useKeys(key => {
    if (key === "up" || key === "down") setFocus(i => wrapIndex(i, key === "up" ? -1 : 1, MENU_OPTIONS.length));
    if (key === "select") onStart(MENU_OPTIONS[Math.min(focus, MENU_OPTIONS.length - 1)].screen);
  });
  return (
    <main className="menu">
      <h1 className="menu-title">Demo</h1>
      <nav className="menu-options" aria-label="Main menu">
        <MenuButtons options={MENU_OPTIONS.map(o => ({ label: o.label, run: () => onStart(o.screen) }))} focus={Math.min(focus, MENU_OPTIONS.length - 1)} onFocus={setFocus} />
      </nav>
      {/* Sounds start after a click or key press, so this is also where you can check them. */}
      <button className="hud-button" onClick={() => { setMuted(!muted); setMute(!muted); if (muted) play("clang"); }}>
        Sound: {muted ? "off" : "on"}
      </button>
    </main>
  );
}
