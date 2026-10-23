/**
 * seals.ts — the wax that closes the start room's two exits until the tutorial is done: where it
 * stands, whether it's up, and how it's drawn (and melts).
 */
import { FLOOR, tileAt } from "./world";

/** One tile of wax in a corridor, on the world grid (the map's margin included). */
interface Seal {
  x: number; y: number; z: number;
}

export const SEALS: Seal[] = [
  // The corridor east, into the hall.
  { x: 9, y: 4, z: 2 },
  // The corridor south, toward the cellar stairs.
  { x: 5, y: 8, z: 2 },
];

/** How long the wax takes to run away once the guide lets it go. */
export const MELT_MS = 2000;

const WAX = "#b9a14e", WAX_DARK = "#8f7b34", WAX_LIGHT = "#d6c277";

// Whether the wax is up. The map is built once, so this lives beside it instead of in it:
// walls and floors ask `sealedAt`, and the screen turns the seals on and off.
let up = false;

export const setSeals = (on: boolean) => { up = on; };
export const sealsUp = () => up;

/** Whether tile (x, y) of level z is closed by wax right now. */
export const sealedAt = (z: number, x: number, y: number) => up && SEALS.some(s => s.z === z && s.x === x && s.y === y);

/** A floor tile you can stand on: floor, and not waxed shut. */
export const openFloor = (z: number, x: number, y: number) => tileAt(z, x, y) === FLOOR && !sealedAt(z, x, y);

/**
 * Draws a seal filling the tile whose top-left corner is (x, y), `T` pixels per tile: a slab of
 * wax standing taller than you, drips down its face. `melt` runs 0 (whole) to 1 (a puddle), and
 * the slab sinks and pools as it goes.
 */
export function drawSeal(g: CanvasRenderingContext2D, x: number, y: number, T: number, melt: number) {
  const left = x + 0.03 * T, width = 0.94 * T, foot = y + 0.96 * T;
  const rise = 1.35 * T * (1 - melt);
  g.save();
  g.globalAlpha = 1 - 0.6 * melt * melt;
  // The puddle it leaves, spreading over the floor.
  g.fillStyle = WAX_DARK;
  g.beginPath(); g.ellipse(x + T / 2, foot - 0.04 * T, (0.46 + 0.1 * melt) * T, (0.12 + 0.06 * melt) * T, 0, 0, Math.PI * 2); g.fill();
  if (rise > 1) {
    const body = g.createLinearGradient(left, 0, left + width, 0);
    body.addColorStop(0, WAX_DARK); body.addColorStop(0.35, WAX_LIGHT); body.addColorStop(1, WAX);
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(left, foot);
    g.lineTo(left + 0.04 * T, foot - rise);
    g.quadraticCurveTo(left + width / 2, foot - rise - 0.18 * T, left + width - 0.04 * T, foot - rise);
    g.lineTo(left + width, foot);
    g.closePath();
    g.fill();
    g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 1; g.stroke();
    // Drips running down the face, longer as it melts.
    g.fillStyle = WAX_LIGHT;
    for (const [u, len] of [[0.22, 0.4], [0.5, 0.65], [0.78, 0.3]]) {
      const top = foot - rise + 0.04 * T, bottom = Math.min(foot, top + (len + 0.4 * melt) * rise);
      g.beginPath(); g.roundRect(x + u * T - 0.04 * T, top, 0.08 * T, bottom - top, 0.04 * T); g.fill();
    }
  }
  g.restore();
}
