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

/** How much higher on screen each storey is drawn, in tiles. Also the height of wall faces. */
export const RISE = 0.6;

/** Top walking speed, in tiles per second. */
export const SPEED = 4.6;

/** Ladders are climbed at this share of walking speed. */
export const LADDER_SPEED = 0.5;

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

/** How much each storey below you is darkened (0 = not at all, 1 = black). */
export const DEPTH_DIM = 0.45;

/** How strongly your outline shows through things that cover you. */
export const GHOST_ALPHA = 0.3;
