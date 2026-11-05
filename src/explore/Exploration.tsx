/**
 * Exploration.tsx — the exploration screen: a top-down dungeon you walk around with WASD or the
 * arrows.
 *
 * Movement is free (positions are floats) over a grid of tiles. E picks up what lies at your feet, speaks
 * with the guide by a keeper, or else opens the inventory (Q closes it); Escape pauses.
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
import { PLAYER_MAX_HP } from "../combat/fight";
import type { Player } from "../core/types";
import { dirOf, wrapIndex } from "../ui/input";
import { type MenuOption, PauseMenu } from "../ui/Menu";
import { Dialogue } from "./Dialogue";
import { drawBlobTop, drawPickup, drawKeeper, drawWalker, type Frame, MAP_FIGURES, MAP_REMAINS, playerLook } from "./figures";
import { equippedSide, equipSide, gearName, type GearSpec, hasMemories, type Inventory as Bag, loadoutOf, readDreams, receive, setEternal, type Slot, unequip } from "./gear";
import { GearSprite } from "./GearIcons";
import { GuideMenu } from "./GuideMenu";
import { type InvFocus, InventoryScreen, type Place } from "./InventoryScreen";
import { type GroundItem, PICKUP_REACH, PICKUPS } from "./pickups";
import { CHASE_MEMORY, type Corpse, ENCOUNTER_FADE_MS, type Foe, FOE_TUNING, foeFloor, GRACE_MS, huddle, inFightArea, livingDef, MAP_FOES, type MapFoe, MAX_IN_FIGHT, memberKey, stepsFrom, TOUCH, wakeEnemies, waypoint, withCorpses } from "./foes";
import { FADE_FAR, FADE_NEAR, KEEPER_REACH, KEEPERS } from "./keepers";
import { cornerNudge, slide, surfaceNear, type Walker } from "./movement";
import { createMapRenderer, type Light } from "./render";
import { sight } from "./sight";
import { type After, CHAT, FIRST_FLOOR_KEEPER, GIFT, type Knot, knotCharges, type Talk, type TutorialState } from "./tutorial";
import { ACCEL, BODY_ABOVE_FEET, CAMERA_FOLLOW, FALL_DEATH_ALT, GRAVITY, HALF_W, LADDER_SPEED, RISE, SPEED, STAIRS_SPEED, STEP_TOLERANCE, STRIDE, VISION_RADIUS } from "./tuning";
import { type Dir, LADDER, ladderSpan, LEVELS, STAIRS, WORLD } from "./world";

/** How long what you picked up stays on screen, fading at the end. */
const PICKED_UP_MS = 2200;

/** Resting is a sleep: how long the screen is dark in all, and when, in the dark, it happens. */
const SLEEP_MS = 2400;
const SLEEP_MID_MS = 1100;

/** Your progress on the map, kept while you're away fighting. */
export interface Journey {
  /** Where you are; missing means where you wake: by the keeper you last rested by, or the start. */
  at?: { x: number; y: number; alt: number; facing: Dir };
  /** Enemies already beaten (they stay gone, until you rest: then the sleepwalkers get up again). */
  defeated: string[];
  /** Where each beaten enemy lies (by member: see `memberKey`). The sleepwalkers' remains go when you rest; the others stay for good. */
  corpses?: Record<string, Corpse>;
  /** Gear lying on the ground where enemies fell, or where you let go of it. */
  ground?: GroundItem[];
  /** Set as a fight starts: where each of its enemies would lie if it fell, so the map can leave them there after a win. */
  fallen?: Record<string, Corpse>;
  /** The keeper you last rested by (a keeper's id). */
  rested?: string;
  /** The guide's teaching: the lesson passed, and the knot given at the first floor's safe spot. */
  tutorial: TutorialState;
  /** The guide's gift, once given: your revive for the demo (see tutorial.ts). */
  knot?: Knot;
  /** What you carry (and wear). */
  inventory: Bag;
  /** Your Eternity, as the last fight left it (missing: full). It fills again only when you reawaken: resting by a keeper, or falling. */
  eternity?: number;
  /** Gear lying on the map that you have already picked up (ids from pickups.ts). */
  taken: string[];
}

