/**
 * InventoryScreen.tsx — the inventory, opened on the map with E and closed with Q: the fight's
 * letterbox, your bars where they sit in a fight, your figure seen 3/4 from the front (wearing what
 * you wield, so a change shows at once), your gear in two columns, and the card of the piece under the
 * cursor in the middle.
 *
 * What you wear (head and armor) is in a column at the left edge, between it and your figure; your weapon
 * is on the right. Each slot shows only what you wear in it (its faded icon if nothing). W/S move within a
 * column, A/D switch between the two. E on a slot opens its options beside it (to the right of the worn gear,
 * to the left of the weapon, toward the middle): its eternal piece (once one is set there at a safe spot), its
 * ordinary piece, what lies within reach on the ground, and last, at the far end, Unequip. A/D run through them
 * (round and round); W/S leave them for the slot above or below, Q just closes them. E on an option wields it
 * (on the ground place, takes what lies there: a swap with your ordinary piece, if you have one), on Unequip takes
 * off what you wear, and on what you already wear does nothing; any of them closes the options. The map screen
 * does what E does (`onUse`).
 */
import { type CSSProperties, useState } from "react";
import { attackCost } from "../core/rules";
import type { Player } from "../core/types";
import { PlayerBars } from "../render/HealthBar";
import { PlayerFigure3D } from "../render/PlayerFigure3D";
import { useKeys, menuSound } from "../ui/input";
import { equippedSide, type GearSpec, gearName, type Inventory as Bag, loadoutOf, pieceAt, type Slot, SLOTS } from "./gear";
import { GearIcon, GearSprite } from "./GearIcons";
import { cardOfGear, ItemCard } from "./ItemCard";
import type { Knot } from "./tutorial";

/** The places a slot's gear can be in: set eternal, ordinary, or lying on the ground within reach. */
export type Place = "eternal" | "normal" | "ground";

/** Where the cursor starts (as the map asks: a slot by its row in `SLOTS`, and a place in it). */
export interface InvFocus {
  row: number;
  place: Place;
}

/** An option of an opened slot: a place, or taking off what you wear. */
type Option = Place | "unequip";

/** The two columns: what you wear at the left edge, your weapon on the right. */
type Column = "left" | "right";
const COLUMNS: Record<Column, Slot[]> = { left: ["head", "armor"], right: ["weapon"] };
const columnOf = (slot: Slot): Column => (COLUMNS.left.includes(slot) ? "left" : "right");

const SLOT_LABEL: Record<Slot, string> = { weapon: "Weapon", armor: "Armor", head: "Head" };

/** Where the cursor is: a slot (its column and row in it), and, with its options open, which one. */
interface Cursor {
  col: Column;
  row: number;
  /** The option under the cursor while the slot's options are open; null while they are closed. */
  at: number | null;
}

