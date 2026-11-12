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
  /**
   * A camera of its own, for a viewer that orbits one figure (the Wearing viewer): how high its eye is (meters; else the fight's `EYE_HEIGHT`) and
   * how far it tilts down (radians; up if negative; else level). Only the 3D figures' lens (`projectPoint`) follows them; a fight's camera has neither.
   */
  eye?: number;
  pitch?: number;
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
export const EYE_HEIGHT = 1.26;

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

/**
 * Where a point `height` meters above the floor lands on a screen of the given size (the same lens as `project`,
 * which is this at height 0). `depth` is how far ahead of the camera it is, `ppm` the pixels a meter is there.
 */
export function projectPoint(cam: Cam, p: Vec, height: number, w: number, h: number): Projected {
  const { u, v } = toCamera(cam, p);
  return onScreen(eyeSpace(cam, u, height, v), w, h);
}

/** A point in the eye's own terms: `u` to its right, `up` above where it looks, `ahead` along where it looks (meters). */
export interface EyePoint { u: number; up: number; ahead: number }

/**
 * A point given in camera terms (`u` to its right, `v` ahead on the floor, `height` off the floor) in the eye's own: from the camera's eye height,
 * tilted by its pitch. (Level, at the fight's eye height: `up` is the height over the eye, and `ahead` is `v`.)
 */
export function eyeSpace(cam: Cam, u: number, height: number, v: number): EyePoint {
  const y = height - (cam.eye ?? EYE_HEIGHT), p = cam.pitch ?? 0;
  if (!p) return { u, up: y, ahead: v };
  const c = Math.cos(p), s = Math.sin(p);
  return { u, up: v * s + y * c, ahead: v * c - y * s };
}

/** Where a point in the eye's terms lands on a screen of the given size (the scene's lens), how far ahead it is, and how big a meter is there. */
export function onScreen(e: EyePoint, w: number, h: number): Projected {
  const f = FOCAL * h;
  const d = Math.max(e.ahead, 0.05);
  return { sx: w / 2 + (f * e.u) / d, sy: HORIZON * h - (f * e.up) / d, ppm: f / d, depth: e.ahead };
}

/** The unit vector a yaw faces along, on the floor. */
export const facingVec = (yaw: number): Vec => forward(yaw);

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
  // (A little closer than it was, 4.3 and 3.6, now that everything is shaded a little: the sight radius below stays where it was, so the back line
  // is no longer on the edge of the dark.)
  back: { side: 3.8, ahead: 3.1, spacing: 1.5 },
} as const;

/**
 * How a scene between two fighters is turned: the enemy on the right of the screen, what it is aimed at on the left, the enemy a
 * little farther from the camera (the angle the front line stands at from you), so a sprite always looks the same, whatever the
 * way the fight happens to face.
 */
export const SCENE_TILT = Math.atan2(LINES.front.ahead, LINES.front.side);

/**
 * The light around the player in a fight, as distances on the floor from them (meters): fully lit
 * to `clear`, fading to `back` (the arc the back line stands on, so just inside the edge, and dim; the front line stands on a nearer arc),
 * `backDark` dark there, and black from `edge` on: no floor, no horizon, nothing beyond.
 */
export const LIGHT = { clear: 2.8, back: Math.hypot(4.3, 3.6), backDark: 0.8, edge: 7.4 } as const;

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

/**
 * The ids on a line with a body's parts kept together, in order (left, middle, right), at the place of the body's first part: so nobody
 * else gets in between them.
 */
function together(ids: string[], bodies: Record<string, BodyPart>): string[] {
  const order = { left: 0, mid: 1, right: 2 } as const;
  const out: string[] = [];
  for (const id of ids) {
    const body = bodies[id]?.body;
    if (!body) { out.push(id); continue; }
    if (out.some(o => bodies[o]?.body === body)) continue;
    out.push(...ids.filter(o => bodies[o]?.body === body).sort((a, b) => order[bodies[a].part ?? "mid"] - order[bodies[b].part ?? "mid"]));
  }
  return out;
}

/**
 * Slots in the formation for the enemies on each line, in order, relative to the player. The parts of a body (the Wax Blob) each take a slot of their
 * own, side by side as three separate enemies would, left, middle, right.
 */
