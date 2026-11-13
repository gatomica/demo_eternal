/**
 * GearIcons.tsx — the inventory's pictures of gear. An empty place shows a flat, simple, faded
 * icon (a sword, a chestplate). Gear shows its 3D model: the weapon as modelled (render/gear3d.ts), and the armor and head gear by
 * themselves, as they sit when worn on the 3D player (without the player).
 */
import { type ReactNode, useMemo } from "react";
import type { ArmorItem, ArmorTier, HeadItem, WeaponItem, WeaponTier } from "../core/types";
import { orbitBox, orbitCamera } from "../render/camera";
import { boundsOf, drawGear, type GearModel, modelOfWeapon, type V3 } from "../render/gear3d";
import { GearShape } from "../render/GearShape";
import { Sleepwalker3D } from "../render/Sleepwalker3D";
import type { Slot } from "./gear";
import { Weapon } from "../render/StickFigure";

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

/** A flat helmet in a 48 × 48 square. */
function FlatHead() {
  return <path className="flat" d="M13 30 Q13 11 24 11 Q35 11 35 30 L35 36 L29 36 L29 30 L19 30 L19 36 L13 36 Z" />;
}

/** The flat icon of an empty place: its slot's sword or chestplate, faded. */
export function GearIcon({ slot }: { slot: Slot }) {
  return (
    <svg viewBox="0 0 48 48" className="gear-icon is-faded" aria-hidden="true">
      {slot === "weapon" ? <FlatWeapon tier="normal" /> : slot === "head" ? <FlatHead /> : <FlatArmor tier="normal" />}
    </svg>
  );
}

/** The 3D body the armor and head gear are shown on: you, as the fights draw you, seen from the front a little turned (so the pieces read as they are worn). */
const BODY_W = 800, BODY_H = 600, BODY_AT = { x: 0, z: 6 };
const BODY_CAM = orbitCamera(BODY_AT, 4, 0.9, 6);
const BODY_BOX = orbitBox(BODY_CAM, BODY_AT, BODY_W, BODY_H);
const BODY_YAW = Math.PI - 0.4;

/** Part of the 100 × 120 figure, shown alone: the chest for armor, the head for head gear (x, y, width, height in figure units). */
const CHEST: [number, number, number, number] = [26, 32, 48, 48];
const HEAD: [number, number, number, number] = [34, 12, 36, 36];

/** The figure, cut down to `region`: it fills the square the crop sits in. */
function Crop({ region: [x, y, w, h], className, children }: { region: [number, number, number, number]; className: string; children: ReactNode }) {
  return (
    <div className={className} aria-hidden="true">
      <div className="gear-crop" style={{ width: `${(100 / w) * 100}%`, left: `${(-x / w) * 100}%`, top: `${(-y / h) * 100}%` }}>{children}</div>
    </div>
  );
}

/** Where a weapon's model is seen from: a little round and above, as in the Gear viewer's 3/4 view (degrees). */
const GEAR_YAW = -30, GEAR_PITCH = -18;

/** A weapon's 3D model (render/gear3d.ts) as a picture, drawn as the Gear viewer draws it: `tilted` is slanted to fill a square place. */
function Weapon3D({ model, tilted }: { model: GearModel; tilted: boolean }) {
  const drawn = useMemo(() => {
    const [pw, ph] = tilted ? [150, 150] : [240, 100];
    const { lo, hi } = boundsOf(model.prims);
    const mid: V3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    const size = Math.max(hi[0] - lo[0], (hi[1] - lo[1]) * 1.6, 12);
    const a = (GEAR_YAW * Math.PI) / 180, b = (GEAR_PITCH * Math.PI) / 180;
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    const pxPerUnit = (pw * (tilted ? 0.8 : 0.9)) / size, dist = size * 4;
    const view = (p: V3): V3 => {
      const x = p[0] - mid[0], y = -(p[1] - mid[1]), z = -(p[2] - mid[2]);
      const x1 = x * ca + z * sa, z1 = -x * sa + z * ca;
      return [x1, y * cb - z1 * sb, y * sb + z1 * cb];
    };
    const scale = (v: V3) => (dist / (dist + v[2])) * pxPerUnit;
    const project = (v: V3): readonly [number, number] => { const k = scale(v); return [+(pw / 2 + v[0] * k).toFixed(2), +(ph / 2 + v[1] * k).toFixed(2)]; };
    return { shapes: drawGear(model.prims, { view, project, scale }), pw, ph };
  }, [model, tilted]);
  return (
    <svg viewBox={`0 0 ${drawn.pw} ${drawn.ph}`} className={`gear-sprite is-weapon ${tilted ? "is-tilted" : ""}`} aria-hidden="true">
      <g transform={tilted ? `rotate(-40 ${drawn.pw / 2} ${drawn.ph / 2})` : undefined}>
        {drawn.shapes.map((d, i) => <GearShape key={i} d={d} />)}
      </g>
    </svg>
  );
}

/**
 * The picture of a piece of gear, from its 3D model: a weapon as modelled (`tilted` slants it to fill a square place), armor and head gear
 * by themselves, shaped as they are worn on the 3D body the fights draw you with (the body itself not drawn), cut down to the chest or the head.
 */
export function GearSprite({ slot, tier, tilted, item }: { slot: Slot; tier: WeaponTier | ArmorTier; tilted?: boolean; /** One of the starting classes' own pieces: its look. */ item?: string }) {
  if (slot === "weapon") {
    const model = modelOfWeapon(tier as WeaponTier, item as WeaponItem | undefined);
    if (model) return <Weapon3D model={model} tilted={!!tilted} />;
    return (
      <svg viewBox={tilted ? "-12.5 -37.5 52 52" : "-9 -9 52 18"} className={`gear-sprite is-weapon ${tilted ? "is-tilted" : ""}`} aria-hidden="true">
        <g transform={tilted ? "rotate(-40)" : undefined}><Weapon tier={tier as WeaponTier} item={item as WeaponItem | undefined} /></g>
      </svg>
    );
  }
  const head = slot === "head";
  return (
    <Crop region={head ? HEAD : CHEST} className={`gear-sprite ${head ? "is-head" : "is-armor"}`}>
      <Sleepwalker3D
        pose="p3-idle" weapon="baseline" swayId="gear-icon" gearOnly
        gear={head ? { armor: "none", headItem: item as HeadItem | undefined } : { armor: tier as ArmorTier, armorItem: item as ArmorItem | undefined }}
        cam={BODY_CAM} at={BODY_AT} yaw={BODY_YAW} w={BODY_W} h={BODY_H} box={BODY_BOX}
      />
    </Crop>
  );
}
