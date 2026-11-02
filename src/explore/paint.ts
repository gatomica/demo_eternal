/**
 * paint.ts — painting the map's tiles, a chunk at a time.
 */
import { hasSealed, paintSealedFloor, paintSealedWall } from "./sealed";
import { type Palette, paletteOf, RISE } from "./tuning";
import { CLIFFS, type CliffBlock, DIAG, FLOOR, isAir, isArrival, isDiagonalRamp, isRamp, LADDER, type Ramp, diagSide, isHoleDiag, shaftDiagSide, rampAlong, rampAt, rampHeight, type Slope, slopeAt, tileAt, VOID, WALL, wallFacesInto, wallStandsAt, WORLD } from "./world";

export const makeCanvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
};

/** Levels are painted in square chunks of this many tiles, as they come into view. */
export const CHUNK = 8;

/** Extra rows a chunk's layers keep above it (stairs, wall tops and slanted cliffs reach into the row behind). */
export const CHUNK_PAD_TOP = 1;

/**
 * Paints a CHUNK × CHUNK block of one level, at `T` pixels per tile, in that level's own
 * coordinates (it is shifted up by its height when drawn). Three layers, each starting
 * CHUNK_PAD_TOP rows above the block: the walls (faded by their distance from you, and shown
 * above you too), the surfaces (floors, stairs and ledge rims), and the blocks of the cliffs (faded
 * like walls, drawn over this level's floor, since a cliff may hang in front of it). Null if the
 * block has nothing to paint.
 */
export function paintChunk(z: number, T: number, cx: number, cy: number) {
  const x0 = cx * CHUNK, y0 = cy * CHUNK;
  let any = false;
  for (let y = y0; y < y0 + CHUNK && !any; y++) for (let x = x0; x < x0 + CHUNK; x++) if (tileAt(z, x, y) !== VOID || CLIFFS[z].has(y * WORLD.w + x)) { any = true; break; }
  if (!any) return null;
  const layer = () => {
    const canvas = makeCanvas(CHUNK * T, (CHUNK + CHUNK_PAD_TOP) * T);
    const c = canvas.getContext("2d")!;
    c.translate(-x0 * T, -(y0 - CHUNK_PAD_TOP) * T);
    return [canvas, c] as const;
  };
  const [surface, g] = layer(), [walls, w] = layer(), [cliffs, f] = layer();
  const grout = Math.max(1, Math.round(T / 24));
  const rise = RISE * T;
  const P = paletteOf(z);

  for (let y = y0; y < y0 + CHUNK; y++) for (let x = x0; x < x0 + CHUNK; x++) {
    const t = tileAt(z, x, y), px = x * T, py = y * T;
    // A ladder stands on floor at its foot only; above that it is just the ladder on the wall.
    if (t === FLOOR || (t === LADDER && tileAt(z - 1, x, y) !== LADDER)) {
      g.fillStyle = P.floorGrout;
      g.fillRect(px, py, T, T);
      g.fillStyle = P.floor;
      g.fillRect(px + grout, py + grout, T - grout, T - grout);
      if (t === FLOOR && hasSealed(z)) paintSealedFloor(g, z, x, y, T);
    } else if (t === WALL) {
      // Walls show no top, only what you'd see of them from the room: the face of a wall
      // with floor in front of it (below, in this view). Their other sides don't face you: nothing.
      const r = grout * 2;
      const face = Math.round(rise);
      // (Open air inside a shaft counts as floor here: the walls round it show their faces.)
      const floorAt = (dx: number, dy: number) => wallFacesInto(z, x + dx, y + dy);
      if (floorAt(0, 1)) {
        w.fillStyle = P.wallFace;
        w.fillRect(px, py + T - face, T, face);
        // The line along its top only where the wall ends: stacked levels read as one wall.
        if (!(wallStandsAt(z + 1, x, y) && wallFacesInto(z + 1, x, y + 1))) {
          w.fillStyle = P.wallEdge;
          w.fillRect(px, py + T - face - r, T, r);
        }
      }
      if (floorAt(0, 1) && hasSealed(z) && tileAt(z, x, y + 1) !== LADDER) paintSealedWall(w, z, x, y, T);
    }
    if (t === DIAG) paintDiag(g, w, z, x, y, T, grout, P);
    const sd = shaftDiagSide(z, x, y);
    if (sd >= 0) paintShaftWall(w, z, x, y, T, grout, sd, P);
    const block = CLIFFS[z].get(y * WORLD.w + x);
    if (block) paintCliffBlock(f, block, x, y, T, grout);
    if (t !== FLOOR) continue;

    // Ledges: a rim where the floor meets open air (the cliff under a southern edge is its own blocks, on the levels below).
    const edges: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    for (const [dx, dy] of edges) {
      const nx = x + dx, ny = y + dy;
      if (!isAir(z, nx, ny) || isArrival(z, x, y, nx, ny)) continue;
      g.fillStyle = P.ledgeRim;
      const r = grout * 2;
      if (dy < 0) g.fillRect(px, py, T, r);
      if (dy > 0) g.fillRect(px, py + T - r, T, r);
      if (dx < 0) g.fillRect(px, py, r, T);
      if (dx > 0) g.fillRect(px + T - r, py, r, T);
    }
  }

  // Ramps go last, north to south, since each one rises over the row behind it. A ladder is on the wall, so it goes up with the wall.
  for (let y = y0; y < y0 + CHUNK; y++) for (let x = x0; x < x0 + CHUNK; x++) {
    const t = tileAt(z, x, y);
    if (t === LADDER) { paintLadder(w, x, y, T, grout, P); continue; }
    const r = isRamp(t) ? rampAt(z, x, y) : undefined;
    if (r) paintRamp(g, z, x, y, r, false, T, grout, P);
  }
  return { surface, walls, cliffs };
}

