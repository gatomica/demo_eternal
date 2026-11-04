/**
 * rooms.ts — what is a room: the map's tiles that sight crosses, cut into regions (the connected
 * stretches of open space and of narrow passage on one level) and the regions into rooms.
 *
 * A room is a space you can see across wholly: its pieces (a piece is a region with its passages cut
 * at every branch and bend, so each straight run is its own piece) are joined by open air (a ledge you
 * could look down over, a shaft), so a hall with its bridges and the floors under them is one
 * room, whatever levels it takes. A straight stretch of corridor, a doorway or a stair is a room of
 * its own, and so is every branch off one, and every leg of a bend. Sight
 * (see `sight`) starts a new, small, light at every step from one room into another.
 */
import { VISION_RADIUS, WALL_FADE_LEVELS } from "./tuning";
import { ISOLATED_TILES, JOIN_TILES, OPEN_TILES, PASSAGE_TILES, ROOM_FOLLOWS } from "./plans";
import { FLOOR, keepAt, isDiagonalRamp, LADDER, rampAt, STAIRS, minedAt, topAt, DIAG, diagSide, inside, isAir, isRamp, isShaft, LEVELS, slopeAt, tileAt, VOID, walkable, WORLD } from "./world";

/** Tiles sight travels over on level z: walkable ones, plus the space above stairs from below. */
const seesThrough = (z: number, x: number, y: number) => walkable(tileAt(z, x, y)) || isRamp(tileAt(z - 1, x, y)) || (tileAt(z - 1, x, y) === DIAG && !!slopeAt(z - 1, x, y)) || isShaft(z, x, y);

/** The same, worked out once per tile when the map loads (sight asks it many times a frame). */
const SEE = WORLD.levels.map((_, z) => {
  const out = new Uint8Array(WORLD.w * WORLD.h);
  for (let y = 0; y < WORLD.h; y++) for (let x = 0; x < WORLD.w; x++) if (seesThrough(z, x, y)) out[y * WORLD.w + x] = 1;
  return out;
});

export const seeThrough = (z: number, x: number, y: number) =>
  z >= 0 && z < LEVELS && inside(x, y) ? SEE[z][y * WORLD.w + x] === 1 : seesThrough(z, x, y);

/**
 * Per level, how wide a place a tile is in: 0 open space (part of some 3x3 block of tiles you can
 * see across, as every tile of a room is), 1 a wide passage (part of a 2x2 block but of no 3x3: a
 * corridor two wide), 2 a thin one (one wide: corridors, doorways, bridges, stairs). Each kind is
 * a place of its own, so a corridor, of either width, is never one room with the hall it opens on.
 */
export const CLASS = WORLD.levels.map((_, z) => {
  const out = new Uint8Array(WORLD.w * WORLD.h);
  // (A diagonal tile is half wall, so it doesn't make a block: a doorway cut through a wall beside a diagonal door is not part of the hall's open space, and the line between the hall and the corridor lies on the hall's wall, not a tile behind it.)
  const block = (x: number, y: number, n: number) => {
    for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) {
      const tx = x + dx, ty = y + dy;
      if (!seeThrough(z, tx, ty)) return false;
      if (tileAt(z, tx, ty) !== DIAG) continue;
      // A diagonal tile counts only if both the tiles its floor half touches are in the block too: the corner cut of a room is part of the room's open space (so its entrances are at the room's walls), while the flank of a doorway through a wall is not.
      const floor = diagSide(z, tx, ty), vy = ty + (floor < 2 ? -1 : 1), hx = tx + (floor % 2 === 0 ? -1 : 1);
      if (vy < y || vy >= y + n || hx < x || hx >= x + n) return false;
    }
    return true;
  };
  const inBlock = (x: number, y: number, n: number) => {
    for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) if (block(x - dx, y - dy, n)) return true;
    return false;
  };
  for (let y = 0; y < WORLD.h; y++) for (let x = 0; x < WORLD.w; x++) {
    if (!seeThrough(z, x, y)) continue;
    out[y * WORLD.w + x] = inBlock(x, y, 3) ? 0 : inBlock(x, y, 2) ? 1 : 2;
  }
  // A diagonal tile is half floor, so it sits in fewer blocks than the tiles it is part of. Its floor half touches two of its sides, and it takes the width of the widest whole tile across them: the corner cut of a room stays with the room even where a corridor leaves beside it, and the flanks of a diagonal corridor join the hall at its mouth.
  const own = out.slice();
  for (let y = 0; y < WORLD.h; y++) for (let x = 0; x < WORLD.w; x++) {
    if (!seeThrough(z, x, y) || tileAt(z, x, y) !== DIAG) continue;
    const floor = diagSide(z, x, y), north = floor < 2, west = floor % 2 === 0;
    let best = 3;
    for (const [dx, dy] of [[0, north ? -1 : 1], [west ? -1 : 1, 0]]) {
      if (!seeThrough(z, x + dx, y + dy) || tileAt(z, x + dx, y + dy) === DIAG) continue;
      best = Math.min(best, own[(y + dy) * WORLD.w + x + dx]);
    }
    if (best < 3) out[y * WORLD.w + x] = best;
  }
  for (const [tz, tx, ty] of OPEN_TILES) if (tz === z) out[(ty + 1) * WORLD.w + tx + 1] = 0;
  for (const [tz, tx, ty] of PASSAGE_TILES) if (tz === z) out[(ty + 1) * WORLD.w + tx + 1] = 2;
  return out;
});

