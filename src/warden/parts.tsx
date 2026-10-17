/**
 * parts.tsx — the Warden's parts: cloak, hood, beard, flame, flail and candle arm.
 */
import { type ReactNode, useContext, useEffect, useId, useState } from "react";
import { add, lerp, limb, type Pt } from "../render/geom";
import { type CandleArm, fanSweep, FlailFire, flailOf, frontSide, HEM_Y, ripArmpit, ripSide, type WardenSkeleton } from "./skeleton";

/** A teardrop flame standing on (x, y), `s` times the base size. */
function Flame({ at, s = 1, className = "" }: { at: Pt; s?: number; className?: string }) {
  const [x, y] = at;
  const h = 11 * s, w = 4.2 * s;
  return (
    <g className={`fig-flame ${className}`}>
      <path d={`M${x} ${y - h} C${x + w * 1.1} ${y - h * 0.45} ${x + w} ${y} ${x} ${y} C${x - w} ${y} ${x - w * 1.1} ${y - h * 0.45} ${x} ${y - h} Z`} />
      <path
        d={`M${x} ${y - h * 0.5} C${x + w * 0.45} ${y - h * 0.2} ${x + w * 0.45} ${y} ${x} ${y} C${x - w * 0.45} ${y} ${x - w * 0.45} ${y - h * 0.2} ${x} ${y - h * 0.5} Z`}
        className="fig-flame-core"
      />
    </g>
  );
}

/**
 * The cloak: from the shoulders all the way to the ground, its hem dirtied with wax. It is torn
 * along his waxed side: sealed shut with wax from the armpit to the hip, then failing, gaping
 * open down to the ground. Only that leg (his left, the near one) shows through.
 */
