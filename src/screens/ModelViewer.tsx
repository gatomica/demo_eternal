/**
 * ModelViewer.tsx — one enemy against a dummy you, nobody gets hurt. Pick the enemy first, then on
 * its panel: its statuses, the stance it shows, and click any action that stance allows (with
 * those statuses) to watch it play out. Or pick "You" to look at the player instead: any weapon
 * and armor, any pose held still, and your actions played against a dummy Sleepwalker.
 */
import { useCallback, useMemo, useState } from "react";
import { CombatScreen } from "../combat/CombatScreen";
import { ENEMY_KINDS, type StatusToggle } from "../core/bestiary";
import { needText } from "../core/conditions";
import { nextStances } from "../core/patterns";
import type { CombatState } from "../core/types";
import { ARMOR, WEAPONS } from "../core/rules";
import type { ArmorTier, WeaponTier } from "../core/types";
import type { PoseName } from "../render/poses";
import { applyPlayerShow, applyShow, DEAD, type EnemySubject, figureAngleOf, LINE_TOGGLE, MODEL, MODEL_ANGLES, type ModelAngle, partLabel, partsOf, PLAYER_POSES, PLAYER_SCENARIOS, playerActionOf, playerViewerFight, STAGGERED, subjectName, VIEWER_SUBJECTS, viewerActions, viewerFight, type ViewerShow } from "./viewerModel";
import { cycle, useKeys } from "../ui/input";
import { Picker } from "../ui/Picker";

/** What the viewer looks at: an enemy (a multi-target one as a whole, all its parts at once), or you. */
type Subject = EnemySubject | "player";
const SUBJECTS: Subject[] = [...VIEWER_SUBJECTS, "player"];