export function InventoryScreen({ inv, player, string, eternalString, knot, ground, start, onUse, onClose }: {
  inv: Bag;
  /** You as your bars show you: full health between fights, your revives and your Eternity. */
  player: Player;
  /** Your String, and your eternal String. */
  string?: number;
  eternalString?: number;
  /** The revive knot, once the guide has given it: it is no item here (its symbol and revives show beside your bars), but your bars need to know you have it. */
  knot?: Knot;
  /** What lies within reach on the ground, for each slot (the nearest). */
  ground: Partial<Record<Slot, GearSpec>>;
  /** Where the cursor starts: that slot's options open, on that piece (what lies on the ground, or what you just picked up). */
  start?: InvFocus;
  onUse: (slot: Slot, place: Place) => void;
  onClose: () => void;
}) {
  /** The place you wear the slot's piece from, if you wear one. */
  const wornPlace = (slot: Slot): "eternal" | "normal" | null => {
    const side = equippedSide(inv, slot), piece = side && pieceAt(inv, slot, side);
    return side && piece && inv[slot] === piece.id ? side : null;
  };
  /**
   * A slot's other options, in order out from it: its eternal and ordinary pieces (but the one you wear, which is the slot itself), what lies on the
   * ground, then Unequip (while you wear something).
   */
  const optionsOf = (slot: Slot): Option[] => {
    const worn = wornPlace(slot);
    return [
      ...(pieceAt(inv, slot, "eternal") && worn !== "eternal" ? ["eternal" as const] : []),
      ...(pieceAt(inv, slot, "normal") && worn !== "normal" ? ["normal" as const] : []),
      ...(ground[slot] ? ["ground" as const] : []),
      ...(worn ? ["unequip" as const] : []),
    ];
  };
  // (`at`, while a slot's options are open: 0 is the slot itself, what you wear; 1 on, its options in order.)
  const [cursor, setCursor] = useState<Cursor>(() => {
    if (!start) return { col: "right", row: 0, at: null };
    const slot = SLOTS[start.row] ?? "weapon", col = columnOf(slot), row = COLUMNS[col].indexOf(slot);
    // (Opened on a piece, as when you pick something up: that slot's options open, on it; on what lies there, if it is a swap to make, or on what you
    // just took, to wield it with E.)
    const at = optionsOf(slot).indexOf(start.place);
    return { col, row, at: at >= 0 ? at + 1 : null };
  });
  const slot = COLUMNS[cursor.col][Math.min(cursor.row, COLUMNS[cursor.col].length - 1)];
  const options = optionsOf(slot);
  // (An option can go while the list is open, as what lay on the ground is taken: the cursor stays in the list.)
  const at = cursor.at === null ? null : Math.min(cursor.at, options.length);
  const close = () => setCursor(c => ({ ...c, at: null }));

  useKeys(key => {
    menuSound(key);
    if (key === "back" || key === "pause") {
      if (at !== null) close();
      else onClose();
      return;
    }
    const rows = COLUMNS[cursor.col].length;
    if (key === "up" || key === "down") {
      // (Leaving an open list for the slot above or below closes it.)
      const row = Math.max(0, Math.min(rows - 1, cursor.row + (key === "up" ? -1 : 1)));
      setCursor({ col: cursor.col, row, at: null });
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
      // weapon's to its left.)
      const away = cursor.col === "left" ? key === "right" : key === "left", n = options.length + 1;
      setCursor({ ...cursor, at: (at + (away ? 1 : -1) + n) % n });
      return;
    }
    if (key !== "select") return;
    // Opened on the slot itself: what you wear.
    if (at === null) { setCursor({ ...cursor, at: 0 }); return; }
    const option = at === 0 ? null : options[at - 1], worn = wornPlace(slot);
    if (option === "unequip") { if (worn) onUse(slot, worn); }
    else if (option) onUse(slot, option);
    close();
  });

  const look = loadoutOf(inv);
  const pieceOf = (s: Slot, o: Option): GearSpec | null | undefined => (o === "unequip" ? null : o === "ground" ? ground[s] : pieceAt(inv, s, o));
  // The card: the option under the cursor, or what the slot holds (on the slot, or while its options are closed).
  const shownOption: Option | null = at ? options[at - 1] : wornPlace(slot);
  const shown = shownOption ? pieceOf(slot, shownOption) : null;
  // A weapon under the cursor: what an attack with it would cost flickers on your health bar, as when Attack is lit in a fight.
  const preview = shown?.slot === "weapon" ? attackCost(player, shown.tier) : 0;

  /** One place: the gear's sprite (its faded icon if empty, a cross for Unequip). `i` is an option's place in the row (1 on), for its slide. */
  const placeButton = (s: Slot, o: Option | "slot", focused: boolean, i = 0) => {
    const worn = wornPlace(s);
    const option: Option | null = o === "slot" ? worn : o;
    const piece = option ? pieceOf(s, option) : null;
    const kind = o === "slot" ? (worn ?? "normal") : o;
    return (
      <div
        key={o}
        className={`inv-place is-${kind} ${o === "slot" ? "is-slot" : "is-option"} ${o === "slot" && worn ? "is-equipped" : ""} ${focused ? "is-focused" : ""}`}
        style={i ? ({ "--i": i } as CSSProperties) : undefined}
        role="menuitem"
        aria-label={o === "unequip" ? `${SLOT_LABEL[s]}: unequip` : `${SLOT_LABEL[s]}${o === "slot" ? "" : `, ${o === "ground" ? "on the ground" : o}`}: ${piece ? gearName(piece) : "empty"}${o === "slot" && worn ? " (worn)" : ""}`}
      >
        <span className="inv-place-icon">
          {o === "unequip" ? <UnequipIcon /> : piece ? <GearSprite slot={s} tier={piece.tier} item={piece.item} tilted /> : <GearIcon slot={s} />}
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
      {COLUMNS[col].map(s => {
        const here = cursor.col === col && s === slot, open = here && at !== null;
        return (
          <div key={s} className={`inv-row ${open ? "is-open" : ""}`} role="group" aria-label={SLOT_LABEL[s]}>
            {placeButton(s, "slot", here && !at)}
            <div className="inv-sub" role="menu" aria-label={`${SLOT_LABEL[s]} options`} aria-hidden={!open}>
              {optionsOf(s).map((o, i) => placeButton(s, o, open && at === i + 1, i + 1))}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="inv-screen is-cinematic" role="dialog" aria-label="Inventory">
      <div className="letterbox letterbox-top" aria-hidden="true" />
      <div className="letterbox letterbox-bottom" aria-hidden="true" />
      {/* You, large, at the side: the bottom strip comes up to your knees (as in a visual novel). */}
      <div className="inv-figure">
        <PlayerFigure3D look={look} title="You" swayId="inventory" />
      </div>
      <PlayerBars player={player} preview={preview} string={string} eternalString={eternalString} knot={!!knot} />
      {/* The piece under the cursor, between you and the weapon. */}
      <div className="class-middle">
        <ItemCard key={`${slot}-${shownOption ?? "none"}`} slot={slot} info={shown ? cardOfGear(shown) : undefined} empty={shownOption === "unequip" ? "Unequip" : "Empty"} />
      </div>
      {/* What you wear, at the left edge, before your figure. */}
      {column("left")}
      {/* Your weapon, on the right. */}
      <div className="inv-stage">{column("right")}</div>
      <div className="inv-keys">
        {at === null
          ? <><kbd>W</kbd><kbd>S</kbd> slot · <kbd>A</kbd><kbd>D</kbd> side · <kbd>E</kbd> open · <kbd>Q</kbd> close</>
          : <><kbd>A</kbd><kbd>D</kbd> choose · <kbd>E</kbd> {!at ? "keep" : options[at - 1] === "ground" ? "take" : options[at - 1] === "unequip" ? "unequip" : "wield"} · <kbd>Q</kbd> back</>}
      </div>
    </div>
  );
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
