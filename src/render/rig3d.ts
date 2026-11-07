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
  /** Which hand holds the weapon (the figure's weapon arm), as the pose is authored. */
  weaponHand: Side;
  /** The spine bends at the waist (the pose has one): the ribcage stands on the neck–waist line, not neck–pelvis. */
  bent: boolean;
}

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
export function liftPose(drawn: Skeleton, hand: Side = "right"): Rig3 {
  // (A pose may be drawn differently in 3D.)
  const raw: Skeleton = drawn.for3d ? { ...drawn, ...drawn.for3d } : drawn;
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
    for (const j of ["waist", "neck", "head", "shoulderR", "shoulderL"] as const) {
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
    const h2 = s.weaponArm.hand, hand3 = weaponArm.hand;
    return { kind: raw.prop!.kind, at: [hand3[0], hand3[1] - (raw.prop!.at[1] - h2[1]) * U + lowered, hand3[2] + (raw.prop!.at[0] - h2[0]) * U] };
  })();
  // The whole body above the pelvis turned to one side as one block, about the vertical through the pelvis: the lower spine, ribcage, neck,
  // head, shoulders, arms (their hands too) and what they hold all keep their relative positions and angles to each other; only those between
  // the pelvis and the spine change. Everything below the pelvis stays put.
  let heldAt = prop;
  if (raw.turn3) {
    const a = (raw.turn3 * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), pv = joints.pelvis;
    /** A point turned about the pelvis: the figure's front goes toward its right, its right goes back. */
    const turn = (p: P3): P3 => [pv[0] + (p[0] - pv[0]) * c + (p[2] - pv[2]) * s, p[1], pv[2] - (p[0] - pv[0]) * s + (p[2] - pv[2]) * c];
    for (const j of ["waist", "neck", "head", "shoulderR", "shoulderL", "elbowR", "handR", "elbowL", "handL"] as const) joints[j] = turn(joints[j]);
    if (prop) heldAt = { kind: prop.kind, at: turn(prop.at) };
  }
  return { joints, prop: heldAt, weaponHand: hand, bent: !!raw.waist };
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
