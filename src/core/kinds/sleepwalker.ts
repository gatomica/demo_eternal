/**
 * sleepwalker.ts — the Depraved Sleepwalker, the standard enemy: a hunched, desperate wretch
 * dragging a weapon too heavy for it. It only ever shows a stance, never its action: Charging,
 * Struggling or Guarded, and its distance and exhaustion decide what it does from there.
 */
import type { EnemyKind } from "../bestiary";
import { parsePattern } from "../patterns";

export const SLEEPWALKER: EnemyKind = {
  name: "Depraved Sleepwalker",
  maxHP: 20,
  weapon: "normal",
  armor: "none", // none for now; some may wear armor later
  // On the map it gets up again when you rest by a keeper.
  respawns: true,
  pattern: parsePattern("Depraved Sleepwalker", `
    actions:
      Weapon Strike: attack                  // whatever weapon it carries
      Parry:         block, *Close
      Charge:        maneuver, advance, *Far
      Backstep:      maneuver, retreat, *Close
      Despair:       rest
    stances:
      All > Charging   > Charge, Weapon Strike
      All > Struggling > Backstep, Despair
      All > Guarded    > Parry, Weapon Strike
  `),
  // The Guarded stance is the guarded pose itself; the Parry's own pose (`sw-parry`) is only the one it takes as a
  // blow lands on it (its action's `guard` below).
  stancePoses: { Charging: "sw-charging", Struggling: "sw-struggling", Guarded: "sw-guarded" },
  idlePose: "sw-idle",
  // Staggered: on his knees, dejected, looking down.
  downPose: "sw-down",
  // A Rest broken by a blow: its windup recoiling from the hit.
  flinchPose: "sw-flinch",
  actionPoses: {
    "Weapon Strike": { act: "sw-overhead", strike: "sw-chop" },
    Parry: { act: "sw-guarded", guard: "sw-parry", windup: "sw-brace" },
    Charge: { act: "sw-charge" },
    Backstep: { act: "sw-backstep" },
    Despair: { act: "sw-despair", rest: "sw-despair", windup: "sw-windup" },
  },
};
