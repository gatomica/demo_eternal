import { useEffect, useRef, useState } from "react";
import {
  ARMOR,
  ENCOUNTERS,
  WEAPONS,
  attackCost,
  attackDamage,
  createCombat,
  forcedAction,
  maneuverCost,
  previewThreat,
  resistance,
  resolveTurn,
  restAmount,
  type ArmorTier,
  type CombatState,
  type Enemy,
  type PlayerAction,
  type Step,
  type Tier,
} from "./combat";
import { HealthBar, Shards, StickFigure, poseForIntent, type BarValues, type PoseName } from "./render";

type Screen = "menu" | "test";

export default function App() {
  const [screen, setScreen] = useState<Screen>("menu");
  return (
    <div className="game">
      {screen === "menu" && <MainMenu onStart={setScreen} />}
      {screen === "test" && <TestCombat onExit={() => setScreen("menu")} />}
    </div>
  );
}

/* ============================================================
 * Keys
 *
 * The game is played on the keyboard (WASD, like exploring), with the mouse as a convenience.
 * Arrow keys, Enter and Escape mirror WASD, E and Q.
 * ============================================================ */

type Dir = "up" | "left" | "down" | "right";
type Key = Dir | "select" | "back";

function readKey(e: KeyboardEvent): Key | null {
  switch (e.key.toLowerCase()) {
    case "w": case "arrowup": return "up";
    case "a": case "arrowleft": return "left";
    case "s": case "arrowdown": return "down";
    case "d": case "arrowright": return "right";
    case "e": case "enter": case " ": return "select";
    case "q": case "escape": return "back";
    default: return null;
  }
}

