/**
 * world.ts — the map as tiles: levels, stairs and ladders, and the questions asked of it.
 */
import type { Dir } from "../ui/input";
import { BLACK_WALLS, FENCED_ZONES, GRATE_ZONES, LEVEL_PLANS, OPEN_ABOVE, RAISED_WAX, ROCK_ZONES, RUBBLE_SPOTS, THIN_FLOORS, WAX_SPLODGES, WAX_TILES, WAX_WALLS, WOOD_TILES } from "./plans";

export const VOID = 0, FLOOR = 1, WALL = 2, STAIRS = 3, LADDER = 4, DIAG = 5;

export type { Dir };

/** Which way a ramp goes uphill: straight, or (for a diagonal corridor's stairs) toward a corner. */
export type RampDir = Dir | "ne" | "nw" | "se" | "sw";

const DIR_STEP: Record<RampDir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0], ne: [1, -1], nw: [-1, -1], se: [1, 1], sw: [-1, 1] };

const STAIR_CHARS: Record<string, RampDir> = { "^": "up", v: "down", "<": "left", ">": "right", "↖": "nw", "↗": "ne", "↙": "sw", "↘": "se" };

/** Whether a ramp goes uphill toward a corner. */
export const isDiagonalRamp = (dir: RampDir) => dir === "ne" || dir === "nw" || dir === "se" || dir === "sw";

/** How far up a ramp going `dir` the point (fx, fy) of its tile is: 0 at its foot, 1 at its head, and on past them outside the tile. */
export function rampAlong(dir: RampDir, fx: number, fy: number) {
  switch (dir) {
    case "up": return 1 - fy;
    case "down": return fy;
    case "right": return fx;
    case "left": return 1 - fx;
    case "se": return (fx + fy) / 2;
    case "nw": return 1 - (fx + fy) / 2;
    case "ne": return (fx + 1 - fy) / 2;
    case "sw": return (1 - fx + fy) / 2;
  }
}

/**
 * The plan characters for a diagonal tile: a floor triangle and a wall triangle split along a
 * diagonal. The character shows where the floor is: ◤ the north-west half, ◥ north-east, ◣ south-west,
 * ◢ south-east. Their index is what `Level.diags` holds.
 */
export const DIAG_CHARS = "◤◥◣◢";

/**
 * Diagonal tiles at the edge of a hole: ◸ ◹ ◺ ◿ are floor in the north-west, north-east, south-west or south-east half, and open air
 * in the other (a diagonal rim; walkable on its floor half). In a shaft's walls, ▛ ▜ ▙ ▟ are wall in the north-west, north-east,
 * south-west or south-east half, and open air in the other.
 */
export const HOLE_DIAG_CHARS = "◸◹◺◿";
export const SHAFT_DIAG_CHARS = "▛▜▙▟";

/** A stairs or ladder tile: which way is uphill (every ramp is one tile, rising one level). */
export interface Ramp { dir: RampDir; index: number; length: number; /** A diagonal stair that runs from the centre of the square before it to the centre of the square after it (see `buildWorld`); else it runs corner to corner of its own tile. */ centered?: boolean }

/** The diagonal stairs a diagonal tile beside them tilts with: the tile's floor half lies on the same slope. */
export interface Slope { x: number; y: number; dir: RampDir; centered?: boolean }

interface Level {
  tiles: Uint8Array;
  ramps: Map<number, Ramp>;
  /** For the diagonal tiles beside diagonal stairs, by tile index. */
  slopes: Map<number, Slope>;
  /** 1 where this level is empty but something walkable lies below (so it's open air, not rock). */
  open: Uint8Array;
  /** For diagonal tiles: which half is floor (an index into DIAG_CHARS). */
  diags: Uint8Array;
  /** 1 for a cell of open air inside a shaft (':' in the plan): empty, but lit and seen through like floor, so the walls round it show. */
  shaft: Uint8Array;
  /** 1 for a diagonal tile whose other half is open air, not wall (the diagonal edge of a hole). */
  holes: Uint8Array;
  /** For a floor tile with metal bars across it (a gate: ‘/’ or ‘\\’ in the plan): 1 for bars along the / diagonal, 2 along the \\ one. You can't walk onto it, but you can see through. */
  bars: Uint8Array;
  /** 1 for a wall of wax (‘w’ in the plan): a wall for all purposes (you can't pass or see through), but painted as melted candle wax. */
  wax: Uint8Array;
  /** 1 for the tiles of a mined tunnel (floor, stairs, and the rock walls round them), on the levels of the shaft: they are painted as dark rock with cobbles, not brick. */
  mined: Uint8Array;
  /** 1 for wooden tiles (a bridge's planks and stairs): see `WOOD_TILES`. */
  wood: Uint8Array;
  /** For the two tiles at the top of a diagonal stair: 1 on the upper level's half-floor tile where the stair arrives, 2 on the lower level's tilted tile under it (where the stair finishes). */
  top: Uint8Array;
  /** 1 for a pitch-black wall (see `BLACK_WALLS`). */
  black: Uint8Array;
  /** 1 for a floor tile that is a grate: you see down through its holes (see `GRATE_ZONES`). */
  grate: Uint8Array;
  /** 1 for a cell of open air that is meant to stay open though a floor edge touches it (‘o’ in the plan): a drop off a ledge. */
  keep: Uint8Array;
  /** 1 for floor tiles with rubble on them: grey stones and loose bricks. */
  rubble: Uint8Array;
  /** 1 inside the rock zones (see `ROCK_ZONES`): the ground there is rock, for walls and cliffs. */
  zone: Uint8Array;
  /** How thickly wax has run over the floor of each tile, 0 to 255 (255: all waxed over). */
  splodge: Uint8Array;
}

