/**
 * trails.tsx — the Warden's trails: the flail's spins and blows, the punch, the swat and the rewaxing.
 */
import { useState } from "react";
import type { Pt } from "../render/geom";
import { FlailHead } from "./parts";
import { add, lerp } from "../render/geom";
import { flailOf, GROUND, sweepAt, WARDEN_POSES, type WardenSkeleton } from "./skeleton";

/**
 * The trails of the spins just finished: three of them, one after the other, each a tapered
 * crescent (thickest at its end, fading) with a flash of chain and head out to where it ends.
 * The first swings wide around his shoulder and always ends up and away from him; the second
 * circles the end of the handle; the third circles where the flail keeps spinning in his next
 * pose. Drawn first, so the warden covers them.
 */
export function SpinTrail({ s, shoulder, layer = "back" }: { s: WardenSkeleton; shoulder: Pt; layer?: "back" | "front" }) {
  // Whether the first spin was Flail Swing's blow, fixed when the trails appear (he may already
  // have moved on to his next pose while they fade).
  const [swing] = useState(() => !!(s.swingTrail || s.risingTrail));
  // Rising Flail: the spins after the blow whirl level over his head, not upright behind him.
  const [flat] = useState(() => !!s.risingTrail);
  const [first] = useState(() => s);
  // Where it spins is fixed when the trails appear, so they stay put if he moves on to his next
  // pose while they're still fading.
  const [{ tip, last, r, arm }] = useState(() => {
    const f = flailOf(s);
    // The last spin is already where he'll keep spinning it in his next pose.
    const next = s.trailEndsAt ? flailOf(WARDEN_POSES[s.trailEndsAt]).tip : f.tip;
    return { tip: f.tip, last: next, r: Math.hypot(f.ball[0] - f.tip[0], f.ball[1] - f.tip[1]), arm: shoulder };
  });
  // Seen at an angle, the upright circle behind him is squeezed sideways.
  const SQUEEZE = 0.75;
  const [sx, sy] = flat ? [1, 0.3] : [SQUEEZE, 1];
  const at = (c: Pt, radius: number, a: number): Pt => [c[0] + Math.cos(a) * radius * sx, c[1] + Math.sin(a) * radius * sy];
  // The first spin always ends with the head up and away from him; each after it ends about half
  // a turn on from the last. Each covers three quarters of the circle.
  const FIRST = Math.atan2(-0.8, -0.6); // up and back
  const [spins] = useState(() => {
    let end = FIRST;
    return [0, 1, 2].map(i => {
      if (i) end += Math.PI + (Math.random() - 0.5) * 0.6;
      return { end, sweep: (270 * Math.PI) / 180 };
    });
  });
  const trail = (c: Pt, radius: number, end: number, sweep: number) => {
    const outer: string[] = [], inner: string[] = [];
    for (let i = 0; i <= 24; i++) {
      const k = i / 24;
      const a = end + sweep * (1 - k); // it comes round this way
      const thick = (0.22 * r * k) / radius; // thin where it starts, thick at its end
      const o = at(c, radius, a), n = at(c, radius * (1 - thick), a);
      outer.push(`${i ? "L" : "M"}${o[0]} ${o[1]}`);
      inner.unshift(`L${n[0]} ${n[1]}`);
    }
    return `${outer.join(" ")} ${inner.join(" ")} Z`;
  };
  return (
    <g>
      {spins.map(({ end, sweep }, i) => {
        // Flail Swing: the first spin is the blow itself, a flat sweep across his front (drawn
        // over him); the rest spin on behind him as usual.
        const swingArc = swing && i === 0;
        // Flail Swing's blow is drawn over him; Rising Flail's goes behind his cloak.
        const overHim = swingArc && !first.risingTrail;
        if ((layer === "front") !== overHim) return null;
        if (swingArc) return first.risingTrail ? <RisingArc key={i} s={first} r={r} tip={tip} /> : <SwingArc key={i} s={first} tip={tip} />;
        const c = i === spins.length - 1 ? last : tip;
        const head = at(c, r, end);
        // The first spin's trail swings around his shoulder, the whole arm in it: a wider circle
        // through the same end point, as if winding up from further out.
        let ring = { c, radius: r, end };
        if (i === 0) {
          const dx = (head[0] - arm[0]) / sx, dy = (head[1] - arm[1]) / sy;
          ring = { c: arm, radius: Math.hypot(dx, dy), end: Math.atan2(dy, dx) };
        }
        // One every 0.15 s: each trail lasts 0.3 s, its chain and head only 0.15 s. The third
        // appears just as he switches to his next pose (REST_POSE_MS in App.tsx, 0.3 s).
        const delay = { animationDelay: `${i * 0.15}s`, animationDuration: "0.3s" };
        const chainDelay = { animationDelay: `${i * 0.15}s`, animationDuration: "0.15s" };
        const [hx, hy] = head;
        return (
          <g key={i}>
            {/* With the 2nd spin, the whole circle flashes as a ring, gone by the pose change. */}
            {i === 1 && (
              <ellipse cx={c[0]} cy={c[1]} rx={r * sx} ry={r * sy} className="fig-ring-flash" style={{ animationDelay: "0.15s", animationDuration: "0.15s" }} />
            )}
            <path d={trail(ring.c, ring.radius, ring.end, sweep)} className="fig-trail-seq" style={delay} />
            {/* The chain and the flail's head at the end of the trail, flickering in together. */}
            <g className="fig-chain-seq" style={chainDelay}>
              <line x1={c[0]} y1={c[1]} x2={hx} y2={hy} className="fig-chain" />
              <FlailHead at={[hx, hy]} />
            </g>
          </g>
        );
      })}
    </g>
  );
}

