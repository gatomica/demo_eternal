/**
 * explore.tsx — the exploration demo: a top-down dungeon you walk around with WASD or the arrows.
 *
 * Movement is free (positions are floats) over a grid of tiles. Escape pauses.
 *
 * LEVELS. The dungeon is a stack of levels sharing one grid: a level-1 bridge can pass right over
 * a level-0 hall, and you can walk under it. Stairs and ladders are ramps: your height changes
 * continuously as you walk along them, so there is no transition between levels at all.
 * The rule that makes it work: you can step onto any surface whose height at that spot is close
 * to your own. That lets you onto a ramp from its ends, but not from its sides halfway up, and
 * keeps you on your own level when another passes above or below.
 *
 * DRAWING. Each storey is drawn RISE tiles higher on screen than the one below, so ledges get
 * cliff faces and stairs visibly climb. Levels above you are split at your row: what's behind
 * you is drawn before you, what's in front (or overhead) after, so bridges cover you as you pass
 * under them. A faint outline of you shows through anything that covers you.
 *
 * AUTHORING. One plan per level, all on the same grid:
 *   '.' floor   '@' start   '#' wall/pillar   ' ' nothing
 *   '^' 'v' '<' '>' stairs, pointing uphill (placed on the LOWER level; the tile past the top
 *                   end must be floor on the level above)
 *   'H' ladder, climbing north (placed on the lower level, like stairs)
 * Walls grow on their own around every walkable tile, except over open space: if something
 * walkable lies below, the edge becomes a ledge you can see down from instead.
 */

import { useEffect, useRef, useState } from "react";
import type { EnemySetup } from "./combat";

/* ============================================================
 * Map
 * ============================================================ */

const LEVEL_PLANS: string[][] = [
  // Level 0: the ground floor, carved from rock.
  [
    "                               ",
    "  ......    ............       ",
    "  ......    ............       ",
    "  ..@...................       ",
    "  ......    ............       ",
    "  ......    .........>>>>      ",
    "  ......    ............       ",
    "    .       ............       ",
    "    .       .....H......       ",
    "    .    ^  ............       ",
    "    .    ^  ............       ",
    "    ......  ............   ^   ",
    "            ............   ^   ",
    "                  .        .   ",
    "                  .      ..... ",
    "                  ............ ",
    "                         ..... ",
    "                         ..... ",
    "                               ",
  ],
  // Level 1: a landing, a bridge across the hall, and a room on the far side.
  [
    "                               ",
    "                               ",
    "                               ",
    "                               ",
    "                         ..... ",
    "                         ..... ",
    "        ...              ..... ",
    "        ...................... ",
    "        ...              ..... ",
    "                         ..... ",
    "                         ..... ",
    "                               ",
    "                               ",
    "                               ",
    "                               ",
    "                               ",
    "                               ",
    "                               ",
    "                               ",
  ],
];

const VOID = 0, FLOOR = 1, WALL = 2, STAIRS = 3, LADDER = 4;

export type Dir = "up" | "down" | "left" | "right";
const DIR_STEP: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const STAIR_CHARS: Record<string, Dir> = { "^": "up", v: "down", "<": "left", ">": "right" };

/** A stairs or ladder tile: which way is uphill, and where it sits in its run of ramp tiles. */
interface Ramp { dir: Dir; index: number; length: number }

interface Level {
  tiles: Uint8Array;
  ramps: Map<number, Ramp>;
  /** 1 where this level is empty but something walkable lies below (so it's open air, not rock). */
  open: Uint8Array;
}

interface World { w: number; h: number; levels: Level[]; start: { x: number; y: number; z: number } }

const walkable = (t: number) => t === FLOOR || t === STAIRS || t === LADDER;
const isRamp = (t: number) => t === STAIRS || t === LADDER;

function buildWorld(plans: string[][]): World {
  // One tile of margin all round, so the walls that grow around the edge fit.
  const w = Math.max(...plans.flat().map(r => r.length)) + 2;
  const h = Math.max(...plans.map(p => p.length)) + 2;
  let start = { x: 1, y: 1, z: 0 };
  const dirs: (Dir | null)[][] = [];
  const levels: Level[] = plans.map((plan, z) => {
    const tiles = new Uint8Array(w * h);
    const d: (Dir | null)[] = new Array(w * h).fill(null);
    plan.forEach((row, y) => [...row].forEach((c, x) => {
      const i = (y + 1) * w + x + 1;
      if (c === "." || c === "@") tiles[i] = FLOOR;
      else if (c === "#") tiles[i] = WALL;
      else if (c === "H") { tiles[i] = LADDER; d[i] = "up"; }
      else if (c in STAIR_CHARS) { tiles[i] = STAIRS; d[i] = STAIR_CHARS[c]; }
      if (c === "@") start = { x: x + 1, y: y + 1, z };
    }));
    dirs.push(d);
    return { tiles, ramps: new Map(), open: new Uint8Array(w * h) };
  });

  // Ramps: find each tile's place in its run, so a long staircase rises evenly along its length.
  levels.forEach((lv, z) => {
    const d = dirs[z];
    const same = (x: number, y: number, t: number, dir: Dir) =>
      x >= 0 && y >= 0 && x < w && y < h && lv.tiles[y * w + x] === t && d[y * w + x] === dir;
    for (let i = 0; i < w * h; i++) {
      const t = lv.tiles[i];
      if (!isRamp(t)) continue;
      const dir = d[i]!, [sx, sy] = DIR_STEP[dir], x = i % w, y = Math.floor(i / w);
      let back = 0, fwd = 0;
      while (same(x - sx * (back + 1), y - sy * (back + 1), t, dir)) back++;
      while (same(x + sx * (fwd + 1), y + sy * (fwd + 1), t, dir)) fwd++;
      lv.ramps.set(i, { dir, index: back, length: back + fwd + 1 });
    }
  });

  // Open air: empty cells with something walkable somewhere below.
  levels.forEach((lv, z) => {
    for (let i = 0; i < w * h; i++) {
      if (lv.tiles[i] !== VOID) continue;
      for (let k = 0; k < z; k++) if (walkable(levels[k].tiles[i])) { lv.open[i] = 1; break; }
    }
  });

  // Walls: any empty cell touching a walkable one (diagonals too) becomes wall, unless it's open air.
  levels.forEach(lv => {
    const grown = lv.tiles.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (lv.tiles[i] !== VOID || lv.open[i]) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && walkable(lv.tiles[ny * w + nx])) grown[i] = WALL;
      }
    }
    lv.tiles = grown;
  });

  return { w, h, levels, start };
}

const WORLD = buildWorld(LEVEL_PLANS);
const LEVELS = WORLD.levels.length;

const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < WORLD.w && y < WORLD.h;
const tileAt = (z: number, x: number, y: number) =>
  z < 0 || z >= LEVELS || !inside(x, y) ? VOID : WORLD.levels[z].tiles[y * WORLD.w + x];
const rampAt = (z: number, x: number, y: number) => WORLD.levels[z]?.ramps.get(y * WORLD.w + x);
const isAir = (z: number, x: number, y: number) =>
  tileAt(z, x, y) === VOID && inside(x, y) && z < LEVELS && WORLD.levels[z].open[y * WORLD.w + x] === 1;

/** Whether the ramp at (nx, ny) on level z-1 tops out into (x, y) on level z. */
function isArrival(z: number, x: number, y: number, nx: number, ny: number) {
  const r = z > 0 ? rampAt(z - 1, nx, ny) : undefined;
  if (!r || r.index !== r.length - 1) return false;
  const [sx, sy] = DIR_STEP[r.dir];
  return nx + sx === x && ny + sy === y;
}

