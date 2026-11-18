/**
 * gear.ts — what you carry on the map: you set out with nothing, enemies drop the weapon and
 * armor they carry (all of it, every time), and falling takes it all away again, except the
 * eternal gear. Four places to wear it: the two hands (`weapon`, the right hand, and `left`), armor and head; the rest waits in the bag.
 * Eternal gear piles up; ordinary gear is two weapons, one armor and one head piece at a time (`CARRY`): past that, the inventory has you
 * drop one. The two hands share the ordinary weapons (each is held in one hand at a time); an eternal weapon is set in one hand's eternal
 * place, and only that hand can wield it.
 *
 * Eternal gear comes as a "Memory of ...": the guide must read its dreams (at a safe spot) before it
 * can be set in its slot's eternal place, which is also only done at a safe spot (`setEternal`).
 */
import { ENEMY_KINDS } from "../core/bestiary";
import { ARMOR, WEAPONS } from "../core/rules";
import { type ItemId, ITEMS } from "./items";
import type { ArmorItem, ArmorTier, Arsenal, ArsenalWeapon, EnemySetup, HeadItem, Side as CombatSide, WeaponItem, WeaponTier } from "../core/types";
import type { Loadout } from "../combat/fight";

/** What kind of gear a piece is (a weapon goes in either hand). */
export type Slot = "weapon" | "armor" | "head";

/** Where a piece is worn: the right hand (`weapon`, so older saves keep it), the left hand, armor or head. */
export type Place = Slot | "left";

/** The kind of gear a place takes. */
export const slotOf = (place: Place): Slot => (place === "left" ? "weapon" : place);

/** The other hand. */
export const otherHand = (hand: "weapon" | "left"): "weapon" | "left" => (hand === "left" ? "weapon" : "left");

