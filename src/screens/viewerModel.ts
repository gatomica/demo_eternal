/**
 * viewerModel.ts — the Model viewer's model: what it shows of the enemy, and the actions it can
 * play.
 */
import { PLAYER_MAX_HP } from "../combat/fight";
import { BODIES, type BodyId, bodySetups, ENEMY_KINDS, kindOf, type KindId, type StatusToggle } from "../core/bestiary";
import { isAvailable } from "../core/conditions";
import { describeAction } from "../core/intents";
import type { ActionDef } from "../core/patterns";
import { createCombat } from "../core/setup";
import type { PoseName } from "../render/poses";
import type { ArmorTier, CombatState, Line, PlayerAction, Stance, WeaponTier } from "../core/types";

/** Kinds that are only a part of a multi-target enemy: the viewer shows the whole body instead. */
const PART_KINDS = new Set<KindId>(Object.values(BODIES).flatMap(b => b.parts.map(p => p.kind)));

/** What the viewer can look at, besides you: each enemy, and each multi-target enemy as one body (all its parts at once). */
export type EnemySubject = KindId | BodyId;
export const VIEWER_SUBJECTS: EnemySubject[] = [...(Object.keys(ENEMY_KINDS) as KindId[]).filter(k => !PART_KINDS.has(k)), ...(Object.keys(BODIES) as BodyId[])];

/** The name the viewer gives a subject. */
export const subjectName = (sub: EnemySubject) => (sub in BODIES ? BODIES[sub as BodyId].name : ENEMY_KINDS[sub as KindId].name);

/** The kinds of its parts (one, for a plain enemy), left to right. */
export const partsOf = (sub: EnemySubject): KindId[] => (sub in BODIES ? BODIES[sub as BodyId].parts.map(p => p.kind) : [sub as KindId]);

/** The part's label in its body ("Blob, left"), or the enemy's name. */
export const partLabel = (sub: EnemySubject, i: number) => (sub in BODIES ? BODIES[sub as BodyId].parts[i].label : ENEMY_KINDS[sub as KindId].name);

/** Which line it stands on: every kind can be shown on either (its own statuses come from its kind). */
export const LINE_TOGGLE: StatusToggle = { key: "back", off: "Front line", on: "Back line" };

/** How the Model stance sees the enemy: 3/4 (as enemies appear in a fight, and as you do) or straight on, from the front or behind. */
export type ModelAngle = "front34" | "front" | "back34" | "back";

export const MODEL_ANGLES: { id: ModelAngle; label: string }[] = [
  { id: "front34", label: "3/4 front" },
  { id: "front", label: "Front" },
  { id: "back34", label: "3/4 back" },
  { id: "back", label: "Back" },
];

/** The angle as the combat screen draws a figure. */
export const figureAngleOf = (a: ModelAngle) => ({ view: a.startsWith("back") ? "back" as const : "front" as const, straight: !a.endsWith("34"), sides: true });

/** What one part of the enemy shows (an enemy with one part has one of these). */
export interface PartShow {
  stance: string;
  /** The action played (or about to be). */
  action?: string;
  /** The stance it moves on to after the action (picked when it's played). */
  next?: string;
  /** The action it does when all the parts play together (default: the first its stance allows). */
  chosen?: string;
}

export interface ViewerShow {
  /** One per part, left to right. */
  parts: PartShow[];
  /** The Model stance: which way it's seen (default: 3/4 front). */
  angle?: ModelAngle;
  /** Statuses that are on: "back" (shared), and the kinds' own flags. */
  on: Record<string, boolean>;
  /** The fight's turn as shown. Once it moves past this, the action has played. */
  turn: number;
  /** Play the Rest but break it with a blow (to see its flinch). */
  interrupt?: boolean;
  /** Who acts in the turn being played: all the parts, or one of them (the others hold their stance). */
  acting?: "all" | number;
}

/** The fight for a subject: its one enemy, or all the parts of its body, on the front line. */
export function viewerFight(subject: EnemySubject): CombatState {
  return createCombat(
    { name: "Dummy", maxHP: PLAYER_MAX_HP, weapon: "normal", armor: "light", charges: 0 },
    subject in BODIES ? bodySetups(subject as BodyId, "viewer", { line: "front" }) : [{ kind: subject as KindId, line: "front" }],
    { dummy: true },
  );
}

