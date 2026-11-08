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
   */
  | { k: "poly"; pts: V3[]; color: string; marks?: { pts: V3[]; w: number; color: string }[]; seamless?: boolean; out?: V3 }
  /** A thick line with round ends: a haft, a bar, `r` the radius. */
  | { k: "line"; a: V3; b: V3; r: number; color: string }
  /** A cylinder from `a` to `b`, `r` the radius: straight sides and flat ends (a grip). */
  | { k: "cyl"; a: V3; b: V3; r: number; color: string }
  /** An ellipsoid with these half-sizes along x, y and z: drawn as the ellipse it looks like from where it is seen. */
  | { k: "ball"; c: V3; rx: number; ry: number; rz: number; color: string }
  /** A flat circle, its normal `n`: a stamp, a wrap round a haft (`ring`: only its outline, that wide). */
  | { k: "disc"; c: V3; n: V3; r: number; color: string; ring?: number }
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
  /** A line about it, for the viewer. */
  note: string;
  prims: Prim[];
}

/* ============================================================
 * Colours (the sprites', from the stylesheet)
 * ============================================================ */

const WOOD = "#8a6b4a", CORD = "#a48d64", CHAR = "#2f2926";
const WAX = "#b9a14e", WAX_DARK = "#85733a", BRICK = "#85838d", BRICK_EDGE = "#5d5b66";
const BRONZE = "#b9854a", BRONZE_DARK = "#8a5f2c", IRON = "#8f93a3", IRON_DARK = "#6b6f80";

/* ============================================================
 * Building them
 * ============================================================ */

/** A rod along a path: a thick round-ended line for each stretch, the radius going from `r0` to `r1` along it. */
function rod(path: readonly V3[], r0: number, r1: number, color: string): Prim[] {
  return path.slice(1).map((b, i) => ({ k: "line", a: path[i], b, r: r0 + ((r1 - r0) * (i + 0.5)) / (path.length - 1), color }));
}

/** A wrap round something running along x, at `x`: a hoop, `r` wide, `w` thick. */
const hoop = (x: number, r: number, color: string, w = 0.8, y = 0): Prim => ({ k: "disc", c: [x, y, 0], n: [1, 0, 0], r, color, ring: w });

/** A thin line to lay on a plate's broad faces: through these points (in x, y), `w` wide. */
type Mark = { pts: readonly P2[]; w: number; color: string };
const mark = (pts: readonly P2[], w: number, color: string): Mark => ({ pts, w, color });

/**
 * An outline (in x, y) given a thickness, z from z0 to z1: its two broad faces in `color`, the faces round its edge in `side`. `marks` are lines lying
 * on both broad faces (a fuller, cord, a crack); they are drawn with the face they lie on.
 */
function plate(outline: readonly P2[], z0: number, z1: number, color: string, side: string, marks: readonly Mark[] = []): Prim[] {
  const front = outline.map(([x, y]) => [x, y, z1] as V3), back = outline.map(([x, y]) => [x, y, z0] as V3);
  const on = (z: number) => marks.map(m => ({ pts: m.pts.map(([x, y]) => [x, y, z] as V3), w: m.w, color: m.color }));
  // Which way round the outline goes decides which way each edge faces out (the outline may have notches; this still holds edge by edge).
  let area = 0;
  for (let i = 0; i < outline.length; i++) { const [x0, y0] = outline[i], [x1, y1] = outline[(i + 1) % outline.length]; area += x0 * y1 - x1 * y0; }
  const turn = area >= 0 ? 1 : -1;
  const prims: Prim[] = [{ k: "poly", pts: [...back].reverse(), color: side, marks: on(z0 - 0.03), out: [0, 0, -1] }];
  for (let i = 0; i < outline.length; i++) {
    const j = (i + 1) % outline.length, dx = outline[j][0] - outline[i][0], dy = outline[j][1] - outline[i][1], l = Math.hypot(dx, dy) || 1;
    prims.push({ k: "poly", pts: [front[i], front[j], back[j], back[i]], color: side, out: [(turn * dy) / l, (-turn * dx) / l, 0] });
  }
  prims.push({ k: "poly", pts: front, color, marks: on(z1 + 0.03), out: [0, 0, 1] });
  return prims;
}

