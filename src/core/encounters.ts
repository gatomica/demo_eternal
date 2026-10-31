/**
 * encounters.ts — ready-made encounters for Test combat (and the map's Warden fight).
 */
import type { EnemySetup } from "./types";

export interface Encounter {
  id: string;
  label: string;
  enemies: EnemySetup[];
  /** Shown when you win (Test combat), if not the usual. */
  wonText?: string;
  /** Your revives in this fight, if not the usual. */
  charges?: number;
}

export const ENCOUNTERS: Encounter[] = [
  { id: "one", label: "One sleepwalker", enemies: [{ kind: "sleepwalker" }] },
  { id: "two", label: "Two sleepwalkers", enemies: [{ kind: "sleepwalker" }, { kind: "sleepwalker" }] },
  {
    id: "three",
    label: "Three sleepwalkers",
    enemies: [{ kind: "sleepwalker" }, { kind: "sleepwalker" }, { kind: "sleepwalker" }],
  },
  { id: "waxed", label: "One waxed", enemies: [{ kind: "waxed" }] },
  // (Placeholder behavior: the guide is to become the tutorial's opponent.)
  { id: "guide", label: "The guide", enemies: [{ kind: "guide" }] },
  { id: "waxed-pair", label: "Two waxed", enemies: [{ kind: "waxed" }, { kind: "waxed" }] },
  {
    id: "mixed",
    label: "Sleepwalker and waxed",
    enemies: [{ kind: "sleepwalker", line: "front" }, { kind: "waxed" }],
  },
  {
    // The tutorial boss, escorted by two waxed.
    id: "warden",
    label: "Penitent Warden",
    charges: 1,
    enemies: [
      { kind: "waxed", name: "Waxed A", line: "front" },
      { kind: "warden", name: "Penitent Warden" },
      { kind: "waxed", name: "Waxed B", line: "front" },
      // The opening scene: he takes this one's flame before the fight begins.
      { kind: "waxed", name: "Waxed C", offering: true },
    ],
  },
];
