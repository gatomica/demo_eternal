/**
 * sealed.ts — the sleepers sealed into the wax of the labyrinth: dark outlines of people pressed
 * into the wall faces and lying under the floor's skin of wax. Pure decoration, painted into the
 * level's cached chunks (so it costs nothing per frame), and the same every run: whether a tile
 * has one, and which, is a hash of the tile's place. They sit on the labyrinth's levels only
 * (`SEALED_LEVELS`), as dense as `SEALED_DENSITY` says.
 */
import { SEALED_COLORS, SEALED_DENSITY, SEALED_LEVELS } from "./tuning";

/** A well-mixed number from 0 to 1 for tile (x, y) of level z, different for each `salt`. */
function roll(z: number, x: number, y: number, salt: number) {
  let h = (Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663) ^ Math.imul(z + 1, 83492791) ^ Math.imul(salt + 1, 2654435761)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Whether level z has sealed sleepers at all. */
export const hasSealed = (z: number) => SEALED_LEVELS.includes(z);

/** A shape drawn as relief: a light rim a little off to one side, then the dark body over it. */
function relief(g: CanvasRenderingContext2D, T: number, shape: () => void) {
  const d = Math.max(1, Math.round(T / 28));
  g.save();
  g.translate(-d, -d);
  g.fillStyle = SEALED_COLORS.rim;
  shape();
  g.fill();
  g.restore();
  g.fillStyle = SEALED_COLORS.body;
  shape();
  g.fill();
}

/**
 * A sleeper pressed into the face of the wall tile (x, y), if this tile has one: standing,
 * slumped, or sitting with its head on its knees. \`g\` is in the level's canvas coordinates.
 */
export function paintSealedWall(g: CanvasRenderingContext2D, z: number, x: number, y: number, T: number) {
  if (roll(z, x, y, 0) >= SEALED_DENSITY.wall) return;
  const kind = Math.floor(roll(z, x, y, 1) * 3);
  const jitter = (roll(z, x, y, 2) - 0.5) * 0.2;
  const ox = x * T + jitter * T, oy = y * T;
  const circle = (u: number, v: number, r: number) => { g.moveTo(ox + (u + r) * T, oy + v * T); g.arc(ox + u * T, oy + v * T, r * T, 0, Math.PI * 2); };
  const body = (u: number, v: number, rx: number, ry: number, tilt = 0) => { g.moveTo(ox + (u + rx) * T, oy + v * T); g.ellipse(ox + u * T, oy + v * T, rx * T, ry * T, tilt, 0, Math.PI * 2); };
  relief(g, T, () => {
    g.beginPath();
    if (kind === 0) {
      // Standing, arms at its sides.
      circle(0.5, 0.25, 0.09);
      body(0.5, 0.58, 0.12, 0.26);
      body(0.37, 0.55, 0.035, 0.2);
      body(0.63, 0.55, 0.035, 0.2);
    } else if (kind === 1) {
      // Slumped, head fallen to one side.
      circle(0.43, 0.34, 0.09);
      body(0.5, 0.62, 0.15, 0.25, 0.2);
    } else {
      // Sitting, curled up with its head on its knees.
      circle(0.46, 0.5, 0.08);
      body(0.5, 0.74, 0.2, 0.15);
    }
  });
}

/** A sleeper lying under the wax of floor tile (x, y), if this tile has one. */
export function paintSealedFloor(g: CanvasRenderingContext2D, z: number, x: number, y: number, T: number) {
  if (roll(z, x, y, 3) >= SEALED_DENSITY.floor) return;
  const lengthways = roll(z, x, y, 4) < 0.5, flip = roll(z, x, y, 5) < 0.5 ? 1 : -1;
  const cx = (x + 0.5) * T, cy = (y + 0.5) * T;
  g.save();
  g.translate(cx, cy);
  if (!lengthways) g.rotate(Math.PI / 2);
  relief(g, T, () => {
    g.beginPath();
    g.moveTo(0.34 * T, 0);
    g.ellipse(0, 0, 0.34 * T, 0.1 * T, 0, 0, Math.PI * 2);
    g.moveTo(flip * 0.42 * T + 0.08 * T, 0);
    g.arc(flip * 0.42 * T, 0, 0.08 * T, 0, Math.PI * 2);
  });
  // The wax skin over it, catching the light.
  g.fillStyle = SEALED_COLORS.sheen;
  g.beginPath();
  g.ellipse(0, -0.02 * T, 0.38 * T, 0.12 * T, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
}
