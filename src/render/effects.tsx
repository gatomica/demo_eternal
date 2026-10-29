/**
 * effects.tsx — things flying and spreading across the field: projectiles, shockwaves, impact rings.
 */
import { useEffect, useState } from "react";
import { NEAR, type Vec } from "./camera";
import type { Pt } from "./geom";

/** Something thrown across the field during a beat: from a figure to another, passing through it. */
export interface Projectile {
  from: string;
  to: string;
  /** `clang`: a melee blow caught by a Block, so a starburst flashes where the blocker (`from`) meets the attacker (`to`). */
  kind: "fan" | "blast" | "wax" | "impact" | "clang" | "flamehit";
  /** Changes every beat, so the flight replays. */
  key: string;
  /** A flaming flail's impact: its shockwave burns instead of white spikes. */
  fiery?: boolean;
  /** Where on the thrower it comes from, in figure units (100 × 120, facing right), e.g. its hand. */
  origin?: readonly [number, number];
}

/**
 * A fan of flame lying flat, like the swat's sweep: a wide, level crescent seen at an angle.
 * It's headed a little toward the player as well as the camera, so its bow leans left and its
 * right end dips. Flame tongues rise from its back edge.
 */
const FAN = (() => {
  const L: Pt = [-48, -1], R: Pt = [48, 5];
  const back: Pt = [-14, 8], front: Pt = [-14, 26];
  const at = (c: Pt, t: number): Pt => [
    (1 - t) ** 2 * L[0] + 2 * t * (1 - t) * c[0] + t ** 2 * R[0],
    (1 - t) ** 2 * L[1] + 2 * t * (1 - t) * c[1] + t ** 2 * R[1],
  ];
  const tongues = [0.1, 0.21, 0.32, 0.43, 0.54, 0.65, 0.76, 0.87].map(t => {
    const a = at(back, t - 0.045), b = at(back, t + 0.045), m = at(back, t);
    const h = 10 + 5 * Math.sin(t * Math.PI); // taller in the middle
    // Rooted inside the band (a little below the back edge), so each tongue grows out of it.
    return `M${a[0]} ${a[1] + 3} Q${a[0] + 1} ${m[1] - h * 0.55} ${m[0] + 1.5} ${m[1] - h} Q${b[0] - 0.5} ${m[1] - h * 0.4} ${b[0]} ${b[1] + 3} Z`;
  });
  const band = (f: Pt, b: Pt) => `M${L[0]} ${L[1]} Q${f[0]} ${f[1]} ${R[0]} ${R[1]} Q${b[0]} ${b[1]} ${L[0]} ${L[1]} Z`;
  return { tongues, band: band(front, back) };
})();

/** The thrown thing itself, drawn pointing right (the scene rotates it to its flight). */
export function ProjectileShape({ kind }: { kind: Projectile["kind"] }) {
  if (kind === "wax") {
    return (
      <svg viewBox="-10 -10 20 20" className="projectile-svg">
        <circle cx={0} cy={0} r={6} className="fig-wax-head" />
        <path d="M-6 0 Q-10 1 -9 4" className="fig-beard-strand" />
      </svg>
    );
  }
  return (
    <svg viewBox="-50 -18 100 36" className="projectile-svg is-fan">
      {FAN.tongues.map((d, i) => <path key={i} d={d} className="fig-burst-outer" />)}
      <path d={FAN.band} className="fig-burst-outer" />
      <path d={`M-38 3 Q-14 21 38 7 Q-14 12 -38 3 Z`} className="fig-burst-inner" />
    </svg>
  );
}

/** How long the shockwave takes to spread, and how long after the flash it starts. */
const SHOCK_MS = 640;

const SHOCK_DELAY_MS = 120;

/** How long a melee impact's ring takes to spread and fade. */
const IMPACT_MS = 380;

/**
 * A shockwave rolling out along the floor: a ring around `center` (a floor point, in meters)
 * spreading out to `reach` meters, projected through the camera so it lies on the floor however
 * far it goes. Only the side facing `toward` (a world angle: x = cos, z = sin) burns: flames
 * tallest straight ahead, dying away around the sides, nothing behind (or all the way round, for
 * `full`). The flames (`flame` meters tall) keep their size as it spreads, only rising as it
 * advances. `impact`: a melee blow's version, white spikes, quicker.
 */