/** The height of a ramp tile at point (px, py) (clamped into the tile). */
function rampHeight(z: number, x: number, y: number, r: Ramp, px: number, py: number) {
  const fx = Math.min(1, Math.max(0, px - x)), fy = Math.min(1, Math.max(0, py - y));
  const along = r.dir === "up" ? 1 - fy : r.dir === "down" ? fy : r.dir === "right" ? fx : 1 - fx;
  return z + (r.index + along) / r.length;
}

/** The highest level below z with something solid at (x, y), for how far a ledge drops. */
function groundBelow(z: number, x: number, y: number) {
  for (let k = z - 1; k >= 0; k--) if (tileAt(k, x, y) !== VOID) return k;
  return z - 1;
}

/* ============================================================
 * Look
 * ============================================================ */

const COLORS = {
  void: "#000000",
  wallFace: "#2c2c31",
  wallEdge: "#36363c",
  ledgeFace: "#26262b",
  ledgeRim: "#55555d",
  floor: "#3e3e45",
  floorGrout: "#38383e",
  stairs: "#46464e",
  rung: "#5c5c64",
  ink: "#ece9f4",
  eye: "#15141b",
  shadow: "rgb(0 0 0 / 0.35)",
};

/** How many tiles fit the screen's height (the width follows the window's shape). */
const TILES_TALL = 11;
/** How much higher on screen each storey is drawn, in tiles. Also the height of wall faces. */
const RISE = 0.6;

/** Top walking speed, in tiles per second. */
const SPEED = 4.6;
/** Ladders are climbed at this share of walking speed. */
const LADDER_SPEED = 0.5;
/** How quickly you reach top speed and come to a stop (higher = snappier). */
const ACCEL = 16;
/** How far you travel per walk-cycle frame, in tiles (a full cycle is four of these). */
const STRIDE = 0.42;
/** Your footprint for bumping into walls: half its width and half its depth, in tiles. */
const HALF_W = 0.28;
const HALF_D = 0.18;
/** How far sideways you'll be nudged around a corner into a doorway, in tiles. */
const CORNER_ASSIST = 0.45;
/** The biggest height difference (in storeys) you can step across. Bigger drops are falls. */
const STEP_TOLERANCE = 0.35;
/** How quickly falls speed up, in storeys per second squared. */
const GRAVITY = 10;
/** How quickly the camera catches up with you (higher = tighter). */
const CAMERA_FOLLOW = 9;
/** How far you can see, in tiles. */
const VISION_RADIUS = 5.5;
/** Share of that radius that's fully lit before it starts fading to black. */
const VISION_FULL = 0.5;
/** How quickly what you see catches up as you move (higher = snappier, lower = softer fades). */
const SIGHT_EASE = 7;
/** How far sight carries past a doorway or the mouth of a corridor, in tiles. */
const GAP_PEEK = 2.5;
/** The figure is drawn this far above its feet, in tiles. */
const BODY_ABOVE_FEET = 0.36;
/** How much each storey below you is darkened (0 = not at all, 1 = black). */
const DEPTH_DIM = 0.45;
/** How strongly your outline shows through things that cover you. */
const GHOST_ALPHA = 0.3;

function readDir(key: string): Dir | null {
  switch (key.toLowerCase()) {
    case "w": case "arrowup": return "up";
    case "s": case "arrowdown": return "down";
    case "a": case "arrowleft": return "left";
    case "d": case "arrowright": return "right";
    default: return null;
  }
}

const makeCanvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
};

/**
 * Paints one level at `T` pixels per tile, in that level's own coordinates (it is shifted up
 * by its height when drawn). Two layers: the surfaces, and the cliff faces under ledges. Each
 * face is stored in the row of the tile it hangs from, so splitting by rows keeps it together.
 */