interface World { w: number; h: number; levels: Level[]; start: { x: number; y: number; z: number } }

export const walkable = (t: number) => t === FLOOR || t === STAIRS || t === LADDER || t === DIAG;

export const isRamp = (t: number) => t === STAIRS || t === LADDER;

function buildWorld(plans: string[][]): World {
  // One tile of margin all round, so the walls that grow around the edge fit.
  const w = Math.max(...plans.flat().map(r => r.length)) + 2;
  const h = Math.max(...plans.map(p => p.length)) + 2;
  let start = { x: 1, y: 1, z: 0 };
  const dirs: (RampDir | null)[][] = [];
  const levels: Level[] = plans.map((plan, z) => {
    const tiles = new Uint8Array(w * h);
    const d: (RampDir | null)[] = new Array(w * h).fill(null);
    const diags = new Uint8Array(w * h);
    const shaft = new Uint8Array(w * h);
    const holes = new Uint8Array(w * h);
    const bars = new Uint8Array(w * h);
    const wax = new Uint8Array(w * h);
    const keep = new Uint8Array(w * h);
    plan.forEach((row, y) => [...row].forEach((c, x) => {
      const i = (y + 1) * w + x + 1;
      if (c === "." || c === "@") tiles[i] = FLOOR;
      else if (c === "#") tiles[i] = WALL;
      else if (c === "w") { tiles[i] = WALL; wax[i] = 1; }
      else if (c === "o") keep[i] = 1;
      else if (c === "/" || c === "\\") { tiles[i] = FLOOR; bars[i] = c === "/" ? 1 : 2; }
      else if (c === ":") shaft[i] = 1;
      else if (SHAFT_DIAG_CHARS.includes(c)) shaft[i] = 2 + SHAFT_DIAG_CHARS.indexOf(c);
      else if (HOLE_DIAG_CHARS.includes(c)) { tiles[i] = DIAG; diags[i] = HOLE_DIAG_CHARS.indexOf(c); holes[i] = 1; }
      else if (DIAG_CHARS.includes(c)) { tiles[i] = DIAG; diags[i] = DIAG_CHARS.indexOf(c); }
      else if (c === "H") { tiles[i] = LADDER; d[i] = "up"; }
      else if (c in STAIR_CHARS) { tiles[i] = STAIRS; d[i] = STAIR_CHARS[c]; }
      if (c === "@") start = { x: x + 1, y: y + 1, z };
    }));
    dirs.push(d);
    return { tiles, ramps: new Map(), slopes: new Map(), open: new Uint8Array(w * h), diags, shaft, holes, bars, wax, keep, mined: new Uint8Array(w * h), wood: new Uint8Array(w * h), top: new Uint8Array(w * h), black: new Uint8Array(w * h), grate: new Uint8Array(w * h), rubble: new Uint8Array(w * h), zone: new Uint8Array(w * h), splodge: new Uint8Array(w * h) };
  });

  // Blocks of wax: the floor of a place goes up some levels, onto a solid wax block, and the walls that stood round it stay.
  for (const [x0, y0, x1, y1, height] of RAISED_WAX) {
    const cells: number[] = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = (y + 1) * w + x + 1;
      if (levels[6].tiles[i] !== FLOOR) continue;
      let clear = true;
      for (let k = 1; k <= height; k++) if (levels[6 + k].tiles[i] !== VOID) clear = false;
      if (!clear) continue;
      for (let k = 0; k < height; k++) { levels[6 + k].tiles[i] = WALL; levels[6 + k].wax[i] = 1; }
      levels[6 + height].tiles[i] = FLOOR;
      cells.push(i);
    }
    for (const i of cells) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const n = i + dy * w + dx;
      if (levels[6].tiles[n] === VOID) levels[6].tiles[n] = WALL;
    }
  }

  // Pitch-black walls.
  for (const [z0, z1, x0, y0, x1, y1] of BLACK_WALLS) for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = (y + 1) * w + x + 1;
    if (levels[z].tiles[i] !== VOID || levels[z].shaft[i]) continue;
    // Never over a stair's way up, or the head and headroom of a doorway: those stay open.
    const below = z > 0 ? levels[z - 1] : null;
    if (below && (below.tiles[i] === STAIRS || below.slopes.has(i) || below.top[i] > 0)) continue;
    if (levels[z].top[i] > 0) continue;
    levels[z].tiles[i] = WALL; levels[z].black[i] = 1;
  }

  // Grates: floors you see through.
  for (const [z, x0, y0, x1, y1] of GRATE_ZONES) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = (y + 1) * w + x + 1;
    if (levels[z].tiles[i] === FLOOR) levels[z].grate[i] = 1;
  }

  // Wax: the diagonal tiles that are wax, and where it has run over the floor.
  for (const [z, x, y] of WAX_TILES) levels[z].wax[(y + 1) * w + x + 1] = 1;
  for (const [z, x, y] of WOOD_TILES) levels[z].wood[(y + 1) * w + x + 1] = 1;
  for (const [z, x0, y0, x1, y1, amount] of WAX_SPLODGES) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (x + 1 >= w - 1 || y + 1 >= h - 1) continue;
      const i = (y + 1) * w + x + 1;
      levels[z].splodge[i] = Math.max(levels[z].splodge[i], Math.round(amount * 255));
    }
  }

  // Ramps climb at 45 degrees: each stairs or ladder tile rises one whole level by itself (so a
  // ramp is always a single tile, and the tile past its top end is on the next level up).
  levels.forEach((lv, z) => {
    const d = dirs[z];
    for (let i = 0; i < w * h; i++) if (isRamp(lv.tiles[i])) lv.ramps.set(i, { dir: d[i]!, index: 0, length: 1 });
    // You walk a diagonal corridor across the diagonal tiles beside its floor squares, so beside diagonal stairs those tilt too.
    for (const [i, r] of lv.ramps) {
      if (!isDiagonalRamp(r.dir)) continue;
      const x = i % w, y = (i - x) / w;
      for (const n of [i - 1, i + 1, i - w, i + w]) if (lv.tiles[n] === DIAG && !lv.holes[n]) lv.slopes.set(n, { x, y, dir: r.dir });
    }
  });

  // A diagonal stair runs from the centre of the floor square before it to the centre of the floor square after it: those two squares are cut in half by a line through their centres, one half flat floor and the other part of the ramp. The foot square keeps its floor and tilts in its half beside the stair; the head square, on the level above, is only floor in its far half (the rim of a hole), and on the stair's level its near half is a tilted diagonal tile.
  levels.forEach((lv, z) => {
    const up = levels[z + 1];
    if (!up) return;
    for (const [i, r] of lv.ramps) {
      if (lv.tiles[i] !== STAIRS || !isDiagonalRamp(r.dir)) continue;
      const [sx, sy] = DIR_STEP[r.dir], x = i % w, y = (i - x) / w;
      const foot = (y - sy) * w + x - sx, head = (y + sy) * w + x + sx;
      // (The foot may be the half-floor head of the flight before: flights then follow one another with no flat square between, the head's far half rising on as this flight's foot.)
      const chained = lv.tiles[foot] === DIAG && lv.holes[foot] === 1 && lv.top[foot] === 1;
      if ((lv.tiles[foot] !== FLOOR && !chained) || up.tiles[head] !== FLOOR || lv.tiles[head] !== VOID) continue;
      const far = { ne: 1, nw: 0, se: 3, sw: 2 }[r.dir as "ne" | "nw" | "se" | "sw"];
      lv.slopes.set(foot, { x, y, dir: r.dir });
      up.tiles[head] = DIAG; up.diags[head] = far; up.holes[head] = 1; up.top[head] = 1;
      lv.tiles[head] = DIAG; lv.diags[head] = 3 - far; lv.slopes.set(head, { x, y, dir: r.dir }); lv.top[head] = 2;
      r.centered = true;
      for (const sl of lv.slopes.values()) if (sl.x === x && sl.y === y) sl.centered = true;
    }
  });

  // A run of stairs in one direction on one level is one gentle ramp: it climbs a level over all of its tiles together.
  levels.forEach(lv => {
    for (const [i, r] of lv.ramps) {
      if (lv.tiles[i] !== STAIRS || isDiagonalRamp(r.dir)) continue;
      const [sx, sy] = DIR_STEP[r.dir], step = sy * w + sx;
      const same = (j: number) => lv.tiles[j] === STAIRS && lv.ramps.get(j)?.dir === r.dir;
      let back = 0, fwd = 0;
      while (same(i - (back + 1) * step)) back++;
      while (same(i + (fwd + 1) * step)) fwd++;
      r.index = back;
      r.length = back + fwd + 1;
    }
  });

  // Open air: empty cells with something walkable somewhere below.
  levels.forEach((lv, z) => {
    for (let i = 0; i < w * h; i++) {
      if (lv.tiles[i] !== VOID) continue;
      for (let k = 0; k < z; k++) if (walkable(levels[k].tiles[i])) { lv.open[i] = 1; break; }
    }
  });

  // Walls: any empty cell touching a walkable one (diagonals too) becomes wall. Open air that does so is a gap that leads down, and is walled too, except where the drop is meant: round a shaft or the rim of a hole (the Nave's), beside a bridge, and by a stair or ladder.
  levels.forEach((lv, z) => {
    const grown = lv.tiles.slice();
    /** Whether the open air at (x, y) is a drop that is meant to be there. */
    const meant = (x: number, y: number) => {
      if (lv.keep[y * w + x]) return true;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (lv.holes[n] || lv.shaft[n] > 0 || isRamp(lv.tiles[n])) return true;
        // The cell right above a stair or ladder is the opening it rises through, and the cells beside it are what you step through to reach it: they stay open, or the way in would be a diagonal gap between two wall corners.
        if (z > 0 && isRamp(levels[z - 1].tiles[n])) return true;
      }
      // A bridge: a floor tile with open air (or a shaft) on both sides of it along a line, one of them this cell.
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const fx = x + dx, fy = y + dy, ox = x + 2 * dx, oy = y + 2 * dy;
        if (fx < 0 || fy < 0 || fx >= w || fy >= h || ox < 0 || oy < 0 || ox >= w || oy >= h) continue;
        const f = fy * w + fx, o = oy * w + ox;
        // (Not in the tunnels, on the levels of the shaft: they are bored through rock, with rock on both sides.)
        if (lv.tiles[f] === FLOOR && !(z >= 1 && z <= 5) && !walkable(lv.tiles[o]) && (lv.open[o] || lv.shaft[o] > 0)) return true;
      }
      return false;
    };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (lv.tiles[i] !== VOID || (lv.open[i] && meant(x, y))) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (!walkable(lv.tiles[n])) continue;
        // Open air that touches a floor only at a corner has no edge to drop off: it needs no wall (and a wall there would hide a diagonal). Beside a diagonal tile's wall half the diagonal is the wall, so only its floor sides are an edge.
        if (lv.open[i] && dx && dy) continue;
        if (lv.open[i] && lv.tiles[n] === DIAG) {
          const floor = lv.diags[n], north = floor < 2, west = floor % 2 === 0;
          const sideOpen = dy > 0 ? north : dy < 0 ? !north : dx > 0 ? west : !west;
          if (!sideOpen) continue;
        }
        grown[i] = WALL;
      }
    }
    lv.tiles = grown;
  });

  // Fenced zones: wax walls on every empty cell beside a floor's edge, even where the ordinary rule above leaves it open (a hole's rim, a stair); the cells over a stair stay open.
  for (const [z, x0, y0, x1, y1] of FENCED_ZONES) {
    const lv = levels[z], under = z > 0 ? levels[z - 1] : null;
    const fence: number[] = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = (y + 1) * w + x + 1;
      if (lv.tiles[i] !== VOID || lv.shaft[i] > 0) continue;
      if (under && (isRamp(under.tiles[i]) || under.slopes.has(i) || under.top[i] > 0)) continue;
      let edge = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = i + dy * w + dx, t = lv.tiles[n];
        if (t === FLOOR) edge = true;
        else if (t === DIAG) {
          const floor = lv.diags[n], north = floor < 2, west = floor % 2 === 0;
          if (dy > 0 ? north : dy < 0 ? !north : dx > 0 ? west : !west) edge = true;
        }
      }
      if (edge) fence.push(i);
    }
    for (const i of fence) { lv.tiles[i] = WALL; lv.wax[i] = 1; }
  }

  // The pits dug out of the floors (open air, ':' cells, over a dug-out floor below): walls close them in on every level, so a pit reads as a shaft with walls and not as a gap in the air. Rock, like the tunnels.
  levels.forEach(lv => {
    const made: number[] = [];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (lv.tiles[i] !== VOID || lv.shaft[i] > 0) continue;
      let next = false;
      for (let dy = -1; dy <= 1 && !next; dy++) for (let dx = -1; dx <= 1; dx++) if (lv.shaft[(y + dy) * w + x + dx] === 1) { next = true; break; }
      if (next) made.push(i);
    }
    for (const i of made) lv.tiles[i] = WALL;
  });

  // Mined floors: the floor, stairs and diagonals of the tunnels (levels 4 and 5), and a ladder that starts there.
  levels.forEach((lv, z) => {
    if (z < 4 || z > 5) return;
    for (let i = 0; i < w * h; i++) {
      const t = lv.tiles[i];
      if (t === FLOOR || t === STAIRS || t === DIAG) lv.mined[i] = 1;
      else if (t === LADDER) {
        let k = z;
        while (k > 0 && levels[k - 1].tiles[i] === LADDER) k--;
        if (k >= 4) lv.mined[i] = 1;
      }
    }
  });
  // Walls are placed on their own, whatever floor lies beside them: rock inside the rock zones, brick elsewhere.
  for (const [z0, z1, x0, y0, x1, y1] of ROCK_ZONES) {
    for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = (y + 1) * w + x + 1;
      levels[z].zone[i] = 1;
      if (levels[z].tiles[i] === WALL && !levels[z].wax[i]) levels[z].mined[i] = 1;
    }
  }

  // Boxes whose walls are wax (a wall with a ladder in front of it keeps its look).
  for (const [z0, z1, x0, y0, x1, y1] of WAX_WALLS) {
    for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = (y + 1) * w + x + 1;
      if (levels[z].tiles[i] !== WALL || levels[z].tiles[i + w] === LADDER) continue;
      levels[z].wax[i] = 1;
      levels[z].mined[i] = 0;
    }
  }

  // Rubble: scattered across the dungeon, thick in the dug-out places and round every pit, and where the plans say.
  const hash = (z: number, x: number, y: number, salt: number) => {
    let n = (z * 73856093) ^ (x * 19349663) ^ (y * 83492791) ^ (salt * 2654435761);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  levels.forEach((lv, z) => {
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (lv.tiles[i] !== FLOOR || lv.bars[i]) continue;
      let chance = z >= 6 ? 0.05 : lv.mined[i] ? 0.3 : 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (lv.shaft[i + dy * w + dx] === 1 && z >= 5) chance = Math.max(chance, 0.8);
      if (hash(z, x, y, 7) < chance) lv.rubble[i] = 1;
    }
  });
  for (const [z, x0, y0, x1, y1, chance] of RUBBLE_SPOTS) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = (y + 1) * w + x + 1;
      if (levels[z].tiles[i] === FLOOR && hash(z, x, y, 11) < chance) levels[z].rubble[i] = 1;
    }
  }

  return { w, h, levels, start };
}

