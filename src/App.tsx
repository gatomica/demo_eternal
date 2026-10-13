import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ARMOR,
  ENCOUNTERS,
  ENEMY_KINDS,
  WEAPONS,
  createCombat,
  describeAction,
  forcedAction,
  resolveTurn,
  type ArmorTier,
  type CombatState,
  type EnemySetup,
  type Enemy,
  type PlayerAction,
  type Step,
  type Tier,
  type WeaponTier,
} from "./combat";
import { HealthBar, IGNITE, Scene, StickFigure, actionPose, asPose, downPoseOf, flinchPoseOf, figureBox, idlePoseOf, poseForIntent, strikePose, windUpPose, shotCamera, type BarValues, type PoseName, type Projectile, type SceneFigure, type SceneShot, type ShotCamera } from "./render";
import {
  actionCamera,
  behind,
  closeIn,
  facingToward,
  formation,
  pushedAway,
  sub,
  yawOf,
  lerpAngle,
  type Vec,
} from "./scene";
import { Exploration, type Journey, type MapFoe } from "./explore";
import { nextStances, type ActionDef } from "./patterns";
import { WARDEN_POSES, flailOf, type CandleArm, type WardenPoseName } from "./warden";

type Screen = "menu" | "test" | "explore" | "viewer";

export default function App() {
  const [screen, setScreen] = useState<Screen>("menu");
  return (
    <div className="game">
      {screen === "menu" && <MainMenu onStart={setScreen} />}
      {screen === "test" && <TestCombat onExit={() => setScreen("menu")} />}
      {screen === "explore" && <Journeying onExit={() => setScreen("menu")} />}
      {screen === "viewer" && <ModelViewer onExit={() => setScreen("menu")} />}
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
type Key = Dir | "select" | "back" | "pause";

function readKey(e: KeyboardEvent): Key | null {
  switch (e.key.toLowerCase()) {
    case "w": case "arrowup": return "up";
    case "a": case "arrowleft": return "left";
    case "s": case "arrowdown": return "down";
    case "d": case "arrowright": return "right";
    case "e": case "enter": case " ": return "select";
    case "q": return "back";
    case "escape": return "pause";
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


/* ============================================================
 * Main menu
 * ============================================================ */

const MENU_OPTIONS: { label: string; screen: Screen }[] = [
  { label: "Test combat", screen: "test" },
  { label: "Exploration", screen: "explore" },
  { label: "Model viewer", screen: "viewer" },
];

function MainMenu({ onStart }: { onStart: (screen: Screen) => void }) {
  const [focus, setFocus] = useState(0);
  useKeys(key => {
    if (key === "up" || key === "down") setFocus(i => (i + (key === "up" ? -1 : 1) + MENU_OPTIONS.length) % MENU_OPTIONS.length);
    if (key === "select") onStart(MENU_OPTIONS[focus].screen);
  });
  return (
    <main className="menu">
      <h1 className="menu-title">Demo</h1>
      <nav className="menu-options" aria-label="Main menu">
        {MENU_OPTIONS.map((o, i) => (
          <button
            key={o.screen}
            className={`menu-button ${i === focus ? "is-focused" : ""}`}
            onMouseEnter={() => setFocus(i)}
            onClick={() => onStart(o.screen)}
          >
            {o.label}
          </button>
        ))}
      </nav>
    </main>
  );
}

/* ============================================================
 * Test combat: pick a loadout and encounter, then fight
 * ============================================================ */

interface Setup {
  weapon: WeaponTier;
  armor: ArmorTier;
  encounterId: string;
}

/** Your starting health (the tutorial's). */
const PLAYER_MAX_HP = 20;
const REVIVE_CHARGES = 2;

function startFight(setup: Setup): CombatState {
  const encounter = ENCOUNTERS.find(e => e.id === setup.encounterId)!;
  return createCombat(
    { maxHP: PLAYER_MAX_HP, weapon: setup.weapon, armor: setup.armor, charges: encounter.charges ?? REVIVE_CHARGES },
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

/* ============================================================
 * Model viewer: one enemy against a dummy you, nobody gets hurt. Pick the enemy first, then on
 * its panel: its statuses, the stance it shows, and click any action that stance allows (with
 * those statuses) to watch it play out.
 * ============================================================ */

const VIEWER_KINDS = Object.keys(ENEMY_KINDS);

/** A status the viewer can flip, and what each side is called. */
interface ViewerToggle { key: string; off: string; on: string }
/** Statuses each kind can be shown with (the line applies to everyone). */
const VIEWER_TOGGLES: Record<string, ViewerToggle[]> = {
  warden: [
    { key: "sealed", off: "Unsealed", on: "Sealed" },
    { key: "phase2", off: "Phase 1", on: "Phase 2" },
    { key: "flaming", off: "Flail unlit", on: "Flaming flail" },
  ],
};
const LINE_TOGGLE: ViewerToggle = { key: "back", off: "Front line", on: "Back line" };

interface ViewerShow {
  stance: string;
  /** The action played (or about to be). */
  action?: string;
  /** Statuses that are on: "back", and the kind's own flags. */
  on: Record<string, boolean>;
  /** The fight's turn as shown. Once it moves past this, the action has played. */
  turn: number;
  /** The stance it moves on to after the action (picked when it's played). */
  next?: string;
  /** Play the Rest but break it with a blow (to see its flinch). */
  interrupt?: boolean;
}

function viewerFight(kind: string): CombatState {
  return createCombat(
    { name: "Dummy", maxHP: PLAYER_MAX_HP, weapon: "normal", armor: "light", charges: 0 },
    [{ kind, line: "front" }],
    { dummy: true },
  );
}

/** The viewer's extra "stance": knocked down, its only action the forced Rest that recovers. */
const STAGGERED = "Staggered";

/** Applies the viewer's choices to the enemy: its line, its statuses, its stance and action. */
function applyShow(s: CombatState, show: ViewerShow): CombatState {
  const v = structuredClone(s);
  const e = v.enemies[0];
  const kind = ENEMY_KINDS[e.kind];
  // Once the action has played, it stands in the stance it moved on to, statuses as the action left them.
  const played = s.turn > show.turn;
  const stanceName = played && show.next ? show.next : show.stance;
  e.alive = true;
  e.staggered = false;
  e.reviving = false;
  e.hp = e.maxHP;
  e.fatigue = 0;
  if (!played) {
    e.line = show.on.back ? "back" : "front";
    for (const t of VIEWER_TOGGLES[e.kind] ?? []) e.flags[t.key] = !!show.on[t.key];
    if (e.flags.phase2) e.flags.sealed = false; // phase two burns unsealed for good
    else e.flags.flaming = false; // only his phase-two flame can set the flail alight
  }
  if (stanceName === STAGGERED) {
    e.staggered = true;
    e.fatigue = e.hp;
    // A stagger puts the Warden's flame out (before phase two).
    if ("sealed" in e.flags && !e.flags.phase2) e.flags.sealed = true;
    e.intent = { type: "rest", dir: e.line === "back" ? "advance" : "retreat", forced: true };
    v.status = "playing";
    return v;
  }
  const stance = kind.pattern.stances.find(x => x.name === stanceName);
  const actionName = !played && show.action ? show.action : stance?.groups[0][0].name ?? "";
  const action = kind.pattern.actions.get(actionName.toLowerCase());
  if (action) e.intent = { ...describeAction(e.kind, e.line, stanceName, action), pose: kind.stancePoses[stanceName] };
  v.status = "playing";
  return v;
}

/** The actions a stance allows with the enemy as shown (conditions like *Sealed checked). */
function viewerActions(kindName: string, state: CombatState, stanceName: string) {
  const kind = ENEMY_KINDS[kindName];
  // Staggered, the only way on is to recover (into a `Recover >` stance).
  if (stanceName === STAGGERED) {
    return [{ action: { name: "Recover", type: "rest", needs: [] as string[] } as unknown as ActionDef, fixed: false, available: true }];
  }
  const stance = kind.pattern.stances.find(x => x.name === stanceName);
  const e = state.enemies[0];
  // Actions a fixed rule can force from any stance (the Warden's Usurp Flame) come last.
  const fixed = (kind.fixedActions ?? []).map(n => kind.pattern.actions.get(n.toLowerCase())!);
  return [...(stance?.groups.flat() ?? []), ...fixed].map(a => ({
    action: a,
    fixed: fixed.includes(a),
    available: a.needs.every(n => kind.conditions?.[n]?.(e, state) ?? false),
  }));
}

/** Pick which enemy to look at. A/D change, E opens it, Q goes back to the menu. */
function ViewerSetup({ kind, onChange, onStart, onExit }: {
  kind: string;
  onChange: (k: string) => void;
  onStart: () => void;
  onExit: () => void;
}) {
  useKeys(key => {
    if (key === "left" || key === "right") {
      const i = VIEWER_KINDS.indexOf(kind);
      onChange(VIEWER_KINDS[(i + (key === "right" ? 1 : VIEWER_KINDS.length - 1)) % VIEWER_KINDS.length]);
    } else if (key === "select") onStart();
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

function ModelViewer({ onExit }: { onExit: () => void }) {
  const [kind, setKind] = useState(VIEWER_KINDS[0]);
  const [viewing, setViewing] = useState(false);
  const [run, setRun] = useState(0);
  if (!viewing) return <ViewerSetup kind={kind} onChange={setKind} onStart={() => { setRun(r => r + 1); setViewing(true); }} onExit={onExit} />;
  return <ViewerFight key={`${kind}-${run}`} kind={kind} onBack={() => setViewing(false)} onRetry={() => setRun(r => r + 1)} onExit={onExit} />;
}

function ViewerFight({ kind: kindName, onBack, onRetry, onExit }: {
  kind: string;
  onBack: () => void;
  onRetry: () => void;
  onExit: () => void;
}) {
  const kind = ENEMY_KINDS[kindName];
  const [show, setShow] = useState<ViewerShow>(() => ({ stance: kind.pattern.stances[0].name, on: {}, turn: 1 }));
  const [playSignal, setPlaySignal] = useState(0);
  const initial = useMemo(() => viewerFight(kindName), [kindName]);
  const override = useCallback((s: CombatState) => applyShow(s, show), [show]);
  const shown = applyShow(initial, show);
  const toggles = [LINE_TOGGLE, ...(VIEWER_TOGGLES[kindName] ?? [])];
  const flip = (key: string) =>
    setShow(prev => {
      const on = { ...prev.on, [key]: !prev.on[key] };
      // Entering phase two, he always ends up in the "Second Phase >" stance (Idle).
      const second = key === "phase2" && on.phase2 ? nextStances(kind.pattern, { action: "Second Phase", outcome: "done" })[0]?.name : undefined;
      return { ...prev, action: undefined, next: undefined, interrupt: undefined, on, stance: second ?? prev.stance };
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
      for (const t of VIEWER_TOGGLES[kindName] ?? []) on[t.key] = !!e.flags[t.key];
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
            const locked = (t.key === "sealed" && !!show.on.phase2) || (t.key === "flaming" && !show.on.phase2);
            return (
              <button key={t.key} className="chip viewer-toggle" aria-pressed={on} disabled={locked} onClick={() => flip(t.key)}>
                {locked ? (t.key === "flaming" ? `${t.off} (phase 1)` : `${t.off} (phase 2)`) : on ? t.on : t.off}
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

/* ============================================================
 * Exploration, with fights: walk the map, and touching an enemy opens its fight. Win and
 * you're back where you stood with it gone; fall and you wake again at the start.
 * ============================================================ */

/** What you carry on the map. */
const MAP_LOADOUT = { weapon: "normal" as Tier, armor: "light" as ArmorTier };

function mapFight(enemies: EnemySetup[]): CombatState {
  return createCombat(
    { maxHP: PLAYER_MAX_HP, weapon: MAP_LOADOUT.weapon, armor: MAP_LOADOUT.armor, charges: REVIVE_CHARGES },
    enemies,
  );
}

function Journeying({ onExit }: { onExit: () => void }) {
  const [journey, setJourney] = useState<Journey>({ defeated: [] });
  // `id` gives every fight (and every return to the map) a fresh screen.
  // `foes`: the enemy that reached you plus everyone chasing you who piled in.
  const [fight, setFight] = useState<{ id: number; foes: MapFoe[]; state: CombatState; backTo: Journey } | null>(null);
  const enemiesOf = (foes: MapFoe[]) => foes.flatMap(f => f.fight);
  const [visit, setVisit] = useState(0);

  if (fight) {
    return (
      <CombatScreen
        key={fight.id}
        initial={fight.state}
        onRetry={() => setFight(f => f && { ...f, id: f.id + 1, state: mapFight(enemiesOf(f.foes)) })}
        onChangeLoadout={() => {}}
        onExit={onExit}
        onDone={won => {
          // Won: back where you stood, the enemy gone. Lost: wake at the start; your progress stays.
          setJourney(won
            ? { ...fight.backTo, defeated: [...fight.backTo.defeated, ...fight.foes.map(f => f.id)] }
            : { defeated: fight.backTo.defeated });
          setFight(null);
          setVisit(v => v + 1);
        }}
      />
    );
  }
  return (
    <Exploration
      key={visit}
      journey={journey}
      onEncounter={(foes, backTo) => setFight(f => ({ id: (f?.id ?? 0) + 1, foes, state: mapFight(enemiesOf(foes)), backTo }))}
      onExit={onExit}
    />
  );
}

/** Weapons to pick from. "None" (baseline) fights bare-handed: weak, fast attacks and a Block with no bonus. */
const TIER_KEYS = Object.keys(WEAPONS) as WeaponTier[];
const TIER_LABELS: Record<string, string> = { baseline: "None" };
const ARMOR_KEYS = Object.keys(ARMOR) as ArmorTier[];

/** W/S pick a row, A/D change the value in it, E starts, Q goes back to the menu. */
function SetupScreen({ setup, onChange, onStart, onExit }: {
  setup: Setup;
  onChange: (s: Setup) => void;
  onStart: () => void;
  onExit: () => void;
}) {
  const rows = [
    { label: "Weapon", field: "weapon", options: TIER_KEYS, labels: TIER_LABELS },
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
    else if (key === "back" || key === "pause") onExit();
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
}
type Wheel = Record<Dir, WheelOption | null>;


/** How long a lost turn (stagger or revive) waits before it plays out on its own. */
const FORCED_TURN_MS = 900;

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

/** How long each step of a turn's playback stays on screen (after the impact, for attacks). */
const STEP_MS = 800;
/** How long a Rest's own pose shows before the fighter settles into its next stance. */
const REST_POSE_MS = 300;
/** How long an attacker takes to close in on its target before the blow lands. */
const APPROACH_MS = 320;
/** How long a clean hit takes to knock its target back. */
const KNOCK_MS = 260;
/** How long everyone takes to settle into the planning view at the end of a turn. */
const SETTLE_MS = 700;
/** How long the planning camera takes to ease toward a new selection. */
const NUDGE_MS = 500;

/** How close an attacker gets to its target (meters), and how far a clean hit knocks it back. */
const STRIKE_GAP = 0.9;
const KNOCKBACK = 0.45;
/** How far a Block jolts the blocker and the attacker apart. */
const BLOCK_PUSH = 0.3;
/** How far a dodge carries someone: back if retreating, sideways if closing in. */
const DODGE_BACK = 1.5;
const DODGE_SIDE = 1.2;
/** A Maneuver toward an enemy ends this far short of it; falling back covers this much ground. */
const ENGAGE_GAP = 1.4;
const FALL_BACK = 2.2;
/** Planning view: how much the camera turns toward your selection (share of the angle to it). */
const CAMERA_FOLLOW = 0.18;

/**
 * A turn being played back: the state before it, its steps, and which one is showing.
 * Attack steps play in two phases: the attacker closes in ("approach"), then the blow lands
 * ("impact"). Other steps just play ("impact").
 */
interface Playback {
  from: CombatState;
  steps: Step[];
  index: number;
  /** "usurp": Usurp Flame's scene plays before the step itself (see USURP_STAGES); "ignite": the
   *  Warden's phase-two scene (see IGNITE). */
  phase: "approach" | "impact" | "usurp" | "ignite";
  playerPose: PoseName;
  /** What you did this turn (null for a forced turn). */
  action: PlayerAction | null;
}

const isAttackStep = (st: Step | undefined) => !!st?.events.some(ev => ev.kind === "attack");
const usurpOf = (st: Step | undefined) => st?.events.find((ev): ev is Extract<Step["events"][number], { kind: "usurp" }> => ev.kind === "usurp");
const phaseTwoOf = (st: Step | undefined) => st?.events.find((ev): ev is Extract<Step["events"][number], { kind: "phase" }> => ev.kind === "phase" && ev.phase === 2);
const phaseFor = (st: Step | undefined): Playback["phase"] => (phaseTwoOf(st) ? "ignite" : usurpOf(st) ? "usurp" : isAttackStep(st) ? "approach" : "impact");

/**
 * Usurp Flame's scene, before the step that takes the flame plays out: the light dies around the
 * two of them (only the target's flame still burning) as the camera settles between them; he
 * dashes at it, the camera closing in, and everything goes black as he reaches it; then the light
 * returns on him standing in Idle, the flame streaming from the target over him into his hand.
 * When each stage starts, in ms.
 */
const USURP_STAGES = { focus: 0, dash: 900, black: 1500, reveal: 2000, done: 3000 } as const;
type UsurpStage = Exclude<keyof typeof USURP_STAGES, "done">;

/** The fight as it stood after a given step: the turn's starting state with that step's bars and positions. */
function viewAt(from: CombatState, after: Step["after"]): CombatState {
  const v = structuredClone(from);
  for (const f of [v.player, ...v.enemies]) {
    const a = after[f.id];
    if (!a) continue;
    f.hp = a.hp;
    f.fatigue = a.fatigue;
    f.death = a.death;
    f.staggered = a.staggered;
    if ("alive" in f) f.alive = a.alive;
    if ("line" in f && a.line) f.line = a.line;
    if (a.waxed !== undefined) f.waxed = a.waxed;
    if (a.encased !== undefined) f.encased = a.encased;
    if ("fate" in f && a.fate) f.fate = a.fate;
  }
  return v;
}

interface Fx {
  classes: string[];
}

/**
 * Turns a step's events into per-fighter animations. The health bars carry the numbers.
 * Walking steps play for whoever actually moves: an enemy changing lines on its own, or you when
 * you Maneuvered. When your attack pulled someone in, nobody walks: the camera re-frames you.
 */
function effectsOf(step: Step | undefined, youManeuvered: boolean): Map<string, Fx> {
  const fx = new Map<string, Fx>();
  const add = (id: string, cls: string) => {
    if (!fx.has(id)) fx.set(id, { classes: [] });
    fx.get(id)!.classes.push(cls);
  };
  for (const ev of step?.events ?? []) {
    switch (ev.kind) {
      case "attack":
        add(ev.attacker, "fx-attack");
        add(ev.target, ev.result === "dodged" ? "fx-dodge" : ev.result === "blocked" ? "fx-block" : "fx-hit");
        break;
      case "stagger":
        add(ev.who, "fx-break");
        break;
      case "fall":
        add(ev.who, "fx-fall");
        break;
      case "move":
        if (ev.cause !== "player") { if (!fx.get(ev.who)?.classes.includes("fx-step")) add(ev.who, "fx-step"); }
        else if (youManeuvered && !fx.get("player")?.classes.includes("fx-step")) add("player", "fx-step");
        break;
      case "maneuver":
        // Everyone who Maneuvered plays their step, even when it changed no distance.
        if (!fx.get(ev.who)?.classes.includes("fx-step")) add(ev.who, "fx-step");
        break;
      default:
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

/** 1 → I, 4 → IV, 9 → IX... */
function roman(n: number): string {
  const table: [number, string][] = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [value, numeral] of table) {
    while (n >= value) {
      out += numeral;
      n -= value;
    }
  }
  return out;
}

const barValues = (f: { hp: number; fatigue: number; death: number }): BarValues => ({ hp: f.hp, fatigue: f.fatigue, death: f.death });

function CombatScreen({ initial, onRetry, onChangeLoadout, onExit, onDone, override, panel, playSignal, attackOnPlay, changeLabel, onTurnPlayed }: {
  initial: CombatState;
  /** The model viewer: rewrites the fight before it's shown or played (the enemy's pose and action). */
  override?: (s: CombatState) => CombatState;
  /** Extra controls drawn over the fight (the model viewer's). */
  panel?: ReactNode;
  /** Each change plays a turn in which you just Rest (the model viewer's actions). You can't act yourself. */
  playSignal?: number;
  /** The model viewer: you attack it this turn (to break its Rest). */
  attackOnPlay?: boolean;
  /** The pause menu's label for onChangeLoadout. */
  changeLabel?: string;
  /** Called as a turn finishes playing, with the fight as it now stands. */
  onTurnPlayed?: (s: CombatState) => void;
  onRetry: () => void;
  onChangeLoadout: () => void;
  onExit: () => void;
  /** Set for fights from the map: when it's over, carry on (won or not) instead of retrying. */
  onDone?: (won: boolean) => void;
}) {
  const [fightRaw, setFight] = useState(initial);
  const fight = useMemo(() => (override ? override(fightRaw) : fightRaw), [fightRaw, override]);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [selection, setSelection] = useState<Selection>(() => defaultSelection(initial));
  const [wheelOpen, setWheelOpen] = useState(false);
  const [highlight, setHighlight] = useState<Dir | null>(null);

  const [paused, setPaused] = useState(false);
  /** Usurp Flame's scene, while it plays (see USURP_STAGES). */
  const [usurpStage, setUsurpStage] = useState<UsurpStage | null>(null);
  /** The Warden's phase-two scene, while it plays: who, when it started, and how far in it is. */
  const [igniteState, setIgniteState] = useState<{ who: string; start: number; seed: number } | null>(null);
  const setIgnite = (v: { who: string; start: number; seed: number } | null) => { setIgniteT(0); setIgniteState(v); };
  const [igniteT, setIgniteT] = useState(0);
  const [pauseIndex, setPauseIndex] = useState(0);
  const busy = playback !== null;
  const forced = forcedAction(fight);
  const playing = fight.status === "playing";

  // What's on screen: mid-turn during playback, otherwise the fight as it stands.
  // While an attacker is still closing in, the fight shows as it was before the blow.
  const step = playback?.steps[playback.index];
  const impact = playback?.phase === "impact";
  // The fight just before this step, so a bar that appears mid-turn still animates from it.
  const prevView = playback ? (playback.index > 0 ? viewAt(playback.from, playback.steps[playback.index - 1].after) : playback.from) : undefined;
  const view = playback && step ? (impact ? viewAt(playback.from, step.after) : prevView!) : fight;
  const fx = effectsOf(impact ? step : undefined, playback?.action?.type === "maneuver");
  const stepKey = playback ? `${playback.from.turn}-${playback.index}-${playback.phase}` : "rest";
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
    const opt = (label: string, action: PlayerAction): WheelOption => ({ label, action });
    if (sel.kind === "player") {
      return {
        up: null,
        left: opt("Fall back", { type: "maneuver", target: "self" }),
        down: opt("Rest", { type: "rest" }),
        right: null,
      };
    }
    return {
      up: opt("Attack", { type: "attack", target: sel.id }),
      left: opt("Maneuver", { type: "maneuver", target: sel.id }),
      down: null,
      right: opt("Block", { type: "block", target: sel.id }),
    };
  })();
  const chosen = wheelOpen && highlight ? wheel[highlight] : null;
  const wheelCenter = sel.kind === "player" ? "You" : selectedEnemy?.name ?? "";

  const hudRef = useRef<HTMLDivElement>(null);
  const selId = sel.kind === "player" ? "player" : sel.id;
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const measure = () => {
      const hud = hudRef.current;
      if (hud) setViewport({ w: hud.clientWidth, h: hud.clientHeight });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  /* ---------- the battlefield floor plan ----------
   * Everyone has a spot on the floor (meters). The planning view is always shot from behind your
   * shoulder, so you are the anchor: the camera and the enemy lines are placed relative to you.
   *
   * During a turn, attackers close in on their targets and the camera moves in on the action.
   * Everyone stays wherever the action leaves them (closed in, knocked back) until the turn's
   * final step. Then the camera re-frames you where you ended up, turning and moving around you,
   * and the enemies walk from wherever they are to their lines. If you Maneuvered, you walk to
   * where you were going and the camera follows you there. */
  const world = useRef({ anchor: { x: 0, z: 0 } as Vec, yaw: 0, pos: {} as Record<string, Vec> });

  const linesOf = (st: CombatState) => ({
    front: st.enemies.filter(e => e.alive && e.line === "front").map(e => e.id),
    back: st.enemies.filter(e => e.alive && e.line === "back").map(e => e.id),
  });

  /** The planning camera: riding behind your shoulder, turned a little toward the selected enemy. */
  const planningShot = (anchor: Vec, yaw: number, pos: Record<string, Vec>, st: CombatState): ShotCamera => {
    const alive = st.enemies.filter(e => e.alive && pos[e.id]);
    const target = selId !== "player" ? pos[selId] : undefined;
    if (!target || !alive.length) return { follow: "player", yaw };
    const c = alive.reduce((acc, e) => ({ x: acc.x + pos[e.id].x / alive.length, z: acc.z + pos[e.id].z / alive.length }), { x: 0, z: 0 });
    const toward = lerpAngle(yawOf(sub(c, anchor)), yawOf(sub(target, anchor)), 1) - yawOf(sub(c, anchor));
    return { follow: "player", yaw: yaw + toward * CAMERA_FOLLOW };
  };

  /** Puts everyone in formation around the player standing at `anchor`, and frames them. */
  const settle = (st: CombatState, anchor: Vec) => {
    const w = world.current;
    const { front, back } = linesOf(st);
    // Turn so the enemies, from wherever they are now, end up roughly ahead in their lines.
    const enemiesNow = [...front, ...back].map(id => w.pos[id]).filter(Boolean);
    const yaw = facingToward(anchor, enemiesNow, front.length, back.length, w.yaw);
    const pos = { ...w.pos, ...Object.fromEntries(formation(anchor, yaw, front, back)), player: anchor };
    world.current = { anchor, yaw, pos };
    return { pos, camera: planningShot(anchor, yaw, pos, st) };
  };

  const [shot, setShot] = useState<SceneShot>(() => {
    const { front, back } = linesOf(initial);
    const pos = { ...Object.fromEntries(formation({ x: 0, z: 0 }, 0, front, back)), player: { x: 0, z: 0 } };
    world.current.pos = pos;
    return { positions: pos, camera: { follow: "player", yaw: 0 }, ms: 0, version: 0 };
  });
  const shoot = (positions: Record<string, Vec>, camera: ShotCamera, ms: number) => {
    world.current.pos = positions;
    setShot(s => ({ positions, camera, ms, version: s.version + 1 }));
  };

  useLayoutEffect(() => {
    const w = world.current;
    if (igniteState) {
      const ignite = igniteState;
      // The camera slowly pulls back from him, as far as it goes, while the light dies.
      const at = w.pos[ignite.who];
      if (!at) return;
      const yaw = shotCamera(shot).yaw;
      const back = 9;
      shoot(w.pos, { x: at.x - Math.sin(yaw) * back, z: at.z - Math.cos(yaw) * back, yaw }, IGNITE.draw);
      return;
    }
    if (!playback) {
      // Planning: you stand where you are; the camera eases toward your selection.
      const { pos, camera } = settle(fight, w.pos.player ?? w.anchor);
      shoot(pos, camera, NUDGE_MS);
      return;
    }
    const usurp = usurpOf(step);
    if (playback.phase === "usurp" && usurp) {
      // The camera settles between him and his target, then closes in as he dashes at it.
      const a = w.pos[usurp.who], t = w.pos[usurp.target];
      if (!a || !t) return;
      if (usurpStage === "focus") shoot(w.pos, actionCamera(shotCamera(shot), a, t), USURP_STAGES.dash);
      if (usurpStage === "dash") {
        const at = closeIn(a, t, STRIKE_GAP);
        shoot({ ...w.pos, [usurp.who]: at }, actionCamera(shotCamera(shot), at, t), USURP_STAGES.black - USURP_STAGES.dash);
      }
      return;
    }
    const attack = step?.events.find(ev => ev.kind === "attack");
    if (!attack || attack.kind !== "attack") {
      if (playback.index !== playback.steps.length - 1) return; // stay put until the final step
      // The final step: re-frame you where you ended up, or follow you if you Maneuvered.
      const act = playback.action;
      // You walk whenever your Maneuver happened, even if it changed no distance.
      const moved = playback.steps.some(st => st.events.some(ev => ev.kind === "maneuver" && ev.who === "player"));
      let anchor = w.pos.player;
      if (act?.type === "maneuver" && moved) {
        anchor = act.target === "self"
          ? behind(w.pos.player, w.yaw, FALL_BACK)
          : closeIn(w.pos.player, w.pos[act.target!] ?? w.pos.player, ENGAGE_GAP);
      }
      const { pos, camera } = settle(viewAt(playback.from, step!.after), anchor);
      shoot(pos, camera, SETTLE_MS);
      return;
    }
    const a = w.pos[attack.attacker];
    const t = w.pos[attack.target];
    if (!a || !t) return;
    if (playback.phase === "approach") {
      // A melee attacker closes in (a ranged one stays put), and the camera moves in on the two.
      const at = attack.ranged ? a : closeIn(a, t, STRIKE_GAP);
      shoot({ ...w.pos, [attack.attacker]: at }, actionCamera(shotCamera(shot), at, t), APPROACH_MS);
    } else if (attack.result === "hit") {
      // A clean hit knocks the target back, and it stays there.
      shoot({ ...w.pos, [attack.target]: pushedAway(a, t, KNOCKBACK) }, shot.camera, KNOCK_MS);
    } else if (attack.result === "blocked") {
      // A block jolts them both apart a little, and they stay there (like a knockback).
      const knocked = { ...w.pos, [attack.target]: pushedAway(a, t, BLOCK_PUSH) };
      if (!attack.ranged) knocked[attack.attacker] = pushedAway(t, a, BLOCK_PUSH);
      shoot(knocked, shot.camera, KNOCK_MS);
    } else if (attack.result === "dodged") {
      // A dodge gets out of the way: further back if they were retreating, to the side if they
      // were closing in.
      const retreating = attack.target === "player"
        ? playback.action?.type === "maneuver" && playback.action.target === "self"
        : playback.from.enemies.find(e => e.id === attack.target)?.intent.dir === "retreat";
      // Seen from the camera: "back" is straight away from the camera, "to the side" straight
      // across the screen, away from the attacker. A retreating dodge goes just as far each way.
      const cam = shotCamera(shot);
      const cd = Math.hypot(t.x - cam.x, t.z - cam.z) || 1;
      const back = { x: (t.x - cam.x) / cd, z: (t.z - cam.z) / cd };
      let side = { x: -back.z, z: back.x };
      if (side.x * (t.x - a.x) + side.z * (t.z - a.z) < 0) side = { x: -side.x, z: -side.z };
      const to = retreating
        ? { x: t.x + (back.x + side.x) * DODGE_BACK, z: t.z + (back.z + side.z) * DODGE_BACK }
        : { x: t.x + side.x * DODGE_SIDE, z: t.z + side.z * DODGE_SIDE };
      shoot({ ...w.pos, [attack.target]: to }, shot.camera, KNOCK_MS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback?.index, playback?.phase, !!playback, selId, fight, usurpStage, igniteState]);

  /** Where the selected figure will be on screen once the camera settles, for the wheel. */
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  useLayoutEffect(() => {
    if (!wheelOpen) return;
    const p = shot.positions[selId];
    const { w, h } = viewport;
    if (!p || !w) return setAnchor(null);
    const foe = fight.enemies.find(e => e.id === selId);
    const b = figureBox(shotCamera(shot), p, w, h, foe && ENEMY_KINDS[foe.kind]?.scale);
    setAnchor({ x: b.x, y: b.y, w: b.w, h: b.h, hudW: w, hudH: h });
  }, [wheelOpen, selId, shot, viewport]);

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
    const pose: PoseName = forced ? "kneel" : action.type; // staggered or reviving: down on one knee
    setFight(next);
    setPlayback(
      next.lastTurn.length
        ? { from: fight, steps: next.lastTurn, index: 0, phase: phaseFor(next.lastTurn[0]), playerPose: pose, action: forced ? null : action }
        : null,
    );
    closeWheel();
  };
  const commit = (option: WheelOption | null) => {
    if (option && playing && !busy) play(option.action);
  };

  // The model viewer's Play: a turn where you only Rest, so the enemy's action plays on its own.
  // Against a Block or a Maneuver you attack instead, so there's something to block or dodge.
  const lastSignal = useRef(playSignal);
  useEffect(() => {
    if (playSignal === lastSignal.current) return;
    lastSignal.current = playSignal;
    const foe = fight.enemies.find(e => e.alive);
    // (Not against a fixed rule like Usurp Flame: that plays on its own.)
    const fixedRule = !!foe && !!ENEMY_KINDS[foe.kind]?.fixedActions?.includes(foe.intent.action ?? "");
    if (playing && !busy) play(!fixedRule && (attackOnPlay || foe?.intent.type === "block" || foe?.intent.type === "maneuver") ? { type: "attack", target: foe!.id } : { type: "rest" });
  });

  // The phase-two scene: started by the step where he enters phase two (or, in the model viewer,
  // by switching him to it), ticking until it ends.
  useEffect(() => {
    if (playback?.phase !== "ignite") return;
    const ev = phaseTwoOf(playback.steps[playback.index]);
    if (ev) setIgnite({ who: ev.who, start: performance.now(), seed: Math.random() * 100 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback?.index, playback?.phase, !!playback]);
  const phaseTwoBefore = useRef<Record<string, boolean>>({});
  useEffect(() => {
    for (const e of fight.enemies) {
      const now = !!e.flags.phase2, was = phaseTwoBefore.current[e.id];
      if (!playback && was === false && now && e.kind === "warden") setIgnite({ who: e.id, start: performance.now(), seed: Math.random() * 100 });
      phaseTwoBefore.current[e.id] = now;
    }
  });
  useEffect(() => {
    if (!igniteState) return;
    const ignite = igniteState;
    let raf = 0;
    const tick = () => {
      const t = performance.now() - ignite.start;
      setIgniteT(t);
      if (t < IGNITE.end) raf = requestAnimationFrame(tick);
      else {
        setIgnite(null);
        setPlayback(pb => (pb && pb.phase === "ignite" ? { ...pb, phase: "impact" } : pb));
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [igniteState]);
  // Until the scene's state is set (an effect, a render late), it's already as good as started:
  // so his new form never shows for that one frame.
  const pendingWho = igniteState
    ? undefined
    : playback?.phase === "ignite"
      ? phaseTwoOf(playback.steps[playback.index])?.who
      : !playback
        ? fight.enemies.find(e => e.kind === "warden" && e.flags.phase2 && phaseTwoBefore.current[e.id] === false)?.id
        : undefined;
  const ignite = igniteState ?? (pendingWho ? { who: pendingWho, start: 0, seed: 0 } : null);
  const igniteNow = igniteState ? igniteT : 0;

  // Usurp Flame's scene: its stages on a timer, then the step itself plays.
  useEffect(() => {
    if (!playback || playback.phase !== "usurp") return;
    const pb = playback;
    const timers = (Object.keys(USURP_STAGES) as (keyof typeof USURP_STAGES)[]).map(k =>
      window.setTimeout(() => {
        if (k === "done") { setUsurpStage(null); setPlayback({ ...pb, phase: "impact" }); }
        else setUsurpStage(k);
      }, USURP_STAGES[k]),
    );
    return () => timers.forEach(t => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback?.index, playback?.phase, !!playback]);

  // Advance the playback one step at a time.
  useEffect(() => {
    if (!playback || paused || playback.phase === "usurp" || playback.phase === "ignite") return;
    const timer = window.setTimeout(
      () => {
        const pb = playback;
        if (pb.phase === "approach") return setPlayback({ ...pb, phase: "impact" });
        const index = pb.index + 1;
        if (index < pb.steps.length) return setPlayback({ ...pb, index, phase: phaseFor(pb.steps[index]) });
        // Anyone who dodged is still walking to their new spot: they keep their pose until there.
        const walking = { ...dodgers.current };
        if (Object.keys(walking).length) {
          setWalkOff(walking);
          window.setTimeout(() => setWalkOff(null), NUDGE_MS);
        }
        onTurnPlayed?.(fightRaw); // same render as the playback ending, so nothing flickers
        setPlayback(null);
      },
      playback.phase === "approach" ? APPROACH_MS : STEP_MS,
    );
    return () => window.clearTimeout(timer);
  }, [playback, paused]);

  // A stagger or a revive costs you the turn: show it, then play it out on its own.
  useEffect(() => {
    if (!playing || !forced || busy || paused) return;
    const timer = window.setTimeout(() => play({ type: "rest" }), FORCED_TURN_MS);
    return () => window.clearTimeout(timer);
  });

  const pauseOptions: { label: string; run: () => void }[] = [
    { label: "Resume", run: () => setPaused(false) },
    { label: "Restart fight", run: onRetry },
    ...(onDone ? [] : [{ label: changeLabel ?? "Change loadout", run: onChangeLoadout }]),
    { label: "Main menu", run: onExit },
  ];
  const finish = () => onDone?.(fight.status === "won");

  useKeys(key => {
    // Escape pauses at any time; the pause menu takes all input until it closes.
    if (paused) {
      if (key === "pause" || key === "back") setPaused(false);
      else if (key === "up") setPauseIndex(i => (i + pauseOptions.length - 1) % pauseOptions.length);
      else if (key === "down") setPauseIndex(i => (i + 1) % pauseOptions.length);
      else if (key === "select") pauseOptions[pauseIndex].run();
      return;
    }
    if (key === "pause" && playing) {
      setPaused(true);
      setPauseIndex(0);
      return;
    }
    if (busy) return; // input waits for the turn to finish playing
    if (!playing) {
      if (onDone) { if (key === "select" || key === "back" || key === "pause") finish(); }
      else if (key === "select") onRetry();
      else if (key === "back" || key === "pause") onExit();
      return;
    }
    if (forced) return; // the turn plays itself
    if (playSignal !== undefined) return; // the model viewer: its panel plays the turns
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
    else if (key !== "pause" && wheel[key]) setHighlight(key);
  });

  /* ---------- what the screen shows ---------- */
  /**
   * During playback: a fighter shows its telegraph until its own attack, the strike frame on the
   * step its attack lands, and a neutral stance after. Anyone staggered goes down (player kneels,
   * enemies fall to the ground).
   */
  const strikeStep = (id: string) =>
    playback ? playback.steps.findIndex(st => st.events.some(ev => ev.kind === "attack" && ev.attacker === id)) : -1;
  // A Rest's own pose only lasts a moment; then it already settles into its next stance.
  const [restOver, setRestOver] = useState<string | null>(null);
  useEffect(() => {
    if (!playback) return;
    const t = window.setTimeout(() => setRestOver(stepKey), REST_POSE_MS);
    return () => window.clearTimeout(t);
  }, [stepKey]);
  /** The step where someone's Rest actually happened (not cut short), or -1. */
  const restStep = (id: string) =>
    playback ? playback.steps.findIndex(st => st.events.some(ev => ev.kind === "rest" && ev.who === id && ev.result === "rested")) : -1;
  /** Who is Maneuvering this turn (and in what pose), so they keep it while they walk off after it. */
  const dodgers = useRef<Record<string, PoseName>>({});
  const [walkOff, setWalkOff] = useState<Record<string, PoseName> | null>(null);
  const dodgersOf = useRef<unknown>(null);
  if (playback && dodgersOf.current !== playback.from) { dodgersOf.current = playback.from; dodgers.current = {}; }
  const track = (id: string, pose: PoseName): PoseName => {
    if (playback && maneuvering(id) && dodgedBefore(id)) dodgers.current[id] = pose;
    return pose;
  };
  /** Someone chose to Maneuver this turn (and it hasn't been turned into a forced Rest). */
  const maneuvering = (id: string) =>
    !!playback && (id === "player" ? playback.action?.type === "maneuver" : playback.from.enemies.some(e => e.id === id && e.intent.type === "maneuver" && !e.intent.forced));
  /**
   * Someone's Maneuver is under way: they've dodged an attack this turn (in an earlier step, or
   * this one once it lands), or their own move has happened. From then on they stay in its pose.
   * (A blow that hits them instead doesn't: they didn't get out of the way.)
   */
  const dodgedBefore = (id: string) =>
    !!playback && playback.steps.some((st, i) => (i < playback.index || (i === playback.index && impact)) && st.events.some(ev => (ev.kind === "attack" && ev.target === id && ev.result === "dodged") || (ev.kind === "maneuver" && ev.who === id)));
  /** The steps where someone is attacked (whether it lands, is blocked or dodged). */
  const targetedSteps = (id: string) =>
    playback ? playback.steps.flatMap((st, i) => (st.events.some(ev => ev.kind === "attack" && ev.target === id) ? [i] : [])) : [];
  interface Poses {
    telegraph: PoseName; down: PoseName; windUp: PoseName; strike: PoseName; idle: PoseName; rested?: PoseName;
    /** The strike pose hands off to the next stance a moment in (REST_POSE_MS), its trails still fading. */
    strikeHandsOff?: boolean;
    /** A Block or Maneuver: hold this pose, and only take `react` (the block, the dodge) as an attack on them lands. */
    guard?: { hold: PoseName; react: PoseName; keepAfterDodge?: boolean };
  }
  const playbackPose = (id: string, staggered: boolean, poses: Poses): PoseName => {
    if (!playback) return poses.telegraph;
    const struck = strikeStep(id);
    // Wind up while closing in, then strike. A strike that spins on into the next stance (its
    // trails carrying on) takes that stance a moment in, like a Rest's own pose does.
    if (struck === playback.index) return impact ? (poses.strikeHandsOff && restOver === stepKey ? poses.idle : poses.strike) : poses.windUp;
    if (staggered) return poses.down;
    if (struck >= 0 && struck < playback.index) return poses.idle;
    if (poses.guard) {
      const hits = targetedSteps(id);
      // A Maneuver only takes its pose when it gets out of the way (a dodge) or actually moves;
      // from then on it keeps it to the end of the turn, walking off to its new spot in it too.
      // Hit while it holds its stance, it just keeps holding it.
      if (poses.guard.keepAfterDodge) return dodgedBefore(id) ? poses.guard.react : poses.guard.hold;
      if (hits.includes(playback.index)) return impact ? poses.guard.react : poses.guard.hold;
      return hits.length && hits[0] < playback.index ? poses.idle : poses.guard.hold;
    }
    // A Rest that went through shows its own pose from the moment it happens, briefly.
    const rested = restStep(id);
    if (poses.rested && rested >= 0 && playback.index >= rested) {
      return playback.index === rested && restOver !== stepKey ? poses.rested : poses.idle;
    }
    return poses.telegraph;
  };
  const punching = p.weapon === "baseline";
  /** Your forced Rest (or revive) has landed this turn: you're back on your feet. */
  const playerBackUp = !!playback && playback.steps.some((st, i) =>
    (i < playback.index || (i === playback.index && impact)) &&
    st.events.some(ev => (ev.kind === "rest" && ev.who === "player" && ev.result === "recovered") || (ev.kind === "revive" && ev.who === "player")));
  const playerPose: PoseName = !playback && walkOff?.player ? walkOff.player : playback
    ? playbackPose("player", p.staggered, {
        // A forced turn kneels until the Rest (or revive) brings you back; then you're up.
        telegraph: playerBackUp ? "idle" : playback.playerPose, down: "kneel", windUp: "attack", strike: punching ? "punch" : "strike", idle: "idle",
        guard: playback.action?.type === "block" || playback.action?.type === "maneuver" ? { hold: "idle", react: playback.playerPose, keepAfterDodge: playback.action.type === "maneuver" } : undefined,
      })
    : forced ? "kneel" : (chosen?.action.type as PoseName | undefined) ?? "idle";
  // While you plan, an enemy only shows its stance; as the turn plays, its action shows.
  // After its attack, an enemy already settles into the stance it takes next (if it's still up).
  const settledPose = (e: Enemy): PoseName => {
    const now = fight.enemies.find(x => x.id === e.id);
    return now && now.alive && !now.staggered && !now.intent.forced ? poseForIntent(now) : idlePoseOf(e);
  };
  // An enemy that's going to Rest holds its stance until the Rest actually happens.
  const restTelegraph = (e: Enemy): PoseName => {
    if (!playback || e.intent.type !== "rest" || e.intent.forced || e.staggered) return actionPose(e);
    const at = restStep(e.id);
    return at >= 0 && playback.index >= at ? actionPose(e) : poseForIntent(e);
  };
  /** Its strike pose spins on into its next stance (Flail Swing): it hands off partway through. */
  const handsOff = (e: Enemy) => !!WARDEN_POSES[e.intent.strikePose as WardenPoseName]?.trailEndsAt;
  /** Its strike has just handed off to its next stance (still this step). */
  const strikeJustOver = (e: Enemy) =>
    !!playback && impact && handsOff(e) && strikeStep(e.id) === playback.index && restOver === stepKey;
  /** Its Rest's own pose has just given way to its next stance (still this step). */
  const restJustOver = (e: Enemy) =>
    !!playback && !!e.intent.restPose && restStep(e.id) === playback.index && restOver === stepKey;
  /**
   * The Warden's candle arm. Once a Rest has gone through, or his attack has landed and he has
   * moved on to his next stance, it already shows what that did to it (Flame Blast puts it out).
   */
  /** The Warden's flags as shown: once a Rest, his attack or a taken flame has played out, what it did. */
  const shownFlags = (e: Enemy) => {
    const rested = !!playback && restStep(e.id) >= 0 && playback.index >= restStep(e.id) && (restStep(e.id) < playback.index || restOver === stepKey);
    const struck = playback ? strikeStep(e.id) : -1;
    const attacked = !!playback && struck >= 0 && (playback.index > struck || (playback.index === struck && impact && handsOff(e) && restOver === stepKey));
    const u = usurpStep(e.id);
    const usurped = !!playback && u >= 0 && (playback.index > u || (playback.index === u && (playback.phase === "impact" || usurpStage === "reveal")));
    // Until his phase-two scene plays, he keeps the look he started the turn with: whatever the turn
    // went on to do, his new form only shows once the scene reveals it.
    const p2 = playback ? playback.steps.findIndex(st => !!phaseTwoOf(st)) : -1;
    if (playback && p2 >= 0 && playback.index <= p2 && !(playback.index === p2 && playback.phase === "impact")) return e.flags;
    // Once it has played, he's in his new form for good.
    if (phaseTwoDone(e)) return fight.enemies.find(x => x.id === e.id)?.flags ?? e.flags;
    return ((rested || attacked || usurped) && fight.enemies.find(x => x.id === e.id)?.flags) || e.flags;
  };
  const candleArmOf = (e: Enemy): CandleArm => {
    // The phase-two scene: no flame of his own until it flares, then his arm burns for good.
    // (Until all is dark, he still looks as he did; then no flame until it flares.)
    if (ignite && ignite.who === e.id) {
      if (igniteNow >= IGNITE.flare) return "scorched";
      if (igniteNow >= IGNITE.kindle) return "out";
      return "out";
    }
    // Having taken a flame and the light is coming back.
    const u = usurpStep(e.id);
    const usurped = !!playback && u >= 0 && (playback.index > u || (playback.index === u && (playback.phase === "impact" || usurpStage === "reveal")));
    const f = shownFlags(e);
    // Having taken a flame, his candle burns again, whatever else the turn did.
    if (usurped) return f.phase2 ? "scorched" : "lit";
    // Staggered (shown down), his flame is out (before phase two).
    if ((e.staggered || enemyPose(e) === downPoseOf(e)) && !f.phase2) return "out";
    return f.phase2 ? "scorched" : f.sealed ? "out" : "lit";
  };
  /** The step where this enemy took a flame (Usurp Flame), or -1. */
  const usurpStep = (id: string) => (playback ? playback.steps.findIndex(st => usurpOf(st)?.who === id) : -1);
  /** When each Warden's flame was last put out (lit → out), while its smoke still shows. */
  const [smoke, setSmoke] = useState<Record<string, number>>({});
  const armsNow = useRef<Record<string, CandleArm>>({});
  const armsBefore = useRef<Record<string, CandleArm>>({});
  useEffect(() => {
    const now = armsNow.current, before = armsBefore.current;
    const out = Object.keys(now).filter(id => before[id] === "lit" && now[id] === "out");
    armsBefore.current = { ...now };
    if (!out.length) return;
    const t = performance.now();
    setSmoke(prev => ({ ...prev, ...Object.fromEntries(out.map(id => [id, t])) }));
    window.setTimeout(() => setSmoke(prev => Object.fromEntries(Object.entries(prev).filter(([, at]) => at !== t))), 1000);
  });
  /** The step where a blow breaks someone's Rest (they flinch, to the end of the turn), or -1. */
  const flinchStep = (e: Enemy) => {
    if (!playback || e.intent.type !== "rest" || e.intent.forced) return -1;
    const broken = playback.steps.some(st => st.events.some(ev => ev.kind === "rest" && ev.who === e.id && ev.result === "interrupted"));
    if (!broken) return -1;
    return playback.steps.findIndex(st => st.events.some(ev => ev.kind === "attack" && ev.target === e.id && ev.result === "hit"));
  };
  /** His phase-two scene has played this turn (he entered it, and the scene is over). */
  const phaseTwoDone = (e: Enemy) => {
    if (!playback) return false;
    const p2 = playback.steps.findIndex(st => phaseTwoOf(st)?.who === e.id);
    return p2 >= 0 && (playback.index > p2 || (playback.index === p2 && playback.phase === "impact"));
  };
  const enemyPose = (e: Enemy): PoseName => {
    // After his phase-two scene, he's already standing in his next stance (Idle).
    if (phaseTwoDone(e) && !ignite) return settledPose(e);
    // The phase-two scene: he stands in Idle, unseen in the dark until his flare.
    // While the light fades he's still down; once all is dark he's already standing in Idle.
    if (ignite && ignite.who === e.id) return igniteNow >= IGNITE.kindle ? "wd-idle" : downPoseOf(e);
    // A Rest broken by a blow: it flinches as the blow lands, and stays flinching.
    const fl = flinchStep(e);
    if (playback && fl >= 0 && !e.staggered && (playback.index > fl || (playback.index === fl && impact))) return flinchPoseOf(e);
    // Usurp Flame: crouched to spring, the dash, then standing in Idle as the light returns.
    const u = usurpStep(e.id);
    if (playback && u >= 0 && playback.index >= u) {
      if (playback.index === u && playback.phase === "usurp") {
        if (usurpStage === "reveal") return "wd-idle";
        if (usurpStage === "dash" || usurpStage === "black") return "wd-usurp-dash";
        return "wd-usurp";
      }
      return settledPose(e);
    }
    // A Block or Maneuver holds its stance; it only blocks (or dodges) as the blow lands, then
    // settles into its next stance.
    const guarding = (e.intent.type === "block" || e.intent.type === "maneuver") && !e.intent.forced;
    return playbackPose(e.id, e.staggered, {
      guard: guarding ? { hold: poseForIntent(e), react: e.intent.guardPose ? asPose(e.intent.guardPose, "block") : actionPose(e), keepAfterDodge: e.intent.type === "maneuver" } : undefined,
      telegraph: playback ? restTelegraph(e) : poseForIntent(e),
      // The Warden attacks straight out of whatever stance he's in.
      down: downPoseOf(e), windUp: ENEMY_KINDS[e.kind]?.variant === "warden" && e.intent.stance ? poseForIntent(e) : windUpPose(e), strike: strikePose(e), idle: settledPose(e),
      strikeHandsOff: handsOff(e),
      rested: e.intent.restPose ? asPose(e.intent.restPose, "rest") : undefined,
    });
  };

  // Usurp Flame's scene: the darkness (all but the target's flame), and the flame's trail into his hand.
  const usurpNow = playback?.phase === "usurp" ? usurpOf(step) : undefined;
  const usurpDark = usurpNow && usurpStage
    ? {
        level: usurpStage === "reveal" ? 0 : usurpStage === "focus" ? 0.85 : 1,
        ms: usurpStage === "focus" ? USURP_STAGES.dash : usurpStage === "dash" ? USURP_STAGES.black - USURP_STAGES.dash : usurpStage === "reveal" ? USURP_STAGES.done - USURP_STAGES.reveal : 0,
        // The target's flame burns on in the dark; as the light returns, it's already in his hand.
        flame: usurpStage === "focus" || usurpStage === "dash" ? usurpNow.target : usurpStage === "reveal" ? usurpNow.who : undefined,
      }
    : undefined;
  const usurpTrail = usurpNow && usurpStage === "reveal" ? { from: usurpNow.target, to: usurpNow.who, key: `${stepKey}-usurp` } : undefined;

  // Ranged attacks throw something across the field as they land.
  const projectiles: Projectile[] = [];
  if (playback && impact && step) {
    for (const ev of step.events) {
      if (ev.kind !== "attack") continue;
      const thrower = playback.from.enemies.find(e => e.id === ev.attacker);
      const kind = thrower?.intent.projectile;
      // Melee attacks throw nothing, but some leave a shockwave where they land.
      if (!ev.ranged && kind !== "impact") continue;
      // A Warden blast starts at his fist, wherever his landing pose puts it.
      const landing = thrower?.intent.strikePose && WARDEN_POSES[thrower.intent.strikePose as WardenPoseName];
      // ...or, for a flail brought down on the floor, where its head lands.
      const origin = (kind === "blast" || kind === "impact") && landing ? (landing.slamTrail ? flailOf(landing).ball : landing.freeArm.hand) : undefined;
      // A flaming flail's slam burns.
      const fiery = kind === "impact" && !!thrower?.flags.flaming;
      if (kind) projectiles.push({ from: ev.attacker, to: ev.target, kind, origin, fiery, key: `${stepKey}-${ev.attacker}` });
    }
  }

  // Everyone on the field: you, enemies still standing, and any falling during this step.
  // Once his flame has broken free, the arena's candles (and the waxed remains) burn for good.
  const phaseTwoStep = playback ? playback.steps.findIndex(st => !!phaseTwoOf(st)) : -1;
  const arenaLit = ignite
    ? igniteNow >= IGNITE.flare
    : (playback
      ? phaseTwoStep >= 0
        ? playback.index > phaseTwoStep || (playback.index === phaseTwoStep && playback.phase === "impact")
        : playback.from.enemies.some(e => e.kind === "warden" && e.flags.phase2)
      : fight.enemies.some(e => e.kind === "warden" && e.flags.phase2));
  const playerSealed = (p.waxed || !!p.encased) && p.staggered;
  const figures: SceneFigure[] = [
    {
      id: "player",
      view: "back",
      // Staggered while Waxed, you're sealed like the waxed: kneeling, shins bound, head in wax,
      // your flame burning on it (until it's taken).
      // Staggered while Waxed (or with your flame taken), you're sealed whole in wax, and stay
      // that way until you recover: no other look in between.
      pose: track("player", playerSealed ? "w-idle" : playerPose),
      variant: playerSealed ? "waxed" : undefined,
      candle: p.waxed && p.staggered && !(usurpNow?.target === "player" && usurpStage === "reveal"),
      encased: playerSealed,
      // Waxed but still standing: wax caked on you.
      waxCaked: p.waxed && !p.staggered,
      weapon: p.weapon,
      armor: p.armor,
      classes: fx.get("player")?.classes ?? [],
      stepKey,
      selected: !busy && sel.kind === "player",
      disabled: busy || !playing || forced !== null,
      label: "Select yourself",
      onPick: () => { if (playSignal === undefined) openWheel({ kind: "player" }); },
    },
    ...view.enemies
      // The waxed stay where they fell, faded, for the rest of the fight.
      .filter(e => e.alive || fx.get(e.id)?.classes.includes("fx-fall") || e.kind === "waxed")
      .map((e): SceneFigure => ({
        id: e.id,
        view: "front",
        pose: !playback && walkOff?.[e.id] ? walkOff[e.id] : track(e.id, enemyPose(e)),
        weapon: e.weapon,
        armor: e.armor,
        variant: ENEMY_KINDS[e.kind]?.variant,
        scale: ENEMY_KINDS[e.kind]?.scale,
        arm: e.kind === "warden" ? (armsNow.current[e.id] = candleArmOf(e)) : undefined,
        // Phase two's look (black wax, burning inside) from the moment all is dark.
        phase2Look: !!ignite && ignite.who === e.id && igniteNow >= IGNITE.kindle,
        flailFire: e.kind === "warden" && !!shownFlags(e).flaming,
        // Its rest pose just gave way to its next stance: that pose's trails keep fading meanwhile.
        lingerFrom: restJustOver(e) ? (e.intent.restPose as WardenPoseName) : strikeJustOver(e) ? (e.intent.strikePose as WardenPoseName) : undefined,
        smokeSince: smoke[e.id],
        classes: [...(fx.get(e.id)?.classes ?? []), ...(!e.alive && e.kind === "waxed" ? ["is-remains"] : [])],
        candle: !e.alive && e.kind === "waxed" && arenaLit && e.fate !== "encased",
        // Its flame taken: sealed whole in wax.
        encased: !e.alive && e.fate === "encased",
        stepKey,
        selected: !busy && sel.kind === "enemy" && sel.id === e.id && e.alive,
        disabled: busy || !playing || forced !== null || !e.alive,
        label: `Select ${e.name}`,
        onPick: () => { if (playSignal === undefined) openWheel({ kind: "enemy", id: e.id }); },
      })),
  ];

  return (
    <div className={`hud ${busy ? "is-cinematic" : ""}`} ref={hudRef}>
      <section className="stage" aria-label="Battlefield">
        <Scene
          figures={figures} shot={shot} projectiles={projectiles} usurpTrail={usurpTrail} arenaLit={arenaLit}
          arena={fight.enemies.some(e => e.kind === "warden")}
          dark={ignite ? { level: igniteNow >= IGNITE.flare || igniteNow < 40 ? 0 : 1, ms: igniteNow >= IGNITE.flare ? 700 : IGNITE.kindle } : usurpDark}
          ignite={ignite ? { who: ignite.who, t: igniteNow, seed: ignite.seed } : undefined}
        />
      </section>

      {/* Cutscene mode: black strips slide in while a turn plays out. When they leave, it's your move. */}
      <div className="letterbox letterbox-top" aria-hidden="true" />
      {panel && !busy && !paused && panel}
      <div className="letterbox letterbox-bottom" aria-hidden="true" />

      {/* The two health bars sit in fixed slots, so nothing else on screen can push them around. */}
      <div className="bar-slot bar-slot-player">
        {/* Revives left, as a red Roman numeral beside your bar. Nothing shows once they're gone. */}
        {p.charges > 0 && (
          <span className="revive-count" aria-label={`${p.charges} revives left`}>{roman(p.charges)}</span>
        )}
        <HealthBar fighter={p} />
      </div>

      {(busy || playing) && (
        <div className="bar-slot bar-slot-target">
          {shownEnemy && (shownEnemy.alive || busy) && (
            <TargetPanel key={shownEnemy.id} enemy={shownEnemy} before={shownBefore && barValues(shownBefore)} />
          )}
        </div>
      )}

      {/* The wheel's options surround your character. */}
      {playing && !forced && !busy && wheelOpen && (
        <ActionWheel
          wheel={wheel}
          highlight={highlight}
          center={wheelCenter}
          anchor={anchor}
          aroundPlayer={sel.kind === "player"}
          onHighlight={setHighlight}
          onCommit={commit}
        />
      )}

      {paused && (
        <div className="result" role="dialog" aria-label="Paused">
          <nav className="pause-menu">
            {pauseOptions.map((o, i) => (
              <button
                key={o.label}
                className={`menu-button ${i === pauseIndex ? "is-focused" : ""}`}
                onMouseEnter={() => setPauseIndex(i)}
                onClick={o.run}
              >
                {o.label}
              </button>
            ))}
          </nav>
        </div>
      )}

      {!playing && !busy && (
        <div className="result" role="dialog" aria-label="Fight over">
          <div className="result-card">
            <h2>
              {fight.status !== "won" ? "You fade"
                : onDone ? (fight.enemies.length > 1 ? "They lie still" : "It lies still")
                : "The sleepwalkers are still"}
            </h2>
            {onDone ? (
              <div className="setup-buttons">
                <button className="commit" onClick={finish}>{fight.status === "won" ? "Continue" : "Wake again"}</button>
              </div>
            ) : (
              <div className="setup-buttons">
                <button className="hud-button" onClick={onExit}>Menu</button>
                <button className="hud-button" onClick={onChangeLoadout}>Change loadout</button>
                <button className="commit" onClick={onRetry}>Retry</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** A figure's box on screen, relative to the HUD, plus the HUD's size for keeping options on-screen. */
interface Anchor { x: number; y: number; w: number; h: number; hudW: number; hudH: number }

/** Rough size of a wheel option, used to place and clamp the options around an enemy. */
const OPTION_W = 144;
const OPTION_H = 44;
const OPTION_GAP = 8;

/** Where each option goes around an enemy: above the head, beside the body, below the feet. Kept on-screen. */
function optionPositions(a: Anchor): Record<Dir, { left: number; top: number }> {
  const cx = a.x + a.w / 2;
  const mid = a.y + a.h * 0.45;
  const raw: Record<Dir, { left: number; top: number }> = {
    up: { left: cx - OPTION_W / 2, top: a.y + a.h * 0.06 - OPTION_H - OPTION_GAP },
    down: { left: cx - OPTION_W / 2, top: a.y + a.h + OPTION_GAP },
    left: { left: a.x - OPTION_W - OPTION_GAP, top: mid - OPTION_H / 2 },
    right: { left: a.x + a.w + OPTION_GAP, top: mid - OPTION_H / 2 },
  };
  const clamp = (v: number, max: number) => Math.max(8, Math.min(max - 8, v));
  for (const d of Object.keys(raw) as Dir[]) {
    raw[d] = { left: clamp(raw[d].left, a.hudW - OPTION_W), top: clamp(raw[d].top, a.hudH - OPTION_H) };
  }
  return raw;
}

/**
 * The four options, opened around whoever you selected: W above, A to the left, S below, D to the right.
 * Around you, they sit over your own figure's box; around an enemy, just outside its body.
 * WASD highlights, E commits, Q closes. With a mouse, clicking an option commits it straight away.
 */
function ActionWheel({ wheel, highlight, center, anchor, aroundPlayer, onHighlight, onCommit }: {
  wheel: Wheel;
  highlight: Dir | null;
  center: string;
  anchor: Anchor | null;
  aroundPlayer: boolean;
  onHighlight: (d: Dir) => void;
  onCommit: (o: WheelOption) => void;
}) {
  if (!anchor) return null;
  const positions = aroundPlayer ? null : optionPositions(anchor);
  const box = aroundPlayer ? { left: anchor.x, top: anchor.y, width: anchor.w, height: anchor.h } : { inset: 0 };
  return (
    <div className={`wheel-overlay ${aroundPlayer ? "is-player" : "is-enemy"}`} style={box} role="menu" aria-label={`Actions for ${center}`}>
      {(Object.keys(wheel) as Dir[]).map(dir => {
        const o = wheel[dir];
        return (
          <button
            key={dir}
            role="menuitem"
            className={`wheel-option wheel-${dir} ${highlight === dir ? "is-highlighted" : ""}`}
            style={positions ? { left: positions[dir].left, top: positions[dir].top, width: OPTION_W } : undefined}
            disabled={!o}
            onMouseEnter={() => o && onHighlight(dir)}
            onClick={() => o && onCommit(o)}
          >
            {o && <b>{o.label}</b>}
          </button>
        );
      })}
    </div>
  );
}

/** One health bar for whoever you're targeting (or, mid-turn, whoever the action involves). Always in the same spot. */
function TargetPanel({ enemy, before }: { enemy: Enemy; before?: BarValues }) {
  return (
    <div className="hud-target">
      <HealthBar fighter={enemy} before={before} mirrored />
    </div>
  );
}

/** Clicking an enemy selects it and opens the wheel. */
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