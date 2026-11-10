/**
 * Sleepwalker3D.tsx — the Depraved Sleepwalker (and its variants: bare-handed, the Hammer Sleepwalker, the Patrol Warden) drawn from a
 * skeleton in 3D space, as the Waxed is (Waxed3D.tsx; the shared pieces are in figure3d.tsx): its joints placed on the combat scene's floor,
 * facing a way, projected through the scene's camera and connected far to near.
 *
 * Unlike the waxed it stands on two free legs, each on its own hip (`freeLegs` in rig3d.ts), its head is bare (a dark ball with two pale eyes,
 * looking where the pose looks) or under the patrol wardens' pointed hood, and it holds its weapon (the Jagged Chisel, the Brick Hammer, the
 * Waxed Torch) as its flat pose does: in the weapon hand, at the pose's angle, its broad face turned to the side. A pose held in both hands
 * reaches the other hand to it in space. FIRST PASS: the poses are the flat ones lifted as they are, to be tuned one by one.
 */
import { cloneElement, memo, type ReactElement, type ReactNode, useContext, useId, useMemo, useRef } from "react";
import type { ArmorItem, ArmorTier, HeadItem, Side, WeaponItem, WeaponTier } from "../core/types";
import { type Cam, METERS_PER_UNIT as U, type Vec } from "./camera";
import { DebugLimbsContext } from "./debugLimbs";
import { arcPart, canvas3d, ellipsoidPart, Figure3DSvg, ribcagePart, sameDrawing, weaponParts } from "./figure3d";
import { held as heldAlong, type Joint, liftPose, type P3, placeRig, poseWeaponAxis, type Rig3, ribcageOf, type Seen, swingArc } from "./rig3d";
import { ALL_POSES, type PoseName } from "./poses";
import { modelOfWeapon } from "./gear3d";
import { useSway } from "./sway";
import { WEAPON_REACH } from "./StickFigure";

/** Its bodily thickness, in figure units, before perspective: the limbs (as the flat figure's), the wax that seals it, the head. */
const LIMB = 5, SHELL = 13, HEAD_R = 7.5;
/** How thick the bronze chestplate is down the spine below the ribcage (figure units): as deep as the ribcage. */
const ABS = 9;
/** The Hunter's spine below the ribcage, for a fuller silhouette: its half width across and half depth front to back (figure units; the ribcage's are 6.6 and 4.5), and where it starts (a share of the way up from the pelvis to the waist; a little below the pelvis, so it reaches it and no gap shows). */
/** The Hunter's coat line, where it goes on up to the neck: how far it stands off the chest at its middle and at the neck (figure units), how far to the right of the neck's middle it ends, and how far up the neck (a share of its length). */
const FLAP_LIFT = 1.4, NECK_HALF = 2.8, NECK_UP = 0.35;
/**
 * The Nomad's robe and wrappings (figure units). The robe's spine below the ribcage, an elliptical cylinder from the belt up into the ribcage: its half width and half
 * depth at the belt, and the height at which it is cut inside the ribcage (a share of the ribcage's half height, from its middle: its top ring is the ribcage's own section
 * there); the sash round it: how far it stands off the spine, how wide (half) and where along it. The puffy trousers: their radius, how far they
 * reach up past the hip and down past the knee, and the band that gathers them at the knee. The wraps on the arms and shins: how far apart. The mask: its radius (cloth over the head), its
 * eye opening (half width and half height, radians), and its braid (how many twists, how far apart down it, how big the first one is, how far each sits to its side of the middle, the ball it ends on, and the two bananas hanging from that: how long, how far out they curve and how wide).
 */
const ROBE_SPINE_W = 5.0, ROBE_SPINE_D = 3.2, ROBE_SPINE_CUT = -0.35, SASH_OUT = 0.7, SASH_HALF = 1.1, SASH_AT = 0.42;
/** The Nomad's pants at the pelvis: half width across and half depth (figure units). */
/** How much deeper than the middle of the body an arm's middle must be for it to count as behind the body (meters). */
const ARM_BEHIND = 0.02;
const PANTS_W = 6.8, PANTS_D = 5.2;
const PUFF_R = 5.2, PUFF_UP = 4.5, PUFF_PAST = 1.2, KNEE_BAND_R = 2.9, KNEE_BAND_HALF = 0.9, WRAP_EVERY = 4.2;
/** The Nomad's V collar: how far to each side of the breastbone it starts, and its height at the neck and at its point (shares of the ribcage's half height). */
const COLLAR_SPREAD = 0.42, COLLAR_TOP = 0.82, COLLAR_APEX = 0.5;
const MASK_R = 8.6, MASK_HOLE_W = 0.62, MASK_HOLE_H = 0.3, BRAID_LUMPS = 16, BRAID_END_R = 1.5, BANANA_LEN = 6.5, BANANA_OUT = 2.6, BANANA_W = 1.6, BRAID_STEP = 0.9, BRAID_R = 2.2, BRAID_SPREAD = 0.3;
const GARB_SPINE_W = 5.5, GARB_SPINE_D = 3.2, GARB_SPINE_FROM = -0.25;
/** The Hunter's cloak: its hem hangs this far (figure units) below the pelvis (negative: above it), its edges drawn in this many steps, and how much wider it gets (a share of its width) for each figure unit it goes down. */
const CLOAK_PAST = -8, CLOAK_STEPS = 64, CLOAK_FLARE = 0.012;
/** The cloak's two tails: how far each point hangs below the pelvis (figure units, whatever the hem's height); where its base starts and ends round the cylinder, in radians either side of the middle of the back (from a hair apart to near the front); where its point is, in the same. */
const TAIL_END = 19, TAIL_FROM = 0.05, TAIL_TO = Math.PI - 0.5, TAIL_APEX = 0.55;
/** How far down the thigh the chestplate's leather underpants reach (a share of it, from the hip: a little above the knee). */
const HEM = 0.8;
/** Where the bronze below the ribcage stops, above the pelvis: a share of the way up from the pelvis to the waist (clear of the line of the hips). */
const ARMOR_FROM = 0.3;
/** How much wider round the skirt hangs than the bronze above it (figure units, on its radius). */
const SKIRT_OUT = 1.2;
/** The skirt's leather strips: how long they hang below the bottom edge of the bronze (figure units): to the middle of the thighs. */
const STRIP_LEN = 19;
/** How far down the upper arm the leather shoulder pieces reach, from the shoulder (a share of the bone). */
const PAD = 0.4;
/**
 * The legionnaire's helm's flaps (figure units): how far round the rim each hangs (degrees from the front, toward its right), how wide it is at its top
 * and at its foot, how long, and the gap between the rim and its top. The ear flaps hang a little below the rim; the neck plate is joined to it, much
 * broader there, narrowing as it hangs.
 */
const HELM_FLAPS = [
  { deg: 80, top: 5.5, foot: 5.2, len: 7, gap: 0.8 },
  { deg: -80, top: 5.5, foot: 5.2, len: 7, gap: 0.8 },
  { deg: 180, top: 18, foot: 11, len: 7, gap: 0 },
];
/** The patrol wardens' hood: its round, as big as the flat one's. */
/** Where the Hunter's black gloves begin, a share of the way from the elbow to the hand (a little below the joint). */
const BLACK_FROM = 0.12;
const HOOD_R = 8.9;
/** The black hood's opening: a circle on the hood, this many radians across from its middle, its middle tipped this far down from where the face looks (its top at the brows, its bottom at the neck). */
const OPENING_HALF = 0.85, OPENING_TIP = 0.55;
/** Its two eyes, tired half moons: how far either side of where it looks (radians round the head), and their radius. */
const EYE_APART = 0.42, EYE_R = 1.8;

/** The swings that leave an arch behind: the strike, and the wind-up it swings from. */
const SWINGS: Partial<Record<PoseName, PoseName>> = {
  "sw-chop": "sw-overhead", "sw-overhead-strike": "sw-overhead-leap", "sw-swing-l": "sw-swing-l-windup", "sw-swing-r": "sw-swing-r-windup",
};
/** Each wind-up's strike (Arms Overhead's is the Overhead Strike's): the swing it is about to make, which its weapon's edge side faces. */
const STRIKE_OF: Partial<Record<PoseName, PoseName>> = Object.fromEntries(
  Object.entries(SWINGS).filter(([strike]) => strike !== "sw-chop").map(([strike, windUp]) => [windUp, strike]),
);

/** The way its broad face turns: to its side, so the blade is seen flat from the side, as the flat figure shows it. */
const FACE: P3 = [1, 0, 0];

export interface Sleepwalker3DProps {
  pose: PoseName;
  hand?: Side;
  weapon: WeaponTier;
  /** A patrol warden: the Penitent Warden's pointed hood over its head (its face in shadow). */
  hooded?: boolean;
  /** Wax sealing the whole body. */
  encased?: boolean;
  /** Wax caked on it (waxed by a torch, still standing). */
  waxCaked?: boolean;
  /** It has fallen: it lies on its back on the floor (`sw-dead`), its weapon dropped by its hand, a little blood splashed about. */
  dead?: boolean;
  /**
   * The player, drawn on this body (its poses are named by `player3dPose`): its class's own weapon, and what it wears. Its armor colours the limbs
   * (as the flat figure's, `.armor-*`; the Soldier's gloves and boots), covers the ribcage (no ribs show on the player), and its head gear sits on
   * the head.
   */
  gear?: { weaponItem?: WeaponItem; armor: ArmorTier; armorItem?: ArmorItem; headItem?: HeadItem };
  eternalFlash?: string;
  title?: string;
  /** Which figure it is, so the sway of its cloth carries on from one drawing of it to the next (see sway.ts). */
  swayId?: string;
  cam: Cam;
  /** Where it stands on the floor, and the yaw it faces (rig3d.ts `facingYaw`). */
  at: Vec;
  yaw: number;
  /** Size relative to a normal figure. */
  scale?: number;
  /** The screen, and the figure's box on it (`figureBox`). */
  w: number;
  h: number;
  box: { x: number; y: number; w: number; h: number };
}

/** A pose lifted the sleepwalkers' way: two free legs, the weapon in both hands where the pose holds it so. */
const lift = (pose: PoseName, hand: Side, reach: number) => liftPose(ALL_POSES[pose], hand, { freeLegs: true, weaponReach: reach });