export function Cloak({ s }: { s: WardenSkeleton }) {
  const clipId = `rip${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [nx, ny] = s.neck;
  const [hx, hy] = s.hip;
  const len = Math.hypot(hx - nx, hy - ny) || 1;
  const n: Pt = [-(hy - ny) / len, (hx - nx) / len]; // across the body
  const shA = add([nx, ny + 2], n, 7), shB = add([nx, ny + 2], n, -7);
  const waA = add([hx, hy], n, 10), waB = add([hx, hy], n, -10);
  // Turned the other way (flail shoulder toward you), the ripped side faces away: no rip to see,
  // but his left leg can stick out past the cloak's edge, behind it.
  const away = (s.turn ?? 0) <= -0.5;
  const xs = away
    ? [s.leadLeg.knee[0], s.leadLeg.foot[0], hx]
    : [s.leadLeg.knee[0], s.leadLeg.foot[0], s.rearLeg.knee[0], s.rearLeg.foot[0], hx];
  const hemF: Pt = [Math.max(...xs) + 6, HEM_Y], hemB: Pt = [Math.min(...xs) - 6, HEM_Y];
  // Keep the sides from crossing: the side of the body facing forward meets the front of the hem.
  const [waF, waBk, shF, shBk] = waA[0] >= waB[0] ? [waA, waB, shA, shB] : [waB, waA, shB, shA];
  // Over a raised knee the front runs flat along the top of the thigh, rounds the knee, then
  // drops to the ground; otherwise it falls straight from the waist.
  const kn = s.leadLeg.knee;
  const front = s.kneeUnderCloak
    ? [
        `L${hemF[0]} ${hemF[1]}`,
        `L${kn[0] + 5} ${kn[1] + 3}`,
        `Q${kn[0] + 5.5} ${kn[1] - 5} ${kn[0] - 1} ${kn[1] - 5}`,
        `L${waF[0]} ${Math.min(waF[1], kn[1] - 5)}`,
        `Q${waF[0] + 1} ${(waF[1] + shF[1]) / 2} ${shF[0]} ${shF[1]}`,
      ]
    : [`L${hemF[0]} ${hemF[1]}`, `Q${waF[0] + 3} ${waF[1]} ${shF[0]} ${shF[1]}`];
  const d = [
    `M${shBk[0]} ${shBk[1]}`,
    `Q${waBk[0] - 3} ${waBk[1]} ${hemB[0]} ${hemB[1]}`,
    ...front,
    "Z",
  ].join(" ");

  // His near leg is his left: from the front at 3/4 it's the one further back; turned sideways
  // (candle side toward you), the one stepping forward.
  const nearLeg = (s.turn ?? 0) >= 0.5 ? s.leadLeg : s.rearLeg;
  const { knee, foot } = nearLeg;
  // The rip runs down his waxed side. From the armpit to the hip it's sealed shut with wax; from
  // the hip down the wax is failing, and it gapes wider toward the ground.
  const side = ripSide(s);
  // Shoulders twisted further than the hips: the top of the seam twists round with the wax
  // shoulder, toward the edge of his body.
  const twist = s.shoulderTurn !== undefined ? (s.turn ?? 0) - s.shoulderTurn : 0;
  const armpit = add(ripArmpit(s), ripSide(s), twist * 5);
  // The leg hangs from the side of his hips, not from the middle of the stick.
  const hipJoint = add(s.hip, side, 5);
  const thigh: Pt = [knee[0] - hipJoint[0], knee[1] - hipJoint[1]];
  const tl = Math.hypot(thigh[0], thigh[1]) || 1;
  const across: Pt = [-thigh[1] / tl, thigh[0] / tl];
  const top = lerp(hipJoint, knee, 0.1);
  const seam = `M${armpit[0]} ${armpit[1]} Q${add(lerp(armpit, top, 0.5), side, 1.5).join(" ")} ${top[0]} ${top[1]}`;
  const stitches = [0.2, 0.45, 0.7, 0.92].map(t => lerp(armpit, top, t));
  const kneeA = add(knee, across, 4.5), kneeB = add(knee, across, -4.5);
  const footA: Pt = [Math.min(foot[0], knee[0]) - 6, HEM_Y], footB: Pt = [Math.max(foot[0], knee[0]) + 6, HEM_Y];
  const [kL, kR] = kneeA[0] <= kneeB[0] ? [kneeA, kneeB] : [kneeB, kneeA];
  const rimL = `M${top[0]} ${top[1]} Q${kL[0]} ${kL[1]} ${footA[0]} ${footA[1]}`;
  const rimR = `M${top[0]} ${top[1]} Q${kR[0]} ${kR[1]} ${footB[0]} ${footB[1]}`;
  const gap = `${rimL} L${footB[0]} ${footB[1]} Q${kR[0]} ${kR[1]} ${top[0]} ${top[1]} Z`;
  // The last strands of wax still bridging the rip: close together near the hip, giving out below.
  const strands = [0.12, 0.26, 0.45].map(t => {
    const l = lerp(lerp(top, kL, t), lerp(kL, footA, t), t);
    const r = lerp(lerp(top, kR, t), lerp(kR, footB, t), t);
    return { l, r };
  });
  if (away) {
    // The rip runs along the cloak's back edge now: wax lines it from the hip down to the ground.
    // With his back fully to you it's the other edge.
    const [eS, eW, eH, eOut] = s.backView ? [shF, waF, hemF, 3] : [shBk, waBk, hemB, -3];
    const q = (t: number): Pt => [
      (1 - t) ** 2 * eS[0] + 2 * t * (1 - t) * (eW[0] + eOut) + t ** 2 * eH[0],
      (1 - t) ** 2 * eS[1] + 2 * t * (1 - t) * eW[1] + t ** 2 * eH[1],
    ];
    const edge: Pt[] = [];
    for (let i = 0; i <= 20; i++) { const p = q(i / 20); if (p[1] >= hy - 2) edge.push(p); }
    return (
      <g>
        <polyline points={limb(hipJoint, knee, foot)} className="fig-limb fig-far" />
        <path d={d} className="fig-cloak" />
        <polyline points={limb(...edge)} className="fig-rip-wax" />
        <line x1={hemB[0]} y1={HEM_Y} x2={hemF[0]} y2={HEM_Y} className="fig-cloak-wax" />
      </g>
    );
  }
  return (
    <g>
      <path d={d} className="fig-cloak" />
      <path d={gap} className="fig-cloak-inside" />
      {/* The leg shows only through the rip: over the cloak's lining, under the cloak itself. */}
      <clipPath id={clipId}><path d={gap} /></clipPath>
      <polyline points={limb(hipJoint, knee, foot)} className="fig-limb" clipPath={`url(#${clipId})`} />
      <path d={rimL} className="fig-rip-wax" />
      <path d={rimR} className="fig-rip-wax" />
      <path d={seam} className="fig-seam" />
      <path d={seam} className="fig-seam-wax" />
      {stitches.map((p, i) => (
        <line key={`st${i}`} x1={p[0] - 2.2} y1={p[1] - 0.8} x2={p[0] + 2.2} y2={p[1] + 0.8} className="fig-rip-strand" />
      ))}
      {strands.map(({ l, r }, i) => (
        <path key={i} d={`M${l[0]} ${l[1]} Q${(l[0] + r[0]) / 2} ${(l[1] + r[1]) / 2 + 3} ${r[0]} ${r[1]}`} className="fig-rip-strand" />
      ))}
      {/* The wax-crusted hem, broken where the rip opens. */}
      <line x1={hemB[0]} y1={HEM_Y} x2={Math.max(hemB[0], footA[0])} y2={HEM_Y} className="fig-cloak-wax" />
      <line x1={Math.min(hemF[0], footB[0])} y1={HEM_Y} x2={hemF[0]} y2={HEM_Y} className="fig-cloak-wax" />
    </g>
  );
}

