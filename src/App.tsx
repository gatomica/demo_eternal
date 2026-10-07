import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ARMOR,
  ENCOUNTERS,
  WEAPONS,
  createCombat,
  forcedAction,
  resolveTurn,
  type ArmorTier,
  type CombatState,
  type Enemy,
  type PlayerAction,
  type Step,
  type Tier,
} from "./combat";
import { HealthBar, Scene, StickFigure, figureBox, poseForIntent, shotCamera, type BarValues, type PoseName, type SceneFigure, type SceneShot, type ShotCamera } from "./render";
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
import { Exploration } from "./explore";

type Screen = "menu" | "test" | "explore";

export default function App() {
  const [screen, setScreen] = useState<Screen>("menu");
  return (
    <div className="game">
      {screen === "menu" && <MainMenu onStart={setScreen} />}
      {screen === "test" && <TestCombat onExit={() => setScreen("menu")} />}
      {screen === "explore" && <Exploration onExit={() => setScreen("menu")} />}
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


/** How long a lost turn (guard break or revive) waits before it plays out on its own. */
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
  phase: "approach" | "impact";
  playerPose: PoseName;
  /** What you did this turn (null for a forced turn). */
  action: PlayerAction | null;
}

const isAttackStep = (st: Step | undefined) => !!st?.events.some(ev => ev.kind === "attack");
const phaseFor = (st: Step | undefined): Playback["phase"] => (isAttackStep(st) ? "approach" : "impact");

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
      case "break":
        add(ev.who, "fx-break");
        break;
      case "fall":
        add(ev.who, "fx-fall");
        break;
      case "move":
        if (ev.cause !== "player") add(ev.who, "fx-step");
        else if (youManeuvered && !fx.get("player")?.classes.includes("fx-step")) add("player", "fx-step");
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

  const [paused, setPaused] = useState(false);
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
    if (!playback) {
      // Planning: you stand where you are; the camera eases toward your selection.
      const { pos, camera } = settle(fight, w.pos.player ?? w.anchor);
      shoot(pos, camera, NUDGE_MS);
      return;
    }
    const attack = step?.events.find(ev => ev.kind === "attack");
    if (!attack || attack.kind !== "attack") {
      if (playback.index !== playback.steps.length - 1) return; // stay put until the final step
      // The final step: re-frame you where you ended up, or follow you if you Maneuvered.
      const act = playback.action;
      const moved = step?.events.some(ev => ev.kind === "move" && ev.cause === "player");
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
      // The attacker closes in, and the camera moves in on the two of them.
      const at = closeIn(a, t, STRIKE_GAP);
      shoot({ ...w.pos, [attack.attacker]: at }, actionCamera(shotCamera(shot), at, t), APPROACH_MS);
    } else if (attack.result === "hit") {
      // A clean hit knocks the target back, and it stays there. Blocks only rock it (CSS).
      shoot({ ...w.pos, [attack.target]: pushedAway(a, t, KNOCKBACK) }, shot.camera, KNOCK_MS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback?.index, playback?.phase, !!playback, selId, fight]);

  /** Where the selected figure will be on screen once the camera settles, for the wheel. */
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  useLayoutEffect(() => {
    if (!wheelOpen) return;
    const p = shot.positions[selId];
    const { w, h } = viewport;
    if (!p || !w) return setAnchor(null);
    const b = figureBox(shotCamera(shot), p, w, h);
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
    const pose: PoseName = forced ? "kneel" : action.type; // broken or reviving: down on one knee
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

  // Advance the playback one step at a time.
  useEffect(() => {
    if (!playback || paused) return;
    const timer = window.setTimeout(
      () =>
        setPlayback(pb => {
          if (!pb) return null;
          if (pb.phase === "approach") return { ...pb, phase: "impact" };
          const index = pb.index + 1;
          return index < pb.steps.length ? { ...pb, index, phase: phaseFor(pb.steps[index]) } : null;
        }),
      playback.phase === "approach" ? APPROACH_MS : STEP_MS,
    );
    return () => window.clearTimeout(timer);
  }, [playback, paused]);

  // A guard break or a revive costs you the turn: show it, then play it out on its own.
  useEffect(() => {
    if (!playing || !forced || busy || paused) return;
    const timer = window.setTimeout(() => play({ type: "rest" }), FORCED_TURN_MS);
    return () => window.clearTimeout(timer);
  });

  const pauseOptions: { label: string; run: () => void }[] = [
    { label: "Resume", run: () => setPaused(false) },
    { label: "Restart fight", run: onRetry },
    { label: "Change loadout", run: onChangeLoadout },
    { label: "Main menu", run: onExit },
  ];

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
      if (key === "select") onRetry();
      else if (key === "back" || key === "pause") onExit();
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
    else if (key !== "pause" && wheel[key]) setHighlight(key);
  });

  /* ---------- what the screen shows ---------- */
  /**
   * During playback: a fighter shows its telegraph until its own attack, the strike frame on the
   * step its attack lands, and a neutral stance after. Anyone broken goes down (player kneels,
   * enemies fall to the ground).
   */
  const strikeStep = (id: string) =>
    playback ? playback.steps.findIndex(st => st.events.some(ev => ev.kind === "attack" && ev.attacker === id)) : -1;
  const playbackPose = (id: string, telegraph: PoseName, broken: boolean, down: PoseName): PoseName => {
    if (!playback) return telegraph;
    const struck = strikeStep(id);
    if (struck === playback.index) return impact ? "strike" : "attack"; // wind up while closing in, then strike
    if (broken) return down;
    if (struck >= 0 && struck < playback.index) return "idle";
    return telegraph;
  };
  const playerPose: PoseName = playback
    ? playbackPose("player", playback.playerPose, p.broken, "kneel")
    : forced ? "kneel" : (chosen?.action.type as PoseName | undefined) ?? "idle";
  const enemyPose = (e: Enemy): PoseName => playbackPose(e.id, poseForIntent(e), e.broken, "fallen");

  // Everyone on the field: you, enemies still standing, and any falling during this step.
  const figures: SceneFigure[] = [
    {
      id: "player",
      view: "back",
      pose: playerPose,
      weapon: p.weapon,
      armor: p.armor,
      classes: fx.get("player")?.classes ?? [],
      stepKey,
      selected: !busy && sel.kind === "player",
      disabled: busy || !playing || forced !== null,
      label: "Select yourself",
      onPick: () => openWheel({ kind: "player" }),
    },
    ...view.enemies
      .filter(e => e.alive || fx.get(e.id)?.classes.includes("fx-fall"))
      .map((e): SceneFigure => ({
        id: e.id,
        view: "front",
        pose: enemyPose(e),
        weapon: e.weapon,
        armor: e.armor,
        classes: fx.get(e.id)?.classes ?? [],
        stepKey,
        selected: !busy && sel.kind === "enemy" && sel.id === e.id,
        disabled: busy || !playing || forced !== null,
        label: `Select ${e.name}`,
        onPick: () => openWheel({ kind: "enemy", id: e.id }),
      })),
  ];

  return (
    <div className={`hud ${busy ? "is-cinematic" : ""}`} ref={hudRef}>
      <section className="stage" aria-label="Battlefield">
        <Scene figures={figures} shot={shot} />
      </section>

      {/* Cutscene mode: black strips slide in while a turn plays out. When they leave, it's your move. */}
      <div className="letterbox letterbox-top" aria-hidden="true" />
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
            <h2>{fight.status === "won" ? "The sleepwalkers are still" : "You fade"}</h2>
            <div className="setup-buttons">
              <button className="hud-button" onClick={onExit}>Menu</button>
              <button className="hud-button" onClick={onChangeLoadout}>Change loadout</button>
              <button className="commit" onClick={onRetry}>Retry</button>
            </div>
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