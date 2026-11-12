/**
 * Waxed3D.tsx — the Waxed drawn from a skeleton in 3D space (rig3d.ts): its joints are placed on the
 * combat scene's floor, facing a way, and projected through the scene's camera; this connects them with
 * segments, drawn far to near by their real distance from the camera (so what is in front is drawn over
 * what is behind, from whichever way it is seen), and sizes every segment by the pixels a meter is where it is
 * (perspective).
 *
 * It draws into the same 100 × 120 box a flat figure does (the scene's `figureBox`), so the scene's click target,
 * haze and animations work as they always did; limbs may reach outside it.
 */
import { memo, useContext, useMemo } from "react";
import type { Side, WeaponTier } from "../core/types";
import { type Cam, METERS_PER_UNIT as U, type Vec } from "./camera";
import { DebugLimbsContext } from "./debugLimbs";
import { arcPart, canvas3d, Figure3DSvg, ribcagePart, sameDrawing, weaponParts } from "./figure3d";
import { type Hold, type Joint, liftPose, type P3, placeRig, type Seen, swingArc, weaponHold } from "./rig3d";
import { ALL_POSES, type PoseName } from "./poses";
import { modelOfWeapon } from "./gear3d";
import { Prop, WEAPON_REACH } from "./StickFigure";
import { RIG } from "./rig";

/** The Waxed's bodily thickness, in figure units (a pose's drawing is 100 × 120 units), before perspective. */
const LIMB = 5, BIND = 10, SHELL = 13;
/** The sealed head: the lump of wax. */
const HEAD_RX = 9.5, HEAD_RY = 10;
/** How far above the middle of the head a flame on it stands (figure units): on top, its base sunk a little into the wax. */
export const HEAD_TOP = HEAD_RY;

/** The swings that leave an arch behind: the pose of the strike, and the pose of the wind-up that its right hand swings from. */
const SWINGS: Partial<Record<PoseName, PoseName>> = { "w-low-strike": "w-low-windup", "w-overhead-strike": "w-overhead-windup" };
/** The strikes that reach out straight ahead at their middle, the arm fully stretched (their arch passes there): the low attack. */
const REACHING = new Set<string>(["w-low-strike"]);

/**
 * How the chisel and the hammer are held where it is not simply along the forearm: across the hand in the poses that rear back, out to the side by the flame (clear of the
 * face), and resting on the ground ahead of the hand when it crawls. In a swing it lies in the swing's plane (`along`: the forearm's line, brought into it).
 */
const CHISEL_HOLDS: Partial<Record<PoseName, Hold>> = {
  "w-crawl": "ground",
  "w-low-windup": "along", "w-low-strike": "along",
  // (a reverse grip for the whole of the overhead attack; in the strike it is brought down: pointing at the floor, a little away from the target)
  "w-reared": "across", "w-wax-hand": "across", "w-overhead-windup": "across", "w-overhead-strike": "stab",
  "w-cradle": "side", "w-clutch": "side", "w-clutch-eat": "side",
};

/** The hammer's: the same, except that the overhead attack is held the ordinary way (in the wind-up the haft runs through the other hand too, and the strike brings the brick to the ground). */
const HAMMER_HOLDS: Partial<Record<PoseName, Hold>> = {
  ...CHISEL_HOLDS,
  "w-reared": "along", "w-overhead-windup": "toHand", "w-overhead-strike": "down",
};
const HOLDS: Partial<Record<WeaponTier, Partial<Record<PoseName, Hold>>>> = { light: CHISEL_HOLDS, heavy: HAMMER_HOLDS };

/** The weapons held this way: the chisel and the hammer (the torch still follows the forearm). */
const HELD = new Set<WeaponTier>(["light", "heavy"]);

/** The poses of an attack itself, where the weapon is gripped by the end of its handle. Out of them the hammer is held up close to the base of its brick. */
const ATTACKING = new Set<PoseName>(["w-low-windup", "w-low-strike", "w-overhead-windup", "w-overhead-strike"]);
const HAMMER_GRIP = 20; // (along the hammer from the end of its haft: its brick begins at 29.5)