/** A box, as a plate of a rectangle. */
const slab = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: string, side = color): Prim[] =>
  plate([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], z0, z1, color, side);

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

/** Points round part of an ellipse, from angle `a0` to `a1` (radians). */
const arcPoints = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 12): P2[] =>
  Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as P2; });

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
      poly([[root, 0, T], [END, 0, T], [END, -H, 0], [12.5, -H, 0], [12.2, -1.95, plane(1.95)], [11.9, -H, 0], [8.7, -H, 0], [8.4, -2, plane(2)], [8.1, -H, 0], [root, -H, 0]], "#a2733d", -1),
    ];
  };
  return [
    { k: "ball", c: [-5.4, 0, 0], rx: R, ry: R, rz: R, color: WOOD },
    { k: "cyl", a: [gripBack, 0, 0], b: [gripFront, 0, 0], r, color: WOOD },
    { k: "ball", c: [guard.x, 0, 0], rx: guard.rx, ry: guard.ry, rz: guard.rz, color: BRONZE_DARK },
    ...face(1, 11), ...face(-1, 23),
    // where it is broken off: the flat diamond cut, the blade's section, filled with wax
    { k: "poly", pts: [[END, 0, T], [END, H, 0], [END, 0, -T], [END, -H, 0]], color: WAX, seamless: true, out: [1, 0, 0] },
  ];
}

/**
 * The Brick Hammer (heavy), as simple as it goes: a straight cylinder for a haft, a brick that is one plain box, and a few small straight scratches on the
 * brick's broad faces, in random places.
 */
