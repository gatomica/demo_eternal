/**
 * viewerModel.ts — the Model viewer's model: what it shows of the enemy, and the actions it can
 * play.
 */
import { PLAYER_MAX_HP } from "../combat/fight";
import { ENEMY_KINDS, kindOf, type KindId, type StatusToggle } from "../core/bestiary";
import { isAvailable } from "../core/conditions";
import { describeAction } from "../core/intents";
import type { ActionDef } from "../core/patterns";
import { createCombat } from "../core/setup";
import type { CombatState } from "../core/types";

export const VIEWER_KINDS = Object.keys(ENEMY_KINDS) as KindId[];

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

export interface ViewerShow {
  stance: string;
  /** The Model stance: which way it's seen (default: 3/4 front). */
  angle?: ModelAngle;
  /** The action played (or about to be). */
  action?: string;
  /** Statuses that are on: "back", and the kind's own flags. */
  on: Record<string, boolean>;
  /** The fight's turn as shown. Once it moves past this, the action has played. */
  turn: number;
  /** The stance it moves on to after the action (picked when it's played). */
  next?: string;
  /** Play the Rest but break it with a blow (to see its flinch). */
  interrupt?: boolean;
}

export function viewerFight(kind: KindId): CombatState {
  return createCombat(
    { name: "Dummy", maxHP: PLAYER_MAX_HP, weapon: "normal", armor: "light", charges: 0 },
    [{ kind, line: "front" }],
    { dummy: true },
  );
}

/** The viewer's extra "stance": knocked down, its only action the forced Rest that recovers. */
export const STAGGERED = "Staggered";

/** The viewer's other extra "stance": the enemy in a T-pose, seen from the angle you pick (no actions). */
export const MODEL = "Model";

/** Applies the viewer's choices to the enemy: its line, its statuses, its stance and action. */
export function applyShow(s: CombatState, show: ViewerShow): CombatState {
  const v = structuredClone(s);
  const e = v.enemies[0];
  const kind = kindOf(e);
  // Once the action has played, it stands in the stance it moved on to, statuses as the action left them.
  const played = s.turn > show.turn;
  const stanceName = played && show.next ? show.next : show.stance;
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
    v.status = "playing";
    return v;
  }
  if (stanceName === MODEL) {
    const poses = kind.modelPoses ?? { front: "t-pose", back: "t-pose-b" };
    e.intent = { type: "rest", dir: e.line === "back" ? "advance" : "retreat", forced: false, pose: figureAngleOf(show.angle ?? "front34").view === "back" ? poses.back : poses.front };
    v.status = "playing";
    return v;
  }
  const stance = kind.pattern.stances.find(x => x.name === stanceName);
  const actionName = !played && show.action ? show.action : stance?.actions[0].name ?? "";
  const action = kind.pattern.actions.get(actionName.toLowerCase());
  if (action) e.intent = { ...describeAction(e.kind, e.line, stanceName, action), pose: kind.stancePoses[stanceName] };
  v.status = "playing";
  return v;
}

/** The actions a stance allows with the enemy as shown (conditions like *Sealed checked). */
export function viewerActions(kindName: KindId, state: CombatState, stanceName: string) {
  const kind = ENEMY_KINDS[kindName];
  // Staggered, the only way on is to recover (into a `Recover >` stance).
  if (stanceName === STAGGERED) {
    return [{ action: { name: "Recover", type: "rest", needs: [] as string[] } as unknown as ActionDef, fixed: false, available: true }];
  }
  const stance = kind.pattern.stances.find(x => x.name === stanceName);
  const e = state.enemies[0];
  // Actions a fixed rule can force from any stance (the Warden's Usurp Flame) come last.
  const fixed = (kind.fixedActions ?? []).map(n => kind.pattern.actions.get(n.toLowerCase())!);
  return [...(stance?.actions ?? []), ...fixed].map(a => ({
    action: a,
    fixed: fixed.includes(a),
    available: isAvailable(kind, e, state, a),
  }));
}
