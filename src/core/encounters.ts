/**
 * encounters.ts — ready-made encounters for Test combat (and the map's Warden fight).
 */
import { BODIES, type BodyId, bodySetups, ENEMY_KINDS, type KindId } from "./bestiary";
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
      // The three waxed start on the front line, he on the back one, Sealed, in Wax Arm Raised. Waxed C (the offering) is about to Clutch Flame in the first turn, so that she
      // takes Wax Arm Back and Usurp Flame at once: its flame is taken in that turn, as in any fight.
      { kind: "waxed", name: "Waxbound A", line: "front" },
      { kind: "waxed", name: "Waxbound C", line: "front", offering: true },
      { kind: "warden", name: "Penitent Warden" },
      { kind: "waxed", name: "Waxbound B", line: "front" },
    ],
  },
];

/** A non-boss enemy Test combat can put in a fight, as many of it as you like: an enemy kind, or a multi-target body (the Wax Blobs). */
export interface TestFoe {
  id: string;
  label: string;
  /** The setups for the `i`th one of it in the fight (a body's parts, told apart from another of the same by its id). */
  setups: (i: number) => EnemySetup[];
}

/** Names for kinds that share one (the Sleepwalker with its Broken Shortsword, and the map's bare-handed one). */
const TEST_LABELS: Partial<Record<KindId, string>> = {
  sleepwalker: "Depraved Sleepwalker (chisel)",
  sleepwalkerBare: "Depraved Sleepwalker (bare-handed)",
};

/** The kinds that are parts of a body: picked only as the whole body. */
const PART_KINDS = new Set<string>(Object.values(BODIES).flatMap(b => b.parts.map(p => p.kind)));

/**
 * Every non-boss enemy, for Test combat to count out: each kind in the bestiary but the bosses (those with a revive, the Warden), the guide (the
 * lesson's) and the parts of a body, then each body. A new enemy shows up here by itself.
 */
export const TEST_FOES: TestFoe[] = [
  ...(Object.keys(ENEMY_KINDS) as KindId[])
    .filter(k => !PART_KINDS.has(k) && k !== "guide" && !ENEMY_KINDS[k].revives)
    .map(k => ({ id: k, label: TEST_LABELS[k] ?? ENEMY_KINDS[k].name, setups: () => [{ kind: k }] })),
  ...(Object.keys(BODIES) as BodyId[]).map(b => ({ id: b, label: BODIES[b].name, setups: (i: number) => bodySetups(b, `${b}${i}`) })),
];

/** The most of one enemy Test combat puts in a fight. */
export const TEST_FOE_MAX = 6;

/** The enemies of a fight made from counts (`TEST_FOES` id -> how many), in the list's order. */
export const enemiesOfCounts = (counts: Record<string, number>): EnemySetup[] =>
  TEST_FOES.flatMap(f => Array.from({ length: counts[f.id] ?? 0 }, (_, i) => f.setups(i)).flat());

/** The ready-made encounters Test combat still offers besides counting enemies out: those with a boss or the guide in them. */
export const SPECIAL_ENCOUNTERS = ENCOUNTERS.filter(e => e.lesson || e.enemies.some(x => x.kind === "guide" || ENEMY_KINDS[x.kind].revives));