/**
 * The candle fist's swing trail: a flame-coloured streak running almost straight from where the
 * fist was drawn back (up behind him) down to where it struck, bowing slightly in toward his
 * shoulder, thickest at the fist.
 */
export function PunchTrail({ s, shoulder }: { s: WardenSkeleton; shoulder: Pt }) {
  const hand = s.freeArm.hand;
  const R = Math.hypot(hand[0] - shoulder[0], hand[1] - shoulder[1]);
  const a1 = Math.atan2(hand[1] - shoulder[1], hand[0] - shoulder[0]);
  const a0 = a1 - (190 * Math.PI) / 180;
  const from: Pt = [shoulder[0] + Math.cos(a0) * (R + 2), shoulder[1] + Math.sin(a0) * (R + 2)];
  const len = Math.hypot(hand[0] - from[0], hand[1] - from[1]) || 1;
  let n: Pt = [-(hand[1] - from[1]) / len, (hand[0] - from[0]) / len];
  // bow away from him, out past the shoulder
  const mid = lerp(from, hand, 0.5);
  if (n[0] * (shoulder[0] - mid[0]) + n[1] * (shoulder[1] - mid[1]) > 0) n = [-n[0], -n[1]];
  return <FlameTrail wax={s.punchTrail === "wax"} at={t => add(lerp(from, hand, t), n, Math.sin(Math.PI * t) * len * 0.07)} />;
}

/**
 * A fading streak of flame along a path (t from 0 at its tail to 1 at the hand), thin at the tail
 * and widest at the hand, in the candle flame's colours.
 */
export function FlameTrail({ at, width = 5, wax }: { at: (t: number) => Pt; width?: number; wax?: boolean }) {
  const N = 24;
  const pts = Array.from({ length: N + 1 }, (_, i) => at(i / N));
  const band = (wmax: number) => {
    const l: string[] = [], r: string[] = [];
    pts.forEach((c, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N, i + 1)];
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const nrm: Pt = [-(b[1] - a[1]) / d, (b[0] - a[0]) / d];
      const w = wmax * (i / N);
      const p = add(c, nrm, w), q = add(c, nrm, -w);
      l.push(`${i ? "L" : "M"}${p[0]} ${p[1]}`);
      r.unshift(`L${q[0]} ${q[1]}`);
    });
    return `${l.join(" ")} ${r.join(" ")} Z`;
  };
  return (
    <g className="fig-trail-flame">
      <path d={band(width)} className={wax ? "fig-trail-wax-outer" : "fig-trail-flame-outer"} />
      <path d={band(width * 0.44)} className={wax ? "fig-trail-wax-core" : "fig-trail-flame-core"} />
    </g>
  );
}

