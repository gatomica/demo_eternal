/**
 * GuideFigure.tsx — how the guide is drawn: a pointed navy cloak that doubles as a hat (its tip as
 * high as a player's head), the face opening a dark hollow low in the hood, a white glowing orb of
 * yarn hanging from it on black string, and bare feet barely showing under the hem. No hands, no
 * arms. Drawing only; the guide's rules live in core/kinds/guide.ts.
 *
 * Drawn facing right like every figure (the scene mirrors enemies). Straight on, the opening and
 * the orb are centered; from behind, only the string around the neck shows.
 */
import { type GuideSkeleton } from "./poses";

const HEM = 111;      // where the hem lies
const TIP = 17;       // the tip of the hat: about as high as a player's head
const OPENING_Y = 57; // the middle of the face opening
const ORB_R = 8.5;

/** Yarn on the orb: loops wound round it every which way. */
const YARN = [
  "M-8 -3 Q0 -8 8 -3", "M-8.4 1 Q0 -4 8.4 1", "M-8 5 Q0 0 8 5",
  "M-6 -7 Q4 0 -6 7", "M0 -8.6 Q9 0 0 8.6", "M6 -7 Q-4 0 6 7", "M-3 -8 Q-9 1 -2 8.4", "M3 -8 Q9 2 2 8.4",
];

/** The black string wound twice round the orb, each turn tilted the other way so they cross in front. */
const WRAPS = [{ y: 0, tilt: 28 }, { y: 0, tilt: -28 }];

export function GuideFigure({ s, front, straight }: { s: GuideSkeleton; front: boolean; straight?: boolean }) {
  const g = s.guide;
  const cx = 50;
  // The opening faces forward (to the right, before mirroring); straight on it is centered.
  const ox = cx + (straight ? 0 : 4.5);
  const tipX = cx - g.curl;
  const hem = HEM - g.lift;
  // The cloak, left side down to the hem and back up the right: a broad skirt, a pinch where the hood
  // starts, then the tall cone of the hat, bent where it curls.
  const cloak = [
    `M${cx - 24} ${hem}`,
    `L${cx - 10.7} ${hem - 52}`,
    `Q${cx - 5.4 - g.curl * 0.5} 38 ${tipX} ${TIP}`,
    `Q${cx + 5.4 - g.curl * 0.5} 38 ${cx + 10.7} ${hem - 52}`,
    `L${cx + 24} ${hem}`,
    `Q${cx} ${hem + 6} ${cx - 24} ${hem}`,
    "Z",
  ].join(" ");
  // The orb hangs on its string from the opening.
  const anchorY = OPENING_Y + 6;
  const len = 4 + 10 * (1 - g.tuck) + g.reach;
  const rad = (g.swing * Math.PI) / 180;
  const orbX = ox + len * Math.sin(rad), orbY = anchorY + len * Math.cos(rad) + ORB_R * 0.6;
  return (
    <g transform={`rotate(${g.lean} ${cx} ${HEM}) translate(${cx} ${HEM}) scale(${g.narrow} ${g.squash}) translate(${-cx} ${-HEM})`}>
      {/* Bare feet, barely out from under the hem. */}
      <ellipse cx={cx - 6} cy={113.4} rx={3.4} ry={2.1} className="guide-foot" />
      <ellipse cx={cx + 7} cy={114.2} rx={3.4} ry={2.1} className="guide-foot" />
      <path d={cloak} className="guide-cloak" />
      {/* Folds running up from the hem. */}
      <path d={`M${cx - 12} ${hem - 1} Q${cx - 11} ${hem - 17} ${cx - 8} ${hem - 31} M${cx + 2} ${hem + 1} Q${cx + 3} ${hem - 16} ${cx + 1} ${hem - 32} M${cx + 14} ${hem - 1} Q${cx + 12} ${hem - 16} ${cx + 9} ${hem - 30}`} className="guide-fold" />
      {front ? (
        <>
          {/* The face opening: a hollow, nothing in it. */}
          <ellipse cx={ox} cy={OPENING_Y} rx={5.6} ry={7.6} className="guide-opening" />
          {/* The orb, on its string. */}
          <g>
            <path d={`M${ox - 1.6} ${anchorY} L${orbX - 4} ${orbY - ORB_R * 0.8} M${ox + 1.6} ${anchorY} L${orbX + 4} ${orbY - ORB_R * 0.8}`} className="guide-string" />
            <g transform={`translate(${orbX} ${orbY})`}>
              <circle r={ORB_R * (1.9 + g.glow * 0.4)} className="guide-glow-wide" style={{ opacity: Math.min(1, g.glow) }} />
              <circle r={ORB_R * 1.45} className="guide-glow" style={{ opacity: Math.min(1, 0.3 + g.glow * 0.6) }} />
              <clipPath id="guide-orb-clip"><circle r={ORB_R} /></clipPath>
              {/* The string's far halves, wound round the back: behind the yarn. */}
              {WRAPS.map((w, i) => (
                <path key={`b${i}`} d={`M${-ORB_R - 0.3} ${w.y} A${ORB_R + 0.3} ${ORB_R * 0.3} 0 0 1 ${ORB_R + 0.3} ${w.y}`} transform={`rotate(${w.tilt - g.swing * 0.6})`} className="guide-string" />
              ))}
              <circle r={ORB_R} className="guide-orb" />
              <g clipPath="url(#guide-orb-clip)">
                {YARN.map((d, i) => <path key={i} d={d} className="guide-yarn" />)}
              </g>
              {/* The near halves cross in front of it, in an X. */}
              {WRAPS.map((w, i) => (
                <path key={`f${i}`} d={`M${-ORB_R - 0.3} ${w.y} A${ORB_R + 0.3} ${ORB_R * 0.3} 0 0 0 ${ORB_R + 0.3} ${w.y}`} transform={`rotate(${w.tilt - g.swing * 0.6})`} className="guide-string" />
              ))}
            </g>
          </g>
        </>
      ) : (
        // From behind: just the string looped round the neck of the cloak.
        <path d={`M${cx - 10.5} ${OPENING_Y + 2} Q${cx} ${OPENING_Y + 8} ${cx + 10.5} ${OPENING_Y + 2}`} className="guide-string" />
      )}
    </g>
  );
}
