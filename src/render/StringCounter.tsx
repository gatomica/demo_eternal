/**
 * StringCounter.tsx — String, the resource you gain from the enemies you defeat: the counter at the top right (on the
 * health bar's row, with a ball of yarn to its right), the yarn ball itself, and the single string that
 * now and then spins round an enemy holding some of what you lost.
 */
import { useEffect, useRef, useState } from "react";
import { canvasLoop } from "./canvasLoop";
import { drawLostString } from "./lostString";
import { KNOT, KNOT_REACH } from "./LittleFlame";

/** How far past the ball's edge the tips of the knot on it reach (in the ball's 24-unit box). */
const KNOT_OVER = 0.7;

/**
 * A small ball of yarn: white, wound round and round, with the little flame's three-looped knot over it, its tips just past the ball's
 * edge (`eternal`: light blue, like eternal gear; `red`: the revive knot).
 */
export function YarnBall({ className, eternal, red }: { className?: string; eternal?: boolean; red?: boolean }) {
  const id = red ? "yarn-clip-red" : eternal ? "yarn-clip-eternal" : "yarn-clip";
  const [fill, wound, knot] = red ? ["#f7c3bb", "#c2392f", "#8f1d16"] : eternal ? ["#c9e4ff", "#6a9fcf", "#3f78ad"] : ["#ffffff", "#d2d2d8", "#9a9aa6"];
  const k = (8.6 + KNOT_OVER) / KNOT_REACH;
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <defs><clipPath id={id}><circle cx="11" cy="12" r="8.6" /></clipPath></defs>
      <circle cx="11" cy="12" r="8.6" fill={fill} />
      <g clipPath={`url(#${id})`} fill="none" stroke={wound} strokeWidth="0.9" strokeLinecap="round">
        {[-5, -1.5, 2, 5.5].map(k => <ellipse key={`h${k}`} cx="11" cy={12 + k} rx="8.6" ry="4.6" />)}
        {[-4, 4].map(k => <ellipse key={`v${k}`} cx={11 + k} cy="12" rx="4.4" ry="8.6" />)}
      </g>
      <path d={KNOT} transform={`translate(11 12) scale(${k})`} fill="none" stroke={knot} strokeWidth={1.3 / k} strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The knot's symbol: the revive knot as the guide gives it (the red `YarnBall`, its three-looped knot over it), white towards the middle so that
 * the red numeral set over it stands out; the knot's three loops show round it. `empty` (no revive left): the middle is black instead.
 */
export function KnotMark({ empty, className }: { empty?: boolean; className?: string }) {
  const centre = empty ? "#000" : "#fff", core = empty ? "knot-mark-core-empty" : "knot-mark-core", R = 10.6, k = (R + KNOT_OVER) / KNOT_REACH;
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <clipPath id="knot-mark-clip"><circle cx="12" cy="12" r={R} /></clipPath>
        <radialGradient id={core}>
          <stop offset="0" stopColor={centre} stopOpacity="1" />
          <stop offset="0.42" stopColor={centre} stopOpacity="0.95" />
          <stop offset="0.7" stopColor={centre} stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* (the red yarn ball's colours and winding, as YarnBall draws it, at this size) */}
      <circle cx="12" cy="12" r={R} fill="#f7c3bb" />
      <g clipPath="url(#knot-mark-clip)" fill="none" stroke="#c2392f" strokeWidth="1.1" strokeLinecap="round">
        {[-6.2, -1.8, 2.5, 6.8].map(d => <ellipse key={`h${d}`} cx="12" cy={12 + d} rx={R} ry="5.7" />)}
        {[-4.9, 4.9].map(d => <ellipse key={`v${d}`} cx={12 + d} cy="12" rx="5.4" ry={R} />)}
      </g>
      <path d={KNOT} transform={`translate(12 12) scale(${k})`} fill="none" stroke="#8f1d16" strokeWidth={1.5 / k} strokeLinejoin="round" />
      <circle cx="12" cy="12" r={R} fill={`url(#${core})`} />
    </svg>
  );
}

/** A "+X" that pops up under a counter when String lands. */
export interface StringPop { id: number; amount: number }

/**
 * How much String you have, fixed at the top right on the health bar's row, with "+X" pops floating below it as more lands: your String
 * (lost on death) on the right, and to its left the eternal String (light blue: death never takes it).
 */
export function StringCounter({ amount, pops = [], eternal = 0, eternalPops = [], spend }: { amount: number; pops?: StringPop[]; eternal?: number; eternalPops?: StringPop[]; spend?: { normal: number; eternal: number } }) {
  return (
    <div className="string-slot" role="status" aria-label={`${amount} String, ${eternal} eternal String`}>
      <span className="string-group is-eternal">
        <span className="string-count">{eternal}</span>
        <YarnBall className="string-ball" eternal />
        {spend && spend.eternal > 0 && <span className="string-spend">-{spend.eternal}</span>}
        {eternalPops.map(p => <span key={p.id} className="string-pop">+{p.amount}</span>)}
      </span>
      <span className="string-group">
        <span className="string-count">{amount}</span>
        <YarnBall className="string-ball" />
        {spend && spend.normal > 0 && <span className="string-spend">-{spend.normal}</span>}
        {pops.map(p => <span key={p.id} className="string-pop">+{p.amount}</span>)}
      </span>
    </div>
  );
}

/** How many figure-boxes wide and tall a String canvas is (the spin goes round the whole sprite, past its box). */
const CANVAS_W = 4, CANVAS_H = 1.5;

/**
 * The String you lost, on the enemy that holds it: a single string that now and then slips out from behind the figure, very slowly spins once
 * round it and is gone (see `drawLostString`). `layer`: the half behind the figure, or the half in front of it. A canvas over the figure's box.
 */
export function StringAura({ layer, spread = 1 }: { layer: "back" | "front"; /** How many times wider than the figure the spin is (the Wax Blob's whole heap). */ spread?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  // (Each figure is on a clock of its own, so a group of them do not all show it together.)
  const [seed] = useState(() => Math.random());
  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    return canvasLoop(cv, (g, w, h, now) => {
      // (The canvas reaches past the figure's box all round: its box is the middle half of the width and the middle 70% of the height.)
      const fw = w / CANVAS_W, fh = h / CANVAS_H;
      drawLostString(g, w / 2, h / 2, fw * 0.55 * spread, fh * 0.11, fh * 0.62, Math.max(1.2, fw * 0.014), now, layer, seed);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer, seed]);
  return <canvas ref={canvas} className={`string-aura is-${layer}`} style={{ left: `${-((CANVAS_W - 1) / 2) * 100}%`, top: `${-((CANVAS_H - 1) / 2) * 100}%`, width: `${CANVAS_W * 100}%`, height: `${CANVAS_H * 100}%` }} aria-hidden="true" />;
}
