/**
 * ModelViewer.tsx — one enemy against a dummy you, nobody gets hurt. Pick the enemy first, then on
 * its panel: its statuses, the stance it shows, and click any action that stance allows (with
 * those statuses) to watch it play out.
 */
import { useCallback, useMemo, useState } from "react";
import { CombatScreen } from "../combat/CombatScreen";
import { ENEMY_KINDS, type KindId, type StatusToggle } from "../core/bestiary";
import { nextStances } from "../core/patterns";
import type { CombatState } from "../core/types";
import { applyShow, LINE_TOGGLE, STAGGERED, VIEWER_KINDS, viewerActions, viewerFight, type ViewerShow } from "./viewerModel";
import { cycle, useKeys } from "../ui/input";
import { Picker } from "../ui/Picker";

/** Pick which enemy to look at. A/D change, E opens it, Q goes back to the menu. */
function ViewerSetup({ kind, onChange, onStart, onExit }: {
  kind: KindId;
  onChange: (k: KindId) => void;
  onStart: () => void;
  onExit: () => void;
}) {
  useKeys(key => {
    if (key === "left" || key === "right") onChange(cycle(VIEWER_KINDS, kind, key === "right" ? 1 : -1));
    else if (key === "select") onStart();
    else if (key === "back" || key === "pause") onExit();
  });
  return (
    <main className="setup">
      <h2 className="setup-title">Model viewer</h2>
      <Picker
        label="Enemy"
        focused
        value={kind}
        options={VIEWER_KINDS}
        labels={Object.fromEntries(VIEWER_KINDS.map(k => [k, ENEMY_KINDS[k].name]))}
        onChange={onChange}
      />
      <p className="hint">
        <kbd>A</kbd><kbd>D</kbd> change · <kbd>E</kbd> view · <kbd>Q</kbd> menu
      </p>
      <div className="setup-buttons">
        <button className="hud-button" onClick={onExit}>Menu</button>
        <button className="commit" onClick={onStart}>View</button>
      </div>
    </main>
  );
}

export function ModelViewer({ onExit }: { onExit: () => void }) {
  const [kind, setKind] = useState(VIEWER_KINDS[0]);
  const [viewing, setViewing] = useState(false);
  const [run, setRun] = useState(0);
  if (!viewing) return <ViewerSetup kind={kind} onChange={setKind} onStart={() => { setRun(r => r + 1); setViewing(true); }} onExit={onExit} />;
  return <ViewerFight key={`${kind}-${run}`} kind={kind} onBack={() => setViewing(false)} onRetry={() => setRun(r => r + 1)} onExit={onExit} />;
}

function ViewerFight({ kind: kindName, onBack, onRetry, onExit }: {
  kind: KindId;
  onBack: () => void;
  onRetry: () => void;
  onExit: () => void;
}) {
  const kind = ENEMY_KINDS[kindName];
  const [show, setShow] = useState<ViewerShow>(() => ({ stance: kind.pattern.stances[0].name, on: {}, turn: 1 }));
  const [playSignal, setPlaySignal] = useState(0);
  const initial = useMemo(() => viewerFight(kindName), [kindName]);
  const override = useCallback((s: CombatState) => applyShow(s, show), [show]);
  const shown = useMemo(() => applyShow(initial, show), [initial, show]);
  const toggles = [LINE_TOGGLE, ...(kind.statuses ?? [])];
  const flip = (toggle: StatusToggle) =>
    setShow(prev => {
      const on = { ...prev.on, [toggle.key]: !prev.on[toggle.key] };
      // Switched on, some statuses send it to the stance that follows them (phase two: Idle).
      const enters = toggle.enters && on[toggle.key] ? nextStances(kind.pattern, { action: toggle.enters, outcome: "done" })[0]?.name : undefined;
      return { ...prev, action: undefined, next: undefined, interrupt: undefined, on, stance: enters ?? prev.stance };
    });
  // Playing an action also picks, at random, which of the stances it leads to it moves on to,
  // as in a fight; it settles into that stance as the action ends.
  const play = (action: string, interrupt = false) => {
    // A broken Rest counts as undone: it picks up again from the Recover stances.
    const options = nextStances(kind.pattern, { action, outcome: interrupt ? "undone" : "done" });
    const next = options[Math.floor(Math.random() * options.length)].name;
    setShow(prev => ({ ...prev, action, next, interrupt }));
    setPlaySignal(n => n + 1);
  };
  // Once it's over, that stance is the one shown, and its statuses follow what the action did
  // (Flame Blast seals him, say).
  const afterTurn = (s: CombatState) => {
    const e = s.enemies[0];
    setShow(prev => {
      const on: Record<string, boolean> = { ...prev.on, back: e.line === "back" };
      for (const t of kind.statuses ?? []) on[t.key] = !!e.flags[t.key];
      return { stance: prev.next ?? prev.stance, on, turn: s.turn };
    });
  };

  const panel = (
    <aside className="viewer-panel" aria-label="Model viewer">
      <div className="viewer-head">
        <h2 className="viewer-title">{kind.name}</h2>
        <button className="hud-button viewer-change" onClick={onBack}>Change enemy</button>
      </div>
      <div className="viewer-section">
        <span className="picker-label">Status</span>
        <div className="picker-options">
          {toggles.map(t => {
            const on = !!show.on[t.key];
            const locked = t.locked?.(show.on) ?? null;
            return (
              <button key={t.key} className="chip viewer-toggle" aria-pressed={on} disabled={locked !== null} onClick={() => flip(t)}>
                {locked ?? (on ? t.on : t.off)}
              </button>
            );
          })}
        </div>
      </div>
      <div className="viewer-section">
        <span className="picker-label">Stance</span>
        <div className="picker-options">
          {[...kind.pattern.stances.map(st => st.name), STAGGERED].map(name => (
            <button key={name} className="chip" aria-pressed={name === show.stance} onClick={() => setShow(prev => ({ ...prev, stance: name, action: undefined, next: undefined }))}>
              {name}
            </button>
          ))}
        </div>
      </div>
      <div className="viewer-section">
        <span className="picker-label">Actions from this stance</span>
        <div className="picker-options">
          {viewerActions(kindName, shown, show.stance).flatMap(({ action: a, available, fixed }) => [
            <button
              key={a.name}
              className="chip viewer-action"
              disabled={!available}
              title={available ? `Play ${a.name}` : `Not available: needs ${a.needs.join(", ")}`}
              onClick={e => { e.currentTarget.blur(); play(a.name); }}
            >
              ▶ {a.name} <span className="viewer-kind">{fixed ? "fixed rule" : a.type}</span>
            </button>,
            // A Rest can also be broken by a blow, to see the flinch.
            ...(a.type === "rest" && !fixed && show.stance !== STAGGERED
              ? [
                  <button
                    key={`${a.name}-flinch`}
                    className="chip viewer-action"
                    disabled={!available}
                    title={`Play ${a.name}, broken by a blow`}
                    onClick={e => { e.currentTarget.blur(); play(a.name, true); }}
                  >
                    ↯ Flinch <span className="viewer-kind">{a.name} interrupted</span>
                  </button>,
                ]
              : []),
          ])}
        </div>
      </div>
    </aside>
  );

  return (
    <CombatScreen
      initial={initial}
      override={override}
      panel={panel}
      playSignal={playSignal}
      attackOnPlay={!!show.interrupt}
      onTurnPlayed={afterTurn}
      onRetry={onRetry}
      onChangeLoadout={onBack}
      changeLabel="Change enemy"
      onExit={onExit}
    />
  );
}
