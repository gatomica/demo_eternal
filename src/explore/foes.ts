/**
 * foes.ts — enemies on the map: who stands where, how they wander and chase you.
 *
 * Each enemy on the map stands for one fight. It's hidden by the dark like everything else,
 * and it sees you exactly when you see it. The waxed stand slumped where they were left and
 * lurch after you, slowly, if you come close; sleepwalkers drift around and give chase, though
 * never as fast as you walk. Touching one starts its fight.
 */
import { ENEMY_KINDS, type KindId } from "../core/bestiary";
import { dropsOf, type GearSpec } from "./gear";
import { ENCOUNTERS, superBlob, waxBlob } from "../core/encounters";
import type { EnemySetup } from "../core/types";
import type { Walker } from "./movement";
import type { GroundItem } from "./pickups";
import { surfaceNear } from "./movement";
import { barsAt, DIAG, FLOOR, LADDER, LEVELS, rampAt, rampHeight, slopeAt, slopeRise, STAIRS, tileAt, WORLD } from "./world";
import { HALF_D, HALF_W, STEP_TOLERANCE } from "./tuning";

/** An enemy waiting somewhere on the map, and the fight it starts when it reaches you. */
export interface MapFoe {
  id: string;
  kind: KindId;
  /** Where it stands at first: its feet, in tiles on the world grid (plan column/row + 1). */
  home: { x: number; y: number; z: number };
  /** The fight. The map shows one figure per enemy in it, huddled together. */
  fight: EnemySetup[];
  /** A big round body: its radius in tiles (yours is `HALF_W`). Too wide for a one-tile corridor, so it keeps to the rooms. */
  girth?: number;
  /**
   * It only starts its fight when you are within this many tiles (a square) of where it started: inside the room it guards,
   * or at its edge. Elsewhere it may chase you, but cannot reach you.
   */
  fightWithin?: number;
  /** It never notices you or moves: you walk up to it. */
  still?: boolean;
  /**
   * Where each member of its group is drawn, relative to where it stands, instead of the usual huddle (the boss's group is spread over his arena).
   */
  spread?: [number, number][];
  /**
   * The fight starts the moment you stand in this rectangle (world tiles, on level `z`), whatever it does: for the boss, who never chases.
   */
  trigger?: { x0: number; y0: number; x1: number; y1: number; z: number; /** The corner tiles of the rectangle (this many tiles square) do not start it: only stepping beyond them does. */ cut?: number };
  /**
   * What it is sure to drop when it falls, on top of the ordinary chance and the gear it carries: a lump of eternal string (as much as its
   * max health) and/or a piece of gear (an eternal memory). Dropped once for the group, by its first member to lie down.
   */
  drop?: { eternalString?: boolean; gear?: GearSpec };
  /** It holds its post: it does not wander about (it still notices you and gives chase). */
  post?: boolean;
  /**
   * A beat it walks back and forth along (two or more points, x and y in world tiles, in a straight line from one to the next; it may climb
   * stairs on the way). It starts at the first. After a chase it goes home (the first point) and takes up the beat again.
   */
  patrol?: { x: number; y: number }[];
  /** Which of the original group's members are still standing, when some are dead for good (`fight` holds only those). */
  members?: number[];
  /**
   * Its members that lie dead for good still take part in its fight, dead from the start (`EnemySetup.dead`): the Warden's waxed, whom his
   * phase two raises. (On the map they are only their remains.)
   */
  keepsDead?: boolean;
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
    const spots = spotsOf(def);
    def.fight.forEach((m, i) => { out[memberKey(id, i)] ??= { kind: m.kind, x: def.home.x + spots[i][0], y: def.home.y + spots[i][1], alt: def.home.z }; });
  }
  return out;
}

/**
 * What reawakening does to the map, the same whether you rested by a keeper or fell and woke there: the
 * sleepwalkers get up again and their remains go; the waxed and the Warden stay dead. Everything lying on
 * the ground (what enemies dropped, what you left there) goes, but for piles of String, and the remains that stay get what they
 * dropped back, lying on them again, every time (even if you still carry the one you took).
 */
