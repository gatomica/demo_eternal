/**
 * camera.ts — the battlefield's floor plan and camera. Pure math, no React, no rules.
 *
 * Everyone stands somewhere on a flat floor, measured in meters: `x` to the side, `z` ahead.
 * A camera stands on that floor too, at a fixed eye height, looking in a direction (`yaw`).
 * `project` turns a floor position into where a figure's feet land on screen and how many
 * pixels a meter is at that distance, so sizes come from depth on their own.
 *
 * The planning view is always the same shot relative to the player: from behind and a little
 * to the right, so you see your back on the left and the enemies ahead on the right. Enemies
 * stand in two lines (front and back) relative to you. Moving the player, or turning them,
 * moves the camera and the whole formation with them.
 */

/** A point on the floor, in meters. */
export interface Vec { x: number; z: number }

/** The camera: where it stands on the floor, and the direction it looks (radians, 0 = +z). */
export interface Cam {
  x: number;
  z: number;
  yaw: number;
  /** The spot on the floor the shot is about (the player you ride behind, the middle of two fighters): the fight's light is centered on it. */
  look?: Vec;
}

/** How far ahead of a camera with no subject of its own the light is centered, in meters. */
export const LOOK_AHEAD = 4;

/** Where a camera's light is centered: its subject, or else a spot ahead of it. */
export const focusOf = (c: Cam): Vec => c.look ?? { x: c.x + Math.sin(c.yaw) * LOOK_AHEAD, z: c.z + Math.cos(c.yaw) * LOOK_AHEAD };

/* ============================================================
 * Lens
 * ============================================================ */

/** Focal length, as a multiple of screen height. Larger = flatter perspective. */
const FOCAL = 1.1;

/** Eye height of the camera, in meters. */
const EYE_HEIGHT = 1.26;

/** Where the horizon sits, as a share of screen height from the top. */
export const HORIZON = 0.507;

/** Anything closer to the camera than this (meters) isn't drawn. */
export const NEAR = 0.5;

/** How tall a standing figure is, in meters. */
export const FIGURE_HEIGHT = 1.8;

const forward = (yaw: number): Vec => ({ x: Math.sin(yaw), z: Math.cos(yaw) });

export const right = (yaw: number): Vec => ({ x: Math.cos(yaw), z: -Math.sin(yaw) });

const add = (a: Vec, b: Vec, k = 1): Vec => ({ x: a.x + b.x * k, z: a.z + b.z * k });

export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, z: a.z - b.z });

const dot = (a: Vec, b: Vec) => a.x * b.x + a.z * b.z;

const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.z - b.z);

/** The yaw that faces along a direction. */
export const yawOf = (d: Vec) => Math.atan2(d.x, d.z);

interface Projected {
  /** Screen x of the point. */
  sx: number;
  /** Screen y of the point (on the floor). */
  sy: number;
  /** Pixels per meter at this distance. */
  ppm: number;
  /** Distance ahead of the camera, in meters. */
  depth: number;
}

/** A floor point in camera terms: `u` to the camera's right, `v` ahead of it (meters). */
export function toCamera(cam: Cam, p: Vec) {
  const rel = sub(p, cam);
  return { u: dot(rel, right(cam.yaw)), v: dot(rel, forward(cam.yaw)) };
}

/** Where a floor point given in camera terms lands on a screen of the given size. */
export function screenOf(u: number, v: number, w: number, h: number): Projected {
  const f = FOCAL * h;
  const depth = Math.max(v, 1e-3);
  return { sx: w / 2 + (f * u) / depth, sy: HORIZON * h + (f * EYE_HEIGHT) / depth, ppm: f / depth, depth: v };
}

/** Where a floor point lands on a screen of the given size. */
export function project(cam: Cam, p: Vec, w: number, h: number): Projected {
  const { u, v } = toCamera(cam, p);
  return screenOf(u, v, w, h);
}

/* ============================================================
 * Formation and camera shots
 * ============================================================ */

/** The planning camera relative to the player: this far behind them, and this far to their right. */
const CAMERA_BEHIND = 3.0;

const CAMERA_SIDE = 1.4;

/** Where the two lines stand relative to the player: sideways and ahead (meters), and spacing within a line. */
const LINES = {
  front: { side: 2.2, ahead: 1.3, spacing: 1.15 },
  back: { side: 4.3, ahead: 3.6, spacing: 1.5 },
} as const;

/**
 * The light around the player in a fight, as distances on the floor from them (meters): fully lit
 * to `clear`, fading to `back` (the arc the back line stands on, so just inside the edge, and dim; the front line stands on a nearer arc),
 * `backDark` dark there, and black from `edge` on: no floor, no horizon, nothing beyond.
 */
export const LIGHT = { clear: 2.8, back: Math.hypot(LINES.back.side, LINES.back.ahead), backDark: 0.8, edge: 7.4 } as const;

/** How dark the light has become (0 lit, 1 black) at this floor distance from the player. */
export function darkAt(d: number): number {
  const soft = (t: number) => t * t * (3 - 2 * t);
  if (d <= LIGHT.clear) return 0;
  if (d >= LIGHT.edge) return 1;
  if (d <= LIGHT.back) return LIGHT.backDark * soft((d - LIGHT.clear) / (LIGHT.back - LIGHT.clear));
  return LIGHT.backDark + (1 - LIGHT.backDark) * soft((d - LIGHT.back) / (LIGHT.edge - LIGHT.back));
}

/** Turns a position relative to the player (side, ahead) into a floor position. */
function fromPlayer(anchor: Vec, yaw: number, side: number, ahead: number): Vec {
  return add(add(anchor, right(yaw), side), forward(yaw), ahead);
}