/** The viewer's extra "stance": knocked down, its only action the forced Rest that recovers. */
export const STAGGERED = "Staggered";

/** The viewer's extra "stance": fallen, its remains lying where it stood (no actions). */
export const DEAD = "Dead";

/** The viewer's other extra "stance": the enemy in a T-pose, seen from the angle you pick (no actions). */
export const MODEL = "Model";

/** Applies the viewer's choices to the enemy: its line, its statuses, its stance and action (each part's own). */
export function applyShow(s: CombatState, show: ViewerShow): CombatState {
  const v = structuredClone(s);
  const played = s.turn > show.turn;
  v.enemies.forEach((e, i) => applyPart(e, show.parts[i], show, played, shouldHold(show, i)));
  v.status = "playing";
  return v;
}

/** In a body, the parts that don't act in the turn being played hold their stance. */
const shouldHold = (show: ViewerShow, i: number) => show.parts.length > 1 && typeof show.acting === "number" && show.acting !== i;

function applyPart(e: CombatState["enemies"][number], part: PartShow, show: ViewerShow, played: boolean, hold: boolean) {
  const kind = kindOf(e);
  // Once the action has played, it stands in the stance it moved on to, statuses as the action left them.
  const stanceName = played && part.next ? part.next : part.stance;
  e.alive = true;
  e.staggered = false;
  e.reviving = false;
  e.hp = e.maxHP;
  e.fatigue = 0;
  if (!played) {
    e.line = show.on.back ? "back" : "front";
    for (const t of kind.statuses ?? []) e.flags[t.key] = !!show.on[t.key];
    kind.settleFlags?.(e.flags);
  }
  if (stanceName === STAGGERED) {
    e.staggered = true;
    e.fatigue = e.hp;
    kind.staggerFlags?.(e.flags);
    e.intent = { type: "rest", dir: e.line === "back" ? "advance" : "retreat", forced: true };
    return;
  }
  if (stanceName === DEAD) {
    e.alive = false;
    e.hp = 0;
    e.fate = "fallen";
    e.intent = { type: "rest", dir: e.line === "back" ? "advance" : "retreat", forced: false };
    return;
  }
  if (stanceName === MODEL) {
    const poses = kind.modelPoses ?? { front: "t-pose", back: "t-pose-b" };
    e.intent = { type: "rest", dir: e.line === "back" ? "advance" : "retreat", forced: false, pose: figureAngleOf(show.angle ?? "front34").view === "back" ? poses.back : poses.front };
    return;
  }
  const stance = kind.pattern.stances.find(x => x.name === stanceName);
  const pose = kind.stancePoses[stanceName];
  if (hold) {
    // Holding still while another part acts: a Block with nothing to block, in its stance's pose throughout.
    e.intent = { type: "block", dir: e.line === "back" ? "advance" : "retreat", forced: false, stance: stanceName, pose, windupPose: pose, guardPose: pose };
    return;
  }
  const actionName = !played && part.action ? part.action : stance?.actions[0].name ?? "";
  const action = kind.pattern.actions.get(actionName.toLowerCase());
  if (action) e.intent = { ...describeAction(e.kind, e.line, stanceName, action), pose };
}

/** The actions a stance allows with the enemy as shown (conditions like *Sealed checked). */
export function viewerActions(kindName: KindId, state: CombatState, stanceName: string, partIx = 0) {
  const kind = ENEMY_KINDS[kindName];
  if (stanceName === DEAD) return [];
  // Staggered, the only way on is to recover (into a `Recover >` stance).
  if (stanceName === STAGGERED) {
    return [{ action: { name: "Recover", type: "rest", needs: [] as string[] } as unknown as ActionDef, fixed: false, available: true }];
  }
  const stance = kind.pattern.stances.find(x => x.name === stanceName);
  const e = state.enemies[partIx];
  // (Actions that play on their own, like the Warden's Usurp Flame, are in the stance's list like any other.)
  return (stance?.actions ?? []).map(a => ({
    action: a,
    fixed: !!kind.fixedActions?.includes(a.name),
    available: isAvailable(kind, e, state, a),
  }));
}

/* ============================================================
 * The player in the Model viewer: your gear and animations against a Sleepwalker dummy
 * ============================================================ */

/** The poses you can hold still, to look at them (the ones a player figure uses). */
export const PLAYER_POSES: PoseName[] = ["idle", "low", "low-left", "low-right", "attack", "strike", "swing-right-up", "swing-right", "swing-left-up", "swing-left", "punch", "block", "dodge-fwd", "dodge-back", "maneuver", "rest-in", "rest", "flinch", "kneel", "fallen"];

