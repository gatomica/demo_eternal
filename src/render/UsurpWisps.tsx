/**
 * UsurpWisps.tsx — Usurp Flame's effect: a flame taken from its target bursts into red wisps that spiral out of it and in to the Warden's wax hand, where they are gone.
 * They explode out of the flame at once (each winding wide of the line between the two), then wind in toward the hand, narrowing as they go. They are the same red wisps
 * (`FlameStrings.tsx`) that swirl round a lit waxed as it gathers its flame, and round her wax arm as she gathers a Flame Blast: thin red strings that glow, brightest at the head.
 */
import { useEffect, useRef } from "react";
import { canvasLoop } from "./canvasLoop";
import type { Pt } from "./geom";
import { strokeSmooth } from "./smoothTrail";

/** How many wisps leave each flame. (Few: each is a run of blurred strokes drawn every frame, and the phase-two scene draws in a score of flames at once.) */
const WISPS = 3;

/** A repeatable random number in [0, 1) for wisp `i`. */
const rand = (i: number, k: number) => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** Each wisp: when it leaves the flame (a share of the whole), how wide it winds, where its winding starts, which way and how many times it goes round, and how long its tail is. */
const WISP = Array.from({ length: WISPS }, (_, i) => ({
  delay: rand(i, 1) * 0.22,
  wide: 0.55 + rand(i, 2) * 0.6,
  // (spread round evenly, give or take, so the few there are never bunch up)
  start: (i / WISPS + rand(i, 3) * 0.2) * Math.PI * 2,
  turns: (i % 2 ? 1 : -1) * (1.1 + rand(i, 4) * 0.9),
  tail: 0.2 + rand(i, 5) * 0.14,
}));

/**
 * A stream of wisps: from `from` to `to` (screen pixels in the scene), starting `at` ms after the canvas is drawn. `peak`: they arch up through the air
 * first, as high as this (a screen y), and come down to `to` from above, as the old 2D Usurp Flame's trail of fire arched over him; without it, they go straight.
 */
export interface WispRoute { from: Pt; to: Pt; at?: number; peak?: number }

/**
 * The line a route's wisps wind round: straight, or arched (a curve whose highest point is `peak`, never below either end). Its point and its direction
 * (a unit vector) at `u`, 0 at `from` to 1 at `to`.
 */
