/**
 * warden.tsx — how the Penitent Warden is drawn. Drawing only; his rules live in bestiary.ts.
 *
 * A tall figure in a gray cloak, its hem dirtied with wax, the hood hiding his face but for a
 * waxed, beak-like mask. Right hand: the flail (once an incense burner, now full of wax) on a
 * chain. Left arm: encased in wax, a candle. Its look follows his flame:
 *  - lit: Unsealed, the wax arm burns at the hand like a candle.
 *  - out: Sealed, a cold wax arm, smoke rising from the hand.
 *  - scorched: phase two, the wax torn off: a black, burnt arm, the hand engulfed in flames.
 *
 * Poses are drawn facing right like every figure (the scene mirrors enemies). Seen from the
 * front at a 3/4 angle while facing left, his right arm is the far one and the candle arm the
 * near one, so the flail sits behind his body and the candle arm in front of it.
 */
import { useEffect, useId, useState } from "react";
import type { Skeleton } from "./render";

type Pt = readonly [number, number];
export type CandleArm = "lit" | "out" | "scorched";

/** A Warden pose: the skeleton (weaponArm = the flail arm, freeArm = the candle arm) plus the flail's head. */
export interface WardenSkeleton extends Skeleton {
  /** Where the flail's head is. */
  ball: Pt;
  /** The flail whirling: behind him (a vertical circle) or overhead (a flat one). */
  spin?: "behind" | "over";
  /** The trail of a full spin the flail has just finished (like a weapon's swing trail). */
  spinTrail?: boolean;
  /** The pose he moves on to: the last spin trail is centered on where its flail spins. */
  trailEndsAt?: WardenPoseName;
  /** Fire pouring from the candle hand. It's the hand's own flame, stretched out by the motion,
   *  so the usual flame on the hand isn't drawn. */
  burst?: "fan" | "blast";
  /** Head tilt in degrees: negative lifts the chin (looking down his beak at you). */
  tilt?: number;
  /** He looks back over his shoulder: the hood and beak face the other way. */
  faceBack?: boolean;
  /** How much his face turns toward the camera, 0 (profile) to 1: the opening widens toward the
   *  middle of the hood and the beak shortens, pointing more at you. */
  faceFront?: number;
  /** The flail's handle, in degrees (0 = facing direction). Default: pointing toward its head. */
  handle?: number;
  /** The flail's head is held (in the candle hand), not hanging: `ball` is used as given. */
  held?: boolean;
  /** The candle hand goes behind his head (drawn under the hood). */
  armBehindHead?: boolean;
  /** The candle arm goes behind his body altogether (under the cloak and the hood). */
  armBehindCloak?: boolean;
  /** The candle arm starts from his armpit, where the rip in his cloak begins (turned sideways,
   *  that's further toward you than his usual shoulder). */
  shoulderAtRip?: boolean;
  /** How far he has turned his candle side toward you: 0 is his usual 3/4, 1 fully sideways,
   *  and negative turns the other way (flail shoulder toward you). */
  turn?: number;
}

type Limbs = Pick<WardenSkeleton, "head" | "neck" | "hip" | "leadLeg" | "rearLeg">;
const pose = (
  body: Limbs,
  flail: { elbow: Pt; hand: Pt; ball: Pt },
  candle: { elbow: Pt; hand: Pt },
  extra: Partial<Pick<WardenSkeleton, "spin" | "burst" | "tilt" | "handle" | "held" | "armBehindHead" | "turn" | "faceBack" | "faceFront" | "spinTrail" | "armBehindCloak" | "shoulderAtRip" | "trailEndsAt">> = {},
): WardenSkeleton => ({
  ...body,
  weaponArm: { elbow: flail.elbow, hand: flail.hand },
  freeArm: candle,
  weapon: { at: flail.hand, angle: 0 },
  ball: flail.ball,
  ...extra,
});
const legs = (lk: Pt, lf: Pt, rk: Pt, rf: Pt) => ({ leadLeg: { knee: lk, foot: lf }, rearLeg: { knee: rk, foot: rf } });

export type WardenPoseName =
  | "wd-idle" | "wd-shoulder" | "wd-arm-back" | "wd-arm-chest" | "wd-clutch-flail"
  | "wd-spin-behind" | "wd-spin-over" | "wd-kneel"
  | "wd-swing" | "wd-rising" | "wd-slam" | "wd-punch" | "wd-fan" | "wd-blast"
  | "wd-chain-guard" | "wd-wax-guard" | "wd-stride" | "wd-usurp" | "wd-clutch-arm" | "wd-fallen"
  | "wd-wound-up";