function paintLevel(z: number, T: number) {
  const W = WORLD.w * T, H = WORLD.h * T;
  const surface = makeCanvas(W, H), faces = makeCanvas(W, H);
  const g = surface.getContext("2d")!, f = faces.getContext("2d")!;
  const grout = Math.max(1, Math.round(T / 24));
  const rise = RISE * T;

  for (let y = 0; y < WORLD.h; y++) for (let x = 0; x < WORLD.w; x++) {
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
  for (let y = 0; y < WORLD.h; y++) for (let x = 0; x < WORLD.w; x++) {
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

type Frame = "stand" | "stepL" | "stepR";

/** How a figure on the map looks. */
interface Look {
  ink: string;
  /** Eye color, or null for closed eyes (sleepwalkers walk in their sleep). */
  eye: string | null;
  /** Wax color sealing the legs and a shoulder, for the waxed. */
  wax?: string;
  /** Arms held out in front, the way sleepwalkers walk. */
  reach?: boolean;
}
const PLAYER_LOOK: Look = { ink: COLORS.ink, eye: COLORS.eye };
const SLEEPWALKER_LOOK: Look = { ink: "#aaa5b8", eye: null, reach: true };
const WAXED_LOOK: Look = { ink: "#9d98aa", eye: null, wax: "#b9a14e" };

/** A little stick figure seen from above and in front, centered on (x, y), `T` pixels per tile. */
function drawWalker(
  g: CanvasRenderingContext2D, x: number, y: number, T: number, facing: Dir, frame: Frame,
  shadow = true, shadowDrop = 0, look: Look = PLAYER_LOOK,
) {
  const X = (u: number) => x + u * T;
  const Y = (v: number) => y + v * T;
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    g.beginPath(); g.moveTo(X(x1), Y(y1)); g.lineTo(X(x2), Y(y2)); g.stroke();
  };
  // The legs, remembered so wax can be laid over them.
  const legs: [number, number, number, number][] = [];
  const leg = (x1: number, y1: number, x2: number, y2: number) => { legs.push([x1, y1, x2, y2]); line(x1, y1, x2, y2); };
  const step = frame === "stepL" ? -1 : frame === "stepR" ? 1 : 0;
  const bob = step ? -0.025 : 0;
  const foot = 0.36, hip = 0.08 + bob, neck = -0.2 + bob, shoulder = neck + 0.05, headY = -0.36 + bob, r = 0.15;

  if (shadow) {
    g.fillStyle = COLORS.shadow;
    // Mid-fall, the shadow stays on the ground below and shrinks the higher you are above it.
    const s = 1 / (1 + shadowDrop);
    g.beginPath(); g.ellipse(X(0), Y(foot + 0.01 + shadowDrop), 0.2 * T * s, 0.07 * T * s, 0, 0, Math.PI * 2); g.fill();
  }

  g.strokeStyle = look.ink;
  g.lineWidth = Math.max(2, 0.075 * T);
  g.lineCap = "round";
  g.lineJoin = "round";

  if (facing === "up" || facing === "down") {
    // Legs: the stepping foot lifts; the arm on the other side swings.
    const lift = (side: number) => (step === side ? -0.08 : 0);
    leg(-0.04, hip, -0.08, foot + lift(-1));
    leg(0.04, hip, 0.08, foot + lift(1));
    line(0, neck, 0, hip);
    if (look.reach) {
      // Arms held out ahead: toward you when facing down, away when facing up.
      const out = facing === "down" ? 0.17 : -0.12;
      line(-0.03, shoulder, -0.07, shoulder + out);
      line(0.03, shoulder, 0.07, shoulder + out);
    } else {
      const swing = (side: number) => (step === -side ? (facing === "down" ? 0.05 : -0.05) : step === side ? (facing === "down" ? -0.03 : 0.03) : 0);
      line(-0.02, shoulder, -0.16, 0.02 + swing(-1));
      line(0.02, shoulder, 0.16, 0.02 + swing(1));
    }
  } else {
    const m = facing === "right" ? 1 : -1;
    // Legs scissor, arms swing against them.
    const reach = step ? 0.12 : 0.045;
    leg(0, hip, m * reach, foot);
    leg(0, hip, -m * reach, foot + (step ? -0.02 : 0));
    line(0, neck, 0, hip);
    if (look.reach) {
      line(0, shoulder, m * 0.24, shoulder + 0.02);
      line(0, shoulder + 0.02, m * 0.21, shoulder + 0.06);
    } else {
      const arm = step ? 0.1 : 0.045;
      line(0, shoulder, -m * arm, 0.03);
      line(0, shoulder, m * arm, 0.03);
    }
  }

  if (look.wax) {
    // Wax sealing the legs stiff and crusted over one shoulder.
    g.strokeStyle = look.wax;
    g.lineWidth = Math.max(3, 0.13 * T);
    for (const [x1, y1, x2, y2] of legs) line(x1, y1 + 0.03, x2, y2 - 0.02);
    g.fillStyle = look.wax;
    g.beginPath(); g.arc(X(facing === "left" ? 0.04 : -0.05), Y(shoulder + 0.01), 0.07 * T, 0, Math.PI * 2); g.fill();
  }

  g.fillStyle = look.ink;
  g.beginPath(); g.arc(X(0), Y(headY), r * T, 0, Math.PI * 2); g.fill();

  // Eyes give away which way the head faces; from behind there are none.
  if (!look.eye) return;
  g.fillStyle = look.eye;
  const eye = (u: number, v: number) => { g.beginPath(); g.arc(X(u), Y(v), Math.max(1, 0.022 * T), 0, Math.PI * 2); g.fill(); };
  if (facing === "down") { eye(-0.05, headY + 0.01); eye(0.05, headY + 0.01); }
  if (facing === "left") eye(-0.08, headY);
  if (facing === "right") eye(0.08, headY);
}

/* ============================================================
 * Standing and moving: surfaces near your height
 * ============================================================ */

interface Walker {
  /** Where your feet are, in tiles (floats; the center of a tile is n + 0.5). */
  x: number; y: number;
  /** Your height, in storeys (0 = ground level). Fractional while on stairs or ladders. */
  alt: number;
  /** Current velocity, in tiles per second. */
  vx: number; vy: number;
  facing: Dir;
  /** Distance walked since you last stood still, which drives the walk cycle. */
  walked: number;
  climbing: boolean;
  /** How fast you're falling, in storeys per second (0 = on solid ground). */
  fall: number;
  /** The height of whatever is beneath you, where your shadow falls. */
  ground: number;
}

/**
 * The surface you'd end up on in tile (tx, ty), at point (px, py), coming from height `alt`:
 * the highest floor or ramp there that isn't more than a step above you. Anything lower is
 * fair game — you step down onto it, or drop down onto it from a ledge.
 */
function surfaceNear(tx: number, ty: number, px: number, py: number, alt: number) {
  let best: { h: number; t: number } | null = null;
  for (let z = 0; z < LEVELS; z++) {
    const t = tileAt(z, tx, ty);
    let hgt: number | null = null;
    if (t === FLOOR) hgt = z;
    else if (isRamp(t)) hgt = rampHeight(z, tx, ty, rampAt(z, tx, ty)!, px, py);
    if (hgt === null || hgt > alt + STEP_TOLERANCE) continue;
    if (!best || hgt > best.h) best = { h: hgt, t };
  }
  return best;
}

/** Whether your footprint, with feet at (x, y), overlaps tile (tx, ty). */
const overlaps = (x: number, y: number, tx: number, ty: number) =>
  x + HALF_W > tx && x - HALF_W < tx + 1 && y + HALF_D > ty && y - HALF_D < ty + 1;

/**
 * Whether moving your footprint from (fromX, fromY) to (x, y), at height `alt`, would push it
 * into anything you can't stand on. Tiles you already overlap never block the edges of your
 * footprint: after dropping off the side of some stairs, say, you can always walk away from
 * them. Your feet still can't step onto them.
 */
function blocked(x: number, y: number, alt: number, fromX: number, fromY: number) {
  // Your feet themselves must always land on something you can stand on.
  if (!surfaceNear(Math.floor(x), Math.floor(y), x, y, alt)) return true;
  const x0 = Math.floor(x - HALF_W), x1 = Math.floor(x + HALF_W - 1e-6);
  const y0 = Math.floor(y - HALF_D), y1 = Math.floor(y + HALF_D - 1e-6);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (overlaps(fromX, fromY, tx, ty)) continue;
    if (!surfaceNear(tx, ty, x, y, alt)) return true;
  }
  return false;
}

/** Moves along one axis as far as the walls allow; stops flush against them. */
function slide(me: Walker, axis: "x" | "y", amount: number): number {
  const at = (v: number) => (axis === "x" ? blocked(v, me.y, me.alt, me.x, me.y) : blocked(me.x, v, me.alt, me.x, me.y));
  const from = me[axis], to = from + amount;
  if (!at(to)) return to;
  const half = axis === "x" ? HALF_W : HALF_D;
  const edge = amount > 0 ? Math.floor(to + half) - half - 1e-4 : Math.ceil(to - half) + half + 1e-4;
  return (amount > 0 ? edge >= from : edge <= from) && !at(edge) ? edge : from;
}

/**
 * When you walk straight into a wall but are nearly lined up with an opening beside it,
 * drift sideways toward the opening so you slip in instead of snagging on the corner.
 */
function cornerNudge(me: Walker, axis: "x" | "y", dir: number, step: number): number {
  const other = axis === "x" ? me.y : me.x;
  const probe = 0.05 * dir;
  const free = (o: number) => (axis === "x" ? !blocked(me.x + probe, o, me.alt, me.x, me.y) : !blocked(o, me.y + probe, me.alt, me.x, me.y));
  const center = Math.floor(other) + 0.5;
  const lanes = [center, center - 1, center + 1].sort((a, b) => Math.abs(a - other) - Math.abs(b - other));
  for (const lane of lanes) {
    const off = lane - other;
    if (Math.abs(off) > CORNER_ASSIST || Math.abs(off) < 1e-3) continue;
    if (!free(lane)) continue;
    return Math.sign(off) * Math.min(Math.abs(off), step);
  }
  return 0;
}

/* ============================================================
 * Sight: a flood over the tiles, held back at doorways
 *
 * No geometry: sight spreads from your tile across walkable tiles, one step at a time, until it
 * runs out of range. Narrow passages (doorways, corridors, stairs: anything with walls on both
 * sides) are told apart from open space once, when the map loads. Whenever sight crosses
 * between the two, it can only carry GAP_PEEK tiles further. So from a room you see just the
 * mouth of a corridor, and from a corridor just the near corner of the room ahead, until you
 * step through.
 * ============================================================ */

/** Tiles sight travels over on level z: walkable ones, plus the space above stairs from below. */
const seeThrough = (z: number, x: number, y: number) => walkable(tileAt(z, x, y)) || isRamp(tileAt(z - 1, x, y));

/**
 * Per level, 1 for tiles in a narrow passage. A tile is open space if it's part of some 2x2
 * block of tiles you can see across, as every tile of a room is; anything else (corridors and
 * their corners, doorways, bridges, staircases) is narrow.
 */
const NARROW = WORLD.levels.map((_, z) => {
  const out = new Uint8Array(WORLD.w * WORLD.h);
  const open = (x: number, y: number) =>
    seeThrough(z, x, y) && seeThrough(z, x + 1, y) && seeThrough(z, x, y + 1) && seeThrough(z, x + 1, y + 1);
  for (let y = 0; y < WORLD.h; y++) for (let x = 0; x < WORLD.w; x++) {
    if (!seeThrough(z, x, y)) continue;
    if (!(open(x, y) || open(x - 1, y) || open(x, y - 1) || open(x - 1, y - 1))) out[y * WORLD.w + x] = 1;
  }
  return out;
});

/**
 * How much sight is left on each tile of every level, seen by you at (px, py) and height `alt`:
 * negative where you can't see at all, counting down from VISION_RADIUS with distance.
 * Sight spreads across your own level and, over the edge of a ledge, drops down onto the floor
 * below, carrying only GAP_PEEK further (you glimpse what's down there, like around a corner).
 */
function sight(px: number, py: number, alt: number) {
  const { w, h } = WORLD, N = w * h;
  const left = WORLD.levels.map(() => new Float32Array(N).fill(-1));
  const sx = Math.floor(px), sy = Math.floor(py);
  const queue: number[] = [];
  const relax = (z: number, i: number, v: number) => {
    if (v < 0 || v <= left[z][i]) return;
    left[z][i] = v;
    queue.push(z * N + i);
  };
  // Your own tile and the ones around it are measured from exactly where you stand, so sight
  // shifts smoothly as you walk rather than jumping from tile to tile. On stairs, you see from
  // both the level you're leaving and the one you're heading to.
  const lo = Math.floor(alt + 1e-3), hi = Math.max(lo, Math.ceil(alt - 1e-3));
  for (let z = lo; z <= Math.min(hi, LEVELS - 1); z++) {
    if (!seeThrough(z, sx, sy)) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = sx + dx, ny = sy + dy, ni = ny * w + nx;
      if (!seeThrough(z, nx, ny)) continue;
      if (dx && dy && (!seeThrough(z, sx + dx, sy) || !seeThrough(z, sx, sy + dy))) continue;
      let v = VISION_RADIUS - Math.hypot(px - (nx + 0.5), py - (ny + 0.5));
      if (NARROW[z][ni] !== NARROW[z][sy * w + sx]) v = Math.min(v, GAP_PEEK);
      relax(z, ni, v);
    }
  }
  while (queue.length) {
    const e = queue.pop()!, z = Math.floor(e / N), i = e % N, x = i % w, y = (i - x) / w;
    const here = left[z][i], narrow = NARROW[z];
    // Stairs and ladders join two levels: sight passes along them from one level to the
    // other, glimpsing only a little way onto the far floor (like past a doorway).
    if (isRamp(tileAt(z, x, y)) && z + 1 < LEVELS) relax(z + 1, i, Math.min(here, GAP_PEEK));
    if (z > 0 && isRamp(tileAt(z - 1, x, y))) relax(z - 1, i, Math.min(here, GAP_PEEK));
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy, ni = ny * w + nx;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (seeThrough(z, nx, ny)) {
        // No squeezing diagonally between two corners.
        if (dx && dy && (!seeThrough(z, x + dx, y) || !seeThrough(z, x, y + dy))) continue;
        let next = here - (dx && dy ? Math.SQRT2 : 1);
        if (narrow[ni] !== narrow[i]) next = Math.min(next, GAP_PEEK);
        relax(z, ni, next);
      } else if (!dx !== !dy && isAir(z, nx, ny)) {
        // Over a ledge: down to the first thing below. If that's floor, you glimpse it.
        for (let k = z - 1; k >= 0; k--) {
          if (tileAt(k, nx, ny) === VOID) continue;
          if (seeThrough(k, nx, ny)) relax(k, ni, Math.min(here - 1, GAP_PEEK));
          break;
        }
      }
    }
  }
  return left;
}

