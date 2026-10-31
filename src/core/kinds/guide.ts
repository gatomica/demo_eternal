/**
 * guide.ts — the guide, who is to be the tutorial's opponent. A small figure in a pointed navy
 * cloak that doubles as a hat, with a glowing yarn orb hanging in front of it on a black string:
 * no hands, so it fights with the orb. Drawn in guide/.
 *
 * The pattern below is a placeholder to give the figure something to do. The tutorial fight does not use it: it
 * follows a script (the "tutorial" encounter in encounters.ts: Hum, Hum, Halo Blast, Halo Blast) under the lesson in combat/lesson.ts.
 */
import type { EnemyKind } from "../bestiary";
import { parsePattern } from "../patterns";

export const GUIDE_KIND: EnemyKind = {
  name: "The Guide",
  maxHP: 20,
  weapon: "baseline",
  armor: "none",
  variant: "guide",
  // Placeholder pattern: a quiet stance that hums, one that swings the orb, one that draws the cloak tight, and a drift.
  pattern: parsePattern("The Guide", `
    actions:
      Swing Orb:    attack, baseline
      Halo Blast:   attack, light, ranged
      Cloak Tight:  block, baseline
      Shuffle In:   maneuver, advance, *Far
      Shuffle Back: maneuver, retreat, *Close
      Hum:          rest
    stances:
      All > Waiting     > Hum
      All > Orb Back    > Swing Orb
      All > Pulled Tight > Cloak Tight
      All > Orb Hovering > Halo Blast
      All > Drifting    > Shuffle In, Shuffle Back
  `),
  stancePoses: {
    Waiting: "gd-idle",
    "Orb Back": "gd-orb-back",
    "Pulled Tight": "gd-tight",
    "Orb Hovering": "gd-hover",
    Drifting: "gd-drift",
  },
  idlePose: "gd-idle",
  downPose: "gd-down",
  flinchPose: "gd-flinch",
  modelPoses: { front: "gd-t", back: "gd-t-b" },
  actionPoses: {
    "Swing Orb": { act: "gd-orb-back", strike: "gd-swing" },
    "Halo Blast": { act: "gd-hover", strike: "gd-halo", projectile: "halo" },
    "Cloak Tight": { act: "gd-tight" },
    "Shuffle In": { act: "gd-shuffle" },
    "Shuffle Back": { act: "gd-shuffle" },
    Hum: { act: "gd-hum", rest: "gd-hum" },
  },
  deathLook: "guide",
};
