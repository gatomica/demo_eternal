/**
 * look.ts — what the Warden's look draws differently: his own figure, his candle arm, and the
 * hand his stolen flames stream into.
 */
import { createElement } from "react";
import type { VariantLook } from "../render/looks";
import { WARDEN_POSES, type WardenSkeleton } from "./skeleton";
import { WardenFigure } from "./WardenFigure";

export const WARDEN_LOOK: VariantLook = {
  figure: {
    owns: s => "ball" in s,
    shadow: { rx: 28, ry: 3.2 },
    draw: ({ s, front, straight, sides, arm, lingerFrom, smokeAgo, phase2Look, flailFire }) =>
      createElement(WardenFigure, { s: s as WardenSkeleton, front, straight, sides, arm: arm ?? "lit", lingerFrom, smokeAgo, phase2Look, flailFire }),
  },
  candleArm: true,
  igniteScene: true,
  flameHand: WARDEN_POSES["wd-idle"].freeArm.hand,
  // His candle is a little smaller than a held flame.
  loneFlame: 0.12,
};