export const WORLD = buildWorld(LEVEL_PLANS);

export const LEVELS = WORLD.levels.length;

export const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < WORLD.w && y < WORLD.h;

export const tileAt = (z: number, x: number, y: number) =>
  z < 0 || z >= LEVELS || !inside(x, y) ? VOID : WORLD.levels[z].tiles[y * WORLD.w + x];

/** How thickly wax lies over the floor of tile (x, y) of level z: 0 none, 255 all over. */
export const splodgeAt = (z: number, x: number, y: number) => (z >= 0 && z < LEVELS && inside(x, y) ? WORLD.levels[z].splodge[y * WORLD.w + x] : 0);

/** Whether (x, y) on level z is open air over a dug-out floor (a pit, not the main shaft). */
export const isPit = (z: number, x: number, y: number) => {
  if (z < 1 || z >= LEVELS || !inside(x, y) || WORLD.levels[z].shaft[y * WORLD.w + x] !== 1) return false;
  for (let k = 1; k < z; k++) if (WORLD.levels[k].mined[y * WORLD.w + x] === 1) return true;
  return false;
};

/** Whether (x, y) on level z lies in a rock zone. */
export const rockZoneAt = (z: number, x: number, y: number) => z >= 0 && z < LEVELS && inside(x, y) && WORLD.levels[z].zone[y * WORLD.w + x] === 1;