/** One level's slice of a cliff, in the colour of the floor it hangs from. Under the rim of a hole it slants with the cut, reaching a row up. */
function paintCliffBlock(f: CanvasRenderingContext2D, block: CliffBlock, x: number, y: number, T: number, grout: number) {
  const P = paletteOf(block.z), px = x * T, py = y * T;
  f.fillStyle = P.ledgeFace;
  if (block.diag < 0) {
    f.fillRect(px, py, T, T);
    if (block.top) {
      f.fillStyle = P.wallEdge;
      f.fillRect(px, py, T, grout);
    }
    return;
  }
  f.beginPath();
  if (block.diag === 0) { f.moveTo(px + T, py - T); f.lineTo(px, py); f.lineTo(px, py + T); f.lineTo(px + T, py); }
  else { f.moveTo(px, py - T); f.lineTo(px + T, py); f.lineTo(px + T, py + T); f.lineTo(px, py); }
  f.closePath();
  f.fill();
}

function paintRamp(g: CanvasRenderingContext2D, z: number, x: number, y: number, r: Ramp, ladder: boolean, T: number, grout: number, pal: Palette) {
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

  const sw = P(x, y + 1), se = P(x + 1, y + 1);
  // The side of the ramp facing you, from its south edge down to the floor it stands on. (Beside diagonal stairs that's the tilted tiles, no side.)
  if (!isDiagonalRamp(r.dir)) poly([sw, se, [(x + 1) * T, (y + 1) * T], [x * T, (y + 1) * T]], pal.wallFace);

  const top: [number, number][] = [P(x, y), P(x + 1, y), se, sw];
  if (ladder) {
    poly(top, pal.wallFace);
    // Two rails and some rungs.
    for (const fx of [0.25, 0.75]) seg(P(x + fx, y + 1), P(x + fx, y), pal.rung, grout * 2);
    for (let k = 1; k <= 3; k++) seg(P(x + 0.25, y + 1 - k / 4), P(x + 0.75, y + 1 - k / 4), pal.rung, grout * 1.5);
    return;
  }
  poly(top, pal.stairs);
  // Step edges across the slope.
  const STEPS = 3;
  for (let k = 1; k < STEPS; k++) {
    const s = k / STEPS;
    if (isDiagonalRamp(r.dir)) {
      // Across the tile from edge to edge, square to the way uphill.
      const sum = 2 * s;
      const a: [number, number] = sum <= 1 ? [sum, 0] : [1, sum - 1], b: [number, number] = sum <= 1 ? [0, sum] : [sum - 1, 1];
      // (Worked out for a slope toward the south-east; the other corners are that one mirrored.)
      const at = ([fx, fy]: [number, number]) => P(x + (r.dir === "sw" ? 1 - fx : fx), y + (r.dir === "ne" ? 1 - fy : fy));
      seg(at(a), at(b), pal.floorGrout, grout * 1.5);
    } else if (r.dir === "up" || r.dir === "down") {
      const fy = r.dir === "up" ? 1 - s : s;
      seg(P(x, y + fy), P(x + 1, y + fy), pal.floorGrout, grout * 1.5);
    } else {
      const fx = r.dir === "right" ? s : 1 - s;
      seg(P(x + fx, y), P(x + fx, y + 1), pal.floorGrout, grout * 1.5);
    }
  }
}

/** The tile's corners, in order: north-west, north-east, south-west, south-east (the order of DIAG_CHARS). */
const CORNERS: [number, number][] = [[0, 0], [1, 0], [0, 1], [1, 1]];

