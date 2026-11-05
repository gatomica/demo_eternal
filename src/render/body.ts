/**
 * body.ts — how the player's body sits in the camera's 3/4 view from BEHIND (the figure faces right, away from the camera and a little to the side).
 *
 * Think of the floor from above: east is the way the player faces (screen right), south is toward the camera. The camera looks north-east, so
 * east lands on the screen's right and south lands on the screen's right a little too and (being nearer) lower down. A body turned by `psi`
 * (degrees, positive turns to the right, toward the camera) has its forward axis (cos, sin) in (east, south) and its right-hand axis (-sin, cos).
 * So from behind: the player's RIGHT side is the near one (lower on the page, and toward +x), the LEFT the far one (higher, toward -x). Turn
 * the shoulders right, and the right shoulder draws back and the left comes forward (an orthodox stance, left foot forward); turn them left
 * and the right comes forward. This is not the enemies' view (they face the camera, mirrored), nor its reverse.
 */
import type { Pt } from "./geom";

/** How far round the camera is from straight behind, and how much depth (south) shows as height on the page (little: the camera is not above the player, so hips and shoulders stay nearly level). */
export const CAM_YAW = (45 * Math.PI) / 180;
export const DEPTH = 0.15;
/** Half the width of the shoulders and of the hips (in figure units). */
export const SHOULDER_HALF = 6;
export const HIP_HALF = 3.4;

/**
 * Where a point of the body lies on the page, as an offset from the spine: `f` forward and `r` to the right of the body (figure units), the body
 * turned by `psi` degrees.
 */
export function onBody(f: number, r: number, psi: number): Pt {
  const p = (psi * Math.PI) / 180;
  const east = f * Math.cos(p) - r * Math.sin(p);
  const south = f * Math.sin(p) + r * Math.cos(p);
  // Nearer the camera is lower on the page: south is nearer, east (the way the player faces, and the enemies) is farther, so a line pointing east rises a little to the right.
  return [east * Math.cos(CAM_YAW) + south * Math.sin(CAM_YAW), (south - east) * DEPTH];
}

/** Where the body's forward points on the page (a unit-ish vector), turned by `psi` degrees. */
export function forwardOnPage(psi: number): Pt {
  return onBody(1, 0, psi);
}