/**
 * Flail Slam's trail: the flail's head brought down from where it whirled overhead, over in a
 * high arc and down onto the floor before him; thin where it starts, widest where it lands.
 */
export function SlamTrail({ s }: { s: WardenSkeleton }) {
  const { ball } = flailOf(s);
  const from: Pt = [s.head[0] - 20, s.head[1] - 46];
  const ctl: Pt = [ball[0] + 18, s.head[1] - 60];
  const at = (t: number): Pt => {
    const u = 1 - t;
    return [u * u * from[0] + 2 * u * t * ctl[0] + t * t * ball[0], u * u * from[1] + 2 * u * t * ctl[1] + t * t * ball[1]];
  };
  const N = 28;
  const pts = Array.from({ length: N + 1 }, (_, i) => at(i / N));
  const l: string[] = [], r: string[] = [];
  pts.forEach((c, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N, i + 1)];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nrm: Pt = [-(b[1] - a[1]) / d, (b[0] - a[0]) / d];
    const w = 7 * (i / N);
    const p = add(c, nrm, w), q = add(c, nrm, -w);
    l.push(`${i ? "L" : "M"}${p[0]} ${p[1]}`);
    r.unshift(`L${q[0]} ${q[1]}`);
  });
  return <path d={`${l.join(" ")} ${r.join(" ")} Z`} className="fig-trail" />;
}

/**
 * Flail Swing's blow: the flail's first spin, one wide ellipse drawn over him. It starts low
 * behind him (about where the head hung in Flail Clutched), swoops down almost to the floor, out
 * past you, up over him and round to up and away behind him; thin where it starts, thickest where
 * the head is, with the chain (from the handle) and head flickering in at its end. Timed like the
 * first of the spin trails.
 */
function SwingArc({ s, tip }: { s: WardenSkeleton; tip: Pt }) {
  // Centered on his middle, reaching from just above the floor to above his head.
  const cx = (s.neck[0] + s.hip[0]) / 2 + 3;
  const bottom = GROUND - 2, top = s.head[1] - 12;
  const cy = (bottom + top) / 2, ry = (bottom - top) / 2, rx = ry * 1.15;
  const A0 = Math.PI - 0.12; // low behind him
  const A1 = -Math.PI + 0.6; // up and away behind him, after going all the way round the front
  const at = (a: number, k = 1): Pt => [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k];
  const outer: string[] = [], inner: string[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const a = A0 + (A1 - A0) * t;
    const o = at(a), n = at(a, 1 - 0.18 * t); // thin where it starts, thick at the head
    outer.push(`${i ? "L" : "M"}${o[0]} ${o[1]}`);
    inner.unshift(`L${n[0]} ${n[1]}`);
  }
  const [hx, hy] = at(A1, 0.91);
  const delay = { animationDelay: "0s", animationDuration: "0.3s" };
  return (
    <g>
      <path d={`${outer.join(" ")} ${inner.join(" ")} Z`} className="fig-trail-seq" style={delay} />
      <g className="fig-chain-seq" style={{ animationDelay: "0s", animationDuration: "0.15s" }}>
        <line x1={tip[0]} y1={tip[1]} x2={hx} y2={hy} className="fig-chain" />
        <FlailHead at={[hx, hy]} />
      </g>
    </g>
  );
}

/**
 * Rising Flail's blow: the flail swung up from below, an upright ellipse behind his cloak, from low
 * behind him, under and up through you, to high over his head; thin where it starts, thickest
 * where the head is, with the chain (from the handle) and head flickering in at its end. Timed
 * like the first of the spin trails; the spins after it whirl level over his head.
 */
