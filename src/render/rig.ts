/**
 * rig.ts — the figures' bones, so a figure keeps its size whatever its pose.
 *
 * Poses are written as joint positions (elbow, hand, knee, foot...), and nothing about that keeps a
 * limb the same length from one pose to the next. So every figure is re-solved to the rig when it
 * is drawn: each bone keeps the direction the pose gives it, but its length is the rig's.
 *
 * A pose can still adjust a bone (perspective: a forearm pointing at the camera, a crouch; or a
 * deliberate stretch, like the Warden's punch), with `adjust` on the pose. Those are always a
 * multiple of the true length below, never a length of their own, so the true lengths stay the
 * single source of truth.
 *
 * Applies to every figure: the player and the foes drawn in poses.ts (the waxed too), fitted as they
 * are drawn, and the Warden's poses, fitted once when the game loads (warden/skeleton.ts).
 */
import type { Side } from "../core/types";
import type { Pt } from "./geom";
import type { Skeleton } from "./poses";

/** The true length of each bone, in figure units (a 100 × 120 box). Never changes with the pose. */
export const RIG = {
  /** Neck to hip. */
  torso: 32,
  /** A torso with a waist (the spine arching): the ribcage's part, neck to waist, and the lower part, waist to hip. */
  upperTorso: 18,
  lowerTorso: 14,
  thigh: 24.5,
  shin: 24.5,
  upperArm: 14,
  forearm: 14,
} as const;

/**
 * How much a pose adjusts each bone, as a multiple of its true length (1 or missing: the true
 * length; under 1 shortens it, over 1 stretches it). `lead` and `rear` are the leg toward the facing direction and the one behind it;
 * `weapon` and `free` the arm that holds the weapon and the empty one.
 */
export interface BoneAdjust {
  torso?: number;
  leadThigh?: number; leadShin?: number;
  rearThigh?: number; rearShin?: number;
  weaponUpper?: number; weaponFore?: number;
  freeUpper?: number; freeFore?: number;
}

/** Adjusting is for perspective and deliberate reach; a bone can't collapse to nothing or grow absurd. */
const MIN_ADJUST = 0.25;
const MAX_ADJUST = 2.5;

/** Checks every pose's `adjust` when the game loads (like patterns and poses are). */
export function checkAdjust(poses: Record<string, Skeleton>) {
  for (const [name, s] of Object.entries(poses)) {
    for (const [bone, k] of Object.entries(s.adjust ?? {})) {
      if (!(k >= MIN_ADJUST && k <= MAX_ADJUST)) {
        throw new Error(`pose "${name}": ${bone} is set to ${k} of its true length (use ${MIN_ADJUST} to ${MAX_ADJUST})`);
      }
    }
  }
}

/** A point `len` from `origin`, in the direction from `a` to `b`. */
function along(origin: Pt, a: Pt, b: Pt, len: number): Pt {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const d = Math.hypot(dx, dy) || 1;
  return [origin[0] + (dx / d) * len, origin[1] + (dy / d) * len];
}

const shifted = (p: Pt, by: Pt): Pt => [p[0] + by[0], p[1] + by[1]];

/** How far behind the weapon hand the other hand holds it. */
const GRIP_GAP = 4;

/**
 * An arm of two bones that puts its hand on `target` (as far as it reaches), bending its elbow to the same
 * side as `hint`, where the pose authored it.
 */
function reachArm(shoulder: Pt, target: Pt, upper: number, fore: number, hint: Pt): { elbow: Pt; hand: Pt } {
  const dx = target[0] - shoulder[0];
  const dy = target[1] - shoulder[1];
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d, uy = dy / d;
  if (d >= upper + fore - 0.01) {
    // Out of reach: straight toward it.
    const elbow: Pt = [shoulder[0] + ux * upper, shoulder[1] + uy * upper];
    return { elbow, hand: [elbow[0] + ux * fore, elbow[1] + uy * fore] };
  }
  const along = (upper * upper - fore * fore + d * d) / (2 * d);
  const out = Math.sqrt(Math.max(0, upper * upper - along * along));
  const base: Pt = [shoulder[0] + ux * along, shoulder[1] + uy * along];
  const perp: Pt = [-uy, ux];
  const side = Math.sign((hint[0] - base[0]) * perp[0] + (hint[1] - base[1]) * perp[1]) || 1;
  return { elbow: [base[0] + perp[0] * out * side, base[1] + perp[1] * out * side], hand: target };
}