function hammer(): Prim[] {
  const brick = { x0: 29.5, x1: 41, y: 7, z: 3.6 }; // (half height, half thickness)
  const r = 1.5;
  // The haft runs straight from behind the grip to the brick, ending where it meets the brick's face: the end circle lies on that face, within it,
  // so none of the haft is outside the brick and none of it goes further in than it must.
  const haftFront = brick.x0 + 0.05;
  // Scratches, gray like the brick's shaded faces (a fixed scatter): a few short ones anywhere on the broad faces, a couple on the top and the bottom, and
  // mainly on the two ends that take the blows (across the head, y = +-7): near their edges, running out from the middle of the face as if the impacts
  // had cracked it outward.
  const rnd = seeded(5);
  const GRAY = BRICK_EDGE, DEEP = "#47454f"; // (the end faces are already that shade, so their scratches are a little deeper)
  const scratches = () => {
    const out: Mark[] = [];
    for (let k = 0; k < 3; k++) {
      const x = brick.x0 + 1.2 + rnd() * (brick.x1 - brick.x0 - 4.4), y = (rnd() * 2 - 1) * (brick.y - 1.6), len = 1.4 + rnd() * 2.2, a = rnd() * Math.PI;
      out.push(mark([[x, y], [x + len * Math.cos(a), y + len * Math.sin(a)]], 0.4, GRAY));
    }
    return out;
  };
  const cx = (brick.x0 + brick.x1) / 2, hx = (brick.x1 - brick.x0) / 2;
  // On an end face (across x and z): from near the edge, outward along the line from the face's centre, to just short of the edge.
  const radial = (n: number): { pts: V3[]; w: number; color: string }[] => {
    const out: { pts: V3[]; w: number; color: string }[] = [];
    for (let k = 0; k < n; k++) {
      const a = ((k + 0.2 + rnd() * 0.6) / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const t = Math.min(hx / Math.max(Math.abs(c), 1e-6), brick.z / Math.max(Math.abs(s), 1e-6)); // the way out to the edge
      const from = t * (0.55 + rnd() * 0.15), to = t * (0.9 + rnd() * 0.07);
      out.push({ pts: [[cx + c * from, 0, s * from], [cx + c * to, 0, s * to]], w: 0.4, color: DEEP });
    }
    return out;
  };
  const prims = plate([[brick.x0, brick.y], [brick.x1, brick.y], [brick.x1, -brick.y], [brick.x0, -brick.y]], -brick.z, brick.z, BRICK, BRICK_EDGE, scratches());
  for (const p of prims) {
    if (p.k !== "poly" || !p.out) continue;
    if (Math.abs(p.out[1]) > 0.5) { // an end that takes the blows
      const y = Math.sign(p.out[1]) * (brick.y + 0.03);
      p.marks = radial(6).map(m => ({ ...m, pts: m.pts.map(([x, , z]) => [x, y, z] as V3) }));
    } else if (Math.abs(p.out[0]) > 0.5) { // the top (far end) and the bottom (where the haft goes in)
      const x = p.out[0] > 0 ? brick.x1 + 0.03 : brick.x0 - 0.03, side = p.out[0] > 0 ? 1 : -1;
      p.marks = [0, 1].map(k => {
        const y = (k === 0 ? -1 : 1) * (p.out![0] > 0 ? 1.5 + rnd() * 3.5 : 2.6 + rnd() * 3), z = (rnd() * 2 - 1) * (brick.z - 1.2), len = 1 + rnd() * 1.4, a = rnd() * Math.PI;
        return { pts: [[x, y, z], [x, y + len * Math.cos(a) * side, z + len * Math.sin(a)]] as V3[], w: 0.4, color: DEEP };
      });
    }
  }
  return [
    { k: "cyl", a: [-6, 0, 0], b: [haftFront, 0, 0], r, color: WOOD },
    ...prims,
  ];
}

/**
 * The Waxed Torch (normal): a wooden torch whose charred rags are sealed in a bulb of wax stamped with the sealing king's mark; the wax has run down
 * the shaft in runnels.
 */
function torch(): Prim[] {
  return [
    ...rod([[-5, 0, 0], [8, 0, 0], [24, 0, 0]], 1.2, 1.5, WOOD),
    hoop(20.4, 1.8, CORD), hoop(21.8, 1.8, CORD),
    // the charred rags of the head, under the wax
    ...slab(23, 29, -3.1, 3.1, -3.1, 3.1, CHAR),
    // the bulb of wax over them, and the runnels that ran down the shaft
    { k: "ball", c: [30.4, 0, 0], rx: 6.2, ry: 5.4, rz: 5.4, color: WAX },
    ...rod([[25, 1.05, 0.2], [22.2, 0.9, 0.5], [19.4, 0.8, 0.4]], 0.7, 0.55, WAX),
    { k: "ball", c: [19.2, 0.8, 0.4], rx: 0.85, ry: 0.85, rz: 0.85, color: WAX },
    ...rod([[25, -0.9, -0.2], [21, -0.9, -0.5], [16.2, -0.8, -0.4]], 0.7, 0.55, WAX),
    { k: "ball", c: [15.9, -0.85, -0.4], rx: 0.9, ry: 0.9, rz: 0.9, color: WAX },
    // the sealing king's mark, pressed into the bulb's side: a round stamp, and on it a closed eye with three lashes hanging from the lid
    { k: "disc", c: [30.6, 0, 5.7], n: [0, 0, 1], r: 2.7, color: WAX_DARK },
    { k: "stroke", pts: arcPoints(30.6, 0.9, 1.5, 0.6, Math.PI * 0.1, Math.PI * 0.9, 6).map(([x, y]) => [x, y, 5.85] as V3), w: 0.3, color: CHAR },
    { k: "stroke", pts: [[29.7, 0.3, 5.85], [29.7, -1.5, 5.85]], w: 0.3, color: CHAR },
    { k: "stroke", pts: [[30.6, 0.2, 5.85], [30.6, -1.9, 5.85]], w: 0.3, color: CHAR },
    { k: "stroke", pts: [[31.5, 0.3, 5.85], [31.5, -1.5, 5.85]], w: 0.3, color: CHAR },
  ];
}

/** The Bronze Shortsword: a leaf blade, a short bar for a guard, a wrapped grip and a round pommel. */
function shortsword(): Prim[] {
  // The leaf: widening from 2 at the guard to 3.1 a third of the way up, then narrowing in a curve to the point at 34.
  const half = (x: number) => (x <= 15 ? 2 + 1.1 * ((x - 4.4) / 10.6) : 3.1 * (1 - ((x - 15) / 19) ** 2));
  const xs = Array.from({ length: 17 }, (_, i) => 4.4 + (29.6 * i) / 16);
  const blade: P2[] = [...xs.map(x => [x, half(x)] as P2), ...[...xs].reverse().map(x => [x, -half(x)] as P2)];
  return [
    { k: "ball", c: [-5.6, 0, 0], rx: 2, ry: 2, rz: 2, color: BRONZE_DARK },
    ...rod([[-4, 0, 0], [2.2, 0, 0]], 1.3, 1.3, WOOD),
    { k: "line", a: [3.3, -3.3, 0], b: [3.3, 3.3, 0], r: 1.15, color: BRONZE_DARK },
    ...plate(blade, -0.5, 0.5, BRONZE, BRONZE_DARK, [mark([[5.6, 0], [29, 0]], 0.7, BRONZE_DARK)]),
  ];
}

/** The Barbarian's Axe: a long wooden haft, the broad two-lobed iron head set on its side near the end, the haft showing past it. */
function axe(): Prim[] {
  // The sprite draws the head turned a quarter: its edge runs alongside the haft, its two lobes (a top and a beard) bulge out along it. In its own
  // frame (a along the head's depth, b across): (28.5,-2) (28.5,2) (32,3.4) (36.5,10.5) curve to (41.5,0) curve (36.5,-10.5) (32,-3.4).
  const local: P2[] = [
    [28.5, -2], [28.5, 2], [32, 3.4], [36.5, 10.5],
    ...arcPoints(36.5, 0, 5, 10.5, Math.PI / 2, 0, 12).slice(1),
    ...arcPoints(36.5, 0, 5, 10.5, 0, -Math.PI / 2, 12).slice(1), [32, -3.4],
  ];
  // (then turned a quarter and set against the haft: world x = 35 - b, y = 1.2 + (a - 28.5))
  const head: P2[] = local.map(([a, b]) => [35 - b, 1.2 + (a - 28.5)] as P2);
  return [
    ...rod([[-6, 0, 0], [18, 0, 0], [43, 0, 0]], 1.5, 1.5, WOOD),
    ...plate(head, -0.8, 0.8, IRON, IRON_DARK),
    hoop(31.3, 1.8, CORD), hoop(32.6, 1.8, CORD), hoop(38, 1.8, CORD), hoop(39.3, 1.8, CORD),
  ];
}

/** The Nomadic Sickle: a short handle with a round end, and an iron blade in the shape of a crescent moon whose two tips lie on the handle's line. */
function sickle(): Prim[] {
  const outer = arcPoints(12.9, 0, 6.9, 9.5, Math.PI, 0, 18), inner = arcPoints(12.9, 0, 6.9, 7.6, 0, Math.PI, 18);
  return [
    { k: "ball", c: [-4.8, 0, 0], rx: 1.7, ry: 1.7, rz: 1.7, color: WOOD },
    ...rod([[-4, 0, 0], [6, 0, 0]], 1.3, 1.3, WOOD),
    ...plate([...outer, ...inner], -0.6, 0.6, IRON, IRON_DARK),
  ];
}

/** Every weapon, with the two most worked on first. */
export const GEAR_WEAPONS: GearModel[] = [
  { id: "chisel", name: "Jagged Chisel", tier: "light", reach: 15, damage: 11.4, note: "Light. Bronze: a ridged grip, an oval guard, a broad blade ground square, nicked and chipped, waxed from the carving.", prims: chisel() },
  { id: "hammer", name: "Brick Hammer", tier: "heavy", reach: 41, damage: 11.5, note: "Heavy. A straight haft and a plain brick, scratched here and there.", prims: hammer() },
  { id: "torch", name: "Waxed Torch", tier: "normal", reach: 35, damage: 12.4, note: "Normal. A torch sealed in a bulb of wax, stamped with the sealing king's mark.", prims: torch() },
  { id: "shortsword", name: "Bronze Shortsword", tier: "normal", item: "shortsword", reach: 34, damage: 29.6, note: "The Soldier's. A leaf blade, a bar for a guard, a wrapped grip and a round pommel.", prims: shortsword() },
  { id: "axe", name: "Barbarian's Axe", tier: "heavy", item: "axe", reach: 43, damage: 13, note: "The Barbarian's. A long haft, a broad two-lobed iron head set on its side.", prims: axe() },
  { id: "sickle", name: "Nomadic Sickle", tier: "light", item: "sickle", reach: 20, damage: 12, note: "The Nomad's. A short handle and a crescent blade.", prims: sickle() },
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
  | { k: "line"; x1: number; y1: number; x2: number; y2: number; width: number; fill: string; stroke: string; depth: number }
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
        const k = Math.abs(unit3(n)[2]) > 0.55 ? 1 : 0.8, depth = vs.reduce((s, v) => s + v[2], 0) / vs.length;
        // (A seamless face has no outline of its own, only a hairline in its colour so it meets its neighbours without a gap.)
        out.push({ k: "poly", points: vs.map(v => cam.project(v).join(",")).join(" "), fill: tone(p.color, k), stroke: tone(p.color, p.seamless ? k : k * 0.55), depth });
        // the lines lying on this face go with it, just over it
        for (const m of p.marks ?? []) {
          out.push({ k: "stroke", points: m.pts.map(q => cam.project(cam.view(q)).join(",")).join(" "), width: m.w * cam.scale(vs[0]), color: tone(m.color, k), depth: depth - 0.0005 });
        }
        break;
      }
      case "line": {
        const a = cam.view(p.a), b = cam.view(p.b), m: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
        const [x1, y1] = cam.project(a), [x2, y2] = cam.project(b);
        out.push({ k: "line", x1, y1, x2, y2, width: 2 * p.r * cam.scale(m), fill: tone(p.color, 1), stroke: tone(p.color, 0.55), depth: m[2] });
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
          return { cx, cy, rx: sil.rx * k, ry: sil.ry * k, angle: sil.angle, fill: tone(p.color, facing ? 1.12 : 0.92), facing };
        };
        const bFacing = axis[2] < 0; // (b's end faces the viewer if the axis points toward it)
        out.push({
          k: "cyl", body, sides: [side1, side2], fill: tone(p.color, 0.92), stroke: tone(p.color, 0.55), depth: m[2],
          far: endOf(bFacing ? p.a : p.b, bFacing ? va : vb, false),
          near: endOf(bFacing ? p.b : p.a, bFacing ? vb : va, true),
        });
        break;
      }
      case "ball": {
        const v = cam.view(p.c), [cx, cy] = cam.project(v), s = silhouette([dirOf(p.c, [p.rx, 0, 0]), dirOf(p.c, [0, p.ry, 0]), dirOf(p.c, [0, 0, p.rz])]), k = cam.scale(v);
        out.push({ k: "ellipse", cx, cy, rx: s.rx * k, ry: s.ry * k, angle: s.angle, fill: tone(p.color, 1), stroke: tone(p.color, 0.55), depth: v[2] });
        break;
      }
      case "disc": {
        const v = cam.view(p.c), [cx, cy] = cam.project(v), [u, w] = planeOf(p.n), s = silhouette([dirOf(p.c, [u[0] * p.r, u[1] * p.r, u[2] * p.r]), dirOf(p.c, [w[0] * p.r, w[1] * p.r, w[2] * p.r])]), k = cam.scale(v);
        // (A wrap round a rod is drawn over the rod's stretches, whose middles may be nearer or farther than it.)
        out.push({ k: "ellipse", cx, cy, rx: s.rx * k, ry: s.ry * k, angle: s.angle, fill: p.ring ? "none" : tone(p.color, 1), stroke: p.ring ? tone(p.color, 1) : tone(p.color, 0.55), ring: p.ring ? p.ring * k : undefined, depth: v[2] - (p.ring ? p.r + 4 : 0) });
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
