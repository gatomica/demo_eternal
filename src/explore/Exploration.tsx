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
import { canEmpower, empowerCost, payment, START_STATS, type Stats } from "./empower";
import type { Player } from "../core/types";
import { dirOf, menuSound, wrapIndex } from "../ui/input";
import { type MenuOption, PauseMenu } from "../ui/Menu";
import { Dialogue } from "./Dialogue";
import { blobWeapons, drawBlob, drawPickup, drawKeeper, drawRemains, drawStringAura, drawStringPile, drawWalker, type Frame, MAP_FIGURES, MAP_REMAINS, playerLook } from "./figures";
import { StringCounter, YarnBall } from "../render/StringCounter";
import { equippedSide, equipSide, gearName, type GearSpec, hasMemories, type Inventory as Bag, loadoutOf, pieceAt, readDreams, receive, setEternal, SLOTS, type Slot, unequip } from "./gear";
import { GearSprite } from "./GearIcons";
import { GuideMenu } from "./GuideMenu";
import { type InvFocus, InventoryScreen, type Place } from "./InventoryScreen";
import { type GroundItem, PICKUP_REACH, PICKUPS } from "./pickups";
import { ALERT_RADIUS, CHASE_MEMORY, HOWL_RADIUS, ladderPlan, type Corpse, ENCOUNTER_FADE_MS, type Foe, FOE_TUNING, GRACE_MS, inFightArea, livingDef, MAP_FOES, type MapFoe, MAX_IN_FIGHT, memberKey, nodeAt, spotsOf, stepsToNode, TOUCH, wakeEnemies, waypoint3, withCorpses } from "./foes";
import { playMusic } from "../audio/music";
import { drawProp, propsOn } from "./props";
import { play as playSfx } from "../audio/sfx";
import { cry, drip, type Floor, prepareWalk, speak, step, type Stepper } from "../audio/walk";
import { typeDelay } from "../combat/lesson";
import { groundAt } from "./ground";
import { FADE_FAR, FADE_NEAR, KEEPER_REACH, KEEPERS } from "./keepers";
import { slide, surfaceNear, type Walker, walkStep } from "./movement";
import { createMapRenderer, type Light } from "./render";
import { sight } from "./sight";
import { type After, CHAT, FIRST_FLOOR_KEEPER, GIFT, type Knot, knotCharges, type Talk, type TutorialState } from "./tutorial";
import { ACCEL, BODY_ABOVE_FEET, CAMERA_FOLLOW, FALL_DEATH_ALT, FALL_FATAL, GRAVITY, HALF_W, LADDER_SPEED, RISE, SPEED, STAIRS_SPEED, PLAYER_STRIDE, STEP_TOLERANCE, STRIDE, VISION_RADIUS } from "./tuning";
import { type Dir, doorAt, LADDER, ladderSpan, LEVELS, STAIRS, WORLD } from "./world";

/** How long what you picked up stays on screen, fading at the end. */
const PICKED_UP_MS = 2200;
/**
 * The end of the demo: the dark corridor past Floor C's NE bridge (`DEMO_DOOR` in plans.ts, three tiles wide and two tall). Crossing its
 * threshold, your middle inside one of its tiles, is the end: a "Thanks for playing" card, and then the menu. `before` is where Continue puts you: in the middle of the bridge's last
 * square (world tile 32, 14), right before the door.
 */
const DEMO_BEFORE = { x: 32.5, y: 14.5, alt: 13, facing: "right" as Dir };