/* ============================================================
 * Enemies on the map
 *
 * Each enemy on the map stands for one fight. It's hidden by the dark like everything else,
 * and it sees you exactly when you see it. The waxed stand slumped where they were left and
 * lurch after you, slowly, if you come close; sleepwalkers drift around and give chase, though
 * never as fast as you walk. Touching one starts its fight.
 * ============================================================ */

export type FoeKind = "waxed" | "sleepwalker";

/** An enemy waiting somewhere on the map, and the fight it starts when it reaches you. */
export interface MapFoe {
  id: string;
  kind: FoeKind;
  /** Where it stands at first: its feet, in tiles on the world grid (plan column/row + 1). */
  home: { x: number; y: number; z: number };
  /** The fight. The map shows one figure per enemy in it, huddled together. */
  fight: EnemySetup[];
}

/** The tutorial, roughly in the order you'll meet it. */
export const MAP_FOES: MapFoe[] = [
  // In the hall: a lone waxed, then a pair further in.
  { id: "hall-waxed", kind: "waxed", home: { x: 17.5, y: 4.5, z: 0 }, fight: [{ kind: "waxed" }] },
  { id: "hall-pair", kind: "waxed", home: { x: 21.5, y: 11.5, z: 0 }, fight: [{ kind: "waxed" }, { kind: "waxed" }] },
  // One left standing in the middle of the bridge.
  { id: "bridge-waxed", kind: "waxed", home: { x: 20.5, y: 8.5, z: 1 }, fight: [{ kind: "waxed" }] },
  // The first sleepwalker, in the room below the east stairs: your first read of its stances.
  { id: "low-sleeper", kind: "sleepwalker", home: { x: 27.5, y: 16.6, z: 0 }, fight: [{ kind: "sleepwalker" }] },
  // Up in the far room: a sleepwalker with a waxed at its side.
  {
    id: "far-room", kind: "sleepwalker", home: { x: 28.5, y: 7.6, z: 1 },
    fight: [{ kind: "sleepwalker", line: "front" }, { kind: "waxed" }],
  },
];

interface FoeTuning {
  /** How close you must be (tiles) for it to notice you, once you can see each other. */
  notice: number;
  /** Speeds, in tiles per second: chasing you, and otherwise ambling about. */
  chase: number;
  walk: number;
  /** How far from home it wanders by itself (0: it doesn't). */
  wander: number;
}

const FOE_TUNING: Record<FoeKind, FoeTuning> = {
  waxed: { notice: 3.2, chase: 0.85, walk: 0.6, wander: 0 },
  sleepwalker: { notice: 4.5, chase: 2.0, walk: 0.8, wander: 1.8 },
};

/** How a member of a fight looks on the map, by its kind. */
const lookOf = (kind: string): Look => (kind === "waxed" ? WAXED_LOOK : SLEEPWALKER_LOOK);
/**
 * How long a chasing enemy keeps hunting once it loses sight of you, in seconds. Meanwhile it
 * heads for where it last saw you; after this, it gives up and goes home.
 */
const CHASE_MEMORY = 4;
/** The most enemies a fight started on the map can hold, counting everyone who joins in. */
const MAX_IN_FIGHT = 4;
/** How close an enemy has to get to you to start its fight, in tiles. */
const TOUCH = 0.7;
/** After arriving on the map (or coming back from a fight), enemies can't start a fight for this long. */
const GRACE_MS = 1500;
/** How long the screen takes to go dark before a fight starts. */
const ENCOUNTER_FADE_MS = 650;

