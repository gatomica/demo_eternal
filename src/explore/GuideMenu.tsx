/**
 * GuideMenu.tsx — speaking with the guide at a safe spot (E by a keeper): the fight's letterbox, the
 * guide large at the right, seen 3/4 from the front, and what you can do on the left. W/S choose, E picks,
 * Q goes back (and, from the first page, leaves).
 *
 *  - Talk: the guide's words (the map shows them in its dialogue box).
 *  - Rest: the sleep by the keeper, as ever (the map does it).
 *  - Empower Self: there once you have had String enough to raise a stat (the first time, the menu opens right on it), affordable or not. String for one more point of
 *    max health or max Eternity; each costs the sum of 1 up to its present value.
 *  - Unwind Memories: there once you have found your first memory (and the first time after that, the
 *    menu opens right on it). A row per slot of all your eternal gear; W/S the slot, A/D the piece. E on
 *    a memory whose dreams are unread: the guide reads them, and it is known for what it is ("Eternal ...");
 *    E on a read one: sets it in the slot's eternal place. The piece under the cursor shows in a box in
 *    the middle, between the slots and the guide: its lore and effect, once read.
 */
import { useState } from "react";
import { ENEMY_KINDS } from "../core/bestiary";
import { StickFigure } from "../render/StickFigure";
import { StringCounter, YarnBall } from "../render/StringCounter";
import { canEmpower, empowerCost, payment, type Stats } from "./empower";
import { useKeys, wrapIndex } from "../ui/input";
import { type Gear, gearName, hasMemories, type Inventory as Bag, memoriesFor, pieceAt, type Slot, SLOTS } from "./gear";
import { GearIcon, GearSprite } from "./GearIcons";
import { ITEMS } from "./items";
import { EFFECT, LORE } from "./lore";

type Page = "main" | "unwind" | "empower";

const SLOT_LABEL: Record<Slot, string> = { weapon: "Weapon", armor: "Armor", head: "Head" };

/** What a piece is, in the middle box: its name, and once read, its lore and effect (armor has none yet). */
function Lore({ piece, justRead }: { piece: Gear; justRead: boolean }) {
  // (A starting class's own piece has its own lore and effect; any other, its tier's.)
  const info = piece.item ? ITEMS[piece.item] : undefined;
  const lore = info?.lore ?? (piece.slot === "weapon" ? LORE[piece.tier] : undefined);
  const effect = info && info.slot === "weapon" ? info.effect : piece.slot === "weapon" && !info ? EFFECT[piece.tier] : undefined;
  return (
    <div className="guide-lore">
      {justRead && <p className="guide-says">"It dreams still. Listen."</p>}
      <div className="guide-lore-name">{gearName(piece)}</div>
      {!piece.read && <p className="guide-lore-text">Its dreams are unread. Press E, and the guide will unwind them.</p>}
      {piece.read && lore && <p className="guide-lore-text">{lore}</p>}
      {piece.read && effect && <p className="guide-lore-effect">{effect}</p>}
      {piece.read && !lore && !effect && <p className="guide-lore-text">Its dreams are faint.</p>}
    </div>
  );
}

