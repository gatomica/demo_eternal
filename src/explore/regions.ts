/**
 * regions.ts — the map cut into rooms and corridors, and those into the pages the renderer paints once.
 *
 * Each level's tiles that sight crosses are split into regions: the connected stretches of open
 * space (rooms) and of narrow passage (corridors, doorways, stairs), told apart as `sight` does. A
 * region owns what is painted for it: its floor, the faces of the walls round it (a wall belongs to
 * the room in front of it), and a diagonal's slanted band. So every piece of painting belongs to
 * exactly one page, and nothing is painted or drawn twice. A region is cut into pages of at most
 * PAGE x PAGE tiles so none is too big to be a texture; the cliffs, which hang below the floors
 * they belong to, are cut into the plain chunks of their own level.
 */
import { CHUNK } from "./paint";
import { LINES, REGION, REGION_COUNT, REGION_Z, ROOM } from "./rooms";
import { blackAt, CLIFFS, DIAG, diagSide, isHoleDiag, LADDER, LEVELS, rampishAt, shaftDiagSide, tileAt, WALL, walkable, wallFacesInto, WORLD } from "./world";

/** The most tiles across a page: a region wider or taller than this is cut. */
export const PAGE = 10;

/** One baked picture of part of a level: tiles x0..x1-1, y0..y1-1 (plus a row above it for what reaches up). */
export interface Page {
  id: number;
  z: number;
  x0: number; y0: number; x1: number; y1: number;
  /** The region it is part of (-1 for cliff chunks). */
  region: number;
  /** Which layers it has anything in. */
  surface: boolean; walls: boolean; cliffs: boolean;
}

const { w: MW, h: MH } = WORLD;
const N = MW * MH;

export { REGION, REGION_COUNT };
/** Per level, the page that holds each tile's floor, stairs and rims, or -1. */
export const PAGE_S: Int32Array[] = WORLD.levels.map(() => new Int32Array(N).fill(-1));
/** Per level, the page that holds each tile's wall painting (a wall's face goes with the room in front of it), or -1. */
export const PAGE_W: Int32Array[] = WORLD.levels.map(() => new Int32Array(N).fill(-1));
/** Every page, by id. */
export const PAGES: Page[] = [];
/** Per level, the ids of its pages. */
export const PAGES_OF_LEVEL: number[][] = WORLD.levels.map(() => []);
/**
 * Per level, the tile edges where one region meets another (a room and its doorway, say), as x0, y0,
 * x1, y1 in tiles and 1 if two rooms meet there (else the regions are parts of one room): five numbers
 * to an edge. A debugging aid: the renderer can draw them in red.
 */
export const BOUNDARIES: number[][] = WORLD.levels.map(() => []);
/** Per level, a tile to write each room's number at. */
export const ROOM_LABELS: { room: number; x: number; y: number }[][] = WORLD.levels.map(() => []);

