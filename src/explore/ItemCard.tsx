/**
 * ItemCard.tsx — what an item is, shown in the middle of every item menu (the inventory, the guide's memories, a class's gear): the
 * item itself large, then below it, in this order, its name, its type (for a weapon, a bar of its cost and damage), its lore and its effects; a
 * weapon's skills, each under a thin line: its name, its Eternity bar (`EternityMeasure`, as on the wheel) and what it does; for
 * armor and head gear, at the very bottom, the bar of its Resistance (`ResistMeasure`); for a weapon, there, the bar of its Defense (`DefenseMeasure`).
 */
import { gearName, type GearSpec, pieceWeight, type Slot, weightLabel } from "./gear";
import { GearIcon, GearSprite } from "./GearIcons";
import { type ItemId, ITEMS } from "./items";
import { blowShares, defenseOf, WEAPON_EFFECTS, WEAPONS, weaponOf } from "../core/rules";
import type { WeaponItem, WeaponTier } from "../core/types";
import { EFFECT, LORE } from "./lore";
import { type SkillId, SKILLS, skillsOfWeapon } from "../core/skills";

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
  /** Armor or head gear: what it weighs (the Resistance it adds, a share of a blow). */
  weight?: number;
  /** A weapon: its Defense (the share of a blow a Block made with it stops). */
  defense?: number;
  /** A weapon: the skills it gives the hand that holds it. */
  skills?: SkillId[];
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
  // (The weapons' effects are off for now: none is shown.)
  const effect = !WEAPON_EFFECTS && g.slot === "weapon" ? undefined : base && !g.eternal ? `${base} Not eternal: paid in Death.` : base;
  const note = !dreams ? "Its dreams are unread." : g.eternal && !lore && !effect ? "Its dreams are faint." : undefined;
  // (A weapon's skills show once its dreams are read, as its lore does.)
  const skills = g.slot === "weapon" && dreams ? skillsOfWeapon(g.item as WeaponItem | undefined) : [];
  return { slot: g.slot, tier: g.tier, item: g.item, name: gearName(g), type: typeOf(g.slot, g.tier), lore, effect, note, ...(g.slot !== "weapon" ? { weight: pieceWeight(g) } : { defense: defenseOf(g.tier, g.item as WeaponItem | undefined), skills }) };
}

/** The card of a starting class's own piece (always eternal). */
export function cardOfItem(id: ItemId): CardInfo {
  const info = ITEMS[id];
  return { slot: info.slot, tier: info.tier, item: id, name: info.name, type: typeOf(info.slot, info.tier), lore: info.lore, effect: info.slot === "weapon" && WEAPON_EFFECTS ? info.effect : undefined, ...(info.slot !== "weapon" ? { weight: info.weight } : { defense: defenseOf(info.tier, id as WeaponItem), skills: skillsOfWeapon(id as WeaponItem) }) };
}

/**
 * A weapon's measure, in place of its type: a thin bar, empty between its ends, as long as your max health. On its left, white as long as the
 * Fatigue an attack with it costs; on its right, from the end: black as long as the Death it puts on its target (Deadly), the dark red of missing
 * health as long as the damage it deals, and white just before that as long as the Fatigue it puts on its target (Poise).
 */
function WeaponMeasure({ tier, item }: { tier: CardInfo["tier"]; item?: string }) {
  if (!(tier in WEAPONS)) return null;
  const b = blowShares(weaponOf(tier as keyof typeof WEAPONS, item as WeaponItem | undefined));
  const pct = (n: number) => `${Math.max(0, Math.min(1, n)) * 100}%`;
  const say = (n: number) => `${Math.round(n * 100)}%`;
  const label = `Costs ${say(b.cost)} of your health in Fatigue to attack; deals ${say(b.damage)} damage${b.poise ? `, ${say(b.poise)} Fatigue` : ""}${b.deadly ? `, ${say(b.deadly)} Death` : ""}`;
  return (
    <div className="item-card-measure" role="img" aria-label={label}>
      <i className="measure-cost" style={{ left: 0, width: pct(b.cost) }} />
      {b.deadly > 0 && <i className="measure-death" style={{ right: 0, width: pct(b.deadly) }} />}
      <i className="measure-damage" style={{ right: pct(b.deadly), width: pct(b.damage) }} />
      {b.poise > 0 && <i className="measure-poise" style={{ right: pct(b.deadly + b.damage), width: pct(b.poise) }} />}
    </div>
  );
}

