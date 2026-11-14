/**
 * paint.ts — painting the map's tiles, a chunk at a time.
 */
import { sealedAt, paintSealedFloor, paintSealedWall } from "./sealed";
import { isWaxedLevel, MINED, WAX_FLOOR, WAX_WALL, WOOD, type Palette, paletteOf, RISE } from "./tuning";
import { raisedLadderAt, blackAt, grateAt, diagRise, RAMP_END, RAMP_START, topAt, rockZoneAt, rubbleAt, wallBase, woodAt, splodgeAt, minedAt, waxAt, barsAt, CLIFFS, type CliffBlock, DIAG, FLOOR, isAir, isArrival, isDiagonalRamp, isRamp, LADDER, type Ramp, diagSide, isHoleDiag, shaftDiagSide, rampAlong, rampAt, rampHeight, type Slope, slopeAt, tileAt, VOID, WALL, wallFacesInto, WORLD } from "./world";

export const makeCanvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
};

/** Levels are painted in square chunks of this many tiles, as they come into view. */
export const CHUNK = 8;

/** Extra rows a chunk's layers keep above it (stairs, wall tops and slanted cliffs reach into the row behind). */
export const CHUNK_PAD_TOP = 1;

/** Which tiles' content of each layer a painting is for: a tile painted by a page belongs to exactly one page. */
export interface Own { s(x: number, y: number): boolean; w(x: number, y: number): boolean; c(x: number, y: number): boolean }

/** Everything is theirs: the owner of a whole chunk. */
const ALL: Own = { s: () => true, w: () => true, c: () => true };

/** Which of the three layers a painting makes (the others stay unmade, null). */
export interface Layers { surface: boolean; walls: boolean; cliffs: boolean }

/**
 * Paints the tiles x0..x1-1, y0..y1-1 of one level, at `T` pixels per tile, in that level's own
 * coordinates (it is shifted up by its height when drawn). Three layers, each starting
 * CHUNK_PAD_TOP rows above the block: the walls (faded by their distance from you, and shown
 * above you too), the surfaces (floors, stairs and ledge rims), and the blocks of the cliffs (faded
 * like walls, drawn over this level's floor, since a cliff may hang in front of it). Only the content
 * `own` says is the painter's is painted, and only the layers `want`ed are made.
 */
