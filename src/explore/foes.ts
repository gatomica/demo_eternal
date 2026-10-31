/**
 * foes.ts — enemies on the map: who stands where, how they wander and chase you.
 *
 * Each enemy on the map stands for one fight. It's hidden by the dark like everything else,
 * and it sees you exactly when you see it. The waxed stand slumped where they were left and
 * lurch after you, slowly, if you come close; sleepwalkers drift around and give chase, though
 * never as fast as you walk. Touching one starts its fight.
 */
import { ENEMY_KINDS, type KindId } from "../core/bestiary";
import { ENCOUNTERS } from "../core/encounters";
import { TRAINING_SCRIPT } from "../combat/training";
import type { EnemySetup } from "../core/types";
import type { Walker } from "./movement";
import type { GroundItem } from "./pickups";
import { openFloor } from "./seals";
import { TUTORIAL_FOE } from "./tutorial";
import { HALF_D, HALF_W } from "./tuning";
import { WORLD } from "./world";

/** An enemy waiting somewhere on the map, and the fight it starts when it reaches you. */
export interface MapFoe {
  id: string;
  kind: KindId;
  /** Where it stands at first: its feet, in tiles on the world grid (plan column/row + 1). */
  home: { x: number; y: number; z: number };
  /** The fight. The map shows one figure per enemy in it, huddled together. */
  fight: EnemySetup[];
  /** It never notices you or moves: you walk up to it. */
  still?: boolean;
  /** Which of the original group's members are still standing, when some are dead for good (`fight` holds only those). */
  members?: number[];
}

/** Where a beaten enemy lies on the map. */
export interface Corpse { kind: KindId; x: number; y: number; alt: number }

/**
 * Every beaten group lies somewhere: fills in the members of a group in `defeated` that have no
 * recorded spot (a save from before the remains were kept), at the group's start.
 */
export function withCorpses(corpses: Record<string, Corpse>, defeated: string[]): Record<string, Corpse> {
  const out = { ...corpses };
  for (const id of defeated) {
    const def = MAP_FOES.find(f => f.id === id);
    if (!def) continue;
    const spots = huddle(def.fight.length);
    def.fight.forEach((m, i) => { out[memberKey(id, i)] ??= { kind: m.kind, x: def.home.x + spots[i][0], y: def.home.y + spots[i][1], alt: def.home.z }; });
  }
  return out;
}

/**
 * What resting by a keeper does to the enemies (and coming back after a loss, which counts the
 * same): the sleepwalkers get up again and their remains go; the waxed and the Warden stay dead.
 * Everything lying on the ground (what enemies dropped, what you left there) goes too.
 */
export function wakeEnemies(j: { corpses: Record<string, Corpse>; defeated: string[] }) {
  const corpses = Object.fromEntries(Object.entries(j.corpses).filter(([, c]) => !ENEMY_KINDS[c.kind].respawns));
  return {
    corpses,
    ground: [] as GroundItem[],
    defeated: j.defeated.filter(id => {
      const def = MAP_FOES.find(f => f.id === id);
      return !def || !livingDef(def, corpses);
    }),
  };
}

/** The key of member `i` of a map enemy's original group, for the corpses. */
export const memberKey = (id: string, i: number) => `${id}#${i}`;

/**
 * A map enemy as it stands now: its group without the members that lie dead (the ones that don't
 * come back), or null if none is left.
 */
export function livingDef(def: MapFoe, corpses: Record<string, Corpse>): MapFoe | null {
  const members = def.fight.map((_, i) => i).filter(i => !corpses[memberKey(def.id, i)]);
  if (!members.length) return null;
  return members.length === def.fight.length ? def : { ...def, fight: members.map(i => def.fight[i]), members };
}

/** The Warden's fight, as Test combat has it (his escorts, and the waxed whose flame he takes first). */
const WARDEN_FIGHT = ENCOUNTERS.find(e => e.id === "warden")!.enemies;

