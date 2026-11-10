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
  /** A thick line with round ends: a haft, a bar, `r` the radius. */
  | { k: "line"; a: V3; b: V3; r: number; color: string }
  /** A cylinder from `a` to `b`, `r` the radius: straight sides and flat ends (a grip). */
  | { k: "cyl"; a: V3; b: V3; r: number; color: string; edgeless?: boolean }
  /** An ellipsoid with these half-sizes along x, y and z: drawn as the ellipse it looks like from where it is seen. */
  | { k: "ball"; c: V3; rx: number; ry: number; rz: number; color: string; edgeless?: boolean }
  /** A flat circle, its normal `n`: a stamp, a wrap round a haft (`ring`: only its outline, that wide). */
  | { k: "disc"; c: V3; n: V3; r: number; color: string; ring?: number; edgeless?: boolean }
  /** A thin line lying on a face: cord, a crack, a fuller, a streak. */
  | { k: "stroke"; pts: V3[]; w: number; color: string };

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
   * Its edge side: the way (across it, in y and z) the side it strikes with faces, which leads through a swing: a blade's edge, one of a hammer's
   * striking ends, the torch's side with the mark carved in it. None: it has no side to strike with, and it is held as it always was.
   */
  edge?: V3;
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
 * The Jagged Chisel (light), in bronze: a ball pommel and a plain cylinder of a grip, an oval guard, and a broad blade, nicked along its edges, that stops
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
 * The Bronze Shortsword (the Soldier's): the Jagged Chisel made whole, its base: the same ball pommel, plain cylinder of a grip and oval guard, and the
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
 * The Nomadic Sickle's crescent, in the sickle's own space (the handle along x, the collar at x = 6): the blade's two curves and its thickness. The
 * Barbarian's Axe wears the same crescent as its edge, so both are made here.
 *
 * Its middle line is an arch from the collar (going straight up from it) over to near the far end of the moon's curve. The sickle's is `W` across at
 * the collar, narrowing all the way to nothing at its point; with `thickEnds` (the axe's) it keeps its full width and thickness all the way, and ends
 * in a flat cut at both ends. `back` is its outer, rounded curve, `edge` its inner, hollow one, both from the collar (index 0) to the far end (index
 * `N`). `thick(i)` is half its thickness along `back` there.
 */
function crescent(thickEnds = false): { back: P2[]; edge: P2[]; thick: (i: number) => number; T: number; N: number } {
  const W = 2.6, N = 32, A0 = Math.PI, A1 = 0.06, T = 0.6;
  const mid = (t: number): P2 => [12.9 + 6.9 * Math.cos(t), 8.6 * Math.sin(t)];
  const out = (t: number): P2 => { const n: P2 = [Math.cos(t) / 6.9, Math.sin(t) / 8.6], l = Math.hypot(...n); return [n[0] / l, n[1] / l]; };
  const ts = Array.from({ length: N + 1 }, (_, i) => A0 + ((A1 - A0) * i) / N);
  const taper = (i: number) => (thickEnds ? 1 : 1 - i / N);
  const side = (k: 1 | -1) => ts.map((t, i) => {
    const w = (W / 2) * taper(i) ** 0.85, m = mid(t), n = out(t);
    return [m[0] + k * n[0] * w, m[1] + k * n[1] * w] as P2;
  });
  return { back: side(1), edge: side(-1), thick: (i: number) => T * Math.sqrt(taper(i)), T, N };
}

/**
 * The Barbarian's Axe: a long haft of dark wood, one plain rod, and a head of black iron set on it near the end, the haft showing past it. Its edge is
 * the Nomadic Sickle's crescent (`crescent`), ground gray, but thick at both ends, each a flat cut; set on the head's edge side (+y), its root toward
 * the grip. As an axe's, it is sharp along its outer, rounded curve, where it cuts, and thick along its hollow one, where the black head meets it: its
 * two faces slope from there down to that sharp curve, meeting along all of it. The black head narrows from the crescent's two ends down to a neck
 * on the haft; the neck's foot sits in the haft and has no face of its own.
 *
 * Kept to a few faces, as the sickle is: each broad face is one face however many points its curve runs through.
 */
function axe(): Prim[] {
  const { back, edge, thick, N } = crescent(true);
  // (the crescent moved, not turned or resized: its baseline, the sickle's handle line, `Y0` above the haft, its middle over the head's)
  const DX = 22.1, Y0 = 6.5, T = 0.8; // (T: half the head's thickness at the neck)
  const at = ([x, y]: P2, z: number): V3 => [x + DX, y + Y0, z];
  const lip = edge.map((q, i) => ({ q, t: thick(i) })); // the hollow curve, where the black head meets the crescent, at the crescent's thickness
  const ROOT = lip[0], END = lip[N];
  // The black head: its neck against the haft (the sprite's, turned as the old head was), at full thickness, out to the crescent's two ends.
  const neck: P2[] = [[31.6, 4.7], [33, 1.2], [37, 1.2], [38.4, 4.7]];
  const W = (q: P2, z: number): V3 => [q[0], q[1], z];
  // Each broad face: round the neck from the root's end to the far end, and back along the crescent's hollow curve. It is sorted by where the neck
  // stands on the haft, the top of the haft under its middle: seen from the head's side (from above, the head up) the neck is in front of the haft behind
  // it, and from the other side the haft is in front of the neck, and that point's depth against the haft's centre line says which. (By the middle of
  // all its points, mostly up along the crescent, it would be drawn over the haft seen from a little below too, or under it from a little above.)
  const head: Prim[] = [1, -1].map(sgn => ({ ...facet([
    at(ROOT.q, sgn * ROOT.t), ...neck.map(q => W(q, sgn * T)), at(END.q, sgn * END.t), ...lip.slice(1, -1).reverse().map(l => at(l.q, sgn * l.t)),
  ], BLACK_IRON, [0, 0, sgn]), at: [35, 1.5, 0] as V3 }));
  // Its sides, round the neck from the root's end to the far end: each a band through the thickness. The neck's foot (from its second corner to its
  // third), down in the haft, has none.
  const rim: [V3, V3][] = [
    [at(ROOT.q, ROOT.t), at(ROOT.q, -ROOT.t)], ...neck.map(q => [W(q, T), W(q, -T)] as [V3, V3]), [at(END.q, END.t), at(END.q, -END.t)],
  ];
  const middle: P2 = [35, 5];
  for (let i = 0; i + 1 < rim.length; i++) {
    if (i === 2) continue; // (the foot)
    const [a, a2] = rim[i], [b, b2] = rim[i + 1];
    head.push(facet([a, b, b2, a2], BLACK_IRON_DARK, [(a[0] + b[0]) / 2 - middle[0], (a[1] + b[1]) / 2 - middle[1], 0]));
  }
  // The crescent: each face along its hollow curve at its thickness, and back along its rounded curve at none, sharp; and at each end a flat triangle.
  const blade: Prim[] = [1, -1].map(sgn => facet([...lip.map(l => at(l.q, sgn * l.t)), ...[...back].reverse().map(q => at(q, 0))], IRON, [0, 0, sgn]));
  for (const [l, b] of [[ROOT, back[0]], [END, back[N]]] as const) blade.push(facet([at(l.q, l.t), at(l.q, -l.t), at(b, 0)], IRON_DARK, [0, -1, 0]));
  return [
    { k: "line", a: [-6, 0, 0], b: [43, 0, 0], r: 1.5, color: DARK_WOOD },
    ...head,
    ...blade,
  ];
}

/**
 * The Nomadic Sickle: a short handle with a round end, a small round iron collar no wider than the handle, and an iron blade curved like a crescent moon
 * (`crescent`): thickest where it leaves the collar, it arches up and forward and thins steadily to a single point on the handle's line; in section a
 * wedge, its inner edge sharp. The handle goes into the round end and the collar only as far as it must (as the chisel's grip does its pommel and
 * guard): none of its ends shows.
 */
function sickle(): Prim[] {
  const R = 1.7, r = 1.3; // the round end, the handle
  const collar = { x: 6, rx: 1.2, ry: r, rz: r }; // (round, no wider than the handle)
  const gripBack = -4.8 + Math.sqrt(R * R - r * r);
  const gripFront = collar.x - collar.rx * Math.sqrt(1 - Math.max((r / collar.ry) ** 2, (r / collar.rz) ** 2));
  const { back, edge, thick, T } = crescent(); // the outer, back of the blade; the inner, its edge
  const at = (q: P2, z: number): V3 => [q[0], q[1], z];
  // Each face one smooth shape (along the back at its thickness, back along the edge at none), and the back one narrow band round the outside of the
  // curve, drawn under the faces.
  const blade: Prim[] = [
    facet([...back.map((q, i) => at(q, thick(i))), ...back.map((q, i) => at(q, -thick(i))).reverse()], IRON_DARK),
    ...[1, -1].map(sgn => facet([...back.map((q, i) => at(q, sgn * thick(i))), ...[...edge].reverse().map(q => at(q, 0))], IRON, [0, 0, sgn])),
  ];
  // (where it leaves the collar: the root's end, a flat triangle, inside the collar)
  blade.push(facet([at(back[0], T), at(back[0], -T), at(edge[0], 0)], IRON_DARK, [0, -1, 0]));
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
  { id: "chisel", name: "Jagged Chisel", tier: "light", reach: 15, damage: 11.4, edge: [0, 1, 0], note: "Light. Bronze, rusted green: a ridged grip, an oval guard, a broad blade ground square, nicked and chipped, waxed from the carving.", prims: chisel() },
  { id: "hammer", name: "Brick Hammer", tier: "heavy", reach: 41, damage: 11.5, edge: [0, 1, 0], note: "Heavy. A straight haft and a head of bricks, laid in a running bond.", prims: hammer() },
  { id: "torch", name: "Waxed Torch", tier: "normal", reach: 35, damage: 12.4, edge: [0, 1, 0], note: "Normal. A torch sealed in a bulb of wax, the sealing king's mark carved into it, the wax run down its handle.", prims: torch() },
  { id: "shortsword", name: "Bronze Shortsword", tier: "normal", item: "shortsword", reach: 34, damage: 29.6, edge: [0, 1, 0], note: "The Soldier's. The chisel made whole: a ball pommel, a plain grip, an oval guard and a long ridged blade coming to a point.", prims: shortsword() },
  { id: "axe", name: "Barbarian's Axe", tier: "heavy", item: "axe", reach: 43, damage: 13, edge: [0, 1, 0], note: "The Barbarian's. A long dark haft, a broad two-lobed head of black iron set on its side, its edge ground gray.", prims: axe() },
  { id: "sickle", name: "Nomadic Sickle", tier: "light", item: "sickle", reach: 20, damage: 12, edge: [0, -1, 0], note: "The Nomad's. A short handle, an iron collar and a crescent blade, thickest at the collar and thinning to its point.", prims: sickle() },
];

export type GearId = (typeof GEAR_WEAPONS)[number]["id"];

/** The 3D model of a weapon in the game: a tier, or one of the classes' own. */
export const modelOfWeapon = (tier: WeaponTier, item?: WeaponItem): GearModel | undefined =>
  GEAR_WEAPONS.find(m => (item ? m.item === item : !m.item && m.tier === tier));

/** The box a model fits in (low and high corners), to centre and fit it. */
export function boundsOf(prims: readonly Prim[]): { lo: V3; hi: V3 } {
  const pts: V3[] = [];
  for (const p of prims) {
    if (p.k === "poly" || p.k === "stroke") pts.push(...p.pts);
    else if (p.k === "line" || p.k === "cyl") pts.push([p.a[0] - p.r, p.a[1] - p.r, p.a[2] - p.r], [p.b[0] + p.r, p.b[1] + p.r, p.b[2] + p.r]);
    else if (p.k === "ball") pts.push([p.c[0] - p.rx, p.c[1] - p.ry, p.c[2] - p.rz], [p.c[0] + p.rx, p.c[1] + p.ry, p.c[2] + p.rz]);
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
  | { k: "cyl"; body: string; sides: [string, string]; far: End; near: End; fill: string; stroke: string; depth: number }
  /**
   * A piece of a rod. `ends`: which of its two ends are the rod's own (round); the others meet the next piece, square, its fill reaching `overlap`
   * past them (on the page) so the pieces join without a seam.
   */
  | { k: "line"; x1: number; y1: number; x2: number; y2: number; width: number; fill: string; stroke: string; depth: number; ends: [boolean, boolean]; overlap: number }
  | { k: "ellipse"; cx: number; cy: number; rx: number; ry: number; angle: number; fill: string; stroke: string; ring?: number; depth: number }
  | { k: "stroke"; points: string; width: number; color: string; depth: number };

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
const tone = (c: string, k: number) => `rgb(${hex(c).map(v => Math.max(0, Math.min(255, Math.round(v * k)))).join(",")})`;
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
      case "line": {
        // A long rod (the axe's haft) passes things at very different depths along its length: sorted as one shape, by its middle, it would be drawn
        // wholly behind or wholly in front of a head near its end. So it is drawn in short pieces, each sorted by its own depth, at its centre line.
        const pieces = Math.max(1, Math.ceil(Math.hypot(...sub3(p.b, p.a)) / LINE_PIECE));
        const along = (t: number): V3 => [p.a[0] + (p.b[0] - p.a[0]) * t, p.a[1] + (p.b[1] - p.a[1]) * t, p.a[2] + (p.b[2] - p.a[2]) * t];
        for (let i = 0; i < pieces; i++) {
          const a = cam.view(along(i / pieces)), b = cam.view(along((i + 1) / pieces)), m: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
          const [x1, y1] = cam.project(a), [x2, y2] = cam.project(b), s = cam.scale(m);
          out.push({
            k: "line", x1, y1, x2, y2, width: 2 * p.r * s, fill: tone(p.color, 1), stroke: tone(p.color, 0.55), depth: m[2],
            ends: [i === 0, i === pieces - 1], overlap: 0.1 * s,
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
