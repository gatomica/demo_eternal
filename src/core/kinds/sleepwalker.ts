/**
 * sleepwalker.ts — the Depraved Sleepwalker, the standard enemy: a hunched, desperate wretch
 * dragging a weapon too heavy for it. It only ever shows a stance, never its action: Idle, Charging,
 * Shoulder In, Arms Overhead or Struggling, and its distance and what it last did decide what it does from there.
 */
import type { EnemyKind } from "../bestiary";
import { parsePattern } from "../patterns";

export const SLEEPWALKER: EnemyKind = {
  name: "Depraved Sleepwalker",
  maxHP: 8,
  weapon: "light", // the Jagged Chisel (its effect and all)
  armor: "none", // none for now; some may wear armor later
  // In a fight it is drawn in 3D (its variants too); on the map, still the flat figure.
  figure3d: "sleepwalker",
  // On the map it gets up again when you rest by a keeper.
  respawns: true,
  pattern: parsePattern("Depraved Sleepwalker", `
    actions:
      Swing Left:      attack, *Close        // whatever weapon it carries
      Swing Right:     attack, *Close
      Overhead Strike: attack
      Parry:           block, *Close
      Chase:           maneuver, advance, *Far
      Retreat:         maneuver, retreat, *Close
      Despair:         rest
    stances:
      Recover, !Parry                > Idle          > Chase, Retreat
      Chase, Swing Right, !Parry     > Charging      > Chase, Swing Left
      Swing Left                     > Shoulder In   > Swing Right, Parry
      Swing Left, Swing Right, Parry > Arms Overhead > Overhead Strike
      Recover, Retreat, Parry        > Struggling    > Despair
  `),
  // Each swing ends turned the way it swings, into the stance that is turned that way: Swing Left into Shoulder In (turned to its left, the right
  // shoulder presented), Swing Right into Charging (turned to its right). The Parry's own pose (`sw-parry`) is only the one it takes as a blow lands
  // on it (its action's `guard` below).
  stancePoses: { Idle: "sw-idle", Charging: "sw-charging", "Shoulder In": "sw-shoulder-in", "Arms Overhead": "sw-overhead", Struggling: "sw-struggling" },
  idlePose: "sw-idle",
  // Staggered: on his knees, dejected, looking down.
  downPose: "sw-down",
  // A Rest broken by a blow: its windup recoiling from the hit.
  flinchPose: "sw-flinch",
  actionPoses: {
    "Swing Left": { act: "sw-swing-l-windup", strike: "sw-swing-l" },
    "Swing Right": { act: "sw-swing-r-windup", strike: "sw-swing-r" },
    "Overhead Strike": { act: "sw-overhead-leap", strike: "sw-overhead-strike" },
    Parry: { act: "sw-shoulder-in", guard: "sw-parry", windup: "sw-brace" },
    Chase: { act: "sw-charge" },
    Retreat: { act: "sw-backstep" },
    Despair: { act: "sw-despair", rest: "sw-despair", windup: "sw-windup" },
  },
};

/**
 * Sleepwalkers with another weapon: the same wretch, the same stances. (Every enemy's weapon carries its
 * effect, free for it: enemies have no Eternity to pay with. Beaten, it drops the ordinary weapon.)
 */
const armedSleepwalker = (name: string, weapon: EnemyKind["weapon"], more: Partial<EnemyKind> = {}): EnemyKind => ({ ...SLEEPWALKER, name, weapon, ...more });

/** The ones found on the map unless said otherwise: the same wretch, bare-handed (a baseline weapon, no effect, nothing to drop). */
export const SLEEPWALKER_BARE = armedSleepwalker("Depraved Sleepwalker", "baseline");

/** A select few carry a Brick Hammer. */
export const SLEEPWALKER_HAMMER = armedSleepwalker("Hammer Sleepwalker", "heavy");

/**
 * The patrol wardens: sleepwalkers who walk the wardens' rounds, carrying the Waxed Torch and
 * wearing the Penitent Warden's pointed hood, though no wax beak and no cloak. Otherwise a sleepwalker.
 */
export const PATROL_WARDEN = armedSleepwalker("Patrol Warden", "normal", { hood: true, maxHP: 10 });