export function GuideMenu({ inv, unwindFirst = false, empowerFirst = false, empowerUnlocked = false, onVisitUnwind, string, eternalString, stats, onEmpower, onTalk, onRest, onRead, onSet, onClose }: {
  inv: Bag;
  /** The first time you speak with the guide after finding a memory: the menu opens on Unwind Memories. */
  unwindFirst?: boolean;
  /** The first time you have String enough to raise a stat: the menu opens on Empower Self. */
  empowerFirst?: boolean;
  /** Empower Self has been introduced: it stays an option, whether or not you can afford a stat. */
  empowerUnlocked?: boolean;
  /** You have gone to Unwind Memories (so it need not open on it by itself any more). */
  onVisitUnwind?: () => void;
  /** Your String and eternal String, and your max health and max Eternity. */
  string: number;
  eternalString: number;
  stats: Stats;
  /** Spends String on one more point of this stat. */
  onEmpower: (stat: "health" | "eternity") => void;
  onTalk: () => void;
  onRest: () => void;
  /** The guide reads this memory's dreams. */
  onRead: (id: string) => void;
  /** Sets this read piece in its slot's eternal place. */
  onSet: (slot: Slot, id: string) => void;
  onClose: () => void;
}) {
  /** The cursor starts on the first slot that has memories, on the piece set there (or the first). */
  const startPicks = () => Object.fromEntries(SLOTS.map(s => [s, Math.max(0, memoriesFor(inv, s).findIndex(g => g.id === pieceAt(inv, s, "eternal")?.id))])) as Record<Slot, number>;
  const firstRow = () => Math.max(0, SLOTS.findIndex(s => memoriesFor(inv, s).length > 0));
  /** Empower Self's cursor starts on the first stat you can afford. */
  const empowerRow = () => (string + eternalString >= empowerCost(stats.maxHP) ? 0 : 1);
  const [page, setPage] = useState<Page>(empowerFirst ? "empower" : unwindFirst ? "unwind" : "main");
  const [at, setAt] = useState(empowerFirst ? empowerRow() : unwindFirst ? firstRow() : 0);
  // Which piece of each slot the cursor is on.
  const [pick, setPick] = useState<Record<Slot, number>>(startPicks);
  // The memory just read, to say so.
  const [justRead, setJustRead] = useState<string | null>(null);

  const main = [
    { label: "Talk", run: onTalk },
    { label: "Rest", run: onRest },
    // (Once it has been introduced: you can look at what a stat costs even when you cannot pay it yet.)
    ...(empowerUnlocked || canEmpower(string, stats, eternalString) ? [{ label: "Empower Self", run: () => { setPage("empower"); setAt(empowerRow()); } }] : []),
    ...(hasMemories(inv) ? [{ label: "Unwind Memories", run: () => { onVisitUnwind?.(); setPage("unwind"); setAt(firstRow()); setPick(startPicks()); setJustRead(null); } }] : []),
    { label: "Leave", run: onClose },
  ];

  /** E on a piece: read its dreams, or (read already) set it. */
  const use = (slot: Slot, piece: Gear) => {
    if (!piece.read) { onRead(piece.id); setJustRead(piece.id); }
    else { onSet(slot, piece.id); setJustRead(null); }
  };

  useKeys(key => {
    if (key === "back" || key === "pause") {
      if (page === "main") onClose();
      else { setPage("main"); setAt(0); }
      return;
    }
    if (page === "main") {
      if (key === "up" || key === "down") setAt(i => wrapIndex(Math.min(i, main.length - 1), key === "up" ? -1 : 1, main.length));
      else if (key === "select") main[Math.min(at, main.length - 1)].run();
      return;
    }
    if (page === "empower") {
      if (key === "up" || key === "down") setAt(i => wrapIndex(Math.min(i, 1), key === "up" ? -1 : 1, 2));
      else if (key === "select") onEmpower(at === 0 ? "health" : "eternity");
      return;
    }
    const slot = SLOTS[Math.min(at, SLOTS.length - 1)];
    const pieces = memoriesFor(inv, slot);
    if (key === "up" || key === "down") { setAt(i => wrapIndex(i, key === "up" ? -1 : 1, SLOTS.length)); setJustRead(null); }
    else if ((key === "left" || key === "right") && pieces.length) {
      setPick(p => ({ ...p, [slot]: wrapIndex(Math.min(p[slot], pieces.length - 1), key === "left" ? -1 : 1, pieces.length) }));
      setJustRead(null);
    } else if (key === "select" && pieces.length) use(slot, pieces[Math.min(pick[slot], pieces.length - 1)]);
  });

  const row = Math.min(at, SLOTS.length - 1);
  const rowPieces = memoriesFor(inv, SLOTS[row]);
  const hovered = page === "unwind" ? rowPieces[Math.min(pick[SLOTS[row]], rowPieces.length - 1)] : undefined;

  return (
    <div className="inv-screen guide-screen is-cinematic" role="dialog" aria-label="The guide">
      <div className="letterbox letterbox-top" aria-hidden="true" />
      <div className="letterbox letterbox-bottom" aria-hidden="true" />
      {/* The guide, large, at the side: the bottom strip comes up to its knees (as in a visual novel). */}
      <div className="guide-figure">
        <StickFigure view="front" foe pose={(ENEMY_KINDS.guide.idlePose ?? "idle") as never} weapon="baseline" armor="none" variant="guide" title="The guide" />
      </div>
      <div className="guide-stage">
        <div className="guide-options">
          {page === "main" && (
            <nav className="guide-menu">
              {main.map((o, i) => (
                <button key={o.label} className={`menu-button ${i === Math.min(at, main.length - 1) ? "is-focused" : ""}`} onMouseEnter={() => setAt(i)} onClick={o.run}>{o.label}</button>
              ))}
            </nav>
          )}
          {page === "empower" && (
            <div className="guide-page">
              <div className="guide-page-title">Empower Self</div>
              {([["Health", "maxHP", "health"], ["Eternity", "maxEternity", "eternity"]] as const).map(([label, key, stat], r) => {
                const value = stats[key], cost = empowerCost(value);
                return (
                  <button key={stat} className={`empower-row ${r === Math.min(at, 1) ? "is-focused" : ""} ${string + eternalString >= cost ? "" : "is-short"}`} onMouseEnter={() => setAt(r)} onClick={() => onEmpower(stat)}>
                    <span className="empower-name">{label}</span>
                    <span className="empower-value">{value} → {value + 1}</span>
                    <span className="empower-cost">{cost} <YarnBall className="string-ball" /></span>
                  </button>
                );
              })}
            </div>
          )}
          {page === "unwind" && (
            <div className="guide-page">
              <div className="guide-page-title">Unwind Memories</div>
              {SLOTS.map((slot, r) => {
                const pieces = memoriesFor(inv, slot);
                const set = pieceAt(inv, slot, "eternal");
                return (
                  <div key={slot} className={`guide-set-row ${r === row ? "is-focused" : ""}`} onMouseEnter={() => setAt(r)}>
                    <span className="inv-row-label">{SLOT_LABEL[slot]}</span>
                    {pieces.length === 0 && <span className="inv-place is-eternal"><span className="inv-place-icon"><GearIcon slot={slot} /></span></span>}
                    {pieces.map((g, i) => (
                      <button
                        key={g.id}
                        className={`inv-place is-eternal ${g.read ? "" : "is-unread"} ${g.id === set?.id ? "is-equipped" : ""} ${r === row && i === Math.min(pick[slot], pieces.length - 1) ? "is-focused" : ""}`}
                        onMouseEnter={() => { setAt(r); setPick(p => ({ ...p, [slot]: i })); setJustRead(null); }}
                        onClick={() => use(slot, g)}
                        aria-label={`${gearName(g)}${g.id === set?.id ? " (set)" : ""}`}
                      >
                        <span className="inv-place-icon"><GearSprite slot={slot} tier={g.tier} item={g.item} tilted /></span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {/* What the piece under the cursor is, between the slots and the guide. */}
        <div className="guide-middle">
          {page === "empower" && <p className="guide-says">"Give me string, and I will wind it into you."</p>}
          {page === "unwind" && (hovered ? <Lore piece={hovered} justRead={hovered.id === justRead} /> : <p className="guide-says">"Bring me memories, and I will unwind them for you."</p>)}
        </div>
      </div>
      {page === "empower" && <StringCounter amount={string} eternal={eternalString} spend={payment(empowerCost(stats[at === 0 ? "maxHP" : "maxEternity"]), string, eternalString) ?? undefined} />}
      <div className="inv-keys">
        <kbd>W</kbd><kbd>S</kbd> choose{page === "unwind" ? <> · <kbd>A</kbd><kbd>D</kbd> piece</> : null} · <kbd>E</kbd> {page === "empower" ? "empower" : page === "unwind" ? (hovered && !hovered.read ? "unwind" : "set") : "pick"} · <kbd>Q</kbd> {page === "main" ? "leave" : "back"}
      </div>
    </div>
  );
}