function RisingArc({ s, r, tip }: { s: WardenSkeleton; r: number; tip: Pt }) {
  const [cx, cy] = s.neck;
  const rx = r * 1.15, ry = r * 1.35;
  const A0 = (3 * Math.PI) / 4; // low behind him
  const A1 = -Math.PI / 2 - 0.35; // high over his head, just past the top
  const at = (a: number, k = 1): Pt => [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k];
  const outer: string[] = [], inner: string[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const a = A0 + (A1 - A0) * t;
    const o = at(a), n = at(a, 1 - 0.18 * t);
    outer.push(`${i ? "L" : "M"}${o[0]} ${o[1]}`);
    inner.unshift(`L${n[0]} ${n[1]}`);
  }
  const [hx, hy] = at(A1, 0.91);
  return (
    <g>
      <path d={`${outer.join(" ")} ${inner.join(" ")} Z`} className="fig-trail-seq" style={{ animationDelay: "0s", animationDuration: "0.3s" }} />
      <g className="fig-chain-seq" style={{ animationDelay: "0s", animationDuration: "0.15s" }}>
        <line x1={tip[0]} y1={tip[1]} x2={hx} y2={hy} className="fig-chain" />
        <FlailHead at={[hx, hy]} />
      </g>
    </g>
  );
}

/**
 * Clutch Arm's trail, drawn on the pose he moves on to: a wide wax sweep from where the head was
 * (in his fist), through his candle hand now, to where the head hangs now.
 */
export function RewaxTrail({ from, s, fire }: { from: WardenSkeleton; s: WardenSkeleton; fire?: boolean }) {
  const [{ a, m, c }] = useState(() => ({
    a: add(from.freeArm.hand, [0, 6]),
    m: s.freeArm.hand,
    c: flailOf(s).ball,
  }));
  // A curve through all three: the control point that puts his hand right at its middle.
  const ctl: Pt = [2 * m[0] - 0.5 * (a[0] + c[0]), 2 * m[1] - 0.5 * (a[1] + c[1])];
  const at = (t: number): Pt => {
    const u = 1 - t;
    return [u * u * a[0] + 2 * u * t * ctl[0] + t * t * c[0], u * u * a[1] + 2 * u * t * ctl[1] + t * t * c[1]];
  };
  return <FlameTrail wax={!fire} width={8} at={at} />;
}

/** Fire poured from the candle hand: a fan of tongues, or one long blast. */
export function Burst({ s, kind }: { s: WardenSkeleton; kind: "fan" | "blast" }) {
  const [x, y] = s.freeArm.hand;
  if (kind === "blast") {
    // The flare at the palm as the fireball leaves it: a burst of tongues around the hand.
    const rays = [0, 45, 90, 135, 180, 225, 270, 315].map(a => {
      const r = (a * Math.PI) / 180;
      const len = a % 90 === 0 ? 12 : 8;
      const tip: Pt = [x + Math.cos(r) * len, y + Math.sin(r) * len];
      const l: Pt = [x + Math.cos(r + 0.35) * 4, y + Math.sin(r + 0.35) * 4];
      const rr: Pt = [x + Math.cos(r - 0.35) * 4, y + Math.sin(r - 0.35) * 4];
      return `M${l[0]} ${l[1]} L${tip[0]} ${tip[1]} L${rr[0]} ${rr[1]} Z`;
    });
    return (
      <g className="fig-burst">
        {rays.map((d, i) => <path key={i} d={d} className="fig-burst-outer" />)}
        <circle cx={x} cy={y} r={6.5} className="fig-burst-outer" />
        <circle cx={x} cy={y} r={4} className="fig-burst-inner" />
      </g>
    );
  }
  // The swat's trail: a fading sweep of flame around his side, from in front of him out to the
  // hand, dipping toward you as it passes (seen at an angle, a level circle looks like this).
  // Fades out like the punch trail, widest at the hand.
  return <FlameTrail width={6} at={sweepAt(s)} />;
}