function useKeys(handler: (key: Key) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const key = readKey(e);
      if (!key) return;
      e.preventDefault();
      ref.current(key);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

const KEY_LABEL: Record<Dir, string> = { up: "W", left: "A", down: "S", right: "D" };

/* ============================================================
 * Main menu
 * ============================================================ */

function MainMenu({ onStart }: { onStart: (screen: Screen) => void }) {
  useKeys(key => { if (key === "select") onStart("test"); });
  return (
    <main className="menu">
      <h1 className="menu-title">Combat Demo</h1>
      <nav className="menu-options" aria-label="Main menu">
        <button className="menu-button is-focused" onClick={() => onStart("test")}>
          Test combat <kbd>E</kbd>
        </button>
      </nav>
    </main>
  );
}

/* ============================================================
 * Test combat: pick a loadout and encounter, then fight
 * ============================================================ */

interface Setup {
  weapon: Tier;
  armor: ArmorTier;
  encounterId: string;
}

const PLAYER_MAX_HP = 40;
const REVIVE_CHARGES = 2;

function startFight(setup: Setup): CombatState {
  const encounter = ENCOUNTERS.find(e => e.id === setup.encounterId)!;
  return createCombat(
    { maxHP: PLAYER_MAX_HP, weapon: setup.weapon, armor: setup.armor, charges: REVIVE_CHARGES },
    encounter.enemies,
  );
}

function TestCombat({ onExit }: { onExit: () => void }) {
  const [setup, setSetup] = useState<Setup>({ weapon: "normal", armor: "normal", encounterId: "one" });
  // `id` gives every new fight a fresh screen state.
  const [run, setRun] = useState<{ id: number; state: CombatState } | null>(null);
  const start = () => setRun(r => ({ id: (r?.id ?? 0) + 1, state: startFight(setup) }));

  if (!run) return <SetupScreen setup={setup} onChange={setSetup} onStart={start} onExit={onExit} />;
  return <CombatScreen key={run.id} initial={run.state} onRetry={start} onChangeLoadout={() => setRun(null)} onExit={onExit} />;
}

const TIER_KEYS = Object.keys(WEAPONS) as Tier[];
const ARMOR_KEYS = Object.keys(ARMOR) as ArmorTier[];

/** W/S pick a row, A/D change the value in it, E starts, Q goes back to the menu. */
function SetupScreen({ setup, onChange, onStart, onExit }: {
  setup: Setup;
  onChange: (s: Setup) => void;
  onStart: () => void;
  onExit: () => void;
}) {
  const rows = [
    { label: "Weapon", field: "weapon", options: TIER_KEYS, labels: undefined },
    { label: "Armor", field: "armor", options: ARMOR_KEYS, labels: undefined },
    {
      label: "Encounter",
      field: "encounterId",
      options: ENCOUNTERS.map(e => e.id),
      labels: Object.fromEntries(ENCOUNTERS.map(e => [e.id, e.label])),
    },
  ] as const;
  const [row, setRow] = useState(0);

  useKeys(key => {
    if (key === "up") setRow(r => Math.max(0, r - 1));
    else if (key === "down") setRow(r => Math.min(rows.length - 1, r + 1));
    else if (key === "left" || key === "right") {
      const { field, options } = rows[row];
      const list = options as readonly string[];
      const i = list.indexOf(setup[field]);
      const next = list[(i + (key === "right" ? 1 : list.length - 1)) % list.length];
      onChange({ ...setup, [field]: next });
    } else if (key === "select") onStart();
    else if (key === "back") onExit();
  });

  return (
    <main className="setup">
      <h2 className="setup-title">Test combat</h2>
      {rows.map((r, i) => (
        <Picker
          key={r.field}
          label={r.label}
          focused={i === row}
          value={setup[r.field]}
          options={[...r.options]}
          labels={r.labels}
          onChange={v => { setRow(i); onChange({ ...setup, [r.field]: v }); }}
        />
      ))}
      <div className="setup-figure">
        <StickFigure view="back" pose="idle" weapon={setup.weapon} armor={setup.armor} title="Your loadout" />
      </div>
      <p className="hint">
        <kbd>W</kbd><kbd>S</kbd> choose · <kbd>A</kbd><kbd>D</kbd> change · <kbd>E</kbd> fight · <kbd>Q</kbd> menu
      </p>
      <div className="setup-buttons">
        <button className="hud-button" onClick={onExit}>Menu</button>
        <button className="commit" onClick={onStart}>Fight</button>
      </div>
    </main>
  );
}

/* ============================================================
 * The fight
 * ============================================================ */

/** What the cursor is on: you, or an enemy. */
type Selection = { kind: "player" } | { kind: "enemy"; id: string };

/** An option on the action wheel. */
interface WheelOption {
  label: string;
  action: PlayerAction;
  hint: string;
}
type Wheel = Record<Dir, WheelOption | null>;

const r1 = (n: number) => Math.round(n * 10) / 10;

/** How long a lost turn (guard break or revive) stays on screen before it plays out. */
const FORCED_TURN_MS = 1600;

/** Rows by depth, closest first: you, the front line, the back line. Empty lines are skipped. */
function rowsOf(fight: CombatState): Selection[][] {
  const line = (l: "front" | "back") =>
    fight.enemies.filter(e => e.alive && e.line === l).map(e => ({ kind: "enemy", id: e.id }) as Selection);
  return [[{ kind: "player" }], line("front"), line("back")];
}

const sameSel = (a: Selection, b: Selection) =>
  a.kind === b.kind && (a.kind === "player" || (b.kind === "enemy" && a.id === b.id));

/** Default selection: the first enemy on the front line, else the first still standing. */
function defaultSelection(fight: CombatState): Selection {
  const rows = rowsOf(fight);
  return rows[1][0] ?? rows[2][0] ?? { kind: "player" };
}

/** How long each step of a turn's playback stays on screen. */
const STEP_MS = 800;

/** A turn being played back: the state before it, its steps, and which one is showing. */
interface Playback {
  from: CombatState;
  steps: Step[];
  index: number;
  playerPose: PoseName;
}

/** The fight as it stood after a given step: the turn's starting state with that step's bars and positions. */
function viewAt(from: CombatState, after: Step["after"]): CombatState {
  const v = structuredClone(from);
  for (const f of [v.player, ...v.enemies]) {
    const a = after[f.id];
    if (!a) continue;
    f.hp = a.hp;
    f.fatigue = a.fatigue;
    f.death = a.death;
    f.broken = a.broken;
    if ("alive" in f) f.alive = a.alive;
    if ("line" in f && a.line) f.line = a.line;
  }
  return v;
}

type Tone = "damage" | "fatigue" | "good" | "info";
interface Fx {
  classes: string[];
  floats: { text: string; tone: Tone }[];
}

/** Turns a step's events into per-fighter animations and words. Numbers live in the health bars. */
function effectsOf(step: Step | undefined): Map<string, Fx> {
  const fx = new Map<string, Fx>();
  const get = (id: string) => {
    if (!fx.has(id)) fx.set(id, { classes: [], floats: [] });
    return fx.get(id)!;
  };
  const say = (id: string, text: string, tone: Tone) => {
    const f = get(id);
    if (!f.floats.some(x => x.text === text)) f.floats.push({ text, tone });
  };
  for (const ev of step?.events ?? []) {
    switch (ev.kind) {
      case "attack": {
        get(ev.attacker).classes.push("fx-attack");
        if (ev.grit) say(ev.attacker, "Grits through", "fatigue");
        const t = get(ev.target);
        if (ev.result === "dodged") {
          t.classes.push("fx-dodge");
          say(ev.target, "Dodged", "info");
        } else if (ev.result === "blocked") {
          t.classes.push("fx-block");
          say(ev.target, "Blocked", "info");
        } else {
          t.classes.push("fx-hit");
        }
        break;
      }
      case "canceled":
        if (ev.reason === "broken") say(ev.who, "Too slow", "info");
        break;
      case "break":
        get(ev.who).classes.push("fx-break");
        say(ev.who, "Broken", "fatigue");
        break;
      case "fall":
        get(ev.who).classes.push("fx-fall");
        break;
      case "rest":
        if (ev.result === "rested") say(ev.who, "Rested", "good");
        else if (ev.result === "recovered") say(ev.who, "Recovers", "good");
        else say(ev.who, "Rest interrupted", "damage");
        break;
      case "revive":
        say(ev.who, "Revived", "good");
        break;
      case "move":
        // Moves read from whoever caused them: your attack or Maneuver means you engage or disengage.
        if (ev.cause === "player") say("player", ev.to === "front" ? "Engages" : "Disengages", "info");
        else say(ev.who, ev.to === "front" ? "Advances" : "Retreats", "info");
        break;
      case "defeat":
        break;
    }
  }
  return fx;
}

/** The enemy a step is about, so the bottom-right bar can follow the action. */
function involvedEnemy(step: Step | undefined): string | undefined {
  for (const ev of step?.events ?? []) {
    const ids = ev.kind === "attack" ? [ev.target, ev.attacker] : [ev.who];
    const enemy = ids.find(id => id !== "player");
    if (enemy) return enemy;
  }
  return undefined;
}

const barValues = (f: { hp: number; fatigue: number; death: number }): BarValues => ({ hp: f.hp, fatigue: f.fatigue, death: f.death });

function CombatScreen({ initial, onRetry, onChangeLoadout, onExit }: {
  initial: CombatState;
  onRetry: () => void;
  onChangeLoadout: () => void;
  onExit: () => void;
}) {
  const [fight, setFight] = useState(initial);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [selection, setSelection] = useState<Selection>(() => defaultSelection(initial));
  const [wheelOpen, setWheelOpen] = useState(false);
  const [highlight, setHighlight] = useState<Dir | null>(null);

  const busy = playback !== null;
  const forced = forcedAction(fight);
  const playing = fight.status === "playing";

  // What's on screen: mid-turn during playback, otherwise the fight as it stands.
  const step = playback?.steps[playback.index];
  const view = playback && step ? viewAt(playback.from, step.after) : fight;
  const fx = effectsOf(step);
  // The fight just before this step, so a bar that appears mid-turn still animates from it.
  const prevView = playback ? (playback.index > 0 ? viewAt(playback.from, playback.steps[playback.index - 1].after) : playback.from) : undefined;
  const stepKey = playback ? `${playback.from.turn}-${playback.index}` : "rest";
  const p = view.player;

  // Keep the selection valid: a fallen enemy hands the cursor to the next one.
  const rows = rowsOf(fight);
  const sel: Selection = rows.flat().some(s => sameSel(s, selection)) ? selection : defaultSelection(fight);
  const selectedEnemy = sel.kind === "enemy" ? view.enemies.find(e => e.id === sel.id) : undefined;
  // During playback the bar follows whichever enemy the current step is about.
  const shownId = (busy && involvedEnemy(step)) || selectedEnemy?.id;
  const shownEnemy = view.enemies.find(e => e.id === shownId);
  const shownBefore = prevView?.enemies.find(e => e.id === shownId);

  /* ---------- the wheel for the current selection ---------- */
  const wheel: Wheel = (() => {
    const me = fight.player;
    const opt = (label: string, action: PlayerAction, hint: string): WheelOption => ({ label, action, hint });
    if (sel.kind === "player") {
      return {
        up: null,
        left: opt("Fall back", { type: "maneuver", target: "self" }, `+${r1(maneuverCost(me))} Fatigue`),
        down: opt("Rest", { type: "rest" }, `−${r1(restAmount(me))} Fatigue`),
        right: null,
      };
    }
    return {
      up: opt("Attack", { type: "attack", target: sel.id }, `+${r1(attackCost(me))} Fatigue · ${r1(attackDamage(me))} dmg`),
      left: opt("Maneuver", { type: "maneuver", target: sel.id }, `+${r1(maneuverCost(me))} Fatigue`),
      down: null,
      right: opt("Block", { type: "block", target: sel.id }, `${Math.round(resistance(me, true) * 16)}/16 sent back`),
    };
  })();
  const chosen = wheelOpen && highlight ? wheel[highlight] : null;

  /* ---------- moving the cursor ----------
   * W/S move between depths. A/D walk the whole lineup as it appears on screen, left to right:
   * you, then the front line, then the back line. So pressing A at the left end of a line
   * steps to the line closer to you, and D at the right end steps to the line behind. */
  const moveDepth = (dir: 1 | -1) => {
    const r = rows.findIndex(row => row.some(s => sameSel(s, sel)));
    for (let next = r + dir; next >= 0 && next < rows.length; next += dir) {
      if (rows[next].length) {
        // Land on the visually closest one: the left end of a line farther away, the right end of a closer one.
        setSelection(dir > 0 ? rows[next][0] : rows[next][rows[next].length - 1]);
        return;
      }
    }
  };
  const moveAcross = (dir: 1 | -1) => {
    const lineup = rows.flat();
    const i = lineup.findIndex(s => sameSel(s, sel));
    setSelection(lineup[Math.max(0, Math.min(lineup.length - 1, i + dir))]);
  };

  const openWheel = (s: Selection = sel) => {
    setSelection(s);
    setWheelOpen(true);
    // Ready to go: E, E attacks an enemy, or rests when you select yourself.
    setHighlight(s.kind === "enemy" ? "up" : "down");
  };
  const closeWheel = () => {
    setWheelOpen(false);
    setHighlight(null);
  };

  /** Resolve the turn, then play it back step by step. */
  const play = (action: PlayerAction) => {
    const next = resolveTurn(fight, action);
    const pose: PoseName = forced === "revive" ? "idle" : forced === "rest" ? "rest" : action.type;
    setFight(next);
    setPlayback(next.lastTurn.length ? { from: fight, steps: next.lastTurn, index: 0, playerPose: pose } : null);
    closeWheel();
  };
  const commit = (option: WheelOption | null) => {
    if (option && playing && !busy) play(option.action);
  };

  // Advance the playback one step at a time.
  useEffect(() => {
    if (!playback) return;
    const timer = window.setTimeout(
      () => setPlayback(pb => (pb && pb.index + 1 < pb.steps.length ? { ...pb, index: pb.index + 1 } : null)),
      STEP_MS,
    );
    return () => window.clearTimeout(timer);
  }, [playback]);

  // A guard break or a revive costs you the turn: show it, then play it out on its own.
  useEffect(() => {
    if (!playing || !forced || busy) return;
    const timer = window.setTimeout(() => play({ type: "rest" }), FORCED_TURN_MS);
    return () => window.clearTimeout(timer);
  });

  useKeys(key => {
    if (busy) return; // input waits for the turn to finish playing
    if (!playing) {
      if (key === "select") onRetry();
      else if (key === "back") onExit();
      return;
    }
    if (forced) return; // the turn plays itself
    if (!wheelOpen) {
      if (key === "up") moveDepth(1);
      else if (key === "down") moveDepth(-1);
      else if (key === "left") moveAcross(-1);
      else if (key === "right") moveAcross(1);
      else if (key === "select") openWheel(sel);
      return;
    }
    if (key === "back") closeWheel();
    else if (key === "select") commit(chosen);
    else if (wheel[key]) setHighlight(key);
  });

  /* ---------- what the screen shows ---------- */
  const playerPose: PoseName = playback
    ? playback.playerPose
    : forced === "rest" ? "rest" : forced === "revive" ? "idle" : (chosen?.action.type as PoseName | undefined) ?? "idle";
  const threat = previewThreat(fight, chosen?.action);
  const threatText = !threat.attackers.length
    ? "No one is attacking. A safe window."
    : `${threat.attackers.length} attacking${chosen ? ` · ${threat.unanswered.length ? `${threat.unanswered.length} will reach you` : "all answered"}` : ""}`;

  // Enemies still standing, plus any falling during this step.
  const shown = (line: "front" | "back") =>
    view.enemies.filter(e => e.line === line && (e.alive || fx.get(e.id)?.classes.includes("fx-fall")));
  const enemyFigure = (e: Enemy) => (
    <EnemyFigure
      key={e.id}
      enemy={e}
      selected={!busy && sel.kind === "enemy" && sel.id === e.id}
      fx={fx.get(e.id)}
      stepKey={stepKey}
      disabled={busy || !playing || forced !== null}
      onPick={() => openWheel({ kind: "enemy", id: e.id })}
    />
  );
  const playerFx = fx.get(p.id);

  return (
    <div className="hud">
      <section className="stage" aria-label="Battlefield">
        <div className="stage-floor" aria-hidden="true" />
        <div className="stage-row stage-back" aria-label="Back line">{shown("back").map(enemyFigure)}</div>
        <div className="stage-row stage-front" aria-label="Front line">{shown("front").map(enemyFigure)}</div>
        <button
          className={`stage-player ${!busy && sel.kind === "player" ? "is-target" : ""}`}
          aria-label="Select yourself"
          onClick={() => openWheel({ kind: "player" })}
          disabled={busy || !playing || forced !== null}
        >
          <div key={stepKey} className={`fig-wrap ${playerFx?.classes.join(" ") ?? ""}`}>
            <StickFigure view="back" pose={playerPose} weapon={p.weapon} armor={p.armor} title="You" />
            {playerFx?.classes.includes("fx-break") && <Shards />}
            <Floats fx={playerFx} />
          </div>
        </button>
      </section>

      {/* Top left, above you: your own bar. */}
      <header className="hud-corner hud-top-left">
        <div className="hud-row">
          <button className="hud-button" onClick={onExit}>Menu</button>
          <span className="hud-label">Turn {view.turn}</span>
        </div>
        <div className="hud-stat">
          <span className="hud-name">
            {p.name}
            <span className="hud-line"> · Revives {p.charges}</span>
            {p.broken && <span className="tag tag-sleep">Broken</span>}
            {p.reviving && <span className="tag">Reviving</span>}
          </span>
          <HealthBar fighter={p} />
        </div>
      </header>

      {playing && forced && !busy && (
        <div className="forced-banner" role="status">
          <h2>{forced === "revive" ? "You revive" : "Guard broken"}</h2>
          <p>{forced === "revive" ? "The world refuses to let you go. Nothing can touch you this turn." : "Sleep's pull takes you. You lose this turn."}</p>
        </div>
      )}

      {/* Bottom right, below the enemies: threat, your target's bar, then the wheel. */}
      {(busy || (playing && !forced)) && (
        <footer className="hud-corner hud-bottom-right">
          {!busy && <p className={`threat ${chosen && threat.unanswered.length ? "is-danger" : ""}`}>{threatText}</p>}
          {shownEnemy && (shownEnemy.alive || busy) && (
            <TargetPanel key={shownEnemy.id} enemy={shownEnemy} before={shownBefore && barValues(shownBefore)} />
          )}
          {busy ? null : wheelOpen ? (
            <ActionWheel
              wheel={wheel}
              highlight={highlight}
              center={sel.kind === "player" ? "You" : selectedEnemy?.name ?? ""}
              onHighlight={setHighlight}
              onCommit={commit}
              onClose={closeWheel}
            />
          ) : (
            <p className="hint">
              <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> select · <kbd>E</kbd> actions
            </p>
          )}
        </footer>
      )}

      {!playing && !busy && (
        <div className="result" role="dialog" aria-label="Fight over">
          <div className="result-card">
            <h2>{fight.status === "won" ? "The sleepwalkers are still" : "You fade"}</h2>
            <p>
              {fight.status === "won"
                ? `Won in ${fight.turn - 1} turns with ${r1(fight.player.hp)} health left.`
                : `Fell on turn ${fight.turn - 1}.`}
            </p>
            <div className="setup-buttons">
              <button className="hud-button" onClick={onExit}>Menu <kbd>Q</kbd></button>
              <button className="hud-button" onClick={onChangeLoadout}>Change loadout</button>
              <button className="commit" onClick={onRetry}>Retry <kbd>E</kbd></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Numbers and words that rise off a fighter during playback. */
function Floats({ fx }: { fx?: Fx }) {
  if (!fx?.floats.length) return null;
  return (
    <span className="floats" aria-live="polite">
      {fx.floats.map((f, i) => (
        <span key={i} className={`float float-${f.tone}`}>{f.text}</span>
      ))}
    </span>
  );
}

/**
 * Four options around the selection's name. WASD highlights, E commits, Q closes.
 * With a mouse, clicking an option commits it straight away.
 */
function ActionWheel({ wheel, highlight, center, onHighlight, onCommit, onClose }: {
  wheel: Wheel;
  highlight: Dir | null;
  center: string;
  onHighlight: (d: Dir) => void;
  onCommit: (o: WheelOption) => void;
  onClose: () => void;
}) {
  return (
    <div className="wheel" role="menu" aria-label={`Actions for ${center}`}>
      {(Object.keys(wheel) as Dir[]).map(dir => {
        const o = wheel[dir];
        return (
          <button
            key={dir}
            role="menuitem"
            className={`wheel-option wheel-${dir} ${highlight === dir ? "is-highlighted" : ""}`}
            disabled={!o}
            onMouseEnter={() => o && onHighlight(dir)}
            onClick={() => o && onCommit(o)}
          >
            <kbd>{KEY_LABEL[dir]}</kbd>
            {o ? <><b>{o.label}</b><small>{o.hint}</small></> : <small className="wheel-empty">Empty</small>}
          </button>
        );
      })}
      <div className="wheel-center">
        <span>{center}</span>
        <button className="wheel-close" onClick={onClose}><kbd>Q</kbd> Close</button>
      </div>
      <p className="wheel-confirm">{highlight && wheel[highlight] ? <><kbd>E</kbd> {wheel[highlight]!.label}</> : "Pick an action"}</p>
    </div>
  );
}

/** One health bar for whoever you're targeting (or, mid-turn, whoever the action involves). Always in the same spot. */
function TargetPanel({ enemy, before }: { enemy: Enemy; before?: BarValues }) {
  return (
    <div className="hud-stat hud-target">
      <span className="hud-name">
        {enemy.broken && <span className="tag tag-sleep">Broken</span>}
        {enemy.name} <span className="hud-line">· {enemy.line === "front" ? "Front line" : "Back line"}</span>
      </span>
      <HealthBar fighter={enemy} before={before} mirrored />
    </div>
  );
}

/** Clicking an enemy selects it and opens the wheel. A Maneuver telegraph also shows which way it will move. */
function EnemyFigure({ enemy, selected, fx, stepKey, disabled, onPick }: {
  enemy: Enemy;
  selected: boolean;
  fx?: Fx;
  stepKey: string;
  disabled: boolean;
  onPick: () => void;
}) {
  const moving = enemy.alive && enemy.intent.type === "maneuver" ? enemy.intent.dir : undefined;
  return (
    <button
      className={`stage-slot ${selected ? "is-target" : ""}`}
      data-moving={moving}
      aria-pressed={selected}
      aria-label={`Select ${enemy.name}`}
      disabled={disabled}
      onClick={onPick}
    >
      <div key={stepKey} className={`fig-wrap ${fx?.classes.join(" ") ?? ""}`}>
        <StickFigure
          view="front"
          pose={poseForIntent({ ...enemy, alive: true })}
          weapon={enemy.weapon}
          armor={enemy.armor}
          title={`${enemy.name}: ${enemy.intent.forced ? "broken, must rest" : moving ? `${moving}s` : enemy.intent.type}`}
        />
        {fx?.classes.includes("fx-break") && <Shards />}
        <Floats fx={fx} />
      </div>
    </button>
  );
}

function Picker<T extends string>({ label, value, options, labels, focused, onChange }: {
  label: string;
  value: T;
  options: T[];
  labels?: Record<string, string>;
  focused?: boolean;
  onChange: (v: T) => void;
}) {
  return (
    <div className={`picker ${focused ? "is-focused" : ""}`} role="group" aria-label={label}>
      <span className="picker-label">{label}</span>
      <div className="picker-options">
        {options.map(o => (
          <button key={o} className="chip" aria-pressed={o === value} onClick={() => onChange(o)}>
            {labels?.[o] ?? o[0].toUpperCase() + o.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
}