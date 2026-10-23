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
}

/** Nothing at all: where you begin. */
export const EMPTY_INVENTORY: Inventory = { bag: [], weapon: null, armor: null, made: 0 };

export const SLOTS: Slot[] = ["weapon", "armor"];

export const SLOT_LABELS: Record<Slot, string> = { weapon: "Weapon", armor: "Armor" };

/** "Normal weapon", "Heavy armor"... */
export const gearName = (g: GearSpec) => g.name ?? `${(g.slot === "weapon" ? WEAPONS[g.tier] : ARMOR[g.tier]).label} ${g.slot}`;

/** A short line of what a piece of gear does, in the design doc's sixteenths of your health. */
export function gearStats(g: GearSpec): string {
  if (g.slot === "weapon") {
    const w = WEAPONS[g.tier];
    return `Damage ${w.damage}/16 · Block +${w.block}/16 · Cost ${w.cost}/16`;
  }
  const a = ARMOR[g.tier];
  return `Resistance ${a.resist}/16 · Weight ${a.weight}/16`;
}

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
    if ((wear || takesPlace) && next[gear.slot] === null) next[gear.slot] = gear.id;
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

/** Your choices for a slot, in order: nothing, then what you own for it. */
export const optionsFor = (inv: Inventory, slot: Slot): (Gear | null)[] => [null, ...inv.bag.filter(g => g.slot === slot)];

/** Wears the next (or previous) choice in a slot, wrapping round. */
export function cycleSlot(inv: Inventory, slot: Slot, by: 1 | -1): Inventory {
  const options = optionsFor(inv, slot);
  const at = Math.max(0, options.findIndex(g => (g?.id ?? null) === inv[slot]));
  const pick = options[(at + by + options.length) % options.length];
  return { ...inv, [slot]: pick?.id ?? null };
}
