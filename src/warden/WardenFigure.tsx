/**
 * WardenFigure.tsx — how the Penitent Warden is drawn: his parts, layered in order. Drawing
 * only; his rules live in core/bestiary.ts.
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
import { add, lerp, limb } from "../render/geom";
import { Beard, CandleArmEl, ChainInHand, Cloak, Flail, HeadInHand, Hood, SmokePuff, Stain } from "./parts";
import { type CandleArm, FlailFire, straightOn, sweepAt, WARDEN_POSES, wardenMounts, type WardenPoseName, type WardenSkeleton } from "./skeleton";
import { SideTags } from "../render/SideTags";
import { Burst, FlameTrail, PunchTrail, RewaxTrail, SlamTrail, SpinTrail } from "./trails";

export function WardenFigure({ s: pose, front, straight, sides, arm, lingerFrom, smokeAgo, phase2Look, flailFire }: {
  s: WardenSkeleton;
  front: boolean;
  /** Seen straight on (the Model viewer): level shoulders, nothing turned, his arms and legs fitted again. */
  straight?: boolean;
  /** Label his hands and feet R and L (the Model stance). */
  sides?: boolean;
  arm: CandleArm;
  /** The rest pose he has just left: its trails keep fading (he has already moved on). */
  lingerFrom?: WardenPoseName;
  /** His flame has just been put out this long ago (ms): smoke still leaving his hand. */
  smokeAgo?: number;
  /** Phase two's look (black wax, burning inside), whatever his arm is doing. */
  phase2Look?: boolean;
  /** The flail is on fire. */
  flailFire?: boolean;
}) {
  const s = straight ? straightOn(pose, front) : pose;
  const turn = straight ? 0 : s.shoulderTurn ?? s.turn ?? 0;
  const { flailShoulder, candleShoulder } = wardenMounts(s, front, straight);
  const sleeveEnd = lerp(flailShoulder, s.weaponArm.elbow, 0.75);
  // Usually the flail arm is the far one (behind the body) and the candle arm the near one.
  // Turned flail shoulder first, they swap: the candle arm goes behind, the flail arm in front.
  const swapped = turn <= -0.5;
  // The forearm (and the flail) behind his body, the upper arm over it.
  const flailBehind = swapped && !!s.flailForearmBehind;
  const flailForearm = (
    <>
      {s.spin !== "behind" && <Flail s={s} />}
      <polyline points={limb(s.weaponArm.elbow, s.weaponArm.hand)} className="fig-limb fig-far" />
    </>
  );
  const flailUpper = (
    <>
      <polyline points={limb(flailShoulder, s.weaponArm.elbow)} className="fig-limb" />
      <polyline points={limb(flailShoulder, sleeveEnd)} className="fig-sleeve" />
    </>
  );
  const flailArm = flailBehind ? flailUpper : (
    <>
      {s.spin !== "behind" && <Flail s={s} />}
      <polyline points={limb(flailShoulder, s.weaponArm.elbow, s.weaponArm.hand)} className={`fig-limb ${swapped || s.flailArmOver ? "" : "fig-far"}`} />
      <polyline points={limb(flailShoulder, sleeveEnd)} className={`fig-sleeve ${swapped || s.flailArmOver ? "" : "fig-sleeve-far"}`} />
    </>
  );
  // Holding the chain: it runs over the arm and into the fist, which closes over it. The head
  // hangs below the fist: in front of the arm, or tucked behind it.
  const candleArm = s.chainInHand ? (
    <>
      {s.headBehindArm && <ChainInHand s={s} part="head" />}
      <CandleArmEl s={s} shoulder={candleShoulder} arm={arm} part="arm" />
      {!swapped && <ChainInHand s={s} part={s.headBehindArm ? "chain" : "all"} />}
      {swapped && !s.headBehindArm && <ChainInHand s={s} part="head" />}
      <CandleArmEl s={s} shoulder={candleShoulder} arm={arm} part="fist" />
      <CandleArmEl s={s} shoulder={candleShoulder} arm={arm} part="flame" />
    </>
  ) : (
    <CandleArmEl s={s} shoulder={candleShoulder} arm={arm} />
  );
  // With the hand tucked under his head, the arm goes under the hood but its flame shows over it.
  const tucked = !swapped && !!s.armBehindHead && !!s.shoulderAtRip;
  return (
    // Phase two: his wax burnt black, the inside of his cloak and hood burning.
    <FlailFire.Provider value={!!flailFire}>
    <g className={`wd-figure ${arm === "scorched" || phase2Look ? "wd-phase2" : ""} ${flailFire ? "wd-flaming" : ""}`}>
      {(s.spinTrail || (lingerFrom && WARDEN_POSES[lingerFrom].spinTrail)) && <SpinTrail s={s} shoulder={flailShoulder} />}
      {/* Whirling behind him, the flail passes behind the cloak. */}
      {s.spin === "behind" && <Flail s={s} />}
      {/* Behind the body: the cloak hides whatever it covers. */}
      {swapped ? candleArm : !s.flailArmOver && flailArm}
      {flailBehind && flailForearm}
      {/* The far leg stays hidden under the cloak; the near one shows through its rip (see Cloak). */}
      <Cloak s={s} />
      <Stain s={s} />
      {!swapped && s.armBehindHead && (tucked ? <CandleArmEl s={s} shoulder={candleShoulder} arm={arm} part="arm" /> : candleArm)}
      {/* The flail arm brought round in front of his body. */}
      {!swapped && s.flailArmOver && flailArm}
      {/* Flail Swing's blow sweeps over him, but under his head. */}
      {(s.swingTrail || s.risingTrail) && <SpinTrail s={s} shoulder={flailShoulder} layer="front" />}
      <Hood s={s} />
      {tucked && <CandleArmEl s={s} shoulder={candleShoulder} arm={arm} part="flame" />}
      {/* The drool hangs from the hood: in front of the far side, behind whatever arm is nearest. */}
      <Beard s={s} />
      {s.headInHand && <HeadInHand s={s} />}
      {/* The wax arm behind him, holding the chain: the chain still crosses over the cloak. */}
      {s.chainInHand && swapped && (
        <>
          <ChainInHand s={s} part="chain" />
          <CandleArmEl s={s} shoulder={candleShoulder} arm={arm} part="fist" />
          <CandleArmEl s={s} shoulder={candleShoulder} arm={arm} part="flame" />
        </>
      )}
      {/* Turned flail shoulder first, the wax arm is behind him: its fist still closes over the head. */}
      {s.headInHand && swapped && (
        <>
          <CandleArmEl s={s} shoulder={candleShoulder} arm={arm} part="fist" />
          <CandleArmEl s={s} shoulder={candleShoulder} arm={arm} part="flame" />
        </>
      )}
      {swapped ? flailArm : !s.armBehindHead && candleArm}
      {/* The punch trail goes over everything but the flare at the fist. */}
      {s.punchTrail && (s.punchTrail === "wax" || arm !== "out") && <PunchTrail s={s} shoulder={candleShoulder} />}
      {s.slamTrail && <SlamTrail s={s} />}
      {smokeAgo !== undefined && <SmokePuff at={add(s.freeArm.hand, [0, -4])} ago={smokeAgo} />}
      {s.burst && arm !== "out" && <Burst s={s} kind={s.burst} />}
      {s.swat && <FlameTrail wax width={6} at={sweepAt(s)} />}
      {lingerFrom && WARDEN_POSES[lingerFrom].rewaxTrail && <RewaxTrail from={WARDEN_POSES[lingerFrom]} s={s} fire={arm === "scorched"} />}
      {/* His flail is in his right hand; the candle arm is his left. */}
      {sides && <SideTags s={s} hand="right" flip={front && !straight} />}
    </g>
    </FlailFire.Provider>
  );
}