export function paintRect(z: number, T: number, x0: number, y0: number, x1: number, y1: number, own: Own, want: Layers) {
  const layer = (wanted: boolean) => {
    if (!wanted) return [null, null] as const;
    const canvas = makeCanvas((x1 - x0) * T, (y1 - y0 + CHUNK_PAD_TOP) * T);
    const c = canvas.getContext("2d")!;
    c.translate(-x0 * T, -(y0 - CHUNK_PAD_TOP) * T);
    return [canvas, c] as const;
  };
  const [surface, gs] = layer(want.surface), [walls, ws] = layer(want.walls), [cliffs, fs] = layer(want.cliffs);
  // What isn't the painter's is painted to a sink and thrown away.
  const dump = makeCanvas(1, 1).getContext("2d")!;
  const grout = Math.max(1, Math.round(T / 24));
  const rise = RISE * T;
  const P = paletteOf(z);

  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const t = tileAt(z, x, y), px = x * T, py = y * T;
    const mined = minedAt(z, x, y), Pt = mined ? MINED : P;
    // The layer's context where this tile's content is the painter's, else the sink.
    const g = gs && own.s(x, y) ? gs : dump, w = ws && own.w(x, y) ? ws : dump, f = fs && own.c(x, y) ? fs : dump;
    // A ladder stands on floor at its foot only; above that it is just the ladder on the wall.
    // (Not a ladder that begins over a floor of the level below: that floor is its foot, and a floor drawn here would hang a level up.)
    if (t === FLOOR || (t === LADDER && tileAt(z - 1, x, y) !== LADDER && tileAt(z - 1, x, y) !== FLOOR)) {
      if (t === FLOOR && grateAt(z, x, y)) paintGrate(g, px, py, T);
      else if (woodAt(z, x, y) && t === FLOOR) paintPlanks(g, px, py, T, grout);
      else if (t === FLOOR && splodgeAt(z, x, y) >= 250) {
        // A floor all waxed over is one smooth sheet: no borders between its tiles.
        g.fillStyle = WAX_FLOOR;
        g.fillRect(px, py, T, T);
      }
      else if (mined && t === FLOOR) paintCobbles(g, px, py, T, seeded(z, x, y, 4), Pt, grout);
      else {
        // A flat floor with no borders between its tiles; on stone, a few paving bricks here and there, laid differently from the walls' bricks.
        g.fillStyle = Pt.floor;
        g.fillRect(px, py, T, T);
        if (t === FLOOR && z > 0) paintFloorBricks(g, px, py, T, seeded(z, x, y, 10), Pt, grout);
      }
      // The square before a diagonal stair: the stair starts at its centre, so the half beside the stair is the ramp, tilted, and the other half stays flat floor.
      const foot = t === FLOOR ? slopeAt(z, x, y) : undefined;
      if (foot) {
        paintTilted(g, f, [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]], foot, T, waxAt(z, foot.x, foot.y) ? WAX_WALL : Pt, false);
      }
      if (t === FLOOR && sealedAt(z, x, y)) paintSealedFloor(g, z, x, y, T);
    } else if (t === WALL) {
      // Walls show no top, only what you'd see of them from the room: the face of a wall
      // with floor in front of it (below, in this view). Their other sides don't face you: nothing.
      const face = Math.round(rise);
      // (Open air inside a shaft counts as floor here: the walls round it show their faces.)
      const floorAt = (dx: number, dy: number) => wallFacesInto(z, x + dx, y + dy);
      // A diagonal south of it with its floor in the south half (and its wall in the north) only touches it at a corner: no floor in front of it, so no face; the diagonal's own slanted band, which reaches over this tile, is the face there.
      const cut = (tileAt(z, x, y + 1) === DIAG && !isHoleDiag(z, x, y + 1) && diagSide(z, x, y + 1) >= 2) || shaftDiagSide(z, x, y + 1) === 0 || shaftDiagSide(z, x, y + 1) === 1;
      if (blackAt(z, x, y)) {
        // Pitch black, whatever lies in front of it.
        w.fillStyle = "#000";
        w.fillRect(px, py + T - face, T, face);
      } else if (floorAt(0, 1) && !cut) {
        // (A wall has the look of its whole column, whatever level a piece of it is on.)
        const Pw = mined ? MINED : paletteOf(wallBase(z, x, y));
        if (waxAt(z, x, y)) paintWax(w, px, py + T - face, T, face, seeded(z, x, y, 3), grout, z, waxTopAt(z, x, y));
        else if (mined) paintRock(w, px, py + T - face, T, face, seeded(z, x, y, 5), Pw, grout);
        else {
          w.fillStyle = Pw.wallFace;
          w.fillRect(px, py + T - face, T, face);
          paintBricks(w, (u, v) => [px + u * T, py + T - v * face], seeded(z, x, y, 1), grout, Pw);
          // (The labyrinth is wax too: a few drips run down its bricks.)
          if (isWaxedLevel(wallBase(z, x, y))) paintWaxDrips(w, z, px, px + T, T, face, () => py + T - face, "rgba(222,205,140,0.75)");
        }
      }
      if (floorAt(0, 1) && !cut && sealedAt(z, x, y) && tileAt(z, x, y + 1) !== LADDER) paintSealedWall(w, z, x, y, T);
    }
    if (t === DIAG) paintDiag(g, w, f, z, x, y, T, grout, Pt);
    const sd = shaftDiagSide(z, x, y);
    if (sd >= 0 && waxAt(z, x, y)) {
      // A diagonal wall of wax going up past a floor (the end of Floor C's NE corridor): the same coated band as a wax diagonal tile's,
      // its lip and drips only on the topmost.
      if (sd < 2) {
        const ends = [0, 1, 2, 3].filter(i => i !== sd && i !== 3 - sd);
        const [ax, ay] = [(x + CORNERS[ends[0]][0]) * T, (y + CORNERS[ends[0]][1]) * T], [bx, by] = [(x + CORNERS[ends[1]][0]) * T, (y + CORNERS[ends[1]][1]) * T];
        paintWaxBand(w, z, ax, ay, bx, by, T, seeded(z, x, y, 9), grout, !(shaftDiagSide(z + 1, x, y) >= 0 && waxAt(z + 1, x, y)));
      }
    } else if (sd >= 0) {
      let k = z;
      while (k - 1 >= 1 && shaftDiagSide(k - 1, x, y) >= 0) k--;
      paintShaftWall(w, z, x, y, T, grout, sd, k === z ? P : paletteOf(k));
    }
    const block = CLIFFS[z].get(y * WORLD.w + x);
    if (block) paintCliffBlock(f, block, x, y, T);
    if (t === FLOOR && !grateAt(z, x, y) && rubbleAt(z, x, y)) paintRubble(g, px, py, T, seeded(z, x, y, 8), grout);
    if (t === FLOOR && !grateAt(z, x, y) && splodgeAt(z, x, y)) paintSplodges(g, px, py, T, seeded(z, x, y, 6), splodgeAt(z, x, y) / 255, mined);
    if (t === FLOOR && barsAt(z, x, y)) paintBars(g, x, y, barsAt(z, x, y), T, grout, P);
    if (t !== FLOOR) continue;

    // Ledges: a rim where the floor meets open air (the cliff under a southern edge is its own blocks, on the levels below).
    const edges: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    for (const [dx, dy] of edges) {
      const nx = x + dx, ny = y + dy;
      if (!isAir(z, nx, ny) || isArrival(z, x, y, nx, ny)) continue;
      g.fillStyle = rimOf(z, x, y, Pt);
      const r = grout * 2;
      if (dy < 0) g.fillRect(px, py, T, r);
      if (dy > 0) g.fillRect(px, py + T - r, T, r);
      if (dx < 0) g.fillRect(px, py, r, T);
      if (dx > 0) g.fillRect(px + T - r, py, r, T);
    }
  }

  // Ramps go last, north to south, since each one rises over the row behind it. A ladder is on the wall, so it goes up with the wall.
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const t = tileAt(z, x, y);
        // (A ladder still pulled up isn't there to paint: it lies on the floor above, drawn by the map.)
        if (t === LADDER) { if (ws && own.w(x, y) && !raisedLadderAt(x, y)) paintLadder(ws, x, y, T, grout, ladderLook(z, x, y), tileAt(z - 1, x, y) !== LADDER, tileAt(z + 1, x, y) !== LADDER); continue; }
    const r = isRamp(t) ? rampAt(z, x, y) : undefined;
    if (r && fs && own.c(x, y)) paintRamp(fs, z, x, y, r, false, T, grout, waxAt(z, x, y) ? WAX_WALL : woodAt(z, x, y) ? WOOD : minedAt(z, x, y) ? MINED : P);
  }
  return { surface, walls, cliffs };
}

/**
 * Paints a CHUNK x CHUNK block of one level (all of it, all three layers). Null if the block has
 * nothing to paint. (The 2D renderer paints the map in these.)
 */
export function paintChunk(z: number, T: number, cx: number, cy: number) {
  const x0 = cx * CHUNK, y0 = cy * CHUNK;
  let any = false;
  for (let y = y0; y < y0 + CHUNK && !any; y++) for (let x = x0; x < x0 + CHUNK; x++) if (tileAt(z, x, y) !== VOID || CLIFFS[z].has(y * WORLD.w + x)) { any = true; break; }
  if (!any) return null;
  const made = paintRect(z, T, x0, y0, x0 + CHUNK, y0 + CHUNK, ALL, { surface: true, walls: true, cliffs: true });
  return { surface: made.surface!, walls: made.walls!, cliffs: made.cliffs! };
}

