/**
 * ModelViewer.tsx — one enemy against a dummy you, nobody gets hurt. Pick the enemy first, then on
 * its panel: its statuses, the stance it shows, and click any action that stance allows (with
 * those statuses) to watch it play out. Or pick "You" to look at the player instead: any weapon
 * and armor, any pose held still, and your actions played against a dummy Sleepwalker.
 */
import { useCallback, useMemo, useState } from "react";
import { CombatScreen } from "../combat/CombatScreen";
import { ENEMY_KINDS, type KindId, type StatusToggle } from "../core/bestiary";
import { needText } from "../core/conditions";
import { nextStances } from "../core/patterns";
import type { CombatState } from "../core/types";
import { ARMOR, WEAPONS } from "../core/rules";
import type { ArmorTier, WeaponTier } from "../core/types";
import type { PoseName } from "../render/poses";
import { applyPlayerShow, applyShow, DEAD, figureAngleOf, LINE_TOGGLE, MODEL, MODEL_ANGLES, type ModelAngle, PLAYER_POSES, PLAYER_SCENARIOS, playerActionOf, playerViewerFight, STAGGERED, VIEWER_KINDS, viewerActions, viewerFight, type ViewerShow } from "./viewerModel";
import { cycle, useKeys } from "../ui/input";
import { Picker } from "../ui/Picker";

/** What the viewer looks at: an enemy, or you. */
type Subject = KindId | "player";
const SUBJECTS: Subject[] = [...VIEWER_KINDS, "player"];

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
        labels={{ ...Object.fromEntries(VIEWER_KINDS.map(k => [k, ENEMY_KINDS[k].name])), player: "You (player)" }}
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
  const [kind, setKind] = useState<Subject>(VIEWER_KINDS[0]);
  const [viewing, setViewing] = useState(false);
  const [run, setRun] = useState(0);
  if (!viewing) return <ViewerSetup kind={kind} onChange={setKind} onStart={() => { setRun(r => r + 1); setViewing(true); }} onExit={onExit} />;
  if (kind === "player") return <PlayerViewerFight key={`player-${run}`} onBack={() => setViewing(false)} onRetry={() => setRun(r => r + 1)} onExit={onExit} />;
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
  const [lit, setLit] = useState(true);
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
    const options = nextStances(kind.pattern, { action, outcome: interrupt ? "undone" : "done", avoid: interrupt ? show.stance : undefined });
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
      <div className="viewer-section">
        <span className="picker-label">Stance</span>
        <div className="picker-options">
          {[...kind.pattern.stances.map(st => st.name), STAGGERED, DEAD, MODEL].map(name => (
            <button key={name} className="chip" aria-pressed={name === show.stance} onClick={() => setShow(prev => ({ ...prev, stance: name, action: undefined, next: undefined }))}>
              {name}
            </button>
          ))}
        </div>
      </div>
      {show.stance === MODEL ? (
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
      ) : show.stance === DEAD ? (
        <p className="hint">Its remains lie where it fell. (Put it on the back line to see them further off.)</p>
      ) : (
      <div className="viewer-section">
        <span className="picker-label">Actions from this stance</span>
        <div className="picker-options">
          {viewerActions(kindName, shown, show.stance).flatMap(({ action: a, available, fixed }) => [
            <button
              key={a.name}
              className={`chip viewer-action${available ? "" : " viewer-unmet"}`}
              title={available ? `Play ${a.name}` : `Play ${a.name} anyway (in a fight it needs ${a.needs.map(needText).join(", ")})`}
              onClick={e => { e.currentTarget.blur(); play(a.name); }}
            >
              ▶ {a.name} <span className="viewer-kind">{fixed ? "fixed rule" : a.type}</span>
            </button>,
            // A Rest can also be broken by a blow, to see the flinch.
            ...(a.type === "rest" && !fixed && show.stance !== STAGGERED
              ? [
                  <button
                    key={`${a.name}-flinch`}
                    className={`chip viewer-action${available ? "" : " viewer-unmet"}`}
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
      attackOnPlay={!!show.interrupt}
      figureAngle={show.stance === MODEL ? figureAngleOf(show.angle ?? "front34") : undefined}
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