/**
 * Stage one, before the shoulders and hips are placed: the torso at its true length, rising from the
 * hip. The head, the arms and what they hold ride along with the neck.
 */
export function fitTorso(s: Skeleton): Skeleton {
  // With a waist the spine bends there: the lower part rises from the hip, the ribcage from the waist.
  const k = s.adjust?.torso ?? 1;
  const waist = s.waist && along(s.hip, s.hip, s.waist, RIG.lowerTorso * k);
  const neck = waist ? along(waist, s.waist!, s.neck, RIG.upperTorso * k) : along(s.hip, s.hip, s.neck, RIG.torso * k);
  const by: Pt = [neck[0] - s.neck[0], neck[1] - s.neck[1]];
  return {
    ...s,
    neck,
    waist,
    head: shifted(s.head, by),
    weaponArm: { elbow: shifted(s.weaponArm.elbow, by), hand: shifted(s.weaponArm.hand, by) },
    freeArm: { elbow: shifted(s.freeArm.elbow, by), hand: shifted(s.freeArm.hand, by) },
    weapon: { at: shifted(s.weapon.at, by), angle: s.weapon.angle },
    prop: s.prop && { kind: s.prop.kind, at: shifted(s.prop.at, by) },
  };
}

/** Where the limbs hang from, as the drawing places them. */
export interface Mounts {
  weaponShoulder: Pt;
  freeShoulder: Pt;
  leadHip: Pt;
  rearHip: Pt;
  /** How long the weapon is (its tier's reach), for a free hand that supports its middle. */
  weaponLength?: number;
  /** A T-pose seen at an angle: how much its sideways arms are foreshortened (1 = seen straight on). */
  across?: number;
}

/**
 * Stage two: both arms and both legs at their true lengths from their shoulders and hips. `drop` is how
 * far the whole figure must move down so the lowest foot stands where the pose put it.
 */