function routeLine(from: Pt, to: Pt, peak?: number) {
  if (peak === undefined) {
    const dx = to[0] - from[0], dy = to[1] - from[1], len = Math.hypot(dx, dy) || 1;
    return { len, at: (u: number) => [from[0] + dx * u, from[1] + dy * u] as Pt, dir: (_u: number) => [dx / len, dy / len] as Pt };
  }
  // (a curve from one end to the other through a point above them: at its middle it is halfway between that point and the ends' middle, so the
  // point is set twice as far up as the peak is)
  const top = Math.min(peak, from[1], to[1]), c: Pt = [(from[0] + to[0]) / 2, 2 * top - (from[1] + to[1]) / 2];
  const at = (u: number): Pt => {
    const v = 1 - u;
    return [v * v * from[0] + 2 * v * u * c[0] + u * u * to[0], v * v * from[1] + 2 * v * u * c[1] + u * u * to[1]];
  };
  const dir = (u: number): Pt => {
    const x = 2 * (1 - u) * (c[0] - from[0]) + 2 * u * (to[0] - c[0]), y = 2 * (1 - u) * (c[1] - from[1]) + 2 * u * (to[1] - c[1]), l = Math.hypot(x, y) || 1;
    return [x / l, y / l];
  };
  // (its length, roughly: the two legs up to the top and down again)
  const len = Math.hypot(c[0] - from[0], top - from[1]) + Math.hypot(to[0] - c[0], to[1] - top);
  return { len, at, dir };
}

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
      for (const { from, to, at: begin = 0, peak } of routes) {
        const p = (Math.max(0, now - start) - begin) / ms;
        if (p <= 0 || p >= 1.3) continue;
        const line = routeLine(from, to, peak), len = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
        // (how far wide of the line the widest wisp goes: a share of the distance, but never too little to see when they are close; narrower round an arch,
        // so the arch reads)
        const reach = Math.max(len * 0.3, 34) * (peak === undefined ? 1 : 0.55), width = Math.max(1.6, len * 0.014);
        for (const w of WISP.slice(0, count)) {
          const t = Math.min(1, Math.max(0, (p - w.delay) / (1 - w.delay)));
          if (t <= 0 || t >= 1) continue;
          const tailAt = Math.max(0, t - w.tail), N = 24;
          const pts = Array.from({ length: N + 1 }, (_, k) => {
            const s = tailAt + ((t - tailAt) * k) / N, along = 1 - (1 - s) ** 1.6, env = reach * w.wide * Math.sin(Math.PI * s) ** 0.6, a = w.start + w.turns * Math.PI * 2 * s;
            const across = env * Math.cos(a), lift = env * 0.45 * Math.sin(a), ahead = env * 0.3 * Math.sin(a);
            const [x, y] = line.at(along), [ux, uy] = line.dir(along), nx = -uy, ny = ux;
            return { x: x + nx * across + ux * ahead, y: y + ny * across + uy * ahead - lift };
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
 * `peak`: they fly up first, as high as this (a screen y: above the Warden's head), then come down to the hand. A canvas over the whole scene.
 */
export function UsurpWisps({ from, to, ms, peak }: { from: Pt; to: Pt; ms: number; peak?: number }) {
  return <WispStreams routes={[{ from, to, peak }]} ms={ms} />;
}

/**
 * The Warden raising a fallen waxed (staggered in his second form): how long the wisps take to fly out of his hand to it (`out`, after each one's
 * own `delay`, at most `lag`), and to wind into its head once it rises (`gather`), in ms.
 */
export const RAISE_WISPS = { out: 750, lag: 200, gather: 650 } as const;

/** From the moment the waxed rises to when its wisps are all in its head: their gathering, and their flight out first if they only left his hand then. */
export const raiseGatherMs = (leavingNow: boolean) => RAISE_WISPS.gather + (leavingNow ? RAISE_WISPS.out + RAISE_WISPS.lag : 0);

/** Each of the raising's wisps: when it leaves his hand, where it starts round the waxed, how fast and which way it circles, how wide, and how it bobs up and down. */
const RAISE = Array.from({ length: WISPS }, (_, i) => ({
  delay: (i / Math.max(1, WISPS - 1)) * RAISE_WISPS.lag * (0.6 + rand(i, 6) * 0.4),
  start: (i / WISPS + rand(i, 7) * 0.15) * Math.PI * 2,
  // (radians a second; some one way round, some the other, at their own pace: aimless)
  speed: (i % 2 ? -1 : 1) * (2.4 + rand(i, 8) * 1.6),
  wide: 0.8 + rand(i, 9) * 0.35,
  bob: 1.3 + rand(i, 10) * 1.2,
  bobAt: rand(i, 11) * Math.PI * 2,
  bend: (i % 2 ? 1 : -1) * (0.5 + rand(i, 12) * 0.5),
}));

/** How long a raising wisp's tail is, in ms of its flight. */
const RAISE_TAIL = 240;

interface RaiseProps {
  /** The Warden's hand, the waxed's head, on the screen (pixels in the scene), and the waxed's height on the screen. */
  hand: Pt; head: Pt; size: number;
  /** How high they fly on their way out of his hand (a screen y, above his head), before coming down to the waxed. */
  peak?: number;
  /** The waxed rises now: the wisps wind into its head. */
  gather: boolean;
}

/**
 * Staggered in his second form, the Warden sends wisps out of his hand to the fallen waxed he is going to raise: they fly to it and circle it
 * aimlessly, round and round its body, until it rises as the turn ends; then they wind in tight and go into its head, relighting its flame.
 * A canvas over the whole scene; it follows the two figures as the camera moves (it reads where they are each frame).
 */
export function RaiseWisps(props: RaiseProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef(props);
  live.current = props;
  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const start = performance.now();
    /** When they began to gather (ms after they left), once the waxed rises. */
    let gatherAt: number | undefined;
    const { out, gather } = RAISE_WISPS;
    return canvasLoop(cv, (g, _w, _h, now) => {
      const { hand, head, size, peak } = live.current;
      const T = now - start;
      if (live.current.gather && gatherAt === undefined) gatherAt = T;
      // The ring they circle in: round the waxed's body, from its head down, flattened as a ring on the floor is seen at a slant.
      const cx = head[0], cy = head[1] + size * 0.22, rx = size * 0.34, ry = size * 0.09, rise = size * 0.28;
      /** Where wisp `i` is `t` ms after they left his hand (null before it has left), and how near the viewer it is (0 behind the waxed, 1 in front). */
      const at = (i: number, t: number): { x: number; y: number; near: number } | null => {
        const w = RAISE[i];
        if (t < w.delay) return null;
        const s = t / 1000;
        let a = w.start + w.speed * s, r = w.wide, ox = cx, oy = cy, up = rise * (0.5 + 0.5 * Math.sin(w.bob * s + w.bobAt));
        // Gathering: the ring shrinks onto its head, the wisp whirling faster as it goes in.
        const g0 = gatherAt === undefined ? undefined : Math.max(gatherAt, w.delay + out);
        if (g0 !== undefined && t > g0) {
          const k = Math.min(1, (t - g0) / gather), e = k * k * (3 - 2 * k);
          a += Math.sign(w.speed) * 3 * k * k;
          r *= 1 - e;
          up *= 1 - e;
          ox += (head[0] - cx) * e;
          oy += (head[1] - cy) * e;
        }
        const ring = { x: ox + rx * r * Math.cos(a), y: oy + ry * r * Math.sin(a) - up, near: 0.5 + 0.5 * Math.sin(a) };
        // Flying out of his hand: up through the air over his head first (`peak`), then down to its place on the ring, each bowed a little to its own side.
        const k = (t - w.delay) / out;
        if (k >= 1) return ring;
        const e = 1 - (1 - k) ** 2, line = routeLine(hand, [ring.x, ring.y], peak), [x, y] = line.at(e), [ux, uy] = line.dir(e);
        const bow = Math.sin(Math.PI * k) * Math.min(line.len * 0.08, size * 0.25) * w.bend;
        return { x: x - uy * bow, y: y + ux * bow, near: 1 - (1 - ring.near) * e };
      };
      g.save();
      g.lineCap = "round";
      g.lineJoin = "round";
      g.shadowColor = "rgba(255, 40, 30, 0.85)";
      g.shadowBlur = 6;
      const width = Math.max(1.6, size * 0.016), N = 16;
      RAISE.forEach((w, i) => {
        const g0 = gatherAt === undefined ? undefined : Math.max(gatherAt, w.delay + out);
        // (gone into the head)
        if (g0 !== undefined && T >= g0 + gather) return;
        const pts: { x: number; y: number }[] = [];
        let near = 1;
        for (let k = 0; k <= N; k++) {
          const p = at(i, T - RAISE_TAIL * (1 - k / N));
          if (!p) continue;
          pts.push(p);
          near = p.near;
        }
        if (pts.length < 2) return;
        // (fading in as it leaves his hand, dimmer as it passes behind the waxed, and out as it goes into the head)
        const life = T - w.delay, last = g0 === undefined ? 1 : Math.min(1, Math.max(0, (g0 + gather - T) / 200));
        const alpha = Math.min(1, life / 120) * (0.55 + 0.45 * near) * last;
        strokeSmooth(g, pts, q => ({ color: `rgba(232, 44, 36, ${(0.15 + 0.8 * q) * alpha})`, width: width * (0.35 + 0.85 * q) }));
      });
      g.restore();
    });
  }, []);
  return <canvas ref={canvas} className="usurp-wisps" aria-hidden="true" />;
}
