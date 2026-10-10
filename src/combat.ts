/**
 * combat.ts — the combat rules, with no rendering.
 *
 * Every function here is pure: it takes a CombatState and returns a new one,
 * so the UI only has to call `resolveTurn` and render whatever comes back.
 *
 * Units: weights and costs are written in sixteenths of the fighter's max health,
 * matching the design doc. `sixteenths(n, maxHP)` turns them into real numbers.
 */

/* ============================================================
 * Basic types
 * ============================================================ */

export type Tier = "light" | "normal" | "heavy";
export type ArmorTier = "none" | Tier;
export type Line = "front" | "back";
export type ActionType = "attack" | "block" | "maneuver" | "rest";
/**
 * How a sleepwalker stands while it decides, which is all you get to see of its plan:
 * - ready: knees bent, weapon raised. Attack, Block or Maneuver: never Rest.
 * - intimidating: an open pose. Attack or Rest.
 * - cautious: guard up, low. Rest, Block or Maneuver: never Attack.
 */
export type Stance = "ready" | "intimidating" | "cautious";
export type Status = "playing" | "won" | "lost";

/** What a player can submit. `target` is an enemy id, or "self" for a Maneuver that falls back. */
export interface PlayerAction {
  type: ActionType;
  target?: string;
}

/** What an enemy telegraphs during planning. */
export interface Intent {
  type: ActionType;
  /** For Maneuver: where it will end up. Decided from its line when the intent is chosen. */
  dir: "advance" | "retreat";
  /** True when the enemy is guard broken and has no choice. */
  forced: boolean;
  /** When set, only this stance is shown, not the action itself (revealed as the turn plays). */
  stance?: Stance;
}

export interface Fighter {
  id: string;
  name: string;
  maxHP: number;
  hp: number;
  fatigue: number;
  death: number;
  weapon: Tier;
  armor: ArmorTier;
  /** Guard broken: Fatigue is pinned at full (it can't grow further) and the next turn is a forced Rest,
   *  which always ends with Fatigue at 0. */
  broken: boolean;
}

export interface Player extends Fighter {
  /** Healing item charges, spent automatically to revive. */
  charges: number;
  /** True during the protected turn after falling with a charge left. Health stays at 0 until the
   *  turn ends, then comes back to half (along with rests). */
  reviving: boolean;
}

export interface Enemy extends Fighter {
  kind: string;
  line: Line;
  alive: boolean;
  intent: Intent;
  /** Optional scripted actions for the first turns, e.g. to show every pose in the tutorial. */
  script: ActionType[];
}

export type LogKind = "info" | "hit" | "break" | "death";
export interface LogEntry {
  text: string;
  kind: LogKind;
}
export interface TurnLog {
  /** 0 is the opening line before turn 1. */
  turn: number;
  entries: LogEntry[];
}

export interface CombatConfig {
  /** Damage multiplier against a resting target. 1 = no bonus (current design). */
  restBonus: number;
}

/* ---------- What happened during a turn, step by step ---------- */

/** One thing that happened. Ids are "player" or an enemy id. */
export type CombatEvent =
  | {
      kind: "attack";
      attacker: string;
      target: string;
      /** hit: landed; blocked: landed into a Block; dodged: avoided by a Maneuver from the back line. */
      result: "hit" | "blocked" | "dodged";
      /** Health lost by the target. */
      damage: number;
      /** Fatigue added: to the target on a hit, to the attacker on a Block. */
      fatigue: number;
      /** The attacker was already dropped or broken by a tied attack, and grits through to finish its own. */
      grit: boolean;
    }
  | { kind: "canceled"; who: string; action: ActionType; reason: "broken" | "fallen" | "no target" }
  | { kind: "break"; who: string }
  | { kind: "fall"; who: string }
  | { kind: "rest"; who: string; result: "rested" | "interrupted" | "recovered"; forced: boolean }
  /** `cause` is who moved them: the enemy itself, or the player (by Maneuvering or pulling it in with an attack). */
  | { kind: "move"; who: string; from: Line; to: Line; cause: string }
  | { kind: "revive"; who: string }
  | { kind: "defeat"; who: string };

