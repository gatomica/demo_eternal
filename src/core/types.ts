/**
 * types.ts — combat's data: fighters, intents, events, steps and the fight's state.
 */
import type { KindId } from "./bestiary";

export type Tier = "light" | "normal" | "heavy";

/** Weights an action can have. "baseline" is bare hands (no weapon): the fastest and weakest. */
export type WeaponTier = "baseline" | Tier;

export type ArmorTier = "none" | Tier;

export type Line = "front" | "back";

export type ActionType = "attack" | "block" | "maneuver" | "rest";

export type Status = "playing" | "won" | "lost";

/** What a player can submit. `target` is an enemy id, or "self" for a Maneuver that falls back. */
export interface PlayerAction {
  type: ActionType;
  target?: string;
  /** An Attack with its own weight (for future weapon skills). Otherwise the weapon's. */
  weight?: WeaponTier;
}

/** What an enemy telegraphs during planning. */
export interface Intent {
  type: ActionType;
  /**
   * For Maneuver: advance closes in on you (you're its target); retreat backs off (no target).
   * Decided from its line when the intent is chosen.
   */
  dir: "advance" | "retreat";
  /** True when the enemy is staggered and has no choice. */
  forced: boolean;
  /** The stance shown while you plan (from the enemy's pattern). */
  stance?: string;
  /** The action's name (from the enemy's pattern). Hidden until the turn plays. */
  action?: string;
  /** Drawing hints: the pose while planning, while acting (and winding up), and as an attack lands. */
  pose?: string;
  actPose?: string;
  strikePose?: string;
  /** What flies from it to its target, for a ranged attack. */
  projectile?: "fan" | "blast" | "wax" | "impact";
  /** For a Rest: the pose once it actually happens, at the end of the turn. */
  restPose?: string;
  /** For a Block: it holds its stance, and only takes this pose as an attack on it lands. */
  guardPose?: string;
  /** The weight of this Attack or Block, when the action has its own. Otherwise the fighter's weapon. */
  weight?: WeaponTier;
  /** A ranged attack: the attacker stays put, a Block sends nothing back, and it can always be dodged. */
  ranged?: boolean;
  /** For a Maneuver aimed at an ally (Usurp Flame): that ally's id. It pushes you away like backing off. */
  target?: string;
  /** Tags from the pattern, e.g. "waxing": a direct hit leaves the target Waxed. */
  tags?: string[];
}

/** How an enemy's last action went, for choosing what it can do next. */
export interface LastAction {
  /** The action's name, for picking the next stance. */
  name?: string;
  /**
   * done: it happened. undone: it didn't (a Rest cut short by a hit, a Block with nothing to
   * block, an action cancelled before it happened). recover: it was the forced Rest after
   * being staggered.
   */
  outcome: "done" | "undone" | "recover";
}

export interface Fighter {
  id: string;
  name: string;
  maxHP: number;
  hp: number;
  fatigue: number;
  death: number;
  weapon: WeaponTier;
  armor: ArmorTier;
  /**
   * Covered in wax by a direct hit from a waxing attack (the Warden's flail). No effect by itself:
   * another direct waxing hit adds 1/8 of its damage as Fatigue, and some enemies react to it.
   * Clears when Fatigue drops to 0.
   */
  waxed: boolean;
  /** Its flame taken while staggered and Waxed (Usurp Flame): sealed whole in wax until it gets up. */
  encased?: boolean;
  /** Staggered: Fatigue is pinned at full (it can't grow further) and the next turn is a forced Rest,
   *  which always ends with Fatigue at 0. */
  staggered: boolean;
}

export interface Player extends Fighter {
  /** Healing item charges, spent automatically to revive. */
  charges: number;
  /** True during the protected turn after falling with a charge left. Health stays at 0 until the
   *  turn ends, then comes back to full health (along with rests). */
  reviving: boolean;
}

export interface Enemy extends Fighter {
  kind: KindId;
  line: Line;
  alive: boolean;
  intent: Intent;
  /** Optional scripted actions for the first turns, e.g. to show every pose in the tutorial. */
  script: string[];
  /** How its action last turn went (null before its first turn). */
  last: LastAction | null;
  /** Statuses of its own, by name (the Warden's "sealed", "phase2"). Patterns check them as conditions. */
  flags: Record<string, boolean>;
  /** Its next stance is picked as if this had just happened (e.g. "Second Phase"), once it's free to act. */
  nextFrom?: string;
  /** Revives left. A boss revives to full health, only when it falls. */
  revives: number;
  /** True during its protected revive turn. */
  reviving: boolean;
  /** How it left the fight, once it has. */
  fate?: "fallen" | "encased" | "candle";
}

export interface CombatConfig {
  /** The model viewer: nobody takes damage or Fatigue; everything else plays as usual. */
  dummy?: boolean;
  /**
   * The guide's training: damage and Fatigue are real, but enemies never lose Health (they stagger
   * but can't fall) and you never drop below 1, so the lesson can't end early.
   */
  sparring?: boolean;
}

