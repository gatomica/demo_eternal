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
import { type ReactNode, useContext, useMemo } from "react";
import type { Side, WeaponTier } from "../core/types";
import { type Cam, facingVec, HORIZON, METERS_PER_UNIT as U, right as rightOf, type Vec } from "./camera";
import { DebugLimbsContext } from "./debugLimbs";
import { type Hold, type Joint, liftPose, type P3, placeRig, ribcageOf, type Seen, swingArc, weaponFrame, weaponHold } from "./rig3d";
import { ALL_POSES, type PoseName } from "./poses";
import { drawGear, modelOfWeapon, type V3 } from "./gear3d";
import { GearShape } from "./GearShape";
import { HeldWeapon, Prop, WEAPON_REACH } from "./StickFigure";

/** The Waxed's bodily thickness, in figure units (a pose's drawing is 100 × 120 units), before perspective. */
const LIMB = 5, BIND = 10, SHELL = 13;
/** The sealed head: the lump of wax. */
const HEAD_RX = 9.5, HEAD_RY = 10;
/** How far above the middle of the head a flame on it stands (figure units): on top, its base sunk a little into the wax. */
export const HEAD_TOP = HEAD_RY;

/** The swings that leave an arch behind: the pose of the strike, and the pose of the wind-up that its right hand swings from. */
const SWINGS: Partial<Record<PoseName, PoseName>> = { "w-low-strike": "w-low-windup", "w-overhead-strike": "w-overhead-windup" };

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

