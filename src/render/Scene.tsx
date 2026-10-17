/**
 * Scene.tsx — the battlefield: the floor and every figure, seen through the camera.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ArmorTier, WeaponTier } from "../core/types";
import { type Cam, ease, figureBox, HORIZON, lerpAngle, lerpCam, lerpVec, NEAR, planningCamera, project, right, type SceneShot, screenOf, shotCamera, type ShotCamera, toCamera, type Vec } from "./camera";
import { ImpactRing, type Projectile, ProjectileShape, Shockwave } from "./effects";
import type { Pt } from "./geom";
import { Shards } from "./HealthBar";
import { flameOf, type PoseName } from "./poses";
import { StickFigure } from "./StickFigure";
import { ARENA_PROPS, PROP_FLAME, PROP_SCALE, SealedSleeper } from "../warden/arena";
import { IGNITE } from "../warden/scenes";
import { type CandleArm, WARDEN_POSES, type WardenPoseName } from "../warden/skeleton";

export interface SceneFigure {
  id: string;
  view: "front" | "back";
  pose: PoseName;
  weapon: WeaponTier;
  armor: ArmorTier;
  variant?: "waxed" | "warden";
  arm?: CandleArm;
  lingerFrom?: WardenPoseName;
  /** When (performance.now()) the Warden's flame went out, while its smoke still shows. */
  smokeSince?: number;
  /** A candle burning on its head (the waxed remains, once the arena is lit). */
  candle?: boolean;
  /** Wax caked on it (the player, Waxed). */
  waxCaked?: boolean;
  /** Sealed whole in wax (its flame taken by Usurp Flame). */
  encased?: boolean;
  /** The Warden: phase two's look (black wax, burning inside) whatever his arm. */
  phase2Look?: boolean;
  /** The Warden: his flail is on fire. */
  flailFire?: boolean;
  /** Size relative to a normal figure. */
  scale?: number;
  /** Playback animations (fx-hit, fx-step...). */
  classes: string[];
  /** Changes on every playback beat, so animations replay. */
  stepKey: string;
  selected: boolean;
  disabled: boolean;
  label: string;
  onPick: () => void;
}

interface Tween<T> { from: T; to: T }

