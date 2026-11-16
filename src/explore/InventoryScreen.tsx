/**
 * InventoryScreen.tsx — the inventory, opened on the map with E and closed with Q: the fight's
 * letterbox, your bars where they sit in a fight, your figure seen 3/4 from the front (wearing what
 * you wield, so a change shows at once), your gear in two columns, and the card of the piece under the
 * cursor in the middle. To drop an ordinary piece, hold No for a second (`DROP_HOLD_MS`; its picture shrinking away as you hold): inside a slot's options, on the piece under the
 * cursor; in the pickup view, on the card hovered. A tap of No inside the options closes them.
 *
 * What you wear (head and armor) is in a column at the left edge, between it and your figure; your hands are on the right, the Right hand
 * above the Left. Each slot shows only what it holds (its faded icon if nothing). W/S move within a column, A/D switch between the two. E on a
 * slot opens its options beside it (to the right of the worn gear, to the left of the hands, toward the middle): every piece it could take but
 * the one it holds (its eternal piece, once one is set there at a safe spot; the ordinary gear you carry), and last, at the far end, Unequip.
 * The two hands share the ordinary weapons (the one the other hand holds is listed with the "equipped" background, and picking it moves it
 * over); an eternal weapon is locked to the hand it was set to in Dreams. A/D run through the options (round and round); W/S leave them for the
 * slot above or below, and Q (or Esc) closes them; holding Q drops the ordinary piece under the cursor (never an eternal one; on the slots
 * themselves Q closes the inventory). E on an option equips it, on Unequip takes off what you wear, and on what you already wear does nothing;
 * any of them closes the options.
 *
 * Picking something up (`pickup`) opens it on that piece instead: its card in the middle, E OK and hold Q Drop below it (a memory: OK only).
 * Past what you may carry of that kind (`CARRY` in gear.ts), the ones you carry stand beside it (the weapons by the hand that holds them, the
 * left hand's on the left and the right hand's on the right; armor and head gear on its right), A/D hover each, and there is no OK: you drop one.
 * Either way (OK or a drop) the inventory closes, back to the map.
 */
import { type CSSProperties, useState } from "react";
import { attackCost } from "../core/rules";
import type { Player, WeaponItem } from "../core/types";
import { PlayerBars } from "../render/HealthBar";
import { PlayerFigure3D } from "../render/PlayerFigure3D";
import { useKeyHold, useKeys, menuSound } from "../ui/input";
import { Kbd } from "../ui/Kbd";
import { carried, type Gear, gearName, type Inventory as Bag, loadoutOf, otherHand, overLimit, pieceAt, pieceWeight, type Place, slotOf, wornIn, wornWeightOf } from "./gear";
import { GearIcon, GearSprite } from "./GearIcons";
import { cardOfGear, ItemCard, ResistMeasure } from "./ItemCard";
import type { Knot } from "./tutorial";

/** How long No is held to drop a piece (ms). */
const DROP_HOLD_MS = 1000;

/** A row of the inventory: a place gear is worn in (the Right hand is `weapon`). */
export type Row = Place;

/** An option of an opened slot: a piece you own (by id), or taking off what you wear. */
type Option = string | "unequip";

/** The two columns: what you wear at the left edge, your hands on the right. */
type Column = "left" | "right";
const COLUMNS: Record<Column, Row[]> = { left: ["head", "armor"], right: ["weapon", "left"] };

const ROW_LABEL: Record<Row, string> = { weapon: "Right hand", left: "Left hand", armor: "Armor", head: "Head" };

/** Where the cursor is: a slot (its column and row in it), and, with its options open, which one. */
interface Cursor {
  col: Column;
  row: number;
  /** The option under the cursor while the slot's options are open; null while they are closed. */
  at: number | null;
}