/** The over-the-shoulder planning shot for a player standing at `anchor`, facing `yaw`. */
export function planningCamera(anchor: Vec, yaw: number): Cam {
  const p = add(add(anchor, forward(yaw), -CAMERA_BEHIND), right(yaw), CAMERA_SIDE);
  return { x: p.x, z: p.z, yaw, look: anchor };
}

/** Slots in the formation for the enemies on each line, in order, relative to the player. */
export function formation(anchor: Vec, yaw: number, front: string[], back: string[]): Map<string, Vec> {
  const spots = new Map<string, Vec>();
  // Each line stands on an arc around the player, all the same distance from them: its middle
  // where the line's slot is, the rest spread along the arc (`spacing` apart, along the arc).
  for (const [line, ids] of [["front", front], ["back", back]] as const) {
    const { side, ahead, spacing } = LINES[line];
    const r = Math.hypot(side, ahead), mid = Math.atan2(side, ahead);
    ids.forEach((id, i) => {
      const a = mid + ((i - (ids.length - 1) / 2) * spacing) / r; // from straight ahead, toward your right
      spots.set(id, fromPlayer(anchor, yaw, r * Math.sin(a), r * Math.cos(a)));
    });
  }
  return spots;
}

/**
 * Which way the player should face so that enemies currently at `positions` end up roughly in
 * their formation: the bearing from the player to their centroid, minus the bearing the
 * formation itself sits at (it's ahead and to the right, not straight ahead).
 */
export function facingToward(anchor: Vec, positions: Vec[], front: number, back: number, fallback: number): number {
  if (!positions.length) return fallback;
  const c = positions.reduce((acc, p) => ({ x: acc.x + p.x / positions.length, z: acc.z + p.z / positions.length }), { x: 0, z: 0 });
  if (dist(c, anchor) < 0.5) return fallback;
  const n = front + back || 1;
  const formSide = (LINES.front.side * front + LINES.back.side * back) / n;
  const formAhead = (LINES.front.ahead * front + LINES.back.ahead * back) / n;
  return yawOf(sub(c, anchor)) - Math.atan2(formSide, formAhead);
}

/** An attack shot: the same direction as now, closer in, centered between the two fighters. */
export function actionCamera(current: Cam, a: Vec, b: Vec): Cam {
  const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  const back = 2.2 + dist(a, b) * 0.6; // pull back further the further apart they are
  const p = add(mid, forward(current.yaw), -back);
  return { x: p.x, z: p.z, yaw: current.yaw, look: mid };
}

/** A spot `gap` meters short of `target`, on the line from `from`. */
export function closeIn(from: Vec, target: Vec, gap: number): Vec {
  const d = dist(from, target);
  if (d <= gap) return from;
  return add(target, sub(from, target), gap / d);
}

/** `p` pushed `amount` meters further along the line from `from`. */
export function pushedAway(from: Vec, p: Vec, amount: number): Vec {
  const d = dist(from, p) || 1;
  return add(p, sub(p, from), amount / d);
}

/** A spot `amount` meters behind `anchor`, opposite to where they face. */
export function behind(anchor: Vec, yaw: number, amount: number): Vec {
  return add(anchor, forward(yaw), -amount);
}

/* ============================================================
 * Tweens
 * ============================================================ */

export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export const lerpVec = (a: Vec, b: Vec, t: number): Vec => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });

/** Shortest turn between two angles. */
export function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}

export const lerpCam = (a: Cam, b: Cam, t: number): Cam => ({
  x: a.x + (b.x - a.x) * t,
  z: a.z + (b.z - a.z) * t,
  yaw: lerpAngle(a.yaw, b.yaw, t),
  look: a.look && b.look ? lerpVec(a.look, b.look, t) : b.look ?? a.look,
});

/* ============================================================
 * Figures on screen, and the shots the scene moves between
 * ============================================================ */

/** The figure's drawing (100 × 120 box) spans this many units from head to feet. */
const FIGURE_UNITS = 102;

const FEET_Y = 114;

/**
 * Where a figure standing at `p` appears on screen: its 100 × 120 drawing box, and its depth.
 * `scale`: how much bigger than a normal figure (the Warden towers over everyone).
 */
export function figureBox(cam: Cam, p: Vec, w: number, h: number, scale = 1) {
  const { sx, sy, ppm, depth } = project(cam, p, w, h);
  const unit = (ppm * FIGURE_HEIGHT * scale) / FIGURE_UNITS;
  return { x: sx - 50 * unit, y: sy - FEET_Y * unit, w: 100 * unit, h: 120 * unit, depth };
}

/**
 * How the camera is placed: a fixed spot, or riding along behind someone's shoulder (the planning
 * shot), facing `yaw`. A riding camera stays locked to its figure while it moves, so the figure
 * holds still on screen and the world turns around it.
 */
export type ShotCamera = Cam | { follow: string; yaw: number } | { between: [string, string]; yaw: number };

/** Where everyone should be and where the camera should look, and how long to take getting there. */
export interface SceneShot {
  positions: Record<string, Vec>;
  camera: ShotCamera;
  ms: number;
  /** Bumped on every new shot, so the scene knows to start moving. */
  version: number;
}

/** The camera a shot ends on. */
export function shotCamera(shot: SceneShot): Cam {
  const c = shot.camera;
  if ("follow" in c) return planningCamera(shot.positions[c.follow], c.yaw);
  if ("between" in c) return trackingCamera(c.yaw, shot.positions[c.between[0]], shot.positions[c.between[1]]);
  return c;
}

/** The camera centered between two fighters wherever they stand (an attack's shot follows them as they move). */
export const trackingCamera = (yaw: number, a: Vec, b: Vec): Cam => actionCamera({ x: 0, z: 0, yaw }, a, b);
