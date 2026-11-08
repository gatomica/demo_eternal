/**
 * rig3d.ts — a figure's skeleton in 3D space, in meters, placed on the combat scene's floor and seen
 * through its camera. (Tried on the Waxed first; the rest still use the flat drawings.)
 *
 * BODY SPACE: the origin is on the floor under the figure; `x` is the figure's own right, `y` up,
 * `z` the way it faces. The rig is a handful of joints; a renderer connects them with segments.
 *
 * PLACING: the figure stands at a floor point and faces a yaw (the scene's: 0 = +z, `facingVec`), so a
 * joint at body (x, y, z) is on the floor at `at + right * x + facing * z`, `y` meters up. Then
 * `projectPoint` (the scene's own lens: the horizon, the eye height, the focal length) puts it on screen
 * with the depth and the pixels per meter there, so the figure is seen in true perspective and turns as
 * it really would.
 *
 * POSES: for now they are the existing flat poses lifted into space (`liftPose`): each is a pose in
 * the figure's own side view (forward, up), already fitted to the true bone lengths (rig.ts), with the
 * shoulders and hips set apart sideways by the body's real width, and the limbs hanging from them. A
 * pose that wants limbs out of that plane can say so later; the T-pose lifts with its arms out sideways.
 */
import type { Side } from "../core/types";
import { HIP_HALF, SHOULDER_HALF } from "./body";
import { type Cam, FEET_Y, facingVec, METERS_PER_UNIT as U, projectPoint, right as rightOf, sub, type Vec, yawOf } from "./camera";
import type { Pt } from "./geom";
import type { Skeleton } from "./poses";
import { fitLimbs, fitTorso, RIG } from "./rig";

/** A point in body space (meters): its right, up, and the way it faces. */
export type P3 = readonly [number, number, number];

/** The joints of a rig. R and L are the figure's own right and left. */
export const JOINTS = ["head", "neck", "waist", "pelvis", "shoulderR", "shoulderL", "hipR", "hipL", "elbowR", "handR", "elbowL", "handL", "kneeR", "footR", "kneeL", "footL"] as const;
export type Joint = (typeof JOINTS)[number];

export interface Rig3 {
  joints: Record<Joint, P3>;
  /** Something held (a wax lump, a flame), in body space. */
  prop?: { kind: "wax" | "flame"; at: P3 };
  /** The held thing is gone (not drawn): it only says where the face looks. */
  propHidden?: boolean;
  /** Which way the face points (a unit vector in body space), when the pose has it look at something; otherwise straight ahead, level. */
  gaze?: P3;
  /** Which hand holds the weapon (the figure's weapon arm), as the pose is authored. */
  weaponHand: Side;
  /** The spine bends at the waist (the pose has one): the ribcage stands on the neck–waist line, not neck–pelvis. */
  bent: boolean;
}

/** How much of the way to what it looks at the head bows (the rest is the eyes'), as a share of the angle down to it. */
const LOOK_BOW = 0.6;

/** Unless a pose says otherwise (`legs3`), the knees are this far either side of the middle (figure units; Idle's), the feet meeting. */
const DEFAULT_LEGS = { knees: 7, feet: 0.8 };

/** How high the centre of the wax round the shins is off the floor when they lie on it (figure units): half its thickness. */
const FLOOR = 5;

/**
 * A two-bone arm in space from `shoulder` to a hand on `target` (as far as it reaches), the elbow bending toward `bend`.
 */
function reach3(shoulder: P3, target: P3, upper: number, fore: number, bend: P3): { elbow: P3; hand: P3 } {
  const d3: P3 = [target[0] - shoulder[0], target[1] - shoulder[1], target[2] - shoulder[2]];
  const d = Math.hypot(...d3) || 1;
  const u: P3 = [d3[0] / d, d3[1] / d, d3[2] / d];
  const reachD = Math.min(d, upper + fore - 1e-6);
  const along = (upper * upper - fore * fore + reachD * reachD) / (2 * reachD);
  const off = Math.sqrt(Math.max(0, upper * upper - along * along));
  // The bend direction, squared to the line from the shoulder to the hand.
  const k = bend[0] * u[0] + bend[1] * u[1] + bend[2] * u[2];
  const p: P3 = [bend[0] - u[0] * k, bend[1] - u[1] * k, bend[2] - u[2] * k];
  const pl = Math.hypot(...p) || 1;
  const elbow: P3 = [shoulder[0] + u[0] * along + (p[0] / pl) * off, shoulder[1] + u[1] * along + (p[1] / pl) * off, shoulder[2] + u[2] * along + (p[2] / pl) * off];
  const hand: P3 = [shoulder[0] + u[0] * reachD, shoulder[1] + u[1] * reachD, shoulder[2] + u[2] * reachD];
  return { elbow, hand };
}

