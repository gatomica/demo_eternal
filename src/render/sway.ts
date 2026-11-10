/**
 * sway.ts — cloth that hangs from a figure (the Hunter's tailcoat, the Nomad's braid, the Soldier's leather skirt) sways with the figure's movement, as the head
 * flame leans with its (HeadFlame.tsx): every frame the figure's anchor (a marker drawn inside it, at the pelvis) is found on the screen, its sideways speed is
 * worked out (smoothed, and capped, so a pose changing at once only gives it a flick), and each kind of cloth swings, as a damped spring, away from where the
 * figure is going and back. Each swing is kept within a limit, softly: it eases off as it nears it (a `tanh`), instead of stopping short at it. The limit is
 * measured from the rigid part the cloth hangs from, not from the ground: the cloth may lean so far off the way that part points, whichever way the body is
 * turned or leaned, so it never swings through the body (and where a leaning body would hold it past its limit, it is brought in toward the body's line).
 *
 * The drawn parts of a cloth sit in a `<g data-sway="kind" data-px data-py data-sway-w data-rest data-body>`: its pivot, in the figure's drawing units (the point it
 * hangs from), its weight (how much of the swing it takes: the tip of a braid moves more than its root), and two angles on the screen, in degrees turned as the
 * swing is (a thing hanging straight down on the screen is 0, one turned clockwise about its pivot is positive): `rest`, the way it hangs by itself (straight down,
 * in the world), and `body`, the way the part it hangs from points (the spine, the neck). The pivot is turned by the swing, as one rotates a hanging thing.
 * The state is kept by figure outside the component (`id`), since the scene draws a figure anew on every playback beat and the sway must carry across.
 *
 * One loop serves every figure on the screen, and it reads before it writes: every figure's marker is measured first, then every cloth is turned, so the browser
 * works out the layout once a frame, not once for each figure.
 */
import { type RefObject, useEffect, useLayoutEffect } from "react";

interface Kind {
  /** Degrees of swing for each figure-height a second of speed (before the softening). */
  gain: number;
  /** The most it swings from the line of the part it hangs from, in degrees (it eases toward it). */
  max: number;
  /** The spring that brings it back: its stiffness and its damping (a little under critical, so it swings once past upright). */
  stiff: number;
  damp: number;
}
const KINDS: Record<string, Kind> = {
  tail: { gain: 9, max: 24, stiff: 120, damp: 12 },
  skirt: { gain: 5, max: 13, stiff: 170, damp: 17 },
  braid: { gain: 14, max: 40, stiff: 85, damp: 8 },
};

interface Memory { x?: number; vx: number; at: number; kinds: Record<string, { angle: number; swing: number }> }
const memory = new Map<string, Memory>();

/** An angle in degrees brought to between -180 and 180. */
const wrap = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;

/**
 * Turns each cloth to the angle its kind is at now (`mem`), kept within its limit of the part it hangs from: it ends up at `off`, the way that part points
 * away from the way the cloth hangs by itself, plus how far it has swung from the part's line, eased (a `tanh`) so it never goes more than the limit from it.
 */
function apply(cloths: Iterable<SVGGElement>, mem: Memory) {
  for (const el of cloths) {
    const kind = el.dataset.sway ?? "", s = mem.kinds[kind], k = KINDS[kind];
    if (!s || !k) continue;
    const weight = Number(el.dataset.swayW ?? 1), off = wrap(Number(el.dataset.body ?? 0) - Number(el.dataset.rest ?? 0));
    // (a piece close to where it hangs from keeps closer to the body: its limit is its share of the whole)
    const limit = k.max * Math.max(0.35, weight);
    const angle = off + limit * Math.tanh((s.angle * weight - off) / limit);
    el.setAttribute("transform", `rotate(${angle.toFixed(2)} ${el.dataset.px} ${el.dataset.py})`);
  }
}

/** The figures that have cloth on the screen now. */
const live = new Set<{ root: RefObject<SVGSVGElement | null>; mem: Memory }>();
let raf = 0;

/** One frame for every figure: all the measuring first, then all the turning. */
function frame(now: number) {
  const measured: { mem: Memory; cloths: NodeListOf<SVGGElement>; dt: number }[] = [];
  for (const { root, mem } of live) {
    const svg = root.current, cloths = svg?.querySelectorAll<SVGGElement>("[data-sway]"), mark = svg?.querySelector("[data-sway-anchor]");
    const dt = Math.min(0.05, Math.max(0.001, (now - mem.at) / 1000));
    mem.at = now;
    if (!svg || !mark || !cloths?.length) { mem.x = undefined; continue; } // (not drawn, or nothing hanging: start measuring afresh when it is)
    const r = mark.getBoundingClientRect(), height = svg.getBoundingClientRect().height || 1, x = r.left + r.width / 2;
    // (its sideways speed in figure-heights a second, capped, and smoothed)
    if (mem.x !== undefined) {
      const raw = Math.max(-6, Math.min(6, (x - mem.x) / dt / height));
      mem.vx += (raw - mem.vx) * Math.min(1, dt * 14);
    }
    mem.x = x;
    measured.push({ mem, cloths, dt });
  }
  for (const { mem, cloths, dt } of measured) {
    for (const [name, k] of Object.entries(KINDS)) {
      const s = mem.kinds[name] ?? (mem.kinds[name] = { angle: 0, swing: 0 });
      // It trails the way the figure goes: a hanging thing is turned, about the point it hangs from, toward the way it is going.
      const target = k.max * Math.tanh((k.gain * mem.vx) / k.max);
      s.swing += (k.stiff * (target - s.angle) - k.damp * s.swing) * dt;
      s.angle += s.swing * dt;
      // (the limit itself, from the part it hangs from, is applied where it is drawn, `apply`; here only a bound against runaway)
      s.angle = Math.max(-2 * k.max, Math.min(2 * k.max, s.angle));
    }
    apply(cloths, mem);
  }
  raf = live.size ? requestAnimationFrame(frame) : 0;
}

/** Sways the cloth in `root` (an SVG with `[data-sway-anchor]` and `[data-sway]` in it) for as long as it is mounted. */
export function useSway(root: RefObject<SVGSVGElement | null>, id: string) {
  // (A figure drawn anew keeps the angle it was at, from its first paint.)
  useLayoutEffect(() => {
    const mem = memory.get(id), svg = root.current;
    if (mem && svg) apply(svg.querySelectorAll<SVGGElement>("[data-sway]"), mem);
  });
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const mem = memory.get(id) ?? { vx: 0, at: performance.now(), kinds: {} };
    memory.set(id, mem);
    const entry = { root, mem };
    live.add(entry);
    if (!raf) raf = requestAnimationFrame(frame);
    return () => { live.delete(entry); };
  }, [root, id]);
}