/* ---------- What happened during a turn, step by step ---------- */

/** One thing that happened. Ids are "player" or an enemy id. */
export type CombatEvent =
  | {
      kind: "attack";
      attacker: string;
      target: string;
      /** hit: landed; blocked: landed into a Block; dodged: avoided by a Maneuver. */
      result: "hit" | "blocked" | "dodged";
      /** Health lost by the target. */
      damage: number;
      /**
       * Fatigue added: to the target on a hit or a dodge, to the attacker on a Block (none for a
       * ranged attack).
       */
      fatigue: number;
      /** A ranged attack: the attacker didn't close in. */
      ranged: boolean;
      /** The attacker was already dropped or staggered by a tied attack, and grits through to finish its own. */
      grit: boolean;
    }
  | { kind: "canceled"; who: string; action: ActionType; reason: "staggered" | "fallen" | "no target" }
  | { kind: "stagger"; who: string }
  | { kind: "fall"; who: string }
  | { kind: "rest"; who: string; result: "rested" | "interrupted" | "recovered"; forced: boolean }
  /** Someone's Maneuver happened (it plays even when it doesn't change any distance). `target`: who it moved toward. */
  | { kind: "maneuver"; who: string; target?: string }
  /** `cause` is who moved them: the enemy itself, or the player (by Maneuvering or pulling it in with an attack). */
  | { kind: "move"; who: string; from: Line; to: Line; cause: string }
  | { kind: "revive"; who: string }
  | { kind: "defeat"; who: string }
  /** A flaming flail's direct hit: `who` takes `damage` more. */
  | { kind: "burned"; who: string; damage: number }
  /** A direct waxing hit: `who` is now Waxed (`bonus`: extra Fatigue, if it already was). */
  | { kind: "waxed"; who: string; bonus: number }
  /** Usurp Flame: `who` took `target`'s flame. */
  | { kind: "usurp"; who: string; target: string }
  /** Sealed whole in wax, out of the fight for good. */
  | { kind: "encased"; who: string }
  /** Burnt into a human candle as the Warden's flame breaks free. */
  | { kind: "candle"; who: string }
  /** A status of an enemy's own changed, e.g. Sealed. */
  | { kind: "flag"; who: string; flag: string; on: boolean }
  /** A boss enters a new phase. */
  | { kind: "phase"; who: string; phase: number };

/** Bars and positions after a step, so the screen can show the fight mid-turn. */
export interface FighterView {
  hp: number;
  fatigue: number;
  death: number;
  staggered: boolean;
  alive: boolean;
  line?: Line;
  waxed?: boolean;
  encased?: boolean;
  /** How an enemy left the fight, once it has. */
  fate?: "fallen" | "encased" | "candle";
}

/**
 * A beat of the turn: each attack is its own beat, fastest first. Then come rests and other
 * end-of-turn effects, then movement.
 */
export interface Step {
  events: CombatEvent[];
  after: Record<string, FighterView>;
}

export interface CombatState {
  turn: number;
  player: Player;
  enemies: Enemy[];
  status: Status;
  config: CombatConfig;
  /** How the most recent turn played out, step by step. Empty before the first turn. */
  lastTurn: Step[];
}

/** Random source, injectable for tests and replays. Returns a number in [0, 1). */
export type Rng = () => number;

/* ============================================================
 * What an enemy's own rules see (see bestiary.ts)
 * ============================================================ */

/**
 * What an enemy's own rules (its kind's `afterTurn`) get to look at and change at the end of
 * each turn: how its action went, what happened to it, and a way to report what they change.
 */
export interface TurnReport {
  self: Enemy;
  state: CombatState;
  /** Its action this turn (name), and whether it happened. */
  action?: string;
  outcome: LastAction["outcome"];
  /** Staggered this turn. */
  staggered: boolean;
  /** Fell this turn with a revive left: its protected revive turn is next. */
  fell: boolean;
  /** Its flags as they were when the turn started. */
  was: Record<string, boolean>;
  event: (ev: CombatEvent) => void;
}

/* ============================================================
 * Setting up a fight
 * ============================================================ */

export interface PlayerSetup {
  name?: string;
  maxHP: number;
  weapon: WeaponTier;
  armor: ArmorTier;
  charges: number;
}

export interface EnemySetup {
  kind: KindId;
  name?: string;
  line?: Line;
  /** Action names (or kinds) to open with, one per turn. */
  script?: string[];
  /**
   * The fight's opening scene: a waxed cradling its flame for a boss to take before the fight
   * begins (the Warden's Usurp Flame). It starts the fight already encased. See `openingOf`.
   */
  offering?: boolean;
}

/** A scene played before the first turn: the fight as it stood before it, and its steps. */
export interface Opening {
  from: CombatState;
  steps: Step[];
}