/** Whether tile (x, y) of level z is a stair or lies on a stair's slope (a tilted tile, the square before a diagonal stair): drawn with the stairs' layer. */
export const rampishAt = (z: number, x: number, y: number) => tileAt(z, x, y) === STAIRS || !!slopeAt(z, x, y);

/** Whether the floor of tile (x, y) of level z has rubble on it. */
export const rubbleAt = (z: number, x: number, y: number) => z >= 0 && z < LEVELS && inside(x, y) && WORLD.levels[z].rubble[y * WORLD.w + x] === 1;

/** The level a wall's column starts at, going down through the walls under it (but not into the labyrinth): a wall has the look of its whole column. */
export function wallBase(z: number, x: number, y: number) {
  let k = z;
  while (k - 1 >= 1 && tileAt(k - 1, x, y) === WALL) k--;
  return k;
}

/** Every ladder tile, with whether it is the foot of its ladder and whether the top. */
export const ladderTiles = () => {
  const out: { z: number; x: number; y: number; start: boolean; finish: boolean }[] = [];
  for (let z = 0; z < LEVELS; z++) for (let y = 0; y < WORLD.h; y++) for (let x = 0; x < WORLD.w; x++) {
    if (tileAt(z, x, y) === LADDER) out.push({ z, x, y, start: tileAt(z - 1, x, y) !== LADDER, finish: tileAt(z + 1, x, y) !== LADDER });
  }
  return out;
};