/** Bars and positions after a step, so the screen can show the fight mid-turn. */
export interface FighterView {
  hp: number;
  fatigue: number;
  death: number;
  broken: boolean;
  alive: boolean;
  line?: Line;
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
  /** Oldest first. */
  log: TurnLog[];
  /** How the most recent turn played out, step by step. Empty before the first turn. */
  lastTurn: Step[];
}

/** Random source, injectable for tests and replays. Returns a number in [0, 1). */
export type Rng = () => number;

/* ============================================================
 * Tuning tables (sixteenths of max health)
 * ============================================================ */

/** `speed` orders attacks within a turn: lower goes first, equal speeds land together. */
export const WEAPONS: Record<Tier, { cost: number; damage: number; block: number; speed: number; label: string }> = {
  light:  { cost: 1, damage: 2, block: 2, speed: 1, label: "Light" },
  normal: { cost: 3, damage: 3, block: 3, speed: 2, label: "Normal" },
  heavy:  { cost: 8, damage: 4, block: 4, speed: 3, label: "Heavy" },
};

/** "none" uses the base Resistance of 1/16. Its Maneuver cost is still an open question; 1 for now. */
export const ARMOR: Record<ArmorTier, { resist: number; move: number; label: string }> = {
  none:   { resist: 1, move: 1, label: "None" },
  light:  { resist: 2, move: 1, label: "Light" },
  normal: { resist: 3, move: 3, label: "Normal" },
  heavy:  { resist: 4, move: 8, label: "Heavy" },
};

/** Rest clears this much Fatigue. */
export const REST_CLEARS = 8;

export const DEFAULT_CONFIG: CombatConfig = {
  restBonus: 1,
};

/* ============================================================
 * Derived numbers
 * ============================================================ */

export const sixteenths = (n: number, maxHP: number) => (n / 16) * maxHP;

export const attackCost = (f: Fighter) => sixteenths(WEAPONS[f.weapon].cost, f.maxHP);
export const attackDamage = (f: Fighter) => sixteenths(WEAPONS[f.weapon].damage, f.maxHP);
export const maneuverCost = (f: Fighter) => sixteenths(ARMOR[f.armor].move, f.maxHP);
export const restAmount = (f: Fighter) => sixteenths(REST_CLEARS, f.maxHP);

/** Share of incoming damage turned into Fatigue (0..1). */
export const resistance = (f: Fighter, blocking: boolean) =>
  Math.min(1, (ARMOR[f.armor].resist + (blocking ? WEAPONS[f.weapon].block : 0)) / 16);

/** An action is affordable if paying for it leaves the fighter below its guard-break point. */
export const canAfford = (f: Fighter, cost: number) => f.fatigue + cost < f.hp;

/* ============================================================
 * Enemy kinds
 * ============================================================ */

/**
 * Enemies may pick any action, even one that will break their own guard (an attack or Maneuver
 * they can't afford). Only a kind written with an explicit restriction avoids that.
 */
export interface EnemyKind {
  name: string;
  maxHP: number;
  weapon: Tier;
  armor: ArmorTier;
  /**
   * Pick the next action, and optionally the stance shown instead of it.
   * Only called when the enemy isn't broken and has no script step.
   */
  choose: (self: Enemy, state: CombatState, rng: Rng) => ActionType | { type: ActionType; stance: Stance };
}

/**
 * The global rule for enemy choices: from a set of options, each is equally likely.
 * (Stances, kinds of action, and actions within a kind are all picked this way.)
 */
export const pickOne = <T>(options: readonly T[], rng: Rng): T => options[Math.floor(rng() * options.length)];

/** The three kinds of action: Attack, Defense (Block and Maneuver) and Rest. */
export type ActionKind = "attack" | "defense" | "rest";
export const KIND_OF: Record<ActionType, ActionKind> = { attack: "attack", block: "defense", maneuver: "defense", rest: "rest" };

