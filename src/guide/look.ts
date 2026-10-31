/**
 * look.ts — what the guide's look draws differently: its own figure, in its own poses.
 */
import { createElement } from "react";
import type { VariantLook } from "../render/looks";
import { GuideFigure } from "./GuideFigure";
import type { GuideSkeleton } from "./poses";

export const GUIDE_LOOK: VariantLook = {
  figure: {
    owns: s => "guide" in s,
    shadow: { rx: 22, ry: 3 },
    draw: ({ s, front, straight }) => createElement(GuideFigure, { s: s as GuideSkeleton, front, straight }),
  },
};
