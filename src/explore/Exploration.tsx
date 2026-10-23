/**
 * Exploration.tsx — the exploration screen: a top-down dungeon you walk around with WASD or the
 * arrows.
 *
 * Movement is free (positions are floats) over a grid of tiles. Escape pauses.
 *
 * LEVELS. The dungeon is a stack of levels sharing one grid: a level-1 bridge can pass right over
 * a level-0 hall, and you can walk under it. Stairs and ladders are ramps: your height changes
 * continuously as you walk along them, so there is no transition between levels at all.
 * The rule that makes it work: you can step onto any surface whose height at that spot is close
 * to your own. That lets you onto a ramp from its ends, but not from its sides halfway up, and
 * keeps you on your own level when another passes above or below.
 *
 * DRAWING. Each storey is drawn RISE tiles higher on screen than the one below, so ledges get
 * cliff faces and stairs visibly climb. Levels above you are split at your row: what's behind
 * you is drawn before you, what's in front (or overhead) after, so bridges cover you as you pass
 * under them. A faint outline of you shows through anything that covers you.
 *
 * The map itself is written in plans.ts.
 */
import { useEffect, useRef, useState } from "react";
import { dirOf, wrapIndex } from "../ui/input";
import { Dialogue } from "./Dialogue";
import { drawFallenWaxed, drawPickup, drawKeeper, drawWalker, type Frame, MAP_FIGURES } from "./figures";
import { cycleSlot, gearName, type Inventory as Bag, receive, SLOTS } from "./gear";
import { Inventory } from "./Inventory";
import { PICKUP_REACH, PICKUPS } from "./pickups";
import { CHASE_MEMORY, ENCOUNTER_FADE_MS, type Foe, FOE_TUNING, foeFloor, GRACE_MS, huddle, MAP_FOES, type MapFoe, MAX_IN_FIGHT, stepsFrom, TOUCH, waypoint } from "./foes";
import { FADE_FAR, FADE_NEAR, GUIDE, KEEPER_REACH, KEEPERS, REST_NOTE_MS } from "./keepers";
import { cornerNudge, slide, surfaceNear, type Walker } from "./movement";
import { CHUNK, CHUNK_PAD_BOTTOM, CHUNK_PAD_TOP, makeCanvas, paintChunk } from "./paint";
import { drawSeal, MELT_MS, SEALS, sealsUp, setSeals } from "./seals";
import { seeThrough, sight } from "./sight";
import { type After, TUTORIAL_FOE, DROP_DELAY_MS, DROP_MS, GIFT, GUIDE_WALK, guideTalk, type Knot, LANDING, PERCH, RELIEF, type Talk, type TutorialState } from "./tutorial";
import { ACCEL, BODY_ABOVE_FEET, CAMERA_FOLLOW, COLORS, DEPTH_DIM, GHOST_ALPHA, GRAVITY, LADDER_SPEED, RISE, SIGHT_EASE, SPEED, STEP_TOLERANCE, STRIDE, TILES_TALL, VISION_FULL, VISION_RADIUS } from "./tuning";
import { type Dir, FLOOR, groundBelow, isAir, isRamp, LADDER, LEVELS, tileAt, WORLD } from "./world";

/** Resting is a sleep: how long the screen is dark in all, and when, in the dark, it happens. */
const SLEEP_MS = 2400;
const SLEEP_MID_MS = 1100;

/** Your progress on the map, kept while you're away fighting. */
export interface Journey {
  /** Where you are; missing means where you wake: by the keeper you last rested by, or the start. */
  at?: { x: number; y: number; alt: number; facing: Dir };
  /** Enemies already beaten (they stay gone). */
  defeated: string[];
  /** The keeper you last rested by (a keeper's id). */
  rested?: string;
  /** The guide's teaching: while it isn't done, the start room's exits are sealed in wax. */
  tutorial: TutorialState;
  /** The guide's gift, once given: your revive for the demo (see tutorial.ts). */
  knot?: Knot;
  /** What you carry (and wear). */
  inventory: Bag;
  /** Gear lying on the map that you have already picked up (ids from pickups.ts). */
  taken: string[];
  /** What the last fight left you, to say so when you're back on the map. */
  found?: string;
}