/**
 * Picks among `actions` the way every enemy does: first a kind (Attack, Defense or Rest),
 * evenly among the kinds on offer, then an action of that kind, evenly again. So with Attack,
 * Block and Maneuver on offer: Attack 1/2, Block 1/4, Maneuver 1/4.
 */
export function pickAction(actions: ActionType[], rng: Rng): ActionType {
  const kind = pickOne([...new Set(actions.map(a => KIND_OF[a]))], rng);
  return pickOne(actions.filter(a => KIND_OF[a] === kind), rng);
}

/** Which actions each stance can lead to. Within a stance, see pickAction for the odds. */
const STANCE_ACTIONS: Record<Stance, ActionType[]> = {
  ready: ["attack", "block", "maneuver"],
  intimidating: ["attack", "rest"],
  cautious: ["rest", "block", "maneuver"],
};
const STANCES = Object.keys(STANCE_ACTIONS) as Stance[];

export const ENEMY_KINDS: Record<string, EnemyKind> = {
  /**
   * The standard enemy. It shows a stance, never its action: Ready, Intimidating or Cautious,
   * each covering a few actions (see Stance). Each turn it takes one of the three stances at
   * random, a third each, then an action from that stance (see pickAction).
   */
  sleepwalker: {
    name: "Depraved Sleepwalker",
    maxHP: 20,
    weapon: "normal",
    armor: "light",
    choose: (_self, _state, rng) => {
      const stance = pickOne(STANCES, rng);
      return { type: pickAction(STANCE_ACTIONS[stance], rng), stance };
    },
  },
  /**
   * The weakest enemy: a sleepwalker the wardens tried to soothe back to sleep, half sealed in
   * sickly wax. Unarmed and clumsy, and fully telegraphed: it has four stances, one per action
   * (lunge = Attack, hunch = Block, crouch = Maneuver, slump = Rest), each leading to its action
   * every time. Which stance it takes each turn is random, a quarter each.
   */
  waxed: {
    name: "Waxed",
    maxHP: 12,
    weapon: "light",
    armor: "none",
    choose: (_self, _state, rng) => pickOne(["attack", "block", "maneuver", "rest"] as ActionType[], rng),
  },
};

function chooseIntent(e: Enemy, state: CombatState, rng: Rng): Intent {
  const dir = e.line === "back" ? "advance" : "retreat";
  if (e.broken) return { type: "rest", dir, forced: true };
  // Scripted turns show the action itself (the tutorial uses this to show every pose once).
  const step = e.script[state.turn - 1];
  if (step) return { type: step, dir, forced: false };
  const choice = ENEMY_KINDS[e.kind].choose(e, state, rng);
  return typeof choice === "string"
    ? { type: choice, dir, forced: false }
    : { type: choice.type, dir, forced: false, stance: choice.stance };
}

/* ============================================================
 * Setting up a fight
 * ============================================================ */

export interface PlayerSetup {
  name?: string;
  maxHP: number;
  weapon: Tier;
  armor: ArmorTier;
  charges: number;
}

export interface EnemySetup {
  kind: string;
  name?: string;
  maxHP?: number;
  line?: Line;
  script?: ActionType[];
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
    broken: false,
    charges: player.charges,
    reviving: false,
  };

  const letters = "ABCDEFGHIJ";
  const foes: Enemy[] = enemies.map((setup, i) => {
    const kind = ENEMY_KINDS[setup.kind];
    if (!kind) throw new Error(`Unknown enemy kind "${setup.kind}"`);
    const maxHP = setup.maxHP ?? kind.maxHP;
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
      broken: false,
      line: setup.line ?? "back",
      alive: true,
      script: setup.script ?? [],
      intent: { type: "block", dir: "advance", forced: false }, // replaced below
    };
  });

  const state: CombatState = {
    turn: 1,
    player: p,
    enemies: foes,
    status: "playing",
    config: { ...DEFAULT_CONFIG, ...config },
    log: [{ turn: 0, entries: [{ text: "The fight begins.", kind: "info" }] }],
    lastTurn: [],
  };
  for (const e of state.enemies) e.intent = chooseIntent(e, state, rng);
  return state;
}