/** Resting is a sleep: how long the screen is dark in all, and when, in the dark, it happens. */
const SLEEP_MS = 2400;
const SLEEP_MID_MS = 1100;
/** A steady number in [0, 1) for a map enemy's key, so each enemy's String coil fades in and out on a clock of its own. */
const seedOf = (key: string) => {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (h % 997) / 997;
};

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
  /** Your String. */
  string?: number;
  /** Your eternal String: death never takes it. */
  eternalString?: number;
  /** Your max health and max Eternity, as you have raised them at the guide (missing: the starting ones). */
  maxHP?: number;
  maxEternity?: number;
  /** String the enemies who killed you are holding (half of what you lost each time), by map enemy member (see `memberKey`): paid to you when that one is defeated. */
  held?: Record<string, number>;
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
  onDie: (journey: Journey, lostAt?: { x: number; y: number; alt: number }) => void;
  /** Back to the main menu, with where you stand. */
  onExit: (journey: Journey) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Over the map: the stir at the edge of your light toward enemies hunting you out of sight.
  const disturbRef = useRef<HTMLCanvasElement>(null);
  // The screen goes dark as a fight begins; input stops.
  const [entering, setEntering] = useState(false);
  /** The demo is over: the "Thanks for playing" card is up. */
  const [thanks, setThanks] = useState(false);
  const thanksRef = useRef(false);
  // The map being got ready before the first frame (how far along it is, 0 to 1), or null once it is.
  const [preparing, setPreparing] = useState<number | null>(0);
  const leaving = useRef(false);
  const latest = useRef({ journey, onEncounter, onSave, onDie, onExit });
  latest.current = { journey, onEncounter, onSave, onDie, onExit };
  /**
   * What is open over the map, if anything (the map stands still meanwhile): the inventory (E; `start`:
   * where its cursor begins), the guide's menu (E by a keeper), or the pause menu (Esc).
   */
  type Screen = { kind: "inventory"; start?: InvFocus } | { kind: "guide"; unwindFirst?: boolean; empowerFirst?: boolean } | { kind: "pause" };
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
  // Eternal gear you just picked up (or the knot the guide just gave you): its sprite and name pop up in a box where the "E Pick Up" prompt was, then fade.
  const [got, setGot] = useState<{ gear?: GearSpec; knot?: boolean; id: number } | null>(null);
  useEffect(() => {
    if (!got) return;
    const t = window.setTimeout(() => setGot(cur => (cur?.id === got.id ? null : cur)), PICKED_UP_MS);
    return () => window.clearTimeout(t);
  }, [got]);
  // String you just gathered: the counter shows at the top for a moment, with a "+X" below it.
  const [stringHud, setStringHud] = useState<{ id: number; amount?: number; eternal?: number } | null>(null);
  useEffect(() => {
    if (!stringHud) return;
    const t = window.setTimeout(() => setStringHud(cur => (cur?.id === stringHud.id ? null : cur)), PICKED_UP_MS + 400);
    return () => window.clearTimeout(t);
  }, [stringHud]);
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
  // Your String, and what the enemies who killed you hold of it.
  const stringRef = useRef(journey.string ?? 0);
  const eternalRef = useRef(journey.eternalString ?? 0);
  // Your max health and max Eternity (raised at the guide).
  const statsRef = useRef<Stats>({ maxHP: journey.maxHP ?? START_STATS.maxHP, maxEternity: journey.maxEternity ?? START_STATS.maxEternity });
  const [, setStatsTick] = useState(0);
  const holdsRef = useRef<Record<string, number>>(journey.held ?? {});
  // The last solid place you stood on (where a pile of String is left if you die with no enemy to hold it).
  const safeRef = useRef<{ x: number; y: number; alt: number } | null>(null);
  const nearPickupRef = useRef<string | null>(null);
  const [nearPickup, setNearPickup] = useState<string | null>(null);
  /** Everything lying within reach to be picked up: gear set on the map that you haven't taken, and what lies where things fell. */
  const floorItems = () => [
    ...PICKUPS.filter(p => !takenRef.current.includes(p.id)).map(p => ({ id: p.id, at: p.at, gear: p.gear, string: undefined as number | undefined, eternalString: p.eternalString })),
    ...groundRef.current.map(g => ({ id: g.id, at: g.at, gear: g.gear, string: g.string, eternalString: g.eternalString })),
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
      if (item?.gear && !out[item.gear.slot]) out[item.gear.slot] = item.gear;
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
    if (!item?.gear) return;
    lift(item.id);
    const { inventory, replaced } = receive(invRef.current, [item.gear], false);
    for (const old of replaced) {
      const { id: _id, ...left } = old;
      groundRef.current = [...groundRef.current, { id: `left-${Date.now()}-${old.id}`, at: item.at, gear: left as GearSpec }];
    }
    reachRef.current = reachRef.current.filter(x => x !== id);
    setInv(inventory);
    // (Only eternal gear is announced: an ordinary piece goes to its place, and the inventory shows it.)
    if (item.gear.eternal) setGot({ gear: item.gear, id: Date.now() });
    latest.current.onSave(snapshot.current());
  };
  /**
   * E by gear on the floor: a memory (eternal) is picked up at once; anything you could wield opens the
   * inventory on that slot's ground place, to swap it for what is in your ordinary place (an empty one takes it at once, and the inventory opens on it).
   */
  const pickUp = () => {
    const item = floorItems().find(x => x.id === nearPickupRef.current);
    if (!item) return;
    held.current = [];
    if (item.eternalString !== undefined) {
      // Eternal string: gathered at once, into the eternal counter.
      lift(item.id);
      eternalRef.current += item.eternalString;
      setStringHud({ id: Date.now(), eternal: item.eternalString });
      latest.current.onSave(snapshot.current());
      return;
    }
    if (item.string !== undefined) {
      // A pile of String: gathered at once.
      lift(item.id);
      stringRef.current += item.string;
      setStringHud({ id: Date.now(), amount: item.string });
      latest.current.onSave(snapshot.current());
      return;
    }
    if (!item.gear) return;
    if (item.gear.eternal) { takeFromGround(item.id); return; }
    const row = Math.max(0, SLOTS.indexOf(item.gear.slot));
    // An empty ordinary place takes it at once (not wielded); the inventory opens on it, to wield it with E.
    if (!pieceAt(invRef.current, item.gear.slot, "normal")) {
      takeFromGround(item.id);
      setScreen({ kind: "inventory", start: { row, place: "normal" } });
      return;
    }
    setScreen({ kind: "inventory", start: { row, place: "ground" } });
  };
  /** E on a place of the inventory: wield it (or unequip it, if you already wield it), or take what lies on the ground. */
  const useInventory = (slot: Slot, place: Place) => {
    if (place === "ground") {
      const items = floorItems();
      const id = reachRef.current.find(x => items.find(i => i.id === x)?.gear?.slot === slot);
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
      id: "player", stance: "idle", name: "You", maxHP: statsRef.current.maxHP, hp: statsRef.current.maxHP, fatigue: 0, death: 0,
      weapon: look.weapon, armor: look.armor, waxed: false, staggered: false,
      charges: knotCharges(knotRef.current), reviving: false,
      maxEternity: statsRef.current.maxEternity, eternity: Math.min(statsRef.current.maxEternity, eternityRef.current ?? statsRef.current.maxEternity),
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
    sleepTimers.current.push(window.setTimeout(() => latest.current.onDie(snapshot.current(), safeRef.current ?? undefined), SLEEP_MID_MS));
  };
  const reawakenRef = useRef(reawaken);
  reawakenRef.current = reawaken;
  // A fall of FALL_FATAL storeys or more is the end of you: the camera stays where it was, the death card comes up, and your body goes on falling
  // (to lie there as remains, if it reaches the ground). E on the card wakes you as after any death.
  const [doomed, setDoomed] = useState(false);
  const doomedRef = useRef(false);
  const rest = () => {
    const id = nearRef.current;
    if (!id) return;
    const gift = id === FIRST_FLOOR_KEEPER && !tutorialRef.current.done;
    held.current = [];
    leaving.current = true;
    setSleeping(true);
    // The sleep begins with a long sigh and a wisp of String, together.
    playSfx("rest");
    playSfx("string");
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
  // The guide's words are written out as it speaks, a soft blip for the letters. E finishes the line, and then moves on.
  const [spoken, setSpoken] = useState({ key: "", n: 0 });
  const line = talk ? talk.lines[talk.at] : "";
  const lineKey = talk ? `${talk.after}:${talk.at}:${line}` : "";
  const written = spoken.key === lineKey ? spoken.n : 0;
  useEffect(() => {
    if (!talk || written >= line.length) return;
    const t = window.setTimeout(() => { speak(line[written], written); setSpoken({ key: lineKey, n: written + 1 }); }, typeDelay(line, written));
    return () => window.clearTimeout(t);
  }, [lineKey, written]); // eslint-disable-line react-hooks/exhaustive-deps
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
    setGot({ knot: true, id: Date.now() });
    latest.current.onSave(snapshot.current());
  };

  /**
   * Speaking with the guide by a keeper. The first time after you have found a memory, its menu opens
   * right on Unwind Memories, and the first time you have String enough to raise a stat, on Empower Self (and from then on, each is one of its options).
   */
  const openGuide = () => {
    // The first time you have String enough to raise a stat, it opens on Empower Self, and from then on that is an option, affordable or not.
    // If a memory was waiting too, Empower Self goes first and Unwind Memories opens next time (until you have been to it once).
    const introEmpower = canEmpower(stringRef.current, statsRef.current, eternalRef.current) && !tutorialRef.current.empowered;
    const first = hasMemories(invRef.current) && !tutorialRef.current.unwound && !introEmpower;
    if (first || introEmpower) {
      tutorialRef.current = { ...tutorialRef.current, ...(first ? { unwound: true } : {}), ...(introEmpower ? { empowered: true } : {}) };
      latest.current.onSave(snapshot.current());
    }
    setScreen({ kind: "guide", unwindFirst: first, empowerFirst: introEmpower });
  };
  /** Empower Self: String for one more point of max health or max Eternity (what the stat stands at, summed from 1, is the cost). */
  const empower = (stat: "health" | "eternity") => {
    const key = stat === "health" ? "maxHP" : "maxEternity";
    const cost = empowerCost(statsRef.current[key]);
    const paid = payment(cost, stringRef.current, eternalRef.current);
    if (!paid) return;
    // (Your own String first; the eternal String only for what is left.)
    stringRef.current -= paid.normal;
    eternalRef.current -= paid.eternal;
    statsRef.current = { ...statsRef.current, [key]: statsRef.current[key] + 1 };
    // (Eternity you have spent stays spent; the new point is yours at once.)
    if (stat === "eternity" && eternityRef.current !== undefined) eternityRef.current += 1;
    setStatsTick(n => n + 1);
    latest.current.onSave(snapshot.current());
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
    // The "Thanks for playing" card: E (or Enter, or Space) goes back to the menu.
    if (thanksRef.current) {
      if (!e.repeat && ["e", "enter", " "].includes(e.key.toLowerCase())) { e.preventDefault(); menuSound("select"); latest.current.onExit({ ...snapshot.current(), at: DEMO_BEFORE }); }
      return;
    }
    if (doomedRef.current) {
      if (!e.repeat && ["e", "enter", " "].includes(e.key.toLowerCase())) { e.preventDefault(); menuSound("select"); reawakenRef.current(); }
      return;
    }
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
      if (dir === "up" || dir === "down") menuSound(dir);
      else if (key === "e" || key === "enter" || key === " ") menuSound("select");
      if (dir === "up" || dir === "down") setPauseAt(i => wrapIndex(i, dir === "up" ? -1 : 1, options.length));
      else if (key === "e" || key === "enter" || key === " ") options[pauseAt]?.run();
      else if (key === "q") setScreen(null);
      return;
    }
    if (talk) {
      // The guide's lines: E moves on; the last one ends the talk and does what follows.
      e.preventDefault();
      if (e.repeat || (key !== "e" && key !== "enter" && key !== " ")) return;
      if (written < line.length) { setSpoken({ key: lineKey, n: line.length }); return; }
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
      climbing: false, fall: 0, ground: def.home.z, target: null, wait: Math.random() * 2, chasing: false, lostFor: 0, lastSeen: null, seenAt: null, aimX: 0, aimY: 1, reach: 0, leg: 1, legDir: 1, patrolOk: true, howl: 0, climb: null,
      homeSteps: null, stride: 0, wasChasing: false,
    });
    /** Everyone who is up: each group not beaten, whoever in it is not dead for good, at its start. */
    const spawn = () => MAP_FOES.filter(f => !defeatedRef.current.includes(f.id)).flatMap(f => {
      const def = livingDef(f, corpsesRef.current);
      return def ? [makeFoe(def)] : [];
    });
    const foes: Foe[] = spawn();
    respawnRef.current = () => {
      // The sleepwalkers get up again, their remains and drops gone; the waxed and the Warden stay dead.
      const woke = wakeEnemies({ corpses: corpsesRef.current, defeated: defeatedRef.current, ground: groundRef.current });
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
    // Step counts toward you (stairs and ramps included), kept while you stay on a tile.
    const stepsToYou = () => stepsToNode(nodeAt(me.x, me.y, me.alt));
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
      string: stringRef.current,
      eternalString: eternalRef.current,
      maxHP: statsRef.current.maxHP,
      maxEternity: statsRef.current.maxEternity,
      held: holdsRef.current,
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
    prepareWalk();

    /** Which way the held keys point, as -1/0/1 on each axis (opposite keys cancel out). */
    const input = () => {
      const h = held.current;
      return {
        ix: (h.includes("right") ? 1 : 0) - (h.includes("left") ? 1 : 0),
        iy: (h.includes("down") ? 1 : 0) - (h.includes("up") ? 1 : 0),
      };
    };

    // The stride you last put a foot down on, and the time to the next drip of wax.
    let lastStride = 0, dripIn = 4;
    // Where the fall you are in began, and whether the body of one who fell to death has reached the ground.
    let fallStart: number | null = null, bodyDown = false;
    /** The way the held keys pointed as the fall began: in the air you cannot steer, so you keep going that way (or stay put) until you land. */
    let airDir: { ix: number; iy: number } | null = null;

    const update = (dtMs: number) => {
      const dt = dtMs / 1000;
      const { ix, iy } = me.fall > 0 && airDir ? airDir : input();

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
      // Walk (diagonals are as fast as straight lines, not faster): sliding along walls, and gliding along the diagonal ones.
      const onStairs = surfaceNear(Math.floor(me.x), Math.floor(me.y), me.x, me.y, me.alt)?.t === STAIRS;
      walkStep(me, ix, iy, dt, SPEED * (onStairs ? STAIRS_SPEED : 1));

      // Your height follows whatever you're standing on: this is what carries you up and down.
      // Small differences (stairs, ladders) you simply step across; anything bigger, you fall.
      // (Where nothing at all lies under you, a plane under the whole map catches you, and that is the end of you.)
      const fellFrom = me.fall;
      const under = surfaceNear(Math.floor(me.x), Math.floor(me.y), me.x, me.y, me.alt) ?? { h: FALL_DEATH_ALT, t: 0 };
      if (under) {
        if (me.fall === 0 && under.h >= me.alt - STEP_TOLERANCE) {
          me.alt = under.h;
        } else {
          if (me.fall === 0) { fallStart = me.alt; airDir = { ix, iy }; }
          me.fall += GRAVITY * dt;
          me.alt -= me.fall * dt;
          if (me.alt <= under.h) { me.alt = under.h; me.fall = 0; }
          if (fallStart !== null && fallStart - me.alt >= FALL_FATAL && !doomedRef.current) {
            // Too far to live: from here the map stands still, and only the body falls (see `fallOn`).
            doomedRef.current = true;
            held.current = [];
            setDoomed(true);
          }
        }
        if (me.fall === 0) { fallStart = null; airDir = null; }
        me.ground = under.h;
        if (me.alt <= FALL_DEATH_ALT + 1e-3) reawakenRef.current();
      }
      // Landing from a fall.
      if (fellFrom > 3 && me.fall === 0 && me.alt > FALL_DEATH_ALT + 1) step("player", "land", Math.min(1, fellFrom / 8), 0);
      }

      // Remember the last solid place you stood on.
      // (The middle of the tile you stand on, when it is as solid there: not the very rim you may be hanging over as you step off the ledge.)
      if (me.fall === 0 && !me.climbing && me.alt > FALL_DEATH_ALT + 1) {
        const tx = Math.floor(me.x), ty = Math.floor(me.y);
        const mid = surfaceNear(tx, ty, tx + 0.5, ty + 0.5, me.alt, true);
        safeRef.current = mid && Math.abs(mid.h - me.alt) < 1e-3 ? { x: tx + 0.5, y: ty + 0.5, alt: me.alt } : { x: me.x, y: me.y, alt: me.alt };
      }

      // The demo ends in the dark corridor past Floor C's NE bridge: crossing its threshold, the "Thanks for playing" card comes up, and its button takes you back to the menu; Continue puts you right before it.
      if (!leaving.current && Math.abs(me.alt - 13) < 0.4 && doorAt(13, Math.floor(me.x), Math.floor(me.y))) {
        leaving.current = true;
        held.current = [];
        thanksRef.current = true;
        setThanks(true);
      }

      // The music follows where you are: the lower labyrinth and its shaft, or the dungeon proper (Floor A's outer wheel, on level 6, and up).
      playMusic(me.alt >= 6 ? "quella" : "temple");

      // The walk cycle follows the distance actually covered.
      const moved = Math.hypot(me.x - startX, me.y - startY) + (pinned ? Math.abs(me.alt - startAlt) : 0);
      if (moved < 1e-3) me.walked = 0;
      else me.walked += moved;
      // Each time a foot comes down, it sounds: the floor decides how (rungs, on a ladder).
      const stride = Math.floor(me.walked / PLAYER_STRIDE);
      if (stride !== lastStride) {
        if (stride % 2 === 1) step("player", groundAt(me.x, me.y, me.alt));
        lastStride = stride;
      }
      // Now and then a drip of wax, in the waxed labyrinth and the dug tunnels.
      dripIn -= dt;
      if (dripIn <= 0) {
        dripIn = 3 + Math.random() * 7;
        const g = groundAt(me.x, me.y, me.alt);
        if (g === "wax" || g === "rock") drip(0.7, Math.random() * 1.6 - 0.8);
      }

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

    /** How loud a foe sounds to you, 0 to 1 (by how far off it is, and how many floors), and which side it is on. */
    const hearing = (f: { x: number; y: number; alt: number }) => {
      const d = Math.hypot(f.x - me.x, f.y - me.y) + Math.abs(f.alt - me.alt) * 3;
      return { gain: Math.max(0, 1 - d / 11) ** 1.5, pan: Math.max(-1, Math.min(1, (f.x - me.x) / 7)) };
    };
    /** Who is walking, as the sounds know it. */
    const stepperOf = (kind: string): Stepper | null =>
      kind === "patrolWarden" ? "warden" : kind === "warden" ? "boss" : kind.startsWith("sleepwalker") ? "sleepwalker" : kind.startsWith("waxed") ? "waxed" : kind.startsWith("blob") ? "blob" : null;
    /** A foot of this foe comes down (on the floor under it, or the rungs of a ladder). */
    const footfall = (f: Foe, floor?: Floor) => {
      const who = stepperOf(f.def.kind);
      if (!who) return;
      const h = hearing(f);
      if (h.gain > 0.03) step(who, floor ?? groundAt(f.x, f.y, f.alt), h.gain, h.pan);
    };

    /** A foe on a ladder: pulled in against it, climbing at a little under your pace, stepping out at the end. */
    const climbStep = (f: Foe, dt: number) => {
      const { ladder: L, up } = f.climb!;
      const pull = Math.min(1, 12 * dt), rate = SPEED * LADDER_SPEED * 0.7 * dt;
      f.x += (L.x + 0.5 - f.x) * pull;
      f.y += (L.y + 0.45 - f.y) * pull;
      f.alt += (up ? rate : -rate);
      f.walked += rate;
      const rung = Math.floor(f.walked / STRIDE);
      if (rung !== f.stride) { if (rung % 2 === 1) footfall(f, "ladder"); f.stride = rung; }
      f.facing = "up"; f.vx = f.vy = 0; f.ground = f.alt;
      if (up ? f.alt >= L.top : f.alt <= L.bottom) {
        const out = up ? L.exit! : L.foot!;
        f.alt = up ? L.top : L.bottom; f.ground = f.alt;
        f.x = out.x + 0.5; f.y = out.y + 0.5;
        f.climb = null;
      }
    };

    const updateFoe = (f: Foe, dt: number) => {
      if (f.climb) { climbStep(f, dt); return; }
      // One far from you that is not after you stands as it is: nothing it does could be seen or heard.
      if (!f.chasing && f.howl <= 0 && (Math.abs(f.x - me.x) > 30 || Math.abs(f.y - me.y) > 30)) return;
      // Finding you, one cries out: a sleepwalker's moan, a waxed one's gurgle, the blob's slosh (a patrol warden's howl is its own).
      if (f.chasing && !f.wasChasing && !FOE_TUNING[f.def.kind].howl) {
        const h = hearing(f), kind = f.def.kind;
        const c = kind.startsWith("sleepwalker") ? "moan" : kind.startsWith("waxed") ? "gurgle" : kind.startsWith("blob") ? "slosh" : null;
        if (c) cry(c, Math.min(1, h.gain * 1.4), h.pan, Math.random() * 0.3);
      }
      f.wasChasing = f.chasing;
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
      const fromHome = Math.hypot(f.x - home.x, f.y - home.y) + Math.abs(f.alt - home.z) * 4;

      // Out of sight, it hunts for you where it last saw you; only after a while without
      // seeing you again does it give up, stand a moment, and amble home.
      /** Everyone near (within `radius` tiles, on its level) who isn't after you yet comes after the spot where you stand. */
      const alert = (radius: number) => {
        for (const o of foes) {
          if (o === f || o.chasing || o.howl > 0 || o.def.still || Math.abs(o.alt - f.alt) > 0.5 || Math.hypot(o.x - f.x, o.y - f.y) > radius) continue;
          o.chasing = true; o.lostFor = 0; o.lastSeen = null; o.seenAt = { x: me.x, y: me.y, alt: me.alt };
        }
      };
      if (f.howl > 0) {
        // Howling: it stands where it is, facing you, and only when the howl is out does it come for you.
        f.howl -= dt;
        if (f.howl <= 0) { f.howl = 0; f.chasing = true; f.lostFor = 0; f.lastSeen = null; f.seenAt = { x: me.x, y: me.y, alt: me.alt }; }
      } else if (seesYou) {
        if (!f.chasing && tune.howl) {
          // Noticing you, a patrol warden howls, and the howl carries far.
          f.howl = tune.howl; f.target = null;
          const h = hearing(f);
          cry("howl", Math.min(1, 0.3 + h.gain * 1.5), h.pan);
          alert(HOWL_RADIUS);
        } else {
          // Noticing you raises the alarm among its neighbours, who come after the spot where you stand.
          if (!f.chasing) alert(ALERT_RADIUS);
          f.chasing = true;
          f.lostFor = 0;
          f.lastSeen = null;
          f.seenAt = { x: me.x, y: me.y, alt: me.alt };
        }
      } else if (f.chasing) {
        if (!f.lastSeen) {
          // Just lost you: head for the last place it saw you.
          const at = f.seenAt ?? { x: me.x, y: me.y, alt: me.alt };
          f.lastSeen = { x: at.x, y: at.y, alt: at.alt, steps: stepsToNode(nodeAt(at.x, at.y, at.alt)) };
        }
        // (With you on another level it keeps hunting a good while longer: it follows you by sound.)
        f.lostFor += sameLevel ? dt : dt * 0.25;
        if (f.lostFor > CHASE_MEMORY) { f.chasing = false; f.patrolOk = false; f.lastSeen = null; f.target = null; f.wait = 1; }
      }
      // With you on another level and a way there on foot (stairs, ramps), it follows you by sound, not by sight.
      const youSteps = f.chasing ? stepsToYou() : null;
      const here = nodeAt(f.x, f.y, f.alt);
      const connected = !!youSteps && here >= 0 && youSteps[here] >= 0;
      const tracking = f.chasing && !sameLevel && connected;
      let goal: { x: number; y: number } | null = null, speed = 0;
      if (f.howl > 0) { /* stands and howls */ }
      else if (f.chasing) { goal = tracking ? me : f.lastSeen ?? me; speed = tune.chase; }
      else if (f.wait > 0) f.wait -= dt;
      else {
        if (!f.target) {
          if (f.def.patrol) {
            // On its beat it walks to the next point; after a chase it goes home first.
            if (f.patrolOk) { const p = f.def.patrol[f.leg]; f.target = { x: p.x, y: p.y }; }
            else if (fromHome > 0.3) f.target = { x: home.x, y: home.y };
            else { f.patrolOk = true; f.leg = 1; f.legDir = 1; }
          } else if (fromHome > 0.3) f.target = { x: home.x, y: home.y };
          else if (tune.wander > 0 && !f.def.post) {
            const a = Math.random() * Math.PI * 2, r = 0.6 + Math.random() * (tune.wander - 0.6);
            const tx = home.x + Math.cos(a) * r, ty = home.y + Math.sin(a) * r;
            const there = surfaceNear(Math.floor(tx), Math.floor(ty), tx, ty, f.alt);
            if (there && Math.abs(there.h - f.alt) < 0.01) f.target = { x: tx, y: ty };
            else f.wait = 0.5;
          }
        }
        if (f.target) { goal = f.target; speed = tune.walk; }
      }

      // One that climbs, with no way to you on foot (or none back home), makes for a ladder that leads the right way.
      let lad: ReturnType<typeof ladderPlan> = null;
      if (tune.climbs && f.howl <= 0) {
        const homeSteps = f.chasing ? null : (f.homeSteps ??= stepsToNode(nodeAt(home.x, home.y, home.z)));
        const cut = f.chasing ? !!youSteps && here >= 0 && youSteps[here] < 0 : !!homeSteps && here >= 0 && homeSteps[here] < 0 && Math.abs(f.alt - home.z) > 0.5;
        if (cut) lad = f.chasing ? ladderPlan(f.x, f.y, f.alt, me.x, me.y, me.alt) : ladderPlan(f.x, f.y, f.alt, home.x, home.y, home.z);
        if (lad) {
          goal = lad.goal; speed = f.chasing ? tune.chase : tune.walk;
          if (Math.hypot(lad.goal.x - f.x, lad.goal.y - f.y) < 0.3) { f.climb = { ladder: lad.ladder, up: lad.up }; f.vx = f.vy = 0; return; }
        }
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
          if (!f.chasing) {
            if (f.def.patrol && f.patrolOk) {
              // Reached a point of its beat: turn at either end, pause a moment, walk on.
              if (f.leg + f.legDir < 0 || f.leg + f.legDir >= f.def.patrol.length) f.legDir = f.legDir === 1 ? -1 : 1;
              f.leg += f.legDir;
              f.wait = 0.5 + Math.random();
            } else f.wait = 1 + Math.random() * 2.5;
            f.target = null;
          }
        } else {
          // Chasing you, hunting the last place it saw you, or heading home: follow the step
          // counts round corners. Ambling about nearby: straight there.
          const toHome = !f.chasing && goal === f.target && f.target.x === home.x && f.target.y === home.y && !(f.def.patrol && f.patrolOk);
          const steps = lad ? lad.steps : f.chasing ? (tracking ? youSteps : f.lastSeen ? f.lastSeen.steps : youSteps)
            : toHome ? (f.homeSteps ??= stepsToNode(nodeAt(home.x, home.y, home.z))) : null;
          const goalAlt = lad ? f.alt : goal === me ? me.alt : f.lastSeen && goal === f.lastSeen ? f.lastSeen.alt : toHome ? home.z : f.alt;
          const via = waypoint3(f, goal, goalAlt, steps);
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
      const stride = Math.floor(f.walked / STRIDE);
      if (stride !== f.stride) { if (stride % 2 === 1) footfall(f); f.stride = stride; }
      if (Math.abs(f.vx) > 0.05 || Math.abs(f.vy) > 0.05) {
        f.facing = Math.abs(f.vx) > Math.abs(f.vy) ? (f.vx > 0 ? "right" : "left") : (f.vy > 0 ? "down" : "up");
      }
      // Howling, it faces you.
      if (f.howl > 0) {
        const dx = me.x - f.x, dy = me.y - f.y;
        f.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
      }

      // Close enough: the fight begins, and everyone else chasing you piles in.
      // (The boss never chases or touches: the fight starts when you step onto its arena.)
      const zone = f.def.trigger;
      // (A trigger may leave out its corner tiles: standing in one does not start it, stepping beyond it does.)
      const inCorner = !!zone?.cut && (me.x < zone.x0 + zone.cut || me.x > zone.x1 - zone.cut) && (me.y < zone.y0 + zone.cut || me.y > zone.y1 - zone.cut);
      const triggered = !!zone && Math.abs(me.alt - zone.z) < 0.4 && me.x >= zone.x0 && me.x <= zone.x1 && me.y >= zone.y0 && me.y <= zone.y1 && !inCorner;
      if (grace <= 0 && !leaving.current && (triggered || (!zone && sameLevel && dist < TOUCH + (f.half ? f.half - HALF_W : 0) && inFightArea(f, me)))) {
        leaving.current = true;
        held.current = [];
        setEntering(true);
        // Where each of them would lie, if it fell.
        const joiners = [f, ...pursuers(f)];
        const fallen: Record<string, Corpse> = {};
        for (const jf of joiners) {
          const spots = spotsOf(jf.def);
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
    let layer: HTMLCanvasElement | null = null, layerCtx: CanvasRenderingContext2D | null = null;
    const drawFoes = (ctx: CanvasRenderingContext2D, z: number, ox: number, oy: number, T: number, test: (y: number) => boolean, light: Light) => {
      // (`over`: drawn over what stands on the same row, as gear over the remains it dropped from.)
      const list: { x: number; y: number; over?: boolean; layer?: boolean; draw: (c: CanvasRenderingContext2D) => void }[] = [];
      // Whoever is well off the screen is not drawn at all (nor worked out).
      const W = ctx.canvas.width, H = ctx.canvas.height;
      const onScreen = (x: number, y: number, h = z) => {
        const sx = ox + x * T, sy = oy + (y - h * RISE) * T;
        return sx > -5 * T && sx < W + 5 * T && sy > -7 * T && sy < H + 5 * T;
      };
      for (const f of foes) {
        if (Math.round(f.alt) !== z || !test(f.y) || !onScreen(f.x, f.y, f.alt)) continue;
        list.push({ x: f.x, y: f.y, layer: true, draw: c => {
          const phase = Math.floor(f.walked / STRIDE) % 4;
          const frame: Frame = f.walked <= 0 ? "stand" : phase === 0 ? "stepR" : phase === 2 ? "stepL" : "stand";
          // Each member of the group drawn as what it is, back ones first.
          // (A multi-target enemy is one heap: its middle part draws the whole of it, in the middle.)
          const spots = spotsOf(f.def);
          const members = f.def.fight.map((m, i) => ({ kind: m.kind, key: memberKey(f.def.id, f.def.members?.[i] ?? i), at: (m.body ? [0, 0] : spots[i]) as [number, number] })).sort((a, b) => a.at[1] - b.at[1]);
          const holding = members.some(m => holdsRef.current[m.key]);
          const howlTime = FOE_TUNING[f.def.kind].howl;
          const howl = f.howl > 0 && howlTime ? 1 - f.howl / howlTime : undefined;
          for (const { kind, key, at: [dx, dy] } of members) {
            const px = ox + (f.x + dx) * T, py = oy + (f.y + dy - f.alt * RISE - BODY_ABOVE_FEET) * T;
            // A multi-target body is a heap seen from above, reaching with its arms toward what it is after.
            if (f.def.fight.some(m => m.body)) {
              if (kind === "blobMid") {
                if (holding) drawStringAura(c, px, py, T, 1.9, performance.now(), "back", seedOf(key));
                drawBlob(c, px, py, T, f.facing, frame, blobWeapons(f.def.fight), f.aimX, f.aimY, f.reach, performance.now());
                if (holding) drawStringAura(c, px, py, T, 1.9, performance.now(), "front", seedOf(key));
              }
              continue;
            }
            // (The boss's group, spread over his arena, stands looking toward its middle, where he is.)
            const facing: Dir = f.def.spread && (dx !== 0 || dy !== 0) ? (Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? "right" : "left") : dy < 0 ? "down" : "up") : f.facing;
            if (!f.def.girth) {
              // (Holding String you lost: a faint string coils round it, the back of the coil behind it and the front over it.)
              if (holdsRef.current[key]) drawStringAura(c, px, py, T, 1, performance.now(), "back", seedOf(key));
              MAP_FIGURES[kind](c, px, py, T, facing, frame, howl, f.chasing);
              if (holdsRef.current[key]) drawStringAura(c, px, py, T, 1, performance.now(), "front", seedOf(key));
              continue;
            }
            // A big one is drawn bigger, standing on the same spot.
            const feet = py + BODY_ABOVE_FEET * T, s = Math.max(1, f.def.girth * 1.9);
            if (holdsRef.current[key]) drawStringAura(c, px, py, T, s, performance.now(), "back", seedOf(key));
            c.save();
            c.translate(px, feet);
            c.scale(s, s);
            c.translate(-px, -feet);
            MAP_FIGURES[kind](c, px, py, T, f.facing, frame, howl, f.chasing);
            c.restore();
            if (holdsRef.current[key]) drawStringAura(c, px, py, T, s, performance.now(), "front", seedOf(key));
          }
        } });
      }
      for (const p of floorItems()) {
        if (Math.round(p.at.z) !== z || !test(p.at.y) || !onScreen(p.at.x, p.at.y, p.at.z)) continue;
        list.push({ x: p.at.x, y: p.at.y, over: true, draw: () => (p.string !== undefined || p.eternalString !== undefined ? drawStringPile : drawPickup)(ctx, ox + p.at.x * T, oy + (p.at.y - p.at.z * RISE - BODY_ABOVE_FEET) * T, T, performance.now(), p.eternalString !== undefined || !!p.gear?.eternal, seedOf(p.id)) });
      }
      // Whoever lies beaten, where it fell.
      for (const c of Object.values(corpsesRef.current)) {
        if (Math.round(c.alt) !== z || !test(c.y) || !onScreen(c.x, c.y, c.alt)) continue;
        list.push({ x: c.x, y: c.y, draw: () => MAP_REMAINS[c.kind](ctx, ox + c.x * T, oy + (c.y - c.alt * RISE - BODY_ABOVE_FEET) * T, T) });
      }
      // The map's props (people sealed in wax): features, not creatures; each one picture, drawn in its row like everything else.
      for (const d of propsOn(z)) {
        if (!test(d.y) || !onScreen(d.x, d.y)) continue;
        list.push({ x: d.x, y: d.y, draw: () => drawProp(ctx, d, ox, oy, T) });
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
        if (d.layer && lit < 0.98) {
          // An enemy that is faded is one object: drawn whole onto a layer of its own, which is then laid down faded as a single piece (drawn
          // straight onto the map, its overlapping limbs, weapon and shadow would each be faded separately and show through each other).
          const k = ctx.getTransform().a || 1, S = Math.ceil(6 * T);
          if (!layer || layer.width !== Math.ceil(S * k)) { layer = document.createElement("canvas"); layer.width = layer.height = Math.ceil(S * k); layerCtx = layer.getContext("2d"); }
          const px = ox + d.x * T, py = oy + (d.y - z * RISE - BODY_ABOVE_FEET) * T;
          const lc = layerCtx!;
          lc.setTransform(1, 0, 0, 1, 0, 0);
          lc.clearRect(0, 0, layer.width, layer.height);
          lc.setTransform(k, 0, 0, k, (S / 2 - px) * k, (S / 2 - py) * k);
          d.draw(lc);
          ctx.globalAlpha = lit;
          ctx.drawImage(layer, px - S / 2, py - S / 2, S, S);
          ctx.globalAlpha = 1;
          return;
        }
        ctx.globalAlpha = lit;
        d.draw(ctx);
        ctx.globalAlpha = 1;
      });
    };

    /** The tile rows that anyone or anything on level z stands in, so the walls above can be drawn between them. */
    const actorRows = (z: number) => {
      const rows = new Set<number>();
      // (Only those near enough to be on the screen: a row far off needs no wall drawn between.)
      const near = (y: number) => Math.abs(y - me.y) < 16;
      for (const f of foes) if (Math.round(f.alt) === z && near(f.y)) rows.add(Math.floor(f.y));
      for (const p of floorItems()) if (Math.round(p.at.z) === z && near(p.at.y)) rows.add(Math.floor(p.at.y));
      for (const c of Object.values(corpsesRef.current)) if (Math.round(c.alt) === z && near(c.y)) rows.add(Math.floor(c.y));
      for (const d of propsOn(z)) if (near(d.y)) rows.add(Math.floor(d.y));
      for (const k of KEEPERS) if (Math.round(k.at.z) === z && near(k.at.y)) rows.add(Math.floor(k.at.y));
      return [...rows];
    };

    /** Whether anyone or anything is on level z at all (the renderer keeps a still picture of the levels below you while nothing moves on them). */
    const actorsOn = (z: number) =>
      foes.some(f => Math.round(f.alt) === z) ||
      floorItems().some(p => Math.round(p.at.z) === z) ||
      Object.values(corpsesRef.current).some(c => Math.round(c.alt) === z) ||
      propsOn(z).length > 0 ||
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
      const phase = Math.floor(me.walked / PLAYER_STRIDE) % 4;
      const frame: Frame = me.walked <= 0 ? "stand" : phase === 0 ? "stepR" : phase === 2 ? "stepL" : "stand";
      // You wear what you have equipped.
      const look = playerLook(loadoutOf(invRef.current));
      renderer.draw({
        camX: cam.x, camY: cam.y, x: me.x, y: me.y, alt: me.alt, seen, origin: origins, reached,
        actors: drawFoes,
        actorsOn,
        actorRows,
        player: { draw: (ctx, px, py, T, solid) => (bodyDown ? drawRemains(ctx, px, py, T) : drawWalker(ctx, px, py, T, me.facing, frame, solid, solid ? (me.alt - me.ground) * RISE : 0, look)) },
      }, dtMs);
      if (disturbRef.current) drawDisturbance(disturbRef.current, performance.now());
    };

    /**
     * Whoever is hunting you but out of sight, felt at the edge of your light: a dark red glow that swells and ebbs round the circle, on the
     * side they come from. The nearer they are, the wider, stronger and quicker it pulses.
     */
    let disturbed = false;
    const drawDisturbance = (cv: HTMLCanvasElement, now: number) => {
      const w = cv.clientWidth, h = cv.clientHeight, mainW = canvasRef.current?.width ?? 0;
      if (!w || !mainW) return;
      const hunters: { ang: number; k: number }[] = [];
      for (const f of foes) {
        if (!f.chasing) continue;
        const dx = f.x - me.x, dy = (f.y - f.alt * RISE) - (me.y - me.alt * RISE), d = Math.hypot(dx, dy);
        if (d > 16 || d < 0.01) continue;
        const sees = Math.abs(me.alt - f.alt) < 0.5 && (seenLast?.[Math.round(f.alt)]?.[Math.floor(f.y) * WORLD.w + Math.floor(f.x)] ?? -1) >= 0;
        if (!sees) hunters.push({ ang: Math.atan2(dy, dx), k: Math.max(0.2, 1 - d / 16) });
      }
      if (!hunters.length) {
        if (disturbed) { cv.getContext("2d")!.clearRect(0, 0, cv.width, cv.height); disturbed = false; }
        return;
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      const g = cv.getContext("2d")!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      disturbed = true;
      const T = renderer.T * (w / mainW);
      const px = w / 2 + (me.x - cam.x) * T, py = h / 2 + (me.y - me.alt * RISE - cam.y + BODY_ABOVE_FEET) * T;
      const R = VISION_RADIUS * T, t = now / 1000;
      // The strongest few only.
      for (const hu of hunters.sort((a, b) => b.k - a.k).slice(0, 4)) {
        // A slow swell and a quick uneasy flutter; both quicker as it nears.
        const swell = 0.5 + 0.5 * Math.sin(t * (1.6 + 3.2 * hu.k) + hu.ang * 3);
        const flutter = 0.5 + 0.5 * Math.sin(t * 13 + hu.ang * 7) * Math.sin(t * 5.3);
        const strength = hu.k * (0.35 + 0.5 * swell + 0.15 * flutter);
        const half = 0.35 + 0.5 * hu.k;
        // Layers of a sector, each a little narrower and the edge of the light a little different, so the glow has no hard sides.
        for (let i = 0; i < 5; i++) {
          const a = hu.ang + Math.sin(t * 2.1 + i * 1.7) * 0.07, wid = half * (1 - i * 0.17), rr = R * (1 + Math.sin(t * 3.3 + i) * 0.015);
          g.save();
          g.beginPath();
          g.moveTo(px, py);
          g.arc(px, py, rr * 1.3, a - wid, a + wid);
          g.closePath();
          g.clip();
          const grad = g.createRadialGradient(px, py, rr * 0.82, px, py, rr * 1.28);
          grad.addColorStop(0, "rgba(110, 18, 30, 0)");
          grad.addColorStop(0.45, `rgba(130, 22, 36, ${0.2 * strength})`);
          grad.addColorStop(1, "rgba(110, 18, 30, 0)");
          g.fillStyle = grad;
          g.fillRect(px - rr * 1.4, py - rr * 1.4, rr * 2.8, rr * 2.8);
          g.restore();
        }
      }
    };

    /** After a fatal fall begins: the camera and the map stay as they were, and the body falls on until it reaches the ground. */
    const fallOn = (dtMs: number) => {
      if (bodyDown) return;
      const dt = dtMs / 1000;
      const under = surfaceNear(Math.floor(me.x), Math.floor(me.y), me.x, me.y, me.alt) ?? { h: FALL_DEATH_ALT, t: 0 };
      me.fall += GRAVITY * dt;
      me.alt -= me.fall * dt;
      me.ground = under.h;
      if (me.alt <= under.h) {
        me.alt = under.h;
        me.fall = 0;
        bodyDown = true;
        if (me.alt > FALL_DEATH_ALT + 1) step("player", "land", 1, 0);
      }
    };

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(now - last, 100);
      last = now;
      if (doomedRef.current) fallOn(dt);
      else if (!pausedRef.current && !talkRef.current && !leaving.current) update(dt);
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
    <div className="explore no-mouse">
      <canvas ref={canvasRef} className="explore-canvas" />
      <canvas ref={disturbRef} className="explore-disturb" aria-hidden="true" />
      {preparing !== null && <div className="explore-loading">Preparing the map… {Math.round(preparing * 100)}%</div>}
      {nearPickup && !got && !paused && !entering && !talk && (
        <div className="explore-prompt"><kbd>E</kbd> Pick Up</div>
      )}
      {/* The eternal gear you just picked up, in the prompt's place: its sprite and its name, fading away. */}
      {got && !paused && (
        <div key={got.id} className="explore-prompt explore-got">
          {got.gear ? <GearSprite slot={got.gear.slot} tier={got.gear.tier} item={got.gear.item} /> : <YarnBall className="explore-got-knot" red />}
          <span>{got.gear ? gearName(got.gear) : "Knot"}</span>
        </div>
      )}
      {/* The String you just gathered: the counter at the top, with "+X" under it, fading away. */}
      {stringHud && !paused && (
        <div key={stringHud.id} className="explore-string">
          <StringCounter
            amount={stringRef.current} eternal={eternalRef.current}
            pops={stringHud.amount !== undefined ? [{ id: stringHud.id, amount: stringHud.amount }] : []}
            eternalPops={stringHud.eternal !== undefined ? [{ id: stringHud.id, amount: stringHud.eternal }] : []}
          />
        </div>
      )}
      {near && !nearPickup && !paused && !entering && !talk && (
        <div className="explore-prompt"><kbd>E</kbd> Speak with the guide</div>
      )}
      {sleeping && <div className="explore-sleep" />}
      {doomed && !sleeping && (
        <div className="result is-fall" role="dialog" aria-label="You fell">
          <div className="result-card">
            <h2>You fade</h2>
            <div className="setup-buttons"><button className="commit" onClick={() => reawakenRef.current()}>Wake again</button></div>
          </div>
        </div>
      )}
      {talk && <Dialogue speaker="The guide" text={talk.lines[talk.at]} written={written} last={talk.at + 1 >= talk.lines.length} />}
      {thanks && (
        <div className="result" role="dialog" aria-label="Thanks for playing">
          <div className="result-card">
            <h2>Thanks for playing</h2>
            <div className="setup-buttons"><button className="commit" onClick={() => latest.current.onExit({ ...snapshot.current(), at: DEMO_BEFORE })}>Main menu <kbd>E</kbd></button></div>
          </div>
        </div>
      )}
      {entering && <div className="explore-fade" />}
      {screen?.kind === "inventory" && (
        <InventoryScreen inv={inv} player={barsPlayer()} string={stringRef.current} eternalString={eternalRef.current} knot={knotRef.current} ground={groundNear()} start={screen.start} onUse={useInventory} onClose={() => setScreen(null)} />
      )}
      {screen?.kind === "guide" && (
        <GuideMenu
          inv={inv}
          player={barsPlayer()}
          unwindFirst={screen.unwindFirst}
          empowerFirst={screen.empowerFirst}
          empowerUnlocked={!!tutorialRef.current.empowered}
          onVisitUnwind={() => { if (!tutorialRef.current.unwound) { tutorialRef.current = { ...tutorialRef.current, unwound: true }; latest.current.onSave(snapshot.current()); } }}
          string={stringRef.current}
          eternalString={eternalRef.current}
          stats={statsRef.current}
          onEmpower={empower}
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
