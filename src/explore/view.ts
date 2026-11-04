/**
 * view.ts — what the map renderers are given, and what they give back. Both renderers (the WebGL
 * one and the plain 2D fallback) take the same `View` and draw the same map.
 */
import { CLIFFS, DIAG, rampishAt, shaftDiagSide, tileAt, WALL, WORLD } from "./world";

/** How brightly you see a spot of a level, 0 (dark) to 1 (fully lit), by its position in tiles. */
export type Light = (x: number, y: number) => number;

/**
 * Draws what stands on level z (enemies, keepers, gear...) whose feet are in a row passing `test`.
 * Each thing should be drawn at `light(x, y)` of its feet as its alpha. Returns false if it drew nothing.
 */
export type ActorDrawer = (ctx: CanvasRenderingContext2D, z: number, ox: number, oy: number, T: number, test: (y: number) => boolean, light: Light) => boolean | void;

/** Whoever the view is looking from, drawn between the layers. `solid` is the real figure; otherwise its faint outline. */
export interface ViewPlayer {
  draw(ctx: CanvasRenderingContext2D, px: number, py: number, T: number, solid: boolean): void;
}

export interface View {
  /** Where the camera looks, in tiles on screen (a height lifts it up the screen). */
  camX: number; camY: number;
  /** The viewpoint on the grid, and its height in storeys. */
  x: number; y: number; alt: number;
  /** How much of each level is in sight (see `sight`): negative where not at all. */
  seen: Float32Array[];
  /** Where each tile's light comes from (see `sight`): the doorways light is seen through fade in a circle of their own. */
  origin?: Int32Array[];
  /** 1 for each level that sight reached anywhere (see `sight`), so levels it didn't reach can be skipped; without it every level is looked at. */
  reached?: Uint8Array;
  actors?: ActorDrawer;
  /** Whether anyone (or anything) stands on level z at all, cheaply. Without it, a view with actors is never taken for still. */
  actorsOn?: (z: number) => boolean;
  player?: ViewPlayer;
}

/** Sight for a view with no light radius: everything on the levels at or below `alt`, and nothing above it. */
export function seeAll(alt: number, into = WORLD.levels.map(() => new Float32Array(WORLD.w * WORLD.h))) {
  into.forEach((l, z) => l.fill(z <= alt + 1e-3 ? 1e6 : -1));
  return into;
}

/** What a map renderer offers the screen that owns its canvas. */
export interface MapRenderer {
  draw(v: View, dtMs: number): void;
  /** Pixels per tile right now. */
  readonly T: number;
  /**
   * Gets the map near this spot ready (painted, uploaded) before the first frame, so walking in
   * doesn't stutter. Resolves when done; `onProgress` gets 0 to 1. (The 2D fallback has nothing to prepare.)
   */
  warm(x: number, y: number, alt: number, onProgress?: (done: number) => void): Promise<void>;
  dispose(): void;
}

/** Per level, the tiles that hold a wall, a diagonal's wall half or a cliff block (sight asks for them every frame). */
export const WALL_TILES = WORLD.levels.map((_, z) => {
  const out: { x: number; y: number }[] = [];
  for (let y = 0; y < WORLD.h; y++) for (let x = 0; x < WORLD.w; x++) {
    const t = tileAt(z, x, y);
    if (t === WALL || t === DIAG || shaftDiagSide(z, x, y) >= 0 || CLIFFS[z].has(y * WORLD.w + x) || rampishAt(z, x, y)) out.push({ x, y });
  }
  return out;
});

