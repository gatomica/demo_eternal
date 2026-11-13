/**
 * ActionWheel.tsx — the action wheel, which is also the mark over the selected target: one
 * see-through white ring. While you plan it is small and sits at the center of the selected figure;
 * focusing grows it into the wheel (always the same size, big enough to hold the target inside), and
 * cancelling shrinks it back into the mark. Four white lines cut it into four pieces, one per
 * direction (W above, A to the left, S below, D to the right); the piece being selected turns solid
 * white. The ring has no outline, and its fill fades out away from its center.
 *
 * An action with alternatives (Attack) shows two shorter lines that cut its piece in three while it is
 * the one selected. Pressing its direction again opens it up: its three parts take three quarters of the ring
 * (270°), and the other actions squeeze into the one quarter opposite, names hidden, only their lines left.
 * Every line slides along the ring into place (`useOpening`), and the two short ones grow to full length.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { pointedLine, polar, R_IN, R_OUT, RingFade, RingLines } from "../render/ring";
import type { SubSlot, Wheel, WheelOption } from "./selection";
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

/** How long the lines take to slide when an action opens up or closes (as long as the ring takes to grow). */
const OPEN_MS = 220;

/** The middle of each piece's direction, in degrees on screen (up is -90, since the screen's y runs down). */
const CENTER: Record<Dir, number> = { up: -90, right: 0, down: 90, left: 180 };

const DIRS: Dir[] = ["up", "right", "down", "left"];

/** The slots of an opened-up action, in the order they lie round the ring (clockwise). */
const SLOTS: SubSlot[] = ["left", "middle", "right"];