/** The weapon in the hand that holds it, pointing as the pose's flat drawing points it, kept off the floor. */
const weaponIn = (rig: Rig3, pose: PoseName, reach: number) =>
  heldAlong(rig.weaponHand === "right" ? rig.joints.handR : rig.joints.handL, poseWeaponAxis(ALL_POSES[pose]), reach);

/** How far a dead body's middle line lies off the floor (figure units): the depth of its back, so the ribcage and head rest on the floor. */
const LIE_LIFT = 4.5;
/** How far a dead body is turned on the floor from the way it faced (radians, toward its right): across the view rather than end on. */
const LIE_TURN = 1.15;

/**
 * Tipping a body onto its back: a point (`move`) or a way (not moved) in body space as it stood, to where it is once it lies on the floor. Its
 * height becomes how far along the floor, head away from where it faced; how far ahead becomes its height off the floor; then the whole of it
 * turned on the floor (`LIE_TURN`) about the middle of it.
 */
function fall(v: P3, pivotY: number, move = true): P3 {
  const lying: P3 = [v[0], v[2] + (move ? LIE_LIFT * U : 0), -(v[1] - (move ? pivotY : 0))];
  const c = Math.cos(LIE_TURN), s = Math.sin(LIE_TURN);
  return [lying[0] * c + lying[2] * s, lying[1], -lying[0] * s + lying[2] * c];
}

/** The rig lying on its back (`fall`), its face looking the way the pose's gaze points, tipped with it. */
function fallen(rig: Rig3): Rig3 {
  // (about the middle of its length, just below the pelvis, so it lies where it stood)
  const pivot = rig.joints.pelvis[1] - 2.5 * U;
  const joints = Object.fromEntries(Object.entries(rig.joints).map(([j, p]) => [j, fall(p, pivot)])) as Rig3["joints"];
  // (its face rolled a little to its right, up at the ceiling)
  return { ...rig, joints, gaze: fall(unit([0.45, 0, 0.9]), 0, false) };
}

/** A splash of blood on the floor: a rough blob round `c` (body space, on the floor), `r` figure units across, its edge wobbling by `seed`. */
function splash(c: P3, r: number, seed: number): P3[] {
  return Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2, k = r * U * (1 + 0.28 * Math.sin(3 * a + seed) + 0.14 * Math.sin(5 * a + seed * 2.3));
    return [c[0] + Math.cos(a) * k, 0.02 * U, c[2] + Math.sin(a) * k * 0.8] as P3;
  });
}