export function Exploration({ journey, onEncounter, onSave, onDie, onExit }: {
  journey: Journey;
  /**
   * A fight starts: the enemy that reached you, then any others chasing you that join in, and
   * where you were, to come back to afterwards.
   */
  onEncounter: (foes: MapFoe[], journey: Journey) => void;
  /** Your progress is worth keeping now (you rested, the guide gave you something). */
  onSave: (journey: Journey) => void;
  /** You fall where you stand (you chose to reawaken, or fell through the map): you wake by the keeper you last rested by, as after a lost fight. */
  onDie: (journey: Journey) => void;
  /** Back to the main menu, with where you stand. */
  onExit: (journey: Journey) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The screen goes dark as a fight begins; input stops.
  const [entering, setEntering] = useState(false);
  // The map being got ready before the first frame (how far along it is, 0 to 1), or null once it is.
  const [preparing, setPreparing] = useState<number | null>(0);
  const leaving = useRef(false);
  const latest = useRef({ journey, onEncounter, onSave, onDie });
  latest.current = { journey, onEncounter, onSave, onDie };
  /**
   * What is open over the map, if anything (the map stands still meanwhile): the inventory (E; `start`:
   * where its cursor begins), the guide's menu (E by a keeper), or the pause menu (Esc).
   */
  type Screen = { kind: "inventory"; start?: InvFocus } | { kind: "guide"; unwindFirst?: boolean } | { kind: "pause" };
  const [screen, setScreen] = useState<Screen | null>(null);
  const pausedRef = useRef(false);
  pausedRef.current = screen !== null;
  const paused = screen !== null;
  const [pauseAt, setPauseAt] = useState(0);
  const held = useRef<Dir[]>([]);
  // The keeper you last rested by, and the one you're standing by now (if any).
  const restedAt = useRef<string | undefined>(journey.rested);
  const nearRef = useRef<string | null>(null);
  const [near, setNear] = useState<string | null>(null);
  // What you just picked up: its sprite and name pop up in a box where the "E Pick Up" prompt was, then fade.
  const [got, setGot] = useState<{ gear: GearSpec; id: number } | null>(null);
  useEffect(() => {
    if (!got) return;
    const t = window.setTimeout(() => setGot(cur => (cur?.id === got.id ? null : cur)), PICKED_UP_MS);
    return () => window.clearTimeout(t);
  }, [got]);
  // The knot you carry, if you've been given it. Resting winds it tight again.
  const knotRef = useRef<Knot | undefined>(journey.knot);
  const [, setKnotState] = useState<Knot | undefined>(journey.knot);
  const setKnot = (k: Knot | undefined) => { knotRef.current = k; setKnotState(k); };
  // Your Eternity between fights (missing: full). Resting fills it again.
  const eternityRef = useRef<number | undefined>(journey.eternity);
  // What you carry.
  const invRef = useRef<Bag>(journey.inventory);
  const [inv, setInvState] = useState<Bag>(journey.inventory);
  const setInv = (b: Bag) => { invRef.current = b; setInvState(b); };
  // Gear on the floor: what you've taken, and what you're standing by.
  const takenRef = useRef<string[]>(journey.taken);
  // Who lies beaten, and where: the sleepwalkers get up again when you rest by a keeper (their remains go with them); the waxed and the Warden stay dead.
  const defeatedRef = useRef<string[]>(journey.defeated);
  // (A save from before the remains were kept: each beaten group lies where it started.)
  const corpsesRef = useRef<Record<string, Corpse>>(withCorpses(journey.corpses ?? {}, journey.defeated));
  /** Set up by the map's loop: the sleepwalkers get up again, back where they started. */
  const respawnRef = useRef<() => void>(() => {});
  const groundRef = useRef<GroundItem[]>(journey.ground ?? []);
  const nearPickupRef = useRef<string | null>(null);
  const [nearPickup, setNearPickup] = useState<string | null>(null);
  /** Everything lying within reach to be picked up: gear set on the map that you haven't taken, and what lies where things fell. */
  const floorItems = () => [
    ...PICKUPS.filter(p => !takenRef.current.includes(p.id)).map(p => ({ id: p.id, at: p.at, gear: p.gear })),
    ...groundRef.current.map(g => ({ id: g.id, at: g.at, gear: g.gear })),
  ];
  /** Takes an item off the floor (wherever it lies). */
  const lift = (id: string) => {
    if (PICKUPS.some(p => p.id === id)) takenRef.current = [...takenRef.current, id];
    else groundRef.current = groundRef.current.filter(g => g.id !== id);
    nearPickupRef.current = null;
    setNearPickup(null);
  };
  /** What lies within reach on the ground, for each slot: the nearest (set by the map's loop). */
  const reachRef = useRef<string[]>([]);
  const groundNear = (): Partial<Record<Slot, GearSpec>> => {
    const items = floorItems();
    const out: Partial<Record<Slot, GearSpec>> = {};
    for (const id of reachRef.current) {
      const item = items.find(x => x.id === id);
      if (item && !out[item.gear.slot]) out[item.gear.slot] = item.gear;
    }
    return out;
  };
  /**
   * Takes the item lying within reach for this slot: an eternal piece goes with your memories; an
   * ordinary one into the slot's ordinary place, and if one was there already, that one is left on the
   * ground where the new one lay (a swap). Neither is put on by this (but a swapped piece takes the place
   * of the one you wielded, if you did).
   */
  const takeFromGround = (id: string) => {
    const item = floorItems().find(x => x.id === id);
    if (!item) return;
    lift(item.id);
    const { inventory, replaced } = receive(invRef.current, [item.gear], false);
    for (const old of replaced) {
      const { id: _id, ...left } = old;
      groundRef.current = [...groundRef.current, { id: `left-${Date.now()}-${old.id}`, at: item.at, gear: left as GearSpec }];
    }
    reachRef.current = reachRef.current.filter(x => x !== id);
    setInv(inventory);
    setGot({ gear: item.gear, id: Date.now() });
    latest.current.onSave(snapshot.current());
  };
  /**
   * E by gear on the floor: a memory (eternal) is picked up at once; anything you could wield opens the
   * inventory on that slot's ground place, to take it into your ordinary place (or swap it for what is there).
   */
  const pickUp = () => {
    const item = floorItems().find(x => x.id === nearPickupRef.current);
    if (!item) return;
    held.current = [];
    if (item.gear.eternal) { takeFromGround(item.id); return; }
    setScreen({ kind: "inventory", start: { row: item.gear.slot === "weapon" ? 0 : 1, place: "ground" } });
  };
  /** E on a place of the inventory: wield it (or unequip it, if you already wield it), or take what lies on the ground. */
  const useInventory = (slot: Slot, place: Place) => {
    if (place === "ground") {
      const items = floorItems();
      const id = reachRef.current.find(x => items.find(i => i.id === x)?.gear.slot === slot);
      if (id) takeFromGround(id);
      return;
    }
    const cur = invRef.current;
    setInv(equippedSide(cur, slot) === place && (cur[slot] !== null) ? unequip(cur, slot, place) : equipSide(cur, slot, place));
  };
  /** You, as your bars show you between fights: full health, the knot's revive and your Eternity. */
  const barsPlayer = (): Player => {
    const look = loadoutOf(invRef.current);
    return {
      id: "player", name: "You", maxHP: PLAYER_MAX_HP, hp: PLAYER_MAX_HP, fatigue: 0, death: 0,
      weapon: look.weapon, armor: look.armor, waxed: false, staggered: false,
      charges: knotCharges(knotRef.current), reviving: false,
      maxEternity: PLAYER_MAX_HP, eternity: Math.min(PLAYER_MAX_HP, eternityRef.current ?? PLAYER_MAX_HP),
    };
  };
  // Where the tutorial stands (it moves on while you are here).
  const tutorialRef = useRef<TutorialState>(journey.tutorial);
  // Resting is a sleep: the screen fades out, you settle by the guide, and fades back in. What it
  // does happens in the dark; afterwards `woke` says what you wake to.
  const [sleeping, setSleeping] = useState(false);
  const sleepTimers = useRef<number[]>([]);
  useEffect(() => () => sleepTimers.current.forEach(t => window.clearTimeout(t)), []);
  /** Dying where you stand (the pause menu's Reawaken, or falling through the map): the screen goes dark, and you wake by the keeper you last rested by, having lost your ordinary gear, as after a lost fight. */
  const reawaken = () => {
    if (leaving.current) return;
    held.current = [];
    leaving.current = true;
    setScreen(null);
    setSleeping(true);
    sleepTimers.current.push(window.setTimeout(() => latest.current.onDie(snapshot.current()), SLEEP_MID_MS));
  };
  const reawakenRef = useRef(reawaken);
  reawakenRef.current = reawaken;
  const rest = () => {
    const id = nearRef.current;
    if (!id) return;
    const gift = id === FIRST_FLOOR_KEEPER && !tutorialRef.current.done;
    held.current = [];
    leaving.current = true;
    setSleeping(true);
    sleepTimers.current = [
      // In the dark: your candle moves here, and the knot, if slack, winds itself tight.
      window.setTimeout(() => {
        restedAt.current = id;
        respawnRef.current();
        eternityRef.current = undefined;
        if (knotRef.current === "unwound") setKnot("wound");
      }, SLEEP_MID_MS),
      window.setTimeout(() => {
        setSleeping(false);
        leaving.current = false;
        latest.current.onSave(snapshot.current());
        if (gift) setTalk({ ...GIFT, at: 0 });
      }, SLEEP_MS),
    ];
  };

  // The guide speaking: its lines, which one you're at, and what follows the last. The map
  // stands still meanwhile.
  const [talk, setTalk] = useState<(Talk & { at: number }) | null>(null);
  const talkRef = useRef(false);
  talkRef.current = talk !== null;
  // Where you stand now, as a Journey (set by the map's loop).
  const snapshot = useRef<() => Journey>(() => latest.current.journey);
  /** What follows the guide's last words: the knot, once, at the first floor's safe spot. */
  const then = (after: After) => {
    // Talking from the guide's menu: back to it.
    if (after === "guide") { setScreen({ kind: "guide" }); return; }
    if (after !== "knot") return;
    tutorialRef.current = { ...tutorialRef.current, done: true };
    setKnot("wound");
    latest.current.onSave(snapshot.current());
  };

  /**
   * Speaking with the guide by a keeper. The first time after you have found a memory, its menu opens
   * right on Unwind Memories (and from then on, it is one of its options).
   */
  const openGuide = () => {
    const first = hasMemories(invRef.current) && !tutorialRef.current.unwound;
    if (first) { tutorialRef.current = { ...tutorialRef.current, unwound: true }; latest.current.onSave(snapshot.current()); }
    setScreen({ kind: "guide", unwindFirst: first });
  };
  /** The pause menu (Esc): carry on, die here and wake by the last safe spot, or back to the main menu (it saves). */
  const pauseOptions = (): MenuOption[] => [
    { label: "Resume", run: () => setScreen(null) },
    { label: "Reawaken", run: () => reawakenRef.current() },
    { label: "Save and Quit", run: () => onExit(snapshot.current()) },
  ];

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
    // The inventory and the guide's menu read their own keys.
    if (screen && screen.kind !== "pause") return;
    if (key === "escape") {
      e.preventDefault();
      if (!e.repeat) { held.current = []; setPauseAt(0); setScreen(s => (s ? null : { kind: "pause" })); }
      return;
    }
    if (screen?.kind === "pause") {
      // The pause menu: W/S choose, E picks, Q (or Esc) resumes.
      e.preventDefault();
      if (e.repeat) return;
      const options = pauseOptions();
      if (dir === "up" || dir === "down") setPauseAt(i => wrapIndex(i, dir === "up" ? -1 : 1, options.length));
      else if (key === "e" || key === "enter" || key === " ") options[pauseAt]?.run();
      else if (key === "q") setScreen(null);
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
    // E: pick up what lies here, or speak with the guide by a keeper, or open the inventory.
    if ((key === "e" || key === "enter") && !e.repeat) {
      e.preventDefault();
      held.current = [];
      if (nearPickupRef.current) pickUp();
      else if (nearRef.current) openGuide();
      else setScreen({ kind: "inventory" });
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
    const { start } = WORLD;
    const { journey: begin } = latest.current;
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
    // Everyone not yet beaten (or, of a group, whoever is not dead for good), back where they started.
    const makeFoe = (def: MapFoe): Foe => ({
      def, half: def.girth, x: def.home.x, y: def.home.y, alt: def.home.z, vx: 0, vy: 0, facing: "down", walked: 0,
      climbing: false, fall: 0, ground: def.home.z, target: null, wait: Math.random() * 2, chasing: false, lostFor: 0, lastSeen: null, seenAt: null, aimX: 0, aimY: 1, reach: 0,
      homeSteps: stepsFrom(def.home.z, Math.floor(def.home.x), Math.floor(def.home.y)),
    });
    /** Everyone who is up: each group not beaten, whoever in it is not dead for good, at its start. */
    const spawn = () => MAP_FOES.filter(f => !defeatedRef.current.includes(f.id)).flatMap(f => {
      const def = livingDef(f, corpsesRef.current);
      return def ? [makeFoe(def)] : [];
    });
    const foes: Foe[] = spawn();
    respawnRef.current = () => {
      // The sleepwalkers get up again, their remains and drops gone; the waxed and the Warden stay dead.
      const woke = wakeEnemies({ corpses: corpsesRef.current, defeated: defeatedRef.current });
      corpsesRef.current = woke.corpses;
      groundRef.current = woke.ground;
      defeatedRef.current = woke.defeated;
      // Everyone else goes back to where they started too, whatever they were doing.
      foes.splice(0, foes.length, ...spawn());
    };
    let grace = GRACE_MS;
    let fadeTimer = 0;
    // What you could see last frame; enemies see you exactly where you see them.
    let seenLast: Float32Array[] | null = null;
    // Sight only changes when you move: worked out again then, into the same arrays.
    const seen = WORLD.levels.map(() => new Float32Array(WORLD.w * WORLD.h));
    // And where each tile's light comes from (you, or the doorway it was seen through): the renderer fades light round those.
    const origins = WORLD.levels.map(() => new Int32Array(WORLD.w * WORLD.h));
    // Which levels sight reached at all.
    const reached = new Uint8Array(LEVELS);
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
      defeated: defeatedRef.current,
      corpses: corpsesRef.current,
      ground: groundRef.current,
      rested: restedAt.current,
      tutorial: tutorialRef.current,
      knot: knotRef.current,
      inventory: invRef.current,
      eternity: eternityRef.current,
      taken: takenRef.current,
    });
    // The guide is one presence: it fades in beside whichever keeper you come near, and out again as
    // you leave (and stays while it speaks).
    const fade: Record<string, number> = Object.fromEntries(KEEPERS.map(k => [k.id, 0]));
    const fadeKeepers = (dtMs: number) => {
      const ease = 1 - Math.exp(-3 * dtMs / 1000);
      for (const k of KEEPERS) {
        const d = Math.hypot(k.at.x - me.x, k.at.y - me.y) + Math.abs(k.at.z - me.alt) * 6;
        const present = talkRef.current && k.id === restedAt.current;
        const want = present ? 1 : Math.min(1, Math.max(0, (FADE_FAR - d) / (FADE_FAR - FADE_NEAR)));
        fade[k.id] += (want - fade[k.id]) * ease;
      }
    };
    // The camera follows where you appear on screen: your height lifts you up the screen.
    const cam = { x: me.x, y: me.y - me.alt * RISE };
    const renderer = createMapRenderer(canvas);

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

      // Ladders are climbed in place: up and down change your height while you hold still against
      // the wall. At the bottom or the top, pressing out (down or up) or sideways walks you off.
      const startX = me.x, startY = me.y, startAlt = me.alt;
      const tx0 = Math.floor(me.x), ty0 = Math.floor(me.y);
      const span = surfaceNear(tx0, ty0, me.x, me.y, me.alt)?.t === LADDER ? ladderSpan(tx0, ty0, me.alt) : null;
      const atBottom = !span || me.alt <= span.bottom + 1e-3, atTop = !span || me.alt >= span.top - 1e-3;
      const pinned = !!span && ((iy < 0 && !atTop) || (iy > 0 && !atBottom) || (!atBottom && !atTop));
      me.climbing = pinned;
      if (pinned) {
        me.facing = "up";
        me.vx = me.vy = 0;
        me.fall = 0;
        const pull = Math.min(1, 12 * dt);
        me.x += (tx0 + 0.5 - me.x) * pull;
        me.y += (ty0 + 0.45 - me.y) * pull;
        me.alt = Math.min(span!.top, Math.max(span!.bottom, me.alt - iy * SPEED * LADDER_SPEED * dt));
        me.ground = me.alt;
      } else {
      // Ease toward the target velocity (diagonals are as fast as straight lines, not faster).
      const len = Math.hypot(ix, iy) || 1;
      const onStairs = surfaceNear(Math.floor(me.x), Math.floor(me.y), me.x, me.y, me.alt)?.t === STAIRS;
      const top = SPEED * (onStairs ? STAIRS_SPEED : 1);
      const k = 1 - Math.exp(-ACCEL * dt);
      me.vx += ((ix / len) * top - me.vx) * k;
      me.vy += ((iy / len) * top - me.vy) * k;
      if (!ix && Math.abs(me.vx) < 0.01) me.vx = 0;
      if (!iy && Math.abs(me.vy) < 0.01) me.vy = 0;

      // Move one axis at a time, so you slide along walls instead of sticking to them.
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
      // (Where nothing at all lies under you, a plane under the whole map catches you, and that is the end of you.)
      const under = surfaceNear(Math.floor(me.x), Math.floor(me.y), me.x, me.y, me.alt) ?? { h: FALL_DEATH_ALT, t: 0 };
      if (under) {
        if (me.fall === 0 && under.h >= me.alt - STEP_TOLERANCE) {
          me.alt = under.h;
        } else {
          me.fall += GRAVITY * dt;
          me.alt -= me.fall * dt;
          if (me.alt <= under.h) { me.alt = under.h; me.fall = 0; }
        }
        me.ground = under.h;
        if (me.alt <= FALL_DEATH_ALT + 1e-3) reawakenRef.current();
      }
      }

      // The walk cycle follows the distance actually covered.
      const moved = Math.hypot(me.x - startX, me.y - startY) + (pinned ? Math.abs(me.alt - startAlt) : 0);
      if (moved < 1e-3) me.walked = 0;
      else me.walked += moved;

      // The camera eases after you.
      const c = 1 - Math.exp(-CAMERA_FOLLOW * dt);
      cam.x += (me.x - cam.x) * c;
      cam.y += (me.y - me.alt * RISE - cam.y) * c;

      grace = Math.max(0, grace - dtMs);
      for (const f of foes) updateFoe(f, dt);

      // Standing by a keeper, on its level: you can rest there.
      const by = KEEPERS.find(k => Math.abs(k.at.z - me.alt) < 0.2 && Math.hypot(k.at.x - me.x, k.at.y - me.y) < KEEPER_REACH)?.id ?? null;
      if (by !== nearRef.current) { nearRef.current = by; setNear(by); }
      // Gear on the floor within reach.
      const inReach = floorItems()
        .filter(p => Math.abs(p.at.z - me.alt) < 0.2 && Math.hypot(p.at.x - me.x, p.at.y - me.y) < PICKUP_REACH)
        .sort((a, b) => Math.hypot(a.at.x - me.x, a.at.y - me.y) - Math.hypot(b.at.x - me.x, b.at.y - me.y));
      reachRef.current = inReach.map(p => p.id);
      const onFloor = inReach[0]?.id ?? null;
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

      // Its arms (a big body's) reach toward what it is after, even when a wall stops it getting there.
      const arm = 1 - Math.exp(-6 * dt);
      const want = f.chasing ? goal : null;
      if (want) {
        const wx = want.x - f.x, wy = want.y - f.y, wl = Math.hypot(wx, wy);
        if (wl > 0.05) { f.aimX += (wx / wl - f.aimX) * arm; f.aimY += (wy / wl - f.aimY) * arm; }
      }
      f.reach += ((want ? 1 : 0.15) - f.reach) * arm;

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
          const via = waypoint(level, f.x, f.y, goal, steps, f.half);
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
      // (Nor do they climb ladders.)
      if (!under || under.t === LADDER || under.h < f.alt - STEP_TOLERANCE) { f.x = sx; f.y = sy; f.vx = f.vy = 0; f.target = null; f.wait = 0.5; }
      else f.alt = under.h;
      const moved = Math.hypot(f.x - sx, f.y - sy);
      if (goal && !f.chasing && moved < 1e-4 && Math.hypot(f.vx, f.vy) > 0.2) { f.target = null; f.wait = 1; } // stuck on a wall
      f.walked = moved < 1e-4 ? 0 : f.walked + moved;
      if (Math.abs(f.vx) > 0.05 || Math.abs(f.vy) > 0.05) {
        f.facing = Math.abs(f.vx) > Math.abs(f.vy) ? (f.vx > 0 ? "right" : "left") : (f.vy > 0 ? "down" : "up");
      }

      // Close enough: the fight begins, and everyone else chasing you piles in.
      if (grace <= 0 && sameLevel && dist < TOUCH + (f.half ? f.half - HALF_W : 0) && inFightArea(f, me) && !leaving.current) {
        leaving.current = true;
        held.current = [];
        setEntering(true);
        // Where each of them would lie, if it fell.
        const joiners = [f, ...pursuers(f)];
        const fallen: Record<string, Corpse> = {};
        for (const jf of joiners) {
          const spots = huddle(jf.def.fight.length);
          jf.def.fight.forEach((m, j) => { fallen[memberKey(jf.def.id, jf.def.members?.[j] ?? j)] = { kind: m.kind, x: jf.x + spots[j][0], y: jf.y + spots[j][1], alt: jf.alt }; });
        }
        const backTo = { ...snapshot.current(), fallen };
        const joining = joiners.map(x => x.def);
        fadeTimer = window.setTimeout(() => latest.current.onEncounter(joining, backTo), ENCOUNTER_FADE_MS);
      }
    };

    /**
     * Who joins the fight `first` starts: the others chasing you, nearest first, as long as the
     * fight stays within MAX_IN_FIGHT enemies. Anyone left out keeps chasing on the map.
     */
    const pursuers = (first: Foe): Foe[] => {
      let count = first.def.fight.length;
      const out: Foe[] = [];
      const chasing = foes
        // (One that only fights you in its own room, the blob, never joins a fight outside it.)
        .filter(f => f !== first && f.chasing && inFightArea(f, me))
        .sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y));
      for (const f of chasing) {
        if (count + f.def.fight.length > MAX_IN_FIGHT) continue;
        count += f.def.fight.length;
        out.push(f);
      }
      return out;
    };

    /**
     * Draws the enemies and keepers on level z whose feet are on a row that passes `test`, as
     * seen from the camera at (ox, oy), back ones first.
     */
    const drawFoes = (ctx: CanvasRenderingContext2D, z: number, ox: number, oy: number, T: number, test: (y: number) => boolean, light: Light) => {
      // (`over`: drawn over what stands on the same row, as gear over the remains it dropped from.)
      const list: { x: number; y: number; over?: boolean; draw: () => void }[] = [];
      for (const f of foes) {
        if (Math.round(f.alt) !== z || !test(f.y)) continue;
        list.push({ x: f.x, y: f.y, draw: () => {
          const phase = Math.floor(f.walked / STRIDE) % 4;
          const frame: Frame = f.walked <= 0 ? "stand" : phase === 0 ? "stepR" : phase === 2 ? "stepL" : "stand";
          // Each member of the group drawn as what it is, back ones first.
          // (A multi-target enemy is one heap: its middle part draws the whole of it, in the middle.)
          const spots = huddle(f.def.fight.length);
          const members = f.def.fight.map((m, i) => ({ kind: m.kind, at: (m.body ? [0, 0] : spots[i]) as [number, number] })).sort((a, b) => a.at[1] - b.at[1]);
          for (const { kind, at: [dx, dy] } of members) {
            const px = ox + (f.x + dx) * T, py = oy + (f.y + dy - f.alt * RISE - BODY_ABOVE_FEET) * T;
            // A multi-target body is a heap seen from above, reaching with its arms toward what it is after.
            if (f.def.fight.some(m => m.body)) { if (kind === "blobMid") drawBlobTop(ctx, px, py, T, f.aimX, f.aimY, f.reach, performance.now()); continue; }
            if (!f.def.girth) { MAP_FIGURES[kind](ctx, px, py, T, f.facing, frame); continue; }
            // A big one is drawn bigger, standing on the same spot.
            const feet = py + BODY_ABOVE_FEET * T, s = Math.max(1, f.def.girth * 1.9);
            ctx.save();
            ctx.translate(px, feet);
            ctx.scale(s, s);
            ctx.translate(-px, -feet);
            MAP_FIGURES[kind](ctx, px, py, T, f.facing, frame);
            ctx.restore();
          }
        } });
      }
      for (const p of floorItems()) {
        if (Math.round(p.at.z) !== z || !test(p.at.y)) continue;
        list.push({ x: p.at.x, y: p.at.y, over: true, draw: () => drawPickup(ctx, ox + p.at.x * T, oy + (p.at.y - p.at.z * RISE - BODY_ABOVE_FEET) * T, T, performance.now(), !!p.gear.eternal) });
      }
      // Whoever lies beaten, where it fell.
      for (const c of Object.values(corpsesRef.current)) {
        if (Math.round(c.alt) !== z || !test(c.y)) continue;
        list.push({ x: c.x, y: c.y, draw: () => MAP_REMAINS[c.kind](ctx, ox + c.x * T, oy + (c.y - c.alt * RISE - BODY_ABOVE_FEET) * T, T) });
      }
      for (const k of KEEPERS) {
        const at = k.at;
        if (Math.round(at.z) !== z || !test(at.y) || fade[k.id] < 0.02) continue;
        list.push({ x: at.x, y: at.y, draw: () => {
          const px = ox + at.x * T, py = oy + (at.y - at.z * RISE - BODY_ABOVE_FEET) * T;
          ctx.globalAlpha = fade[k.id] * light(at.x, at.y);
          drawKeeper(ctx, px, py, T, (restedAt.current ?? "start") === k.id, performance.now());
          ctx.globalAlpha = 1;
        } });
      }
      if (!list.length) return false;
      // (Gear lying on remains is drawn over them, though the two lie on the same spot.)
      list.sort((a, b) => a.y + (a.over ? 0.3 : 0) - (b.y + (b.over ? 0.3 : 0))).forEach(d => {
        // Each is as bright as the light where it stands (the keepers fade in on top of that).
        const lit = light(d.x, d.y);
        if (lit < 0.01) return;
        ctx.globalAlpha = lit;
        d.draw();
        ctx.globalAlpha = 1;
      });
    };

    /** Whether anyone or anything is on level z at all (the renderer keeps a still picture of the levels below you while nothing moves on them). */
    const actorsOn = (z: number) =>
      foes.some(f => Math.round(f.alt) === z) ||
      floorItems().some(p => Math.round(p.at.z) === z) ||
      Object.values(corpsesRef.current).some(c => Math.round(c.alt) === z) ||
      KEEPERS.some(k => Math.round(k.at.z) === z && fade[k.id] >= 0.02);

    const draw = (dtMs: number) => {
      fadeKeepers(dtMs);
      // Sight only changes when you move: worked out again then, into the same arrays.
      const from = `${me.x},${me.y},${me.alt}`;
      if (from !== seenFrom) {
        sight(me.x, me.y, me.alt, seen, origins, reached);
        seenFrom = from;
      }
      seenLast = seen;
      // Each stretch of STRIDE lifts a foot, then lands it: right, stand, left, stand.
      const phase = Math.floor(me.walked / STRIDE) % 4;
      const frame: Frame = me.walked <= 0 ? "stand" : phase === 0 ? "stepR" : phase === 2 ? "stepL" : "stand";
      // You wear what you have equipped.
      const look = playerLook(loadoutOf(invRef.current));
      renderer.draw({
        camX: cam.x, camY: cam.y, x: me.x, y: me.y, alt: me.alt, seen, origin: origins, reached,
        actors: drawFoes,
        actorsOn,
        player: { draw: (ctx, px, py, T, solid) => drawWalker(ctx, px, py, T, me.facing, frame, solid, solid ? (me.alt - me.ground) * RISE : 0, look) },
      }, dtMs);
    };

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(now - last, 100);
      last = now;
      if (!pausedRef.current && !talkRef.current && !leaving.current) update(dt);
      draw(dt);
      raf = requestAnimationFrame(tick);
    };
    // The map near you is painted before the first frame, so walking in doesn't stutter.
    let gone = false;
    void renderer.warm(me.x, me.y, me.alt, p => { if (!gone) setPreparing(p); }).then(() => {
      if (gone) return;
      setPreparing(null);
      last = performance.now();
      raf = requestAnimationFrame(tick);
    });
    return () => { gone = true; cancelAnimationFrame(raf); window.clearTimeout(fadeTimer); renderer.dispose(); };
  }, []);

  return (
    <div className="explore">
      <canvas ref={canvasRef} className="explore-canvas" />
      {preparing !== null && <div className="explore-loading">Preparing the map… {Math.round(preparing * 100)}%</div>}
      {nearPickup && !got && !paused && !entering && !talk && (
        <div className="explore-prompt"><kbd>E</kbd> Pick Up</div>
      )}
      {/* What you just picked up, in the prompt's place: its sprite and its name, fading away. */}
      {got && !paused && (
        <div key={got.id} className="explore-prompt explore-got">
          <GearSprite slot={got.gear.slot} tier={got.gear.tier} />
          <span>{gearName(got.gear)}</span>
        </div>
      )}
      {near && !nearPickup && !paused && !entering && !talk && (
        <div className="explore-prompt"><kbd>E</kbd> Speak with the guide</div>
      )}
      {sleeping && <div className="explore-sleep" />}
      {talk && <Dialogue speaker="The guide" text={talk.lines[talk.at]} last={talk.at + 1 >= talk.lines.length} />}
      {entering && <div className="explore-fade" />}
      {screen?.kind === "inventory" && (
        <InventoryScreen inv={inv} player={barsPlayer()} ground={groundNear()} start={screen.start} onUse={useInventory} onClose={() => setScreen(null)} />
      )}
      {screen?.kind === "guide" && (
        <GuideMenu
          inv={inv}
          unwindFirst={screen.unwindFirst}
          onTalk={() => { setScreen(null); setTalk({ ...CHAT, at: 0 }); }}
          onRest={() => { setScreen(null); rest(); }}
          onRead={id => { setInv(readDreams(invRef.current, id)); latest.current.onSave(snapshot.current()); }}
          onSet={(slot, id) => { setInv(setEternal(invRef.current, slot, id)); latest.current.onSave(snapshot.current()); }}
          onClose={() => setScreen(null)}
        />
      )}
      {screen?.kind === "pause" && <PauseMenu options={pauseOptions()} focus={pauseAt} onFocus={setPauseAt} />}
    </div>
  );
}
