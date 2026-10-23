/**
 * Dialogue.tsx — a line of speech along the bottom of the map. E moves on (the screen handles the key).
 */
export function Dialogue({ speaker, text, last }: { speaker: string; text: string; last: boolean }) {
  return (
    <div className="dialogue" role="dialog" aria-label={speaker}>
      <div className="dialogue-speaker">{speaker}</div>
      <p className="dialogue-text">{text}</p>
      <div className="dialogue-next"><kbd>E</kbd> {last ? "Close" : "Continue"}</div>
    </div>
  );
}
