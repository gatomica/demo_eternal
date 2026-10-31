/**
 * playback.ts — playing a turn back: its timings, its phases, and what each step shows.
 */
import type { CombatState, PlayerAction, Step } from "../core/types";
import type { PoseName } from "../render/poses";
import { IGNITE } from "../warden/scenes";

/** How long the camera takes to find the flame the Warden sends to a fallen waxed and the waxed it raises, in ms. */
export const RAISE_CAMERA_MS = 700;

/** How long a lost turn (stagger or revive) waits before it plays out on its own. */
export const FORCED_TURN_MS = 900;

/** How long each step of a turn's playback stays on screen (after the impact, for attacks). */
export const STEP_MS = 800;

/** How long a strike pose that spins on into the next stance shows before it hands off (its trails still fading). */
export const REST_POSE_MS = 300;

/**
 * How long a Rest's own animation (its rest pose) shows, from the moment the Rest goes through, before the fighter
 * settles into its next stance. It starts instantly: the windup pose only shows before it, while the turn plays.
 */
export const REST_ANIM_MS = 500;

/**
 * The attack phase of a turn lasts at least this long (from the moment you commit): everything that happens after the
 * attacks (a Maneuver, a Rest...) waits for it. A turn with no attacks therefore still gives a moment to see what
 * everyone is about to do (a Rest's windup pose, a Maneuver's stance) before it happens.
 */
export const MIN_ATTACK_PHASE_MS = 500;

/** How long an attacker takes to close in on its target before the blow lands. */
export const APPROACH_MS = 320;

/**
 * How far into an attacker's approach a dodge starts: late, so the target gets clear in the last moments before the
 * blow arrives, and only then changes to its dodge pose.
 */
export const DODGE_DELAY_MS = 140;

/** How long a clean hit takes to knock its target back. */
export const KNOCK_MS = 260;

/** How long everyone takes to settle into the planning view at the end of a turn. */
export const SETTLE_MS = 700;

/** How long the planning camera takes to ease toward a new selection. */
export const NUDGE_MS = 500;

/** How close an attacker gets to its target (meters), and how far a clean hit knocks it back. */
export const STRIKE_GAP = 0.9;

export const KNOCKBACK = 0.45;

/** How far a Block jolts the blocker and the attacker apart. */
export const BLOCK_PUSH = 0.3;

/** How far a dodge carries someone: back (and away) if retreating, sideways past the attack if closing in. */
export const DODGE_BACK = 1.5;

export const DODGE_SIDE = 1.2;

/** A Maneuver toward an enemy ends this far short of it; falling back covers this much ground. */
export const ENGAGE_GAP = 1.4;

export const FALL_BACK = 2.2;

/** Planning view: how much the camera turns toward your selection (share of the angle to it). */
export const CAMERA_FOLLOW = 0.18;

/**
 * A turn being played back: the state before it, its steps, and which one is showing.
 * Attack steps play in two phases: the attacker closes in ("approach"), then the blow lands
 * ("impact"). Other steps just play ("impact").
 */
export interface Playback {
  from: CombatState;
  steps: Step[];
  index: number;
  /** "usurp": Usurp Flame's scene plays before the step itself (see USURP_STAGES); "ignite": the
   *  Warden's phase-two scene (see IGNITE). */
  phase: "approach" | "impact" | "usurp" | "ignite";
  playerPose: PoseName;
  /** A pause before its first step plays (the opening scene lets you take in the arena first), in ms. */
  leadIn?: number;
  /** What you did this turn (null for a forced turn). */
  action: PlayerAction | null;
}

export const isAttackStep = (st: Step | undefined) => !!st?.events.some(ev => ev.kind === "attack");

export const usurpOf = (st: Step | undefined) => st?.events.find((ev): ev is Extract<Step["events"][number], { kind: "usurp" }> => ev.kind === "usurp");

export const phaseTwoOf = (st: Step | undefined) => st?.events.find((ev): ev is Extract<Step["events"][number], { kind: "phase" }> => ev.kind === "phase" && ev.phase === 2);

