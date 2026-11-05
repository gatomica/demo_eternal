/**
 * InventoryScreen.tsx — the inventory, opened on the map with E and closed with Q: the fight's
 * letterbox, your bars where they sit in a fight, your figure seen 3/4 from the front (wearing what
 * you wield, so a change shows at once), and beside it a column of slots.
 *
 * Each slot (weapon, armor; passive items would be more rows) is a row of places, picked with W/S
 * and A/D: the eternal place on the left (only once a piece is set there at a safe spot), the ordinary
 * place, and, while gear of that slot lies within reach, the place "on the ground". A place shows only the
 * gear's sprite; the one under the cursor stretches to show its name and its weight. The place you
 * wield from is highlighted. E on a place: wields it, or unequips it if you already wield it; on the
 * ground place, takes what lies there (a swap with your ordinary piece, if you have one: that one is
 * left on the ground). The map screen does what E does (`onUse`).
 */
import { useState } from "react";
import type { Player } from "../core/types";
import { PlayerBars } from "../render/HealthBar";
import { StickFigure } from "../render/StickFigure";
import { useKeys } from "../ui/input";
import { equippedSide, type GearSpec, gearName, type Inventory as Bag, loadoutOf, pieceAt, type Slot, SLOTS, weightLabel } from "./gear";
import { GearIcon, GearSprite } from "./GearIcons";

/** The places of a row, left to right. */
export type Place = "eternal" | "normal" | "ground";

export interface InvFocus {
  row: number;
  place: Place;
}

const SLOT_LABEL: Record<Slot, string> = { weapon: "Weapon", armor: "Armor" };

export function InventoryScreen({ inv, player, ground, start, onUse, onClose }: {
  inv: Bag;
  /** You as your bars show you: full health between fights, your revives and your Eternity. */
  player: Player;
  /** What lies within reach on the ground, for each slot (the nearest). */
  ground: Partial<Record<Slot, GearSpec>>;
  /** Where the cursor starts (on the ground place, when you opened it to pick something up). */
  start?: InvFocus;
  onUse: (slot: Slot, place: Place) => void;
  onClose: () => void;
}) {
  const [focus, setFocus] = useState<InvFocus>(start ?? { row: 0, place: equippedSide(inv, "weapon") ?? "normal" });
  // (The eternal place only shows once something is set there at a safe spot; the ground place while something lies within reach.)
  const placesOf = (slot: Slot): Place[] => [
    ...(pieceAt(inv, slot, "eternal") ? ["eternal" as const] : []),
    "normal" as const,
    ...(ground[slot] ? ["ground" as const] : []),
  ];
  // (The ground place goes when what lay there is taken: the cursor steps back onto the ordinary one.)
  const row = Math.min(focus.row, SLOTS.length - 1);
  const place = placesOf(SLOTS[row]).includes(focus.place) ? focus.place : "normal";

  useKeys(key => {
    if (key === "back" || key === "pause") onClose();
    else if (key === "up" || key === "down") {
      const next = Math.max(0, Math.min(SLOTS.length - 1, row + (key === "up" ? -1 : 1)));
      const places = placesOf(SLOTS[next]);
      setFocus({ row: next, place: places.includes(place) ? place : "normal" });
    } else if (key === "left" || key === "right") {
      const places = placesOf(SLOTS[row]);
      const i = Math.max(0, Math.min(places.length - 1, places.indexOf(place) + (key === "left" ? -1 : 1)));
      setFocus({ row, place: places[i] });
    } else if (key === "select") onUse(SLOTS[row], place);
  });

  const look = loadoutOf(inv);
  return (
    <div className="inv-screen is-cinematic" role="dialog" aria-label="Inventory">
      <div className="letterbox letterbox-top" aria-hidden="true" />
      <div className="letterbox letterbox-bottom" aria-hidden="true" />
      {/* You, large, at the side: the bottom strip comes up to your knees (as in a visual novel). */}
      <div className="inv-figure">
        <StickFigure view="front" foe={false} pose="idle" weapon={look.weapon} armor={look.armor} title="You" />
      </div>
      <PlayerBars player={player} />
      <div className="inv-stage">
        <div className="inv-column">
          {SLOTS.map((slot, r) => {
            const wielded = equippedSide(inv, slot);
            return (
              <div key={slot} className="inv-row" role="group" aria-label={SLOT_LABEL[slot]}>
                <span className="inv-row-label">{SLOT_LABEL[slot]}</span>
                {placesOf(slot).map(p => {
                  const piece = p === "ground" ? ground[slot] : pieceAt(inv, slot, p);
                  const focused = r === row && p === place;
                  const weight = piece && weightLabel(piece);
                  // (Bare-handed, or with no armor, no place is highlighted.)
                  const worn = !!piece && p !== "ground" && wielded === p && "id" in piece && inv[slot] === piece.id;
                  return (
                    <button
                      key={p}
                      className={`inv-place is-${p} ${worn ? "is-equipped" : ""} ${focused ? "is-focused" : ""} ${focused && piece ? "is-open" : ""}`}
                      onMouseEnter={() => setFocus({ row: r, place: p })}
                      onClick={() => onUse(slot, p)}
                      aria-label={`${SLOT_LABEL[slot]}, ${p === "ground" ? "on the ground" : p}: ${piece ? gearName(piece) : "empty"}${worn ? " (wielded)" : ""}`}
                    >
                      <span className="inv-place-icon">
                        {piece ? <GearSprite slot={slot} tier={piece.tier} tilted /> : <GearIcon slot={slot} />}
                      </span>
                      {focused && piece && (
                        <span className="inv-place-text">
                          <span className="inv-place-name">{gearName(piece)}</span>
                          {weight && <span className="inv-place-weight">{weight}</span>}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <div className="inv-keys">
        <kbd>W</kbd><kbd>S</kbd> slot · <kbd>A</kbd><kbd>D</kbd> place · <kbd>E</kbd> {place === "ground" ? "take" : "wield / unequip"} · <kbd>Q</kbd> close
      </div>
    </div>
  );
}
