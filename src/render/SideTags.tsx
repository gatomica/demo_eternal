/**
 * SideTags.tsx — small R / L labels on a figure's hands and feet, for the Model viewer's Model stance, so
 * textures can be put on the right limb whichever way the figure faces.
 */
import type { Side } from "../core/types";
import type { Pt } from "./geom";
import type { Skeleton } from "./poses";
import { sided } from "./rig";

const TAG: Record<Side, { letter: string; fill: string }> = {
  right: { letter: "R", fill: "#e0782f" },
  left: { letter: "L", fill: "#5fb0e0" },
};

/**
 * `s`: the skeleton as drawn. `flip`: the enclosing group is mirrored (an enemy seen at 3/4 from the front),
 * so each letter is flipped back and never reads in reverse.
 */
export function SideTags({ s, hand, flip }: { s: Skeleton; hand: Side; flip: boolean }) {
  const limbs = sided(s, hand);
  const tag = (side: Side, at: Pt, key: string) => (
    <text
      key={key}
      transform={`translate(${at[0]} ${at[1]})${flip ? " scale(-1 1)" : ""}`}
      textAnchor="middle"
      fontSize={7}
      fontWeight={700}
      fontFamily="sans-serif"
      fill={TAG[side].fill}
      stroke="#15141b"
      strokeWidth={1.4}
      paintOrder="stroke"
    >
      {TAG[side].letter}
    </text>
  );
  // Feet can stand almost on top of each other (the 3/4 views): each tag steps away from the other foot.
  const footTag = (side: Side) => {
    const [foot, other] = [limbs[side].leg.foot, limbs[side === "right" ? "left" : "right"].leg.foot];
    const away = Math.sign(foot[0] - other[0]) || (side === "right" ? -1 : 1);
    return tag(side, [foot[0] + away * 4.5, foot[1] + 6], `${side}-foot`);
  };
  return (
    <g pointerEvents="none">
      {(["right", "left"] as Side[]).flatMap(side => [
        tag(side, [limbs[side].arm.hand[0], limbs[side].arm.hand[1] - 6], `${side}-hand`),
        footTag(side),
      ])}
    </g>
  );
}
