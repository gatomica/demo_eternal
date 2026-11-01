/**
 * body.ts — multi-target enemies (the Wax Blob): several enemies that are parts of one body. They
 * act on their own, but share one pool of health and one line (see `Enemy.body`).
 */
import type { Enemy, Fighter } from "./types";

/** The parts of the body this fighter belongs to (still in the fight, itself included); just the fighter if it has no body. */
export function bodyOf(all: readonly Enemy[], f: Enemy): Enemy[];
export function bodyOf(all: readonly Enemy[], f: Fighter): Fighter[];
export function bodyOf(all: readonly Enemy[], f: Fighter): Fighter[] {
  const body = (f as Partial<Enemy>).body;
  return body ? all.filter(e => e.body === body && e.alive) : [f];
}

/** The part that moves the body: the middle one, or the first left. */
export function leaderOf(parts: Enemy[]): Enemy {
  return parts.find(e => e.part === "mid") ?? parts[0];
}
