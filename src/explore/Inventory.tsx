/**
 * Inventory.tsx — what you carry: a slot for a weapon and one for armor, the rest of the bag, and
 * the knot. The map screen handles the keys (W/S pick a slot, A/D change what's in it).
 */
import { type Gear, gearName, gearStats, type Inventory as Bag, optionsFor, SLOT_LABELS, SLOTS } from "./gear";
import type { Knot } from "./tutorial";

/** What an empty slot means: bare hands fight at baseline weight, and no armor still resists a little. */
const EMPTY = {
  weapon: { name: "Bare hands", stats: "Damage 1/16 · Block +0/16 · Cost 1/16" },
  armor: { name: "Nothing", stats: "Resistance 1/16 · Weight 0/16" },
};

export function Inventory({ inv, knot, focus, onFocus, onExit }: {
  inv: Bag;
  knot?: Knot;
  /** 0 and 1: the slots; 2: the way back to the main menu, in the corner. */
  focus: number;
  onFocus: (i: number) => void;
  onExit: () => void;
}) {
  const worn = (id: string | null) => inv.bag.find(g => g.id === id);
  const unworn = inv.bag.filter(g => g.id !== inv.weapon && g.id !== inv.armor);
  const tag = (g: Gear) => (g.eternal ? " · eternal" : "");
  return (
    <div className="result" role="dialog" aria-label="Inventory">
      <div className="inventory">
        <h2 className="inventory-title">Inventory</h2>
        <div className="inventory-slots">
          {SLOTS.map((slot, i) => {
            const piece = worn(inv[slot]);
            return (
              <div key={slot} className={`inventory-slot ${i === focus ? "is-focused" : ""}`} onMouseEnter={() => onFocus(i)}>
                <span className="inventory-slot-label">{SLOT_LABELS[slot]}</span>
                <span className="inventory-slot-name">{piece ? `${gearName(piece)}${tag(piece)}` : EMPTY[slot].name}</span>
                <span className="inventory-slot-stats">{piece ? gearStats(piece) : EMPTY[slot].stats}</span>
                {optionsFor(inv, slot).length > 1 && <span className="inventory-slot-hint">◂ A / D ▸</span>}
              </div>
            );
          })}
        </div>
        <div className="inventory-bag">
          <div className="inventory-bag-title">In your bag</div>
          {unworn.length === 0 && !knot && <div className="inventory-empty">Nothing else.</div>}
          {unworn.map(g => <div key={g.id} className="inventory-item">{gearName(g)}{tag(g)}</div>)}
          {knot && (
            <div className="inventory-item">
              Knot · {knot === "wound" ? "wound: it will keep you from fading once" : "slack: rest with the guide to wind it again"}
            </div>
          )}
        </div>
        <div className="inventory-note">You carry one weapon and one armor besides eternal gear. Falling loses all gear but the eternal.</div>
        <div className="inventory-keys"><kbd>W</kbd><kbd>S</kbd> slot · <kbd>A</kbd><kbd>D</kbd> change · <kbd>Esc</kbd> close</div>
      </div>
      <button className={`inventory-exit menu-button ${focus === SLOTS.length ? "is-focused" : ""}`} onMouseEnter={() => onFocus(SLOTS.length)} onClick={onExit}>
        Back to main menu <span className="inventory-exit-note">(saves)</span>
      </button>
    </div>
  );
}