/** 1 for the tiles of a passage (of either width): everything but open space. */
export const NARROW = CLASS.map(level => level.map(c => (c > 0 ? 1 : 0)));

const { w: MW, h: MH } = WORLD;
const N = MW * MH;

/** Per level, the region of every tile sight crosses, else -1. */
export const REGION: Int32Array[] = WORLD.levels.map(() => new Int32Array(N).fill(-1));
/** The level of each region. */
export const REGION_Z: number[] = [];
/** How many regions there are. */
export let REGION_COUNT = 0;

(() => {
  for (let z = 0; z < LEVELS; z++) {
    const ids = REGION[z], narrow = CLASS[z];
    for (let start = 0; start < N; start++) {
      if (ids[start] >= 0 || !seeThrough(z, start % MW, Math.floor(start / MW))) continue;
      const id = REGION_COUNT++;
      REGION_Z[id] = z;
      const stack = [start];
      ids[start] = id;
      while (stack.length) {
        const i = stack.pop()!, x = i % MW, y = (i - x) / MW;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
          const j = ny * MW + nx;
          if (ids[j] >= 0 || !seeThrough(z, nx, ny) || narrow[j] !== narrow[i]) continue;
          ids[j] = id;
          stack.push(j);
        }
      }
    }
  }
})();

/**
 * Per level, for each tile of a narrow passage, the sides across which it is not one place with
 * the tile beside it: 1 north, 2 south, 4 west, 8 east (both tiles of a cut carry it). Where a
 * passage branches, the stem is cut off from the corridor it joins, and that corridor stays whole
 * (a junction tile belongs to the straight run through it); at a bend, one leg is cut off from the
 * other (the corner stays with the horizontal one). A straight stretch is never cut, nor is a
 * diagonal corridor, whose tiles all meet at corners.
 */
const CUT = WORLD.levels.map((_, z) => {
  const out = new Uint8Array(N);
  const bit = (dx: number, dy: number) => (dy < 0 ? 1 : dy > 0 ? 2 : dx < 0 ? 4 : 8);
  const cut = (x: number, y: number, dx: number, dy: number) => {
    out[y * MW + x] |= bit(dx, dy);
    out[(y + dy) * MW + x + dx] |= bit(-dx, -dy);
  };
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    // (Only a thin passage is cut at its branches and bends: a wide one has branches and bends in every tile.)
    if (CLASS[z][y * MW + x] !== 2 || tileAt(z, x, y) === DIAG) continue;
    const open = (dx: number, dy: number) => seeThrough(z, x + dx, y + dy) && tileAt(z, x + dx, y + dy) !== DIAG;
    const n = open(0, -1), s = open(0, 1), w = open(-1, 0), e = open(1, 0);
    const degree = +n + +s + +w + +e;
    if (degree >= 3) {
      // A branch: the run through it stays whole, the stem goes.
      if (w && e) { if (n) cut(x, y, 0, -1); if (s) cut(x, y, 0, 1); }
      else { if (w) cut(x, y, -1, 0); if (e) cut(x, y, 1, 0); }
    } else if (degree === 2 && !((n && s) || (w && e))) {
      // A bend: the vertical leg goes.
      if (n) cut(x, y, 0, -1);
      if (s) cut(x, y, 0, 1);
    }
  }
  // Tiles set apart by hand: cut off from all four neighbours.
  for (const [tz, tx, ty] of ISOLATED_TILES) if (tz === z) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) cut(tx + 1, ty + 1, dx, dy);
  return out;
});

