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

/** A waxed ally's flame the Warden could take this turn: one that is staggered or about to clutch its flame. */
function alliesToUsurp(state: CombatState): string[] {
  const out: string[] = [];
  for (const e of state.enemies) {
    const flame = kindOf(e).flame;
    if (!e.alive || !flame) continue;
    if (e.staggered || e.intent.action === flame.action) out.push(e.id);
  }
  return out;
}

/** Your flame is within his reach: you are staggered while Waxed (and not on your revive). */
const yoursToUsurp = (state: CombatState) => state.player.staggered && state.player.waxed && !state.player.reviving;

/**
 * A waxed ally, lit: its flame burns on its head. One that has fallen rises, at full health but
 * staggered, so its first turn is the forced Rest; one still on its feet is just lit.
 */
function light(r: TurnReport, ally: Enemy, by?: string) {
  ally.flags.lit = true;
  if (ally.alive) {
    r.event({ kind: "flag", who: ally.id, flag: "lit", on: true });
    return;
  }
  ally.alive = true;
  ally.fate = undefined;
  ally.hp = ally.maxHP;
  ally.fatigue = ally.maxHP;
  ally.death = 0;
  ally.staggered = true;
  ally.reviving = false;
  ally.last = null;
  r.event({ kind: "raised", who: ally.id, by });
}

/** The waxed allies (those with a flame of their own). */
const alliesOf = (r: TurnReport) => r.state.enemies.filter(e => e !== r.self && !!kindOf(e).flame);

