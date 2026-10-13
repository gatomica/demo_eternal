/**
 * bestiary.ts — every enemy kind: its numbers, its stances and actions (in the notation from
 * patterns.ts, matching the design doc), and how each stance and action is drawn.
 *
 * Enemies may pick any action, even one that will stagger them (an attack they can't afford).
 * Only a kind written with an explicit condition avoids that.
 */

import type { ArmorTier, CombatState, Enemy, Rng, TurnReport, WeaponTier } from "./combat";
import { parsePattern, type Pattern } from "./patterns";

export interface EnemyKind {
  name: string;
  maxHP: number;
  /** True weight it carries ("baseline": nothing). Actions may still have their own weight. */
  weapon: WeaponTier;
  armor: ArmorTier;
  /** Drawn with a special look (e.g. "waxed"). */
  variant?: "waxed" | "warden";
  /** Drawn this much bigger than a normal figure. */
  scale?: number;
  pattern: Pattern;
  /** The pose shown for each stance while you plan. */
  stancePoses: Record<string, string>;
  /**
   * How each action is drawn as the turn plays: `act` while it happens (and an attack's wind-up),
   * `strike` the moment an attack lands. Defaults: the generic pose for its kind, and "strike".
   */
  /**
   * How each action is drawn: `act` while it happens (and an attack's wind-up), `strike` the
   * moment an attack lands, `rest` once a Rest actually happens at the end of the turn, and the
   * `projectile` a ranged attack throws (or, for a melee one, `impact`: a shockwave where it lands).
   * `guard`: a Block that holds the stance and only takes this pose as an attack on it lands.
   */
  actionPoses?: Record<string, { act?: string; strike?: string; rest?: string; projectile?: "fan" | "blast" | "wax" | "impact"; guard?: string }>;
  /** Shown once its attack has landed (default "idle"), and while staggered (default "fallen"). */
  idlePose?: string;
  downPose?: string;
  /** A Rest broken by a blow (default "flinch"), held to the end of the turn. */
  flinchPose?: string;
  /** Conditions named in the pattern (`*Name`, written in lowercase here), checked when picking. */
  conditions?: Record<string, (self: Enemy, state: CombatState) => boolean>;
  /**
   * A fixed rule: an action it must take this turn whatever its stance (and, for a Maneuver aimed
   * at an ally, which one), or null. Kinds with one choose after everyone else each turn.
   */
  forced?: (self: Enemy, state: CombatState, rng: Rng) => { action: string; target?: string } | null;
  /** Actions only a fixed rule (`forced`) uses, from any stance; the model viewer lists them too. */
  fixedActions?: string[];
  /** Its own rules at the end of each turn: statuses, phases, effects of its actions. */
  afterTurn?: (r: TurnReport) => void;
  /** Its statuses at the start of a fight. */
  flags?: Record<string, boolean>;
  /** Revives (a boss revives to full health, only when it falls). */
  revives?: number;
}

/* ---------- The Penitent Warden's rules ---------- */

/** A flame the Warden could take this turn: a staggered, Waxed player, or a waxed ally that is staggered or about to Clutch Flame. */
function flamesToUsurp(state: CombatState): string[] {
  const out: string[] = [];
  if (state.player.staggered && state.player.waxed && !state.player.reviving) out.push("player");
  for (const e of state.enemies) {
    if (!e.alive || e.kind !== "waxed") continue;
    if (e.staggered || e.intent.action === "Clutch Flame") out.push(e.id);
  }
  return out;
}

/** Phase two: the wax torn off, the flame free for good. The waxed around him burn as candles. */
function enterPhaseTwo(r: TurnReport) {
  const { self, state } = r;
  if (self.flags.phase2) return;
  self.flags.phase2 = true;
  if (self.flags.sealed) r.event({ kind: "flag", who: self.id, flag: "sealed", on: false });
  self.flags.sealed = false;
  r.event({ kind: "phase", who: self.id, phase: 2 });
  // Once he's back on his feet, he always takes up Idle (the only "Second Phase >" stance).
  self.nextFrom = "Second Phase";
  r.say(`${self.name} tears the wax from his arm. The flame beneath has been burning all along.`, "stagger");
  for (const e of state.enemies) {
    if (e === self || !e.alive || e.kind !== "waxed") continue;
    e.alive = false;
    e.fate = "candle";
    e.hp = 0;
    r.event({ kind: "candle", who: e.id });
  }
  if (state.enemies.some(e => e.kind === "waxed")) r.say("The waxed around him catch fire, burning like candles.");
}