/** A repeatable random number in [0, 1) for each index. */
const rand = (seed: number, i: number) => {
  const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Draws the floor and every figure through the camera. When a new shot arrives, everyone (and
 * the camera) moves from wherever they are right now to the new spots, over the shot's duration.
 */
export function Scene({ figures, shot, projectiles = [], dark, usurpTrail, arena, arenaLit, ignite }: {
  figures: SceneFigure[];
  shot: SceneShot;
  projectiles?: Projectile[];
  /** The light dying (0 to 1, over `ms`), all but one figure's flame, which keeps burning. */
  dark?: { level: number; ms: number; flame?: string };
  /** A flame streaming from one figure, arching over the other, into its candle hand. */
  usurpTrail?: { from: string; to: string; key: string };
  /** The Warden's arena: sleepwalkers sealed into its floor and walls. */
  arena?: boolean;
  /** The sealed sleepwalkers' candles (and the waxed remains') burn. */
  arenaLit?: boolean;
  /**
   * The Warden's phase-two scene: who, when it started (performance.now(); not yet, if unset),
   * and a seed for its randomness.
   */
  ignite?: { who: string; start?: number; seed: number };
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Tween state lives in refs; a frame counter re-renders while anything is moving.
  // The camera moves from where it was (`from`) to the shot's camera. A riding camera that was
  // already riding just turns (`fromYaw` to the new yaw) while it follows its figure.
  const cam = useRef<{ from: Cam; to: ShotCamera; fromYaw: number | null }>({
    from: shotCamera(shot),
    to: shot.camera,
    fromYaw: "follow" in shot.camera ? shot.camera.yaw : null,
  });
  const pos = useRef(new Map<string, Tween<Vec>>());
  const timing = useRef({ start: 0, ms: 0 });
  const [, setFrame] = useState(0);
  const progress = () => {
    const { start, ms } = timing.current;
    return ms <= 0 ? 1 : Math.min(1, (performance.now() - start) / ms);
  };
  const posNow = (id: string, k = ease(progress())) => {
    const t = pos.current.get(id);
    return t ? lerpVec(t.from, t.to, k) : undefined;
  };
  const camNow = (k = ease(progress())): Cam => {
    const { from, to, fromYaw } = cam.current;
    if (!("follow" in to)) return lerpCam(from, to, k);
    const at = posNow(to.follow, k);
    if (!at) return from;
    const riding = planningCamera(at, lerpAngle(fromYaw ?? from.yaw, to.yaw, k));
    // Already riding: stay locked on. Coming from a fixed shot: ease into the ride.
    return fromYaw !== null ? riding : lerpCam(from, riding, k);
  };

  useLayoutEffect(() => {
    // Start every move from where things are on screen right now.
    const k = ease(progress());
    const prev = cam.current.to;
    const nowCam = camNow(k);
    // Keep riding (and turning from the current angle) if the camera was riding the same figure.
    const stillRiding = "follow" in prev && "follow" in shot.camera && prev.follow === shot.camera.follow;
    const fromYaw = stillRiding && "follow" in prev ? lerpAngle(cam.current.fromYaw ?? prev.yaw, prev.yaw, k) : null;
    for (const [id, to] of Object.entries(shot.positions)) {
      const t = pos.current.get(id);
      pos.current.set(id, { from: t ? lerpVec(t.from, t.to, k) : to, to });
    }
    cam.current = { from: nowCam, to: shot.camera, fromYaw };
    timing.current = { start: performance.now(), ms: shot.ms };
    let raf = 0;
    const tick = () => {
      setFrame(f => f + 1);
      if (progress() < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot.version]);

  // The phase-two scene animates every frame until it ends.
  const igniteStart = ignite?.start;
  useEffect(() => {
    if (igniteStart === undefined) return;
    let raf = 0;
    const tick = () => {
      setFrame(f => f + 1);
      if (performance.now() - igniteStart < IGNITE.end) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [igniteStart]);
  /** How far into the phase-two scene it is, in ms. */
  const igniteT = igniteStart === undefined ? 0 : performance.now() - igniteStart;

  const { w, h } = size;
  const c = camNow();
  const placed = figures
    .map(f => {
      const p = posNow(f.id);
      return p && w ? { f, box: figureBox(c, p, w, h, f.scale) } : null;
    })
    .filter((x): x is { f: SceneFigure; box: ReturnType<typeof figureBox> } => !!x && x.box.depth > NEAR)
    .sort((a, b) => b.box.depth - a.box.depth); // far first, so nearer figures draw on top
  // The arena's sealed sleepwalkers, fixed in the world.
  // (Only in the Warden's arena; never right on top of the camera.)
  const props = w && arena
    ? ARENA_PROPS.map(pr => ({ pr, box: figureBox(c, pr.pos, w, h, PROP_SCALE[pr.kind]) })).filter(x => x.box.depth > 3)
    : [];
  const proj = (p: Vec) => project(c, p, w, h);
  /** The floor point under a screen x on a figure standing at `at` (its feet's depth). */
  const floorAt = (at: Vec, sx: number): Vec => {
    const { sx: fx, ppm } = proj(at);
    const r = right(c.yaw), k = (sx - fx) / ppm;
    return { x: at.x + r.x * k, z: at.z + r.z * k };
  };
  const toScreen = (box: { x: number; y: number; w: number; h: number }, p: readonly [number, number], mirror: boolean): Pt =>
    [box.x + (box.w * (mirror ? 100 - p[0] : p[0])) / 100, box.y + (box.h * p[1]) / 120];
  // Lit for good once the arena is lit, or from the moment his flare relights them.
  const propLit = !!arenaLit || (!!ignite && igniteT >= IGNITE.flare);
  // Every flame the phase-two scene draws on, in screen space: the waxed, the sealed sleepwalkers,
  // and a ring of unseen ones beyond the edges of the screen.
  const igniter = ignite && placed.find(x => x.f.id === ignite.who);
  const sources: { id: string; at: Pt; kindle: number; draw: number; seen: boolean }[] = [];
  if (ignite && igniter) {
    const add = (id: string, at: Pt, seen: boolean) => {
      const i = sources.length;
      sources.push({ id, at, seen, kindle: IGNITE.kindle + rand(ignite.seed, i) * 1200, draw: IGNITE.draw + rand(ignite.seed + 1, i) * 1400 });
    };
    for (const { f, box } of placed) if (f.variant === "waxed") add(f.id, toScreen(box, flameOf(f.pose), f.view === "front"), true);
    for (const { pr, box } of props) add(pr.id, toScreen(box, PROP_FLAME[pr.kind], !!pr.flip), true);
    const [hx, hy] = toScreen(igniter.box, WARDEN_POSES["wd-idle"].freeArm.hand, igniter.f.view === "front");
    const far = Math.max(w, h) * 0.8;
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + rand(ignite.seed + 2, k);
      add(`beyond${k}`, [hx + Math.cos(a) * far, hy + Math.sin(a) * far * 0.7], false);
    }
  }

  return (
    <div className="scene" ref={boxRef}>
      <div className="scene-floor" style={{ top: `${HORIZON * 100}%` }} />
      {w > 0 && <FloorGrid cam={c} w={w} h={h} />}
      {props.map(({ pr, box }) => (
        <div key={pr.id} className="arena-slot" style={{ left: box.x, top: box.y, width: box.w, height: box.h, zIndex: 1000 - Math.round(box.depth * 10), filter: `brightness(${Math.max(0.55, Math.min(1, 1.05 - box.depth * 0.04))})` }}>
          <SealedSleeper kind={pr.kind} flip={pr.flip} lit={propLit} />
        </div>
      ))}
      {placed.map(({ f, box }) => (
        <button
          key={f.id}
          className={`figure-slot ${f.selected ? "is-target" : ""}`}
          data-fig={f.id}
          aria-label={f.label}
          aria-pressed={f.selected}
          disabled={f.disabled}
          onClick={f.onPick}
          style={{
            left: box.x,
            top: box.y,
            width: box.w,
            height: box.h,
            zIndex: 1000 - Math.round(box.depth * 10),
            // Distance haze: the further away, the dimmer.
            filter: `brightness(${Math.max(0.68, Math.min(1, 1.12 - box.depth * 0.06))})`,
          }}
        >
          <div key={f.stepKey} className={`fig-wrap ${f.classes.join(" ")}`}>
            <StickFigure view={f.view} pose={f.pose} weapon={f.weapon} armor={f.armor} variant={f.variant} arm={f.arm} lingerFrom={f.lingerFrom} smokeAgo={f.smokeSince !== undefined ? performance.now() - f.smokeSince : undefined} phase2Look={f.phase2Look} flailFire={f.flailFire} waxCaked={f.waxCaked} encased={f.encased} />
            {f.classes.includes("fx-break") && <Shards />}
          </div>
        </button>
      ))}
      {/* The waxed remains burn as candles once the arena is lit. */}
      {placed.filter(({ f }) => f.candle).map(({ f, box }) => {
        const [fx, fy] = toScreen(box, flameOf(f.pose), f.view === "front");
        const sz = box.h * 0.13;
        return (
          <svg key={`candle-${f.id}`} className="arena-candle-flame" style={{ left: fx - sz / 2, top: fy - sz * 0.8, width: sz, height: sz, zIndex: 1001 - Math.round(box.depth * 10) }} viewBox="-10 -16 20 20" aria-hidden="true">
            <circle cx={0} cy={-3} r={9} className="fig-glow" />
            <g className="fig-flame">
              <path d="M0 -12 C4.6 -5 4.4 0 0 0 C-4.4 0 -4.6 -5 0 -12 Z" />
              <path d="M0 -6 C2 -2.4 2 0 0 0 C-2 0 -2 -2.4 0 -6 Z" className="fig-flame-core" />
            </g>
          </svg>
        );
      })}
      {dark && <div className="scene-dark" style={{ opacity: dark.level, transition: `opacity ${dark.ms}ms ease-in` }} />}
      {dark?.flame && (() => {
        const t = placed.find(x => x.f.id === dark.flame);
        if (!t) return null;
        const [fx, fy] = toScreen(t.box, flameOf(t.f.pose), t.f.view === "front");
        // The size of the figure's own flame (the Warden's candle is a little smaller), so it
        // hands over to it seamlessly as the light comes back.
        const sz = t.box.h * (t.f.variant === "warden" ? 0.12 : 0.16);
        return (
          <svg className="scene-lone-flame" style={{ left: fx - sz / 2, top: fy - sz * 0.8, width: sz, height: sz }} viewBox="-10 -16 20 20" aria-hidden="true">
            <circle cx={0} cy={-3} r={9} className="fig-glow" />
            <g className="fig-flame">
              <path d="M0 -12 C4.6 -5 4.4 0 0 0 C-4.4 0 -4.6 -5 0 -12 Z" />
              <path d="M0 -6 C2 -2.4 2 0 0 0 C-2 0 -2 -2.4 0 -6 Z" className="fig-flame-core" />
            </g>
          </svg>
        );
      })()}
      {usurpTrail && (() => {
        const a = placed.find(x => x.f.id === usurpTrail.from), b = placed.find(x => x.f.id === usurpTrail.to);
        if (!a || !b) return null;
        const from = toScreen(a.box, flameOf(a.f.pose), a.f.view === "front");
        const hand = toScreen(b.box, WARDEN_POSES["wd-idle"].freeArm.hand, b.f.view === "front");
        // Arching up over him: the control point well above both.
        const ctl: Pt = [(from[0] + hand[0]) / 2, Math.min(from[1], hand[1]) - b.box.h * 0.22];
        const N = 28, w = b.box.h * 0.05;
        const pts = Array.from({ length: N + 1 }, (_, i) => {
          const t = i / N, u = 1 - t;
          return [u * u * from[0] + 2 * u * t * ctl[0] + t * t * hand[0], u * u * from[1] + 2 * u * t * ctl[1] + t * t * hand[1]] as Pt;
        });
        const band = (k: number) => {
          const l: string[] = [], r: string[] = [];
          pts.forEach((c, i) => {
            const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(N, i + 1)];
            const d = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1;
            const nx = -(p1[1] - p0[1]) / d, ny = (p1[0] - p0[0]) / d;
            const ww = w * k * (0.25 + 0.75 * (i / N));
            l.push(`${i ? "L" : "M"}${c[0] + nx * ww} ${c[1] + ny * ww}`);
            r.unshift(`L${c[0] - nx * ww} ${c[1] - ny * ww}`);
          });
          return `${l.join(" ")} ${r.join(" ")} Z`;
        };
        return (
          <svg key={usurpTrail.key} className="shockwave usurp-trail-layer" aria-hidden="true">
            <g className="usurp-trail">
              <path d={band(1)} className="fig-trail-flame-outer" />
              <path d={band(0.44)} className="fig-trail-flame-core" />
            </g>
          </svg>
        );
      })()}
      {ignite && igniter && (() => {
        const t = igniteT;
        const [hx, hy] = toScreen(igniter.box, WARDEN_POSES["wd-idle"].freeArm.hand, igniter.f.view === "front");
        const drawn = sources.filter(src => t >= src.draw).length / Math.max(1, sources.length);
        const flame = (key: string, at: Pt, sz: number, cls = "") => (
          <svg key={key} className={`scene-lone-flame ${cls}`} style={{ left: at[0] - sz / 2, top: at[1] - sz * 0.8, width: sz, height: sz }} viewBox="-10 -16 20 20" aria-hidden="true">
            <circle cx={0} cy={-3} r={9} className="fig-glow" />
            <g className="fig-flame">
              <path d="M0 -12 C4.6 -5 4.4 0 0 0 C-4.4 0 -4.6 -5 0 -12 Z" />
              <path d="M0 -6 C2 -2.4 2 0 0 0 C-2 0 -2 -2.4 0 -6 Z" className="fig-flame-core" />
            </g>
          </svg>
        );
        return (
          <>
            {/* Flames kindling in the dark. */}
            {t < IGNITE.flare && sources.filter(src => src.seen && t >= src.kindle && t < src.draw).map(src => flame(`src-${src.id}`, src.at, igniter.box.h * 0.1, "is-kindling"))}
            {/* Each one streaming into his hand, arching up as it comes. */}
            <svg className="shockwave usurp-trail-layer" aria-hidden="true">
              {sources.filter(src => t >= src.draw && t < src.draw + 700).map(src => {
                const ctl: Pt = [(src.at[0] + hx) / 2, Math.min(src.at[1], hy) - igniter.box.h * 0.35];
                const d = `M${src.at[0]} ${src.at[1]} Q${ctl[0]} ${ctl[1]} ${hx} ${hy}`;
                return (
                  <g key={`trail-${src.id}`} className="ignite-trail">
                    <path d={d} className="ignite-trail-outer" />
                    <path d={d} className="ignite-trail-core" />
                  </g>
                );
              })}
            </svg>
            {/* His flame, growing as they pour in. */}
            {t >= IGNITE.draw && t < IGNITE.flare + 300 && flame("hand", [hx, hy], igniter.box.h * (0.1 + 0.3 * drawn), "is-gathering")}
            {/* Then it flares, and a ring of fire rolls out from him. */}
            {t >= IGNITE.flare && (
              <>
                <div key={`flare-${ignite.seed}`} className="blast-flash ignite-flare" style={{ left: hx, top: hy, width: igniter.box.h * 1.4, height: igniter.box.h * 1.4 }}>
                  <svg viewBox="-50 -50 100 100" className="shockwave-svg">
                    <circle cx={0} cy={0} r={48} className="fig-burst-outer" />
                    <circle cx={-6} cy={4} r={34} className="blast-mid" />
                    <circle cx={-10} cy={6} r={20} className="fig-burst-inner" />
                  </svg>
                </div>
                {posNow(ignite.who) && <Shockwave key={`ring-${ignite.seed}`} center={posNow(ignite.who)!} reach={16} toward={0} flame={0.9} proj={proj} full />}
              </>
            )}
          </>
        );
      })()}
      {projectiles.map(pr => {
        const thrower = placed.find(x => x.f.id === pr.from);
        const a = thrower?.box;
        const b = placed.find(x => x.f.id === pr.to)?.box;
        if (!a || !b) return null;
        // From the thrower's chest height to the target's, and on through it.
        const sx = a.x + a.w / 2, sy = a.y + a.h * 0.42;
        const tx = b.x + b.w / 2, ty = b.y + b.h * 0.45;
        const dx = tx - sx, dy = ty - sy;
        // Past the target it keeps coming, toward the camera: further along, and down the screen.
        const ex = dx * 1.35, ey = dy + b.h * 0.35;
        const size = Math.max(a.h, b.h) * (pr.kind === "wax" ? 0.12 : pr.kind === "fan" ? 1.1 : 0.45);
        const flight = (Math.atan2(dy, dx) * 180) / Math.PI;
        const angle = pr.kind === "fan" ? 0 : flight; // the fan's lean is drawn into its shape
        if (pr.kind === "impact") {
          // A melee blow into the ground: no fire, just a small white ring kicked out flat across
          // the floor from the fist.
          const o = pr.origin;
          const ox = o ? (thrower!.f.view === "front" ? 100 - o[0] : o[0]) / 100 : 0.5;
          const ax = a.x + a.w * ox, ay = o ? a.y + (a.h * o[1]) / 120 : a.y + a.h * 0.95;
          return (
            <div key={pr.key}>
              {!pr.fiery && <ImpactRing cx={ax} cy={ay} reach={a.h * 0.4} />}
              {(() => {
                const A = posNow(pr.from), B = posNow(pr.to);
                if (!A || !B) return null;
                const at = floorAt(A, ax);
                // A flaming flail's burns, like a small Flame Blast.
                return pr.fiery
                  ? <Shockwave center={at} reach={1.8} toward={Math.atan2(B.z - at.z, B.x - at.x)} flame={1} proj={proj} />
                  : <Shockwave center={at} reach={1.5} toward={Math.atan2(B.z - at.z, B.x - at.x)} flame={0.8} proj={proj} impact />;
              })()}
            </div>
          );
        }
        if (pr.kind === "blast") {
          // A giant fireball flashes in before him and fades fast; a shockwave of flame follows
          // through, spreading flat across the floor from his feet. Seen at the same 3/4 angle
          // as the fan, it's a ring, but only burns on the side heading for the target: tall
          // flames there, dying away around the sides, nothing behind him and nothing inside.
          // It all comes from his fist striking the ground (or his feet, without one).
          const o = pr.origin;
          const ox = o ? (thrower!.f.view === "front" ? 100 - o[0] : o[0]) / 100 : 0.5;
          const ax = a.x + a.w * ox, ay = o ? a.y + (a.h * o[1]) / 120 : a.y + a.h * 0.95;
          const bx = tx;
          const fx = o ? ax : ax + (bx - ax) * 0.2, fy = o ? ay - a.h * 0.12 : (a.y + a.h * 0.45) + (ty - (a.y + a.h * 0.45)) * 0.2;
          const ball = a.h * 0.9;
          return (
            <div key={pr.key}>
              <div className="blast-flash" style={{ left: fx, top: fy, width: ball, height: ball }}>
                <svg viewBox="-50 -50 100 100" className="shockwave-svg">
                  <circle cx={0} cy={0} r={48} className="fig-burst-outer" />
                  <circle cx={-6} cy={4} r={34} className="blast-mid" />
                  <circle cx={-10} cy={6} r={20} className="fig-burst-inner" />
                </svg>
              </div>
              {(() => {
                const A = posNow(pr.from), B = posNow(pr.to);
                if (!A || !B) return null;
                const at = floorAt(A, ax);
                // It passes on through the target.
                return <Shockwave center={at} reach={Math.hypot(B.x - at.x, B.z - at.z) * 1.25} toward={Math.atan2(B.z - at.z, B.x - at.x)} flame={1.4} proj={proj} />;
              })()}
            </div>
          );
        }
        return (
          <div
            key={pr.key}
            className={`projectile projectile-${pr.kind}`}
            style={{
              left: sx, top: sy, width: size, height: pr.kind === "fan" ? size * 0.32 : size,
              ["--dx" as string]: `${dx}px`, ["--dy" as string]: `${dy}px`,
              ["--ex" as string]: `${ex}px`, ["--ey" as string]: `${ey}px`, ["--rot" as string]: `${angle}deg`,
            }}
          >
            <ProjectileShape kind={pr.kind} />
          </div>
        );
      })}
    </div>
  );
}

/** Faint lines on the floor, drawn in perspective, so the ground visibly moves when the camera does. */
function FloorGrid({ cam, w, h }: { cam: Cam; w: number; h: number }) {
  const SPACING = 2;
  const RANGE = 40;
  // Snap the grid to whole cells around the camera, so lines stay put in the world as it moves.
  const ox = Math.round(cam.x / SPACING) * SPACING;
  const oz = Math.round(cam.z / SPACING) * SPACING;
  const segment = (a: Vec, b: Vec) => {
    let A = toCamera(cam, a);
    let B = toCamera(cam, b);
    if (A.v < NEAR && B.v < NEAR) return null;
    // Clip the part behind the camera.
    if (A.v < NEAR) A = { u: A.u + ((B.u - A.u) * (NEAR - A.v)) / (B.v - A.v), v: NEAR };
    if (B.v < NEAR) B = { u: B.u + ((A.u - B.u) * (NEAR - B.v)) / (A.v - B.v), v: NEAR };
    const p = screenOf(A.u, A.v, w, h);
    const q = screenOf(B.u, B.v, w, h);
    return `M${p.sx} ${p.sy}L${q.sx} ${q.sy}`;
  };
  const paths: string[] = [];
  for (let i = -RANGE; i <= RANGE; i += SPACING) {
    const s1 = segment({ x: ox + i, z: oz - RANGE }, { x: ox + i, z: oz + RANGE });
    const s2 = segment({ x: ox - RANGE, z: oz + i }, { x: ox + RANGE, z: oz + i });
    if (s1) paths.push(s1);
    if (s2) paths.push(s2);
  }
  return (
    <svg className="scene-grid" width={w} height={h} aria-hidden="true">
      <path d={paths.join("")} />
    </svg>
  );
}