/** Whether the cell (x, y) of level z is open air kept open at the edge of a floor (‘o’ in the plan): a drop. */
export const keepAt = (z: number, x: number, y: number) => z >= 0 && z < LEVELS && inside(x, y) && WORLD.levels[z].keep[y * WORLD.w + x] === 1;

/** Whether the wall at tile (x, y) of level z is a pitch-black one. */
export const blackAt = (z: number, x: number, y: number) => z >= 0 && z < LEVELS && inside(x, y) && WORLD.levels[z].black[y * WORLD.w + x] === 1;

/** Whether the floor of tile (x, y) of level z is a grate. */
export const grateAt = (z: number, x: number, y: number) => z >= 0 && z < LEVELS && inside(x, y) && WORLD.levels[z].grate[y * WORLD.w + x] === 1;

/** Whether tile (x, y) of level z is wooden (a bridge's planks or stairs). */
export const woodAt = (z: number, x: number, y: number) => z >= 0 && z < LEVELS && inside(x, y) && WORLD.levels[z].wood[y * WORLD.w + x] === 1;

/** Whether tile (x, y) of level z is part of a mined tunnel: painted as dark rock and cobbles. */
export const minedAt = (z: number, x: number, y: number) => z >= 0 && z < LEVELS && inside(x, y) && WORLD.levels[z].mined[y * WORLD.w + x] === 1;

/** Whether the wall at tile (x, y) of level z is a wall of wax. */
export const waxAt = (z: number, x: number, y: number) => z >= 0 && z < LEVELS && inside(x, y) && WORLD.levels[z].wax[y * WORLD.w + x] === 1;

/** The bars across tile (x, y) of level z: 0 none, 1 along the / diagonal, 2 along the \\ one. */
export const barsAt = (z: number, x: number, y: number) => (z >= 0 && z < LEVELS && inside(x, y) ? WORLD.levels[z].bars[y * WORLD.w + x] : 0);

export const rampAt = (z: number, x: number, y: number) => WORLD.levels[z]?.ramps.get(y * WORLD.w + x);

