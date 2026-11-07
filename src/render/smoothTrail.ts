/**
 * smoothTrail.ts — strokes a trail of points as a smooth curve rather than a chain of straight pieces: each piece is a quadratic curve from the
 * middle of one stretch to the middle of the next, bending through the point between them, so the corners of the polygon the points make are rounded off.
 * The strings that fly (`StringFx`) and the one that spins round its holder (`lostString.ts`) are drawn with it.
 */
export interface TrailPoint { x: number; y: number }

/**
 * Strokes `pts` (oldest first) in pieces, each styled by `style(k)`, k being how far along the trail it is (0 to 1; null skips it).
 * `include(i)` can leave pieces out (the piece bending through point `i`).
 */
export function strokeSmooth(
  g: CanvasRenderingContext2D,
  pts: readonly TrailPoint[],
  style: (k: number) => { color: string; width: number } | null,
  include?: (i: number) => boolean,
) {
  const n = pts.length;
  if (n < 2) return;
  // Butt ends, not round ones: the pieces meet end to end along the same tangent, and round caps would overlap where they meet, so a translucent
  // trail would show a brighter dot at every joint.
  const cap = g.lineCap;
  g.lineCap = "butt";
  const mid = (a: TrailPoint, b: TrailPoint) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  if (n === 2) {
    const st = style(1);
    if (!st || (include && !include(1))) return;
    g.strokeStyle = st.color; g.lineWidth = st.width;
    g.beginPath(); g.moveTo(pts[0].x, pts[0].y); g.lineTo(pts[1].x, pts[1].y); g.stroke();
    g.lineCap = cap;
    return;
  }
  for (let j = 1; j < n; j++) {
    if (include && !include(j)) continue;
    const st = style(j / (n - 1));
    if (!st) continue;
    // (The first piece starts at the tail itself, the last ends at the head.)
    const a = j === 1 ? pts[0] : mid(pts[j - 1], pts[j]);
    const b = j === n - 1 ? pts[n - 1] : mid(pts[j], pts[j + 1]);
    g.strokeStyle = st.color; g.lineWidth = st.width;
    g.beginPath(); g.moveTo(a.x, a.y); g.quadraticCurveTo(pts[j].x, pts[j].y, b.x, b.y); g.stroke();
  }
  g.lineCap = cap;
}