export function fitLimbs(s: Skeleton, m: Mounts): { skeleton: Skeleton; drop: number } {
  const k = s.adjust ?? {};
  const across = m.across ?? 1;
  // `out`: a T-pose arm, straight out sideways (toward -x for -1, +x for 1), whatever the pose wrote.
  const arm = (shoulder: Pt, a: Skeleton["weaponArm"], upper = 1, fore = 1, out?: number) => {
    if (out !== undefined) {
      const elbow: Pt = [shoulder[0] + out * RIG.upperArm * upper * across, shoulder[1]];
      return { elbow, hand: [elbow[0] + out * RIG.forearm * fore * across, elbow[1]] as Pt };
    }
    const elbow = along(shoulder, shoulder, a.elbow, RIG.upperArm * upper);
    return { elbow, hand: along(elbow, a.elbow, a.hand, RIG.forearm * fore) };
  };
  const leg = (hip: Pt, l: Skeleton["leadLeg"], thigh = 1, shin = 1) => {
    if (s.legsDown) {
      const knee: Pt = [hip[0], hip[1] + RIG.thigh * thigh];
      return { knee, foot: [knee[0], knee[1] + RIG.shin * shin] as Pt };
    }
    const knee = along(hip, hip, l.knee, RIG.thigh * thigh);
    return { knee, foot: along(knee, l.knee, l.foot, RIG.shin * shin) };
  };
  // A T-pose arm goes outward from the middle of the body: toward the side its shoulder is on (the pose's
  // `armsOut` only breaks a tie), so it works for whichever way the figure's shoulders are turned.
  const outward = (shoulder: Pt, fallback: number) => (Math.abs(shoulder[0] - s.neck[0]) > 0.5 ? Math.sign(shoulder[0] - s.neck[0]) : fallback);
  const weaponArm = arm(m.weaponShoulder, s.weaponArm, k.weaponUpper, k.weaponFore, s.armsOut && outward(m.weaponShoulder, s.armsOut));
  // Held in both hands: the free hand reaches the grip, just behind the weapon hand (toward the pommel), or,
  // supporting it, the middle of the weapon.
  const gripPoint = (): Pt => {
    const a = (s.weapon.angle * Math.PI) / 180;
    const along = s.grip === "middle" ? (m.weaponLength ?? 0) / 2 : -GRIP_GAP;
    return [weaponArm.hand[0] + Math.cos(a) * along, weaponArm.hand[1] + Math.sin(a) * along];
  };
  const freeArm = s.grip
    ? reachArm(m.freeShoulder, gripPoint(), RIG.upperArm * (k.freeUpper ?? 1), RIG.forearm * (k.freeFore ?? 1), s.freeArm.elbow)
    : arm(m.freeShoulder, s.freeArm, k.freeUpper, k.freeFore, s.armsOut && outward(m.freeShoulder, -s.armsOut));
  const leadLeg = leg(m.leadHip, s.leadLeg, k.leadThigh, k.leadShin);
  const rearLeg = leg(m.rearHip, s.rearLeg, k.rearThigh, k.rearShin);
  // A weapon held in the hand follows it; one that was dropped stays where it lies.
  const held = !!s.armsOut || !!s.grip || Math.hypot(s.weapon.at[0] - s.weaponArm.hand[0], s.weapon.at[1] - s.weaponArm.hand[1]) < 0.5;
  const standing = (l: Skeleton["leadLeg"], r: Skeleton["rearLeg"]) => Math.max(l.foot[1], r.foot[1]);
  return {
    skeleton: { ...s, weaponArm, freeArm, leadLeg, rearLeg, weapon: { at: held ? weaponArm.hand : s.weapon.at, angle: s.weapon.angle } },
    drop: standing(s.leadLeg, s.rearLeg) - standing(leadLeg, rearLeg),
  };
}

/**
 * A skeleton fitted whole, for poses fixed at load: torso, then limbs from the shoulders and hips
 * `mounts` places on the fitted torso, then every point (the pose's own extras go along via
 * `move`) shifted down by `drop`.
 */
export function rigged<T extends Skeleton>(
  s: T,
  mounts: (fitted: Skeleton) => Mounts,
  move: (fitted: T, by: Pt) => T = f => f,
): T {
  const base = fitTorso(s);
  const { skeleton, drop } = fitLimbs(base, mounts(base));
  const down = (p: Pt): Pt => [p[0], p[1] + drop];
  const out = { ...s, ...skeleton } as T;
  return move({
    ...out,
    head: down(out.head), neck: down(out.neck), hip: down(out.hip),
    weaponArm: { elbow: down(out.weaponArm.elbow), hand: down(out.weaponArm.hand) },
    freeArm: { elbow: down(out.freeArm.elbow), hand: down(out.freeArm.hand) },
    leadLeg: { knee: down(out.leadLeg.knee), foot: down(out.leadLeg.foot) },
    rearLeg: { knee: down(out.rearLeg.knee), foot: down(out.rearLeg.foot) },
    weapon: { at: down(out.weapon.at), angle: out.weapon.angle },
    prop: out.prop && { kind: out.prop.kind, at: down(out.prop.at) },
  }, [0, drop]);
}

/**
 * Which limb is whose. Poses author their limbs by role (`weaponArm`/`freeArm`, `leadLeg`/`rearLeg`); this
 * says which is the figure's right and which its left: the weapon arm is on the `hand` side, and the lead
 * leg is the `leadSide` one (default left). Use this, not near/far, to put anything on a particular limb.
 */
export function sided(s: Skeleton, hand: Side = "right") {
  const leadSide = s.leadSide ?? "left";
  const arm = (side: Side) => (side === hand ? s.weaponArm : s.freeArm);
  const leg = (side: Side) => (side === leadSide ? s.leadLeg : s.rearLeg);
  return { right: { arm: arm("right"), leg: leg("right") }, left: { arm: arm("left"), leg: leg("left") } };
}
