/**
 * CombatScreen.tsx — the combat screen: planning, then the turn played back step by step.
 */
import { type ReactNode, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from "react";
import { play as playSfx, prepare as prepareSfx, sfxFor } from "../audio/sfx";
import { ActionWheel, type Anchor } from "./ActionWheel";
import { APPROACH_MS, BLOCK_PUSH, CAMERA_FOLLOW, DODGE_BACK, DODGE_DELAY_MS, DODGE_SIDE, effectsOf, ENGAGE_GAP, FALL_BACK, FORCED_TURN_MS, IGNITE_DARK, IGNITE_MARKS, indexTurn, involvedEnemy, isAttackStep, KNOCK_MS, KNOCKBACK, MIN_ATTACK_PHASE_MS, NUDGE_MS, OPENING_LEAD_IN, phaseAt, phaseFor, phaseTwoOf, type Playback, RAISE_CAMERA_MS, REST_ANIM_MS, REST_POSE_MS, SETTLE_MS, STEP_MS, STRIKE_GAP, USURP_STAGES, usurpOf, type UsurpStage, viewAt } from "./playback";
import { LessonBox } from "./LessonBox";
import { DETOUR, isWanted, type Beat, lessonAllows, lessonMet, typeDelay } from "./lesson";
import { defaultSelection, moveSelection, rowsOf, sameSel, type Selection, type Wheel, type WheelOption } from "./selection";
import { kindOf } from "../core/bestiary";
import { forcedAction, resolveTurn } from "../core/resolve";
import { attackCost, restRecovery } from "../core/rules";
import type { CombatState, Enemy, Opening, PlayerAction } from "../core/types";
import { behind, type Cam, closeIn, facingToward, figureBox, formation, lerpAngle, planningCamera, pushedAway, type SceneShot, shotCamera, type ShotCamera, sub, type Vec, yawOf } from "../render/camera";
import type { Projectile } from "../render/effects";
import { type BarValues, HealthBar } from "../render/HealthBar";
import { lookOf } from "../render/looks";
import { actionPose, asPose, downPoseOf, flinchPoseOf, handOffOf, idlePoseOf, impactPoint, poseForIntent, type PoseName, strikePose, windUpPose } from "../render/poses";
import { Scene, type SceneFigure } from "../render/Scene";
import { type Dir, useKeys, wrapIndex } from "../ui/input";
import { type MenuOption, PauseMenu } from "../ui/Menu";
import { IGNITE } from "../warden/scenes";
import type { CandleArm, WardenPoseName } from "../warden/skeleton";

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

const barValues =(f: { hp: number; fatigue: number; death: number }): BarValues => ({ hp: f.hp, fatigue: f.fatigue, death: f.death });

/** How an enemy's look draws it differently (its kind's variant). */
const lookOfFoe = (e: Enemy) => lookOf(kindOf(e).variant);

export function CombatScreen({ initial, opening, onRetry, onChangeLoadout, onExit, onDone, override, panel, playSignal, attackOnPlay, playerAction, playerHold, playerAngle, playerDead, light = true, changeLabel, exitLabel, wonText, onTurnPlayed, lesson, figureAngle }: {
  initial: CombatState;
  /** A scene to play before the first turn (it leaves the fight as `initial`). */
  opening?: Opening;
  /** The model viewer: rewrites the fight before it's shown or played (the enemy's pose and action). */
  override?: (s: CombatState) => CombatState;
  /** Extra controls drawn over the fight (the model viewer's). */
  panel?: ReactNode;
  /** Each change plays a turn in which you just Rest (the model viewer's actions). You can't act yourself. */
  playSignal?: number;
  /** The model viewer: you attack it this turn (to break its Rest). */
  attackOnPlay?: boolean;
  /** The model viewer's Model stance: how the enemy is seen (3/4 or straight on, from the front or behind). */
  figureAngle?: { view: "front" | "back"; straight: boolean; sides?: boolean };
  /** The model viewer's player mode: each change plays this action for you (instead of a Rest or an Attack). */
  playerAction?: PlayerAction;
  /** The model viewer's player mode: the pose you hold while no turn is playing. */
  playerHold?: PoseName;
  /** The model viewer's player mode: how you are seen (default: 3/4 from behind, as in a fight). */
  playerAngle?: { view: "front" | "back"; straight: boolean; sides?: boolean };
  /** The model viewer's player mode: you lie where you fell (your remains), whatever the fight says. */
  playerDead?: boolean;
  /** The fight's limited light (default on). The Model viewer can turn it off to see everything. */
  light?: boolean;
  /** The pause menu's label for onChangeLoadout. */
  changeLabel?: string;
  /** The pause menu's label for onExit. */
  exitLabel?: string;
  /**
   * The guide's scripted lesson (see lesson.ts): its words are written out in a box at the bottom, and only
   * the keys it asks for work. Start the fight in `sparring`. When the last beat is read, the fight is won.
   */
  lesson?: Beat[];
  /** The title when you win (fights off the map have their own). */
  wonText?: string;
  /** Called as a turn finishes playing, with the fight as it now stands. */
  onTurnPlayed?: (s: CombatState) => void;
  onRetry: () => void;
  /** Back to the setup screen (not offered when unset). */
  onChangeLoadout?: () => void;
  onExit: () => void;
  /** Set for fights from the map: when it's over, carry on (won or not) instead of retrying. */
  onDone?: (won: boolean, charges: number) => void;
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
  const written = typed.beat === beat ? typed.n : 0;
  const setWritten = (n: number | ((w: number) => number)) => setTyped(t => ({ beat, n: typeof n === "number" ? n : n(t.beat === beat ? t.n : 0) }));
  const current = lesson && playing ? lesson[beat] : undefined;
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
    // One of each sound per step; except the flames, one for each unit they lick (up to three, a beat apart).
    const heard = new Map<string, number>();
    for (const ev of step.events) {
      const s = sfxFor(ev);
      if (!s) continue;
      const n = heard.get(s.name) ?? 0;
      heard.set(s.name, n + 1);
      if (n === 0 || (s.name === "flame" && n < 3)) playSfx(s.name, s.delay + n * 0.09);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey]);

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
    const pos = { ...w.pos, ...Object.fromEntries(formation(anchor, yaw, front, back)), player: anchor };
    world.current = { anchor, yaw, pos };
    return { pos, camera: planningShot(anchor, yaw, pos, st) };
  };

  const [shot, setShot] = useState<SceneShot>(() => {
    // Laid out as the fight stands when the screen opens (before its opening scene, if any).
    const { front, back } = linesOf(opening?.from ?? initial);
    const pos = { ...Object.fromEntries(formation({ x: 0, z: 0 }, 0, front, back)), player: { x: 0, z: 0 } };
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
        const slots = formation(w.anchor, w.yaw, front, backLine);
        const moved = after.enemies.filter(e => e.alive && kindOf(e).flame && slots.has(e.id)).map(e => e.id);
        shoot({ ...w.pos, ...Object.fromEntries(moved.map(id => [id, slots.get(id)!])) }, pulledBack, IGNITE.draw, moved);
        return;
      }
      shoot(w.pos, pulledBack, IGNITE.draw);
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
      const between: ShotCamera = { between: [usurp.who, usurp.target], yaw: shotCamera(shot).yaw };
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
      shoot(w.pos, { between: [raise.by, raise.who], yaw: shotCamera(shot).yaw }, RAISE_CAMERA_MS);
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
    const dodgeTo = () => {
      // A dodge gets out of the way: further back, and away from the attacker, if they were retreating; if they
      // were closing in, past the attack to the attacker's side.
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
      return retreating
        ? { x: t.x + (back.x + side.x) * DODGE_BACK, z: t.z + (back.z + side.z) * DODGE_BACK }
        : { x: t.x - side.x * DODGE_SIDE, z: t.z - side.z * DODGE_SIDE };
    };
    let cleanup: (() => void) | undefined;
    if (playback.phase === "approach") {
      // A melee attacker closes in (a ranged one stays put), and the camera moves in on the two.
      const at = attack.ranged ? a : closeIn(a, t, STRIKE_GAP);
      // (It stays centered between the two as they move: closing in, knocked back, dodging.)
      const camera: ShotCamera = { between: [attack.attacker, attack.target], yaw: shotCamera(shot).yaw };
      shoot({ ...w.pos, [attack.attacker]: at }, camera, APPROACH_MS);
      if (attack.result === "dodged") {
        // A target that dodges gets clear late in the approach, timed to be gone just as the blow arrives (the
        // blow lands where it was), and only then takes its dodge pose.
        const to = dodgeTo();
        const timer = window.setTimeout(() => {
          shoot({ ...world.current.pos, [attack.target]: to }, camera, APPROACH_MS - DODGE_DELAY_MS);
          setDodgeStarted(stepKey);
        }, DODGE_DELAY_MS);
        cleanup = () => window.clearTimeout(timer);
      }
    } else if (attack.result === "hit") {
      // A clean hit knocks the target back, and it stays there.
      shoot({ ...w.pos, [attack.target]: pushedAway(a, t, KNOCKBACK) }, shot.camera, KNOCK_MS);
    } else if (attack.result === "blocked") {
      // A block jolts them both apart a little, and they stay there (like a knockback).
      const knocked = { ...w.pos, [attack.target]: pushedAway(a, t, BLOCK_PUSH) };
      if (!attack.ranged) knocked[attack.attacker] = pushedAway(t, a, BLOCK_PUSH);
      shoot(knocked, shot.camera, KNOCK_MS);
    }
    // (A dodge already got out of the way during the approach, so there's nothing more to move at the impact.)
    return cleanup;
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
    const b = figureBox(shotCamera(shot), p, w, h, foe && kindOf(foe).scale);
    setAnchor({ x: b.x, y: b.y, w: b.w, h: b.h, hudW: w, hudH: h });
  }, [wheelOpen, selId, shot, viewport]);

  /* ---------- moving the cursor ----------
   * W/S move between depths. A/D walk the whole lineup as it appears on screen, left to right:
   * you, then the front line, then the back line. So pressing A at the left end of a line
   * steps to the line closer to you, and D at the right end steps to the line behind. */
  const moveCursor = (dir: Dir) => {
    const to = moveSelection(rows, sel, dir);
    if (to) setSelection(to);
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
    setPlayback(
      next.lastTurn.length
        ? { from: fight, steps: next.lastTurn, index: 0, phase: phaseAt(next.lastTurn, 0, 0), playerPose: pose, action: forced ? null : action }
        : null,
    );
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
    const foe = fight.enemies.find(e => e.alive);
    // (Not against a fixed rule like Usurp Flame: that plays on its own.)
    const fixedRule = !!foe && !!kindOf(foe).fixedActions?.includes(foe.intent.action ?? "");
    if (playing && !busy) play(!fixedRule && (attackOnPlay || foe?.intent.type === "block" || foe?.intent.type === "maneuver") ? { type: "attack", target: foe!.id } : { type: "rest" });
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
  // Advance the playback one step at a time.
  useEffect(() => {
    if (!playback || paused || playback.phase === "usurp" || playback.phase === "ignite") return;
    // Someone's Rest goes through this turn (its animation sets how long the last step lasts).
    const resting = !!turnIx && playback.from.enemies.some(e => turnIx.rest.has(e.id));
    const timer = window.setTimeout(
      () => {
        const pb = playback;
        if (pb.phase === "approach") return setPlayback({ ...pb, phase: "impact" });
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
        ? isAttackStep(step) ? APPROACH_MS : Math.max(0, MIN_ATTACK_PHASE_MS - (performance.now() - turnStart.current))
        : playback.index === playback.steps.length - 1 && resting
          ? Math.max(STEP_MS, REST_ANIM_MS)
          : STEP_MS,
    );
    return () => window.clearTimeout(timer);
  }, [playback, paused]);

  // A stagger or a revive costs you the turn: show it, then play it out on its own.
  const playForced = useEffectEvent(() => play({ type: "rest" }));
  useEffect(() => {
    if (!playing || !forced || busy || paused) return;
    const timer = window.setTimeout(playForced, FORCED_TURN_MS);
    return () => window.clearTimeout(timer);
  }, [playing, forced, busy, paused]);

  const pauseOptions: MenuOption[] = [
    { label: "Resume", run: () => setPaused(false) },
    { label: "Restart fight", run: onRetry },
    ...(onChangeLoadout ? [{ label: changeLabel ?? "Change loadout", run: onChangeLoadout }] : []),
    { label: exitLabel ?? "Main menu", run: onExit },
  ];
  const finish = () => onDone?.(fight.status === "won", fight.player.charges);

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
    const t = window.setTimeout(() => setDetourN(n => n + 1), typeDelay(DETOUR.say, detourN));
    return () => window.clearTimeout(t);
  }, [detour, detourN, busy, paused]);
  // Each beat's words are written out from the start, once the last turn has played out.
  useEffect(() => {
    if (!current || busy || paused || written >= current.say.length) return;
    const t = window.setTimeout(() => setWritten(w => w + 1), typeDelay(current.say, written));
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
    if (busy) return; // input waits for the turn to finish playing
    if (!playing) {
      if (onDone) { if (key === "select" || key === "back" || key === "pause") finish(); }
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
      if (key === "select") openWheel(sel);
      else if (key !== "back" && key !== "pause") moveCursor(key);
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
  const turnSteps = playback?.steps;
  const turnIx = useMemo(() => (turnSteps ? indexTurn(turnSteps) : null), [turnSteps]);
  const stepOf = (m: "strike" | "rest" | "fall" | "raised" | "dodge" | "maneuver" | "usurp" | "backUp" | "phaseTwoBy", id: string) => turnIx?.[m].get(id) ?? -1;
  /** This turn's step `i` has played: it's behind us, or it's showing and its blow has landed. */
  const reached = (i: number) => !!playback && i >= 0 && (playback.index > i || (playback.index === i && impact));
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
  const playerPose: PoseName = !playback && walkOff?.player ? walkOff.player : playback
    ? playbackPose("player", p.staggered, {
        // A forced turn kneels until the Rest (or revive) brings you back; then you're up.
        telegraph: playerBackUp ? "idle" : playback.playerPose, down: "kneel", windUp: "attack", strike: punching ? "punch" : "strike", idle: "idle",
        guard: playback.action?.type === "block" || playback.action?.type === "maneuver" ? { hold: "idle", react: playback.playerPose, keepAfterDodge: playback.action.type === "maneuver" } : undefined,
      })
    : forced ? "kneel" : playerHold ?? (chosen?.action.type as PoseName | undefined) ?? "idle";
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
    return turnIx.hit.get(e.id) ?? -1;
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
      down: downPoseOf(e), windUp: kindOf(e).attacksFromStance && e.intent.stance ? poseForIntent(e) : windUpPose(e), strike: strikePose(e), idle: settledPose(e),
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
      if (kind) projectiles.push({ from: ev.attacker, to: ev.target, kind, origin, fiery, key: `${stepKey}-${ev.attacker}` });
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
  /**
   * Its fall has shown: once the blow that drops it has landed. Under grit (it was dropped by a tied attack
   * and finishes its own, in the step it falls) it stays up until that attack is over, and lies down after.
   */
  const fellBy = (id: string): boolean => {
    const fall = stepOf("fall", id);
    if (fall < 0) return false;
    return stepOf("strike", id) === fall ? !!playback && playback.index > fall : reached(fall);
  };
  /** It has just lain down, in the beat showing now: its remains drop (see `.fx-die`). */
  const justFell = (id: string): boolean => {
    const fall = stepOf("fall", id);
    if (!playback || fall < 0) return false;
    if (stepOf("strike", id) !== fall) return playback.index === fall;
    // After its own attack: the next step, in the first beat it shows (an attack's approach, or any other step's only beat).
    const next = playback.steps[fall + 1];
    return playback.index === fall + 1 && (isAttackStep(next) ? playback.phase === "approach" : true);
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
    if (was?.reviving) {
      // The Warden lies where he fell until he rises in the dark of his phase-two scene, with the light still fading out.
      const p2 = stepOf("phaseTwoBy", e.id);
      if (p2 >= 0) {
        if (playback.index !== p2) return playback.index < p2;
        return ignite && ignite.who === e.id ? igniteNow < IGNITE.kindle : playback.phase === "ignite";
      }
      return !reached(stepOf("backUp", e.id));
    }
    return reached(stepOf("fall", e.id));
  };
  /**
   * Your remains lie where you fell instead of you: you fell this turn (once the blow has landed), you are
   * down for good, or you fell with a charge left and lie there until the revive lands.
   */
  const playerLooksDead = (): boolean => {
    if (playerDead) return true;
    if (!playback) return fight.status === "lost" || p.reviving;
    if (playback.from.player.reviving) return !reached(stepOf("backUp", "player"));
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
  const figures: SceneFigure[] = [
    {
      id: "player",
      view: playerAngle?.view ?? "back",
      straight: playerAngle?.straight,
      sides: playerAngle?.sides,
      // Staggered while Waxed, you're sealed like the waxed: kneeling, shins bound, head in wax,
      // your flame burning on it (until it's taken).
      // Staggered while Waxed (or with your flame taken), you're sealed whole in wax, and stay
      // that way until you recover: no other look in between.
      pose: track("player", playerSealed ? "w-idle" : playerPose),
      dead: youDead ? "pieces" : undefined,
      variant: playerSealed ? "waxed" : undefined,
      // Sealed, your own flame burns on your head (phase two's scene draws on it too).
      flame: playerSealed,
      candle: p.waxed && p.staggered && !(usurpNow?.target === "player" && usurpStage === "reveal"),
      encased: playerSealed,
      // Waxed but still standing: wax caked on you.
      waxCaked: p.waxed && !p.staggered,
      weapon: p.weapon,
      armor: p.armor,
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
        view: figureAngle?.view ?? "front",
        straight: figureAngle?.straight,
        sides: figureAngle?.sides,
        foe: true,
        hand: kindOf(e).weaponHand,
        pose: looksDead(e) && kindOf(e).deathLook === "wax" ? asPose(kindOf(e).deathPose, "w-idle") : !playback && walkOff?.[e.id] ? walkOff[e.id] : track(e.id, enemyPose(e)),
        weapon: e.weapon,
        armor: e.armor,
        variant: kindOf(e).variant,
        scale: kindOf(e).scale,
        flame: !!kindOf(e).flame,
        arm: lookOfFoe(e)?.candleArm ? (arms[e.id] = candleArmOf(e)) : undefined,
        // Phase two's look (black wax, burning inside) from the moment all is dark.
        phase2Look: !!ignite && ignite.who === e.id && igniteNow >= IGNITE.kindle,
        flailFire: !!lookOfFoe(e)?.candleArm && !!shownFlags(e).flaming,
        // Its rest pose just gave way to its next stance: that pose's trails keep fading meanwhile.
        lingerFrom: restJustOver(e) ? (e.intent.restPose as WardenPoseName) : strikeJustOver(e) ? (e.intent.strikePose as WardenPoseName) : undefined,
        smokeSince: smoke[e.id],
        // The fallen lie there, a little faded: they drop (instead of fading out), then stay.
        // (A unit that is about to lie down, but still has its own attack to finish, stays up and unfaded until then.)
        classes: looksDead(e)
          ? [...(fx.get(e.id)?.classes ?? []).filter(c => c !== "fx-fall"), ...(justFell(e.id) ? ["fx-die"] : []), "is-remains"]
          : [...(fx.get(e.id)?.classes ?? []).filter(c => c !== "fx-fall"), ...(!e.alive && kindOf(e).remains ? ["is-remains"] : [])],
        dead: looksDead(e) ? kindOf(e).deathLook ?? "pieces" : undefined,
        // His second form: the wax he leaves is burnt black.
        charred: !!e.flags.phase2,
        // The fallen waxed burn as candles once the arena is lit (not the sealed ones); the lit ones, alive, carry theirs on their heads.
        candle: !!kindOf(e).remains && candlesLit && (e.alive ? !looksDead(e) : e.fate !== "encased"),
        // Its flame taken, or fallen (the waxed): sealed whole in wax.
        encased: (!e.alive && e.fate === "encased") || (looksDead(e) && kindOf(e).deathLook === "wax"),
        stepKey,
        selected: !busy && sel.kind === "enemy" && sel.id === e.id && e.alive && !looksDead(e),
        disabled: busy || !playing || forced !== null || !e.alive || looksDead(e),
        label: `Select ${e.name}`,
        onPick: () => { if (playSignal === undefined) openWheel({ kind: "enemy", id: e.id }); },
        // While you plan, the bar of whoever you're targeting, right below it (mid-turn it sits on the black strip instead).
        bar: playing && !busy && e.id === shownId && e.alive
          ? <HealthBar fighter={e} before={shownBefore && barValues(shownBefore)} mirrored />
          : undefined,
      })),
  ];

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
        <Scene
          figures={figures} shot={shot} projectiles={projectiles} usurpTrails={usurpTrails} arenaLit={candlesLit}
          arena={fight.enemies.some(e => kindOf(e).arena)}
          light={light}
          dark={ignite ? { level: igniteNow >= IGNITE.flare || igniteNow < IGNITE_DARK ? 0 : 1, ms: igniteNow >= IGNITE.flare ? 700 : IGNITE.kindle } : usurpDark}
          ignite={ignite ? { who: ignite.who, start: ignite.start, seed: ignite.seed } : undefined}
        />
      </section>

      {/* Cutscene mode: black strips slide in while a turn plays out. When they leave, it's your move. */}
      <div className="letterbox letterbox-top" aria-hidden="true" />
      {panel && !busy && !paused && panel}
      {current && !busy && !paused && (
        <LessonBox speaker="The Guide" say={detour ? DETOUR.say : current.say} written={detour ? detourN : written} hint={detour ? DETOUR.hint : current.hint} ack={!detour && !current.goal} />
      )}
      <div className="letterbox letterbox-bottom" aria-hidden="true" />

      {/* Your health bar sits in a fixed slot, so nothing else on screen can push it around. The target's hangs right below it, in the scene. */}
      <div className="bar-slot bar-slot-player">
        {/* Revives left, as a red Roman numeral beside your bar. Nothing shows once they're gone. */}
        {p.charges > 0 && (
          <span className="revive-count" aria-label={`${p.charges} revives left`}>{roman(p.charges)}</span>
        )}
        <HealthBar fighter={p} preview={previewCost} recover={previewRecover} />
      </div>

      {/* While a turn plays, the target's bar sits bottom right, mirroring yours (in planning it hangs below the enemy). */}
      {busy && (
        <div className="bar-slot bar-slot-target">
          {shownEnemy && (
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
          onHighlight={d => { if (!lesson) setHighlight(d); }}
          onCommit={commit}
        />
      )}

      {paused && <PauseMenu options={pauseOptions} focus={pauseIndex} onFocus={setPauseIndex} />}

      {!playing && !busy && (
        <div className="result" role="dialog" aria-label="Fight over">
          <div className="result-card">
            <h2>
              {fight.status !== "won" ? "You fade"
                : wonText ?? (onDone ? (fight.enemies.length > 1 ? "They lie still" : "It lies still") : "The sleepwalkers are still")}
            </h2>
            {onDone ? (
              <div className="setup-buttons">
                <button className="commit" onClick={finish}>{fight.status === "won" ? "Continue" : "Wake again"}</button>
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

/** One health bar for whoever the turn's action involves. Always in the same spot. */
function TargetPanel({ enemy, before }: { enemy: Enemy; before?: BarValues }) {
  return (
    <div className="hud-target">
      <HealthBar fighter={enemy} before={before} mirrored />
    </div>
  );
}