export const WARDEN_POSES: Record<WardenPoseName, WardenSkeleton> = {
  /* ---------- Stances ---------- */
  // Idle: chest out and leaning back, chin raised, looking down his beak at everyone. Both
  // hands held a little out from his sides; the flail's head rests on the ground beside him.
  "wd-idle": pose(
    { head: [46, 19], neck: [48, 31], hip: [52, 66], ...legs([56, 90], [59, 114], [48, 90], [44, 114]) },
    { elbow: [59, 49], hand: [66, 60], ball: [77, 108] },
    { elbow: [41, 49], hand: [35, 60] },
    { tilt: -18, handle: 70 },
  ),
  // The candle arm flexed high, elbow up near his shoulder, the hand tucked behind his head.
  // Behind him, the flail held low and pointing back, its head resting on the ground.
  "wd-shoulder": pose(
    { head: [52, 22], neck: [51, 33], hip: [48, 66], ...legs([58, 90], [64, 114], [42, 91], [36, 114]) },
    { elbow: [45, 53], hand: [38, 70], ball: [16, 120] },
    { elbow: [65, 33], hand: [44, 14] },
    { handle: 165, armBehindHead: true, turn: 1 },
  ),
  // Wind Up Flail, as the Rest goes through: like Wax Shoulder In but hunched lower, the wax
  // arm bent with its elbow toward you instead of raised behind his head, the flail arm
  // stretched far back and raised a little, the trails of its last spins fading around the
  // handle's end (no head drawn: it's still whirling).
  "wd-wound-up": pose(
    { head: [55, 28], neck: [52, 39], hip: [47, 71], ...legs([59, 93], [66, 114], [40, 94], [33, 114]) },
    { elbow: [38, 52], hand: [29, 53], ball: [12, 130] },
    // The wax arm bent, its elbow pointing at you (foreshortened): a short forearm tucked in
    // under his head, its flame (or smoke) still showing beside the hood.
    { elbow: [71, 55], hand: [66, 50] },
    { handle: 238, shoulderAtRip: true, armBehindHead: true, turn: 1, spinTrail: true, trailEndsAt: "wd-spin-behind" },
  ),
  // Wax Arm Back: the candle arm drawn far back, ready to throw it forward.
  // Wax Arm Back: turned flail shoulder first, hunched low and leaning back, his weight sunk
  // onto his left leg (bent sharply, knee poking out behind), looking back over his shoulder,
  // the candle arm coiled to punch, elbow raised behind him. The flail drags on the floor behind. His left leg, stretched
  // back, pokes out of the cloak through the rip (on his far side now, out of sight).
  "wd-arm-back": pose(
    { head: [40, 38], neck: [44, 48], hip: [49, 77], ...legs([64, 96], [77, 114], [20, 95], [37, 114]) },
    { elbow: [58, 63], hand: [57, 78], ball: [18, 122] },
    // Pointing away from you, the arm is foreshortened: a short upper arm back to the raised
    // elbow, then the forearm showing beside his head, angled slightly down to the fist.
    { elbow: [31, 37], hand: [24, 41] },
    { turn: -1, handle: 155, faceBack: true, faceFront: 0.6, tilt: 22 },
  ),
  // Arm Over Chest: hunched, the candle arm folded across his chest.
  "wd-arm-chest": pose(
    { head: [55, 26], neck: [53, 37], hip: [49, 68], ...legs([57, 91], [61, 114], [44, 91], [40, 114]) },
    { elbow: [43, 52], hand: [42, 66], ball: [45, 89] },
    { elbow: [62, 53], hand: [46, 46] },
  ),
  // Flail Clutched: the flail drawn up short, its head gripped close, feet set wide.
  "wd-clutch-flail": pose(
    { head: [52, 22], neck: [51, 33], hip: [48, 67], ...legs([61, 90], [67, 114], [40, 91], [34, 114]) },
    { elbow: [58, 50], hand: [56, 40], ball: [67, 57] },
    { elbow: [58, 55], hand: [64, 52] },
  ),
  // Flail Spinning Behind: like Wind Up Flail's rest pose but hunched even lower, the wax arm
  // bent with its elbow toward you, the flail whirling in a circle behind him.
  "wd-spin-behind": pose(
    { head: [58, 34], neck: [54, 45], hip: [47, 75], ...legs([60, 95], [67, 114], [38, 97], [31, 114]) },
    { elbow: [36, 63], hand: [25, 71], ball: [0, 96] },
    { elbow: [73, 61], hand: [68, 56] },
    { handle: 172, shoulderAtRip: true, armBehindHead: true, turn: 1, spin: "behind" },
  ),
  // Flail Spinning Overhead: the flail arm raised, the head circling above him.
  "wd-spin-over": pose(
    { head: [50, 22], neck: [50, 33], hip: [50, 67], ...legs([59, 90], [65, 114], [42, 90], [36, 114]) },
    { elbow: [56, 20], hand: [55, 8], ball: [76, 4] },
    { elbow: [41, 46], hand: [45, 56] },
    { spin: "over" },
  ),
  // Kneeling: one knee down, head bowed, the flail resting on the ground.
  "wd-kneel": pose(
    { head: [58, 46], neck: [55, 57], hip: [48, 84], ...legs([64, 92], [64, 114], [42, 112], [26, 114]) },
    { elbow: [62, 72], hand: [67, 83], ball: [82, 110] },
    { elbow: [48, 73], hand: [57, 77] },
  ),

  /* ---------- Actions ---------- */
  // Flail Swing lands: lunging, the flail swept out level in front of him.
  "wd-swing": pose(
    { head: [60, 26], neck: [57, 37], hip: [48, 68], ...legs([66, 91], [76, 114], [37, 93], [26, 114]) },
    { elbow: [70, 46], hand: [80, 50], ball: [101, 52] },
    { elbow: [44, 50], hand: [38, 59] },
  ),
  // Rising Flail lands: swung up from below, the head flung high in front.
  "wd-rising": pose(
    { head: [56, 22], neck: [54, 33], hip: [48, 67], ...legs([62, 90], [70, 114], [40, 91], [32, 114]) },
    { elbow: [66, 31], hand: [72, 20], ball: [88, 2] },
    { elbow: [44, 48], hand: [40, 58] },
  ),
  // Flail Slam lands: bent double, the head smashed into the ground before him.
  "wd-slam": pose(
    { head: [66, 40], neck: [61, 49], hip: [46, 72], ...legs([64, 94], [74, 114], [36, 95], [24, 114]) },
    { elbow: [72, 64], hand: [78, 75], ball: [95, 110] },
    { elbow: [52, 65], hand: [62, 71] },
  ),
  // Wax Punch lands: the cold wax fist driven forward.
  "wd-punch": pose(
    { head: [58, 24], neck: [55, 35], hip: [48, 68], ...legs([64, 91], [74, 114], [38, 93], [26, 114]) },
    { elbow: [44, 50], hand: [40, 62], ball: [38, 85] },
    { elbow: [70, 39], hand: [85, 38] },
  ),
  // Fan Flames lands: a backhand swat out of Wax Shoulder In. He turns the other way (flail
  // shoulder in, right leg forward, stance low), the candle arm flung out straight behind him,
  // pointing away from you. The fan of flames it throws flies at you (see the scene's projectiles).
  "wd-fan": pose(
    { head: [61, 31], neck: [57, 42], hip: [50, 74], ...legs([67, 94], [78, 114], [37, 96], [25, 114]) },
    { elbow: [72, 58], hand: [70, 72], ball: [78, 120] },
    { elbow: [33, 45], hand: [20, 42] },
    { burst: "fan", turn: -1, handle: 80 },
  ),
  // Flame Blast: feet planted wide, the candle arm thrust out at you, toward the camera as much
  // as forward, so it's foreshortened: short segments, the hand low and close. A fireball
  // bursts from it (see the scene's projectiles).
  "wd-blast": pose(
    { head: [54, 24], neck: [52, 35], hip: [48, 69], ...legs([62, 91], [71, 114], [37, 93], [27, 114]) },
    { elbow: [42, 51], hand: [38, 63], ball: [36, 86] },
    { elbow: [60, 47], hand: [68, 54] },
    { burst: "blast" },
  ),
  // Chain Guard: the chain held taut across his body, the flail's head in the candle hand.
  "wd-chain-guard": pose(
    { head: [50, 24], neck: [50, 35], hip: [49, 68], ...legs([59, 92], [64, 114], [40, 92], [35, 114]) },
    { elbow: [61, 47], hand: [66, 36], ball: [44, 40] },
    { elbow: [42, 48], hand: [46, 36] },
    { held: true, handle: 200 },
  ),
  // Wax Guard: the wax forearm raised upright before his mask.
  "wd-wax-guard": pose(
    { head: [48, 24], neck: [49, 35], hip: [49, 68], ...legs([59, 92], [64, 114], [40, 92], [35, 114]) },
    { elbow: [42, 50], hand: [38, 62], ball: [35, 85] },
    { elbow: [61, 50], hand: [61, 24] },
  ),
  // Stride: a long step in, the flail trailing.
  "wd-stride": pose(
    { head: [55, 20], neck: [54, 31], hip: [50, 64], ...legs([66, 86], [77, 114], [40, 90], [28, 114]) },
    { elbow: [44, 46], hand: [40, 58], ball: [31, 78] },
    { elbow: [60, 46], hand: [67, 53] },
  ),
  // Usurp Flame: lunging low, the candle hand reaching out to seize a flame.
  "wd-usurp": pose(
    { head: [62, 32], neck: [58, 42], hip: [47, 70], ...legs([63, 92], [72, 114], [36, 94], [26, 114]) },
    { elbow: [46, 54], hand: [40, 66], ball: [36, 89] },
    { elbow: [72, 57], hand: [85, 66] },
  ),
  // Clutch Arm: hunched over the candle arm, hugging it to his chest.
  "wd-clutch-arm": pose(
    { head: [56, 32], neck: [53, 42], hip: [48, 70], ...legs([57, 92], [61, 114], [42, 92], [38, 114]) },
    { elbow: [44, 56], hand: [42, 70], ball: [47, 93] },
    { elbow: [60, 61], hand: [51, 52] },
  ),
  // Staggered: fallen to a knee, propped on the flail's handle, head hanging.
  "wd-fallen": pose(
    { head: [66, 58], neck: [60, 66], hip: [44, 86], ...legs([58, 98], [62, 114], [40, 112], [24, 114]) },
    { elbow: [64, 84], hand: [70, 99], ball: [87, 112] },
    { elbow: [54, 82], hand: [58, 100] },
  ),
};