/* ---------- Finding the way: step counts over the floor, no full path search ---------- */

/** Tiles an enemy on level z can walk on (enemies keep to their level: floor only). */
const foeFloor = (z: number, x: number, y: number) => tileAt(z, x, y) === FLOOR;

/**
 * How many steps each tile of level z is from tile (tx, ty), walking floor only (-1: can't get
 * there). One pass over the map; cheap enough to redo whenever you step onto a new tile.
 */
function stepsFrom(z: number, tx: number, ty: number): Int16Array {
  const { w, h } = WORLD;
  const steps = new Int16Array(w * h).fill(-1);
  if (!foeFloor(z, tx, ty)) return steps;
  const queue = [ty * w + tx];
  steps[queue[0]] = 0;
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q], x = i % w, y = (i - x) / w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, ni = ny * w + nx;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || steps[ni] >= 0 || !foeFloor(z, nx, ny)) continue;
      steps[ni] = steps[i] + 1;
      queue.push(ni);
    }
  }
  return steps;
}

/** Whether an enemy at (x, y) on level z could walk straight to (gx, gy) without brushing a wall. */
function clearWalk(z: number, x: number, y: number, gx: number, gy: number) {
  const len = Math.hypot(gx - x, gy - y);
  const n = Math.ceil(len / 0.2);
  const rx = HALF_W + 0.05, ry = HALF_D + 0.05;
  for (let i = 1; i <= n; i++) {
    const px = x + ((gx - x) * i) / n, py = y + ((gy - y) * i) / n;
    for (const [cx, cy] of [[px - rx, py - ry], [px + rx, py - ry], [px - rx, py + ry], [px + rx, py + ry]]) {
      if (!foeFloor(z, Math.floor(cx), Math.floor(cy))) return false;
    }
  }
  return true;
}

/**
 * Where an enemy at (x, y) on level z should head to reach `goal`: straight there if the way is
 * clear, otherwise the middle of the neighbouring tile that's fewest steps from the goal (so it
 * rounds corners and threads doorways instead of pushing into walls).
 */
function waypoint(z: number, x: number, y: number, goal: { x: number; y: number }, steps: Int16Array | null) {
  if (!steps || clearWalk(z, x, y, goal.x, goal.y)) return goal;
  const { w } = WORLD;
  const tx = Math.floor(x), ty = Math.floor(y);
  let best: { x: number; y: number } | null = null, bestSteps = steps[ty * w + tx];
  if (bestSteps < 0) bestSteps = Infinity;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const nx = tx + dx, ny = ty + dy;
    if (!foeFloor(z, nx, ny)) continue;
    // Diagonals only when both tiles beside the corner are floor: no cutting corners.
    if (dx && dy && (!foeFloor(z, tx + dx, ty) || !foeFloor(z, tx, ty + dy))) continue;
    const s = steps[ny * w + nx];
    if (s >= 0 && s < bestSteps) { bestSteps = s; best = { x: nx + 0.5, y: ny + 0.5 }; }
  }
  // Already on the goal's tile, or nothing better nearby: head for the goal itself.
  return best ?? goal;
}

interface Foe extends Walker {
  /** Step counts toward its home, worked out once. */
  homeSteps: Int16Array;
  def: MapFoe;
  /** Where it's ambling to, if anywhere. */
  target: { x: number; y: number } | null;
  /** Seconds left standing still before it moves on. */
  wait: number;
  chasing: boolean;
  /** Seconds since it last saw you, while chasing. */
  lostFor: number;
  /** Where it last saw you, while chasing, with step counts toward that spot. */
  lastSeen: { x: number; y: number; steps: Int16Array | null } | null;
  /** Where you were the last time it saw you. */
  seenAt: { x: number; y: number } | null;
}

/** Where to draw each member of a group of `n`, around the group's position (tiles). */
const huddle = (n: number): [number, number][] =>
  n <= 1 ? [[0, 0]] : n === 2 ? [[-0.2, -0.1], [0.22, 0.06]] : [[-0.25, -0.1], [0.25, -0.08], [0, 0.12]];

/** Your progress on the map, kept while you're away fighting. */
export interface Journey {
  /** Where you are; missing means back at the start. */
  at?: { x: number; y: number; alt: number; facing: Dir };
  /** Enemies already beaten (they stay gone). */
  defeated: string[];
}

/* ============================================================
 * Screen
 * ============================================================ */