/** A flat pose lifted into 3D space: see the file's note. `hand`: the hand that holds the weapon. */
export function liftPose(drawn: Skeleton, handGiven: Side = "right"): Rig3 {
  // (A pose may be drawn differently in 3D, and say which hand its weapon arm is.)
  const raw: Skeleton = drawn.for3d ? { ...drawn, ...drawn.for3d } : drawn;
  const hand: Side = raw.hand3 ?? handGiven;
  // The torso at its true length; the limbs from the middle (neck and hip), so they stay in the side plane.
  const base = fitTorso(raw);
  const { skeleton: s, drop } = fitLimbs(base, { weaponShoulder: base.neck, freeShoulder: base.neck, leadHip: base.hip, rearHip: base.hip });
  const sign = (side: Side) => (side === "right" ? 1 : -1);
  const to3 = (p: Pt, lat = 0): P3 => [lat * U, (FEET_Y - (p[1] + drop)) * U, (p[0] - 50) * U];
  const sh = SHOULDER_HALF, hp = HIP_HALF;
  const weaponLat = sign(hand) * sh, freeLat = -weaponLat;

  // The shoulders sit a little below the neck.
  const shoulder = (lat: number): P3 => { const n = to3(base.neck, lat); return [n[0], n[1] - 1.5 * U, n[2]]; };
  /** An arm: hanging from its shoulder in the side plane, or (a T-pose) straight out sideways. */
  const arm = (a: { elbow: Pt; hand: Pt }, lat: number): { elbow: P3; hand: P3 } => {
    if (raw.armsOut) {
      const out = Math.sign(lat);
      const sp = shoulder(lat);
      return { elbow: [sp[0] + out * RIG.upperArm * U, sp[1], sp[2]], hand: [sp[0] + out * (RIG.upperArm + RIG.forearm) * U, sp[1], sp[2]] };
    }
    return { elbow: to3(a.elbow, lat), hand: to3(a.hand, lat) };
  };
  // The legs mirror each other: both knees and both feet at the average of the pose's two, the knees apart and the feet meeting, in every
  // pose (the knees are not shared), as far apart as `legs3` says or as Idle's.
  const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  // They are always their true length (the flat drawings shorten them for how a pose is seen). Each bone keeps the direction its pose gave
  // it, and rests on the floor rather than going through it: a knee or foot that would sink is put on the floor, as far along as the length
  // leaves it.
  const thighLen = RIG.thigh * U, shinLen = RIG.shin * U, floorAt = FLOOR * U;
  const mirrored = (side: Side) => {
    const k = raw.legs3 ?? DEFAULT_LEGS, sg = sign(side);
    const hipAt = to3(base.hip, sg * hp);
    const kneeP = mid(base.leadLeg.knee, base.rearLeg.knee), footP = mid(base.leadLeg.foot, base.rearLeg.foot);
    /**
     * A bone from `from` of this length that ends `toward[0]` to the side of it (the knees and feet have their places across the body), and
     * otherwise points up and ahead as the pose drew it (`toward[1]`, `toward[2]`), kept on or above the floor.
     */
    const bone = (from: P3, toward: P3, length: number): P3 => {
      const flat = Math.sqrt(Math.max(0, length ** 2 - toward[0] ** 2)); // its length in the plane it points up and ahead in
      const n = Math.hypot(toward[1], toward[2]) || 1;
      const to: P3 = [from[0] + toward[0], from[1] + (toward[1] / n) * flat, from[2] + (toward[2] / n) * flat];
      if (to[1] >= floorAt) return to;
      const room = Math.sqrt(Math.max(0, length ** 2 - (from[1] - floorAt) ** 2 - toward[0] ** 2));
      return [to[0], floorAt, from[2] + (toward[2] < 0 ? -room : room)];
    };
    const kneeSide = sg * k.knees * U, footSide = sg * k.feet * U;
    const knee = bone(hipAt, [kneeSide - hipAt[0], -(kneeP[1] - base.hip[1]) * U, (kneeP[0] - base.hip[0]) * U], thighLen);
    const foot = bone(knee, [footSide - kneeSide, -(footP[1] - kneeP[1]) * U, (footP[0] - kneeP[0]) * U], shinLen);
    return { knee, foot };
  };

  const weaponArm = arm(s.weaponArm, weaponLat), freeArm = arm(s.freeArm, freeLat);
  const byHand = (side: Side) => (side === hand ? weaponArm : freeArm);
  const byLead = mirrored;

  const joints: Record<Joint, P3> = {
    head: to3(base.head), neck: to3(base.neck), pelvis: to3(base.hip),
    waist: to3(base.waist ?? [base.hip[0] + (base.neck[0] - base.hip[0]) * (RIG.lowerTorso / RIG.torso), base.hip[1] + (base.neck[1] - base.hip[1]) * (RIG.lowerTorso / RIG.torso)]),
    shoulderR: shoulder(sh), shoulderL: shoulder(-sh),
    hipR: to3(base.hip, hp), hipL: to3(base.hip, -hp),
    elbowR: byHand("right").elbow, handR: byHand("right").hand, elbowL: byHand("left").elbow, handL: byHand("left").hand,
    kneeR: byLead("right").knee, footR: byLead("right").foot, kneeL: byLead("left").knee, footL: byLead("left").foot,
  };
  // Sitting back: the upper body drops with the pelvis, and the legs lie on the floor under it, with the thighs on top.
  let lowered = 0;
  if (raw.legs3?.sit !== undefined || raw.legs3?.ahead !== undefined) {
    const k = raw.legs3;
    // The pelvis is at the height asked for, or a thigh's length above the knees on the floor, the knees where they are asked to be.
    const sitAt = k.ahead !== undefined
      ? FLOOR * U + Math.sqrt(Math.max(0, thighLen ** 2 - (k.ahead * U) ** 2 - ((k.knees - HIP_HALF) * U) ** 2))
      : k.sit! * U;
    lowered = sitAt - joints.pelvis[1];
    // Legs leaning sideways: the pelvis, and the whole body on it, and the knees go over a quarter of the swing, the feet all of it.
    const swing = k.swing ?? 0, over = swing * 0.25 * U;
    for (const j of JOINTS) if (!/^(knee|foot)/.test(j)) joints[j] = [joints[j][0] + over, joints[j][1] + lowered, joints[j][2]];
    const onFloor = FLOOR * U;
    const thigh = thighLen;
    // (The wax round the shins is as long as the thigh: it is what it sits on.)
    const shin = thigh;
    for (const side of ["R", "L"] as const) {
      const sg = side === "R" ? 1 : -1, hipAt = joints[`hip${side}` as Joint];
      const kx = sg * k.knees * U + over, fx = sg * k.feet * U + swing * U;
      // The knee is a thigh's length from the hip, forward; the foot a shin's length back from the knee, on the floor.
      const kz = hipAt[2] + (k.ahead !== undefined ? k.ahead * U : Math.sqrt(Math.max(0, thigh ** 2 - (hipAt[1] - onFloor) ** 2 - (kx - hipAt[0]) ** 2)));
      const fz = kz - Math.sqrt(Math.max(0, shin ** 2 - (kx - fx) ** 2));
      joints[`knee${side}` as Joint] = [kx, onFloor, kz];
      joints[`foot${side}` as Joint] = [fx, onFloor, fz];
    }
  }
  // The back straightened: everything above the pelvis pitched up about the pelvis, as one block.
  if (raw.pitch3) {
    const a = (raw.pitch3 * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), pv = joints.pelvis;
    // (The arms go with it too, unless the pose reaches them to hand spots (`arms3`) afterwards.)
    const turning = raw.arms3 ? (["waist", "neck", "head", "shoulderR", "shoulderL"] as const) : (["waist", "neck", "head", "shoulderR", "shoulderL", "elbowR", "handR", "elbowL", "handL"] as const);
    for (const j of turning) {
      const y = joints[j][1] - pv[1], z = joints[j][2] - pv[2];
      joints[j] = [joints[j][0], pv[1] + z * s + y * c, pv[2] + z * c - y * s];
    }
  }
  // The shoulders and ribcage twisted about the spine: the right shoulder down, the left one up (the ribcage's width follows the shoulder line).
  if (raw.roll3) {
    const a = (-raw.roll3 * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), n = joints.neck, w = joints.waist;
    const ax = [n[0] - w[0], n[1] - w[1], n[2] - w[2]], al = Math.hypot(...ax) || 1, u = [ax[0] / al, ax[1] / al, ax[2] / al];
    for (const j of ["shoulderR", "shoulderL"] as const) {
      const v = [joints[j][0] - n[0], joints[j][1] - n[1], joints[j][2] - n[2]];
      const dot = v[0] * u[0] + v[1] * u[1] + v[2] * u[2];
      const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      // (Rodrigues: v turned by `a` about the axis u.)
      joints[j] = [0, 1, 2].map(i => n[i] + v[i] * c + cross[i] * s + u[i] * dot * (1 - c)) as unknown as P3;
    }
  }
  // Shoulders turned: the right one back and the left one forward.
  if (raw.twist3) {
    const t = raw.twist3 * U;
    joints.shoulderR = [joints.shoulderR[0], joints.shoulderR[1], joints.shoulderR[2] - t];
    joints.shoulderL = [joints.shoulderL[0], joints.shoulderL[1], joints.shoulderL[2] + t];
  }
  // Leaning to one side: the spine curves over from the pelvis, the shoulders roll.
  if (raw.lean3) {
    const { shift, tilt } = raw.lean3;
    const over = (j: Joint, share: number, up = 0) => { const p = joints[j]; joints[j] = [p[0] + shift * share * U, p[1] + up * U, p[2]]; };
    /** `j` moved along the line from `from` so that it is as far from it as it was. */
    const keep = (j: Joint, from: Joint, len: number) => {
      const a = joints[from], b = joints[j], d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1;
      joints[j] = [a[0] + ((b[0] - a[0]) / d) * len, a[1] + ((b[1] - a[1]) / d) * len, a[2] + ((b[2] - a[2]) / d) * len];
    };
    const len = (a: Joint, b: Joint) => Math.hypot(joints[a][0] - joints[b][0], joints[a][1] - joints[b][1], joints[a][2] - joints[b][2]);
    const lumbar = len("waist", "pelvis"), ribs = len("neck", "waist"), skull = len("head", "neck");
    over("waist", 0.25); keep("waist", "pelvis", lumbar);
    over("neck", 1); keep("neck", "waist", ribs);
    over("head", 1); keep("head", "neck", skull);
    over("shoulderR", 1, -tilt); over("shoulderL", 1, tilt);
  }
  // The ribcage turned about its own axis (waist to neck): the shoulders turn about the line, and the arms on them turn rigidly with them, so each
  // arm keeps its place in the shoulders' own frame; unless the pose reaches its arms to hand spots (`arms3`) next, which then take the turned shoulders as
  // they are.
  if (raw.spin3) {
    const a = (raw.spin3 * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), n = joints.neck, w = joints.waist;
    const ax = [n[0] - w[0], n[1] - w[1], n[2] - w[2]], al = Math.hypot(...ax) || 1, u = [ax[0] / al, ax[1] / al, ax[2] / al];
    /** A point turned about the ribcage's axis, through the neck (Rodrigues). */
    const spin = (p: P3): P3 => {
      const v = [p[0] - n[0], p[1] - n[1], p[2] - n[2]], dot = v[0] * u[0] + v[1] * u[1] + v[2] * u[2];
      const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      return [0, 1, 2].map(i => n[i] + v[i] * c + cross[i] * s + u[i] * dot * (1 - c)) as unknown as P3;
    };
    for (const j of (raw.arms3 ? ["shoulderR", "shoulderL"] : ["shoulderR", "shoulderL", "elbowR", "handR", "elbowL", "handL"]) as Joint[]) joints[j] = spin(joints[j]);
  }
  // Where the hands go (`arms3`): each arm reaches its spot, the elbow bending toward the side it should.
  if (raw.arms3) {
    for (const side of ["R", "L"] as const) {
      const plan = raw.arms3[side === "R" ? "right" : "left"], sg = side === "R" ? 1 : -1, sh3 = joints[`shoulder${side}` as Joint];
      // (This pose may stretch its arms, `adjust`, as the flat drawings do.)
      const adj = raw.adjust ?? {}, isWeapon = (side === "R") === (hand === "right");
      const upper = RIG.upperArm * ((isWeapon ? adj.weaponUpper : adj.freeUpper) ?? 1) * U, fore = RIG.forearm * ((isWeapon ? adj.weaponFore : adj.freeFore) ?? 1) * U;
      if ("dirs" in plan) {
        // Directions as they end up, after the body above the pelvis is turned (`turn3`): turned back the other way here, and turned with the arm after.
        const a = ((raw.turn3 ?? 0) * Math.PI) / 180, c = Math.cos(a), s2 = Math.sin(a);
        const dir = (d: readonly [number, number, number]): P3 => {
          const n = Math.hypot(...d) || 1, x = d[0] / n, z = d[2] / n;
          return [x * c - z * s2, d[1] / n, x * s2 + z * c];
        };
        const [u, f] = [dir(plan.dirs[0]), dir(plan.dirs[1])];
        const elbow: P3 = [sh3[0] + u[0] * upper, sh3[1] + u[1] * upper, sh3[2] + u[2] * upper];
        joints[`elbow${side}` as Joint] = elbow;
        joints[`hand${side}` as Joint] = [elbow[0] + f[0] * fore, elbow[1] + f[1] * fore, elbow[2] + f[2] * fore];
        continue;
      }
      /** A direction as it ends up on the figure, turned back the other way for the body's turn (`turn3`), which is applied to the arm after. */
      const unturned = (d: readonly [number, number, number]): P3 => {
        const a = ((raw.turn3 ?? 0) * Math.PI) / 180, c = Math.cos(a), s2 = Math.sin(a), n = Math.hypot(...d) || 1, x = d[0] / n, z = d[2] / n;
        return [x * c - z * s2, d[1] / n, x * s2 + z * c];
      };
      let target: P3, bend: P3 = [sg * 0.4, 0, -1];
      if ("aim" in plan) {
        const d = unturned(plan.aim.dir), reachLen = (upper + fore) * (plan.aim.reach ?? 1);
        target = [sh3[0] + d[0] * reachLen, sh3[1] + d[1] * reachLen, sh3[2] + d[2] * reachLen];
        const b = plan.aim.bend;
        if (b === "shoulders" || b === "-shoulders") {
          // Along the shoulder line, outward from this arm's shoulder (or inward): the plane the arm bends in holds the shoulder line.
          const other = joints[side === "R" ? "shoulderL" : "shoulderR"], k = b === "shoulders" ? 1 : -1;
          bend = [(sh3[0] - other[0]) * k, (sh3[1] - other[1]) * k, (sh3[2] - other[2]) * k];
        } else if (b) bend = unturned(b);
      } else if ("plant" in plan) {
        if (plan.plant.bend) bend = [plan.plant.bend[0] * sg, plan.plant.bend[1], plan.plant.bend[2]];
        // Resting on the floor: `reach` of the arm's length from the shoulder, so the hand lands as far ahead as that puts it.
        const down = sh3[1] - 2.5 * U, across = plan.plant.out * U, arm = (upper + fore) * (plan.plant.reach ?? 1);
        target = [sh3[0] + sg * across, 2.5 * U, sh3[2] + Math.sqrt(Math.max(0, arm * arm - down * down - across * across)) + (plan.plant.shift ?? 0) * U];
      } else {
        target = [plan.to[0] * U * sg, plan.to[1] * U, joints.pelvis[2] + plan.to[2] * U];
        if (plan.bend) bend = [plan.bend[0] * sg, plan.bend[1], plan.bend[2]];
      }
      const { elbow, hand: reached } = reach3(sh3, target, upper, fore, bend);
      joints[`elbow${side}` as Joint] = elbow;
      joints[`hand${side}` as Joint] = reached;
    }
  }
  // A held thing sits where the pose put it relative to the weapon hand.
  const prop = raw.prop && ((): { kind: "wax" | "flame"; at: P3 } => {
    const h2 = base.weaponArm.hand, hand3 = hand === "right" ? joints.handR : joints.handL; // (relative to where the pose drew the hand, not the fitted one)
    return { kind: raw.prop!.kind, at: [hand3[0], hand3[1] - (raw.prop!.at[1] - h2[1]) * U, hand3[2] + (raw.prop!.at[0] - h2[0]) * U] };
  })();
  // The whole body above the pelvis turned to one side as one block, about the vertical through the pelvis: the lower spine, ribcage, neck,
  // head, shoulders, arms (their hands too) and what they hold all keep their relative positions and angles to each other; only those between
  // the pelvis and the spine change. Everything below the pelvis stays put.
  let heldAt = prop;
  // The head and forearms tipped back (away from what the figure faces), in the plane it faces along.
  {
    /** `p` tipped back by `deg` about `pivot`: what is above the pivot goes toward the back. */
    const tipped = (p: P3, pivot: P3, deg: number): P3 => {
      const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), y = p[1] - pivot[1], z = p[2] - pivot[2];
      return [p[0], pivot[1] + y * c + z * s, pivot[2] + z * c - y * s];
    };
    const heldHand: Joint = hand === "right" ? "handR" : "handL", heldWas = joints[heldHand];
    // (An arm swung sideways about the vertical through its shoulder, after it is tipped.)
    const spreadArms = () => {
      for (const [side, deg] of [["R", raw.spread3?.right], ["L", raw.spread3?.left]] as const) {
        if (!deg) continue;
        const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), sh = joints[`shoulder${side}` as Joint];
        for (const j of [`elbow${side}`, `hand${side}`] as Joint[]) {
          const x = joints[j][0] - sh[0], z = joints[j][2] - sh[2];
          joints[j] = [sh[0] + x * c + z * s, joints[j][1], sh[2] - x * s + z * c];
        }
      }
    };
    if (raw.head3) joints.head = tipped(joints.head, joints.neck, raw.head3);
    for (const [side, deg] of [["R", raw.arm3?.right], ["L", raw.arm3?.left]] as const) {
      if (!deg) continue;
      joints[`elbow${side}` as Joint] = tipped(joints[`elbow${side}` as Joint], joints[`shoulder${side}` as Joint], deg);
      joints[`hand${side}` as Joint] = tipped(joints[`hand${side}` as Joint], joints[`shoulder${side}` as Joint], deg);
    }
    spreadArms();
    if (raw.forearm3?.right) joints.handR = tipped(joints.handR, joints.elbowR, raw.forearm3.right);
    if (raw.forearm3?.left) joints.handL = tipped(joints.handL, joints.elbowL, raw.forearm3.left);
    // What the weapon hand holds goes with it.
    if (heldAt) heldAt = { kind: heldAt.kind, at: [heldAt.at[0] + joints[heldHand][0] - heldWas[0], heldAt.at[1] + joints[heldHand][1] - heldWas[1], heldAt.at[2] + joints[heldHand][2] - heldWas[2]] };
    // The face bows toward what is held (a share of the way: the neck only lets it go so far).
    if (raw.look3 === "prop" && heldAt) {
      const to = [heldAt.at[0] - joints.head[0], heldAt.at[1] - joints.head[1], heldAt.at[2] - joints.head[2]];
      const pitch = (Math.atan2(to[1], Math.hypot(to[0], to[2])) * 180) / Math.PI; // negative: looking down
      joints.head = tipped(joints.head, joints.neck, pitch * LOOK_BOW);
    } else if (raw.look3 && raw.look3 !== "prop") {
      joints.head = [raw.look3.head[0] * U, raw.look3.head[1] * U, raw.look3.head[2] * U];
    }
  }
  if (raw.turn3) {
    const a = (raw.turn3 * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), pv = joints.pelvis;
    /** A point turned about the pelvis: the figure's front goes toward its right, its right goes back. */
    const turn = (p: P3): P3 => [pv[0] + (p[0] - pv[0]) * c + (p[2] - pv[2]) * s, p[1], pv[2] - (p[0] - pv[0]) * s + (p[2] - pv[2]) * c];
    for (const j of ["waist", "neck", "head", "shoulderR", "shoulderL", "elbowR", "handR", "elbowL", "handL"] as const) joints[j] = turn(joints[j]);
    if (prop) heldAt = { kind: prop.kind, at: turn(prop.at) };
  }
  // Where the face points: at what is held, if the pose has it look at that.
  let gaze: P3 | undefined;
  if (raw.look3 === "prop" && heldAt) {
    const to = [heldAt.at[0] - joints.head[0], heldAt.at[1] - joints.head[1], heldAt.at[2] - joints.head[2]], n = Math.hypot(...to) || 1;
    gaze = [to[0] / n, to[1] / n, to[2] / n];
  } else if (raw.look3 && raw.look3 !== "prop") {
    const g = raw.look3.gaze, n = Math.hypot(...g) || 1;
    gaze = [g[0] / n, g[1] / n, g[2] / n];
  }
  return { joints, prop: heldAt, propHidden: raw.hideProp3, gaze, weaponHand: hand, bent: !!raw.waist };
}

