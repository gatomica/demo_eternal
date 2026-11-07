/**
 * statuses.ts — when the player's statuses come and go. Waxed: covered in wax by a direct
 * waxing hit; it lasts while there's Fatigue to hold it. Encased: sealed whole in wax (its flame
 * taken), until it gets back up.
 */
import { kindOf } from "../bestiary";
import type { Enemy, Fighter } from "../types";
import type { Turn } from "./turn";

/** The waxed and the Wax Blob's parts always have the Waxed status: nothing takes it off them. */
const alwaysWaxed = (f: Fighter) => "kind" in f && !!kindOf(f as Enemy).alwaysWaxed;

/**
 * Covered in wax by a waxing blow of the Warden's flail, whether it lands or is blocked; on wax already there, a direct hit also tires
 * (1/8 of its damage, `direct`).
 */
export function waxOn(t: Turn, f: Fighter, damage: number, direct = true) {
  const bonus = f.waxed && direct ? damage / 8 : 0;
  t.tire(f, bonus);
  f.waxed = true;
  t.emit({ kind: "waxed", who: f.id, bonus });
}

/** Its Fatigue gone: so is the wax that hung on it. */
export function fatigueGone(f: Fighter) {
  f.waxed = alwaysWaxed(f);
  f.coated = false;
}

/** Back on its feet (recovered or revived): the wax on it, and any sealing it whole, breaks away. */
export function backOnFeet(f: Fighter) {
  f.waxed = alwaysWaxed(f);
  f.coated = false;
  f.encased = false;
}
