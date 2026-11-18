/**
 * gear3d.ts — the gear (the weapons, so far) modelled in 3D, for the new rig to use. The flat sprites (`Weapon` in StickFigure.tsx) are still what the
 * 2D figures draw; these are the dynamic versions.
 *
 * A model is drawn like the enemy sprites are: out of a few simple shapes, flat in colour, and not a mesh of facets. A haft or a grip is a thick line
 * with round ends; a pommel, the wax bulb of the torch, an oval guard are ellipses (a sphere seen from any side is one); a wrap of cord, a stamp are
 * hoops and discs; a blade or a brick is a flat plate with a thickness, in two tones (its broad faces, and its edges); cord, cracks, fullers and
 * streaks are thin lines lying on a face.
 *
 * WEAPON SPACE: in figure units (the same as the sprites'), the origin at the grip. `x` runs along the weapon, from the pommel (behind the grip,
 * negative) out to its far end; `y` is across it in the plane of its broad face (a blade's width, pointing up); `z` is its thickness, out of that face.
 */
import type { WeaponItem, WeaponTier } from "../core/types";

export type V3 = readonly [number, number, number];
type P2 = readonly [number, number];

/** One shape of a model. */
export type Prim =
  /**
   * A flat face (a plate's sides, its two broad faces), with the thin lines lying on it, drawn with it. `out` is the way it faces, out of the solid it
   * belongs to (in weapon space): when that points away from the viewer the face is not drawn at all (nor what lies on it), since it can't be seen.
   * `at`: the point it is sorted by, far to near, when the middle of all its points would mislead (a big face whose only overlap with another shape is
   * at one end of it); none: that middle.
   */
  | { k: "poly"; pts: V3[]; color: string; marks?: { pts: V3[]; w: number; color: string }[]; seamless?: boolean; out?: V3; at?: V3 }
  /**
   * A thick line with round ends: a haft, a bar, `r` the radius. `flat`: which of its ends (at `a`, at `b`) are cut flat across instead, where it meets
   * another rod end to end, as the limbs' cut ends are: it stops square and the ellipse of the circle across it is laid over its end, in its own colour;
   * the nearer rod is drawn over the other. `edgeless`: no outline (it melds into what it
   * meets in its own colour, a round end into another's in a single round point). `whole`: drawn as one shape, not in pieces (a short rod that passes
   * nothing along its length: the axe's post).
   */
  | { k: "line"; a: V3; b: V3; r: number; color: string; flat?: [boolean, boolean]; edgeless?: boolean; whole?: boolean }
  /** A cylinder from `a` to `b`, `r` the radius: straight sides and flat ends (a grip). */
  | { k: "cyl"; a: V3; b: V3; r: number; color: string; edgeless?: boolean }
  /** An ellipsoid with these half-sizes along x, y and z: drawn as the ellipse it looks like from where it is seen. */
  | { k: "ball"; c: V3; rx: number; ry: number; rz: number; color: string; edgeless?: boolean }
  /** A flat circle, its normal `n`: a stamp, a wrap round a haft (`ring`: only its outline, that wide). */
  | { k: "disc"; c: V3; n: V3; r: number; color: string; ring?: number; edgeless?: boolean }
  /** A thin line lying on a face: cord, a crack, a fuller, a streak. */
  | { k: "stroke"; pts: V3[]; w: number; color: string }
  /**
   * A face whose edges are true curves: from `start`, along each piece in turn, a straight line (`to`) or an arc of an ellipse (`on`, from one angle
   * to another), back to `start`. Each arc is drawn as smooth curves (not a run of points), found on the ellipse in 3D and put on the page through the
   * view (see `drawGear`): a blade's curved edges. `out`, `at` and `seamless` as a `poly`'s.
   */
  | { k: "curved"; start: V3; segs: Seg[]; color: string; seamless?: boolean; out?: V3; at?: V3 };

/**
 * An ellipse in weapon space: centre `c` and two half-axes `u`, `v` (conjugate: any two, square or not, that sweep it), its points c + u cos θ + v sin θ.
 * Lying in a slanted plane, it is still one (a blade's side that thins to nothing at its point).
 */
export interface Ell { c: V3; u: V3; v: V3 }
/** One piece of a `curved` face's edge: a straight line to a point, or an arc of an ellipse from angle `from` to angle `to` (radians). */
export type Seg = { to: V3 } | { on: Ell; from: number; to: number };
/** A point on an ellipse, at angle `a`. */
export const ellAt = (e: Ell, a: number): V3 => [0, 1, 2].map(i => e.c[i] + e.u[i] * Math.cos(a) + e.v[i] * Math.sin(a)) as unknown as V3;

export interface GearModel {
  id: string;
  name: string;
  /** Which weapon it is in the game: a tier, or one of the starting classes' own. */
  tier: WeaponTier;
  item?: WeaponItem;
  /** How far it reaches from the grip along x (figure units): where its far end is. */
  reach: number;
  /** How long its damaging part is, along x, from its far end back (figure units): the blade, the brick, the bulb. A swing's arch is that thick. */
  damage: number;
  /**
   * Where the hands hold it, along x (figure units): `one`, the hand that holds it alone (the Gear viewer's red dot); `two`, where a second hand goes
   * to hold it in both (its purple dot). A short handle is held alone close to the hilt, the second hand further down the handle; a pole (`subtype`
   * "pole" in core/rules.ts: the Brick Hammer, the Barbarian's Axe) is held alone about the middle of its haft, the second hand near its end, away
   * from the head. (The player's figure holds it at `one`; the enemies' still at the origin.)
   */
  grips: { one: number; two: number };
  /**
   * Its edge side: the way (across it, in y and z) the side it strikes with faces, which leads through a swing: a blade's edge, one of a hammer's
   * striking ends, the torch's side with the mark carved in it. None: it has no side to strike with, and it is held as it always was.
   */
  edge?: V3;
  /** Another form of a weapon (`scythe`: the Barbarian's Axe with its joint straightened, held so while Reap lasts), not the one a hand holds by default. */
  form?: "scythe";
  /** A line about it, for the viewer. */
  note: string;
  prims: Prim[];
}

/* ============================================================
 * Colours (the sprites', from the stylesheet)
 * ============================================================ */

const WOOD = "#8a6b4a";
const WAX = "#b9a14e", WAX_DARK = "#85733a", BRICK = "#85838d", BRICK_EDGE = "#5d5b66";
const BRONZE = "#5e9a78", BRONZE_DARK = "#3d6b53", BRONZE_SHADE = "#4f8366", IRON = "#8f93a3", IRON_DARK = "#6b6f80";
/** Black iron (the axe's head), and the dark wood of its haft. */
const BLACK_IRON = "#2e2d33", BLACK_IRON_DARK = "#1d1c21", DARK_WOOD = "#5b3f2b";

/* ============================================================
 * Building them
 * ============================================================ */

/** A thin line to lay on a plate's broad faces: through these points (in x, y), `w` wide. */
type Mark = { pts: readonly P2[]; w: number; color: string };

/**
 * An outline (in x, y) given a thickness, z from z0 to z1: its two broad faces in `color`, the faces round its edge in `side`. `marks` are lines lying
 * on both broad faces (a fuller, cord, a crack); they are drawn with the face they lie on. `open(i)`: the edge from point i to the next has no face.
 */
