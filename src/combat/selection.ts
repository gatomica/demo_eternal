/**
 * selection.ts — what the cursor is on during planning, and the action wheel's options.
 */
import type { CombatState, PlayerAction, Side, WeaponItem, WeaponTier } from "../core/types";
import type { Dir } from "../ui/input";
import type { HeldWeapon } from "../core/rules";

/** What the cursor is on: you, or an enemy. */
export type Selection = { kind: "player" } | { kind: "enemy"; id: string };

/**
 * The parts an action with alternatives opens into: the whole wheel's four quarters, by their directions (`left` the left hand's, `right` the right
 * hand's, `down` the one made with neither hand, `up` the one made with both).
 */
export type SubSlot = Dir;

/**
 * What an option is made with, for the wheel to draw instead of its name: a hand's weapon (its inventory sprite; an empty hand, its mitten), the
 * Kick (a boot), or both hands (`both`: the two weapons crossed; one weapon, or none, held in both hands: its picture with a shadow of it below and to
 * the side). Its cost and damage bar runs along the part's inner edge (`tier`'s; the Kick's, bare hands'; both hands', `bothHands` from the two-handed
 * base).
 */
export type WheelLook = { kind: "weapon"; tier: WeaponTier; item?: WeaponItem; side: Side; flaming?: boolean } | { kind: "kick" } | { kind: "forearms" } | { kind: "both"; right: HeldWeapon; left: HeldWeapon };

/** An option on the action wheel. */
export interface WheelOption {
  label: string;
  action: PlayerAction;
  /** Drawn as this picture instead of its name (`label` stays its name for readers of the screen). */
  look?: WheelLook;
  /** Alternative actions: pressing the option's own direction again opens it into these parts (an empty one is for later). Without them it cannot be opened. */
  alternatives?: Record<SubSlot, WheelOption | null>;
  /** Shown, but it can't be chosen now (a skill with no enemy it can be aimed at). */
  disabled?: boolean;
  /**
   * A weapon skill: drawn as its weapon's picture, with two bars along the inner edge: the attack's, from the skill's own numbers
   * (`blow`, shares of your max health, its effect in: Stab's cost cut, the Hookshot's Poise grown), and just outside it the Eternity it spends
   * (`eternity`, a share of your max Eternity), the part of it your Eternity can't pay (`death`, the same share) in black.
   */
  skill?: { blow: { cost: number; damage: number; poise: number; deadly: number }; eternity: number; death: number };
  /**
   * An Attack at a staggered enemy, and what it wears weighs (its Resistance): the Fatigue the blow would put on it (its Poise, and the share of its
   * damage the armor turns into Fatigue) is half as much damage instead, drawn on the bar fading between white and missing health.
   */
  staggered?: { resistance: number };
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
