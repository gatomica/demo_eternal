/**
 * ClassPreview.tsx — a class's gear, laid out like the inventory: the character at the side, a row for each slot, and in the middle what the
 * slot under the cursor holds: its name, its lore and, for a weapon, what it does. W/S (or the mouse) choose a slot; E asks whether to begin as this
 * character (A/D choose Begin or Not yet, E answers); Q or Esc close it (or the question).
 */
import { useState } from "react";
import { GearIcon, GearSprite } from "../explore/GearIcons";
import { SLOTS, type Slot } from "../explore/gear";
import { CLASSES, type ClassId, ITEMS, lookOfClass } from "../explore/items";
import { StickFigure } from "../render/StickFigure";
import { useKeys, wrapIndex } from "../ui/input";

const LABEL: Record<Slot, string> = { weapon: "Weapon", armor: "Armor", head: "Head" };

export function ClassPreview({ classId, onClose, onConfirm }: { classId: ClassId; onClose: () => void; onConfirm: () => void }) {
  const c = CLASSES.find(x => x.id === classId) ?? CLASSES[0];
  const [row, setRow] = useState(0);
  // The question: begin as this character? (0: Begin, 1: Not yet.)
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState(0);
  useKeys(key => {
    if (asking) {
      if (key === "left" || key === "right" || key === "up" || key === "down") setAnswer(a => 1 - a);
      else if (key === "select") { if (answer === 0) onConfirm(); else setAsking(false); }
      else if (key === "back" || key === "pause") setAsking(false);
      return;
    }
    if (key === "back" || key === "pause") onClose();
    else if (key === "select") { setAnswer(0); setAsking(true); }
    else if (key === "up" || key === "down") setRow(r => wrapIndex(r, key === "up" ? -1 : 1, SLOTS.length));
  });
  const itemOf = (slot: Slot) => (slot === "weapon" ? c.weapon : slot === "armor" ? c.armor : c.head);
  const held = itemOf(SLOTS[row]);
  const info = held ? ITEMS[held] : undefined;
  return (
    <div className="inv-screen is-cinematic" role="dialog" aria-label={`${c.name}'s gear`}>
      <div className="letterbox letterbox-top" aria-hidden="true" />
      <div className="letterbox letterbox-bottom" aria-hidden="true" />
      <div className="inv-figure">
        <StickFigure view="front" foe={false} pose="stand" {...lookOfClass(c.id)} title={c.name} />
      </div>
      {/* What is in the slot under the cursor, between the character and the slots. */}
      <div className="class-middle">
        {info ? (
          <div className="guide-lore">
            <div className="guide-lore-name">{info.name}</div>
            <p className="guide-lore-text">{info.lore}</p>
            {info.slot === "weapon" && <p className="guide-lore-effect">{info.effect}</p>}
          </div>
        ) : <p className="guide-says">Nothing: the {LABEL[SLOTS[row]].toLowerCase()} slot is empty.</p>}
      </div>
      <div className="inv-stage">
        <div className="inv-column">
          {SLOTS.map((slot, r) => {
            const item = itemOf(slot), it = item ? ITEMS[item] : undefined;
            return (
              <div key={slot} className="inv-row" role="group" aria-label={LABEL[slot]}>
                <span className="inv-row-label">{LABEL[slot]}</span>
                <button className={`inv-place is-eternal ${r === row ? "is-focused" : ""} ${it ? "is-equipped" : ""}`} onMouseEnter={() => setRow(r)} aria-label={`${LABEL[slot]}: ${it ? it.name : "empty"}`}>
                  <span className="inv-place-icon">{it ? <GearSprite slot={slot} tier={it.tier} item={item} tilted /> : <GearIcon slot={slot} />}</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
      {asking && (
        <div className="class-confirm" role="alertdialog" aria-label="Begin as this character?">
          <p>Are you sure you want to start as the {c.name}?</p>
          <div className="class-confirm-buttons">
            <button className={`menu-button ${answer === 0 ? "is-focused" : ""}`} onMouseEnter={() => setAnswer(0)} onClick={onConfirm}>Begin</button>
            <button className={`menu-button ${answer === 1 ? "is-focused" : ""}`} onMouseEnter={() => setAnswer(1)} onClick={() => setAsking(false)}>Not yet</button>
          </div>
        </div>
      )}
      <div className="inv-keys"><kbd>W</kbd><kbd>S</kbd> slot · <kbd>E</kbd> choose this one · <kbd>Q</kbd> back</div>
    </div>
  );
}