/** A small seeded random: a tile always gets the same numbers, so its markings never change or repeat from tile to tile. */
function seeded(z: number, x: number, y: number, salt: number) {
  let h = (Math.imul(z + 1, 73856093) ^ Math.imul(x + 1, 19349663) ^ Math.imul(y + 1, 83492791) ^ Math.imul(salt + 1, 2654435761)) >>> 0;
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Where a point of a wall face goes on the canvas: u across it (0 to 1), v up it (0 to 1, one level). */
type FaceMap = (u: number, v: number) => [number, number];

/** Part of the walls get a few stone bricks marked on them (chosen from a staggered course of bricks), most stay bare. */
const BRICK_CHANCE = 0.4;

/**
 * Marks a couple of stone bricks on a wall face, outlined in the wall's edge colour. `map` puts the
 * face on the canvas, so a flat wall's courses run level and a diagonal wall's run slanted along
 * its cut: which tells the two apart at a glance. The same `rng` always picks the same bricks.
 */
function paintBricks(g: CanvasRenderingContext2D, map: FaceMap, rng: () => number, grout: number, P: Palette) {
  if (P === WAX_WALL) return;
  // Rock instead of brick: a few uneven stones, now and then.
  if (P === MINED) {
    if (rng() > 0.6) return;
    g.save();
    g.lineJoin = "round";
    g.lineWidth = Math.max(1, grout);
    g.strokeStyle = "rgba(0,0,0,0.5)";
    for (let n = 1 + Math.floor(rng() * 3); n > 0; n--) {
      const u = 0.1 + rng() * 0.7, v = 0.1 + rng() * 0.6, w = 0.12 + rng() * 0.12, h = 0.15 + rng() * 0.15;
      g.beginPath();
      [[u, v], [u + w, v + (rng() - 0.5) * 0.05], [u + w * (0.9 + rng() * 0.2), v + h], [u + (rng() - 0.5) * 0.04, v + h * (0.9 + rng() * 0.2)]].forEach(([a, b]) => g.lineTo(...map(a, b)));
      g.closePath();
      g.fillStyle = rng() < 0.5 ? "rgba(255,245,230,0.08)" : "rgba(0,0,0,0.2)";
      g.fill();
      g.stroke();
    }
    g.restore();
    return;
  }
  if (rng() > BRICK_CHANCE) return;
  // Five courses a level tall; every other one shifted half a brick. Only whole bricks.
  const bw = 0.25, bh = 0.2, cells: [number, number][] = [];
  for (let row = 0; row < 5; row++) {
    const odd = row % 2;
    for (let i = 0; i < (odd ? 3 : 4); i++) cells.push([(odd ? bw / 2 : 0) + i * bw, row * bh]);
  }
  const gap = 0.012;
  g.save();
  g.strokeStyle = P.wallEdge;
  g.fillStyle = P.wallEdge;
  g.lineWidth = Math.max(1, grout);
  g.lineJoin = "round";
  for (let n = 2 + Math.floor(rng() * 3); n > 0; n--) {
    const [u, v] = cells.splice(Math.floor(rng() * cells.length), 1)[0];
    g.beginPath();
    [[u + gap, v + gap], [u + bw - gap, v + gap], [u + bw - gap, v + bh - gap], [u + gap, v + bh - gap]].forEach(([a, b]) => g.lineTo(...map(a, b)));
    g.closePath();
    g.globalAlpha = 0.12;
    g.fill();
    g.globalAlpha = 0.6;
    g.stroke();
  }
  g.restore();
}

/**
 * Metal bars across a floor tile, straight bars standing along a diagonal of the tile (from corner to
 * corner), one level tall: a rail along the floor, a rail along the top and the bars between them.
 * The gaps between them are open, so you see through.
 */
/** Wooden planks: boards across the way, with dark gaps between them and a grain line or two. */
function paintPlanks(g: CanvasRenderingContext2D, px: number, py: number, T: number, grout: number) {
  g.fillStyle = WOOD.floorGrout;
  g.fillRect(px, py, T, T);
  const n = 4, bh = T / n;
  for (let k = 0; k < n; k++) {
    g.fillStyle = k % 2 ? "#7b5b37" : "#82613c";
    g.fillRect(px, py + k * bh + grout, T, bh - grout);
    g.fillStyle = "rgba(0,0,0,0.15)";
    g.fillRect(px + T * 0.1, py + k * bh + bh * 0.55, T * 0.8, Math.max(1, grout * 0.7));
  }
}

/**
 * Wax that has run over a floor: pale, uneven splodges with a dark rim and a lit lump, more of them (and
 * the whole floor tinted, at 1) the more it has run. `dark` is for the mined floors, where the wax is dirtier.
 */
function paintSplodges(g: CanvasRenderingContext2D, px: number, py: number, T: number, rng: () => number, amount: number, dark: boolean) {
  g.save();
  // (Few and small: a splodge here and there, not a pattern.)
  const count = rng() < (amount >= 1 ? 0.3 : amount * 0.4) ? 1 : 0;
  for (let n = 0; n < count; n++) {
    // (Whole inside its tile, so no edge of a page or a tile cuts it.)
    const r = T * (0.06 + rng() * 0.06), m = r * 1.7;
    const cx = px + m + rng() * (T - 2 * m), cy = py + m + rng() * (T - 2 * m);
    // A lump made of a few overlapping rounds.
    const rounds: [number, number, number][] = [[0, 0, 1]];
    for (let k = 0; k < 3; k++) rounds.push([(rng() - 0.5) * r * 1.2, (rng() - 0.5) * r * 1.2, 0.5 + rng() * 0.4]);
    g.fillStyle = dark ? "rgba(120,104,52,0.75)" : "rgba(231,216,140,0.8)";
    g.strokeStyle = "rgba(70,56,22,0.55)";
    g.lineWidth = Math.max(1, T / 40);
    for (const [ox, oy, s] of rounds) {
      g.beginPath();
      g.ellipse(cx + ox, cy + oy, r * s, r * s * 0.8, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    g.fillStyle = "rgba(255,248,205,0.35)";
    g.beginPath();
    g.ellipse(cx - r * 0.25, cy - r * 0.25, r * 0.35, r * 0.25, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

/** Paving bricks on a stone floor: a few, in a running bond of wide, low bricks (the walls' are narrower and taller), now and then. */
function paintFloorBricks(g: CanvasRenderingContext2D, px: number, py: number, T: number, rng: () => number, P: Palette, grout: number) {
  if (rng() > 0.5) return;
  const bw = 0.5, bh = 0.25, cells: [number, number][] = [];
  for (let row = 0; row < 4; row++) for (let i = 0; i < 2; i++) cells.push([(row % 2 ? -0.25 : 0) + i * bw, row * bh]);
  g.save();
  g.beginPath();
  g.rect(px, py, T, T);
  g.clip();
  g.lineJoin = "round";
  g.lineWidth = Math.max(1, grout);
  for (let n = 2 + Math.floor(rng() * 3); n > 0 && cells.length; n--) {
    const [u, v] = cells.splice(Math.floor(rng() * cells.length), 1)[0];
    g.beginPath();
    g.rect(px + (u + 0.015) * T, py + (v + 0.02) * T, (bw - 0.03) * T, (bh - 0.04) * T);
    g.fillStyle = rng() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.1)";
    g.fill();
    g.strokeStyle = P.floorGrout;
    g.globalAlpha = 0.7;
    g.stroke();
    g.globalAlpha = 1;
  }
  g.restore();
}

/** A grate coated in wax: pale bars round and across each tile, with beads of wax where they cross; the holes between are open (what lies below shows). */
function paintGrate(g: CanvasRenderingContext2D, px: number, py: number, T: number) {
  const b = Math.max(2, T * 0.09);
  g.save();
  g.fillStyle = "#a8964f";
  g.fillRect(px, py, T, b);
  g.fillRect(px, py + T - b, T, b);
  g.fillRect(px, py, b, T);
  g.fillRect(px + T - b, py, b, T);
  g.fillRect(px + T / 2 - b * 0.75, py, b * 1.5, T);
  g.fillRect(px, py + T / 2 - b * 0.75, T, b * 1.5);
  g.fillStyle = "#dccd8c";
  g.fillRect(px, py, T, b * 0.35);
  g.fillRect(px, py + T / 2 - b * 0.75, T, b * 0.35);
  g.fillRect(px, py + T - b, T, b * 0.35);
  for (const [cx, cy] of [[0.5, 0.5], [0, 0.5], [1, 0.5], [0.5, 0], [0.5, 1]]) {
    g.fillStyle = "#c9b873";
    g.beginPath();
    g.arc(px + cx * T, py + cy * T, b * 1.1, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

/**
 * A mined floor: round, uneven cobbles of dark rock bedded in near-black grout, a few of them lighter or darker.
 */
function paintCobbles(g: CanvasRenderingContext2D, px: number, py: number, T: number, rng: () => number, P: Palette, grout: number) {
  // A flat floor, with no lines between the tiles, and on some tiles a few cobbles, the way some bricks show on a wall.
  g.fillStyle = P.floor;
  g.fillRect(px, py, T, T);
  if (rng() > 0.55) return;
  for (let n = 1 + Math.floor(rng() * 3); n > 0; n--) {
    const cx = px + T * (0.18 + rng() * 0.64), cy = py + T * (0.18 + rng() * 0.64);
    const rx = T * (0.09 + rng() * 0.07), ry = rx * (0.7 + rng() * 0.2);
    g.beginPath();
    g.ellipse(cx, cy, rx, ry, (rng() - 0.5) * 0.6, 0, Math.PI * 2);
    g.fillStyle = rng() < 0.5 ? "rgba(255,245,230,0.09)" : "rgba(0,0,0,0.2)";
    g.fill();
    g.strokeStyle = "rgba(0,0,0,0.5)";
    g.lineWidth = Math.max(1, grout);
    g.stroke();
  }
}

/** The palette of a ladder: the same all the way up its column (the ladder of the tunnels is rock-coloured, the long one the cold stone of the shaft), whatever level a piece of it is on. */
export function ladderLook(z: number, x: number, y: number): Palette {
  if (minedAt(z, x, y)) return MINED;
  let k = z;
  while (k - 1 >= 0 && tileAt(k - 1, x, y) === LADDER) k--;
  return paletteOf(Math.max(1, k));
}

/**
 * The face of a mined wall: bare rock, in rough boulders and cracks, with no bricks and a ragged,
 * uneven look.
 */
function paintRock(g: CanvasRenderingContext2D, x: number, y: number, T: number, face: number, rng: () => number, P: Palette, grout: number) {
  g.save();
  g.fillStyle = P.wallFace;
  g.fillRect(x, y, T, face);
  // Layers of rock, running across the face and on over the next tile (the wobble depends on where along the wall it is, not on the tile), so the wall reads as strata, not as the cobbled floor.
  g.lineWidth = Math.max(1, grout);
  for (let n = 0; n < 3; n++) {
    g.strokeStyle = n === 1 ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.32)";
    g.beginPath();
    for (let k = 0; k <= 8; k++) {
      const px = x + (T * k) / 8, py = y + face * (0.2 + 0.3 * n) + Math.sin((px / T) * 5.3 + n * 2.1) * face * 0.035;
      if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.stroke();
  }
  // A flat face, and on some tiles a few boulders and a crack, the way some bricks show on a wall (kept whole inside the tile, so no edge cuts them).
  if (rng() > 0.6) { g.restore(); return; }
  g.lineJoin = "round";
  g.lineWidth = Math.max(1, grout);
  g.strokeStyle = "rgba(0,0,0,0.5)";
  for (let n = 1 + Math.floor(rng() * 3); n > 0; n--) {
    const r = T * (0.08 + rng() * 0.08), m = r * 1.5;
    const cx = x + m + rng() * (T - 2 * m), cy = y + m + rng() * (face - 2 * m);
    const sides = 6 + Math.floor(rng() * 3);
    g.beginPath();
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2, rr = r * (0.75 + rng() * 0.5);
      g.lineTo(cx + Math.cos(a) * rr * 1.2, cy + Math.sin(a) * rr);
    }
    g.closePath();
    g.fillStyle = rng() < 0.5 ? "rgba(255,245,230,0.07)" : "rgba(0,0,0,0.2)";
    g.fill();
    g.stroke();
  }
  // Cracks.
  g.strokeStyle = "rgba(0,0,0,0.45)";
  for (let n = rng() < 0.4 ? 1 : 0; n > 0; n--) {
    let cx = x + T * (0.3 + rng() * 0.4), cy = y + rng() * face * 0.4;
    g.beginPath();
    g.moveTo(cx, cy);
    for (let k = 0; k < 3; k++) { cx += (rng() - 0.5) * T * 0.15; cy += face * (0.1 + rng() * 0.15); g.lineTo(cx, cy); }
    g.stroke();
  }
  g.restore();
}

/**
 * The slanted face of a wall of wax (a diagonal tile's band): a parallelogram a level tall over the cut from
 * (ax, ay) to (bx, by), coated in the same pale wax, with folds, a bright lip along the top and drips that run
 * straight down.
 */
function paintWaxBand(g: CanvasRenderingContext2D, z: number, ax: number, ay: number, bx: number, by: number, T: number, rng: () => number, _grout: number, top = true) {
  const face = Math.round(RISE * T);
  const left = Math.min(ax, bx), width = Math.abs(bx - ax);
  g.save();
  g.beginPath();
  // (A pixel over at the top and the foot, so stacked levels leave no thin line between them.)
  g.moveTo(ax, ay - face - 1); g.lineTo(bx, by - face - 1); g.lineTo(bx, by + 1); g.lineTo(ax, ay + 1);
  g.closePath();
  g.clip();
  const topY = Math.min(ay, by) - face - 1;
  g.fillStyle = WAX_BODY;
  g.fillRect(left, topY, width, Math.max(ay, by) - topY);
  // The cut's height (the foot of the face) at a given x.
  const footAt = (px: number) => ay + (by - ay) * ((px - ax) / (bx - ax));
  for (let n = 0; n < 3; n++) {
    const w = T * (0.04 + rng() * 0.06), px = left + w + rng() * (width - 2 * w), len = face * (0.35 + rng() * 0.6);
    g.fillStyle = rng() < 0.5 ? "rgba(255,244,200,0.28)" : "rgba(70,55,20,0.22)";
    g.beginPath();
    g.roundRect(px, footAt(px) - face + rng() * (face - len), w, len, w / 2);
    g.fill();
  }
  if (top) paintWaxDrips(g, z, left, left + width, T, face, px => footAt(px) - face);
  g.restore();
}

/**
 * Rubble on a floor: grey stones of all sizes and a loose brick or two, lying where they fell (all inside the tile).
 */
function paintRubble(g: CanvasRenderingContext2D, px: number, py: number, T: number, rng: () => number, grout: number) {
  g.save();
  g.lineJoin = "round";
  g.lineWidth = Math.max(1, grout * 0.8);
  const place = (m: number): [number, number] => [px + m + rng() * (T - 2 * m), py + m + rng() * (T - 2 * m)];
  // Stones.
  for (let n = 3 + Math.floor(rng() * 4); n > 0; n--) {
    const r = T * (0.025 + rng() * 0.06), [cx, cy] = place(r * 1.4);
    const sides = 5 + Math.floor(rng() * 3);
    g.beginPath();
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2 + rng() * 0.4, rr = r * (0.7 + rng() * 0.5);
      g.lineTo(cx + Math.cos(a) * rr * 1.2, cy + Math.sin(a) * rr);
    }
    g.closePath();
    const shade = 90 + Math.floor(rng() * 70);
    g.fillStyle = `rgb(${shade},${shade},${shade + 4})`;
    g.fill();
    g.strokeStyle = "rgba(0,0,0,0.55)";
    g.stroke();
    g.fillStyle = "rgba(255,255,255,0.18)";
    g.beginPath();
    g.arc(cx - r * 0.3, cy - r * 0.3, r * 0.3, 0, Math.PI * 2);
    g.fill();
  }
  // Loose bricks.
  for (let n = rng() < 0.6 ? 1 + Math.floor(rng() * 2) : 0; n > 0; n--) {
    const bw = T * (0.14 + rng() * 0.06), bh = bw * 0.5, [cx, cy] = place(bw * 0.75);
    g.save();
    g.translate(cx, cy);
    g.rotate((rng() - 0.5) * 1.6);
    g.fillStyle = rng() < 0.5 ? "#6f4638" : "#7d5242";
    g.fillRect(-bw / 2, -bh / 2, bw, bh);
    g.strokeStyle = "rgba(0,0,0,0.6)";
    g.strokeRect(-bw / 2, -bh / 2, bw, bh);
    g.fillStyle = "rgba(255,230,200,0.15)";
    g.fillRect(-bw / 2, -bh / 2, bw, bh * 0.3);
    g.restore();
  }
  g.restore();
}

/** The colour of the body of a wall of wax: one tone, so walls and cliffs of wax stacked on one another are a single surface. */
const WAX_BODY = "#c0af6e";

/** Whether the wax wall at (x, y) of level z is the top of its stack: nothing of wax (a wall, or a dripping cliff block under a wax floor) stands right above it. */
const waxTopAt = (z: number, x: number, y: number) => {
  if (z + 1 >= WORLD.levels.length) return true;
  if (tileAt(z + 1, x, y) === WALL && waxAt(z + 1, x, y)) return false;
  const block = CLIFFS[z + 1].get(y * WORLD.w + x);
  return !(block && splodgeAt(block.z, x, y) >= 250);
};

/** The colour of the line along a floor's edge over open air: that of the floor it borders (a floor all waxed over has a pale wax edge, dug-out ground a dark rock one). */
const rimOf = (z: number, x: number, y: number, P: Palette) => (splodgeAt(z, x, y) >= 250 ? "#d6c77c" : P.ledgeRim);

/** A number in [0, 1) from a level and a slot, the same wherever it is asked: the drips are a texture of the world, not of a tile. */
function slotHash(z: number, slot: number, salt: number) {
  let h = Math.imul(slot ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(z + 1, 0xc2b2ae35) ^ Math.imul(salt + 7, 0x27d4eb2f);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/**
 * Drips of wax hanging from the top of a wall's face, from `left` to `right` (pixels), a few and far between. Where they hang is
 * a pattern laid over the whole world (three places to a tile, a fifth of them with a drip), so a straight wall and a diagonal
 * one, tile after tile, read as one wall; `lipAt` is the height of the top of the face at a pixel along it.
 */
function paintWaxDrips(g: CanvasRenderingContext2D, z: number, left: number, right: number, T: number, face: number, lipAt: (px: number) => number, color = "#e6d79b") {
  const SLOTS = 3;
  g.fillStyle = color;
  for (let s = Math.floor((left / T) * SLOTS); s <= Math.floor((right / T) * SLOTS); s++) {
    if (slotHash(z, s, 0) > 0.2) continue;
    // (In the middle half of its slot, so a drip never touches its tile's edge.)
    const px = ((s + 0.25 + 0.5 * slotHash(z, s, 1)) / SLOTS) * T;
    if (px < left || px >= right) continue;
    const w = T * (0.045 + 0.04 * slotHash(z, s, 2)), len = face * (0.18 + 0.4 * slotHash(z, s, 3)), top = lipAt(px);
    g.beginPath();
    g.roundRect(px - w / 2, top, w, len, w / 2);
    g.fill();
    g.beginPath();
    g.arc(px, top + len, w * 0.75, 0, Math.PI * 2);
    g.fill();
  }
}

/**
 * The face of a wall of wax: smooth, pale candle wax that has run down in thick drips and set in
 * folds, with a bright, rounded lip along the top and a pool at the foot.
 */
function paintWax(g: CanvasRenderingContext2D, x: number, y: number, T: number, face: number, rng: () => number, _grout: number, z: number, top = true) {
  g.save();
  g.beginPath();
  g.rect(x, y, T, face);
  g.clip();
  // (One colour all down, not a fade from top to foot in each block: stacked blocks are one surface. And drips start only at the top of the whole stack.)
  g.fillStyle = WAX_BODY;
  g.fillRect(x, y, T, face);
  // Folds: long soft streaks, lighter and darker.
  for (let n = 0; n < 3; n++) {
    const w = T * (0.04 + rng() * 0.07), fx = x + rng() * (T - w), len = face * (0.35 + rng() * 0.65);
    g.fillStyle = rng() < 0.5 ? "rgba(255,244,200,0.28)" : "rgba(70,55,20,0.22)";
    g.beginPath();
    g.roundRect(fx, y + rng() * (face - len), w, len, w / 2);
    g.fill();
  }
  // Drips hanging from the top, ending in round beads. (No lines along the top or the foot of the face.)
  if (top) paintWaxDrips(g, z, x, x + T, T, face, () => y);
  g.restore();
}

function paintBars(g: CanvasRenderingContext2D, x: number, y: number, dir: number, T: number, grout: number, P: Palette) {
  const face = Math.round(RISE * T);
  // The two ends on the floor: the / diagonal runs from the north-east corner to the south-west one.
  const [ax, ay, bx, by] = dir === 1 ? [x + 1, y, x, y + 1] : [x, y, x + 1, y + 1];
  g.save();
  g.strokeStyle = P.rung;
  g.lineCap = "round";
  g.lineWidth = grout * 2;
  g.beginPath();
  g.moveTo(ax * T, ay * T); g.lineTo(bx * T, by * T);
  g.moveTo(ax * T, ay * T - face); g.lineTo(bx * T, by * T - face);
  g.stroke();
  g.lineWidth = grout * 1.5;
  g.beginPath();
  const n = 5;
  for (let k = 0; k <= n; k++) {
    const s = k / n, px = (ax + (bx - ax) * s) * T, py = (ay + (by - ay) * s) * T;
    g.moveTo(px, py); g.lineTo(px, py - face);
  }
  g.stroke();
  g.restore();
}

/** One level's slice of a cliff, in the colour of the floor it hangs from. Under the rim of a hole it slants with the cut, reaching a row up. */
function paintCliffBlock(f: CanvasRenderingContext2D, block: CliffBlock, x: number, y: number, T: number) {
  // A cliff under a floor all waxed over is a wall of wax, with its drips (under the rim of a hole too: the slanted band).
  if (splodgeAt(block.z, x, y) >= 250) {
    const grout = Math.max(1, Math.round(T / 24));
    if (block.diag < 0) paintWax(f, x * T, y * T, T, Math.round(RISE * T), seeded(block.z, x, y, 13), grout, block.z, block.top);
    else if (block.diag === 0) paintWaxBand(f, block.z, x * T, (y + 1) * T, (x + 1) * T, y * T, T, seeded(block.z, x, y, 13), grout, block.top);
    else paintWaxBand(f, block.z, x * T, y * T, (x + 1) * T, (y + 1) * T, T, seeded(block.z, x, y, 13), grout, block.top);
    return;
  }
  // A cliff over a dug-out floor is the rock wall of the pit, whatever floor it hangs from.
  let rock = false;
  for (let k = 1; k < block.z && !rock; k++) rock = rockZoneAt(k, x, y + 1);
  const P = rock ? MINED : paletteOf(block.z), px = x * T, py = y * T;
  // (Rock cliffs have the colour of the rock walls beside them, not a darker one of their own.)
  f.fillStyle = rock ? P.wallFace : P.ledgeFace;
  if (block.diag < 0) {
    f.fillRect(px, py, T, T);
    if (!rock && isWaxedLevel(block.z)) paintWaxDrips(f, block.z, px, px + T, T, Math.round(RISE * T), () => py, "rgba(222,205,140,0.75)");
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
  // (Only where something open lies in front of it: against a wall it can't be seen.)
  // (Not inside a run of stairs side by side: only the outer side shows.)
  const southRamp = rampAt(z, x, y + 1);
  if (!isDiagonalRamp(r.dir) && pal !== WOOD && tileAt(z, x, y + 1) !== WALL && !(southRamp && southRamp.dir === r.dir)) poly([sw, se, [(x + 1) * T, (y + 1) * T], [x * T, (y + 1) * T]], pal.wallFace);

  const top: [number, number][] = [P(x, y), P(x + 1, y), se, sw];
  if (ladder) {
    poly(top, pal.wallFace);
    // Two rails and some rungs.
    for (const fx of [0.25, 0.75]) seg(P(x + fx, y + 1), P(x + fx, y), pal.rung, grout * 2);
    for (let k = 1; k <= 3; k++) seg(P(x + 0.25, y + 1 - k / 4), P(x + 0.75, y + 1 - k / 4), pal.rung, grout * 1.5);
    return;
  }
  // A ramp of wax is one smooth, flat slope: no steps, no seams between its tiles.
  if (pal === WAX_WALL) {
    const grow = Math.max(1, Math.round(T / 40));
    g.save();
    g.fillStyle = WAX_FLOOR;
    g.strokeStyle = WAX_FLOOR;
    g.lineWidth = grow * 2;
    g.lineJoin = "round";
    g.beginPath();
    top.forEach(([a, b]) => g.lineTo(a, b));
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    // (Splodges lie on it as on the wax floor: few, small, lying on the slope.)
    const rr = seeded(z, x, y, 12);
    if (rr() < 0.4) {
      const fx = 0.25 + rr() * 0.5, fy = 0.25 + rr() * 0.5, [cx, cy] = P(x + fx, y + fy), r = T * (0.06 + rr() * 0.05);
      g.save();
      g.fillStyle = "rgba(231,216,140,0.8)";
      g.strokeStyle = "rgba(70,56,22,0.55)";
      g.lineWidth = Math.max(1, T / 40);
      g.beginPath();
      g.ellipse(cx, cy, r, r * 0.7, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.restore();
    }
    return;
  }
  // Wooden stairs are planks laid along the way, lying on the slope, with no steps drawn.
  if (pal === WOOD) {
    poly(top, WOOD.floorGrout);
    const n = 4, along = r.dir === "up" || r.dir === "down";
    for (let k = 0; k < n; k++) {
      const a = k / n + 0.02, b = (k + 1) / n - 0.02;
      const at = (fx: number, fy: number) => P(x + fx, y + fy);
      poly(along ? [at(a, 0), at(b, 0), at(b, 1), at(a, 1)] : [at(0, a), at(1, a), at(1, b), at(0, b)], k % 2 ? "#7b5b37" : "#82613c");
    }
    return;
  }
  poly(top, pal.stairs);
  // Step edges across the slope.
  // Three treads of the same size, marked by lines across the slope: one at the foot (the start, a
  // dark base line), two between, and one at the top (the finish, a light lip on the edge). The
  // diagonal stairs come to a point at both ends, so they have only the two between.
  const STEPS = 3;
  const diagonal = isDiagonalRamp(r.dir);
  // (No line at the foot or the top: only the edges between the treads.)
  for (let k = 1; k <= STEPS - 1; k++) {
    const s = diagonal && r.centered ? -0.5 + (k * 2) / 3 : k / STEPS;
    const color = k === 0 ? pal.wallEdge : k === STEPS ? pal.floor : pal.floorGrout;
    const width = k === 0 || k === STEPS ? grout * 2 : grout * 1.5;
    if (diagonal) {
      // Across the tile from edge to edge, square to the way uphill.
      const sum = 2 * s;
      const a: [number, number] = sum <= 1 ? [sum, 0] : [1, sum - 1], b: [number, number] = sum <= 1 ? [0, sum] : [sum - 1, 1];
      // (Worked out for a slope toward the south-east; the other corners are that one mirrored.)
      const at = ([fx, fy]: [number, number]) => P(x + (r.dir === "sw" ? 1 - fx : fx), y + (r.dir === "ne" ? 1 - fy : fy));
      seg(at(a), at(b), color, width);
    } else if (r.dir === "up" || r.dir === "down") {
      const fy = r.dir === "up" ? 1 - s : s;
      seg(P(x, y + fy), P(x + 1, y + fy), color, width);
    } else {
      const fx = r.dir === "right" ? s : 1 - s;
      seg(P(x + fx, y), P(x + fx, y + 1), color, width);
    }
  }
}

/** The tile's corners, in order: north-west, north-east, south-west, south-east (the order of DIAG_CHARS). */
const CORNERS: [number, number][] = [[0, 0], [1, 0], [0, 1], [1, 1]];

/** A diagonal tile: its floor triangle (on `g`), its wall triangle (the face of the wall, on `w`) and a rim along the cut. */
function paintDiag(g: CanvasRenderingContext2D, w: CanvasRenderingContext2D, f: CanvasRenderingContext2D, z: number, x: number, y: number, T: number, grout: number, P: Palette) {
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
  // (No wall face on the tile where a diagonal stair finishes: its wall half is just the solid under the floor above, and the ramp rises right up to it.)
  if (!hole && (topAt(z, x, y) !== 2 || waxAt(z, x, y))) {
    if (waxAt(z, x, y)) {
      // A wall of wax: the band is coated, like the wax walls; the floor half is the ordinary floor.
      const [ax, ay] = at(CORNERS[ends[0]]), [bx, by] = at(CORNERS[ends[1]]);
      paintWaxBand(w, z, ax, ay, bx, by, T, seeded(z, x, y, 9), grout, !((tileAt(z + 1, x, y) === DIAG || shaftDiagSide(z + 1, x, y) >= 0) && waxAt(z + 1, x, y)));
    } else {
      paintShaftWall(w, z, x, y, T, grout, opposite, P);
      // (The labyrinth is wax: its diagonal walls drip too, along the slanted top of the band.)
      if (isWaxedLevel(wallBase(z, x, y)) && opposite < 2) {
        const [ax, ay] = at(CORNERS[ends[0]]), [bx, by] = at(CORNERS[ends[1]]);
        const face = Math.round(RISE * T);
        paintWaxDrips(w, z, Math.min(ax, bx), Math.max(ax, bx), T, face, px => ay + (by - ay) * ((px - ax) / (bx - ax)) - face, "rgba(222,205,140,0.75)");
      }
    }
  }
  const slope = slopeAt(z, x, y);
  if (slope) {
    paintTilted(g, f, [side, ...ends].map(i => [x + CORNERS[i][0], y + CORNERS[i][1]]), slope, T, waxAt(z, slope.x, slope.y) ? WAX_WALL : P);
    return;
  }
  // (A floor all waxed over is wax in its triangles too.)
  tri(g, side, splodgeAt(z, x, y) >= 250 ? WAX_FLOOR : P.floor);
  // (Not where a diagonal stair arrives: the ramp meets the floor there.)
  if (!hole || topAt(z, x, y) === 1) return;
  g.strokeStyle = rimOf(z, x, y, P);
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
function paintTilted(g: CanvasRenderingContext2D, f: CanvasRenderingContext2D, pts: number[][], s: Slope, T: number, P: Palette, flat = true) {
  const u = ([x, y]: number[]) => rampAlong(s.dir, x - s.x, y - s.y);
  const lo = s.centered ? RAMP_START : 0, hi = s.centered ? RAMP_END : 1;
  const rise = (a: number) => (s.centered ? diagRise(a) : Math.min(1, Math.max(0, a)));
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
  /** A band of the outline, lying at its height: the flat parts on the floor's layer, the sloped part with the stairs (their layer shows by wall logic, so it can be seen from below as well). */
  const band = (poly: number[][], fill: string, c: CanvasRenderingContext2D) => {
    if (poly.length < 3) return;
    c.fillStyle = fill;
    c.beginPath();
    for (const p of poly) c.lineTo(p[0] * T, (p[1] - rise(u(p)) * RISE) * T);
    c.closePath();
    c.fill();
  };
  if (flat) band(cut(pts, lo, -1), P.floor, g);
  band(cut(cut(pts, lo, 1), hi, -1), P.stairs, f);
  if (flat) band(cut(pts, hi, 1), P.floor, g);
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
  // The slanted face is a band a tile tall: a triangle inside its own tile and one over the tile
  // north of it, so the wall's top line runs on diagonally instead of in steps.
  g.fillStyle = P.wallFace;
  g.beginPath();
  // (A pixel over at the top and the foot, so stacked levels leave no thin line between them.)
  [ends[0], ends[1]].forEach(i => g.lineTo(...at(CORNERS[i], 1 + 1 / T)));
  [ends[1], ends[0]].forEach(i => g.lineTo(...at(CORNERS[i], -1 / T)));
  g.closePath();
  g.fill();
  // The bricks lie along the cut and rise from it: the same ones in both halves of the band, whichever tile paints them.
  const [ax, ay] = at(CORNERS[ends[0]]), [bx, by] = at(CORNERS[ends[1]]);
  paintBricks(g, (u, v) => [ax + u * (bx - ax), ay + u * (by - ay) - v * T], seeded(z, x, y, 2), grout, P);
}

/** A ladder on the wall north of its tile: two rails and rungs up the wall's face (one level tall). */
function paintLadder(g: CanvasRenderingContext2D, x: number, y: number, T: number, grout: number, P: Palette, start: boolean, finish: boolean) {
  const top = (y - RISE) * T, bottom = y * T, left = (x + 0.25) * T, right = (x + 0.75) * T;
  g.strokeStyle = P.rung;
  g.lineCap = "round";
  g.lineWidth = grout * 2;
  g.beginPath();
  for (const rx of [left, right]) { g.moveTo(rx, top); g.lineTo(rx, bottom); }
  g.stroke();
  // Rungs a fifth of a level apart, the first and the last half a step from the level's ends: where one level's ladder meets the next the gap is the same as everywhere else.
  g.lineWidth = grout * 1.5;
  g.beginPath();
  for (let k = 0; k < 5; k++) {
    const ry = bottom - ((k + 0.5) / 5) * (bottom - top);
    g.moveTo(left, ry);
    g.lineTo(right, ry);
  }
  g.stroke();
  g.lineWidth = grout * 2;
  g.beginPath();
  // The start, where the ladder meets the floor: a foot at the bottom of each rail.
  if (start) for (const [rx, out] of [[left, -1], [right, 1]]) { g.moveTo(rx, bottom - grout); g.lineTo(rx + out * 0.1 * T, bottom - grout); }
  // The finish, at the top: the rails end in a bar across, and hooks that turn outward to grip the ledge.
  if (finish) {
    const ty = top + grout * 2;
    g.moveTo(left, ty);
    g.lineTo(right, ty);
    for (const [rx, out] of [[left, -1], [right, 1]]) { g.moveTo(rx, ty); g.lineTo(rx + out * 0.1 * T, ty); }
  }
  g.stroke();
  g.lineCap = "butt";
}
