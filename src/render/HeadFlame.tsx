/**
 * HeadFlame.tsx — a flame burning on a figure's head (a lit waxed's, a candle on the waxed remains), over the scene. It follows the head
 * exactly, whatever moves it: every frame it stands where a marker drawn inside the figure (`FlameAnchor`) really is on the screen, so it
 * goes along with the figure's lunges, shakes and steps as well as its poses. And it leans with the motion, as a flame does: moved one
 * way, it trails the other and swings back (a damped spring); moved down it stretches taller, moved up it squats.
 */
import { useEffect, useLayoutEffect, useRef } from "react";
import type { Pt } from "./geom";
import { FlameStrings } from "./FlameStrings";
import { LittleFlame } from "./LittleFlame";

/** The marker of a figure's flame: where its base is in the figure's box. Drawn inside the figure, so it moves with it. */
export function FlameAnchor({ id, x, y }: { id: string; x: number; y: number }) {
  return <span className="flame-anchor" data-flame-anchor={id} style={{ left: x, top: y }} aria-hidden="true" />;
}

/** How hard the flame leans for its speed (degrees per flame-size per second), and the most it leans. */
const LEAN = 7, MAX_LEAN = 50;
/** The spring that swings it back upright: its stiffness and its damping (a little under critical, so it sways once past upright). */
const STIFF = 170, DAMP = 15;

/**
 * The flame, its base on `at` (screen pixels in the scene: where it is this render, until its marker is found), `sz` across. `blaze`: bigger
 * and brighter, red strings looping out of it and back in.
 */
export function HeadFlame({ anchor, at, sz, blaze, light, zIndex }: { anchor: string; at: Pt; sz: number; blaze?: boolean; /** How wide the red light round it is (px). */ light: number; zIndex?: number }) {
  const wrap = useRef<HTMLDivElement>(null), flame = useRef<SVGGElement>(null), glow = useRef<HTMLDivElement>(null);
  const given = useRef({ at, sz });
  given.current = { at, sz };
  useLayoutEffect(() => {
    if (wrap.current && !wrap.current.style.transform) wrap.current.style.transform = `translate(${at[0]}px, ${at[1]}px)`;
  });
  useEffect(() => {
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let raf = 0, last = performance.now(), prev: Pt | undefined;
    let vx = 0, vy = 0, lean = 0, swing = 0, stretch = 1;
    const frame = (now: number) => {
      const el = wrap.current, scene = el?.offsetParent as HTMLElement | null;
      const mark = scene?.querySelector(`[data-flame-anchor="${CSS.escape(anchor)}"]`);
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      if (el && scene) {
        let x = given.current.at[0], y = given.current.at[1];
        // Its motion is measured against its own figure's place (the slot), so the camera moving round the fight does not sway it.
        let rel: Pt | undefined;
        if (mark) {
          const sr = scene.getBoundingClientRect(), mr = mark.getBoundingClientRect();
          const kx = scene.offsetWidth ? sr.width / scene.offsetWidth : 1, ky = scene.offsetHeight ? sr.height / scene.offsetHeight : 1;
          x = (mr.left - sr.left) / kx;
          y = (mr.top - sr.top) / ky;
          const slot = mark.closest(".figure-slot")?.getBoundingClientRect();
          rel = slot ? [(mr.left - slot.left) / kx, (mr.top - slot.top) / ky] : [x, y];
        }
        el.style.transform = `translate(${x}px, ${y}px)`;
        // (Its light is placed by its corner, not moved by a transform: its own pulse is a transform, and it has to blend with the scene behind it.)
        if (glow.current) { glow.current.style.left = `${x}px`; glow.current.style.top = `${y}px`; }
        if (!still && rel) {
          const size = Math.max(1, given.current.sz);
          // Its speed, in flame-sizes a second (a pose changing at once is a jolt: capped, it only gives it a flick).
          const cap = (v: number) => Math.max(-12, Math.min(12, v));
          const nx = prev ? cap((rel[0] - prev[0]) / dt / size) : 0, ny = prev ? cap((rel[1] - prev[1]) / dt / size) : 0;
          prev = rel;
          const k = Math.min(1, dt * 14);
          vx += (nx - vx) * k;
          vy += (ny - vy) * k;
          // It leans away from where it is going, and the spring brings it back.
          const target = Math.max(-MAX_LEAN, Math.min(MAX_LEAN, -vx * LEAN));
          swing += (STIFF * (target - lean) - DAMP * swing) * dt;
          lean += swing * dt;
          const tall = 1 + Math.max(-0.3, Math.min(0.45, vy * 0.06));
          stretch += (tall - stretch) * Math.min(1, dt * 10);
          flame.current?.setAttribute("transform", `rotate(${lean.toFixed(2)}) scale(${(1 / Math.sqrt(stretch)).toFixed(3)} ${stretch.toFixed(3)})`);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [anchor]);
  return (
    <>
    {/* The faint red light it gives off round it, over the figures and the floor near it. */}
    <div ref={glow} className="head-flame-light" style={{ left: at[0], top: at[1] }} aria-hidden="true">
      <div className={`flame-light${blaze ? " is-blazing" : ""}`} style={{ left: -light / 2, top: -sz * 0.35 - light / 2, width: light, height: light }} />
    </div>
    <div ref={wrap} className={`head-flame${blaze ? " is-blazing" : ""}`} style={{ zIndex }} aria-hidden="true">
      <svg className="head-flame-svg" style={{ left: -sz / 2, top: -sz * 0.8, width: sz, height: sz }} viewBox="-10 -16 20 20">
        <circle cx={0} cy={-3} r={9} className="fig-glow" />
        {/* (Leaning and stretching about its base.) */}
        <g ref={flame}><LittleFlame x={0} y={0} height={12} /></g>
      </svg>
      {blaze && <FlameStrings cx={0} cy={-sz * 0.35} size={sz * 4} />}
    </div>
    </>
  );
}
