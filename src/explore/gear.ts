/**
 * gear.ts — what you carry on the map: you set out with nothing, enemies drop the weapon and
 * armor they carry (all of it, every time), and falling takes it all away again, except the
 * eternal gear. Two slots, weapon and armor; the rest waits in the bag. Eternal gear piles up;
 * ordinary gear is one weapon and one armor at a time.
 */
import { ENEMY_KINDS } from "../core/bestiary";
import { ARMOR, WEAPONS } from "../core/rules";
import type { ArmorTier, EnemySetup, WeaponTier } from "../core/types";
import type { Loadout } from "../combat/fight";

export type Slot = "weapon" | "armor";

/** What a piece of gear is. */
export type GearSpec = { eternal?: boolean; /** What it is called, if not by its tier. */ name?: string } & (
  | { slot: "weapon"; tier: WeaponTier }
  | { slot: "armor"; tier: ArmorTier }
);

/** One piece of gear you own. */
export type Gear = GearSpec & { id: string };

export interface Inventory {
  /** Everything you own, worn or not. */
  bag: Gear[];
  /** The ids of what you wear in each slot (null: bare hands, no armor). */
  weapon: string | null;
  armor: string | null;
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

export const SLOTS: Slot[] = ["weapon", "armor"];

/** "Normal weapon", "Heavy armor"... */
export const gearName = (g: GearSpec) => g.name ?? `${(g.slot === "weapon" ? WEAPONS[g.tier] : ARMOR[g.tier]).label} ${g.slot}`;

/** What you wear, as a fight wants it: bare hands and no armor in an empty slot. */
export function loadoutOf(inv: Inventory): Loadout {
  const worn = (slot: Slot) => inv.bag.find(g => g.id === inv[slot]);
  const weapon = worn("weapon"), armor = worn("armor");
  return {
    weapon: weapon?.slot === "weapon" ? weapon.tier : "baseline",
    armor: armor?.slot === "armor" ? armor.tier : "none",
  };
}

/** The gear these enemies carry, all of it (bare hands and no armor aren't gear). */
export function dropsOf(enemies: EnemySetup[]): GearSpec[] {
  return enemies.flatMap(setup => {
    const kind = ENEMY_KINDS[setup.kind];
    const out: GearSpec[] = [];
    if (kind.weapon !== "baseline") out.push({ slot: "weapon", tier: kind.weapon });
    if (kind.armor !== "none") out.push({ slot: "armor", tier: kind.armor });
    return out;
  });
}

/**
 * Picks up gear. You can carry any amount of eternal gear, but only one piece of ordinary
 * weapon and one of ordinary armor: a new one takes the place of the old (and is worn if the old
 * one was). What an enemy drops goes on at once if its slot is empty; what you pick up off the
 * floor you equip yourself (`wear` false). `replaced` is what you had to let go of.
 */
export function receive(inv: Inventory, found: GearSpec[], wear = true): { inventory: Inventory; replaced: Gear[] } {
  const next = { ...inv, bag: [...inv.bag] };
  const replaced: Gear[] = [];
  for (const piece of found) {
    const gear = { ...piece, id: `gear-${next.made++}` } as Gear;
    let takesPlace = false;
    if (!gear.eternal) {
      for (const old of next.bag.filter(g => !g.eternal && g.slot === gear.slot)) {
        replaced.push(old);
        next.bag = next.bag.filter(g => g !== old);
        if (next[gear.slot] === old.id) { next[gear.slot] = null; takesPlace = true; }
      }
    }
    next.bag.push(gear);
    if ((wear || takesPlace) && next[gear.slot] === null) {
      next[gear.slot] = gear.id;
      // (Wielded eternal gear is the one in the eternal place.)
      if (gear.eternal) next.shelf = { ...next.shelf, [gear.slot]: gear.id };
    }
  }
  return { inventory: next, replaced };
}

/** What to tell the player after picking gear up: "Dropped: ..." and what it replaced. */
export function gotNote(verb: string, got: GearSpec[], replaced: GearSpec[]): string {
  const names = (list: GearSpec[]) => list.map(gearName).join(", ").toLowerCase();
  return `${verb}: ${names(got)}.${replaced.length ? ` You let go of the ${names(replaced)}.` : ""}`.replace(/^./, c => c.toUpperCase());
}

/** Falling: everything is lost but the eternal gear (and you wear it again if you wore it). */
export function lose(inv: Inventory): Inventory {
  const bag = inv.bag.filter(g => g.eternal);
  const keeps = (id: string | null) => (bag.some(g => g.id === id) ? id : null);
  return { ...inv, bag, weapon: keeps(inv.weapon), armor: keeps(inv.armor) };
}

/** What lies in a slot's eternal or normal place, or null if it is empty. */
export function pieceAt(inv: Inventory, slot: Slot, side: Side): Gear | null {
  if (side === "normal") return inv.bag.find(g => g.slot === slot && !g.eternal) ?? null;
  const eternal = inv.bag.filter(g => g.slot === slot && g.eternal);
  return eternal.find(g => g.id === inv.shelf?.[slot]) ?? eternal.find(g => g.id === inv[slot]) ?? eternal[0] ?? null;
}

/** Which place of a slot you wield from: the place of the piece you wear, or else an empty one (nothing worn). */
export function equippedSide(inv: Inventory, slot: Slot): Side | null {
  const worn = inv.bag.find(g => g.id === inv[slot]);
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

/** Wields a piece you own for this slot: an eternal one takes the eternal place, an ordinary one the normal place. */
export const choosePiece = (inv: Inventory, slot: Slot, piece: Gear): Inventory =>
  equipSide(piece.eternal ? { ...inv, shelf: { ...inv.shelf, [slot]: piece.id } } : inv, slot, piece.eternal ? "eternal" : "normal");

/** Everything you own for a place of a slot: the eternal places list the eternal gear, the normal ones the ordinary gear. */
export const piecesFor = (inv: Inventory, slot: Slot, side: Side): Gear[] =>
  inv.bag.filter(g => g.slot === slot && !!g.eternal === (side === "eternal"));