/* ============================================================
 * Drawing
 * ============================================================ */

const limb = (...pts: Pt[]) => pts.map(p => p.join(",")).join(" ");
const add = (a: Pt, b: Pt, k = 1): Pt => [a[0] + b[0] * k, a[1] + b[1] * k];
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** A teardrop flame standing on (x, y), `s` times the base size. */
function Flame({ at, s = 1, className = "" }: { at: Pt; s?: number; className?: string }) {
  const [x, y] = at;
  const h = 11 * s, w = 4.2 * s;
  return (
    <g className={`fig-flame ${className}`}>
      <path d={`M${x} ${y - h} C${x + w * 1.1} ${y - h * 0.45} ${x + w} ${y} ${x} ${y} C${x - w} ${y} ${x - w * 1.1} ${y - h * 0.45} ${x} ${y - h} Z`} />
      <path
        d={`M${x} ${y - h * 0.5} C${x + w * 0.45} ${y - h * 0.2} ${x + w * 0.45} ${y} ${x} ${y} C${x - w * 0.45} ${y} ${x - w * 0.45} ${y - h * 0.2} ${x} ${y - h * 0.5} Z`}
        className="fig-flame-core"
      />
    </g>
  );
}

/** Which way across his body his ripped (waxed, left) side is, on the page. */
function ripSide(s: WardenSkeleton): Pt {
  const [nx, ny] = s.neck;
  const [hx, hy] = s.hip;
  const len = Math.hypot(hx - nx, hy - ny) || 1;
  const n: Pt = [-(hy - ny) / len, (hx - nx) / len];
  const { knee, foot } = (s.turn ?? 0) >= 0.5 ? s.leadLeg : s.rearLeg; // his left leg
  const out = (knee[0] + foot[0]) / 2 >= hx ? 1 : -1;
  return n[0] * out >= 0 ? n : [-n[0], -n[1]];
}

/** Where the rip in his cloak begins: at his left armpit. */
const ripArmpit = (s: WardenSkeleton): Pt => add(lerp(s.neck, s.hip, 0.18), ripSide(s), 3);

/** Where the cloak's hem drags: on the ground. */
const HEM_Y = 113;

/**
 * The cloak: from the shoulders all the way to the ground, its hem dirtied with wax. It is torn
 * along his waxed side: sealed shut with wax from the armpit to the hip, then failing, gaping
 * open down to the ground. Only that leg (his left, the near one) shows through.
 */
