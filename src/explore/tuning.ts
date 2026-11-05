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
/** Your own stride is a little longer, so your walk cycle is slower than the enemies'. */
export const PLAYER_STRIDE = 0.54;

/** Your footprint for bumping into walls: half its width and half its depth, in tiles. */
export const HALF_W = 0.28;

export const HALF_D = 0.18;

/** How far sideways you'll be nudged around a corner into a doorway, in tiles. */
export const CORNER_ASSIST = 0.45;

/** The biggest height difference (in storeys) you can step across. Bigger drops are falls. */
export const STEP_TOLERANCE = 0.35;

/** How quickly falls speed up, in storeys per second squared. */
export const GRAVITY = 10;

/** The height of a plane under the whole map (level -10): whoever falls through the cracks of the geometry lands on it, and that is the end of them (they wake by the keeper they last rested by). */
export const FALL_DEATH_ALT = -10;

/** How quickly the camera catches up with you (higher = tighter). */
export const CAMERA_FOLLOW = 9;

/** How far you can see, in tiles. */
export const VISION_RADIUS = 5.5;

/** How far the flood of sight reaches: past the circle by a tenth (steps over the grid are longer than straight lines, so the circle isn't clipped on the diagonals) and by half a tile more, so the edge of what sight reaches lies beyond the fade of the light and adds no fade of its own; the renderer cuts the light to the true circle. */
export const SIGHT_REACH = VISION_RADIUS * 1.1 + 0.5;

/** How wide the fade at the edge of your sight is, in tiles: everything inside it is fully lit, and past it nothing is drawn. */
export const VISION_FADE = 1;

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

/** The colour of a floor of wax: the wax-filled floors, the wax ramp and the labyrinth's floor are all this. */
export const WAX_FLOOR = "#8a7a40";

/** The labyrinth: floor, walls and ledges all of dark, yellowed wax. */
const WAXED: Partial<Palette> = {
  floor: WAX_FLOOR, floorGrout: "#5e4f25", wallFace: "#4d4120", wallEdge: "#8a7637",
  ledgeFace: "#3c3218", ledgeRim: "#a08b48", stairs: "#806c33", rung: "#b09a52",
};

/** Walls of wax: pale, smooth candle wax. */
export const WAX_WALL: Palette = {
  ...COLORS,
  floor: WAX_FLOOR, floorGrout: "#85763a", wallFace: "#c3b274", wallEdge: "#eadda5",
  ledgeFace: "#8a7a3e", ledgeRim: "#eadda5", stairs: WAX_FLOOR, rung: "#eadda5",
};

/** Wood: the planks and stairs of the bridge. */
export const WOOD: Palette = {
  ...COLORS,
  floor: "#7b5b37", floorGrout: "#4a3520", wallFace: "#50391f", wallEdge: "#6c4e2e",
  ledgeFace: "#3d2b18", ledgeRim: "#8a6840", stairs: "#8a6840", rung: "#c0a070",
};

/** The mined tunnels below the wheel: dark, rough rock, cobbled underfoot (see `minedAt` in world.ts). */
export const MINED: Palette = {
  ...COLORS,
  floor: "#34302b", floorGrout: "#1b1917", wallFace: "#2a2c33", wallEdge: "#3b3e48",
  ledgeFace: "#171513", ledgeRim: "#3d3833", stairs: "#3a352f", rung: "#4d463e",
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
  WARM, WARM, WARM, WARM, WARM, WARM, WARM, WARM, WARM, WARM, WARM, WARM, // Floor C (the Sanctum) and the walls above it
];

/** Whether level z is one of the waxed levels (the labyrinth): its walls and cliffs get the wax's drips. */
export const isWaxedLevel = (z: number) => LEVEL_LOOKS[z] === WAXED;

/** The colors to paint level z's tiles with. */
export const paletteOf = (z: number): Palette => ({ ...COLORS, ...LEVEL_LOOKS[z] });

/** The levels with sleepers sealed into the wax (the labyrinth). */
export const SEALED_LEVELS = [0];

/** How many tiles have a sealed sleeper: the share of wall faces (a wall with floor in front of it) and of floor tiles. */
export const SEALED_DENSITY = { wall: 0.3, floor: 0.06 };

/** How the sleepers sealed in the wax look: the dark body, the light edge it catches, and the sheen of the wax skin over the ones on the floor. */
export const SEALED_COLORS = { body: "rgb(30 24 10 / 0.6)", rim: "rgb(190 165 90 / 0.35)", sheen: "rgb(230 205 130 / 0.1)" };

/** The most device pixels the map is drawn at per CSS pixel: high-density screens are drawn a little softer, for a much lighter frame. */
export const MAX_PIXEL_RATIO = 1.5;

/** The map is drawn at this share of the screen's pixels (after MAX_PIXEL_RATIO) and scaled up by the browser: a lighter frame and lighter baked pictures, for slightly softer tiles. */
export const RENDER_SCALE = 0.85;

/**
 * How far the light of an entrance reaches, in tiles, when you stand `distance` tiles from it:
 * what is left of your sight past it (a test: it used to be GAP_PEEK, shrinking evenly to nothing at the edge of your sight).
 */
export const lampRadius = (distance: number) => Math.max(0, VISION_RADIUS - distance);