/**
 * A Resistance bar: how much of a blow is taken and how much turns into Fatigue instead. All of it the dark red of missing health but its left end,
 * white for the share that turns into Fatigue (`share`, 0 to 1). With `to`, a change about to be made: the white it would gain flickering white past
 * it, or the white it would lose flickering red.
 */
export function ResistMeasure({ share, to }: { share: number; to?: number }) {
  const pct = (n: number) => `${Math.max(0, Math.min(1, n)) * 100}%`;
  const label = `Resistance: ${Math.round(share * 100)}% of a blow turns into Fatigue${to !== undefined && Math.abs(to - share) > 1e-9 ? `, ${Math.round(to * 100)}% with this` : ""}`;
  return (
    <div className="resist-measure" role="img" aria-label={label}>
      <i className="resist-share" style={{ width: pct(share) }} />
      <i className="resist-missing" style={{ left: pct(share), right: 0 }} />
      {to !== undefined && to > share + 1e-9 && <i className="resist-gain" style={{ left: pct(share), width: pct(to - share) }} />}
      {to !== undefined && to < share - 1e-9 && <i className="resist-loss" style={{ left: pct(to), width: pct(share - to) }} />}
    </div>
  );
}

/**
 * A skill's Eternity bar, as on the wheel: as long as your max Eternity, Eternity's pale blue from the left for the share of it the skill spends,
 * empty (the card showing through) past it.
 */
export function EternityMeasure({ share }: { share: number }) {
  const pct = Math.max(0, Math.min(1, share)) * 100;
  return (
    <div className="eternity-measure" role="img" aria-label={`Spends ${Math.round(share * 100)}% of your max Eternity`}>
      <i className="eternity-spent" style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * A Defense bar: what a Block made with the weapon lets through, missing health's dark red from the left (the blow's share that comes through), and empty on the
 * right for the share it stops (`defense`, 0 to 1). The Resistance bar's thin, rounded shape.
 */
export function DefenseMeasure({ defense }: { defense: number }) {
  const through = Math.max(0, Math.min(1, 1 - defense));
  return (
    <div className="defense-measure" role="img" aria-label={`Defense: a Block with it stops ${Math.round(defense * 100)}% of a blow`}>
      <i className="defense-through" style={{ width: `${through * 100}%` }} />
    </div>
  );
}

/** The card: the item, and below it its name, type, lore and effects. Without `info`, nothing lies in the place: its faded icon and `empty` as the name. */
export function ItemCard({ info, slot, empty, note, mirrored, measure, vanish = 0 }: {
  info?: CardInfo; slot?: Slot; empty?: string; /** Replaces the card's own note. */ note?: string;
  /** An empty place: its icon mirrored (the left hand's mitten). */
  mirrored?: boolean;
  /** An empty place: the measure to show under its name (an empty hand's: the bare hands' cost and damage). */
  measure?: WeaponTier;
  /** How far it is from being dropped (0 to 1, as No is held): its picture shrinks away to nothing. */
  vanish?: number;
}) {
  if (!info) {
    return (
      <div className="item-card is-empty">
        <span className="inv-place-icon item-card-icon">{slot && <GearIcon slot={slot} mirrored={mirrored} />}</span>
        <div className="item-card-name">{empty ?? "Empty"}</div>
        {measure && <WeaponMeasure tier={measure} />}
        {measure && <DefenseMeasure defense={WEAPONS[measure].defense} />}
      </div>
    );
  }
  const shownNote = note ?? info.note;
  return (
    <div className="item-card">
      <span className="inv-place-icon item-card-icon" style={vanish > 0 ? { transform: `scale(${1 - vanish})` } : undefined}><GearSprite slot={info.slot} tier={info.tier} item={info.item} tilted /></span>
      <div className="item-card-name">{info.name}</div>
      {info.slot === "weapon" ? <WeaponMeasure tier={info.tier} item={info.item} /> : <div className="item-card-type">{info.type}</div>}
      {info.lore && <p className="item-card-lore">{info.lore}</p>}
      {info.effect && <p className="item-card-effect">{info.effect}</p>}
      {shownNote && <p className="item-card-lore">{shownNote}</p>}
      {info.skills?.map(id => (
        <div key={id} className="item-card-skill">
          <hr className="item-card-sep" />
          <div className="item-card-skill-name">{SKILLS[id].name}</div>
          <EternityMeasure share={SKILLS[id].scaling} />
          <p className="item-card-effect">{SKILLS[id].text}</p>
        </div>
      ))}
      {info.weight !== undefined && <ResistMeasure share={info.weight} />}
      {info.defense !== undefined && <DefenseMeasure defense={info.defense} />}
    </div>
  );
}
