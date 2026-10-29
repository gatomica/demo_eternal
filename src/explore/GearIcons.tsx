/**
 * GearIcons.tsx — the inventory's pictures of gear. An empty place shows a flat, simple, faded
 * icon (a sword, a chestplate). Gear shows its real sprite from combat: the weapon exactly as it is
 * drawn in the hand of a figure, and the armor as it is drawn on the player's torso.
 */
import type { ArmorTier, WeaponTier } from "../core/types";
import type { Slot } from "./gear";
import { StickFigure, Weapon } from "../render/StickFigure";

/** A flat sword in a 48 × 48 square: one color, a straight blade and a bar for a guard. A dagger is shorter, a maul a hammer. */
function FlatWeapon({ tier }: { tier: WeaponTier }) {
  if (tier === "heavy") {
    return (
      <g className="flat">
        <rect x={22} y={14} width={4} height={28} />
        <rect x={12} y={6} width={24} height={11} rx={1} />
      </g>
    );
  }
  const top = tier === "light" ? 14 : 5;
  return (
    <g className="flat">
      <rect x={22} y={top} width={4} height={30 - top} />
      <rect x={14} y={30} width={20} height={4} />
      <rect x={22} y={34} width={4} height={9} />
    </g>
  );
}

/** A flat chestplate in a 48 × 48 square: one shape, broader for heavier armor. */
function FlatArmor({ tier }: { tier: ArmorTier }) {
  const wide = tier === "heavy" ? 6 : tier === "normal" ? 3 : 0;
  return <path className="flat" d={`M${15 - wide} 9 L${21} 9 Q24 13 27 9 L${33 + wide} 9 L${35 + wide} 20 L33 22 L33 38 L15 38 L15 22 L${13 - wide} 20 Z`} />;
}

/** The flat icon of an empty place: its slot's sword or chestplate, faded. */
export function GearIcon({ slot }: { slot: Slot }) {
  return (
    <svg viewBox="0 0 48 48" className="gear-icon is-faded" aria-hidden="true">
      {slot === "weapon" ? <FlatWeapon tier="normal" /> : <FlatArmor tier="normal" />}
    </svg>
  );
}

/**
 * The real sprite of a piece of gear: the weapon as a figure holds it (`tilted` slants it to fill a
 * square place), the armor as the player wears it, cropped to the torso.
 */
export function GearSprite({ slot, tier, tilted }: { slot: Slot; tier: WeaponTier | ArmorTier; tilted?: boolean }) {
  if (slot === "weapon") {
    return (
      <svg viewBox={tilted ? "-12.5 -37.5 52 52" : "-9 -9 52 18"} className={`gear-sprite is-weapon ${tilted ? "is-tilted" : ""}`} aria-hidden="true">
        <g transform={tilted ? "rotate(-40)" : undefined}>
          <Weapon tier={tier as WeaponTier} />
        </g>
      </svg>
    );
  }
  return (
    <div className="gear-sprite is-armor" aria-hidden="true">
      <StickFigure view="back" pose="idle" weapon="baseline" armor={tier as ArmorTier} />
    </div>
  );
}
