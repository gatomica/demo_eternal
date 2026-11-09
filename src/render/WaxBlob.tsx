/**
/**
 * WaxBlob.tsx — the heap of wax round the Wax Blob's three parts: plain wax, the colour of the three
 * figures, so they melt into it. It is drawn in two layers: a dome behind the figures and a front
 * mound in front, which swallows their legs, so the three kneelers seem to rise out of the wax. A few arms of more sleepers stick out of it, kept to its foot and far flanks. Both
 * are laid out from the boxes of the figures, so they follow them when the camera moves.
 */

/** What the layers are placed from: the screen box of each part (they move apart as parts lunge or dodge, and the heap stretches between them). */
export interface BlobBox {
  parts: { x: number; y: number; w: number; h: number }[];
  /** The body has fallen: the heap slumps. */
  slumped: boolean;
}

/** The heap's overall shape: it spans every part, from the lowest feet to the highest top. */
function shapeOf(b: BlobBox) {
  const feetOf = (p: BlobBox["parts"][number]) => p.y + p.h * 0.94;
  const tall = Math.max(...b.parts.map(p => p.h));
  const x0 = Math.min(...b.parts.map(p => p.x + p.w / 2 - p.w * 0.62));
  const x1 = Math.max(...b.parts.map(p => p.x + p.w / 2 + p.w * 0.62));
  const feet = Math.max(...b.parts.map(feetOf));
  // (Low: the parts kneel in it, drawn in 3D, and their chests, heads and arms rise out of it.)
  const top = Math.min(...b.parts.map(p => feetOf(p) - p.h * (b.slumped ? 0.22 : 0.34)));
  return { x0, W: x1 - x0, feet, top, tall };
}

/**
 * More sleepers inside the heap, their arms sticking out of it. Each is placed as fractions of the layer (where it leaves the
 * wax, which way it points in degrees with 0 to the right and 90 down, how long it is as a share of the figure's height, and
 * how much it bends), so it moves and stretches with the heap. They keep to the heap's foot and its far flanks, well clear of
 * where the three figures' heads and hands are.
 */
interface Limb { u: number; v: number; a: number; len: number; bend: number; delay: number }

/** In front of the figures, dragging along the floor at the foot of the heap. */
const FRONT_LIMBS: Limb[] = [
  { u: 0.13, v: 0.8, a: 118, len: 0.2, bend: 22, delay: 0 },
  { u: 0.37, v: 0.9, a: 76, len: 0.15, bend: -18, delay: -1.2 },
  { u: 0.63, v: 0.92, a: 102, len: 0.18, bend: 20, delay: -2.1 },
  { u: 0.88, v: 0.82, a: 62, len: 0.21, bend: -24, delay: -0.6 },
];

/** Behind the figures, lagging out of the dome's far flanks. */
const BACK_LIMBS: Limb[] = [
  { u: 0.12, v: 0.68, a: -165, len: 0.32, bend: 22, delay: -0.4 },
  { u: 0.88, v: 0.66, a: -15, len: 0.3, bend: -20, delay: -1.7 },
  { u: 0.01, v: 0.82, a: 172, len: 0.14, bend: -16, delay: -2.4 },
  { u: 0.99, v: 0.78, a: 8, len: 0.15, bend: 18, delay: -0.9 },
];

/** How much of its length an arm shows beyond the wax: the rest of it is inside the heap. */
const REACH = 0.62;

/** An arm: a thick curved stroke from inside the wax, left bare at the end (stick-figure style). */
function Arm({ limb, W, H, tall }: { limb: Limb; W: number; H: number; tall: number }) {
  const rad = (limb.a * Math.PI) / 180, dx = Math.cos(rad), dy = Math.sin(rad);
  const bx = W * limb.u, by = H * limb.v, len = tall * limb.len * REACH;
  const ex = bx + dx * len, ey = by + dy * len;
  // The curve bows sideways by `bend` degrees' worth.
  const bow = len * Math.tan((limb.bend * Math.PI) / 180) * 0.5;
  const cx = (bx + ex) / 2 - dy * bow, cy = (by + ey) / 2 + dx * bow;
  const thick = tall * 0.07;
  return (
    <g className="blob-limb" style={{ transformOrigin: `${bx}px ${by}px`, animationDelay: `${limb.delay}s` }}>
      <path d={`M${bx} ${by} Q ${cx} ${cy} ${ex} ${ey}`} className="blob-wax-line" style={{ strokeWidth: thick }} />
    </g>
  );
}

/** Behind the figures: the dome, and the sleepers pressed into it. */
export function BlobBack({ box }: { box: BlobBox }) {
  const { x0, W, feet, top, tall } = shapeOf(box);
  const H = feet - top + tall * 0.08;
  const u = (f: number) => W * f, v = (f: number) => H * f;
  return (
    <svg className="blob-layer" style={{ left: x0, top, width: W, height: H }} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <path d={`M0 ${v(0.9)} C ${u(0.04)} ${v(0.35)}, ${u(0.3)} ${v(0.02)}, ${u(0.5)} ${v(0.02)} C ${u(0.7)} ${v(0.02)}, ${u(0.96)} ${v(0.35)}, ${W} ${v(0.9)} Z`} className="blob-wax" />
      {BACK_LIMBS.map((l, i) => <Arm key={i} limb={l} W={W} H={H} tall={tall} />)}
    </svg>
  );
}

/** In front of the figures: lumps over their legs, and arms dragging along the floor. */
export function BlobFront({ box }: { box: BlobBox }) {
  const { x0, W, feet, tall } = shapeOf(box);
  const lowTop = feet - tall * (box.slumped ? 0.14 : 0.22);
  const H = feet - lowTop + tall * 0.1;
  const lumps: [number, number, number, number][] = [
    [0.1, 0.55, 0.14, 0.34], [0.28, 0.62, 0.16, 0.4], [0.5, 0.68, 0.18, 0.4], [0.72, 0.62, 0.16, 0.4], [0.9, 0.55, 0.14, 0.34],
  ];
  return (
    <svg className="blob-layer" style={{ left: x0, top: lowTop, width: W, height: H }} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <ellipse cx={W / 2} cy={H * 0.82} rx={W / 2} ry={H * 0.22} className="blob-wax" />
      {lumps.map(([fx, fy, fw, fh], i) => (
        <ellipse key={i} cx={W * fx} cy={H * fy + H * 0.12} rx={W * fw} ry={H * fh} className="blob-wax" />
      ))}
      {FRONT_LIMBS.map((l, i) => <Arm key={i} limb={l} W={W} H={H} tall={tall} />)}
    </svg>
  );
}
