/**
 * LessonBox.tsx — the guide's words at the bottom of the fight, written a letter at a time, and
 * under them what to do, in brackets, once they are all there.
 */
export function LessonBox({ speaker, say, written, hint, ack }: {
  speaker: string;
  say: string;
  /** How many letters are written so far. */
  written: number;
  hint: string;
  /** Only to be read: E goes on. */
  ack: boolean;
}) {
  const done = written >= say.length;
  return (
    <div className="lesson" role="status">
      <div className="lesson-speaker">{speaker}</div>
      <p className="lesson-say">{say.slice(0, written)}<span className="lesson-unwritten">{say.slice(written)}</span></p>
      <p className={`lesson-hint ${done ? "is-shown" : ""}`}>({hint})</p>
      {done && ack && <span className="lesson-next"><kbd>E</kbd></span>}
    </div>
  );
}