/**
 * The ribcage a frail figure has (the sleepwalkers' too, see `Ribcage` in StickFigure): a skinny ellipse, a quarter of the way
 * down the spine from the neck, as wide as the shoulders and shallow, standing along the spine. Returns its centre and the three
 * axes it stands on (unit vectors in body space), and its half sizes, in meters.
 */
export function ribcageOf(rig: Rig3) {
  const { neck, waist } = rig.joints;
  // A spine that bends at the waist: the ribcage stands on the line from the waist to the neck, and the whole spine sets its size.
  const pelvis = rig.bent ? waist : rig.joints.pelvis;
  const sub3 = (a: P3, b: P3): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const norm = (a: P3): P3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const spine = sub3(neck, pelvis);
  const len = rig.bent ? Math.hypot(...spine) + Math.hypot(...sub3(waist, rig.joints.pelvis)) : Math.hypot(...spine);
  // It stands along the spine, always: it can't come away from it. Its width runs along the line of the shoulders, as far as that is square to
  // the spine (so it rolls with them), and across the body if the shoulder line lies along the spine; its depth is what is left.
  const up = norm(spine);
  const line = sub3(rig.joints.shoulderR, rig.joints.shoulderL), along = line[0] * up[0] + line[1] * up[1] + line[2] * up[2];
  const squared = (v: P3): P3 => { const k = v[0] * up[0] + v[1] * up[1] + v[2] * up[2]; return norm([v[0] - up[0] * k, v[1] - up[1] * k, v[2] - up[2] * k]); };
  const side = Math.abs(along) / (Math.hypot(...line) || 1) > 0.8 ? squared([1, 0, 0]) : squared(line);
  const fwd: P3 = [side[1] * up[2] - side[2] * up[1], side[2] * up[0] - side[0] * up[2], side[0] * up[1] - side[1] * up[0]];
  const centre: P3 = [neck[0] - up[0] * len * 0.25, neck[1] - up[1] * len * 0.25, neck[2] - up[2] * len * 0.25];
  return { centre, side, up, fwd, halfHeight: len * 0.3, halfWidth: RIB_HALF_WIDTH * U, halfDepth: RIB_HALF_DEPTH * U };
}