/* ============================================================
 * Questions the UI can ask before committing
 * ============================================================ */

/** The action the player is locked into this turn, if any. */
export function forcedAction(state: CombatState): "rest" | "revive" | null {
  if (state.player.reviving) return "revive";
  if (state.player.broken) return "rest";
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

/** Who is attacking this turn, and which of those attacks the given plan leaves unanswered. */
export function previewThreat(state: CombatState, action?: PlayerAction) {
  const attackers = state.enemies.filter(e => e.alive && e.intent.type === "attack");
  let unanswered: Enemy[];
  if (state.player.reviving) unanswered = [];
  else if (action?.type === "block") unanswered = attackers.filter(e => e.line === "front" && e.id !== action.target);
  else if (action?.type === "maneuver") unanswered = attackers.filter(e => e.line === "front");
  else unanswered = attackers;
  return { attackers, unanswered };
}

/* ============================================================
 * Resolving a turn
 *
 * Positions lock at the start: what the player saw during planning is what they fight.
 *
 * 1. Attacks, fastest weapon first (light, normal, heavy). Each is answered by the target's
 *    Block or dodge, if it has one. Attacks of the same speed play one at a time in random
 *    order, but all of them land: a fighter dropped or broken by a tied attack grits through
 *    to finish its own. After each speed group, anyone killed or guard broken loses whatever
 *    they hadn't done yet: a slower attack, a Block for later attacks, a Rest, a move.
 * 2. Rests settle: a damaging hit cancels a voluntary Rest. Revives finish here too.
 * 3. Movement: player Maneuver, melee pulls, enemy Maneuvers.
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
  const nameOf = (f: Fighter) => (f === p ? "You" : f.name);

  const locked = new Map<string, Line>(alive.map(e => [e.id, e.line]));
  const gained = new Set<string>();  // gained Fatigue this turn (no decay)
  const hurt = new Set<string>();    // took health damage this turn (cancels Rest)
  const out = new Set<string>();     // fell or broke this turn: remaining actions are lost
  const fallen = new Set<string>();  // health reached 0 this turn
  const pulls = new Map<string, string>(); // pulled to the front line by melee: enemy id -> who pulled it

  const steps: Step[] = [];
  let events: CombatEvent[] = [];
  const entries: LogEntry[] = [];
  const say = (text: string, kind: LogKind = "info") => entries.push({ text, kind });
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const snapshot = (): Record<string, FighterView> => {
    const v: Record<string, FighterView> = {};
    v[p.id] = { hp: p.hp, fatigue: p.fatigue, death: p.death, broken: p.broken, alive: p.hp > 0 };
    for (const e of alive) v[e.id] = { hp: e.hp, fatigue: e.fatigue, death: e.death, broken: e.broken, alive: e.hp > 0, line: e.line };
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
  if (act?.type === "rest") resting.set(p.id, p.broken);
  for (const e of alive) if (e.intent.type === "rest") resting.set(e.id, e.intent.forced);

  /** Adds Fatigue, unless the fighter is broken: then it's already pinned at full. */
  const tire = (f: Fighter, amount: number) => {
    if (amount <= 0) return;
    gained.add(f.id);
    if (!f.broken) f.fatigue += amount;
  };
  /** A broken fighter's bar stays solid white, even as its health drops. */
  const pinBroken = () => { for (const f of fighters) if (f.broken) f.fatigue = Math.max(0, f.hp); };

  const isBlocking = (f: Fighter, attacker: Enemy | Player) => {
    if (out.has(f.id)) return false;
    if (f === p) return act?.type === "block" && (act.target === attacker.id || locked.get(attacker.id) === "back");
    return (f as Enemy).intent.type === "block";
  };
  const isDodging = (f: Fighter, attacker: Fighter) => {
    if (out.has(f.id)) return false;
    if (f === p) return act?.type === "maneuver" && locked.get(attacker.id) === "back";
    const e = f as Enemy;
    return e.intent.type === "maneuver" && locked.get(e.id) === "back" && attacker === p;
  };

  /* ---------- 1. Attacks, by speed ---------- */
  interface PendingAttack { attacker: Fighter; target: Fighter }
  const pending: PendingAttack[] = [];
  if (act?.type === "attack") pending.push({ attacker: p, target: byId(act.target)! });
  for (const e of alive) if (e.intent.type === "attack") pending.push({ attacker: e, target: p });
  const speeds = [...new Set(pending.map(a => WEAPONS[a.attacker.weapon].speed))].sort((a, b) => a - b);

  for (const speed of speeds) {
    // Ties play one at a time, in random order.
    const group = pending.filter(a => WEAPONS[a.attacker.weapon].speed === speed);
    for (let i = group.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [group[i], group[j]] = [group[j], group[i]];
    }
    group.forEach(({ attacker, target }, n) => {
      if (n > 0) endStep(); // each attack is its own beat
      if (out.has(attacker.id)) {
        events.push({ kind: "canceled", who: attacker.id, action: "attack", reason: fallen.has(attacker.id) ? "fallen" : "broken" });
        say(`${nameOf(attacker)} ${fallen.has(attacker.id) ? "falls" : "breaks"} before the attack lands.`);
        return;
      }
      if (fallen.has(target.id)) {
        events.push({ kind: "canceled", who: attacker.id, action: "attack", reason: "no target" });
        return;
      }
      const grit = attacker.hp <= 0 || (!attacker.broken && attacker.fatigue >= attacker.hp);
      tire(attacker, attackCost(attacker));
      if (attacker === p) pulls.set(target.id, p.id);
      else pulls.set(attacker.id, attacker.id);

      if (target === p && reviving) {
        events.push({ kind: "attack", attacker: attacker.id, target: p.id, result: "dodged", damage: 0, fatigue: 0, grit });
        say(`${nameOf(attacker)}'s blow passes through you as you revive.`);
        return;
      }
      if (isDodging(target, attacker)) {
        events.push({ kind: "attack", attacker: attacker.id, target: target.id, result: "dodged", damage: 0, fatigue: 0, grit });
        say(`${nameOf(target)} ${target === p ? "evade" : "evades"} ${nameOf(attacker)}'s attack.`);
        return;
      }
      const blocking = isBlocking(target, attacker as Enemy);
      const dmg = attackDamage(attacker) * (resting.has(target.id) ? cfg.restBonus : 1);
      const resisted = dmg * resistance(target, blocking);
      const taker = blocking ? attacker : target; // on a Block, everything resisted goes back to the attacker
      tire(taker, resisted);
      const through = dmg - resisted;
      if (through > 0) hurt.add(target.id);
      target.hp -= through;
      events.push({ kind: "attack", attacker: attacker.id, target: target.id, result: blocking ? "blocked" : "hit", damage: through, fatigue: resisted, grit });
      say(
        blocking
          ? `${nameOf(attacker)} ${attacker === p ? "strike" : "strikes"} into ${target === p ? "your" : `${nameOf(target)}'s`} guard: ${r1(through)} damage, ${r1(resisted)} Fatigue sent back.`
          : `${nameOf(attacker)} ${attacker === p ? "hit" : "hits"} ${target === p ? "you" : nameOf(target)}: ${r1(through)} damage, ${r1(resisted)} as Fatigue.`,
        "hit",
      );
    });

    // After the group lands: falls and breaks take effect before the next, slower group.
    for (const f of fighters) {
      if (out.has(f.id)) continue;
      if (f === p && reviving) continue; // untouchable, and still at 0 until the revive lands
      if (f.hp <= 0) {
        out.add(f.id);
        fallen.add(f.id);
        events.push({ kind: "fall", who: f.id });
        say(f === p ? "You fall." : `${f.name} falls still at last.`, "death");
      } else if (!f.broken && f.fatigue >= f.hp) {
        out.add(f.id);
        f.broken = true;
        events.push({ kind: "break", who: f.id });
        say(f === p ? "Your guard breaks." : `${f.name}'s guard breaks.`, "break");
      }
    }
    pinBroken();
    endStep();
  }

  /* ---------- 2. Rests and revives settle ---------- */
  if (reviving) {
    // The revive lands at the end of the protected turn: back to half health, fresh.
    p.hp = p.maxHP / 2;
    p.fatigue = 0;
    p.death = 0;
    p.broken = false;
    events.push({ kind: "revive", who: p.id });
    say("You revive. Nothing could touch you this turn.");
  }
  for (const [id, wasForced] of resting) {
    const f = byId(id)!;
    if (fallen.has(id)) continue;
    if (wasForced) {
      // The forced Rest always ends the break, hit or not, with Fatigue back to 0.
      f.broken = false;
      f.fatigue = 0;
      events.push({ kind: "rest", who: id, result: "recovered", forced: true });
      say(f === p ? "You come back to your senses." : `${f.name} recovers.`);
      continue;
    }
    if (hurt.has(id) || out.has(id)) {
      events.push({ kind: "rest", who: id, result: "interrupted", forced: false });
      say(`${f === p ? "Your" : `${f.name}'s`} rest is broken by the blow. No recovery.`, "hit");
      continue;
    }
    f.fatigue -= restAmount(f);
    if (f.fatigue < 0) {
      const leftover = -f.fatigue / 2;
      f.fatigue = 0;
      if (!hurt.has(id)) heal(f, leftover);
    }
    events.push({ kind: "rest", who: id, result: "rested", forced: wasForced });
  }
  endStep();

  /* ---------- 3. Movement ---------- */
  const before = new Map(alive.map(e => [e.id, e.line]));
  const movedBy = new Map<string, string>();
  const place = (e: Enemy, line: Line, by: string) => {
    e.line = line;
    movedBy.set(e.id, by);
  };
  if (act?.type === "maneuver" && !out.has(p.id)) {
    tire(p, maneuverCost(p));
    for (const e of alive) place(e, act.target !== "self" && e.id === act.target ? "front" : "back", p.id);
  }
  for (const [id, by] of pulls) {
    const e = alive.find(x => x.id === id);
    if (e && !fallen.has(id)) place(e, "front", by);
  }
  for (const e of alive) {
    if (e.intent.type !== "maneuver" || out.has(e.id)) continue;
    tire(e, maneuverCost(e));
    place(e, e.intent.dir === "advance" ? "front" : "back", e.id);
  }
  for (const e of alive) {
    const from = before.get(e.id)!;
    if (!fallen.has(e.id) && from !== e.line) events.push({ kind: "move", who: e.id, from, to: e.line, cause: movedBy.get(e.id)! });
  }

  /* ---------- 4. End of turn ---------- */
  for (const f of fighters) {
    if (!gained.has(f.id) && !f.broken) f.fatigue /= 2;
    f.death /= 2; // nothing applies Death yet; kept so the rule is in place
  }
  for (const e of alive) {
    if (fallen.has(e.id)) {
      e.alive = false;
      e.hp = 0;
      e.fatigue = 0;
    } else if (!e.broken && e.fatigue >= e.hp) {
      e.broken = true;
      events.push({ kind: "break", who: e.id });
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
      p.broken = false;
      say("The world refuses to let you go. You will revive at the end of next turn.", "death");
    } else {
      p.hp = 0;
      s.status = "lost";
      events.push({ kind: "defeat", who: p.id });
      say("You fall, with nothing left to bring you back.", "death");
    }
  } else if (!p.broken && p.fatigue >= p.hp) {
    p.broken = true;
    events.push({ kind: "break", who: p.id });
    say("Your guard breaks.", "break");
  }
  pinBroken();
  endStep();

  if (s.enemies.every(e => !e.alive) && s.status === "playing") s.status = "won";

  s.log.push({ turn: prev.turn, entries });
  s.lastTurn = steps;
  s.turn += 1;
  if (s.status === "playing") {
    for (const e of s.enemies) if (e.alive) e.intent = chooseIntent(e, s, rng);
  }
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
];