function plate(outline: readonly P2[], z0: number, z1: number, color: string, side: string, marks: readonly Mark[] = [], open?: (i: number) => boolean): Prim[] {
  const front = outline.map(([x, y]) => [x, y, z1] as V3), back = outline.map(([x, y]) => [x, y, z0] as V3);
  const on = (z: number) => marks.map(m => ({ pts: m.pts.map(([x, y]) => [x, y, z] as V3), w: m.w, color: m.color }));
  // Which way round the outline goes decides which way each edge faces out (the outline may have notches; this still holds edge by edge).
  let area = 0;
  for (let i = 0; i < outline.length; i++) { const [x0, y0] = outline[i], [x1, y1] = outline[(i + 1) % outline.length]; area += x0 * y1 - x1 * y0; }
  const turn = area >= 0 ? 1 : -1;
  const prims: Prim[] = [{ k: "poly", pts: [...back].reverse(), color, marks: on(z0 - 0.03), out: [0, 0, -1] }];
  for (let i = 0; i < outline.length; i++) {
    // (`open`: an edge that meets another plate, edge to edge in the same plane, has no face of its own there)
    if (open?.(i)) continue;
    const j = (i + 1) % outline.length, dx = outline[j][0] - outline[i][0], dy = outline[j][1] - outline[i][1], l = Math.hypot(dx, dy) || 1;
    prims.push({ k: "poly", pts: [front[i], front[j], back[j], back[i]], color: side, out: [(turn * dy) / l, (-turn * dx) / l, 0] });
  }
  prims.push({ k: "poly", pts: front, color, marks: on(z1 + 0.03), out: [0, 0, 1] });
  return prims;
}

/**
 * One face through these points (a triangle, or a long outline round a whole face, which may bend a little: a bevel from a thick line to a sharp edge),
 * facing out the way of `toward` (its way out is worked out from all the points, by Newell's method, and turned to agree): seamless, so faces of one
 * solid meet without lines between them. `toward` undefined: a face that curves right round (a band along a curved back), always drawn.
 */
function facet(pts: V3[], color: string, toward?: V3): Prim {
  if (!toward) return { k: "poly", pts, color, seamless: true };
  let n: V3 = [0, 0, 0];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    n = [n[0] + (a[1] - b[1]) * (a[2] + b[2]), n[1] + (a[2] - b[2]) * (a[0] + b[0]), n[2] + (a[0] - b[0]) * (a[1] + b[1])];
  }
  if (n[0] * toward[0] + n[1] * toward[1] + n[2] * toward[2] < 0) n = [-n[0], -n[1], -n[2]];
  const l = Math.hypot(...n) || 1;
  return { k: "poly", pts, color, seamless: true, out: [n[0] / l, n[1] / l, n[2] / l] };
}

/** A small repeatable random number generator (so a scatter of streaks or scratches looks the same every time): numbers in [0, 1). */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ============================================================
 * The weapons
 * ============================================================ */

/**
 * The Broken Shortsword (light), in bronze: a ball pommel and a plain cylinder of a grip, an oval guard, and a broad blade, nicked along its edges, that stops
 * where it is broken off: it does not sharpen to a tip, and its end is a flat cut that shows its diamond section, filled with wax.
 *
 * The blade is a solid with flat faces and sharp edges: on each side of it, two flat strips run from its middle line (the ridge, where it is thickest)
 * down to its side edges (where the two sides meet at nothing), the same all the way to the end, which is a flat diamond. Wax has run down it in a few
 * straight streaks, more of them and longer the farther from the guard.
 *
 * How deep the grip and the blade go into the guard is worked out, not set: each goes in only as far as it must for the whole of its end (the grip's end
 * circle, the blade's root with its corners) to lie inside the guard's oval, so none of that face shows outside it and there is no gap from the side.
 */
function chisel(): Prim[] {
  const R = 2.1, r = 1.3; // the pommel sphere, the grip
  const guard = { x: 2.2, rx: 1.5, ry: 3.3, rz: 1.5 }; // the oval guard: along the blade, across it, thick
  const T = 0.75, H = 2.3, END = 14.7; // half the blade's thickness at its ridge, half its width, where it is broken off
  // The grip: from where it meets the pommel sphere (the circle round the sphere at x = centre + sqrt(R^2 - r^2)) forward into the guard, to where its end
  // circle is just inside the oval: the circle's reach across the guard's thin way (or across its width, if that were thinner) decides how far.
  const gripBack = -5.4 + Math.sqrt(R * R - r * r);
  const gripFront = guard.x - guard.rx * Math.sqrt(1 - Math.max((r / guard.ry) ** 2, (r / guard.rz) ** 2));
  // The blade's root: the corners of its diamond section, the side edges (H across, no thickness) and the ridge (T thick, in the middle), must lie inside
  // the oval; the farthest forward it can start is where the wider of those just reaches the guard's surface.
  const root = guard.x + guard.rx * Math.sqrt(1 - Math.max((H / guard.ry) ** 2, (T / guard.rz) ** 2));
  const plane = (y: number) => T * (1 - Math.abs(y) / H); // the strips' height at distance y from the ridge
  // Wax streaks (a fixed scatter, so it looks the same every time): straight lines on a strip, their start more likely the farther from the guard, and
  // longer there too. `sy` is the strip's side of the ridge (+1 or -1), `sgn` the blade's face (+1 up, -1 down).
  const length = END - root;
  const streaks = (seed: number, sy: 1 | -1, sgn: 1 | -1) => {
    const rnd = seeded(seed);
    const out: { pts: V3[]; w: number; color: string }[] = [];
    for (let k = 0; k < 3; k++) {
      const x0 = root + length * Math.sqrt(rnd()), far = (x0 - root) / length; // (the square root: twice as likely at the end as halfway)
      if (far < 0.12) continue;
      const len = (0.8 + 3.4 * far) * (0.65 + 0.35 * rnd()), tilt = (rnd() - 0.5) * 0.7 * (rnd() < 0.5 ? 1 : -1);
      const y0 = 0.3 + rnd() * 1.6, x1 = Math.min(END - 0.08, x0 + len * Math.cos(tilt));
      const y1 = Math.max(0.2, Math.min(H - 0.2, y0 + len * Math.sin(tilt)));
      out.push({ pts: [[x0, sy * y0, sgn * (plane(y0) + 0.03)], [x1, sy * y1, sgn * (plane(y1) + 0.03)]], w: 0.5, color: WAX });
    }
    return out;
  };
  // One face of the blade (z > 0 up, z < 0 down): the strip on the +y side (with the nicks on that edge) and the one on the -y side (with its own).
  const face = (sgn: 1 | -1, seed: number): Prim[] => {
    const z = (v: number) => v * sgn;
    const poly = (pts: readonly (readonly [number, number, number])[], color: string, sy: 1 | -1): Prim => ({
      k: "poly", pts: pts.map(([x, y, h]) => [x, y, z(h)] as V3), color, seamless: true,
      out: [0, (sy * T) / H, sgn], marks: streaks(seed + (sy > 0 ? 0 : 97), sy, sgn),
    });
    return [
      poly([[root, 0, T], [END, 0, T], [END, H, 0], [10.5, H, 0], [10.25, 2, plane(2)], [10, H, 0], [7, H, 0], [6.65, 1.85, plane(1.85)], [6.3, H, 0], [root, H, 0]], BRONZE, 1),
      poly([[root, 0, T], [END, 0, T], [END, -H, 0], [12.5, -H, 0], [12.2, -1.95, plane(1.95)], [11.9, -H, 0], [8.7, -H, 0], [8.4, -2, plane(2)], [8.1, -H, 0], [root, -H, 0]], "#4f8366", -1),
    ];
  };
  return [
    { k: "ball", c: [-5.4, 0, 0], rx: R, ry: R, rz: R, color: BRONZE_DARK },
    { k: "cyl", a: [gripBack, 0, 0], b: [gripFront, 0, 0], r, color: WOOD },
    { k: "ball", c: [guard.x, 0, 0], rx: guard.rx, ry: guard.ry, rz: guard.rz, color: BRONZE_DARK },
    ...face(1, 11), ...face(-1, 23),
    // where it is broken off: the flat diamond cut, the blade's section, filled with wax
    { k: "poly", pts: [[END, 0, T], [END, H, 0], [END, 0, -T], [END, -H, 0]], color: WAX, seamless: true, out: [1, 0, 0] },
  ];
}

