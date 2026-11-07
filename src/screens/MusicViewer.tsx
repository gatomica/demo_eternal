/**
 * MusicViewer.tsx — a developer tool (see `ui/dev.ts`): pick the area or fight whose music to hear. Picking one asks for its track exactly
 * as the game does (the same fade, and for the Warden's second phase his scene's timing), so the transitions can be listened to and tuned.
 * "Last 15 seconds" jumps what is playing to fifteen seconds before the end of its loop, to hear how it comes round.
 * W/S choose, E picks, Q goes back.
 */
import { useEffect, useState } from "react";
import { musicStatus, PHASE_TWO, playMusic, seekToLoopEnd, type Track } from "../audio/music";
import { menuSound, useKeys, wrapIndex } from "../ui/input";
import { MenuButtons, type MenuOption, VolumeBars } from "../ui/Menu";

/** The places that have music, each asking for it as the game does there. */
const PLACES: { label: string; track: Track | null; play: () => void }[] = [
  { label: "Main menu, class select and tutorial", track: "church", play: () => playMusic("church") },
  { label: "Map: the labyrinth (below level 6)", track: "temple", play: () => playMusic("temple") },
  { label: "Map: the dungeon (level 6 and up)", track: "quella", play: () => playMusic("quella") },
  { label: "Fight: ordinary", track: "dungeon", play: () => playMusic("dungeon") },
  { label: "Fight: the Penitent Warden, phase one", track: "wardenOne", play: () => playMusic("wardenOne") },
  { label: "Fight: the Penitent Warden, phase two", track: "wardenTwo", play: () => playMusic("wardenTwo", PHASE_TWO.fade, PHASE_TWO) },
  { label: "Silence", track: null, play: () => playMusic(null) },
];

const clock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

export function MusicViewer({ onExit }: { onExit: () => void }) {
  const [focus, setFocus] = useState(0);
  // What is playing, and where in its loop (it moves, so look again a few times a second).
  const [status, setStatus] = useState(musicStatus);
  useEffect(() => {
    const id = window.setInterval(() => setStatus(musicStatus()), 100);
    return () => window.clearInterval(id);
  }, []);

  const options: MenuOption[] = [
    ...PLACES.map(p => ({ label: p.label, run: p.play })),
    { label: "Last 15 seconds", run: () => seekToLoopEnd(15), quiet: true },
    { label: "Back", run: onExit, quiet: true },
  ];
  useKeys(key => {
    menuSound(key);
    if (key === "up" || key === "down") setFocus(i => wrapIndex(i, key === "up" ? -1 : 1, options.length));
    else if (key === "select") options[focus].run();
    else if (key === "back" || key === "pause") onExit();
  });

  return (
    <main className="music-viewer">
      <h2>Music viewer</h2>
      <nav className="music-options" aria-label="Music">
        <MenuButtons options={options} focus={focus} onFocus={setFocus} />
      </nav>
      <p className="music-status" role="status">
        {status
          ? <>Playing <b>{status.track}</b> · {clock(status.position)} / {clock(status.loopEnd)} (loops back to {clock(status.loopStart)})</>
          : "Silence"}
      </p>
      <div className="menu-volume"><VolumeBars /></div>
    </main>
  );
}