export function Exploration({ journey, finale = false, onEncounter, onSave, onExit }: {
  journey: Journey;
  /** Just back from beating the Waxed in the start room: the guide speaks its relief and asks you to rest with it. */
  finale?: boolean;
  /**
   * A fight starts: the enemy that reached you, then any others chasing you that join in, and
   * where you were, to come back to afterwards.
   */
  onEncounter: (foes: MapFoe[], journey: Journey) => void;
  /** Your progress is worth keeping now (you rested, the guide gave you something). */
  onSave: (journey: Journey) => void;
  /** Back to the main menu, with where you stand. */
  onExit: (journey: Journey) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The screen goes dark as a fight begins; input stops.
  const [entering, setEntering] = useState(false);
  const leaving = useRef(false);
  const latest = useRef({ journey, onEncounter, onSave });
  latest.current = { journey, onEncounter, onSave };
  // Escape opens the inventory screen, which also holds the way back to the main menu.
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const held = useRef<Dir[]>([]);
  // The keeper you last rested by, and the one you're standing by now (if any).
  const restedAt = useRef<string | undefined>(journey.rested);
  const nearRef = useRef<string | null>(null);
  const [near, setNear] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; id: number } | null>(null);
  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setNote(cur => (cur?.id === note.id ? null : cur)), REST_NOTE_MS);
    return () => window.clearTimeout(t);
  }, [note]);
  // The knot you carry, if you've been given it. Resting winds it tight again.
  const knotRef = useRef<Knot | undefined>(journey.knot);
  const [knot, setKnotState] = useState<Knot | undefined>(journey.knot);
  const setKnot = (k: Knot | undefined) => { knotRef.current = k; setKnotState(k); };
  // What you carry, and the inventory screen over the map.
  const invRef = useRef<Bag>(journey.inventory);
  const [inv, setInvState] = useState<Bag>(journey.inventory);
  const setInv = (b: Bag) => { invRef.current = b; setInvState(b); };
  const [invFocus, setInvFocus] = useState(0);
  // Gear on the floor: what you've taken, and what you're standing by.
  const takenRef = useRef<string[]>(journey.taken);
  const nearPickupRef = useRef<string | null>(null);
  const [nearPickup, setNearPickup] = useState<string | null>(null);
  const pickUp = () => {
    const p = PICKUPS.find(x => x.id === nearPickupRef.current);
    if (!p) return;
    takenRef.current = [...takenRef.current, p.id];
    nearPickupRef.current = null;
    setNearPickup(null);
    // It goes in the bag; wearing it is up to you.
    const { inventory, replaced } = receive(invRef.current, [p.gear], false);
    setInv(inventory);
    setNote({
      text: `You pick up the ${gearName(p.gear).toLowerCase()}.${replaced.length ? ` You let go of the ${replaced.map(gearName).join(", ").toLowerCase()}.` : ""} Open your inventory (Esc) to equip it.`,
      id: Date.now(),
    });
    latest.current.onSave(snapshot.current());
  };
  useEffect(() => {
    // The gear a fight left you.
    if (journey.found) setNote({ text: journey.found, id: Date.now() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Where the tutorial stands (it moves on while you are here).
  const tutorialRef = useRef<TutorialState>(journey.tutorial);
  // Resting is a sleep: the screen fades out, you settle by the guide, and fades back in. What it
  // does happens in the dark; afterwards `woke` says what you wake to.
  const [sleeping, setSleeping] = useState(false);
  const sleepTimers = useRef<number[]>([]);
  useEffect(() => () => sleepTimers.current.forEach(t => window.clearTimeout(t)), []);
  const rest = () => {
    const id = nearRef.current;
    if (!id) return;
    const gift = id === GUIDE && tutorialRef.current.beaten && !tutorialRef.current.done;
    held.current = [];
    leaving.current = true;
    setSleeping(true);
    sleepTimers.current = [
      // In the dark: your candle moves here, and the knot, if slack, winds itself tight.
      window.setTimeout(() => {
        restedAt.current = id;
        if (knotRef.current === "unwound") {
          setKnot("wound");
          setNote({ text: "The knot winds itself tight again.", id: Date.now() });
        }
      }, SLEEP_MID_MS),
      window.setTimeout(() => {
        setSleeping(false);
        leaving.current = false;
        latest.current.onSave(snapshot.current());
        if (gift) setTalk({ ...GIFT, at: 0 });
        else setNote(n => n ?? { text: "You rest by the hooded figure. Should you fall, you will wake here.", id: Date.now() });
      }, SLEEP_MS),
    ];
  };

  // The guide speaking: its lines, which one you're at, and what follows the last. The map
  // stands still meanwhile. After the Waxed is beaten it opens on its own with the relief.
  const [talk, setTalk] = useState<(Talk & { at: number }) | null>(() => (finale ? { ...RELIEF, at: 0 } : null));
  // Waking after the Waxed has beaten you, the guide speaks to you.
  useEffect(() => {
    const j = latest.current.journey;
    if (j.at || j.tutorial.beaten || j.tutorial.attempts === 0) return;
    const t = window.setTimeout(() => { held.current = []; setTalk({ ...guideTalk(j.tutorial), at: 0 }); }, 1000);
    return () => window.clearTimeout(t);
  }, []);
  const talkRef = useRef(false);
  talkRef.current = talk !== null;
  // Set when the guide lets the wax go; the map's loop starts the melt.
  const melting = useRef(false);
  // Where you stand now, as a Journey (set by the map's loop).
  const snapshot = useRef<() => Journey>(() => latest.current.journey);
  const speak = () => {
    held.current = [];
    setTalk({ ...guideTalk(tutorialRef.current), at: 0 });
    tutorialRef.current = { ...tutorialRef.current, greeted: true };
  };
  const then = (after: After) => {
    if (after !== "melt") return;
    // The gift: the knot, and the wax goes.
    tutorialRef.current = { ...tutorialRef.current, done: true };
    setKnot("wound");
    melting.current = true;
    setNote({ text: "The guide presses a tangled knot into your hands.", id: Date.now() });
    latest.current.onSave(snapshot.current());
  };

  const keyHandler = useRef<(e: KeyboardEvent, down: boolean) => void>(() => {});
  keyHandler.current = (e, down) => {
    const dir = dirOf(e.key);
    if (!down) {
      if (dir) held.current = held.current.filter(d => d !== dir);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (leaving.current) return;
    const key = e.key.toLowerCase();
    if (key === "escape") {
      e.preventDefault();
      if (!e.repeat) { held.current = []; setInvFocus(0); setPaused(p => !p); }
      return;
    }
    if (paused) {
      // The inventory screen: W/S pick a slot (or the way back to the main menu), A/D change
      // what's worn in a slot, E uses the menu button, Q closes.
      e.preventDefault();
      if (e.repeat) return;
      if (dir === "up" || dir === "down") setInvFocus(i => wrapIndex(i, dir === "up" ? -1 : 1, SLOTS.length + 1));
      else if ((dir === "left" || dir === "right") && invFocus < SLOTS.length) setInv(cycleSlot(invRef.current, SLOTS[invFocus], dir === "right" ? 1 : -1));
      else if ((key === "e" || key === "enter" || key === " ") && invFocus === SLOTS.length) onExit(snapshot.current());
      else if (key === "q") setPaused(false);
      return;
    }
    if (talk) {
      // The guide's lines: E moves on; the last one ends the talk and does what follows.
      e.preventDefault();
      if (e.repeat || (key !== "e" && key !== "enter" && key !== " ")) return;
      if (talk.at + 1 < talk.lines.length) setTalk({ ...talk, at: talk.at + 1 });
      else { setTalk(null); then(talk.after); }
      return;
    }
    if (dir) {
      e.preventDefault();
      if (!e.repeat) held.current = [...held.current.filter(d => d !== dir), dir];
      return;
    }
    if ((key === "e" || key === "enter") && !e.repeat && (nearRef.current || nearPickupRef.current)) {
      e.preventDefault();
      if (nearPickupRef.current) pickUp();
      else if (nearRef.current === GUIDE && !tutorialRef.current.beaten) speak();
      else rest();
    }
  };

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => keyHandler.current(e, true);
    const onUp = (e: KeyboardEvent) => keyHandler.current(e, false);
    const onBlur = () => { held.current = []; };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const g = canvas.getContext("2d")!;
    const { start } = WORLD;
    const { journey: begin } = latest.current;
    // The start room's exits stay sealed until the guide has given you the knot.
    setSeals(!begin.tutorial.done);
    // How far the wax has melted (0 whole, 1 gone), once the guide lets it go.
    let meltStart: number | null = null;
    // Coming back from a fight: where you were. Otherwise you wake by the keeper you last
    // rested by, or, the very first time, at the start.
    const keeper = KEEPERS.find(k => k.id === begin.rested);
    const at = begin.at ?? (keeper
      ? { x: keeper.at.x, y: keeper.at.y + 0.9, alt: keeper.at.z, facing: "up" as Dir }
      : { x: start.x + 0.5, y: start.y + 0.6, alt: start.z, facing: "down" as Dir });
    const me: Walker = {
      x: at.x, y: at.y, alt: at.alt, vx: 0, vy: 0,
      facing: at.facing, walked: 0, climbing: false, fall: 0, ground: at.alt,
    };
    // Everyone not yet beaten, back where they started.
    const foes: Foe[] = MAP_FOES.filter(f => !begin.defeated.includes(f.id)).map(def => ({
      def, x: def.home.x, y: def.home.y, alt: def.home.z, vx: 0, vy: 0, facing: "down", walked: 0,
      climbing: false, fall: 0, ground: def.home.z, target: null, wait: Math.random() * 2, chasing: false, lostFor: 0, lastSeen: null, seenAt: null,
      homeSteps: stepsFrom(def.home.z, Math.floor(def.home.x), Math.floor(def.home.y)),
    }));
    let grace = GRACE_MS;
    let lastHint = -Infinity;
    let fadeTimer = 0;
    // What you could see last frame; enemies see you exactly where you see them.
    let seenLast: Float32Array[] | null = null;
    // Sight only changes when you move: worked out again then, into the same arrays.
    const seen = WORLD.levels.map(() => new Float32Array(WORLD.w * WORLD.h));
    let seenFrom = "";
    // Step counts toward you, redone whenever you step onto a new tile.
    let toYou: { key: string; steps: Int16Array | null } = { key: "", steps: null };
    const stepsToYou = () => {
      const z = Math.round(me.alt), tx = Math.floor(me.x), ty = Math.floor(me.y);
      const key = `${z},${tx},${ty}`;
      if (toYou.key !== key) toYou = { key, steps: foeFloor(z, tx, ty) ? stepsFrom(z, tx, ty) : null };
      return toYou.steps;
    };
    snapshot.current = () => ({
      at: { x: me.x, y: me.y, alt: me.alt, facing: me.facing },
      defeated: latest.current.journey.defeated,
      rested: restedAt.current,
      tutorial: tutorialRef.current,
      knot: knotRef.current,
      inventory: invRef.current,
      taken: takenRef.current,
    });
    const meltProgress = () => (meltStart === null ? 0 : Math.min(1, (performance.now() - meltStart) / MELT_MS));
    // The guide: when you first wake it sits on the raised platform east of the room, then drops in,
    // walks to its place and begins the lesson. Every other time it is already there.
    const home = KEEPERS.find(k => k.id === GUIDE)!.at;
    const firstWake = !begin.at && !begin.rested && !begin.tutorial.beaten && begin.tutorial.attempts === 0;
    const guide = {
      x: firstWake ? PERCH.x : home.x, y: firstWake ? PERCH.y : home.y, alt: firstWake ? PERCH.z : home.z,
      phase: (firstWake ? "perch" : "home") as "perch" | "drop" | "walk" | "home", t: 0,
    };
    const updateGuide = (dtMs: number) => {
      if (guide.phase === "perch") {
        guide.t += dtMs;
        if (guide.t >= DROP_DELAY_MS) { guide.phase = "drop"; guide.t = 0; }
      } else if (guide.phase === "drop") {
        guide.t += dtMs;
        const u = Math.min(1, guide.t / DROP_MS);
        guide.x = PERCH.x + (LANDING.x - PERCH.x) * u;
        guide.y = PERCH.y + (LANDING.y - PERCH.y) * u;
        // Falls with a little hop off the edge.
        guide.alt = PERCH.z + (LANDING.z - PERCH.z) * u * u + Math.sin(Math.PI * u) * 0.3;
        if (u >= 1) { guide.phase = "walk"; guide.alt = LANDING.z; }
      } else if (guide.phase === "walk") {
        const dx = home.x - guide.x, dy = home.y - guide.y, d = Math.hypot(dx, dy), step = GUIDE_WALK * dtMs / 1000;
        if (d > step) { guide.x += (dx / d) * step; guide.y += (dy / d) * step; return; }
        guide.x = home.x; guide.y = home.y; guide.phase = "home";
      }
    };
    // The guide is fully there while it arrives or speaks; otherwise it is one presence that
    // fades in as you come near a place you can rest, and out again as you leave.
    const fade: Record<string, number> = Object.fromEntries(KEEPERS.map(k => [k.id, k.id === GUIDE && guide.phase !== "home" ? 1 : 0]));
    const fadeKeepers = (dtMs: number) => {
      const ease = 1 - Math.exp(-3 * dtMs / 1000);
      for (const k of KEEPERS) {
        const d = Math.hypot(k.at.x - me.x, k.at.y - me.y) + Math.abs(k.at.z - me.alt) * 6;
        const present = k.id === GUIDE && (guide.phase !== "home" || talkRef.current);
        const want = present ? 1 : Math.min(1, Math.max(0, (FADE_FAR - d) / (FADE_FAR - FADE_NEAR)));
        fade[k.id] += (want - fade[k.id]) * ease;
      }
    };
    // The camera follows where you appear on screen: your height lifts you up the screen.
    const cam = { x: me.x, y: me.y - me.alt * RISE };
    let T = 0;
    // Painted chunks of each level, as they've come into view (dropped once long out of view).
    type Chunk = { surface: HTMLCanvasElement; faces: HTMLCanvasElement; used: number } | null;
    const chunks = new Map<string, Chunk>();
    let frameNo = 0;
    const chunkAt = (z: number, cx: number, cy: number): Chunk => {
      const key = `${z},${cx},${cy}`;
      let c = chunks.get(key);
      if (c === undefined) {
        const p = paintChunk(z, T, cx, cy);
        c = p && { ...p, used: frameNo };
        chunks.set(key, c);
      }
      if (c) c.used = frameNo;
      return c;
    };
    /** Keeps the cache small: chunks not drawn for a while go (they're repainted if needed). */
    const evictChunks = () => {
      if (chunks.size < 240) return;
      for (const [k, c] of chunks) if (!c || frameNo - c.used > 120) chunks.delete(k);
    };
    // The world is composed here, level by level, before going on screen.
    const scene = makeCanvas(1, 1);
    const sg = scene.getContext("2d")!;
    // What you can see of each level this frame: white where visible, shaded by distance.
    const lights = WORLD.levels.map(() => makeCanvas(1, 1));
    // How brightly you currently see each tile of each level (eased toward what you see now).
    const glow = WORLD.levels.map(() => new Float32Array(WORLD.w * WORLD.h));
    const glowAbove = WORLD.levels.map(() => new Float32Array(WORLD.w * WORLD.h));
    // Brightness of sight, one pixel per tile, stretched (and smoothly blended) over the map.
    const softCanvas = makeCanvas(WORLD.w, WORLD.h);
    const sfg = softCanvas.getContext("2d")!;
    const soft = sfg.createImageData(WORLD.w, WORLD.h);
    // Scratch layer where one view of a level is worked out before joining that level's sight.
    const maskCanvas = makeCanvas(1, 1);
    const mg = maskCanvas.getContext("2d")!;
    // Scratch layer where each slice of a level is cut down to what you can see of it.
    const layer = makeCanvas(1, 1);
    const yg = layer.getContext("2d")!;

    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = Math.round(canvas.clientWidth * dpr), height = Math.round(canvas.clientHeight * dpr);
      if (width === canvas.width && height === canvas.height && T) return;
      canvas.width = width;
      canvas.height = height;
      for (const c of [scene, layer, maskCanvas, ...lights]) { c.width = canvas.width; c.height = canvas.height; }
      const next = Math.max(8, Math.round(Math.min(canvas.height / TILES_TALL, canvas.width / 13)));
      if (next !== T) {
        T = next;
        chunks.clear();
      }
    };
    fit();
    window.addEventListener("resize", fit);

    /** Which way the held keys point, as -1/0/1 on each axis (opposite keys cancel out). */
    const input = () => {
      const h = held.current;
      return {
        ix: (h.includes("right") ? 1 : 0) - (h.includes("left") ? 1 : 0),
        iy: (h.includes("down") ? 1 : 0) - (h.includes("up") ? 1 : 0),
      };
    };

    const update = (dtMs: number) => {
      const dt = dtMs / 1000;
      const { ix, iy } = input();

      // Facing: a single direction faces it; on a diagonal, keep facing whichever of the two
      // you already were, otherwise the most recently pressed. On a ladder you face the wall.
      if (ix || iy) {
        const options: Dir[] = [];
        if (ix) options.push(ix > 0 ? "right" : "left");
        if (iy) options.push(iy > 0 ? "down" : "up");
        if (!options.includes(me.facing)) {
          me.facing = [...held.current].reverse().find(d => options.includes(d)) ?? options[0];
        }
      }
      if (me.climbing) me.facing = "up";

      // Ease toward the target velocity (diagonals are as fast as straight lines, not faster).
      const len = Math.hypot(ix, iy) || 1;
      const top = SPEED * (me.climbing ? LADDER_SPEED : 1);
      const k = 1 - Math.exp(-ACCEL * dt);
      me.vx += ((ix / len) * top - me.vx) * k;
      me.vy += ((iy / len) * top - me.vy) * k;
      if (!ix && Math.abs(me.vx) < 0.01) me.vx = 0;
      if (!iy && Math.abs(me.vy) < 0.01) me.vy = 0;

      // Move one axis at a time, so you slide along walls instead of sticking to them.
      const startX = me.x, startY = me.y;
      const wantX = me.vx * dt, wantY = me.vy * dt;
      me.x = slide(me, "x", wantX);
      if (Math.abs(me.x - startX) < Math.abs(wantX) * 0.5) {
        me.vx = 0;
        if (ix && !iy) me.y = slide(me, "y", cornerNudge(me, "x", ix, top * dt));
      }
      me.y = slide(me, "y", wantY);
      if (Math.abs(me.y - startY) < Math.abs(wantY) * 0.5) {
        me.vy = 0;
        if (iy && !ix) me.x = slide(me, "x", cornerNudge(me, "y", iy, top * dt));
      }

      // Your height follows whatever you're standing on: this is what carries you up and down.
      // Small differences (stairs, ladders) you simply step across; anything bigger, you fall.
      const under = surfaceNear(Math.floor(me.x), Math.floor(me.y), me.x, me.y, me.alt);
      if (under) {
        if (me.fall === 0 && under.h >= me.alt - STEP_TOLERANCE) {
          me.alt = under.h;
        } else {
          me.fall += GRAVITY * dt;
          me.alt -= me.fall * dt;
          if (me.alt <= under.h) { me.alt = under.h; me.fall = 0; }
        }
        me.ground = under.h;
        me.climbing = me.fall === 0 && under.t === LADDER;
      }

      // The walk cycle follows the distance actually covered.
      const moved = Math.hypot(me.x - startX, me.y - startY);
      if (moved < 1e-3) me.walked = 0;
      else me.walked += moved;

      // The camera eases after you.
      const c = 1 - Math.exp(-CAMERA_FOLLOW * dt);
      cam.x += (me.x - cam.x) * c;
      cam.y += (me.y - me.alt * RISE - cam.y) * c;

      grace = Math.max(0, grace - dtMs);
      for (const f of foes) updateFoe(f, dt);

      updateGuide(dtMs);
      // Standing by a keeper, on its level: you can rest there (the guide, once it has arrived).
      const by = KEEPERS.find(k => (k.id !== GUIDE || guide.phase === "home") && Math.abs(k.at.z - me.alt) < 0.2 && Math.hypot(k.at.x - me.x, k.at.y - me.y) < KEEPER_REACH)?.id ?? null;
      if (by !== nearRef.current) { nearRef.current = by; setNear(by); }
      // Gear on the floor within reach.
      const onFloor = PICKUPS.find(p => !takenRef.current.includes(p.id) && Math.abs(p.at.z - me.alt) < 0.2 && Math.hypot(p.at.x - me.x, p.at.y - me.y) < PICKUP_REACH)?.id ?? null;
      if (onFloor !== nearPickupRef.current) { nearPickupRef.current = onFloor; setNearPickup(onFloor); }
    };

    const updateFoe = (f: Foe, dt: number) => {
      const tune = FOE_TUNING[f.def.kind];
      const { home } = f.def;
      const level = Math.round(f.alt);
      const tile = Math.floor(f.y) * WORLD.w + Math.floor(f.x);
      const dist = Math.hypot(me.x - f.x, me.y - f.y);
      const sameLevel = Math.abs(me.alt - f.alt) < 0.5;
      // It sees you exactly when you see it. It only notices you up close, but once chasing,
      // it keeps after you anywhere in sight, however far from home that takes it.
      const inSight = sameLevel && (seenLast?.[level]?.[tile] ?? -1) >= 0;
      const seesYou = !f.def.still && inSight && dist < (f.chasing ? VISION_RADIUS : tune.notice);
      const fromHome = Math.hypot(f.x - home.x, f.y - home.y);

      // Out of sight, it hunts for you where it last saw you; only after a while without
      // seeing you again does it give up, stand a moment, and amble home.
      if (seesYou) {
        f.chasing = true;
        f.lostFor = 0;
        f.lastSeen = null;
        f.seenAt = { x: me.x, y: me.y };
      } else if (f.chasing) {
        if (!f.lastSeen) {
          // Just lost you: head for the last place it saw you.
          const at = f.seenAt ?? { x: me.x, y: me.y };
          const tx = Math.floor(at.x), ty = Math.floor(at.y);
          f.lastSeen = { x: at.x, y: at.y, steps: foeFloor(level, tx, ty) ? stepsFrom(level, tx, ty) : null };
        }
        f.lostFor += dt;
        if (f.lostFor > CHASE_MEMORY) { f.chasing = false; f.lastSeen = null; f.target = null; f.wait = 1; }
      }
      let goal: { x: number; y: number } | null = null, speed = 0;
      if (f.chasing) { goal = f.lastSeen ?? me; speed = tune.chase; }
      else if (f.wait > 0) f.wait -= dt;
      else {
        if (!f.target) {
          if (fromHome > 0.3) f.target = { x: home.x, y: home.y };
          else if (tune.wander > 0) {
            const a = Math.random() * Math.PI * 2, r = 0.6 + Math.random() * (tune.wander - 0.6);
            const tx = home.x + Math.cos(a) * r, ty = home.y + Math.sin(a) * r;
            const there = surfaceNear(Math.floor(tx), Math.floor(ty), tx, ty, f.alt);
            if (there && Math.abs(there.h - f.alt) < 0.01) f.target = { x: tx, y: ty };
            else f.wait = 0.5;
          }
        }
        if (f.target) { goal = f.target; speed = tune.walk; }
      }

      let ix = 0, iy = 0;
      if (goal) {
        const gx = goal.x - f.x, gy = goal.y - f.y, len = Math.hypot(gx, gy);
        if (len < 0.08) {
          // Arrived. Hunting where it last saw you, it just stands there searching.
          if (!f.chasing) { f.target = null; f.wait = 1 + Math.random() * 2.5; }
        } else {
          // Chasing you, hunting the last place it saw you, or heading home: follow the step
          // counts round corners. Ambling about nearby: straight there.
          const steps = f.chasing ? (f.lastSeen ? f.lastSeen.steps : stepsToYou())
            : goal === f.target && f.target.x === home.x && f.target.y === home.y ? f.homeSteps : null;
          const via = waypoint(level, f.x, f.y, goal, steps);
          const vx = via.x - f.x, vy = via.y - f.y, vl = Math.hypot(vx, vy) || 1;
          ix = vx / vl; iy = vy / vl;
        }
      }
      const k = 1 - Math.exp(-ACCEL * 0.6 * dt);
      f.vx += (ix * speed - f.vx) * k;
      f.vy += (iy * speed - f.vy) * k;
      const sx = f.x, sy = f.y;
      f.x = slide(f, "x", f.vx * dt);
      f.y = slide(f, "y", f.vy * dt);
      // Enemies keep to their level: no walking off ledges.
      const under = surfaceNear(Math.floor(f.x), Math.floor(f.y), f.x, f.y, f.alt);
      if (!under || under.h < f.alt - STEP_TOLERANCE) { f.x = sx; f.y = sy; f.vx = f.vy = 0; f.target = null; f.wait = 0.5; }
      else f.alt = under.h;
      const moved = Math.hypot(f.x - sx, f.y - sy);
      if (goal && !f.chasing && moved < 1e-4 && Math.hypot(f.vx, f.vy) > 0.2) { f.target = null; f.wait = 1; } // stuck on a wall
      f.walked = moved < 1e-4 ? 0 : f.walked + moved;
      if (Math.abs(f.vx) > 0.05 || Math.abs(f.vy) > 0.05) {
        f.facing = Math.abs(f.vx) > Math.abs(f.vy) ? (f.vx > 0 ? "right" : "left") : (f.vy > 0 ? "down" : "up");
      }

      // Close enough: the fight begins, and everyone else chasing you piles in.
      if (grace <= 0 && sameLevel && dist < TOUCH && !leaving.current) {
        // The guide's lesson isn't fought bare-handed: it waits until you have a weapon on.
        if (f.def.id === TUTORIAL_FOE && !invRef.current.weapon) {
          const now = performance.now();
          if (now - lastHint > 4000) { lastHint = now; setNote({ text: "You can't fight it bare-handed. Find a weapon and equip it (Esc).", id: Date.now() }); }
          return;
        }
        leaving.current = true;
        held.current = [];
        setEntering(true);
        const backTo = snapshot.current();
        const joining = [f.def, ...pursuers(f)];
        fadeTimer = window.setTimeout(() => latest.current.onEncounter(joining, backTo), ENCOUNTER_FADE_MS);
      }
    };

    /**
     * Who joins the fight `first` starts: the others chasing you, nearest first, as long as the
     * fight stays within MAX_IN_FIGHT enemies. Anyone left out keeps chasing on the map.
     */
    const pursuers = (first: Foe): MapFoe[] => {
      let count = first.def.fight.length;
      const out: MapFoe[] = [];
      const chasing = foes
        .filter(f => f !== first && f.chasing)
        .sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y));
      for (const f of chasing) {
        if (count + f.def.fight.length > MAX_IN_FIGHT) continue;
        count += f.def.fight.length;
        out.push(f.def);
      }
      return out;
    };

    /**
     * Draws the enemies and keepers on level z whose feet are on a row that passes `test`, as
     * seen from the camera at (ox, oy), back ones first.
     */
    const drawFoes = (ctx: CanvasRenderingContext2D, z: number, ox: number, oy: number, test: (y: number) => boolean) => {
      const list: { y: number; draw: () => void }[] = [];
      for (const f of foes) {
        if (Math.round(f.alt) !== z || !test(f.y)) continue;
        list.push({ y: f.y, draw: () => {
          const phase = Math.floor(f.walked / STRIDE) % 4;
          const frame: Frame = f.walked <= 0 ? "stand" : phase === 0 ? "stepR" : phase === 2 ? "stepL" : "stand";
          // Each member of the group drawn as what it is, back ones first.
          const spots = huddle(f.def.fight.length);
          const members = f.def.fight.map((m, i) => ({ kind: m.kind, at: spots[i] })).sort((a, b) => a.at[1] - b.at[1]);
          for (const { kind, at: [dx, dy] } of members) {
            const px = ox + (f.x + dx) * T, py = oy + (f.y + dy - f.alt * RISE - BODY_ABOVE_FEET) * T;
            MAP_FIGURES[kind](ctx, px, py, T, f.facing, frame);
          }
        } });
      }
      for (const p of PICKUPS) {
        if (takenRef.current.includes(p.id) || p.at.z !== z || !test(p.at.y)) continue;
        list.push({ y: p.at.y, draw: () => drawPickup(ctx, ox + p.at.x * T, oy + (p.at.y - p.at.z * RISE - BODY_ABOVE_FEET) * T, T, performance.now(), p.look) });
      }
      for (const def of MAP_FOES) {
        if (!def.lies || !begin.defeated.includes(def.id) || def.home.z !== z || !test(def.home.y)) continue;
        list.push({ y: def.home.y, draw: () => drawFallenWaxed(ctx, ox + def.home.x * T, oy + (def.home.y - def.home.z * RISE - BODY_ABOVE_FEET) * T, T) });
      }
      for (const k of KEEPERS) {
        // The guide may be dropping in or walking over; the others stand where they are.
        const at = k.id === GUIDE ? { x: guide.x, y: guide.y, z: guide.alt } : k.at;
        if (Math.round(at.z) !== z || !test(at.y) || fade[k.id] < 0.02) continue;
        list.push({ y: at.y, draw: () => {
          const px = ox + at.x * T, py = oy + (at.y - at.z * RISE - BODY_ABOVE_FEET) * T;
          ctx.globalAlpha = fade[k.id];
          drawKeeper(ctx, px, py, T, (restedAt.current ?? "start") === k.id, performance.now());
          ctx.globalAlpha = 1;
        } });
      }
      // Wax standing in the start room's exits.
      if (sealsUp()) {
        const melt = meltProgress();
        for (const s of SEALS) {
          if (s.z !== z || !test(s.y)) continue;
          list.push({ y: s.y + 0.5, draw: () => drawSeal(ctx, ox + s.x * T, oy + (s.y - s.z * RISE) * T, T, melt) });
        }
      }
      list.sort((a, b) => a.y - b.y).forEach(d => d.draw());
    };

    const draw = (dtMs: number) => {
      const W = canvas.width, H = canvas.height;
      // Snap to whole pixels so the tiles don't shimmer while scrolling.
      const ox = Math.round(W / 2 - cam.x * T);
      const oy = Math.round(H / 2 - (cam.y - BODY_ABOVE_FEET) * T);
      const levelY = (z: number) => oy - Math.round(z * RISE * T);
      fadeKeepers(dtMs);
      const fx = ox + me.x * T, fy = oy + (me.y - me.alt * RISE) * T;

      // Sight, one mask per level.
      // - Levels at or below you: pinned to that level's own height, so they never slide as you
      //   climb, and seen across that level's own grid (from a bridge you look out over the hall
      //   below). If that level is solid rock where you stand, your own level's sight is used.
      // - Levels above you: seen only through your own level's sight, held at your own eye
      //   height. From below you only glimpse their near edge, and more of them comes into view
      //   as you climb toward them.
      const from = `${me.x},${me.y},${me.alt}`;
      if (from !== seenFrom) {
        sight(me.x, me.y, me.alt, seen);
        seenFrom = from;
      }
      const seenAll = seen;
      seenLast = seenAll;
      const ownLevel = Math.max(0, Math.min(LEVELS - 1, Math.round(me.alt)));
      const strip = Math.ceil(T / 12) + 1, rise = RISE * T, fadeOver = VISION_RADIUS * (1 - VISION_FULL);
      const { w: MW, h: MH } = WORLD;
      const ease = 1 - Math.exp(-SIGHT_EASE * dtMs / 1000);
      /**
       * Paints into `lights[z]` what you see of a level, judged by sight `left` on level gz's
       * tiles, placed with its top row at `top`. `shown` holds the eased brightness per tile.
       */
      const paintSight = (z: number, gz: number, left: Float32Array, top: number, shown: Float32Array): boolean => {
        let any = false;
        // Ease each tile's brightness toward what you see now, so sight fades in and out.
        for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
          const i = y * MW + x;
          const target = seeThrough(gz, x, y) && left[i] >= 0 ? Math.min(1, left[i] / fadeOver) : 0;
          shown[i] += (target - shown[i]) * ease;
          if (shown[i] < 0.002) shown[i] = 0;
          else any = true;
        }
        // Nothing of this level in sight: nothing to paint.
        if (!any) return false;
        const lit = (x: number, y: number) =>
          x >= 0 && y >= 0 && x < MW && y < MH && seeThrough(gz, x, y) ? shown[y * MW + x] : 0;
        // Tiles with light, or right next to some: the soft brightness below fades out across
        // these, so nothing switches on abruptly at the edge of your sight.
        const near = (x: number, y: number) => {
          if (!seeThrough(gz, x, y)) return false;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (lit(x + dx, y + dy) > 0) return true;
          return false;
        };

        // The shape of what you see, crisp at the walls: every tile near light, plus the
        // near edges of the walls around them (their rim, and their face if it's toward you).
        mg.globalCompositeOperation = "source-over";
        mg.clearRect(0, 0, W, H);
        mg.fillStyle = "#fff";
        for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
          const px = ox + x * T, py = top + y * T;
          if (near(x, y)) {
            const t = tileAt(gz, x, y);
            // Stairs rise over the tile behind them; ledges hang a face over the tile in front.
            const up = isRamp(t) ? rise : 0;
            const down = t === FLOOR && isAir(gz, x, y + 1) ? (gz - groundBelow(gz, x, y + 1)) * rise : 0;
            mg.fillRect(px, py - up, T, T + up + down);
          } else if (!seeThrough(gz, x, y)) {
            if (lit(x, y - 1) > 0) mg.fillRect(px, py, T, strip);
            if (lit(x, y + 1) > 0) mg.fillRect(px, py + T - rise - strip, T, rise + strip);
            if (lit(x - 1, y) > 0) mg.fillRect(px, py, strip, T);
            if (lit(x + 1, y) > 0) mg.fillRect(px + T - strip, py, strip, T);
          }
        }

        // How brightly: one value per tile, blended smoothly between tiles. Walls take the
        // brightness of the floor beside them.
        const pix = soft.data;
        for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
          let a = lit(x, y);
          if (!seeThrough(gz, x, y)) a = Math.max(lit(x, y - 1), lit(x, y + 1), lit(x - 1, y), lit(x + 1, y));
          const k = (y * MW + x) * 4;
          pix[k] = pix[k + 1] = pix[k + 2] = 255;
          pix[k + 3] = Math.round(a * 255);
        }
        sfg.putImageData(soft, 0, 0);
        mg.globalCompositeOperation = "destination-in";
        mg.imageSmoothingEnabled = true;
        mg.drawImage(softCanvas, ox, top, MW * T, MH * T);
        const lg = lights[z].getContext("2d")!;
        lg.drawImage(maskCanvas, 0, 0);
        return true;
      };

      // Levels with nothing in sight are skipped altogether below.
      const inSight: boolean[] = [];
      frameNo++;
      for (let z = 0; z < LEVELS; z++) {
        lights[z].getContext("2d")!.clearRect(0, 0, W, H);
        // What sight reaches of this level, pinned to the level's own height.
        inSight[z] = paintSight(z, z, seenAll[z], levelY(z), glow[z]);
        // Levels above you are also glimpsed through your own level's sight, held at your eye
        // height: from below you catch their near edge, and more as you climb toward them.
        if (z > me.alt + 1e-3 && paintSight(z, ownLevel, seenAll[ownLevel], oy - me.alt * RISE * T, glowAbove[z])) inSight[z] = true;
      }

      /**
       * Draws rows r0..r1 of level z, with the enemies standing in them that pass `test`,
       * cut down to what you can see of that level.
       */
      const rows = (z: number, r0: number, r1: number, test: (y: number) => boolean = () => true) => {
        if (r1 <= r0) return;
        yg.globalCompositeOperation = "source-over";
        yg.clearRect(0, 0, W, H);
        // Only the chunks on screen, and only the slice of rows asked for.
        const top = levelY(z);
        const vr0 = Math.max(r0, Math.floor(-top / T) - 1), vr1 = Math.min(r1, Math.ceil((H - top) / T) + 1);
        const cx0 = Math.max(0, Math.floor(-ox / T / CHUNK)), cx1 = Math.min(Math.ceil(WORLD.w / CHUNK) - 1, Math.floor((W - ox) / T / CHUNK));
        const cyMax = Math.ceil(WORLD.h / CHUNK) - 1;
        const piece = (img: HTMLCanvasElement, cx: number, from: number, a: number, b: number, shift: number) => {
          // Rows a..b of a chunk layer whose first row is `from`.
          if (b <= a) return;
          const sx = 0, sy = (a - from) * T, sw = CHUNK * T, sh = (b - a) * T;
          yg.drawImage(img, sx, sy, sw, sh, ox + cx * CHUNK * T, top + a * T + shift, sw, sh);
        };
        if (vr1 > vr0) {
          // Surfaces, north to south (each chunk's top pad holds stairs rising into the row above).
          for (let cy = Math.max(0, Math.floor(vr0 / CHUNK)); cy <= Math.min(cyMax, Math.floor(vr1 / CHUNK) + 1); cy++) {
            for (let cx = cx0; cx <= cx1; cx++) {
              const c = chunkAt(z, cx, cy);
              if (!c) continue;
              const from = cy * CHUNK - CHUNK_PAD_TOP;
              piece(c.surface, cx, from, Math.max(vr0, from), Math.min(vr1, cy * CHUNK + CHUNK), 0);
            }
          }
          // Then the cliff faces (each hangs one row below the tile it belongs to, and may run on).
          for (let cy = Math.max(0, Math.floor((vr0 - CHUNK_PAD_BOTTOM) / CHUNK)); cy <= Math.min(cyMax, Math.floor(vr1 / CHUNK)); cy++) {
            for (let cx = cx0; cx <= cx1; cx++) {
              const c = chunkAt(z, cx, cy);
              if (!c) continue;
              const from = cy * CHUNK;
              piece(c.faces, cx, from, Math.max(vr0, from), Math.min(vr1, from + CHUNK + CHUNK_PAD_BOTTOM), T);
            }
          }
        }
        drawFoes(yg, z, ox, oy, y => y >= r0 && y < r1 && test(y));
        yg.globalCompositeOperation = "destination-in";
        yg.drawImage(lights[z], 0, 0);
        sg.drawImage(layer, 0, 0);
      };
      /** Enemies alone on level z, cut down to what you can see of it (those in front of you). */
      const foesOnly = (z: number, test: (y: number) => boolean) => {
        yg.globalCompositeOperation = "source-over";
        yg.clearRect(0, 0, W, H);
        drawFoes(yg, z, ox, oy, test);
        yg.globalCompositeOperation = "destination-in";
        yg.drawImage(lights[z], 0, 0);
        sg.drawImage(layer, 0, 0);
      };

      // Each stretch of STRIDE lifts a foot, then lands it: right, stand, left, stand.
      const phase = Math.floor(me.walked / STRIDE) % 4;
      const frame: Frame = me.walked <= 0 ? "stand" : phase === 0 ? "stepR" : phase === 2 ? "stepL" : "stand";

      // Levels at or below you go down whole. Levels above are split at your row: the part
      // behind you first, then you, then the part in front of or over you.
      sg.clearRect(0, 0, W, H);
      const base = Math.floor(me.alt + 1e-3);
      const split = Math.max(0, Math.min(WORLD.h, Math.floor(me.y)));
      // On your own level, enemies further down the screen than you go in front of you.
      for (let z = 0; z < LEVELS; z++) {
        if (inSight[z]) rows(z, 0, z <= base ? WORLD.h : split, y => z !== base || y <= me.y);
        // Whatever lies below you is dimmed, more so the further down: it reads as depth.
        const below = Math.min(1, Math.max(0, me.alt - z));
        if (below > 0 && z < LEVELS - 1) {
          sg.fillStyle = `rgb(0 0 0 / ${DEPTH_DIM * below})`;
          sg.fillRect(0, 0, W, H);
        }
      }
      drawWalker(sg, fx, fy - BODY_ABOVE_FEET * T, T, me.facing, frame, true, (me.alt - me.ground) * RISE);
      if (base < LEVELS && inSight[base]) foesOnly(base, y => y > me.y);
      for (let z = base + 1; z < LEVELS; z++) if (inSight[z]) rows(z, split, WORLD.h);
      evictChunks();

      g.fillStyle = COLORS.void;
      g.fillRect(0, 0, W, H);
      g.drawImage(scene, 0, 0);
      // Your outline shows faintly through anything covering you (it vanishes into you otherwise).
      g.globalAlpha = GHOST_ALPHA;
      drawWalker(g, fx, fy - BODY_ABOVE_FEET * T, T, me.facing, frame, false);
      g.globalAlpha = 1;
    };

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(now - last, 100);
      last = now;
      // The guide's relief is over: the wax runs, and goes for good once it has.
      if (melting.current && meltStart === null) meltStart = now;
      if (meltStart !== null && meltProgress() >= 1 && sealsUp()) { setSeals(false); setNote({ text: "The wax runs away. The way is open.", id: Date.now() }); }
      if (!pausedRef.current && !talkRef.current && !leaving.current) update(dt);
      draw(dt);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); window.clearTimeout(fadeTimer); window.removeEventListener("resize", fit); };
  }, []);

  return (
    <div className="explore">
      <canvas ref={canvasRef} className="explore-canvas" />
      {nearPickup && !paused && !entering && !talk && (
        <div className="explore-prompt"><kbd>E</kbd> Pick up the {gearName(PICKUPS.find(p => p.id === nearPickup)!.gear).toLowerCase()}</div>
      )}
      {near && !nearPickup && !paused && !entering && !talk && (
        <div className="explore-prompt"><kbd>E</kbd> {near === GUIDE ? (tutorialRef.current.beaten ? "Rest with the guide" : "Speak with the guide") : "Rest"}</div>
      )}
      {sleeping && <div className="explore-sleep" />}
      {talk && <Dialogue speaker="The guide" text={talk.lines[talk.at]} last={talk.at + 1 >= talk.lines.length} />}
      {note && <div key={note.id} className="explore-note">{note.text}</div>}
      {entering && <div className="explore-fade" />}
      {paused && <Inventory inv={inv} knot={knot} focus={invFocus} onFocus={setInvFocus} onExit={() => onExit(snapshot.current())} />}
    </div>
  );
}
