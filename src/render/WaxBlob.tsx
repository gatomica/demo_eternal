/**
 * WaxBlob.tsx — the pool of wax the Wax Blob's three parts crawl out of: a flat disc on the ground, plain wax, the colour of the
 * three figures, so they melt into it. It is one layer drawn below the figures (the parts are kneeling on its edge, their legs
 * still in it and their hands on the floor beyond). A few arms of more sleepers stick out of its rim. The disc is a circle on the floor,
 * seen through the scene's camera, so it is an ellipse on the screen (its width and height come from where the camera sees the circle's
 * four ends), and the arms go with it when the camera moves.
 */

/** Where the pool is on the screen: the ellipse the floor circle makes, and how tall a figure is there (for the arms' size). */
export interface BlobBox {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  tall: number;
  /** The body has fallen: the pool spreads thinner (its arms lie still). */
  slumped: boolean;
  /** The wax joining each part to the pool, in screen pixels: from the pool's middle (a), out along the line of parts to a bend (k), then in to the part's bound feet (t), and how thick it is. */
  links: { ax: number; ay: number; kx: number; ky: number; tx: number; ty: number; width: number }[];
}

/**
 * More sleepers in the pool, their arms sticking out of its rim. Each is placed by where it leaves the rim (`t` in degrees round the
 * disc, 0 to the right and 90 toward you), how long it is as a share of a figure's height, how much it bends and where its sway starts.
 * They keep to the back and the far flanks and the gaps between the three figures, clear of where the figures' heads and hands are.
 */
interface Limb { t: number; len: number; bend: number; delay: number }

const LIMBS: Limb[] = [
  { t: -150, len: 0.3, bend: 22, delay: -0.4 },
  { t: -105, len: 0.18, bend: -14, delay: -1.5 },
  { t: -30, len: 0.3, bend: -20, delay: -1.7 },
  { t: 8, len: 0.15, bend: 18, delay: -0.9 },
  { t: 172, len: 0.14, bend: -16, delay: -2.4 },
  { t: 125, len: 0.18, bend: 20, delay: 0 },
  { t: 58, len: 0.18, bend: -22, delay: -0.6 },
];

/** A wax link is drawn as this many strokes along its curve, each a little thinner than the one before; at the pool it is this many times as thick as at the part. */
const LINK_STEPS = 14, LINK_ROOT = 2.6;

/** How much of its length an arm shows beyond the wax: the rest of it is inside the pool. */
const REACH = 0.62;

/** An arm: a thick curved stroke from inside the wax, left bare at the end (stick-figure style). */
function Arm({ limb, rx, ry, tall }: { limb: Limb; rx: number; ry: number; tall: number }) {
  const rad = (limb.t * Math.PI) / 180;
  // It starts a little inside the rim and points out, away from the middle (flattened the way the disc is).
  const bx = rx + Math.cos(rad) * rx * 0.92, by = ry + Math.sin(rad) * ry * 0.92;
  const dx = Math.cos(rad), dy = Math.sin(rad) * 0.55, n = Math.hypot(dx, dy);
  const len = tall * limb.len * REACH;
  const ex = bx + (dx / n) * len, ey = by + (dy / n) * len;
  // The curve bows sideways by `bend` degrees' worth.
  const bow = len * Math.tan((limb.bend * Math.PI) / 180) * 0.5;
  const cx = (bx + ex) / 2 - (dy / n) * bow, cy = (by + ey) / 2 + (dx / n) * bow;
  return (
    <g className="blob-limb" style={{ transformOrigin: `${bx}px ${by}px`, animationDelay: `${limb.delay}s` }}>
      <path d={`M${bx} ${by} Q ${cx} ${cy} ${ex} ${ey}`} className="blob-wax-line" style={{ strokeWidth: tall * 0.07 }} />
    </g>
  );
}

/** The pool: one flat disc on the ground, with the sleepers' arms at its rim. Drawn below every figure. */
export function BlobPool({ box }: { box: BlobBox }) {
  const { cx, cy, rx, ry, tall, slumped, links } = box;
  // The arms reach out past the rim: the layer is a little bigger than the disc.
  // The dome is low: about a third of a figure's height at its top (slumped, flatter).
  const dome = tall * (slumped ? 0.1 : 0.3);
  const pad = tall * 0.3, W = rx * 2 + pad * 2, H = ry * 2 + pad * 2;
  return (
    <svg className="blob-layer" style={{ left: cx - rx - pad, top: cy - ry - pad, width: W, height: H }} viewBox={`${-pad} ${-pad} ${W} ${H}`} aria-hidden="true">
      <ellipse cx={rx} cy={ry} rx={rx} ry={ry} className="blob-wax" />
      {/* The wax holding each part to the pool: a thick stroke from the pool's middle, out square to the way the body faces, then curving round toward the
          front to the part's bound feet; thinner the further the part has stretched it. Same wax as the pool, below the figures. */}
      {links.map((l, i) => {
        // Thickest where it leaves the pool, thinning toward the part: a run of round-ended strokes along the curve, each a little thinner.
        const o = (x: number, y: number): [number, number] => [x - (cx - rx), y - (cy - ry)];
        const [x0, y0] = o(l.ax, l.ay), [xk, yk] = o(l.kx, l.ky), [x1, y1] = o(l.tx, l.ty);
        const at = (t: number): [number, number] => [(1 - t) ** 2 * x0 + 2 * (1 - t) * t * xk + t * t * x1, (1 - t) ** 2 * y0 + 2 * (1 - t) * t * yk + t * t * y1];
        return (
          <g key={i}>
            {Array.from({ length: LINK_STEPS }, (_, j) => {
              const [ax, ay] = at(j / LINK_STEPS), [bx, by] = at((j + 1) / LINK_STEPS);
              // (Never so thick that its top rises above the pool's own back edge and the dome, as the pool's silhouette is there: the heap
              // must not look taller for the wax joining it.)
              const wanted = l.width * (LINK_ROOT + (1 - LINK_ROOT) * ((j + 0.5) / LINK_STEPS));
              const u = ((ax + bx) / 2 - rx) / rx, s = Math.sqrt(Math.max(0, 1 - u * u)), top = ry - Math.max(ry, dome) * s;
              const thick = Math.max(l.width, Math.min(wanted, 2 * ((ay + by) / 2 - top)));
              return <line key={j} x1={ax} y1={ay} x2={bx} y2={by} className="blob-wax-line" style={{ strokeWidth: thick }} />;
            })}
          </g>
        );
      })}
      {/* A low dome of wax over the disc: only its top, a half ellipse as wide as the disc, standing on the disc's middle line. It has no
          base of its own to draw (that is the disc), so it can't show wrongly from any angle. It is the pool's own colour. */}
      <path d={`M0 ${ry} A ${rx} ${dome} 0 0 1 ${rx * 2} ${ry} Z`} className="blob-wax" />
      {!slumped && LIMBS.map((l, i) => <Arm key={i} limb={l} rx={rx} ry={ry} tall={tall} />)}
    </svg>
  );
}