function Cloak({ s }: { s: WardenSkeleton }) {
  const clipId = `rip${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [nx, ny] = s.neck;
  const [hx, hy] = s.hip;
  const len = Math.hypot(hx - nx, hy - ny) || 1;
  const n: Pt = [-(hy - ny) / len, (hx - nx) / len]; // across the body
  const shA = add([nx, ny + 2], n, 7), shB = add([nx, ny + 2], n, -7);
  const waA = add([hx, hy], n, 10), waB = add([hx, hy], n, -10);
  // Turned the other way (flail shoulder toward you), the ripped side faces away: no rip to see,
  // but his left leg can stick out past the cloak's edge, behind it.
  const away = (s.turn ?? 0) <= -0.5;
  const xs = away
    ? [s.leadLeg.knee[0], s.leadLeg.foot[0], hx]
    : [s.leadLeg.knee[0], s.leadLeg.foot[0], s.rearLeg.knee[0], s.rearLeg.foot[0], hx];
  const hemF: Pt = [Math.max(...xs) + 6, HEM_Y], hemB: Pt = [Math.min(...xs) - 6, HEM_Y];
  // Keep the sides from crossing: the side of the body facing forward meets the front of the hem.
  const [waF, waBk, shF, shBk] = waA[0] >= waB[0] ? [waA, waB, shA, shB] : [waB, waA, shB, shA];
  const d = [
    `M${shBk[0]} ${shBk[1]}`,
    `Q${waBk[0] - 3} ${waBk[1]} ${hemB[0]} ${hemB[1]}`,
    `L${hemF[0]} ${hemF[1]}`,
    `Q${waF[0] + 3} ${waF[1]} ${shF[0]} ${shF[1]}`,
    "Z",
  ].join(" ");

  // His near leg is his left: from the front at 3/4 it's the one further back; turned sideways
  // (candle side toward you), the one stepping forward.
  const nearLeg = (s.turn ?? 0) >= 0.5 ? s.leadLeg : s.rearLeg;
  const { knee, foot } = nearLeg;
  // The rip runs down his waxed side. From the armpit to the hip it's sealed shut with wax; from
  // the hip down the wax is failing, and it gapes wider toward the ground.
  const side = ripSide(s);
  const armpit = ripArmpit(s);
  // The leg hangs from the side of his hips, not from the middle of the stick.
  const hipJoint = add(s.hip, side, 5);
  const thigh: Pt = [knee[0] - hipJoint[0], knee[1] - hipJoint[1]];
  const tl = Math.hypot(thigh[0], thigh[1]) || 1;
  const across: Pt = [-thigh[1] / tl, thigh[0] / tl];
  const top = lerp(hipJoint, knee, 0.1);
  const seam = `M${armpit[0]} ${armpit[1]} Q${add(lerp(armpit, top, 0.5), side, 1.5).join(" ")} ${top[0]} ${top[1]}`;
  const stitches = [0.2, 0.45, 0.7, 0.92].map(t => lerp(armpit, top, t));
  const kneeA = add(knee, across, 4.5), kneeB = add(knee, across, -4.5);
  const footA: Pt = [Math.min(foot[0], knee[0]) - 6, HEM_Y], footB: Pt = [Math.max(foot[0], knee[0]) + 6, HEM_Y];
  const [kL, kR] = kneeA[0] <= kneeB[0] ? [kneeA, kneeB] : [kneeB, kneeA];
  const rimL = `M${top[0]} ${top[1]} Q${kL[0]} ${kL[1]} ${footA[0]} ${footA[1]}`;
  const rimR = `M${top[0]} ${top[1]} Q${kR[0]} ${kR[1]} ${footB[0]} ${footB[1]}`;
  const gap = `${rimL} L${footB[0]} ${footB[1]} Q${kR[0]} ${kR[1]} ${top[0]} ${top[1]} Z`;
  // The last strands of wax still bridging the rip: close together near the hip, giving out below.
  const strands = [0.12, 0.26, 0.45].map(t => {
    const l = lerp(lerp(top, kL, t), lerp(kL, footA, t), t);
    const r = lerp(lerp(top, kR, t), lerp(kR, footB, t), t);
    return { l, r };
  });
  if (away) {
    // The rip runs along the cloak's back edge now: wax lines it from the hip down to the ground.
    const q = (t: number): Pt => [
      (1 - t) ** 2 * shBk[0] + 2 * t * (1 - t) * (waBk[0] - 3) + t ** 2 * hemB[0],
      (1 - t) ** 2 * shBk[1] + 2 * t * (1 - t) * waBk[1] + t ** 2 * hemB[1],
    ];
    const edge: Pt[] = [];
    for (let i = 0; i <= 20; i++) { const p = q(i / 20); if (p[1] >= hy - 2) edge.push(p); }
    return (
      <g>
        <polyline points={limb(hipJoint, knee, foot)} className="fig-limb fig-far" />
        <path d={d} className="fig-cloak" />
        <polyline points={limb(...edge)} className="fig-rip-wax" />
        <line x1={hemB[0]} y1={HEM_Y} x2={hemF[0]} y2={HEM_Y} className="fig-cloak-wax" />
      </g>
    );
  }
  return (
    <g>
      <path d={d} className="fig-cloak" />
      <path d={gap} className="fig-cloak-inside" />
      {/* The leg shows only through the rip: over the cloak's lining, under the cloak itself. */}
      <clipPath id={clipId}><path d={gap} /></clipPath>
      <polyline points={limb(hipJoint, knee, foot)} className="fig-limb" clipPath={`url(#${clipId})`} />
      <path d={rimL} className="fig-rip-wax" />
      <path d={rimR} className="fig-rip-wax" />
      <path d={seam} className="fig-seam" />
      <path d={seam} className="fig-seam-wax" />
      {stitches.map((p, i) => (
        <line key={`st${i}`} x1={p[0] - 2.2} y1={p[1] - 0.8} x2={p[0] + 2.2} y2={p[1] + 0.8} className="fig-rip-strand" />
      ))}
      {strands.map(({ l, r }, i) => (
        <path key={i} d={`M${l[0]} ${l[1]} Q${(l[0] + r[0]) / 2} ${(l[1] + r[1]) / 2 + 3} ${r[0]} ${r[1]}`} className="fig-rip-strand" />
      ))}
      {/* The wax-crusted hem, broken where the rip opens. */}
      <line x1={hemB[0]} y1={HEM_Y} x2={Math.max(hemB[0], footA[0])} y2={HEM_Y} className="fig-cloak-wax" />
      <line x1={Math.min(hemF[0], footB[0])} y1={HEM_Y} x2={hemF[0]} y2={HEM_Y} className="fig-cloak-wax" />
    </g>
  );
}

/**
 * Which way his chest faces on the page: forward (+1) as usual, or backward (-1) when he has
 * turned flail shoulder first, his chest swung around away from you.
 */
const frontSide = (s: WardenSkeleton) => ((s.turn ?? 0) <= -0.5 ? -1 : 1);

/**
 * The stain where wax from his beak has run down the front of his cloak for years: dull, wide and
 * streaked, under the fresh drool. Only seen while the cloak's front faces you.
 */