/** The tutorial, roughly in the order you'll meet it. Levels: 0-1 below ground, 2 ground, 3-6 above. */
export const MAP_FOES: MapFoe[] = [
  // The start room: a waxed lying in the corner, the guide's lesson. It scratches and rests on a script.
  {
    id: TUTORIAL_FOE, kind: "waxed", home: { x: 4.5, y: 6.5, z: 2 }, still: true,
    fight: [{ kind: "waxed", line: "front", script: TRAINING_SCRIPT }],
  },
  // Ground floor. In the hall: a lone waxed, then a pair further in.
  { id: "hall-waxed", kind: "waxed", home: { x: 17.5, y: 4.5, z: 2 }, fight: [{ kind: "waxed" }] },
  { id: "hall-pair", kind: "waxed", home: { x: 21.5, y: 11.5, z: 2 }, fight: [{ kind: "waxed" }, { kind: "waxed" }] },
  // One left standing in the middle of the bridge.
  { id: "bridge-waxed", kind: "waxed", home: { x: 20.5, y: 8.5, z: 3 }, fight: [{ kind: "waxed" }] },
  // The first sleepwalker, in the room below the east stairs: your first read of its stances.
  { id: "low-sleeper", kind: "sleepwalker", home: { x: 27.5, y: 16.6, z: 2 }, fight: [{ kind: "sleepwalker" }] },
  // Up in the far room: a sleepwalker with a waxed at its side.
  {
    id: "far-room", kind: "sleepwalker", home: { x: 28.5, y: 7.6, z: 3 },
    fight: [{ kind: "sleepwalker", line: "front" }, { kind: "waxed" }],
  },

  // Below: the cellar, then the crypt under it (off the way up, for those who look).
  { id: "cold-pair", kind: "waxed", home: { x: 11.5, y: 25.5, z: 1 }, fight: [{ kind: "waxed" }, { kind: "waxed" }] },
  {
    id: "ossuary", kind: "sleepwalker", home: { x: 25.5, y: 30.5, z: 1 },
    fight: [{ kind: "sleepwalker", line: "front" }, { kind: "waxed" }],
  },
  { id: "crypt-waxed", kind: "waxed", home: { x: 49.5, y: 23.5, z: 0 }, fight: [{ kind: "waxed" }] },
  {
    id: "crypt-pair", kind: "sleepwalker", home: { x: 43.5, y: 30.5, z: 0 },
    fight: [{ kind: "sleepwalker", line: "front" }, { kind: "sleepwalker" }],
  },

  // Above: the gallery, the belfry, then the Warden.
  { id: "gallery-waxed", kind: "waxed", home: { x: 41.5, y: 8.5, z: 4 }, fight: [{ kind: "waxed" }, { kind: "waxed" }] },
  {
    id: "gallery-pair", kind: "sleepwalker", home: { x: 48.5, y: 7.6, z: 4 },
    fight: [{ kind: "sleepwalker", line: "front" }, { kind: "sleepwalker" }],
  },
  { id: "belfry-sleeper", kind: "sleepwalker", home: { x: 59.5, y: 22.5, z: 5 }, fight: [{ kind: "sleepwalker" }] },
  {
    id: "bell-hall", kind: "sleepwalker", home: { x: 70.5, y: 25.6, z: 5 },
    fight: [{ kind: "sleepwalker", line: "front" }, { kind: "waxed" }, { kind: "waxed" }],
  },
  { id: "warden", kind: "warden", home: { x: 70.5, y: 5.5, z: 6 }, fight: WARDEN_FIGHT },
];

interface FoeTuning {
  /** How close you must be (tiles) for it to notice you, once you can see each other. */
  notice: number;
  /** Speeds, in tiles per second: chasing you, and otherwise ambling about. */
  chase: number;
  walk: number;
  /** How far from home it wanders by itself (0: it doesn't). */
  wander: number;
}

export const FOE_TUNING: Record<KindId, FoeTuning> = {
  waxed: { notice: 3.2, chase: 0.85, walk: 0.6, wander: 0 },
  sleepwalker: { notice: 4.5, chase: 2.0, walk: 0.8, wander: 1.8 },
  // He waits in the middle of his arena, and only comes for you once you're well inside it.
  warden: { notice: 3.5, chase: 1.1, walk: 0.7, wander: 0 },
  // (Not yet on the map: the guide is to become the tutorial's opponent.)
  guide: { notice: 3.5, chase: 1.2, walk: 0.7, wander: 0 },
};

/** How a member of a fight looks on the map, by its kind. */

/**
 * How long a chasing enemy keeps hunting once it loses sight of you, in seconds. Meanwhile it
 * heads for where it last saw you; after this, it gives up and goes home.
 */
export const CHASE_MEMORY = 4;

/** The most enemies a fight started on the map can hold, counting everyone who joins in. */
export const MAX_IN_FIGHT = 4;

/** How close an enemy has to get to you to start its fight, in tiles. */
export const TOUCH = 0.7;

