/**
 * blob.ts — the Wax Blob: a heap of wax with three people sealed in it, their upper bodies
 * rising out of it. It is one enemy with three targets. Each part (left, middle, right) is an
 * enemy of its own, with its own stance and action every turn, picked from the Waxed's pattern;
 * but the three share one pool of Health and Fatigue and one place on the field (see `Enemy.body`
 * and core/resolve). Blocking stays each part's own. The pool is as much Health as the player's.
 *
 * Each part is a Waxed (its pattern, poses and 3D figure), always sealed whole in wax. The middle one has the whole of the
 * Waxed's pattern (its Maneuvers move the whole heap) and stands at the heap's edge nearest you; the sides have all of it but
 * the flame (no Cradle Flame, so no Clutch Flame or Flame Immolation): they never rest on their own, and their Maneuvers only dodge.
 *
 * The super Wax Blob: the same, but its two side parts wield Brick Hammers (as the Hammer
 * Waxed does: in the free hand, Hurl Wax still thrown with the other). The middle one is unarmed.
 */
import type { BodyDef, EnemyKind } from "../bestiary";
import { WAXED, waxedPattern } from "./waxed";

/** The whole body's Health: as much as the player's (20). */
const BLOB_HP = 15;

/** The stances and actions that go with the flame, which the side parts do not have. */
const FLAME_STANCE = "Cradle Flame";
const FLAME_ACTIONS = ["Clutch Flame", "Flame Immolation"];

const without = <T,>(poses: Record<string, T> | undefined, names: string[]) =>
  Object.fromEntries(Object.entries(poses ?? {}).filter(([k]) => !names.includes(k))) as Record<string, T>;

/** What every part is, besides the Waxed it is: sealed in the heap, sharing its Health, never splashing the others. */
const PART = {
  maxHP: BLOB_HP,
  // The blob's parts never splash each other, whatever they burn with.
  shockwave: () => false,
} satisfies Partial<EnemyKind>;

/** The middle one: a whole Waxed (its full pattern, Cradle Flame and all), drawn in 3D, sealed in the wax. It stands nearest you, at the heap's edge. */
export const BLOB_MID: EnemyKind = {
  ...WAXED,
  ...PART,
  name: "Wax Blob (middle)",
  pattern: waxedPattern("Wax Blob (middle)", false),
};

/**
 * A side one: the Waxed without its flame (no Cradle Flame, and so no Clutch Flame or Flame Immolation). With `hammer`, it wields a
 * Brick Hammer, as the Hammer Waxed does (its Low and Overhead Attacks are blows of it; the super blob's).
 */
function side(name: string, hammer = false): EnemyKind {
  return {
    ...WAXED,
    ...PART,
    name,
    weapon: hammer ? "heavy" : WAXED.weapon,
    flags: undefined,
    statuses: undefined,
    afterTurn: undefined,
    flame: undefined,
    blazePoses: undefined,
    fatalActions: undefined,
    pattern: waxedPattern(name, hammer, false),
    stancePoses: without(WAXED.stancePoses, [FLAME_STANCE]),
    actionPoses: without(WAXED.actionPoses, FLAME_ACTIONS),
  };
}

export const BLOB_LEFT: EnemyKind = side("Wax Blob (left)");
export const BLOB_RIGHT: EnemyKind = side("Wax Blob (right)");

export const BLOB_LEFT_HAMMER: EnemyKind = side("Super Wax Blob (left)", true);
export const BLOB_RIGHT_HAMMER: EnemyKind = side("Super Wax Blob (right)", true);

/** The Wax Blob as one enemy: its three parts, left to right (for fights and for the Model viewer). */
export const BLOB_BODY: BodyDef = {
  name: "Wax Blob",
  parts: [
    { kind: "blobLeft", part: "left", label: "Blob, left" },
    { kind: "blobMid", part: "mid", label: "Blob, middle" },
    { kind: "blobRight", part: "right", label: "Blob, right" },
  ],
};

/** The super Wax Blob: the sides wield Brick Hammers; the middle one is the Wax Blob's own. */
export const SUPER_BLOB_BODY: BodyDef = {
  name: "Super Wax Blob",
  parts: [
    { kind: "blobLeftHammer", part: "left", label: "Super blob, left" },
    { kind: "blobMid", part: "mid", label: "Super blob, middle" },
    { kind: "blobRightHammer", part: "right", label: "Super blob, right" },
  ],
};
