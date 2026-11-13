/**
 * ItemCard.tsx — what an item is, shown in the middle of every item menu (the inventory, the guide's memories, a class's gear): the
 * item itself large, then below it, in this order, its name, its type (for a weapon, a bar of its cost and damage), its lore and its effects.
 */
import { gearName, type GearSpec, type Slot, weightLabel } from "./gear";
import { GearIcon, GearSprite } from "./GearIcons";
import { type ItemId, ITEMS } from "./items";
import { WEAPONS } from "../core/rules";
import { EFFECT, LORE } from "./lore";

/** What the card shows. */
export interface CardInfo {
  slot: Slot;
  tier: Parameters<typeof GearSprite>[0]["tier"];
  /** One of the starting classes' own pieces: its look. */
  item?: string;
  name: string;
  /** "Heavyweight weapon"... */
  type: string;
  lore?: string;
  effect?: string;
  /** Something to say instead of lore and effect (its dreams unread or faint). */
  note?: string;
}

const SLOT_NOUN: Record<Slot, string> = { weapon: "weapon", armor: "armor", head: "headgear" };

/** "Lightweight weapon", "Armor", "Heavyweight headgear"... */
function typeOf(slot: Slot, tier: CardInfo["tier"]): string {
  const weight = weightLabel({ slot, tier } as GearSpec)?.toLowerCase();
  const text = [weight ?? "", SLOT_NOUN[slot]].filter(Boolean).join(" ");
  return text[0].toUpperCase() + text.slice(1);
}

/** The card of a piece of gear (a starting class's own piece has its own lore and effect; any other, its tier's, once its dreams are read). */
export function cardOfGear(g: GearSpec): CardInfo {
  const info = g.item ? ITEMS[g.item] : undefined;
  const dreams = !g.eternal || !!g.read;
  const lore = dreams ? info?.lore ?? (g.slot === "weapon" && g.eternal ? LORE[g.tier] : undefined) : undefined;
  // Every weapon carries its effect; an ordinary one (not eternal) can't pay for it with Eternity, only with Death.
  const base = dreams ? (info && info.slot === "weapon" ? info.effect : g.slot === "weapon" && !info ? EFFECT[g.tier] : undefined) : undefined;
  const effect = base && !g.eternal ? `${base} Not eternal: paid in Death.` : base;
  const note = !dreams ? "Its dreams are unread." : g.eternal && !lore && !effect ? "Its dreams are faint." : undefined;
  return { slot: g.slot, tier: g.tier, item: g.item, name: gearName(g), type: typeOf(g.slot, g.tier), lore, effect, note };
}

/** The card of a starting class's own piece (always eternal). */
export function cardOfItem(id: ItemId): CardInfo {
  const info = ITEMS[id];
  return { slot: info.slot, tier: info.tier, item: id, name: info.name, type: typeOf(info.slot, info.tier), lore: info.lore, effect: info.slot === "weapon" ? info.effect : undefined };
}

/**
 * A weapon's measure, in place of its type: an empty bar like a health bar (the dark red of missing health), with white on its left as
 * long as the Fatigue an attack with it costs, and red on its right as long as the damage it deals, both in sixteenths of your health.
 */
function WeaponMeasure({ tier }: { tier: CardInfo["tier"] }) {
  const w = WEAPONS[tier as keyof typeof WEAPONS];
  if (!w) return null;
  const pct = (n: number) => `${(Math.min(16, n) / 16) * 100}%`;
  return (
    <div className="item-card-measure" role="img" aria-label={`Costs ${w.cost}/16 Fatigue to attack, deals ${w.damage}/16 damage`}>
      <i className="measure-cost" style={{ width: pct(w.cost) }} />
      <i className="measure-damage" style={{ width: pct(w.damage) }} />
    </div>
  );
}

/** The card: the item, and below it its name, type, lore and effects. Without `info`, nothing lies in the place: its faded icon and `empty` as the name. */
export function ItemCard({ info, slot, empty, note }: { info?: CardInfo; slot?: Slot; empty?: string; /** Replaces the card's own note. */ note?: string }) {
  if (!info) {
    return (
      <div className="item-card is-empty">
        <span className="inv-place-icon item-card-icon">{slot && <GearIcon slot={slot} />}</span>
        <div className="item-card-name">{empty ?? "Empty"}</div>
      </div>
    );
  }
  const shownNote = note ?? info.note;
  return (
    <div className="item-card">
      <span className="inv-place-icon item-card-icon"><GearSprite slot={info.slot} tier={info.tier} item={info.item} tilted /></span>
      <div className="item-card-name">{info.name}</div>
      {info.slot === "weapon" ? <WeaponMeasure tier={info.tier} /> : <div className="item-card-type">{info.type}</div>}
      {info.lore && <p className="item-card-lore">{info.lore}</p>}
      {info.effect && <p className="item-card-effect">{info.effect}</p>}
      {shownNote && <p className="item-card-lore">{shownNote}</p>}
    </div>
  );
}
