/**
 * sleepwalker.ts — the Depraved Sleepwalker, the standard enemy: a hunched, desperate wretch
 * dragging a weapon too heavy for it. It only ever shows a stance, never its action: Idle, Charging,
 * Shoulder In, Arms Overhead or Struggling, and its distance and what it last did decide what it does from there.
 */
import type { EnemyKind } from "../bestiary";
import { parsePattern } from "../patterns";

/**
 * The Sleepwalker's pattern. Its overhead (from Arms Overhead) is its weapon's skill where the weapon has one, by the skill's own rules as yours is,
 * paid with its Eternity: the Broken Shortsword's **Chisel** (only at you while you are Waxed) and the Brick Hammer's **Knockback**, each with its
 * Parry to fall back on. Bare-handed, the Overhead Strike. The Patrol Warden's Waxed Torch: **Usurp Flame** comes first in Charging, which it takes
 * whenever there is a flame to take (yours, staggered while Waxed, or a waxed ally's, cradling it), and its Flaming torch's **Flame Blast** first in
 * Arms Overhead, the Overhead Strike after it.
 */
function sleepwalkerPattern(name: string, weapon: "bare" | "chisel" | "hammer" | "torch") {
  const skill = weapon === "chisel" ? "      Chisel:          attack, skill chisel        // its Broken Shortsword's skill"
    : weapon === "hammer" ? "      Knockback:       attack, skill knockback     // its Brick Hammer's skill"
    : weapon === "torch" ? [
      "      Usurp Flame:     attack, skill usurp         // its Waxed Torch's skill",
      "      Flame Blast:     attack, skill flameblast, *Flaming, #fire   // the Flaming torch's",
    ].join("\n")
    : "";
  const overhead = weapon === "chisel" ? "Chisel, Parry" : weapon === "hammer" ? "Knockback, Parry" : weapon === "torch" ? "Flame Blast, Overhead Strike" : "Overhead Strike";
  // (the torch's tell: with a flame to take, it always takes Charging, Usurp Flame first)
  const charging = weapon === "torch" ? "(*Usurpable, *!Flaming) / Chase, Swing Right, !Parry > Charging > Usurp Flame, Chase, Swing Left" : "Chase, Swing Right, !Parry > Charging > Chase, Swing Left";
  return parsePattern(name, `
    actions:
      Swing Left:      attack, *Close        // whatever weapon it carries
      Swing Right:     attack, *Close
      ${weapon === "chisel" || weapon === "hammer" ? "" : "Overhead Strike: attack"}
${skill}
      Parry:           block, *Close
      Chase:           maneuver, advance, *Far
      Retreat:         maneuver, retreat, *Close
      Despair:         rest
    stances:
      Recover, !Parry                         > Idle          > Chase, Retreat
      ${charging}
      Swing Left, Retreat                     > Shoulder In   > Swing Right, Parry
      Swing Left, Swing Right, Parry, Retreat > Arms Overhead > ${overhead}
      Recover, Retreat, Parry                 > Struggling    > Despair
  `);
}

/** The overhead's poses: the Overhead Strike's leap and landing, which Knockback and Flame Blast keep. */
const OVERHEAD_POSES = { act: "sw-overhead-leap", strike: "sw-overhead-strike" };

export const SLEEPWALKER: EnemyKind = {
  name: "Depraved Sleepwalker",
  maxHP: 8,
  weapon: "light", // the Broken Shortsword (its effect and all)
  armor: "none", // none for now; some may wear armor later
  // In a fight it is drawn in 3D (its variants too); on the map, still the flat figure.
  figure3d: "sleepwalker",
  // On the map it gets up again when you rest by a keeper.
  respawns: true,
  pattern: sleepwalkerPattern("Depraved Sleepwalker", "chisel"),
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
    // Chisel (the Broken Shortsword's skill): the overhead with the blade in a reverse grip, as you make it (your `p3-chisel-up` into `p3-chisel`).
    Chisel: { act: "p3-chisel-up", strike: "p3-chisel" },
    Parry: { act: "sw-shoulder-in", guard: "sw-parry", windup: "sw-brace" },
    Chase: { act: "sw-charge" },
    Retreat: { act: "sw-backstep" },
    Despair: { act: "sw-despair", rest: "sw-despair", windup: "sw-windup" },
  },
};

/** The Sleepwalker's action poses, but for the Chisel: its overhead is `overhead`, drawn as named. */
const posesWith = (overhead: Record<string, { act: string; strike: string; projectile?: "impact" }>): NonNullable<EnemyKind["actionPoses"]> => {
  const { Chisel: _chisel, ...rest } = SLEEPWALKER.actionPoses!;
  return { ...rest, ...overhead };
};

/**
 * Sleepwalkers with another weapon: the same wretch, the same stances; its overhead is the weapon's skill, if it has one (see `sleepwalkerPattern`).
 * Every enemy's weapon is as yours: its skills paid with Eternity, which an enemy never runs out of. Beaten, it drops the ordinary weapon.
 */
const armedSleepwalker = (name: string, weapon: EnemyKind["weapon"], more: Partial<EnemyKind> = {}): EnemyKind => ({ ...SLEEPWALKER, name, weapon, ...more });

/** The ones found on the map unless said otherwise: the same wretch, bare-handed (a baseline weapon, no skill, nothing to drop): the Overhead Strike. */
export const SLEEPWALKER_BARE = armedSleepwalker("Depraved Sleepwalker", "baseline", {
  pattern: sleepwalkerPattern("Depraved Sleepwalker", "bare"),
  actionPoses: posesWith({ "Overhead Strike": OVERHEAD_POSES }),
});

/** A select few carry a Brick Hammer: its overhead is Knockback (the Overhead Strike's leap and landing). */
export const SLEEPWALKER_HAMMER = armedSleepwalker("Hammer Sleepwalker", "heavy", {
  pattern: sleepwalkerPattern("Hammer Sleepwalker", "hammer"),
  actionPoses: posesWith({ Knockback: OVERHEAD_POSES }),
});

/**
 * The patrol wardens: sleepwalkers who walk the wardens' rounds, carrying the Waxed Torch and
 * wearing the Penitent Warden's pointed hood, though no wax beak and no cloak. Otherwise a sleepwalker, but for its torch's skills: Usurp Flame
 * (drawn as yours: a Stab's wind-up, landing with the torch raised high, `p3-stab-up` into `p3-hook-up`), which lights the torch (`flaming`), and
 * the Flaming torch's Flame Blast (the Overhead Strike's leap and landing, its fire bursting out where it lands), which puts it out. It picks after
 * the others, to see which waxed is about to cradle its flame.
 */
export const PATROL_WARDEN = armedSleepwalker("Patrol Warden", "normal", {
  hood: true,
  maxHP: 10,
  pattern: sleepwalkerPattern("Patrol Warden", "torch"),
  flags: { flaming: false },
  statuses: [{ key: "flaming", off: "Torch unlit", on: "Flaming torch" }],
  decidesLast: true,
  actionPoses: posesWith({
    "Overhead Strike": OVERHEAD_POSES,
    "Usurp Flame": { act: "p3-stab-up", strike: "p3-hook-up" },
    "Flame Blast": { ...OVERHEAD_POSES, projectile: "impact" },
  }),
});