/** After arriving on the map (or coming back from a fight), enemies can't start a fight for this long. */
export const GRACE_MS = 1500;

/** How long the screen takes to go dark before a fight starts. */
export const ENCOUNTER_FADE_MS = 650;

/* ---------- Finding the way: step counts over the floor, no full path search ---------- */

/** Tiles an enemy on level z can walk on (enemies keep to their level: floor only). */
export const foeFloor = (z: number, x: number, y: number) => openFloor(z, x, y);

/**
 * How many steps each tile of level z is from tile (tx, ty), walking floor only (-1: can't get
 * there). One pass over the map; cheap enough to redo whenever you step onto a new tile.
 */
export function stepsFrom(z: number, tx: number, ty: number): Int16Array {
  const { w, h } = WORLD;
  const steps = new Int16Array(w * h).fill(-1);
  if (!foeFloor(z, tx, ty)) return steps;
  const queue = [ty * w + tx];
  steps[queue[0]] = 0;
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q], x = i % w, y = (i - x) / w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, ni = ny * w + nx;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || steps[ni] >= 0 || !foeFloor(z, nx, ny)) continue;
      steps[ni] = steps[i] + 1;
      queue.push(ni);
    }
  }
  return steps;
}

/** Whether an enemy at (x, y) on level z could walk straight to (gx, gy) without brushing a wall. */
function clearWalk(z: number, x: number, y: number, gx: number, gy: number) {
  const len = Math.hypot(gx - x, gy - y);
  const n = Math.ceil(len / 0.2);
  const rx = HALF_W + 0.05, ry = HALF_D + 0.05;
  for (let i = 1; i <= n; i++) {
    const px = x + ((gx - x) * i) / n, py = y + ((gy - y) * i) / n;
    for (const [cx, cy] of [[px - rx, py - ry], [px + rx, py - ry], [px - rx, py + ry], [px + rx, py + ry]]) {
      if (!foeFloor(z, Math.floor(cx), Math.floor(cy))) return false;
    }
  }
  return true;
}

/**
 * Where an enemy at (x, y) on level z should head to reach `goal`: straight there if the way is
 * clear, otherwise the middle of the neighbouring tile that's fewest steps from the goal (so it
 * rounds corners and threads doorways instead of pushing into walls).
 */
export function waypoint(z: number, x: number, y: number, goal: { x: number; y: number }, steps: Int16Array | null) {
  if (!steps || clearWalk(z, x, y, goal.x, goal.y)) return goal;
  const { w } = WORLD;
  const tx = Math.floor(x), ty = Math.floor(y);
  let best: { x: number; y: number } | null = null, bestSteps = steps[ty * w + tx];
  if (bestSteps < 0) bestSteps = Infinity;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const nx = tx + dx, ny = ty + dy;
    if (!foeFloor(z, nx, ny)) continue;
    // Diagonals only when both tiles beside the corner are floor: no cutting corners.
    if (dx && dy && (!foeFloor(z, tx + dx, ty) || !foeFloor(z, tx, ty + dy))) continue;
    const s = steps[ny * w + nx];
    if (s >= 0 && s < bestSteps) { bestSteps = s; best = { x: nx + 0.5, y: ny + 0.5 }; }
  }
  // Already on the goal's tile, or nothing better nearby: head for the goal itself.
  return best ?? goal;
}

export interface Foe extends Walker {
  /** Step counts toward its home, worked out once. */
  homeSteps: Int16Array;
  def: MapFoe;
  /** Where it's ambling to, if anywhere. */
  target: { x: number; y: number } | null;
  /** Seconds left standing still before it moves on. */
  wait: number;
  chasing: boolean;
  /** Seconds since it last saw you, while chasing. */
  lostFor: number;
  /** Where it last saw you, while chasing, with step counts toward that spot. */
  lastSeen: { x: number; y: number; steps: Int16Array | null } | null;
  /** Where you were the last time it saw you. */
  seenAt: { x: number; y: number } | null;
}

/** Where to draw each member of a group of `n`, around the group's position (tiles). */
export const huddle = (n: number): [number, number][] =>
  n <= 1 ? [[0, 0]] : n === 2 ? [[-0.2, -0.1], [0.22, 0.06]] : n === 3 ? [[-0.25, -0.1], [0.25, -0.08], [0, 0.12]]
    // The Warden's fight: him in the middle, a waxed either side, the one whose flame he'll take behind.
    : [[-0.42, 0.14], [0, -0.05], [0.42, 0.14], [0.36, -0.3]];