/**
 * The Brick Hammer (heavy): a straight cylinder for a haft, and for a head a block of bricks laid in a running bond, three courses of them across the
 * head, two bricks deep, every other course shifted half a brick. As the walls' bricks are on the map, the block is one plain box and its joints are
 * only marked here and there: some of the lines between the bricks, and those not all the way, so it reads as bricks without every one drawn out.
 */
function hammer(): Prim[] {
  const X0 = 29.5, X1 = 41, HY = 7, HZ = 3.6; // the block: along the haft, across the head (half), its thickness (half)
  const r = 1.5;
  // The haft runs straight from behind the grip to the block, ending where it meets its face: the end circle lies on that face, within it,
  // so none of the haft is outside the block and none of it goes further in than it must.
  const haftFront = X0 + 0.05;
  const COURSES = 3, C = (X1 - X0) / COURSES, BRICK_LONG = HY; // (two bricks across the head in a course; the shifted courses half one at each end)
  /** Where the joints between the bricks of a course fall across the head (y). */
  const joints = (c: number) => (c % 2 ? [-BRICK_LONG / 2, BRICK_LONG / 2] : [0]);
  const rnd = seeded(5);
  /** Part of a joint from `a` to `b`, or nothing: most are marked, each only part of the way, now from one end, now from the middle. */
  const part = (a: V3, b: V3): V3[] | undefined => {
    if (rnd() > 0.65) return undefined;
    const t0 = rnd() < 0.4 ? 0 : rnd() * 0.35, t1 = rnd() < 0.4 ? 1 : Math.min(1, t0 + 0.35 + rnd() * 0.4);
    const at = (t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    return [at(t0), at(t1)];
  };
  const W = 0.45, GRAY = BRICK_EDGE, DEEP = "#47454f"; // (the side faces are already that gray, so their joints are a little deeper)
  const lines = (segs: [V3, V3][], color: string) => segs.map(([a, b]) => part(a, b)).filter((q): q is V3[] => !!q).map(pts => ({ pts, w: W, color }));
  const courseAt = (k: number) => X0 + k * C;
  // A broad face (z = zf): the lines between the courses, across the head, and the joints within each course, along the haft.
  const broad = (zf: number) => lines([
    ...[1, 2].map(k => [[courseAt(k), -HY, zf], [courseAt(k), HY, zf]] as [V3, V3]),
    ...Array.from({ length: COURSES }, (_, c) => joints(c).map(y => [[courseAt(c), y, zf], [courseAt(c + 1), y, zf]] as [V3, V3])).flat(),
  ], GRAY);
  // An end of the head (y = yf): the lines between the courses, through its thickness, and the joint between the two bricks deep, in the courses not
  // shifted.
  const end = (yf: number) => lines([
    ...[1, 2].map(k => [[courseAt(k), yf, -HZ], [courseAt(k), yf, HZ]] as [V3, V3]),
    ...[0, 2].map(c => [[courseAt(c), yf, 0], [courseAt(c + 1), yf, 0]] as [V3, V3]),
  ], DEEP);
  // The top or the bottom of the head (x = xf, its course `c`): the joints across it, and the one between the two bricks deep, along it.
  const cap = (xf: number, c: number) => lines([
    ...joints(c).map(y => [[xf, y, -HZ], [xf, y, HZ]] as [V3, V3]),
    [[xf, -HY, 0], [xf, HY, 0]] as [V3, V3],
  ], DEEP);
  const prims = plate([[X0, HY], [X1, HY], [X1, -HY], [X0, -HY]], -HZ, HZ, BRICK, BRICK_EDGE);
  for (const p of prims) {
    if (p.k !== "poly" || !p.out) continue;
    const [ox, oy, oz] = p.out, o = 0.03;
    if (Math.abs(oz) > 0.5) p.marks = broad(Math.sign(oz) * (HZ + o));
    else if (Math.abs(oy) > 0.5) p.marks = end(Math.sign(oy) * (HY + o));
    else if (Math.abs(ox) > 0.5) p.marks = ox > 0 ? cap(X1 + o, COURSES - 1) : cap(X0 - o, 0);
  }
  return [
    { k: "cyl", a: [-6, 0, 0], b: [haftFront, 0, 0], r, color: WOOD },
    ...prims,
  ];
}

/**
 * The Waxed Torch (normal): a wooden torch whose head is sealed in a bulb of wax with the sealing king's mark carved into it; the wax has run down the
 * handle in two runnels, each ending in a drop.
 *
 * The handle is one plain cylinder, and it goes into the bulb only as far as it must for its end circle to lie inside the bulb (as the chisel's grip
 * goes into its guard): none of its end shows, and there is no gap from the side. Each runnel is a thin cylinder lying along the handle, half sunk in
 * it, its top end going into the bulb the same way. None of it has an outline (`edgeless`): the parts meet without a line between them.
 */
function torch(): Prim[] {
  return torchParts().map(p => (p.k === "cyl" || p.k === "ball" || p.k === "disc" ? { ...p, edgeless: true } : p));
}
/** The torch's shapes (`torch` draws them without outlines: wood and wax, all soft). */
function torchParts(): Prim[] {
  const bulb = { x: 30.4, rx: 6.2, ry: 5.4, rz: 5.4 }; // the wax over the head (round across, so its thin way is either)
  const r = 1.35; // the handle
  /** Where a circle `rr` across, its centre `d` off the handle's line, just lies inside the bulb: as far back along x as it can start. */
  const into = (d: number, rr: number) => bulb.x - bulb.rx * Math.sqrt(1 - ((d + rr) / bulb.ry) ** 2);
  const RUN = 0.6, OFF = r + RUN * 0.2; // a runnel's radius, and how far its line is off the handle's (most of it outside the handle)
  const runnel = (angle: number, end: number, drop: number): Prim[] => {
    const y = OFF * Math.cos(angle), z = OFF * Math.sin(angle);
    return [
      { k: "cyl", a: [end, y, z], b: [into(OFF, RUN), y, z], r: RUN, color: WAX },
      { k: "ball", c: [end, y, z], rx: drop, ry: drop, rz: drop, color: WAX },
    ];
  };
  // The mark is on the torch's striking side, its edge side (+y, the `edge` it leads its swings with), cut into the bulb's surface there: its lines curve
  // with it, drawn in x (along the torch) and z (across that side), `by` off the surface (under it: dug in).
  const onBulb = ([x, z]: P2, by: number): V3 => [x, bulb.ry * Math.sqrt(Math.max(0, 1 - ((x - bulb.x) / bulb.rx) ** 2 - (z / bulb.rz) ** 2)) + by, z];
  const lid: P2[] = Array.from({ length: 7 }, (_, i) => { const t = Math.PI * (0.1 + (0.8 * i) / 6); return [29.7 + 0.6 * Math.sin(t), 1.5 * Math.cos(t)] as P2; });
  // (the lid bows toward the tip, and each lash starts on it: where the lid is at that height)
  const lidAt = (z: number) => 29.7 + 0.6 * Math.sqrt(1 - (z / 1.5) ** 2);
  const lashes: P2[][] = [[[lidAt(0.9), 0.9], [32, 0.9]], [[lidAt(0), 0], [32.4, 0]], [[lidAt(-0.9), -0.9], [32, -0.9]]];
  // (drawn at a small size, then doubled about its middle)
  const SIZE = 2, MID = 30.8;
  // Each line is a groove: the dark cut, a little under the surface.
  const GROOVE = 0.35, DIG = -0.12;
  const eye = [lid, ...lashes].map(line => {
    // (each lash cut into steps, so it bends round the bulb with the surface)
    const pts: P2[] = (line.length > 2 ? line : Array.from({ length: 5 }, (_, i) => [line[0][0] + ((line[1][0] - line[0][0]) * i) / 4, line[0][1] + ((line[1][1] - line[0][1]) * i) / 4] as P2))
      .map(([x, z]) => [MID + (x - MID) * SIZE, z * SIZE] as P2);
    return pts.map(p => onBulb(p, DIG));
  });
  return [
    // (its bottom end rounded off)
    { k: "ball", c: [-5, 0, 0], rx: r, ry: r, rz: r, color: WOOD },
    { k: "cyl", a: [-5, 0, 0], b: [into(0, r), 0, 0], r, color: WOOD },
    // the bulb of wax over the head, and the runnels that ran down the handle
    { k: "ball", c: [bulb.x, 0, 0], rx: bulb.rx, ry: bulb.ry, rz: bulb.rz, color: WAX },
    ...runnel(0.35, 19.4, 0.85),
    ...runnel(Math.PI + 0.3, 16.2, 0.9),
    // the sealing king's mark, carved into the bulb's striking side in a darker wax: a closed eye, its three lashes hanging from the lid toward the tip
    ...eye.map(pts => ({ k: "stroke", pts, w: GROOVE, color: WAX_DARK }) as Prim),
  ];
}

/**
 * The Bronze Shortsword (the Soldier's): the Broken Shortsword made whole, its base: the same ball pommel, plain cylinder of a grip and oval guard, and the
 * same blade of flat strips from a middle ridge down to sharp side edges, but clean (no nicks, no wax) and long, running on past where the chisel's breaks
 * off and narrowing at its end, ridge and edges together, to a point.
 *
 * The grip and the blade go into the pommel and the guard only as far as they must (as the chisel's): none of their ends shows.
 */
function shortsword(): Prim[] {
  const R = 2.1, r = 1.3; // the pommel sphere, the grip
  const guard = { x: 2.2, rx: 1.5, ry: 3.3, rz: 1.5 };
  const T = 0.75, H = 2.3, TAPER = 26.5, TIP = 34; // half the thickness at the ridge, half the width, where it starts narrowing, its point
  const gripBack = -5.4 + Math.sqrt(R * R - r * r);
  const gripFront = guard.x - guard.rx * Math.sqrt(1 - Math.max((r / guard.ry) ** 2, (r / guard.rz) ** 2));
  const root = guard.x + guard.rx * Math.sqrt(1 - Math.max((H / guard.ry) ** 2, (T / guard.rz) ** 2));
  /** A flat face of the blade through these points, facing out on the `sgn` side (+1 up, -1 down): its way out worked out from the points. */
  // On each face, the strip either side of the ridge: straight from the guard to where it narrows, then a triangle from there to the point.
  const face = (sgn: 1 | -1): Prim[] => [1, -1].flatMap(sy => {
    const z = T * sgn, color = sy > 0 ? BRONZE : BRONZE_SHADE;
    return [
      facet([[root, 0, z], [TAPER, 0, z], [TAPER, sy * H, 0], [root, sy * H, 0]], color, [0, 0, sgn]),
      facet([[TAPER, 0, z], [TIP, 0, 0], [TAPER, sy * H, 0]], color, [0, 0, sgn]),
    ];
  });
  return [
    { k: "ball", c: [-5.4, 0, 0], rx: R, ry: R, rz: R, color: BRONZE_DARK },
    { k: "cyl", a: [gripBack, 0, 0], b: [gripFront, 0, 0], r, color: WOOD },
    { k: "ball", c: [guard.x, 0, 0], rx: guard.rx, ry: guard.ry, rz: guard.rz, color: BRONZE_DARK },
    ...face(1), ...face(-1),
  ];
}

/**
 * A blade's side that thins from `T` (half its thickness, at angle `thick`) to nothing (at angle `thin`), along an ellipse in the weapon's flat plane
 * (centre `cx`, `cy`, half-sizes `rx`, `ry`): the ellipse raised out of that plane by a slant, so it is still one ellipse, `sgn` the side (+z or -z).
 * Its thickness at each point is a straight share of how far along it is in x, from the thin end to the thick one.
 */
function slanted(cx: number, cy: number, rx: number, ry: number, thin: number, thick: number, T: number, sgn: number): Ell {
  // z = a + b x along it, none at the thin end's x, T at the thick end's; x = cx + rx cos θ.
  const x0 = cx + rx * Math.cos(thin), x1 = cx + rx * Math.cos(thick), b = (sgn * T) / (x1 - x0), a = -b * x0;
  return { c: [cx, cy, a + b * cx], u: [rx, 0, b * rx], v: [0, ry, 0] };
}

/** An ellipse lying in the weapon's flat plane (z = 0): a sharp edge. */
const flat = (cx: number, cy: number, rx: number, ry: number): Ell => ({ c: [cx, cy, 0], u: [rx, 0, 0], v: [0, ry, 0] });

/**
 * The Barbarian's Axe: a long haft of dark wood, one plain rod, and a head on its end, cut off square a haft's radius past the haft's end (`HAFT_END`), flush with its black post. The head is drawn
 * from true curves (`curved`), every one an arc of the same ellipse's shape, only as tall as it needs (the same centre, straight up from the haft's end,
 * and the same length along the haft; `AXE_ARCS`), so they all meet at one point toward the grip and the cut takes each at its top: from the top down,
 * a gray edge, sharp along its outer curve, thick where it meets the black; a black band, four times as wide; and a second gray edge, the first turned in, sharp
 * along its inner curve. All three thin to nothing at the point, and each ends at the cut in a flat face. The haft goes on past its end in black iron,
 * a post as wide, straight up to the black band at the cut; the inner edge stops short of it.
 */
/** Where the axe's haft ends, along x: its head is cut off square there (see `axe`). */
const HAFT_END = 43;
/**
 * The axe head's curves: the centre of their ellipse (x, a haft's radius past its end, so the cut is flush with the post's far side and the post lies
 * wholly under the head; y, above the haft), its half-length along the haft, and the height of each:
 * the outer edge's sharp curve, where it meets the black, where the black meets the inner edge, and the inner edge's sharp curve. At the cut, each edge is
 * a quarter as wide as the black (1.05 and 4.2), the whole head as tall as it was. `T`: half its thickness at the cut, the haft's own (as thick as the haft is wide).
 */
const AXE_ARCS = { cx: HAFT_END + 1.5, cy: 6.5, rx: 20, outer: 9.65, lip: 8.6, low: 4.4, inner: 3.35, T: 1.5 };

/**
 * The axe's head, post and all, turned a quarter turn about the corner where the haft meets the post (`scythe`): the joint straightened, the post
 * carried straight on along the haft and the blade standing square to it, its point out across it (+y), as a scythe's.
 */
function straightened(prims: Prim[], pivot: V3): Prim[] {
  // (a quarter turn about z through the pivot, taking the post's way, +y, onto the haft's, +x)
  const pt = (q: V3): V3 => [pivot[0] + (q[1] - pivot[1]), pivot[1] - (q[0] - pivot[0]), q[2]];
  const dir = (d: V3): V3 => [d[1], -d[0], d[2]];
  const ell = (e: Ell): Ell => ({ c: pt(e.c), u: dir(e.u), v: dir(e.v) });
  return prims.map((p): Prim => {
    switch (p.k) {
      case "poly": return { ...p, pts: p.pts.map(pt), out: p.out && dir(p.out), at: p.at && pt(p.at), marks: p.marks?.map(m => ({ ...m, pts: m.pts.map(pt) })) };
      case "curved": return { ...p, start: pt(p.start), segs: p.segs.map(g => ("on" in g ? { ...g, on: ell(g.on) } : { to: pt(g.to) })), out: p.out && dir(p.out), at: p.at && pt(p.at) };
      case "line": case "cyl": return { ...p, a: pt(p.a), b: pt(p.b) };
      case "ball": return { ...p, c: pt(p.c), rx: p.ry, ry: p.rx };
      case "disc": return { ...p, c: pt(p.c), n: dir(p.n) };
      case "stroke": return { ...p, pts: p.pts.map(pt) };
    }
  });
}

/** The Barbarian's Axe (`scythe`: in its scythe form, the joint straightened: see `straightened`). */
function axe(scythe = false): Prim[] {
  const { cx, cy, rx, outer, lip, low, inner, T } = AXE_ARCS;
  // (from the point, angle π, to the cut at the top, angle π/2)
  const P = Math.PI, H = Math.PI / 2;
  const point: V3 = [cx - rx, cy, 0];
  const sharp = (ry: number) => flat(cx, cy, rx, ry), side = (ry: number, sgn: number) => slanted(cx, cy, rx, ry, P, H, T, sgn);
  /**
   * A band between two of the curves, on one side: out along the first from the point (to the cut, or to angle `end`), across, and back along the second.
   */
  const band = (a: Ell, b: Ell, color: string, sgn: number, end = H): Prim => ({
    k: "curved", start: point, segs: [{ on: a, from: P, to: end }, { to: ellAt(b, end) }, { on: b, from: end, to: P }], color, seamless: true, out: [0, 0, sgn],
  });
  const R = 1.5; // the haft's radius
  // The post: the haft carried on in black iron, a cylinder as wide, from the haft's end straight up (square to it) to the black band's lower curve, where
  // it meets the cut. The inner edge stops where it would run into it: at the post's near side, toward the grip (`stop`, its angle there).
  const stop = Math.acos((HAFT_END - R - cx) / rx);
  // The haft in quarters: black iron at each end, the dark wood between (the middle half), the wood and the iron each cut flat where they meet (the
  // nearer drawn over). The iron has no outline, so it melds with the black head: the top quarter and the post meet in one round point, both ends round.
  const BUTT = -6, q1 = BUTT + (HAFT_END - BUTT) / 4, q3 = BUTT + (3 * (HAFT_END - BUTT)) / 4, corner: V3 = [HAFT_END, 0, 0], postTop: V3 = [HAFT_END, cy + low, 0];
  const haft: Prim[] = [
    { k: "line", a: [BUTT, 0, 0], b: [q1, 0, 0], r: R, color: BLACK_IRON, flat: [false, true], edgeless: true },
    { k: "line", a: [q1, 0, 0], b: [q3, 0, 0], r: R, color: DARK_WOOD, flat: [true, true] },
    { k: "line", a: [q3, 0, 0], b: corner, r: R, color: BLACK_IRON, flat: [true, false], edgeless: true },
  ];
  // (the head, post and all: what turns about the corner in the scythe form)
  const prims: Prim[] = [
    // The post: the haft carried on round the corner, from its end straight up (square to it) to the black band's lower curve, where it meets the cut.
    { k: "line", a: corner, b: postTop, r: R, color: BLACK_IRON, flat: [false, true], edgeless: true, whole: true },
  ];
  for (const sgn of [1, -1]) {
    prims.push(
      band(sharp(outer), side(lip, sgn), IRON, sgn), // the outer edge
      band(side(lip, sgn), side(low, sgn), BLACK_IRON, sgn), // the black
      band(sharp(inner), side(low, sgn), IRON, sgn, stop), // the inner edge, up to the post
    );
  }
  // The cut, flat, facing the way the haft points: across the outer edge a triangle (its thickness to its sharp curve); across the black a band, that face
  // alone carried on down the post's far side to the haft's line (as wide as the black is thick there); and where the inner edge stops at the post, a
  // triangle the same way.
  const at = (e: Ell, a = H) => ellAt(e, a);
  const cutX = cx, lipTop = at(side(lip, 1))[1];
  prims.push(
    facet([at(sharp(outer)), at(side(lip, 1)), at(side(lip, -1))], IRON_DARK, [1, 0, 0]),
    facet([[cutX, lipTop, T], [cutX, 0, T], [cutX, 0, -T], [cutX, lipTop, -T]], BLACK_IRON_DARK, [1, 0, 0]),
    facet([at(sharp(inner), stop), at(side(low, 1), stop), at(side(low, -1), stop)], IRON_DARK, [1, 0, 0]),
  );
  return [...haft, ...(scythe ? straightened(prims, corner) : prims)];
}

/**
 * The Nomadic Sickle: a short handle with a round end, a small round iron collar no wider than the handle, and an iron blade curved like a crescent moon:
 * two arcs of ellipses (`curved`), its outer, back curve and its inner edge, rising from the collar and meeting at a single point on the handle's line;
 * thickest at the collar, it thins steadily to that point; in section a wedge, its inner edge sharp. The handle goes into the round end and the collar
 * only as far as it must (as the chisel's grip does its pommel and guard): none of its ends shows.
 */
function sickle(): Prim[] {
  const R = 1.7, r = 1.3; // the round end, the handle
  const collar = { x: 6, rx: 1.2, ry: r, rz: r }; // (round, no wider than the handle)
  const gripBack = -4.8 + Math.sqrt(R * R - r * r);
  const gripFront = collar.x - collar.rx * Math.sqrt(1 - Math.max((r / collar.ry) ** 2, (r / collar.rz) ** 2));
  // The blade's two curves: half-ellipses on the handle's line, from the collar (angle π) to the point they share (angle 0): the back, outside, the edge,
  // inside it. Its thickness, `T` at the collar, thins along the back to nothing at the point (`slanted`).
  const TIP = 19.76, T = 0.6, back = { x: 4.7, ry: 9.3 }, edge = { x: 7.3, ry: 7.9 };
  const arc = (x: number, ry: number) => ({ cx: (x + TIP) / 2, rx: (TIP - x) / 2, ry });
  const B = arc(back.x, back.ry), E = arc(edge.x, edge.ry), P = Math.PI;
  const backSide = (sgn: number) => slanted(B.cx, 0, B.rx, B.ry, 0, P, T, sgn), sharpEdge = flat(E.cx, 0, E.rx, E.ry);
  const blade: Prim[] = [
    // The back, one narrow band round the outside of the curve, from one face's side to the other's, drawn under the faces.
    { k: "curved", start: [back.x, 0, T], segs: [{ on: backSide(1), from: P, to: 0 }, { on: backSide(-1), from: 0, to: P }], color: IRON_DARK, seamless: true },
    // Each face: along the back at its thickness, back along the edge at none.
    ...[1, -1].map((sgn): Prim => ({
      k: "curved", start: [back.x, 0, sgn * T], segs: [{ on: backSide(sgn), from: P, to: 0 }, { on: sharpEdge, from: 0, to: P }], color: IRON, seamless: true, out: [0, 0, sgn],
    })),
  ];
  // (where it leaves the collar: the root's end, a flat triangle, inside the collar)
  blade.push(facet([[back.x, 0, T], [back.x, 0, -T], [edge.x, 0, 0]], IRON_DARK, [0, -1, 0]));
  return [
    { k: "ball", c: [-4.8, 0, 0], rx: R, ry: R, rz: R, color: WOOD },
    { k: "cyl", a: [gripBack, 0, 0], b: [gripFront, 0, 0], r, color: WOOD },
    ...blade,
    { k: "ball", c: [collar.x, 0, 0], rx: collar.rx, ry: collar.ry, rz: collar.rz, color: IRON },
  ];
}

/**
 * Every weapon, with the two most worked on first. Their edge sides (`edge`): the chisel's +y edge (of its two), the hammer's +y end of the brick,
 * the shortsword's +y edge, the axe's bit (its head stands out along +y), the sickle's inner, hollow edge (toward -y, the handle's line), the torch's side with the carved mark (+y).
 */
export const GEAR_WEAPONS: GearModel[] = [
  { id: "chisel", name: "Broken Shortsword", tier: "light", reach: 15, damage: 11.4, edge: [0, 1, 0], grips: { one: 0, two: -3.2 }, note: "Light. Bronze, rusted green: a ridged grip, an oval guard, a broad blade ground square, nicked and chipped, waxed from the carving.", prims: chisel() },
  { id: "hammer", name: "Brick Hammer", tier: "heavy", reach: 41, damage: 11.5, edge: [0, 1, 0], grips: { one: 20.5, two: -4.5 }, note: "Heavy. A straight haft and a head of bricks, laid in a running bond.", prims: hammer() },
  { id: "torch", name: "Waxed Torch", tier: "normal", reach: 35, damage: 12.4, edge: [0, 1, 0], grips: { one: 3, two: -2 }, note: "Normal. A torch sealed in a bulb of wax, the sealing king's mark carved into it, the wax run down its handle.", prims: torch() },
  { id: "shortsword", name: "Bronze Shortsword", tier: "normal", item: "shortsword", reach: 34, damage: 29.6, edge: [0, 1, 0], grips: { one: 0, two: -3.2 }, note: "The Soldier's. The chisel made whole: a ball pommel, a plain grip, an oval guard and a long ridged blade coming to a point.", prims: shortsword() },
  { id: "axe", name: "Barbarian's Axe", tier: "heavy", item: "axe", reach: 44.5, damage: 13, edge: [0, 1, 0], grips: { one: 23, two: -4.5 }, note: "The Barbarian's. A long dark haft, a broad two-lobed head of black iron set on its side, its edge ground gray.", prims: axe() },
  // (the axe in its scythe form, Reap's: the joint straightened, the blade square to the haft past its end, its point leading a swing)
  { id: "scythe", name: "Barbarian's Axe (scythe)", tier: "heavy", item: "axe", form: "scythe", reach: 59, damage: 8, edge: [0, 1, 0], grips: { one: 23, two: -4.5 }, note: "The Barbarian's Axe, its joint straightened by Reap: the head carried straight on past the haft, the blade standing square to it.", prims: axe(true) },
  { id: "sickle", name: "Nomadic Sickle", tier: "light", item: "sickle", reach: 20, damage: 12, edge: [0, -1, 0], grips: { one: 1.8, two: -2.2 }, note: "The Nomad's. A short handle, an iron collar and a crescent blade, thickest at the collar and thinning to its point.", prims: sickle() },
];

export type GearId = (typeof GEAR_WEAPONS)[number]["id"];

/** The 3D model of a weapon in the game: a tier, or one of the classes' own. */
export const modelOfWeapon = (tier: WeaponTier, item?: WeaponItem): GearModel | undefined =>
  GEAR_WEAPONS.find(m => !m.form && (item ? m.item === item : !m.item && m.tier === tier));

/** The Barbarian's Axe in its scythe form (Reap). */
export const SCYTHE: GearModel = GEAR_WEAPONS.find(m => m.form === "scythe")!;

/** The box a model fits in (low and high corners), to centre and fit it. */
export function boundsOf(prims: readonly Prim[]): { lo: V3; hi: V3 } {
  const pts: V3[] = [];
  for (const p of prims) {
    if (p.k === "poly" || p.k === "stroke") pts.push(...p.pts);
    else if (p.k === "line" || p.k === "cyl") pts.push([p.a[0] - p.r, p.a[1] - p.r, p.a[2] - p.r], [p.b[0] + p.r, p.b[1] + p.r, p.b[2] + p.r]);
    else if (p.k === "ball") pts.push([p.c[0] - p.rx, p.c[1] - p.ry, p.c[2] - p.rz], [p.c[0] + p.rx, p.c[1] + p.ry, p.c[2] + p.rz]);
    else if (p.k === "curved") {
      pts.push(p.start);
      // (an arc: the points along it, every few degrees, are enough to box it)
      for (const g of p.segs) if ("on" in g) { for (let j = 0; j <= 12; j++) pts.push(ellAt(g.on, g.from + ((g.to - g.from) * j) / 12)); } else pts.push(g.to);
    }
    else pts.push([p.c[0] - p.r, p.c[1] - p.r, p.c[2] - p.r], [p.c[0] + p.r, p.c[1] + p.r, p.c[2] + p.r]);
  }
  const lo = [0, 1, 2].map(i => Math.min(...pts.map(q => q[i]))), hi = [0, 1, 2].map(i => Math.max(...pts.map(q => q[i])));
  return { lo: lo as unknown as V3, hi: hi as unknown as V3 };
}

/* ============================================================
 * Drawing
 * ============================================================ */

/** A shape as it is drawn on the page, with how far it is (larger: farther). */
export type Drawn =
  | { k: "poly"; points: string; fill: string; stroke: string; depth: number }
  /** A face with curved edges (a `curved` prim): an SVG path of lines and smooth curves (cubic Béziers). */
  | { k: "path"; d: string; fill: string; stroke: string; depth: number }
  | { k: "cyl"; body: string; sides: [string, string]; far: End; near: End; fill: string; stroke: string; depth: number }
  /**
   * A piece of a rod. `ends`: which of its two ends are the rod's own (round); the others meet the next piece, square, its fill reaching `overlap`
   * past them (on the page) so the pieces join without a seam.
   */
  | {
    k: "line"; x1: number; y1: number; x2: number; y2: number; width: number; fill: string; stroke: string; depth: number; ends: [boolean, boolean]; overlap: number;
    /** Its ends cut flat across (a rod's `flat`): the ellipse each looks like, laid over that end as a squashed round end is. */
    cut?: [Cap | undefined, Cap | undefined];
  }
  | { k: "ellipse"; cx: number; cy: number; rx: number; ry: number; angle: number; fill: string; stroke: string; ring?: number; depth: number }
  | { k: "stroke"; points: string; width: number; color: string; depth: number };

/** A rod's flat-cut end as drawn: the ellipse the circle across it looks like (centre, half-sizes, tilt in degrees). */
export interface Cap { cx: number; cy: number; rx: number; ry: number; angle: number }

/** One end of a cylinder as drawn: the ellipse a flat circle looks like. `facing`: it turns toward the viewer (we see the end itself, lighter). */
export interface End { cx: number; cy: number; rx: number; ry: number; angle: number; fill: string; facing: boolean }

/** How a model is seen: `view` puts a point of the model in view space (x right, y down, z away from the viewer), `project` puts a view-space point on the
 *  page, and `scale` is how big a unit is there. */
export interface GearView {
  view: (p: V3) => V3;
  project: (v: V3) => P2;
  scale: (v: V3) => number;
}

/** How long the pieces a rod is drawn in are, at most (figure units): short enough that each is sorted by about where it is. */
const LINE_PIECE = 3;

const hex = (c: string) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const toned = new Map<string, string>();
/** A colour at a share of its brightness, as a CSS colour (kept: a gear piece asks for the same few every frame). */
const tone = (c: string, k: number) => {
  const key = `${c}|${k}`;
  let out = toned.get(key);
  if (out === undefined) toned.set(key, out = `rgb(${hex(c).map(v => Math.max(0, Math.min(255, Math.round(v * k)))).join(",")})`);
  return out;
};
const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit3 = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/**
 * The ellipse that a set of axes (vectors, in view space) look like: they sweep out an ellipsoid, or a disc, whose outline on the page is an ellipse;
 * its half-sizes and tilt are found from how the axes land on the page. Returns the half-sizes (before the page's scale) and the tilt in degrees.
 */
function silhouette(axes: readonly V3[]): { rx: number; ry: number; angle: number } {
  const sxx = axes.reduce((n, v) => n + v[0] * v[0], 0), syy = axes.reduce((n, v) => n + v[1] * v[1], 0), sxy = axes.reduce((n, v) => n + v[0] * v[1], 0);
  const mean = (sxx + syy) / 2, spread = Math.sqrt(((sxx - syy) / 2) ** 2 + sxy * sxy);
  return { rx: Math.sqrt(mean + spread), ry: Math.sqrt(Math.max(0, mean - spread)), angle: (Math.atan2(2 * sxy, sxx - syy) * 90) / Math.PI };
}

/** Two directions square to `n` and to each other. */
function planeOf(n: V3): [V3, V3] {
  const unit = unit3(n), helper: V3 = Math.abs(unit[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = unit3(cross3(unit, helper));
  return [u, cross3(unit, u)];
}

/**
 * A model's shapes as they are drawn, far to near. Plates are flat in two tones (a face turned to the viewer in `color`, one turned away from it
 * darker), lines and ellipses are flat in their colour with a darker outline. Nothing is lit facet by facet.
 */
export function drawGear(prims: readonly Prim[], cam: GearView): Drawn[] {
  const out: Drawn[] = [];
  const dirOf = (c: V3, d: V3) => sub3(cam.view([c[0] + d[0], c[1] + d[1], c[2] + d[2]]), cam.view(c));
  for (const p of prims) {
    switch (p.k) {
      case "poly": {
        // A face turned away from the viewer can't be seen: it isn't drawn (and neither is what lies on it).
        if (p.out && dirOf(p.pts[0], p.out)[2] > 1e-6) break;
        const vs = p.pts.map(cam.view);
        let n: V3 = [0, 0, 0]; // (Newell's method: it works for any flat polygon, concave ones too)
        for (let i = 0; i < vs.length; i++) {
          const a = vs[i], b = vs[(i + 1) % vs.length];
          n = [n[0] + (a[1] - b[1]) * (a[2] + b[2]), n[1] + (a[2] - b[2]) * (a[0] + b[0]), n[2] + (a[0] - b[0]) * (a[1] + b[1])];
        }
        const k = Math.abs(unit3(n)[2]) > 0.55 ? 1 : 0.8, depth = p.at ? cam.view(p.at)[2] : vs.reduce((s, v) => s + v[2], 0) / vs.length;
        // (A seamless face has no outline of its own, only a hairline in its colour so it meets its neighbours without a gap.)
        out.push({ k: "poly", points: vs.map(v => cam.project(v).join(",")).join(" "), fill: tone(p.color, k), stroke: tone(p.color, p.seamless ? k : k * 0.55), depth });
        // the lines lying on this face go with it, just over it
        for (const m of p.marks ?? []) {
          out.push({ k: "stroke", points: m.pts.map(q => cam.project(cam.view(q)).join(",")).join(" "), width: m.w * cam.scale(vs[0]), color: tone(m.color, k), depth: depth - 0.0005 });
        }
        break;
      }
      case "curved": {
        if (p.out && dirOf(p.start, p.out)[2] > 1e-6) break;
        const page = (q: V3) => cam.project(cam.view(q)), f = (n: number) => +n.toFixed(2);
        const [sx, sy] = page(p.start);
        let d = `M${f(sx)} ${f(sy)}`;
        // (points along its edge, in view space: to light it by which way it faces, and to sort it by its middle)
        const seen: V3[] = [cam.view(p.start)];
        for (const g of p.segs) {
          if (!("on" in g)) {
            const [x, y] = page(g.to);
            d += ` L${f(x)} ${f(y)}`;
            seen.push(cam.view(g.to));
            continue;
          }
          // An arc: smooth curves (cubic Béziers), each a short stretch of it (an eighth of a turn at most), their control points found on the ellipse in 3D
          // (where a Bézier follows an ellipse all but exactly) and each put on the page through the view as any point is. So every point of the curve
          // goes with the camera exactly as the rest of the model does: no ellipse guessed on the page, no arc flags to flip, nothing to jitter.
          const e = g.on, span = g.to - g.from, n = Math.max(1, Math.ceil(Math.abs(span) / (Math.PI / 4))), step = span / n, k = (4 / 3) * Math.tan(step / 4);
          const tangent = (a: number): V3 => [0, 1, 2].map(i => -e.u[i] * Math.sin(a) + e.v[i] * Math.cos(a)) as unknown as V3;
          for (let j = 0; j < n; j++) {
            const a = g.from + step * j, b = a + step, pa = ellAt(e, a), pb = ellAt(e, b), ta = tangent(a), tb = tangent(b);
            const c1 = page([pa[0] + ta[0] * k, pa[1] + ta[1] * k, pa[2] + ta[2] * k]), c2 = page([pb[0] - tb[0] * k, pb[1] - tb[1] * k, pb[2] - tb[2] * k]), [ex, ey] = page(pb);
            d += ` C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(ex)} ${f(ey)}`;
            seen.push(cam.view(pb));
          }
        }
        let n: V3 = [0, 0, 0];
        for (let i = 0; i < seen.length; i++) {
          const a = seen[i], b = seen[(i + 1) % seen.length];
          n = [n[0] + (a[1] - b[1]) * (a[2] + b[2]), n[1] + (a[2] - b[2]) * (a[0] + b[0]), n[2] + (a[0] - b[0]) * (a[1] + b[1])];
        }
        const k = Math.abs(unit3(n)[2]) > 0.55 ? 1 : 0.8, depth = p.at ? cam.view(p.at)[2] : seen.reduce((t, v) => t + v[2], 0) / seen.length;
        out.push({ k: "path", d: `${d} Z`, fill: tone(p.color, k), stroke: tone(p.color, p.seamless ? k : k * 0.55), depth });
        break;
      }
      case "line": {
        // A long rod (the axe's haft) passes things at very different depths along its length: sorted as one shape, by its middle, it would be drawn
        // wholly behind or wholly in front of a head near its end. So it is drawn in short pieces, each sorted by its own depth, at its centre line.
        const pieces = p.whole ? 1 : Math.max(1, Math.ceil(Math.hypot(...sub3(p.b, p.a)) / LINE_PIECE));
        const along = (t: number): V3 => [p.a[0] + (p.b[0] - p.a[0]) * t, p.a[1] + (p.b[1] - p.a[1]) * t, p.a[2] + (p.b[2] - p.a[2]) * t];
        // A flat end, cut across the rod (where it meets another rod end to end): as the limbs' cut ends are (`bones` in figure3d.tsx), the rod stops square
        // there and the circle across it is laid over its end, the ellipse it looks like, in the rod's own colour and outline, a squashed round end. It goes
        // with the piece it ends, so of two rods meeting there the nearer one (its piece's middle nearer the viewer) is drawn over the other, and the line
        // between them is the near half of that circle.
        const [flatA, flatB] = p.flat ?? [false, false], fill = tone(p.color, 1), stroke = tone(p.color, p.edgeless ? 1 : 0.55);
        const [u, w] = planeOf(sub3(p.b, p.a));
        const cap = (end: V3): Cap => {
          const v = cam.view(end), [cx, cy] = cam.project(v), k = cam.scale(v);
          const sil = silhouette([dirOf(end, [u[0] * p.r, u[1] * p.r, u[2] * p.r]), dirOf(end, [w[0] * p.r, w[1] * p.r, w[2] * p.r])]);
          return { cx, cy, rx: sil.rx * k, ry: sil.ry * k, angle: sil.angle };
        };
        for (let i = 0; i < pieces; i++) {
          const a = cam.view(along(i / pieces)), b = cam.view(along((i + 1) / pieces)), m: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
          const [x1, y1] = cam.project(a), [x2, y2] = cam.project(b), s = cam.scale(m);
          // (a rod's own end is round, unless it is cut flat; a flat one does not reach past itself, as the joins between its pieces do; its ellipse is drawn
          // with its piece, never apart from it)
          const cut: [Cap | undefined, Cap | undefined] = [i === 0 && flatA ? cap(p.a) : undefined, i === pieces - 1 && flatB ? cap(p.b) : undefined];
          out.push({
            k: "line", x1, y1, x2, y2, width: 2 * p.r * s, fill, stroke, depth: m[2],
            ends: [i === 0 && !flatA, i === pieces - 1 && !flatB], overlap: 0.1 * s, cut,
          });
        }
        break;
      }
      case "cyl": {
        const va = cam.view(p.a), vb = cam.view(p.b), m: V3 = [(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2];
        const [ax, ay] = cam.project(va), [bx, by] = cam.project(vb), len = Math.hypot(bx - ax, by - ay);
        // Its sides are straight: parallel to its axis on the page, a radius out either way.
        const half = p.r * cam.scale(m), nx = len > 1e-6 ? (-(by - ay) / len) * half : half, ny = len > 1e-6 ? ((bx - ax) / len) * half : 0;
        const side1 = `${ax + nx},${ay + ny} ${bx + nx},${by + ny}`, side2 = `${ax - nx},${ay - ny} ${bx - nx},${by - ny}`;
        const body = `${ax + nx},${ay + ny} ${bx + nx},${by + ny} ${bx - nx},${by - ny} ${ax - nx},${ay - ny}`;
        // Its two flat ends: each a circle across the axis, an ellipse on the page. The curve of each is what makes it round and not a bar. The end that
        // turns toward the viewer is the one we see the face of (lighter); the other shows only the curve of its edge that sticks out past the body.
        const axis = unit3(sub3(vb, va)), [u, w] = planeOf(sub3(p.b, p.a));
        const endOf = (c: V3, v: V3, facing: boolean): End => {
          const sil = silhouette([dirOf(c, [u[0] * p.r, u[1] * p.r, u[2] * p.r]), dirOf(c, [w[0] * p.r, w[1] * p.r, w[2] * p.r])]), k = cam.scale(v), [cx, cy] = cam.project(v);
          // (an edgeless one is all one tone, so it melts into what it meets: only the end we see is lighter)
          return { cx, cy, rx: sil.rx * k, ry: sil.ry * k, angle: sil.angle, fill: tone(p.color, facing ? 1.12 : p.edgeless ? 1 : 0.92), facing };
        };
        const bFacing = axis[2] < 0; // (b's end faces the viewer if the axis points toward it)
        out.push({
          k: "cyl", body, sides: [side1, side2], fill: tone(p.color, p.edgeless ? 1 : 0.92), stroke: tone(p.color, p.edgeless ? 1 : 0.55), depth: m[2],
          far: endOf(bFacing ? p.a : p.b, bFacing ? va : vb, false),
          near: endOf(bFacing ? p.b : p.a, bFacing ? vb : va, true),
        });
        break;
      }
      case "ball": {
        const v = cam.view(p.c), [cx, cy] = cam.project(v), s = silhouette([dirOf(p.c, [p.rx, 0, 0]), dirOf(p.c, [0, p.ry, 0]), dirOf(p.c, [0, 0, p.rz])]), k = cam.scale(v);
        out.push({ k: "ellipse", cx, cy, rx: s.rx * k, ry: s.ry * k, angle: s.angle, fill: tone(p.color, 1), stroke: tone(p.color, p.edgeless ? 1 : 0.55), depth: v[2] });
        break;
      }
      case "disc": {
        const v = cam.view(p.c), [cx, cy] = cam.project(v), [u, w] = planeOf(p.n), s = silhouette([dirOf(p.c, [u[0] * p.r, u[1] * p.r, u[2] * p.r]), dirOf(p.c, [w[0] * p.r, w[1] * p.r, w[2] * p.r])]), k = cam.scale(v);
        // (A wrap round a rod is drawn over the rod's stretches, whose middles may be nearer or farther than it.)
        out.push({ k: "ellipse", cx, cy, rx: s.rx * k, ry: s.ry * k, angle: s.angle, fill: p.ring ? "none" : tone(p.color, 1), stroke: p.ring || p.edgeless ? tone(p.color, 1) : tone(p.color, 0.55), ring: p.ring ? p.ring * k : undefined, depth: v[2] - (p.ring ? p.r + 4 : 0) });
        break;
      }
      case "stroke": {
        const vs = p.pts.map(cam.view), m = vs[Math.floor(vs.length / 2)];
        out.push({ k: "stroke", points: vs.map(v => cam.project(v).join(",")).join(" "), width: p.w * cam.scale(m), color: tone(p.color, 1), depth: m[2] - 0.6 });
        break;
      }
    }
  }
  return out.sort((a, b) => b.depth - a.depth);
}
