/**
 * gear.ts — what you carry on the map: you set out with nothing, enemies drop the weapon and
 * armor they carry (all of it, every time), and falling takes it all away again, except the
 * eternal gear. Three slots: weapon (the right hand), armor and head; the rest waits in the bag. Eternal gear piles up;
 * ordinary gear is two weapons, one armor and one head piece at a time (`CARRY`): past that, the inventory has you drop one.
 *
 * Eternal gear comes as a "Memory of ...": the guide must read its dreams (at a safe spot) before it
 * can be set in its slot's eternal place, which is also only done at a safe spot (`setEternal`).
 */
import { ENEMY_KINDS } from "../core/bestiary";
import { ARMOR, WEAPONS } from "../core/rules";
import { type ItemId, ITEMS } from "./items";
import type { ArmorItem, ArmorTier, EnemySetup, HeadItem, WeaponItem, WeaponTier } from "../core/types";
import type { Loadout } from "../combat/fight";

export type Slot = "weapon" | "armor" | "head";

/** What a piece of gear is. */
export type GearSpec = {
  eternal?: boolean;
  /** Eternal gear only: the guide has read its dreams (its lore and effect are known, and it can be set). */
  read?: boolean;
  /** What it is called, if not by its tier. */
  name?: string;
  /** One of the starting classes' own pieces (its name, lore, look and effect come from `ITEMS`). */
  item?: ItemId;
  /**
   * The remains it dropped from (a key of the journey's corpses). Remains that stay for good (enemies that don't
   * get up again) get it back when you reawaken, if you no longer have it.
   */
  origin?: string;
} & (
  | { slot: "weapon"; tier: WeaponTier }
  | { slot: "armor"; tier: ArmorTier }
  | { slot: "head"; tier: ArmorTier }
);

/** One piece of gear you own. */
export type Gear = GearSpec & { id: string };

export interface Inventory {
  /** Everything you own, worn or not. */
  bag: Gear[];
  /** The ids of what you wear in each slot (null: bare hands, no armor). */
  weapon: string | null;
  armor: string | null;
  head?: string | null;
  /** For making ids. */
  made: number;
  /** Which eternal piece sits in each slot's eternal place (the first one you own, if unset). */
  shelf?: Partial<Record<Slot, string>>;
  /** Which empty place counts as the one you wield, when you wield nothing (the normal one, if unset). */
  bare?: Partial<Record<Slot, Side>>;
}

/** Each slot has two places: one for eternal gear and one for ordinary gear. */
export type Side = "eternal" | "normal";
export const SIDES: Side[] = ["eternal", "normal"];

/** Nothing at all: where you begin. */
export const EMPTY_INVENTORY: Inventory = { bag: [], weapon: null, armor: null, made: 0 };

/** The slots, top to bottom in the menus. */
export const SLOTS: Slot[] = ["weapon", "head", "armor"];

/** "Waxed Torch", "Heavy armor"...; an eternal piece whose dreams are unread: "Memory of Brick Hammer". */
export function gearName(g: GearSpec): string {
  const base = g.name ?? (g.item ? ITEMS[g.item].name : g.slot === "weapon" ? WEAPONS[g.tier].name : `${ARMOR[g.tier].label} armor`);
  return g.eternal && !g.read ? `Memory of ${base}` : base;
}

/** "Lightweight" or "Heavyweight", for gear of those weights (nothing for normal ones, or none). */
export function weightLabel(g: GearSpec): string | null {
  return g.tier === "light" ? "Lightweight" : g.tier === "heavy" ? "Heavyweight" : null;
}

/** The piece you wear in a slot, if it is where you wield from (an eternal piece only counts once set in its place). */
export function wornIn(inv: Inventory, slot: Slot): Gear | undefined {
  const worn = inv.bag.find(g => g.id === inv[slot]);
  if (!worn || !worn.eternal) return worn;
  return pieceAt(inv, slot, "eternal")?.id === worn.id ? worn : undefined;
}

/** What you wear, as a fight wants it: bare hands and no armor in an empty slot. */
export function loadoutOf(inv: Inventory): Loadout {
  const weapon = wornIn(inv, "weapon"), armor = wornIn(inv, "armor"), head = wornIn(inv, "head");
  return {
    weapon: weapon?.slot === "weapon" ? weapon.tier : "baseline",
    armor: armor?.slot === "armor" ? armor.tier : "none",
    eternal: weapon?.slot === "weapon" && !!weapon.eternal && !!weapon.read,
    weaponItem: weapon?.slot === "weapon" ? (weapon.item as WeaponItem | undefined) : undefined,
    armorItem: armor?.slot === "armor" ? (armor.item as ArmorItem | undefined) : undefined,
    head: head?.slot === "head" ? head.tier : "none",
    headItem: head?.slot === "head" ? (head.item as HeadItem | undefined) : undefined,
  };
}

/**
 * The gear these enemies carry, all of it (bare hands and no armor aren't gear). Always ordinary gear:
 * an enemy fighting with a weapon's eternal effect still drops the ordinary weapon (eternal gear is only
 * found, as memories).
 */
export function dropsOf(enemies: EnemySetup[]): GearSpec[] {
  return enemies.flatMap(setup => {
    const kind = ENEMY_KINDS[setup.kind];
    const out: GearSpec[] = [];
    if (kind.noDrops) return out;
    if (kind.weapon !== "baseline") out.push({ slot: "weapon", tier: kind.weapon });
    if (kind.armor !== "none") out.push({ slot: "armor", tier: kind.armor });
    // A patrol warden's pointed hood comes off with it.
    if (kind.hood) out.push({ slot: "head", tier: "light", item: "wardenhood" });
    return out;
  });
}