/** The poses that lie in a swing's plane, and the wind-up and strike that make the swing: the chisel's blade lies in that plane. */
const SWING_OF: Partial<Record<PoseName, [PoseName, PoseName]>> = {
  "w-low-windup": ["w-low-windup", "w-low-strike"], "w-low-strike": ["w-low-windup", "w-low-strike"],
  "w-reared": ["w-overhead-windup", "w-overhead-strike"], "w-overhead-windup": ["w-overhead-windup", "w-overhead-strike"], "w-overhead-strike": ["w-overhead-windup", "w-overhead-strike"],
};

export interface Waxed3DProps {
  pose: PoseName;
  hand?: Side;
  weapon: WeaponTier;
  /** Wax sealing the whole body. */
  encased?: boolean;
  /** The legs are never shaded for being on the far side (a part of the Wax Blob: its legs melt into the pool). */
  meldLegs?: boolean;
  /** The flame in its hands is not drawn (lit, the flame it gathers to burst is the one on its head). */
  hideFlame?: boolean;
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

function Waxed3DView({ pose, hand = "right", weapon, encased, meldLegs, hideFlame, eternalFlash, title, cam, at, yaw, scale = 1, w, h, box }: Waxed3DProps) {
  const debug = useContext(DebugLimbsContext);
  const rig = useMemo(() => liftPose(ALL_POSES[pose], hand), [pose, hand]);
  const windUp = SWINGS[pose];
  // Its weapon, modelled in 3D (gear3d.ts); the flat sprite only if there were none.
  const model = modelOfWeapon(weapon), reach = model?.reach ?? WEAPON_REACH[weapon];
  // Where along the weapon the hand holds it: the hammer is gripped near its brick, except while attacking.
  const slide = weapon === "heavy" && !ATTACKING.has(pose) ? HAMMER_GRIP : 0;
  const holdOf = (name: PoseName): Hold | undefined => (HOLDS[weapon]?.[name]);
  // The plane of the swing a pose belongs to (the chisel and the hammer): the one the right hand's two ends lie in, bowing toward what it faces.
  const planeOf = (name: PoseName): P3 | undefined => {
    const pair = HELD.has(weapon) ? SWING_OF[name] : undefined;
    return pair && swingArc(liftPose(ALL_POSES[pair[0]], hand).joints.handR, liftPose(ALL_POSES[pair[1]], hand).joints.handR).normal;
  };
  const plane = useMemo(() => planeOf(pose), [pose, hand, weapon]);
  // The arch of a strike: from where the right hand was in the wind-up to where it ends, bowing toward the player.
  // With a weapon it arches from the weapon's far end (where the weapon was, to where it is now), not from the hand, and it ends as thick as the weapon's
  // damaging part (the blade, the brick): that is what sweeps through.
  // (The low attack reached furthest straight ahead halfway through, the arm fully stretched out: its arch passes there.)
  const arc = useMemo(() => {
    if (!windUp) return undefined;
    const before = liftPose(ALL_POSES[windUp], hand);
    const [from, to] = weapon === "baseline" ? [before.joints.handR, rig.joints.handR] : [weaponHold(before, reach, holdOf(windUp), plane).tip, weaponHold(rig, reach, holdOf(pose), plane).tip];
    const sh = rig.joints.shoulderR, far = (RIG.upperArm + RIG.forearm + (weapon === "baseline" ? 0 : reach)) * U;
    const mid: P3 | undefined = REACHING.has(pose) ? [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, sh[2] + far] : undefined;
    return swingArc(from, to, weapon === "baseline" ? undefined : model && model.damage * U, mid);
  }, [windUp, pose, hand, rig, weapon, reach, model, plane]);
  // (A part of the Wax Blob: its legs melt into the pool, never in the far tone.)
  const c = canvas3d(placeRig(rig, at, yaw, cam, w, h, scale), box, { unshaded: key => !!meldLegs && key.startsWith("shell-leg") });
  const { seen, see, prop, X, Y, scaleAt, depthOf, parts, behind } = c;
  /** A run of bones through these joints, `width` units thick at the figure's own distance. */
  const bones = (key: string, js: (Joint | Seen)[], cls: string, width = LIMB, extra = 0) => c.bones(key, js, cls, width, extra);
  const red = (side: "R" | "L") => (debug && side === "R" ? " dbg-red" : "");

  // The spine is three parts, each drawn on its own: the lower spine here, the ribcage (an ellipsoid standing on the waist-to-neck
  // line, drawn below), and the neck. No one line runs the length of it, so it can't be drawn over the ribcage or the head.
  // Sealed whole in wax (staggered and waxed, fallen, lit, a part of a body): nothing of the body shows, only the wax shell over every part of it.
  if (!encased) {
    bones("lumbar", ["pelvis", "waist"], "fig-limb");
    bones("shoulders", ["shoulderR", "shoulderL"], "fig-limb");
    bones("hips", ["hipR", "hipL"], "fig-limb");
    bones("neck", ["neck", "head"], "fig-limb");
  }
  for (const side of ["R", "L"] as const) {
    if (!encased) {
      bones(`arm${side}`, [`shoulder${side}`, `elbow${side}`, `hand${side}`] as Joint[], `fig-limb${red(side)}`);
      // Only the thighs show: from the knee down the legs are inside the wax that binds them.
      bones(`leg${side}`, [`hip${side}`, `knee${side}`] as Joint[], `fig-limb${red(side)}`);
    }
    bones(`bind${side}`, [`knee${side}`, `foot${side}`] as Joint[], "fig-wax-bind", BIND, 0.002);
    if (encased) {
      bones(`shell-arm${side}`, [`shoulder${side}`, `elbow${side}`, `hand${side}`] as Joint[], "fig-wax-shell", SHELL);
      bones(`shell-leg${side}`, [`hip${side}`, `knee${side}`, `foot${side}`] as Joint[], "fig-wax-shell", SHELL);
    }
  }
  // The wax round both shins is one mass: from the knees, wherever they are apart, down to the feet, with no gap between.
  {
    const ps = [seen.kneeR, seen.kneeL, seen.footL, seen.footR];
    parts.push({ key: "bound", depth: depthOf(...ps) - 0.002, node: <polygon key="bound" points={ps.map(p => `${X(p)},${Y(p)}`).join(" ")} className="fig-wax-fill" /> });
  }
  if (encased) {
    // The shell takes the place of the whole body: the lower spine, the chest, the shoulders and hips, and the neck (the chest's shell is thicker, as wide as the ribcage).
    bones("shell-lumbar", ["pelvis", "waist"], "fig-wax-shell", SHELL);
    // The chest's thick shell stops short of the neck (its round end would reach well up into the head), and the neck's own is a thin stub from there.
    const along = (a: Seen, b: Seen, t: number): Seen => ({ sx: a.sx + (b.sx - a.sx) * t, sy: a.sy + (b.sy - a.sy) * t, ppm: a.ppm + (b.ppm - a.ppm) * t, depth: a.depth + (b.depth - a.depth) * t });
    const chestTop = along(seen.waist, seen.neck, 0.8);
    bones("shell-ribs", ["waist", chestTop], "fig-wax-shell", SHELL + 4);
    bones("shell-shoulders", ["shoulderR", "shoulderL"], "fig-wax-shell", SHELL);
    bones("shell-hips", ["hipR", "hipL"], "fig-wax-shell", SHELL);
    bones("shell-neck", [chestTop, "neck"], "fig-wax-shell", SHELL - 3);
  }

  // The ribcage, as the sleepwalkers have (figure3d.tsx).
  if (!encased) parts.push(ribcagePart(c, rig));

  // The head: a lump of wax, a sphere in space.
  const head = seen.head, kh = scaleAt(head);
  parts.push({
    key: "head", depth: head.depth - 0.01,
    node: (
      <g key="head" className="fig-wax">
        <ellipse cx={X(head)} cy={Y(head)} rx={(encased ? HEAD_RX + 1 : HEAD_RX) * kh} ry={(encased ? HEAD_RY + 1 : HEAD_RY) * kh} className="fig-wax-head" />
        <path d={`M${X(head) - 4 * kh} ${Y(head) + 8 * kh} q${kh} ${5 * kh} 0 ${7 * kh} M${X(head) + 3 * kh} ${Y(head) + 9 * kh} q${kh} ${3 * kh} 0 ${4 * kh}`} className="fig-wax-drip" style={{ strokeWidth: 2.5 * kh }} />
      </g>
    ),
  });

  // The arch the strike's swing leaves (it fades as the strike ends: `fig-trail`).
  if (arc) parts.push(arcPart(c, arc));

  // Debug: a dot on the front of the face, level, straight ahead of the head, to tell where it looks. Hidden when it is on the far side.
  if (debug) {
    const [hx, hy, hz] = rig.joints.head;
    const g = rig.gaze ?? [0, 0, 1]; // (where it looks: at the flame, if it has one to look at; else level, straight ahead)
    const face = see([hx + g[0] * HEAD_RX * U, hy + g[1] * HEAD_RX * U, hz + g[2] * HEAD_RX * U]);
    if (face.depth < head.depth) {
      parts.push({
        key: "gaze", depth: face.depth - 0.03,
        node: <circle key="gaze" cx={X(face)} cy={Y(face)} r={1.9 * scaleAt(face)} fill="#22d3ee" stroke="#0e7490" strokeWidth={0.8 * scaleAt(face)} />,
      });
    }
  }

  // What it holds: a wax lump or a flame, in front of its hand.
  if (prop && !rig.propHidden && !(hideFlame && prop.kind === "flame")) {
    const kp = scaleAt(prop.at);
    // It is always drawn over the arms that hold it, whatever the angle: the wax shell round a hand (and the rest of the arm) never covers it.
    const arms = (["R", "L"] as const).map(side => depthOf(seen[`shoulder${side}`], seen[`elbow${side}`], seen[`hand${side}`]));
    parts.push({
      key: "prop", depth: Math.min(prop.at.depth - 0.02, ...arms.map(d => d - 0.001)),
      node: <g key="prop" transform={`translate(${X(prop.at)} ${Y(prop.at)}) scale(${kp})`}><Prop prop={{ kind: prop.kind, at: [0, 0] }} /></g>,
    });
  }

  // An armed Waxed holds the weapon in its right hand, in every pose, pointing on along the forearm and kept off the floor (`weaponOf`). It is drawn
  // along that line: as long as it looks from where we are (foreshortened pointing toward us), as thick as the figure's own size there.
  if (weapon !== "baseline") {
    const held = weaponHold(rig, reach - slide, holdOf(pose), plane);
    // The blade (or brick) lies in the plane of the swing it is about to make or has made (so its edge leads through the arch); on the ground it lies flat.
    // Its edge side (the chisel's edge, the brick's striking end) leads: facing where the swing goes, from the wind-up, and where it went, at the strike.
    let face: P3 | undefined = holdOf(pose) === "ground" ? [0, 1, 0] : undefined;
    const pair = HELD.has(weapon) ? SWING_OF[pose] : undefined;
    let swing: { arc: ReturnType<typeof swingArc>; at: 0 | 1 } | undefined;
    if (pair) {
      const tipOf = (name: PoseName) => weaponHold(liftPose(ALL_POSES[name], hand), reach, holdOf(name), plane).tip;
      const arch = swingArc(tipOf(pair[0]), tipOf(pair[1]));
      face = arch.normal;
      swing = { arc: arch, at: pose === pair[1] ? 1 : 0 };
    }
    // (out of a swing its edge side faces away from the body, never toward it)
    const wielder = [0, 1, 2].map(i => (rig.joints.neck[i] + rig.joints.pelvis[i]) / 2) as unknown as P3;
    parts.push(...weaponParts(c, { weapon, model, reach, held, face, swing, wielder, slide, at, yaw, cam, w, h, scale, box, eternalFlash }));
  }

  // Dead: the wax runs. A puddle of it spreads on the floor round the base; a rim of it slumps up over the bottom of the body in front, so he melds a little
  // into the ground; drips run from the shell down to the floor, and a few beads fall.
  if (pose === "w-dead") {
    const floorPt = (x: number, z: number): Seen => see([x * U, 0, z * U]);
    const around = Array.from({ length: 32 }, (_, i) => (i / 32) * Math.PI * 2);
    // An uneven blob (centred a little ahead of the pelvis, under the legs and the body), 34 across and 30 deep before its wobble.
    const blob = around.map(a => {
      const wobble = 1 + 0.16 * Math.sin(3 * a + 0.7) + 0.08 * Math.sin(5 * a + 2.1);
      return { a, x: 34 * wobble * Math.cos(a), z: 8 + 30 * wobble * Math.sin(a) };
    });
    const edge = blob.map(p => floorPt(p.x, p.z));
    const furthest = Math.max(...parts.map(p => p.depth)) + 1, nearest = Math.min(...parts.map(p => p.depth)) - 0.5;
    parts.push({ key: "puddle", depth: furthest, node: <polygon key="puddle" points={edge.map(p => `${X(p)},${Y(p)}`).join(" ")} className="fig-wax-puddle" /> });
    // The rim in front (the part of the edge nearer the viewer than the middle), raised a little and drawn over everything: the body sinks into it.
    const centre = floorPt(0, 8);
    const front = blob.filter((_, i) => edge[i].depth < centre.depth);
    if (front.length > 2) {
      const lip = [...front.map(p => floorPt(p.x, p.z)), ...[...front].reverse().map(p => see([p.x * 0.9 * U, 4 * U, (8 + (p.z - 8) * 0.9) * U]))];
      parts.push({ key: "lip", depth: nearest, node: <polygon key="lip" points={lip.map(p => `${X(p)},${Y(p)}`).join(" ")} className="fig-wax-lip" /> });
    }
    // Drips, running from the shell (its outer edge, below each joint) straight down to the floor, with a bead where they land.
    const drips: { joint: Joint; below: number }[] = [
      { joint: "elbowR", below: 6.5 }, { joint: "elbowL", below: 6.5 }, { joint: "handR", below: 5 }, { joint: "handL", below: 5 },
      { joint: "shoulderR", below: 6.5 }, { joint: "shoulderL", below: 6.5 }, { joint: "head", below: 10.5 },
    ];
    drips.forEach(({ joint, below }, i) => {
      const [jx, jy, jz] = rig.joints[joint];
      const top = see([jx, jy - below * U, jz]), land = see([jx, 0.4 * U, jz]), k = scaleAt(land);
      parts.push({
        key: `drip-${joint}`, depth: seen[joint].depth,
        node: (
          <g key={`drip-${joint}`}>
            <polyline points={`${X(top)},${Y(top)} ${X(land)},${Y(land)}`} className="fig-wax-drip" style={{ strokeWidth: (2.2 - (i % 3) * 0.4) * k }} />
            <ellipse cx={X(land)} cy={Y(land)} rx={3.4 * k} ry={1.4 * k} className="fig-wax-fill" />
          </g>
        ),
      });
    });
    // A few beads falling from the elbows and the head (they loop: hang, fall, vanish into the puddle).
    ([["elbowR", 7.5, 0], ["elbowL", 7.5, 0.9], ["head", 11.5, 1.6]] as const).forEach(([joint, below, delay]) => {
      const [jx, jy, jz] = rig.joints[joint];
      const start = see([jx, jy - below * U, jz]), land = see([jx, 0.4 * U, jz]), k = scaleAt(start);
      parts.push({
        key: `bead-${joint}`, depth: seen[joint].depth - 0.001,
        node: <circle key={`bead-${joint}`} cx={X(start)} cy={Y(start)} r={1.5 * k} className="fig-wax-drop" style={{ ["--fall" as string]: `${Y(land) - Y(start)}px`, animationDelay: `${delay}s` }} />,
      });
    });
  }

  // Joined to the ribcage and the head, never over them: the bar of the shoulders is drawn under the ribcage, and the neck under it
  // and under the head, whichever way the body is seen.
  behind("shoulders", "ribcage");
  behind("neck", "ribcage", "head");

  return <Figure3DSvg parts={parts} title={title} />;
}

/** The figure, worked out again only when something it is drawn from has changed (`sameDrawing`). */
export const Waxed3D = memo(Waxed3DView, sameDrawing);