/**
 * The stain where wax from his beak has run down the front of his cloak for years: dull, wide and
 * streaked, under the fresh drool. Only seen while the cloak's front faces you.
 */
export function Stain({ s }: { s: WardenSkeleton }) {
  if ((s.turn ?? 0) >= 0.5 || s.backView) return null;
  const [nx, ny] = s.neck;
  const [hx, hy] = s.hip;
  const len = Math.hypot(hx - nx, hy - ny) || 1;
  let n: Pt = [-(hy - ny) / len, (hx - nx) / len];
  if (n[0] * frontSide(s) < 0) n = [-n[0], -n[1]]; // toward the front
  const along = (t: number, out: number) => add(lerp(s.neck, s.hip, t), n, out);
  const d = [
    `M${along(0.1, 2)[0]} ${along(0.1, 2)[1]}`,
    `Q${along(0.35, 1)[0]} ${along(0.35, 1)[1]} ${along(0.6, 2.5)[0]} ${along(0.6, 2.5)[1]}`,
    `Q${along(0.66, 4)[0]} ${along(0.66, 4)[1]} ${along(0.72, 5)[0]} ${along(0.72, 5)[1]}`,
    `Q${along(0.62, 6.5)[0]} ${along(0.62, 6.5)[1]} ${along(0.56, 7.5)[0]} ${along(0.56, 7.5)[1]}`,
    `Q${along(0.3, 8.5)[0]} ${along(0.3, 8.5)[1]} ${along(0.1, 8)[0]} ${along(0.1, 8)[1]}`,
    "Z",
  ].join(" ");
  const run = (t0: number, t1: number, out: number) =>
    `M${along(t0, out)[0]} ${along(t0, out)[1]} L${along(t1, out)[0]} ${along(t1, out)[1]}`;
  return (
    <g>
      <path d={d} className="fig-stain" />
      <path d={`${run(0.5, 0.86, 3.5)} ${run(0.55, 0.8, 6.5)}`} className="fig-stain-run" />
    </g>
  );
}

/** Wax that has run from under his beak down the front of his cloak, like a long beard. */
export function Beard({ s }: { s: WardenSkeleton }) {
  if (s.backView) return null;
  const [x, y] = s.head;
  // Looking back over his shoulder, everything about the face is mirrored.
  const f = s.faceBack ? -1 : 1;
  const t = (f * (s.tilt ?? 0) * Math.PI) / 180;
  const rot = (p: Pt): Pt => {
    const dx = p[0] - x, dy = p[1] - y;
    return [x + dx * Math.cos(t) - dy * Math.sin(t), y + dx * Math.sin(t) + dy * Math.cos(t)];
  };
  // It runs out of the hood's opening, from under the beak.
  const from = rot([x + f * (5.5 - 2.6 * (s.faceFront ?? 0)), y + 5]);
  const w = 3.2;
  // Turned sideways either way (his front out of sight, or swung around), or looking back, only
  // the bit hanging from the hood shows.
  if (Math.abs(s.turn ?? 0) >= 0.5 || s.faceBack) {
    const tipY = from[1] + 9;
    return (
      <g className="fig-beard">
        <path d={`M${from[0] - w} ${from[1]} Q${from[0] - 1.5} ${tipY - 3} ${from[0]} ${tipY} Q${from[0] + 1.5} ${tipY - 3} ${from[0] + w} ${from[1]} Z`} />
        <circle cx={from[0]} cy={tipY + 1.5} r={1.5} />
      </g>
    );
  }
  // Facing you: down along the front of the cloak, ending in a few drips.
  const [nx, ny] = s.neck;
  const [hx, hy] = s.hip;
  const len = Math.hypot(hx - nx, hy - ny) || 1;
  let n: Pt = [-(hy - ny) / len, (hx - nx) / len];
  if (n[0] * frontSide(s) < 0) n = [-n[0], -n[1]]; // toward the front
  const chest = add(lerp(s.neck, s.hip, 0.3), n, 4);
  const end = add(lerp(s.neck, s.hip, 0.62), n, 3);
  const d = [
    `M${from[0] - w} ${from[1]}`,
    `Q${chest[0] - w} ${chest[1]} ${end[0] - 1} ${end[1]}`,
    `Q${end[0]} ${end[1] + 3} ${end[0] + 1} ${end[1]}`,
    `Q${chest[0] + w} ${chest[1]} ${from[0] + w} ${from[1]}`,
    "Z",
  ].join(" ");
  const drip2 = add(lerp(s.neck, s.hip, 0.45), n, 6.5);
  return (
    <g className="fig-beard">
      <path d={d} />
      <path d={`M${from[0] + 2} ${from[1] + 2} Q${chest[0] + 4} ${chest[1]} ${drip2[0]} ${drip2[1]}`} className="fig-beard-strand" />
      <circle cx={end[0]} cy={end[1] + 1} r={1.8} />
      <circle cx={drip2[0]} cy={drip2[1] + 0.5} r={1.2} />
    </g>
  );
}