/**
 * The phase step `index` starts in, `elapsed` ms into the turn: the first step after the attacks holds ("approach",
 * nothing happening yet) until the attack phase has lasted MIN_ATTACK_PHASE_MS.
 */
export function phaseAt(steps: Step[], index: number, elapsed: number): Playback["phase"] {
  const phase = phaseFor(steps[index]);
  const afterAttacks = steps.slice(0, index).every(isAttackStep);
  return phase === "impact" && afterAttacks && elapsed < MIN_ATTACK_PHASE_MS ? "approach" : phase;
}

export const phaseFor = (st: Step | undefined): Playback["phase"] => (phaseTwoOf(st) ? "ignite" : usurpOf(st) ? "usurp" : isAttackStep(st) ? "approach" : "impact");

/** How long the arena shows before a fight's opening scene starts, in ms. */
export const OPENING_LEAD_IN = 1200;

/** The phase-two scene's light starts dying this long in (a moment after it's shown, so it fades). */
export const IGNITE_DARK = 40;

/** The moments of the phase-two scene that change the screen around it (see IGNITE). */
export const IGNITE_MARKS = [IGNITE_DARK, IGNITE.kindle, IGNITE.flare];

/**
 * Usurp Flame's scene, before the step that takes the flame plays out: the light dies around the
 * two of them (only the target's flame still burning) as the camera settles between them; he
 * dashes at it, the camera closing in, and everything goes black as he reaches it; then the light
 * returns on him standing in Idle, the flame streaming from the target over him into his hand.
 * When each stage starts, in ms.
 */
export const USURP_STAGES = { focus: 0, dash: 900, black: 1500, reveal: 2000, done: 3000 } as const;

export type UsurpStage = Exclude<keyof typeof USURP_STAGES, "done">;

/** The fight as it stood after a given step: the turn's starting state with that step's bars and positions. */
export function viewAt(from: CombatState, after: Step["after"]): CombatState {
  // Only the fighters' own numbers change: copy those, share the rest.
  const v: CombatState = { ...from, player: { ...from.player }, enemies: from.enemies.map(e => ({ ...e })) };
  for (const f of [v.player, ...v.enemies]) {
    const a = after[f.id];
    if (!a) continue;
    f.hp = a.hp;
    f.fatigue = a.fatigue;
    f.death = a.death;
    f.staggered = a.staggered;
    if ("alive" in f) f.alive = a.alive;
    if ("line" in f && a.line) f.line = a.line;
    if (a.waxed !== undefined) f.waxed = a.waxed;
    if (a.encased !== undefined) f.encased = a.encased;
    if ("fate" in f && a.fate) f.fate = a.fate;
  }
  return v;
}

/** Where things happen in a turn's steps, by fighter id, looked up once per turn. */
interface TurnIndex {
  /** The step where its attack lands. */
  strike: Map<string, number>;
  /** The step where its Rest goes through (not cut short). */
  rest: Map<string, number>;
  /** The step where it falls (for good, or to rise again). */
  fall: Map<string, number>;
  /** The step where a fallen ally rises again (the Warden's phase two). */
  raised: Map<string, number>;
  /** The steps where it's attacked (whether the blow lands, is blocked or dodged). */
  targeted: Map<string, number[]>;
  /** The first step where it dodges an attack, or its own Maneuver happens. */
  dodge: Map<string, number>;
  /** The first step where a blow lands on it cleanly. */
  hit: Map<string, number>;
  /** The step where its Maneuver happens (the repositioning), moving it or not. */
  maneuver: Map<string, number>;
  /** Its Rest was broken by a blow. */
  interrupted: Set<string>;
  /** The step where it takes a flame (Usurp Flame). */
  usurp: Map<string, number>;
  /** The first step where it's back on its feet: its forced Rest recovers, or its revive lands. */
  backUp: Map<string, number>;
  /** The step where it enters phase two. */
  phaseTwoBy: Map<string, number>;
  /** The step where anyone enters phase two, or -1. */
  phaseTwo: number;
}

