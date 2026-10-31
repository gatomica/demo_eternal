/**
 * bestiary.ts — every enemy kind: its numbers, its stances and actions (in the notation from
 * patterns.ts, matching the design doc), how each stance and action is drawn, and its own rules.
 * Each kind lives in its own file in kinds/; add a new one there and list it in ENEMY_KINDS.
 *
 * Enemies may pick any action, even one that will stagger them (an attack they can't afford).
 * Only a kind written with an explicit condition avoids that.
 *
 * (Kinds may look each other up with `kindOf`, but only ever import them through this file.)
 */
import { conditionOf } from "./conditions";
import type { ActionDef, Pattern } from "./patterns";
import { SLEEPWALKER } from "./kinds/sleepwalker";
import { WARDEN } from "./kinds/warden";
import { GUIDE_KIND } from "./kinds/guide";
import { WAXED } from "./kinds/waxed";
import type { ArmorTier, CombatEvent, CombatState, Enemy, EnemySetup, Fighter, Intent, Line, Rng, Side, TurnReport, WeaponTier } from "./types";

/** Special looks a kind can be drawn with: "waxed" (kneeling, sealed in wax), "warden" (his own figure). */
export type Variant = "waxed" | "warden" | "guide";

/** A direct hit (not blocked or dodged) from an enemy of this kind, for its `onDirectHit`. */
export interface DirectHit {
  self: Enemy;
  target: Fighter;
  /** Health it took. */
  damage: number;
  /** Its action's tags (`#tag` in the pattern). */
  tags: string[];
  /** Burns the target for this much more damage. */
  burn: (amount: number) => void;
  /** Leaves the target Waxed (on wax already there, it also tires: 1/8 of the damage). */
  wax: () => void;
}

/** A status the Model viewer can flip on a kind, and what each side is called. */
export interface StatusToggle {
  key: string;
  off: string;
  on: string;
  /** Not available to flip with these statuses on: the label it shows instead (or null: free). */
  locked?: (on: Record<string, boolean>) => string | null;
  /** Switched on, the enemy's next stance follows from this (a pattern event, e.g. "Second Phase"). */
  enters?: string;
}

/** A fight's opening scene: the fight before it, after it, and what happens in it. */
export interface OpeningScene {
  from: CombatState;
  after: CombatState;
  events: CombatEvent[];
}

