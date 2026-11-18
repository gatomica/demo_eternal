/**
 * PlayerFigure3D.tsx — you (or a starting class), drawn on the 3D body the fights draw you with, in the pose and view of the inventory: standing at Idle, seen from the
 * front and a little above, turned three-quarters to face right. Used by the inventory, the class preview and the origin screen.
 */
import type { ArmorItem, ArmorTier, HeadItem, Side, WeaponItem, WeaponTier } from "../core/types";
import { orbitBox, orbitCamera } from "./camera";
import { Sleepwalker3D } from "./Sleepwalker3D";

const W = 800, H = 600, AT = { x: 0, z: 6 };
const CAM = orbitCamera(AT, 6, 0.9, 6);
const BOX = orbitBox(CAM, AT, W, H);
const YAW = Math.PI / 2 + 0.9;

export function PlayerFigure3D({ look, title, swayId, manifest }: {
  look: { weapon: WeaponTier; armor: ArmorTier; weaponItem?: WeaponItem; armorItem?: ArmorItem; headItem?: HeadItem; offhand?: { weapon: WeaponTier; weaponItem?: WeaponItem }; back?: ({ tier: WeaponTier; item?: WeaponItem } | null)[] };
  title?: string;
  /** Which figure it is, for the sway of its cloth (see sway.ts). */
  swayId: string;
  /** The hands whose weapon fades into them out of a pale blue light as it is first drawn (an eternal weapon: the inventory's). */
  manifest?: readonly Side[];
}) {
  return (
    <Sleepwalker3D
      pose="p3-idle" weapon={look.weapon} offWeapon={look.offhand?.weapon} title={title} swayId={swayId}
      gear={{ weaponItem: look.weaponItem, offItem: look.offhand?.weaponItem, armor: look.armor, armorItem: look.armorItem, headItem: look.headItem, back: look.back, manifest }}
      cam={CAM} at={AT} yaw={YAW} w={W} h={H} box={BOX}
    />
  );
}
