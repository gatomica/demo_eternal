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
import { mirrorStance, swingFor } from "../core/stance";
import type { PoseName } from "../render/poses";
import type { ArmorItem, ArmorTier, CombatState, HeadItem, Line, PlayerAction, Stance, Swing, WeaponTier } from "../core/types";
import { ITEMS } from "../explore/items";

/** Kinds that are only a part of a multi-target enemy: the viewer shows the whole body instead. */
const PART_KINDS = new Set<KindId>(Object.values(BODIES).flatMap(b => b.parts.map(p => p.kind)));

/**
 * The weapon and armor variants of an enemy: the same wretch with something else in its hand (or on its head). The viewer folds them into the enemy
 * as statuses to turn on and off (one at a time), instead of listing each as an enemy of its own. A status is named by its label, so a body's parts
 * share it: the Wax Blob's Hammer gives both its side parts the Super Wax Blob's hammers.
 */
export const VARIANTS: Partial<Record<KindId, { kind: KindId; label: string }[]>> = {
  waxed: [{ kind: "waxedChisel", label: "Chisel" }, { kind: "waxedHammer", label: "Hammer" }],
  sleepwalker: [
    { kind: "sleepwalkerBare", label: "Bare-handed" },
    { kind: "sleepwalkerHammer", label: "Hammer" },
    { kind: "patrolWarden", label: "Patrol warden: torch, hood" },
  ],
  blobLeft: [{ kind: "blobLeftHammer", label: "Hammer" }],
  blobRight: [{ kind: "blobRightHammer", label: "Hammer" }],
};

/** The enemy a variant is a variant of. */
const BASE_OF = new Map<KindId, KindId>(Object.entries(VARIANTS).flatMap(([base, vs]) => vs!.map(x => [x.kind, base as KindId] as const)));

/** The statuses the viewer offers for an enemy's variants: one to turn on for each, all off for the enemy as it is. */
export const variantToggles = (sub: EnemySubject): StatusToggle[] =>
  [...new Set(partsOf(sub).flatMap(k => (VARIANTS[k] ?? []).map(x => x.label)))].map(label => ({ key: `variant:${label}`, off: `${label}: off`, on: `${label}: on` }));

/**
 * Enemies the viewer does not list, since their own enemy shows them: the Lit waxed (the waxed with its Lit status on) and the Super Wax Blob (the
 * Wax Blob with Hammer on).
 */
const NOT_LISTED = new Set<string>(["waxedLit", "waxedChiselLit", "waxedHammerLit", "superBlob"]);

/** What the viewer can look at, besides you: each enemy (its variants folded into it), and each multi-target enemy as one body (all its parts at once). */
export type EnemySubject = KindId | BodyId;
export const VIEWER_SUBJECTS: EnemySubject[] = [...(Object.keys(ENEMY_KINDS) as KindId[]).filter(k => !PART_KINDS.has(k) && !BASE_OF.has(k)), ...(Object.keys(BODIES) as BodyId[])]
  .filter(sub => !NOT_LISTED.has(sub));

/** The name the viewer gives a subject. */
export const subjectName = (sub: EnemySubject) => (sub in BODIES ? BODIES[sub as BodyId].name : ENEMY_KINDS[sub as KindId].name);

/** The kinds of its parts (one, for a plain enemy), left to right. */
export const partsOf = (sub: EnemySubject): KindId[] => (sub in BODIES ? BODIES[sub as BodyId].parts.map(p => p.kind) : [sub as KindId]);

/** The part's label in its body ("Blob, left"), or the enemy's name. */
export const partLabel = (sub: EnemySubject, i: number) => (sub in BODIES ? BODIES[sub as BodyId].parts[i].label : ENEMY_KINDS[sub as KindId].name);

/** Which line it stands on: every kind can be shown on either (its own statuses come from its kind). */
export const LINE_TOGGLE: StatusToggle = { key: "back", off: "Front line", on: "Back line" };

/** Debug, for every model: its right arm and right leg drawn red, to tell the sides apart. */
export const DEBUG_TOGGLE: StatusToggle = { key: "debug", off: "Debug: off", on: "Debug: on" };

/** The Model stance's camera when it starts (and "Reset view" puts it back): a little round from the front and a little above (degrees). */
export const MODEL_VIEW = { yaw: -35, pitch: 12 };

/** What one part of the enemy shows (an enemy with one part has one of these). */
export interface PartShow {
  stance: string;
  /** The action played (or about to be). */
  action?: string;
  /** The stance it moves on to after the action (picked when it's played). */
  next?: string;
  /** The action it does when all the parts play together (default: the first its stance allows). */
  chosen?: string;
  /** A pose held still in place of the stance's (one of an action's: its wind-up, as it lands...), with nothing played. */
  pose?: string;
}