export function Waxed3D({ pose, hand = "right", weapon, encased, hideFlame, eternalFlash, title, cam, at, yaw, scale = 1, w, h, box }: Waxed3DProps) {
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
  const arc = useMemo(() => {
    if (!windUp) return undefined;
    const before = liftPose(ALL_POSES[windUp], hand);
    return weapon === "baseline"
      ? swingArc(before.joints.handR, rig.joints.handR)
      : swingArc(weaponHold(before, reach, holdOf(windUp), plane).tip, weaponHold(rig, reach, holdOf(pose), plane).tip, model && model.damage * U);
  }, [windUp, pose, hand, rig, weapon, reach, model, plane]);
  const { seen, see, prop, origin } = placeRig(rig, at, yaw, cam, w, h, scale);

  // Screen pixels to the box's own units (its drawing is 100 × 120), and a size to what it is at the figure's feet.
  const ux = box.w / 100, uy = box.h / 120;
  const X = (p: Seen) => (p.sx - box.x) / ux, Y = (p: Seen) => (p.sy - box.y) / uy;
  const scaleAt = (...ps: Seen[]) => ps.reduce((n, p) => n + p.ppm, 0) / ps.length / origin.ppm;
  const depthOf = (...ps: Seen[]) => ps.reduce((n, p) => n + p.depth, 0) / ps.length;
  // Anything farther than the middle of the body is in its shade.
  const mid = seen.pelvis.depth;

  const parts: { key: string; depth: number; node: ReactNode }[] = [];
  /** A run of bones through these joints, `width` units thick at the figure's own distance. */
  const bones = (key: string, js: Joint[], cls: string, width = LIMB, extra = 0) => {
    const ps = js.map(j => seen[j]);
    const depth = depthOf(...ps);
    parts.push({
      key, depth: depth - extra,
      node: <polyline key={key} points={ps.map(p => `${X(p)},${Y(p)}`).join(" ")} className={`${cls}${depth > mid + 0.02 && cls === "fig-limb" ? " fig-far" : ""}`} style={{ strokeWidth: width * scaleAt(...ps) }} />,
    });
  };
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
    bones("shell-ribs", ["waist", "neck"], "fig-wax-shell", SHELL + 4);
    bones("shell-shoulders", ["shoulderR", "shoulderL"], "fig-wax-shell", SHELL);
    bones("shell-hips", ["hipR", "hipL"], "fig-wax-shell", SHELL);
    bones("shell-neck", ["neck", "head"], "fig-wax-shell", SHELL);
  }

  // The ribcage, as the sleepwalkers have: a skinny ellipsoid (an oblate spheroid) standing along the spine, with two columns
  // of rib moons lying on its front. It is a real solid in space, so it turns and narrows with the body, it follows a bent
  // spine, and the ribs on the half that faces away disappear.
  if (!encased) {
    const rc = ribcageOf(rig);
    /** A point on its surface: `th` round it (0 = straight ahead of the body), `up` as a share of its half height (-1 to 1). */
    const at3 = (th: number, up: number, deep = 1): Seen => {
      const ring = Math.sqrt(Math.max(0, 1 - up * up));
      const a = rc.halfWidth * ring * Math.sin(th), b = rc.halfDepth * ring * Math.cos(th) * deep, c = rc.halfHeight * up;
      const p: P3 = [0, 1, 2].map(i => rc.centre[i] + rc.side[i] * a + rc.fwd[i] * b + rc.up[i] * c) as unknown as P3;
      return see(p);
    };
    const centre = see(rc.centre as P3);
    // An ellipsoid seen from anywhere has an ellipse for its outline: worked out from where its three axes land on the screen.
    const axisOnScreen = (v: readonly number[], len: number): [number, number] => {
      const e = see([0, 1, 2].map(i => rc.centre[i] + v[i] * len) as unknown as P3);
      return [X(e) - X(centre), Y(e) - Y(centre)];
    };
    const axes = [axisOnScreen(rc.side, rc.halfWidth), axisOnScreen(rc.fwd, rc.halfDepth), axisOnScreen(rc.up, rc.halfHeight)];
    const sxx = axes.reduce((n, v) => n + v[0] * v[0], 0), syy = axes.reduce((n, v) => n + v[1] * v[1], 0), sxy = axes.reduce((n, v) => n + v[0] * v[1], 0);
    const mean = (sxx + syy) / 2, spread = Math.sqrt(((sxx - syy) / 2) ** 2 + sxy * sxy);
    const outline = { rx: Math.sqrt(mean + spread), ry: Math.sqrt(Math.max(0, mean - spread)), angle: (Math.atan2(2 * sxy, sxx - syy) * 90) / Math.PI };
    const crescents: ReactNode[] = [];
    const COLUMNS: [number, number][] = [[0.1, 1.08], [-1.08, -0.1]]; // the radians of each half, either side of the breastbone
    for (const [lo, hi] of COLUMNS) {
      for (const row of [0.55, 0.05, -0.45]) {
        const steps = Array.from({ length: 13 }, (_, i) => lo + ((hi - lo) * i) / 12);
        // Only the part of the rib on the near side of the ribcage shows.
        const shown = steps.map((t, i) => ({ t, i, front: at3(t, row).depth <= centre.depth + 1e-4 })).filter(s => s.front);
        if (shown.length < 2) continue;
        const top = shown.map(s => at3(s.t, row));
        // A flat bowl: the lower edge sags in the middle and meets the upper at the ends.
        const low = shown.map(s => at3(s.t, row - (1.6 * U * Math.sin((Math.PI * s.i) / 12)) / rc.halfHeight, 0.92));
        const pts = [...top, ...low.reverse()].map(p => `${X(p)},${Y(p)}`).join(" ");
        crescents.push(<polygon key={`${row}:${lo}`} points={pts} className="fig-rib" />);
      }
    }
    parts.push({
      key: "ribcage", depth: centre.depth - 0.004,
      node: <g key="ribcage"><ellipse cx={X(centre)} cy={Y(centre)} rx={outline.rx} ry={outline.ry} transform={`rotate(${outline.angle} ${X(centre)} ${Y(centre)})`} className="fig-ribcage" />{crescents}</g>,
    });
  }

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
  if (arc) {
    const STEPS = 20, ts = Array.from({ length: STEPS + 1 }, (_, i) => i / STEPS);
    const edge = [...ts.map(t => see(arc.outer(t))), ...ts.map(t => see(arc.inner(t))).reverse()];
    parts.push({
      key: "swing", depth: Math.min(...edge.map(p => p.depth)) - 0.05,
      node: <polygon key="swing" points={edge.map(p => `${X(p)},${Y(p)}`).join(" ")} className="fig-trail" />,
    });
  }

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
    parts.push({
      key: "prop", depth: prop.at.depth - 0.02,
      node: <g key="prop" transform={`translate(${X(prop.at)} ${Y(prop.at)}) scale(${kp})`}><Prop prop={{ kind: prop.kind, at: [0, 0] }} /></g>,
    });
  }

  // An armed Waxed holds the weapon in its right hand, in every pose, pointing on along the forearm and kept off the floor (`weaponOf`). It is drawn
  // along that line: as long as it looks from where we are (foreshortened pointing toward us), as thick as the figure's own size there.
  if (weapon !== "baseline") {
    const held = weaponHold(rig, reach - slide, holdOf(pose), plane);
    if (model) {
      // The model is drawn in its own space (x along the weapon from the grip, y across its broad face, z its thickness) turned to the hand: along the
      // forearm, its broad face as upright as that lets it be. Body space is a mirror of the weapon's, so its third axis is the cross product turned round.
      // The blade (or brick) lies in the plane of the swing it is about to make or has made (so its edge leads through the arch); on the ground it lies flat.
      const ax = held.axis;
      let face: P3 | undefined = holdOf(pose) === "ground" ? [0, 1, 0] : undefined;
      const swing = HELD.has(weapon) ? SWING_OF[pose] : undefined;
      if (swing) {
        const tipOf = (name: PoseName) => weaponHold(liftPose(ALL_POSES[name], hand), reach, holdOf(name), plane).tip;
        face = swingArc(tipOf(swing[0]), tipOf(swing[1])).normal;
      }
      const { ay, az } = weaponFrame(ax, face);
      const bodyF = facingVec(yaw), bodyR = rightOf(yaw), camR = rightOf(cam.yaw), camF = facingVec(cam.yaw);
      // View space (as in the Gear viewer): x to the camera's right, y down, z away, in figure units, the figure's feet the origin; the lens does the rest.
      const view = (q: V3): V3 => {
        const m = [0, 1, 2].map(i => held.hand[i] + (ax[i] * (q[0] - slide) + ay[i] * q[1] + az[i] * q[2]) * U);
        const fx = bodyR.x * m[0] + bodyF.x * m[2], fz = bodyR.z * m[0] + bodyF.z * m[2];
        return [(fx * camR.x + fz * camR.z) / U, -m[1] / U, (fx * camF.x + fz * camF.z) / U];
      };
      const F = origin.ppm * origin.depth, u0 = (origin.sx - w / 2) / origin.ppm;
      const lens = (v: V3) => {
        const d = Math.max(origin.depth + v[2] * U * scale, 0.05);
        return { d, sx: w / 2 + (F * (u0 + v[0] * U * scale)) / d, sy: HORIZON * h + ((origin.sy - HORIZON * h) * origin.depth + F * v[1] * U * scale) / d };
      };
      const project = (v: V3): readonly [number, number] => { const l = lens(v); return [+((l.sx - box.x) / ux).toFixed(2), +((l.sy - box.y) / uy).toFixed(2)]; };
      const drawn = drawGear(model.prims, { view, project, scale: v => (origin.depth / lens(v).d) * scale });
      const shapes = drawn.map((d, i) => <GearShape key={i} d={d} />);
      const nearest = origin.depth + (drawn.length ? Math.min(...drawn.map(d => d.depth)) : 0) * U * scale;
      drawn.forEach((d, i) => parts.push({ key: `weapon-${i}`, depth: origin.depth + d.depth * U * scale - 0.005, node: shapes[i] }));
      if (eternalFlash) {
        parts.push({ key: "weapon-flash", depth: nearest - 0.02, node: <g key={eternalFlash} className={`fig-eternal-flash ${eternalFlash.startsWith("death|") ? "is-death" : ""}`} aria-hidden="true">{shapes}</g> });
      }
    } else {
      const grip = see(held.hand), tip = see(held.tip);
      const dx = X(tip) - X(grip), dy = Y(tip) - Y(grip);
      parts.push({
        key: "weapon", depth: grip.depth - 0.02,
        node: (
          <g key="weapon" transform={`translate(${X(grip)} ${Y(grip)}) rotate(${(Math.atan2(dy, dx) * 180) / Math.PI}) scale(${Math.hypot(dx, dy) / reach} ${scaleAt(grip)})`}>
            <HeldWeapon tier={weapon} flash={eternalFlash} />
          </g>
        ),
      });
    }
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
  const behind = (key: string, ...of: string[]) => {
    const p = parts.find(x => x.key === key);
    if (p) p.depth = Math.max(p.depth, ...of.map(k => parts.find(x => x.key === k)?.depth ?? 0)) + 0.001;
  };
  behind("shoulders", "ribcage");
  behind("neck", "ribcage", "head");

  parts.sort((a, b) => b.depth - a.depth); // far first

  return (
    <svg viewBox="0 0 100 120" className="figure figure-front" role="img" aria-label={title}>
      {title && <title>{title}</title>}
      <ellipse cx={50} cy={115} rx={26} ry={3} className="fig-shadow" />
      {parts.map(p => p.node)}
    </svg>
  );
}

