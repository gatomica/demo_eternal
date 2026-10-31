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

/**
 * Where the cursor goes on this key while planning: W and S step between depths, A and D walk the
 * whole lineup as it appears on screen, left to right (you, then the front line, then the back line;
 * so A at the left end of a line steps to the line closer to you, and D at the right end to the line behind).
 * Null when it doesn't move.
 */
export function moveSelection(rows: Selection[][], sel: Selection, dir: Dir): Selection | null {
  if (dir === "up" || dir === "down") {
    const step = dir === "up" ? 1 : -1;
    const r = rows.findIndex(row => row.some(s => sameSel(s, sel)));
    for (let next = r + step; next >= 0 && next < rows.length; next += step) {
      // Land on the visually closest one: the left end of a line farther away, the right end of a closer one.
      if (rows[next].length) return step > 0 ? rows[next][0] : rows[next][rows[next].length - 1];
    }
    return null;
  }
  const lineup = rows.flat();
  const i = lineup.findIndex(s => sameSel(s, sel));
  const to = lineup[Math.max(0, Math.min(lineup.length - 1, i + (dir === "left" ? -1 : 1)))];
  return sameSel(to, sel) ? null : to;
}

/** Default selection: the first enemy on the front line, else the first still standing. */
export function defaultSelection(fight: CombatState): Selection {
  const rows = rowsOf(fight);
  return rows[1][0] ?? rows[2][0] ?? { kind: "player" };
}
