/**
 * ActionWheel.tsx — the action wheel, opened around whoever you selected.
 */
import type { Wheel, WheelOption } from "./selection";
import type { Dir } from "../ui/input";

/** A figure's box on screen, relative to the HUD, plus the HUD's size for keeping options on-screen. */
export interface Anchor { x: number; y: number; w: number; h: number; hudW: number; hudH: number }

/** Rough size of a wheel option, used to place and clamp the options around an enemy. */
const OPTION_W = 144;

const OPTION_H = 44;

const OPTION_GAP = 8;

/** Where each option goes around an enemy: above the head, beside the body, below the feet. Kept on-screen. */
function optionPositions(a: Anchor): Record<Dir, { left: number; top: number }> {
  const cx = a.x + a.w / 2;
  const mid = a.y + a.h * 0.45;
  const raw: Record<Dir, { left: number; top: number }> = {
    up: { left: cx - OPTION_W / 2, top: a.y + a.h * 0.06 - OPTION_H - OPTION_GAP },
    down: { left: cx - OPTION_W / 2, top: a.y + a.h + OPTION_GAP },
    left: { left: a.x - OPTION_W - OPTION_GAP, top: mid - OPTION_H / 2 },
    right: { left: a.x + a.w + OPTION_GAP, top: mid - OPTION_H / 2 },
  };
  const clamp = (v: number, max: number) => Math.max(8, Math.min(max - 8, v));
  for (const d of Object.keys(raw) as Dir[]) {
    raw[d] = { left: clamp(raw[d].left, a.hudW - OPTION_W), top: clamp(raw[d].top, a.hudH - OPTION_H) };
  }
  return raw;
}

/**
 * The four options, opened around whoever you selected: W above, A to the left, S below, D to the right.
 * Around you, they sit over your own figure's box; around an enemy, just outside its body.
 * WASD highlights, E commits, Q closes. With a mouse, clicking an option commits it straight away.
 */
export function ActionWheel({ wheel, highlight, center, anchor, aroundPlayer, onHighlight, onCommit }: {
  wheel: Wheel;
  highlight: Dir | null;
  center: string;
  anchor: Anchor | null;
  aroundPlayer: boolean;
  onHighlight: (d: Dir) => void;
  onCommit: (o: WheelOption) => void;
}) {
  if (!anchor) return null;
  const positions = aroundPlayer ? null : optionPositions(anchor);
  const box = aroundPlayer ? { left: anchor.x, top: anchor.y, width: anchor.w, height: anchor.h } : { inset: 0 };
  return (
    <div className={`wheel-overlay ${aroundPlayer ? "is-player" : "is-enemy"}`} style={box} role="menu" aria-label={`Actions for ${center}`}>
      {(Object.keys(wheel) as Dir[]).map(dir => {
        const o = wheel[dir];
        return (
          <button
            key={dir}
            role="menuitem"
            className={`wheel-option wheel-${dir} ${highlight === dir ? "is-highlighted" : ""}`}
            style={positions ? { left: positions[dir].left, top: positions[dir].top, width: OPTION_W } : undefined}
            disabled={!o}
            onMouseEnter={() => o && onHighlight(dir)}
            onClick={() => o && onCommit(o)}
          >
            {o && <b>{o.label}</b>}
          </button>
        );
      })}
    </div>
  );
}