export const isAir = (z: number, x: number, y: number) =>
  tileAt(z, x, y) === VOID && inside(x, y) && z < LEVELS && WORLD.levels[z].open[y * WORLD.w + x] === 1;

/** The slope the diagonal tile (x, y) on level z tilts with, if it does. */
export const slopeAt = (z: number, x: number, y: number) => (z >= 0 && z < LEVELS && inside(x, y) ? WORLD.levels[z].slopes.get(y * WORLD.w + x) : undefined);

/** How far along a diagonal stair the ramp begins and ends: at the centres of the squares before and after the stair's own tile (0 to 1 is the tile itself). */
export const RAMP_START = -0.5, RAMP_END = 1.5;

/** How high a diagonal stair has climbed (0 to 1) at `along` its way (see `rampAlong`): flat before RAMP_START and after RAMP_END. */
export const diagRise = (along: number) => Math.min(1, Math.max(0, (along - RAMP_START) / (RAMP_END - RAMP_START)));

/** How far up a slope the point (px, py) is: 0 at its foot, 1 at its head, and flat beyond them. */
export const slopeRise = (s: Slope, px: number, py: number) => {
  const a = rampAlong(s.dir, px - s.x, py - s.y);
  return s.centered ? diagRise(a) : Math.min(1, Math.max(0, a));
};

/** The top-of-a-diagonal-stair marks of tile (x, y) of level z: 1 the half-floor tile where it arrives, 2 the tilted tile under that one. */
export const topAt = (z: number, x: number, y: number) => (z >= 0 && z < LEVELS && inside(x, y) ? WORLD.levels[z].top[y * WORLD.w + x] : 0);

/** Whether the ramp at (nx, ny) on level z-1 tops out into (x, y) on level z. */
export function isArrival(z: number, x: number, y: number, nx: number, ny: number) {
  // A tilted diagonal tile reaches the level above along the edge it shares with (x, y).
  const s = tileAt(z - 1, nx, ny) === DIAG ? slopeAt(z - 1, nx, ny) : undefined;
  if (s && slopeRise(s, (x + nx + 1) / 2, (y + ny + 1) / 2) >= 1 - 1e-6) return true;
  const r = z > 0 ? rampAt(z - 1, nx, ny) : undefined;
  if (!r || r.index !== r.length - 1) return false;
  const [sx, sy] = DIR_STEP[r.dir];
  return nx + sx === x && ny + sy === y;
}

/** The height of a ramp tile at point (px, py) (clamped into the tile). */
export function rampHeight(z: number, x: number, y: number, r: Ramp, px: number, py: number) {
  const fx = Math.min(1, Math.max(0, px - x)), fy = Math.min(1, Math.max(0, py - y));
  if (isDiagonalRamp(r.dir)) return z + (r.centered ? diagRise(rampAlong(r.dir, fx, fy)) : rampAlong(r.dir, fx, fy));
  return z + (r.index + rampAlong(r.dir, fx, fy)) / r.length;
}

/** The highest level below z with something solid at (x, y), for how far a ledge drops. */
export function groundBelow(z: number, x: number, y: number) {
  // (A ladder's wall runs on down to its foot: the ground is where it starts.)
  for (let k = z - 1; k >= 0; k--) if (tileAt(k, x, y) !== VOID && !(tileAt(k, x, y) === LADDER && tileAt(k - 1, x, y) === LADDER)) return k;
  return z - 1;
}

/**
 * The level you are on, as a whole number, for what to draw. On stairs or a ladder it is the
 * level the ramp stands on (the lower one) until you reach its top end; stepping onto a ramp
 * from above switches to that lower level straight away.
 */
export function levelOf(x: number, y: number, alt: number) {
  const tx = Math.floor(x), ty = Math.floor(y);
  for (const k of [Math.ceil(alt - 1e-3) - 1, Math.round(alt)]) {
    if (k >= 0 && k < LEVELS && (isRamp(tileAt(k, tx, ty)) || slopeAt(k, tx, ty)) && alt < k + 1 - 0.04) return k;
  }
  return Math.max(0, Math.min(LEVELS - 1, Math.round(alt)));
}

/**
 * How far inside the floor half of a diagonal tile the point (fx, fy) is, where fx and fy are
 * the point's place in the tile (0 to 1, y downwards): positive on the floor side, negative in
 * the wall half, zero on the diagonal itself.
 */
function diagDepth(side: number, fx: number, fy: number) {
  return side === 0 ? 1 - fx - fy : side === 1 ? fx - fy : side === 2 ? fy - fx : fx + fy - 1;
}

/** Whether the point (px, py) of a diagonal tile on level z is on its floor half. */
export function onDiagFloor(z: number, tx: number, ty: number, px: number, py: number) {
  return diagDepth(WORLD.levels[z].diags[ty * WORLD.w + tx], px - tx, py - ty) >= -1e-6;
}

/** Whether the point (px, py) is on the open half of the shaft diagonal tile (tx, ty) of level z, not under its wall half (true if that tile is not a shaft diagonal). */
export function onShaftOpen(z: number, tx: number, ty: number, px: number, py: number) {
  const wall = shaftDiagSide(z, tx, ty);
  return wall < 0 || diagDepth(3 - wall, px - tx, py - ty) >= -1e-6;
}