export function Exploration({ journey, onEncounter, onExit }: {
  journey: Journey;
  /**
   * A fight starts: the enemy that reached you, then any others chasing you that join in, and
   * where you were, to come back to afterwards.
   */
  onEncounter: (foes: MapFoe[], journey: Journey) => void;
  onExit: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The screen goes dark as a fight begins; input stops.
  const [entering, setEntering] = useState(false);
  const leaving = useRef(false);
  const latest = useRef({ journey, onEncounter });
  latest.current = { journey, onEncounter };
  const [paused, setPaused] = useState(false);
  const [pauseIndex, setPauseIndex] = useState(0);
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const held = useRef<Dir[]>([]);

  const pauseOptions = [
    { label: "Resume", run: () => setPaused(false) },
    { label: "Main menu", run: onExit },
  ];
  const keyHandler = useRef<(e: KeyboardEvent, down: boolean) => void>(() => {});
  keyHandler.current = (e, down) => {
    const dir = readDir(e.key);
    if (!down) {
      if (dir) held.current = held.current.filter(d => d !== dir);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (leaving.current) return;
    const key = e.key.toLowerCase();
    if (key === "escape") {
      e.preventDefault();
      if (!e.repeat) { held.current = []; setPauseIndex(0); setPaused(p => !p); }
      return;
    }
    if (paused) {
      if (e.repeat) return;
      if (dir === "up" || dir === "down") {
        e.preventDefault();
        setPauseIndex(i => (i + (dir === "up" ? -1 : 1) + pauseOptions.length) % pauseOptions.length);
      } else if (key === "e" || key === "enter" || key === " ") {
        e.preventDefault();
        pauseOptions[pauseIndex].run();
      } else if (key === "q") {
        e.preventDefault();
        setPaused(false);
      }
      return;
    }
    if (dir) {
      e.preventDefault();
      if (!e.repeat) held.current = [...held.current.filter(d => d !== dir), dir];
    }
  };

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => keyHandler.current(e, true);
    const onUp = (e: KeyboardEvent) => keyHandler.current(e, false);
    const onBlur = () => { held.current = []; };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const g = canvas.getContext("2d")!;
    const { start } = WORLD;
    const { journey: begin } = latest.current;
    const at = begin.at ?? { x: start.x + 0.5, y: start.y + 0.6, alt: start.z, facing: "down" as Dir };
    const me: Walker = {
      x: at.x, y: at.y, alt: at.alt, vx: 0, vy: 0,
      facing: at.facing, walked: 0, climbing: false, fall: 0, ground: at.alt,
    };
    // Everyone not yet beaten, back where they started.
    const foes: Foe[] = MAP_FOES.filter(f => !begin.defeated.includes(f.id)).map(def => ({
      def, x: def.home.x, y: def.home.y, alt: def.home.z, vx: 0, vy: 0, facing: "down", walked: 0,
      climbing: false, fall: 0, ground: def.home.z, target: null, wait: Math.random() * 2, chasing: false, lostFor: 0, lastSeen: null, seenAt: null,
      homeSteps: stepsFrom(def.home.z, Math.floor(def.home.x), Math.floor(def.home.y)),
    }));
    let grace = GRACE_MS;
    let fadeTimer = 0;
    // What you could see last frame; enemies see you exactly where you see them.
    let seenLast: Float32Array[] | null = null;
    // Step counts toward you, redone whenever you step onto a new tile.
    let toYou: { key: string; steps: Int16Array | null } = { key: "", steps: null };
    const stepsToYou = () => {
      const z = Math.round(me.alt), tx = Math.floor(me.x), ty = Math.floor(me.y);
      const key = `${z},${tx},${ty}`;
      if (toYou.key !== key) toYou = { key, steps: foeFloor(z, tx, ty) ? stepsFrom(z, tx, ty) : null };
      return toYou.steps;
    };
    // The camera follows where you appear on screen: your height lifts you up the screen.
    const cam = { x: me.x, y: me.y - me.alt * RISE };
    let T = 0;
    let painted: { surface: HTMLCanvasElement; faces: HTMLCanvasElement }[] = [];
    // The world is composed here, level by level, before going on screen.
    const scene = makeCanvas(1, 1);
    const sg = scene.getContext("2d")!;
    // What you can see of each level this frame: white where visible, shaded by distance.
    const lights = WORLD.levels.map(() => makeCanvas(1, 1));
    // How brightly you currently see each tile of each level (eased toward what you see now).
    const glow = WORLD.levels.map(() => new Float32Array(WORLD.w * WORLD.h));
    const glowAbove = WORLD.levels.map(() => new Float32Array(WORLD.w * WORLD.h));
    // Brightness of sight, one pixel per tile, stretched (and smoothly blended) over the map.
    const softCanvas = makeCanvas(WORLD.w, WORLD.h);
    const sfg = softCanvas.getContext("2d")!;
    const soft = sfg.createImageData(WORLD.w, WORLD.h);
    // Scratch layer where one view of a level is worked out before joining that level's sight.
    const maskCanvas = makeCanvas(1, 1);
    const mg = maskCanvas.getContext("2d")!;
    // Scratch layer where each slice of a level is cut down to what you can see of it.
    const layer = makeCanvas(1, 1);
    const yg = layer.getContext("2d")!;

    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      for (const c of [scene, layer, maskCanvas, ...lights]) { c.width = canvas.width; c.height = canvas.height; }
      const next = Math.max(8, Math.round(Math.min(canvas.height / TILES_TALL, canvas.width / 13)));
      if (next !== T) {
        T = next;
        painted = WORLD.levels.map((_, z) => paintLevel(z, T));
      }
    };
    fit();
    window.addEventListener("resize", fit);

    /** Which way the held keys point, as -1/0/1 on each axis (opposite keys cancel out). */
    const input = () => {
      const h = held.current;
      return {
        ix: (h.includes("right") ? 1 : 0) - (h.includes("left") ? 1 : 0),
        iy: (h.includes("down") ? 1 : 0) - (h.includes("up") ? 1 : 0),
      };
    };

    const update = (dtMs: number) => {
      const dt = dtMs / 1000;
      const { ix, iy } = input();

      // Facing: a single direction faces it; on a diagonal, keep facing whichever of the two
      // you already were, otherwise the most recently pressed. On a ladder you face the wall.
      if (ix || iy) {
        const options: Dir[] = [];
        if (ix) options.push(ix > 0 ? "right" : "left");
        if (iy) options.push(iy > 0 ? "down" : "up");
        if (!options.includes(me.facing)) {
          me.facing = [...held.current].reverse().find(d => options.includes(d)) ?? options[0];
        }
      }
      if (me.climbing) me.facing = "up";

      // Ease toward the target velocity (diagonals are as fast as straight lines, not faster).
      const len = Math.hypot(ix, iy) || 1;
      const top = SPEED * (me.climbing ? LADDER_SPEED : 1);
      const k = 1 - Math.exp(-ACCEL * dt);
      me.vx += ((ix / len) * top - me.vx) * k;
      me.vy += ((iy / len) * top - me.vy) * k;
      if (!ix && Math.abs(me.vx) < 0.01) me.vx = 0;
      if (!iy && Math.abs(me.vy) < 0.01) me.vy = 0;

      // Move one axis at a time, so you slide along walls instead of sticking to them.
      const startX = me.x, startY = me.y;
      const wantX = me.vx * dt, wantY = me.vy * dt;
      me.x = slide(me, "x", wantX);
      if (Math.abs(me.x - startX) < Math.abs(wantX) * 0.5) {
        me.vx = 0;
        if (ix && !iy) me.y = slide(me, "y", cornerNudge(me, "x", ix, top * dt));
      }
      me.y = slide(me, "y", wantY);
      if (Math.abs(me.y - startY) < Math.abs(wantY) * 0.5) {
        me.vy = 0;
        if (iy && !ix) me.x = slide(me, "x", cornerNudge(me, "y", iy, top * dt));
      }

      // Your height follows whatever you're standing on: this is what carries you up and down.
      // Small differences (stairs, ladders) you simply step across; anything bigger, you fall.
      const under = surfaceNear(Math.floor(me.x), Math.floor(me.y), me.x, me.y, me.alt);
      if (under) {
        if (me.fall === 0 && under.h >= me.alt - STEP_TOLERANCE) {
          me.alt = under.h;
        } else {
          me.fall += GRAVITY * dt;
          me.alt -= me.fall * dt;
          if (me.alt <= under.h) { me.alt = under.h; me.fall = 0; }
        }
        me.ground = under.h;
        me.climbing = me.fall === 0 && under.t === LADDER;
      }

      // The walk cycle follows the distance actually covered.
      const moved = Math.hypot(me.x - startX, me.y - startY);
      if (moved < 1e-3) me.walked = 0;
      else me.walked += moved;

      // The camera eases after you.
      const c = 1 - Math.exp(-CAMERA_FOLLOW * dt);
      cam.x += (me.x - cam.x) * c;
      cam.y += (me.y - me.alt * RISE - cam.y) * c;

      grace = Math.max(0, grace - dtMs);
      for (const f of foes) updateFoe(f, dt);
    };

    const updateFoe = (f: Foe, dt: number) => {
      const tune = FOE_TUNING[f.def.kind];
      const { home } = f.def;
      const level = Math.round(f.alt);
      const tile = Math.floor(f.y) * WORLD.w + Math.floor(f.x);
      const dist = Math.hypot(me.x - f.x, me.y - f.y);
      const sameLevel = Math.abs(me.alt - f.alt) < 0.5;
      // It sees you exactly when you see it. It only notices you up close, but once chasing,
      // it keeps after you anywhere in sight, however far from home that takes it.
      const inSight = sameLevel && (seenLast?.[level]?.[tile] ?? -1) >= 0;
      const seesYou = inSight && dist < (f.chasing ? VISION_RADIUS : tune.notice);
      const fromHome = Math.hypot(f.x - home.x, f.y - home.y);

      // Out of sight, it hunts for you where it last saw you; only after a while without
      // seeing you again does it give up, stand a moment, and amble home.
      if (seesYou) {
        f.chasing = true;
        f.lostFor = 0;
        f.lastSeen = null;
        f.seenAt = { x: me.x, y: me.y };
      } else if (f.chasing) {
        if (!f.lastSeen) {
          // Just lost you: head for the last place it saw you.
          const at = f.seenAt ?? { x: me.x, y: me.y };
          const tx = Math.floor(at.x), ty = Math.floor(at.y);
          f.lastSeen = { x: at.x, y: at.y, steps: foeFloor(level, tx, ty) ? stepsFrom(level, tx, ty) : null };
        }
        f.lostFor += dt;
        if (f.lostFor > CHASE_MEMORY) { f.chasing = false; f.lastSeen = null; f.target = null; f.wait = 1; }
      }
      let goal: { x: number; y: number } | null = null, speed = 0;
      if (f.chasing) { goal = f.lastSeen ?? me; speed = tune.chase; }
      else if (f.wait > 0) f.wait -= dt;
      else {
        if (!f.target) {
          if (fromHome > 0.3) f.target = { x: home.x, y: home.y };
          else if (tune.wander > 0) {
            const a = Math.random() * Math.PI * 2, r = 0.6 + Math.random() * (tune.wander - 0.6);
            const tx = home.x + Math.cos(a) * r, ty = home.y + Math.sin(a) * r;
            const there = surfaceNear(Math.floor(tx), Math.floor(ty), tx, ty, f.alt);
            if (there && Math.abs(there.h - f.alt) < 0.01) f.target = { x: tx, y: ty };
            else f.wait = 0.5;
          }
        }
        if (f.target) { goal = f.target; speed = tune.walk; }
      }

      let ix = 0, iy = 0;
      if (goal) {
        const gx = goal.x - f.x, gy = goal.y - f.y, len = Math.hypot(gx, gy);
        if (len < 0.08) {
          // Arrived. Hunting where it last saw you, it just stands there searching.
          if (!f.chasing) { f.target = null; f.wait = 1 + Math.random() * 2.5; }
        } else {
          // Chasing you, hunting the last place it saw you, or heading home: follow the step
          // counts round corners. Ambling about nearby: straight there.
          const steps = f.chasing ? (f.lastSeen ? f.lastSeen.steps : stepsToYou())
            : goal === f.target && f.target.x === home.x && f.target.y === home.y ? f.homeSteps : null;
          const via = waypoint(level, f.x, f.y, goal, steps);
          const vx = via.x - f.x, vy = via.y - f.y, vl = Math.hypot(vx, vy) || 1;
          ix = vx / vl; iy = vy / vl;
        }
      }
      const k = 1 - Math.exp(-ACCEL * 0.6 * dt);
      f.vx += (ix * speed - f.vx) * k;
      f.vy += (iy * speed - f.vy) * k;
      const sx = f.x, sy = f.y;
      f.x = slide(f, "x", f.vx * dt);
      f.y = slide(f, "y", f.vy * dt);
      // Enemies keep to their level: no walking off ledges.
      const under = surfaceNear(Math.floor(f.x), Math.floor(f.y), f.x, f.y, f.alt);
      if (!under || under.h < f.alt - STEP_TOLERANCE) { f.x = sx; f.y = sy; f.vx = f.vy = 0; f.target = null; f.wait = 0.5; }
      else f.alt = under.h;
      const moved = Math.hypot(f.x - sx, f.y - sy);
      if (goal && !f.chasing && moved < 1e-4 && Math.hypot(f.vx, f.vy) > 0.2) { f.target = null; f.wait = 1; } // stuck on a wall
      f.walked = moved < 1e-4 ? 0 : f.walked + moved;
      if (Math.abs(f.vx) > 0.05 || Math.abs(f.vy) > 0.05) {
        f.facing = Math.abs(f.vx) > Math.abs(f.vy) ? (f.vx > 0 ? "right" : "left") : (f.vy > 0 ? "down" : "up");
      }

      // Close enough: the fight begins, and everyone else chasing you piles in.
      if (grace <= 0 && sameLevel && dist < TOUCH && !leaving.current) {
        leaving.current = true;
        held.current = [];
        setEntering(true);
        const backTo: Journey = {
          at: { x: me.x, y: me.y, alt: me.alt, facing: me.facing },
          defeated: latest.current.journey.defeated,
        };
        const joining = [f.def, ...pursuers(f)];
        fadeTimer = window.setTimeout(() => latest.current.onEncounter(joining, backTo), ENCOUNTER_FADE_MS);
      }
    };

    /**
     * Who joins the fight `first` starts: the others chasing you, nearest first, as long as the
     * fight stays within MAX_IN_FIGHT enemies. Anyone left out keeps chasing on the map.
     */
    const pursuers = (first: Foe): MapFoe[] => {
      let count = first.def.fight.length;
      const out: MapFoe[] = [];
      const chasing = foes
        .filter(f => f !== first && f.chasing)
        .sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y));
      for (const f of chasing) {
        if (count + f.def.fight.length > MAX_IN_FIGHT) continue;
        count += f.def.fight.length;
        out.push(f.def);
      }
      return out;
    };

    /** Draws enemies on level z that pass `test`, as seen from the camera at (ox, oy). */
    const drawFoes = (ctx: CanvasRenderingContext2D, z: number, ox: number, oy: number, test: (f: Foe) => boolean) => {
      const list = foes.filter(f => Math.round(f.alt) === z && test(f)).sort((a, b) => a.y - b.y);
      for (const f of list) {
        const phase = Math.floor(f.walked / STRIDE) % 4;
        const frame: Frame = f.walked <= 0 ? "stand" : phase === 0 ? "stepR" : phase === 2 ? "stepL" : "stand";
        // Each member of the group drawn as what it is, back ones first.
        const spots = huddle(f.def.fight.length);
        const members = f.def.fight.map((m, i) => ({ look: lookOf(m.kind), at: spots[i] })).sort((a, b) => a.at[1] - b.at[1]);
        for (const { look, at: [dx, dy] } of members) {
          const px = ox + (f.x + dx) * T, py = oy + (f.y + dy - f.alt * RISE - BODY_ABOVE_FEET) * T;
          drawWalker(ctx, px, py, T, f.facing, frame, true, 0, look);
        }
      }
    };

    const draw = (dtMs: number) => {
      const W = canvas.width, H = canvas.height;
      // Snap to whole pixels so the tiles don't shimmer while scrolling.
      const ox = Math.round(W / 2 - cam.x * T);
      const oy = Math.round(H / 2 - (cam.y - BODY_ABOVE_FEET) * T);
      const levelY = (z: number) => oy - Math.round(z * RISE * T);
      const fx = ox + me.x * T, fy = oy + (me.y - me.alt * RISE) * T;

      // Sight, one mask per level.
      // - Levels at or below you: pinned to that level's own height, so they never slide as you
      //   climb, and seen across that level's own grid (from a bridge you look out over the hall
      //   below). If that level is solid rock where you stand, your own level's sight is used.
      // - Levels above you: seen only through your own level's sight, held at your own eye
      //   height. From below you only glimpse their near edge, and more of them comes into view
      //   as you climb toward them.
      const seenAll = sight(me.x, me.y, me.alt);
      seenLast = seenAll;
      const ownLevel = Math.max(0, Math.min(LEVELS - 1, Math.round(me.alt)));
      const strip = Math.ceil(T / 12) + 1, rise = RISE * T, fadeOver = VISION_RADIUS * (1 - VISION_FULL);
      const { w: MW, h: MH } = WORLD;
      const ease = 1 - Math.exp(-SIGHT_EASE * dtMs / 1000);
      /**
       * Paints into `lights[z]` what you see of a level, judged by sight `left` on level gz's
       * tiles, placed with its top row at `top`. `shown` holds the eased brightness per tile.
       */
      const paintSight = (z: number, gz: number, left: Float32Array, top: number, shown: Float32Array) => {
        // Ease each tile's brightness toward what you see now, so sight fades in and out.
        for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
          const i = y * MW + x;
          const target = seeThrough(gz, x, y) && left[i] >= 0 ? Math.min(1, left[i] / fadeOver) : 0;
          shown[i] += (target - shown[i]) * ease;
          if (shown[i] < 0.002) shown[i] = 0;
        }
        const lit = (x: number, y: number) =>
          x >= 0 && y >= 0 && x < MW && y < MH && seeThrough(gz, x, y) ? shown[y * MW + x] : 0;
        // Tiles with light, or right next to some: the soft brightness below fades out across
        // these, so nothing switches on abruptly at the edge of your sight.
        const near = (x: number, y: number) => {
          if (!seeThrough(gz, x, y)) return false;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (lit(x + dx, y + dy) > 0) return true;
          return false;
        };

        // The shape of what you see, crisp at the walls: every tile near light, plus the
        // near edges of the walls around them (their rim, and their face if it's toward you).
        mg.globalCompositeOperation = "source-over";
        mg.clearRect(0, 0, W, H);
        mg.fillStyle = "#fff";
        for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
          const px = ox + x * T, py = top + y * T;
          if (near(x, y)) {
            const t = tileAt(gz, x, y);
            // Stairs rise over the tile behind them; ledges hang a face over the tile in front.
            const up = isRamp(t) ? rise : 0;
            const down = t === FLOOR && isAir(gz, x, y + 1) ? (gz - groundBelow(gz, x, y + 1)) * rise : 0;
            mg.fillRect(px, py - up, T, T + up + down);
          } else if (!seeThrough(gz, x, y)) {
            if (lit(x, y - 1) > 0) mg.fillRect(px, py, T, strip);
            if (lit(x, y + 1) > 0) mg.fillRect(px, py + T - rise - strip, T, rise + strip);
            if (lit(x - 1, y) > 0) mg.fillRect(px, py, strip, T);
            if (lit(x + 1, y) > 0) mg.fillRect(px + T - strip, py, strip, T);
          }
        }

        // How brightly: one value per tile, blended smoothly between tiles. Walls take the
        // brightness of the floor beside them.
        const pix = soft.data;
        for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
          let a = lit(x, y);
          if (!seeThrough(gz, x, y)) a = Math.max(lit(x, y - 1), lit(x, y + 1), lit(x - 1, y), lit(x + 1, y));
          const k = (y * MW + x) * 4;
          pix[k] = pix[k + 1] = pix[k + 2] = 255;
          pix[k + 3] = Math.round(a * 255);
        }
        sfg.putImageData(soft, 0, 0);
        mg.globalCompositeOperation = "destination-in";
        mg.imageSmoothingEnabled = true;
        mg.drawImage(softCanvas, ox, top, MW * T, MH * T);
        const lg = lights[z].getContext("2d")!;
        lg.drawImage(maskCanvas, 0, 0);
      };

      for (let z = 0; z < LEVELS; z++) {
        lights[z].getContext("2d")!.clearRect(0, 0, W, H);
        // What sight reaches of this level, pinned to the level's own height.
        paintSight(z, z, seenAll[z], levelY(z), glow[z]);
        // Levels above you are also glimpsed through your own level's sight, held at your eye
        // height: from below you catch their near edge, and more as you climb toward them.
        if (z > me.alt + 1e-3) paintSight(z, ownLevel, seenAll[ownLevel], oy - me.alt * RISE * T, glowAbove[z]);
      }

      /**
       * Draws rows r0..r1 of level z, with the enemies standing in them that pass `test`,
       * cut down to what you can see of that level.
       */
      const rows = (z: number, r0: number, r1: number, test: (f: Foe) => boolean = () => true) => {
        if (r1 <= r0) return;
        const { surface, faces } = painted[z];
        const sw = WORLD.w * T, sy = r0 * T, sh = (r1 - r0) * T, dy = levelY(z) + sy;
        yg.globalCompositeOperation = "source-over";
        yg.clearRect(0, 0, W, H);
        yg.drawImage(surface, 0, sy, sw, sh, ox, dy, sw, sh);
        yg.drawImage(faces, 0, sy, sw, sh, ox, dy + T, sw, sh);
        drawFoes(yg, z, ox, oy, f => f.y >= r0 && f.y < r1 && test(f));
        yg.globalCompositeOperation = "destination-in";
        yg.drawImage(lights[z], 0, 0);
        sg.drawImage(layer, 0, 0);
      };
      /** Enemies alone on level z, cut down to what you can see of it (those in front of you). */
      const foesOnly = (z: number, test: (f: Foe) => boolean) => {
        yg.globalCompositeOperation = "source-over";
        yg.clearRect(0, 0, W, H);
        drawFoes(yg, z, ox, oy, test);
        yg.globalCompositeOperation = "destination-in";
        yg.drawImage(lights[z], 0, 0);
        sg.drawImage(layer, 0, 0);
      };

      // Each stretch of STRIDE lifts a foot, then lands it: right, stand, left, stand.
      const phase = Math.floor(me.walked / STRIDE) % 4;
      const frame: Frame = me.walked <= 0 ? "stand" : phase === 0 ? "stepR" : phase === 2 ? "stepL" : "stand";

      // Levels at or below you go down whole. Levels above are split at your row: the part
      // behind you first, then you, then the part in front of or over you.
      sg.clearRect(0, 0, W, H);
      const base = Math.floor(me.alt + 1e-3);
      const split = Math.max(0, Math.min(WORLD.h, Math.floor(me.y)));
      // On your own level, enemies further down the screen than you go in front of you.
      for (let z = 0; z < LEVELS; z++) {
        rows(z, 0, z <= base ? WORLD.h : split, f => z !== base || f.y <= me.y);
        // Whatever lies below you is dimmed, more so the further down: it reads as depth.
        const below = Math.min(1, Math.max(0, me.alt - z));
        if (below > 0 && z < LEVELS - 1) {
          sg.fillStyle = `rgb(0 0 0 / ${DEPTH_DIM * below})`;
          sg.fillRect(0, 0, W, H);
        }
      }
      drawWalker(sg, fx, fy - BODY_ABOVE_FEET * T, T, me.facing, frame, true, (me.alt - me.ground) * RISE);
      if (base < LEVELS) foesOnly(base, f => f.y > me.y);
      for (let z = base + 1; z < LEVELS; z++) rows(z, split, WORLD.h);

      g.fillStyle = COLORS.void;
      g.fillRect(0, 0, W, H);
      g.drawImage(scene, 0, 0);
      // Your outline shows faintly through anything covering you (it vanishes into you otherwise).
      g.globalAlpha = GHOST_ALPHA;
      drawWalker(g, fx, fy - BODY_ABOVE_FEET * T, T, me.facing, frame, false);
      g.globalAlpha = 1;
    };

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(now - last, 100);
      last = now;
      if (!pausedRef.current && !leaving.current) update(dt);
      draw(dt);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); window.clearTimeout(fadeTimer); window.removeEventListener("resize", fit); };
  }, []);

  return (
    <div className="explore">
      <canvas ref={canvasRef} className="explore-canvas" />
      {entering && <div className="explore-fade" />}
      {paused && (
        <div className="result" role="dialog" aria-label="Paused">
          <nav className="pause-menu">
            {pauseOptions.map((o, i) => (
              <button
                key={o.label}
                className={`menu-button ${i === pauseIndex ? "is-focused" : ""}`}
                onMouseEnter={() => setPauseIndex(i)}
                onClick={o.run}
              >
                {o.label}
              </button>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}