(() => {
  // 1. The regions come from `rooms`; a region's box starts empty.
  const bounds: { z: number; x0: number; y0: number; x1: number; y1: number }[] = REGION_Z.map(z => ({ z, x0: MW, y0: MH, x1: -1, y1: -1 }));

  // 2. Who owns what: the region of each tile's floor painting, and of each tile's wall painting.
  const ownS: Int32Array[] = WORLD.levels.map(() => new Int32Array(N).fill(-1));
  const ownW: Int32Array[] = WORLD.levels.map(() => new Int32Array(N).fill(-1));
  for (let z = 0; z < LEVELS; z++) for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const i = y * MW + x, t = tileAt(z, x, y);
    if (walkable(t) && REGION[z][i] >= 0) ownS[z][i] = REGION[z][i];
    if (t === WALL && blackAt(z, x, y)) {
      // (A black wall is painted and shown whatever lies in front of it: its page is the chunk's, below.)
    } else if (t === WALL) {
      // The face of a wall, and what is on it, goes with the room in front of it (and a corner-cut diagonal south of it leaves it no face).
      const cut = (tileAt(z, x, y + 1) === DIAG && !isHoleDiag(z, x, y + 1) && diagSide(z, x, y + 1) >= 2) || shaftDiagSide(z, x, y + 1) === 0 || shaftDiagSide(z, x, y + 1) === 1;
      if (wallFacesInto(z, x, y + 1) && !cut) ownW[z][i] = REGION[z][(y + 1) * MW + x];
    } else if ((t === DIAG && !isHoleDiag(z, x, y)) || shaftDiagSide(z, x, y) >= 0 || t === LADDER) {
      ownW[z][i] = REGION[z][i];
    }
  }

  // 3. A region's box is the box of what it owns (walls can lie beyond its floor).
  for (let z = 0; z < LEVELS; z++) for (let i = 0; i < N; i++) {
    for (const r of [ownS[z][i], ownW[z][i]]) {
      if (r < 0) continue;
      const b = bounds[r], x = i % MW, y = (i - x) / MW;
      if (x < b.x0) b.x0 = x;
      if (x > b.x1) b.x1 = x;
      if (y < b.y0) b.y0 = y;
      if (y > b.y1) b.y1 = y;
    }
  }

  // 4. Cut each box into pages, and give every owned tile its page.
  const pageOf = new Map<number, number>();
  const pageFor = (r: number, x: number, y: number) => {
    const b = bounds[r], col = Math.floor((x - b.x0) / PAGE), row = Math.floor((y - b.y0) / PAGE);
    const key = (r * 64 + row) * 64 + col;
    let id = pageOf.get(key);
    if (id === undefined) {
      id = PAGES.length;
      pageOf.set(key, id);
      PAGES.push({
        id, z: b.z, region: r,
        x0: b.x0 + col * PAGE, y0: b.y0 + row * PAGE, x1: Math.min(b.x1 + 1, b.x0 + (col + 1) * PAGE), y1: Math.min(b.y1 + 1, b.y0 + (row + 1) * PAGE),
        surface: false, walls: false, cliffs: false,
      });
      PAGES_OF_LEVEL[b.z].push(id);
    }
    return id;
  };
  for (let z = 0; z < LEVELS; z++) for (let i = 0; i < N; i++) {
    const x = i % MW, y = (i - x) / MW;
    if (ownS[z][i] >= 0) { const id = pageFor(ownS[z][i], x, y); PAGE_S[z][i] = id; PAGES[id].surface = true; }
    if (ownW[z][i] >= 0) { const id = pageFor(ownW[z][i], x, y); PAGE_W[z][i] = id; PAGES[id].walls = true; }
  }

  // The seams between rooms (red) and between regions of one room (orange), for the debugging view.
  for (let z = 0; z < LEVELS; z++) {
    const labelled = new Set<number>();
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const i = y * MW + x, room = ROOM[z][i];
      if (room < 0) continue;
      if (!labelled.has(room)) { labelled.add(room); ROOM_LABELS[z].push({ room, x, y }); }
      const edge = (j: number, ex0: number, ey0: number, ex1: number, ey1: number) => {
        if (REGION[z][j] < 0 || ROOM[z][j] < 0) return;
        if (ROOM[z][j] === room && REGION[z][j] !== REGION[z][i]) BOUNDARIES[z].push(ex0, ey0, ex1, ey1, 0);
      };
      if (x + 1 < MW) edge(i + 1, x + 1, y, x + 1, y + 1);
      if (y + 1 < MH) edge(i + MW, x, y + 1, x + 1, y + 1);
    }
  }

  // The lines between rooms (red), as the light sees them: a diagonal where the sides step round a corner. Each once.
  // (A wall that a room has on several levels is one line, shown on its lowest level only.)
  LINES.forEach((lines, room) => {
    for (const l of lines) {
      // (Lines that join two levels are drawn if they run along an edge; the points where a stair or ladder begins are not.)
      if (l.other <= room || (l.z !== l.zo && l.ax === l.bx && l.ay === l.by)) continue;
      if (lines.some(m => m !== l && m.z < l.z && m.z === m.zo && m.other === l.other && m.ax === l.ax && m.ay === l.ay && m.bx === l.bx && m.by === l.by)) continue;
      // (A line joining two levels lies on the upper one's floor: the half-floor head of a stair is on the level above the stair.)
      BOUNDARIES[Math.max(l.z, l.zo)].push(l.ax, l.ay, l.bx, l.by, 1);
    }
  });

  // The black walls: plain chunks of their own level too.
  for (let z = 0; z < LEVELS; z++) {
    const ids = new Map<number, number>();
    for (let i = 0; i < N; i++) {
      const x = i % MW, y = (i - x) / MW;
      if (!blackAt(z, x, y)) continue;
      const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK), key = cy * 64 + cx;
      let id = ids.get(key);
      if (id === undefined) {
        id = PAGES.length;
        ids.set(key, id);
        PAGES.push({ id, z, region: -1, x0: cx * CHUNK, y0: cy * CHUNK, x1: Math.min(MW, cx * CHUNK + CHUNK), y1: Math.min(MH, cy * CHUNK + CHUNK), surface: false, walls: true, cliffs: false });
        PAGES_OF_LEVEL[z].push(id);
      }
      PAGE_W[z][i] = id;
    }
  }

  // 5. The cliffs: plain chunks of their own level, where there are any.
  for (let z = 0; z < LEVELS; z++) {
    const seen = new Set<number>();
    const cliffish = [...CLIFFS[z].keys()];
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (rampishAt(z, x, y)) cliffish.push(y * MW + x);
    for (const i of cliffish) {
      const x = i % MW, y = (i - x) / MW, cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK), key = cy * 64 + cx;
      if (seen.has(key)) continue;
      seen.add(key);
      const id = PAGES.length;
      PAGES.push({ id, z, region: -1, x0: cx * CHUNK, y0: cy * CHUNK, x1: Math.min(MW, cx * CHUNK + CHUNK), y1: Math.min(MH, cy * CHUNK + CHUNK), surface: false, walls: false, cliffs: true });
      PAGES_OF_LEVEL[z].push(id);
    }
  }
})();
