/**
 * Menu.tsx — a column of menu buttons, one of them focused (the keys move the focus, and so does
 * the mouse), and the pause menu built from them.
 */

import { useState } from "react";
import { musicVolume, setMusicVolume } from "../audio/music";

export interface MenuOption {
  label: string;
  run: () => void;
  /** A small, dim button for the developer's shortcuts (it is there, but not asking to be pressed). */
  quiet?: boolean;
}

export function MenuButtons({ options, focus, onFocus }: { options: MenuOption[]; focus: number; onFocus: (i: number) => void }) {
  return (
    <>
      {options.map((o, i) => (
        <button
          key={o.label}
          className={`menu-button ${i === focus ? "is-focused" : ""} ${o.quiet ? "is-quiet" : ""}`}
          onMouseEnter={() => onFocus(i)}
          onClick={o.run}
        >
          {o.label}
        </button>
      ))}
    </>
  );
}

/** The pause menu, over whatever is paused. */
export function PauseMenu(props: { options: MenuOption[]; focus: number; onFocus: (i: number) => void }) {
  return (
    <div className="result" role="dialog" aria-label="Paused">
      <nav className="pause-menu">
        <MenuButtons {...props} />
        <MusicSlider />
      </nav>
    </div>
  );
}

/** The music's volume, a slider under the pause menu's buttons. */
function MusicSlider() {
  const [value, setValue] = useState(musicVolume);
  return (
    <label className="volume-slider">
      <span>Music</span>
      <input
        type="range" min={0} max={100} value={Math.round(value * 100)} aria-label="Music volume"
        onChange={e => { const v = Number(e.target.value) / 100; setValue(v); setMusicVolume(v); }}
        // (Its own keys are the arrows: the menu's keys must not also act.)
        onKeyDown={e => { if (e.key.startsWith("Arrow")) e.stopPropagation(); }}
      />
    </label>
  );
}
