/**
 * CombatScreen.tsx — the combat screen: planning, then the turn played back step by step.
 */
import { type ReactNode, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PHASE_TWO, playMusic } from "../audio/music";
import { eternalSfx, play as playSfx, prepare as prepareSfx, sfxFor } from "../audio/sfx";
import { ActionWheel, type Anchor } from "./ActionWheel";
import { APPROACH_MS, BLOCK_PUSH, CAMERA_FOLLOW, DODGE_BACK, DODGE_DELAY_MS, DODGE_LATERAL, DODGE_PAST, effectsOf, ENGAGE_GAP, FALL_BACK, FORCED_TURN_MS, IGNITE_DARK, IGNITE_MARKS, indexTurn, involvedEnemy, isAttackStep, KNOCK_MS, KNOCKBACK, MIN_ATTACK_PHASE_MS, NUDGE_MS, OPENING_LEAD_IN, phaseAt, phaseFor, phaseTwoOf, type Playback, RAISE_CAMERA_MS, REST_ANIM_MS, REST_POSE_MS, SETTLE_MS, STEP_MS, STRIKE_GAP, USURP_STAGES, usurpOf, type UsurpStage, viewAt, WAKE } from "./playback";
import { LessonBox } from "./LessonBox";
import { prepareWalk, speak } from "../audio/walk";
import { useDev } from "../ui/dev";
import { DETOUR, isWanted, type Beat, lessonAllows, lessonMet, typeDelay } from "./lesson";
import { defaultSelection, moveSelection, rowsOf, sameSel, type Selection, type Wheel, type WheelOption } from "./selection";
import { kindOf } from "../core/bestiary";
import { forcedAction, resolveTurn, snapshotOf } from "../core/resolve";
import { attackCost, restRecovery } from "../core/rules";
import type { CombatEvent, CombatState, Enemy, Opening, Player, PlayerAction, Stance, Swing } from "../core/types";
import { behind, bodiesOfEnemies, type Cam, closeIn, facingToward, figureBox, formation, lerpAngle, planningCamera, pushedAway, SCENE_TILT, type SceneShot, shotCamera, type ShotCamera, sub, type Vec, yawOf } from "../render/camera";
import type { Projectile } from "../render/effects";
import { type BarValues, HealthBar, PlayerBars } from "../render/HealthBar";
import { lookOf } from "../render/looks";
import { actionPose, asPose, downPoseOf, flinchPoseOf, handOffOf, idlePoseOf, impactPoint, player3dPose, poseForIntent, type PoseName, strikePose, windUpPose } from "../render/poses";
import { Scene, type SceneFigure } from "../render/Scene";
import { StringFx, type StringBurst } from "../render/StringFx";
import type { StringPop } from "../render/StringCounter";
import { type Dir, menuSound, useKeys, wrapIndex } from "../ui/input";
import { type MenuOption, PauseMenu } from "../ui/Menu";
import { DebugLimbsContext } from "../render/debugLimbs";
import { IGNITE } from "../warden/scenes";
import type { CandleArm, WardenPoseName } from "../warden/skeleton";

const barValues =(f: { hp: number; fatigue: number; death: number }): BarValues => ({ hp: f.hp, fatigue: f.fatigue, death: f.death });

/** How many strings a boss's String bursts into. */
const BOSS_STRINGS = 12;

/** How an enemy's look draws it differently (its kind's variant). */
const lookOfFoe = (e: Enemy) => lookOf(kindOf(e).variant);

/** The player is drawn in 3D in a fight, on the Sleepwalker's body (`player3dPose`, Sleepwalker3D's `gear`). */
const PLAYER_3D = true;
/** Whether the game itself (fights, not the Model viewer) draws the Warden from the 3D rig. Off while it is built. */
const WARDEN_3D_IN_GAME = false;