/** Whether the box [x0, x1] x [y0, y1] stays clear of the wall half of the diagonal tile (tx, ty) on level z (the part of the box outside the tile doesn't count). */
export function boxOnDiagFloor(z: number, tx: number, ty: number, x0: number, y0: number, x1: number, y1: number) {
  const side = WORLD.levels[z].diags[ty * WORLD.w + tx];
  const ax = Math.max(x0, tx) - tx, bx = Math.min(x1, tx + 1) - tx, ay = Math.max(y0, ty) - ty, by = Math.min(y1, ty + 1) - ty;
  // Depth is linear, so the worst place is a corner of the part of the box inside the tile.
  return Math.min(diagDepth(side, ax, ay), diagDepth(side, bx, ay), diagDepth(side, ax, by), diagDepth(side, bx, by)) >= -1e-6;
}

/**
 * How far into the wall half of the diagonal tile (tx, ty) on level z the box [x0, x1] x [y0, y1] reaches at worst: negative inside the wall, 0 on the
 * diagonal, positive clear of it (1 if the box is outside the tile).
 */
export function boxDiagDepth(z: number, tx: number, ty: number, x0: number, y0: number, x1: number, y1: number) {
  const side = WORLD.levels[z].diags[ty * WORLD.w + tx];
  const ax = Math.max(x0, tx) - tx, bx = Math.min(x1, tx + 1) - tx, ay = Math.max(y0, ty) - ty, by = Math.min(y1, ty + 1) - ty;
  if (bx < ax || by < ay) return 1;
  return Math.min(diagDepth(side, ax, ay), diagDepth(side, bx, ay), diagDepth(side, ax, by), diagDepth(side, bx, by));
}

/** Whether any of the box [x0, x1] x [y0, y1] inside the diagonal tile (tx, ty) on level z is on its floor half. */
export function boxTouchesDiagFloor(z: number, tx: number, ty: number, x0: number, y0: number, x1: number, y1: number) {
  const side = WORLD.levels[z].diags[ty * WORLD.w + tx];
  const ax = Math.max(x0, tx) - tx, bx = Math.min(x1, tx + 1) - tx, ay = Math.max(y0, ty) - ty, by = Math.min(y1, ty + 1) - ty;
  if (bx < ax || by < ay) return false;
  return Math.max(diagDepth(side, ax, ay), diagDepth(side, bx, ay), diagDepth(side, ax, by), diagDepth(side, bx, by)) >= -1e-6;
}

/** Which half of the diagonal tile (x, y) on level z is floor (an index into DIAG_CHARS). */
export const diagSide = (z: number, x: number, y: number) => WORLD.levels[z].diags[y * WORLD.w + x];

/**
 * The ladder at tile (x, y) that you are on at height `alt`: ladders stacked on consecutive levels
 * at one tile are a single tall ladder. `bottom` is the height of its foot, `top` that of its head
 * (the floor you step onto lies north of it, at that height). Null if there is no ladder there.
 */
export function ladderSpan(x: number, y: number, alt: number) {
  const start = [Math.floor(alt + 1e-3), Math.ceil(alt - 1e-3) - 1].find(k => tileAt(k, x, y) === LADDER);
  if (start === undefined) return null;
  let lo = start, hi = start;
  while (tileAt(lo - 1, x, y) === LADDER) lo--;
  while (tileAt(hi + 1, x, y) === LADDER) hi++;
  return { bottom: lo, top: hi + 1 };
}

/** Whether (x, y) on level z is open air inside a shaft (':' or a shaft diagonal in the plan): not floor, but seen through. */
export const isShaft = (z: number, x: number, y: number) => z >= 0 && z < LEVELS && inside(x, y) && WORLD.levels[z].shaft[y * WORLD.w + x] > 0;

/** Whether the diagonal tile (x, y) on level z has open air, not wall, in its other half (the rim of a hole). */
export const isHoleDiag = (z: number, x: number, y: number) => tileAt(z, x, y) === DIAG && WORLD.levels[z].holes[y * WORLD.w + x] === 1;

/** For a shaft's diagonal wall tile: which corner its wall half is in (an index into DIAG_CHARS: 0 north-west, 1 north-east, 2 south-west, 3 south-east); otherwise -1. */
export function shaftDiagSide(z: number, x: number, y: number) {
  const v = z >= 0 && z < LEVELS && inside(x, y) ? WORLD.levels[z].shaft[y * WORLD.w + x] : 0;
  return v >= 2 ? v - 2 : -1;
}

/** Whether a wall stands at (x, y) on level z: a wall tile, or a diagonal tile's wall half. */
export const wallStandsAt = (z: number, x: number, y: number) =>
  tileAt(z, x, y) === WALL || shaftDiagSide(z, x, y) >= 0 || (tileAt(z, x, y) === DIAG && !isHoleDiag(z, x, y));

/** Whether a wall beside (x, y) on level z shows its face or rim on that side: there is floor there, or a shaft's open air. */
export const wallFacesInto = (z: number, x: number, y: number) => (walkable(tileAt(z, x, y)) && !(tileAt(z, x, y) === STAIRS && rampAt(z, x, y)?.dir === "up")) || isShaft(z, x, y);

