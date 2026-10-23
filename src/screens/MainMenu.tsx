/**
 * MainMenu.tsx — the main menu.
 */
import { useState } from "react";
import { useKeys, wrapIndex } from "../ui/input";
import { hasSave } from "../explore/save";
import { MenuButtons } from "../ui/Menu";

export type Screen = "menu" | "test" | "explore" | "explore-new" | "explore-skip" | "viewer";

/** Exploration offers to carry on if you left progress behind. */
const menuOptions = (): { label: string; screen: Screen }[] => [
  { label: "Test combat", screen: "test" },
  ...(hasSave()
    ? [{ label: "Continue exploration", screen: "explore" as const }, { label: "New exploration", screen: "explore-new" as const }]
    : [{ label: "Exploration", screen: "explore" as const }]),
  { label: "Exploration (skip tutorial)", screen: "explore-skip" },
  { label: "Model viewer", screen: "viewer" },
];

export function MainMenu({ onStart }: { onStart: (screen: Screen) => void }) {
  const [focus, setFocus] = useState(0);
  const [MENU_OPTIONS] = useState(menuOptions);
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
    </main>
  );
}