/** Phase two: the wax torn off, the flame free for good. The fire shockwave lights every waxed and raises the fallen. */
function enterPhaseTwo(r: TurnReport) {
  const { self } = r;
  if (self.flags.phase2) return;
  self.flags.phase2 = true;
  if (self.flags.sealed) r.event({ kind: "flag", who: self.id, flag: "sealed", on: false });
  self.flags.sealed = false;
  r.event({ kind: "phase", who: self.id, phase: 2 });
  // Once he's back on his feet, he always takes up Idle (the only "Second Phase >" stance).
  self.nextFrom = "Second Phase";
  // They come back on the back line, in frame behind him.
  for (const ally of alliesOf(r)) {
    light(r, ally);
    ally.line = "back";
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
  maxHP: 15,
  // A boss: ten times the String of any other (150), in a burst of many strings.
  stringYield: 10,
  weapon: "normal",
  // (His flail: not one of the demo's weapons, so no eternal effect.)
  ownWeapon: true,
  // He drops nothing, for now.
  noDrops: true,
  armor: "normal",
  revives: 1,
  flags: { sealed: false, phase2: false, flaming: false, phase2Pending: false },
  pattern: parsePattern("Penitent Warden", `
    actions:
      Usurp Flame:   attack, light, *Sealed, *Usurpable   // its hit takes the flame: he is unsealed, a waxed sealed whole (dead)
      Flail Swing:   attack, normal, #waxing, *Far or *Flaming
      Rising Flail:  attack, normal, #waxing, *Close or *Flaming
      Flail Slam:    attack, heavy, #waxing, #shockwave
      Wax Punch:     attack, light, *Sealed
      Fan Flames:    attack, light, ranged, *Unsealed, #fire
      Flame Blast:   attack, heavy, ranged, *Unsealed, #shockwave, #fire
      Spin Guard:    block, normal
      Wax Guard:     block, light, *Sealed
      Turn Away:     maneuver, retreat, *Close
      Dash:          maneuver, advance
      Flail Wind Up: rest
      Clutch Flame:  rest, *Unsealed, *!Flaming
    stances:
      // His tell: Sealed, with a flame within reach, he always takes Wax Arm Back (even out of a Recover), and Usurp Flame comes first in it.
      (*Sealed, *Usurpable) / Wax Guard / Fan Flames / Dash > Wax Arm Back > Usurp Flame, Wax Punch, Flame Blast
      Recover / Usurp Flame / Second Phase  > Idle                    > Turn Away, Flail Wind Up
      Turn Away / Spin Guard                > Chain Clutched          > Flail Swing, Dash
      Flail Wind Up / Flail Swing / Dash    > Flail Spinning Behind   > Rising Flail, Spin Guard
      Rising Flail / !Spin Guard            > Flail Spinning Overhead > Flail Slam
      Flail Slam / Flame Blast              > Kneeling                > Clutch Flame, Flail Wind Up
      Recover / Usurp Flame / Clutch Flame  > Wax Arm Raised          > Wax Guard, Fan Flames
  `, { events: ["Second Phase"] }),
  variant: "warden",
  figure3d: "warden",
  scale: 1.18,
  // When he falls for good: his cloak, draped over a thick pool of wax.
  deathLook: "cloak",
  // His fight takes place in his arena, among the sleepwalkers sealed into its floor and walls.
  arena: true,
  // He attacks straight out of whatever stance he's in (no wind-up pose of its own).
  attacksFromStance: true,
  // The flail is in his right hand; the candle arm is his left.
  weaponHand: "right",
  modelPoses: { front: "wd-t", back: "wd-t-b" },
  // (Chain Clutched and Wax Arm Raised borrow older poses until they get their own.)
  stancePoses: {
    Idle: "wd-idle",
    "Wax Arm Back": "wd-arm-back",
    "Wax Arm Raised": "wd-shoulder",
    "Chain Clutched": "wd-clutch-flail",
    "Flail Spinning Behind": "wd-spin-behind",
    "Flail Spinning Overhead": "wd-spin-over",
    Kneeling: "wd-kneel",
  },
  idlePose: "wd-idle",
  downPose: "wd-fallen",
  flinchPose: "wd-flinch",
  // (Usurp Flame, Spin Guard and Dash borrow older poses until they get their own; Turn Away is Idle turned, for now.)
  actionPoses: {
    "Usurp Flame": { act: "wd-usurp", strike: "wd-usurp-dash" },
    "Flail Swing": { act: "wd-clutch-flail", strike: "wd-swing" },
    "Rising Flail": { act: "wd-spin-behind", strike: "wd-rising" },
    "Flail Slam": { act: "wd-spin-over", strike: "wd-slam", projectile: "impact" },
    "Wax Punch": { act: "wd-arm-back", strike: "wd-punch", projectile: "impact" },
    "Fan Flames": { act: "wd-shoulder", strike: "wd-fan", projectile: "fan" },
    "Flame Blast": { act: "wd-arm-back", strike: "wd-blast", projectile: "blast" },
    "Spin Guard": { act: "wd-chain-guard", windup: "wd-chain-ready" },
    "Wax Guard": { act: "wd-wax-guard", guard: "wd-wax-swat", windup: "wd-wax-ready" },
    "Turn Away": { act: "wd-turn-away" },
    Dash: { act: "wd-usurp-dash" },
    "Flail Wind Up": { act: "wd-spin-behind", rest: "wd-wound-up", windup: "wd-winding-up" },
    "Clutch Flame": { act: "wd-clutch-arm", rest: "wd-clutch-arm", windup: "wd-clutch-ready" },
  },
  // When he falls for good, every flame he lit goes out: the waxed die with him, sealed in wax, their candles snuffed.
  onDeath: ({ self, state, event }) => {
    for (const ally of state.enemies) {
      if (ally === self || !ally.alive || !kindOf(ally).flame) continue;
      ally.alive = false;
      ally.fate = "encased";
      ally.hp = 0;
      ally.fatigue = 0;
      ally.staggered = false;
      event({ kind: "fall", who: ally.id });
    }
  },
  // His flaming slam and his flame blast send a shockwave through the whole fight: his waxed are hit too.
  shockwave: self => self.intent.action !== "Flail Slam" || !!self.flags.flaming,
  // He picks after the waxed, to see which of them is about to Clutch Flame.
  decidesLast: true,
  // (Usurp Flame is a fixed rule: the Model viewer plays it with you resting.)
  fixedActions: ["Usurp Flame"],
  // Usurp Flame on you: his taking your flame does not get you up; you stay down, sealed in wax, until the next forced Rest.
  holdsTargetDown: ["Usurp Flame"],
  conditions: {
    sealed: self => !!self.flags.sealed,
    unsealed: self => !self.flags.sealed,
    /** A flame within reach to take: yours (staggered while Waxed), or a waxed ally's (staggered, or about to Clutch Flame). */
    usurpable: (_, state) => yoursToUsurp(state) || alliesToUsurp(state).length > 0,
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
   * Usurp Flame (first in Wax Arm Back, which he always takes while Sealed with a flame within reach) goes for
   * yours whenever it can: you, staggered while Waxed. Otherwise a waxed ally's, staggered or about to Clutch
   * Flame; several at once: even odds.
   */
  aim: (_, state, action, rng) => {
    if (action !== "Usurp Flame" || yoursToUsurp(state)) return undefined;
    const flames = alliesToUsurp(state);
    return flames.length ? flames[Math.floor(rng() * flames.length)] : undefined;
  },
  // Usurp Flame's hit takes the flame: he is Unsealed, and a waxed is sealed whole (dead), you until you get up.
  // A direct hit from his flail (`#waxing`) leaves wax behind; once his flame is free (phase
  // two) it leaves none, but set on fire it burns for extra damage.
  onDirectHit: hit => {
    if (hit.self.intent.action === "Usurp Flame") {
      hit.event({ kind: "usurp", who: hit.self.id, target: hit.target.id });
      hit.seal();
      if (hit.self.flags.sealed && !hit.self.flags.phase2) {
        hit.self.flags.sealed = false;
        hit.event({ kind: "flag", who: hit.self.id, flag: "sealed", on: false });
      }
      return;
    }
    if (!hit.tags.includes("waxing")) return;
    if (hit.self.flags.flaming) hit.burn(hit.damage * FLAMING_BONUS);
    if (!hit.self.flags.phase2) hit.wax();
  },
  // The wax does not need a clean hit: his flail leaves it on a target that blocks it too, as long as it is not covered already.
  onBlocked: hit => {
    if (hit.tags.includes("waxing") && !hit.self.flags.phase2 && !hit.target.waxed) hit.wax();
  },
  afterTurn: r => {
    const { self, action, outcome } = r;
    if (outcome === "done") {
      // (Usurp Flame's effects come with its hit: see onDirectHit.)
      if (action === "Flame Blast") setSealed(r, true);
      if (action === "Clutch Flame") {
        // His flame can't be put out any more: clutching the flail, he sets it alight instead.
        if (self.flags.phase2) setFlaming(r, true);
        else setSealed(r, true);
      }
      // Smashed into the ground, the flail's fire goes out.
      if (action === "Flail Slam") setFlaming(r, false);
    }
    // The way into phase two opens only when he falls with his revive; it happens as his revive lands
    // and he gets back up. A stagger just puts his flame out.
    if (r.staggered) {
      setSealed(r, true);
      // In phase two, staggering him raises a fallen waxed again.
      if (self.flags.phase2) {
        const fallen = alliesOf(r).find(e => !e.alive);
        if (fallen) light(r, fallen, self.id);
      }
    }
    // In phase two, a lit waxed that got staggered this turn dies as the turn ends: its flame streams into his hand,
    // as long as he isn't staggered himself. (The ones raised staggered are on their forced Rest: they get back up.)
    if (self.flags.phase2 && !self.staggered && !self.reviving) {
      for (const ally of alliesOf(r)) {
        if (!ally.alive || !ally.flags.lit || !ally.staggered || ally.intent.forced) continue;
        ally.alive = false;
        ally.fate = "encased";
        ally.hp = 0;
        ally.fatigue = 0;
        ally.staggered = false;
        r.event({ kind: "drained", who: ally.id, by: self.id });
        r.event({ kind: "encased", who: ally.id });
      }
    }
    // The way into phase two opens only when he falls with his revive: it happens as his revive lands, at the end of the turn he fell.
    if (r.fell && !self.flags.phase2) enterPhaseTwo(r);
  },
  /**
   * The fight's opening scene: he takes the flame an offering waxed cradles (Usurp Flame),
   * showing the mechanic before the fight begins. The three waxed start on the front line, he on the back one, Sealed, his flame out; the
   * scene leaves him Unsealed, on the front line in the waxed's place, the waxed encased for good, and every first intent chosen afresh (his
   * comes from "Usurp Flame >": Idle).
   */
  opening: ({ self, state, setups, describe, chooseIntents, rng }) => {
    // The offering's flame already taken in an earlier attempt (it lies dead from the start), he takes another waxed's, any still up.
    const named = state.enemies.find((e, i) => setups[i]?.offering && kindOf(e).flame);
    const others = state.enemies.filter(e => e.alive && e !== self && !!kindOf(e).flame);
    const offering = named && !named.alive && others.length ? others[Math.floor(rng() * others.length)] : named;
    // None left (every waxed beaten before): no scene, the fight begins as the scene would leave him, Unsealed, on the front line, his
    // stance coming from Usurp Flame.
    if (offering && !offering.alive) {
      self.line = "front";
      self.flags.sealed = false;
      self.last = { name: "Usurp Flame", outcome: "done" };
      chooseIntents(state, rng);
      return null;
    }
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
    // The fight begins with all that are left on the front line: he has stepped into the offering's place.
    w.line = "front";
    o.alive = false;
    o.fate = "encased";
    o.hp = 0;
    o.fatigue = 0;
    after.lastTurn = [];
    chooseIntents(after, rng);

    // Before: the same (so the others hold the stances they'll fight from), but his flame out
    // and the waxed holding its own out to him.
    const from = structuredClone(after);
    // (Before it, he is on the back line, as he starts, and the waxed on the front.)
    from.enemies.find(e => e.id === self.id)!.line = "back";
    const w0 = from.enemies.find(e => e.id === self.id)!;
    const o0: Enemy = from.enemies.find(e => e.id === offering.id)!;
    w0.flags.sealed = true;
    w0.last = null;
    w0.intent = { ...describe(w0.kind, w0.line, "Wax Arm Back", usurp), target: o0.id };
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