function Stain({ s }: { s: WardenSkeleton }) {
  if ((s.turn ?? 0) >= 0.5) return null;
  const [nx, ny] = s.neck;
  const [hx, hy] = s.hip;
  const len = Math.hypot(hx - nx, hy - ny) || 1;
  let n: Pt = [-(hy - ny) / len, (hx - nx) / len];
  if (n[0] * frontSide(s) < 0) n = [-n[0], -n[1]]; // toward the front
  const along = (t: number, out: number) => add(lerp(s.neck, s.hip, t), n, out);
  const d = [
    `M${along(0.1, 2)[0]} ${along(0.1, 2)[1]}`,
    `Q${along(0.35, 1)[0]} ${along(0.35, 1)[1]} ${along(0.6, 2.5)[0]} ${along(0.6, 2.5)[1]}`,
    `Q${along(0.66, 4)[0]} ${along(0.66, 4)[1]} ${along(0.72, 5)[0]} ${along(0.72, 5)[1]}`,
    `Q${along(0.62, 6.5)[0]} ${along(0.62, 6.5)[1]} ${along(0.56, 7.5)[0]} ${along(0.56, 7.5)[1]}`,
    `Q${along(0.3, 8.5)[0]} ${along(0.3, 8.5)[1]} ${along(0.1, 8)[0]} ${along(0.1, 8)[1]}`,
    "Z",
  ].join(" ");
  const run = (t0: number, t1: number, out: number) =>
    `M${along(t0, out)[0]} ${along(t0, out)[1]} L${along(t1, out)[0]} ${along(t1, out)[1]}`;
  return (
    <g>
      <path d={d} className="fig-stain" />
      <path d={`${run(0.5, 0.86, 3.5)} ${run(0.55, 0.8, 6.5)}`} className="fig-stain-run" />
    </g>
  );
}

/** Wax that has run from under his beak down the front of his cloak, like a long beard. */
function Beard({ s }: { s: WardenSkeleton }) {
  const [x, y] = s.head;
  // Looking back over his shoulder, everything about the face is mirrored.
  const f = s.faceBack ? -1 : 1;
  const t = (f * (s.tilt ?? 0) * Math.PI) / 180;
  const rot = (p: Pt): Pt => {
    const dx = p[0] - x, dy = p[1] - y;
    return [x + dx * Math.cos(t) - dy * Math.sin(t), y + dx * Math.sin(t) + dy * Math.cos(t)];
  };
  // It runs out of the hood's opening, from under the beak.
  const from = rot([x + f * (5.5 - 2.6 * (s.faceFront ?? 0)), y + 5]);
  const w = 3.2;
  // Turned sideways either way (his front out of sight, or swung around), or looking back, only
  // the bit hanging from the hood shows.
  if (Math.abs(s.turn ?? 0) >= 0.5 || s.faceBack) {
    const tipY = from[1] + 9;
    return (
      <g className="fig-beard">
        <path d={`M${from[0] - w} ${from[1]} Q${from[0] - 1.5} ${tipY - 3} ${from[0]} ${tipY} Q${from[0] + 1.5} ${tipY - 3} ${from[0] + w} ${from[1]} Z`} />
        <circle cx={from[0]} cy={tipY + 1.5} r={1.5} />
      </g>
    );
  }
  // Facing you: down along the front of the cloak, ending in a few drips.
  const [nx, ny] = s.neck;
  const [hx, hy] = s.hip;
  const len = Math.hypot(hx - nx, hy - ny) || 1;
  let n: Pt = [-(hy - ny) / len, (hx - nx) / len];
  if (n[0] * frontSide(s) < 0) n = [-n[0], -n[1]]; // toward the front
  const chest = add(lerp(s.neck, s.hip, 0.3), n, 4);
  const end = add(lerp(s.neck, s.hip, 0.62), n, 3);
  const d = [
    `M${from[0] - w} ${from[1]}`,
    `Q${chest[0] - w} ${chest[1]} ${end[0] - 1} ${end[1]}`,
    `Q${end[0]} ${end[1] + 3} ${end[0] + 1} ${end[1]}`,
    `Q${chest[0] + w} ${chest[1]} ${from[0] + w} ${from[1]}`,
    "Z",
  ].join(" ");
  const drip2 = add(lerp(s.neck, s.hip, 0.45), n, 6.5);
  return (
    <g className="fig-beard">
      <path d={d} />
      <path d={`M${from[0] + 2} ${from[1] + 2} Q${chest[0] + 4} ${chest[1]} ${drip2[0]} ${drip2[1]}`} className="fig-beard-strand" />
      <circle cx={end[0]} cy={end[1] + 1} r={1.8} />
      <circle cx={drip2[0]} cy={drip2[1] + 0.5} r={1.2} />
    </g>
  );
}

/** The hood, shadowed, with only the waxed beak of his mask poking out. */
function Hood({ s }: { s: WardenSkeleton }) {
  const [x, y] = s.head;
  const k = s.faceFront ?? 0;
  const bx = x + 3 - 2.6 * k; // where the beak leaves the mask
  // The round of the hood and its point behind, one flat color with no outline. A raised chin
  // tilts only the mask inside, so the hood keeps its point.
  return (
    <g transform={s.faceBack ? `translate(${2 * x} 0) scale(-1 1)` : undefined}>
      <path d={`M${x - 3} ${y - 8} L${x - 12} ${y - 12} L${x - 9} ${y + 1} Z`} className="fig-hood" />
      <circle cx={x} cy={y} r={9.5} className="fig-hood" />
      <g transform={s.tilt ? `rotate(${s.tilt} ${x} ${y})` : undefined}>
        <ellipse cx={x + 3.5 - 2.6 * k} cy={y + 1.5} rx={4.6 + k} ry={6} className="fig-hood-dark" />
        {/* The beak: wax, curving forward and down (shorter as it turns toward the camera). */}
        <path d={`M${bx} ${y - 1.5} Q${bx + 9 - 5 * k} ${y + 1 + k} ${bx + 13 - 8 * k} ${y + 9 + 3 * k} Q${bx + 6 - 3 * k} ${y + 6.5 + k} ${bx} ${y + 5} Z`} className="fig-beak" />
      </g>
    </g>
  );
}

/** Half the handle's length: held in the middle, the chain hangs from its far end. */
const HANDLE_HALF = 15;
/** The chain's length, the same in every pose. Each pose's `ball` only says which way it hangs. */
const CHAIN = 34;
/** Where the ground is: the flail's head rests on it rather than going through. */
const GROUND = 108;

