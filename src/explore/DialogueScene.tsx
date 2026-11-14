/**
 * DialogueScene.tsx — speaking with the guide, a scene of the map (like the inventory, not a fight): the black strips at the
 * top and bottom, you large on the left and the guide on the right, its words written out just above the bottom strip, centred,
 * and its menu (when the talk comes to it) in the middle, between you. What is said comes from a `Conversation`
 * (`dialogues.ts`), beat by beat.
 *
 *  - While the guide speaks: Yes (E unless rebound) finishes the line, then moves on. No does nothing: you can't walk out
 *    of a monologue.
 *  - Its menu: Up/Down choose, Yes picks, No leaves (from a sub-page, goes back).
 *    - Talk: whatever the guide has waiting to bring up (`onTalk`: the String, a memory, left waiting by a story talk); else its words,
 *      then back to the menu (once it has made its last offer, `offer`: the offer again).
 *    - Sleep ("rest" in the code; named Sleep so as not to be taken for the fight's Rest): the sleep by the keeper (the map does it;
 *      you wake in front of it). Leave: the talk ends. The opening talk's menu has Sleep alone (`only`), and No does nothing there.
 *    - Empower Self: there once the guide has brought it up (the first time you came with String enough to raise a stat: `STRING_TALK`,
 *      which opens right on it), affordable or not. String for one more point of max health or max Eternity; each costs the sum of 1 up to its present value.
 *    - Dreams: there once the guide has brought it up (the first time you came with a memory whose dreams were unread: `DREAMS_TALK`,
 *      which opens right on it). A row per slot of all your eternal gear; Up/Down the slot, Left/Right the piece. Yes on
 *      a memory whose dreams are unread: the guide reads them, and it is known for what it is ("Eternal ...");
 *      Yes on a read one: sets it in the slot's eternal place. The piece under the cursor shows in a box beside the slots.
 *  - A question: its answers stand between you like the menu; Up/Down choose, Yes answers (it must be answered), and the answer's own
 *    beats are played next. The question stays written above the strip meanwhile.
 *  - A gift: its pop-up (the map's) comes up, and the talk waits, keys and all, until it is closed (`blocked`).
 *  - The end: the map fades slowly to black over the scene (`onEnd`), and nothing more is said.
 */
import { useEffect, useRef, useState } from "react";
import { useScrollFocus } from "../ui/scrollFocus";
import { ENEMY_KINDS } from "../core/bestiary";
import type { Player } from "../core/types";
import { PlayerBars } from "../render/HealthBar";
import { PlayerFigure3D } from "../render/PlayerFigure3D";
import { StickFigure } from "../render/StickFigure";
import { StringCounter, YarnBall } from "../render/StringCounter";
import { speak } from "../audio/walk";
import { typeDelay } from "../combat/lesson";
import { empowerCost, payment, type Stats } from "./empower";
import { useKeys, wrapIndex, menuSound } from "../ui/input";
import { Kbd, keyText } from "../ui/Kbd";
import { type Gear, gearName, type Inventory as Bag, loadoutOf, memoriesFor, pieceAt, type Slot, SLOTS } from "./gear";
import { GearIcon, GearSprite } from "./GearIcons";
import { cardOfGear, ItemCard } from "./ItemCard";
import { type Beat, CHAT, type Conversation, OFFER } from "./dialogues";

type Page = "main" | "unwind" | "empower";

/** What a piece is, in the box beside the slots: the item card (its lore and effect once read; armor has no effect yet). */
function Lore({ piece }: { piece: Gear }) {
  return (
    <div className="guide-lore-box">
      <ItemCard info={cardOfGear(piece)} note={piece.read ? undefined : keyText("Its dreams are unread. Press {yes}, and the guide will unwind them.")} />
    </div>
  );
}

/** The first beat at or after `i` that is not a gift, giving each gift it passes on the way. */
function skipGifts(beats: Beat[], i: number, onGift: (kind: "knot") => void) {
  while (i < beats.length) {
    const b = beats[i];
    if (!("gift" in b)) break;
    onGift(b.gift);
    i++;
  }
  return i;
}