/** Whether (x, y) on level z is part of a run of straight stairs two or more tiles long (a long ramp is a place of its own; a single step stays with its floor). */
const straight = (z: number, x: number, y: number) => {
  const r = tileAt(z, x, y) === STAIRS ? rampAt(z, x, y) : undefined;
  return !!r && !isDiagonalRamp(r.dir) && r.length >= 2;
};

/** Per level, the piece of every tile sight crosses: a region, with its passages cut at every branch and bend (see `CUT`). */
const PIECE: Int32Array[] = WORLD.levels.map(() => new Int32Array(N).fill(-1));
let pieceCount = 0;

(() => {
  for (let z = 0; z < LEVELS; z++) {
    const ids = PIECE[z], narrow = CLASS[z], cuts = CUT[z];
    for (let start = 0; start < N; start++) {
      if (ids[start] >= 0 || !seeThrough(z, start % MW, Math.floor(start / MW))) continue;
      const id = pieceCount++;
      const stack = [start];
      ids[start] = id;
      while (stack.length) {
        const i = stack.pop()!, x = i % MW, y = (i - x) / MW;
        for (const [dx, dy, bit] of [[1, 0, 8], [-1, 0, 4], [0, 1, 2], [0, -1, 1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= MW || ny >= MH || (cuts[i] & bit)) continue;
          const j = ny * MW + nx;
          // (A straight stair is a place of its own, with a line at each end: not one with the floor or the open air beside it.)
          if (ids[j] >= 0 || !seeThrough(z, nx, ny) || narrow[j] !== narrow[i] || straight(z, nx, ny) !== straight(z, x, y)) continue;
          ids[j] = id;
          stack.push(j);
        }
      }
    }
  }
})();

/** Per level, the room of every tile sight crosses (a number shared by all of the room's pieces, counting from 0), else -1. */
export const ROOM: Int32Array[] = WORLD.levels.map(() => new Int32Array(N).fill(-1));
/** How many rooms there are. */
export let ROOM_COUNT = 0;

(() => {
  const parent = Array.from({ length: pieceCount }, (_, i) => i);
  const find = (a: number): number => (parent[a] === a ? a : (parent[a] = find(parent[a])));
  const join = (a: number, b: number) => { if (a >= 0 && b >= 0) parent[find(a)] = find(b); };
  for (let z = 0; z < LEVELS; z++) for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const i = y * MW + x;
    if (PIECE[z][i] < 0) continue;
    // Inside a shaft the space runs straight down.
    // (Only where both are the same kind of place: a tube standing over a corridor's doorway cells doesn't make the corridor part of the shaft room.)
    if (z > 0 && isShaft(z, x, y) && seeThrough(z - 1, x, y) && CLASS[z][i] === CLASS[z - 1][i]) join(PIECE[z][i], PIECE[z - 1][i]);
    // Over a ledge, the first thing below: the same hall, if it is near enough to be seen together with it (further down than the map draws below you, it is another place that only happens to lie under the hole).
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!inside(nx, ny) || seeThrough(z, nx, ny) || !isAir(z, nx, ny)) continue;
      for (let k = z - 1; k >= 0; k--) {
        if (tileAt(k, nx, ny) === VOID && !isShaft(k, nx, ny)) continue;
        // (A mined tunnel or dug-out hall is a place of its own: the air beside it is not a ledge over some other hall, and nothing else's ledge opens into it.)
        if (seeThrough(k, nx, ny) && z - k < WALL_FADE_LEVELS && minedAt(z, x, y) === minedAt(k, nx, ny) && !keepAt(z, nx, ny)) join(PIECE[z][i], PIECE[k][ny * MW + nx]);
        break;
      }
    }
  }
  for (const [az, ax, ay, bz, bx, by] of JOIN_TILES) join(PIECE[az][(ay + 1) * MW + ax + 1], PIECE[bz][(by + 1) * MW + bx + 1]);
  const number = new Map<number, number>();
  for (let z = 0; z < LEVELS; z++) for (let i = 0; i < N; i++) {
    if (PIECE[z][i] < 0) continue;
    const root = find(PIECE[z][i]);
    if (!number.has(root)) number.set(root, ROOM_COUNT++);
    ROOM[z][i] = number.get(root)!;
  }

  // The flanks of a diagonal door (a diagonal tile with another, facing back at it, across its floor corner) lie in the corridor, not in the hall or the Nave it opens on: the line between them then runs from wall tip to wall tip, across the hall's corner tile or the Nave's door tile, on the room's own wall line.
  for (let z = 0; z < LEVELS; z++) for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    if (!seeThrough(z, x, y) || tileAt(z, x, y) !== DIAG) continue;
    const floor = diagSide(z, x, y), north = floor < 2, west = floor % 2 === 0;
    const ax = x + (west ? -1 : 1), ay = y + (north ? -1 : 1);
    if (!inside(ax, ay) || !seeThrough(z, ax, ay) || tileAt(z, ax, ay) !== DIAG) continue;
    const i = y * MW + x, t = (y + (north ? -1 : 1)) * MW + x, u = y * MW + x + (west ? -1 : 1);
    // The air above a flank, where it lies in a wide room (the Nave): it goes with the hole above the stair beside it.
    if (z + 1 < LEVELS && ROOM[z + 1][i] >= 0 && CLASS[z + 1][i] === 0) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const hx = x + dx, hy = y + dy;
        if (!inside(hx, hy) || !isRamp(tileAt(z, hx, hy)) || ROOM[z + 1][hy * MW + hx] < 0) continue;
        ROOM[z + 1][i] = ROOM[z + 1][hy * MW + hx];
        break;
      }
    }
    if (tileAt(z, x, y + (north ? -1 : 1)) === DIAG || tileAt(z, x + (west ? -1 : 1), y) === DIAG) continue;
    if (ROOM[z][t] < 0 || ROOM[z][u] < 0 || ROOM[z][t] === ROOM[z][u] || CLASS[z][t] === CLASS[z][u]) continue;
    const narrow = CLASS[z][t] > CLASS[z][u] ? t : u, wide = narrow === t ? u : t;
    if (ROOM[z][i] === ROOM[z][wide]) ROOM[z][i] = ROOM[z][narrow];
  }

  for (const [tz, tx, ty, rx, ry] of ROOM_FOLLOWS) ROOM[tz][(ty + 1) * MW + tx + 1] = ROOM[tz][(ry + 1) * MW + rx + 1];

  // A single tile that only joins a big room to a passage (the first tile of a tunnel leaving a hall) is part of the passage, not a place of its own.
  const count = new Map<number, number>();
  for (let z = 0; z < LEVELS; z++) for (let i = 0; i < N; i++) if (ROOM[z][i] >= 0) count.set(ROOM[z][i], (count.get(ROOM[z][i]) ?? 0) + 1);
  for (let z = 0; z < LEVELS; z++) for (let i = 0; i < N; i++) {
    const r = ROOM[z][i];
    if (r < 0 || count.get(r) !== 1) continue;
    const near = new Set<number>();
    let hall = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const j = i + dy * MW + dx;
      if (ROOM[z][j] < 0 || ROOM[z][j] === r) continue;
      near.add(ROOM[z][j]);
      if (CLASS[z][j] === 0) hall = true;
    }
    if (near.size !== 2 || !hall) continue;
    const passage = [...near].find(n => ![0, 1, 2, 3].some(k => { const j = i + [0, 0, 1, -1][k] * MW + [1, -1, 0, 0][k]; return ROOM[z][j] === n && CLASS[z][j] === 0; }));
    if (passage === undefined) continue;
    ROOM[z][i] = passage;
    count.set(r, 0);
  }
  // (And the numbers close up again.)
  const renumber = new Map<number, number>();
  ROOM_COUNT = 0;
  for (let z = 0; z < LEVELS; z++) for (let i = 0; i < N; i++) {
    const r = ROOM[z][i];
    if (r < 0) continue;
    if (!renumber.has(r)) renumber.set(r, ROOM_COUNT++);
    ROOM[z][i] = renumber.get(r)!;
  }
})();

