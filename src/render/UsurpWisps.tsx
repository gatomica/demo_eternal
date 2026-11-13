/**
 * UsurpWisps.tsx — Usurp Flame's effect: a flame taken from its target bursts into red wisps that spiral out of it and in to the Warden's wax hand, where they are gone.
 * They explode out of the flame at once (each winding wide of the line between the two), then wind in toward the hand, narrowing as they go. They are the same red wisps
 * (`FlameStrings.tsx`) that swirl round a lit waxed as it gathers its flame, and round her wax arm as she gathers a Flame Blast: thin red strings that glow, brightest at the head.
 */
import { useEffect, useRef } from "react";
import { canvasLoop } from "./canvasLoop";
import type { Pt } from "./geom";
import { strokeSmooth } from "./smoothTrail";

/** How many wisps there are. */
const WISPS = 12;

/** A repeatable random number in [0, 1) for wisp `i`. */
const rand = (i: number, k: number) => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** Each wisp: when it leaves the flame (a share of the whole), how wide it winds, where its winding starts, which way and how many times it goes round, and how long its tail is. */
const WISP = Array.from({ length: WISPS }, (_, i) => ({
  delay: rand(i, 1) * 0.22,
  wide: 0.55 + rand(i, 2) * 0.6,
  start: rand(i, 3) * Math.PI * 2,
  turns: (i % 2 ? 1 : -1) * (1.1 + rand(i, 4) * 0.9),
  tail: 0.2 + rand(i, 5) * 0.14,
}));

/** A stream of wisps: from `from` to `to` (screen pixels in the scene), starting `at` ms after the canvas is drawn. */
export interface WispRoute { from: Pt; to: Pt; at?: number }

/**
 * Wisps along these routes, each taking `ms` from leaving its flame to reaching its hand (`count` of them on a route). A canvas over the whole scene.
 */
export function WispStreams({ routes, ms, count = WISPS }: { routes: WispRoute[]; ms: number; count?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const start = performance.now();
    return canvasLoop(cv, (g, _w, _h, now) => {
      g.save();
      g.lineCap = "round";
      g.lineJoin = "round";
      g.shadowColor = "rgba(255, 40, 30, 0.85)";
      g.shadowBlur = 6;
      for (const { from, to, at: begin = 0 } of routes) {
        const p = (Math.max(0, now - start) - begin) / ms;
        if (p <= 0 || p >= 1.3) continue;
        const dx = to[0] - from[0], dy = to[1] - from[1], len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
        // (how far wide of the line the widest wisp goes: a share of the distance, but never too little to see when they are close)
        const reach = Math.max(len * 0.3, 34), width = Math.max(1.6, len * 0.014);
        for (const w of WISP.slice(0, count)) {
          const t = Math.min(1, Math.max(0, (p - w.delay) / (1 - w.delay)));
          if (t <= 0 || t >= 1) continue;
          const tailAt = Math.max(0, t - w.tail), N = 24;
          const pts = Array.from({ length: N + 1 }, (_, k) => {
            const s = tailAt + ((t - tailAt) * k) / N, along = 1 - (1 - s) ** 1.6, env = reach * w.wide * Math.sin(Math.PI * s) ** 0.6, a = w.start + w.turns * Math.PI * 2 * s;
            const across = env * Math.cos(a), lift = env * 0.45 * Math.sin(a), ahead = env * 0.3 * Math.sin(a);
            return { x: from[0] + dx * along + nx * across + ux * ahead, y: from[1] + dy * along + ny * across + uy * ahead - lift };
          });
          // (as a flame's strings: fading in as it leaves and out as it goes in; thin and faint at its tail, brightest and thickest at its head)
          const alpha = Math.min(1, t / 0.12, (1 - t) / 0.12);
          strokeSmooth(g, pts, q => ({ color: `rgba(232, 44, 36, ${(0.15 + 0.8 * q) * alpha})`, width: width * (0.35 + 0.85 * q) }));
        }
      }
      g.restore();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <canvas ref={canvas} className="usurp-wisps" aria-hidden="true" />;
}

/**
 * `from` (screen pixels in the scene) to `to`: the flame taken, and the hand taking it. `ms`: how long the wisps take from leaving the flame to reaching the hand.
 * A canvas over the whole scene.
 */
export function UsurpWisps({ from, to, ms }: { from: Pt; to: Pt; ms: number }) {
  return <WispStreams routes={[{ from, to }]} ms={ms} />;
}