/** One piece of the ring: the sector between two angles, between the two radii. */
function piece(a0: number, a1: number): string {
  const big = a1 - a0 > 180 ? 1 : 0;
  const [ox0, oy0] = polar(R_OUT, a0), [ox1, oy1] = polar(R_OUT, a1), [ix1, iy1] = polar(R_IN, a1), [ix0, iy0] = polar(R_IN, a0);
  return `M${ox0} ${oy0} A${R_OUT} ${R_OUT} 0 ${big} 1 ${ox1} ${oy1} L${ix1} ${iy1} A${R_IN} ${R_IN} 0 ${big} 0 ${ix0} ${iy0} Z`;
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Where each direction's piece lies on the ring, in degrees, as an action (`open`, or none) is opened by `k` (0 closed, 1 fully open). */
function spansAt(open: Dir | null, k: number): Record<Dir, [number, number]> {
  const out = {} as Record<Dir, [number, number]>;
  const c = open ? CENTER[open] : 0;
  DIRS.forEach(dir => {
    if (!open) { out[dir] = [CENTER[dir] - 45, CENTER[dir] + 45]; return; }
    // How many quarters clockwise from the opened action this piece is: 0 is the action itself.
    const d = (DIRS.indexOf(dir) - DIRS.indexOf(open) + 4) % 4;
    const closed: [number, number] = [c + 90 * d - 45, c + 90 * d + 45];
    // Opened, the action has 270° and the others a third of the opposite quarter each (30°).
    const opened: [number, number] = d === 0 ? [c - 135, c + 135] : [c + 135 + 30 * (d - 1), c + 165 + 30 * (d - 1)];
    out[dir] = [lerp(closed[0], opened[0], k), lerp(closed[1], opened[1], k)];
  });
  return out;
}

/**
 * How far an action has opened up (0 to 1), sliding there when it opens or closes. `dir` stays the last opened
 * action's while it closes again. Without motion (reduced motion) it jumps.
 */
function useOpening(opened: Dir | null): { dir: Dir | null; k: number } {
  const [state, setState] = useState<{ dir: Dir | null; k: number }>({ dir: opened, k: opened ? 1 : 0 });
  const goal = opened ? 1 : 0;
  const now = useRef(state);
  now.current = state;
  useEffect(() => {
    const dir = opened ?? now.current.dir;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setState({ dir, k: goal }); return; }
    const from = now.current.k, t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const u = Math.min(1, (t - t0) / OPEN_MS), eased = 1 - (1 - u) * (1 - u);
      setState({ dir, k: lerp(from, goal, eased) });
      if (u < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [opened, goal]);
  return state;
}

/**
 * The options as the pieces of a ring around whoever you selected. WASD highlights, E commits, Q
 * closes. With a mouse, clicking a piece commits it straight away.
 */
export function ActionWheel({ wheel, open, highlight, opened, sub, center, anchor, onHighlight, onCommit }: {
  wheel: Wheel;
  /** Focused: the ring has grown into the wheel. Otherwise it is the small mark over the target. */
  open: boolean;
  highlight: Dir | null;
  /** The action opened up into its alternatives (its direction), if any, and which part of it is highlighted. */
  opened?: Dir | null;
  sub?: SubSlot;
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
  const opening = useOpening(opened ?? null);
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

  // Where the pieces and the lines lie now. The action being opened (or just closed) is `od`; with none, the plain four quarters.
  const od = opening.dir, k = od ? opening.k : 0;
  const spans = spansAt(od, k);
  // The lines between pieces: the end of each piece, clockwise from the opened action (or from up).
  const order = od ? DIRS.map((_, i) => DIRS[(DIRS.indexOf(od) + i) % 4]) : DIRS;
  const lineAngles = order.map(dir => spans[dir][1]);
  // The two short lines that cut the action selected (if it has alternatives) in three; they lengthen as it opens.
  const alt = (d: Dir | null) => (d ? wheel[d]?.alternatives : undefined);
  const subOwner: Dir | null = od && k > 0 ? od : open && highlight && alt(highlight) ? highlight : null;
  const showShort = open && !!subOwner && (!!opened || (!!highlight && !!alt(highlight)));
  const subLines: { deg: number; from: number; to: number }[] = [];
  if (subOwner) {
    const kk = subOwner === od ? k : 0, c = CENTER[subOwner], inset = (R_OUT - R_IN) * 0.22 * (1 - kk);
    for (const s of [-1, 1]) subLines.push({ deg: c + s * lerp(15, 45, kk), from: R_IN + inset, to: R_OUT - inset });
  }

  return (
    <div ref={ref} className={`wheel-overlay ${open ? "is-open" : ""}`} style={{ width: size, height: size }} role={open ? "menu" : undefined} aria-label={`Actions for ${center}`}>
      <svg className="wheel-ring" viewBox={`${-R_OUT - 2} ${-R_OUT - 2} ${2 * R_OUT + 4} ${2 * R_OUT + 4}`}>
        {/* The ring fades to nothing quickly; the piece you are on fades more slowly, and starts solid. */}
        <RingFade id="wheel-fade" stops={[[0, 0.6], [0.4, 0.2], [0.85, 0], [1, 0]]} />
        <RingFade id="wheel-fade-lit" stops={[[0, 1], [0.6, 0.8], [1, 0]]} />
        {DIRS.map(dir => {
          const o = wheel[dir];
          const [a0, a1] = spans[dir];
          const lit = open && highlight === dir && !!o;
          // The other actions' names fade as the quarter closes on them (and are gone before it is narrow).
          const squeezed = !!od && dir !== od && k > 0;
          const labelAt = polar((R_IN + R_OUT) / 2, (a0 + a1) / 2);
          // The opened action is drawn as its three parts (while it is open, or sliding shut).
          if (dir === od && k > 0 && o?.alternatives) {
            const c = CENTER[dir], cut = lerp(15, 45, k);
            const edges = [a0, c - cut, c + cut, a1];
            return (
              <g key={dir} role="group" aria-label={o.label}>
                {SLOTS.map((slot, i) => {
                  const so = o.alternatives![slot];
                  const subLit = open && highlight === dir && !!so && (!opened || sub === slot);
                  const [tx, ty] = polar((R_IN + R_OUT) / 2, (edges[i] + edges[i + 1]) / 2);
                  return (
                    <g
                      key={slot}
                      role="menuitem"
                      aria-disabled={!so}
                      className={`wheel-piece ${subLit ? "is-highlighted" : ""} ${so ? "" : "is-disabled"}`}
                      onMouseEnter={() => open && so && onHighlight(dir)}
                      onClick={() => open && so && onCommit(so)}
                    >
                      <path d={piece(edges[i], edges[i + 1])} className="wheel-piece-shape" />
                      {so && <text x={tx} y={ty} className="wheel-piece-label" style={{ opacity: Math.max(0, 2 * k - 1) }}>{so.label}</text>}
                    </g>
                  );
                })}
              </g>
            );
          }
          return (
            <g
              key={dir}
              role="menuitem"
              aria-disabled={!o}
              className={`wheel-piece ${lit ? "is-highlighted" : ""} ${o ? "" : "is-disabled"}`}
              onMouseEnter={() => open && o && !squeezed && onHighlight(dir)}
              onClick={() => open && o && !squeezed && onCommit(o)}
            >
              <path d={piece(a0, a1)} className="wheel-piece-shape" />
              {o && <text x={labelAt[0]} y={labelAt[1]} className="wheel-piece-label" style={squeezed ? { opacity: Math.max(0, 1 - 2 * k) } : undefined}>{o.label}</text>}
            </g>
          );
        })}
        {/* The four white lines that split it: pointed at both ends; they slide along the ring when an action opens up. */}
        <RingLines angles={lineAngles} />
        {/* The two short lines that cut the selected action's piece in three, when it has alternatives. */}
        {subLines.map((l, i) => (
          <path key={i} d={pointedLine(l.deg, 1.1, l.from, l.to)} className="wheel-line wheel-line-sub" style={{ opacity: showShort ? 1 : 0 }} />
        ))}
      </svg>
    </div>
  );
}
