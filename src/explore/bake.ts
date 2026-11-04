/**
 * bake.ts — painting the pages once, and keeping the pictures.
 *
 * A page (see `regions`) is painted the first time it is needed, or ahead of time while the map
 * loads, at the current tile size. The pictures are kept here, outside any renderer, so coming back
 * from a fight (a new renderer) doesn't paint them again. Pages far from anyone are let go when the
 * pictures take too much memory.
 */
import { type Layers, type Own, paintRect } from "./paint";
import { PAGE_S, PAGE_W, PAGES, type Page } from "./regions";
import { CLIFFS, rampishAt, WORLD } from "./world";

/** What a painted page holds: a canvas for each layer it has anything in. */
export interface Baked {
  surface: HTMLCanvasElement | null;
  walls: HTMLCanvasElement | null;
  cliffs: HTMLCanvasElement | null;
  /** The last frame it was asked for. */
  last: number;
  bytes: number;
}

/** The most memory the kept pictures may take, in bytes, before the least recently used go. */
const BUDGET = 320 * 1024 * 1024;

const baked = new Map<number, Baked>();
let bakedT = 0;
let bytes = 0;

/** The baked page at tile size T, painting it first if need be. `frame` marks it as used now. */
export function bake(page: Page, T: number, frame: number): Baked {
  if (T !== bakedT) {
    baked.clear();
    bytes = 0;
    bakedT = T;
  }
  let b = baked.get(page.id);
  if (!b) {
    const { z } = page;
    const own: Own = {
      s: (x, y) => PAGE_S[z][y * WORLD.w + x] === page.id,
      w: (x, y) => PAGE_W[z][y * WORLD.w + x] === page.id,
      c: (x, y) => CLIFFS[z].has(y * WORLD.w + x) || rampishAt(z, x, y),
    };
    const want: Layers = { surface: page.surface, walls: page.walls, cliffs: page.cliffs };
    const made = paintRect(z, T, page.x0, page.y0, page.x1, page.y1, own, want);
    const size = (c: HTMLCanvasElement | null) => (c ? c.width * c.height * 4 : 0);
    b = { ...made, last: frame, bytes: size(made.surface) + size(made.walls) + size(made.cliffs) };
    baked.set(page.id, b);
    bytes += b.bytes;
    trim(frame);
  }
  b.last = frame;
  return b;
}

/** Lets go of the pictures used longest ago while there are too many (never ones used this frame). */
function trim(frame: number) {
  if (bytes <= BUDGET) return;
  const old = [...baked.entries()].filter(([, b]) => b.last < frame).sort((a, b) => a[1].last - b[1].last);
  for (const [id, b] of old) {
    if (bytes <= BUDGET) break;
    baked.delete(id);
    bytes -= b.bytes;
  }
}

/** Whether the page is painted already. */
export const isBaked = (id: number, T: number) => T === bakedT && baked.has(id);

/** What the kept pictures take, in bytes. */
export const bakedBytes = () => bytes;

/** The number of kept pages. */
export const bakedCount = () => baked.size;

/**
 * What painting every page at tile size T would take, in bytes. When that fits well inside the
 * budget the loading step paints the whole map; else only what is near.
 */
export function estimateBytes(T: number) {
  let tiles = 0;
  for (const p of PAGES) {
    const area = (p.x1 - p.x0) * (p.y1 - p.y0 + 1);
    tiles += area * ((p.surface ? 1 : 0) + (p.walls ? 1 : 0) + (p.cliffs ? 1 : 0));
  }
  return tiles * T * T * 4;
}

/** The share of the budget the whole map may take for the loading step to paint all of it. */
export const BAKE_ALL_SHARE = 0.85;

/** The memory budget for kept pictures, in bytes. */
export const BAKE_BUDGET = BUDGET;