export function formation(anchor: Vec, yaw: number, front: string[], back: string[], bodies: Record<string, BodyPart> = {}): Map<string, Vec> {
  const spots = new Map<string, Vec>();
  // Each line stands on an arc around the player, all the same distance from them: its middle
  // where the line's slot is, the rest spread along the arc (`spacing` apart, along the arc).
  for (const [line, ids] of [["front", together(front, bodies)], ["back", together(back, bodies)]] as const) {
    const { side, ahead, spacing } = LINES[line];
    const r = Math.hypot(side, ahead), mid = Math.atan2(side, ahead);
    ids.forEach((id, i) => {
      const a = mid + ((i - (ids.length - 1) / 2) * spacing) / r; // from straight ahead, toward your right
      spots.set(id, fromPlayer(anchor, yaw, r * Math.sin(a), r * Math.cos(a)));
    });
  }
  return spots;
}

/** What a body's part is, for placing it: which body, and which part. */
export interface BodyPart { body: string; part?: "left" | "mid" | "right" }

/** How far the pool's middle lies behind a middle part with no rig to take its knees from (meters), along the line from it to you. */
export const BODY_FORWARD = 0.6;

/** About how far the left and right parts stand from the pool's middle when the three are in their places in a line (meters): the wax joining them to it is at rest then. */
export const BODY_SIDE_SLOT = 1.7;

/** The pool of wax a body crawls out of: a disc on the floor of this radius (meters), centred on the slot. It lies behind the middle part; the parts stand on the line, joined to it by wax. */
export const BODY_RADIUS = 1.5;

/** The bodies in a fight: each part's body and place in it, by enemy id. */
export function bodiesOfEnemies(enemies: { id: string; body?: string; part?: "left" | "mid" | "right" }[]): Record<string, BodyPart> {
  return Object.fromEntries(enemies.filter(e => e.body).map(e => [e.id, { body: e.body!, part: e.part }]));
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
/** Fast at first, slowing to a halt: something sliding to a stop (losing its speed steadily, as friction takes it). */
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 2);

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

export const FEET_Y = 114;

/** One unit of a figure's drawing, in meters (a standing figure is `FIGURE_HEIGHT` tall over `FIGURE_UNITS` units). */
export const METERS_PER_UNIT = FIGURE_HEIGHT / FIGURE_UNITS;

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

/** One stage of a figure's move (`SceneShot.own`): this share of the way, over `ms`, slowing from its start to `endSpeed` (a share of its own average speed). */
export interface MoveStage { share: number; ms: number; endSpeed: number }

