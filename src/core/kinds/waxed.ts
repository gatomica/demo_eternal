/**
 * waxed.ts — the Waxed, the weakest enemy: a sleepwalker the wardens tried to soothe back to
 * sleep. It kneels, shins bound together in wax, head encased in it. No weapon, no armor. Fully
 * telegraphed: every stance leads to one kind of action.
 */
import type { EnemyKind } from "../bestiary";
import { parsePattern } from "../patterns";

export const WAXED: EnemyKind = {
  name: "Waxed",
  maxHP: 12,
  weapon: "baseline",
  armor: "none",
  variant: "waxed",
  pattern: parsePattern("Waxed", `
    actions:
      Scratch:      attack, baseline
      Hurl Wax:     attack, light, ranged
      Brace:        block, baseline
      Drag Forward: maneuver, advance
      Slither Back: maneuver, retreat
      Clutch Flame: rest
    stances:
      All > Hands Raised      > Scratch
      All > Wax on Hand       > Hurl Wax
      All > Cowering Sideways > Brace
      All > Crawling          > Drag Forward, Slither Back
      All > Cradle Flame      > Clutch Flame
  `),
  stancePoses: {
    "Hands Raised": "w-hands",
    "Wax on Hand": "w-wax-hand",
    "Cowering Sideways": "w-cower",
    Crawling: "w-crawl",
    "Cradle Flame": "w-cradle",
  },
  idlePose: "w-idle",
  downPose: "w-fallen",
  flinchPose: "w-flinch",
  actionPoses: {
    Scratch: { act: "w-hands", strike: "w-scratch" },
    "Hurl Wax": { act: "w-wax-hand", strike: "w-hurl", projectile: "wax" },
    Brace: { act: "w-cower" },
    "Drag Forward": { act: "w-crawl" },
    "Slither Back": { act: "w-slither" },
    "Clutch Flame": { act: "w-clutch" },
  },
  // It still holds a flame of its own, cradled at its chest.
  flame: { stance: "Cradle Flame", action: "Clutch Flame" },
  // Where it falls, it stays: faded, for the rest of the fight.
  remains: true,
};
