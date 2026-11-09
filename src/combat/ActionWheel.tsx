/**
 * ActionWheel.tsx — the action wheel, which is also the mark over the selected target: one
 * see-through white ring. While you plan it is small and sits at the center of the selected figure;
 * focusing grows it into the wheel (always the same size, big enough to hold the target inside), and
 * cancelling shrinks it back into the mark. Four white lines cut it into four pieces, one per
 * direction (W above, A to the left, S below, D to the right); the piece being selected turns solid
 * white. The ring has no outline, and its fill fades out away from its center.
 */
import { useEffect, useLayoutEffect, useRef } from "react";
import { polar, R_IN, R_OUT, RingFade, RingLines } from "../render/ring";
import type { Wheel, WheelOption } from "./selection";
import type { Dir } from "../ui/input";

/** A figure's box on screen, relative to the HUD, plus the HUD's size for keeping the wheel on-screen. */
export interface Anchor {
  x: number; y: number; w: number; h: number; hudW: number; hudH: number;
  /** Where the figure's middle is on screen (y), by how high or low its pose holds it: the small mark sits there, and slides back to the box's middle when the wheel opens. */
  markY?: number;
}

/** How fast the ring chases its place (per second): faster than the camera turns, so it can get there first. */
const CHASE = 16;

/** How big the ring is on screen (the same for every target): a share of the screen's height, and never wider than this share of its width. */
const SIZE_OF_HEIGHT = 0.92;
const SIZE_OF_WIDTH = 0.6;

/** The ring as the mark over a target: its size on screen, in pixels. */
const MARK_SIZE = 40;

/** The middle of each piece's direction, in degrees on screen (up is -90, since the screen's y runs down). */
const CENTER: Record<Dir, number> = { up: -90, right: 0, down: 90, left: 180 };

/** One piece of the ring: the sector 45° either side of its direction, between the two radii. */
function piece(dir: Dir): string {
  const a0 = CENTER[dir] - 45, a1 = CENTER[dir] + 45;
  const [ox0, oy0] = polar(R_OUT, a0), [ox1, oy1] = polar(R_OUT, a1), [ix1, iy1] = polar(R_IN, a1), [ix0, iy0] = polar(R_IN, a0);
  return `M${ox0} ${oy0} A${R_OUT} ${R_OUT} 0 0 1 ${ox1} ${oy1} L${ix1} ${iy1} A${R_IN} ${R_IN} 0 0 0 ${ix0} ${iy0} Z`;
}

const DIRS: Dir[] = ["up", "right", "down", "left"];

/**
 * The four options as the pieces of a ring around whoever you selected. WASD highlights, E commits, Q
 * closes. With a mouse, clicking a piece commits it straight away.
 */
export function ActionWheel({ wheel, open, highlight, center, anchor, onHighlight, onCommit }: {
  wheel: Wheel;
  /** Focused: the ring has grown into the wheel. Otherwise it is the small mark over the target. */
  open: boolean;
  highlight: Dir | null;
  /** Whose wheel it is, for readers of the screen. */
  center: string;
  anchor: Anchor | null;
  /** (Kept for callers: the ring looks the same around you as around an enemy.) */
  aroundPlayer?: boolean;
  onHighlight: (d: Dir) => void;
  onCommit: (o: WheelOption) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const target = useRef<{ x: number; y: number } | null>(null);
  const shown = useRef<{ x: number; y: number } | null>(null);
  // The wheel's center comes first: the big ring is centered on the target, nudged just enough to keep every option on-screen.
  // The small mark sits on that very same center (at the figure's own height while it is only a mark), so the two grow into and shrink out of each other.
  const big = anchor ? Math.min(anchor.hudH * SIZE_OF_HEIGHT, anchor.hudW * SIZE_OF_WIDTH) : 0;
  // (Only the wheel is kept on-screen by its size: the small mark may sit anywhere, at the figure's own height.)
  const reach = (open ? big : MARK_SIZE) / 2;
  const clamp = (v: number, max: number) => Math.max(reach, Math.min(max - reach, v));
  target.current = anchor && {
    x: clamp(anchor.x + anchor.w / 2, anchor.hudW),
    y: clamp(open ? anchor.y + anchor.h * 0.5 : anchor.markY ?? anchor.y + anchor.h * 0.5, anchor.hudH),
  };
  if (!anchor) shown.current = null;
  const place = () => { const el = ref.current, at = shown.current; if (el && at) { el.style.left = `${at.x}px`; el.style.top = `${at.y}px`; } };
  // It appears on its target, then keeps moving toward wherever the target is, every frame (the camera may still be turning).
  useLayoutEffect(() => { if (target.current && !shown.current) { shown.current = { ...target.current }; place(); } });
  useEffect(() => {
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000), to = target.current;
      last = now;
      if (to && shown.current) {
        const k = 1 - Math.exp(-dt * CHASE);
        shown.current.x += (to.x - shown.current.x) * k;
        shown.current.y += (to.y - shown.current.y) * k;
        place();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  if (!anchor) return null;
  const size = open ? big : MARK_SIZE;
  return (
    <div ref={ref} className={`wheel-overlay ${open ? "is-open" : ""}`} style={{ width: size, height: size }} role={open ? "menu" : undefined} aria-label={`Actions for ${center}`}>
      <svg className="wheel-ring" viewBox={`${-R_OUT - 2} ${-R_OUT - 2} ${2 * R_OUT + 4} ${2 * R_OUT + 4}`}>
        {/* The ring fades to nothing quickly; the piece you are on fades more slowly, and starts solid. */}
        <RingFade id="wheel-fade" stops={[[0, 0.6], [0.4, 0.2], [0.85, 0], [1, 0]]} />
        <RingFade id="wheel-fade-lit" stops={[[0, 1], [0.6, 0.8], [1, 0]]} />
        {DIRS.map(dir => {
          const o = wheel[dir];
          const lit = open && highlight === dir && !!o;
          const [tx, ty] = polar((R_IN + R_OUT) / 2, CENTER[dir]);
          return (
            <g
              key={dir}
              role="menuitem"
              aria-disabled={!o}
              className={`wheel-piece ${lit ? "is-highlighted" : ""} ${o ? "" : "is-disabled"}`}
              onMouseEnter={() => open && o && onHighlight(dir)}
              onClick={() => open && o && onCommit(o)}
            >
              <path d={piece(dir)} className="wheel-piece-shape" />
              {o && <text x={tx} y={ty} className="wheel-piece-label">{o.label}</text>}
            </g>
          );
        })}
        {/* The four white lines that split it: diagonals, so each piece faces one direction; pointed at both ends. */}
        <RingLines />
      </svg>
    </div>
  );
}