export function InventoryScreen({ inv, player, string, eternalString, knot, pickup, onUse, onDrop, onPickupDone, onClose }: {
  inv: Bag;
  /** You as your bars show you: full health between fights, your revives and your Eternity. */
  player: Player;
  /** Your String, and your eternal String. */
  string?: number;
  eternalString?: number;
  /** The revive knot, once the guide has given it: it is no item here (its symbol and revives show beside your bars), but your bars need to know you have it. */
  knot?: Knot;
  /** The piece you just picked up (its id in the bag): the screen opens on it, to keep it or drop it (or, past the limit, to drop one). */
  pickup?: string;
  /** Wields this piece in this place, or nothing (`null`). */
  onUse: (place: Place, id: string | null) => void;
  /** Lets go of this piece: it is left on the ground where you stand. */
  onDrop: (id: string) => void;
  /** The pickup is settled (kept with OK, or a piece dropped): the inventory closes. */
  onPickupDone: () => void;
  onClose: () => void;
}) {
  /** The piece a row holds, if any. */
  const wornOf = (r: Row): Gear | undefined => wornIn(inv, r);
  /** The weapon the other hand holds, for a hand's row (listed with the "equipped" background: picking it moves it over). */
  const heldByOther = (r: Row): Gear | undefined => (r === "weapon" || r === "left" ? wornIn(inv, otherHand(r)) : undefined);
  /**
   * A row's other options, in order out from it: its eternal piece and the ordinary gear you carry (but the one it holds, which is the slot
   * itself), then Unequip (while it holds something). The hands share the ordinary weapons; each lists only its own eternal one.
   */
  const optionsOf = (r: Row): Option[] => {
    const worn = wornOf(r);
    const pieces = [pieceAt(inv, r, "eternal"), ...carried(inv, slotOf(r))].filter((g): g is Gear => !!g && g.id !== worn?.id);
    return [...pieces.map(g => g.id), ...(worn ? ["unequip" as const] : [])];
  };
  // (`at`, while a slot's options are open: 0 is the slot itself, what it holds; 1 on, its options in order.)
  const [cursor, setCursor] = useState<Cursor>({ col: "right", row: 0, at: null });
  const row = COLUMNS[cursor.col][Math.min(cursor.row, COLUMNS[cursor.col].length - 1)];
  const options = optionsOf(row);
  // (An option can go while the list is open: the cursor stays in the list.)
  const at = cursor.at === null ? null : Math.min(cursor.at, options.length);
  const close = () => setCursor(c => ({ ...c, at: null }));
  /** The ordinary piece under the cursor in an open slot (the slot itself is what it holds), which Q drops. */
  const droppable = (() => {
    if (at === null) return undefined;
    const g = at === 0 ? wornOf(row) : inv.bag.find(x => x.id === options[at - 1]);
    return g && !g.eternal ? g : undefined;
  })();

  /* ---------- the pickup: the piece you just took, and (past the limit) the ones you carry of its kind beside it ---------- */
  const found = pickup ? inv.bag.find(g => g.id === pickup) : undefined;
  const over = !!found && !found.eternal && overLimit(inv, found.slot);
  /** The cards shown, left to right, and which is the piece just found. */
  const pickupCards: Gear[] = (() => {
    if (!found) return [];
    if (!over) return [found];
    const others = carried(inv, found.slot).filter(g => g.id !== found.id);
    if (found.slot !== "weapon") return [found, ...others];
    // Weapons stand by the hand that holds them: the left hand's on the left, the right hand's on the right; one held in neither fills the free side.
    const right = others.find(g => g.id === inv.weapon), left = others.find(g => g.id === inv.left);
    const rest = others.filter(g => g !== right && g !== left);
    return [left ?? rest.shift(), found, right ?? rest.shift()].filter((g): g is Gear => !!g);
  })();
  const [hover, setHover] = useState<string | null>(null);
  const hovered = pickupCards.find(g => g.id === hover) ?? found;

  // Dropping a piece is holding No: the card hovered in the pickup (never a memory), or the ordinary piece under the cursor in a slot's options (an
  // eternal one, Unequip or an empty hand: nothing to drop). Tapped inside the options, No only closes them; in the pickup it does nothing.
  const holdable = found ? !!hovered && !hovered.eternal : !!droppable;
  const dropping = useKeyHold("back", DROP_HOLD_MS, holdable, () => {
    if (found) { if (hovered && !hovered.eternal) { onDrop(hovered.id); setHover(null); onPickupDone(); } }
    else if (droppable) onDrop(droppable.id);
  }, () => { if (!found) close(); });

  useKeys(key => {
    menuSound(key);
    // (No, while a piece could be dropped, is the hold's: see `dropping`.)
    if (key === "back" && holdable) return;
    if (found) {
      // The pickup: OK keeps it (not past the limit), holding Drop lets go of the piece hovered; nothing else leaves it.
      if (key === "left" || key === "right") {
        const i = pickupCards.findIndex(g => g.id === hovered?.id), j = Math.max(0, Math.min(pickupCards.length - 1, i + (key === "left" ? -1 : 1)));
        setHover(pickupCards[j].id);
      } else if (key === "select" && !over) { setHover(null); onPickupDone(); }
      return;
    }
    // Inside a slot's options, Q (or Esc) closes them; on the slots themselves Q closes the inventory.
    if (key === "back" || key === "pause") {
      if (at !== null) close();
      else onClose();
      return;
    }
    const rows = COLUMNS[cursor.col].length;
    if (key === "up" || key === "down") {
      // (Leaving an open list for the slot above or below closes it.)
      setCursor({ col: cursor.col, row: Math.max(0, Math.min(rows - 1, cursor.row + (key === "up" ? -1 : 1))), at: null });
      return;
    }
    if (key === "left" || key === "right") {
      if (at === null) {
        // Closed: across to the other column.
        const col: Column = key === "left" ? "left" : "right";
        if (col !== cursor.col) setCursor({ col, row: Math.min(cursor.row, COLUMNS[col].length - 1), at: null });
        return;
      }
      // Open: along the slot and its options, away from the slot or back toward it, round and round. (The worn gear's open to their right, the
      // hands' to their left.)
      const away = cursor.col === "left" ? key === "right" : key === "left", n = options.length + 1;
      setCursor({ ...cursor, at: (at + (away ? 1 : -1) + n) % n });
      return;
    }
    if (key !== "select") return;
    // Opened on the slot itself: what it holds.
    if (at === null) { setCursor({ ...cursor, at: 0 }); return; }
    const option = at === 0 ? null : options[at - 1];
    if (option === "unequip") onUse(row, null);
    else if (option) onUse(row, option);
    close();
  });

  const look = loadoutOf(inv);
  const pieceOf = (o: Option): Gear | null => (o === "unequip" ? null : inv.bag.find(g => g.id === o) ?? null);
  // The card: the option under the cursor, or what the slot holds (on the slot, or while its options are closed).
  const shownOption: Option | null = at ? options[at - 1] : null;
  const shown = shownOption ? pieceOf(shownOption) : wornOf(row) ?? null;
  // A weapon under the cursor: what an attack with it would cost flickers on your health bar, as when Attack is lit in a fight.
  const card = found ? hovered : shown;
  const preview = card?.slot === "weapon" ? attackCost(player, card.tier, card.item as WeaponItem | undefined) : 0;
  // Your Resistance, all you wear together; on an armor or head gear option, what it would be with that one on (or with nothing, on Unequip).
  const resist = wornWeightOf(inv);
  const resistTo = (row === "armor" || row === "head") && at
    ? resist - (wornOf(row) ? pieceWeight(wornOf(row)!) : 0) + (shownOption === "unequip" || !shown ? 0 : pieceWeight(shown))
    : undefined;
  /** The icon a row shows when it is empty: the hands are mittens (the left one mirrored). */
  const emptyIcon = (r: Row) => <GearIcon slot={r === "left" ? "weapon" : r} mirrored={r === "left"} />;

  /** One place: the gear's sprite (its faded icon if empty, a cross for Unequip). `i` is an option's place in the row (1 on), for its slide. */
  const placeButton = (r: Row, o: Option | "slot", focused: boolean, i = 0) => {
    const worn = wornOf(r);
    const piece = o === "slot" ? worn ?? null : pieceOf(o);
    const kind = o === "unequip" ? "unequip" : piece?.eternal ? "eternal" : "normal";
    return (
      <div
        key={o}
        className={`inv-place is-${kind} ${o === "slot" ? "is-slot" : "is-option"} ${(o === "slot" && worn) || (o !== "slot" && piece && piece.id === heldByOther(r)?.id) ? "is-equipped" : ""} ${focused ? "is-focused" : ""}`}
        style={i ? ({ "--i": i } as CSSProperties) : undefined}
        role="menuitem"
        aria-label={o === "unequip" ? `${ROW_LABEL[r]}: unequip` : `${ROW_LABEL[r]}: ${piece ? gearName(piece) : "empty"}${o === "slot" && worn ? " (worn)" : o !== "slot" && piece && piece.id === heldByOther(r)?.id ? " (in the other hand)" : ""}`}
      >
        {/* (the piece being dropped, as No is held: shrinking away to nothing) */}
        <span className="inv-place-icon" style={focused && piece && piece.id === droppable?.id && dropping > 0 ? { transform: `scale(${1 - dropping})` } : undefined}>
          {o === "unequip" ? <UnequipIcon /> : piece ? <GearSprite slot={piece.slot} tier={piece.tier} item={piece.item} tilted /> : emptyIcon(r)}
        </span>
      </div>
    );
  };
  /**
   * A column: each slot, its options beside it. They are always there, tucked under the slot and hidden; opening it slides them out from beneath it to
   * their places (and closing it slides them back under).
   */
  const column = (col: Column) => (
    <div className={`inv-gear-col is-${col}`}>
      {COLUMNS[col].map(r => {
        const here = cursor.col === col && r === row, open = here && at !== null;
        return (
          <div key={r} className={`inv-row ${open ? "is-open" : ""}`} role="group" aria-label={ROW_LABEL[r]}>
            {placeButton(r, "slot", here && !at)}
            <div className="inv-sub" role="menu" aria-label={`${ROW_LABEL[r]} options`} aria-hidden={!open}>
              {optionsOf(r).map((o, i) => placeButton(r, o, open && at === i + 1, i + 1))}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className={`inv-screen is-cinematic ${found ? "is-pickup" : ""}`} role="dialog" aria-label="Inventory">
      <div className="letterbox letterbox-top" aria-hidden="true" />
      <div className="letterbox letterbox-bottom" aria-hidden="true" />
      {/* You, large, at the side: the bottom strip comes up to your knees (as in a visual novel). */}
      <div className="inv-figure">
        <PlayerFigure3D look={look} title="You" swayId="inventory" />
      </div>
      <PlayerBars player={player} preview={preview} string={string} eternalString={eternalString} knot={!!knot} />
      {/* Your Resistance, at the bottom left just above the strip (a change about to be made flickering on it). */}
      <div className="inv-resist">
        <ResistMeasure share={resist} to={resistTo} />
      </div>
      {found ? (
        // What you just picked up, and past the limit the ones you carry of its kind beside it; the keys under the one hovered.
        <div className={`inv-pickup ${pickupCards.length > 1 ? "is-over" : ""}`} role="group" aria-label="Picked up">
          {pickupCards.map(g => (
            <div key={g.id} className={`inv-pickup-card ${g.id === hovered?.id ? "is-focused" : ""} ${g.id === found.id ? "is-found" : ""}`}>
              <ItemCard slot={g.slot} info={cardOfGear(g)} vanish={g.id === hovered?.id ? dropping : 0} />
              <div className="inv-pickup-keys" aria-hidden={g.id !== hovered?.id}>
                {!over && <><Kbd k="yes" /> OK</>}
                {!over && !g.eternal && " · "}
                {!g.eternal && <>hold <Kbd k="no" /> Drop<HoldMeter progress={g.id === hovered?.id ? dropping : 0} /></>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        // The piece under the cursor, between you and your hands.
        <div className="class-middle">
          {/* (An empty hand is named for the hand, with the bare hands' cost and damage under it.) */}
          <ItemCard key={`${row}-${shownOption ?? "none"}`} slot={slotOf(row)} info={shown ? cardOfGear(shown) : undefined} vanish={shown && shown.id === droppable?.id ? dropping : 0}
            mirrored={row === "left"} measure={shownOption !== "unequip" && (row === "left" || row === "weapon") ? "baseline" : undefined}
            empty={shownOption === "unequip" ? "Unequip" : ROW_LABEL[row] === "Armor" || ROW_LABEL[row] === "Head" ? "Empty" : ROW_LABEL[row]} />
        </div>
      )}
      {/* What you wear, at the left edge, before your figure. */}
      {column("left")}
      {/* Your hands, on the right. */}
      <div className="inv-stage">{column("right")}</div>
      <div className="inv-keys">
        {found
          ? over ? <><Kbd k="left" /><Kbd k="right" /> choose · drop one to carry on</> : null
          : at === null
            ? <><Kbd k="up" /><Kbd k="down" /> slot · <Kbd k="left" /><Kbd k="right" /> side · <Kbd k="yes" /> open · <Kbd k="no" /> close</>
            : <><Kbd k="left" /><Kbd k="right" /> choose · <Kbd k="yes" /> {!at ? "keep" : options[at - 1] === "unequip" ? "unequip" : "Equip"} · <Kbd k="no" /> back{droppable && <> · hold <Kbd k="no" /> drop<HoldMeter progress={dropping} /></>}</>}
      </div>
    </div>
  );
}

/** How far a hold to drop has gone: a small bar filling beside its key's words (nothing until it starts). */
function HoldMeter({ progress }: { progress: number }) {
  return <span className={`hold-meter ${progress > 0 ? "is-holding" : ""}`} aria-hidden="true"><i style={{ width: `${progress * 100}%` }} /></span>;
}

/** The Unequip place: a faded circle crossed through. */
function UnequipIcon() {
  return (
    <svg viewBox="0 0 48 48" className="gear-icon is-faded is-unequip" aria-hidden="true">
      <circle cx={24} cy={24} r={13} fill="none" stroke="currentColor" strokeWidth={3.5} />
      <line x1={15} y1={33} x2={33} y2={15} stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" />
    </svg>
  );
}