/** The ribcage's half width (as the sleepwalkers') and half depth, in figure units. */
const RIB_HALF_WIDTH = 6.6, RIB_HALF_DEPTH = 4.5;

/** How far an arch bows out from the line between its ends, and how thick it is at its end, as shares of that line's length. */
const ARCH_BOW = 0.8, ARCH_THICK = 0.13;

/**
 * A swing's arch in body space, from where a hand was (`from`) to where it ends (`to`): half a crescent moon. It starts at a point and grows
 * steadily thicker, and ends blunt where it is thickest. Its outer edge bows toward what the figure faces, square to the line between the two
 * points (so a swing that goes forward and down arches up and forward); the inner edge lies on the hollow side of it. Each edge is a function
 * of how far along it is, 0 to 1; the outer one passes through both points. `thick`: how thick it ends, in meters (the weapon's damaging part: a blade, a
 * brick; the arch is what that part sweeps through); by default a share of the line's length.
 */
export function swingArc(from: P3, to: P3, thick?: number): { outer: (t: number) => P3; inner: (t: number) => P3; normal: P3 } {
  const chord: P3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]], length = Math.hypot(...chord) || 1;
  const dir: P3 = [chord[0] / length, chord[1] / length, chord[2] / length];
  // Forward, with the part along the chord taken out: the way the arch bows (up, if the chord runs straight forward).
  const ahead = dir[2], bowRaw: P3 = [-dir[0] * ahead, -dir[1] * ahead, 1 - dir[2] * ahead], n = Math.hypot(...bowRaw);
  const bow: P3 = n > 0.2 ? [bowRaw[0] / n, bowRaw[1] / n, bowRaw[2] / n] : [0, 1, 0];
  // (A quadratic curve bows half as far as its control point is off the chord.)
  const control: P3 = [(from[0] + to[0]) / 2 + bow[0] * ARCH_BOW * length * 2, (from[1] + to[1]) / 2 + bow[1] * ARCH_BOW * length * 2, (from[2] + to[2]) / 2 + bow[2] * ARCH_BOW * length * 2];
  const outer = (t: number): P3 => {
    const a = (1 - t) * (1 - t), b = 2 * t * (1 - t), c = t * t;
    return [a * from[0] + b * control[0] + c * to[0], a * from[1] + b * control[1] + c * to[1], a * from[2] + b * control[2] + c * to[2]];
  };
  const inner = (t: number): P3 => {
    // The hollow side: square to the way the curve is going, toward the line between the ends (against the bow).
    const tan: P3 = [2 * (1 - t) * (control[0] - from[0]) + 2 * t * (to[0] - control[0]), 2 * (1 - t) * (control[1] - from[1]) + 2 * t * (to[1] - control[1]), 2 * (1 - t) * (control[2] - from[2]) + 2 * t * (to[2] - control[2])];
    const tl = Math.hypot(...tan) || 1, tu: P3 = [tan[0] / tl, tan[1] / tl, tan[2] / tl];
    const along = -(bow[0] * tu[0] + bow[1] * tu[1] + bow[2] * tu[2]);
    const hollow: P3 = [-bow[0] - tu[0] * along, -bow[1] - tu[1] * along, -bow[2] - tu[2] * along], hl = Math.hypot(...hollow) || 1;
    const p = outer(t), width = (thick ?? ARCH_THICK * length) * t; // nothing at the start, all of it at the end
    return [p[0] + (hollow[0] / hl) * width, p[1] + (hollow[1] / hl) * width, p[2] + (hollow[2] / hl) * width];
  };
  // The plane it lies in: square to the chord and to the way it bows.
  const cr: P3 = [dir[1] * bow[2] - dir[2] * bow[1], dir[2] * bow[0] - dir[0] * bow[2], dir[0] * bow[1] - dir[1] * bow[0]], cl = Math.hypot(...cr) || 1;
  return { outer, inner, normal: [cr[0] / cl, cr[1] / cl, cr[2] / cl] };
}

