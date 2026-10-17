/**
 * sleepwalker.ts — the Depraved Sleepwalker, the standard enemy. It only ever shows a stance,
 * never its action: Ready, Intimidating or Cautious, each covering a few actions. (Action names
 * are placeholders.)
 */
import type { EnemyKind } from "../bestiary";
import { parsePattern } from "../patterns";

export const SLEEPWALKER: EnemyKind = {
  name: "Depraved Sleepwalker",
  maxHP: 20,
  weapon: "normal",
  armor: "light",
  pattern: parsePattern("Depraved Sleepwalker", `
    actions:
      Slash:        attack
      Parry:        block
      Step:         maneuver, by-line
      Catch Breath: rest
    stances:
      All > Ready        > Slash / Parry, Step
      All > Intimidating > Slash / Catch Breath
      All > Cautious     > Catch Breath / Parry, Step
  `),
  stancePoses: { Ready: "ready", Intimidating: "intimidating", Cautious: "cautious" },
};