export function CombatScreen({ initial, opening, onRetry, onChangeLoadout, onExit, onDone, override, panel, playSignal, attackOnPlay, restOnPlay, shade = true, playerAction, playerHold, playerDead, light = true, debugLimbs = false, changeLabel, exitLabel, wonText, onTurnPlayed, lesson, wakeUp, music = false, orbit, playTarget, string: carried = 0, eternalString = 0, knotOwned = false }: {
  initial: CombatState;
  /** A scene to play before the first turn (it leaves the fight as `initial`). */
  opening?: Opening;
  /** The model viewer: rewrites the fight before it's shown or played (the enemy's pose and action). */
  override?: (s: CombatState) => CombatState;
  /** Extra controls drawn over the fight (the model viewer's). */
  panel?: ReactNode;
  /** Each change plays a turn in which you just Rest (the model viewer's actions). You can't act yourself. */
  playSignal?: number;
  /** The model viewer, an enemy with several parts: the id of the part your blow is aimed at when it needs something to block or dodge. */
  playTarget?: string;
  /** The model viewer: you attack it this turn (to break its Rest). */
  attackOnPlay?: boolean;
  /** The ambient shade over everything (default on): the model viewer turns it off to check the real colours. */
  shade?: boolean;
  /** The model viewer: the player does nothing when an action is played, even against a Block or a Maneuver, so the Block has nothing to block (a "whiff"). */
  restOnPlay?: boolean;
  /** The model viewer's Model stance: the camera orbits the enemy (or you), and dragging turns it round (see `Scene`'s `orbit`). */
  orbit?: Parameters<typeof Scene>[0]["orbit"];
  /** The model viewer's player mode: each change plays this action for you (instead of a Rest or an Attack). */
  playerAction?: PlayerAction;
  /** The model viewer's player mode: the pose you hold while no turn is playing. */
  playerHold?: PoseName;
  /** The model viewer's player mode: you lie where you fell (your remains), whatever the fight says. */
  playerDead?: boolean;
  /** The fight's limited light (default on). The Model viewer can turn it off to see everything. */
  light?: boolean;
  /** The Model viewer's Debug status: every figure draws its right arm and leg red. */
  debugLimbs?: boolean;
  /** The pause menu's label for onChangeLoadout. */
  changeLabel?: string;
  /** The pause menu's label for onExit. */
  exitLabel?: string;
  /**
   * The guide's scripted lesson (see lesson.ts): its words are written out in a box at the bottom, and only
   * the keys it asks for work. Start the fight in `sparring`. When the last beat is read, the fight is won.
   */
  lesson?: Beat[];
  /** The lesson opens with you waking in the dark, the guide's light approaching (a new game's start): nothing can be done until it has arrived. */
  wakeUp?: boolean;
  /** Plays the fight's music (the model viewer's fights have none): the church's in the lesson, the Penitent Warden's in his fight, else the dungeon's. */
  music?: boolean;
  /** The title when you win (fights off the map have their own). */
  wonText?: string;
  /** Called as a turn finishes playing, with the fight as it now stands. */
  onTurnPlayed?: (s: CombatState) => void;
  onRetry: () => void;
  /** Back to the setup screen (not offered when unset). */
  onChangeLoadout?: () => void;
  onExit: () => void;
  /** Set for fights from the map: when it's over, carry on (won or not) instead of retrying. */
  /** You have the revive knot (its symbol shows beside your bars even when it is spent). */
  knotOwned?: boolean;
  onDone?: (won: boolean, charges: number, eternity: number, result: { earned: number; killedBy?: string }) => void;
  /** The String you carry into the fight (the counter at the top right); a fight from Test combat starts with none. */
  string?: number;
  /** Your eternal String (death never takes it). */
  eternalString?: number;
}) {
  const [fightRaw, setFight] = useState(initial);
  const fight = useMemo(() => (override ? override(fightRaw) : fightRaw), [fightRaw, override]);
  const [playback, setPlayback] = useState<Playback | null>(() =>
    opening?.steps.length
      ? { from: opening.from, steps: opening.steps, index: 0, phase: phaseFor(opening.steps[0]), playerPose: "idle", action: null, leadIn: OPENING_LEAD_IN }
      : null,
  );
  const [selection, setSelection] = useState<Selection>(() => defaultSelection(initial));
  const [wheelOpen, setWheelOpen] = useState(false);
  const [highlight, setHighlight] = useState<Dir | null>(null);

  const [paused, setPaused] = useState(false);
  /** Usurp Flame's scene, while it plays (see USURP_STAGES). */
  const [usurpStage, setUsurpStage] = useState<UsurpStage | null>(null);
  /**
   * The Warden's phase-two scene, while it plays: who, when it started, and the last of its
   * moments it has reached (see IGNITE_MARKS). The scene itself animates every frame on its own.
   */
  const [igniteState, setIgniteState] = useState<{ who: string; start: number; seed: number; at: number } | null>(null);
  const setIgnite = (v: { who: string; start: number; seed: number } | null) => setIgniteState(v && { ...v, at: 0 });
  const [pauseIndex, setPauseIndex] = useState(0);
  const busy = playback !== null;
  const forced = forcedAction(fight);
  const playing = fight.status === "playing";

  /* ---------- the guide's lesson ----------
   * `beat` is where the lesson stands; `written` how much of its words are on screen. */
  const [beat, setBeat] = useState(0);
  const [typed, setTyped] = useState({ beat: 0, n: 0 });
  // (The guide's voice is made ready as the fight opens, so its first words sound.)
  useEffect(() => { prepareWalk(); }, []);
  // String: lots on their way to you from the fallen, what has landed so far (the counter), the "+X" pops under it, who has paid, and the total earned.
  const [bursts, setBursts] = useState<StringBurst[]>([]);
  const [landed, setLanded] = useState(0);
  /** How many lots have reached you (a won fight ends once they all have). */
  const [landedLots, setLandedLots] = useState(0);
  const [pops, setPops] = useState<StringPop[]>([]);
  const paid = useRef(new Set<string>());
  const earned = useRef(0);
  const burstIds = useRef(0);
  /** The revive knot's red string: sent from the numeral once you lie down, and wound round you (then you rise). */
  const reviveSent = useRef(false);
  const [reviveCoiled, setReviveCoiled] = useState(false);
  /** A lot of String reaches you: the counter goes up, and "+X" pops up under it. */
  const popTimers = useRef(new Map<number, number>());
  const stringLanded = (b: StringBurst) => {
    // (The revive knot's string carries no String: when it has wound round your remains, you rise.)
    if (b.revive) { setLandedLots(n => n + 1); setReviveCoiled(true); return; }
    setLanded(n => n + b.amount);
    setLandedLots(n => n + 1);
    // (The many strings of a boss add up in one "+X" pop.)
    const id = b.group ?? b.id;
    setPops(p => (p.some(x => x.id === id) ? p.map(x => (x.id === id ? { ...x, amount: x.amount + b.amount } : x)) : [...p, { id, amount: b.amount }]));
    window.clearTimeout(popTimers.current.get(id));
    popTimers.current.set(id, window.setTimeout(() => setPops(p => p.filter(x => x.id !== id)), 1800));
  };
  const written = typed.beat === beat ? typed.n : 0;
  const setWritten = (n: number | ((w: number) => number)) => setTyped(t => ({ beat, n: typeof n === "number" ? n : n(t.beat === beat ? t.n : 0) }));
  /** Waking in the dark, before the lesson: the guide walks in out of the black (see `WAKE`). */
  const [waking, setWaking] = useState(!!(wakeUp && lesson));
  const [wakeDark, setWakeDark] = useState<{ level: number; ms: number; glow: string } | undefined>(undefined);
  const current = lesson && playing && !waking ? lesson[beat] : undefined;
  const typing = !!current && written < current.say.length;
  /** The detour's words (see DETOUR), as far as they are written. */
  const [detourN, setDetourN] = useState(0);

  // What's on screen: mid-turn during playback, otherwise the fight as it stands.
  // While an attacker is still closing in, the fight shows as it was before the blow.
  const step = playback?.steps[playback.index];
  const impact = playback?.phase === "impact";
  // The fight just before this step, so a bar that appears mid-turn still animates from it.
  const prevView = useMemo(
    () => (playback ? (playback.index > 0 ? viewAt(playback.from, playback.steps[playback.index - 1].after) : playback.from) : undefined),
    [playback],
  );
  const stepView = useMemo(() => (playback?.phase === "impact" ? viewAt(playback.from, playback.steps[playback.index].after) : undefined), [playback]);
  const view = playback && step ? (impact ? stepView! : prevView!) : fight;
  const fx = effectsOf(impact ? step : undefined, playback?.action?.type === "maneuver");
  const stepKey = playback ? `${playback.from.turn}-${playback.index}-${playback.phase}` : "rest";
  const p = view.player;

  // Get the sounds ready as the fight opens, so the first blow doesn't wait for them to load.
  useEffect(() => { prepareSfx(); }, []);

  // Each blow's sound lands with its picture: as the step's impact phase begins.
  useEffect(() => {
    if (!impact || !step) return;
    // One of each sound per step (the heavy ones are built from synths that play one note at a time: a second of the same kind a moment later
    // would cut the first off and smear the two); except the flames, one for each unit they lick (up to three, a beat apart).
    const heard = new Map<string, number>();
    for (const ev of step.events) {
      // An eternal effect taking hold has its own wisp, over the sound of the effect itself. (Yours only: an enemy's weapon effect still happens, silently.)
      if (ev.kind === "eternal") {
        if (ev.attacker !== "player") continue;
        const w = eternalSfx(ev);
        playSfx(w.name, w.delay);
      }
      const s = sfxFor(ev);
      if (!s) continue;
      const n = heard.get(s.name) ?? 0;
      heard.set(s.name, n + 1);
      if (n === 0 || (s.name === "flame" && n < 3)) playSfx(s.name, s.delay + n * 0.09);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey]);

  // Eternal effects happening in this step: they flash the bars they touch, light the weapon that carried them and show a halo where they take hold. Only yours
  // do: Eternity is the player's, so an enemy's weapon effect takes place without any of that.
  const eternalHere = impact && step ? step.events.filter((ev): ev is Extract<CombatEvent, { kind: "eternal" }> => ev.kind === "eternal" && ev.attacker === "player") : [];
  /** Whose bar an effect touches: the target's (extra Fatigue or damage), or the user's own (Fatigue saved). */
  const touchedBy = (ev: Extract<CombatEvent, { kind: "eternal" }>) => (ev.effect === "shortsword" ? ev.attacker : ev.target);
  const barFlashOf = (id: string) => (eternalHere.some(ev => touchedBy(ev) === id) ? stepKey : undefined);
  /** The weapon's flash: pale blue, or dark red when the effect was paid in Death (a key starting "death|"). */
  const auraOf = (id: string) => {
    const ev = eternalHere.find(e => e.attacker === id);
    return ev ? (ev.death > 0 ? `death|${stepKey}` : stepKey) : undefined;
  };

  // Keep the selection valid: a fallen enemy hands the cursor to the next one.
  const rows = rowsOf(fight);
  const sel: Selection = rows.flat().some(s => sameSel(s, selection)) ? selection : defaultSelection(fight);
  const selectedEnemy = sel.kind === "enemy" ? view.enemies.find(e => e.id === sel.id) : undefined;
  // During playback the bar follows whichever enemy the current step is about.
  const shownId = (busy && involvedEnemy(step)) || selectedEnemy?.id;
  const shownEnemy = view.enemies.find(e => e.id === shownId);
  const shownBefore = prevView?.enemies.find(e => e.id === shownId);
  /** Who the bar hangs below: the shown enemy, or the middle part of the body it is a part of. */
  const barHolder = shownEnemy?.body ? (view.enemies.find(e => e.body === shownEnemy.body && e.part === "mid" && e.alive) ?? shownEnemy).id : shownId;

  /** Whether a bar hangs below this enemy for a Rest this turn: it Rests (or recovers) now, or, for one part of a body, whichever part does, on the middle part. */
  const restingBar = (e: Enemy): boolean => {
    const rests = (x: Enemy) => x.alive && x.intent.type === "rest";
    if (!e.body) return rests(e);
    const mates = view.enemies.filter(x => x.body === e.body && x.alive);
    return (e.part === "mid" || mates.every(x => x.part !== "mid")) && mates.some(rests);
  };

  /* ---------- the wheel for the current selection ---------- */
  const wheel: Wheel = (() => {
    const opt = (label: string, action: PlayerAction): WheelOption => ({ label, action });
    if (sel.kind === "player") {
      return {
        up: null,
        left: opt("Dodge", { type: "maneuver", target: "self" }),
        down: opt("Rest", { type: "rest" }),
        right: null,
      };
    }
    return {
      up: opt("Attack", { type: "attack", target: sel.id }),
      left: opt("Dodge", { type: "maneuver", target: sel.id }),
      down: null,
      right: opt("Block", { type: "block", target: sel.id }),
    };
  })();
  const chosen = wheelOpen && highlight ? wheel[highlight] : null;
  // Hovering an Attack (before you commit to it): the Fatigue it would cost flickers on your bar.
  const previewCost = !busy && chosen?.action.type === "attack" ? attackCost(p, chosen.action.weight) : 0;
  // Hovering a Rest: the Fatigue it would clear and the Health it would return flicker on your bar.
  const previewRecover = !busy && chosen?.action.type === "rest" ? restRecovery(p) : undefined;
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

  /** The parts of multi-target enemies (the Wax Blob): they share a slot in the formation. */
  const bodies = useMemo(() => bodiesOfEnemies(initial.enemies), []); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Moves `id` to `to`; the rest of its body (the Wax Blob) goes along a share of the way, so the heap travels with the part that
   * lunges, dodges or is knocked back, and stretches toward it.
   */
  const dragBody = (pos: Record<string, Vec>, id: string, to: Vec, follow = 0.55): Record<string, Vec> => {
    const from = pos[id], out = { ...pos, [id]: to };
    const body = bodies[id]?.body;
    if (body && from) for (const [mate, b] of Object.entries(bodies)) if (mate !== id && b.body === body && pos[mate]) out[mate] = { x: pos[mate].x + (to.x - from.x) * follow, z: pos[mate].z + (to.z - from.z) * follow };
    return out;
  };

  /**
   * The camera's yaw for a scene between two fighters: turned so the enemy is on the right of the screen and what it is aimed at (you,
   * or the ally it hits) on the left, whichever way the fight faces. Sprites and animations then always look the same.
   */
  const sceneYaw = (a: string, b: string, fallback: number): number => {
    const [enemy, other] = a === "player" ? [b, a] : [a, b];
    const e = world.current.pos[enemy], o = world.current.pos[other];
    if (!e || !o || Math.hypot(e.x - o.x, e.z - o.z) < 0.05) return fallback;
    return yawOf(sub(e, o)) - Math.PI / 2 + SCENE_TILT;
  };

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
    const aimed = yaw + toward * CAMERA_FOLLOW;
    return { follow: "player", yaw: aimed + clearView(anchor, aimed, pos, st) };
  };

  /**
   * How far to swing the camera around you (radians) so that nobody stands in front of the enemy you
   * have selected: the least turn that leaves the most of it in view. Those on the front line count
   * double against it, being the ones that usually get in the way of the back line; a camera that
   * can't clear everyone settles for clearing the front line.
   */
  const clearView = (anchor: Vec, yaw: number, pos: Record<string, Vec>, st: CombatState): number => {
    const target = st.enemies.find(e => e.id === selId && e.alive);
    if (!target || !pos[target.id]) return 0;
    const others = st.enemies.filter(e => e.alive && e.id !== target.id && pos[e.id]);
    if (!others.length) return 0;
    const W = viewport.w || 1280, H = viewport.h || 720;
    // What of a figure's box is figure: its middle (the box is wider than the body).
    const body = (cam: Cam, e: Enemy) => {
      const b = figureBox(cam, pos[e.id], W, H, kindOf(e).scale);
      return { l: b.x + b.w * 0.3, r: b.x + b.w * 0.7, t: b.y, b: b.y + b.h, depth: b.depth };
    };
    const hiddenAt = (turn: number) => {
      const cam = planningCamera(anchor, yaw + turn);
      const t = body(cam, target);
      let hidden = 0;
      for (const o of others) {
        const b = body(cam, o);
        if (b.depth >= t.depth) continue; // only a nearer figure can stand in front
        const across = Math.max(0, Math.min(t.r, b.r) - Math.max(t.l, b.l)) / (t.r - t.l);
        const down = Math.max(0, Math.min(t.b, b.b) - Math.max(t.t, b.t)) / (t.b - t.t);
        hidden += across * down * (o.line === "front" ? 2 : 1);
      }
      return hidden;
    };
    let best = 0, bestScore = hiddenAt(0);
    if (bestScore === 0) return 0;
    // Swing either way, a little at a time; a wider turn only wins by clearing the view that much better.
    for (let turn = 0.05; turn <= 0.65 + 1e-6; turn += 0.05) {
      for (const sign of [1, -1]) {
        const score = hiddenAt(sign * turn) + turn * 0.1;
        if (score < bestScore) { best = sign * turn; bestScore = score; }
      }
    }
    return best;
  };

  /** Puts everyone in formation around the player standing at `anchor`, and frames them. */
  const settle = (st: CombatState, anchor: Vec) => {
    const w = world.current;
    const { front, back } = linesOf(st);
    // Turn so the enemies, from wherever they are now, end up roughly ahead in their lines.
    const enemiesNow = [...front, ...back].map(id => w.pos[id]).filter(Boolean);
    const yaw = facingToward(anchor, enemiesNow, front.length, back.length, w.yaw);
    const pos = { ...w.pos, ...Object.fromEntries(formation(anchor, yaw, front, back, bodies)), player: anchor };
    world.current = { anchor, yaw, pos };
    return { pos, camera: planningShot(anchor, yaw, pos, st) };
  };

  const [shot, setShot] = useState<SceneShot>(() => {
    // Laid out as the fight stands when the screen opens (before its opening scene, if any).
    const { front, back } = linesOf(opening?.from ?? initial);
    const pos: Record<string, Vec> = { ...Object.fromEntries(formation({ x: 0, z: 0 }, 0, front, back, bodies)), player: { x: 0, z: 0 } };
    // Waking up: the enemies (the guide) start far off in the dark, in the direction of their lines.
    if (wakeUp && lesson) {
      for (const id of [...front, ...back]) {
        const p = pos[id], d = Math.hypot(p.x, p.z) || 1;
        pos[id] = { x: p.x + (p.x / d) * WAKE.distance, z: p.z + (p.z / d) * WAKE.distance };
      }
    }
    world.current.pos = pos;
    return { positions: pos, camera: { follow: "player", yaw: 0 }, ms: 0, version: 0 };
  });
  const shoot = (positions: Record<string, Vec>, camera: ShotCamera, ms: number, snap?: string[]) => {
    world.current.pos = positions;
    setShot(s => ({ positions, camera, ms, snap, version: s.version + 1 }));
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
      const pulledBack = { x: at.x - Math.sin(yaw) * back, z: at.z - Math.cos(yaw) * back, yaw };
      // Once it is dark, the waxed the shockwave will raise are moved to the back line, to be in frame when the light returns.
      if (igniteState.at >= IGNITE.kindle && playback && step) {
        const after = viewAt(playback.from, step.after);
        const { front, back: backLine } = linesOf(after);
        const slots = formation(w.anchor, w.yaw, front, backLine, bodies);
        const moved = after.enemies.filter(e => e.alive && kindOf(e).flame && slots.has(e.id)).map(e => e.id);
        shoot({ ...w.pos, ...Object.fromEntries(moved.map(id => [id, slots.get(id)!])) }, pulledBack, IGNITE.draw, moved);
        return;
      }
      shoot(w.pos, pulledBack, IGNITE.draw);
      return;
    }
    if (!playback) {
      if (waking) return; // (the wake-up scene moves everyone itself)
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
      const between: ShotCamera = { between: [usurp.who, usurp.target], yaw: sceneYaw(usurp.who, usurp.target, shotCamera(shot).yaw) };
      if (usurpStage === "focus") shoot(w.pos, between, USURP_STAGES.dash);
      if (usurpStage === "dash") {
        const at = closeIn(a, t, STRIKE_GAP);
        shoot({ ...w.pos, [usurp.who]: at }, between, USURP_STAGES.black - USURP_STAGES.dash);
      }
      return;
    }
    // Staggered in phase two, the Warden sends a flame to a fallen waxed: the camera follows it there, to see it rise.
    const raise = step?.events.find(ev => ev.kind === "raised" && ev.by);
    if (raise && raise.kind === "raised" && raise.by && playback.phase !== "approach") {
      shoot(w.pos, { between: [raise.by, raise.who], yaw: sceneYaw(raise.by, raise.who, shotCamera(shot).yaw) }, RAISE_CAMERA_MS);
      return;
    }
    const attack = step?.events.find(ev => ev.kind === "attack");
    if (!attack || attack.kind !== "attack") {
      if (playback.index !== playback.steps.length - 1 || playback.phase === "approach") return; // stay put until the final step plays
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
    /** Where a dodge carries the target. */
    const dodgeTo = (strike: Vec): { to: Vec; retreating: boolean } => {
      // A dodge gets out of the way: further back, and away from the attacker, if they were retreating; if they
      // were closing in, past the attacker, to its far side.
      const retreating = attack.target === "player"
        ? playback.action?.type === "maneuver" && playback.action.target === "self"
        : playback.from.enemies.find(e => e.id === attack.target)?.intent.dir === "retreat";
      // Seen from the camera: "back" is straight away from the camera, "to the side" straight
      // across the screen: away from the attacker when retreating, toward its side when closing in.
      // A retreating dodge goes just as far each way.
      const cam = shotCamera(shot);
      const cd = Math.hypot(t.x - cam.x, t.z - cam.z) || 1;
      const back = { x: (t.x - cam.x) / cd, z: (t.z - cam.z) / cd };
      let side = { x: -back.z, z: back.x };
      if (side.x * (t.x - a.x) + side.z * (t.z - a.z) < 0) side = { x: -side.x, z: -side.z }; // away from the attacker
      if (retreating) return { retreating, to: { x: t.x + (back.x + side.x) * DODGE_BACK, z: t.z + (back.z + side.z) * DODGE_BACK } };
      // Closing in: on along the line from the dodger through the attacker's striking spot, to a point beyond it, so the dodger ends up on
      // the opposite side of its attacker. A little to one side as well (the far side from the camera), to pass it, not run into it.
      const through = { x: strike.x - t.x, z: strike.z - t.z }, reach = Math.hypot(through.x, through.z);
      const along = reach > 0.05 ? { x: through.x / reach, z: through.z / reach } : { x: -back.x, z: -back.z };
      let lateral = { x: -along.z, z: along.x };
      if (lateral.x * back.x + lateral.z * back.z < 0) lateral = { x: -lateral.x, z: -lateral.z };
      return { retreating, to: { x: strike.x + along.x * DODGE_PAST + lateral.x * DODGE_LATERAL, z: strike.z + along.z * DODGE_PAST + lateral.z * DODGE_LATERAL } };
    };
    let cleanup: (() => void) | undefined;
    if (playback.phase === "approach") {
      // A melee attacker closes in (a ranged one stays put), and the camera moves in on the two.
      const at = attack.ranged ? a : closeIn(a, t, STRIKE_GAP);
      // (It stays centered between the two as they move: closing in, knocked back, dodging.)
      const camera: ShotCamera = { between: [attack.attacker, attack.target], yaw: sceneYaw(attack.attacker, attack.target, shotCamera(shot).yaw) };
      shoot(dragBody(w.pos, attack.attacker, at), camera, APPROACH_MS);
      if (attack.result === "dodged") {
        // A target that dodges gets clear late in the approach, timed to be gone just as the blow arrives (the
        // blow lands where it was), and only then takes its dodge pose.
        const { to, retreating } = dodgeTo(at);
        const timer = window.setTimeout(() => {
          shoot(dragBody(world.current.pos, attack.target, to), camera, APPROACH_MS - DODGE_DELAY_MS);
          setDodgeStarted(stepKey);
          // The dodger faces the way it goes (or, backing off, away from it) from here until it starts repositioning (see `dodgeFor`).
          const go = { x: to.x - t.x, z: to.z - t.z }, len = Math.hypot(go.x, go.z) || 1;
          setDodging(prev => ({ ...prev, [attack.target]: { dir: { x: go.x / len, z: go.z / len }, retreat: retreating } }));
        }, DODGE_DELAY_MS);
        cleanup = () => window.clearTimeout(timer);
      }
    } else if (attack.result === "hit") {
      // A clean hit knocks the target back, and it stays there.
      shoot(dragBody(w.pos, attack.target, pushedAway(a, t, KNOCKBACK)), shot.camera, KNOCK_MS);
    } else if (attack.result === "blocked") {
      // A block jolts them both apart a little, and they stay there (like a knockback).
      let knocked = dragBody(w.pos, attack.target, pushedAway(a, t, BLOCK_PUSH));
      if (!attack.ranged) knocked = dragBody(knocked, attack.attacker, pushedAway(t, a, BLOCK_PUSH));
      shoot(knocked, shot.camera, KNOCK_MS);
    }
    // (A dodge already got out of the way during the approach, so there's nothing more to move at the impact.)
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback?.index, playback?.phase, !!playback, selId, fight, usurpStage, igniteState, waking]);

  // Waking up: black but for the guide's light, which comes closer; then the dark lifts and the lesson begins.
  useEffect(() => {
    if (!waking) return;
    const guide = fight.enemies[0]?.id;
    if (!guide) { setWaking(false); return; }
    setWakeDark({ level: 1, ms: 0, glow: guide });
    const { front, back } = linesOf(initial);
    const slots = formation({ x: 0, z: 0 }, 0, front, back, bodies);
    const timers = [
      window.setTimeout(() => shoot({ ...world.current.pos, ...Object.fromEntries(slots), player: { x: 0, z: 0 } }, { follow: "player", yaw: 0 }, WAKE.walkMs), WAKE.startMs),
      window.setTimeout(() => setWakeDark({ level: 0, ms: WAKE.liftMs, glow: guide }), WAKE.liftAt),
      window.setTimeout(() => { setWaking(false); setWakeDark(undefined); }, WAKE.liftAt + WAKE.liftMs),
    ];
    return () => timers.forEach(window.clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Where the selected figure is on screen right now, for the ring (the mark over it, and the wheel): the scene tells us every time it moves, so the ring rides along with the camera as it turns to show the new target, instead of going straight to where the target will end up. */
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  /* ---------- moving the cursor ----------
   * W/S move between depths. A/D walk the whole lineup as it appears on screen, left to right:
   * you, then the front line, then the back line. So pressing A at the left end of a line
   * steps to the line closer to you, and D at the right end steps to the line behind. */
  const moveCursor = (dir: Dir) => {
    const to = moveSelection(rows, sel, dir);
    if (to) { menuSound(dir); setSelection(to); }
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
    turnStart.current = performance.now();
    const next = resolveTurn(fight, action);
    const pose: PoseName = forced ? "kneel" : action.type; // staggered or reviving: down on one knee
    setFight(next);
    // A turn where nothing happens (a Block, with nothing to block, and no one else doing anything) still plays one quiet step, so it lasts
    // the minimum a turn lasts (MIN_ATTACK_PHASE_MS, then the step) rather than ending the moment you commit.
    const steps = next.lastTurn.length ? next.lastTurn : [{ events: [], after: snapshotOf(next.player, next.enemies) }];
    setPlayback({ from: fight, steps, index: 0, phase: phaseAt(steps, 0, 0), playerPose: pose, action: forced ? null : action });
    closeWheel();
  };
  const commit = (option: WheelOption | null) => {
    if (!option || !playing || busy) return;
    // (In the lesson, only the action it asks for, and not while it is still speaking.)
    if (current && (typing || current.goal?.until !== "commit" || !current.goal.want || !isWanted(option.action, current.goal.want) || !lessonStand?.onTarget)) return;
    if (current) nextBeat();
    play(option.action);
  };

  // The model viewer's Play: a turn where you only Rest, so the enemy's action plays on its own.
  // Against a Block or a Maneuver you attack instead, so there's something to block or dodge.
  const playSignalled = useEffectEvent(() => {
    if (playerAction) {
      if (playing && !busy) play(playerAction);
      return;
    }
    const foe = (playTarget ? fight.enemies.find(e => e.id === playTarget) : undefined) ?? fight.enemies.find(e => e.alive);
    // (Not against a fixed rule like Usurp Flame: that plays on its own.)
    const fixedRule = !!foe && !!kindOf(foe).fixedActions?.includes(foe.intent.action ?? "");
    if (playing && !busy) play(!fixedRule && !restOnPlay && (attackOnPlay || foe?.intent.type === "block" || foe?.intent.type === "maneuver") ? { type: "attack", target: foe!.id } : { type: "rest" });
  });
  const lastSignal = useRef(playSignal);
  useEffect(() => {
    if (playSignal === lastSignal.current) return;
    lastSignal.current = playSignal;
    playSignalled();
  }, [playSignal]);

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
      if (!playback && was === false && now && lookOfFoe(e)?.igniteScene) setIgnite({ who: e.id, start: performance.now(), seed: Math.random() * 100 });
      phaseTwoBefore.current[e.id] = now;
    }
  }, [fight, playback]);
  // The screen only changes at the scene's few moments (the dark falls, he stands, it flares), so
  // it only updates then; at the end, the step itself plays.
  const igniteStart = igniteState?.start;
  // The music. The Warden's has two halves: the second starts, after a moment of silence, fading in over a second, as the phase-two scene begins.
  const [phaseTwoMusic, setPhaseTwoMusic] = useState(() => initial.enemies.some(e => e.flags.phase2));
  useEffect(() => { if (igniteStart !== undefined) setPhaseTwoMusic(true); }, [igniteStart]);
  // (Back in phase one, as the model viewer can put him, the first half plays again.)
  const inPhaseTwo = fight.enemies.some(e => e.flags.phase2);
  useEffect(() => { if (!inPhaseTwo) setPhaseTwoMusic(false); }, [inPhaseTwo]);
  const warden = fight.enemies.some(e => e.kind === "warden");
  useEffect(() => {
    if (!music) return;
    if (lesson) playMusic("church");
    else if (!warden) playMusic("dungeon");
    else if (phaseTwoMusic) playMusic("wardenTwo", PHASE_TWO.fade, PHASE_TWO);
    else playMusic("wardenOne");
  }, [music, !!lesson, warden, phaseTwoMusic]);
  useEffect(() => {
    if (igniteStart === undefined) return;
    const since = performance.now() - igniteStart;
    const timers = IGNITE_MARKS.map(at =>
      window.setTimeout(() => setIgniteState(s => s && s.start === igniteStart ? { ...s, at } : s), Math.max(0, at - since)),
    );
    timers.push(window.setTimeout(() => {
      setIgniteState(null);
      setPlayback(pb => (pb && pb.phase === "ignite" ? { ...pb, phase: "impact" } : pb));
    }, IGNITE.end - since));
    return () => timers.forEach(t => window.clearTimeout(t));
  }, [igniteStart]);
  // Until the scene's state is set (an effect, a render late), it's already as good as started:
  // so his new form never shows for that one frame.
  const pendingWho = igniteState
    ? undefined
    : playback?.phase === "ignite"
      ? phaseTwoOf(playback.steps[playback.index])?.who
      : !playback
        ? fight.enemies.find(e => lookOfFoe(e)?.igniteScene && e.flags.phase2 && phaseTwoBefore.current[e.id] === false)?.id
        : undefined;
  const ignite = igniteState ?? (pendingWho ? { who: pendingWho, start: undefined, seed: 0 } : null);
  /** How far into the scene it is, as the last of IGNITE_MARKS reached (0 before it starts). */
  const igniteNow = igniteState ? igniteState.at : 0;

  // Usurp Flame's scene: its stages on a timer, then the step itself plays.
  useEffect(() => {
    if (!playback || playback.phase !== "usurp") return;
    const pb = playback;
    const timers = (Object.keys(USURP_STAGES) as (keyof typeof USURP_STAGES)[]).map(k =>
      window.setTimeout(() => {
        if (k === "done") { setUsurpStage(null); setPlayback({ ...pb, phase: "impact", leadIn: undefined }); }
        else setUsurpStage(k);
      }, USURP_STAGES[k] + (pb.index === 0 ? pb.leadIn ?? 0 : 0)),
    );
    return () => timers.forEach(t => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback?.index, playback?.phase, !!playback]);

  // When the turn being played started (for MIN_ATTACK_PHASE_MS). Never set for an opening scene, which isn't held.
  const turnStart = useRef(-Infinity);
  // A stagger costs you the turn: show it, then play it out on its own.
  const playForced = useEffectEvent(() => play({ type: "rest" }));
  useEffect(() => {
    if (!playing || !forced || busy || paused) return;
    const timer = window.setTimeout(playForced, FORCED_TURN_MS);
    return () => window.clearTimeout(timer);
  }, [playing, forced, busy, paused]);

  const skipBattle = () => {
    setPaused(false);
    setPlayback(null);
    setFight(f => ({ ...f, status: "won", enemies: f.enemies.map(e => ({ ...e, hp: 0, alive: false, fate: "fallen" as const })) }));
  };
  // Giving up a fight from the map: you fall as if you had lost it (the lesson can't be lost).
  const forfeit = () => { setPaused(false); onDone?.(false, fight.player.charges, fight.player.eternity, { earned: earned.current }); };
  const dev = useDev();
  // (The rest are the developer tools' (`ui/dev.ts`): on the map they only show while those are on. Test combat and the viewers are tools themselves.)
  const tools = dev || !onDone;
  const pauseOptions: MenuOption[] = [
    { label: "Resume", run: () => setPaused(false) },
    ...(onDone && !lesson ? [{ label: "Reawaken", run: forfeit }] : []),
    ...(tools ? [{ label: "Restart fight", run: onRetry }] : []),
    ...(tools && onChangeLoadout ? [{ label: changeLabel ?? "Change loadout", run: onChangeLoadout }] : []),
    ...(tools ? [{ label: exitLabel ?? "Main menu", run: onExit }] : []),
    // A shortcut for testing: win the fight on the spot (every enemy lies down).
    ...(tools && playing && playSignal === undefined ? [{ label: "Skip battle", quiet: true, run: skipBattle }] : []),
  ];
  const finish = () => {
    // Fallen for good: whose blow it was, so what you lost can be found on it.
    const defeat = fight.status === "lost" ? fight.lastTurn.flatMap(st => st.events).find(ev => ev.kind === "defeat") : undefined;
    onDone?.(fight.status === "won", fight.player.charges, fight.player.eternity, { earned: earned.current, killedBy: defeat?.kind === "defeat" ? defeat.by : undefined });
  };
  // A won fight on the map ends by itself: once the last String has wound round you (or, with none coming, after a moment), the scene fades out.
  // (E skips the wait.)
  const finished = useRef(false);
  const finishOnce = () => { if (finished.current) return; finished.current = true; finish(); };
  const finishRef = useRef(finishOnce);
  finishRef.current = finishOnce;
  const [fading, setFading] = useState(false);
  const leavesAlone = fight.status === "won" && !!onDone;
  const settled = leavesAlone && !busy && !waking && !paused;
  useEffect(() => {
    if (!settled || bursts.length > landedLots) return; // (the last String is still on its way)
    const wait = bursts.length ? 250 : 1000;
    const t1 = window.setTimeout(() => setFading(true), wait);
    const t2 = window.setTimeout(() => finishRef.current(), wait + 900);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [settled, bursts.length, landedLots]);

  /* ---------- the lesson's gate ---------- */
  const goalTarget: Selection | undefined = current?.goal
    ? current.goal.on === "player" ? { kind: "player" } : fight.enemies.find(e => e.alive) && { kind: "enemy", id: fight.enemies.find(e => e.alive)!.id }
    : undefined;
  const lessonStand = goalTarget && {
    onTarget: sameSel(sel, goalTarget),
    wheelOpen,
    highlight,
  };
  /** The next beat; after the last one, the lesson is over and the fight won. */
  const nextBeat = () => {
    if (lesson && beat + 1 >= lesson.length) setFight(f => ({ ...f, status: "won" }));
    setBeat(b => b + 1);
  };
  // Focused on the wrong one: the guide says so (and how to cancel), instead of the instruction.
  const detour = !!current?.goal && wheelOpen && !!lessonStand && !lessonStand.onTarget;
  useEffect(() => { setDetourN(0); }, [detour]);
  useEffect(() => {
    if (!detour || busy || paused || detourN >= DETOUR.say.length) return;
    const t = window.setTimeout(() => { speak(DETOUR.say[detourN], detourN); setDetourN(n => n + 1); }, typeDelay(DETOUR.say, detourN));
    return () => window.clearTimeout(t);
  }, [detour, detourN, busy, paused]);
  // Each beat's words are written out from the start, once the last turn has played out.
  useEffect(() => {
    if (!current || busy || paused || written >= current.say.length) return;
    const t = window.setTimeout(() => { speak(current.say[written], written); setWritten(w => w + 1); }, typeDelay(current.say, written));
    return () => window.clearTimeout(t);
  }, [current, written, busy, paused]);
  // Undo the step the previous beat asked for (move away, close the wheel, light another option): its instruction is back.
  useEffect(() => {
    if (!lesson || !current || busy || beat === 0) return;
    const prev = lesson[beat - 1];
    if (!prev.goal || prev.goal.until === "commit") return;
    const target: Selection | undefined = prev.goal.on === "player" ? { kind: "player" } : fight.enemies.some(e => e.alive) ? { kind: "enemy", id: fight.enemies.find(e => e.alive)!.id } : undefined;
    if (!target || lessonMet(prev.goal, { onTarget: sameSel(sel, target), wheelOpen, highlight })) return;
    setTyped({ beat: beat - 1, n: prev.say.length });
    setBeat(beat - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beat, busy, selection, wheelOpen, highlight]);
  // A beat that only asks you to get somewhere (select, focus, light an option) is done on arrival.
  useEffect(() => {
    if (!current?.goal || busy || typing || !lessonStand) return;
    if (current.goal.until !== "commit" && lessonMet(current.goal, lessonStand)) nextBeat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beat, busy, typing, selection, wheelOpen, highlight]);

  useKeys(key => {
    // Escape pauses at any time; the pause menu takes all input until it closes.
    if (paused) {
      menuSound(key);
      if (key === "pause" || key === "back") setPaused(false);
      else if (key === "up" || key === "down") setPauseIndex(i => wrapIndex(i, key === "up" ? -1 : 1, pauseOptions.length));
      else if (key === "select") pauseOptions[pauseIndex].run();
      return;
    }
    if (key === "pause" && playing) {
      setPaused(true);
      setPauseIndex(0);
      return;
    }
    if (busy || waking) return; // input waits for the turn to finish playing (or for the guide to arrive)
    if (!playing) {
      if (onDone) { if (key === "select" || key === "back" || key === "pause") { menuSound(key); finishOnce(); } }
      else if (key === "select") onRetry();
      else if (key === "back" || key === "pause") onExit();
      return;
    }
    if (forced) return; // the turn plays itself
    if (playSignal !== undefined) return; // the model viewer: its panel plays the turns
    if (current) {
      // The lesson: while its words are being written only E does anything (it finishes them);
      // then only the key it asks for works (or E, to go on, when there is nothing to do).
      if (detour && detourN < DETOUR.say.length) { if (key === "select") setDetourN(DETOUR.say.length); return; }
      if (!detour && typing) { if (key === "select") setWritten(current.say.length); return; }
      if (!current.goal) { if (key === "select") nextBeat(); return; }
      if (!lessonStand || !lessonAllows(current.goal, key, lessonStand)) return;
    }
    if (!wheelOpen) {
      if (key === "select") { menuSound(key); openWheel(sel); }
      else if (key !== "back" && key !== "pause") moveCursor(key);
      return;
    }
    if (key === "back") closeWheel();
    else if (key === "select") { if (chosen) menuSound(key); commit(chosen); }
    else if (key !== "pause" && wheel[key]) { if (key !== highlight) menuSound(key); setHighlight(key); }
  });

  /* ---------- what the screen shows ---------- */
  /**
   * During playback: a fighter shows its telegraph until its own attack, the strike frame on the
   * step its attack lands, and a neutral stance after. Anyone staggered goes down (player kneels,
   * enemies fall to the ground).
   */
  const turnSteps = playback?.steps;
  const turnIx = useMemo(() => (turnSteps ? indexTurn(turnSteps) : null), [turnSteps]);
  const stepOf = (m: "strike" | "rest" | "fall" | "raised" | "dodge" | "maneuver" | "usurp" | "backUp" | "revived" | "phaseTwoBy", id: string) => turnIx?.[m].get(id) ?? -1;
  /** This turn's step `i` has played: it's behind us, or it's showing and its blow has landed. */
  const reached = (i: number) => !!playback && i >= 0 && (playback.index > i || (playback.index === i && impact));

  // The step where you rise again with a revive (if this turn has one): it waits for the red string, which comes out of the numeral, winds round
  // your remains, and only then do you rise.
  const youRiseAt = playback && !lesson ? stepOf("revived", "player") : -1;
  const waitingForString = !!playback && youRiseAt >= 0 && playback.index === youRiseAt && playback.phase === "approach" && !reviveCoiled;
  // Advance the playback one step at a time.
  useEffect(() => {
    if (!playback || paused || playback.phase === "usurp" || playback.phase === "ignite") return;
    // Someone's Rest goes through this turn (its animation sets how long the last step lasts).
    const resting = !!turnIx && playback.from.enemies.some(e => turnIx.rest.has(e.id));
    // (Waiting for the string: the effect below sends it, and this runs again once it has wound round you.)
    if (waitingForString) return;
    const risesNow = youRiseAt >= 0 && playback.index === youRiseAt && playback.phase === "approach";
    const timer = window.setTimeout(
      () => {
        const pb = playback;
        if (pb.phase === "approach") {
          if (risesNow) { reviveSent.current = false; setReviveCoiled(false); }
          return setPlayback({ ...pb, phase: "impact" });
        }
        const index = pb.index + 1;
        if (index < pb.steps.length) return setPlayback({ ...pb, index, phase: phaseAt(pb.steps, index, performance.now() - turnStart.current) });
        // Anyone who dodged is still walking to their new spot: they keep their pose until there.
        const walking = lastDodgers.current;
        if (Object.keys(walking).length) setWalkOff(walking);
        onTurnPlayed?.(fightRaw); // same render as the playback ending, so nothing flickers
        setPlayback(null);
      },
      // An attacker closes in; the first step after the attacks holds until the attack phase has lasted
      // MIN_ATTACK_PHASE_MS. The last step stays long enough for a Rest's animation, if one goes through.
      playback.phase === "approach"
        ? risesNow ? 250 : isAttackStep(step) ? APPROACH_MS : Math.max(0, MIN_ATTACK_PHASE_MS - (performance.now() - turnStart.current))
        : playback.index === playback.steps.length - 1 && resting
          ? Math.max(STEP_MS, REST_ANIM_MS)
          : STEP_MS,
    );
    return () => window.clearTimeout(timer);
  }, [playback, paused, waitingForString]);

  /**
   * A fighter's bars while it rises again with a revive: they stay as they were when it fell until the rise is over (for the Warden, until his
   * phase-two scene has played), and only then fill. (The figure itself rises at once; see `looksDead`.)
   */
  const barsOf = <F extends Player | Enemy>(f: F): F => {
    if (!playback) return f;
    const rises = stepOf("revived", f.id);
    if (rises < 0) return f;
    const p2 = stepOf("phaseTwoBy", f.id);
    const over = p2 > rises ? playback.index > p2 || (playback.index === p2 && playback.phase === "impact") : playback.index > rises;
    if (over) return f;
    const before = rises > 0 ? viewAt(playback.from, playback.steps[rises - 1].after) : playback.from;
    const was = f.id === "player" ? before.player : before.enemies.find(x => x.id === f.id);
    return was ? { ...f, hp: was.hp, fatigue: was.fatigue, death: was.death, staggered: was.staggered } : f;
  };

  // The red string of the revive knot: sent from the numeral once you lie down, to wind round your remains (then you rise: see above).
  useEffect(() => {
    if (!waitingForString || paused || reviveSent.current) return;
    const send = window.setTimeout(() => {
      reviveSent.current = true;
      setBursts(b => [...b, { id: ++burstIds.current, from: ".revive-count", amount: 0, revive: true }]);
      playSfx("string");
    }, FORCED_TURN_MS);
    return () => window.clearTimeout(send);
  }, [waitingForString, paused]);

  /** The step where someone's attack lands, or -1. */
  const strikeStep = (id: string) => stepOf("strike", id);
  // A Rest's own pose only lasts a moment; then it already settles into its next stance.
  const [restOver, setRestOver] = useState<string | null>(null);
  useEffect(() => {
    if (!playback) return;
    const t = window.setTimeout(() => setRestOver(stepKey), REST_POSE_MS);
    return () => window.clearTimeout(t);
  }, [stepKey]);
  // The approach (step key) in which a target has started to dodge.
  const [dodgeStarted, setDodgeStarted] = useState<string | null>(null);
  // Who has dodged this turn, and the way they went.
  const [dodging, setDodging] = useState<Record<string, { dir: Vec; retreat: boolean }>>({});
  // A Rest's own animation (its pose) starts the moment it goes through and lasts REST_ANIM_MS.
  const [restPoseOver, setRestPoseOver] = useState<string | null>(null);
  useEffect(() => {
    if (!playback) return;
    const t = window.setTimeout(() => setRestPoseOver(stepKey), REST_ANIM_MS);
    return () => window.clearTimeout(t);
  }, [stepKey]);
  /** The step where someone's Rest actually happened (not cut short), or -1. */
  const restStep = (id: string) => stepOf("rest", id);
  /** Who is Maneuvering this turn (and in what pose), so they keep it while they walk off after it. */
  const dodgers: Record<string, PoseName> = {};
  const lastDodgers = useRef(dodgers);
  useEffect(() => { lastDodgers.current = dodgers; });
  const [walkOff, setWalkOff] = useState<Record<string, PoseName> | null>(null);
  useEffect(() => {
    if (!walkOff) return;
    const t = window.setTimeout(() => setWalkOff(null), NUDGE_MS);
    return () => window.clearTimeout(t);
  }, [walkOff]);
  useEffect(() => {
    if (!playback && !walkOff) setDodging(prev => (Object.keys(prev).length ? {} : prev));
  }, [playback, walkOff]);
  const track = (id: string, pose: PoseName): PoseName => {
    if (playback && maneuvering(id) && dodgedBefore(id)) dodgers[id] = pose;
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
  const dodgedBefore = (id: string) => {
    const i = stepOf("dodge", id);
    // A dodge of an attack starts late in the attacker's approach, before the blow lands.
    return reached(i) || (!!playback && i >= 0 && playback.index === i && isAttackStep(playback.steps[i]) && dodgeStarted === stepKey);
  };
  /** The steps where someone is attacked (whether it lands, is blocked or dodged). */
  const targetedSteps = (id: string) => turnIx?.targeted.get(id) ?? [];
  interface Poses {
    telegraph: PoseName; down: PoseName; windUp: PoseName; strike: PoseName; idle: PoseName; rested?: PoseName;
    /** A Rest's windup pose, shown first when the Rest is the turn's first step. */
    windup?: PoseName;
    /** The strike pose hands off to the next stance a moment in (REST_POSE_MS), its trails still fading. */
    strikeHandsOff?: boolean;
    /** The pose it hands off to, if not `idle`. */
    handOff?: PoseName;
    /** A Block or Maneuver: hold this pose, and only take `react` (the block, the dodge) as an attack on them lands. */
    guard?: { hold: PoseName; react: PoseName; keepAfterDodge?: boolean };
  }
  const playbackPose = (id: string, staggered: boolean, poses: Poses): PoseName => {
    if (!playback) return poses.telegraph;
    const struck = strikeStep(id);
    // Wind up while closing in, then strike. A strike that spins on into the next stance (its
    // trails carrying on) takes that stance a moment in, like a Rest's own pose does.
    if (struck === playback.index) return impact ? (poses.strikeHandsOff && restOver === stepKey ? poses.handOff ?? poses.idle : poses.strike) : poses.windUp;
    if (staggered) return poses.down;
    if (struck >= 0 && struck < playback.index) return poses.idle;
    if (poses.guard) {
      const hits = targetedSteps(id);
      // A Maneuver only takes its pose when it gets out of the way (a dodge) or actually moves;
      // from then on it keeps it to the end of the turn, walking off to its new spot in it too.
      // Hit while it holds its stance, it just keeps holding it.
      if (poses.guard.keepAfterDodge) {
        // One that already dodged an attack this turn settles into its next stance as the repositioning step (its
        // Maneuver) starts, whether or not it changes line, and walks to its new spot in that. One that didn't
        // takes the Maneuver's pose from there instead.
        const repositioning = stepOf("maneuver", id);
        const dodged = stepOf("dodge", id);
        if (repositioning >= 0 && dodged >= 0 && dodged < repositioning && playback.index >= repositioning) return poses.idle;
        return dodgedBefore(id) ? poses.guard.react : poses.guard.hold;
      }
      if (hits.includes(playback.index)) return impact ? poses.guard.react : poses.guard.hold;
      return hits.length && hits[0] < playback.index ? poses.idle : poses.guard.hold;
    }
    // A Rest that went through shows its own pose from the moment it happens, briefly.
    const rested = restStep(id);
    if (poses.rested && reached(rested)) {
      return playback.index === rested && restPoseOver !== stepKey ? poses.rested : poses.idle;
    }
    return poses.telegraph;
  };
  const punching = p.weapon === "baseline";
  /** Your forced Rest (or revive) has landed this turn: you're back on your feet. */
  const playerBackUp = reached(stepOf("backUp", "player"));
  // You hold your stance (see core/stance.ts) between turns, whatever you hover; each action takes you out of it and, as it ends, into the next.
  const stancePose = (st: Stance): PoseName => (st === "low" ? "low" : st === "lead-left" ? "low-left" : st === "lead-right" ? "low-right" : "idle");
  const startStance = playback ? playback.from.player.stance : fight.player.stance;
  /** How your attack swings this turn (it is on your attack event), and the poses it winds up in and lands in. */
  const swingOf: Swing = playback
    ? (playback.steps.flatMap(st => st.events).find(ev => ev.kind === "attack" && ev.attacker === "player") as { swing?: Swing } | undefined)?.swing ?? "overhead"
    : "overhead";
  const swingPoses: Record<Swing, { windUp: PoseName; strike: PoseName }> = {
    overhead: { windUp: "attack", strike: punching ? "punch" : "strike" },
    // A sideways swing uses the two lowered stances and nothing else: a swing to the right winds up with the right leg leading and lands with the left,
    // a swing to the left the other way round.
    right: { windUp: "low-right", strike: "low-left" },
    left: { windUp: "low-left", strike: "low-right" },
  };
  // In 3D (the player always is, in a fight) a sideways swing has its own wind-up and landing, from the one stance into the other.
  if (PLAYER_3D) {
    swingPoses.right = { windUp: "swing-right-up", strike: "swing-right" };
    swingPoses.left = { windUp: "swing-left-up", strike: "swing-left" };
  }
  const forcedTurn = playback?.playerPose === "kneel";
  const playerPose: PoseName = !playback && walkOff?.player ? walkOff.player : playback
    ? playbackPose("player", p.staggered, {
        // A forced turn kneels until the Rest (or revive) brings you back; then you're up. A Rest breathes in from the start of the turn.
        telegraph: forcedTurn ? (playerBackUp ? "idle" : "kneel") : playback.action?.type === "rest" ? "rest-in" : stancePose(startStance),
        down: "kneel", windUp: swingPoses[swingOf].windUp, strike: swingPoses[swingOf].strike, idle: stancePose(fight.player.stance),
        // A Rest's pose, as it goes through: the breath out.
        rested: playback.action?.type === "rest" ? "rest" : undefined,
        // A Block or a Maneuver holds your stance, and only takes its pose as the blow lands: blocking, or dodging forward (a Maneuver at an enemy) or back.
        guard: playback.action?.type === "block" || playback.action?.type === "maneuver"
          ? { hold: stancePose(startStance), react: playback.action.type === "block" ? "block" : playback.action.target === "self" ? "dodge-back" : "dodge-fwd", keepAfterDodge: playback.action.type === "maneuver" }
          : undefined,
      })
    : forced ? "kneel" : playerHold ?? stancePose(fight.player.stance);
  // While you plan, an enemy only shows its stance; as the turn plays, its action shows.
  // After its attack, an enemy already settles into the stance it takes next (if it's still up).
  /** Still on its feet once the turn is over (not staggered, fallen or reviving). */
  const standingAfter = (e: Enemy) => {
    // As the turn ended (its last step), not the fight now: the viewer resets it once played.
    const end = playback?.steps[playback.steps.length - 1]?.after[e.id];
    if (end && (end.staggered || !end.alive || end.hp <= 0)) return false;
    const now = fight.enemies.find(x => x.id === e.id);
    return !!now && now.alive && !now.staggered && !now.intent.forced;
  };
  const settledPose = (e: Enemy): PoseName => {
    const now = fight.enemies.find(x => x.id === e.id);
    return now && standingAfter(e) ? poseForIntent(now) : idlePoseOf(e);
  };
  // An enemy that's going to Rest winds up from the start of the turn (its Rest's windup pose, if it has one, else
  // it holds its stance) until the Rest actually happens.
  const restTelegraph = (e: Enemy): PoseName => {
    if (!playback || e.intent.type !== "rest" || e.intent.forced || e.staggered) return actionPose(e);
    const at = restStep(e.id);
    if (reached(at)) return actionPose(e);
    return e.intent.windupPose ? asPose(e.intent.windupPose, "rest") : poseForIntent(e);
  };
  /** Its strike pose spins on into its next stance (Flail Swing): it hands off partway through. */
  const handsOff = (e: Enemy) => !!handOffOf(e.intent.strikePose);
  /** Its strike has just handed off to its next stance (still this step). */
  const strikeJustOver = (e: Enemy) =>
    !!playback && impact && handsOff(e) && strikeStep(e.id) === playback.index && restOver === stepKey;
  /** Its Rest's own pose has just given way to its next stance (still this step). */
  const restJustOver = (e: Enemy) =>
    !!playback && !!e.intent.restPose && restStep(e.id) === playback.index && restPoseOver === stepKey;
  /**
   * The Warden's flags as shown. Once a Rest has gone through, his attack has landed and he has
   * moved on to his next stance, or he has taken a flame, they already show what that did (Flame
   * Blast puts his flame out).
   */
  const shownFlags = (e: Enemy) => {
    const rest = restStep(e.id);
    const rested = !!playback && rest >= 0 && playback.index >= rest && (rest < playback.index || restPoseOver === stepKey);
    const struck = strikeStep(e.id);
    // (A strike that leaves him staggered plays out with the look he had; it only changes as he drops.)
    const attacked = !!playback && struck >= 0 && (playback.index > struck || (playback.index === struck && impact && handsOff(e) && restOver === stepKey && standingAfter(e)));
    const usurped = flameTaken(e);
    // Until his phase-two scene plays, he keeps the look he started the turn with: whatever the turn
    // went on to do, his new form only shows once the scene reveals it.
    const p2 = turnIx?.phaseTwo ?? -1;
    if (p2 >= 0 && !reached(p2)) return e.flags;
    // Once it has played, he's in his new form for good.
    if (phaseTwoDone(e)) return fight.enemies.find(x => x.id === e.id)?.flags ?? e.flags;
    return ((rested || attacked || usurped) && fight.enemies.find(x => x.id === e.id)?.flags) || e.flags;
  };
  const candleArmOf = (e: Enemy): CandleArm => {
    // The phase-two scene: no flame of his own until it flares, then his arm burns for good.
    // (Until all is dark, he still looks as he did; then no flame until it flares.)
    if (ignite && ignite.who === e.id) return igniteNow >= IGNITE.flare ? "scorched" : "out";
    // Having taken a flame and the light is coming back.
    const usurped = flameTaken(e);
    const f = shownFlags(e);
    // Having taken a flame, his candle burns again, whatever else the turn did.
    if (usurped) return f.phase2 ? "scorched" : "lit";
    // Staggered (shown down), his flame is out (before phase two).
    const striking = !!playback && strikeStep(e.id) === playback.index;
    if (((e.staggered && !striking) || enemyPose(e) === downPoseOf(e)) && !f.phase2) return "out";
    return f.phase2 ? "scorched" : f.sealed ? "out" : "lit";
  };
  /** The step where this enemy took a flame (Usurp Flame), or -1. */
  const usurpStep = (id: string) => stepOf("usurp", id);
  /** It has taken a flame this turn, and the light is coming back (or has). */
  const flameTaken = (e: Enemy) => {
    const u = usurpStep(e.id);
    return !!playback && u >= 0 && (playback.index > u || (playback.index === u && (impact || usurpStage === "reveal")));
  };
  /** When each Warden's flame was last put out (lit → out), while its smoke still shows. */
  const [smoke, setSmoke] = useState<Record<string, number>>({});
  /** Each Warden's candle arm as shown now (filled in as the figures are laid out below). */
  const arms: Record<string, CandleArm> = {};
  const armsBefore = useRef<Record<string, CandleArm>>({});
  // Each puff clears a second after it started.
  useEffect(() => {
    const times = Object.values(smoke);
    if (!times.length) return;
    const oldest = Math.min(...times);
    const t = window.setTimeout(() => setSmoke(prev => Object.fromEntries(Object.entries(prev).filter(([, at]) => at !== oldest))), oldest + 1000 - performance.now());
    return () => window.clearTimeout(t);
  }, [smoke]);
  /** The step where a blow breaks someone's Rest (they flinch, to the end of the turn), or -1. */
  const flinchStep = (e: Enemy) => {
    if (!turnIx || e.intent.type !== "rest" || e.intent.forced || !turnIx.interrupted.has(e.id)) return -1;
    // (A shockwave from an ally hurts it too; and a part of a body hurt through another flinches as its Rest is broken.)
    return turnIx.hit.get(e.id) ?? turnIx.broken.get(e.id) ?? -1;
  };
  /** His phase-two scene has played this turn (he entered it, and the scene is over). */
  const phaseTwoDone = (e: Enemy) => reached(stepOf("phaseTwoBy", e.id));
  /** Each enemy's pose, worked out once per render. */
  const posesNow = new Map<string, PoseName>();
  const enemyPose = (e: Enemy): PoseName => {
    if (!posesNow.has(e.id)) posesNow.set(e.id, poseOfEnemy(e));
    return posesNow.get(e.id)!;
  };
  const poseOfEnemy = (e: Enemy): PoseName => {
    // One that has died (not one taken by a flame) falls in its down pose, the same as when it is staggered.
    if (!e.alive && (e.fate ?? "fallen") === "fallen") return downPoseOf(e);
    // An action it dies doing (Flame Immolation): once its strike has landed it lies in that pose, its death pose, whatever else the turn
    // does to it (staggered by a blow, say), until it is taken off the field as the turn ends.
    if (e.intent.action && !e.intent.forced && kindOf(e).fatalActions?.includes(e.intent.action) && reached(strikeStep(e.id))) return strikePose(e);
    // After his phase-two scene, he's already standing in his next stance (Idle).
    if (phaseTwoDone(e) && !ignite) return settledPose(e);
    // The phase-two scene: he stands in Idle, unseen in the dark until his flare.
    // While the light fades he's still down; once all is dark he's already standing in Idle.
    if (ignite && ignite.who === e.id) return igniteNow >= IGNITE.kindle ? "wd-idle" : downPoseOf(e);
    // A Rest broken by a blow: it flinches as the blow lands, and stays flinching.
    if (!e.staggered && reached(flinchStep(e))) return flinchPoseOf(e);
    // Usurp Flame: crouched to spring, the dash, then standing in Idle as the light returns.
    const u = usurpStep(e.id);
    if (playback && u >= 0 && playback.index >= u) {
      if (playback.index === u && playback.phase === "usurp") {
        // (Before it starts, as an opening scene's arena shows, he just stands in his stance.)
        if (!usurpStage) return poseForIntent(e);
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
      // A Block winds up from the start of the turn (its windup pose, if it has one, else its stance) and only takes
      // its blocking pose as the blow lands.
      guard: guarding ? { hold: e.intent.type === "block" && e.intent.windupPose ? asPose(e.intent.windupPose, "block") : poseForIntent(e), react: e.intent.guardPose ? asPose(e.intent.guardPose, "block") : actionPose(e), keepAfterDodge: e.intent.type === "maneuver" } : undefined,
      telegraph: playback ? restTelegraph(e) : poseForIntent(e),
      // Some (the Warden) attack straight out of whatever stance they're in.
      // (An action it dies doing leaves it lying in its strike pose, its death pose, until it is taken off the field as the turn ends.)
      down: downPoseOf(e), windUp: kindOf(e).attacksFromStance && e.intent.stance ? poseForIntent(e) : windUpPose(e), strike: strikePose(e),
      idle: e.intent.action && kindOf(e).fatalActions?.includes(e.intent.action) ? strikePose(e) : settledPose(e),
      strikeHandsOff: handsOff(e),
      // Its strike always plays out in full: if it ends up staggered (or down), it still spins on
      // into the pose its strike ends in, and only drops once the step is over.
      handOff: handsOff(e) && !standingAfter(e) ? handOffOf(e.intent.strikePose) : undefined,
      rested: e.intent.restPose ? asPose(e.intent.restPose, "rest") : undefined,
      windup: e.intent.type === "rest" && !e.intent.forced && e.intent.windupPose ? asPose(e.intent.windupPose, "rest") : undefined,
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
  const usurpTrails: { from: string; to: string; key: string }[] = [];
  if (usurpNow && usurpStage === "reveal") usurpTrails.push({ from: usurpNow.target, to: usurpNow.who, key: `${stepKey}-usurp` });
  // A lit waxed dying as the turn ends: its flame streams into the Warden's hand.
  if (impact && step) {
    for (const ev of step.events) {
      if (ev.kind === "drained") usurpTrails.push({ from: ev.who, to: ev.by, key: `${stepKey}-drained-${ev.who}` });
      // Staggered in phase two, the Warden sends a flame to a fallen waxed, and it rises.
      else if (ev.kind === "raised" && ev.by) usurpTrails.push({ from: ev.by, to: ev.who, key: `${stepKey}-raised-${ev.who}` });
    }
  }

  // Ranged attacks throw something across the field as they land.
  const projectiles: Projectile[] = [];
  let flames = 0;
  if (playback && impact && step) {
    for (const ev of step.events) {
      // A fire attack that lands (a fan of flames, a blast, a burning flail, a shockwave) sets its target alight for a moment.
      if ((ev.kind === "attack" && ev.fire && ev.result === "hit") || ev.kind === "burned" || ev.kind === "splash") {
        const to = ev.kind === "burned" ? ev.who : ev.target;
        projectiles.push({ from: to, to, kind: "flamehit", key: `${stepKey}-${to}-flamehit${flames++}` });
      }
      if (ev.kind === "eternal" && ev.attacker === "player") {
        // A halo where the effect took hold: where the blow met a Block, where it hit, or on the one who used it (Fatigue saved).
        const blocked = step.events.some(x => x.kind === "attack" && x.attacker === ev.attacker && x.target === ev.target && x.result === "blocked" && !x.ranged);
        const self = ev.effect === "shortsword";
        projectiles.push({ from: self ? ev.attacker : ev.target, to: self ? ev.attacker : ev.attacker, kind: ev.death > 0 ? "eternityDeath" : "eternity", where: self ? "self" : blocked ? "block" : "hit", key: `${stepKey}-${ev.attacker}-eternal${flames++}` });
      }
      if (ev.kind !== "attack") continue;
      // A melee blow that was blocked clangs back at its attacker (a ranged one sends nothing back).
      if (ev.result === "blocked" && !ev.ranged) {
        projectiles.push({ from: ev.target, to: ev.attacker, kind: "clang", key: `${stepKey}-${ev.attacker}-clang` });
      }
      const thrower = playback.from.enemies.find(e => e.id === ev.attacker);
      const kind = thrower?.intent.projectile;
      // Melee attacks throw nothing, but some leave a shockwave where they land.
      if (!ev.ranged && kind !== "impact") continue;
      // A blast or a blow into the floor starts where its landing pose puts it: a fist, or the
      // head of a flail brought down on the floor.
      // (The guide's halo grows from its orb as it is thrown out, in the figure's units.)
      const origin = kind === "blast" || kind === "impact" ? impactPoint(thrower?.intent.strikePose) : kind === "halo" ? ([66, 86] as const) : undefined;
      // A flaming flail's slam burns.
      const fiery = kind === "impact" && !!thrower?.flags.flaming;
      const fromPose = kind === "burst" && thrower ? windUpPose(thrower) : undefined;
      if (kind) projectiles.push({ from: ev.attacker, to: ev.target, kind, origin, fiery, fromPose, key: `${stepKey}-${ev.attacker}` });
    }
  }

  // Everyone on the field: you, enemies still standing, and any falling during this step.
  // Once his flame has broken free, the arena's candles (and the waxed remains) burn for good.
  const phaseTwoStep = turnIx?.phaseTwo ?? -1;
  const arenaLit = ignite
    ? igniteNow >= IGNITE.flare
    : (playback
      ? phaseTwoStep >= 0
        ? reached(phaseTwoStep)
        : playback.from.enemies.some(e => kindOf(e).arena && e.flags.phase2)
      : fight.enemies.some(e => kindOf(e).arena && e.flags.phase2));
  /**
   * Its remains lie where it fell, instead of the figure: it has fallen for good (this turn, once the
   * blow has landed, or in an earlier one), or it fell with a revive left and lies there until it rises.
   */
  /** Its fall has shown: once the blow that drops it has landed. */
  const fellBy = (id: string): boolean => {
    const fall = stepOf("fall", id);
    return fall >= 0 && reached(fall);
  };
  /** It has just lain down, in the beat showing now: its remains drop (see `.fx-die`). */
  const justFell = (id: string): boolean => {
    const fall = stepOf("fall", id);
    return !!playback && fall >= 0 && playback.index === fall;
  };
  const looksDead = (e: Enemy): boolean => {
    // Sealed in wax by the Warden (its flame taken), or because it died lit: its remains from that step on.
    if (!e.alive && e.fate === "encased") return true;
    if (!playback) return e.alive ? e.reviving : true;
    const was = playback.from.enemies.find(x => x.id === e.id);
    if (was && !was.alive) {
      // A fallen waxed rises when it is raised: with the fire shockwave of phase two, or as its step plays.
      const raised = stepOf("raised", e.id);
      if (raised < 0) return true;
      return raised === (turnIx?.phaseTwo ?? -1) ? !arenaLit : !reached(raised);
    }
    // It fell this turn and rises again at the turn's end (a boss with a revive left).
    const rises = stepOf("revived", e.id);
    if (rises >= 0 && stepOf("fall", e.id) >= 0) {
      if (!reached(stepOf("fall", e.id))) return false;
      // The Warden lies where he fell until he rises in the dark of his phase-two scene, with the light still fading out.
      const p2 = stepOf("phaseTwoBy", e.id);
      if (p2 >= 0) {
        if (playback.index !== p2) return playback.index < p2;
        return ignite && ignite.who === e.id ? igniteNow < IGNITE.kindle : playback.phase === "ignite";
      }
      return !reached(rises);
    }
    return reached(stepOf("fall", e.id));
  };
  /**
   * Your remains lie where you fell instead of you: you fell this turn (once the blow has landed), you are
   * down for good, or you fell with a charge left and lie there until you rise again (at the end of that turn).
   */
  const playerLooksDead = (): boolean => {
    if (playerDead) return true;
    if (!playback) return fight.status === "lost";
    // Fallen this turn with a revive: you lie there until you rise, at the turn's end.
    const rises = stepOf("revived", "player");
    if (rises >= 0) return fellBy("player") && !reached(rises);
    return fellBy("player");
  };
  const youDead = playerLooksDead();
  // Once the Warden has fallen for good (as his fall plays, with no revive left, or after), every flame he lit dies out:
  // the waxed's candles and the arena's.
  const wardenHere = (playback ? playback.from : fight).enemies.find(e => kindOf(e).arena);
  const wardenDown = !!wardenHere && (playback
    ? !wardenHere.alive || (wardenHere.revives === 0 && reached(stepOf("fall", wardenHere.id)))
    : !wardenHere.alive);
  const candlesLit = arenaLit && !wardenDown;
  const playerSealed = (p.waxed || !!p.encased) && p.staggered;
  /**
   * The dodge a figure faces along (or, backing off, away from) in the scene: from the moment it dodges until its repositioning starts,
   * the step where it walks to its new spot (the pose changes then too). After that, and outside a turn, it faces you again.
   */
  const dodgeFor = (id: string) => {
    const d = dodging[id];
    if (!d || !playback) return undefined;
    const repositioning = stepOf("maneuver", id);
    return repositioning >= 0 && playback.index >= repositioning ? undefined : d;
  };
  /**
   * A lit waxed's flame on its head, as shown: blazing in the poses where it gathers it to burst (its kind's `blazePoses`), and gone once it
   * has burst (its death pose) or while the Warden's Usurp Flame scene draws it itself.
   */
  const headFlameOf = (e: Enemy): SceneFigure["headFlame"] => {
    const k = kindOf(e);
    if (!e.alive || looksDead(e) || !k.flame || !shownFlags(e).lit || usurpNow?.target === e.id) return undefined;
    const pose = enemyPose(e);
    if (pose === k.deathPose) return undefined;
    return k.blazePoses?.includes(pose) ? "blaze" : "lit";
  };
  /** An enemy's blow being played, if it has one in the step now: at whom, and which blow (for `SceneFigure.faceToward`). */
  const enemyBlow = (id: string) => {
    const ev = playback?.steps[playback.index]?.events.find((x): x is Extract<typeof x, { kind: "attack" }> => x.kind === "attack" && x.attacker === id);
    return ev && playback ? { id: ev.target, key: `${playback.from.turn}:${playback.index}:${id}` } : undefined;
  };
  /** Your own blow being played, if one is: whom it strikes (you face them, as you began, for all of it). */
  const yourBlow = playback?.steps[playback.index]?.events.find((ev): ev is Extract<typeof ev, { kind: "attack" }> => ev.kind === "attack" && ev.attacker === "player");
  const figures: SceneFigure[] = [
    {
      id: "player",
      dodge: dodgeFor("player"),
      faceToward: playback && yourBlow ? { id: yourBlow.target, key: `${playback.from.turn}:${playback.index}` } : undefined,
      view: "back",
      // Staggered while Waxed (or with your flame taken), you are sealed whole in wax, and stay that way until you recover:
      // your own stagger pose (down on one knee), the wax over all of it. No flame burns on your head, except while the Warden
      // is about to take it (his Usurp Flame scene lights it itself).
      pose: track("player", PLAYER_3D ? player3dPose(playerPose) : playerPose),
      player3d: PLAYER_3D,
      dead: youDead ? "pieces" : undefined,
      encased: playerSealed,
      // Waxed (or waxed by a torch, which is only a look) but still standing: wax caked on you.
      waxCaked: (p.waxed || !!p.coated) && !p.staggered,
      // Your weapon flashes as its eternal effect takes hold (dark red, if it was paid in Death).
      eternalFlash: auraOf("player"),
      weapon: p.weapon,
      armor: p.armor,
      weaponItem: p.weaponItem,
      armorItem: p.armorItem,
      headItem: p.headItem,
      // A sideways swing's level arc, as the blow lands (the poses are the two stances, which have no trail of their own).
      trail: playback && impact && swingOf !== "overhead" && !punching && strikeStep("player") === playback.index ? 235 : undefined,
      // Fallen, you drop and stay there, a little faded (instead of fading out).
      classes: youDead
        ? [...(fx.get("player")?.classes ?? []).filter(c => c !== "fx-fall"), ...(justFell("player") ? ["fx-die"] : []), "is-remains"]
        : (fx.get("player")?.classes ?? []).filter(c => c !== "fx-fall"),
      stepKey,
      selected: !busy && sel.kind === "player",
      disabled: busy || !playing || forced !== null,
      label: "Select yourself",
      onPick: () => { if (playSignal === undefined) openWheel({ kind: "player" }); },
    },
    ...view.enemies
      // Some (the waxed) stay where they fell, faded, for the rest of the fight.
      .filter(e => e.alive || fx.get(e.id)?.classes.includes("fx-fall") || kindOf(e).remains || looksDead(e))
      .map((e): SceneFigure => ({
        id: e.id,
        dodge: dodgeFor(e.id),
        view: "front",
        foe: true,
        hand: kindOf(e).weaponHand,
        pose: looksDead(e) && kindOf(e).deathLook === "wax" ? asPose(kindOf(e).deathPose, "w-idle") : !playback && walkOff?.[e.id] ? walkOff[e.id] : track(e.id, enemyPose(e)),
        weapon: e.weapon,
        armor: e.armor,
        variant: kindOf(e).variant,
        hooded: !!kindOf(e).hood,
        sleepwalker3d: kindOf(e).figure3d === "sleepwalker",
        // (the Warden's 3D figure is still being built: only the Model viewer, which rewrites the fight with `override`, shows it; the game draws the flat sprites)
        warden3d: kindOf(e).figure3d === "warden" && (WARDEN_3D_IN_GAME || !!override),
        // Waxed by a torch (a look only), still standing: wax caked on it.
        waxCaked: !!e.coated && !e.staggered && !kindOf(e).variant,
        // The outer parts of a Wax Blob stand a little smaller than the middle one.
        scale: (kindOf(e).scale ?? 1) * (e.part === "left" || e.part === "right" ? 0.85 : 1),
        body: e.body,
        part: e.part,
        flame: !!kindOf(e).flame,
        headFlame: headFlameOf(e),
        arm: lookOfFoe(e)?.candleArm ? (arms[e.id] = candleArmOf(e)) : undefined,
        // Phase two's look (black wax, burning inside) from the moment all is dark.
        phase2Look: !!ignite && ignite.who === e.id && igniteNow >= IGNITE.kindle,
        flailFire: !!lookOfFoe(e)?.candleArm && !!shownFlags(e).flaming,
        // Its rest pose just gave way to its next stance: that pose's trails keep fading meanwhile.
        lingerFrom: restJustOver(e) ? (e.intent.restPose as WardenPoseName) : strikeJustOver(e) ? (e.intent.strikePose as WardenPoseName) : undefined,
        smokeSince: smoke[e.id],
        eternalFlash: auraOf(e.id),
        // Its own blow being played (at you): it faces you as it began, for all of it, whatever you do (dodge past or back off).
        faceToward: playback ? enemyBlow(e.id) : undefined,
        // The fallen lie there, a little faded: they drop (instead of fading out), then stay.
        // (A unit that is about to lie down, but still has its own attack to finish, stays up and unfaded until then.)
        classes: looksDead(e)
          // (One that died in its own strike, already lying in its death pose (Flame Immolation), does not drop into it again.)
          ? [...(fx.get(e.id)?.classes ?? []).filter(c => c !== "fx-fall"), ...(justFell(e.id) && e.intent.strikePose !== kindOf(e).deathPose ? ["fx-die"] : []), "is-remains"]
          : [...(fx.get(e.id)?.classes ?? []).filter(c => c !== "fx-fall"), ...(!e.alive && kindOf(e).remains ? ["is-remains"] : [])],
        dead: looksDead(e) ? kindOf(e).deathLook ?? "pieces" : undefined,
        // (fallen as this turn plays: whoever struck it still faces it until the turn is over)
        fellThisTurn: !!playback && looksDead(e) && !!playback.from.enemies.find(x => x.id === e.id)?.alive,
        // His second form: the wax he leaves is burnt black.
        charred: !!e.flags.phase2,
        // The fallen waxed burn as candles once the arena is lit (not the sealed ones); the lit ones, alive, carry theirs on their heads.
        // (And in the Warden's fight, a waxed that is staggered shows its flame on its head, for him to take; his scene lights it itself.)
        candle: (!!kindOf(e).remains && candlesLit && (e.alive ? !looksDead(e) : e.fate !== "encased")) || (warden && !!kindOf(e).flame && e.alive && e.staggered && !(usurpNow?.target === e.id)),
        // Its flame taken, or fallen (the waxed): sealed whole in wax.
        // (The parts of a Wax Blob are sealed whole in wax, always.)
        // (And the waxed he has raised in phase two: lit, with a flame on their heads, and sealed whole in wax all the same.)
        encased: (!e.alive && e.fate === "encased") || (looksDead(e) && kindOf(e).deathLook === "wax") || !!e.body || (e.alive && !!kindOf(e).flame && !!shownFlags(e).lit)
          // Staggered with the Waxed status on it (a Waxed Torch's wax, or a waxed one's own): it goes down sealed whole in wax, until it gets up. (The Warden has a figure of his own.)
          || (e.alive && e.staggered && e.waxed && kindOf(e).variant !== "warden" && kindOf(e).variant !== "guide"),
        stepKey,
        selected: !busy && sel.kind === "enemy" && sel.id === e.id && e.alive && !looksDead(e),
        disabled: busy || !playing || forced !== null || !e.alive || looksDead(e),
        label: `Select ${e.name}`,
        // It holds String you lost.
        // (A body of several parts, the Wax Blob, has one string round the whole heap, on its middle part, whichever part holds it.)
        holdsString: e.body ? e.part === "mid" && view.enemies.some(x => x.body === e.body && !!x.holds) : !!e.holds,
        onPick: () => { if (playSignal === undefined) openWheel({ kind: "enemy", id: e.id }); },
        // While you plan, the bar of whoever you're targeting, right below it (mid-turn it sits on the black strip instead).
        // (A part of a body, the Wax Blob: the bar always hangs below its middle part, whichever part is the target.)
        // (Mid-turn too: the bar of whoever the turn is about hangs below it, with what is changing flashing as it lands, not in the corner of the screen.)
        bar: playing && e.id === barHolder && (e.alive || busy)
          ? <HealthBar fighter={barsOf(shownEnemy ?? e)} before={shownBefore && barValues(shownBefore)} mirrored eternalFlash={busy && shownEnemy ? barFlashOf(shownEnemy.id) : undefined} />
          // Mid-turn, whoever is Resting shows a bar below them from the moment the turn starts, as the Rest winds up, so you can see what the Rest changes
          // when it lands (it flashes white then). (A body of several parts has one bar, below its middle part.)
          : busy && e.alive && restingBar(e)
            ? <HealthBar fighter={e} before={prevView?.enemies.find(x => x.id === e.id) && barValues(prevView.enemies.find(x => x.id === e.id)!)} mirrored />
            : undefined,
      })),
  ];

  // Each enemy truly defeated (no revive left) sends its String to you as its remains lie down: its max health, and, as a string of its own, any String it held.
  // (The waxed the Warden raises pay nothing a second time: each pays once. A body of several parts pays once.)
  useEffect(() => {
    if (lesson || fight.config.sparring || fight.config.dummy) return;
    const fresh: StringBurst[] = [];
    for (const e of view.enemies) {
      const key = e.body ?? e.id;
      if (paid.current.has(key) || !looksDead(e)) continue;
      const parts = e.body ? view.enemies.filter(x => x.body === e.body) : [e];
      if (!parts.every(looksDead)) continue;
      const final = parts.map(x => fight.enemies.find(y => y.id === x.id) ?? x);
      // However it was defeated (struck down, sealed in wax by the Warden, spent in its own blast, or gone with the Warden), it pays as if you had killed it.
      if (!final.some(x => x.fate === "fallen" || x.fate === "encased")) continue;
      const held = final.reduce((sum, x) => sum + (x.holds ?? 0), 0);
      const yieldOf = Math.max(...parts.map(x => kindOf(x).stringYield ?? 1));
      const amount = e.maxHP * yieldOf;
      paid.current.add(key);
      earned.current += amount + held;
      const from = parts.find(x => x.part === "mid")?.id ?? e.id;
      if (yieldOf > 1 && amount > 0) {
        // A boss's String bursts out as many strings, one after another, and all of it comes in.
        const group = ++burstIds.current, n = BOSS_STRINGS;
        for (let i = 0; i < n; i++) {
          const part = Math.floor(amount / n) + (i < amount % n ? 1 : 0);
          fresh.push({ id: ++burstIds.current, from, amount: part, epic: true, group, delay: i * 55 + Math.random() * 120 });
        }
      } else {
        fresh.push({ id: ++burstIds.current, from, amount });
      }
      // The String you lost that it held comes out as a string of its own, a moment after its own.
      if (held > 0) fresh.push({ id: ++burstIds.current, from, amount: held, delay: yieldOf > 1 ? 1100 : 450 });
    }
    if (fresh.length) {
      setBursts(b => [...b, ...fresh]);
      // Each string sets out with a breath of sound. A boss's burst is one long swell of breath and hum, with a note ringing out for each string.
      if (fresh.some(b => b.epic)) playSfx("stringBoss");
      for (const b of fresh) playSfx(b.epic ? "stringBossNote" : "string", (b.delay ?? 0) / 1000);
    }
  });

  // A flame just put out (lit → out) leaves a puff of smoke.
  const armsSig = Object.entries(arms).join(";");
  useEffect(() => {
    const before = armsBefore.current;
    const out = Object.keys(arms).filter(id => before[id] === "lit" && arms[id] === "out");
    armsBefore.current = { ...arms };
    if (!out.length) return;
    const t = performance.now();
    setSmoke(prev => ({ ...prev, ...Object.fromEntries(out.map(id => [id, t])) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armsSig]);

  return (
    <div className={`hud ${busy ? "is-cinematic" : ""}`} ref={hudRef}>
      <section className="stage" aria-label="Battlefield">
        <DebugLimbsContext.Provider value={debugLimbs}>
        <Scene
          figures={figures} shot={shot} projectiles={projectiles} usurpTrails={usurpTrails} arenaLit={candlesLit}
          arena={fight.enemies.some(e => kindOf(e).arena)}
          light={light} shade={shade} orbit={orbit}
          onSelectedBox={b => { if (!busy) setAnchor(b); }}
          dark={wakeDark ?? (ignite ? { level: igniteNow >= IGNITE.flare || igniteNow < IGNITE_DARK ? 0 : 1, ms: igniteNow >= IGNITE.flare ? 700 : IGNITE.kindle } : usurpDark)}
          ignite={ignite ? { who: ignite.who, start: ignite.start, seed: ignite.seed } : undefined}
        />
        </DebugLimbsContext.Provider>
        {/* String on its way to you flies over the field, but under your figure (and the rest of the HUD): it winds round you from behind. */}
        <StringFx bursts={bursts} root={hudRef} onLand={stringLanded} />
      </section>

      {/* Cutscene mode: black strips slide in while a turn plays out. When they leave, it's your move. */}
      <div className="letterbox letterbox-top" aria-hidden="true" />
      {panel && !busy && !paused && panel}
      {current && !busy && !paused && (
        <LessonBox speaker="The Guide" say={detour ? DETOUR.say : current.say} written={detour ? detourN : written} hint={detour ? DETOUR.hint : current.hint} ack={!detour && !current.goal} />
      )}
      <div className="letterbox letterbox-bottom" aria-hidden="true" />

      {/* Your health bar sits in a fixed slot, so nothing else on screen can push it around. The target's hangs right below it, in the scene, planning or not. */}
      <PlayerBars knot={knotOwned} eternalFlash={{ health: barFlashOf("player"), eternity: eternalHere.some(ev => ev.attacker === "player" && ev.spent > 0) ? stepKey : undefined }} player={barsOf(p)} preview={previewCost} recover={previewRecover} string={carried + landed} stringPops={pops} eternalString={eternalString} />

      {/* The ring over whoever you have selected: a small mark while you plan, grown into the wheel when you focus. */}
      {playing && !forced && !busy && !waking && (
        <ActionWheel
          wheel={wheel}
          open={wheelOpen}
          highlight={highlight}
          center={wheelCenter}
          anchor={anchor}
          onHighlight={d => { if (!lesson) { if (d !== highlight) menuSound(d); setHighlight(d); } }}
          onCommit={o => { menuSound("select"); commit(o); }}
        />
      )}

      {paused && <PauseMenu options={pauseOptions} focus={pauseIndex} onFocus={setPauseIndex} />}

      {fading && <div className="combat-fadeout" aria-hidden="true" />}

      {!playing && !busy && !leavesAlone && (
        <div className="result" role="dialog" aria-label="Fight over">
          <div className="result-card">
            <h2>
              {fight.status !== "won" ? "You fade"
                : wonText ?? (onDone ? (fight.enemies.length > 1 ? "They lie still" : "It lies still") : "The sleepwalkers are still")}
            </h2>
            {onDone ? (
              <div className="setup-buttons">
                <button className="commit" onClick={finishOnce}>{fight.status === "won" ? "Continue" : "Wake again"}</button>
              </div>
            ) : (
              <div className="setup-buttons">
                <button className="hud-button" onClick={onExit}>Menu</button>
                {onChangeLoadout && <button className="hud-button" onClick={onChangeLoadout}>Change loadout</button>}
                <button className="commit" onClick={onRetry}>Retry</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
