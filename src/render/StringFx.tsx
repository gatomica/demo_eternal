/**
 * StringFx.tsx — String leaving a fallen enemy for you. A line of string spirals out of its remains, wanders about erratically,
 * coils tight, and darts into you; only then does the counter go up (`onLand`). It is a canvas laid over the fight, drawn on its own
 * clock: whatever else is playing, it neither waits for it nor stops it. It reads where the remains and you are on screen each frame
 * (the camera moves), from the figures' `data-fig` boxes.
 */
import { type RefObject, useEffect, useRef } from "react";

/** One lot of String on its way: from the figure `from` to you, `amount` of it. */
export interface StringBurst { id: number; from: string; amount: number }

/** When each phase ends, in seconds: spiralling out, wandering (drifting toward you), then coiling round you, fading as it goes. */
const T1 = 0.9, T2 = 2.0, T3 = 3.1;
/** How many points of trail a string keeps. */
const TRAIL = 90;

interface Live {
  burst: StringBurst;
  t0: number;
  /** Fixed numbers that make this string's wandering its own. */
  a: number[];
  trail: { x: number; y: number }[];
  landed: boolean;
  /** Where the head was, relative to the remains, as the spiral ended, and where the wandering ended (absolute). */
  off1?: { x: number; y: number };
  end2?: { x: number; y: number };
  /** How much of the string still shows (it fades as it coils). */
  fade: number;
}

const ease = (k: number) => k * k * (3 - 2 * k);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export function StringFx({ bursts, root, onLand }: { bursts: StringBurst[]; root: RefObject<HTMLElement | null>; onLand: (b: StringBurst) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef<Live[]>([]);
  const seen = useRef(new Set<number>());
  const raf = useRef(0);
  const land = useRef(onLand);
  land.current = onLand;
  /** The last place each figure was seen, if its element is gone for a moment. */
  const lastAt = useRef(new Map<string, { x: number; y: number; h: number }>());

  const loop = useRef<(now: number) => void>(() => {});
  loop.current = (now: number) => {
    const cv = canvas.current, host = root.current;
    if (!cv || !host) { raf.current = 0; return; }
    const base = host.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(base.width * dpr) || cv.height !== Math.round(base.height * dpr)) {
      cv.width = Math.round(base.width * dpr);
      cv.height = Math.round(base.height * dpr);
    }
    const g = cv.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, base.width, base.height);
    /** Where a figure is on screen: the middle of its body (`at`: how far down its box), and how tall it is. */
    const where = (id: string, at: number) => {
      const el = host.querySelector(`[data-fig="${id}"]`);
      if (el) {
        const r = el.getBoundingClientRect();
        const p = { x: r.left - base.left + r.width / 2, y: r.top - base.top + r.height * at, h: r.height };
        lastAt.current.set(`${id}:${at}`, p);
        return p;
      }
      return lastAt.current.get(`${id}:${at}`) ?? { x: base.width / 2, y: base.height / 2, h: 120 };
    };

    for (const s of live.current) {
      const t = (now - s.t0) / 1000;
      const src = where(s.burst.from, 0.72), dst = where("player", 0.5);
      const u = Math.max(34, src.h * 0.45), ud = Math.max(30, dst.h * 0.42);
      let x: number, y: number;
      if (t < T1) {
        // Spiralling out of the remains, rising as it goes.
        const k = t / T1, r = u * 0.95 * ease(k), ang = Math.PI * 2 * 2.3 * k + s.a[0];
        x = src.x + Math.cos(ang) * r;
        y = src.y + Math.sin(ang) * r * 0.55 - k * u * 0.8;
        s.off1 = { x: x - src.x, y: y - src.y };
      } else if (t < T2) {
        // Wandering: a head that darts and drifts about, never settling, but drifting ever nearer you.
        const k = t - T1, drift = ease((t - T1) / (T2 - T1));
        const from = { x: src.x + (s.off1?.x ?? 0), y: src.y + (s.off1?.y ?? 0) };
        const c = { x: lerp(src.x, dst.x, drift * 0.8), y: lerp(src.y - u * 1.1, dst.y - ud * 0.4, drift) };
        const wx = c.x + u * (0.9 * Math.sin(k * 3.1 + s.a[1]) + 0.5 * Math.sin(k * 7.3 + s.a[2]));
        const wy = c.y + u * (0.55 * Math.sin(k * 2.6 + s.a[3]) + 0.35 * Math.sin(k * 8.1 + s.a[4]));
        const b = ease(Math.min(1, k / 0.4));
        x = lerp(from.x, wx, b);
        y = lerp(from.y, wy, b);
        s.end2 = { x, y };
      } else {
        // Coiling round you: round and round, ever tighter and faster, fading as it winds in, until it is gone into you.
        const k = Math.min(1, (t - T2) / (T3 - T2)), r = ud * lerp(0.95, 0.12, ease(k)), ang = Math.PI * 2 * (2 + 5 * k * k) + s.a[0];
        const b = ease(Math.min(1, k / 0.25));
        x = lerp(s.end2?.x ?? dst.x, dst.x + Math.cos(ang) * r, b);
        y = lerp(s.end2?.y ?? dst.y, dst.y + Math.sin(ang) * r * 0.75 - ud * 0.1, b);
        s.fade = 1 - ease(k);
        if (k >= 1 && !s.landed) { s.landed = true; land.current(s.burst); }
      }
      if (t < T3) s.trail.push({ x, y });
      // Once it has wound in, what is left of the string follows it.
      else for (let i = 0; i < 3 && s.trail.length; i++) s.trail.shift();
      while (s.trail.length > TRAIL) s.trail.shift();

      // The trail: a cream thread, thin at its tail and bright at its head, with a soft glow.
      g.lineCap = "round"; g.lineJoin = "round";
      g.shadowColor = `rgba(255, 250, 235, ${0.75 * s.fade})`; g.shadowBlur = 8;
      for (let i = 1; i < s.trail.length; i++) {
        const k = i / s.trail.length;
        g.strokeStyle = `rgba(244, 241, 230, ${(0.15 + 0.8 * k) * s.fade})`;
        g.lineWidth = 0.6 + 2.2 * k;
        g.beginPath(); g.moveTo(s.trail[i - 1].x, s.trail[i - 1].y); g.lineTo(s.trail[i].x, s.trail[i].y); g.stroke();
      }
      g.shadowBlur = 0;
    }
    live.current = live.current.filter(s => s.trail.length > 0 || s.t0 + T3 * 1000 > now);
    raf.current = live.current.length ? requestAnimationFrame(t => loop.current(t)) : 0;
    if (!live.current.length) g.clearRect(0, 0, base.width, base.height);
  };

  // New lots of String begin their journey; the loop runs only while one is on its way.
  useEffect(() => {
    for (const b of bursts) {
      if (seen.current.has(b.id)) continue;
      seen.current.add(b.id);
      live.current.push({ burst: b, t0: performance.now(), a: Array.from({ length: 5 }, () => Math.random() * Math.PI * 2), trail: [], landed: false, fade: 1 });
    }
    if (live.current.length && !raf.current) raf.current = requestAnimationFrame(t => loop.current(t));
  }, [bursts]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return <canvas ref={canvas} className="string-fx" aria-hidden="true" />;
}