/** The flail as drawn: the handle's ends (the chain hangs from `tip`) and where its head ends up. */
export function flailOf(s: WardenSkeleton) {
  const hand = s.weaponArm.hand;
  const deg = s.handle ?? (Math.atan2(s.ball[1] - hand[1], s.ball[0] - hand[0]) * 180) / Math.PI;
  const dir: Pt = [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
  const tip = add(hand, dir, HANDLE_HALF), butt = add(hand, dir, -HANDLE_HALF);
  if (s.held) return { tip, butt, ball: s.ball, resting: false };
  const to: Pt = [s.ball[0] - tip[0], s.ball[1] - tip[1]];
  const len = Math.hypot(to[0], to[1]);
  let ball: Pt = len > 0.01 ? add(tip, to, CHAIN / len) : add(tip, [0, CHAIN]);
  const resting = ball[1] >= GROUND;
  if (resting) ball = [ball[0], GROUND];
  return { tip, butt, ball, resting };
}

/**
 * A flail spinning too fast to see: no clear head, just a faint ring where it travels and a few
 * copies of the chain, each with a smudge of a head, flashing at random spots around the ring.
 */
function ChainBlur({ tip, r }: { tip: Pt; r: number }) {
  // 3 to 5 at a time, spread out: each in its own slice of the circle, nudged a little within it,
  // so no two are ever close.
  const pick = () => {
    const n = 3 + Math.floor(Math.random() * 3);
    const slice = (Math.PI * 2) / n, start = Math.random() * Math.PI * 2;
    return Array.from({ length: n }, (_, i) => start + slice * (i + (Math.random() - 0.5) * 0.4));
  };
  const [angles, setAngles] = useState<number[]>(() => [0, 1, 2, 3].map(i => (i / 4) * Math.PI * 2));
  useEffect(() => {
    const id = window.setInterval(() => setAngles(pick()), 110);
    return () => window.clearInterval(id);
  }, []);
  return (
    <g>
      {/* The chain's sweep, a faint disc, and the path the head travels, a faint ring. */}
      {/* The disc stops where the ring's band starts, so the band looks the same all the way across. */}
      <ellipse cx={tip[0]} cy={tip[1]} rx={r * 0.75 - 4} ry={r - 4} className="fig-spin-disc" />
      <ellipse cx={tip[0]} cy={tip[1]} rx={r * 0.75} ry={r} className="fig-spin-path" />
      {angles.map((a, i) => {
        const end: Pt = [tip[0] + Math.cos(a) * r * 0.75, tip[1] + Math.sin(a) * r];
        // The head smears along its path: stretched along the circle's tangent.
        const along = (Math.atan2(Math.cos(a) * r, -Math.sin(a) * r * 0.75) * 180) / Math.PI;
        return (
          // Each chain and its head flicker together.
          <g key={i} className="fig-chain-blur" style={{ animationDelay: `${(i * 0.09) % 0.4}s` }}>
            <line x1={tip[0]} y1={tip[1]} x2={end[0]} y2={end[1]} className="fig-chain" />
            <ellipse cx={end[0]} cy={end[1]} rx={4.4} ry={2.6} transform={`rotate(${along} ${end[0]} ${end[1]})`} className="fig-censer-smudge" />
          </g>
        );
      })}
    </g>
  );
}

/** The flail: the handle held at its middle, the chain from its tip, the wax-filled censer at the end. */
function Flail({ s }: { s: WardenSkeleton }) {
  const { tip, butt, ball, resting } = flailOf(s);
  const [bx, by] = ball;
  // The chain sags between the handle and the head; resting on the ground, it lies slack.
  const mid = lerp(tip, ball, 0.5);
  const sag: Pt = s.spin ? mid : resting ? [mid[0] + 3, by + 2] : add(mid, [0, 3]);
  // Just done spinning: the trails show where the head went (see SpinTrail); no head hangs yet.
  if (s.spinTrail) return <line x1={butt[0]} y1={butt[1]} x2={tip[0]} y2={tip[1]} className="fig-flail-handle" />;
  if (s.spin === "behind") {
    return (
      <g>
        <ChainBlur tip={tip} r={Math.hypot(bx - tip[0], by - tip[1])} />
        <line x1={butt[0]} y1={butt[1]} x2={tip[0]} y2={tip[1]} className="fig-flail-handle" />
      </g>
    );
  }
  return (
    <g>
      <line x1={butt[0]} y1={butt[1]} x2={tip[0]} y2={tip[1]} className="fig-flail-handle" />
      <path d={`M${tip[0]} ${tip[1]} Q${sag[0]} ${sag[1]} ${bx} ${by}`} className="fig-chain" />
      <circle cx={bx} cy={by} r={6} className="fig-censer" />
      <path d={`M${bx - 5.6} ${by - 1} A5.6 5.6 0 0 1 ${bx + 5.6} ${by - 1} Z`} className="fig-censer-wax" />
      <line x1={bx - 6} y1={by + 1.5} x2={bx + 6} y2={by + 1.5} className="fig-censer-band" />
    </g>
  );
}

/**
 * The trails of the spins just finished: three of them, one after the other, each a tapered
 * crescent (thickest at its end, fading) with a flash of chain and head out to where it ends.
 * The first swings wide around his shoulder and always ends up and away from him; the second
 * circles the end of the handle; the third circles where the flail keeps spinning in his next
 * pose. Drawn first, so the warden covers them.
 */
function SpinTrail({ s, shoulder }: { s: WardenSkeleton; shoulder: Pt }) {
  // Where it spins is fixed when the trails appear, so they stay put if he moves on to his next
  // pose while they're still fading.
  const [{ tip, last, r, arm }] = useState(() => {
    const f = flailOf(s);
    // The last spin is already where he'll keep spinning it in his next pose.
    const next = s.trailEndsAt ? flailOf(WARDEN_POSES[s.trailEndsAt]).tip : f.tip;
    return { tip: f.tip, last: next, r: Math.hypot(f.ball[0] - f.tip[0], f.ball[1] - f.tip[1]), arm: shoulder };
  });
  // Seen at an angle, the upright circle behind him is squeezed sideways.
  const SQUEEZE = 0.75;
  const at = (c: Pt, radius: number, a: number): Pt => [c[0] + Math.cos(a) * radius * SQUEEZE, c[1] + Math.sin(a) * radius];
  // The first spin always ends with the head up and away from him; each after it ends about half
  // a turn on from the last. Each covers three quarters of the circle.
  const FIRST = Math.atan2(-0.8, -0.6); // up and back
  const [spins] = useState(() => {
    let end = FIRST;
    return [0, 1, 2].map(i => {
      if (i) end += Math.PI + (Math.random() - 0.5) * 0.6;
      return { end, sweep: (270 * Math.PI) / 180 };
    });
  });
  const trail = (c: Pt, radius: number, end: number, sweep: number) => {
    const outer: string[] = [], inner: string[] = [];
    for (let i = 0; i <= 24; i++) {
      const k = i / 24;
      const a = end + sweep * (1 - k); // it comes round this way
      const thick = (0.22 * r * k) / radius; // thin where it starts, thick at its end
      const o = at(c, radius, a), n = at(c, radius * (1 - thick), a);
      outer.push(`${i ? "L" : "M"}${o[0]} ${o[1]}`);
      inner.unshift(`L${n[0]} ${n[1]}`);
    }
    return `${outer.join(" ")} ${inner.join(" ")} Z`;
  };
  return (
    <g>
      {spins.map(({ end, sweep }, i) => {
        const c = i === spins.length - 1 ? last : tip;
        const head = at(c, r, end);
        // The first spin's trail swings around his shoulder, the whole arm in it: a wider circle
        // through the same end point, as if winding up from further out.
        let ring = { c, radius: r, end };
        if (i === 0) {
          const dx = (head[0] - arm[0]) / SQUEEZE, dy = head[1] - arm[1];
          ring = { c: arm, radius: Math.hypot(dx, dy), end: Math.atan2(dy, dx) };
        }
        // One every 0.15 s: each trail lasts 0.3 s, its chain and head only 0.15 s. The third
        // appears just as he switches to his next pose (REST_POSE_MS in App.tsx, 0.3 s).
        const delay = { animationDelay: `${i * 0.15}s`, animationDuration: "0.3s" };
        const chainDelay = { animationDelay: `${i * 0.15}s`, animationDuration: "0.15s" };
        const [hx, hy] = head;
        return (
          <g key={i}>
            {/* With the 2nd spin, the whole circle flashes as a ring, gone by the pose change. */}
            {i === 1 && (
              <ellipse cx={c[0]} cy={c[1]} rx={r * SQUEEZE} ry={r} className="fig-ring-flash" style={{ animationDelay: "0.15s", animationDuration: "0.15s" }} />
            )}
            <path d={trail(ring.c, ring.radius, ring.end, sweep)} className="fig-trail-seq" style={delay} />
            {/* The chain and the flail's head at the end of the trail, flickering in together. */}
            <g className="fig-chain-seq" style={chainDelay}>
              <line x1={c[0]} y1={c[1]} x2={hx} y2={hy} className="fig-chain" />
              <circle cx={hx} cy={hy} r={6} className="fig-censer" />
              <path d={`M${hx - 5.6} ${hy - 1} A5.6 5.6 0 0 1 ${hx + 5.6} ${hy - 1} Z`} className="fig-censer-wax" />
              <line x1={hx - 6} y1={hy + 1.5} x2={hx + 6} y2={hy + 1.5} className="fig-censer-band" />
            </g>
          </g>
        );
      })}
    </g>
  );
}

/** The flail's whirl: a faint ring it traces as it spins. */
function Spin({ s }: { s: WardenSkeleton }) {
  const { tip: hand, ball } = flailOf(s);
  const r = Math.hypot(ball[0] - hand[0], ball[1] - hand[1]);
  if (s.spin === "behind") return null; // drawn as a blur of chains instead (see Flail)
  return <ellipse cx={hand[0] + r * 0.2} cy={hand[1] - 2} rx={r} ry={r * 0.3} className="fig-spin" />;
}

/** Just the candle arm's upper arm, from the shoulder to the elbow. */
function CandleUpperArm({ s, shoulder, arm }: { s: WardenSkeleton; shoulder: Pt; arm: CandleArm }) {
  const { elbow } = s.freeArm;
  return (
    <g>
      <polyline points={limb(shoulder, elbow)} className={arm === "scorched" ? "fig-arm-burnt" : "fig-arm-wax"} />
      {arm === "scorched" && <polyline points={limb(shoulder, elbow)} className="fig-arm-embers" />}
      <circle cx={elbow[0]} cy={elbow[1]} r={3.5} className={arm === "scorched" ? "fig-hand-burnt" : "fig-hand-wax"} />
    </g>
  );
}

/** The candle arm, from the shoulder: wax and lit, wax and cold, or scorched black and burning. */
function CandleArmEl({ s, shoulder, arm, part = "all" }: {
  s: WardenSkeleton;
  shoulder: Pt;
  arm: CandleArm;
  /** Draw only the arm, only its flame (or smoke), or both. */
  part?: "arm" | "flame" | "all";
}) {
  const { elbow, hand } = s.freeArm;
  const pts = limb(shoulder, elbow, hand);
  const drip = (t: number, l: number) => {
    const p = lerp(elbow, hand, t);
    return <line x1={p[0]} y1={p[1] + 2} x2={p[0]} y2={p[1] + 2 + l} className="fig-arm-drip" />;
  };
  const top = add(hand, [0, -3]);
  // The forearm swells toward the hand, thick with wax.
  const fl = Math.hypot(hand[0] - elbow[0], hand[1] - elbow[1]) || 1;
  const across: Pt = [-(hand[1] - elbow[1]) / fl, (hand[0] - elbow[0]) / fl];
  const forearm = [add(elbow, across, 3.5), add(hand, across, 5), add(hand, across, -5), add(elbow, across, -3.5)];
  const skin = arm === "scorched" ? "fig-hand-burnt" : "fig-hand-wax";
  const body = (
    <>
      <polyline points={limb(shoulder, elbow)} className={arm === "scorched" ? "fig-arm-burnt" : "fig-arm-wax"} />
      <polygon points={limb(...forearm)} className={skin} />
      <circle cx={elbow[0]} cy={elbow[1]} r={3.5} className={skin} />
      {arm === "scorched" && <polyline points={pts} className="fig-arm-embers" />}
      <circle cx={hand[0]} cy={hand[1]} r={5.4} className={skin} />
      {arm !== "scorched" && <>{drip(0.3, 3)}{drip(0.7, 4)}</>}
    </>
  );
  if (part === "arm") return <g>{body}</g>;
  return (
    <g>
      {part === "all" && body}
      {arm === "lit" && !s.burst && (
        <>
          <circle cx={hand[0]} cy={hand[1] - 7} r={9} className="fig-glow" />
          <Flame at={top} s={0.8} />
        </>
      )}
      {arm === "out" && (
        <>
          <path d={`M${top[0]} ${top[1]} q-3 -5 0 -9 q3 -4 -1 -9`} className="fig-smoke" />
        </>
      )}
      {arm === "scorched" && !s.burst && (
        <>
          <circle cx={hand[0]} cy={hand[1] - 6} r={13} className="fig-glow" />
          <Flame at={add(hand, [-3, 3])} s={1.1} className="fig-flame-b" />
          <Flame at={add(hand, [3, 3])} s={1.2} />
          <Flame at={add(hand, [0, 4])} s={1.6} className="fig-flame-c" />
        </>
      )}
    </g>
  );
}

/** Fire poured from the candle hand: a fan of tongues, or one long blast. */
function Burst({ s, kind }: { s: WardenSkeleton; kind: "fan" | "blast" }) {
  const [x, y] = s.freeArm.hand;
  if (kind === "blast") {
    // The flare at the palm as the fireball leaves it: a burst of tongues around the hand.
    const rays = [0, 45, 90, 135, 180, 225, 270, 315].map(a => {
      const r = (a * Math.PI) / 180;
      const len = a % 90 === 0 ? 12 : 8;
      const tip: Pt = [x + Math.cos(r) * len, y + Math.sin(r) * len];
      const l: Pt = [x + Math.cos(r + 0.35) * 4, y + Math.sin(r + 0.35) * 4];
      const rr: Pt = [x + Math.cos(r - 0.35) * 4, y + Math.sin(r - 0.35) * 4];
      return `M${l[0]} ${l[1]} L${tip[0]} ${tip[1]} L${rr[0]} ${rr[1]} Z`;
    });
    return (
      <g className="fig-burst">
        {rays.map((d, i) => <path key={i} d={d} className="fig-burst-outer" />)}
        <circle cx={x} cy={y} r={6.5} className="fig-burst-outer" />
        <circle cx={x} cy={y} r={4} className="fig-burst-inner" />
      </g>
    );
  }
  // The swat's trail: a flat sweep of flame around his side, from in front of him out to the
  // hand, dipping toward you as it passes (seen at an angle, a level circle looks like this).
  const [nx, ny] = s.neck;
  const from: Pt = [nx + 22, ny + 4];
  const mid: Pt = [(from[0] + x) / 2, Math.max(from[1], y) + 12];
  return (
    <g className="fig-burst">
      <path d={`M${from[0]} ${from[1]} Q${mid[0]} ${mid[1] + 6} ${x} ${y + 3} L${x} ${y - 3} Q${mid[0]} ${mid[1] - 6} ${from[0]} ${from[1]} Z`} className="fig-burst-outer" />
      <path d={`M${from[0] - 3} ${from[1] + 1} Q${mid[0]} ${mid[1] + 2} ${x} ${y} Q${mid[0]} ${mid[1] - 2} ${from[0] - 3} ${from[1] + 1} Z`} className="fig-burst-inner" />
    </g>
  );
}

export function WardenFigure({ s, front, arm, lingerTrail }: {
  s: WardenSkeleton;
  front: boolean;
  arm: CandleArm;
  /** Keep the spin trails of the pose he just left fading (he has already moved on). */
  lingerTrail?: boolean;
}) {
  const [nx, ny] = s.neck;
  // Turning his candle side toward you swings that shoulder forward and the flail shoulder back.
  const turn = s.turn ?? 0;
  // Turned the other way (flail shoulder toward you), the shoulders line up with the camera: the
  // flail shoulder in front of the torso, the candle shoulder hidden behind it.
  const away = Math.max(0, -turn);
  const toward = Math.max(0, turn);
  const nearShoulder: Pt = [nx - 3 + 9 * toward + away, ny + 4 - toward - 3 * away];
  const farShoulder: Pt = [nx + 3 - 9 * toward - away, ny + 2 + 3 * away];
  // Facing you (front view), his right (flail) arm is the far one and the candle arm the near one.
  const flailShoulder = front ? farShoulder : nearShoulder;
  const candleShoulder = s.shoulderAtRip ? ripArmpit(s) : front ? nearShoulder : farShoulder;
  const sleeveEnd = lerp(flailShoulder, s.weaponArm.elbow, 0.75);
  // Usually the flail arm is the far one (behind the body) and the candle arm the near one.
  // Turned flail shoulder first, they swap: the candle arm goes behind, the flail arm in front.
  const swapped = turn <= -0.5;
  const flailArm = (
    <>
      {s.spin !== "behind" && <Flail s={s} />}
      <polyline points={limb(flailShoulder, s.weaponArm.elbow, s.weaponArm.hand)} className={`fig-limb ${swapped ? "" : "fig-far"}`} />
      <polyline points={limb(flailShoulder, sleeveEnd)} className={`fig-sleeve ${swapped ? "" : "fig-sleeve-far"}`} />
    </>
  );
  const candleArm = <CandleArmEl s={s} shoulder={candleShoulder} arm={arm} />;
  // With the hand tucked under his head, the arm goes under the hood but its flame shows over it.
  const tucked = !swapped && !!s.armBehindHead && !!s.shoulderAtRip;
  return (
    <g>
      {s.spin && <Spin s={s} />}
      {(s.spinTrail || lingerTrail) && <SpinTrail s={s} shoulder={flailShoulder} />}
      {/* Whirling behind him, the flail passes behind the cloak. */}
      {s.spin === "behind" && <Flail s={s} />}
      {/* Behind the body: the cloak hides whatever it covers. */}
      {/* With both arms behind the body, the flail arm goes over the wax one. */}
      {!swapped && s.armBehindCloak && candleArm}
      {swapped ? candleArm : flailArm}
      {/* The far leg stays hidden under the cloak; the near one shows through its rip (see Cloak). */}
      <Cloak s={s} />
      <Stain s={s} />
      {/* With the rest of the arm behind him, the upper arm still comes out over the torso. */}
      {!swapped && s.armBehindCloak && <CandleUpperArm s={s} shoulder={candleShoulder} arm={arm} />}
      {!swapped && s.armBehindHead && (tucked ? <CandleArmEl s={s} shoulder={candleShoulder} arm={arm} part="arm" /> : candleArm)}
      <Hood s={s} />
      {tucked && <CandleArmEl s={s} shoulder={candleShoulder} arm={arm} part="flame" />}
      {/* The drool hangs from the hood: in front of the far side, behind whatever arm is nearest. */}
      {!swapped && <Beard s={s} />}
      {swapped ? flailArm : !s.armBehindHead && !s.armBehindCloak && candleArm}
      {swapped && <Beard s={s} />}
      {s.burst && arm !== "out" && <Burst s={s} kind={s.burst} />}
    </g>
  );
}