/**
 * A weapon held in the figure's right hand, in every pose: it points on along the forearm (from the elbow through the hand), `reach` figure units
 * long, and is kept off the floor (a hand resting on the floor holds it level, or a little up, pointing the way the forearm points along the ground).
 * Returns the hand, the way the weapon points (a unit vector in body space) and its far end.
 */
export function weaponOf(rig: Rig3, reach: number): { hand: P3; axis: P3; tip: P3 } {
  const e = rig.joints.elbowR, h = rig.joints.handR;
  return held(h, [h[0] - e[0], h[1] - e[1], h[2] - e[2]], reach);
}

/** A weapon from `h` pointing along `raw` (any length), `reach` long, turned up just enough to keep its far end off the floor. */
function held(h: P3, raw: P3, reach: number, floor = 1.5): { hand: P3; axis: P3; tip: P3 } {
  const len = reach * U, n = Math.hypot(...raw) || 1;
  let axis: P3 = [raw[0] / n, raw[1] / n, raw[2] / n];
  const lowest = floor * U; // (the far end stays this far off the floor at least)
  if (h[1] + axis[1] * len < lowest) {
    const up = Math.max(-1, Math.min(1, (lowest - h[1]) / len)), flat = Math.hypot(axis[0], axis[2]) || 1, k = Math.sqrt(Math.max(0, 1 - up * up)) / flat;
    axis = [axis[0] * k, up, axis[2] * k];
  }
  return { hand: h, axis, tip: [h[0] + axis[0] * len, h[1] + axis[1] * len, h[2] + axis[2] * len] };
}

