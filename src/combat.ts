/**
 * combat.ts — the combat rules, with no rendering.
 *
 * `resolveTurn` takes a CombatState and returns a new one (the old one is left untouched), so
 * the UI only has to call it and render whatever comes back.
 *
 * Units: weights and costs are written in sixteenths of the fighter's max health,
 * matching the design doc. `sixteenths(n, maxHP)` turns them into real numbers.
 */

/* ============================================================
 * Basic types
 * ============================================================ */

import { ENEMY_KINDS } from "./bestiary";
import { choose, type ActionDef } from "./patterns";

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
  kind: string;
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
 * Tuning tables (sixteenths of max health)
 * ============================================================ */

/** `speed` orders attacks within a turn: lower goes first, equal speeds land together. */
export const WEAPONS: Record<WeaponTier, { weight: number; cost: number; damage: number; block: number; speed: number; label: string }> = {
  baseline: { weight: 0, cost: 1, damage: 1, block: 0, speed: 0, label: "None" },
  light:  { weight: 1, cost: 1, damage: 2, block: 2, speed: 1, label: "Light" },
  normal: { weight: 3, cost: 3, damage: 3, block: 3, speed: 2, label: "Normal" },
  heavy:  { weight: 8, cost: 8, damage: 4, block: 4, speed: 3, label: "Heavy" },
};

/**
 * resist: Resistance, in sixteenths ("none" is the base 1/16).
 * weight: how much it burdens you, in sixteenths. Together with your weapon's, it sets how
 * tiring a dodge is (see dodgeFatigue).
 */
export const ARMOR: Record<ArmorTier, { resist: number; weight: number; label: string }> = {
  none:   { resist: 1, weight: 0, label: "None" },
  light:  { resist: 2, weight: 1, label: "Light" },
  normal: { resist: 3, weight: 3, label: "Normal" },
  heavy:  { resist: 4, weight: 8, label: "Heavy" },
};

/** Even unburdened, a dodge costs this many sixteenths of the damage dodged. */
export const DODGE_BASE = 1;
/** A flaming flail's direct hit deals this much of its damage again, as extra damage. */
export const FLAMING_BONUS = 1 / 4;

/** Rest clears this much Fatigue. */
export const REST_CLEARS = 8;

/* ============================================================
 * Derived numbers
 * ============================================================ */

export const sixteenths = (n: number, maxHP: number) => (n / 16) * maxHP;

/** Attacks and Blocks use the weight of the action when it has one, otherwise the fighter's weapon. */
export const attackCost = (f: Fighter, weight: WeaponTier = f.weapon) => sixteenths(WEAPONS[weight].cost, f.maxHP);
export const attackDamage = (f: Fighter, weight: WeaponTier = f.weapon) => sixteenths(WEAPONS[weight].damage, f.maxHP);
export const restAmount = (f: Fighter) => sixteenths(REST_CLEARS, f.maxHP);

/** Share of incoming damage turned into Fatigue (0..1), with a Block of the given weight or none. */
export const resistance = (f: Fighter, blockWeight: WeaponTier | null) =>
  Math.min(1, (ARMOR[f.armor].resist + (blockWeight ? WEAPONS[blockWeight].block : 0)) / 16);

/**
 * The Fatigue a dodged attack of this much damage turns into: (base + armor weight + weapon
 * weight) sixteenths of it. True weight: what you carry, whatever the action. A Maneuver that
 * dodges nothing costs nothing at all.
 */
export const dodgeWeight = (f: Fighter) => DODGE_BASE + ARMOR[f.armor].weight + WEAPONS[f.weapon].weight;
export const dodgeFatigue = (f: Fighter, damage: number) => (damage * dodgeWeight(f)) / 16;