export function indexTurn(steps: Step[]): TurnIndex {
  const ix: TurnIndex = {
    strike: new Map(), rest: new Map(), fall: new Map(), raised: new Map(), targeted: new Map(), dodge: new Map(), hit: new Map(), maneuver: new Map(),
    interrupted: new Set(), usurp: new Map(), backUp: new Map(), phaseTwoBy: new Map(), phaseTwo: -1,
  };
  const first = (m: Map<string, number>, id: string, i: number) => { if (!m.has(id)) m.set(id, i); };
  steps.forEach((st, i) => {
    for (const ev of st.events) {
      if (ev.kind === "attack") {
        first(ix.strike, ev.attacker, i);
        const hits = ix.targeted.get(ev.target) ?? [];
        if (hits[hits.length - 1] !== i) hits.push(i);
        ix.targeted.set(ev.target, hits);
        if (ev.result === "dodged") first(ix.dodge, ev.target, i);
        if (ev.result === "hit") first(ix.hit, ev.target, i);
      } else if (ev.kind === "maneuver") {
        first(ix.dodge, ev.who, i);
        first(ix.maneuver, ev.who, i);
      }
      else if (ev.kind === "rest") {
        if (ev.result === "rested") first(ix.rest, ev.who, i);
        if (ev.result === "interrupted") ix.interrupted.add(ev.who);
        if (ev.result === "recovered") first(ix.backUp, ev.who, i);
      } else if (ev.kind === "revive") first(ix.backUp, ev.who, i);
      else if (ev.kind === "fall") first(ix.fall, ev.who, i);
      else if (ev.kind === "raised") first(ix.raised, ev.who, i);
    }
    const usurp = usurpOf(st);
    if (usurp) first(ix.usurp, usurp.who, i);
    const p2 = phaseTwoOf(st);
    if (p2) {
      first(ix.phaseTwoBy, p2.who, i);
      if (ix.phaseTwo < 0) ix.phaseTwo = i;
    }
  });
  return ix;
}

interface Fx {
  classes: string[];
}

/**
 * Turns a step's events into per-fighter animations. The health bars carry the numbers.
 * Walking steps play for whoever actually moves: an enemy changing lines on its own, or you when
 * you Maneuvered. When your attack pulled someone in, nobody walks: the camera re-frames you.
 */
export function effectsOf(step: Step | undefined, youManeuvered: boolean): Map<string, Fx> {
  const fx = new Map<string, Fx>();
  const add = (id: string, cls: string) => {
    if (!fx.has(id)) fx.set(id, { classes: [] });
    fx.get(id)!.classes.push(cls);
  };
  for (const ev of step?.events ?? []) {
    switch (ev.kind) {
      case "attack":
        add(ev.attacker, "fx-attack");
        add(ev.target, ev.result === "dodged" ? "fx-dodge" : ev.result === "blocked" ? "fx-block" : "fx-hit");
        break;
      case "splash":
        add(ev.target, "fx-hit");
        break;
      case "stagger":
        add(ev.who, "fx-break");
        break;
      case "fall":
        add(ev.who, "fx-fall");
        break;
      case "move":
        if (ev.cause !== "player") { if (!fx.get(ev.who)?.classes.includes("fx-step")) add(ev.who, "fx-step"); }
        else if (youManeuvered && !fx.get("player")?.classes.includes("fx-step")) add("player", "fx-step");
        break;
      case "maneuver":
        // Everyone who Maneuvered plays their step, even when it changed no distance.
        if (!fx.get(ev.who)?.classes.includes("fx-step")) add(ev.who, "fx-step");
        break;
      default:
        break;
    }
  }
  return fx;
}

/** The enemy a step is about, so the bottom-right bar can follow the action. */
export function involvedEnemy(step: Step | undefined): string | undefined {
  for (const ev of step?.events ?? []) {
    if (ev.kind === "splash") continue; // (the bar stays on whoever the blow was aimed at)
    const ids = ev.kind === "attack" ? [ev.target, ev.attacker] : [ev.who];
    const enemy = ids.find(id => id !== "player");
    if (enemy) return enemy;
  }
  return undefined;
}
