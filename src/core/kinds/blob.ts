/**
 * blob.ts — the Wax Blob: a heap of wax with three people sealed in it, their upper bodies
 * rising out of it. It is one enemy with three targets. Each part (left, middle, right) is an
 * enemy of its own, with its own stance and action every turn, picked from the Waxed's pattern;
 * but the three share one pool of Health and Fatigue and one place on the field (see `Enemy.body`
 * and core/resolve). Blocking stays each part's own. The pool is as much Health as the player's.
 *
 * What differs from the Waxed: no Crawling stance (Drag Forward, Slither Back: the Dodge), so it
 * never moves or dodges; and only the middle one can cradle a flame (Cradle Flame, with Clutch Flame,
 * its Rest, and Flame Immolation). The sides never rest on their own.
 *
 * The super Wax Blob: the same, but its two side parts wield Brick Hammers (as the Hammer
 * Waxed does: in the free hand, Hurl Wax still thrown with the other). The middle one is unarmed.
 */
import type { BodyDef, EnemyKind } from "../bestiary";
import { parsePattern } from "../patterns";
import { WAXED } from "./waxed";

/** The whole body's Health: as much as the player's (20). */
const BLOB_HP = 20;

/** Its actions, with its clawing attack: the Waxed's Scratch, or a blow of the weapon it wields. */
const actions = (claw = "Scratch:      attack, baseline, damage 2, cost 2   // as the Waxed's") => `
    actions:
      ${claw}
      Hurl Wax:     attack, light, ranged
      Brace:        block, baseline`;

const FLAME_ACTIONS = `
      Clutch Flame: rest
      Flame Immolation: attack, heavy, ranged, *Lit, #fire, #shockwave   // a lit one bursts: it dies, and its fire hits everyone`;

const stances = (claw = "Scratch") => `
    stances:
      All > Hands Raised      > ${claw}
      All > Wax on Hand       > Hurl Wax
      All > Cowering Sideways > Brace`;

const FLAME_STANCE = `
      All > Cradle Flame      > Flame Immolation, Clutch Flame`;

/** The poses of what the blob's parts do not have: the Dodge, and (for the sides) the flame. */
const DODGE = ["Drag Forward", "Slither Back"];
const FLAME = ["Clutch Flame", "Flame Immolation"];

/** Keeps only the poses of the stances and actions a part has. */
const without = <T,>(poses: Record<string, T> | undefined, names: string[]) =>
  Object.fromEntries(Object.entries(poses ?? {}).filter(([k]) => !names.includes(k))) as Record<string, T>;

/** The middle one: the Waxed without the Dodge, flame and all. */
export const BLOB_MID: EnemyKind = {
  ...WAXED,
  name: "Wax Blob (middle)",
  maxHP: BLOB_HP,
  // The blob's parts never splash each other, whatever they burn with.
  shockwave: () => false,
  pattern: parsePattern("Wax Blob (middle)", `${actions()}${FLAME_ACTIONS}${stances()}${FLAME_STANCE}`),
  stancePoses: without(WAXED.stancePoses, ["Crawling"]),
  actionPoses: without(WAXED.actionPoses, DODGE),
};

/**
 * A side one: also without its flame (no Cradle Flame, and so no Clutch Flame or Flame Immolation). With
 * `hammer`, it wields a Brick Hammer, and its Scratch is a Hammer Blow (the super blob's).
 */
function side(name: string, hammer = false): EnemyKind {
  const kind: EnemyKind = {
    ...WAXED,
    name,
    maxHP: BLOB_HP,
    flags: undefined,
    statuses: undefined,
    afterTurn: undefined,
    flame: undefined,
    shockwave: () => false,
    pattern: parsePattern(name, `${actions()}${stances()}`),
    stancePoses: without(WAXED.stancePoses, ["Crawling", "Cradle Flame"]),
    actionPoses: without(WAXED.actionPoses, [...DODGE, ...FLAME]),
  };
  if (!hammer) return kind;
  const { Scratch, ...rest } = kind.actionPoses!;
  return {
    ...kind,
    weapon: "heavy",
    pattern: parsePattern(name, `${actions("Hammer Blow: attack   // a blow of its hammer, in its free hand")}${stances("Hammer Blow")}`),
    actionPoses: { ...rest, "Hammer Blow": Scratch },
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
