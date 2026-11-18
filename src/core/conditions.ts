/**
 * conditions.ts — the `*Condition`s an action can name in a pattern (`Stride: maneuver, retreat,
 * *Hurt, *!Close`). An action is only available while all of them hold; `!` flips one; `*A or *B`
 * is one condition that holds while either does.
 *
 * Three sources, looked up in this order: the kind's own `conditions`, the common ones below, and
 * the kind's statuses (`flags`), so `*Phase2` or `*Sealed` work without writing anything.
 */
import type { EnemyKind } from "./bestiary";
import type { ActionDef } from "./patterns";
import { foeCanUse, foeTargetsOf } from "./skills";
import type { CombatState, Enemy } from "./types";

export type Condition = (self: Enemy, state: CombatState) => boolean;

/** Conditions every kind can use (names in lowercase). */
export const COMMON_CONDITIONS: Record<string, Condition> = {
  /** Below half its health. */
  hurt: self => self.hp < self.maxHP / 2,
  /** Fatigue above half its health. */
  tired: self => self.fatigue > self.hp / 2,
  /** On the front line, within reach of you. */
  close: self => self.line === "front",
  /** On the back line. */
  far: self => self.line === "back",
  playerstaggered: (_, state) => state.player.staggered,
  playerreviving: (_, state) => state.player.reviving,
  playerwaxed: (_, state) => state.player.waxed,
  /** A flame within reach of Usurp Flame (the Waxed Torch's skill): yours, staggered while Waxed, or an ally's (staggered while Waxed, or cradling it). */
  usurpable: (self, state) => foeTargetsOf(state, self, "usurp").length > 0,
};

/** The rule behind a condition name (a leading `!` ignored), or undefined if there is none. */
export function conditionOf(kind: EnemyKind, need: string): Condition | undefined {
  const name = need.replace(/^!/, "");
  const flag = Object.keys(kind.flags ?? {}).find(k => k.toLowerCase() === name);
  return kind.conditions?.[name] ?? COMMON_CONDITIONS[name] ?? (flag ? self => !!self.flags[flag] : undefined);
}

/**
 * Whether all of an action's conditions hold for this enemy right now. A skill (`skill <id>`) also needs its own: its weapon gives it (a Flaming
 * torch's Flame Blast), and someone it can be aimed at (`foeCanUse`).
 */
export function isAvailable(kind: EnemyKind, self: Enemy, state: CombatState, a: ActionDef): boolean {
  return (!a.skill || foeCanUse(state, self, a.skill)) && needsHold(kind, self, state, a.needs);
}

/** Whether all these needs (an action's, or a stance's bracketed conditions) hold for this enemy right now. */
export function needsHold(kind: EnemyKind, self: Enemy, state: CombatState, needs: string[]): boolean {
  // Each need holds if any of its alternatives (`*A or *B`, kept as "a|b") does.
  return needs.every(need =>
    need.split("|").some(alt => {
      const holds = conditionOf(kind, alt)?.(self, state) ?? false;
      return alt.startsWith("!") ? !holds : holds;
    }),
  );
}

/** A need as it is written in a pattern, for messages: `*Far or *Flaming`. */
export const needText = (need: string) => need.split("|").map(alt => `*${alt}`).join(" or ");
