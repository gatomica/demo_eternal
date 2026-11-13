/**
 * FlameStrings.tsx — the red strings round a lit waxed's blazing flame, as it gathers it to burst (Cradle Flame, Flame Immolation's
 * wind-up): kin of the String you lost (`lostString.ts`), but red, several at once and never resting. Each one slips out of the flame,
 * loops out round it and goes back in, and the next comes out somewhere else.
 */
import { useEffect, useRef, useState } from "react";
import { canvasLoop } from "./canvasLoop";
import { strokeSmooth } from "./smoothTrail";

/** How many strings are out at once, and how long each takes to loop out of the flame and back in (ms). */
const STRINGS = 4, LOOP = 2400;
/** How much of its loop a string shows at once (the rest is still in the flame, or back in it). */
const TAIL = 0.45;

/** A repeatable random number in [0, 1) for a string's loop. */
const rand = (seed: number, i: number) => {
  const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Draws the strings looping out of a flame at (`x`, `y`), reaching up to `reach` from it, at time `t`. Each loop leaves the flame heading
 * one way and comes back from a little further round, so it is a petal; they mostly go up and out to the sides, as the flame rises.
 */
export function drawFlameStrings(g: CanvasRenderingContext2D, x: number, y: number, reach: number, width: number, t: number, seed: number) {
  g.save();
  g.lineCap = "round";
  g.lineJoin = "round";
  g.shadowColor = "rgba(255, 40, 30, 0.85)";
  g.shadowBlur = 6;
  for (let k = 0; k < STRINGS; k++) {
    // (Each string on its own clock, a quarter of a loop after the last, and a new way out every loop.)
    const clock = t / LOOP + k / STRINGS + seed;
    const loop = Math.floor(clock), u = clock - loop;
    const r1 = rand(seed * 7 + k, loop), r2 = rand(seed * 7 + k + 0.5, loop);
    // The way it heads out: above the flame, anywhere from one side to the other (straight up is -π/2 on the screen).
    const heading = -Math.PI / 2 + (r1 - 0.5) * 2.6;
    const turn = (r2 < 0.5 ? -1 : 1) * (0.9 + r2 * 0.8);
    const far = reach * (0.6 + 0.4 * r2);
    // A point along the loop, s from 0 (leaving the flame) to 1 (back in it).
    const at = (s: number) => {
      const a = heading + (s - 0.5) * turn, out = far * Math.pow(Math.sin(Math.PI * s), 0.85);
      return { x: x + Math.cos(a) * out, y: y + Math.sin(a) * out * 0.9 };
    };
    // The head goes round the whole loop and on, so the tail follows it back into the flame.
    const head = u * (1 + TAIL), tail = head - TAIL;
    const from = Math.max(0, tail), to = Math.min(1, head);
    if (to - from < 0.01) continue;
    const N = 24;
    const pts = Array.from({ length: N + 1 }, (_, i) => at(from + ((to - from) * i) / N));
    // Fades in as it slips out and out as it goes back in.
    const alpha = Math.min(1, u / 0.12, (1 - u) / 0.12);
    strokeSmooth(g, pts, q => ({ color: `rgba(232, 44, 36, ${(0.15 + 0.8 * q) * alpha})`, width: width * (0.35 + 0.85 * q) }));
  }
  g.restore();
}

/**
 * The strings, on a canvas centred on the flame (`cx`, `cy`: screen pixels in the scene), `size` across: they reach a little under half of it.
 */
export function FlameStrings({ cx, cy, size, zIndex }: { cx: number; cy: number; size: number; zIndex?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  // (Each flame on a clock of its own, so two of them don't loop together.)
  const [seed] = useState(() => Math.random());
  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    return canvasLoop(cv, (g, w, _h, now) => drawFlameStrings(g, w / 2, _h / 2, w * 0.42, Math.max(1.2, w * 0.012), now, seed));
  }, [seed]);
  return <canvas ref={canvas} className="flame-strings" style={{ left: cx - size / 2, top: cy - size / 2, width: size, height: size, zIndex }} aria-hidden="true" />;
}