export function Shockwave({ center, reach, toward, flame, proj, impact, full }: {
  center: Vec; reach: number; toward: number; flame: number;
  /** Where a floor point lands on screen (the scene's camera). */
  proj: (p: Vec) => { sx: number; sy: number; ppm: number; depth: number };
  /** Burning all the way round, not just toward one side (the Warden's phase-two flare). */
  full?: boolean;
  /** A melee blow's version: white spikes instead of flames, quicker, starting right away. */
  impact?: boolean;
}) {
  const [p, setP] = useState(0);
  useEffect(() => {
    const start = performance.now() + (impact ? 0 : SHOCK_DELAY_MS);
    const ms = impact ? IMPACT_MS : SHOCK_MS;
    let raf = 0;
    const tick = () => {
      const k = Math.min(1, Math.max(0, (performance.now() - start) / ms));
      setP(k);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  if (p <= 0) return null;
  const eased = 1 - (1 - p) ** 2.2;
  const r = reach * (0.08 + 0.92 * eased);
  const opacity = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
  // Flames sit evenly along the burning arc, a fixed distance apart (in meters), whatever its size.
  const spacing = flame * (impact ? 0.24 : 0.16);
  const step = Math.max(0.02, spacing / r);
  const mid = proj(center);
  const flames: { depth: number; d: string; core: string }[] = [];
  const arc: string[] = [];
  let pen = false;
  const span = full ? Math.PI : 1.47;
  for (let off = -span; off <= span + 1e-6; off += step) {
    const t = toward + off;
    const w = full ? 1 : Math.cos(off);
    const at = proj({ x: center.x + r * Math.cos(t), z: center.z + r * Math.sin(t) });
    // Behind (or right at) the camera: not drawn.
    if (at.depth < NEAR) { pen = false; continue; }
    const { sx: x, sy: y, ppm } = at;
    arc.push(`${pen ? "L" : "M"}${x} ${y}`);
    pen = true;
    if (w < 0.2) continue;
    // The flames rise as the wave advances: low as it leaves him, full height once it's out.
    const hgt = flame * ppm * (0.25 + 0.95 * eased) * w ** 1.6;
    const half = flame * ppm * (0.06 + 0.04 * w) * (impact ? 1.7 : 1);
    const lean = Math.sign(x - mid.sx) * hgt * 0.05; // flames lean outward a little
    const tongue = (k: number) => {
      const hh = hgt * k, ww = half * k;
      return `M${x - ww} ${y} Q${x - ww * 0.6 + lean * 0.5 * k} ${y - hh * 0.55} ${x + lean * k} ${y - hh} Q${x + ww * 0.7 + lean * 0.4 * k} ${y - hh * 0.45} ${x + ww} ${y} Z`;
    };
    flames.push({ depth: at.depth, d: tongue(1), core: tongue(0.5) });
  }
  // Each flame is layered with the figures by its distance, as they are (see Scene), so the far
  // side of the ring stays behind whoever stands in front of it.
  flames.sort((m, n) => n.depth - m.depth); // farther ones first
  const layers = new Map<number, typeof flames>();
  for (const f of flames) {
    const z = 1000 - Math.round(f.depth * 10);
    const layer = layers.get(z);
    if (layer) layer.push(f);
    else layers.set(z, [f]);
  }
  return (
    <>
      {/* The glowing edge lies on the floor, under everyone. */}
      <svg className="shockwave" style={{ opacity, zIndex: 1 }} aria-hidden="true">
        <path d={arc.join(" ")} className={impact ? "impact-ring" : "shockwave-ring"} />
        {!impact && <path d={arc.join(" ")} className="shockwave-ring-inner" />}
      </svg>
      {[...layers.entries()].map(([z, fs]) => (
        <svg key={z} className="shockwave" style={{ opacity, zIndex: z }} aria-hidden="true">
          {fs.map((f, i) => (
            <g key={i}>
              <path d={f.d} className={impact ? "impact-spike" : "fig-burst-outer"} />
              {!impact && <path d={f.core} className="fig-burst-inner" />}
            </g>
          ))}
        </svg>
      ))}
    </>
  );
}

/** The tongues of a flame hit: where each stands (share of the box, across and up from its middle), how big, and when it flares. */
const FLAME_HIT = [
  [-0.3, 0.02, 0.8, 0.00], [0.28, 0.0, 0.9, 0.05], [-0.12, -0.1, 1.15, 0.02],
  [0.12, -0.12, 1.05, 0.08], [0.0, -0.22, 0.85, 0.12], [-0.38, -0.18, 0.6, 0.1], [0.4, -0.2, 0.65, 0.04],
] as const;

/**
 * Flames licking a unit a fire attack has hit: tongues flaring up around its body in a flash of
 * orange glow, then dying away. Drawn over the unit, centered on `cx`, `cy` (screen pixels), the
 * size of its box.
 */
export function FlameHit({ cx, cy, size }: { cx: number; cy: number; size: number }) {
  return (
    <div className="flame-hit" style={{ left: cx, top: cy, width: size * 0.8, height: size * 0.9 }} aria-hidden="true">
      <svg viewBox="-50 -60 100 100" overflow="visible">
        <circle cx={0} cy={-8} r={34} className="flame-hit-glow" />
        {FLAME_HIT.map(([x, y, k, delay], i) => (
          <g key={i} transform={`translate(${x * 100} ${y * 100 + 28}) scale(${k * 2.3})`}>
            <g className="flame-hit-tongue" style={{ animationDelay: `${delay}s` }}>
              <path d="M0 -12 C4.6 -5 4.4 0 0 0 C-4.4 0 -4.6 -5 0 -12 Z" className="fig-burst-outer" />
              <path d="M0 -6 C2 -2.4 2 0 0 0 C-2 0 -2 -2.4 0 -6 Z" className="fig-burst-inner" />
            </g>
          </g>
        ))}
      </svg>
    </div>
  );
}

/** How long a clang's burst takes to flare and fade. */
const CLANG_MS = 340;

/**
 * The "clang" of a blocked blow: a starburst of white spikes radiating from the point where the
 * weapons met (a screen point, `reach` px at most), like a burst of sound. The spikes fly outward
 * and leave the center empty, fading as they go, after a bright flash at the start. A few are
 * long and the rest short, so it reads as a spark rather than a gear.
 */
export function ClangBurst({ cx, cy, reach }: { cx: number; cy: number; reach: number }) {
  const [p, setP] = useState(0.001);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const k = Math.min(1, (performance.now() - start) / CLANG_MS);
      setP(k);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  if (p >= 1) return null;
  // Each spike is its own shard: its tip races out first and its base follows, so they leave the
  // center behind and it's left empty.
  const tipK = 1 - (1 - p) ** 3;
  const baseK = Math.max(0, (p - 0.12) / 0.88) ** 1.6;
  const fade = p < 0.45 ? 1 : 1 - (p - 0.45) / 0.55;
  const SPIKES = 12;
  const shards: string[] = [];
  for (let i = 0; i < SPIKES; i++) {
    // Alternating long and short, with a little irregularity.
    const long = (i % 2 === 0 ? 1 : 0.7) * (0.9 + 0.2 * Math.sin(i * 2.7));
    const a = (i / SPIKES) * Math.PI * 2 + 0.2;
    const tip = reach * long * (0.2 + 0.8 * tipK);
    const base = reach * long * 0.75 * baseK;
    const half = 0.16; // half the base's angular width
    const at = (r: number, ang: number) => `${cx + r * Math.cos(ang)},${cy + r * Math.sin(ang)}`;
    shards.push(`${at(base, a - half)} ${at(tip, a)} ${at(base, a + half)}`);
  }
  const flash = Math.max(0, 1 - p * 3);
  return (
    <svg className="shockwave" style={{ zIndex: 2000 }} aria-hidden="true">
      {shards.map((pts, i) => <polygon key={i} points={pts} className="impact-spike" style={{ opacity: fade }} />)}
      {flash > 0 && <circle cx={cx} cy={cy} r={reach * 0.22 * (0.6 + p)} className="impact-flash" style={{ opacity: flash }} />}
    </svg>
  );
}

/**
 * A melee blow's shockwave: a thin white ring lying flat on the floor (squashed like Flame
 * Blast's), quickly spreading out to `reach` and fading, with a brief white flash where it hit.
 * Drawn in screen pixels.
 */
export function ImpactRing({ cx, cy, reach }: { cx: number; cy: number; reach: number }) {
  const [p, setP] = useState(0.001);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const k = Math.min(1, (performance.now() - start) / IMPACT_MS);
      setP(k);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  if (p >= 1) return null;
  const eased = 1 - (1 - p) ** 2.5;
  const rx = reach * (0.1 + 0.9 * eased), ry = rx * 0.3;
  const fade = 1 - p;
  const flash = Math.max(0, 1 - p * 3.5);
  return (
    <svg className="shockwave" aria-hidden="true">
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} className="impact-ring" style={{ opacity: fade, strokeWidth: 2 + 4 * fade }} />
      {flash > 0 && <ellipse cx={cx} cy={cy - reach * 0.04} rx={reach * 0.16 * (0.6 + p)} ry={reach * 0.1 * (0.6 + p)} className="impact-flash" style={{ opacity: flash }} />}
    </svg>
  );
}