/**
 * How a weapon is held in a pose, where it should not just follow the forearm: `across` it, square to the forearm and pointing up; out to its `side`
 * (clear of the face, where the flame is cradled); or resting on the `ground` ahead of the hand, toward what it faces.
 */
export type Hold = "across" | "along" | "side" | "ground" | "down" | "stab" | "toHand";

/**
 * The weapon in the right hand, held as `hold` says (by the forearm, if none). `plane`: the normal of the plane of a swing the weapon is part of: then
 * `across` is square to the forearm and lies in that plane, and `along` is the forearm's own line brought into it, so the blade can lie in it; `down` points
 * on the way the forearm goes, tipped down until the far end touches the floor (in that plane); `stab` points down at the floor, a little back, away from what
 * it faces (a reverse grip brought down); `toHand` points through the other hand, so that hand can hold it too.
 */
export function weaponHold(rig: Rig3, reach: number, hold?: Hold, plane?: P3): { hand: P3; axis: P3; tip: P3 } {
  if (!hold) return weaponOf(rig, reach);
  const e = rig.joints.elbowR, h = rig.joints.handR;
  if (hold === "ground") return held(h, [0, 0, 1], reach);
  if (hold === "side") return held(h, [0.95, -0.05, -0.3], reach);
  if (hold === "stab" || hold === "toHand") {
    let a: P3 = [0, -0.95, -0.3];
    if (hold === "toHand") {
      const l = rig.joints.handL, v: P3 = [l[0] - h[0], l[1] - h[1], l[2] - h[2]];
      if (Math.hypot(...v) < 0.1) return weaponHold(rig, reach, "along", plane); // (hands together: no line between them)
      a = v;
    } else if (plane) {
      const k = a[0] * plane[0] + a[1] * plane[1] + a[2] * plane[2];
      a = [a[0] - plane[0] * k, a[1] - plane[1] * k, a[2] - plane[2] * k];
    }
    return held(h, a, reach);
  }
  if (hold === "down") {
    // Level, the way the forearm goes (in the plane, if there is one), then tipped down so the far end just touches the floor.
    const fwd: P3 = [h[0] - e[0], 0, h[2] - e[2]];
    let flat: P3 = fwd;
    if (plane) { flat = [plane[2], 0, -plane[0]]; if (flat[0] * fwd[0] + flat[2] * fwd[2] < 0) flat = [-flat[0], 0, -flat[2]]; }
    const fn = Math.hypot(...flat) || 1, sin = Math.max(-1, Math.min(1, (0.5 * U - h[1]) / (reach * U))), cos = Math.sqrt(1 - sin * sin);
    return held(h, fn < 1e-6 ? [0, sin, cos] : [(flat[0] / fn) * cos, sin, (flat[2] / fn) * cos], reach, 0.5);
  }
  const f0: P3 = [h[0] - e[0], h[1] - e[1], h[2] - e[2]], fl = Math.hypot(...f0) || 1, f: P3 = [f0[0] / fl, f0[1] / fl, f0[2] / fl];
  if (hold === "along") {
    if (!plane) return weaponOf(rig, reach);
    const k = f[0] * plane[0] + f[1] * plane[1] + f[2] * plane[2];
    return held(h, [f[0] - plane[0] * k, f[1] - plane[1] * k, f[2] - plane[2] * k], reach);
  }
  const out = (v: P3): P3 => { const k = v[0] * f[0] + v[1] * f[1] + v[2] * f[2]; return [v[0] - f[0] * k, v[1] - f[1] * k, v[2] - f[2] * k]; };
  let a: P3;
  if (plane) {
    // (square to the forearm and to the plane's normal: the line in the plane that is square to the forearm; pointing up, or on to the front if level)
    a = [plane[1] * f[2] - plane[2] * f[1], plane[2] * f[0] - plane[0] * f[2], plane[0] * f[1] - plane[1] * f[0]];
    if (Math.hypot(...a) < 0.3) a = out([0, 1, 0]);
    else if (a[1] < -0.05 || (Math.abs(a[1]) <= 0.05 && a[2] < 0)) a = [-a[0], -a[1], -a[2]];
  } else {
    a = out([0, 1, 0]);
  }
  if (Math.hypot(...a) < 0.3) a = out([0, 0, 1]); // (a forearm standing straight up or down: it points on to the front)
  return held(h, a, reach);
}