function setFlaming(r: TurnReport, on: boolean) {
  if (!!r.self.flags.flaming === on) return;
  r.self.flags.flaming = on;
  r.event({ kind: "flag", who: r.self.id, flag: "flaming", on });
  r.say(on ? `${r.self.name} grips the flail in his burning hand. It catches fire.` : `The flail's fire is smothered against the ground.`);
}

function setSealed(r: TurnReport, on: boolean) {
  if (r.self.flags.phase2 || !!r.self.flags.sealed === on) return;
  r.self.flags.sealed = on;
  r.event({ kind: "flag", who: r.self.id, flag: "sealed", on });
  r.say(on ? `${r.self.name}'s flame goes out. He is Sealed.` : `${r.self.name}'s arm burns again. He is Unsealed.`);
}

export const ENEMY_KINDS: Record<string, EnemyKind> = {
  /**
   * The standard enemy. It only ever shows a stance, never its action: Ready, Intimidating or
   * Cautious, each covering a few actions. (Action names are placeholders.)
   */
  sleepwalker: {
    name: "Depraved Sleepwalker",
    maxHP: 20,
    weapon: "normal",
    armor: "light",
    pattern: parsePattern("Depraved Sleepwalker", `
      actions:
        Slash:        attack
        Parry:        block
        Step:         maneuver, by-line
        Catch Breath: rest
      stances:
        All > Ready        > Slash / Parry, Step
        All > Intimidating > Slash / Catch Breath
        All > Cautious     > Catch Breath / Parry, Step
    `),
    stancePoses: { Ready: "ready", Intimidating: "intimidating", Cautious: "cautious" },
  },

  /**
   * The weakest enemy: a sleepwalker the wardens tried to soothe back to sleep. It kneels,
   * shins bound together in wax, head encased in it. No weapon, no armor. Fully telegraphed:
   * every stance leads to one kind of action.
   */
  waxed: {
    name: "Waxed",
    maxHP: 12,
    weapon: "baseline",
    armor: "none",
    variant: "waxed",
    pattern: parsePattern("Waxed", `
      actions:
        Scratch:      attack, baseline
        Hurl Wax:     attack, light, ranged
        Brace:        block, baseline
        Drag Forward: maneuver, advance
        Slither Back: maneuver, retreat
        Clutch Flame: rest
      stances:
        All > Hands Raised      > Scratch
        All > Wax on Hand       > Hurl Wax
        All > Cowering Sideways > Brace
        All > Crawling          > Drag Forward, Slither Back
        All > Cradle Flame      > Clutch Flame
    `),
    stancePoses: {
      "Hands Raised": "w-hands",
      "Wax on Hand": "w-wax-hand",
      "Cowering Sideways": "w-cower",
      Crawling: "w-crawl",
      "Cradle Flame": "w-cradle",
    },
    idlePose: "w-idle",
    downPose: "w-fallen",
    flinchPose: "w-flinch",
    actionPoses: {
      Scratch: { act: "w-hands", strike: "w-scratch" },
      "Hurl Wax": { act: "w-wax-hand", strike: "w-hurl", projectile: "wax" },
      Brace: { act: "w-cower" },
      "Drag Forward": { act: "w-crawl" },
      "Slither Back": { act: "w-slither" },
      "Clutch Flame": { act: "w-clutch" },
    },
  },

  /**
   * The tutorial boss. His candle arm burns (Unsealed) or has gone out (Sealed); his flail waxes
   * whoever it hits directly. See the design doc, section 7. Drawn in warden.tsx.
   */
  warden: {
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
    `),
    variant: "warden",
    scale: 1.18,
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
    conditions: {
      sealed: self => !!self.flags.sealed,
      unsealed: self => !self.flags.sealed,
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
            r.say(`${self.name} tears the flame from ${ally.name}, sealing it whole in wax.`);
          } else {
            // Your flame taken, you're sealed whole in wax until you get back up.
            state.player.waxed = false;
            state.player.encased = true;
            r.event({ kind: "usurp", who: self.id, target: "player" });
            r.say(`${self.name} tears your flame away, sealing you whole in wax.`, "hit");
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
  },
};