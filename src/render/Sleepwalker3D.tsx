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
import { cloneElement, type ReactElement, useContext, useMemo } from "react";
import type { ArmorItem, ArmorTier, HeadItem, Side, WeaponItem, WeaponTier } from "../core/types";
import { type Cam, METERS_PER_UNIT as U, type Vec } from "./camera";
import { DebugLimbsContext } from "./debugLimbs";
import { arcPart, canvas3d, Figure3DSvg, ribcagePart, weaponParts } from "./figure3d";
import { held as heldAlong, type Joint, liftPose, type P3, placeRig, poseWeaponAxis, type Rig3, type Seen, swingArc } from "./rig3d";
import { ALL_POSES, type PoseName } from "./poses";
import { modelOfWeapon } from "./gear3d";
import { WEAPON_REACH } from "./StickFigure";

/** Its bodily thickness, in figure units, before perspective: the limbs (as the flat figure's), the wax that seals it, the head. */
const LIMB = 5, SHELL = 13, HEAD_R = 7.5;
/** The patrol wardens' hood: its round, as big as the flat one's. */
const HOOD_R = 8.9;
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
const unit = (v: P3): P3 => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
/** `a` plus `b` times `k`. */
const plus = (a: P3, b: P3, k = 1): P3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
/** The cross product. */
const cross = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** The outline of a set of points on the screen (a convex hull: the silhouette of a cone is its tip and its base's outline together). */
function hull(ps: [number, number][]): [number, number][] {
  const pts = [...ps].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const turn = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [], upper: [number, number][] = [];
  for (const p of pts) { while (lower.length >= 2 && turn(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (const p of [...pts].reverse()) { while (upper.length >= 2 && turn(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

export function Sleepwalker3D({ pose: shown, hand = "right", weapon, hooded: hoodedKind, encased, waxCaked, dead, gear, eternalFlash, title, cam, at, yaw, scale = 1, w, h, box }: Sleepwalker3DProps) {
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
  const { seen, see, X, Y, scaleAt, parts, bones, ball, behind } = c;
  const red = (side: "R" | "L") => (debug && side === "R" ? " dbg-red" : "");

  if (!encased) {
    // The spine is three parts, each drawn on its own: the lower spine, the ribcage (a solid, below) and the neck.
    bones("lumbar", ["pelvis", "waist"], "fig-limb", LIMB);
    bones("shoulders", ["shoulderR", "shoulderL"], "fig-limb", LIMB);
    bones("hips", ["hipR", "hipL"], "fig-limb", LIMB);
    bones("neck", ["neck", "head"], "fig-limb", LIMB);
    for (const side of ["R", "L"] as const) {
      bones(`arm${side}`, [`shoulder${side}`, `elbow${side}`, `hand${side}`] as Joint[], `fig-limb${red(side)}`, LIMB);
      bones(`leg${side}`, [`hip${side}`, `knee${side}`, `foot${side}`] as Joint[], `fig-limb${red(side)}`, LIMB);
    }
    // The player's torso: its armor over the ribcage (the bronze chestplate, the black garb, the white robe, or plain armor), and no ribs showing.
    const chest = !gear ? undefined
      : gear.armorItem === "bronze-chestplate" ? "fig-chest-bronze" : gear.armorItem === "garb" ? "fig-chest-garb" : gear.armorItem === "robe" ? "fig-chest-robe"
      : gear.armor !== "none" ? "fig-armor-fill" : "fig-ribcage";
    parts.push(ribcagePart(c, rig, gear ? { cls: chest, ribs: false } : {}));
    // The Soldier's gloves and boots: brown leather over the last half of each forearm and shin.
    if (gear?.armorItem === "bronze-chestplate") {
      for (const side of ["R", "L"] as const) {
        const j = rig.joints, half = (a: P3, b: P3): P3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
        bones(`glove${side}`, [see(half(j[`elbow${side}` as Joint], j[`hand${side}` as Joint])), `hand${side}` as Joint], "fig-limb fig-leather", LIMB, 0.0005);
        bones(`boot${side}`, [see(half(j[`knee${side}` as Joint], j[`foot${side}` as Joint])), `foot${side}` as Joint], "fig-limb fig-leather", LIMB, 0.0005);
      }
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
  if (encased) {
    parts.push({ key: "head", depth: head.depth - 0.01, node: <ellipse key="head" cx={X(head)} cy={Y(head)} rx={10.5 * kh} ry={11 * kh} className="fig-wax-head" /> });
  } else if (hooded) {
    parts.push({ key: "head", depth: head.depth - 0.01, node: <circle key="head" cx={X(head)} cy={Y(head)} r={HOOD_R * kh} className={blackHood ? "fig-hood fig-hood-black" : "fig-hood"} /> });
    // Its point: a cone from the back of the hood, up and back, its tip hanging behind the head (as the flat hood's).
    const baseAt = plus(headAt, way([0, 2.9 * U, -5.1 * U])), tipAt = plus(headAt, way([0, 10.2 * U, -10.4 * U]));
    const axis = unit([tipAt[0] - baseAt[0], tipAt[1] - baseAt[1], tipAt[2] - baseAt[2]]), across: P3 = way([1, 0, 0]), other = unit(cross(axis, across));
    const rim = Array.from({ length: 16 }, (_, i) => (i / 16) * Math.PI * 2).map(a => see(plus(plus(baseAt, across, Math.cos(a) * 4.6 * U), other, Math.sin(a) * 4.6 * U)));
    const tip = see(tipAt), outline = hull([...rim, tip].map(p => [X(p), Y(p)] as [number, number]));
    parts.push({ key: "hood-point", depth: (see(baseAt).depth + tip.depth) / 2, node: <polygon key="hood-point" points={outline.map(p => p.join(",")).join(" ")} className={blackHood ? "fig-hood fig-hood-black" : "fig-hood"} /> });
    // The opening, where the face is in shadow: a ring on the front of the hood, round the way it looks.
    const f = unit(look), sideA = unit(cross(way([0, 1, 0]), f)), upA = unit(cross(f, sideA)), open = 0.62; // (radians from the middle of the face to the ring)
    const centre = see(plus(headAt, f, HOOD_R * U));
    if (centre.depth < head.depth) {
      // (a little taller than wide, as the flat hood's)
      const ring = Array.from({ length: 20 }, (_, i) => (i / 20) * Math.PI * 2).map(a => {
        const d = plus(plus(f, sideA, Math.tan(open) * Math.cos(a)), upA, Math.tan(open) * 1.25 * Math.sin(a));
        return see(plus(headAt, unit(d), HOOD_R * U));
      });
      parts.push({ key: "hood-dark", depth: head.depth - 0.012, node: <polygon key="hood-dark" points={ring.map(p => `${X(p)},${Y(p)}`).join(" ")} className="fig-hood-dark" /> });
    }
  } else {
    // (the player's Desert Mask: cloth wound round the whole head, the eyes showing through)
    parts.push({ key: "head", depth: head.depth - 0.01, node: <circle key="head" cx={X(head)} cy={Y(head)} r={HEAD_R * kh} className={gear?.headItem === "mask" ? "fig-head fig-mask" : "fig-head"} /> });
    // A helm (the player's bronze helm, or the plain helmet of heavy armor): a dome over the crown down to the brow, the bronze one with its red crest
    // running from the brow over to the back.
    const helm = gear?.headItem === "helm" ? "fig-helm-bronze" : gear && !gear.headItem && !gear.armorItem && gear.armor === "heavy" ? "fig-armor-fill" : undefined;
    if (helm) {
      const up = way([0, 1, 0]), fwd = way([0, 0, 1]), side = unit(cross(up, fwd)), HR = HEAD_R + 1.1;
      const onDome = (a: number, e: number): P3 => plus(headAt, plus(plus(plus([0, 0, 0], fwd, Math.cos(a) * Math.cos(e)), side, Math.sin(a) * Math.cos(e)), up, Math.sin(e) - 0.1), HR * U);
      const dome = [];
      for (let a = 0; a < 16; a++) for (const e of [0, 0.5, 1.0, 1.4]) dome.push(see(onDome((a / 16) * Math.PI * 2, e)));
      const outline = hull(dome.map(p => [X(p), Y(p)] as [number, number]));
      parts.push({ key: "helm", depth: head.depth - 0.013, node: <polygon key="helm" points={outline.map(p => p.join(",")).join(" ")} className={helm} /> });
      if (gear?.headItem === "helm") {
        const crest = Array.from({ length: 9 }, (_, i) => see(plus(headAt, plus(plus([0, 0, 0], fwd, Math.cos(0.35 + (i / 8) * 2.4)), up, Math.sin(0.35 + (i / 8) * 2.4)), (HR + 1.6) * U)));
        bones("crest", crest, "fig-helm-crest", 2.6, 0.014);
      }
    }
    // (the head's own up: straight up, or along the floor toward the crown if it lies there)
    const vert = way([0, 1, 0]);
    for (const s of [-1, 1]) {
      const a = s * EYE_APART, ca = Math.cos(a), sa = Math.sin(a);
      // (turned round the head's up from where it looks)
      const k = vert[0] * look[0] + vert[1] * look[1] + vert[2] * look[2], vx = cross(vert, look);
      const dir: P3 = [0, 1, 2].map(i => look[i] * ca + vx[i] * sa + vert[i] * k * (1 - ca)) as unknown as P3;
      const eye: Seen = see(plus(headAt, dir, HEAD_R * U));
      if (eye.depth >= head.depth) continue;
      // Tired eyes: half moons lying on the head's surface, as the ribs lie on the ribcage, the lid a flat line across the top and the round half
      // below. Each point is laid back onto the ball, so they turn and narrow with the head.
      const side = unit(cross(vert, dir)), upE = unit(cross(dir, side)), r = EYE_R / HEAD_R;
      const onHead = (x: number, y: number): Seen => see(plus(headAt, unit(plus(plus(dir, side, x * r), upE, y * r)), HEAD_R * U));
      const rim = Array.from({ length: 11 }, (_, i) => (Math.PI * i) / 10).map(t => onHead(Math.cos(t), -Math.sin(t)));
      parts.push({ key: `eye${s}`, depth: head.depth - 0.011, node: <polygon key={`eye${s}`} points={rim.map(p => `${X(p)},${Y(p)}`).join(" ")} className="fig-eyes" /> });
    }
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
    const gear = weaponParts(c, { weapon, model, reach, held, face: dead ? [0, 1, 0] : FACE, swing: dead ? undefined : swing, wielder, yaw, cam, w, h, scale, box, eternalFlash });
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
        // (in the arm's own tone: it is shaded as a whole, by where its middle is, not by where the hand is)
        const arm = parts.find(x => x.key === `${encased ? "shell-arm" : "arm"}${side}`);
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

  return <Figure3DSvg parts={parts} title={title} className={gear?.armorItem ? `armor-${gear.armorItem}` : undefined} />;
}