/** The chance that an enemy, when it falls, drops a lump of eternal string (as much as its max health). */
export const ETERNAL_STRING_CHANCE = 0.05;

/**
 * Where its `slot`th item lies, round the remains of the enemy `key`: a little way off in a direction of its own, so several never clump
 * on top of each other (or of the remains). Gear takes slots 0, 1...; the eternal string always the last, slot 2.
 */
export function dropOffset(key: string, slot: number): { x: number; y: number } {
  let h = 7;
  for (const ch of key) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  const a = ((h % 628) / 100) + slot * ((Math.PI * 2) / 3), r = 0.38;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.6 };
}

/** The eternal string slot in `dropOffset`. */
export const ETERNAL_SLOT = 2;

export function wakeEnemies(j: { corpses: Record<string, Corpse>; defeated: string[]; ground?: GroundItem[] }) {
  const corpses = Object.fromEntries(Object.entries(j.corpses).filter(([, c]) => !ENEMY_KINDS[c.kind].respawns));
  const ground: GroundItem[] = Object.entries(corpses).flatMap(([key, c]) =>
    dropsOf([{ kind: c.kind }]).map((gear, i) => ({ id: `drop-${key}-${i}-back`, at: { x: c.x + dropOffset(key, i).x, y: c.y + dropOffset(key, i).y, z: c.alt }, gear: { ...gear, origin: key }, from: key })),
  );
  return {
    corpses,
    // (A pile of String you left, any eternal string and any eternal memory lie where they are until you gather them.)
    ground: [...(j.ground ?? []).filter(g => g.string || g.eternalString || g.gear?.eternal), ...ground],
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

/**
 * Every enemy on the map, in the order you meet them. Empty for now: the map is cleared, ready to be
 * placed by hand. An entry looks like
 * `{ id: "wax-1", kind: "waxed", home: { x: 24.5, y: 13.5, z: 0 }, fight: [{ kind: "waxed" }] }`
 * (a Wax Blob is `kind: "blobMid", girth: 1, fightWithin: 3.5, fight: waxBlob("id")`, from `core/encounters`).
 */
export const MAP_FOES: MapFoe[] = [
  // The labyrinth (level 0).
  // At the entrance of the north room's corridor, where it leaves the ring's north side.
  { id: "wax-north", kind: "waxed", home: { x: 26.5, y: 11.5, z: 0 }, fight: [{ kind: "waxed" }] },
  // Inside the little east room: a waxed with a Jagged Chisel (it drops an ordinary one).
  { id: "wax-east", kind: "waxedChisel", home: { x: 38, y: 17.5, z: 0 }, fight: [{ kind: "waxedChisel" }] },
  // At the west junction, where the ring's west side meets the corridor into the shaft room.
  { id: "wax-west", kind: "waxed", home: { x: 21.5, y: 18.5, z: 0 }, fight: [{ kind: "waxed" }] },
  // At the dead end up the west side of the ring.
  { id: "wax-deadend", kind: "waxed", home: { x: 21.5, y: 16.5, z: 0 }, fight: [{ kind: "waxed" }] },
  // In the shaft room, in front of the ladder: a Wax Blob (three targets, one body), too fat for the corridors, so it keeps to the room.
  { id: "hurdle", kind: "blobMid", home: { x: 27.5, y: 18.5, z: 0 }, girth: 1, fightWithin: 3.5, fight: waxBlob("hurdle"), drop: { eternalString: true } },

  // The dungeon's first floor (Floor A). Coordinates are plan + 1; z is the level the floor is on.
  // In the Nave, by the wall of its south-east corner, near that corner's diagonal door.
  { id: "nave-se", kind: "sleepwalkerBare", home: { x: 33.5, y: 23.5, z: 7 }, fight: [{ kind: "sleepwalkerBare" }] },
  // In the west chapel.
  { id: "west-1", kind: "sleepwalkerBare", home: { x: 8.5, y: 18.5, z: 6 }, fight: [{ kind: "sleepwalkerBare" }] },
  { id: "west-2", kind: "sleepwalkerBare", home: { x: 10.5, y: 20.5, z: 6 }, fight: [{ kind: "sleepwalkerBare" }] },
  // In the dug-out SW hall, hugging its bottom-left corner: a Wax Blob whose side parts wield hammers.
  { id: "blob-sw", kind: "blobMid", home: { x: 12.1, y: 29.9, z: 4 }, girth: 1, fightWithin: 3.5, fight: superBlob("blob-sw"), drop: { gear: { slot: "weapon", tier: "heavy", eternal: true } } },
  // In the north tunnel, one in each of the three one-tile nooks before the ladder up to the north chapel.
  { id: "tunnel-1", kind: "waxedHammer", home: { x: 20.5, y: 13.5, z: 4 }, fight: [{ kind: "waxedHammer" }] },
  { id: "tunnel-2", kind: "waxedHammer", home: { x: 19.5, y: 15.5, z: 4 }, fight: [{ kind: "waxedHammer" }] },
  { id: "tunnel-3", kind: "waxedHammer", home: { x: 21.5, y: 15.5, z: 4 }, fight: [{ kind: "waxedHammer" }] },
  // In the dug-out south chapel (the one with the ladder and the hole).
  { id: "south-chapel", kind: "sleepwalkerHammer", home: { x: 28.5, y: 32.5, z: 4 }, fight: [{ kind: "sleepwalkerHammer" }] },
  // Patrols: along the south corridor, from the ledge before the SW hall to the SE hall...
  { id: "patrol-south", kind: "patrolWarden", home: { x: 20.5, y: 28, z: 6 }, fight: [{ kind: "patrolWarden" }], patrol: [{ x: 20.5, y: 28 }, { x: 40.5, y: 28 }] },
  // ...and along the north corridor, from the NW hall up the wax ramp to the NE hall (its floor is on level 8).
  { id: "patrol-north", kind: "patrolWarden", home: { x: 13.5, y: 11, z: 6 }, fight: [{ kind: "patrolWarden" }], patrol: [{ x: 13.5, y: 11 }, { x: 39.5, y: 11 }] },
  // In the wax-filled east chapel (its floor is on level 8), against its east wall.
  { id: "east-1", kind: "sleepwalker", home: { x: 47.5, y: 18.5, z: 8 }, fight: [{ kind: "sleepwalker" }] },
  { id: "east-2", kind: "sleepwalker", home: { x: 47.5, y: 20.5, z: 8 }, fight: [{ kind: "sleepwalker" }] },
  // In the wax-filled NE hall (its floor is on level 8): two waxed.
  { id: "ne-1", kind: "waxed", home: { x: 41.5, y: 9.5, z: 8 }, fight: [{ kind: "waxed" }] },
  { id: "ne-2", kind: "waxed", home: { x: 41.5, y: 11.5, z: 8 }, fight: [{ kind: "waxed" }] },

  // In the Nave: two lit waxed, sealed in wax with their flames burning (they get up again when you rest).
  { id: "nave-lit-1", kind: "waxedLit", home: { x: 29.5, y: 16.5, z: 7 }, fight: [{ kind: "waxedLit" }] },
  { id: "nave-lit-2", kind: "waxedLit", home: { x: 25.5, y: 14.5, z: 7 }, fight: [{ kind: "waxedLit" }] },
  // In the NE hall, between the two waxed.
  { id: "ne-lit", kind: "waxedLit", home: { x: 41.5, y: 10.5, z: 8 }, fight: [{ kind: "waxedLit" }] },

  // Floor B, the Gallery (level 10). Coordinates are plan + 1.
  // The east room: a chisel sleepwalker and two chisel waxed.
  { id: "b-east-sw", kind: "sleepwalker", home: { x: 43.5, y: 19.5, z: 10 }, fight: [{ kind: "sleepwalker" }] },
  { id: "b-east-wx1", kind: "waxedChisel", home: { x: 40.5, y: 17.5, z: 10 }, fight: [{ kind: "waxedChisel" }] },
  { id: "b-east-wx2", kind: "waxedChisel", home: { x: 40.5, y: 21.5, z: 10 }, fight: [{ kind: "waxedChisel" }] },
  // The west bridge: a patrol warden standing in it.
  { id: "b-west-guard", kind: "patrolWarden", home: { x: 22.5, y: 19.5, z: 10 }, post: true, fight: [{ kind: "patrolWarden" }] },
  // The bridge between the north and south rooms: two patrols, each pacing its own half, who meet face to face at the crossing.
  { id: "b-patrol-n", kind: "patrolWarden", home: { x: 27.5, y: 11.5, z: 10 }, fight: [{ kind: "patrolWarden" }], patrol: [{ x: 27.5, y: 11.5 }, { x: 27.5, y: 19 }] },
  { id: "b-patrol-s", kind: "patrolWarden", home: { x: 27.5, y: 27.5, z: 10 }, fight: [{ kind: "patrolWarden" }], patrol: [{ x: 27.5, y: 27.5 }, { x: 27.5, y: 20 }] },
  // The north room: a Wax Blob, hugging its north wall.
  { id: "b-north-blob", kind: "blobMid", home: { x: 27.5, y: 7.05, z: 10 }, girth: 1, fightWithin: 3.5, fight: waxBlob("b-north-blob"), drop: { eternalString: true } },
  // A lit chisel waxed in the middle of the east room and one in the south room.
  { id: "b-east-lit", kind: "waxedChiselLit", home: { x: 40.5, y: 19.5, z: 10 }, fight: [{ kind: "waxedChiselLit" }] },
  { id: "b-south-lit", kind: "waxedChiselLit", home: { x: 27.5, y: 29.5, z: 10 }, fight: [{ kind: "waxedChiselLit" }] },
  // The south room: three chisel waxed.
  { id: "b-south-1", kind: "waxedChisel", home: { x: 25.5, y: 29.5, z: 10 }, fight: [{ kind: "waxedChisel" }] },
  { id: "b-south-2", kind: "waxedChisel", home: { x: 29.5, y: 29.5, z: 10 }, fight: [{ kind: "waxedChisel" }] },
  { id: "b-south-3", kind: "waxedChisel", home: { x: 27.5, y: 31.5, z: 10 }, fight: [{ kind: "waxedChisel" }] },

  // Floor C, the Sanctum (level 13): the Penitent Warden in the middle of the platform, a waxed on three of its edges. None of them ever
  // chases you: the fight and its opening scene begin the moment you step onto the platform. (The fight is Test combat's "warden".)
  {
    id: "warden", kind: "warden", home: { x: 27.5, y: 19.5, z: 13 }, still: true, keepsDead: true,
    // The whole platform (plan tiles 23-29 by 15-21, so world x 24 to 31 and y 16 to 23) except its four corner tiles, where the bridges come
    // in: the fight starts once you have stepped beyond the corner tile (and so can see him), wherever along the rim you go.
    trigger: { x0: 24, y0: 16, x1: 31, y1: 23, z: 13, cut: 1 },
    fight: ENCOUNTERS.find(e => e.id === "warden")!.enemies,
    // In the order of the fight: Waxed A north-west of him, Waxed C (whose flame he takes) south-west, the Warden in the middle, Waxed B
    // south-east: the three waxed on the tiles next to him, all looking toward him.
    spread: [[-1, -1], [-1, 1], [0, 0], [1, 1]],
  },
];

interface FoeTuning {
  /** How close you must be (tiles) for it to notice you, once you can see each other. */
  notice: number;
  /** Speeds, in tiles per second: chasing you, and otherwise ambling about. */
  chase: number;
  walk: number;
  /** How far from home it wanders by itself (0: it doesn't). */
  wander: number;
  /** Seconds it howls when it first notices you, standing still, alerting the others over a wider area (`HOWL_RADIUS`), before it gives chase. */
  howl?: number;
  /** It climbs ladders to follow you (and to get back home). */
  climbs?: boolean;
}

export const FOE_TUNING: Record<KindId, FoeTuning> = {
  waxed: { notice: 3.2, chase: 0.85, walk: 0.6, wander: 0 },
  waxedChisel: { notice: 3.2, chase: 0.85, walk: 0.6, wander: 0 },
  waxedHammer: { notice: 3.2, chase: 0.85, walk: 0.6, wander: 0 },
  // The lit ones are quicker, on their hands and knees.
  waxedLit: { notice: 3.2, chase: 1.4, walk: 0.9, wander: 0 },
  waxedChiselLit: { notice: 3.2, chase: 1.4, walk: 0.9, wander: 0 },
  waxedHammerLit: { notice: 3.2, chase: 1.4, walk: 0.9, wander: 0 },
  // The blob drags itself along, a little faster than the waxed.
  blobLeft: { notice: 4.0, chase: 1.0, walk: 0.6, wander: 0 },
  blobMid: { notice: 4.0, chase: 1.0, walk: 0.6, wander: 0 },
  blobRight: { notice: 4.0, chase: 1.0, walk: 0.6, wander: 0 },
  blobLeftHammer: { notice: 4.0, chase: 1.0, walk: 0.6, wander: 0 },
  blobRightHammer: { notice: 4.0, chase: 1.0, walk: 0.6, wander: 0 },
  sleepwalker: { notice: 4.5, chase: 2.0, walk: 0.8, wander: 1.8, climbs: true },
  // The patrol wardens howl on finding you.
  patrolWarden: { notice: 4.5, chase: 2.0, walk: 0.8, wander: 1.8, howl: 1.4, climbs: true },
  sleepwalkerBare: { notice: 4.5, chase: 2.0, walk: 0.8, wander: 1.8, climbs: true },
  sleepwalkerHammer: { notice: 4.5, chase: 2.0, walk: 0.8, wander: 1.8, climbs: true },
  // He waits in the middle of his arena, and only comes for you once you're well inside it.
  warden: { notice: 3.5, chase: 1.1, walk: 0.7, wander: 0, climbs: true },
  // (Not yet on the map: the guide is to become the tutorial's opponent.)
  guide: { notice: 3.5, chase: 1.2, walk: 0.7, wander: 0, climbs: true },
};

/** How a member of a fight looks on the map, by its kind. */

/**
 * How long a chasing enemy keeps hunting once it loses sight of you, in seconds. Meanwhile it
 * heads for where it last saw you; after this, it gives up and goes home.
 */
export const CHASE_MEMORY = 4;

/**
 * When an enemy notices you, the others within this many tiles (on its level, a straight line, walls or not)
 * join the chase, heading for where you were: a group comes after you together. Small on purpose.
 */
export const ALERT_RADIUS = 4;

/** When a patrol warden howls, everyone within this many tiles (on its level) comes after you too: wider than an ordinary alarm. */
export const HOWL_RADIUS = 7;

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
export const foeFloor = (z: number, x: number, y: number) => tileAt(z, x, y) === FLOOR || tileAt(z, x, y) === DIAG;

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
function clearWalk(z: number, x: number, y: number, gx: number, gy: number, half?: number) {
  const len = Math.hypot(gx - x, gy - y);
  const n = Math.ceil(len / 0.2);
  const rx = (half ?? HALF_W) + 0.05, ry = (half ?? HALF_D) + 0.05;
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
export function waypoint(z: number, x: number, y: number, goal: { x: number; y: number }, steps: Int16Array | null, half?: number) {
  if (!steps || clearWalk(z, x, y, goal.x, goal.y, half)) return goal;
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

/* ---------- Finding the way over the whole map: stairs and ramps included ---------- */

const GW = WORLD.w, GH = WORLD.h, NODES = LEVELS * GW * GH;
/** A place to stand: tile (x, y) of level z, numbered. */
const nodeIdx = (z: number, x: number, y: number) => (z * GH + y) * GW + x;
const nodeOf = (n: number) => { const x = n % GW, r = (n - x) / GW, y = r % GH; return { x, y, z: (r - y) / GH }; };

/** The height of what stands in tile (x, y) of level z at the point (px, py): the floor, a tilted floor, a stair; null where nothing does (or bars shut it). */
function surfaceHeight(z: number, x: number, y: number, px: number, py: number): number | null {
  if (barsAt(z, x, y)) return null;
  const t = tileAt(z, x, y);
  if (t === FLOOR || t === DIAG) { const sl = slopeAt(z, x, y); return sl ? z + slopeRise(sl, px, py) : z; }
  if (t === STAIRS) { const r = rampAt(z, x, y); return r ? rampHeight(z, x, y, r, px, py) : null; }
  return null;
}

/** A flat floor (not a stair or the tilt beside one). */
const flatStand = (z: number, x: number, y: number) => (tileAt(z, x, y) === FLOOR || tileAt(z, x, y) === DIAG) && !slopeAt(z, x, y) && !barsAt(z, x, y);

/** The place to stand that someone at (x, y), `alt` high, is on (the surface nearest to its height), or -1. */
export function nodeAt(x: number, y: number, alt: number): number {
  const tx = Math.floor(x), ty = Math.floor(y), base = Math.floor(alt + 0.01);
  let best = -1, nearest = 0.6;
  for (const z of [base, base - 1]) {
    if (z < 0 || z >= LEVELS) continue;
    const h = surfaceHeight(z, tx, ty, x, y);
    if (h === null) continue;
    const d = Math.abs(h - alt);
    if (d < nearest) { nearest = d; best = nodeIdx(z, tx, ty); }
  }
  return best;
}

const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const edgeMemo = new Map<number, number[]>();

/**
 * The places you can walk to from a place, a tile away: flat floor to flat floor on one level, and (worked out by walking it with the
 * same rules you walk by) onto a stair, up and down it, off its end onto the floor of the level above, and along the diagonal ramps.
 * Worked out when first asked, and kept: the map never changes.
 */
function edgesOf(n: number): number[] {
  const known = edgeMemo.get(n);
  if (known) return known;
  const e: number[] = [];
  const { x, y, z } = nodeOf(n);
  const h0 = surfaceHeight(z, x, y, x + 0.5, y + 0.5);
  if (h0 !== null) for (const [dx, dy] of DIRS4) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
    for (const z2 of [z - 1, z, z + 1]) {
      if (z2 < 0 || z2 >= LEVELS) continue;
      const h1 = surfaceHeight(z2, nx, ny, nx + 0.5, ny + 0.5);
      if (h1 === null) continue;
      if (z2 === z && flatStand(z, x, y) && flatStand(z, nx, ny)) { e.push(nodeIdx(z, nx, ny)); continue; }
      if (Math.abs(h1 - h0) > 1) continue;
      let alt = h0, ok = true;
      for (let k = 1; k <= 10 && ok; k++) {
        const px = x + 0.5 + (dx * k) / 10, py = y + 0.5 + (dy * k) / 10;
        const s = surfaceNear(Math.floor(px), Math.floor(py), px, py, alt);
        if (!s || s.t === LADDER || s.h < alt - STEP_TOLERANCE) ok = false;
        else alt = s.h;
      }
      if (ok && Math.abs(alt - h1) < 0.2) e.push(nodeIdx(z2, nx, ny));
    }
  }
  edgeMemo.set(n, e);
  return e;
}

const stepsMemo3 = new Map<number, Int16Array>();
/** The queue of a search, kept (a search finishes before the next starts). */
const BFS_QUEUE = new Int32Array(NODES);

/** How many tiles each place on the map is from `goal` on foot (stairs included), -1 where there is no way. */
export function stepsToNode(goal: number): Int16Array | null {
  if (goal < 0) return null;
  const known = stepsMemo3.get(goal);
  if (known) return known;
  const steps = new Int16Array(NODES).fill(-1);
  const queue = BFS_QUEUE;
  let head = 0, tail = 0;
  queue[tail++] = goal;
  steps[goal] = 0;
  while (head < tail) {
    const n = queue[head++];
    for (const m of edgesOf(n)) if (steps[m] < 0) { steps[m] = steps[n] + 1; queue[tail++] = m; }
  }
  stepsMemo3.set(goal, steps);
  if (stepsMemo3.size > 12) stepsMemo3.delete(stepsMemo3.keys().next().value!);
  return steps;
}

/**
 * Where someone at (f.x, f.y), f.alt high, should head to reach `goal` (`goalAlt` high): straight there if it is on the same floor and the way is
 * clear, otherwise the middle of the neighbouring tile that is fewest steps from the goal, up and down stairs too.
 */
export function waypoint3(f: { x: number; y: number; alt: number; half?: number }, goal: { x: number; y: number }, goalAlt: number, steps: Int16Array | null) {
  if (!steps) return goal;
  if (Math.abs(goalAlt - f.alt) < 0.3 && clearWalk(Math.round(f.alt), f.x, f.y, goal.x, goal.y, f.half)) return goal;
  const n = nodeAt(f.x, f.y, f.alt);
  if (n < 0 || steps[n] < 0) return goal;
  const { x: tx, y: ty, z } = nodeOf(n);
  let best = -1, bestSteps = steps[n];
  for (const m of edgesOf(n)) if (steps[m] >= 0 && steps[m] < bestSteps) { bestSteps = steps[m]; best = m; }
  // Round a corner on the diagonal, when all three tiles are flat floor.
  if (flatStand(z, tx, ty)) for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    if (!flatStand(z, tx + dx, ty + dy) || !flatStand(z, tx + dx, ty) || !flatStand(z, tx, ty + dy)) continue;
    const m = nodeIdx(z, tx + dx, ty + dy);
    if (steps[m] >= 0 && steps[m] < bestSteps) { bestSteps = steps[m]; best = m; }
  }
  if (best < 0) return goal;
  const b = nodeOf(best);
  return { x: b.x + 0.5, y: b.y + 0.5 };
}

/** Where each member of a group is drawn, relative to the group's position: its own spread, or the usual huddle. */
export const spotsOf = (def: { fight: unknown[]; spread?: [number, number][] }): [number, number][] => def.spread ?? huddle(def.fight.length);

export interface Foe extends Walker {
  /** Step counts toward its home, worked out when first needed. */
  homeSteps: Int16Array | null;
  def: MapFoe;
  /** Where it's ambling to, if anywhere. */
  target: { x: number; y: number } | null;
  /** Seconds left standing still before it moves on. */
  wait: number;
  chasing: boolean;
  /** Seconds since it last saw you, while chasing. */
  lostFor: number;
  /** Where it last saw you, while chasing, with step counts toward that spot. */
  lastSeen: { x: number; y: number; alt: number; steps: Int16Array | null } | null;
  /** Where you were (and how high) the last time it saw you. */
  seenAt: { x: number; y: number; alt: number } | null;
  /** Which way it reaches (a unit vector toward what it is after, even when it cannot get there), and how far it has its arms out (0 to 1): a big body's arms. */
  aimX: number; aimY: number; reach: number;
  /** On a patrol: the point it is walking to, which way along the beat it goes, and whether it is on its beat (not displaced by a chase). */
  leg: number; legDir: 1 | -1; patrolOk: boolean;
  /** Seconds of its howl left (0: not howling). */
  howl: number;
  /** How many strides it has walked (which foot comes down, for the sound of its steps), and whether it was after you a moment ago (so it cries out as it starts). */
  stride: number; wasChasing: boolean;
  /** The ladder it is climbing, and whether it is going up. */
  climb: { ladder: Ladder; up: boolean } | null;
}

/* ---------- Ladders: who may climb them, and finding the way to one ---------- */

/** A ladder: climbed in place at (x, y), from level `bottom` up to level `top`, where you step out onto the floor beyond. */
export interface Ladder {
  x: number; y: number; bottom: number; top: number;
  /** The tile you step onto it from at the bottom (on level `bottom`), and the one you step out onto at the top (on level `top`). */
  foot: { x: number; y: number } | null;
  exit: { x: number; y: number } | null;
}

/** Every ladder on the map. */
export const LADDERS: Ladder[] = (() => {
  const out: Ladder[] = [];
  const floorBeside = (z: number, x: number, y: number, order: number[][]) => {
    for (const [dx, dy] of order) if (foeFloor(z, x + dx, y + dy)) return { x: x + dx, y: y + dy };
    return null;
  };
  for (let z = 0; z < LEVELS; z++) for (let y = 0; y < WORLD.h; y++) for (let x = 0; x < WORLD.w; x++) {
    if (tileAt(z, x, y) !== LADDER || tileAt(z - 1, x, y) === LADDER) continue;
    let hi = z;
    while (tileAt(hi + 1, x, y) === LADDER) hi++;
    out.push({
      x, y, bottom: z, top: hi + 1,
      foot: floorBeside(z, x, y, [[0, 1], [-1, 0], [1, 0]]),
      exit: floorBeside(hi + 1, x, y, [[0, -1], [-1, 0], [1, 0], [0, 1]]),
    });
  }
  return out.filter(l => l.foot && l.exit);
})();

/**
 * Where to go to climb toward (toX, toY), `toAlt` high, from (x, y), `alt` high, when there is no way on foot: the ladder that costs the
 * fewest steps there and back out, or (if none leads all the way) one that brings it nearer the right level. Null if there is none.
 */
export function ladderPlan(x: number, y: number, alt: number, toX: number, toY: number, toAlt: number) {
  const from = stepsToNode(nodeAt(x, y, alt)), to = stepsToNode(nodeAt(toX, toY, toAlt));
  if (!from || !to) return null;
  let best: { ladder: Ladder; up: boolean; at: { x: number; y: number }; level: number; score: number } | null = null;
  for (const l of LADDERS) for (const up of [true, false]) {
    const access = up ? l.foot! : l.exit!, arrive = up ? l.exit! : l.foot!;
    const aLevel = up ? l.bottom : l.top, bLevel = up ? l.top : l.bottom;
    const sa = from[nodeIdx(aLevel, access.x, access.y)];
    if (sa < 0) continue;
    const sb = to[nodeIdx(bLevel, arrive.x, arrive.y)];
    // One that leads on to you is best; otherwise, only one that brings it nearer your level.
    if (sb < 0 && Math.abs(bLevel - toAlt) >= Math.abs(alt - toAlt) - 0.5) continue;
    const score = sb >= 0 ? sa + sb : 1000 + sa + Math.abs(bLevel - toAlt) * 50;
    if (!best || score < best.score) best = { ladder: l, up, at: access, level: aLevel, score };
  }
  return best && { ladder: best.ladder, up: best.up, goal: { x: best.at.x + 0.5, y: best.at.y + 0.5 }, steps: stepsToNode(nodeIdx(best.level, best.at.x, best.at.y)) };
}

/** Where to draw each member of a group of `n`, around the group's position (tiles). */
export const huddle = (n: number): [number, number][] =>
  n <= 1 ? [[0, 0]] : n === 2 ? [[-0.2, -0.1], [0.22, 0.06]] : n === 3 ? [[-0.25, -0.1], [0.25, -0.08], [0, 0.12]]
    // The Warden's fight: him in the middle, a waxed either side, the one whose flame he'll take behind.
    : [[-0.42, 0.14], [0, -0.05], [0.42, 0.14], [0.36, -0.3]];

/** Whether you stand where this enemy will fight you (see `MapFoe.fightWithin`): anywhere, for most. */
export function inFightArea(f: { def: MapFoe }, you: { x: number; y: number; alt: number }) {
  const r = f.def.fightWithin;
  if (r === undefined) return true;
  const { home } = f.def;
  return Math.abs(you.alt - home.z) < 0.5 && Math.abs(you.x - home.x) <= r && Math.abs(you.y - home.y) <= r;
}