/**
 * How much ordinary gear of a slot you may carry: two weapons (one for each hand; one you don't hold is kept on your back), one armor
 * and one head piece. Eternal gear has no limit. Picking up past it is allowed, but the inventory then asks you to drop one before you go on.
 */
export const CARRY: Record<Slot, number> = { weapon: 2, armor: 1, head: 1 };

/** The ordinary gear of a slot you carry, oldest first. */
export const carried = (inv: Inventory, slot: Slot): Gear[] => inv.bag.filter(g => g.slot === slot && !g.eternal);

/** Whether you carry more ordinary gear of this slot than you may (`CARRY`): one has to be dropped. */
export const overLimit = (inv: Inventory, slot: Slot): boolean => carried(inv, slot).length > CARRY[slot];

/**
 * Picks up a piece of gear into the bag, never putting it on. Nothing is let go of here, even past the limit (`CARRY`): the inventory
 * has you drop one. Eternal gear comes as a memory, to be read and set at a safe spot. `gear` is the piece as you now own it.
 */
export function take(inv: Inventory, found: GearSpec): { inventory: Inventory; gear: Gear } {
  const gear = { ...found, id: `gear-${inv.made}` } as Gear;
  return { inventory: { ...inv, bag: [...inv.bag, gear], made: inv.made + 1 }, gear };
}

/** Lets go of a piece you own (never an eternal one): it leaves the bag, and if you wore it, that slot is left empty. */
export function drop(inv: Inventory, id: string): Inventory {
  const piece = inv.bag.find(g => g.id === id);
  if (!piece || piece.eternal) return inv;
  return { ...inv, bag: inv.bag.filter(g => g.id !== id), [piece.slot]: inv[piece.slot] === id ? null : inv[piece.slot] ?? null };
}

/**
 * Wears this piece in its slot (an eternal one only if it is the one set in the slot's eternal place), or, with `null`, nothing: bare hands,
 * no armor, bare-headed.
 */
export function wield(inv: Inventory, slot: Slot, id: string | null): Inventory {
  if (id === null) return unequip(inv, slot, equippedSide(inv, slot) ?? "normal");
  const piece = inv.bag.find(g => g.id === id && g.slot === slot);
  if (!piece || (piece.eternal && pieceAt(inv, slot, "eternal")?.id !== id)) return inv;
  return { ...inv, [slot]: id };
}


/** Falling: everything is lost but the eternal gear (and you wear it again if you wore it). */
export function lose(inv: Inventory): Inventory {
  const bag = inv.bag.filter(g => g.eternal);
  const keeps = (id: string | null) => (bag.some(g => g.id === id) ? id : null);
  return { ...inv, bag, weapon: keeps(inv.weapon), armor: keeps(inv.armor), head: keeps(inv.head ?? null) };
}

/** What lies in a slot's eternal or normal place, or null if it is empty (the eternal place: the read piece set there at a safe spot). */
export function pieceAt(inv: Inventory, slot: Slot, side: Side): Gear | null {
  if (side === "normal") return inv.bag.find(g => g.slot === slot && !g.eternal) ?? null;
  return inv.bag.find(g => g.slot === slot && g.eternal && g.read && g.id === inv.shelf?.[slot]) ?? null;
}

/** Which place of a slot you wield from: the place of the piece you wear, or else an empty one (nothing worn). */
export function equippedSide(inv: Inventory, slot: Slot): Side | null {
  const worn = wornIn(inv, slot);
  if (worn) return worn.eternal ? "eternal" : "normal";
  const empty = (side: Side) => !pieceAt(inv, slot, side);
  const chosen = inv.bare?.[slot];
  if (chosen && empty(chosen)) return chosen;
  return empty("normal") ? "normal" : empty("eternal") ? "eternal" : null;
}

/** Wields what lies in this place (or nothing, if it is empty). */
export function equipSide(inv: Inventory, slot: Slot, side: Side): Inventory {
  const piece = pieceAt(inv, slot, side);
  if (!piece) return unequip(inv, slot, side);
  return { ...inv, [slot]: piece.id, shelf: piece.eternal ? { ...inv.shelf, [slot]: piece.id } : inv.shelf };
}

/** Wields nothing in this slot (bare hands, no armor), counting this place as the one you wield from. */
export const unequip = (inv: Inventory, slot: Slot, side: Side): Inventory => ({ ...inv, [slot]: null, bare: { ...inv.bare, [slot]: side } });

/** Your memories whose dreams the guide has not read yet. */
export const unreadMemories = (inv: Inventory): Gear[] => inv.bag.filter(g => g.eternal && !g.read);

/** All your eternal gear for a slot, read or not: what the guide's Dreams shows. */
export const memoriesFor = (inv: Inventory, slot: Slot): Gear[] => inv.bag.filter(g => g.slot === slot && g.eternal);

/** Whether you carry a memory whose dreams are still unread (the first time you bring one to the guide, it opens Dreams for you). */
export const hasUnread = (inv: Inventory): boolean => inv.bag.some(g => g.eternal && !g.read);

/** The guide reads a memory's dreams: its lore and effect are known, and it can be set. */
export const readDreams = (inv: Inventory, id: string): Inventory => ({ ...inv, bag: inv.bag.map(g => (g.id === id ? { ...g, read: true } : g)) });

/**
 * Sets a read eternal piece in its slot's eternal place (only at a safe spot, with the guide). If you
 * were wielding from the eternal place, you wield the new piece.
 */
export function setEternal(inv: Inventory, slot: Slot, id: string): Inventory {
  const wieldingEternal = equippedSide(inv, slot) === "eternal";
  const next = { ...inv, shelf: { ...inv.shelf, [slot]: id } };
  return wieldingEternal ? { ...next, [slot]: id } : next;
}