/** A unit vector in body space. */
/** The Nomad's wraps are put at random, but the same every time. */
const jit = (n: number) => { const v = Math.sin(n * 12.9898) * 43758.5453; return v - Math.floor(v); };
const dotP = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (v: P3): P3 => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
/** `a` plus `b` times `k`. */
const plus = (a: P3, b: P3, k = 1): P3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
/** The cross product. */
/** Two ways square to `n` (a unit way) and to each other. */
const perpTo = (n: P3): [P3, P3] => { const h: P3 = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]; const a = unit(cross(n, h)); return [a, cross(n, a)]; };
const cross = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Two ways square to a unit way `n` and to each other. */
function across2(n: P3): [P3, P3] {
  const u = unit(cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  return [u, cross(n, u)];
}

/** The outline of a set of points on the screen (a convex hull: the silhouette of a cone is its tip and its base's outline together). */
function hull(ps: [number, number][]): [number, number][] {
  const pts = [...ps].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const turn = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [], upper: [number, number][] = [];
  for (const p of pts) { while (lower.length >= 2 && turn(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (const p of [...pts].reverse()) { while (upper.length >= 2 && turn(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function Sleepwalker3DView({ pose: shown, hand = "right", weapon, hooded: hoodedKind, encased, waxCaked, dead, gear, eternalFlash, title, swayId, cam, at, yaw, scale = 1, w, h, box }: Sleepwalker3DProps) {
  const openingId = useId(); // (the clip that cuts the face to the black hood's opening)
  // The cloth that hangs from it (the tailcoat, the braid, the leather skirt) sways with its movement (sway.ts).
  const root = useRef<SVGSVGElement>(null);
  useSway(root, swayId ?? openingId);
  // (the player's hoods are drawn as the patrol wardens' is: black for its own hood)
  const hooded = hoodedKind || gear?.headItem === "hood" || gear?.headItem === "wardenhood";
  const blackHood = gear?.headItem === "hood";
  const pose: PoseName = dead ? "sw-dead" : shown;
  const debug = useContext(DebugLimbsContext);
  // Its weapon, modelled in 3D (gear3d.ts); the flat sprite only if there were none.
  const model = modelOfWeapon(weapon, gear?.weaponItem), reach = model?.reach ?? WEAPON_REACH[weapon];
  const rig = useMemo(() => (dead ? fallen(lift(pose, hand, reach)) : lift(pose, hand, reach)), [pose, hand, reach, dead]);
  /** A way on the body as it stood, as it is now (tipped onto its back, if dead). */
  const way = (v: P3): P3 => (dead ? fall(v, 0, false) : v);
  // The arch of a strike: from where the weapon's far end was in the wind-up to where it ends (bare-handed, from the hand), as thick as the
  // weapon's damaging part (the blade, the brick, the bulb).
  const windUp = SWINGS[pose];
  const arc = useMemo(() => {
    if (!windUp) return undefined;
    const before = lift(windUp, hand, reach);
    return weapon === "baseline"
      ? swingArc(before.joints.handR, rig.joints.handR)
      : swingArc(weaponIn(before, windUp, reach).tip, weaponIn(rig, pose, reach).tip, model && model.damage * U);
  }, [windUp, pose, hand, rig, weapon, reach, model]);
  // The swing this pose is part of, for the weapon's edge side to lead through: its own strike's arch, or (a wind-up) the one it is about to make.
  const swing = useMemo(() => {
    if (weapon === "baseline") return undefined;
    const strike = windUp ? pose : STRIKE_OF[pose], from = windUp ?? pose;
    if (!strike) return undefined;
    const arch = strike === pose && arc ? arc : swingArc(weaponIn(lift(from, hand, reach), from, reach).tip, weaponIn(lift(strike, hand, reach), strike, reach).tip);
    return { arc: arch, at: (strike === pose ? 1 : 0) as 0 | 1 };
  }, [windUp, pose, hand, reach, weapon, arc]);
  const c = canvas3d(placeRig(rig, at, yaw, cam, w, h, scale), box);
  const { seen, see, X, Y, scaleAt, parts, bones, ball, behind, meet } = c;
  const red = (side: "R" | "L") => (debug && side === "R" ? " dbg-red" : "");
  /** In gloves and boots (the Soldier's, with the bronze chestplate). */
  const shod = !encased && gear?.armorItem === "bronze-chestplate";
  /** In the Hunter's garb: the garb's own black on the torso and arms, and a deeper black on the hands (to almost the elbows), the legs, the pelvis and the spine. */
  const garbed = !encased && gear?.armorItem === "garb";
  /** In the Nomad's robe (tight, a sash and a V collar, puffy trousers gathered at the knee, the arms and shins wrapped), and its desert mask. */
  const robed = !encased && gear?.armorItem === "robe";
  const masked = !encased && gear?.headItem === "mask";
  /** The way the viewer looks at this point, in body space: where depth grows fastest. */
  const look3At = (p: P3): P3 => { const d0 = see(p).depth; return unit([0, 1, 2].map(i => see(plus(p, [0, 1, 2].map(k => (k === i ? 0.01 : 0)) as unknown as P3)).depth - d0) as unknown as P3); };
  const rcBody = ribcageOf(rig);
  /**
   * A part of cloth that sways (sway.ts): `kind`, the point it hangs from (drawing units), its share of the swing, and the two angles its limit is measured by: how it
   * hangs by itself and which way the part it hangs from points (`hangs`, from `hanging`).
   */
  const cloth = (kind: string, pivot: [number, number], weight: number, key: string, node: ReactNode, hangs: [number, number]) => (
    <g key={key} data-sway={kind} data-px={pivot[0].toFixed(2)} data-py={pivot[1].toFixed(2)} data-sway-w={weight} data-rest={hangs[0].toFixed(2)} data-body={hangs[1].toFixed(2)}>{node}</g>
  );
  /** The angle (degrees, turned as `rotate` turns: straight down on the screen is 0, clockwise is positive) of the way from one point to another on the screen. */
  const turned = (a: Seen, b: Seen) => (Math.atan2(-(X(b) - X(a)), Y(b) - Y(a)) * 180) / Math.PI;
  /** How a cloth hanging from `at` hangs by itself (straight down), and the way the part it hangs from points (from `from` to `to`, joints of it): the angles for `cloth`. */
  const hanging = (at: P3, from: Joint, to: Joint): [number, number] => [turned(see(at), see(plus(at, way([0, -1, 0]), 0.2))), turned(seen[from], seen[to])];
  // Bands round the Nomad (the sash, the knee bands): a cylinder with an elliptical section, drawn as the Hunter's cloak is, in a near wall and a far one, each
  // one piece; the near wall is over the body parts inside it and the far one under them (`settleNomad`, once every part is placed).
  const bands: { part: { depth: number }; near: boolean; inside: string[] }[] = [];
  /**
   * The armor pieces an arm can hang over, the ones that face the viewer (the near walls of the cloak and bands, the pants, the Soldier's strips): see `liftArms`.
   * An arm hangs by the body, nearly touching it, so the middle of its depth is within a hair of these and it may sort under them.
   */
  const armorNear: { depth: number }[] = [];
  const pushArmor = (p: { key: string; depth: number; node: ReactNode }) => { parts.push(p); armorNear.push(p); };
  const tube = (key: string, centre: P3, axis: P3, hw: number, hd: number, half: number, cls: string, inside: string[], taper?: { hw: number; hd: number }) => {
    const ax = unit(axis), sideP = unit(plus(rcBody.side as P3, ax, -dotP(rcBody.side as P3, ax))), frontP = cross(ax, sideP);
    const W = hw * U, D = hd * U, H = half * U, lk = look3At(centre);
    // (`taper`: its width and depth at the far end of the axis, if they are not the same as at the near one; cut flat at both ends, as a cylinder is)
    const W1 = (taper?.hw ?? hw) * U, D1 = (taper?.hd ?? hd) * U;
    const ring = (a: number, along: number) => { const u = (along + H) / (2 * H), w = W + (W1 - W) * u, d = D + (D1 - D) * u; return see(plus(plus(plus(centre, ax, along), sideP, w * Math.cos(a)), frontP, d * Math.sin(a))); };
    const toward = Math.atan2(dotP(lk, frontP) / D, dotP(lk, sideP) / W);
    for (const near of [true, false]) {
      const from = toward + (near ? 1 : -1) * (Math.PI / 2), angles = Array.from({ length: 41 }, (_, i) => from + (i / 40) * Math.PI);
      const ps = [...angles.map(a => ring(a, -H)), ...angles.map(a => ring(a, H)).reverse()], k = `${key}-${near ? "near" : "far"}`;
      const part = { key: k, depth: ring(from + Math.PI / 2, 0).depth, node: <polygon key={k} points={ps.map(q => `${X(q)},${Y(q)}`).join(" ")} className={cls} /> };
      parts.push(part);
      if (near) armorNear.push(part);
      bands.push({ part, near, inside });
    }
  };
  /** Soft wraps across a run of limb, each a little slanted and bowed, none quite alike: short arcs on the half of the limb that faces the viewer, at the limb's own depth. */
  const wraps = (key: string, a: P3, b: P3, over: string, seed: number) => {
    const limb = parts.find(x => x.key === over);
    if (!limb) return;
    const along = [0, 1, 2].map(i => b[i] - a[i]) as unknown as P3, ax = unit(along), len = Math.hypot(...along) / U, [p, q] = perpTo(ax);
    const n = Math.max(2, Math.floor(len / WRAP_EVERY)), r = (LIMB / 2) * U * 1.04;
    // (every wrap of the run is one path, its marks as sub-paths: one element for the run, not one for each, and the way the viewer looks is taken once, in the middle of it)
    const lk = look3At(plus(a, along, 0.5)), toward = Math.atan2(-dotP(lk, q), -dotP(lk, p));
    let d = "";
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5 + (jit(k + seed * 7) - 0.5) * 0.5) / n, centre = plus(a, along, t), slant = (jit(k * 3 + seed * 11) - 0.5) * 0.9, bow = (jit(k * 5 + seed) - 0.5) * 1.8;
      for (let i = 0; i < 7; i++) {
        const u = i / 6 - 0.5, ang = toward + u * 2, pt = see(plus(plus(plus(centre, p, Math.cos(ang) * r), q, Math.sin(ang) * r), ax, (u * slant * 5.8 + bow * (0.25 - u * u) * 0.9) * U));
        d += `${i ? "L" : "M"}${X(pt)} ${Y(pt)}`;
      }
    }
    parts.push({ key: `${key}-wraps`, depth: limb.depth - 0.0004, node: <path key={`${key}-wraps`} d={d} className="fig-limb-wrap" /> });
  };
  /** Lines laid over a part, which have to be drawn just over it however the body is turned: their depth is set from it once every part is placed. */
  const overlays: { part: { depth: number }; over: string }[] = [];
  /** The Nomad's braid hangs down its back: the viewer is behind it (true), or in front (false); not known until the mask is placed. */
  let braidFromBehind: boolean | undefined;
  const settleNomad = () => {
    // The braid is over the head, chest and back when seen from behind, and under all of them when seen from the front: sorted as one thing (the knot first, then
    // the chain from the top down, each over the one below it) either just over the nearest of those or just under the farthest of them.
    if (braidFromBehind !== undefined) {
      const isBraid = (k: string) => k.startsWith("mask-braid") || k.startsWith("mask-banana") || k === "mask-knot";
      const core = parts.filter(x => !isBraid(x.key) && (["head", "neck", "ribcage", "shoulders", "pants", "spine-near", "spine-far", "sash-near", "sash-far"].includes(x.key) || x.key.startsWith("mask-") || x.key.startsWith("eye") || x.key.startsWith("collar"))).map(x => x.depth);
      const chain = [...parts.filter(x => x.key === "mask-knot"), ...parts.filter(x => isBraid(x.key) && x.key !== "mask-knot")];
      const base = core.length ? (braidFromBehind ? Math.min(...core) - 0.0006 : Math.max(...core) + 0.0006) : 0;
      if (core.length) chain.forEach((x, i) => { x.depth = base + i * 0.00002; });
    }
    for (const { part, near, inside } of bands) {
      const ds = inside.map(k => parts.find(x => x.key === k)?.depth).filter((d): d is number => d !== undefined);
      part.depth = near ? Math.min(part.depth, ...ds) - 0.0005 : Math.max(part.depth, ...ds) + 0.0005;
    }
    for (const { part, over } of overlays) { const o = parts.find(x => x.key === over); if (o) part.depth = o.depth - 0.001; }
  };

  /** Puts the Hunter's cloak on the right side of the body parts inside it, once all of them are placed. */
  let settleCloak: (() => void) | undefined;
  if (!encased) {
    // The spine is three parts, each drawn on its own: the lower spine, the ribcage (a solid, below) and the neck.
    // (the bronze chestplate goes on down the spine below the ribcage, as thick as the ribcage is deep, its abs on its front; it stops a little above
    // the pelvis, cut across as a cylinder is, the spine going on below it to the pelvis in leather, under the skirt, so no skin shows between the strips)
    if (shod) {
      const j = rig.joints, bottom: P3 = [0, 1, 2].map(i => j.pelvis[i] + (j.waist[i] - j.pelvis[i]) * ARMOR_FROM) as unknown as P3;
      bones("lumbar-low", ["pelvis", see(bottom)], "fig-limb fig-leather", LIMB);
      bones("lumbar", [see(bottom), "waist"], "fig-limb fig-bronze", ABS, 0, { start: { at: bottom, axis: [0, 1, 2].map(i => j.waist[i] - j.pelvis[i]) as unknown as P3 } });
      behind("lumbar-low", "lumbar");
    } else if (garbed) {
      // (the Hunter's thick spine starts a little above the pelvis, not down on it, with a round end: a thin one goes on to the pelvis)
      const j = rig.joints, from: P3 = [0, 1, 2].map(i => j.pelvis[i] + (j.waist[i] - j.pelvis[i]) * GARB_SPINE_FROM) as unknown as P3;
      bones("lumbar-low", ["pelvis", see(from)], "fig-limb fig-black", LIMB);
      // (a solid like the ribcage: wide across, shallow front to back, round at both ends, from there up to the waist)
      const rc = ribcageOf(rig), mid: P3 = [0, 1, 2].map(i => (from[i] + j.waist[i]) / 2) as unknown as P3, halfH = Math.hypot(...[0, 1, 2].map(i => j.waist[i] - from[i])) / 2;
      pushArmor(ellipsoidPart(c, "lumbar", mid, rc.side, rc.fwd, rc.up, GARB_SPINE_W * U, GARB_SPINE_D * U, halfH, "fig-spine-black"));
      behind("lumbar-low", "lumbar");
    } else if (robed) {
      // (the Nomad's robe is tight over the body: its spine below the ribcage is a white solid, an elliptical cylinder, wide across and shallow. It starts at the belt, where
      // the sash hides its foot, and goes up into the ribcage, where it is cut flat on a ring that is the ribcage's own: the section of the ribcage at that height, as wide
      // and as deep as the ribcage is there, in the plane square to the ribcage's axis, so its edge lies on the ribcage's surface and the two meet with no step. The robe,
      // the ribcage and the sash being drawn over one another in the one white, no edge shows.)
      const j = rig.joints, rc = rcBody, up3 = [0, 1, 2].map(i => j.waist[i] - j.pelvis[i]) as unknown as P3;
      const belt: P3 = [0, 1, 2].map(i => j.pelvis[i] + up3[i] * SASH_AT) as unknown as P3;
      const cutAt: P3 = [0, 1, 2].map(i => rc.centre[i] + rc.up[i] * rc.halfHeight * ROBE_SPINE_CUT) as unknown as P3;
      const run = [0, 1, 2].map(i => cutAt[i] - belt[i]) as unknown as P3, ring = Math.sqrt(1 - ROBE_SPINE_CUT * ROBE_SPINE_CUT);
      const mid: P3 = [0, 1, 2].map(i => (belt[i] + cutAt[i]) / 2) as unknown as P3;
      tube("spine", mid, run, ROBE_SPINE_W, ROBE_SPINE_D, Math.hypot(...run) / 2 / U, "fig-robe-body", ["ribcage", "pants"], { hw: (rc.halfWidth / U) * ring, hd: (rc.halfDepth / U) * ring });
      // The sash round its foot, at the belt.
      tube("sash", belt, run, ROBE_SPINE_W + SASH_OUT, ROBE_SPINE_D + SASH_OUT, SASH_HALF, "fig-sash", ["spine-near", "spine-far", "pants"]);
      // The pants, from the belt into the thighs in one piece: a rounded gray solid round the pelvis, as wide across as the hips with the thighs' bags, which is the width of
      // the spine at the belt, there, under the sash, and widens as it goes down, closing in rounded below between the legs (an ellipsoid, centred on the pelvis, tall enough
      // to meet the belt at that width: from the ellipsoid's own equation).
      const down = Math.hypot(...[0, 1, 2].map(i => belt[i] - j.pelvis[i])) / U, atBelt = (ROBE_SPINE_W + SASH_OUT) / PANTS_W, tall = (down / Math.sqrt(Math.max(0.05, 1 - atBelt * atBelt))) * U;
      pushArmor(ellipsoidPart(c, "pants", j.pelvis as P3, rc.side, rc.fwd, unit(up3), PANTS_W * U, PANTS_D * U, tall, "fig-puff"));
    } else bones("lumbar", ["pelvis", "waist"], "fig-limb", LIMB);
    bones("shoulders", ["shoulderR", "shoulderL"], shod ? "fig-limb fig-leather" : robed ? "fig-limb fig-robe" : "fig-limb", LIMB);
    // (with the chestplate, its leather underpants: the seat of them over the line of the hips)
    // (the Nomad's pants run from the belt into the thighs in one piece, so there is no hip line)
    if (!robed) bones("hips", ["hipR", "hipL"], shod ? "fig-limb fig-leather" : garbed ? "fig-limb fig-black" : "fig-limb", LIMB);
    bones("neck", ["neck", "head"], "fig-limb", LIMB);
    // The Soldier's gloves, boots, shoulder pieces and underpants: brown leather over the last half of each forearm and shin, the top of each upper
    // arm, and each thigh down to a little above the knee. They
    // take the place of that part of the limb (the limb stops where they start), rather than lying over it: drawn over it, a limb sorted nearer than
    // its glove (its upper arm toward the viewer) would hide it. Where they meet the limb, each is cut across it, as a cylinder is (`bones`' `cut`).
    for (const side of ["R", "L"] as const) {
      const j = rig.joints, along = (a: Joint, b: Joint, t: number): P3 => [0, 1, 2].map(i => j[a][i] + (j[b][i] - j[a][i]) * t) as unknown as P3;
      const [shoulder, elbow, hand3, hip, knee, foot] = (["shoulder", "elbow", "hand", "hip", "knee", "foot"] as const).map(n => `${n}${side}` as Joint);
      if (shod) {
        /** Where a limb is cut, `t` of the way along a bone: the point, and the way the bone runs. */
        const cutAt = (a: Joint, b: Joint, t: number) => ({ at: along(a, b, t), axis: [0, 1, 2].map(i => j[b][i] - j[a][i]) as unknown as P3 });
        const pad = cutAt(shoulder, elbow, PAD), cuff = cutAt(elbow, hand3, 0.5), top = cutAt(knee, foot, 0.5), hem = cutAt(hip, knee, HEM);
        bones(`pauldron${side}`, [shoulder, see(pad.at)], "fig-limb fig-leather", LIMB, 0, { end: pad });
        bones(`arm${side}`, [see(pad.at), elbow, see(cuff.at)], `fig-limb${red(side)}`, LIMB, 0, { start: pad, end: cuff });
        bones(`glove${side}`, [see(cuff.at), hand3], "fig-limb fig-leather", LIMB, 0, { start: cuff });
        bones(`pants${side}`, [hip, see(hem.at)], "fig-limb fig-leather", LIMB, 0, { end: hem });
        bones(`leg${side}`, [see(hem.at), knee, see(top.at)], `fig-limb${red(side)}`, LIMB, 0, { start: hem, end: top });
        bones(`boot${side}`, [see(top.at), foot], "fig-limb fig-leather", LIMB, 0, { start: top });
        meet(`arm${side}`, `glove${side}`, j[elbow], j[hand3]);
        meet(`arm${side}`, `pauldron${side}`, j[elbow], j[shoulder]);
        meet(`leg${side}`, `boot${side}`, j[knee], j[foot]);
        meet(`leg${side}`, `pants${side}`, j[knee], j[hip]);
      } else if (garbed) {
        // (the black runs from the hand to almost the elbow, and the whole leg: cut across the limb as a cylinder is, as the Soldier's gloves are)
        const cutAt = (a: Joint, b: Joint, t: number) => ({ at: along(a, b, t), axis: [0, 1, 2].map(i => j[b][i] - j[a][i]) as unknown as P3 });
        const cuff = cutAt(elbow, hand3, BLACK_FROM);
        bones(`arm${side}`, [shoulder, elbow, see(cuff.at)], `fig-limb${red(side)}`, LIMB, 0, { end: cuff });
        bones(`glove${side}`, [see(cuff.at), hand3], "fig-limb fig-black", LIMB, 0, { start: cuff });
        bones(`leg${side}`, [hip, knee, foot], `fig-limb fig-black${red(side)}`, LIMB);
        meet(`arm${side}`, `glove${side}`, j[elbow], j[hand3]);
      } else if (robed) {
        // The arms, wrapped; the thigh is the puffy trousers (a bag of gray cloth over the hip to the knee, gathered at the knee by a band), so only the shin shows
        // as a limb, wrapped too.
        bones(`arm${side}`, [shoulder, elbow, hand3], `fig-limb${red(side)}`, LIMB);
        bones(`leg${side}`, [knee, foot], `fig-limb${red(side)}`, LIMB);
        wraps(`upper${side}`, j[shoulder] as P3, j[elbow] as P3, `arm${side}`, side === "R" ? 1 : 2);
        wraps(`fore${side}`, j[elbow] as P3, j[hand3] as P3, `arm${side}`, side === "R" ? 3 : 4);
        wraps(`shin${side}`, j[knee] as P3, j[foot] as P3, `leg${side}`, side === "R" ? 5 : 6);
        const thigh = [0, 1, 2].map(i => j[knee][i] - j[hip][i]) as unknown as P3, len = Math.hypot(...thigh), u = unit(thigh), [pp, qq] = perpTo(u);
        // (the bag reaches up past the hip, `PUFF_UP`, to finish the silhouette at the pelvis, and a little past the knee: the ellipsoid is longer and its middle moved up)
        const mid: P3 = [0, 1, 2].map(i => (j[hip][i] + j[knee][i]) / 2 - u[i] * ((PUFF_UP - PUFF_PAST) / 2) * U) as unknown as P3;
        pushArmor(ellipsoidPart(c, `puff${side}`, mid, pp, qq, u, PUFF_R * U, PUFF_R * U, len / 2 + ((PUFF_UP + PUFF_PAST) / 2) * U, "fig-puff"));
        tube(`knee${side}`, j[knee] as P3, thigh, KNEE_BAND_R, KNEE_BAND_R, KNEE_BAND_HALF, "fig-knee-band", [`puff${side}`, `leg${side}`]);
      } else {
        bones(`arm${side}`, [shoulder, elbow, hand3], `fig-limb${red(side)}`, LIMB);
        bones(`leg${side}`, [hip, knee, foot], `fig-limb${red(side)}`, LIMB);
      }
    }
    // The player's torso: its armor over the ribcage (the bronze chestplate, the black garb, the white robe, or plain armor), and no ribs showing.
    const chest = !gear ? undefined
      : gear.armorItem === "bronze-chestplate" ? "fig-chest-bronze" : gear.armorItem === "garb" ? "fig-chest-garb" : gear.armorItem === "robe" ? "fig-chest-robe"
      : gear.armor !== "none" ? "fig-armor-fill" : "fig-ribcage";
    parts.push(ribcagePart(c, rig, gear ? { cls: chest, ribs: false, sternum: shod ? "fig-chest-line" : undefined } : {}));
    // The Nomad's collar: a V on the front of the chest, from high on each side of the neck down to a point on the breastbone, on the ribcage's surface (only what
    // faces the viewer shows), laid just over it.
    if (robed) {
      const rc = rcBody;
      const onRib = (th: number, upTo: number): { at: P3; normal: P3 } => {
        const r = Math.sqrt(Math.max(0, 1 - upTo * upTo));
        return {
          at: [0, 1, 2].map(k => rc.centre[k] + rc.side[k] * rc.halfWidth * r * Math.sin(th) + rc.fwd[k] * rc.halfDepth * r * Math.cos(th) + rc.up[k] * rc.halfHeight * upTo) as unknown as P3,
          normal: [0, 1, 2].map(k => (rc.side[k] * r * Math.sin(th)) / rc.halfWidth + (rc.fwd[k] * r * Math.cos(th)) / rc.halfDepth + (rc.up[k] * upTo) / rc.halfHeight) as unknown as P3,
        };
      };
      for (const sgn of [-1, 1]) {
        const run = Array.from({ length: 9 }, (_, i) => { const t = i / 8, p = onRib(sgn * COLLAR_SPREAD * (1 - t), COLLAR_TOP + (COLLAR_APEX - COLLAR_TOP) * t); return dotP(p.normal, look3At(p.at)) < 0 ? see(p.at) : null; });
        const shown = run.filter((q): q is Seen => q !== null);
        if (shown.length < 2) continue;
        const part = { key: `collar${sgn}`, depth: 0, node: <polyline key={`collar${sgn}`} points={shown.map(q => `${X(q)},${Y(q)}`).join(" ")} className="fig-collar" /> };
        parts.push(part);
        overlays.push({ part, over: "ribcage" });
      }
    }
    // The chestplate's abs, on the front of the bronze below the ribcage: one line down its middle, crossed by two lines round it, a darker bronze.
    if (shod) {
      const j = rig.joints, axis = unit([0, 1, 2].map(i => j.waist[i] - j.pelvis[i]) as unknown as P3), fwd0 = way([0, 0, 1]);
      const k = fwd0[0] * axis[0] + fwd0[1] * axis[1] + fwd0[2] * axis[2];
      const front = unit([0, 1, 2].map(i => fwd0[i] - axis[i] * k) as unknown as P3), side = cross(axis, front), r = (ABS / 2) * U;
      /** A point on its surface: `t` of the way up from the pelvis, `a` radians round from the middle of its front. */
      const on = (t: number, a: number): P3 => [0, 1, 2].map(i => j.pelvis[i] + (j.waist[i] - j.pelvis[i]) * t + (front[i] * Math.cos(a) + side[i] * Math.sin(a)) * r) as unknown as P3;
      const middle = (t: number) => see([0, 1, 2].map(i => j.pelvis[i] + (j.waist[i] - j.pelvis[i]) * t) as unknown as P3).depth;
      /** `t` of the way up the bronze, as a share of the way up from the pelvis to the waist. */
      const up = (t: number) => ARMOR_FROM + (1 - ARMOR_FROM) * t;
      // (only the near side of it shows: each line is cut to the points nearer than the middle of the spine there)
      const shown = (pts: [number, P3][]) => pts.map(([t, p]) => ({ t, q: see(p) })).filter(({ t, q }) => q.depth <= middle(t) + 1e-4).map(({ q }) => q);
      const lines = [
        shown(Array.from({ length: 7 }, (_, i) => { const t = up(0.1 + (0.8 * i) / 6); return [t, on(t, 0)] as [number, P3]; })),
        ...[0.32, 0.62].map(t => shown(Array.from({ length: 9 }, (_, i) => [up(t), on(up(t), -0.95 + (1.9 * i) / 8)] as [number, P3]))),
      ].filter(l => l.length >= 2);
      const lumbar = parts.find(x => x.key === "lumbar");
      if (lines.length && lumbar) parts.push({ key: "abs", depth: lumbar.depth - 0.0005, node: <g key="abs">{lines.map((l, i) => <polyline key={i} points={l.map(p => `${X(p)},${Y(p)}`).join(" ")} className="fig-chest-line" />)}</g> });
      // Its skirt: six strips of leather hanging from round the bottom edge of the bronze, evenly round the body (one in the middle of its front, one in the
      // middle of its back, two at each side), straight down however the body leans, to the middle of the thighs, flaring out a little as they hang.
      // Each is a piece cut from a cylinder round the waist (as the helm's plates are from one round the helm): curved across its width with the waist,
      // drawn in slices down it, each sorted by its own depth and showing the side that faces the viewer (its outside, or its inside a shade darker).
      // At the top they meet edge to edge (each a sixth of the way round, and a hair more), one band round the waist; lower down, flaring out and
      // narrowing a little, they part.
      const hang = way([0, -1, 0]), base: P3 = [0, 1, 2].map(i => j.pelvis[i] + (j.waist[i] - j.pelvis[i]) * ARMOR_FROM) as unknown as P3;
      const d0 = see(base).depth, look3 = unit([0, 1, 2].map(i => see(plus(base, [0, 1, 2].map(k => (k === i ? 0.01 : 0)) as unknown as P3)).depth - d0) as unknown as P3);
      const dot = (p: P3, q: P3) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
      /** Round the bottom of the bronze, `th` radians from the middle of its front: the way there (with the spine), and the way out from it, level. */
      const roundAt = (th: number): P3 => [0, 1, 2].map(i => front[i] * Math.cos(th) + side[i] * Math.sin(th)) as unknown as P3;
      const outAt = (th: number): P3 => { const v = roundAt(th); return unit(plus(v, hang, -dot(v, hang))); };
      // (round a waist a little wider than the bronze, so the pelvis never peeks out from under it)
      const rs = r + SKIRT_OUT * U, TOP = 0.4, w = ((2 * Math.PI * (ABS / 2 + SKIRT_OUT + TOP)) / 6) * 1.06, SLICES = 5;
      // (how far down, how far out, how wide: at its top, halfway, its foot)
      // (each narrowing very slightly as it hangs, so the gaps between them show)
      const rows: [number, number, number][] = [[-1, TOP, w], [STRIP_LEN * 0.5, 1.2, w * 0.97], [STRIP_LEN, 2.2, w * 0.94]];
      for (const [n, deg] of [0, 60, 120, 180, 240, 300].entries()) {
        /** A point on it: `down` below the bronze's edge, `flare` out from it, `across` along the waist's curve from its middle (figure units). */
        const at3 = (down: number, flare: number, across: number): P3 => {
          const th = (deg * Math.PI) / 180 + (across * U) / (rs + flare * U);
          return plus(plus(plus(base, roundAt(th), rs), hang, down * U), outAt(th), flare * U);
        };
        for (let i = 0; i < SLICES; i++) {
          const col = (k: number) => rows.map(([d, fl, wd]) => at3(d, fl, -wd / 2 + (wd * k) / SLICES));
          const q = [...col(i), ...col(i + 1).reverse()], ps = q.map(see);
          const outside = dot(outAt((deg * Math.PI) / 180 + ((i + 0.5) / SLICES - 0.5) * (w * U) / rs), look3) < 0;
          const strip = {
            key: `strip${n}-${i}`, depth: ps.reduce((m, p) => m + p.depth, 0) / ps.length,
            node: cloth("skirt", [X(see(base)), Y(see(base))], 1, `strip${n}-${i}`, <polygon points={ps.map(p => `${X(p)},${Y(p)}`).join(" ")} className={outside ? "fig-strip" : "fig-strip fig-strip-inside"} />, hanging(base, "waist", "pelvis")),
          };
          parts.push(strip);
          if (outside) armorNear.push(strip);
        }
      }
    }
    // The Hunter's cloak: a real cylinder with the ribcage's own round (wide across, shallow front to back), from the ribcage's widest ring straight down
    // however the body leans, to a little past the pelvis, in the garb's own colour. It is two smooth shapes, each one piece with no seams: the near wall
    // (the half that faces the viewer) and the far one (seen through the open ends), each between the curves of the two rings, so the body parts sort
    // in between them.
    if (garbed) {
      const j = rig.joints, rc = ribcageOf(rig), hang = way([0, -1, 0]), top: P3 = [...rc.centre] as P3;
      const dot = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      const toPelvis = dot([0, 1, 2].map(i => j.pelvis[i] - top[i]) as unknown as P3, hang), drop = toPelvis + CLOAK_PAST * U;
      // (the ribcage's own front and side, turned square to the way the cloak hangs)
      const front = unit(plus(rc.fwd, hang, -dot(rc.fwd, hang))), side = cross(hang, front), W = rc.halfWidth, D = rc.halfDepth;
      const d0 = see(top).depth, look3 = unit([0, 1, 2].map(i => see(plus(top, [0, 1, 2].map(k => (k === i ? 0.01 : 0)) as unknown as P3)).depth - d0) as unknown as P3);
      // (it widens a little as it goes down, `CLOAK_FLARE` of its width for each figure unit, so the thighs stay clear of it)
      const ring3 = (a: number, down: number): P3 => { const k = 1 + (CLOAK_FLARE * down) / U; return plus(plus(plus(top, front, D * k * Math.cos(a)), side, W * k * Math.sin(a)), hang, down); };
      const ring = (a: number, down: number) => see(ring3(a, down));
      // (the angle round it that points at the viewer, the wall's normal there being along (cos / D, sin / W): the near wall is the half either side of the opposite one)
      const toward = Math.atan2(dot(look3, side) / W, dot(look3, front) / D);
      // Every piece of the cloak is the outside of a cylinder, and the body (the ribcage, the spine, the pelvis, the legs) is inside it: a piece whose outside
      // faces the viewer is drawn over all of them, one that faces away under them. So each piece is either near or far, and its depth is its own surface's,
      // moved only as far as it must be to be on its side of those parts (done once all of them are placed, `settleCloak`).
      const cloak: { part: { depth: number }; near: boolean }[] = [];
      const piece = (key: string, ps: Seen[], depth: number, near: boolean, hangs?: [number, number]) => {
        const polygon = <polygon key={key} points={ps.map(q => `${X(q)},${Y(q)}`).join(" ")} className="fig-hunter-cloak" />;
        const part = { key, depth, node: hangs ? cloth("tail", hangs, 1, key, polygon, tailAngles) : polygon };
        parts.push(part);
        if (near) armorNear.push(part);
        cloak.push({ part, near });
      };
      const wall = (from: number, key: string, near: boolean) => {
        const angles = Array.from({ length: CLOAK_STEPS + 1 }, (_, i) => from + (i / CLOAK_STEPS) * Math.PI);
        piece(key, [...angles.map(a => ring(a, 0)), ...angles.map(a => ring(a, drop)).reverse()], ring(from + Math.PI / 2, drop / 2).depth, near);
      };
      wall(toward + Math.PI / 2, "cloak-near", true);
      wall(toward - Math.PI / 2, "cloak-far", false);
      // The tails: the cylinder goes on below its hem as two triangles, a tailcoat's, side by side at the back a hair apart. Each is a piece of the cylinder's
      // own surface (so it keeps its curve, and the legs inside it are always inside): its base the hem's arc, from the back all the way round to near the
      // front, its two other edges running down to a point below the back (`TAIL_APEX` either side of its middle). Each is cut where its surface turns from
      // facing the viewer to facing away (the silhouette), by a line straight down the cylinder, into at most two pieces, one near and one far: the near one
      // is over the legs and the far one under them, whatever the angle.
      const turn = (x: number) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const hemD = drop - U, endD = toPelvis + TAIL_END * U;
      // (the tails hang from the back of the hem, in the middle of it)
      const tailHangs = ring(Math.PI, hemD), tailPivot: [number, number] = [X(tailHangs), Y(tailHangs)], tailAngles = hanging(ring3(Math.PI, hemD), "waist", "pelvis");
      for (const sign of [1, -1]) {
        const a0 = Math.PI + sign * TAIL_FROM, a1 = Math.PI + sign * TAIL_TO, ap = Math.PI + sign * TAIL_APEX, span = a1 - a0;
        const at = (u: number) => a0 + span * u;
        /** How far down its lower edge is at `a` round the cylinder: straight lines in (angle, depth) from each end of its base to the point. */
        const lowerAt = (a: number) => (sign * (a - ap) <= 0 ? hemD + ((endD - hemD) * (a - a0)) / (ap - a0) : endD + ((hemD - endD) * (a - ap)) / (a1 - ap));
        // (where along it, from 0 to 1, the silhouette crosses its base, if it does)
        const cuts = [toward + Math.PI / 2, toward - Math.PI / 2].map(edge => (sign > 0 ? turn(edge - a0) : -turn(a0 - edge)) / span).filter(u => u > 1e-4 && u < 1 - 1e-4).sort((m, n) => m - n);
        const edges = [0, ...cuts, 1];
        for (let n = 0; n + 1 < edges.length; n++) {
          const u0 = edges[n], u1 = edges[n + 1], steps = Math.max(8, Math.ceil((CLOAK_STEPS * Math.abs(span) * (u1 - u0)) / Math.PI));
          const angles = Array.from({ length: steps + 1 }, (_, i) => at(u0 + ((u1 - u0) * i) / steps));
          // (its point is a corner of the lower edge: put in if the piece has it)
          if ((ap - at(u0)) * (ap - at(u1)) < 0) angles.splice(angles.findIndex(x => sign * (x - ap) > 0), 0, ap);
          const middle = at((u0 + u1) / 2), near = Math.cos(middle - toward) < 0;
          const ps = [...angles.map(x => ring(x, hemD)), ...angles.map(x => ring(x, lowerAt(x))).reverse()];
          // (the depth of a point on its own surface, halfway down it)
          piece(`cloak-tail${sign}-${n}`, ps, ring(middle, (hemD + lowerAt(middle)) / 2).depth, near, tailPivot);
        }
      }
      // The coat's front edge: a black line from where the tail on his left starts at the front, straight up the cloak and on up the ribcage to the shoulder line,
      // on the surface (the cloak's, then the ribcage's: both worked out on the same front and side, so it does not cross over). From the shoulder line it goes on,
      // up and a little away from the ribcage, to the right side of his neck. Only seen from the front.
      const shoulderMid: P3 = [0, 1, 2].map(i => (j.shoulderR[i] + j.shoulderL[i]) / 2) as unknown as P3;
      const shoulderUp = Math.min(0.95, dot([0, 1, 2].map(i => shoulderMid[i] - rc.centre[i]) as unknown as P3, rc.up as unknown as P3) / rc.halfHeight);
      const edgeParts: { depth: number }[] = [];
      const th = Math.PI - TAIL_TO; // (the tail's front start on his left: `side` points to his left, so a positive angle is that side)
      if (Math.cos(th - toward) < 0) {
        const cloakUp = Array.from({ length: 9 }, (_, i) => ring(th, drop * (1 - i / 8))); // (from the hem itself)
        const onChest = (upTo: number, lift: number): P3 => {
          const r = Math.sqrt(Math.max(0, 1 - upTo * upTo));
          return [0, 1, 2].map(k => rc.centre[k] + side[k] * rc.halfWidth * r * Math.sin(th) + front[k] * (rc.halfDepth * r * Math.cos(th) + lift) + rc.up[k] * rc.halfHeight * upTo) as unknown as P3;
        };
        const chestUp = Array.from({ length: 9 }, (_, i) => see(onChest((shoulderUp * (i + 1)) / 9, 0)));
        // (from the end of the line, up and a little away from the ribcage, to the right side of the neck, which is `rc.side`'s way)
        const corner = (across: number): P3 => [0, 1, 2].map(k => j.neck[k] + (j.head[k] - j.neck[k]) * NECK_UP + rc.side[k] * across * U + front[k] * FLAP_LIFT * U) as unknown as P3;
        const start = onChest(shoulderUp, 0), tip = corner(NECK_HALF);
        const edge = Array.from({ length: 7 }, (_, i) => { const t = i / 6; return see([0, 1, 2].map(k => start[k] * (1 - t) + tip[k] * t + front[k] * FLAP_LIFT * U * t * (1 - t)) as unknown as P3); });
        const key = "coat-edge", line = [...cloakUp, ...chestUp, ...edge];
        const part = { key, depth: 0, node: <polyline key={key} points={line.map(q => `${X(q)},${Y(q)}`).join(" ")} className="fig-coat-line" /> };
        parts.push(part);
        edgeParts.push(part);
      }
      settleCloak = () => {
        const inside = ["ribcage", "hips", "lumbar", "lumbar-low", "legR", "legL"].map(k => parts.find(x => x.key === k)?.depth).filter((d): d is number => d !== undefined);
        for (const { part, near } of cloak) part.depth = near ? Math.min(part.depth, ...inside) - 0.0005 : Math.max(part.depth, ...inside) + 0.0005;
        // (just over the cloak and the ribcage it lies on)
        const under = Math.min(...cloak.filter(c => c.near).map(c => c.part.depth), ...(parts.filter(x => x.key === "ribcage").map(x => x.depth)));
        for (const line of edgeParts) line.depth = under - 0.001;
      };
    }
  } else {
    // Sealed whole in wax: only the shell shows, over every part of it (the chest's thicker, as wide as the ribcage).
    for (const side of ["R", "L"] as const) {
      bones(`shell-arm${side}`, [`shoulder${side}`, `elbow${side}`, `hand${side}`] as Joint[], "fig-wax-shell", SHELL);
      bones(`shell-leg${side}`, [`hip${side}`, `knee${side}`, `foot${side}`] as Joint[], "fig-wax-shell", SHELL);
    }
    bones("shell-lumbar", ["pelvis", "waist"], "fig-wax-shell", SHELL);
    bones("shell-ribs", ["waist", "neck"], "fig-wax-shell", SHELL + 4);
    bones("shell-shoulders", ["shoulderR", "shoulderL"], "fig-wax-shell", SHELL);
    bones("shell-hips", ["hipR", "hipL"], "fig-wax-shell", SHELL);
    bones("shell-neck", ["neck", "head"], "fig-wax-shell", SHELL);
  }

  // The head: a ball. Bare, two pale eyes on the face, turned the way it looks (the flat pose's `gaze`: its eyes lowered, or raised); under a hood, the
  // hood's round, the shadow of its opening on the front and its point hanging down behind; sealed, a lump of wax.
  const head = seen.head, kh = scaleAt(head), headAt = rig.joints.head;
  const raw = ALL_POSES[pose];
  const down = Math.max(-0.9, Math.min(0.9, (raw.gaze ?? 0) / HEAD_R));
  const look: P3 = rig.gaze ?? [0, -down, Math.sqrt(1 - down * down)];
  /** The two tired eyes on the head's face, turned the way it looks: half moons lying on the head's surface, as the ribs lie on the ribcage (the lid a flat line across the top, the round half below). Each point is laid back onto the ball, so they turn and narrow with the head. */
  const eyeShapes = (depth: number) => {
    // (the head's own up: straight up, or along the floor toward the crown if it lies there)
    const vert = way([0, 1, 0]);
    return [-1, 1].flatMap(s => {
      const a = s * EYE_APART, ca = Math.cos(a), sa = Math.sin(a);
      // (turned round the head's up from where it looks)
      const k = vert[0] * look[0] + vert[1] * look[1] + vert[2] * look[2], vx = cross(vert, look);
      const dir: P3 = [0, 1, 2].map(i => look[i] * ca + vx[i] * sa + vert[i] * k * (1 - ca)) as unknown as P3;
      const eye: Seen = see(plus(headAt, dir, HEAD_R * U));
      if (eye.depth >= head.depth) return [];
      const side = unit(cross(vert, dir)), upE = unit(cross(dir, side)), r = EYE_R / HEAD_R;
      const onHead = (x: number, y: number): Seen => see(plus(headAt, unit(plus(plus(dir, side, x * r), upE, y * r)), HEAD_R * U));
      const rim = Array.from({ length: 11 }, (_, i) => (Math.PI * i) / 10).map(t => onHead(Math.cos(t), -Math.sin(t)));
      return [{ key: `eye${s}`, depth, node: <polygon key={`eye${s}`} points={rim.map(p => `${X(p)},${Y(p)}`).join(" ")} className="fig-eyes" /> }];
    });
  };
  if (encased) {
    parts.push({ key: "head", depth: head.depth - 0.01, node: <ellipse key="head" cx={X(head)} cy={Y(head)} rx={10.5 * kh} ry={11 * kh} className="fig-wax-head" /> });
  } else if (hooded) {
    parts.push({ key: "head", depth: head.depth - 0.01, node: <circle key="head" cx={X(head)} cy={Y(head)} r={HOOD_R * kh} className={blackHood ? "fig-hood fig-hood-black" : "fig-hood"} /> });
    // Its point: a cone from the back of the hood, up and back, its tip hanging behind the head (as the flat hood's; the black hood's droops down instead).
    // (the black hood's droops: down the back of the neck, from nearer the neck; the wardens' still stands up and back)
    const baseAt = plus(headAt, way(blackHood ? [0, -2.4 * U, -5.6 * U] : [0, 2.9 * U, -5.1 * U])), tipAt = plus(headAt, way(blackHood ? [0, -10.4 * U, -9.2 * U] : [0, 10.2 * U, -10.4 * U]));
    const axis = unit([tipAt[0] - baseAt[0], tipAt[1] - baseAt[1], tipAt[2] - baseAt[2]]), across: P3 = way([1, 0, 0]), other = unit(cross(axis, across));
    const rim = Array.from({ length: 16 }, (_, i) => (i / 16) * Math.PI * 2).map(a => see(plus(plus(baseAt, across, Math.cos(a) * 4.6 * U), other, Math.sin(a) * 4.6 * U)));
    const tip = see(tipAt), outline = hull([...rim, tip].map(p => [X(p), Y(p)] as [number, number]));
    parts.push({ key: "hood-point", depth: (see(baseAt).depth + tip.depth) / 2, node: <polygon key="hood-point" points={outline.map(p => p.join(",")).join(" ")} className={blackHood ? "fig-hood fig-hood-black" : "fig-hood"} /> });
    // The opening, where the face is in shadow: a ring on the front of the hood, round the way it looks. The black hood's is a circle on the hood's
    // round that starts at the brows and opens all the way down to the neck (`axis` tipped down from where it looks, `half` the circle's radius, in
    // radians); the wardens' is a smaller ring round the face, a little taller than wide, as the flat hood's.
    const f = unit(look), sideA = unit(cross(way([0, 1, 0]), f)), upA = unit(cross(f, sideA));
    const tilt = blackHood ? OPENING_TIP : 0, half = blackHood ? OPENING_HALF : 0.62, tall = blackHood ? 1 : 1.25;
    const gaze3 = unit(plus(f.map(v => v * Math.cos(tilt)) as unknown as P3, upA, -Math.sin(tilt)));
    const sideC = unit(cross(way([0, 1, 0]), gaze3)), upC = unit(cross(gaze3, sideC));
    const centre = see(plus(headAt, gaze3, HOOD_R * U));
    if (centre.depth < head.depth) {
      const ring = Array.from({ length: 72 }, (_, i) => (i / 72) * Math.PI * 2).map(a => {
        const d = plus(plus(gaze3, sideC, Math.tan(half) * Math.cos(a)), upC, Math.tan(half) * tall * Math.sin(a));
        return see(plus(headAt, unit(d), HOOD_R * U));
      });
      parts.push({ key: "hood-dark", depth: head.depth - 0.012, node: <polygon key="hood-dark" points={ring.map(p => `${X(p)},${Y(p)}`).join(" ")} className="fig-hood-dark" /> });
      // The black hood's opening is a real one: the hood's pitch-black inside, and the face sitting back in it, its eyes showing, the dark left as a rim
      // round it (the face is cut to the opening, a little smaller than it).
      if (blackHood) {
        const mid = ring.reduce((n, p) => [n[0] + X(p) / ring.length, n[1] + Y(p) / ring.length], [0, 0]);
        const inset = ring.map(p => `${mid[0] + (X(p) - mid[0]) * 0.84},${mid[1] + (Y(p) - mid[1]) * 0.84}`).join(" ");
        parts.push({
          key: "hood-face", depth: head.depth - 0.0125,
          node: (
            <g key="hood-face">
              <clipPath id={openingId}><polygon points={inset} /></clipPath>
              <g clipPath={`url(#${openingId})`}>
                <circle cx={X(head)} cy={Y(head)} r={HEAD_R * kh} className="fig-head" />
                {eyeShapes(0).map(e => e.node)}
              </g>
            </g>
          ),
        });
      }
    }
  } else {
    // (the player's Desert Mask: cloth wound round the whole head, the eyes showing through)
    parts.push({ key: "head", depth: head.depth - 0.01, node: <circle key="head" cx={X(head)} cy={Y(head)} r={(masked ? MASK_R : HEAD_R) * kh} className={masked ? "fig-head fig-mask" : "fig-head"} /> });
    if (masked) {
      // The Desert Mask: cloth wound round the whole head in a few turns, each one a little tilted, a real opening cut across the eyes (the face beneath shows through it,
      // its eyes drawn in it), and a knotted end hanging behind.
      const f = unit(look), vert = way([0, 1, 0]), sideA = unit(cross(vert, f)), upA = unit(cross(f, sideA)), along = unit(cross(vert, sideA)), R = MASK_R * U;
      const onMask = (dir: P3): Seen => see(plus(headAt, unit(dir), R));
      if (see(plus(headAt, f, R)).depth < head.depth) {
        const hole = Array.from({ length: 48 }, (_, i) => (i / 48) * Math.PI * 2).map(a => onMask(plus(plus(f, sideA, Math.tan(MASK_HOLE_W) * Math.cos(a)), upA, Math.tan(MASK_HOLE_H) * Math.sin(a))));
        parts.push({ key: "mask-hole", depth: head.depth - 0.0102, node: <polygon key="mask-hole" points={hole.map(q => `${X(q)},${Y(q)}`).join(" ")} className="fig-mask-hole" /> });
      }
      // (the turns: rings round the head, above the opening and twice below it, each swaying a little as it goes round; only the half that faces the viewer shows)
      const lkHead = look3At(headAt);
      braidFromBehind = dotP(lkHead, way([0, 0, 1])) > 0;
      [[0.62, 0], [-0.5, 1.7], [-0.95, 3.1]].forEach(([e0, phase], n) => {
        const runs: Seen[][] = [[]];
        for (let i = 0; i <= 72; i++) {
          const a = (i / 72) * Math.PI * 2, e = e0 + 0.14 * Math.sin(2 * a + phase);
          const dir = plus(plus(plus([0, 0, 0], vert, Math.sin(e)), sideA, Math.cos(a) * Math.cos(e)), along, Math.sin(a) * Math.cos(e));
          if (dotP(dir, lkHead) < 0) runs[runs.length - 1].push(onMask(dir)); else if (runs[runs.length - 1].length) runs.push([]);
        }
        runs.filter(r => r.length >= 2).forEach((r, k) => parts.push({ key: `mask-wrap${n}-${k}`, depth: head.depth - 0.0102, node: <polyline key={`mask-wrap${n}-${k}`} points={r.map(q => `${X(q)},${Y(q)}`).join(" ")} className="fig-mask-wrap" /> }));
      });
      // (the knotted end: a knot at the back of the head and a braid of the wrappings hanging straight down from it, close twists one after another, each a moon
      // (a crescent) leaning down and out to its own side of the braid's middle, the left ones to the left and the right ones to the right, narrowing and
      // thinning as it goes, and ending in two pairs of moons that splay apart, a split tail. The braid is sorted as one thing, by where it hangs from, so it is
      // over or under the body as a whole; within it, each moon is over every one below it in the chain.)
      const baseAt = plus(headAt, way([0, -0.8 * U, -MASK_R * 0.8 * U])), downWay = way([0, -1, 0]), sideWay = way([1, 0, 0]), braidDepth = see(baseAt).depth;
      // (the braid hangs from its knot, and swings about it)
      const knotPivot: [number, number] = [X(see(baseAt)), Y(see(baseAt))], braidAngles = hanging(baseAt, "head", "neck");
      const twists = Array.from({ length: BRAID_LUMPS }, (_, k) => ({ sgn: k % 2 ? 1 : -1, down: 2.4 + k * BRAID_STEP, side: BRAID_SPREAD * (1 - (0.5 * k) / BRAID_LUMPS), size: 1 - (0.55 * k) / BRAID_LUMPS, lean: 0.9 }));
      twists.forEach(({ sgn, down, side, size, lean }, k) => {
        const at = plus(plus(baseAt, downWay, down * U), sideWay, sgn * side * U);
        const here = see(at), below = see(plus(at, downWay, U)), out = see(plus(at, sideWay, sgn * U));
        // (down and to its side, on the screen)
        const dx = X(below) - X(here) + lean * (X(out) - X(here)), dy = Y(below) - Y(here) + lean * (Y(out) - Y(here)), dl = Math.hypot(dx, dy) || 1;
        const R = BRAID_R * size * scaleAt(here), off = R * 0.6, th = Math.atan2(dy, dx);
        const alpha = Math.acos(-off / (2 * R)), psi = Math.atan2(R * Math.sin(alpha), R * Math.cos(alpha) + off);
        const cx = X(here), cy = Y(here), ux = dx / dl, uy = dy / dl;
        // (the outer arc, bulging the way it leans; then back along the inner one, whose circle is set back from it: a crescent)
        const outer = Array.from({ length: 13 }, (_, i) => { const f = th - alpha + (2 * alpha * i) / 12; return [cx + R * Math.cos(f), cy + R * Math.sin(f)]; });
        const inner = Array.from({ length: 13 }, (_, i) => { const f = th + psi - (2 * psi * i) / 12; return [cx - off * ux + R * Math.cos(f), cy - off * uy + R * Math.sin(f)]; });
        parts.push({ key: `mask-braid${k}`, depth: braidDepth + k * 0.00002, node: cloth("braid", knotPivot, 0.35 + (0.65 * k) / twists.length, `mask-braid${k}`, <polygon points={[...outer, ...inner].map(q => q.join(",")).join(" ")} className="fig-mask-tail" />, braidAngles) });
      });
      // The end of the braid: a ball, tied, as it starts from a knot at the head; and from it two bananas, long moons hanging down and curving out to each side,
      // each pointed at both ends and widest in the middle.
      const endAt = plus(baseAt, downWay, (2.4 + BRAID_LUMPS * BRAID_STEP) * U), endScreen = see(endAt);
      parts.push({ key: "mask-braid-end", depth: braidDepth + twists.length * 0.00002, node: cloth("braid", knotPivot, 1, "mask-braid-end", <circle cx={X(endScreen)} cy={Y(endScreen)} r={BRAID_END_R * scaleAt(endScreen)} className="fig-mask-tail" />, braidAngles) });
      [-1, 1].forEach((sgn, n) => {
        const spine = Array.from({ length: 15 }, (_, i) => {
          const t = i / 14, pt = see(plus(plus(endAt, downWay, BANANA_LEN * t * U), sideWay, sgn * BANANA_OUT * Math.sin((Math.PI / 2) * t) * U));
          return { x: X(pt), y: Y(pt), t };
        });
        const half = (BANANA_W * scaleAt(endScreen)) / 2;
        const sides = spine.map((q, i) => {
          const a = spine[Math.max(0, i - 1)], b = spine[Math.min(spine.length - 1, i + 1)], dx = b.x - a.x, dy = b.y - a.y, dl = Math.hypot(dx, dy) || 1, w = half * Math.sin(Math.PI * q.t) ** 0.8;
          return { l: [q.x - (dy / dl) * w, q.y + (dx / dl) * w], r: [q.x + (dy / dl) * w, q.y - (dx / dl) * w] };
        });
        const outline = [...sides.map(q => q.l), ...sides.map(q => q.r).reverse()];
        parts.push({ key: `mask-banana${n}`, depth: braidDepth + (twists.length + 1 + n) * 0.00002, node: cloth("braid", knotPivot, 1.15, `mask-banana${n}`, <polygon points={outline.map(q => q.join(",")).join(" ")} className="fig-mask-tail" />, braidAngles) });
      });
      ball("mask-knot", baseAt, 2.5, "fig-mask-tail");
    }
    // A helm (the player's bronze helm, or the plain helmet of heavy armor): a dome over the crown down to the brow, the bronze one with plates
    // hanging over its ears and the back of its neck.
    const helm = gear?.headItem === "helm" ? "fig-helm-bronze" : gear && !gear.headItem && !gear.armorItem && gear.armor === "heavy" ? "fig-armor-fill" : undefined;
    if (helm) {
      const up = way([0, 1, 0]), fwd = way([0, 0, 1]), HR = HEAD_R + 1.1;
      // The dome is the upper half of a sphere (its centre `C`, a little below the head's), and only its outer surface is ever seen: from below, the
      // inside of it is where the head is. The part of the outer surface that faces the viewer is bounded by two half circles of that sphere, meeting
      // at the two ends of the rim seen side on: the near half of the rim, and the half of the sphere's outline that is above the rim. (From right
      // above, that is the whole dome; from right below, nothing.)
      const C = plus(headAt, up, -0.1 * HR * U), R = HR * U;
      // (the way the viewer looks, in body space: where depth grows fastest)
      const d0 = see(C).depth, look3 = unit([0, 1, 2].map(i => see(plus(C, [0, 1, 2].map(k => (k === i ? 0.01 : 0)) as unknown as P3)).depth - d0) as unknown as P3);
      const dot3 = (p: P3, q: P3) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
      const onSphere = (v: P3) => see(plus(C, v, R));
      const ring = (a: P3, b: P3, t0: number, t1: number) => Array.from({ length: 33 }, (_, i) => { const t = t0 + ((t1 - t0) * i) / 32; return onSphere(plus(plus([0, 0, 0], a, Math.cos(t)), b, Math.sin(t))); });
      const facing = dot3(up, look3);
      let shell: Seen[] = [];
      if (facing < -0.999) shell = ring(...across2(look3), 0, 2 * Math.PI);
      else if (facing < 0.999) {
        const n = unit(cross(up, look3)), toward = unit(plus(look3, up, -dot3(look3, up)).map(x => -x) as unknown as P3), over = unit(plus(up, look3, -facing));
        // (the near half of the rim, from one side-on end to the other; then back over the top, along the sphere's outline)
        shell = [...ring(n, toward, 0, Math.PI), ...ring(over, n, -Math.PI / 2, Math.PI / 2).slice(1, -1)];
      }
      if (shell.length) parts.push({ key: "helm", depth: head.depth - 0.013, node: <polygon key="helm" points={shell.map(p => `${X(p)},${Y(p)}`).join(" ")} className={helm} /> });
      if (gear?.headItem === "helm") {
        // Its flaps, bronze plates: one over each ear, a little forward, hanging from a little below the rim (a gap between them and it), and a longer
        // one over the back of the neck, joined to the rim, broad there and narrowing as it hangs; gaps between them. Each is a thin plate with no thickness, curved across its width with the rim (a strip of a
        // cylinder round the helm), so one seen side on is edge on; they hang down the head, flaring out a little.
        const right = cross(up, fwd);
        for (const flap of HELM_FLAPS) {
          /** A point on it: `down` below the top, `flare` out past the rim, `across` along the rim's curve from its middle (figure units). */
          const at3 = (down: number, flare: number, across: number): P3 => {
            const round = R + flare * U, a = (flap.deg * Math.PI) / 180 + (across * U) / round;
            return plus(plus(plus(C, fwd, Math.cos(a) * round), right, Math.sin(a) * round), up, -(flap.gap + down) * U);
          };
          // It is a piece cut from that cylinder, drawn as one: in narrow slices down it, side by side across its curve, each sorted by its own depth and
          // showing the side of the plate that faces the viewer (its outside in bronze, its inside darker). Seen side on, part of its outside and part
          // of its inside show, as they would. (One joined to the rim starts right on it; one below it, a little out from it.)
          const SLICES = 12, topOut = flap.gap ? 0.2 : 0;
          const topAt = (i: number) => at3(0, topOut, -flap.top / 2 + (flap.top * i) / SLICES), footAt = (i: number) => at3(flap.len, 1, -flap.foot / 2 + (flap.foot * i) / SLICES);
          for (let i = 0; i < SLICES; i++) {
            const q = [topAt(i), topAt(i + 1), footAt(i + 1), footAt(i)];
            // (its way out: from the helm's axis out through the middle of the slice, level)
            const m = [0, 1, 2].map(k => (q[0][k] + q[1][k] + q[2][k] + q[3][k]) / 4 - C[k]) as unknown as P3, outWay = plus(m, up, -dot3(m, up));
            const outside = dot3(outWay, look3) < 0, ps = q.map(see);
            parts.push({
              key: `flap-${flap.deg}-${i}`, depth: ps.reduce((n, p) => n + p.depth, 0) / 4,
              node: <polygon key={`flap-${flap.deg}-${i}`} points={ps.map(p => `${X(p)},${Y(p)}`).join(" ")} className={outside ? helm : `${helm} fig-helm-inside`} />,
            });
          }
        }
      }
    }
    parts.push(...eyeShapes(head.depth - 0.011));
  }

  // Wax caked on it (waxed by a torch): lumps on the shoulder that faces the player, the back, the free arm, a thigh and the crown.
  if (waxCaked && !encased) {
    const j = rig.joints, lerp = (a: P3, b: P3, t: number): P3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const free = rig.weaponHand === "right" ? "L" : "R", lead = (raw.leadSide ?? "left") === "right" ? "R" : "L";
    ball("wax-shoulder", j[`shoulder${free}` as Joint], 6, "fig-wax-head", 0.006);
    ball("wax-back", plus(lerp(j.neck, j.pelvis, 0.35), way([0, 0, -3 * U])), 5, "fig-wax-head", 0.006);
    ball("wax-arm", lerp(j[`elbow${free}` as Joint], j[`hand${free}` as Joint], 0.4), 3.2, "fig-wax-head", 0.006);
    ball("wax-thigh", lerp(j[`hip${lead}` as Joint], j[`knee${lead}` as Joint], 0.5), 3.6, "fig-wax-head", 0.006);
    ball("wax-crown", plus(headAt, way([0, 5 * U, -1.5 * U])), 4.6, "fig-wax-head", 0.012);
  }

  if (arc) parts.push(arcPart(c, arc));

  // Its weapon, in the weapon hand, as the pose points it; dead, dropped by its hand, lying flat on the floor, pointing out from its side.
  if (weapon !== "baseline") {
    const hand3 = rig.weaponHand === "right" ? rig.joints.handR : rig.joints.handL;
    const held = dead
      ? heldAlong([hand3[0], 1.2 * U, hand3[2]], way([rig.weaponHand === "right" ? 0.55 : -0.55, -0.83, 0]), reach, 0.5)
      : weaponIn(rig, pose, reach);
    // (its middle, between the neck and the pelvis: out of a swing the weapon's edge side faces away from it)
    const wielder: P3 | undefined = dead ? undefined : [0, 1, 2].map(i => (rig.joints.neck[i] + rig.joints.pelvis[i]) / 2) as unknown as P3;
    const gear = weaponParts(c, { weapon, model, reach, held, face: dead ? [0, 1, 0] : FACE, swing: dead ? undefined : swing, wielder, at, yaw, cam, w, h, scale, box, eternalFlash });
    parts.push(...gear);
    // The hand round the handle: a dot at the end of the arm, as thick as the arm and in its own colour (the arm's far shade, the wax if sealed),
    // drawn over the weapon so the grip reads. Both hands, if the pose holds it in both.
    if (!dead && gear.length) {
      const over = Math.min(...gear.map(g => g.depth)) - 0.001;
      const asDrawn = raw.for3d ? { ...raw, ...raw.for3d } : raw;
      const holding = asDrawn.grip ? (["R", "L"] as const) : ([rig.weaponHand === "right" ? "R" : "L"] as const);
      for (const side of holding) {
        bones(`grip${side}`, [`hand${side}`, `hand${side}`] as Joint[], encased ? "fig-wax-shell" : `fig-limb${red(side)}`, encased ? SHELL : LIMB);
        const dot = parts[parts.length - 1];
        dot.depth = Math.min(dot.depth, over);
        // (in the arm's own tone, or its glove's: it is shaded as a whole, by where its middle is, not by where the hand is)
        const arm = parts.find(x => x.key === `${encased ? "shell-arm" : shod || garbed ? "glove" : "arm"}${side}`);
        const armCls: string | undefined = (arm?.node as { props?: { className?: string } } | undefined)?.props?.className;
        const dotEl = dot.node as ReactElement<{ className?: string }>;
        if (armCls) dot.node = cloneElement(dotEl, { className: armCls });
      }
    }
  }

  // Dead: a couple of splashes of blood on the floor by it (one by its neck, one under its side), and a few drops; drawn first, under it all.
  if (dead && !encased) {
    const j = rig.joints, on = (p: P3, dx: number, dz: number): P3 => [p[0] + dx * U, 0, p[2] + dz * U];
    const blood: [P3, number, number][] = [
      [on(j.neck, 4, 5), 6.5, 0.7], [on(j.waist, -6, 3), 4.2, 2.1],
      [on(j.neck, 12, 9), 1.1, 0], [on(j.head, 9, 1), 0.8, 1], [on(j.waist, -12, 8), 0.9, 2],
    ];
    blood.forEach(([at3, r, seed], i) => {
      const pts = splash(at3, r, seed).map(see);
      parts.push({ key: `blood${i}`, depth: see(at3).depth + 10, node: <polygon key={`blood${i}`} points={pts.map(p => `${X(p)},${Y(p)}`).join(" ")} className="fig-gore-pool" /> });
    });
  }

  // Joined to the ribcage and the head, never over them.
  behind("shoulders", "ribcage");
  behind("neck", "ribcage", "head");
  // (the chestplate's bronze below the ribcage over the line of the hips, which it covers)
  if (shod) behind("hips", "lumbar");

  settleCloak?.();
  settleNomad();
  // The arms hang by the body, almost touching it, and an arm's depth (the middle of its three joints) is then within a hair of the armor's, which can sort it under
  // the cloak, the sash, the skirt or the chest: the arm looks to be inside the armor. An arm on the viewer's side of the body is in front of the armor on that side,
  // so it is drawn just over the nearest piece of it that faces the viewer (all its parts together: the glove, the shoulder piece, the wraps, the hand over its weapon,
  // keep their order); one clearly behind the body is left where it is, under the armor, as it should be.
  if (gear && !dead) {
    const rib = parts.find(x => x.key === "ribcage"), spine = parts.find(x => x.key === "lumbar");
    if (rib) {
      const axisDepth = rib.depth + 0.004, over = Math.min(rib.depth, spine ? spine.depth : Infinity, ...armorNear.map(x => x.depth)) - 0.0003;
      for (const side of ["R", "L"] as const) {
        const arm = parts.find(x => x.key === `arm${side}`);
        if (!arm || arm.depth >= axisDepth + ARM_BEHIND || arm.depth < over) continue;
        const shift = over - arm.depth;
        for (const x of parts) {
          if (x.key === `arm${side}` || x.key === `glove${side}` || x.key === `pauldron${side}` || x.key === `grip${side}` || x.key.startsWith(`upper${side}-wrap`) || x.key.startsWith(`fore${side}-wrap`)) x.depth += shift;
        }
      }
    }
  }
  // The marker the cloth's sway is measured from: where the pelvis is on the screen (nothing to see).
  if (shod || garbed || masked) parts.push({ key: "sway-anchor", depth: 1e9, node: <circle key="sway-anchor" data-sway-anchor="" cx={X(seen.pelvis)} cy={Y(seen.pelvis)} r={0.2} fill="none" /> });
  return <Figure3DSvg rootRef={root} parts={parts} title={title} className={gear?.armorItem ? `armor-${gear.armorItem}` : undefined} />;
}

/** The figure, worked out again only when something it is drawn from has changed (`sameDrawing`). */
export const Sleepwalker3D = memo(Sleepwalker3DView, sameDrawing);
