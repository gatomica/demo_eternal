/**
 * tuning.ts — the map's look and feel: colors, sizes, speeds, sight.
 */

/* ============================================================
 * Look
 * ============================================================ */

export const COLORS = {
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
export const TILES_TALL = 11;

/** How much higher on screen each storey is drawn, in tiles: one storey is one tile of height. Also the height of wall faces. */
export const RISE = 1;

/** Top walking speed, in tiles per second. */
export const SPEED = 4.6;

/** Ladders are climbed at this share of walking speed. */
export const LADDER_SPEED = 0.5;

/** Stairs are walked at this share of walking speed: they climb a whole level in one tile, so your path along the slope is longer (1 / the slope's length at 45 degrees is about 0.7), and you'd seem to speed up otherwise. */
export const STAIRS_SPEED = 0.7;

/** How quickly you reach top speed and come to a stop (higher = snappier). */
export const ACCEL = 16;

/** How far you travel per walk-cycle frame, in tiles (a full cycle is four of these). */
export const STRIDE = 0.42;

/** Your footprint for bumping into walls: half its width and half its depth, in tiles. */
export const HALF_W = 0.28;

export const HALF_D = 0.18;

/** How far sideways you'll be nudged around a corner into a doorway, in tiles. */
export const CORNER_ASSIST = 0.45;

/** The biggest height difference (in storeys) you can step across. Bigger drops are falls. */
export const STEP_TOLERANCE = 0.35;

/** How quickly falls speed up, in storeys per second squared. */
export const GRAVITY = 10;

/** How quickly the camera catches up with you (higher = tighter). */
export const CAMERA_FOLLOW = 9;

/** How far you can see, in tiles. */
export const VISION_RADIUS = 5.5;

/** Share of that radius that's fully lit before it starts fading to black. */
export const VISION_FULL = 0.5;

/** How quickly what you see catches up as you move (higher = snappier, lower = softer fades). */
export const SIGHT_EASE = 7;

/** How far sight carries past a doorway or the mouth of a corridor, in tiles. */
export const GAP_PEEK = 2.5;

/** The figure is drawn this far above its feet, in tiles. */
export const BODY_ABOVE_FEET = 0.36;

/** How many levels above or below you a wall or a floor below you is gone at: it fades evenly on the way there. */
export const WALL_FADE_LEVELS = 5;

/** How much of a wall (or a floor below you) shows, this many levels from yours: 1 on your own level, 0 once it can't be seen. */
export const wallFade = (levels: number) => Math.max(0, 1 - levels / WALL_FADE_LEVELS);

/** How strongly your outline shows through things that cover you. */
export const GHOST_ALPHA = 0.3;

/** The colors of the map's tiles: what `COLORS` holds for the tile kinds. */
export type Palette = Pick<typeof COLORS, "wallFace" | "wallEdge" | "ledgeFace" | "ledgeRim" | "floor" | "floorGrout" | "stairs" | "rung">;

/** The labyrinth: floor, walls and ledges all of dark, yellowed wax. */
const WAXED: Partial<Palette> = {
  floor: "#76652f", floorGrout: "#5e4f25", wallFace: "#4d4120", wallEdge: "#8a7637",
  ledgeFace: "#3c3218", ledgeRim: "#a08b48", stairs: "#806c33", rung: "#b09a52",
};

/** The shaft: bare, cold stone, darker than the first floor. */
const SHAFT: Partial<Palette> = {
  floor: "#34343b", floorGrout: "#2c2c32", wallFace: "#222227", wallEdge: "#2d2d33",
  ledgeFace: "#1c1c20", ledgeRim: "#47474f", rung: "#55555d",
};

/** Overrides of `COLORS` for the levels that have a look of their own, by level number: the labyrinth is level 0, the shaft 1 to 5. Floor A (6 to 9) keeps the plain stone, Floor B (10 to 12) is blue-grey, Floor C (13) a darker, warmer stone. */
/** Floor B, the Gallery: a cooler blue-grey stone. */
const COOL: Partial<Palette> = {
  floor: "#3a4252", floorGrout: "#323946", wallFace: "#262b36", wallEdge: "#30374a",
  ledgeFace: "#20242d", ledgeRim: "#566077", stairs: "#475068", rung: "#6a7490",
};

/** Floor C, the Sanctum: a darker, warmer stone. */
const WARM: Partial<Palette> = {
  floor: "#4a3c3a", floorGrout: "#403432", wallFace: "#2e2422", wallEdge: "#3a2f2c",
  ledgeFace: "#241c1a", ledgeRim: "#6a5650", stairs: "#54443f", rung: "#7a6660",
};

export const LEVEL_LOOKS: (Partial<Palette> | undefined)[] = [
  WAXED, SHAFT, SHAFT, SHAFT, SHAFT, SHAFT, // the labyrinth and the shaft
  undefined, undefined, undefined, undefined, // Floor A (the wheel on level 6, the Nave on 7) and its stair levels: the plain stone
  COOL, COOL, COOL, // Floor B (the Gallery) and its stair levels
  WARM, // Floor C (the Sanctum)
];

/** The colors to paint level z's tiles with. */
export const paletteOf = (z: number): Palette => ({ ...COLORS, ...LEVEL_LOOKS[z] });

/** The levels with sleepers sealed into the wax (the labyrinth). */
export const SEALED_LEVELS = [0];

/** How many tiles have a sealed sleeper: the share of wall faces (a wall with floor in front of it) and of floor tiles. */
export const SEALED_DENSITY = { wall: 0.3, floor: 0.06 };

/** How the sleepers sealed in the wax look: the dark body, the light edge it catches, and the sheen of the wax skin over the ones on the floor. */
export const SEALED_COLORS = { body: "rgb(30 24 10 / 0.6)", rim: "rgb(190 165 90 / 0.35)", sheen: "rgb(230 205 130 / 0.1)" };