/** Pick which enemy (or you) to look at. A/D change, E opens it, Q goes back to the menu. */
function ViewerSetup({ kind, onChange, onStart, onExit }: {
  kind: Subject;
  onChange: (k: Subject) => void;
  onStart: () => void;
  onExit: () => void;
}) {
  useKeys(key => {
    if (key === "left" || key === "right") onChange(cycle(SUBJECTS, kind, key === "right" ? 1 : -1));
    else if (key === "select") onStart();
    else if (key === "back" || key === "pause") onExit();
  });
  return (
    <main className="setup">
      <h2 className="setup-title">Model viewer</h2>
      <Picker
        label="Model"
        focused
        value={kind}
        options={SUBJECTS}
        labels={{ ...Object.fromEntries(VIEWER_SUBJECTS.map(k => [k, subjectName(k)])), player: "You (player)" }}
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
  const [kind, setKind] = useState<Subject>(VIEWER_SUBJECTS[0]);
  const [viewing, setViewing] = useState(false);
  const [run, setRun] = useState(0);
  if (!viewing) return <ViewerSetup kind={kind} onChange={setKind} onStart={() => { setRun(r => r + 1); setViewing(true); }} onExit={onExit} />;
  if (kind === "player") return <PlayerViewerFight key={`player-${run}`} onBack={() => setViewing(false)} onRetry={() => setRun(r => r + 1)} onExit={onExit} />;
  return <ViewerFight key={`${kind}-${run}`} subject={kind} onBack={() => setViewing(false)} onRetry={() => setRun(r => r + 1)} onExit={onExit} />;
}

function ViewerFight({ subject, onBack, onRetry, onExit }: {
  subject: EnemySubject;
  onBack: () => void;
  onRetry: () => void;
  onExit: () => void;
}) {
  const partKinds = partsOf(subject);
  const kinds = partKinds.map(k => ENEMY_KINDS[k]);
  const multi = kinds.length > 1;
  const [show, setShow] = useState<ViewerShow>(() => ({ parts: kinds.map(k => ({ stance: k.pattern.stances[0].name })), on: {}, turn: 1 }));
  const [playSignal, setPlaySignal] = useState(0);
  const [lit, setLit] = useState(true);
  const initial = useMemo(() => viewerFight(subject), [subject]);
  const override = useCallback((s: CombatState) => applyShow(s, show), [show]);
  const shown = useMemo(() => applyShow(initial, show), [initial, show]);
  // The statuses of all the parts (by key), after the line they share.
  const statuses = [...new Map(kinds.flatMap(k => k.statuses ?? []).map(t => [t.key, t])).values()];
  const toggles = [LINE_TOGGLE, ...statuses];
  const flip = (toggle: StatusToggle) =>
    setShow(prev => {
      const on = { ...prev.on, [toggle.key]: !prev.on[toggle.key] };
      return {
        ...prev, interrupt: undefined, acting: undefined, on,
        // Switched on, some statuses send the part that has them to the stance that follows them (phase two: Idle).
        parts: prev.parts.map((p, i) => {
          const enters = toggle.enters && on[toggle.key] && kinds[i].statuses?.some(t => t.key === toggle.key)
            ? nextStances(kinds[i].pattern, { action: toggle.enters, outcome: "done" })[0]?.name : undefined;
          return { ...p, action: undefined, next: undefined, stance: enters ?? p.stance };
        }),
      };
    });
  const setStance = (i: number, name: string) =>
    setShow(prev => ({ ...prev, acting: undefined, parts: prev.parts.map((p, j) => (j === i ? { stance: name } : p)) }));
  /** The same stance for every part (the whole body staggered, fallen or in its T-pose). */
  const setAllStances = (name: string) =>
    setShow(prev => ({ ...prev, acting: undefined, parts: prev.parts.map(() => ({ stance: name })) }));
  // Playing an action also picks, at random, which of the stances it leads to it moves on to,
  // as in a fight; it settles into that stance as the action ends.
  const nextOf = (i: number, action: string, interrupt: boolean) => {
    // A broken Rest counts as undone: it picks up again from the Recover stances.
    const options = nextStances(kinds[i].pattern, { action, outcome: interrupt ? "undone" : "done", avoid: interrupt ? show.parts[i].stance : undefined });
    return options[Math.floor(Math.random() * options.length)].name;
  };
  /** One part does an action; the others of its body hold their stance. */
  const play = (i: number, action: string, interrupt = false) => {
    const next = nextOf(i, action, interrupt);
    setShow(prev => ({ ...prev, interrupt, acting: multi ? i : undefined, parts: prev.parts.map((p, j) => (j === i ? { ...p, action, next, chosen: action } : { stance: p.stance, chosen: p.chosen })) }));
    setPlaySignal(n => n + 1);
  };
  /** Every part does the action it has picked (the first its stance allows, otherwise), all in the same turn. */
  const playAll = () => {
    setShow(prev => ({
      ...prev, interrupt: false, acting: "all",
      parts: prev.parts.map((p, i) => {
        const stance = kinds[i].pattern.stances.find(x => x.name === p.stance);
        const action = p.chosen ?? stance?.actions[0].name;
        return action ? { ...p, action, next: nextOf(i, action, false) } : { stance: p.stance };
      }),
    }));
    setPlaySignal(n => n + 1);
  };
  // Once it's over, that stance is the one shown, and its statuses follow what the action did
  // (Flame Blast seals him, say).
  const afterTurn = (s: CombatState) => {
    setShow(prev => {
      const on: Record<string, boolean> = { ...prev.on, back: s.enemies[0].line === "back" };
      for (const t of statuses) on[t.key] = s.enemies.some(e => !!e.flags[t.key]);
      return { parts: prev.parts.map(p => ({ stance: p.next ?? p.stance, chosen: p.chosen })), on, turn: s.turn, angle: prev.angle };
    });
  };
  // The part the player's blow is aimed at, when a Block or Maneuver is played (or a Rest broken).
  const playTarget = (() => {
    if (!multi) return undefined;
    if (typeof show.acting === "number") return `e${show.acting}`;
    const i = show.parts.findIndex((p, j) => {
      const type = p.action && kinds[j].pattern.actions.get(p.action.toLowerCase())?.type;
      return type === "block" || type === "maneuver";
    });
    return `e${Math.max(0, i)}`;
  })();
  const anyModel = show.parts.some(p => p.stance === MODEL);

  /** The stance and action chips of one part. */
  const partControls = (i: number) => {
    const kind = kinds[i], part = show.parts[i];
    return (
      <>
        <div className="viewer-section">
          <span className="picker-label">Stance</span>
          <div className="picker-options">
            {[...kind.pattern.stances.map(st => st.name), STAGGERED, DEAD, MODEL].map(name => (
              <button key={name} className="chip" aria-pressed={name === part.stance} onClick={() => setStance(i, name)}>
                {name}
              </button>
            ))}
          </div>
        </div>
        {part.stance === DEAD ? (
          <p className="hint">Its remains lie where it fell. (Put it on the back line to see them further off.)</p>
        ) : part.stance === MODEL ? null : (
          <div className="viewer-section">
            <span className="picker-label">Actions from this stance</span>
            <div className="picker-options">
              {viewerActions(partKinds[i], shown, part.stance, i).flatMap(({ action: a, available, fixed }) => [
                <button
                  key={a.name}
                  className={`chip viewer-action${available ? "" : " viewer-unmet"}${multi && part.chosen === a.name ? " is-chosen" : ""}`}
                  title={available ? `Play ${a.name}` : `Play ${a.name} anyway (in a fight it needs ${a.needs.map(needText).join(", ")})`}
                  onClick={e => { e.currentTarget.blur(); play(i, a.name); }}
                >
                  ▶ {a.name} <span className="viewer-kind">{fixed ? "fixed rule" : a.type}</span>
                </button>,
                // A Rest can also be broken by a blow, to see the flinch.
                ...(a.type === "rest" && !fixed && part.stance !== STAGGERED
                  ? [
                      <button
                        key={`${a.name}-flinch`}
                        className={`chip viewer-action${available ? "" : " viewer-unmet"}`}
                        title={`Play ${a.name}, broken by a blow`}
                        onClick={e => { e.currentTarget.blur(); play(i, a.name, true); }}
                      >
                        ↯ Flinch <span className="viewer-kind">{a.name} interrupted</span>
                      </button>,
                    ]
                  : []),
              ])}
            </div>
          </div>
        )}
      </>
    );
  };

  const panel = (
    <aside className="viewer-panel" aria-label="Model viewer">
      <div className="viewer-head">
        <h2 className="viewer-title">{subjectName(subject)}</h2>
        <button className="hud-button viewer-change" onClick={onBack}>Change enemy</button>
      </div>
      <LightToggle lit={lit} onChange={setLit} />
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
      {multi && (
        <div className="viewer-section">
          <span className="picker-label">Whole body</span>
          <div className="picker-options">
            {[STAGGERED, DEAD, MODEL].map(name => (
              <button key={name} className="chip" aria-pressed={show.parts.every(p => p.stance === name)} onClick={() => setAllStances(name)}>{name}</button>
            ))}
            <button
              className="chip viewer-action"
              title="Every part does the action it last played (or the first of its stance), all in the same turn"
              onClick={e => { e.currentTarget.blur(); playAll(); }}
            >
              ▶ Play all parts <span className="viewer-kind">together</span>
            </button>
          </div>
        </div>
      )}
      {anyModel && (
        <div className="viewer-section">
          <span className="picker-label">Angle</span>
          <div className="picker-options">
            {MODEL_ANGLES.map(a => (
              <button key={a.id} className="chip" aria-pressed={(show.angle ?? "front34") === a.id} onClick={() => setShow(prev => ({ ...prev, angle: a.id }))}>
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {kinds.map((_, i) => (
        <div key={i} className={multi ? "viewer-part" : undefined}>
          {multi && <h3 className="viewer-part-title">{partLabel(subject, i)}</h3>}
          {partControls(i)}
        </div>
      ))}
    </aside>
  );

  return (
    <CombatScreen
      initial={initial}
      override={override}
      panel={panel}
      light={lit}
      playSignal={playSignal}
      playTarget={playTarget}
      attackOnPlay={!!show.interrupt}
      figureAngle={anyModel ? figureAngleOf(show.angle ?? "front34") : undefined}
      onTurnPlayed={afterTurn}
      onRetry={onRetry}
      onChangeLoadout={onBack}
      changeLabel="Change enemy"
      onExit={onExit}
    />
  );
}

/**
 * The player in the viewer: pick the weapon and armor, hold any pose still (or the Model stance:
 * a T-pose from four angles), or play one of your actions against a dummy Sleepwalker that does
 * what the action needs (strikes, so there is something to block or dodge; or rests, so there is
 * something to hit). Every play starts from the same spot.
 */
function PlayerViewerFight({ onBack, onRetry, onExit }: { onBack: () => void; onRetry: () => void; onExit: () => void }) {
  const [weapon, setWeapon] = useState<WeaponTier>("normal");
  const [armor, setArmor] = useState<ArmorTier>("light");
  /** The pose held still, or "model" for the T-pose. */
  const [held, setHeld] = useState<PoseName | "model" | "dead">("idle");
  const [angle, setAngle] = useState<ModelAngle>("front34");
  const [scenarioId, setScenarioId] = useState<string | undefined>();
  const [lit, setLit] = useState(true);
  const [playSignal, setPlaySignal] = useState(0);
  const scenario = PLAYER_SCENARIOS.find(sc => sc.id === scenarioId);
  const initial = useMemo(() => playerViewerFight("normal", "light"), []);
  const override = useCallback((s: CombatState) => applyPlayerShow(s, weapon, armor, scenario), [weapon, armor, scenario]);
  const model = held === "model";
  const seen = figureAngleOf(angle);
  const play = (id: string) => {
    setScenarioId(id);
    setPlaySignal(n => n + 1);
  };
  const chips = <T extends string>(label: string, options: T[], value: T, labelOf: (o: T) => string, pick: (o: T) => void) => (
    <div className="viewer-section">
      <span className="picker-label">{label}</span>
      <div className="picker-options">
        {options.map(o => (
          <button key={o} className="chip" aria-pressed={o === value} onClick={() => pick(o)}>{labelOf(o)}</button>
        ))}
      </div>
    </div>
  );
  const panel = (
    <aside className="viewer-panel" aria-label="Model viewer">
      <div className="viewer-head">
        <h2 className="viewer-title">You</h2>
        <button className="hud-button viewer-change" onClick={onBack}>Change model</button>
      </div>
      <LightToggle lit={lit} onChange={setLit} />
      {chips("Weapon", Object.keys(WEAPONS) as WeaponTier[], weapon, o => WEAPONS[o].label, setWeapon)}
      {chips("Armor", Object.keys(ARMOR) as ArmorTier[], armor, o => ARMOR[o].label, setArmor)}
      {chips("Pose", [...PLAYER_POSES, "dead" as const, "model" as const], held, o => (o === "model" ? MODEL : o === "dead" ? "Dead" : o), o => { setHeld(o); setScenarioId(undefined); })}
      {model && chips("Angle", MODEL_ANGLES.map(a => a.id), angle, o => MODEL_ANGLES.find(a => a.id === o)!.label, setAngle)}
      {!model && held !== "dead" && (
        <div className="viewer-section">
          <span className="picker-label">Actions</span>
          <div className="picker-options">
            {PLAYER_SCENARIOS.map(sc => (
              <button key={sc.id} className="chip viewer-action" onClick={e => { e.currentTarget.blur(); play(sc.id); }}>
                ▶ {sc.label} <span className="viewer-kind">{sc.action.type}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
  return (
    <CombatScreen
      initial={initial}
      override={override}
      panel={panel}
      light={lit}
      playSignal={playSignal}
      playerAction={scenario ? playerActionOf(scenario) : undefined}
      playerHold={model ? (seen.view === "back" ? "t-pose-b" : "t-pose") : held === "dead" ? undefined : held}
      playerDead={held === "dead"}
      playerAngle={model ? seen : undefined}
      onRetry={onRetry}
      onChangeLoadout={onBack}
      changeLabel="Change model"
      onExit={onExit}
    />
  );
}

/** The fight's limited light, on (to see how far-away sprites are shaded: put the enemy on the back line) or off (to see everything). */
function LightToggle({ lit, onChange }: { lit: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="viewer-section">
      <span className="picker-label">Light</span>
      <div className="picker-options">
        <button className="chip viewer-toggle" aria-pressed={lit} onClick={() => onChange(!lit)}>{lit ? "Fight's light: on" : "Fight's light: off"}</button>
      </div>
    </div>
  );
}
