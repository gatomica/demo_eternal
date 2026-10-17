/**
 * selection.ts — what the cursor is on during planning, and the action wheel's options.
 */
import type { CombatState, PlayerAction } from "../core/types";
import type { Dir } from "../ui/input";

/** What the cursor is on: you, or an enemy. */
export type Selection = { kind: "player" } | { kind: "enemy"; id: string };

/** An option on the action wheel. */
export interface WheelOption {
  label: string;
  action: PlayerAction;
}

export type Wheel = Record<Dir, WheelOption | null>;

/** Rows by depth, closest first: you, the front line, the back line. Empty lines are skipped. */
export function rowsOf(fight: CombatState): Selection[][] {
  const line = (l: "front" | "back") =>
    fight.enemies.filter(e => e.alive && e.line === l).map(e => ({ kind: "enemy", id: e.id }) as Selection);
  return [[{ kind: "player" }], line("front"), line("back")];
}

export const sameSel = (a: Selection, b: Selection) =>
  a.kind === b.kind && (a.kind === "player" || (b.kind === "enemy" && a.id === b.id));

/** Default selection: the first enemy on the front line, else the first still standing. */
export function defaultSelection(fight: CombatState): Selection {
  const rows = rowsOf(fight);
  return rows[1][0] ?? rows[2][0] ?? { kind: "player" };
}