/** What the dummy in front of you does while you act. */
type FoeDoes = "strike" | "rest";

/** An action of yours to play, and what the dummy does meanwhile (so there is something to block, dodge or hit). */
export interface PlayerScenario {
  id: string;
  label: string;
  /** What it shows: its target is filled in with the dummy's id (or "self"). */
  action: { type: PlayerAction["type"]; target: "foe" | "self" };
  foe: FoeDoes;
  /** You start staggered, so the turn is your forced recovery. */
  staggered?: boolean;
  /** The stance you start in (default idle), and the line the dummy stands on (default front): an attack swings by both. */
  stance?: Stance;
  foeLine?: Line;
}

export const PLAYER_SCENARIOS: PlayerScenario[] = [
  { id: "attack", label: "Attack", action: { type: "attack", target: "foe" }, foe: "rest" },
  { id: "attack-low", label: "Attack from lowered", action: { type: "attack", target: "foe" }, foe: "rest", stance: "low" },
  { id: "attack-lead-left", label: "Attack, left leg leading", action: { type: "attack", target: "foe" }, foe: "rest", stance: "lead-left" },
  { id: "attack-lead-right", label: "Attack, right leg leading", action: { type: "attack", target: "foe" }, foe: "rest", stance: "lead-right" },
  { id: "attack-back", label: "Attack the back line", action: { type: "attack", target: "foe" }, foe: "rest", stance: "low", foeLine: "back" },
  { id: "block", label: "Block", action: { type: "block", target: "foe" }, foe: "strike" },
  { id: "dodge-fwd", label: "Dodge forward", action: { type: "maneuver", target: "foe" }, foe: "strike" },
  { id: "dodge-back", label: "Dodge back", action: { type: "maneuver", target: "self" }, foe: "strike" },
  { id: "advance", label: "Advance", action: { type: "maneuver", target: "foe" }, foe: "rest" },
  { id: "fall-back", label: "Fall back", action: { type: "maneuver", target: "self" }, foe: "rest" },
  { id: "rest", label: "Rest", action: { type: "rest", target: "self" }, foe: "rest" },
  { id: "rest-broken", label: "Rest, broken by a blow", action: { type: "rest", target: "self" }, foe: "strike" },
  { id: "recover", label: "Staggered recovery", action: { type: "rest", target: "self" }, foe: "rest", staggered: true },
];

/** The dummy's id in the player viewer's fight. */
const FOE_ID = "e0";

export const playerActionOf = (sc: PlayerScenario): PlayerAction => ({ type: sc.action.type, target: sc.action.target === "foe" ? FOE_ID : "self" });

export function playerViewerFight(weapon: WeaponTier, armor: ArmorTier): CombatState {
  return createCombat(
    { name: "You", maxHP: PLAYER_MAX_HP, weapon, armor, charges: 0 },
    [{ kind: "sleepwalker", line: "front" }],
    { dummy: true },
  );
}

/**
 * Sets the scene for a scenario (or for a held pose, with none): the dummy stands in front of
 * you, whole, doing what the scenario needs, and you start staggered if it says so. Always the
 * same start, so every play of an action begins from the same spot.
 */
export function applyPlayerShow(s: CombatState, weapon: WeaponTier, armor: ArmorTier, scenario?: PlayerScenario): CombatState {
  const v = structuredClone(s);
  v.player.weapon = weapon;
  v.player.armor = armor;
  v.player.staggered = !!scenario?.staggered;
  v.player.stance = scenario?.stance ?? "idle";
  v.player.fatigue = scenario?.staggered ? v.player.hp : 0;
  const e = v.enemies[0];
  const kind = kindOf(e);
  e.alive = true;
  e.staggered = false;
  e.reviving = false;
  e.hp = e.maxHP;
  e.fatigue = 0;
  e.line = scenario?.foeLine ?? "front";
  const strike = scenario?.foe === "strike";
  const stance = strike ? "Charging" : "Struggling";
  const action = kind.pattern.actions.get(strike ? "weapon strike" : "despair");
  if (action) e.intent = { ...describeAction(e.kind, e.line, stance, action), pose: kind.stancePoses[stance] };
  v.status = "playing";
  return v;
}
