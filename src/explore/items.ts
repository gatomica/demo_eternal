/**
 * items.ts — the starting classes' own weapons and armor, and the classes themselves. Each item is of a tier like any other gear (its
 * weight, damage and resistance come from the tier), but has a name, lore, look and (a weapon) effect of its own. Every one is eternal from
 * the start: read and set, so its effect works at once, paid for with Eternity (see `eternalEffect` in core/resolve/attacks.ts).
 */
import type { ArmorItem, ArmorTier, HeadItem, WeaponItem, WeaponTier } from "../core/types";
import type { Loadout } from "../combat/fight";
import type { Inventory } from "./gear";

export type ItemId = WeaponItem | ArmorItem | HeadItem;

export type ItemInfo =
  | { slot: "weapon"; tier: WeaponTier; name: string; lore: string; effect: string }
  | { slot: "armor"; tier: ArmorTier; name: string; lore: string }
  | { slot: "head"; tier: ArmorTier; name: string; lore: string };

export const ITEMS: Record<ItemId, ItemInfo> = {
  shortsword: {
    slot: "weapon", tier: "normal", name: "Bronze Shortsword",
    lore: "Standard issued shortsword of the empire. Soldiers who entered the eternal sleep before the crusades were put to rest with their weapons unused.",
    effect: "Empowers consecutive attacks, tiring you less on the second.",
  },
  "bronze-chestplate": {
    slot: "armor", tier: "heavy", name: "Bronze Chestplate",
    lore: "Bronze armor of the empire. It is said the muscled physique was modeled after the founding emperor's firstborn.",
  },
  axe: {
    slot: "weapon", tier: "heavy", name: "Barbarian's Axe",
    lore: "A hefty battle axe of the southerners. The nighthunter tradition was tacitly accepted under imperial rule, as the nightmares are their common enemies.",
    effect: "Empowers the first direct hit after a rest.",
  },
  garb: {
    slot: "armor", tier: "normal", name: "Nighthunter's Garb",
    lore: "Padded black leather armor of the nighthunters. Even the creatures of the night found trouble finding a hunter clad in pitch black.",
  },
  sickle: {
    slot: "weapon", tier: "light", name: "Nomadic Sickle",
    lore: "An iron sickle from the nomads. Despite the nomadic tribes' land of poor harvests, many carried these sickles with pride, symbols of fertility from where they hailed from.",
    effect: "Empowers direct hits against staggered enemies.",
  },
  robe: {
    slot: "armor", tier: "light", name: "Nomad's Robe",
    lore: "Lightweight travelling clothes. Unlike customary attire for a keeper, these white robes are devoid of color, a vestige of the empire's cleansing of the demonic.",
  },
  // (Placeholder lore for the head gear, to be rewritten.)
  helm: {
    slot: "head", tier: "heavy", name: "Legionnaire's Helm",
    lore: "A bronze helm of the imperial legions, its crest dyed red. Few who wore it ever saw the face of what struck them down.",
  },
  hood: {
    slot: "head", tier: "normal", name: "Nighthunter's Hood",
    lore: "A black hood of the nighthunters, cut deep to hide the face and the breath on cold nights.",
  },
  wardenhood: {
    slot: "head", tier: "light", name: "Patrol Warden's Hood",
    lore: "The pointed hood the wardens wore on their rounds, long after there was anything left to guard. It is still warm, as if its wearer had only just left it.",
  },
  mask: {
    slot: "head", tier: "light", name: "Desert Mask",
    lore: "A mask of the nomads, worn against the sand and, it is said, against the eyes of the dead.",
  },
};

export type ClassId = "soldier" | "hunter" | "nomad" | "depraved";

/** The classes. The Depraved carries nothing at all. */
export const CLASSES: { id: ClassId; name: string; weapon?: WeaponItem; armor?: ArmorItem; head?: HeadItem }[] = [
  { id: "soldier", name: "Soldier", weapon: "shortsword", armor: "bronze-chestplate", head: "helm" },
  { id: "hunter", name: "Hunter", weapon: "axe", armor: "garb", head: "hood" },
  { id: "nomad", name: "Nomad", weapon: "sickle", armor: "robe", head: "mask" },
  { id: "depraved", name: "Depraved" },
];

/** What you set out with: the class's pieces, eternal, read, worn and set in their eternal places (the Depraved: nothing). */
export function startingInventory(id: ClassId): Inventory {
  const c = CLASSES.find(x => x.id === id) ?? CLASSES[0];
  const inv: Inventory = { bag: [], weapon: null, armor: null, head: null, made: 0, shelf: {} };
  for (const item of [c.weapon, c.armor, c.head]) {
    if (!item) continue;
    const info = ITEMS[item];
    const gid = `gear-${inv.made++}`;
    inv.bag.push({ id: gid, slot: info.slot, tier: info.tier, item, eternal: true, read: true } as Inventory["bag"][number]);
    inv[info.slot] = gid;
    inv.shelf![info.slot] = gid;
  }
  return inv;
}

/** What a class wears, for a figure to draw: the tiers and the items of its pieces (the Depraved: bare hands, nothing on). */
export function lookOfClass(id: ClassId) {
  const c = CLASSES.find(x => x.id === id) ?? CLASSES[0];
  const w = c.weapon && ITEMS[c.weapon], a = c.armor && ITEMS[c.armor];
  return {
    weapon: (w ? w.tier : "baseline") as WeaponTier,
    armor: (a ? a.tier : "none") as ArmorTier,
    weaponItem: c.weapon, armorItem: c.armor, headItem: c.head,
  };
}

/** The pieces of a loadout picked by item (Test combat): what a fight takes in, every piece eternal (the weapon's effect works, paid with Eternity). */
export interface Picks { weaponItem?: WeaponItem; armorItem?: ArmorItem; headItem?: HeadItem }
export function loadoutOfItems(p: Picks): Loadout {
  const w = p.weaponItem && ITEMS[p.weaponItem], a = p.armorItem && ITEMS[p.armorItem], h = p.headItem && ITEMS[p.headItem];
  return {
    weapon: w ? w.tier as WeaponTier : "baseline",
    armor: a ? a.tier as ArmorTier : "none",
    head: h ? h.tier as ArmorTier : "none",
    weaponItem: p.weaponItem, armorItem: p.armorItem, headItem: p.headItem,
    eternal: !!w,
  };
}