/**
 * If you stand at (x, y) on level z in a walled room open above you (a shaft's open air or a ladder right overhead):
 * for each column of the map, the northernmost row you can still see at floor level. That's the row
 * under the room's north wall (a doorway shows, what's past it doesn't), and past the room's east and
 * west ends the nearest end's row, as if the wall ran on. Null if you are not in such a room.
 */
/** Whether the tile (x, y) of level z is one of those listed in `OPEN_ABOVE`: a door's rim that counts as open air over its room, and as no floor in the way of the walls above it. */
export const openAboveAt = (z: number, x: number, y: number) => OPEN_ABOVE.some(([oz, ox, oy]) => oz === z && ox + 1 === x && oy + 1 === y);

export function roomLimit(z: number, x: number, y: number, underWall = false) {
  const { w, h } = WORLD;
  // (The rim of a door cut into the room's wall whose floor is only on its far side, listed in `OPEN_ABOVE`, is open too: else its column is covered like the wall north of the room, and the door's wall shows black.)
  const open = (cx: number, cy: number) => isShaft(z + 1, cx, cy) || tileAt(z + 1, cx, cy) === LADDER || openAboveAt(z + 1, cx, cy);
  // (Hugging a shaft's diagonal wall you are still in the room, on its open side; only under the wall half itself you are not.)
  if (!open(x, y) || underWall) return null;
  const north = new Int16Array(w).fill(h);
  const seen = new Uint8Array(w * h);
  const stack = [[x, y]];
  seen[y * w + x] = 1;
  let pits = false;
  while (stack.length) {
    const [cx, cy] = stack.pop()!;
    if (isPit(z + 1, cx, cy)) pits = true;
    north[cx] = Math.min(north[cx], cy);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (!inside(nx, ny) || seen[ny * w + nx] || !open(nx, ny)) continue;
      seen[ny * w + nx] = 1;
      stack.push([nx, ny]);
    }
  }
  // A dug-out pit is open to everything round it: nothing is covered, though its walls do show above you.
  if (pits) return new Int16Array(w).fill(-1);
  let first = 0, last = w - 1;
  while (north[first] === h) first++;
  while (north[last] === h) last--;
  const out = new Int16Array(w);
  for (let c = 0; c < w; c++) out[c] = north[Math.max(first, Math.min(last, c))] - 1;
  return out;
}

/** One level's slice of a cliff: the block under a ledge, whose face shows south of it. */
export interface CliffBlock {
  /** The level of the floor it hangs from (its stone's colour). */
  z: number;
  /** Whether it is the block right under that floor, where the edge is. */
  top: boolean;
  /** For the rim of a hole, which half of the tile is floor (0 or 1: the cut slants); otherwise -1. */
  diag: number;
}

/**
 * The blocks of every cliff, per level, by tile index. A tall cliff is a stack of one-level blocks, so
 * each can fade by its own distance from you. In a level's own coordinates a block's face fills
 * its own tile's row, as a wall's face does.
 */
export const CLIFFS: Map<number, CliffBlock>[] = (() => {
  const out = WORLD.levels.map(() => new Map<number, CliffBlock>());
  const stack = (z: number, x: number, y: number, ground: number, diag: number) => {
    for (let k = z - 1; k >= ground; k--) {
      // Where a shaft's diagonal wall already stands, that wall is the face.
      // (And where a wall already stands, that wall is the face: one wall for one place.)
      // (A raised block of wax is the exception: its wall, with no floor in front, gets the cliff's dripping face.)
      if (shaftDiagSide(k, x, y) < 0 && (tileAt(k, x, y) !== WALL || (waxAt(k, x, y) && !wallFacesInto(k, x, y + 1)))) out[k].set(y * WORLD.w + x, { z, top: k === z - 1, diag });
      // A cliff hanging in a hall ends with the hall (a bridge's doesn't carry on down a hole in its floor).
      if (isShaft(k + 1, x, y) && !isShaft(k, x, y)) break;
    }
  };
  for (let z = 1; z < LEVELS; z++) for (let y = 0; y < WORLD.h; y++) for (let x = 0; x < WORLD.w; x++) {
    if (tileAt(z, x, y) === FLOOR && !grateAt(z, x, y) && isAir(z, x, y + 1) && !isArrival(z, x, y, x, y + 1)) {
      // A bridge (open air on both sides) is only one block thick; anything else is solid down to what lies below.
      const thin = THIN_FLOORS.some(([tz, x0, y0, x1, y1]) => tz === z && x >= x0 + 1 && x <= x1 + 1 && y >= y0 + 1 && y <= y1 + 1);
      stack(z, x, y, thin || isAir(z, x, y - 1) ? z - 1 : groundBelow(z, x, y + 1), -1);
    }
    else if (isHoleDiag(z, x, y) && diagSide(z, x, y) < 2 && !topAt(z, x, y)) {
      const thin = THIN_FLOORS.some(([tz, x0, y0, x1, y1]) => tz === z && x >= x0 + 1 && x <= x1 + 1 && y >= y0 + 1 && y <= y1 + 1);
      stack(z, x, y, thin ? z - 1 : groundBelow(z, x, y), diagSide(z, x, y));
    }
  }
  return out;
})();
