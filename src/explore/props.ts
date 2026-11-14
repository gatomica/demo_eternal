/**
 * props.ts — the map's props: people sealed whole in wax, most of them kneeling, some curled up, slumped, lying or reaching, left where they were caught. They are
 * features of the map, like its bricks and rubble: nothing to fight, nothing to pick up, no state, and they never move. Which of them stands
 * where is written out here (the same every run), each with a pose of its own picked from where it stands.
 *
 * Each pose is painted once into a small picture (per size of the map's tiles), and a prop is a single drawing of that picture. They are drawn
 * with the other things that stand on the floor, in order of their rows, so whoever stands behind one (the player, a creature) goes under it,
 * and whoever stands in front goes over it.
 */
import { BODY_ABOVE_FEET, COLORS, RISE } from "./tuning";

/** The wax they are sealed in, in a few shades (the coat is thicker, or older, on some). */
const WAXES = [
  { wax: "#b9a14e", edge: "#6b5b25", sheen: "rgba(255, 244, 190, 0.34)" },
  { wax: "#c4ad5c", edge: "#76652d", sheen: "rgba(255, 246, 200, 0.36)" },
  { wax: "#ac9540", edge: "#5f5020", sheen: "rgba(255, 240, 180, 0.3)" },
];
type Wax = (typeof WAXES)[number];

/** Where the feet are, in tiles below the point a figure is drawn from. */
const FOOT = 0.36;

/* ------------------------------------------------------------ painting, in tile units (the origin is the point a figure is drawn from) */

/**
 * A figure is a handful of lumps and tubes of wax. They are all outlined together first, then all filled, so there is one border round the
 * whole figure and its limbs melt into its body; only the few parts marked `crease` (a head, now and then an arm) keep a thin line of their own.
 */
type Shape =
  | { k: "lump"; cx: number; cy: number; rx: number; ry: number; rot?: number; crease?: boolean }
  | { k: "tube"; x1: number; y1: number; x2: number; y2: number; w: number; crease?: boolean };
interface PoseDef {
  /** How wide the wax puddle under it is (it spreads from `puddleAt`, default the middle). */
  puddle: number; puddleAt?: number;
  shapes: Shape[];
  /** Wax running down: [x, y, length]. */
  drips: [number, number, number][];
}
const lump = (cx: number, cy: number, rx: number, ry = rx, rot = 0, crease = false): Shape => ({ k: "lump", cx, cy, rx, ry, rot, crease });
const tube = (x1: number, y1: number, x2: number, y2: number, w: number, crease = false): Shape => ({ k: "tube", x1, y1, x2, y2, w, crease });

