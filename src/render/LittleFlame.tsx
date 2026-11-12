/**
 * LittleFlame.tsx — the little flames of the game: a candle, the flame cupped in a waxed's hands, a flame floating in the dark. A gentle,
 * see-through flame, soft at the edges so you see through it, with a swirling knot as its heart. Every little flame shares this look; the big,
 * ordinary flames (the Warden's, a fireball's) are drawn their own way and don't use it.
 */
import { useId } from "react";

/** A trefoil knot, as a closed path of points around (0, 0), about 2.2 across each way. */
const KNOT = (() => {
  const pts = Array.from({ length: 49 }, (_, i) => {
    const t = (i / 48) * Math.PI * 2;
    return [(Math.sin(t) + 2 * Math.sin(2 * t)) * 0.72, (Math.cos(t) - 2 * Math.cos(2 * t)) * 0.72] as const;
  });
  return `M${pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(" L")} Z`;
})();

/** The little flame's colours: its heart, body and edge, its rim and its knot. `red`: the Penitent Warden's in his second form, the knot's red. */
const GOLD = { heart: "#fff1c2", body: "#f2a65a", edge: "#e0782f", rim: "#ffe6a8", knot: "#e0782f" };
const RED = { heart: "#ffd9c8", body: "#e5523a", edge: "#b3281f", rim: "#ffb19c", knot: "#b3281f" };

/**
 * A little flame standing on (`x`, `y`) in a figure's own units (or any SVG's), `height` tall (its width is about two thirds of that).
 * Gentle: it sways slowly, and the knot at its middle slowly turns.
 */
export function LittleFlame({ x, y, height, red, knot = true }: { x: number; y: number; height: number; red?: boolean; knot?: boolean }) {
  const c = red ? RED : GOLD;
  const id = useId();
  const k = height / 10; // (it is drawn 10 tall, tip at -10 and base at 0)
  return (
    <g className="little-flame" transform={`translate(${x} ${y}) scale(${k})`}>
      <defs>
        {/* See-through: bright and half clear at the heart, fading to nothing at the edge. */}
        <radialGradient id={`${id}-body`} cx="50%" cy="62%" r="62%">
          <stop offset="0%" stopColor={c.heart} stopOpacity="0.8" />
          <stop offset="55%" stopColor={c.body} stopOpacity="0.5" />
          <stop offset="100%" stopColor={c.edge} stopOpacity="0.06" />
        </radialGradient>
      </defs>
      <g className="little-flame-sway">
        <path d="M0 -10 C3.9 -5.6 3.7 0 0 0 C-3.7 0 -3.9 -5.6 0 -10 Z" fill={`url(#${id}-body)`} stroke={c.rim} strokeOpacity="0.35" strokeWidth="0.3" />
        {/* At the middle of the round part of the flame (the widest part of the drop, a little above its base). */}
        {knot && (
          <g transform="translate(0 -3.4)">
            <path className="little-flame-knot" d={KNOT} fill="none" stroke={c.knot} strokeOpacity="0.95" strokeWidth="0.45" strokeLinejoin="round" />
          </g>
        )}
      </g>
    </g>
  );
}

/** The little flame's knot alone, with no flame round it, its middle on (`x`, `y`), as big as it is in a flame `height` tall, slowly turning. `red`: the
 *  Warden's second form's (the knot kept in his wax hand). */
export function LittleKnot({ x, y, height, red }: { x: number; y: number; height: number; red?: boolean }) {
  const c = red ? RED : GOLD;
  return (
    <g className="little-knot" transform={`translate(${x} ${y}) scale(${height / 10})`}>
      <path className="little-flame-knot" d={KNOT} fill="none" stroke={c.knot} strokeOpacity="0.95" strokeWidth="0.45" strokeLinejoin="round" />
    </g>
  );
}