/** The tiles of each room, as `level * (width * height) + tile`. */
export const ROOM_TILES: Int32Array[] = [];

/**
 * A line where one room meets another: along the sides of tiles side by side (a tile long), or a
 * diagonal one where those sides step round a corner (an L, or a staircase of them, as at a
 * diagonal door or corridor: one straight line from end to end, not steps), or, at a stair or
 * ladder, a point (where the room above or below it begins). The light that shows what lies past
 * it is centred on the point of the line farthest from you (see `lampCenter`).
 */
export interface Line {
  /** The level the line is seen from (the room it belongs to), and the level of the room beyond it. */
  z: number; zo: number;
  /** Its two ends, its middle, half its length and the direction along it (a unit vector), in tiles. */
  ax: number; ay: number; bx: number; by: number;
  mx: number; my: number; h: number; dx: number; dy: number;
  /** The room beyond. */
  other: number;
  /** The tiles of that room within reach of the line's light (a path of the sight radius and a bit over from the line), on level `zo`. */
  tiles: Int32Array;
  /** The tiles of the room beyond on other levels, under or over those of `tiles`, as `level * (width * height) + tile`: the floors you see through its open air. */
  deep: Int32Array;
  /**
   * For a slanted line: the tiles it cuts through (of this room or the one beyond), each with the line as
   * n . p = d in tile units, n a unit vector pointing to the room beyond's side. Half of such a tile is the
   * other room's, though a tile is only ever one room's.
   */
  cut: { t: number; nx: number; ny: number; d: number }[];
}
/** Per room, the lines where it meets its neighbours. Only a neighbour can ever be seen from a room, and only near a line. */
export const LINES: Line[][] = Array.from({ length: ROOM_COUNT }, () => []);