export interface EnemyKind {
  name: string;
  maxHP: number;
  /** True weight it carries ("baseline": nothing). Actions may still have their own weight. */
  weapon: WeaponTier;
  armor: ArmorTier;
  /** Drawn with a special look (see render/looks.ts). */
  variant?: Variant;
  /** Drawn this much bigger than a normal figure. */
  scale?: number;
  pattern: Pattern;
  /** The pose shown for each stance while you plan. */
  stancePoses: Record<string, string>;
  /**
   * How each action is drawn: `act` while it happens (and an attack's wind-up), `strike` the
   * moment an attack lands, `rest` once a Rest actually happens at the end of the turn, and the
   * `projectile` a ranged attack throws (or, for a melee one, `impact`: a shockwave where it lands).
   * `guard`: a Block that holds the stance and only takes this pose as an attack on it lands.
   * `windup`: a Rest or a Block takes this pose from the start of the turn, to show its intent: a Rest until it goes
   * through (then `rest`) or is broken by a blow (it flinches); a Block until the blow lands (then `guard`).
   */
  actionPoses?: Record<string, { act?: string; strike?: string; rest?: string; windup?: string; projectile?: "fan" | "blast" | "wax" | "impact"; guard?: string }>;
  /** The hand that holds its weapon (default right): the `weaponArm` of every pose is the arm on this side. */
  weaponHand?: Side;
  /**
   * The T-poses the Model viewer shows it in, seen from the front and from behind (the weapon arm is on the
   * other side of the page). Default: the standing T-pose (`t-pose`, `t-pose-b`).
   */
  modelPoses?: { front: string; back: string };
  /** Shown once its attack has landed (default "idle"), and while staggered (default "fallen"). */
  idlePose?: string;
  downPose?: string;
  /** A Rest broken by a blow (default "flinch"), held to the end of the turn. */
  flinchPose?: string;
  /** It attacks straight out of the stance it showed, with no wind-up pose of its own. */
  attacksFromStance?: boolean;
  /**
   * Its attacks tagged `#shockwave` (a flaming slam, a flame blast) send a shockwave through the whole fight: it hits its
   * allies too, as a direct hit, while this holds (default: always).
   */
  shockwave?: (self: Enemy) => boolean;
  /** On the map, it comes back to life when you rest by a keeper (the others stay dead, their remains lying where they fell). */
  respawns?: boolean;
  /** Where it falls, it stays: faded, for the rest of the fight (it can still burn as a candle). */
  remains?: boolean;
  /**
   * What lies where it fell: "pieces" (default); "wax": sealed whole in wax (in `deathPose`), as if the Warden had
   * taken its flame; or "cloak": a cloak draped over a thick pool of wax.
   */
  deathLook?: "pieces" | "wax" | "cloak" | "guide";
  /** The pose it lies in when its `deathLook` is "wax". */
  deathPose?: string;
  /** Its fight takes place in its arena (see warden/arena.tsx). */
  arena?: boolean;
  /**
   * It holds a flame of its own that another can take (Usurp Flame): while it's staggered, or as
   * it does `action`, which it shows in `stance`.
   */
  flame?: { stance: string; action: string };
  /** Conditions named in the pattern (`*Name`, written in lowercase here), checked when picking. */
  conditions?: Record<string, (self: Enemy, state: CombatState) => boolean>;
  /** It has fallen for good (no revive left): what that does to the rest of the fight (the Warden's death snuffs the waxed). */
  onDeath?: (d: { self: Enemy; state: CombatState; event: (ev: CombatEvent) => void }) => void;
  /** It picks after everyone else each turn, to react to what they chose (the Warden: which waxed is about to Clutch Flame). */
  decidesLast?: boolean;
  /**
   * Who an action is aimed at, when it isn't you: an ally's id (a Maneuver aimed at an ally moves toward them, which
   * pushes you away), or undefined for you. Called when the action has been picked.
   */
  aim?: (self: Enemy, state: CombatState, action: string, rng: Rng) => string | undefined;
  /** Actions that play on their own, with nothing of yours to attack or dodge (the model viewer lets them run alone). */
  fixedActions?: string[];
  /** Actions that, aimed at you, keep you down (your forced Rest waits) until the very end of the turn. */
  holdsTargetDown?: string[];
  /** What its direct hits do besides the damage (its action's tags say which rules apply). */
  onDirectHit?: (hit: DirectHit) => void;
  /** Its own rules at the end of each turn: statuses, phases, effects of its actions. */
  afterTurn?: (r: TurnReport) => void;
  /** A scene played before the first turn of a fight it's in, if the setup calls for one. */
  opening?: (o: {
    self: Enemy;
    state: CombatState;
    setups: EnemySetup[];
    rng: Rng;
    describe: (kind: KindId, line: Line, stance: string | undefined, a: ActionDef) => Intent;
    chooseIntents: (state: CombatState, rng: Rng) => void;
  }) => OpeningScene | null;
  /** Its statuses at the start of a fight. */
  flags?: Record<string, boolean>;
  /** Its statuses as the Model viewer shows them, to flip. */
  statuses?: StatusToggle[];
  /** Keeps its statuses consistent with each other (after the viewer flips one). */
  settleFlags?: (flags: Record<string, boolean>) => void;
  /** What a stagger does to its statuses (shown by the viewer's Staggered). */
  staggerFlags?: (flags: Record<string, boolean>) => void;
  /** Revives (a boss revives to full health, only when it falls). */
  revives?: number;
}

export const ENEMY_KINDS = {
  sleepwalker: SLEEPWALKER,
  waxed: WAXED,
  warden: WARDEN,
  guide: GUIDE_KIND,
} satisfies Record<string, EnemyKind>;

export type KindId = keyof typeof ENEMY_KINDS;

/** The kind of enemy it is. */
export const kindOf = (e: { kind: KindId }): EnemyKind => ENEMY_KINDS[e.kind];

/**
 * Checks a kind when the game loads, like the pattern parser does: everything it names (stances,
 * actions, conditions) must exist in its pattern. Poses are checked in render/poses.ts.
 */
function checkKind(id: string, kind: EnemyKind) {
  const fail = (msg: string): never => { throw new Error(`${kind.name} (${id}): ${msg}`); };
  const { actions, stances } = kind.pattern;
  const hasAction = (name: string) => actions.has(name.toLowerCase());
  const hasStance = (name: string) => stances.some(s => s.name === name);
  for (const a of actions.values()) {
    for (const need of a.needs) for (const alt of need.split("|")) if (!conditionOf(kind, alt)) fail(`"${a.name}" needs *${alt.replace(/^!/, "")}, but no such condition exists`);
  }
  for (const s of Object.keys(kind.stancePoses)) if (!hasStance(s)) fail(`a pose for stance "${s}", which isn't in its pattern`);
  for (const a of Object.keys(kind.actionPoses ?? {})) if (!hasAction(a)) fail(`poses for action "${a}", which isn't in its pattern`);
  for (const a of [...(kind.fixedActions ?? []), ...(kind.holdsTargetDown ?? [])]) if (!hasAction(a)) fail(`no action named "${a}"`);
  if (kind.flame && (!hasStance(kind.flame.stance) || !hasAction(kind.flame.action))) fail(`its flame's stance or action isn't in its pattern`);
}
for (const [id, kind] of Object.entries(ENEMY_KINDS)) checkKind(id, kind);
