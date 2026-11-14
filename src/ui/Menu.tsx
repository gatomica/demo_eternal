/**
 * Menu.tsx — a column of menu buttons, one of them focused (the keys move the focus, and so does
 * the mouse), and the pause menu built from them.
 */

import { type ReactNode, useRef, useState } from "react";
import { useScrollFocus } from "./scrollFocus";
import { isMusicMuted, musicVolume, setMusicMuted, setMusicVolume } from "../audio/music";
import { isMuted, play, setMuted, setSfxVolume, sfxVolume } from "../audio/sfx";

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
          onClick={() => { play("tac"); o.run(); }}
        >
          {o.label}
        </button>
      ))}
    </>
  );
}

/** The pause menu, over whatever is paused. `children` go along the bottom of the screen (a fight's controls reminder). */
export function PauseMenu({ children, ...props }: { options: MenuOption[]; focus: number; onFocus: (i: number) => void; children?: ReactNode }) {
  // (Taller than the screen, it scrolls with the focus.)
  const navRef = useRef<HTMLElement>(null);
  useScrollFocus(navRef, props.focus);
  return (
    <div className="result" role="dialog" aria-label="Paused">
      <nav className="pause-menu" ref={navRef}>
        <MenuButtons {...props} />
        <VolumeBars />
      </nav>
      {children}
    </div>
  );
}

/** A small speaker: with waves when it plays, crossed out when it is muted. */
function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      {muted
        ? <path d="M17 9l5 6M22 9l-5 6" />
        : <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />}
    </svg>
  );
}

/** One volume bar with a speaker on its left that mutes and unmutes it. */
function VolumeBar(props: {
  name: string; /** The short label shown to the right of the bar. */ label: string; volume: () => number; setVolume: (v: number) => void;
  muted: () => boolean; setMuted: (m: boolean) => void; onRelease?: () => void;
}) {
  const [value, setValue] = useState(props.volume);
  const [muted, setMute] = useState(props.muted);
  return (
    <div className="volume-slider">
      <button
        type="button" className="volume-speaker" aria-label={`${muted ? "Unmute" : "Mute"} ${props.name.toLowerCase()}`} aria-pressed={muted}
        onClick={() => { props.setMuted(!muted); setMute(!muted); if (muted) props.onRelease?.(); }}
      >
        <SpeakerIcon muted={muted || value === 0} />
      </button>
      <input
        type="range" min={0} max={100} value={Math.round(value * 100)} aria-label={`${props.name} volume`} className={muted ? "is-muted" : ""}
        onChange={e => { const v = Number(e.target.value) / 100; setValue(v); props.setVolume(v); }}
        onPointerUp={props.onRelease}
        // (Its own keys are the arrows: the menu's keys must not also act.)
        onKeyDown={e => { if (e.key.startsWith("Arrow")) e.stopPropagation(); }}
      />
      <span className="volume-name">{props.label}</span>
    </div>
  );
}

/** The music's and the sound effects' volume bars, under a menu's buttons. */
export function VolumeBars() {
  return (
    <>
      <VolumeBar name="Music" label="Music:" volume={musicVolume} setVolume={setMusicVolume} muted={isMusicMuted} setMuted={setMusicMuted} />
      <VolumeBar name="Sound effects" label="Sound:" volume={sfxVolume} setVolume={setSfxVolume} muted={isMuted} setMuted={setMuted} onRelease={() => play("clang")} />
    </>
  );
}