/**
 * Where on a line its light is centred, seen from (px, py) in the line's own level: the point of the
 * line farthest from you, which slides along it as you move. Straight in front of a line it is the
 * middle; as you step aside it moves toward the far end, which it reaches when you stand level
 * with the near one.
 */
export function lampCenter(line: Line, px: number, py: number, out: number[]) {
  const along = Math.max(-line.h, Math.min(line.h, (px - line.mx) * line.dx + (py - line.my) * line.dy));
  out[0] = line.mx - along * line.dx;
  out[1] = line.my - along * line.dy;
}

(() => {
  const lists: number[][] = Array.from({ length: ROOM_COUNT }, () => []);
  for (let z = 0; z < LEVELS; z++) for (let i = 0; i < N; i++) if (ROOM[z][i] >= 0) lists[ROOM[z][i]].push(z * N + i);
  for (const l of lists) ROOM_TILES.push(Int32Array.from(l));

  // The tiles of `room` on level z that a path of at most `limit` from tile `start` reaches (without squeezing between two corners).
  const near = new Float32Array(N).fill(Infinity);
  const flood = (z: number, start: number, room: number, limit: number) => {
    const out = [start], stack = [start];
    near[start] = 0;
    while (stack.length) {
      const i = stack.pop()!, x = i % MW, y = (i - x) / MW;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
        const j = ny * MW + nx;
        if (ROOM[z][j] !== room) continue;
        if (dx && dy && (!seeThrough(z, x + dx, y) || !seeThrough(z, x, y + dy))) continue;
        const d = near[i] + (dx && dy ? Math.SQRT2 : 1);
        if (d > limit || d >= near[j]) continue;
        if (near[j] === Infinity) out.push(j);
        near[j] = d;
        stack.push(j);
      }
    }
    for (const j of out) near[j] = Infinity;
    return Int32Array.from(out);
  };
  // (A preview can now reach as far as your sight does, so the tiles of the room beyond are gathered that far.)
  const reach = VISION_RADIUS + 1.5;

  /** Whether the side of tile (x, y) facing (dx, dy) is open to the next tile: always, except on a diagonal tile, whose floor half touches only two of its sides. */
  const sideOpen = (z: number, x: number, y: number, dx: number, dy: number) => {
    if (tileAt(z, x, y) !== DIAG) return true;
    // Which corner is floor: 0 NW, 1 NE, 2 SW, 3 SE. It touches the two sides that meet at that corner.
    const floor = diagSide(z, x, y);
    const north = floor < 2, west = floor % 2 === 0;
    return dy < 0 ? north : dy > 0 ? !north : dx < 0 ? west : !west;
  };
  /** Adds the line from (ax, ay) to (bx, by), seen from room a on level z, to room b on level zo, entered at these tiles. */
  const add = (z: number, zo: number, ax: number, ay: number, bx: number, by: number, a: number, b: number, entered: number[]) => {
    const tiles = new Set<number>();
    for (const j of entered) for (const t of flood(zo, j, b, reach)) tiles.add(t);
    const deep: number[] = [];
    for (const t of tiles) for (let k = 0; k < LEVELS; k++) if (k !== zo && ROOM[k][t] === b) deep.push(k * N + t);
    const length = Math.hypot(bx - ax, by - ay);
    const dx = length ? (bx - ax) / length : 1, dy = length ? (by - ay) / length : 0;
    const cut: Line["cut"] = [];
    if (length > 0 && ax !== bx && ay !== by) {
      // Which side the room beyond lies on: where most of its tiles' centres are.
      const n0x = -dy, n0y = dx, d0 = n0x * ax + n0y * ay;
      let side = 0;
      for (const t of tiles) {
        const off = n0x * ((t % MW) + 0.5) + n0y * (Math.floor(t / MW) + 0.5) - d0;
        if (Math.abs(off) > 0.35) side += Math.sign(off);
      }
      const sgn = side >= 0 ? 1 : -1, nx = sgn * n0x, ny = sgn * n0y, d = sgn * d0;
      // The tiles the line passes through (more than touching a corner), of either room.
      for (let y = Math.floor(Math.min(ay, by)); y < Math.ceil(Math.max(ay, by)); y++) for (let x = Math.floor(Math.min(ax, bx)); x < Math.ceil(Math.max(ax, bx)); x++) {
        // The part of the line inside the tile's square (clipped along it).
        let lo = 0, hi = length;
        for (const [p, u, min] of [[ax, dx, x], [ay, dy, y]] as const) {
          if (Math.abs(u) < 1e-9) continue;
          const s0 = (min - p) / u, s1 = (min + 1 - p) / u;
          lo = Math.max(lo, Math.min(s0, s1));
          hi = Math.min(hi, Math.max(s0, s1));
        }
        const room = ROOM[z][y * MW + x];
        if (hi - lo > 0.25 && (room === a || room === b)) cut.push({ t: y * MW + x, nx, ny, d });
      }
    }
    LINES[a].push({
      z, zo, ax, ay, bx, by, mx: (ax + bx) / 2, my: (ay + by) / 2, h: length / 2,
      dx, dy, other: b, tiles: Int32Array.from(tiles), deep: Int32Array.from(deep), cut,
    });
  };

  // The sides where one room meets another, tile by tile, grouped by the two rooms and the level.
  interface Edge { px: number; py: number; qx: number; qy: number; vertical: boolean; j: number }
  const groups = new Map<string, { z: number; a: number; b: number; edges: Edge[] }>();
  for (let z = 0; z < LEVELS; z++) for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const i = y * MW + x, a = ROOM[z][i];
    if (a < 0) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
      const j = ny * MW + nx, b = ROOM[z][j];
      if (b < 0 || b === a) continue;
      // A side of a diagonal tile that is on its wall half is wall, not an opening.
      if (!sideOpen(z, x, y, dx, dy) || !sideOpen(z, nx, ny, -dx, -dy)) continue;
      const edge: Edge = dx === 1 ? { px: x + 1, py: y, qx: x + 1, qy: y + 1, vertical: true, j }
        : dx === -1 ? { px: x, py: y, qx: x, qy: y + 1, vertical: true, j }
        : dy === 1 ? { px: x, py: y + 1, qx: x + 1, qy: y + 1, vertical: false, j }
        : { px: x, py: y, qx: x + 1, qy: y, vertical: false, j };
      const key = `${z}|${a}|${b}`;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { z, a, b, edges: [] }));
      g.edges.push(edge);
    }
    // Up a ladder: the room above its top begins there.
    if (tileAt(z, x, y) === LADDER && z + 1 < LEVELS) {
      const b = ROOM[z + 1][i];
      if (b < 0 || b === a) continue;
      add(z, z + 1, x + 0.5, y + 0.5, x + 0.5, y + 0.5, a, b, [i]);
      add(z + 1, z, x + 0.5, y + 0.5, x + 0.5, y + 0.5, b, a, [i]);
    }
    // Up a straight stair: the room past its top end begins on the level above, at the edge where the stair finishes. (A diagonal stair is the cut of its head square, below.)
    const ramp = tileAt(z, x, y) === STAIRS ? rampAt(z, x, y) : undefined;
    if (ramp && ramp.index === ramp.length - 1 && !isDiagonalRamp(ramp.dir) && z + 1 < LEVELS) {
      const [sx, sy] = ramp.dir === "up" ? [0, -1] : ramp.dir === "down" ? [0, 1] : ramp.dir === "left" ? [-1, 0] : [1, 0];
      const head = i + sy * MW + sx, b = ROOM[z + 1][head];
      if (b >= 0 && b !== a) {
        add(z, z + 1, x + 0.5 + sx * 0.5, y + 0.5 + sy * 0.5, x + 0.5 + sx * 0.5, y + 0.5 + sy * 0.5, a, b, [head]);
        add(z + 1, z, x + 0.5 + sx * 0.5, y + 0.5 + sy * 0.5, x + 0.5 + sx * 0.5, y + 0.5 + sy * 0.5, b, a, [i]);
      }
    }
  }

  // Where a diagonal stair arrives: the half-floor tile on the level above, cut by the line through its centre, is the Nave's (or the hall's) on one side and the stair's on the other. That cut is the line between them.
  for (let z = 0; z + 1 < LEVELS; z++) for (let i = 0; i < N; i++) {
    if (!topAt(z + 1, i % MW, Math.floor(i / MW))) continue;
    const a = ROOM[z + 1][i], b = ROOM[z][i];
    if (a < 0 || b < 0 || a === b) continue;
    const x = i % MW, y = Math.floor(i / MW), floor = diagSide(z + 1, x, y);
    const ends = [0, 1, 2, 3].filter(k => k !== floor && k !== 3 - floor).map(k => [x + (k % 2), y + Math.floor(k / 2)]);
    add(z + 1, z, ends[0][0], ends[0][1], ends[1][0], ends[1][1], a, b, [i]);
    add(z, z + 1, ends[0][0], ends[0][1], ends[1][0], ends[1][1], b, a, [i]);
  }

  // A drop kept open at the edge of a floor ('o' in the plan): the room on the floor and the room it drops into are two, with a line along the edge, seen both ways.
  for (let z = 1; z < LEVELS; z++) for (let i = 0; i < N; i++) {
    const x = i % MW, y = Math.floor(i / MW);
    if (!keepAt(z, x, y)) continue;
    let k = z - 1;
    while (k >= 0 && tileAt(k, x, y) === VOID) k--;
    if (k < 0 || ROOM[k][i] < 0) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = i + dy * MW + dx;
      if (tileAt(z, x + dx, y + dy) !== FLOOR || ROOM[z][n] < 0 || ROOM[z][n] === ROOM[k][i]) continue;
      const ex0 = dx === 1 ? x + 1 : x, ex1 = dx === -1 ? x : x + 1, ey0 = dy === 1 ? y + 1 : y, ey1 = dy === -1 ? y : y + 1;
      const [ax, ay, bx, by] = dx ? [ex0, y, ex0, y + 1] : [x, ey0, x + 1, ey0];
      void ex1; void ey1;
      add(z, k, ax, ay, bx, by, ROOM[z][n], ROOM[k][i], [i]);
      add(k, z, ax, ay, bx, by, ROOM[k][i], ROOM[z][n], [n]);
    }
  }

  // Each line goes from wall to wall: sides that run on in a straight line are one line. And sides that step round corners (a run along one way, then a run across, and on in the same two directions: an L, or a staircase of them, as at a diagonal door or corridor) are one diagonal line from end to end, so that no line ends against another to finish the job.
  const vertexKey = (x: number, y: number) => `${x},${y}`;
  interface Run { vertical: boolean; ax: number; ay: number; bx: number; by: number; js: number[] }
  for (const g of groups.values()) {
    // Straight runs: edges end to end along one line.
    const runs: Run[] = [];
    for (const vertical of [true, false]) {
      const line = new Map<number, Edge[]>();
      for (const e of g.edges) if (e.vertical === vertical) {
        const key = vertical ? e.px : e.py;
        const list = line.get(key);
        if (list) list.push(e); else line.set(key, [e]);
      }
      for (const [key, list] of line) {
        list.sort((p, q) => (vertical ? p.py - q.py : p.px - q.px));
        let run: Run | null = null;
        for (const e of list) {
          const from = vertical ? e.py : e.px, to = vertical ? e.qy : e.qx;
          if (run && (vertical ? run.by : run.bx) === from) {
            if (vertical) run.by = to; else run.bx = to;
            run.js.push(e.j);
          } else {
            run = vertical ? { vertical, ax: key, ay: e.py, bx: key, by: e.qy, js: [e.j] } : { vertical, ax: e.px, ay: key, bx: e.qx, by: key, js: [e.j] };
            runs.push(run);
          }
        }
      }
    }
    // Which runs meet at each corner.
    const at = new Map<string, number[]>();
    runs.forEach((r, k) => {
      for (const key of [vertexKey(r.ax, r.ay), vertexKey(r.bx, r.by)]) {
        const list = at.get(key);
        if (list) list.push(k); else at.set(key, [k]);
      }
    });
    const done = new Array<boolean>(runs.length).fill(false);
    for (let k = 0; k < runs.length; k++) {
      if (done[k]) continue;
      const chain = [k], used = new Set([k]);
      const path: [number, number][] = [[runs[k].ax, runs[k].ay], [runs[k].bx, runs[k].by]];
      let front = k, back = k;
      // Grow it from the far end: the one other run at that corner, if it turns the other way.
      for (;;) {
        const end = path[path.length - 1];
        const next = (at.get(vertexKey(end[0], end[1])) ?? []).filter(n => n !== front);
        if (next.length !== 1 || used.has(next[0]) || runs[next[0]].vertical === runs[front].vertical) break;
        const r = runs[next[0]];
        chain.push(next[0]);
        used.add(next[0]);
        front = next[0];
        path.push(r.ax === end[0] && r.ay === end[1] ? [r.bx, r.by] : [r.ax, r.ay]);
      }
      // And from the near end.
      for (;;) {
        const end = path[0];
        const next = (at.get(vertexKey(end[0], end[1])) ?? []).filter(n => n !== back);
        if (next.length !== 1 || used.has(next[0]) || runs[next[0]].vertical === runs[back].vertical) break;
        const r = runs[next[0]];
        chain.unshift(next[0]);
        used.add(next[0]);
        back = next[0];
        path.unshift(r.ax === end[0] && r.ay === end[1] ? [r.bx, r.by] : [r.ax, r.ay]);
      }
      // A corridor's mouth next to the cut corners of a room: a short run each side and the mouth between them, going back on themselves like a bracket. The mouth alone is the line; the sides are where the corner triangles meet the doorway, not a way through.
      if (chain.length === 3) {
        const first = [path[1][0] - path[0][0], path[1][1] - path[0][1]], last = [path[3][0] - path[2][0], path[3][1] - path[2][1]];
        if (Math.abs(first[0]) + Math.abs(first[1]) === 1 && first[0] * last[0] + first[1] * last[1] < 0) {
          for (const c of chain) done[c] = true;
          const mid = runs[chain[1]];
          add(g.z, g.z, mid.ax, mid.ay, mid.bx, mid.by, g.a, g.b, chain.flatMap(c => runs[c].js));
          continue;
        }
      }
      // A staircase goes on the same way: all its runs along one way point the same way, and so do all across.
      let along = 0, across = 0, stairs = chain.length >= 2;
      for (let m = 1; m < path.length && stairs; m++) {
        const sx = Math.sign(path[m][0] - path[m - 1][0]), sy = Math.sign(path[m][1] - path[m - 1][1]);
        if (sx) { if (along && along !== sx) stairs = false; along = sx; }
        if (sy) { if (across && across !== sy) stairs = false; across = sy; }
      }
      if (stairs) {
        for (const c of chain) done[c] = true;
        add(g.z, g.z, path[0][0], path[0][1], path[path.length - 1][0], path[path.length - 1][1], g.a, g.b, chain.flatMap(c => runs[c].js));
      } else {
        done[k] = true;
        add(g.z, g.z, runs[k].ax, runs[k].ay, runs[k].bx, runs[k].by, g.a, g.b, runs[k].js);
      }
    }
  }
})();