/* ============================================================
 * Enemy kinds (see bestiary.ts) and how they pick
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

/** The intent for an enemy of this kind doing this action, shown in this stance (or none). */
export function describeAction(kindName: string, line: Line, stance: string | undefined, a: ActionDef): Intent {
  const kind = ENEMY_KINDS[kindName];
  const lineDir = line === "back" ? "advance" : "retreat";
  const dir = a.dir === "advance" || a.dir === "retreat" ? a.dir : lineDir;
  const poses = kind.actionPoses?.[a.name];
  return {
    type: a.type, dir, forced: false, stance, action: a.name,
    pose: stance ? kind.stancePoses[stance] ?? poses?.act : poses?.act,
    actPose: poses?.act, strikePose: poses?.strike, projectile: poses?.projectile, restPose: poses?.rest, guardPose: poses?.guard,
    weight: a.weight, ranged: a.ranged || undefined, tags: a.tags.length ? a.tags : undefined,
  };
}

/**
 * The next intent: forced Rest while staggered, a script step if there is one, otherwise the
 * kind's pattern (stance, then action; see patterns.ts).
 */
function chooseIntent(e: Enemy, state: CombatState, rng: Rng): Intent {
  const kind = ENEMY_KINDS[e.kind];
  const lineDir = e.line === "back" ? "advance" : "retreat";
  if (e.reviving) return { type: "rest", dir: lineDir, forced: true };
  if (e.staggered) return { type: "rest", dir: lineDir, forced: true };

  const describe = (stance: string | undefined, a: ActionDef) => describeAction(e.kind, e.line, stance, a);

  // Scripted turns show the action itself (the tutorial uses this to show every pose once).
  const step = e.script[state.turn - 1];
  if (step) {
    const all = [...kind.pattern.actions.values()];
    const a = all.find(x => x.name.toLowerCase() === step.toLowerCase()) ?? all.find(x => x.type === step);
    return a ? describe(undefined, a) : { type: step as ActionType, dir: lineDir, forced: false };
  }

  const available = (a: ActionDef) => a.needs.every(n => kind.conditions?.[n]?.(e, state) ?? false);
  // Something it must pick on from (a boss's second phase) overrides what it just did.
  const memory = e.nextFrom ? { action: e.nextFrom, outcome: "done" as const } : e.last ? { action: e.last.name, outcome: e.last.outcome } : null;
  e.nextFrom = undefined;
  const picked = choose(kind.pattern, memory, available, rng);
  // A fixed rule overrides the action (the stance still shows as picked).
  const fixed = kind.forced?.(e, state, rng);
  if (fixed) {
    const a = kind.pattern.actions.get(fixed.action.toLowerCase());
    if (a) {
      const intent = describe(picked?.stance.name, a);
      if (fixed.target && fixed.target !== "player") {
        // Aimed at an ally: it moves toward them, which pushes you away.
        intent.target = fixed.target;
        if (a.type === "maneuver") intent.dir = "retreat";
      }
      return intent;
    }
  }
  if (!picked) return { type: "rest", dir: lineDir, forced: false };
  return describe(picked.stance.name, picked.action);
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
  kind: string;
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

/**
 * The fight's opening scene, if its setup has one: a Warden takes the flame an offering waxed
 * cradles (Usurp Flame), showing the mechanic before the fight begins. He starts Sealed, his
 * flame out; the scene leaves him Unsealed, the waxed encased for good, and every first intent
 * chosen afresh (his comes from "Usurp Flame >": Idle). Returns the fight after it.
 */
export function openingOf(state: CombatState, setups: EnemySetup[], rng: Rng = Math.random): { state: CombatState; opening?: Opening } {
  const offering = state.enemies.find((e, i) => setups[i]?.offering && e.kind === "waxed");
  const warden = state.enemies.find(e => e.kind === "warden");
  if (!offering || !warden) return { state };
  const kind = (k: string) => ENEMY_KINDS[k];
  const usurp = kind("warden").pattern.actions.get("usurp flame");
  const clutch = kind("waxed").pattern.actions.get("clutch flame");
  if (!usurp || !clutch) return { state };

  // After: the flame his, the waxed sealed whole in wax, and everyone's first move chosen.
  const after = structuredClone(state);
  const w = after.enemies.find(e => e.id === warden.id)!;
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
  const w0 = from.enemies.find(e => e.id === warden.id)!;
  const o0 = from.enemies.find(e => e.id === offering.id)!;
  w0.flags.sealed = true;
  w0.last = null;
  w0.intent = { ...describeAction("warden", w0.line, "Idle", usurp), target: o0.id, dir: "retreat" };
  o0.alive = true;
  o0.fate = undefined;
  o0.hp = o0.maxHP;
  o0.intent = describeAction("waxed", o0.line, "Cradle Flame", clutch);

  const events: CombatEvent[] = [
    { kind: "usurp", who: w.id, target: o.id },
    { kind: "encased", who: o.id },
    { kind: "flag", who: w.id, flag: "sealed", on: false },
  ];
  const view: Record<string, FighterView> = {};
  const p = after.player;
  view[p.id] = { hp: p.hp, fatigue: p.fatigue, death: p.death, staggered: p.staggered, alive: p.hp > 0, waxed: p.waxed, encased: !!p.encased };
  for (const e of after.enemies) view[e.id] = { hp: e.hp, fatigue: e.fatigue, death: e.death, staggered: e.staggered, alive: e.hp > 0, line: e.line, waxed: e.waxed, fate: e.fate };
  return { state: after, opening: { from, steps: [{ events, after: view }] } };
}

export function createCombat(
  player: PlayerSetup,
  enemies: EnemySetup[],
  config: Partial<CombatConfig> = {},
  rng: Rng = Math.random,
): CombatState {
  const p: Player = {
    id: "player",
    name: player.name ?? "You",
    maxHP: player.maxHP,
    hp: player.maxHP,
    fatigue: 0,
    death: 0,
    weapon: player.weapon,
    armor: player.armor,
    staggered: false,
    waxed: false,
    charges: player.charges,
    reviving: false,
  };

  const letters = "ABCDEFGHIJ";
  const foes: Enemy[] = enemies.map((setup, i) => {
    const kind = ENEMY_KINDS[setup.kind];
    if (!kind) throw new Error(`Unknown enemy kind "${setup.kind}"`);
    const maxHP = kind.maxHP;
    return {
      id: `e${i}`,
      kind: setup.kind,
      name: setup.name ?? (enemies.length > 1 ? `${kind.name} ${letters[i]}` : kind.name),
      maxHP,
      hp: maxHP,
      fatigue: 0,
      death: 0,
      weapon: kind.weapon,
      armor: kind.armor,
      staggered: false,
      line: setup.line ?? "back",
      alive: true,
      script: setup.script ?? [],
      intent: { type: "block", dir: "advance", forced: false }, // replaced below
      last: null,
      waxed: false,
      flags: { ...kind.flags },
      revives: kind.revives ?? 0,
      reviving: false,
    };
  });

  const state: CombatState = {
    turn: 1,
    player: p,
    enemies: foes,
    status: "playing",
    config: { ...config },
    lastTurn: [],
  };
  chooseIntents(state, rng);
  return state;
}

/** Every enemy's next intent. Those with fixed rules decide last, so they can react to the rest. */
function chooseIntents(state: CombatState, rng: Rng) {
  const order = [...state.enemies.filter(e => e.alive)].sort(
    (a, b) => Number(!!ENEMY_KINDS[a.kind].forced) - Number(!!ENEMY_KINDS[b.kind].forced),
  );
  for (const e of order) e.intent = chooseIntent(e, state, rng);
}

/* ============================================================
 * Questions the UI can ask before committing
 * ============================================================ */

/** The action the player is locked into this turn, if any. */
export function forcedAction(state: CombatState): "rest" | "revive" | null {
  if (state.player.reviving) return "revive";
  if (state.player.staggered) return "rest";
  return null;
}

/** Returns why an action can't be taken, or null if it's valid. Costs never block: overcommitting is allowed. */
export function validateAction(state: CombatState, action: PlayerAction): string | null {
  if (state.status !== "playing") return "The fight is over.";
  if (forcedAction(state)) return null; // the forced action replaces whatever was chosen
  const alive = (id?: string) => state.enemies.some(e => e.alive && e.id === id);
  switch (action.type) {
    case "rest":
      return null;
    case "attack":
    case "block":
      return alive(action.target) ? null : "Choose an enemy to target.";
    case "maneuver":
      return action.target === "self" || alive(action.target) ? null : "Choose an enemy, or yourself to fall back.";
  }
}

/* ============================================================
 * Resolving a turn
 *
 * Positions lock at the start: what the player saw during planning is what they fight.
 *
 * 1. Attacks, fastest weapon first (bare hands, light, normal, heavy). Each is answered by the target's
 *    Block or dodge, if it has one. Attacks of the same speed play one at a time in random
 *    order, but all of them land: a fighter dropped or staggered by a tied attack grits through
 *    to finish its own. After each speed group, anyone killed or staggered loses whatever
 *    they hadn't done yet: a slower attack, a Block for later attacks, a Rest, a move.
 * 2. Rests settle: a damaging hit cancels a voluntary Rest. Revives finish here too.
 * 3. Movement: Maneuvers pull their target close and push opponents away; disagreements cancel
 *    out; melee attacks close in on targets that didn't Maneuver.
 * 4. End of turn: decay, next intents.
 * ============================================================ */

export function resolveTurn(prev: CombatState, action: PlayerAction, rng: Rng = Math.random): CombatState {
  if (prev.status !== "playing") return prev;
  const problem = validateAction(prev, action);
  if (problem) throw new Error(problem);

  const s: CombatState = structuredClone(prev);
  const p = s.player;
  const cfg = s.config;
  const alive = s.enemies.filter(e => e.alive);
  const fighters: Fighter[] = [p, ...alive];
  const byId = (id?: string): Fighter | undefined => fighters.find(f => f.id === id);

  const locked = new Map<string, Line>(alive.map(e => [e.id, e.line]));
  const wasFlags = new Map(alive.map(e => [e.id, { ...e.flags }]));
  const wasStaggered = new Set(fighters.filter(f => f.staggered).map(f => f.id));
  /** Enemies on their protected revive turn: untouchable, back to full health when it ends. */
  const foeReviving = new Set(alive.filter(e => e.reviving).map(e => e.id));
  const isReviving = (f: Fighter) => (f === p ? reviving : foeReviving.has(f.id));
  const gained = new Set<string>();  // gained Fatigue this turn (no decay)
  const hurt = new Set<string>();    // took health damage this turn (cancels Rest)
  const out = new Set<string>();     // fell or broke this turn: remaining actions are lost
  const fallen = new Set<string>();  // health reached 0 this turn
  const pulls = new Map<string, string>(); // pulled to the front line by melee: enemy id -> who pulled it

  const steps: Step[] = [];
  let events: CombatEvent[] = [];
  const snapshot = (): Record<string, FighterView> => {
    const v: Record<string, FighterView> = {};
    v[p.id] = { hp: p.hp, fatigue: p.fatigue, death: p.death, staggered: p.staggered, alive: p.hp > 0, waxed: p.waxed, encased: !!p.encased };
    for (const e of alive) v[e.id] = { hp: e.hp, fatigue: e.fatigue, death: e.death, staggered: e.staggered, alive: e.hp > 0, line: e.line, waxed: e.waxed, fate: e.fate };
    return v;
  };
  const endStep = () => {
    if (events.length) steps.push({ events, after: snapshot() });
    events = [];
  };

  // What everyone committed to this turn
  const reviving = p.reviving;
  const forced = forcedAction(s);
  const act: PlayerAction | null = forced === "revive" ? null : forced === "rest" ? { type: "rest" } : action;
  const resting = new Map<string, boolean>(); // id -> forced?
  if (act?.type === "rest") resting.set(p.id, p.staggered);
  for (const e of alive) if (e.intent.type === "rest" && !foeReviving.has(e.id)) resting.set(e.id, e.intent.forced);

  /** Adds Fatigue, unless the fighter is staggered: then it's already pinned at full. */
  const tire = (f: Fighter, amount: number) => {
    if (amount <= 0) return;
    gained.add(f.id);
    if (cfg.dummy) return;
    if (!f.staggered) f.fatigue += amount;
  };
  /** A staggered fighter's bar stays solid white, even as its health drops. */
  const pinStaggered = () => { for (const f of fighters) if (f.staggered) f.fatigue = Math.max(0, f.hp); };

  /** The weight of a fighter's Attack or Block this turn: the action's own, or its weapon's. */
  const weightOf = (f: Fighter): WeaponTier =>
    f === p ? (act?.type === "attack" && act.weight ? act.weight : p.weapon) : (f as Enemy).intent.weight ?? f.weapon;
  const isRanged = (f: Fighter) => f !== p && !!(f as Enemy).intent.ranged;

  const isBlocking = (f: Fighter, attacker: Fighter) => {
    if (out.has(f.id)) return false;
    if (f === p) return act?.type === "block" && (act.target === attacker.id || locked.get(attacker.id) === "back");
    return (f as Enemy).intent.type === "block";
  };
  /**
   * A Maneuver dodges like a Block blocks: every attack from the back line, plus the attack of
   * its own target, even from the front line. Other front-line melee still hits. Ranged attacks
   * can always be dodged. (An enemy's target is you when it closes in.)
   */
  const isDodging = (f: Fighter, attacker: Fighter) => {
    if (out.has(f.id)) return false;
    const ranged = isRanged(attacker);
    if (f === p) {
      return act?.type === "maneuver" && (ranged || locked.get(attacker.id) === "back" || act.target === attacker.id);
    }
    const e = f as Enemy;
    return e.intent.type === "maneuver" && attacker === p && (ranged || locked.get(e.id) === "back" || e.intent.dir === "advance");
  };
  const blockedSomething = new Set<string>(); // Blocks that actually caught an attack
  const cancelled = new Set<string>();        // actions cancelled before they happened

  /* ---------- 1. Attacks, by speed ---------- */
  interface PendingAttack { attacker: Fighter; target: Fighter }
  const pending: PendingAttack[] = [];
  if (act?.type === "attack") pending.push({ attacker: p, target: byId(act.target)! });
  for (const e of alive) if (e.intent.type === "attack") pending.push({ attacker: e, target: p });
  const speeds = [...new Set(pending.map(a => WEAPONS[weightOf(a.attacker)].speed))].sort((a, b) => a - b);

  for (const speed of speeds) {
    // Ties play one at a time, in random order.
    const group = pending.filter(a => WEAPONS[weightOf(a.attacker)].speed === speed);
    for (let i = group.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [group[i], group[j]] = [group[j], group[i]];
    }
    group.forEach(({ attacker, target }, n) => {
      if (n > 0) endStep(); // each attack is its own beat
      if (out.has(attacker.id)) {
        cancelled.add(attacker.id);
        events.push({ kind: "canceled", who: attacker.id, action: "attack", reason: fallen.has(attacker.id) ? "fallen" : "staggered" });
        return;
      }
      if (fallen.has(target.id)) {
        cancelled.add(attacker.id);
        events.push({ kind: "canceled", who: attacker.id, action: "attack", reason: "no target" });
        return;
      }
      const grit = attacker.hp <= 0 || (!attacker.staggered && attacker.fatigue >= attacker.hp);
      const weight = weightOf(attacker);
      const ranged = isRanged(attacker);
      tire(attacker, attackCost(attacker, weight));
      // Melee closes in on the target; a ranged attacker stays where it is.
      if (attacker === p) pulls.set(target.id, p.id);
      else if (!ranged) pulls.set(attacker.id, attacker.id);
      const dmg = attackDamage(attacker, weight);

      if (isReviving(target)) {
        // The blow passes through someone reviving.
        events.push({ kind: "attack", attacker: attacker.id, target: target.id, result: "dodged", damage: 0, fatigue: 0, ranged, grit });
        return;
      }
      if (isDodging(target, attacker)) {
        // Out of the way: no damage, only the effort of the dodge.
        const effort = dodgeFatigue(target, dmg);
        tire(target, effort);
        events.push({ kind: "attack", attacker: attacker.id, target: target.id, result: "dodged", damage: 0, fatigue: effort, ranged, grit });
        return;
      }
      const blocking = isBlocking(target, attacker);
      if (blocking) blockedSomething.add(target.id);
      const resisted = dmg * resistance(target, blocking ? weightOf(target) : null);
      // On a Block, everything resisted goes back to the attacker; unless the attack is ranged,
      // when it simply stops there.
      if (!blocking) tire(target, resisted);
      else if (!ranged) tire(attacker, resisted);
      const through = dmg - resisted;
      if (through > 0) hurt.add(target.id);
      if (!cfg.dummy) target.hp -= through;
      const sentBack = blocking && ranged ? 0 : resisted;
      events.push({ kind: "attack", attacker: attacker.id, target: target.id, result: blocking ? "blocked" : "hit", damage: through, fatigue: sentBack, ranged, grit });
      // A direct waxing hit (the Warden's flail) leaves wax behind; on wax already there, it also tires.
      // Once his flame is free (phase two) it leaves no wax; set on fire, it burns for extra damage.
      const waxer = attacker !== p ? (attacker as Enemy) : undefined;
      if (!blocking && waxer?.intent.tags?.includes("waxing") && waxer.flags.flaming) {
        const burn = through * FLAMING_BONUS;
        if (!cfg.dummy) target.hp -= burn;
        if (burn > 0) hurt.add(target.id);
        events.push({ kind: "burned", who: target.id, damage: burn });
      }
      if (!blocking && waxer?.intent.tags?.includes("waxing") && !waxer.flags.phase2) {
        const bonus = target.waxed ? through / 8 : 0;
        tire(target, bonus);
        target.waxed = true;
        events.push({ kind: "waxed", who: target.id, bonus });
      }
    });

    // After the group lands: falls and staggers take effect before the next, slower group.
    for (const f of fighters) {
      if (out.has(f.id)) continue;
      if (isReviving(f)) continue; // untouchable, and still at 0 until the revive lands
      if (f.hp <= 0) {
        out.add(f.id);
        fallen.add(f.id);
        events.push({ kind: "fall", who: f.id });
      } else if (!f.staggered && f.fatigue >= f.hp) {
        out.add(f.id);
        f.staggered = true;
        events.push({ kind: "stagger", who: f.id });
      }
    }
    pinStaggered();
    endStep();
  }

  /* ---------- 2. Rests and revives settle ---------- */
  if (reviving) {
    // The revive lands at the end of the protected turn: back to full health, fresh, like a boss.
    p.hp = p.maxHP;
    p.fatigue = 0;
    p.death = 0;
    p.staggered = false;
    p.waxed = false;
    p.encased = false;
    events.push({ kind: "revive", who: p.id });
  }
  for (const e of alive) {
    if (!foeReviving.has(e.id)) continue;
    // A boss rises again at full health.
    e.hp = e.maxHP;
    e.fatigue = 0;
    e.death = 0;
    e.staggered = false;
    e.reviving = false;
    events.push({ kind: "revive", who: e.id });
  }
  // Your flame about to be taken (Usurp Flame on you, aimed at no ally): you stay down, sealed,
  // until he has it; you only get back up at the very end of the turn.
  const usurpOnYou = alive.some(e => e.intent.action === "Usurp Flame" && !e.intent.target && !out.has(e.id));
  let recoverLast = false;
  for (const [id, wasForced] of resting) {
    const f = byId(id)!;
    if (fallen.has(id)) continue;
    if (wasForced && f === p && usurpOnYou && p.staggered) { recoverLast = true; continue; }
    if (wasForced) {
      // The forced Rest always ends the break, hit or not, with Fatigue back to 0.
      f.staggered = false;
      f.fatigue = 0;
      // With its Fatigue gone, so is everything that hung on it: the wax breaks away.
      f.waxed = false;
      f.encased = false;
      events.push({ kind: "rest", who: id, result: "recovered", forced: true });
      continue;
    }
    if (hurt.has(id) || out.has(id)) {
      // A blow breaks the Rest: no recovery.
      events.push({ kind: "rest", who: id, result: "interrupted", forced: false });
      continue;
    }
    f.fatigue -= restAmount(f);
    if (f.fatigue < 0) {
      // Rested past zero Fatigue: half the excess heals.
      heal(f, -f.fatigue / 2);
      f.fatigue = 0;
    }
    if (f.fatigue <= 0) f.waxed = false;
    events.push({ kind: "rest", who: id, result: "rested", forced: false });
  }
  endStep();

  /* ---------- 3. Movement ---------- */
  const before = new Map(alive.map(e => [e.id, e.line]));
  const movedBy = new Map<string, string>();
  const place = (e: Enemy, line: Line, by: string) => {
    e.line = line;
    movedBy.set(e.id, by);
  };
  // A Maneuver pulls its target closer and pushes its opponents away (never its allies): yours
  // brings your target to the front line and sends every other enemy back; an enemy's either
  // closes in on you or backs off. Each enemy's distance from you is settled on its own: if you
  // both Maneuvered and disagree, you both move but the distance stays. A melee attack closes
  // in on its target only if the target didn't Maneuver. A Maneuver costs nothing in itself:
  // only the attacks it dodged tired you.
  const youMove = act?.type === "maneuver" && !out.has(p.id);
  if (youMove) events.push({ kind: "maneuver", who: p.id, target: act!.target === "self" ? undefined : act!.target });
  for (const e of alive) {
    if (e.intent.type !== "maneuver") continue;
    if (out.has(e.id)) { cancelled.add(e.id); continue; }
    // Aimed at an ally that is already gone: nothing to reach.
    const ally = e.intent.target ? s.enemies.find(x => x.id === e.intent.target) : undefined;
    if (e.intent.target && (!ally || !ally.alive || fallen.has(ally.id))) {
      cancelled.add(e.id);
      events.push({ kind: "canceled", who: e.id, action: "maneuver", reason: "no target" });
      continue;
    }
    events.push({ kind: "maneuver", who: e.id, target: e.intent.target ?? (e.intent.dir === "advance" ? p.id : undefined) });
  }
  for (const e of alive) {
    if (fallen.has(e.id)) continue;
    const yours: Line | null = youMove ? (act!.target === e.id ? "front" : "back") : null;
    const its: Line | null = e.intent.type === "maneuver" && !out.has(e.id) && !cancelled.has(e.id) ? (e.intent.dir === "advance" ? "front" : "back") : null;
    if (yours && its) { if (yours === its) place(e, yours, p.id); }
    else if (yours) place(e, yours, p.id);
    else if (its) place(e, its, e.id);
    else if (pulls.has(e.id)) place(e, "front", pulls.get(e.id)!);
  }
  for (const e of alive) {
    const from = before.get(e.id)!;
    if (!fallen.has(e.id) && from !== e.line) events.push({ kind: "move", who: e.id, from, to: e.line, cause: movedBy.get(e.id)! });
  }

  /* ---------- 4. End of turn ---------- */
  for (const f of fighters) {
    if (!gained.has(f.id) && !f.staggered) f.fatigue /= 2;
    f.death /= 2; // nothing applies Death yet; kept so the rule is in place
  }
  const fellReviving = new Set<string>();
  for (const e of alive) {
    if (fallen.has(e.id) && e.revives > 0) {
      // A boss with a revive left: its protected turn is next, then it rises at full health.
      e.revives -= 1;
      e.reviving = true;
      e.hp = 0;
      e.fatigue = 0;
      e.death = 0;
      e.staggered = false;
      fellReviving.add(e.id);
    } else if (fallen.has(e.id)) {
      e.alive = false;
      e.fate = "fallen";
      e.hp = 0;
      e.fatigue = 0;
    } else if (!e.staggered && e.fatigue >= e.hp) {
      e.staggered = true;
      events.push({ kind: "stagger", who: e.id });
    }
  }

  p.reviving = false;
  if (p.hp <= 0) {
    if (p.charges > 0) {
      // A charge is spent now, but the health only comes back at the end of next turn.
      p.charges -= 1;
      p.reviving = true;
      p.hp = 0;
      p.fatigue = 0;
      p.death = 0;
      p.staggered = false;
    } else {
      p.hp = 0;
      s.status = "lost";
      events.push({ kind: "defeat", who: p.id });
    }
  } else if (!p.staggered && p.fatigue >= p.hp) {
    p.staggered = true;
    events.push({ kind: "stagger", who: p.id });
  }
  // Wax only lasts while there's Fatigue to hold it (a staggered fighter keeps it until it recovers).
  for (const f of fighters) if (f.waxed && f.fatigue <= 0 && !f.staggered) f.waxed = false;
  // Back on its feet, the wax sealing it breaks away.
  for (const f of fighters) if (f.encased && !f.staggered) f.encased = false;
  pinStaggered();
  endStep();

  // How each enemy's action went, for what it can do next turn.
  const interrupted = new Set<string>();
  for (const st of steps) for (const ev of st.events) if (ev.kind === "rest" && ev.result === "interrupted") interrupted.add(ev.who);
  for (const e of alive) {
    if (!e.alive) continue;
    const { type, forced } = e.intent;
    const undone =
      cancelled.has(e.id) ||
      (type === "rest" && interrupted.has(e.id)) ||
      (type === "block" && !blockedSomething.has(e.id));
    e.last = { name: e.intent.action, outcome: forced ? "recover" : undone ? "undone" : "done" };
  }

  // Each kind's own rules (the Warden's flame, phases, Usurp Flame).
  for (const e of alive) {
    const kind = ENEMY_KINDS[e.kind];
    if (!kind.afterTurn || !e.alive) continue;
    kind.afterTurn({
      self: e,
      state: s,
      action: e.intent.action,
      outcome: e.last?.outcome ?? "undone",
      staggered: e.staggered && !wasStaggered.has(e.id),
      fell: fellReviving.has(e.id),
      was: wasFlags.get(e.id)!,
      event: ev => events.push(ev),
    });
  }
  endStep();
  if (recoverLast) {
    // The forced Rest ends the break, as always: the wax sealing you breaks away with it.
    p.staggered = false;
    p.fatigue = 0;
    p.waxed = false;
    p.encased = false;
    events.push({ kind: "rest", who: p.id, result: "recovered", forced: true });
    endStep();
  }

  if (s.enemies.every(e => !e.alive) && s.status === "playing") s.status = "won";

  s.lastTurn = steps;
  s.turn += 1;
  if (s.status === "playing") chooseIntents(s, rng);
  return s;
}

/** Healing clears Death first, then restores health. */
function heal(f: Fighter, amount: number) {
  const fromDeath = Math.min(f.death, amount);
  f.death -= fromDeath;
  f.hp = Math.min(f.maxHP, f.hp + amount - fromDeath);
}

/* ============================================================
 * Ready-made encounters
 * ============================================================ */

export interface Encounter {
  id: string;
  label: string;
  enemies: EnemySetup[];
  /** Your revives in this fight, if not the usual. */
  charges?: number;
}

export const ENCOUNTERS: Encounter[] = [
  { id: "one", label: "One sleepwalker", enemies: [{ kind: "sleepwalker" }] },
  { id: "two", label: "Two sleepwalkers", enemies: [{ kind: "sleepwalker" }, { kind: "sleepwalker" }] },
  {
    id: "three",
    label: "Three sleepwalkers",
    enemies: [{ kind: "sleepwalker" }, { kind: "sleepwalker" }, { kind: "sleepwalker" }],
  },
  { id: "waxed", label: "One waxed", enemies: [{ kind: "waxed" }] },
  { id: "waxed-pair", label: "Two waxed", enemies: [{ kind: "waxed" }, { kind: "waxed" }] },
  {
    id: "mixed",
    label: "Sleepwalker and waxed",
    enemies: [{ kind: "sleepwalker", line: "front" }, { kind: "waxed" }],
  },
  {
    // The tutorial boss, escorted by two waxed.
    id: "warden",
    label: "Penitent Warden",
    charges: 1,
    enemies: [
      { kind: "waxed", name: "Waxed A", line: "front" },
      { kind: "warden", name: "Penitent Warden" },
      { kind: "waxed", name: "Waxed B", line: "front" },
      // The opening scene: he takes this one's flame before the fight begins.
      { kind: "waxed", name: "Waxed C", offering: true },
    ],
  },
];