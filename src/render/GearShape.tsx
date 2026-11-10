/**
 * GearShape.tsx — one drawn shape of a 3D weapon (render/gear3d.ts `drawGear`) as SVG: flat, with round ends and joins, like the sprites. Used by the Gear
 * viewer and by the 3D rig, which draws the weapon in the Waxed's hand.
 */
import type { Drawn, End } from "./gear3d";

/** One shape of a weapon on the page: flat, with round ends and joins, like the sprites. */
export function GearShape({ d }: { d: Drawn }) {
  switch (d.k) {
    case "poly":
      return <polygon points={d.points} fill={d.fill} stroke={d.stroke} strokeWidth={0.4} strokeLinejoin="round" />;
    case "cyl":
      // The end that turns away first (only the curve of its edge past the body shows), then the body, its two straight sides, and the end we see.
      return (
        <g strokeLinejoin="round" strokeLinecap="round">
          <GearEnd e={d.far} stroke={d.stroke} />
          <polygon points={d.body} fill={d.fill} stroke="none" />
          <polyline points={d.sides[0]} fill="none" stroke={d.stroke} strokeWidth={0.4} />
          <polyline points={d.sides[1]} fill="none" stroke={d.stroke} strokeWidth={0.4} />
          <GearEnd e={d.near} stroke={d.stroke} />
        </g>
      );
    case "line": {
      // A piece of a rod: a darker line a little wider underneath is its outline. Its ends are square, so the pieces meet edge to edge, its fill reaching
      // a little past where it meets the next one (over the next piece's fill, never its outline's end, so no seam shows); the rod's own two ends are
      // round, a disc each.
      const len = Math.hypot(d.x2 - d.x1, d.y2 - d.y1) || 1, ux = (d.x2 - d.x1) / len, uy = (d.y2 - d.y1) / len;
      const [r1, r2] = d.ends, o1 = r1 ? 0 : d.overlap, o2 = r2 ? 0 : d.overlap;
      return (
        <g strokeLinecap="butt">
          <line x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} stroke={d.stroke} strokeWidth={d.width + 0.8} />
          {r1 && <circle cx={d.x1} cy={d.y1} r={d.width / 2 + 0.4} fill={d.stroke} />}
          {r2 && <circle cx={d.x2} cy={d.y2} r={d.width / 2 + 0.4} fill={d.stroke} />}
          <line x1={d.x1 - ux * o1} y1={d.y1 - uy * o1} x2={d.x2 + ux * o2} y2={d.y2 + uy * o2} stroke={d.fill} strokeWidth={d.width} />
          {r1 && <circle cx={d.x1} cy={d.y1} r={d.width / 2} fill={d.fill} />}
          {r2 && <circle cx={d.x2} cy={d.y2} r={d.width / 2} fill={d.fill} />}
        </g>
      );
    }
    case "ellipse":
      return <ellipse cx={d.cx} cy={d.cy} rx={Math.max(d.rx, 0.01)} ry={Math.max(d.ry, 0.01)} transform={`rotate(${d.angle} ${d.cx} ${d.cy})`} fill={d.fill} stroke={d.stroke} strokeWidth={d.ring ?? 0.4} />;
    case "stroke":
      return <polyline points={d.points} fill="none" stroke={d.color} strokeWidth={d.width} strokeLinecap="round" strokeLinejoin="round" />;
  }
}

/** One flat end of a cylinder: an ellipse. */
function GearEnd({ e, stroke }: { e: End; stroke: string }) {
  return <ellipse cx={e.cx} cy={e.cy} rx={Math.max(e.rx, 0.01)} ry={Math.max(e.ry, 0.01)} transform={`rotate(${e.angle} ${e.cx} ${e.cy})`} fill={e.fill} stroke={stroke} strokeWidth={0.4} />;
}