/** Where everyone should be and where the camera should look, and how long to take getting there. */
export interface SceneShot {
  positions: Record<string, Vec>;
  camera: ShotCamera;
  ms: number;
  /** Who jumps to its new spot at once instead of walking there (while the screen is dark, say). */
  snap?: string[];
  /** `out`: the move starts at speed and slows to a halt (a slide), instead of easing in and out. */
  easing?: "out";
  /**
   * Figures that move to their spots on their own timing in this shot (a dodge's dash, longer than the attacker's approach it starts in). Easing `out`,
   * `endSpeed` is the speed it still has as it gets there, a share of its average speed (0: it comes to a halt; a dash running on into a slide keeps some).
   * `since`: when (performance.now()) the move began, if not as the shot reaches the scene: it starts from where it was then and is as far along as that
   * time says, however late the scene draws it, so a move handed on from another (a dash into its slide) never stops between them.
   * `stages`: the move in stages, one after the other along the same line (a dash, then its slide), each easing `out` on its own.
   */
  own?: Record<string, { ms: number; easing?: "out"; endSpeed?: number; since?: number; stages?: MoveStage[] }>;
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

/**
 * The camera centered between two fighters wherever they stand (an attack's shot follows them as they move).
 * With `fit` (the screen's shape and how big each fighter is), it also backs off as far as it takes for both to
 * be seen whole: head to feet within the part of the screen the black strips leave, and clear of the sides.
 * A fighter that is several parts (the Wax Blob) is given as the list of its parts' places: it is centered by their middle and all of them are fitted.
 */
export function trackingCamera(yaw: number, a: Vec | Vec[], b: Vec | Vec[], fit?: { aspect: number; scales: [number, number] }): Cam {
  const groups = [a, b].map(g => (Array.isArray(g) ? g : [g]));
  const centre = (ps: Vec[]): Vec => ({ x: ps.reduce((n, p) => n + p.x, 0) / ps.length, z: ps.reduce((n, p) => n + p.z, 0) / ps.length });
  const base = actionCamera({ x: 0, z: 0, yaw }, centre(groups[0]), centre(groups[1]));
  if (!fit) return base;
  const mid = base.look!;
  const fwd = forward(yaw), rgt = right(yaw);
  // Each fighter's offset from the middle: ahead of it (+: nearer the far side of the shot) and to its right.
  let back = Math.hypot(base.x - mid.x, base.z - mid.z);
  groups.forEach((ps, i) => ps.forEach(p => {
    const ahead = dot(sub(p, mid), fwd), across = dot(sub(p, mid), rgt), s = fit.scales[i];
    // Its feet must land above the bottom strip, its head below the top strip (the strips cover about 11% each).
    const feet = (FOCAL * EYE_HEIGHT) / (FIT_BOTTOM - HORIZON);
    const head = (FOCAL * (FIGURE_HEIGHT * s - EYE_HEIGHT)) / (HORIZON - FIT_TOP);
    // And its sides inside the screen's width, with the figure's own half width.
    const sides = (FOCAL * (Math.abs(across) + 0.6 * s)) / (FIT_SIDE * fit.aspect);
    back = Math.max(back, Math.max(feet, head, sides) - ahead);
  }));
  back = Math.min(back, FIT_MAX_BACK);
  const p = add(mid, fwd, -back);
  return { x: p.x, z: p.z, yaw, look: mid };
}

/** The part of the screen a fight's figures are kept inside, as shares of its height (the black strips take the rest) and half its width. */
const FIT_TOP = 0.13, FIT_BOTTOM = 0.87, FIT_SIDE = 0.42;
/** The farthest the camera backs off to fit them. */
const FIT_MAX_BACK = 14;

/** The radius of the shade disc under a standing figure, in meters (at a figure scale of 1). */
export const SHADE_RADIUS = 0.42;

/**
 * A disc lying on the floor (a circle of `radius` meters round `centre`) as the camera sees it: the ellipse its four ends make on a
 * screen of w × h. Every disc on the ground, the shade under a figure and the Wax Blob's pool, is drawn from this, so they all sit
 * on the floor the same way.
 */
export function floorDisc(cam: Cam, centre: Vec, radius: number, w: number, h: number) {
  const ahead = forward(cam.yaw), side = right(cam.yaw);
  const at = (k: number, v: Vec) => projectPoint(cam, { x: centre.x + v.x * radius * k, z: centre.z + v.z * radius * k }, 0, w, h);
  const near = at(-1, ahead), far = at(1, ahead), l = at(-1, side), r = at(1, side);
  return { cx: (l.sx + r.sx) / 2, cy: (near.sy + far.sy) / 2, rx: Math.abs(r.sx - l.sx) / 2, ry: Math.abs(near.sy - far.sy) / 2, depth: projectPoint(cam, centre, 0, w, h).depth };
}

/**
 * A camera that orbits a spot (the Model viewer's Model stance, the Wearing viewer): it stands `dist` meters from `centre` on the floor's -z side, looking at
 * a point `height` meters up it, raised over it and tilted down by `pitchDeg` (under it if negative). It is a camera of its own (`Cam.eye`, `Cam.pitch`), which only the
 * 3D figures' lens follows. The figures turn instead of the camera (their yaw), so every view is the same camera.
 */
export function orbitCamera(centre: Vec, pitchDeg: number, height: number, dist: number): Cam {
  const p = (pitchDeg * Math.PI) / 180;
  return { x: centre.x, z: centre.z - dist * Math.cos(p), yaw: 0, look: centre, eye: height + dist * Math.sin(p), pitch: p };
}

/** A figure's drawing box seen through an orbiting camera: as `figureBox`, but from the camera's own lens (its tilt too), so the figure's thicknesses are right. */
export function orbitBox(cam: Cam, p: Vec, w: number, h: number, scale = 1) {
  const feet = projectPoint(cam, p, 0, w, h), unit = feet.ppm * METERS_PER_UNIT * scale;
  return { x: feet.sx - 50 * unit, y: feet.sy - FEET_Y * unit, w: 100 * unit, h: 120 * unit, depth: feet.depth };
}