/** The wax that has run out round whoever is sealed, on the floor. */
function puddle(g: CanvasRenderingContext2D, w: Wax, cx: number, rx: number) {
  g.fillStyle = COLORS.shadow;
  g.beginPath(); g.ellipse(cx, FOOT, rx + 0.03, 0.09, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = w.edge;
  g.beginPath(); g.ellipse(cx, FOOT - 0.015, rx, 0.075, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = w.wax;
  g.beginPath(); g.ellipse(cx, FOOT - 0.03, rx * 0.88, 0.058, 0, 0, Math.PI * 2); g.fill();
}

function paintPose(g: CanvasRenderingContext2D, w: Wax, def: PoseDef) {
  puddle(g, w, def.puddleAt ?? 0, def.puddle);
  g.lineCap = "round"; g.lineJoin = "round";
  const path = (sh: Shape, grow: number) => {
    g.beginPath();
    if (sh.k === "lump") g.ellipse(sh.cx, sh.cy, sh.rx + grow, sh.ry + grow, sh.rot ?? 0, 0, Math.PI * 2);
    else { g.moveTo(sh.x1, sh.y1); g.lineTo(sh.x2, sh.y2); }
  };
  // One border round the whole figure...
  for (const sh of def.shapes) {
    path(sh, 0.018);
    if (sh.k === "lump") { g.fillStyle = w.edge; g.fill(); } else { g.strokeStyle = w.edge; g.lineWidth = sh.w + 0.036; g.stroke(); }
  }
  // ...then the wax over it, every part melting into the next.
  for (const sh of def.shapes) {
    path(sh, 0);
    if (sh.k === "lump") { g.fillStyle = w.wax; g.fill(); } else { g.strokeStyle = w.wax; g.lineWidth = sh.w; g.stroke(); }
  }
  // A thin line where a head or an arm is set off from the rest.
  g.strokeStyle = w.edge; g.globalAlpha = 0.65; g.lineWidth = 0.012;
  for (const sh of def.shapes) {
    if (!sh.crease) continue;
    if (sh.k === "lump") { path(sh, -0.004); g.stroke(); } else { g.beginPath(); g.arc(sh.x1, sh.y1, sh.w * 0.5, 0, Math.PI * 2); g.stroke(); }
  }
  g.globalAlpha = 1;
  // The light on the upper side of each.
  for (const sh of def.shapes) {
    if (sh.k === "lump") {
      g.beginPath(); g.ellipse(sh.cx - sh.rx * 0.2, sh.cy - sh.ry * 0.35, sh.rx * 0.55, sh.ry * 0.34, sh.rot ?? 0, 0, Math.PI * 2);
      g.fillStyle = w.sheen; g.fill();
    } else {
      g.strokeStyle = w.sheen; g.lineWidth = sh.w * 0.3;
      g.beginPath(); g.moveTo(sh.x1, sh.y1 - sh.w * 0.22); g.lineTo(sh.x2, sh.y2 - sh.w * 0.22); g.stroke();
    }
  }
  // Wax running down.
  g.fillStyle = w.wax; g.strokeStyle = w.wax; g.lineWidth = 0.035;
  for (const [x, y, len] of def.drips) {
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + len); g.stroke();
    g.beginPath(); g.arc(x, y + len, 0.026, 0, Math.PI * 2); g.fill();
  }
}

const F = FOOT;

/** The poses. Each is a person sealed whole in wax: every limb, the body and the head coated, drips running off it. Many are kneeling. */
const DEFS: { def: PoseDef; weight: number }[] = [
  // 0. Folded right down on its knees, hunched over itself, hugging itself.
  { weight: 2, def: { puddle: 0.36, shapes: [
    tube(-0.05, F - 0.06, -0.34, F - 0.03, 0.13), lump(0.03, F - 0.13, 0.22, 0.14, -0.15), lump(0.2, F - 0.12, 0.1, 0.09, 0, true), tube(-0.1, F - 0.2, 0.16, F - 0.11, 0.07),
  ], drips: [[-0.08, F - 0.03, 0.04], [0.12, F - 0.03, 0.03]] } },
  // 1. Curled up on its side, knees to its chest.
  { weight: 1, def: { puddle: 0.42, shapes: [
    lump(0, F - 0.1, 0.3, 0.11, -0.04), lump(0.23, F - 0.13, 0.12, 0.09, 0.3), lump(-0.32, F - 0.12, 0.09, 0.085, 0, true), tube(-0.22, F - 0.12, 0.1, F - 0.17, 0.06),
  ], drips: [[-0.12, F - 0.02, 0.03], [0.1, F - 0.03, 0.04]] } },
  // 2. Sitting slumped, head fallen forward, legs out in front, hands in its lap.
  { weight: 1, def: { puddle: 0.46, puddleAt: 0.1, shapes: [
    tube(0, F - 0.07, 0.4, F - 0.045, 0.11), tube(-0.1, F - 0.07, -0.05, F - 0.3, 0.21), lump(0.02, F - 0.4, 0.095, 0.09, 0, true), tube(-0.05, F - 0.25, 0.18, F - 0.12, 0.065),
  ], drips: [[-0.14, F - 0.16, 0.08], [0.1, F - 0.04, 0.03]] } },
  // 3. Kneeling upright, hands together before its face, as if praying.
  { weight: 2, def: { puddle: 0.34, puddleAt: -0.05, shapes: [
    tube(-0.28, F - 0.04, 0.02, F - 0.05, 0.1), tube(0.02, F - 0.06, -0.06, F - 0.27, 0.13), tube(-0.06, F - 0.27, 0, F - 0.52, 0.18), lump(0.04, F - 0.62, 0.095, 0.095, 0, true), tube(0, F - 0.46, 0.12, F - 0.55, 0.055),
  ], drips: [[-0.08, F - 0.4, 0.1], [0.06, F - 0.07, 0.04]] } },
  // 4. On hands and knees, one arm stretched out ahead, dragging itself on.
  { weight: 1, def: { puddle: 0.5, puddleAt: 0.05, shapes: [
    tube(-0.22, F - 0.2, 0.16, F - 0.21, 0.16), tube(0.15, F - 0.2, 0.2, F - 0.04, 0.06), tube(0.16, F - 0.22, 0.44, F - 0.11, 0.06, true), tube(-0.22, F - 0.2, -0.22, F - 0.05, 0.1), tube(-0.22, F - 0.05, -0.44, F - 0.03, 0.08), lump(0.29, F - 0.28, 0.09, 0.085, 0, true),
  ], drips: [[-0.05, F - 0.11, 0.05], [0.18, F - 0.13, 0.04]] } },
  // 5. Lying on its back, arms crossed on its chest.
  { weight: 1, def: { puddle: 0.5, puddleAt: 0.05, shapes: [
    tube(-0.2, F - 0.1, 0.12, F - 0.1, 0.16), tube(0.12, F - 0.09, 0.44, F - 0.075, 0.1), lump(-0.32, F - 0.11, 0.09, 0.085, 0, true), tube(-0.14, F - 0.18, 0.04, F - 0.15, 0.05, true), tube(-0.14, F - 0.15, 0.04, F - 0.18, 0.05),
  ], drips: [[-0.02, F - 0.03, 0.03], [0.26, F - 0.03, 0.035]] } },
  // 6. Standing, stiff, arms at its sides, head up: caught on its feet.
  { weight: 1, def: { puddle: 0.3, shapes: [
    tube(-0.05, F - 0.02, -0.05, F - 0.36, 0.1), tube(0.07, F - 0.02, 0.07, F - 0.36, 0.1), tube(0, F - 0.34, 0, F - 0.66, 0.22), lump(0, F - 0.79, 0.1, 0.105, 0, true), tube(-0.13, F - 0.62, -0.15, F - 0.34, 0.06), tube(0.13, F - 0.62, 0.15, F - 0.34, 0.06),
  ], drips: [[-0.1, F - 0.3, 0.12], [0.04, F - 0.52, 0.1], [0.12, F - 0.1, 0.06]] } },
  // 7. Standing, one arm raised and reaching, the other hanging.
  { weight: 1, def: { puddle: 0.32, puddleAt: 0.02, shapes: [
    tube(-0.05, F - 0.02, -0.06, F - 0.36, 0.1), tube(0.07, F - 0.02, 0.09, F - 0.36, 0.1), tube(0, F - 0.34, 0.02, F - 0.66, 0.21), lump(0.05, F - 0.79, 0.1, 0.105, 0, true), tube(0.1, F - 0.62, 0.3, F - 0.9, 0.065, true), tube(-0.12, F - 0.62, -0.14, F - 0.36, 0.06),
  ], drips: [[-0.09, F - 0.3, 0.1], [0.2, F - 0.75, 0.09], [0.1, F - 0.1, 0.05]] } },
  // 8. Bowed right down to the floor, forehead on the ground, arms stretched out ahead.
  { weight: 2, def: { puddle: 0.46, puddleAt: 0.05, shapes: [
    tube(-0.3, F - 0.05, -0.05, F - 0.06, 0.1), lump(-0.05, F - 0.2, 0.14, 0.13), tube(-0.02, F - 0.2, 0.22, F - 0.1, 0.17), lump(0.32, F - 0.07, 0.09, 0.085, 0, true), tube(0.2, F - 0.12, 0.46, F - 0.05, 0.06), tube(0.2, F - 0.09, 0.42, F - 0.025, 0.06, true),
  ], drips: [[-0.08, F - 0.08, 0.04], [0.1, F - 0.03, 0.03]] } },
  // 9. Sitting back on its heels, head bowed, hands on its thighs.
  { weight: 2, def: { puddle: 0.36, puddleAt: -0.05, shapes: [
    tube(-0.26, F - 0.05, 0, F - 0.05, 0.1), lump(-0.1, F - 0.2, 0.15, 0.14), tube(-0.1, F - 0.2, -0.02, F - 0.45, 0.18), lump(0.03, F - 0.55, 0.09, 0.09, 0, true), tube(-0.05, F - 0.4, 0.1, F - 0.2, 0.06, true),
  ], drips: [[-0.16, F - 0.12, 0.06], [0.0, F - 0.06, 0.04]] } },
  // 10. Kneeling upright, both arms raised, pleading.
  { weight: 2, def: { puddle: 0.34, puddleAt: -0.05, shapes: [
    tube(-0.28, F - 0.04, 0.02, F - 0.05, 0.1), tube(0.02, F - 0.06, -0.04, F - 0.27, 0.13), tube(-0.04, F - 0.27, 0, F - 0.5, 0.18), lump(0.06, F - 0.62, 0.095, 0.095, -0.2, true), tube(0.02, F - 0.46, 0.2, F - 0.72, 0.06), tube(0, F - 0.45, 0.12, F - 0.76, 0.06, true),
  ], drips: [[-0.08, F - 0.38, 0.1], [0.18, F - 0.66, 0.08]] } },
  // 11. On one knee, the other foot planted, head bowed, a hand on its raised knee.
  { weight: 2, def: { puddle: 0.4, puddleAt: -0.02, shapes: [
    tube(-0.3, F - 0.04, -0.02, F - 0.06, 0.1), tube(0.02, F - 0.06, 0.18, F - 0.27, 0.12), tube(0.18, F - 0.27, 0.2, F - 0.04, 0.1), tube(-0.02, F - 0.24, 0.1, F - 0.5, 0.18), lump(0.17, F - 0.58, 0.09, 0.09, 0, true), tube(0.1, F - 0.46, 0.19, F - 0.28, 0.06, true),
  ], drips: [[-0.04, F - 0.14, 0.08], [0.19, F - 0.06, 0.04]] } },
  // 12. Kneeling, its face in its hands.
  { weight: 2, def: { puddle: 0.34, puddleAt: -0.05, shapes: [
    tube(-0.28, F - 0.04, 0.02, F - 0.05, 0.1), tube(0.02, F - 0.06, -0.06, F - 0.27, 0.13), tube(-0.06, F - 0.27, 0, F - 0.5, 0.18), lump(0.05, F - 0.6, 0.095, 0.095, 0, true), tube(0, F - 0.44, 0.1, F - 0.6, 0.06), tube(0.02, F - 0.42, 0.13, F - 0.58, 0.055, true),
  ], drips: [[-0.08, F - 0.36, 0.1], [0.07, F - 0.07, 0.04]] } },
  // 13. Kneeling, leaning forward on both hands, head hanging.
  { weight: 2, def: { puddle: 0.4, puddleAt: 0.02, shapes: [
    tube(-0.3, F - 0.04, 0.02, F - 0.05, 0.1), tube(0.02, F - 0.06, -0.04, F - 0.24, 0.13), tube(-0.04, F - 0.24, 0.16, F - 0.4, 0.18), lump(0.27, F - 0.33, 0.09, 0.09, 0.2, true), tube(0.12, F - 0.36, 0.2, F - 0.04, 0.06), tube(0.16, F - 0.34, 0.3, F - 0.04, 0.06, true),
  ], drips: [[0.02, F - 0.26, 0.08], [0.22, F - 0.22, 0.06]] } },
];

type Pose = (g: CanvasRenderingContext2D, w: Wax) => void;
const POSES: Pose[] = DEFS.map(d => (g, w) => paintPose(g, w, d.def));

/** Which pose a roll from 0 to 1 picks: the kneeling ones come up more often. */
function poseFor(r: number) {
  const total = DEFS.reduce((n, d) => n + d.weight, 0);
  let at = r * total;
  for (let i = 0; i < DEFS.length; i++) { at -= DEFS[i].weight; if (at < 0) return i; }
  return DEFS.length - 1;
}

/** How many poses there are. */
export const PROP_POSES = POSES.length;

/** Paints pose `pose` straight onto a canvas, at (x, y) (the point a figure is drawn from) with tiles `T` across. */
export function paintSealed(g: CanvasRenderingContext2D, x: number, y: number, T: number, pose = 0, shade = 0) {
  g.save();
  g.translate(x, y);
  g.scale(T, T);
  POSES[pose % POSES.length](g, WAXES[shade % WAXES.length]);
  g.restore();
}

/* ------------------------------------------------------------ the pictures, made once per size of the tiles */

const pictures = new Map<string, HTMLCanvasElement>();
function pictureOf(pose: number, shade: number, t: number) {
  const key = `${pose}:${shade}:${t}`;
  let c = pictures.get(key);
  if (!c) {
    // (Room for a figure up to a tile and a half tall and a tile wide, about the point it is drawn from.)
    c = document.createElement("canvas");
    c.width = c.height = Math.ceil(2.4 * t);
    const g = c.getContext("2d")!;
    paintSealed(g, c.width / 2, c.height * 0.6, t, pose, shade);
    pictures.set(key, c);
  }
  return c;
}

/** A prop: where it stands (world tiles, level z), which pose and shade of wax, and whether it is mirrored. */
export interface Prop { x: number; y: number; z: number; pose: number; shade: number; flip: boolean }

/** Draws a prop, as seen from the camera at (ox, oy) with tiles `T` across. */
export function drawProp(g: CanvasRenderingContext2D, p: Prop, ox: number, oy: number, T: number) {
  const px = ox + p.x * T, py = oy + (p.y - p.z * RISE - BODY_ABOVE_FEET) * T;
  const t = Math.max(8, Math.round(T));
  const pic = pictureOf(p.pose, p.shade, t);
  const w = (pic.width * T) / t, h = (pic.height * T) / t;
  g.save();
  if (p.flip) { g.translate(px, 0); g.scale(-1, 1); g.translate(-px, 0); }
  g.drawImage(pic, px - w / 2, py - h * 0.6, w, h);
  g.restore();
}

/* ------------------------------------------------------------ where they are */

/** A well-mixed number from 0 to 1 for plan tile (x, y) of level z, different for each `salt`: the same every run. */
function roll(z: number, x: number, y: number, salt = 0) {
  let h = (Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663) ^ Math.imul(z + 1, 83492791) ^ Math.imul(salt + 1, 2654435761)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * People sealed whole in wax at these plan tiles of level z. Set a tile and a half off (the world grid is the plan plus one, and a tile's
 * middle is a half). Each tile's pose, shade and side are picked from its place.
 */
const sealed = (z: number, tiles: [number, number][]): Prop[] =>
  tiles.map(([x, y]) => ({
    x: x + 1.5, y: y + 1.5, z,
    pose: poseFor(roll(z, x, y, 1)),
    shade: Math.floor(roll(z, x, y, 2) * WAXES.length),
    flip: roll(z, x, y, 3) < 0.5,
  }));

/** Plan tiles of a room (corners x0,y0 to x1,y1) where a body lies, each tile with this chance, except `skip` (the ways through and where enemies stand). */
const scatter = (z: number, [x0, y0, x1, y1]: number[], chance: number, skip: (x: number, y: number) => boolean): [number, number][] => {
  const out: [number, number][] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!skip(x, y) && roll(z, x, y) < chance) out.push([x, y]);
  return out;
};

/** Every prop of the map. */
export const MAP_PROPS: Prop[] = [
  // The labyrinth's east room: one in each corner of it.
  ...sealed(0, [[36, 15], [37, 15], [36, 17], [37, 17]]),
  // The dungeon's east chapel: round its walls, leaving the way in free.
  ...sealed(8, [[42, 16], [44, 16], [46, 16], [43, 17], [45, 18], [43, 19], [42, 20], [44, 20], [46, 20]]),
  // Floor B (level 10): all four rooms are full of them, and the side room north of the east room most of all.
  // North room (the bridge comes in down column 26; the Wax Blob lies in the middle).
  ...sealed(10, scatter(10, [23, 5, 29, 10], 0.3, (x, y) => (x === 26 && y >= 9) || (x >= 25 && x <= 27 && y >= 5 && y <= 7))),
  // South room (the bridge, the three waxed and the lit one among them).
  ...sealed(10, scatter(10, [23, 26, 29, 31], 0.3, (x, y) => (x === 26 && y <= 27) || (x === 24 && y === 28) || (x === 28 && y === 28) || (x === 26 && y === 30) || (x === 26 && y === 28))),
  // West room (the bridge runs out of it along row 18; the stairs start in its south-west corner; the ladder's hole is in its north-west corner,
  // with the ladder folded on its north edge until it is let down; three lit waxed).
  ...sealed(10, scatter(10, [10, 15, 16, 21], 0.3, (x, y) => y === 18 || (x === 11 && y === 21) || (x === 10 && y <= 16) || (x === 13 && y === 17) || (x === 15 && y === 20) || (x === 11 && y === 20))),
  // East room (the bridge comes in along row 18; the passage north is at column 44; the three enemies).
  ...sealed(10, scatter(10, [36, 15, 45, 21], 0.3, (x, y) => y === 18 || (x === 44 && y <= 16) || (x === 40 && (y === 16 || y === 20)))),
  // The side room, waxed over, floor and walls: thick with them.
  ...sealed(10, scatter(10, [42, 6, 47, 12], 0.55, (x, y) => x === 44 && y === 12)),
  ...sealed(10, [[44, 14]]),
];

/** The props on level z, by the row they stand in (the order the map draws things in). */
const byLevel = new Map<number, Prop[]>();
for (const p of MAP_PROPS) {
  const list = byLevel.get(p.z) ?? [];
  list.push(p);
  byLevel.set(p.z, list);
}
const NONE: Prop[] = [];
export const propsOn = (z: number): Prop[] => byLevel.get(z) ?? NONE;