export interface ViewerShow {
  /** One per part, left to right. */
  parts: PartShow[];
  /** Statuses that are on: "back" (shared), and the kinds' own flags. */
  on: Record<string, boolean>;
  /** The fight's turn as shown. Once it moves past this, the action has played. */
  turn: number;
  /** Play a Block with nothing to block, or a Maneuver with nothing to dodge: the dummy does nothing (a "whiff"; for a Maneuver, "Reposition"), to see the
   *  stances a block that was not attacked leads to, or how a Maneuver moves to its new spot on its own. */
  whiff?: boolean;
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
  // A variant that is on: it is that kind (its weapon, armor, health and looks); with none on, the enemy as it is. (Whichever the fight last held.)
  const base = BASE_OF.get(e.kind as KindId) ?? (e.kind as KindId);
  const chosen = VARIANTS[base]?.find(x => show.on[`variant:${x.label}`])?.kind ?? base;
  if (e.kind !== chosen) {
    const k = ENEMY_KINDS[chosen];
    e.kind = chosen;
    e.name = k.name;
    e.maxHP = k.maxHP;
    e.weapon = k.weapon;
    e.armor = k.armor;
    e.eternal = k.weapon !== "baseline" && !k.ownWeapon;
  }
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
    e.intent = { type: "rest", dir: e.line === "back" ? "advance" : "retreat", forced: false, pose: poses.front };
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
  // (A pose of an action held still: shown as the stance is, until something is played.)
  if (!played && part.pose) e.intent = { ...e.intent, pose: part.pose };
}

/**
 * The poses of an action to hold still, each once, besides the stance's own: its wind-up (a Rest's or Block's `windup`; an attack's or
 * Maneuver's `act`, unless it attacks straight out of the stance), and how it lands (an attack's `strike`, a Block's `guard`, a Rest's `rest`, a Maneuver's `land`).
 */