/**
 * The frame a weapon model is set in, from the way it points (`axis`): its broad face turned as `face` says (a direction the face's normal should lean
 * toward, say the plane of a swing), or as upright as it can be. Returns the model's y and z axes in body space. (Body space is a mirror image of the
 * model's, so the third axis is the cross product turned round.)
 */
export function weaponFrame(axis: P3, face?: P3): { ay: P3; az: P3 } {
  const cross = (a: P3, b: P3): P3 => [-(a[1] * b[2] - a[2] * b[1]), -(a[2] * b[0] - a[0] * b[2]), -(a[0] * b[1] - a[1] * b[0])];
  const unit = (v: P3): P3 => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const out = (v: P3): P3 => { const k = v[0] * axis[0] + v[1] * axis[1] + v[2] * axis[2]; return [v[0] - axis[0] * k, v[1] - axis[1] * k, v[2] - axis[2] * k]; };
  if (face) {
    const n = out(face);
    if (Math.hypot(...n) > 0.2) { const az = unit(n); return { ay: cross(az, axis), az }; }
  }
  let ay = out([0, 1, 0]);
  if (Math.hypot(...ay) < 0.3) ay = out([0, 0, 1]); // (pointing up or down: its face turns to the front)
  ay = unit(ay);
  return { ay, az: cross(axis, ay) };
}