/** What a piece of gear is. */
export type GearSpec = {
  eternal?: boolean;
  /** Eternal gear only: the guide has read its dreams (its lore and effect are known, and it can be set). */
  read?: boolean;
  /** What it is called, if not by its tier. */
  name?: string;
  /** One of the starting classes' own pieces (its name, lore, look and effect come from `ITEMS`). */
  item?: ItemId;
  /** Armor or head gear: what it weighs, if it has a weight of its own (else its item's, or its class's: see `pieceWeight`). */
  weight?: number;
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
  /** The ids of what you wear in each place (null: bare hands, no armor): `weapon` is the right hand. */
  weapon: string | null;
  left?: string | null;
  armor: string | null;
  head?: string | null;
  /** For making ids. */
  made: number;
  /** Which eternal piece sits in each place's eternal place (each hand has its own). */
  shelf?: Partial<Record<Place, string>>;
  /** Which empty place counts as the one you wield, when you wield nothing (the normal one, if unset). */
  bare?: Partial<Record<Place, Side>>;
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

/**
 * What a piece of armor or head gear weighs (a share of a blow: the Resistance it adds, and what it adds to a dodge's cost): its own, its item's,
 * or its class's (`ARMOR`). A weapon weighs nothing here.
 */
export function pieceWeight(g: GearSpec): number {
  if (g.slot === "weapon") return 0;
  const info = g.item ? ITEMS[g.item] : undefined;
  return g.weight ?? (info && info.slot !== "weapon" ? info.weight : undefined) ?? ARMOR[g.tier].weight;
}

/** What everything you wear weighs together: your Resistance (a share of a blow). */
export const wornWeightOf = (inv: Inventory): number => (["armor", "head"] as const).reduce((n, place) => {
  const g = wornIn(inv, place);
  return n + (g ? pieceWeight(g) : 0);
}, 0);

/** "Lightweight" or "Heavyweight", for gear of those weights (nothing for normal ones, or none). */
export function weightLabel(g: GearSpec): string | null {
  return g.tier === "light" ? "Lightweight" : g.tier === "heavy" ? "Heavyweight" : null;
}

/** The piece you wear in a place, if it is where you wield from (an eternal piece only counts once set in its place, in that very hand). */
export function wornIn(inv: Inventory, place: Place): Gear | undefined {
  const worn = inv.bag.find(g => g.id === inv[place] && g.slot === slotOf(place));
  if (!worn || !worn.eternal) return worn;
  return pieceAt(inv, place, "eternal")?.id === worn.id ? worn : undefined;
}

/** What you wear, as a fight wants it: bare hands and no armor in an empty slot. */
export function loadoutOf(inv: Inventory): Loadout {
  const weapon = wornIn(inv, "weapon"), left = wornIn(inv, "left"), armor = wornIn(inv, "armor"), head = wornIn(inv, "head");
  return {
    ...(left?.slot === "weapon" ? { offhand: { weapon: left.tier, weaponItem: left.item as WeaponItem | undefined, eternal: !!left.eternal && !!left.read } } : {}),
    weapon: weapon?.slot === "weapon" ? weapon.tier : "baseline",
    armor: armor?.slot === "armor" ? armor.tier : "none",
    eternal: weapon?.slot === "weapon" && !!weapon.eternal && !!weapon.read,
    weaponItem: weapon?.slot === "weapon" ? (weapon.item as WeaponItem | undefined) : undefined,
    armorItem: armor?.slot === "armor" ? (armor.item as ArmorItem | undefined) : undefined,
    head: head?.slot === "head" ? head.tier : "none",
    headItem: head?.slot === "head" ? (head.item as HeadItem | undefined) : undefined,
    worn: wornWeightOf(inv),
    back: backWeapons(inv, true),
    arsenal: arsenalOf(inv),
  };
}

/**
 * Your arsenal (see `Arsenal`): the eternal weapon set in each hand's eternal place (once read), and the ordinary weapons you carry, in their places on
 * your back; each marked with the hand that holds it, if one does.
 */
export function arsenalOf(inv: Inventory): Arsenal {
  const right = wornIn(inv, "weapon")?.id, left = wornIn(inv, "left")?.id;
  const entry = (g: Gear | undefined): ArsenalWeapon | undefined => {
    if (!g || g.slot !== "weapon") return undefined;
    const held: CombatSide | undefined = g.id === right ? "right" : g.id === left ? "left" : undefined;
    return { tier: g.tier, ...(g.item ? { item: g.item as WeaponItem } : {}), eternal: !!g.eternal, ...(held ? { held } : {}) };
  };
  const eternalIn = (place: "weapon" | "left") => {
    const g = pieceAt(inv, place, "eternal");
    return g?.read ? g : undefined;
  };
  const ordinary = inv.bag.filter(g => g.slot === "weapon" && !g.eternal);
  const out: Arsenal = {};
  const set = (slot: keyof Arsenal, g: Gear | undefined) => { const e = entry(g); if (e) out[slot] = e; };
  set("right", eternalIn("weapon"));
  set("left", eternalIn("left"));
  set("up", ordinary[0]);
  set("down", ordinary[1]);
  return out;
}

/**
 * The ordinary weapons on your back (two at most, as you carry no more), each in its place (the first from the right shoulder): every one you carry,
 * or (`inFight`) those you do not hold, the place of one in your hand left empty (null). Eternal weapons are never there.
 */
export function backWeapons(inv: Inventory, inFight: boolean): ({ tier: WeaponTier; item?: WeaponItem } | null)[] {
  const held = new Set(inFight ? [wornIn(inv, "weapon")?.id, wornIn(inv, "left")?.id] : []);
  // (each in its own place, the first from the right shoulder: one in your hand leaves its place empty)
  return inv.bag
    .filter(g => g.slot === "weapon" && !g.eternal)
    .map(g => (held.has(g.id) ? null : { tier: g.tier as WeaponTier, ...(g.item ? { item: g.item as WeaponItem } : {}) }));
}

/**
 * You as you are seen between fights (the map, the inventory, a talk with the guide): what you wear, nothing in your hands (an ordinary weapon is on
 * your back, held or not; an eternal one is not seen at all: it manifests in your hand only for a fight), every ordinary weapon on your back.
 */
export function lookBetweenFights(inv: Inventory): Loadout {
  const { offhand: _offhand, ...worn } = loadoutOf(inv);
  return { ...worn, weapon: "baseline", weaponItem: undefined, eternal: false, back: backWeapons(inv, false) };
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

/** Every place gear is worn in. */
const PLACES: Place[] = ["weapon", "left", "armor", "head"];

/** Lets go of a piece you own (never an eternal one): it leaves the bag, and whatever place wore it is left empty. */
export function drop(inv: Inventory, id: string): Inventory {
  const piece = inv.bag.find(g => g.id === id);
  if (!piece || piece.eternal) return inv;
  const next: Inventory = { ...inv, bag: inv.bag.filter(g => g.id !== id) };
  for (const place of PLACES) if (inv[place] === id) next[place] = null;
  return next;
}

/**
 * Wears this piece in this place (an eternal one only if it is the one set in that place's eternal place), or, with `null`, nothing: bare
 * hands, no armor, bare-headed. A weapon the other hand holds moves to this one, leaving that hand empty.
 */
export function wield(inv: Inventory, place: Place, id: string | null): Inventory {
  if (id === null) return unequip(inv, place, equippedSide(inv, place) ?? "normal");
  const piece = inv.bag.find(g => g.id === id && g.slot === slotOf(place));
  if (!piece || (piece.eternal && pieceAt(inv, place, "eternal")?.id !== id)) return inv;
  const next: Inventory = { ...inv, [place]: id };
  if (place === "weapon" || place === "left") {
    const other = otherHand(place);
    if (inv[other] === id) next[other] = null;
  }
  return next;
}


/** Falling: everything is lost but the eternal gear (and you wear it again if you wore it). */
export function lose(inv: Inventory): Inventory {
  const bag = inv.bag.filter(g => g.eternal);
  const keeps = (id: string | null | undefined) => (id && bag.some(g => g.id === id) ? id : null);
  return { ...inv, bag, weapon: keeps(inv.weapon), left: keeps(inv.left), armor: keeps(inv.armor), head: keeps(inv.head) };
}

/**
 * What lies in a place's eternal or normal place, or null if it is empty (the eternal place: the read piece set there at a safe spot; each
 * hand has its own).
 */
export function pieceAt(inv: Inventory, place: Place, side: Side): Gear | null {
  const slot = slotOf(place);
  if (side === "normal") return inv.bag.find(g => g.slot === slot && !g.eternal) ?? null;
  return inv.bag.find(g => g.slot === slot && g.eternal && g.read && g.id === inv.shelf?.[place]) ?? null;
}

/** Which place of a slot you wield from: the place of the piece you wear, or else an empty one (nothing worn). */
export function equippedSide(inv: Inventory, place: Place): Side | null {
  const worn = wornIn(inv, place);
  if (worn) return worn.eternal ? "eternal" : "normal";
  const empty = (side: Side) => !pieceAt(inv, place, side);
  const chosen = inv.bare?.[place];
  if (chosen && empty(chosen)) return chosen;
  return empty("normal") ? "normal" : empty("eternal") ? "eternal" : null;
}

/** Wields nothing in this place (bare hands, no armor), counting this place as the one you wield from. */
export const unequip = (inv: Inventory, place: Place, side: Side): Inventory => ({ ...inv, [place]: null, bare: { ...inv.bare, [place]: side } });

/** Your memories whose dreams the guide has not read yet. */
export const unreadMemories = (inv: Inventory): Gear[] => inv.bag.filter(g => g.eternal && !g.read);

/** All your eternal gear for a slot, read or not: what the guide's Dreams shows. */
export const memoriesFor = (inv: Inventory, slot: Slot): Gear[] => inv.bag.filter(g => g.slot === slot && g.eternal);

/** Whether you carry a memory whose dreams are still unread (the first time you bring one to the guide, it opens Dreams for you). */
export const hasUnread = (inv: Inventory): boolean => inv.bag.some(g => g.eternal && !g.read);

/** The guide reads a memory's dreams: its lore and effect are known, and it can be set. */
export const readDreams = (inv: Inventory, id: string): Inventory => ({ ...inv, bag: inv.bag.map(g => (g.id === id ? { ...g, read: true } : g)) });

/**
 * Sets a read eternal piece in a place's eternal place (only at a safe spot, with the guide). If you were wielding from the eternal place,
 * you wield the new piece. An eternal weapon sits in one hand at a time: set in this hand, it leaves the other (which, if it wielded it,
 * is left empty).
 */
export function setEternal(inv: Inventory, place: Place, id: string): Inventory {
  const wieldingEternal = equippedSide(inv, place) === "eternal";
  let next: Inventory = { ...inv, shelf: { ...inv.shelf, [place]: id } };
  if (place === "weapon" || place === "left") {
    const other = otherHand(place);
    if (inv.shelf?.[other] === id) {
      const shelf = { ...next.shelf };
      delete shelf[other];
      next = { ...next, shelf, ...(inv[other] === id ? { [other]: null } : {}) };
    }
  }
  return wieldingEternal ? { ...next, [place]: id } : next;
}