export function DialogueScene({ talk, instant = false, blocked = false, offer = false, onEnd, onTalk, inv, player, empowerUnlocked = false, dreamsUnlocked = false, string, eternalString, stats, onEmpower, onGift, onRest, onRead, onSet, onClose }: {
  /** What is said, beat by beat. */
  talk: Conversation;
  /** Already in place when it opens (no strips sliding in): a new game opens inside a talk. */
  instant?: boolean;
  /** A pop-up is up over the talk (or the screen is going dark): it waits (no keys, no writing) until it is closed. */
  blocked?: boolean;
  /** The guide has made its last offer: Talk makes it again. */
  offer?: boolean;
  /** The talk reached its end beat: the demo ends. */
  onEnd: () => void;
  /** Talk: what the guide has waiting to bring up (its beats, which end on the page they open), now said; or null. */
  onTalk: () => Beat[] | null;
  inv: Bag;
  /** You as your bars show you (for Empower Self's preview of the bars growing). */
  player: Player;
  /** The guide has brought up Empower Self: it is one of its options, whether or not you can afford a stat. */
  empowerUnlocked?: boolean;
  /** The guide has brought up Dreams: it is one of its options. */
  dreamsUnlocked?: boolean;
  /** Your String and eternal String, and your max health and max Eternity. */
  string: number;
  eternalString: number;
  stats: Stats;
  /** Spends String on one more point of this stat. */
  onEmpower: (stat: "health" | "eternity") => void;
  /** The guide gives you this (the map shows its pop-up and sets `blocked` until it is closed). */
  onGift: (kind: "knot") => void;
  onRest: () => void;
  /** The guide reads this memory's dreams. */
  onRead: (id: string) => void;
  /** Sets this read piece in its slot's eternal place. */
  onSet: (slot: Slot, id: string) => void;
  onClose: () => void;
}) {
  // Where the talk is: its beats (an answer's own beats, or Talk's, are put in after the beat they come from), the beat, and the line
  // of its lines. (A talk never opens on a gift: something is said first.)
  const [beats, setBeats] = useState<Beat[]>(talk.beats);
  const [beat, setBeat] = useState(0);
  const [lineAt, setLineAt] = useState(0);
  const here = beats[beat];
  const lines = here && "say" in here ? here.say : null;
  const line = lines ? lines[Math.min(lineAt, lines.length - 1)] : "";
  const menuBeat = !lines && here && "menu" in here ? here : null;
  const inMenu = !!menuBeat;
  const answers = !lines && here && "ask" in here ? here.ask : null;
  /** The question being answered: the last line said before it. */
  const before = beat > 0 ? beats[beat - 1] : undefined;
  const question = answers && before && "say" in before ? before.say[before.say.length - 1] : null;

  // The words are written out as the guide speaks, a breath for each word. Yes finishes the line, and then moves on.
  const lineKey = `${beat}:${lineAt}:${line}`;
  const [spoken, setSpoken] = useState({ key: "", n: 0 });
  const written = spoken.key === lineKey ? spoken.n : 0;
  useEffect(() => {
    if (!lines || blocked || written >= line.length) return;
    const t = window.setTimeout(() => { speak(line, written); setSpoken({ key: lineKey, n: written + 1 }); }, typeDelay(line, written));
    return () => window.clearTimeout(t);
  }, [lineKey, written, blocked]); // eslint-disable-line react-hooks/exhaustive-deps

  /** The beat after this one (giving any gift on the way); past the last, the talk is over. */
  const nextBeat = (list = beats) => {
    const i = skipGifts(list, beat + 1, onGift);
    if (i >= list.length) { onClose(); return; }
    setBeat(i);
    setLineAt(0);
    setAt(0);
    const b = list[i];
    // (A menu that opens right on one of its pages.)
    if ("menu" in b && b.page === "dreams") openDreams();
    else if ("menu" in b && b.page === "empower") openEmpower();
    else if ("menu" in b) setPage("main");
    // (The end: the scene stays, empty of words, as the screen goes dark.)
    if ("end" in b) onEnd();
  };
  /** These beats come next (an answer's, or Talk's), then the talk goes on as it would have. */
  const insert = (more: Beat[]) => {
    const list = [...beats.slice(0, beat + 1), ...more, ...beats.slice(beat + 1)];
    setBeats(list);
    nextBeat(list);
  };
  /** Your answer to the guide's question: its beats come next. */
  const answer = (i: number) => { if (answers) insert(answers[i].beats); };
  /** Done with the lines in hand: the next line, or what follows them. */
  const onwards = () => {
    if (!lines) return;
    if (lineAt + 1 < lines.length) { setLineAt(lineAt + 1); return; }
    nextBeat();
  };

  /** The cursor starts on the first slot that has memories, on the piece set there (or the first). */
  const startPicks = () => Object.fromEntries(SLOTS.map(s => [s, Math.max(0, memoriesFor(inv, s).findIndex(g => g.id === pieceAt(inv, s, "eternal")?.id))])) as Record<Slot, number>;
  const firstRow = () => Math.max(0, SLOTS.findIndex(s => memoriesFor(inv, s).length > 0));
  /** Empower Self's cursor starts on the first stat you can afford. */
  const empowerRow = () => (string + eternalString >= empowerCost(stats.maxHP) ? 0 : 1);
  const [page, setPage] = useState<Page>("main");
  const [at, setAt] = useState(0);
  // Which piece of each slot the cursor is on.
  const [pick, setPick] = useState<Record<Slot, number>>(startPicks);
  // What the guide says while you are in one of its pages: spoken as the page opens (and when it reads a memory), and there until you
  // leave the page. Only to be heard: it waits for no key.
  const [pageSays, setPageSays] = useState("");
  function openEmpower() { setPage("empower"); setAt(empowerRow()); setPageSays("Give me string, and I will wind it into you."); }
  function openDreams() { setPage("unwind"); setAt(firstRow()); setPick(startPicks()); setPageSays("Bring me your memories, and I will unwind them for you."); }

  // (The opening talk's menu has Sleep alone, and no leaving it.)
  const canLeave = !menuBeat?.only;
  const leave = onClose;
  const main = menuBeat?.only ? [{ label: "Sleep", run: onRest }] : [
    // (What it has waiting to bring up, if anything: the String, a memory. Else its words, or its last offer again; then this menu once more.)
    { label: "Talk", run: () => insert(onTalk() ?? [...(offer ? OFFER : [{ say: CHAT }]), { menu: true }]) },
    { label: "Sleep", run: onRest },
    // (Once it has been introduced: you can look at what a stat costs even when you cannot pay it yet.)
    ...(empowerUnlocked ? [{ label: "Empower Self", run: () => openEmpower() }] : []),
    ...(dreamsUnlocked ? [{ label: "Dreams", run: () => openDreams() }] : []),
    { label: "Leave", run: leave },
  ];

  /** Yes on a piece: read its dreams, or (read already) set it. */
  const use = (slot: Slot, piece: Gear) => {
    if (!piece.read) { onRead(piece.id); setPageSays("It dreams still. Listen."); }
    else { onSet(slot, piece.id); }
  };

  useKeys(key => {
    if (blocked) return;
    if (lines) {
      // The guide speaking: only Yes, to finish the line or move on.
      if (key !== "select") return;
      menuSound(key);
      if (written < line.length) setSpoken({ key: lineKey, n: line.length });
      else onwards();
      return;
    }
    if (answers) {
      // A question: Up/Down choose the answer, Yes gives it. It must be answered.
      if (key === "up" || key === "down") { menuSound(key); setAt(i => wrapIndex(Math.min(i, answers.length - 1), key === "up" ? -1 : 1, answers.length)); }
      else if (key === "select") { menuSound(key); answer(Math.min(at, answers.length - 1)); }
      return;
    }
    if (!inMenu) return;
    if (key === "back" || key === "pause") {
      if (page !== "main") { menuSound(key); setPage("main"); setAt(0); }
      else if (canLeave) { menuSound(key); leave(); }
      return;
    }
    menuSound(key);
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
    if (key === "up" || key === "down") setAt(i => wrapIndex(i, key === "up" ? -1 : 1, SLOTS.length));
    else if ((key === "left" || key === "right") && pieces.length) setPick(p => ({ ...p, [slot]: wrapIndex(Math.min(p[slot], pieces.length - 1), key === "left" ? -1 : 1, pieces.length) }));
    else if (key === "select" && pieces.length) use(slot, pieces[Math.min(pick[slot], pieces.length - 1)]);
  });

  const row = Math.min(at, SLOTS.length - 1);
  // (Longer than the screen, its options scroll with the focus.)
  const optionsRef = useRef<HTMLDivElement>(null);
  useScrollFocus(optionsRef, `${page}:${at}:${inMenu}`);
  const rowPieces = memoriesFor(inv, SLOTS[row]);
  const hovered = page === "unwind" ? rowPieces[Math.min(pick[SLOTS[row]], rowPieces.length - 1)] : undefined;
  const middle = page === "unwind" && hovered ? <Lore piece={hovered} /> : null;
  // The guide's words in a page, written out as it speaks them (a new line starts again from its first letter).
  const said = inMenu && page !== "main" ? pageSays : "";
  const [saidN, setSaidN] = useState({ key: "", n: 0 });
  const saidWritten = saidN.key === said ? saidN.n : 0;
  useEffect(() => {
    if (!said || blocked || saidWritten >= said.length) return;
    const t = window.setTimeout(() => { speak(said, saidWritten); setSaidN({ key: said, n: saidWritten + 1 }); }, typeDelay(said, saidWritten));
    return () => window.clearTimeout(t);
  }, [said, saidWritten, blocked]);

  return (
    <div className={`inv-screen guide-screen is-cinematic ${instant ? "is-instant" : ""}`} role="dialog" aria-label="The guide">
      {/* A backdrop of its own, fading in over the map: the talk is not drawn on the map (where you and the guide already stand). */}
      <div className="scene-backdrop" aria-hidden="true" />
      <div className="letterbox letterbox-top" aria-hidden="true" />
      <div className="letterbox letterbox-bottom" aria-hidden="true" />
      {/* You on the left and the guide on the right, large: the bottom strip comes up to the knees (as in a visual novel). */}
      <div className="inv-figure">
        <PlayerFigure3D look={loadoutOf(inv)} title="You" swayId="dialogue" />
      </div>
      <div className="guide-figure">
        <StickFigure view="front" foe pose={(ENEMY_KINDS.guide.idlePose ?? "idle") as never} weapon="baseline" armor="none" variant="guide" title="The guide" />
      </div>
      {/* A question's answers, between you, like the menu. */}
      {answers && (
        <div className="guide-stage">
          <div className="guide-options">
            <nav className="guide-menu" aria-label="Answer">
              {answers.map((a, i) => (
                <button key={a.label} className={`menu-button ${i === Math.min(at, answers.length - 1) ? "is-focused" : ""}`} onMouseEnter={() => setAt(i)} onClick={() => answer(i)}>{a.label}</button>
              ))}
            </nav>
          </div>
        </div>
      )}
      {/* The menu, between you. */}
      {inMenu && (
        <div className="guide-stage">
          <div className="guide-options" ref={optionsRef}>
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
                <div className="guide-page-title">Dreams</div>
                {SLOTS.map((slot, r) => {
                  const pieces = memoriesFor(inv, slot);
                  const set = pieceAt(inv, slot, "eternal");
                  return (
                    <div key={slot} className={`guide-set-row ${r === row ? "is-focused" : ""}`} onMouseEnter={() => setAt(r)}>
                      {pieces.length === 0 && <span className="inv-place is-eternal"><span className="inv-place-icon"><GearIcon slot={slot} /></span></span>}
                      {pieces.map((g, i) => (
                        <button
                          key={g.id}
                          className={`inv-place is-eternal ${g.read ? "" : "is-unread"} ${g.id === set?.id ? "is-equipped" : ""} ${r === row && i === Math.min(pick[slot], pieces.length - 1) ? "is-focused" : ""}`}
                          onMouseEnter={() => { setAt(r); setPick(p => ({ ...p, [slot]: i })); }}
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
          {/* What the piece under the cursor is (or what the guide says of the page), beside the options. */}
          {middle && <div className="guide-middle">{middle}</div>}
        </div>
      )}
      {/* Your bars as usual, with the point you are about to raise flickering on the end of the one you have chosen. */}
      {inMenu && page === "empower" && <PlayerBars player={player} gain={at === 0 ? { health: 1 } : { eternity: 1 }} />}
      {inMenu && page === "empower" && <StringCounter amount={string} eternal={eternalString} spend={payment(empowerCost(stats[at === 0 ? "maxHP" : "maxEternity"]), string, eternalString) ?? undefined} />}
      {/* The guide's words, just above the bottom strip (the Yes key after them once written out); or, at its menu, the keys, on the strip. */}
      {lines ? (
        <div className="scene-line">
          <p className="scene-line-text">
            {line.slice(0, written)}<span className="dialogue-unwritten">{line.slice(written)}</span>
            <span className={`scene-line-next ${written < line.length ? "is-writing" : ""}`} aria-hidden="true"> <Kbd k="yes" /></span>
          </p>
        </div>
      ) : answers ? (
        <>
          {/* (The question stays written while you answer it.) */}
          {question && <div className="scene-line"><p className="scene-line-text">{question}</p></div>}
          <div className="inv-keys"><Kbd k="up" /><Kbd k="down" /> choose · <Kbd k="yes" /> answer</div>
        </>
      ) : inMenu && (
        <>
        {/* (In a page, the guide's words above the strip, to be heard only.) */}
        {said && <div className="scene-line" aria-live="polite"><p className="scene-line-text">{said.slice(0, saidWritten)}<span className="dialogue-unwritten">{said.slice(saidWritten)}</span></p></div>}
        <div className="inv-keys">
          <Kbd k="up" /><Kbd k="down" /> choose{page === "unwind" ? <> · <Kbd k="left" /><Kbd k="right" /> piece</> : null} · <Kbd k="yes" /> {page === "empower" ? "empower" : page === "unwind" ? (hovered && !hovered.read ? "unwind" : "set") : "pick"}{page !== "main" ? <> · <Kbd k="no" /> back</> : canLeave ? <> · <Kbd k="no" /> leave</> : null}
        </div>
        </>
      )}
    </div>
  );
}
