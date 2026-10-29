/**
 * warden.ts — the Penitent Warden, the tutorial boss. His candle arm burns (Unsealed) or has gone
 * out (Sealed); his flail waxes whoever it hits directly. See the design doc, section 7. Drawn in
 * warden/.
 */
import { kindOf, type EnemyKind } from "../bestiary";
import { parsePattern } from "../patterns";
import type { CombatEvent, CombatState, Enemy, TurnReport } from "../types";

/** A flaming flail's direct hit deals this much of its damage again, as extra damage. */
const FLAMING_BONUS = 1 / 4;

/** A flame the Warden could take this turn: a staggered, Waxed player, or an ally's that is staggered or about to clutch its flame. */
function flamesToUsurp(state: CombatState): string[] {
  const out: string[] = [];
  if (state.player.staggered && state.player.waxed && !state.player.reviving) out.push("player");
  for (const e of state.enemies) {
    const flame = kindOf(e).flame;
    if (!e.alive || !flame) continue;
    if (e.staggered || e.intent.action === flame.action) out.push(e.id);
  }
  return out;
}

/** Phase two: the wax torn off, the flame free for good. The flames around him burn as candles. */
function enterPhaseTwo(r: TurnReport) {
  const { self, state } = r;
  if (self.flags.phase2) return;
  self.flags.phase2 = true;
  if (self.flags.sealed) r.event({ kind: "flag", who: self.id, flag: "sealed", on: false });
  self.flags.sealed = false;
  r.event({ kind: "phase", who: self.id, phase: 2 });
  // Once he's back on his feet, he always takes up Idle (the only "Second Phase >" stance).
  self.nextFrom = "Second Phase";
  for (const e of state.enemies) {
    if (e === self || !e.alive || !kindOf(e).flame) continue;
    e.alive = false;
    e.fate = "candle";
    e.hp = 0;
    r.event({ kind: "candle", who: e.id });
  }
}

function setFlaming(r: TurnReport, on: boolean) {
  if (!!r.self.flags.flaming === on) return;
  r.self.flags.flaming = on;
  r.event({ kind: "flag", who: r.self.id, flag: "flaming", on });
}

function setSealed(r: TurnReport, on: boolean) {
  if (r.self.flags.phase2 || !!r.self.flags.sealed === on) return;
  r.self.flags.sealed = on;
  r.event({ kind: "flag", who: r.self.id, flag: "sealed", on });
}

