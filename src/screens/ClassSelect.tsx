/**
 * ClassSelect.tsx — choosing your class at a new game: only the characters, side by side, looking at the camera, each in what they will carry
 * (the Depraved in nothing). A/D choose, E opens a preview of the chosen one's gear (see `ClassPreview.tsx`), where E again asks whether to begin as them;
 * Q (or Esc) goes back.
 */
import { useState } from "react";
import { CLASSES, type ClassId, lookOfClass } from "../explore/items";
import { StickFigure } from "../render/StickFigure";
import { useKeys, wrapIndex } from "../ui/input";
import { ClassPreview } from "./ClassPreview";

export function ClassSelect({ onPick, onBack }: { onPick: (id: ClassId) => void; onBack: () => void }) {
  const [at, setAt] = useState(0);
  const [preview, setPreview] = useState(false);
  useKeys(key => {
    if (preview) return; // (the preview reads its own keys)
    if (key === "left" || key === "up") setAt(i => wrapIndex(i, -1, CLASSES.length));
    else if (key === "right" || key === "down") setAt(i => wrapIndex(i, 1, CLASSES.length));
    else if (key === "select") setPreview(true);
    else if (key === "back" || key === "pause") onBack();
  });
  if (preview) return <ClassPreview classId={CLASSES[at].id} onClose={() => setPreview(false)} onConfirm={() => onPick(CLASSES[at].id)} />;
  return (
    <main className="menu class-screen">
      <div className="class-lineup" role="listbox" aria-label="Class">
        {CLASSES.map((c, i) => (
          <button key={c.id} className={`class-figure ${i === at ? "is-focused" : ""}`} role="option" aria-selected={i === at} onMouseEnter={() => setAt(i)} onClick={() => (i === at ? setPreview(true) : setAt(i))}>
            <StickFigure view="front" foe={false} pose="stand" {...lookOfClass(c.id)} title={c.name} />
            <span className="class-name">{c.name}</span>
          </button>
        ))}
      </div>
      <div className="inv-keys"><kbd>A</kbd><kbd>D</kbd> choose · <kbd>E</kbd> look · <kbd>Q</kbd> back</div>
    </main>
  );
}