/** The hood, shadowed, with only the waxed beak of his mask poking out. */
export function Hood({ s }: { s: WardenSkeleton }) {
  const [x, y] = s.head;
  const k = s.faceFront ?? 0;
  const bx = x + 3 - 2.6 * k; // where the beak leaves the mask
  // The round of the hood and its point behind, one flat color with no outline. A raised chin
  // tilts only the mask inside, so the hood keeps its point.
  return (
    <g transform={s.faceBack ? `translate(${2 * x} 0) scale(-1 1)` : undefined}>
      <path d={`M${x - 3} ${y - 8} L${x - 12} ${y - 12} L${x - 9} ${y + 1} Z`} className="fig-hood" />
      {/* From behind, just the tip of the beak peeks out past the side of the hood. */}
      {s.backView && (
        <g transform={`${s.tilt ? `rotate(${s.tilt} ${x} ${y}) ` : ""}translate(-4 0)`}>
          <path d={`M${bx} ${y - 1.5} Q${bx + 9} ${y + 1} ${bx + 13} ${y + 9} Q${bx + 6} ${y + 6.5} ${bx} ${y + 5} Z`} className="fig-beak" />
        </g>
      )}
      <circle cx={x} cy={y} r={9.5} className="fig-hood" />
      {!s.backView && <g transform={s.tilt ? `rotate(${s.tilt} ${x} ${y})` : undefined}>
        <ellipse cx={x + 3.5 - 2.6 * k} cy={y + 1.5} rx={4.6 + k} ry={6} className="fig-hood-dark" />
        {/* The beak: wax, curving forward and down (shorter as it turns toward the camera). */}
        <path d={`M${bx} ${y - 1.5} Q${bx + 9 - 5 * k} ${y + 1 + k} ${bx + 13 - 8 * k} ${y + 9 + 3 * k} Q${bx + 6 - 3 * k} ${y + 6.5 + k} ${bx} ${y + 5} Z`} className="fig-beak" />
      </g>}
    </g>
  );
}

