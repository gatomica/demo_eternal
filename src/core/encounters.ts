/**
 * encounters.ts — ready-made encounters for Test combat (and the map's Warden fight).
 */
import { bodySetups } from "./bestiary";
import type { EnemySetup } from "./types";

export interface Encounter {
  id: string;
  label: string;
  enemies: EnemySetup[];
  /** Shown when you win (Test combat), if not the usual. */
  wonText?: string;
  /** Your revives in this fight, if not the usual. */
  charges?: number;
  /** The guide's lesson (combat/lesson.ts): the fight follows its script, and can't end early. */
  lesson?: boolean;
}

/** A Wax Blob: three parts that share one body (health and place). `id` tells bodies apart in a fight. */
export const waxBlob = (id = "blob", extra: Partial<EnemySetup> = {}) => bodySetups("waxBlob", id, extra);

/** A super Wax Blob: its two side parts wield eternal Brick Hammers. */
export const superBlob = (id = "super", extra: Partial<EnemySetup> = {}) => bodySetups("superBlob", id, extra);

export const ENCOUNTERS: Encounter[] = [
  { id: "one", label: "One sleepwalker", enemies: [{ kind: "sleepwalker" }] },
  { id: "two", label: "Two sleepwalkers", enemies: [{ kind: "sleepwalker" }, { kind: "sleepwalker" }] },
  {
    id: "three",
    label: "Three sleepwalkers",
    enemies: [{ kind: "sleepwalker" }, { kind: "sleepwalker" }, { kind: "sleepwalker" }],
  },
  { id: "patrol", label: "Patrol warden (torch)", enemies: [{ kind: "patrolWarden" }] },
  { id: "hammer", label: "Hammer sleepwalker", enemies: [{ kind: "sleepwalkerHammer" }] },
  {
    id: "eternals",
    label: "Sleepwalker, patrol warden and hammer",
    enemies: [{ kind: "sleepwalker", line: "front" }, { kind: "patrolWarden" }, { kind: "sleepwalkerHammer" }],
  },
  { id: "waxed", label: "One waxed", enemies: [{ kind: "waxed" }] },
  { id: "waxed-chisel", label: "Chisel waxed", enemies: [{ kind: "waxedChisel" }] },
  { id: "waxed-hammer", label: "Hammer waxed", enemies: [{ kind: "waxedHammer" }] },
  // (Placeholder behavior: the guide's own pattern is not designed yet.)
  { id: "guide", label: "The guide", enemies: [{ kind: "guide" }] },
  // The tutorial: four scripted turns against the guide, on the back line (see combat/lesson.ts).
  {
    id: "tutorial", label: "Tutorial: the guide", lesson: true, wonText: "The lesson is over",
    enemies: [{ kind: "guide", line: "back", script: ["Hum", "Hum", "Halo Blast", "Halo Blast"] }],
  },
  { id: "blob", label: "Wax blob (three targets)", enemies: waxBlob() },
  { id: "super-blob", label: "Super wax blob (hammers)", enemies: superBlob() },
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
      // The three waxed start on the front line, he on the back one. In the opening scene he takes the flame of the middle one (Waxed C, the
      // offering) and steps into its place: the fight begins with the three left (Waxed A, him, Waxed B) all on the front line.
      { kind: "waxed", name: "Waxed A", line: "front" },
      { kind: "waxed", name: "Waxed C", line: "front", offering: true },
      { kind: "warden", name: "Penitent Warden" },
      { kind: "waxed", name: "Waxed B", line: "front" },
    ],
  },
];
