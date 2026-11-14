/**
 * MainMenu.tsx — the main menu.
 */
import { useEffect, useRef, useState } from "react";
import { useScrollFocus } from "../ui/scrollFocus";
import { prepare } from "../audio/sfx";
import { useKeys, wrapIndex, menuSound } from "../ui/input";
import { hasSave } from "../explore/save";
import { useDev } from "../ui/dev";
import { MenuButtons, VolumeBars } from "../ui/Menu";
import { openSettings } from "../ui/settings";
import { Kbd } from "../ui/Kbd";

export type Screen = "menu" | "test" | "explore" | "class" | "explore-new" | "viewer" | "map" | "music";

/** The game: Continue (if you left progress behind) and New Game. The developer tools (see `ui/dev.ts`) add the test screens and the viewers. */
/** Forgets everything the browser keeps for the game (the save, the volumes), then reloads so nothing stale stays in memory. */
function clearCache() {
  try { localStorage.clear(); } catch { /* Storage blocked: nothing to clear. */ }
  location.reload();
}

const menuOptions = (saved: boolean, dev: boolean): { label: string; screen?: Screen; quiet?: boolean; run?: () => void; /** A developer tool: shown at the side. */ dev?: boolean }[] => [
  ...(saved ? [{ label: "Continue", screen: "explore" as const }] : []),
  { label: "New Game", screen: "class" },
  { label: "Settings", run: openSettings },
  ...(dev ? [
    { label: "Test combat", screen: "test" as const, dev: true },
    { label: "Model viewer", screen: "viewer" as const, dev: true },
    { label: "Map viewer", screen: "map" as const, dev: true },
    { label: "Music viewer", screen: "music" as const, dev: true },
    { label: "Clear cache", quiet: true, run: clearCache, dev: true },
  ] : []),
];

/** The title screen shows once per visit; coming back from a screen goes straight to the menu. */
let titleSeen = false;

export function MainMenu({ onStart }: { onStart: (screen: Screen) => void }) {
  const [focus, setFocus] = useState(0);
  const [saved] = useState(hasSave);
  const dev = useDev();
  const MENU_OPTIONS = menuOptions(saved, dev);
  // (The game's own options stay in the middle; the developer tools' stand in a column at the side. One focus runs through both.)
  const gameCount = MENU_OPTIONS.filter(o => !o.dev).length;
  const [title, setTitle] = useState(!titleSeen);
  const leaveTitle = () => { titleSeen = true; setTitle(false); };
  // Load the sounds while you're choosing, so the first blow of a fight doesn't wait for them.
  useEffect(() => { prepare(); }, []);
  // (Longer than the room it has, the list scrolls with the focus.)
  const optionsRef = useRef<HTMLElement>(null);
  useScrollFocus(optionsRef, focus);
  const choose = (o: (typeof MENU_OPTIONS)[number]) => { if (o.run) o.run(); else onStart(o.screen!); };
  useKeys(key => {
    menuSound(key);
    if (title) { if (key === "select") leaveTitle(); return; }
    if (key === "up" || key === "down") setFocus(i => wrapIndex(i, key === "up" ? -1 : 1, MENU_OPTIONS.length));
    if (key === "select") choose(MENU_OPTIONS[Math.min(focus, MENU_OPTIONS.length - 1)]);
  });
  // (One layout for both: the title never moves, whatever shows below it.)
  return (
    <main className={`menu ${title ? "menu-title-screen" : ""}`} onClick={title ? leaveTitle : undefined}>
      <h1 className="menu-title">DEMO</h1>
      <div className="menu-below">
        {title ? (
          <p className="menu-prompt">Click or press <Kbd k="yes" /> to start</p>
        ) : (
          <>
            <nav className="menu-options" aria-label="Main menu" ref={optionsRef}>
              <MenuButtons options={MENU_OPTIONS.slice(0, gameCount).map(o => ({ label: o.label, run: () => choose(o) }))} focus={Math.min(focus, MENU_OPTIONS.length - 1)} onFocus={setFocus} />
            </nav>
            <div className="menu-volume"><VolumeBars /></div>
          </>
        )}
      </div>
      {!title && gameCount < MENU_OPTIONS.length && (
        <nav className="menu-dev" aria-label="Tools">
          <MenuButtons
            options={MENU_OPTIONS.slice(gameCount).map(o => ({ label: o.label, quiet: o.quiet, run: () => choose(o) }))}
            focus={Math.min(focus, MENU_OPTIONS.length - 1) - gameCount}
            onFocus={i => setFocus(i + gameCount)}
          />
        </nav>
      )}
    </main>
  );
}
