/**
 * turn.ts — a turn being resolved: the fight it works on, what everyone committed to, what has
 * happened to whom so far, and the steps it has recorded. Each phase of the turn (attacks.ts,
 * rests.ts, movement.ts, endTurn.ts) reads and changes it in turn.
 */
import type { CombatEvent, CombatState, Enemy, Fighter, FighterView, Line, Player, PlayerAction, Step, WeaponTier } from "../types";

/** The action the player is locked into this turn, if any. */
export function forcedAction(state: CombatState): "rest" | "revive" | null {
  if (state.player.reviving) return "revive";
  if (state.player.staggered) return "rest";
  return null;
}

/** Bars and positions of these fighters right now, so the screen can show the fight mid-turn. */
export function snapshotOf(p: Player, enemies: Enemy[]): Record<string, FighterView> {
  const v: Record<string, FighterView> = {};
  v[p.id] = { hp: p.hp, fatigue: p.fatigue, death: p.death, staggered: p.staggered, alive: p.hp > 0, waxed: p.waxed, encased: !!p.encased };
  for (const e of enemies) v[e.id] = { hp: e.hp, fatigue: e.fatigue, death: e.death, staggered: e.staggered, alive: e.hp > 0, line: e.line, waxed: e.waxed, fate: e.fate };
  return v;
}

export interface Turn {
  /** The fight as it now stands (a copy of the one the turn started from). */
  s: CombatState;
  p: Player;
  /** Enemies still in the fight as the turn started. */
  alive: Enemy[];
  /** You, then those enemies. */
  fighters: Fighter[];
  byId: (id?: string) => Fighter | undefined;

  /** What you do this turn: your choice, the forced Rest while staggered, or nothing while reviving. */
  act: PlayerAction | null;
  /** You're on your protected revive turn. */
  reviving: boolean;
  /** Enemies on their protected revive turn: untouchable, back to full health when it ends. */
  foeReviving: Set<string>;
  /** Who Rests this turn, and whether it's the forced Rest after a stagger. */
  resting: Map<string, boolean>;
  /** Lines as they were when the turn started: what you saw while planning is what you fight. */
  locked: Map<string, Line>;
  /** Enemies' flags and who was staggered, as the turn started. */
  wasFlags: Map<string, Record<string, boolean>>;
  wasStaggered: Set<string>;

  /** Gained Fatigue this turn (so it doesn't decay). */
  gained: Set<string>;
  /** Took health damage this turn (which breaks a Rest). */
  hurt: Set<string>;
  /** Fell or staggered this turn: whatever they hadn't done yet is lost. */
  out: Set<string>;
  /** Health reached 0 this turn. */
  fallen: Set<string>;
  /** Pulled to the front line by a melee attack: enemy id -> who pulled it. */
  pulls: Map<string, string>;
  /** Blocks that actually caught an attack. */
  blockedSomething: Set<string>;
  /** Actions cancelled before they happened. */
  cancelled: Set<string>;
  /** Rests broken by a blow. */
  interrupted: Set<string>;
  /** Enemies that fell with a revive left: their protected turn is next. */
  fellReviving: Set<string>;
  /** Your forced Rest waits until the very end of the turn (your flame is being taken). */
  recoverLast: boolean;

  /** Steps recorded so far, and the events of the one under way. */
  steps: Step[];
  events: CombatEvent[];
  emit: (ev: CombatEvent) => void;
  /** Closes the step under way (if anything happened in it), with everyone's bars after it. */
  endStep: () => void;

  /** Adds Fatigue, unless the fighter is staggered: then it's already pinned at full. */
  tire: (f: Fighter, amount: number) => void;
  /** A staggered fighter's bar stays solid white, even as its health drops. */
  pinStaggered: () => void;
  isReviving: (f: Fighter) => boolean;
  /** The weight of a fighter's Attack or Block this turn: the action's own, or its weapon's. */
  weightOf: (f: Fighter) => WeaponTier;
  isRanged: (f: Fighter) => boolean;
  isBlocking: (f: Fighter, attacker: Fighter) => boolean;
  isDodging: (f: Fighter, attacker: Fighter) => boolean;
}

/** Starts resolving a turn from `prev`, with what the player chose. */
export function beginTurn(prev: CombatState, action: PlayerAction): Turn {
  // Only the fighters change during a turn (the last turn's steps are replaced at the end).
  const s: CombatState = { ...prev, player: structuredClone(prev.player), enemies: structuredClone(prev.enemies), lastTurn: [] };
  const p = s.player;
  const cfg = s.config;
  const alive = s.enemies.filter(e => e.alive);
  const fighters: Fighter[] = [p, ...alive];
  const reviving = p.reviving;
  const forced = forcedAction(s);
  const act: PlayerAction | null = forced === "revive" ? null : forced === "rest" ? { type: "rest" } : action;
  const foeReviving = new Set(alive.filter(e => e.reviving).map(e => e.id));
  const resting = new Map<string, boolean>();
  if (act?.type === "rest") resting.set(p.id, p.staggered);
  for (const e of alive) if (e.intent.type === "rest" && !foeReviving.has(e.id)) resting.set(e.id, e.intent.forced);
  const locked = new Map<string, Line>(alive.map(e => [e.id, e.line]));

  const t: Turn = {
    s, p, alive, fighters,
    byId: id => fighters.find(f => f.id === id),
    act, reviving, foeReviving, resting, locked,
    wasFlags: new Map(alive.map(e => [e.id, { ...e.flags }])),
    wasStaggered: new Set(fighters.filter(f => f.staggered).map(f => f.id)),
    gained: new Set(), hurt: new Set(), out: new Set(), fallen: new Set(), pulls: new Map(),
    blockedSomething: new Set(), cancelled: new Set(), interrupted: new Set(), fellReviving: new Set(),
    recoverLast: false,
    steps: [],
    events: [],
    emit: ev => t.events.push(ev),
    endStep: () => {
      if (t.events.length) t.steps.push({ events: t.events, after: snapshotOf(p, alive) });
      t.events = [];
    },
    tire: (f, amount) => {
      if (amount <= 0) return;
      t.gained.add(f.id);
      if (cfg.dummy) return;
      if (!f.staggered) f.fatigue += amount;
    },
    pinStaggered: () => { for (const f of fighters) if (f.staggered) f.fatigue = Math.max(0, f.hp); },
    isReviving: f => (f === p ? reviving : foeReviving.has(f.id)),
    weightOf: f => (f === p ? (act?.type === "attack" && act.weight ? act.weight : p.weapon) : (f as Enemy).intent.weight ?? f.weapon),
    isRanged: f => f !== p && !!(f as Enemy).intent.ranged,
    isBlocking: (f, attacker) => {
      if (t.out.has(f.id)) return false;
      if (f === p) return act?.type === "block" && (act.target === attacker.id || locked.get(attacker.id) === "back");
      return (f as Enemy).intent.type === "block";
    },
    /**
     * A Maneuver dodges like a Block blocks: every attack from the back line, plus the attack of
     * its own target, even from the front line. Other front-line melee still hits. Ranged attacks
     * can always be dodged. (An enemy's target is you when it closes in.)
     */
    isDodging: (f, attacker) => {
      if (t.out.has(f.id)) return false;
      const ranged = t.isRanged(attacker);
      if (f === p) return act?.type === "maneuver" && (ranged || locked.get(attacker.id) === "back" || act.target === attacker.id);
      const e = f as Enemy;
      return e.intent.type === "maneuver" && attacker === p && (ranged || locked.get(e.id) === "back" || e.intent.dir === "advance");
    },
  };
  return t;
}
