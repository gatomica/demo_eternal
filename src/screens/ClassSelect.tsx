/**
 * ClassSelect.tsx — "Choose your Origin", at a new game: only the characters, side by side, each in the inventory's pose (the 3D player), in what they will carry
 * (the Depraved in nothing). A/D choose, E opens a preview of the chosen one's gear (see `ClassPreview.tsx`), where E again asks whether to begin as them;
 * Q (or Esc) goes back.
 */
import { useState } from "react";
import { CLASSES, type ClassId, lookOfClass } from "../explore/items";
import { PlayerFigure3D } from "../render/PlayerFigure3D";
import { useKeys, wrapIndex, menuSound } from "../ui/input";
import { Kbd } from "../ui/Kbd";
import { ClassPreview } from "./ClassPreview";

export function ClassSelect({ onPick, onBack }: { onPick: (id: ClassId) => void; onBack: () => void }) {
  const [at, setAt] = useState(0);
  const [preview, setPreview] = useState(false);
  useKeys(key => {
    menuSound(key);
    if (preview) return; // (the preview reads its own keys)
    if (key === "left" || key === "up") setAt(i => wrapIndex(i, -1, CLASSES.length));
    else if (key === "right" || key === "down") setAt(i => wrapIndex(i, 1, CLASSES.length));
    else if (key === "select") setPreview(true);
    else if (key === "back" || key === "pause") onBack();
  });
  if (preview) return <ClassPreview classId={CLASSES[at].id} onClose={() => setPreview(false)} onConfirm={() => onPick(CLASSES[at].id)} />;
  return (
    <main className="menu class-screen">
      <h1 className="class-title">Choose your Origin</h1>
      <div className="class-lineup" role="listbox" aria-label="Origin">
        {CLASSES.map((c, i) => (
          <button key={c.id} className={`class-figure ${i === at ? "is-focused" : ""}`} role="option" aria-selected={i === at} onMouseEnter={() => setAt(i)} onClick={() => (i === at ? setPreview(true) : setAt(i))}>
            <PlayerFigure3D look={lookOfClass(c.id)} title={c.name} swayId={`class-${c.id}`} />
            <span className="class-name">{c.name}</span>
          </button>
        ))}
      </div>
      <div className="inv-keys"><Kbd k="left" /><Kbd k="right" /> choose · <Kbd k="yes" /> look · <Kbd k="no" /> back</div>
    </main>
  );
}