export function actionPosesOf(kindName: KindId, stanceName: string, actionName: string): { label: string; pose: string }[] {
  const kind = ENEMY_KINDS[kindName], a = kind.pattern.actions.get(actionName.toLowerCase()), p = kind.actionPoses?.[actionName];
  if (!a || !p) return [];
  const fromStance = a.type === "attack" && kind.attacksFromStance;
  const list: { label: string; pose?: string }[] = [
    { label: "Wind-up", pose: a.type === "rest" || a.type === "block" ? p.windupFrom?.[stanceName] ?? p.windup ?? p.act : p.windupFrom?.[stanceName] ?? p.windup ?? (fromStance ? undefined : p.act) },
    ...(a.type === "block" ? [{ label: "Guard", pose: p.guard ?? p.act }] : []),
    ...(a.type === "attack" ? [{ label: "Lands", pose: p.strike }, { label: "After", pose: p.after }] : []),
    ...(a.type === "rest" ? [{ label: "Wind-up 2", pose: p.prep }, { label: "Rests", pose: p.rest }] : []),
    ...(a.type === "maneuver" ? [{ label: "Pose", pose: p.act }, { label: "Lands", pose: p.land }] : []),
  ];
  const seen = new Set([kind.stancePoses[stanceName]]);
  return list.filter((x): x is { label: string; pose: string } => !!x.pose && !seen.has(x.pose) && !!seen.add(x.pose));
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

/** The stances you can stand in, in the viewer (core/stance.ts), and Staggered (down on one knee: your only action is to recover). */
export type PlayerViewStance = Stance | "staggered";
export const PLAYER_STANCES: { id: PlayerViewStance; label: string }[] = [
  { id: "idle", label: "Idle" },
  { id: "low", label: "Lowered" },
  { id: "lead-left", label: "Left Lead" },
  { id: "lead-right", label: "Right Lead" },
  { id: "staggered", label: "Staggered" },
];

/** An action of yours to play, and what the dummy does meanwhile (so there is something to block, dodge or hit). */
export interface PlayerScenario {
  id: string;
  label: string;
  /** What it shows: its target is filled in with the dummy's id (or "self"). */
  action: { type: PlayerAction["type"]; target: "foe" | "self" };
  foe: FoeDoes;
  /** The Punch: the empty left hand's blow (bare hands' weight), the mirror of the same blow with the right. */
  punch?: boolean;
  /** The line the dummy stands on (default front): an attack at the back line always swings overhead. */
  foeLine?: Line;
}

/**
 * An attack's name in the viewer: a sideways swing from a leading stance is an Openhand Swing (a Swing Left, or the left hand's mirror of it) or a
 * Backhand Swing (a Swing Right, or its mirror), whichever hand throws it; otherwise it is named by the hand (Mainhand, the right; Offhand, the left).
 */
function attackName(stance: Stance, swing: Swing, punch: boolean): string {
  if (swing !== "overhead" && (stance === "lead-left" || stance === "lead-right")) return swing === "left" ? "Openhand Swing" : "Backhand Swing";
  return `${punch ? "Offhand" : "Mainhand"} ${swing === "overhead" ? "Overhead" : "Swing"}`;
}

/**
 * The actions you can play from a stance: the attacks it swings (core/stance.ts `swingFor`: overhead from Idle, otherwise to the side the stance
 * swings to; the back line is always overhead, so it is only listed where it differs), each with the main hand and as a Punch (the left hand's,
 * swung as the right would from the mirrored stance: from a leading stance, the other of the Openhand and Backhand), then every other action.
 * Staggered, only the recovery.
 */
export function playerScenariosFrom(stance: PlayerViewStance): PlayerScenario[] {
  if (stance === "staggered") return [{ id: "recover", label: "Staggered recovery", action: { type: "rest", target: "self" }, foe: "rest" }];
  const front = { line: "front" as Line, staggered: false };
  const attacks: PlayerScenario[] = [
    { id: "attack", label: attackName(stance, swingFor(stance, front), false), action: { type: "attack", target: "foe" }, foe: "rest" },
    { id: "punch", label: attackName(stance, swingFor(mirrorStance(stance), front), true), action: { type: "attack", target: "foe" }, foe: "rest", punch: true },
  ];
  if (stance !== "idle") {
    attacks.push(
      { id: "attack-back", label: "Mainhand Overhead, at the back line", action: { type: "attack", target: "foe" }, foe: "rest", foeLine: "back" },
      { id: "punch-back", label: "Offhand Overhead, at the back line", action: { type: "attack", target: "foe" }, foe: "rest", foeLine: "back", punch: true },
    );
  }
  return [
    ...attacks,
    { id: "block", label: "Block", action: { type: "block", target: "foe" }, foe: "strike" },
    { id: "dodge-fwd", label: "Dodge forward", action: { type: "maneuver", target: "foe" }, foe: "strike" },
    { id: "dodge-back", label: "Dodge back", action: { type: "maneuver", target: "self" }, foe: "strike" },
    { id: "advance", label: "Advance", action: { type: "maneuver", target: "foe" }, foe: "rest" },
    { id: "fall-back", label: "Fall back", action: { type: "maneuver", target: "self" }, foe: "rest" },
    { id: "rest", label: "Rest", action: { type: "rest", target: "self" }, foe: "rest" },
    { id: "rest-broken", label: "Rest, broken by a blow", action: { type: "rest", target: "self" }, foe: "strike" },
  ];
}

/** The dummy's id in the player viewer's fight. */
const FOE_ID = "e0";

export const playerActionOf = (sc: PlayerScenario): PlayerAction => ({
  type: sc.action.type, target: sc.action.target === "foe" ? FOE_ID : "self", ...(sc.punch ? { weight: "baseline" as const, hand: "left" as const } : {}),
});

/** The armor and head gear the viewer puts on you: the starting classes' own pieces, worn (none: plain armor of the picked tier, bare-headed). */
export interface Wear { armor?: ArmorItem; head?: HeadItem }
/** Every piece that can be worn, the armor first, then the head gear. */
export const WEARABLES = (Object.keys(ITEMS) as (keyof typeof ITEMS)[]).filter(id => ITEMS[id].slot !== "weapon") as (ArmorItem | HeadItem)[];
/** A piece worn, as the viewer's Wear. */
export const wearOf = (id: ArmorItem | HeadItem): Wear => (ITEMS[id].slot === "armor" ? { armor: id as ArmorItem } : { head: id as HeadItem });

export function playerViewerFight(weapon: WeaponTier, armor: ArmorTier): CombatState {
  return createCombat(
    { name: "You", maxHP: PLAYER_MAX_HP, weapon, armor, charges: 0 },
    [{ kind: "sleepwalker", line: "front" }],
    { dummy: true },
  );
}

/**
 * Sets the scene for a stance and a scenario (none: just standing there): you in the stance (Staggered: down on one knee, your turn
 * the recovery), the dummy in front of you, whole, doing what the scenario needs. Always the same start, so every play of an action
 * begins from the same spot.
 */
export function applyPlayerShow(s: CombatState, weapon: WeaponTier, armor: ArmorTier, stance: PlayerViewStance, scenario?: PlayerScenario, wear: Wear = {}): CombatState {
  const v = structuredClone(s);
  v.player.weapon = weapon;
  // What you wear: a class's own armor (its tier is the item's) or plain armor of a tier, and its head gear (or none).
  v.player.armorItem = wear.armor;
  v.player.armor = wear.armor ? (ITEMS[wear.armor].tier as ArmorTier) : armor;
  v.player.headItem = wear.head;
  v.player.head = wear.head ? (ITEMS[wear.head].tier as ArmorTier) : "none";
  v.player.staggered = stance === "staggered";
  v.player.stance = stance === "staggered" ? "idle" : stance;
  v.player.fatigue = stance === "staggered" ? v.player.hp : 0;
  const e = v.enemies[0];
  const kind = kindOf(e);
  e.alive = true;
  e.staggered = false;
  e.reviving = false;
  e.hp = e.maxHP;
  e.fatigue = 0;
  e.line = scenario?.foeLine ?? "front";
  const strike = scenario?.foe === "strike";
  const foeStance = strike ? "Charging" : "Struggling";
  const action = kind.pattern.actions.get(strike ? "swing left" : "despair");
  if (action) e.intent = { ...describeAction(e.kind, e.line, foeStance, action), pose: kind.stancePoses[foeStance] };
  v.status = "playing";
  return v;
}
