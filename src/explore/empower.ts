/**
 * empower.ts — Empower Self, at the guide: String exchanged for a higher max health or max Eternity, each raised on its own.
 * Raising a stat by one costs the sum of 1 up to its present value (at 5 it costs 1+2+3+4+5 = 15, to make it 6).
 */

/** What you start with. */
export const START_STATS = { maxHP: 10, maxEternity: 10 };

/** Your max health and max Eternity. */
export type Stats = typeof START_STATS;

/** The String it costs to raise a stat that stands at `value` by one. */
export const empowerCost = (value: number) => (value * (value + 1)) / 2;

/** Whether your String (the eternal String too) is enough to raise at least one of your stats. */
export const canEmpower = (string: number, stats: Stats, eternal = 0) => string + eternal >= Math.min(empowerCost(stats.maxHP), empowerCost(stats.maxEternity));

/** How a cost is paid: your own String first, the eternal String only for what that does not cover (null: not enough of both together). */
export function payment(cost: number, string: number, eternal: number): { normal: number; eternal: number } | null {
  if (string + eternal < cost) return null;
  const normal = Math.min(string, cost);
  return { normal, eternal: cost - normal };
}
