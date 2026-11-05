/**
 * Dialogue.tsx — a line of speech along the bottom of the map. E moves on (the screen handles the key).
 */
export function Dialogue({ speaker, text, written = text.length, last }: { speaker: string; text: string; /** How much of it is written out so far. */ written?: number; last: boolean }) {
  return (
    <div className="dialogue" role="dialog" aria-label={speaker}>
      <div className="dialogue-speaker">{speaker}</div>
      <p className="dialogue-text">{text.slice(0, written)}<span className="dialogue-unwritten">{text.slice(written)}</span></p>
      <div className="dialogue-next"><kbd>E</kbd> {last ? "Close" : "Continue"}</div>
    </div>
  );
}
