/**
 * Inventory.tsx — what you wield, as pictures: a row for the weapon and a row for the armor, each
 * with two square places, an eternal one on the left and an ordinary one on the right. An empty
 * place shows its icon faded; the place you wield from is filled in. The map screen handles the keys:
 * W/S and A/D move between places, E wields an unwielded place, or (on the one you wield) opens
 * the list of everything you own for that slot, to pick another. The way back to the menu is a button.
 */
import { GearIcon, GearSprite } from "./GearIcons";
import { equippedSide, type GearSpec, gearName, type Inventory as Bag, pieceAt, piecesFor, type Side, SIDES, type Slot, SLOTS } from "./gear";
import type { Knot } from "./tutorial";

/** The list of everything you own for a place (the eternal gear for an eternal place, the ordinary gear for the other), open over the places. */
export interface ChoiceList {
  slot: Slot;
  side: Side;
  /** Which entry is under the cursor. */
  at: number;
}

export function Inventory({ inv, knot, focus, onFocus, onActivate, list, onListHover, onListPick, swap }: {
  inv: Bag;
  knot?: Knot;
  /** 0-3: the places (weapon eternal, weapon ordinary, armor eternal, armor ordinary); 4: the way back to the main menu. */
  focus: number;
  onFocus: (i: number) => void;
  /** E or a click on a place (or the menu button). */
  onActivate: (i: number) => void;
  list?: ChoiceList;
  /** The mouse over an entry of the list (0 is "Unequip"), and a click on one. */
  onListHover?: (at: number) => void;
  onListPick?: (at: number) => void;
  /** Gear lying on the ground where you stand, that you could swap for what you wear (E): you leave what you wear in its place. */
  swap?: { gear: GearSpec; worn: GearSpec };
}) {
  const menu = SLOTS.length * SIDES.length;
  return (
    <div className="result" role="dialog" aria-label="Inventory">
      <div className="inventory">
        <h2 className="inventory-title">Inventory</h2>
        <div className="inv-rows">
          {SLOTS.map((slot: Slot, r) => {
            const wielded = equippedSide(inv, slot);
            return (
              <div key={slot} className="inv-row" role="group" aria-label={slot === "weapon" ? "Weapon" : "Armor"}>
                {SIDES.map((side, c) => {
                  const i = r * SIDES.length + c;
                  const piece = pieceAt(inv, slot, side);
                  const label = `${slot === "weapon" ? "Weapon" : "Armor"}, ${side}: ${piece ? gearName(piece) : "empty"}${wielded === side ? " (wielded)" : ""}`;
                  return (
                    <button
                      key={side}
                      className={`inv-slot is-${side} ${wielded === side ? "is-equipped" : ""} ${focus === i ? "is-focused" : ""}`}
                      onMouseEnter={() => onFocus(i)}
                      onClick={() => onActivate(i)}
                      aria-label={label}
                      title={piece ? gearName(piece) : undefined}
                    >
                      {piece ? <GearSprite slot={slot} tier={piece.tier} tilted /> : <GearIcon slot={slot} />}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        {list && (
          <div className="inv-list" role="listbox" aria-label="Everything you own for this place">
            <div
              role="option"
              aria-selected={list.at === 0}
              className={`inv-list-item ${list.at === 0 ? "is-focused" : ""} ${inv[list.slot] === null ? "is-equipped" : ""}`}
              onMouseEnter={() => onListHover?.(0)}
              onClick={() => onListPick?.(0)}
            >
              <span className="inv-list-name">Unequip</span>
            </div>
            {piecesFor(inv, list.slot, list.side).map((g, i) => (
              <div
                key={g.id}
                role="option"
                aria-selected={i + 1 === list.at}
                className={`inv-list-item ${i + 1 === list.at ? "is-focused" : ""} ${g.id === inv[list.slot] ? "is-equipped" : ""}`}
                onMouseEnter={() => onListHover?.(i + 1)}
                onClick={() => onListPick?.(i + 1)}
              >
                <GearSprite slot={g.slot} tier={g.tier} />
                <span className="inv-list-name">{gearName(g)}</span>
              </div>
            ))}
            <div className="inv-list-keys"><kbd>W</kbd><kbd>S</kbd> choose · <kbd>E</kbd> wield · <kbd>Q</kbd> back</div>
          </div>
        )}
        {swap && (
          <div className="inventory-swap">
            On the ground: <strong>{gearName(swap.gear)}</strong>
            <span> · <kbd>E</kbd> swap it for your {gearName(swap.worn).toLowerCase()} (which you leave here)</span>
          </div>
        )}
        {knot && (
          <div className="inventory-item">
            Knot · {knot === "wound" ? "wound: it will keep you from fading once" : "slack: rest with the guide to wind it again"}
          </div>
        )}
        <div className="inventory-note">You carry one ordinary weapon and one ordinary armor besides eternal gear. Falling loses all gear but the eternal.</div>
        {!list && <div className="inventory-keys"><kbd>W</kbd><kbd>S</kbd><kbd>A</kbd><kbd>D</kbd> move · <kbd>E</kbd> wield / choose · <kbd>Esc</kbd> close</div>}
      </div>
      <button className={`inventory-exit menu-button ${focus === menu ? "is-focused" : ""}`} onMouseEnter={() => onFocus(menu)} onClick={() => onActivate(menu)}>
        Back to main menu <span className="inventory-exit-note">(saves)</span>
      </button>
    </div>
  );
}