/** The flail's head: a lump of old wax, built up over years of drips, a few hanging off it. */
export function FlailHead({ at }: { at: Pt }) {
  const [x, y] = at;
  const fire = useContext(FlailFire);
  return (
    <g className="fig-flail-head">
      {fire && <circle cx={x} cy={y - 6} r={11} className="fig-glow" />}
      {/* Drips hanging from its underside. */}
      <path d={`M${x - 3.2} ${y + 4} q0.4 3.6 -0.3 5 q-0.9 0.9 -1.1 -0.4 q-0.2 -2.4 0.2 -4.4 Z`} className="fig-head-wax" />
      <path d={`M${x + 2.4} ${y + 4.6} q0.3 2.4 -0.2 3.4 q-0.8 0.7 -0.9 -0.3 q-0.1 -1.6 0.1 -3 Z`} className="fig-head-wax" />
      {/* The lumpy round of it. */}
      <path d={`M${x - 6.2} ${y + 0.4} C${x - 6.4} ${y - 4.4} ${x - 2.6} ${y - 6.6} ${x + 0.6} ${y - 6.2} C${x + 4.6} ${y - 5.8} ${x + 6.6} ${y - 2.6} ${x + 6.1} ${y + 1} C${x + 5.8} ${y + 4.6} ${x + 2.6} ${y + 6.4} ${x - 0.6} ${y + 6.1} C${x - 4} ${y + 5.8} ${x - 6} ${y + 3.8} ${x - 6.2} ${y + 0.4} Z`} className="fig-head-wax" />
      {/* Older, darker layers, and a shine. */}
      <path d={`M${x - 4.6} ${y + 2.4} q2.2 2.4 5.6 1.9 q2.2 -0.4 3.6 -2.2`} className="fig-head-layer" />
      <ellipse cx={x - 2} cy={y - 3} rx={1.8} ry={1.1} transform={`rotate(-30 ${x - 2} ${y - 3})`} className="fig-head-shine" />
      {/* Set alight: flames wrapping it. */}
      {fire && (
        <>
          <Flame at={[x - 3, y + 2]} s={0.9} className="fig-flame-b" />
          <Flame at={[x + 3, y + 2]} s={1} className="fig-flame-c" />
          <Flame at={[x, y + 3]} s={1.4} />
        </>
      )}
    </g>
  );
}

/** The flail's handle: iron, with splashes of wax caked along it. */
function FlailHandle({ from, to }: { from: Pt; to: Pt }) {
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
  const n: Pt = [-(to[1] - from[1]) / len, (to[0] - from[0]) / len];
  const blobs = [
    { t: 0.18, w: 2.2, l: 2.6, side: 0.6 },
    { t: 0.46, w: 1.8, l: 3.4, side: -0.5 },
    { t: 0.7, w: 2.4, l: 2.2, side: 0.4 },
    { t: 0.9, w: 1.6, l: 1.8, side: -0.3 },
  ];
  const ang = (Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI;
  return (
    <g>
      <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} className="fig-flail-handle" />
      {blobs.map(({ t, w, l, side }, i) => {
        const c = add(lerp(from, to, t), n, side);
        return (
          <g key={i}>
            <ellipse cx={c[0]} cy={c[1]} rx={l} ry={w} transform={`rotate(${ang} ${c[0]} ${c[1]})`} className="fig-handle-wax" />
            {/* A drip run down from it. */}
            {i % 2 === 0 && <line x1={c[0]} y1={c[1]} x2={c[0]} y2={c[1] + 2.6} className="fig-handle-drip" />}
          </g>
        );
      })}
    </g>
  );
}

/**
 * A flail spinning too fast to see: no clear head, just a faint ring where it travels and a few
 * copies of the chain, each with a smudge of a head, flashing at random spots around the ring.
 */
function ChainBlur({ tip, r, flat }: { tip: Pt; r: number; flat?: boolean }) {
  // Behind him it spins upright (squeezed sideways, seen at an angle); overhead it spins level
  // (squashed flat, seen from a little above).
  const [sx, sy] = flat ? [1, 0.3] : [0.75, 1];
  // 3 to 5 at a time, spread out: each in its own slice of the circle, nudged a little within it,
  // so no two are ever close.
  const pick = () => {
    const n = 3 + Math.floor(Math.random() * 3);
    const slice = (Math.PI * 2) / n, start = Math.random() * Math.PI * 2;
    return Array.from({ length: n }, (_, i) => start + slice * (i + (Math.random() - 0.5) * 0.4));
  };
  const [angles, setAngles] = useState<number[]>(() => [0, 1, 2, 3].map(i => (i / 4) * Math.PI * 2));
  useEffect(() => {
    const id = window.setInterval(() => setAngles(pick()), 110);
    return () => window.clearInterval(id);
  }, []);
  return (
    <g>
      {/* The chain's sweep, a faint disc, and the path the head travels, a faint ring. */}
      {/* The disc stops where the ring's band starts, so the band looks the same all the way across. */}
      <ellipse cx={tip[0]} cy={tip[1]} rx={r * sx - 4} ry={r * sy - 4} className="fig-spin-disc" />
      <ellipse cx={tip[0]} cy={tip[1]} rx={r * sx} ry={r * sy} className="fig-spin-path" />
      {angles.map((a, i) => {
        const end: Pt = [tip[0] + Math.cos(a) * r * sx, tip[1] + Math.sin(a) * r * sy];
        // The head smears along its path: stretched along the circle's tangent.
        const along = (Math.atan2(Math.cos(a) * r * sy, -Math.sin(a) * r * sx) * 180) / Math.PI;
        return (
          // Each chain and its head flicker together.
          <g key={i} className="fig-chain-blur" style={{ animationDelay: `${(i * 0.09) % 0.4}s` }}>
            <line x1={tip[0]} y1={tip[1]} x2={end[0]} y2={end[1]} className="fig-chain" />
            <ellipse cx={end[0]} cy={end[1]} rx={4.4} ry={2.6} transform={`rotate(${along} ${end[0]} ${end[1]})`} className="fig-censer-smudge" />
          </g>
        );
      })}
    </g>
  );
}

