/**
 * statuses.ts — when the player's statuses come and go. Waxed: covered in wax by a direct
 * waxing hit; it lasts while there's Fatigue to hold it. Encased: sealed whole in wax (its flame
 * taken), until it gets back up.
 */
import type { Fighter } from "../types";
import type { Turn } from "./turn";

/** Covered in wax by a direct waxing hit; on wax already there, the hit also tires (1/8 of its damage). */
export function waxOn(t: Turn, f: Fighter, damage: number) {
  const bonus = f.waxed ? damage / 8 : 0;
  t.tire(f, bonus);
  f.waxed = true;
  t.emit({ kind: "waxed", who: f.id, bonus });
}

/** Its Fatigue gone: so is the wax that hung on it. */
export function fatigueGone(f: Fighter) {
  f.waxed = false;
}

/** Back on its feet (recovered or revived): the wax on it, and any sealing it whole, breaks away. */
export function backOnFeet(f: Fighter) {
  f.waxed = false;
  f.encased = false;
}
