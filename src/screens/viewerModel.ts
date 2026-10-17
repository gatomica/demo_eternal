/**
 * viewerModel.ts — the Model viewer's model: what it shows of the enemy, and the actions it can
 * play.
 */
import { PLAYER_MAX_HP } from "../combat/fight";
import { ENEMY_KINDS } from "../core/bestiary";
import { describeAction } from "../core/intents";
import type { ActionDef } from "../core/patterns";
import { createCombat } from "../core/setup";
import type { CombatState } from "../core/types";

export const VIEWER_KINDS = Object.keys(ENEMY_KINDS);

/** A status the viewer can flip, and what each side is called. */
interface ViewerToggle { key: string; off: string; on: string }

/** Statuses each kind can be shown with (the line applies to everyone). */
export const VIEWER_TOGGLES: Record<string, ViewerToggle[]> = {
  warden: [
    { key: "sealed", off: "Unsealed", on: "Sealed" },
    { key: "phase2", off: "Phase 1", on: "Phase 2" },
    { key: "flaming", off: "Flail unlit", on: "Flaming flail" },
  ],
};

export const LINE_TOGGLE: ViewerToggle = { key: "back", off: "Front line", on: "Back line" };

export interface ViewerShow {
  stance: string;
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

export function viewerFight(kind: string): CombatState {
  return createCombat(
    { name: "Dummy", maxHP: PLAYER_MAX_HP, weapon: "normal", armor: "light", charges: 0 },
    [{ kind, line: "front" }],
    { dummy: true },
  );
}

/** The viewer's extra "stance": knocked down, its only action the forced Rest that recovers. */
export const STAGGERED = "Staggered";

/** Applies the viewer's choices to the enemy: its line, its statuses, its stance and action. */
export function applyShow(s: CombatState, show: ViewerShow): CombatState {
  const v = structuredClone(s);
  const e = v.enemies[0];
  const kind = ENEMY_KINDS[e.kind];
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
    for (const t of VIEWER_TOGGLES[e.kind] ?? []) e.flags[t.key] = !!show.on[t.key];
    if (e.flags.phase2) e.flags.sealed = false; // phase two burns unsealed for good
    else e.flags.flaming = false; // only his phase-two flame can set the flail alight
  }
  if (stanceName === STAGGERED) {
    e.staggered = true;
    e.fatigue = e.hp;
    // A stagger puts the Warden's flame out (before phase two).
    if ("sealed" in e.flags && !e.flags.phase2) e.flags.sealed = true;
    e.intent = { type: "rest", dir: e.line === "back" ? "advance" : "retreat", forced: true };
    v.status = "playing";
    return v;
  }
  const stance = kind.pattern.stances.find(x => x.name === stanceName);
  const actionName = !played && show.action ? show.action : stance?.groups[0][0].name ?? "";
  const action = kind.pattern.actions.get(actionName.toLowerCase());
  if (action) e.intent = { ...describeAction(e.kind, e.line, stanceName, action), pose: kind.stancePoses[stanceName] };
  v.status = "playing";
  return v;
}

/** The actions a stance allows with the enemy as shown (conditions like *Sealed checked). */
export function viewerActions(kindName: string, state: CombatState, stanceName: string) {
  const kind = ENEMY_KINDS[kindName];
  // Staggered, the only way on is to recover (into a `Recover >` stance).
  if (stanceName === STAGGERED) {
    return [{ action: { name: "Recover", type: "rest", needs: [] as string[] } as unknown as ActionDef, fixed: false, available: true }];
  }
  const stance = kind.pattern.stances.find(x => x.name === stanceName);
  const e = state.enemies[0];
  // Actions a fixed rule can force from any stance (the Warden's Usurp Flame) come last.
  const fixed = (kind.fixedActions ?? []).map(n => kind.pattern.actions.get(n.toLowerCase())!);
  return [...(stance?.groups.flat() ?? []), ...fixed].map(a => ({
    action: a,
    fixed: fixed.includes(a),
    available: a.needs.every(n => kind.conditions?.[n]?.(e, state) ?? false),
  }));
}