/** The flail: the handle held at its middle, the chain from its tip, the wax-filled censer at the end. */
export function Flail({ s }: { s: WardenSkeleton }) {
  const { tip, butt, ball, resting } = flailOf(s);
  const [bx, by] = ball;
  // The chain sags between the handle and the head; resting on the ground, it lies slack.
  const mid = lerp(tip, ball, 0.5);
  const sag: Pt = s.spin ? mid : resting ? [mid[0] + 3, by + 2] : add(mid, [0, 3]);
  // Just done spinning: the trails show where the head went (see SpinTrail); no head hangs yet.
  if (s.spinTrail || s.chainInHand || s.headInHand) return <FlailHandle from={butt} to={tip} />;
  if (s.spin) {
    return (
      <g>
        <ChainBlur tip={tip} r={Math.hypot(bx - tip[0], by - tip[1])} flat={s.spin === "over"} />
        <FlailHandle from={butt} to={tip} />
      </g>
    );
  }
  return (
    <g>
      <FlailHandle from={butt} to={tip} />
      <path d={`M${tip[0]} ${tip[1]} Q${sag[0]} ${sag[1]} ${bx} ${by}`} className="fig-chain" />
      <FlailHead at={[bx, by]} />
    </g>
  );
}

/** The candle arm, from the shoulder: wax and lit, wax and cold, or scorched black and burning. */
export function CandleArmEl({ s, shoulder, arm, part = "all" }: {
  s: WardenSkeleton;
  shoulder: Pt;
  arm: CandleArm;
  /** Draw only the arm, only its flame (or smoke), or both. */
  part?: "arm" | "fist" | "flame" | "all";
}) {
  const { elbow, hand } = s.freeArm;
  const pts = limb(shoulder, elbow, hand);
  const drip = (t: number, l: number) => {
    const p = lerp(elbow, hand, t);
    return <line x1={p[0]} y1={p[1] + 2} x2={p[0]} y2={p[1] + 2 + l} className="fig-arm-drip" />;
  };
  const top = add(hand, [0, -3]);
  // The forearm swells toward the hand, thick with wax.
  const fl = Math.hypot(hand[0] - elbow[0], hand[1] - elbow[1]) || 1;
  const across: Pt = [-(hand[1] - elbow[1]) / fl, (hand[0] - elbow[0]) / fl];
  const forearm = [add(elbow, across, 3.5), add(hand, across, 5), add(hand, across, -5), add(elbow, across, -3.5)];
  const skin = arm === "scorched" ? "fig-hand-burnt" : "fig-hand-wax";
  const body = (
    <>
      <polyline points={limb(shoulder, elbow)} className={arm === "scorched" ? "fig-arm-burnt" : "fig-arm-wax"} />
      <polygon points={limb(...forearm)} className={skin} />
      <circle cx={elbow[0]} cy={elbow[1]} r={3.5} className={skin} />
      {arm === "scorched" && <polyline points={pts} className="fig-arm-embers" />}
      <circle cx={hand[0]} cy={hand[1]} r={5.4} className={skin} />
      {arm !== "scorched" && <>{drip(0.3, 3)}{drip(0.7, 4)}</>}
    </>
  );
  if (part === "arm") return <g>{body}</g>;
  if (part === "fist") return <circle cx={hand[0]} cy={hand[1]} r={5.4} className={skin} />;
  // Mid-swat (Fan Flames) the flame isn't put out: it's blown flat, streaming back the way the hand
  // came (toward his body), smudged by the speed.
  const fanning = s.burst === "fan";
  const inFlight = (flame: ReactNode) => {
    if (!fanning) return flame;
    // Swept straight back along the trail, at the angle the trail meets the hand.
    const { mid } = fanSweep(s);
    const back: Pt = [mid[0] - hand[0], mid[1] - hand[1]];
    const deg = (Math.atan2(back[1], back[0]) * 180) / Math.PI + 90; // the flame points up (-y)
    return (
      <g className="fig-flame-smudge" transform={`rotate(${deg} ${hand[0]} ${hand[1]}) translate(${hand[0]} ${hand[1]}) scale(1.1 1.7) translate(${-hand[0]} ${-hand[1]})`}>
        {flame}
      </g>
    );
  };
  return (
    <g>
      {part === "all" && body}
      {arm === "lit" && (!s.burst || fanning) && inFlight(
        <>
          <circle cx={hand[0]} cy={hand[1] - 7} r={9} className="fig-glow" />
          <Flame at={top} s={0.8} />
        </>,
      )}
      {arm === "out" && (
        <>
          <path d={`M${top[0]} ${top[1]} q-3 -5 0 -9 q3 -4 -1 -9`} className="fig-smoke" />
        </>
      )}
      {arm === "scorched" && (!s.burst || fanning) && inFlight(
        <>
          <circle cx={hand[0]} cy={hand[1] - 6} r={13} className="fig-glow" />
          <Flame at={add(hand, [-3, 3])} s={1.1} className="fig-flame-b" />
          <Flame at={add(hand, [3, 3])} s={1.2} />
          <Flame at={add(hand, [0, 4])} s={1.6} className="fig-flame-c" />
        </>,
      )}
    </g>
  );
}