/** A diagonal tile: its floor triangle (on `g`), its wall triangle (the face of the wall, on `w`) and a rim along the cut. */
function paintDiag(g: CanvasRenderingContext2D, w: CanvasRenderingContext2D, z: number, x: number, y: number, T: number, grout: number, P: Palette) {
  const side = diagSide(z, x, y), opposite = 3 - side;
  // The rim of a hole: the other half is open air, not wall.
  const hole = isHoleDiag(z, x, y);
  const at = ([cx, cy]: [number, number]): [number, number] => [(x + cx) * T, (y + cy) * T];
  // The two corners on the cut's ends are the ones that are neither the floor corner nor its opposite.
  const ends = [0, 1, 2, 3].filter(i => i !== side && i !== opposite);
  const tri = (c: CanvasRenderingContext2D, corner: number, fill: string) => {
    c.fillStyle = fill;
    c.beginPath();
    [corner, ...ends].forEach(i => c.lineTo(...at(CORNERS[i])));
    c.closePath();
    c.fill();
  };
  if (!hole) paintShaftWall(w, z, x, y, T, grout, opposite, P);
  const slope = slopeAt(z, x, y);
  if (slope) {
    paintTilted(g, [side, ...ends].map(i => [x + CORNERS[i][0], y + CORNERS[i][1]]), slope, T, P);
    return;
  }
  tri(g, side, P.floorGrout);
  // The floor again, a little inside, so the grout shows along its edges like on a square tile.
  g.save();
  g.beginPath();
  [side, ...ends].forEach(i => g.lineTo(...at(CORNERS[i])));
  g.closePath();
  g.clip();
  g.fillStyle = P.floor;
  g.fillRect(x * T + grout, y * T + grout, T - grout, T - grout);
  g.restore();
  if (!hole) return;
  g.strokeStyle = P.ledgeRim;
  g.lineWidth = grout * 2;
  g.beginPath();
  g.moveTo(...at(CORNERS[ends[0]]));
  g.lineTo(...at(CORNERS[ends[1]]));
  g.stroke();
}

/**
 * The floor half of a diagonal tile beside diagonal stairs, lying on their slope: flat floor below
 * the slope's foot and above its head, like the stairs between. `pts` is its outline, in tiles.
 */
function paintTilted(g: CanvasRenderingContext2D, pts: number[][], s: Slope, T: number, P: Palette) {
  const u = ([x, y]: number[]) => rampAlong(s.dir, x - s.x, y - s.y);
  /** The part of an outline with u at least `a` (`sign` 1), or at most `a` (`sign` -1). */
  const cut = (poly: number[][], a: number, sign: number) => {
    const out: number[][] = [];
    poly.forEach((p, i) => {
      const q = poly[(i + 1) % poly.length], dp = (u(p) - a) * sign, dq = (u(q) - a) * sign;
      if (dp >= 0) out.push(p);
      if (dp * dq < 0) {
        const f = dp / (dp - dq);
        out.push([p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]);
      }
    });
    return out;
  };
  const band = (poly: number[][], fill: string) => {
    if (poly.length < 3) return;
    g.fillStyle = fill;
    g.beginPath();
    for (const p of poly) g.lineTo(p[0] * T, (p[1] - Math.min(1, Math.max(0, u(p))) * RISE) * T);
    g.closePath();
    g.fill();
  };
  band(cut(pts, 0, -1), P.floor);
  band(cut(cut(pts, 0, 1), 1, -1), P.stairs);
  band(cut(pts, 1, 1), P.floor);
}

/**
 * A diagonal wall in the corner `side`. Facing you (a north corner) it has a face, standing a level
 * tall on the cut, so stacked levels join up into one slanted wall. Seen from the back (a south
 * corner) nothing of it shows.
 */
function paintShaftWall(g: CanvasRenderingContext2D, z: number, x: number, y: number, T: number, grout: number, side: number, P: Palette) {
  if (side >= 2) return;
  const opposite = 3 - side;
  const at = ([cx, cy]: [number, number], up = 0): [number, number] => [(x + cx) * T, (y + cy - up) * T];
  const ends = [0, 1, 2, 3].filter(i => i !== side && i !== opposite);
  const edge = (up: number) => {
    g.beginPath();
    g.moveTo(...at(CORNERS[ends[0]], up));
    g.lineTo(...at(CORNERS[ends[1]], up));
    g.stroke();
  };
  g.fillStyle = P.wallFace;
  g.beginPath();
  [ends[0], ends[1]].forEach(i => g.lineTo(...at(CORNERS[i], 1)));
  [ends[1], ends[0]].forEach(i => g.lineTo(...at(CORNERS[i])));
  g.closePath();
  g.fill();
  g.strokeStyle = P.wallEdge;
  g.lineWidth = grout * 2;
  // A line at its foot and its top, only where the wall starts and ends: stacked levels read as one wall.
  if (!wallStandsAt(z - 1, x, y)) edge(0);
  if (!wallStandsAt(z + 1, x, y)) edge(1);
}

/** A ladder on the wall north of its tile: two rails and rungs up the wall's face (one level tall). */
function paintLadder(g: CanvasRenderingContext2D, x: number, y: number, T: number, grout: number, P: Palette) {
  const top = (y - RISE) * T, bottom = y * T;
  g.strokeStyle = P.rung;
  g.lineWidth = grout * 2;
  g.beginPath();
  for (const fx of [0.25, 0.75]) { g.moveTo((x + fx) * T, top); g.lineTo((x + fx) * T, bottom); }
  g.stroke();
  g.lineWidth = grout * 1.5;
  g.beginPath();
  for (let k = 1; k <= 4; k++) {
    const ry = top + (k / 5) * (bottom - top);
    g.moveTo((x + 0.25) * T, ry);
    g.lineTo((x + 0.75) * T, ry);
  }
  g.stroke();
}
