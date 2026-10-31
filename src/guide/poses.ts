/**
 * poses.ts — the guide's poses. The guide has no limbs to pose: a pointed navy cloak that doubles
 * as a hat, a glowing yarn orb hanging in front of it on a black string, and bare feet under the
 * hem. So a pose is a few numbers (how the cloak leans, how the orb swings...) on top of a plain
 * skeleton that the rest of the game can still ask for a head, a flame spot and so on.
 */
import type { Skeleton } from "../render/poses";

/** How the guide's figure is shaped in a pose. */
export interface GuideParams {
  /** The whole cloak tilted about its hem, in degrees (positive: forward, the way it faces). */
  lean: number;
  /** The orb's string from straight down, in degrees (positive: swung forward). */
  swing: number;
  /** Extra string paid out, in figure units: the orb flung out on it. */
  reach: number;
  /** 1 as usual; under 1 the cloak slumps shorter, over 1 it stretches. */
  squash: number;
  /** 1 as usual; under 1 the cloak is pulled tight and narrow, over 1 it spreads. */
  narrow: number;
  /** 0: the orb hangs on its full string; 1: pulled right up into the opening. */
  tuck: number;
  /** 1 as usual: how brightly the orb glows. */
  glow: number;
  /** The tip of the hat curls back this much, in figure units. */
  curl: number;
  /** The hem hitched up this much, in figure units (the bare feet show more). */
  lift: number;
}

export interface GuideSkeleton extends Skeleton {
  guide: GuideParams;
}

export type GuidePoseName =
  | "gd-idle" | "gd-hover" | "gd-halo" | "gd-drift" | "gd-orb-back" | "gd-swing" | "gd-tight" | "gd-hum" | "gd-shuffle"
  | "gd-down" | "gd-flinch" | "gd-t" | "gd-t-b";

const USUAL: GuideParams = { lean: 0, swing: 0, reach: 0, squash: 1, narrow: 1, tuck: 0, glow: 1, curl: 2, lift: 0 };

/** A plain skeleton (standing, arms at its sides, none of it drawn), carrying the pose's shape. */
const pose = (g: Partial<GuideParams>): GuideSkeleton => ({
  head: [50, 58], neck: [50, 66], hip: [50, 92],
  weaponArm: { elbow: [50, 80], hand: [50, 92] },
  freeArm: { elbow: [50, 80], hand: [50, 92] },
  leadLeg: { knee: [47, 102], foot: [45, 114] },
  rearLeg: { knee: [53, 102], foot: [56, 114] },
  weapon: { at: [50, 78], angle: 0 },
  guide: { ...USUAL, ...g },
});

/** The poses as written. */
export const GUIDE_POSES: Record<GuidePoseName, GuideSkeleton> = {
  // Standing quietly, the orb hanging still.
  "gd-idle": pose({}),
  // Halo Blast, gathering: the orb floats up off its string, which goes slack, glowing brighter.
  "gd-hover": pose({ lean: -2, tuck: 0.45, glow: 1.55, lift: 0.6 }),
  // Halo Blast, as it is released: the cloak leans in, the orb thrown out on a taut string, flaring.
  "gd-halo": pose({ lean: 7, swing: 40, reach: 9, glow: 2, curl: 1 }),
  // A slow drift, the cloak leaning into it and the orb trailing.
  "gd-drift": pose({ lean: 4, swing: 10, lift: 1 }),
  // Orb Back: leaning away, the orb drawn up and back on its string, the tip of the hat curled.
  "gd-orb-back": pose({ lean: -7, swing: -58, reach: 2, curl: 5 }),
  // Swing Orb, as it lands: the whole cloak thrown forward, the orb flung out on a taut string.
  "gd-swing": pose({ lean: 14, swing: 78, reach: 13, curl: -2 }),
  // Cloak Tight: drawn narrow around itself, the orb pulled up into the opening, dimmed.
  "gd-tight": pose({ narrow: 0.84, squash: 1.03, tuck: 0.75, glow: 0.75 }),
  // Humming: swaying back a little, the orb glowing brighter.
  "gd-hum": pose({ lean: -3, swing: 6, glow: 1.5, squash: 1.02 }),
  // Shuffling along: leaning into it, the hem hitched, the bare feet showing.
  "gd-shuffle": pose({ lean: 9, swing: 18, lift: 3 }),
  // Staggered: slumped, folded over itself, the orb swung out on the ground and dim.
  "gd-down": pose({ lean: 28, swing: 62, reach: 2, squash: 0.62, narrow: 1.12, glow: 0.35, curl: 9, tuck: 0.15 }),
  // A Rest broken by a blow: thrown back, the orb jerked up high and flaring.
  "gd-flinch": pose({ lean: -16, swing: -36, glow: 1.7, curl: 7 }),
  // The Model stance (front and back): standing straight.
  "gd-t": pose({ curl: 0 }),
  "gd-t-b": pose({ curl: 0 }),
};