/** The chain held in the candle hand: sagging from the handle's tip to the hand, the head hanging
 *  just below the fist. */
export function ChainInHand({ s, part = "all" }: { s: WardenSkeleton; part?: "chain" | "head" | "all" }) {
  const { tip } = flailOf(s);
  const hand = s.freeArm.hand;
  const mid = add(lerp(tip, hand, 0.5), [0, s.chainTaut ? 0 : 4]);
  // Tucked behind the arm, it hangs only a little below the fist, partly hidden.
  const bx = hand[0], by = hand[1] + (s.headBehindArm ? 16 : 12);
  return (
    <g>
      {part !== "head" && <path d={`M${tip[0]} ${tip[1]} Q${mid[0]} ${mid[1]} ${hand[0]} ${hand[1]}`} className="fig-chain" />}
      {part !== "chain" && <HangingHead hand={hand} bx={bx} by={by} />}
    </g>
  );
}

function HangingHead({ hand, bx, by }: { hand: Pt; bx: number; by: number }) {
  return (
    <g>
      <line x1={hand[0]} y1={hand[1]} x2={bx} y2={by} className="fig-chain" />
      <FlailHead at={[bx, by]} />
    </g>
  );
}

/** The flail's head gripped in the candle hand, the chain pulled taut up to it from the handle. */
export function HeadInHand({ s }: { s: WardenSkeleton }) {
  const { tip } = flailOf(s);
  const [bx, by] = add(s.freeArm.hand, [0, 6]); // gripped from above
  return (
    <g>
      <line x1={tip[0]} y1={tip[1]} x2={bx} y2={by} className="fig-chain" />
      <FlailHead at={[bx, by]} />
    </g>
  );
}

/**
 * A puff of smoke leaving the candle hand as its flame is put out: a few wisps curling up and
 * away. `ago` is how long ago it went out (ms), so it carries on smoothly if redrawn.
 */
export function SmokePuff({ at, ago }: { at: Pt; ago: number }) {
  const [x, y] = at;
  const wisps = [
    `M${x} ${y} q-4 -6 0 -11 q4 -5 -1 -11`,
    `M${x - 2} ${y + 1} q-6 -4 -5 -10 q1 -6 -5 -9`,
    `M${x + 2} ${y + 1} q5 -5 3 -10 q-2 -5 4 -9`,
  ];
  return (
    <g className="fig-smoke-puff" style={{ animationDelay: `${-ago}ms` }}>
      <circle cx={x} cy={y - 2} r={4} className="fig-smoke-cloud" style={{ animationDelay: `${-ago}ms` }} />
      {wisps.map((d, i) => <path key={i} d={d} className="fig-smoke-wisp" style={{ animationDelay: `${-ago + i * 60}ms` }} />)}
    </g>
  );
}
