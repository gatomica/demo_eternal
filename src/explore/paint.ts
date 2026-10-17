/**
 * paint.ts — painting the map's tiles, a chunk at a time.
 */
import { COLORS, RISE } from "./tuning";
import { FLOOR, groundBelow, isAir, isArrival, isRamp, LADDER, LEVELS, type Ramp, rampAt, rampHeight, tileAt, VOID, walkable, WALL } from "./world";

export const makeCanvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
};

/** Levels are painted in square chunks of this many tiles, as they come into view. */
export const CHUNK = 8;

/** Extra rows a chunk's surface keeps above it (stairs rise over the row behind them). */
export const CHUNK_PAD_TOP = 1;

/** Extra rows a chunk's faces keep below it (a ledge's face drops as far as the floor it overlooks). */
export const CHUNK_PAD_BOTTOM = Math.ceil(LEVELS * RISE) + 1;

/**
 * Paints a CHUNK × CHUNK block of one level, at `T` pixels per tile, in that level's own
 * coordinates (it is shifted up by its height when drawn). Two layers: the surfaces, and the
 * cliff faces under ledges. Each face is stored in the row of the tile it hangs from, so
 * splitting by rows keeps it together. The surface layer starts CHUNK_PAD_TOP rows above the
 * block (for stairs rising into the row behind), the faces layer at the block's top row and runs
 * on below it (for tall drops). Null if the block has nothing to paint.
 */
export function paintChunk(z: number, T: number, cx: number, cy: number) {
  const x0 = cx * CHUNK, y0 = cy * CHUNK;
  let any = false;
  for (let y = y0; y < y0 + CHUNK && !any; y++) for (let x = x0; x < x0 + CHUNK; x++) if (tileAt(z, x, y) !== VOID) { any = true; break; }
  if (!any) return null;
  const surface = makeCanvas(CHUNK * T, (CHUNK + CHUNK_PAD_TOP) * T);
  const faces = makeCanvas(CHUNK * T, (CHUNK + CHUNK_PAD_BOTTOM) * T);
  const g = surface.getContext("2d")!, f = faces.getContext("2d")!;
  g.translate(-x0 * T, -(y0 - CHUNK_PAD_TOP) * T);
  f.translate(-x0 * T, -y0 * T);
  const grout = Math.max(1, Math.round(T / 24));
  const rise = RISE * T;

  for (let y = y0; y < y0 + CHUNK; y++) for (let x = x0; x < x0 + CHUNK; x++) {
    const t = tileAt(z, x, y), px = x * T, py = y * T;
    if (t === FLOOR) {
      g.fillStyle = COLORS.floorGrout;
      g.fillRect(px, py, T, T);
      g.fillStyle = COLORS.floor;
      g.fillRect(px + grout, py + grout, T - grout, T - grout);
    } else if (t === WALL) {
      // Walls show no top, only what you'd see of them from the room: the face of a wall
      // with floor in front of it (below, in this view), and a thin rim where it meets floor.
      const r = grout * 2;
      const face = Math.round(rise);
      const floorAt = (dx: number, dy: number) => walkable(tileAt(z, x + dx, y + dy));
      if (floorAt(0, 1)) {
        g.fillStyle = COLORS.wallFace;
        g.fillRect(px, py + T - face, T, face);
        g.fillStyle = COLORS.wallEdge;
        g.fillRect(px, py + T - face - r, T, r);
      }
      g.fillStyle = COLORS.wallEdge;
      if (floorAt(0, -1)) g.fillRect(px, py, T, r);
      if (floorAt(-1, 0)) g.fillRect(px, py, r, floorAt(0, 1) ? T - face : T);
      if (floorAt(1, 0)) g.fillRect(px + T - r, py, r, floorAt(0, 1) ? T - face : T);
    }
    if (t !== FLOOR) continue;

    // Ledges: a rim where the floor meets open air, and a cliff face under southern edges.
    const edges: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    for (const [dx, dy] of edges) {
      const nx = x + dx, ny = y + dy;
      if (!isAir(z, nx, ny) || isArrival(z, x, y, nx, ny)) continue;
      g.fillStyle = COLORS.ledgeRim;
      const r = grout * 2;
      if (dy < 0) g.fillRect(px, py, T, r);
      if (dy > 0) g.fillRect(px, py + T - r, T, r);
      if (dx < 0) g.fillRect(px, py, r, T);
      if (dx > 0) g.fillRect(px + T - r, py, r, T);
      if (dy > 0) {
        const drop = (z - groundBelow(z, nx, ny)) * rise;
        f.fillStyle = COLORS.ledgeFace;
        f.fillRect(px, py, T, drop);
        f.fillStyle = COLORS.wallEdge;
        f.fillRect(px, py, T, grout);
      }
    }
  }

  // Ramps go last, north to south, since each one rises over the row behind it.
  for (let y = y0; y < y0 + CHUNK; y++) for (let x = x0; x < x0 + CHUNK; x++) {
    const t = tileAt(z, x, y);
    const r = isRamp(t) ? rampAt(z, x, y) : undefined;
    if (r) paintRamp(g, z, x, y, r, t === LADDER, T, grout);
  }
  return { surface, faces };
}

function paintRamp(g: CanvasRenderingContext2D, z: number, x: number, y: number, r: Ramp, ladder: boolean, T: number, grout: number) {
  // A point on the ramp, in the level's own canvas: height lifts it up the screen.
  const P = (wx: number, wy: number): [number, number] => {
    const hgt = rampHeight(z, x, y, r, wx, wy) - z;
    return [wx * T, (wy - hgt * RISE) * T];
  };
  const poly = (pts: [number, number][], fill: string) => {
    g.fillStyle = fill;
    g.beginPath();
    pts.forEach(([a, b]) => g.lineTo(a, b));
    g.closePath();
    g.fill();
  };
  const seg = (a: [number, number], b: [number, number], color: string, width: number) => {
    g.strokeStyle = color; g.lineWidth = width;
    g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke();
  };

  // The side of the ramp facing you, from its south edge down to the floor it stands on.
  const sw = P(x, y + 1), se = P(x + 1, y + 1);
  poly([sw, se, [(x + 1) * T, (y + 1) * T], [x * T, (y + 1) * T]], COLORS.wallFace);

  const top: [number, number][] = [P(x, y), P(x + 1, y), se, sw];
  if (ladder) {
    poly(top, COLORS.wallFace);
    // Two rails and some rungs.
    for (const fx of [0.25, 0.75]) seg(P(x + fx, y + 1), P(x + fx, y), COLORS.rung, grout * 2);
    for (let k = 1; k <= 3; k++) seg(P(x + 0.25, y + 1 - k / 4), P(x + 0.75, y + 1 - k / 4), COLORS.rung, grout * 1.5);
    return;
  }
  poly(top, COLORS.stairs);
  // Step edges across the slope.
  const STEPS = 3;
  for (let k = 1; k < STEPS; k++) {
    const s = k / STEPS;
    if (r.dir === "up" || r.dir === "down") {
      const fy = r.dir === "up" ? 1 - s : s;
      seg(P(x, y + fy), P(x + 1, y + fy), COLORS.floorGrout, grout * 1.5);
    } else {
      const fx = r.dir === "right" ? s : 1 - s;
      seg(P(x + fx, y), P(x + fx, y + 1), COLORS.floorGrout, grout * 1.5);
    }
  }
}