/** A joint on the screen. */
export interface Seen { sx: number; sy: number; ppm: number; depth: number }

/**
 * A rig standing on the floor at `at`, facing `yaw`, seen through `cam` on a screen of w × h: where each
 * joint lands, how far ahead of the camera it is and how big a meter is there. `scale`: its size relative to a normal figure.
 */
export function placeRig(rig: Rig3, at: Vec, yaw: number, cam: Cam, w: number, h: number, scale = 1) {
  const fwd = facingVec(yaw), rgt = rightOf(yaw);
  const see = (p: P3): Seen => projectPoint(cam, { x: at.x + (rgt.x * p[0] + fwd.x * p[2]) * scale, z: at.z + (rgt.z * p[0] + fwd.z * p[2]) * scale }, p[1] * scale, w, h);
  const seen = Object.fromEntries(JOINTS.map(j => [j, see(rig.joints[j])])) as Record<Joint, Seen>;
  return { seen, see, prop: rig.prop && { kind: rig.prop.kind, at: see(rig.prop.at) }, origin: see([0, 0, 0]) };
}

/**
 * Which way a figure faces. Normally toward the player (`playerAt`) — the 3/4 front view. The Model viewer
 * can show it straight on (facing the camera, or away from it), or the same 3/4 turned away from the camera
 * (3/4 back).
 */
export function facingYaw(cam: Cam, at: Vec, playerAt: Vec | undefined, view: "front" | "back", straight: boolean): number {
  const toCamera = cam.yaw + Math.PI;
  if (straight) return view === "front" ? toCamera : cam.yaw;
  const d = playerAt ? sub(playerAt, at) : undefined;
  const toward = d && Math.hypot(d.x, d.z) > 0.05 ? yawOf(d) : toCamera;
  if (view === "front") return toward;
  // 3/4 back: the same turn toward the player, but with its back to the camera (its depth flipped).
  const f = facingVec(toward), r = rightOf(cam.yaw), fw = facingVec(cam.yaw);
  const across = f.x * r.x + f.z * r.z, ahead = f.x * fw.x + f.z * fw.z;
  return yawOf({ x: r.x * across - fw.x * ahead, z: r.z * across - fw.z * ahead });
}