export const WARDEN: EnemyKind = {
  name: "Penitent Warden",
  maxHP: 30,
  weapon: "normal",
  armor: "normal",
  revives: 1,
  flags: { sealed: false, phase2: false, flaming: false, phase2Pending: false },
  pattern: parsePattern("Penitent Warden", `
    actions:
      Flail Swing:  attack, normal, #waxing
      Rising Flail: attack, normal, #waxing
      Flail Slam:   attack, heavy, #waxing
      Wax Punch:    attack, light, *Sealed
      Fan Flames:   attack, light, ranged, *Unsealed
      Flame Blast:  attack, heavy, ranged, *Unsealed
      Chain Guard:  block, normal
      Wax Guard:    block, light, *Sealed
      Stride:       maneuver, retreat
      Usurp Flame:  maneuver, advance, *Sealed
      Wind Up Flail: rest
      Clutch Arm:   rest
    stances:
      Usurp Flame / Recover / Second Phase > Idle                    > Stride / Wind Up Flail
      Chain Guard / Clutch Arm         > Wax Shoulder In         > Fan Flames / Wax Guard / Wind Up Flail
      Fan Flames / Wax Guard           > Wax Arm Back            > Wax Punch, Flame Blast / Stride
      Flame Blast                      > Arm Over Chest          > Fan Flames / Wax Guard / Clutch Arm
      Stride                           > Flail Clutched          > Flail Swing / Chain Guard
      Flail Swing / Wind Up Flail      > Flail Spinning Behind   > Rising Flail / Wax Guard, Stride
      Rising Flail                     > Flail Spinning Overhead > Flail Slam
      Recover / Flail Slam / Wax Punch > Kneeling                > Chain Guard / Clutch Arm
  `, { events: ["Second Phase"] }),
  variant: "warden",
  scale: 1.18,
  // His fight takes place in his arena, among the sleepwalkers sealed into its floor and walls.
  arena: true,
  // He attacks straight out of whatever stance he's in (no wind-up pose of its own).
  attacksFromStance: true,
  // The flail is in his right hand; the candle arm is his left.
  weaponHand: "right",
  modelPoses: { front: "wd-t", back: "wd-t-b" },
  stancePoses: {
    Idle: "wd-idle",
    "Wax Shoulder In": "wd-shoulder",
    "Wax Arm Back": "wd-arm-back",
    "Arm Over Chest": "wd-arm-chest",
    "Flail Clutched": "wd-clutch-flail",
    "Flail Spinning Behind": "wd-spin-behind",
    "Flail Spinning Overhead": "wd-spin-over",
    Kneeling: "wd-kneel",
  },
  idlePose: "wd-idle",
  downPose: "wd-fallen",
  flinchPose: "wd-flinch",
  actionPoses: {
    "Flail Swing": { act: "wd-clutch-flail", strike: "wd-swing" },
    "Rising Flail": { act: "wd-spin-behind", strike: "wd-rising" },
    "Flail Slam": { act: "wd-spin-over", strike: "wd-slam", projectile: "impact" },
    "Wax Punch": { act: "wd-arm-back", strike: "wd-punch", projectile: "impact" },
    "Fan Flames": { act: "wd-shoulder", strike: "wd-fan", projectile: "fan" },
    "Flame Blast": { act: "wd-arm-back", strike: "wd-blast", projectile: "blast" },
    "Chain Guard": { act: "wd-chain-guard" },
    "Wax Guard": { act: "wd-wax-guard", guard: "wd-wax-swat" },
    Stride: { act: "wd-stride" },
    "Usurp Flame": { act: "wd-usurp" },
    "Wind Up Flail": { act: "wd-spin-behind", rest: "wd-wound-up" },
    "Clutch Arm": { act: "wd-clutch-arm", rest: "wd-clutch-arm" },
  },
  fixedActions: ["Usurp Flame"],
  // Usurp Flame on you: you stay down, sealed, until he has your flame.
  holdsTargetDown: ["Usurp Flame"],
  conditions: {
    sealed: self => !!self.flags.sealed,
    unsealed: self => !self.flags.sealed,
  },
  statuses: [
    { key: "sealed", off: "Unsealed", on: "Sealed", locked: on => (on.phase2 ? "Unsealed (phase 2)" : null) },
    // Entering phase two, he always ends up in the "Second Phase >" stance (Idle).
    { key: "phase2", off: "Phase 1", on: "Phase 2", enters: "Second Phase" },
    { key: "flaming", off: "Flail unlit", on: "Flaming flail", locked: on => (on.phase2 ? null : "Flail unlit (phase 1)") },
  ],
  // Phase two burns unsealed for good, and only his phase-two flame can set the flail alight.
  settleFlags: flags => {
    if (flags.phase2) flags.sealed = false;
    else flags.flaming = false;
  },
  // A stagger puts his flame out (before phase two).
  staggerFlags: flags => {
    if (!flags.phase2) flags.sealed = true;
  },
  /**
   * The fixed rule: Sealed and able to act, he always takes a flame within reach: yours, if
   * you're staggered while Waxed, or a waxed ally's, if it's staggered or about to Clutch
   * Flame. Several at once: even odds.
   */
  forced: (self, state, rng) => {
    if (!self.flags.sealed) return null;
    const flames = flamesToUsurp(state);
    if (!flames.length) return null;
    return { action: "Usurp Flame", target: flames[Math.floor(rng() * flames.length)] };
  },
  // A direct hit from his flail (`#waxing`) leaves wax behind; once his flame is free (phase
  // two) it leaves none, but set on fire it burns for extra damage.
  onDirectHit: hit => {
    if (!hit.tags.includes("waxing")) return;
    if (hit.self.flags.flaming) hit.burn(hit.damage * FLAMING_BONUS);
    if (!hit.self.flags.phase2) hit.wax();
  },
  afterTurn: r => {
    const { self, state, action, outcome } = r;
    if (outcome === "done") {
      if (action === "Usurp Flame") {
        const target = self.intent.target;
        const ally = target ? state.enemies.find(e => e.id === target) : undefined;
        if (ally) {
          // Its flame taken, the waxed is sealed whole: out of the fight for good.
          ally.alive = false;
          ally.fate = "encased";
          ally.hp = 0;
          r.event({ kind: "usurp", who: self.id, target: ally.id });
          r.event({ kind: "encased", who: ally.id });
        } else {
          // Your flame taken, you're sealed whole in wax until you get back up.
          state.player.waxed = false;
          state.player.encased = true;
          r.event({ kind: "usurp", who: self.id, target: "player" });
        }
        setSealed(r, false);
      }
      if (action === "Flame Blast") setSealed(r, true);
      if (action === "Clutch Arm") {
        // His flame can't be put out any more: clutching the flail, he sets it alight instead.
        if (self.flags.phase2) setFlaming(r, true);
        else setSealed(r, true);
      }
      // Smashed into the ground, the flail's fire goes out.
      if (action === "Flail Slam") setFlaming(r, false);
    }
    // The way into phase two opens when he's staggered while already Sealed (the skill route,
    // revive still in hand) or when he falls with his revive (the default route); it happens as
    // he gets back up: as he recovers from the stagger, or as his revive lands.
    if (r.staggered) {
      if (r.was.sealed && !self.flags.phase2) self.flags.phase2Pending = true;
      else setSealed(r, true);
    }
    if (r.fell && !self.flags.phase2) self.flags.phase2Pending = true;
    if (self.flags.phase2Pending && outcome === "recover" && !self.staggered && !self.reviving) {
      self.flags.phase2Pending = false;
      enterPhaseTwo(r);
    }
  },
  /**
   * The fight's opening scene: he takes the flame an offering waxed cradles (Usurp Flame),
   * showing the mechanic before the fight begins. He starts Sealed, his flame out; the scene
   * leaves him Unsealed, the waxed encased for good, and every first intent chosen afresh (his
   * comes from "Usurp Flame >": Idle).
   */
  opening: ({ self, state, setups, describe, chooseIntents, rng }) => {
    const offering = state.enemies.find((e, i) => setups[i]?.offering && kindOf(e).flame);
    const usurp = WARDEN.pattern.actions.get("usurp flame");
    const flame = offering && kindOf(offering).flame!;
    const clutch = offering && kindOf(offering).pattern.actions.get(flame!.action.toLowerCase());
    if (!offering || !usurp || !clutch) return null;

    // After: the flame his, the waxed sealed whole in wax, and everyone's first move chosen.
    const after = structuredClone(state);
    const w = after.enemies.find(e => e.id === self.id)!;
    const o = after.enemies.find(e => e.id === offering.id)!;
    w.flags.sealed = false;
    w.last = { name: "Usurp Flame", outcome: "done" };
    o.alive = false;
    o.fate = "encased";
    o.hp = 0;
    o.fatigue = 0;
    after.lastTurn = [];
    chooseIntents(after, rng);

    // Before: the same (so the others hold the stances they'll fight from), but his flame out
    // and the waxed holding its own out to him.
    const from = structuredClone(after);
    const w0 = from.enemies.find(e => e.id === self.id)!;
    const o0: Enemy = from.enemies.find(e => e.id === offering.id)!;
    w0.flags.sealed = true;
    w0.last = null;
    w0.intent = { ...describe(w0.kind, w0.line, "Idle", usurp), target: o0.id, dir: "retreat" };
    o0.alive = true;
    o0.fate = undefined;
    o0.hp = o0.maxHP;
    o0.intent = describe(o0.kind, o0.line, flame!.stance, clutch);

    const events: CombatEvent[] = [
      { kind: "usurp", who: w.id, target: o.id },
      { kind: "encased", who: o.id },
      { kind: "flag", who: w.id, flag: "sealed", on: false },
    ];
    return { from, after, events };
  },
};
