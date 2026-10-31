/**
 * ring.tsx — the ring the action wheel is made of, in its own drawing units (it runs from the inner
 * radius out to the outer): the polar helper, the four white dividing lines with their pointed ends,
 * and the fade of its fill. (The action wheel draws it; the same ring is the mark over the selected target.)
 */

/** The ring's inner radius (the room for the target) and outer radius. */
export const R_IN = 64;
export const R_OUT = 100;

export const polar = (r: number, deg: number): [number, number] => [r * Math.cos((deg * Math.PI) / 180), r * Math.sin((deg * Math.PI) / 180)];

/** The four diagonals that split the ring into one piece per direction. */
const DIAGONALS = [-135, -45, 45, 135];

/** A white line along a diagonal that swells from a point at each end to its full width in the middle. */
function pointedLine(deg: number, half: number): string {
  const mid = (R_IN + R_OUT) / 2;
  const [x0, y0] = polar(R_IN, deg), [x1, y1] = polar(R_OUT, deg);
  const [mx, my] = polar(mid, deg), [nx, ny] = polar(half, deg + 90);
  return `M${x0} ${y0} L${mx + nx} ${my + ny} L${x1} ${y1} L${mx - nx} ${my - ny} Z`;
}

/** The four dividing lines, in white, with pointed ends. */
export function RingLines({ half = 1.1 }: { half?: number }) {
  return <>{DIAGONALS.map(deg => <path key={deg} d={pointedLine(deg, half)} className="wheel-line" />)}</>;
}

/**
 * The ring's fill, fading out away from its center. `stops` are (how far across the ring from its inner
 * edge, 0 to 1; how opaque) pairs, ending at nothing on the outer edge.
 */
export function RingFade({ id, stops }: { id: string; stops: readonly (readonly [number, number])[] }) {
  return (
    <defs>
      <radialGradient id={id} gradientUnits="userSpaceOnUse" cx={0} cy={0} r={R_OUT}>
        {stops.map(([at, opacity]) => <stop key={at} offset={(R_IN + at * (R_OUT - R_IN)) / R_OUT} stopColor="#fff" stopOpacity={opacity} />)}
      </radialGradient>
    </defs>
  );
}
