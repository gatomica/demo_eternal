/**
 * Scene.tsx — the battlefield: the floor and every figure, seen through the camera.
 */
import { StringAura } from "./StringCounter";
import { Fragment, memo, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Variant } from "../core/bestiary";
import type { ArmorItem, ArmorTier, HeadItem, Side, WeaponItem, WeaponTier } from "../core/types";
import { BODY_FORWARD, BODY_RADIUS, EYE_HEIGHT, orbitBox, orbitCamera, BODY_SIDE_SLOT, type Cam, darkAt, floorDisc, SHADE_RADIUS, ease, easeOut, figureBox, HORIZON, LIGHT, lerpAngle, lerpCam, lerpVec, facingVec, focusOf, NEAR, planningCamera, project, projectPoint, right, type MoveStage, type SceneShot, screenOf, shotCamera, type ShotCamera, toCamera, trackingCamera, type Vec, yawOf } from "./camera";
import { ClangBurst, EternityHalo, FlameHit, HaloBurst, ImpactRing, type Projectile, ProjectileShape, Shockwave } from "./effects";
import type { Pt } from "./geom";
import { Blood, Shards } from "./HealthBar";
import { lookOf } from "./looks";
import { ALL_POSES, flameOf, type PoseName } from "./poses";
import { CloakRemains, GuideRemains, Remains } from "./Remains";
import { StickFigure } from "./StickFigure";
import { AMBIENT } from "./shade";
import { facingYaw, liftPose, type P3, placeRig, ribcageOf } from "./rig3d";
import { LittleFlame } from "./LittleFlame";
import { UsurpWisps, WispStreams } from "./UsurpWisps";
import { FlameStrings } from "./FlameStrings";
import { FlameAnchor, HeadFlame } from "./HeadFlame";
import { HEAD_TOP, Waxed3D } from "./Waxed3D";
import { Sleepwalker3D } from "./Sleepwalker3D";
import { Warden3D } from "./Warden3D";
import { isWardenPose, placeWarden, wardenFist, wardenFlame, wardenRig } from "../warden/pose3d";
import { BlobPool, type BlobBox } from "./WaxBlob";

/** How wide the pool of wax under the dead Warden is: its radius, in meters (at a figure scale of 1). */
const DEAD_POOL_RADIUS = 0.85;
import { ARENA_PROPS, PROP_FLAME, PROP_SCALE, SealedSleeper } from "../warden/arena";
import { IGNITE } from "../warden/scenes";
import type { CandleArm, WardenPoseName } from "../warden/skeleton";

export interface SceneFigure {
  id: string;
  view: "front" | "back";
  /** Seen straight on, not at a 3/4 angle, and so not mirrored (the Model viewer). */
  straight?: boolean;
  /** An enemy, whichever way it's seen. */
  foe?: boolean;
  /** The hand that holds its weapon (default right). */
  hand?: Side;
  /** Label its hands and feet R and L (the Model viewer's Model stance). */
  sides?: boolean;
  pose: PoseName;
  weapon: WeaponTier;
  armor: ArmorTier;
  /** The starting classes' own weapon and armor you carry (their look). */
  weaponItem?: WeaponItem;
  armorItem?: ArmorItem;
  headItem?: HeadItem;
  /** A level swing's trail (see StickFigure). */
  trail?: number;
  variant?: Variant;
  /**
   * It is dodging: the way it goes (a unit vector on the floor), and whether it is backing off. It faces along it (advancing), or away
   * from it (retreating), for as long as this is set; the combat screen sets it from the dodge until the figure starts repositioning.
   */
  dodge?: {
    dir: Vec; retreat: boolean;
    /** Landed, it slides on (`actionPoses`' `slide`): from `turn` degrees to its left of the way its dodge faces, it turns to its right over `ms` (from
     *  `since`, performance.now()) until it faces as the `to` pose will (facing you). */
    slide?: { since: number; ms: number; turn: number; to: string; way?: "right" | "near"; from?: string };
    /** (the combat screen's) This is its Maneuver's own move to its new spot, not a dodge of an attack: it faces along it until the turn is over. */
    reposition?: boolean;
    /** (the combat screen's) Its own leap and slide, an Attack's (`leap`): it faces along it until the turn is over. */
    leap?: boolean;
    /** Its dash is a jump: off the floor from `since` (performance.now()) for `ms`, rising as high as `height` (meters) halfway, and landing as it ends. */
    hop?: { since: number; ms: number; height: number };
  };
  /** It carries a flame of its own (a waxed): phase two's scene draws on it. */
  flame?: boolean;
  arm?: CandleArm;
  lingerFrom?: WardenPoseName;
  /** When (performance.now()) the Warden's flame went out, while its smoke still shows. */
  smokeSince?: number;
  /** A candle burning on its head (the waxed remains, once the arena is lit). */
  candle?: boolean;
  /**
   * A lit waxed's own flame, burning on its head: "lit", or "blaze" while it gathers it to burst (brighter, red strings looping out of it and
   * back in, and no flame in its hands).
   */
  headFlame?: "lit" | "blaze";
  /** Wax caked on it (the player, Waxed). */
  waxCaked?: boolean;
  /** You just spent Eternity on your weapon's effect: it flashes (a new key flashes again). */
  eternalFlash?: string;
  /** A patrol warden's pointed hood. */
  hooded?: boolean;
  /** Drawn from the 3D rig as a sleepwalker (Sleepwalker3D). */
  sleepwalker3d?: boolean;
  /** The Warden, drawn from the 3D rig (Warden3D). */
  warden3d?: boolean;
  /** The player drawn in 3D, on the Sleepwalker's body (Sleepwalker3D's `gear`): its pose already one of the 3D ones (`player3dPose`). */
  player3d?: boolean;
  /** The player is throwing a Punch with its empty left hand: its pose is drawn mirrored, the weapon held back in the right (Sleepwalker3D's `punch`). */
  punch?: boolean;
  /** The player's pose drawn mirrored, the gear not (the Left leg leading stance: Right leg leading's mirror; Sleepwalker3D's `mirror`). */
  mirror?: boolean;
  /** Sealed whole in wax (its flame taken by Usurp Flame). */
  encased?: boolean;
  /** It has fallen: its body in "pieces" on the floor (drawn instead of the figure), or sealed in "wax". */
  dead?: "pieces" | "wax" | "cloak" | "guide";
  /**
   * It is striking this one (`key`: which blow, the same for every beat of it): it faces the way it faced it when the blow began, and does not turn from
   * there, whatever the target does (knocked back, dodging past, backing off) until the blow is over.
   */
  faceToward?: { id: string; key: string };
  /** The Warden gathering a Flame Blast: red wisps circle round her wax arm, as they do round a lit waxed gathering its flame (`FlameStrings`). */
  armBlaze?: boolean;
  /**
   * Whom it stands facing before its blow: the one it has picked, when that is another enemy (the waxed whose flame the Warden's Usurp Flame goes for), instead of you. Its blow
   * itself is faced as `faceToward` has it.
   */
  faceAt?: string;
  /** It fell as the turn now playing plays: the player still faces it (as it struck it) until the turn is over. */
  fellThisTurn?: boolean;
  /** The Warden's remains in his second form: the wax is burnt black. */
  charred?: boolean;
  /** The Warden: phase two's look (black wax, burning inside) whatever his arm. */
  phase2Look?: boolean;
  /** The Warden: his flail is on fire. */
  flailFire?: boolean;
  /** Size relative to a normal figure. */
  scale?: number;
  /** A part of a multi-target enemy (the Wax Blob): its body, and which part it is. The parts stand in one heap. */
  body?: string;
  part?: "left" | "mid" | "right";
  /** Playback animations (fx-hit, fx-step...). */
  classes: string[];
  /** Changes on every playback beat, so animations replay. */
  stepKey: string;
  selected: boolean;
  disabled: boolean;
  label: string;
  onPick: () => void;
  /** Drawn right below it (its health bar, while it is the target). */
  bar?: ReactNode;
  /** It holds String you lost: a faint string coils round it, fading in and out of sight. */
  holdsString?: boolean;
}

/** Enemies seen from the front face left, so their drawing is mirrored (unless seen straight on). */
const isMirrored = (f: SceneFigure) => f.view === "front" && !f.straight;
/** The Warden in his second form (its scene, or his candle arm scorched after it): the red flame in his fist, the red light round him. */
const wardenSecondForm = (f: SceneFigure) => !!f.phase2Look || f.arm === "scorched";

/** A figure's move to its spot: from where it was, over `ms` from `start`, eased in and out (or, `out`, slowing to a halt). */
interface Move { from: Vec; to: Vec; start: number; ms: number; out: boolean; endSpeed: number; stages?: MoveStage[] }

/** A repeatable random number in [0, 1) for each index. */
const rand = (seed: number, i: number) => {
  const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Draws the floor and every figure through the camera. When a new shot arrives, everyone (and
 * the camera) moves from wherever they are right now to the new spots, over the shot's duration.
 */
export function Scene({ figures, shot, projectiles = [], dark, usurpTrails = [], arena, arenaLit, ignite, light, shade = true, onSelectedBox, orbit, peek }: {
  figures: SceneFigure[];
  shot: SceneShot;
  projectiles?: Projectile[];
  /** The light dying (0 to 1, over `ms`), all but one figure's flame, which keeps burning (or the glow of one figure's own light, the guide's orb). */
  dark?: { level: number; ms: number; flame?: string; glow?: string };
  /** Flames streaming from figures, each arching over another, into its candle hand. */
  usurpTrails?: { from: string; to: string; key: string; /** Red wisps (`UsurpWisps`) taking this many ms to reach the hand, instead of the fire arch. */ wisps?: number }[];
  /** The Warden's arena: sleepwalkers sealed into its floor and walls. */
  arena?: boolean;
  /** The sealed sleepwalkers' candles (and the waxed remains') burn. */
  arenaLit?: boolean;
  /**
   * The Warden's phase-two scene: who, when it started (performance.now(); not yet, if unset),
   * and a seed for its randomness.
   */
  ignite?: { who: string; start?: number; seed: number };
  /** A fight's limited light: only the floor near the player is lit, the back line just inside its edge. */
  light?: boolean;
  /** Told, every time it moves on the screen, where the selected figure is right now (its box, and the screen's size): null when none is selected. The target ring follows it, camera move and all. */
  onSelectedBox?: (box: { x: number; y: number; w: number; h: number; hudW: number; hudH: number; markY: number } | null) => void;
  /** The ambient shade: everything a little darker than it really is (default on; the Model viewer can turn it off to check the real colours). */
  shade?: boolean;
  /**
   * The Model viewer's Model stance: the camera centres on the enemies (or on you, `focus`), nobody else is drawn, and dragging turns the figure round (`yaw`, degrees:
   * 0 seen from in front) and raises or lowers the camera over it (`pitch`, degrees): `onDrag` is told how far each drag moved, in those degrees.
   */
  orbit?: { yaw: number; pitch: number; focus: "foes" | "player"; onDrag: (yaw: number, pitch: number) => void };
  /**
   * (The model viewer, any pose but the Model stance.) Dragging the scene swings the camera round (and over or under) the figures looked at, for as long
   * as the button is held; let go, and it is back where the fight has it. The figures face as they would; only the camera moves.
   */
  peek?: { focus: "foes" | "player" };
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  /** The way each figure faced as its blow began (`SceneFigure.faceToward`), kept for the whole blow. */
  const faceLock = useRef(new Map<string, { key: string; yaw: number; target: string }>());
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Tween state lives in refs; a frame counter re-renders while anything is moving.
  // The camera moves from where it was (`from`) to the shot's camera. A riding camera that was
  // already riding just turns (`fromYaw` to the new yaw) while it follows its figure.
  // A camera between two fighters that was already between those two keeps tracking them as they move
  // (`tracking`), instead of easing from where it was.
  const cam = useRef<{ from: Cam; to: ShotCamera; fromYaw: number | null; tracking: boolean }>({
    from: shotCamera(shot),
    to: shot.camera,
    fromYaw: "follow" in shot.camera ? shot.camera.yaw : null,
    tracking: "between" in shot.camera,
  });
  const pos = useRef(new Map<string, Move>());
  const timing = useRef({ start: 0, ms: 0, out: false });
  const [, setFrame] = useState(0);
  const progress = () => {
    const { start, ms } = timing.current;
    return ms <= 0 ? 1 : Math.min(1, (performance.now() - start) / ms);
  };
  /** How far the shot's move has got, eased as it moves. */
  const eased = () => (timing.current.out ? easeOut : ease)(progress());
  /** How far a figure's move has got, eased (each figure on its own timing: most on the shot's, `SceneShot.own` on theirs). */
  const movedOf = (m: Move, at = performance.now()) => {
    // (in stages: each its share of the way, over its own time, slowing from its start to its end speed)
    if (m.stages) {
      let left = at - m.start, done = 0;
      for (const st of m.stages) {
        if (left < st.ms) { const t = Math.max(0, left / st.ms); return done + st.share * ((2 - st.endSpeed) * t - (1 - st.endSpeed) * t * t); }
        left -= st.ms; done += st.share;
      }
      return 1;
    }
    const t = m.ms <= 0 ? 1 : Math.max(0, Math.min(1, (at - m.start) / m.ms));
    // (slowing steadily from its start to `endSpeed`, a share of its average speed: at 0 the same as `easeOut`)
    return m.out ? (2 - m.endSpeed) * t - (1 - m.endSpeed) * t * t : ease(t);
  };
  const posNow = (id: string, at?: number) => {
    const m = pos.current.get(id);
    return m ? lerpVec(m.from, m.to, movedOf(m, at)) : undefined;
  };
  const camNow = (k = eased()): Cam => {
    const { from, to, fromYaw, tracking } = cam.current;
    if ("between" in to) {
      // Centered between the two wherever they are right now: pushed, knocked back or dodging. (One that is several parts, the Wax Blob, is
      // framed whole: all its parts count, not only the one in the action.)
      const whole = (id: string): Vec[] => {
        const body = figures.find(f => f.id === id)?.body;
        return (body ? figures.filter(f => f.body === body).map(f => f.id) : [id]).map(i => posNow(i)).filter((p): p is Vec => !!p);
      };
      const a = posNow(to.between[0]), b = posNow(to.between[1]);
      if (!a || !b) return from;
      // (Backing off as far as it takes to show the two whole.)
      const scale = (id: string) => figures.find(f => f.id === id)?.scale ?? 1;
      const centered = trackingCamera(to.yaw, whole(to.between[0]), whole(to.between[1]), size.h ? { aspect: size.w / size.h, scales: [scale(to.between[0]), scale(to.between[1])] } : undefined);
      return tracking ? centered : lerpCam(from, centered, k);
    }
    if (!("follow" in to)) return lerpCam(from, to, k);
    const at = posNow(to.follow);
    if (!at) return from;
    const riding = planningCamera(at, lerpAngle(fromYaw ?? from.yaw, to.yaw, k));
    // Already riding: stay locked on. Coming from a fixed shot: ease into the ride.
    return fromYaw !== null ? riding : lerpCam(from, riding, k);
  };

  useLayoutEffect(() => {
    // Start every move from where things are on screen right now.
    const k = eased();
    const prev = cam.current.to;
    const nowCam = camNow(k);
    // Keep riding (and turning from the current angle) if the camera was riding the same figure.
    const stillRiding = "follow" in prev && "follow" in shot.camera && prev.follow === shot.camera.follow;
    const fromYaw = stillRiding && "follow" in prev ? lerpAngle(cam.current.fromYaw ?? prev.yaw, prev.yaw, k) : null;
    const tracking = "between" in prev && "between" in shot.camera && prev.between[0] === shot.camera.between[0] && prev.between[1] === shot.camera.between[1];
    const now = performance.now();
    for (const [id, to] of Object.entries(shot.positions)) {
      const own = shot.own?.[id], start = own?.since ?? now, was = pos.current.has(id) && !shot.snap?.includes(id) ? posNow(id, start) : undefined;
      // (one still on its way to the same spot, on its own move, keeps going as it was: a knockback's shot does not cut short a leap past it)
      const going = pos.current.get(id);
      if (!own && going && !shot.snap?.includes(id) && (going.stages || going.out) && Math.hypot(going.to.x - to.x, going.to.z - to.z) < 1e-6 && now - going.start < going.ms) continue;
      pos.current.set(id, { from: was ?? to, to, start, ms: own?.ms ?? shot.ms, out: own ? own.easing === "out" : shot.easing === "out", endSpeed: own?.endSpeed ?? 0, stages: own?.stages });
    }
    cam.current = { from: nowCam, to: shot.camera, fromYaw, tracking };
    timing.current = { start: performance.now(), ms: shot.ms, out: shot.easing === "out" };
    let raf = 0;
    const tick = () => {
      setFrame(f => f + 1);
      const moving = [...pos.current.values()].some(m => m.ms > 0 && performance.now() - m.start < m.ms);
      if (progress() < 1 || moving) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot.version]);

  // The phase-two scene animates every frame until it ends.
  const igniteStart = ignite?.start;
  useEffect(() => {
    if (igniteStart === undefined) return;
    let raf = 0;
    const tick = () => {
      setFrame(f => f + 1);
      if (performance.now() - igniteStart < IGNITE.end) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [igniteStart]);
  /** How far into the phase-two scene it is, in ms. */
  const igniteT = igniteStart === undefined ? 0 : performance.now() - igniteStart;

  const { w, h } = size;
  // Orbiting: the camera is centred on the figures looked at, far enough off to show the tallest whole (a body of several parts, spread out, further).
  const orbitFigures = orbit ? figures.filter(f => (orbit.focus === "player" ? f.id === "player" : f.id !== "player")) : [];
  const orbiting = (): Cam => {
    const ps = orbitFigures.map(f => posNow(f.id)).filter((p): p is Vec => !!p);
    const centre = ps.length ? { x: ps.reduce((n, p) => n + p.x, 0) / ps.length, z: ps.reduce((n, p) => n + p.z, 0) / ps.length } : { x: 0, z: 0 };
    const big = Math.max(1, ...orbitFigures.map(f => f.scale ?? 1)), spread = Math.max(0, ...ps.map(p => Math.hypot(p.x - centre.x, p.z - centre.z)));
    return orbitCamera(centre, orbit!.pitch, 0.95 * big, (3.2 + spread * 1.2) * big);
  };
  // A peek (`peek`): while the button is held, the fight's camera swung round the figures looked at, about a point a meter up among them, and raised
  // or lowered round it, tilting to keep looking at it.
  const [peekView, setPeekView] = useState<{ yaw: number; pitch: number } | null>(null);
  const peeking = !orbit && !!peek && !!peekView;
  const peekAt = (c0: Cam, v: { yaw: number; pitch: number }): Cam => {
    const them = figures.filter(f => (peek!.focus === "player" ? f.id === "player" : f.id !== "player")).map(f => posNow(f.id)).filter((p): p is Vec => !!p);
    if (!them.length) return c0;
    const P = { x: them.reduce((n, p) => n + p.x, 0) / them.length, z: them.reduce((n, p) => n + p.z, 0) / them.length }, H = 1;
    const a = (v.yaw * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
    const x0 = c0.x - P.x, z0 = c0.z - P.z, y = (c0.eye ?? EYE_HEIGHT) - H;
    const x1 = x0 * ca + z0 * sa, z1 = z0 * ca - x0 * sa, flat = Math.hypot(x1, z1) || 1e-6, len = Math.hypot(flat, y);
    const rise = Math.atan2(y, flat), to = Math.max(-1.05, Math.min(1.48, rise + (v.pitch * Math.PI) / 180)), k = (len * Math.cos(to)) / flat;
    return { x: P.x + x1 * k, z: P.z + z1 * k, yaw: c0.yaw + a, look: c0.look, eye: H + len * Math.sin(to), pitch: (c0.pitch ?? 0) + (to - rise) };
  };
  // (The figures face as the fight's own camera has them: `cFight`.)
  const cFight = orbit ? orbiting() : camNow();
  const c = peeking ? peekAt(cFight, peekView!) : cFight;
  const orbitDrag = useRef<{ x: number; y: number } | null>(null);
  let placed = figures
    .filter(f => !orbit || orbitFigures.includes(f))
    .map(f => {
      const p = posNow(f.id);
      return p && w ? { f, box: orbit || peeking ? orbitBox(c, p, w, h, f.scale) : figureBox(c, p, w, h, f.scale), at: p, raw: p } : null;
    })
    .filter((x): x is { f: SceneFigure; box: ReturnType<typeof figureBox>; at: Vec; raw: Vec } => !!x && x.box.depth > NEAR)
    .sort((a, b) => b.box.depth - a.box.depth); // far first, so nearer figures draw on top
  // The arena's sealed sleepwalkers, fixed in the world.
  // (Only in the Warden's arena; never right on top of the camera.)
  const props = w && arena
    ? ARENA_PROPS.map(pr => ({ pr, box: figureBox(c, pr.pos, w, h, PROP_SCALE[pr.kind]) })).filter(x => x.box.depth > 3)
    : [];
  const proj = (p: Vec) => project(c, p, w, h);
  /**
   * How much of its brightness a figure keeps in a fight's light: by how far it stands from the
   * camera's subject (you, or the middle of the two fighting), not by where its drawing falls on screen, so a figure inside the light is never
   * darkened by the dark beyond it (its head rising above the edge of the circle, say).
   */
  // (The ambient shade is under all of that: every figure shows at `AMBIENT` of its brightness.)
  const ambient = shade ? AMBIENT : 1;
  const lightAt = (p: Vec) => {
    if (!light) return ambient;
    const me = focusOf(c);
    return ambient * (1 - darkAt(Math.hypot(p.x - me.x, p.z - me.z)));
  };
  /** How high a figure is off the floor now (meters): mid-jump, in a dodge's dash that is a jump (`dodge.hop`), as a thrown thing flies, up and down again. */
  const riseOf = (f: SceneFigure) => {
    const hop = f.dodge?.hop;
    if (!hop || hop.ms <= 0) return 0;
    const t = (performance.now() - hop.since) / hop.ms;
    return t <= 0 || t >= 1 ? 0 : 4 * hop.height * t * (1 - t);
  };
  /** The way a figure faces on the floor: along its dodge, else toward the player. */
  // (worked out once a frame for each figure standing at a spot: it is asked a dozen times a frame, and it filters the figures each time)
  /**
   * What a figure's drawing is keyed by. A figure is drawn afresh every playback beat (its trails, arcs and effects play from their start), but one that shows
   * the same as on the last beat and has no effect on it (no hit, step or break class) is the same picture: it is kept, instead of rebuilding its whole drawing.
   */
  const wrapKey = (f: SceneFigure) => {
    const sig = `${f.pose}|${f.dead}|${f.arm}|${f.lingerFrom}|${f.flailFire}|${f.waxCaked}|${f.eternalFlash}|${f.encased}|${f.headFlame}|${f.holdsString}|${f.smokeSince}|${f.phase2Look}|${f.charred}|${f.hand}|${f.hooded}|${JSON.stringify(f.trail)}`;
    const was = wrapKeys.current.get(f.id);
    if (was && was.sig === sig && !f.classes.length) return was.key;
    wrapKeys.current.set(f.id, { sig, key: f.stepKey });
    return f.stepKey;
  };
  const wrapKeys = useRef(new Map<string, { sig: string; key: string }>());
  const yaws = new Map<string, number>();
  const figureYaw = (f: SceneFigure, at: Vec) => {
    const key = `${f.id}|${at.x}|${at.z}`;
    let yaw = yaws.get(key);
    if (yaw === undefined) yaws.set(key, yaw = figureYawNow(f, at));
    return yaw;
  };
  const figureYawNow = (f: SceneFigure, at: Vec) => {
    // Orbiting: every figure is turned the same, `orbit.yaw` round from facing the camera.
    if (orbit) return Math.PI - (orbit.yaw * Math.PI) / 180;
    const dodgeWay = dodgeFacing(f);
    if (dodgeWay) {
      const base = yawOf(dodgeWay), s = f.dodge?.slide;
      if (!s) return base;
      // Sliding on after its dodge: from a little to its left of the way it dodged, turning to its right, slowing as the slide does, to face as its next
      // stance will (toward you, turned as that pose turns its hips, less what the pose it lands in turns them already).
      const t = s.ms > 0 ? Math.max(0, Math.min(1, (performance.now() - s.since) / s.ms)) : 1;
      const hips = (p: string) => (isWardenPose(p) ? wardenRig(p).yaw : 0), TAU = Math.PI * 2;
      // (`from`: the pose it was in before it landed, if not this one: it turns on from where that pose had it facing, with no jump as the pose changes)
      const from = base - (s.turn * Math.PI) / 180 + (s.from ? hips(s.from) - hips(f.pose) : 0), to = facingYaw(cFight, at, posNow("player"), f.view, false) + hips(s.to) - hips(f.pose);
      // (to its right, or, `near`, whichever way round is shorter)
      const right = (((to - from) % TAU) + TAU) % TAU, turn = s.way === "near" && right > Math.PI ? right - TAU : right;
      return from + turn * easeOut(t);
    }
    if (!f.faceToward) {
      // No blow now. One that defeated its target is still faced: for the rest of the turn it fell in (the others being attacked meanwhile do not turn you away from it),
      // and, once none is left up, after the fight is won too (you do not turn to the default way, or to where another lies). Otherwise nothing is held.
      const held = faceLock.current.get(f.id), foe = held && figures.find(g => g.id === held.target);
      const over = !!foe && (!!foe.fellThisTurn || (!!foe.dead && figures.every(g => g.id === f.id || g.dead)));
      if (held && over && f.player3d && !f.straight) return held.yaw;
      faceLock.current.delete(f.id);
    } else if (!f.straight) {
      // (worked out the first time it is asked in a blow, from where the two stand then, and held until the blow is over)
      if (faceLock.current.get(f.id)?.key !== f.faceToward.key) {
        const me = posNow(f.id), foe = posNow(f.faceToward.id);
        if (me && foe) faceLock.current.set(f.id, { key: f.faceToward.key, yaw: facingYaw(cFight, me, foe, f.player3d ? "front" : f.view, false), target: f.faceToward.id });
        else faceLock.current.delete(f.id);
      }
      const held = faceLock.current.get(f.id);
      if (held) return held.yaw;
    }
    // The player in 3D faces the enemies (the middle of those still up), unless the viewer shows it straight on. One that falls to its blow still
    // counts until the turn is over (it does not turn away mid-strike), and with none left up it goes on facing where they lie.
    if (f.player3d && !f.straight) {
      const all = figures.filter(g => g.id !== "player"), up = all.filter(g => !g.dead || g.fellThisTurn);
      const foes = (up.length ? up : all).map(g => posNow(g.id)).filter((p): p is Vec => !!p);
      if (foes.length) return facingYaw(cFight, at, { x: foes.reduce((n, p) => n + p.x, 0) / foes.length, z: foes.reduce((n, p) => n + p.z, 0) / foes.length }, "front", false);
    }
    if (f.faceAt && !f.straight) {
      const foe = posNow(f.faceAt);
      if (foe) return facingYaw(cFight, at, foe, f.view, false);
    }
    return facingYaw(cFight, at, posNow("player"), f.view, !!f.straight);
  };
  /** Where on the floor the Warden's blow lands (his flail's head for the Slam, else his candle fist: `wardenFist`), from his 3D rig, standing at `at`. */
  const wardenFloorAt = (f: SceneFigure, at: Vec): Vec => {
    const { wr } = placeWarden(f.pose, at, figureYaw(f, at), c, w, h, f.scale), p = wardenFist(f.pose), yaw = figureYaw(f, at) + wr.yaw, k = f.scale ?? 1;
    const fwd = facingVec(yaw), rgt = right(yaw);
    return { x: at.x + (rgt.x * p[0] + fwd.x * p[2]) * k, z: at.z + (rgt.z * p[0] + fwd.z * p[2]) * k };
  };
  /** The floor point under a screen x on a figure standing at `at` (its feet's depth). */
  const floorAt = (at: Vec, sx: number): Vec => {
    const { sx: fx, ppm } = proj(at);
    const r = right(c.yaw), k = (sx - fx) / ppm;
    return { x: at.x + r.x * k, z: at.z + r.z * k };
  };
  const toScreen = (box: { x: number; y: number; w: number; h: number }, p: readonly [number, number], mirror: boolean): Pt =>
    [box.x + (box.w * (mirror ? 100 - p[0] : p[0])) / 100, box.y + (box.h * p[1]) / 120];
  /**
   * Which way a figure faces while it is dodging (the drawn-in-3D ones only): along its dodge when it closes in, away from it when it
   * backs off. (undefined: not dodging; it faces you.)
   */
  const dodgeFacing = (f: SceneFigure): Vec | undefined => {
    if (!f.dodge || f.straight) return undefined;
    const { dir, retreat } = f.dodge;
    return retreat ? { x: -dir.x, z: -dir.z } : dir;
  };
  // The parts of a body (the Wax Blob) stand in the line as three separate enemies would; its pool lies behind the middle one.
  const poolCentre = (parts: { f: SceneFigure; raw: Vec }[]): Vec => {
    // The middle waxed is the reference: the pool lies behind it, along the line from it to you, far enough back that its knees (the one
    // farthest toward you, as the pose holds them) are on the rim. So the pool shifts a little with the middle one's pose; the sides stay
    // where they are on the line, and the wax links stretch to them. (A middle one with no rig, fallen, has the pool `BODY_FORWARD` behind it.)
    const mid = parts.find(({ f }) => f.part === "mid") ?? parts[0], m = mid.raw;
    const you = posNow("player") ?? m, d = Math.hypot(you.x - m.x, you.z - m.z) || 1, u = { x: (you.x - m.x) / d, z: (you.z - m.z) / d };
    const pose = ALL_POSES[mid.f.pose];
    let back = BODY_FORWARD;
    if (mid.f.variant === "waxed" && !mid.f.dead && pose) {
      const yaw = figureYaw(mid.f, m), fwd = facingVec(yaw), rgt = right(yaw), k = mid.f.scale ?? 1, joints = liftPose(pose, mid.f.hand).joints;
      const reach = Math.max(...(["kneeR", "kneeL"] as const).map(j => {
        const [x, , z] = joints[j];
        return ((rgt.x * x + fwd.x * z) * u.x + (rgt.z * x + fwd.z * z) * u.z) * k;
      }));
      back = BODY_RADIUS - reach;
    }
    return { x: m.x - u.x * back, z: m.z - u.z * back };
  };
  const centres = new Map<string, Vec>();
  for (const body of new Set(placed.map(({ f }) => f.body).filter((b): b is string => !!b))) {
    centres.set(body, poolCentre(placed.filter(({ f }) => f.body === body)));
  }

  /**
   * Where a figure's own flame burns, in screen pixels: the flame it holds, or else on top of its head (`onHead`: on its head, whatever it
   * holds). A waxed drawn in 3D: from its rig, where its head (or the flame in its hands) really is.
   */
  const flameSpot = (f: SceneFigure, box: { x: number; y: number; w: number; h: number }, at: Vec, onHead = false): Pt => {
    const pose = ALL_POSES[f.pose];
    // The Warden drawn in 3D: the flame on his candle hand, where it really is (at the fist's tip; in his second form, in the middle of it).
    if (f.warden3d && w > 0) {
      const { wr, placed: wp } = placeWarden(f.pose, at, figureYaw(f, at), c, w, h, f.scale, riseOf(f)), q = wp.see(wardenFlame(wr, wardenSecondForm(f)));
      return [q.sx, q.sy];
    }
    if (f.variant !== "waxed" || w <= 0 || !pose) {
      return toScreen(box, onHead && pose ? [pose.head[0], pose.head[1] - 12] : flameOf(f.pose), isMirrored(f));
    }
    const rig = liftPose(pose, f.hand), seen = placeRig(rig, at, figureYaw(f, at), c, w, h, f.scale);
    if (!onHead && rig.prop?.kind === "flame" && !rig.propHidden && f.headFlame !== "blaze" && seen.prop) return [seen.prop.at.sx, seen.prop.at.sy];
    // On top of the head as it is drawn (a sphere: its top is straight up the screen from its middle), its base sunk a little into the wax.
    const hd = seen.seen.head;
    return [hd.sx, hd.sy - HEAD_TOP * (hd.ppm / seen.origin.ppm) * (box.h / 120)];
  };
  /** The hand a figure's stolen flames stream into, in figure units. */
  const handOf = (f: SceneFigure) => lookOf(f.variant)?.flameHand ?? flameOf(f.pose);
  /** The same hand on the screen: from the 3D rig where the figure has one, else from its flat drawing. */
  const handSpot = (f: SceneFigure, box: { x: number; y: number; w: number; h: number }, at: Vec): Pt => (f.warden3d && w > 0 ? flameSpot(f, box, at) : toScreen(box, handOf(f), isMirrored(f)));
  /** Where a blow of his lands from, on the screen: the fist (or flail's head) from his 3D rig, else the flat drawing's point (box units, mirrored with it). */
  const originOf = (t: { f: SceneFigure; at: Vec }, a: { x: number; y: number; w: number; h: number }, o?: readonly [number, number]): [number, number] => {
    if (t.f.warden3d && w > 0 && o) {
      const q = placeWarden(t.f.pose, t.at, figureYaw(t.f, t.at), c, w, h, t.f.scale, riseOf(t.f)).placed.see(wardenFist(t.f.pose));
      return [q.sx, q.sy];
    }
    const ox = o ? (isMirrored(t.f) ? 100 - o[0] : o[0]) / 100 : 0.5;
    return [a.x + a.w * ox, o ? a.y + (a.h * o[1]) / 120 : a.y + a.h * 0.95];
  };
  // Lit for good once the arena is lit, or from the moment his flare relights them.
  const propLit = !!arenaLit || (!!ignite && igniteT >= IGNITE.flare);
  // Every flame the phase-two scene draws on, in screen space: the waxed, the sealed sleepwalkers,
  // and a ring of unseen ones beyond the edges of the screen.
  const igniter = ignite && placed.find(x => x.f.id === ignite.who);
  const sources: { id: string; at: Pt; kindle: number; draw: number; seen: boolean }[] = [];
  if (ignite && igniter) {
    const add = (id: string, at: Pt, seen: boolean) => {
      const i = sources.length;
      sources.push({ id, at, seen, kindle: IGNITE.kindle + rand(ignite.seed, i) * 1200, draw: IGNITE.draw + rand(ignite.seed + 1, i) * 1400 });
    };
    for (const { f, box, at } of placed) if (f.flame) add(f.id, flameSpot(f, box, at), true);
    for (const { pr, box } of props) add(pr.id, toScreen(box, PROP_FLAME[pr.kind], !!pr.flip), true);
    const [hx, hy] = handSpot(igniter.f, igniter.box, igniter.at);
    const far = Math.max(w, h) * 0.8;
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + rand(ignite.seed + 2, k);
      add(`beyond${k}`, [hx + Math.cos(a) * far, hy + Math.sin(a) * far * 0.7], false);
    }
  }

  /** Whether this piece of the arena stands between the camera and a fighter it overlaps (it goes see-through, so nobody is hidden). */
  // The pools of multi-target enemies: a disc on the floor under each body's parts, centred on them (the middle one is out at its
  // near edge, the sides a little behind it, so the pool is a little behind their mean), as wide as the parts stand round it.
  const blobs = [...new Set(placed.map(({ f }) => f.body).filter((b): b is string => !!b))].flatMap(body => {
    const parts = placed.filter(({ f }) => f.body === body);
    const mid = parts.find(({ f }) => f.part === "mid") ?? parts[0];
    const centre = centres.get(body)!;
    const disc = floorDisc(c, centre, BODY_RADIUS, w, h);
    // The wax that holds each part to the pool: it comes out of the pool's middle square to the way the body faces (along the line the parts
    // stand on), then curves round toward the front as it reaches the part, ending at its bound feet. A part that lunges or dodges away from
    // its slot stretches it (it thins as it stretches), so the part never comes apart from the pool.
    const links: BlobBox["links"] = [];
    const you = posNow("player") ?? mid.raw, dm = Math.hypot(you.x - mid.raw.x, you.z - mid.raw.z) || 1;
    const facing = { x: (you.x - mid.raw.x) / dm, z: (you.z - mid.raw.z) / dm }, across = { x: -facing.z, z: facing.x };
    const ground = (p: Vec) => projectPoint(c, p, 0, w, h);
    for (const { f, raw, at, box: pb } of parts) {
      const pose = ALL_POSES[f.pose];
      if (f.variant !== "waxed" || f.dead || !pose || w <= 0) continue;
      const out = { x: raw.x - centre.x, z: raw.z - centre.z }, d = Math.hypot(out.x, out.z) || 1, isMid = f.part === "mid";
      // The bound feet, in the world; the bend is where the line out along the line of parts meets the line in toward the feet.
      const yaw = figureYaw(f, at), fwd = facingVec(yaw), rgt = right(yaw), k = f.scale ?? 1, joints = liftPose(pose, f.hand).joints;
      const foot = { x: at.x, z: at.z };
      for (const j of ["footR", "footL"] as const) {
        const [x, , z] = joints[j];
        foot.x += ((rgt.x * x + fwd.x * z) * k) / 2; foot.z += ((rgt.z * x + fwd.z * z) * k) / 2;
      }
      const sideways = (foot.x - centre.x) * across.x + (foot.z - centre.z) * across.z;
      const bend = { x: centre.x + across.x * sideways, z: centre.z + across.z * sideways };
      const a = ground(centre), b = ground(bend), t = ground(foot);
      const stretch = isMid ? 0 : Math.max(0, d - BODY_SIDE_SLOT);
      const base = pb.w * 0.34;
      links.push({ ax: a.sx, ay: a.sy, kx: b.sx, ky: b.sy, tx: t.sx, ty: t.sy, width: Math.max(base * 0.3, base / (1 + 0.6 * stretch)) });
    }
    const box: BlobBox = { cx: disc.cx, cy: disc.cy, rx: disc.rx, ry: disc.ry, tall: mid.box.h, slumped: parts.every(({ f }) => !!f.dead), links };
    // Below every figure, whatever the parts' own depths.
    const lo = Math.min(...parts.map(({ box: b }) => 1000 - Math.round(b.depth * 10))) - 20;
    return [{ body, box, lo, filter: `brightness(${Math.max(0.68, Math.min(1, 1.12 - mid.box.depth * 0.06)) * lightAt(mid.at)})` }];
  });
  // Where each flame on a head burns (a lit waxed's, the candles of the waxed remains): its marker goes inside the figure, so the flame follows it.
  const headFlames = new Map(placed.filter(({ f }) => f.candle || f.headFlame).map(({ f, box, at }) => [f.id, flameSpot(f, box, at, true)]));
  const coversFigure = (box: ReturnType<typeof figureBox>) => placed.some(({ box: b }) =>
    b.depth > box.depth && b.x < box.x + box.w && b.x + b.w > box.x && b.y < box.y + box.h && b.y + b.h > box.y);

  // The selected figure's box as the camera has it this frame (the camera may still be moving), for the ring over it.
  const selectedItem = placed.find(({ f }) => f.selected), selectedBox = selectedItem?.box;
  // The small mark sits on the figure's ribcage: from the 3D rig where there is one (a waxed, a sleepwalker), else halfway between the neck and the hips of its pose.
  const markY = (() => {
    if (!selectedItem) return 0;
    const { f, box, at } = selectedItem, pose = ALL_POSES[f.pose];
    if (!pose) return box.y + box.h * 0.5;
    if (f.warden3d && !f.dead && w > 0) {
      const { wr, placed: wp } = placeWarden(f.pose, at, figureYaw(f, at), c, w, h, f.scale, riseOf(f)), j = wr.rig.joints;
      return wp.see([0, 1, 2].map(i => j.neck[i] + (j.pelvis[i] - j.neck[i]) * 0.3) as unknown as P3).sy;
    }
    if ((f.variant === "waxed" || f.sleepwalker3d || f.player3d) && !f.dead && w > 0) {
      const rig = liftPose(pose, f.hand, { freeLegs: !!(f.sleepwalker3d || f.player3d) });
      return placeRig(rig, at, figureYaw(f, at), c, w, h, f.scale).see(ribcageOf(rig).centre as P3).sy;
    }
    return box.y + (box.h * (((pose.for3d?.neck ?? pose.neck)[1] + (pose.for3d?.hip ?? pose.hip)[1]) / 2)) / 120;
  })();
  const lastSelected = useRef<string>("");
  useEffect(() => {
    if (!onSelectedBox) return;
    const key = selectedBox ? [selectedBox.x, selectedBox.y, selectedBox.w, selectedBox.h, markY, w, h].map(n => Math.round(n * 2)).join(",") : "";
    if (key === lastSelected.current) return;
    lastSelected.current = key;
    onSelectedBox(selectedBox ? { x: selectedBox.x, y: selectedBox.y, w: selectedBox.w, h: selectedBox.h, hudW: w, hudH: h, markY } : null);
  });

  return (
    <div
      className="scene"
      ref={boxRef}
      style={orbit || peek ? { cursor: peeking ? "grabbing" : "grab", touchAction: "none" } : undefined}
      onPointerDown={orbit || peek ? e => {
        orbitDrag.current = { x: e.clientX, y: e.clientY };
        // (a peek starts only once it is dragged, so a plain click is still a click)
        if (orbit) e.currentTarget.setPointerCapture(e.pointerId);
      } : undefined}
      onPointerMove={orbit || peek ? e => {
        const from = orbitDrag.current;
        if (!from) return;
        // (How far it moved is worked out here, not in the update: React runs that later, when the drag may be over.)
        const dy = (e.clientX - from.x) * 0.5, dp = (e.clientY - from.y) * 0.5;
        if (orbit) orbit.onDrag(dy, dp);
        else {
          if (!peekView && Math.hypot(dy, dp) < 2) return;
          if (!peekView) e.currentTarget.setPointerCapture(e.pointerId);
          setPeekView(v => ({ yaw: ((v?.yaw ?? 0) + dy) % 360, pitch: Math.max(-60, Math.min(85, (v?.pitch ?? 0) + dp)) }));
        }
        orbitDrag.current = { x: e.clientX, y: e.clientY };
      } : undefined}
      // (let go: a peek snaps back to the fight's camera)
      onPointerUp={orbit || peek ? () => { orbitDrag.current = null; setPeekView(null); } : undefined}
      onPointerCancel={orbit || peek ? () => { orbitDrag.current = null; setPeekView(null); } : undefined}
    >
      {/* A clean hit's red flash (`hit-red` in index.css): the figure's brightness mapped straight onto red, a plain linear map, so the 3D figures'
          shading and the seams between their faces stay as smooth as they are (a saturate() filter multiplies every small difference into speckle). */}
      <svg className="fx-defs" width="0" height="0" aria-hidden="true">
        <defs>
          <filter id="fx-hit-red" colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values="0.36 0.71 0.13 0 0.12  0.07 0.14 0.03 0 0.01  0.06 0.12 0.02 0 0.01  0 0 0 1 0" />
          </filter>
        </defs>
      </svg>
      {/* (An orbiting camera has no horizon to draw the floor by: only the shade under each figure marks it.) */}
      {!orbit && !peeking && <div className="scene-floor" style={{ top: `${HORIZON * 100}%` }} />}
      {w > 0 && !orbit && !peeking && <FloorGrid cam={c} w={w} h={h} />}
      {/* The ambient shade over the sky, the floor and its lines (the figures are shaded one by one, below). */}
      {ambient < 1 && <div className="scene-shade" style={{ background: `rgba(0, 0, 0, ${(1 - ambient).toFixed(3)})` }} />}
      {props.map(({ pr, box }) => (
        <div key={pr.id} className={`arena-slot ${coversFigure(box) ? "is-see-through" : ""}`} style={{ left: box.x, top: box.y, width: box.w, height: box.h, zIndex: 1000 - Math.round(box.depth * 10), filter: `brightness(${Math.max(0.55, Math.min(1, 1.05 - box.depth * 0.04)) * lightAt(pr.pos)})` }}>
          <SealedSleeper kind={pr.kind} flip={pr.flip} lit={propLit} />
        </div>
      ))}
      {/* The shade under each figure: one disc on the floor, the same for all (not the Wax Blob's parts: they crawl out of their pool). */}
      {w > 0 && placed.filter(({ f }) => !f.body && !f.dead).map(({ f, at }) => {
        const d = floorDisc(c, at, SHADE_RADIUS * (f.scale ?? 1), w, h);
        return <div key={`shade-${f.id}`} className="floor-shade" style={{ left: d.cx - d.rx, top: d.cy - d.ry, width: d.rx * 2, height: d.ry * 2, zIndex: 1000 - Math.round(d.depth * 10) - 5 }} />;
      })}
      {blobs.map(b => (
        <Fragment key={`blob-${b.body}`}>
          <div className="blob-slot" style={{ zIndex: b.lo, filter: b.filter }}><BlobPool box={b.box} /></div>
        </Fragment>
      ))}
      {/* The dead Warden kneels in a low dome of wax (the Wax Blob's pool, flatter: no sleepers' arms, a dome a tenth of her height), her body encased in it. */}
      {w > 0 && placed.filter(({ f }) => f.warden3d && f.dead).map(({ f, at, box }) => {
        const d = floorDisc(c, at, DEAD_POOL_RADIUS * (f.scale ?? 1), w, h);
        const pool: BlobBox = { cx: d.cx, cy: d.cy, rx: d.rx, ry: d.ry, tall: box.h, slumped: true, links: [] };
        return (
          <div key={`dead-pool-${f.id}`} className="blob-slot" style={{ zIndex: 1000 - Math.round(box.depth * 10) - 20, filter: `brightness(${Math.max(0.68, Math.min(1, 1.12 - box.depth * 0.06)) * lightAt(at)})` }}>
            <BlobPool box={pool} />
          </div>
        );
      })}
      {placed.map(({ f, box, at }) => (
        <Fragment key={f.id}>
        <button
          className={`figure-slot ${f.selected ? "is-target" : ""}`}
          data-fig={f.id}
          aria-label={f.label}
          aria-pressed={f.selected}
          disabled={f.disabled}
          onClick={f.onPick}
          style={{
            left: box.x,
            top: box.y,
            width: box.w,
            height: box.h,
            zIndex: 1000 - Math.round(box.depth * 10),
            // Distance haze: the further away, the dimmer. (The parts of one body, the Wax Blob, share the heap's: they are one lump of wax.)
            filter: (f.body && blobs.find(b => b.body === f.body)?.filter) || `brightness(${Math.max(0.68, Math.min(1, 1.12 - box.depth * 0.06)) * lightAt(at)})`,
          }}
        >
          {f.holdsString && !f.dead && <StringAura layer="back" spread={f.body ? 2.4 : 1} />}
          <div key={wrapKey(f)} className={`fig-wrap ${f.classes.join(" ")}`}>
            {f.dead === "pieces" && !((f.sleepwalker3d || f.player3d) && w > 0) ? <Remains weapon={f.weapon} armor={f.armor} hooded={f.hooded} /> : f.warden3d && w > 0 ? <Warden3D pose={f.pose} lingerFrom={f.lingerFrom} arm={f.arm} phase2Look={f.phase2Look} flailFire={f.flailFire} dead={!!f.dead} charred={f.charred} cam={c} at={at} yaw={figureYaw(f, at)} scale={f.scale} rise={riseOf(f)} w={w} h={h} box={box} /> : f.dead === "cloak" ? <CloakRemains charred={f.charred} /> : f.dead === "guide" ? <GuideRemains /> : (f.sleepwalker3d || f.player3d) && w > 0 ? <Sleepwalker3D pose={f.pose} hand={f.hand} punch={f.punch} mirror={f.mirror} weapon={f.weapon} gear={f.player3d ? { weaponItem: f.weaponItem, armor: f.armor, armorItem: f.armorItem, headItem: f.headItem } : undefined} hooded={f.hooded} encased={f.encased} waxCaked={f.waxCaked && !f.dead} dead={!!f.dead} eternalFlash={f.eternalFlash} swayId={f.id} cam={c} at={at} yaw={figureYaw(f, at)} scale={f.scale} w={w} h={h} box={box} /> : f.variant === "waxed" && w > 0 ? <Waxed3D meldLegs={!!f.body} pose={f.pose} hand={f.hand} weapon={f.weapon} encased={f.encased} hideFlame={f.headFlame === "blaze"} eternalFlash={f.eternalFlash} cam={c} at={at} yaw={figureYaw(f, at)} scale={f.scale} w={w} h={h} box={box} /> : <StickFigure noShade view={f.view} straight={f.straight} foe={f.foe} hand={f.hand} sides={f.sides} pose={f.pose} weapon={f.weapon} armor={f.armor} weaponItem={f.weaponItem} armorItem={f.armorItem} headItem={f.headItem} trail={f.trail} variant={f.variant} arm={f.arm} lingerFrom={f.lingerFrom} smokeAgo={f.smokeSince !== undefined ? performance.now() - f.smokeSince : undefined} phase2Look={f.phase2Look} flailFire={f.flailFire} waxCaked={f.waxCaked} eternalFlash={f.eternalFlash} hooded={f.hooded} encased={f.encased} />}
            {headFlames.has(f.id) && <FlameAnchor id={f.id} x={headFlames.get(f.id)![0] - box.x} y={headFlames.get(f.id)![1] - box.y} />}
            {f.classes.includes("fx-break") && <Shards />}
            {f.classes.includes("fx-hit") && <Blood />}
          </div>
          {f.holdsString && !f.dead && <StringAura layer="front" spread={f.body ? 2.4 : 1} />}
        </button>
        {f.bar && (
          <div className="figure-bar" style={{ left: box.x + box.w / 2, top: box.y + (box.h * 114) / 120 + 8 }}>
            {f.bar}
          </div>
        )}
        </Fragment>
      ))}
      {/* The Warden gathering a Flame Blast: red wisps round her wax forearm and fist. */}
      {w > 0 && placed.filter(({ f }) => f.armBlaze && f.warden3d && !f.dead).map(({ f, box, at }) => {
        const { placed: wp } = placeWarden(f.pose, at, figureYaw(f, at), c, w, h, f.scale, riseOf(f));
        const hand = wp.seen.handL, elbow = wp.seen.elbowL, z = 1001 - Math.round(box.depth * 10);
        return (
          <Fragment key={`armblaze-${f.id}`}>
            <FlameStrings cx={(hand.sx + elbow.sx) / 2} cy={(hand.sy + elbow.sy) / 2} size={box.h * 0.62} zIndex={z} />
            <FlameStrings cx={hand.sx} cy={hand.sy} size={box.h * 0.5} zIndex={z} />
          </Fragment>
        );
      })}
      {/* The waxed remains burn as candles once the arena is lit, and a lit waxed carries its flame on its head. Gathering it to burst, the flame
          blazes: bigger and brighter, with red strings looping out of it and back in, and a red light round it. */}
      {placed.filter(({ f }) => headFlames.has(f.id)).map(({ f, box }) => {
        const [fx, fy] = headFlames.get(f.id)!;
        const blaze = f.headFlame === "blaze", sz = box.h * (blaze ? 0.19 : 0.13), z = 1001 - Math.round(box.depth * 10);
        return (
          <HeadFlame key={`candle-${f.id}`} anchor={f.id} at={[fx, fy]} sz={sz} blaze={blaze} light={box.w * (blaze ? 1.7 : 1.3)} zIndex={z} />
        );
      })}
      {/* A flame out in someone's hands gives off a faint red light round it, over the figures and the floor near it. */}
      {w > 0 && placed.map(({ f, box, at }) => {
        const pose = ALL_POSES[f.pose];
        if (f.variant !== "waxed" || f.dead || f.headFlame === "blaze" || !pose || (pose.for3d?.prop ?? pose.prop)?.kind !== "flame") return null;
        const rig = liftPose(pose, f.hand);
        if (!rig.prop || rig.propHidden) return null;
        const flame = placeRig(rig, at, figureYaw(f, at), c, w, h, f.scale).prop!.at, size = box.w * 1.3;
        return <div key={`flame-light-${f.id}`} className="flame-light" style={{ left: flame.sx - size / 2, top: flame.sy - size / 2, width: size, height: size }} />;
      })}
      {/* The Warden's flame lights what is near it the same way: the little flame on his candle hand faintly; in his second form, the red flame in his fist
          throws a stronger red light round him all the time. */}
      {w > 0 && placed.map(({ f, box, at }) => {
        if (!f.warden3d || f.dead || f.arm === "out") return null;
        const red = wardenSecondForm(f), [x, y] = flameSpot(f, box, at), size = box.w * (red ? 2.1 : 1.3);
        return <div key={`flame-light-${f.id}`} className={`flame-light${red ? " is-warden-red" : ""}`} style={{ left: x - size / 2, top: y - size / 2, width: size, height: size }} />;
      })}
      {light && !orbit && !peeking && w > 0 && <LightFall cam={c} center={focusOf(c)} w={w} h={h} />}
      {dark && <div className="scene-dark" style={{ opacity: dark.level, transition: `opacity ${dark.ms}ms ease-in` }} />}
      {dark?.flame && (() => {
        const t = placed.find(x => x.f.id === dark.flame);
        if (!t) return null;
        const [fx, fy] = flameSpot(t.f, t.box, t.at);
        // The size of the figure's own flame (the Warden's candle is a little smaller), so it
        // hands over to it seamlessly as the light comes back.
        const sz = t.box.h * (lookOf(t.f.variant)?.loneFlame ?? 0.16);
        return (
          <LoneFlame className="scene-lone-flame" at={[fx, fy]} sz={sz} />
        );
      })()}
      {dark?.glow && (() => {
        const t = placed.find(x => x.f.id === dark.glow);
        if (!t) return null;
        // The guide's orb, hanging in front of its chest: a soft white glow over the dark.
        const size = Math.max(t.box.h * 1.1, 90);
        return <div className="scene-orb-glow" style={{ left: t.box.x + t.box.w / 2 - size / 2, top: t.box.y + t.box.h * 0.62 - size / 2, width: size, height: size }} />;
      })()}
      {usurpTrails.map(usurpTrail => {
        const a = placed.find(x => x.f.id === usurpTrail.from), b = placed.find(x => x.f.id === usurpTrail.to);
        if (!a || !b) return null;
        const from = flameSpot(a.f, a.box, a.at);
        const hand = handSpot(b.f, b.box, b.at);
        if (usurpTrail.wisps) return <UsurpWisps key={usurpTrail.key} from={from} to={hand} ms={usurpTrail.wisps} />;
        // Arching up over him: the control point well above both.
        const ctl: Pt = [(from[0] + hand[0]) / 2, Math.min(from[1], hand[1]) - b.box.h * 0.22];
        const N = 28, w = b.box.h * 0.05;
        const pts = Array.from({ length: N + 1 }, (_, i) => {
          const t = i / N, u = 1 - t;
          return [u * u * from[0] + 2 * u * t * ctl[0] + t * t * hand[0], u * u * from[1] + 2 * u * t * ctl[1] + t * t * hand[1]] as Pt;
        });
        const band = (k: number) => {
          const l: string[] = [], r: string[] = [];
          pts.forEach((c, i) => {
            const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(N, i + 1)];
            const d = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1;
            const nx = -(p1[1] - p0[1]) / d, ny = (p1[0] - p0[0]) / d;
            const ww = w * k * (0.25 + 0.75 * (i / N));
            l.push(`${i ? "L" : "M"}${c[0] + nx * ww} ${c[1] + ny * ww}`);
            r.unshift(`L${c[0] - nx * ww} ${c[1] - ny * ww}`);
          });
          return `${l.join(" ")} ${r.join(" ")} Z`;
        };
        return (
          <svg key={usurpTrail.key} className="shockwave usurp-trail-layer" aria-hidden="true">
            <g className="usurp-trail">
              <path d={band(1)} className="fig-trail-flame-outer" />
              <path d={band(0.44)} className="fig-trail-flame-core" />
            </g>
          </svg>
        );
      })}
      {ignite && igniter && (() => {
        const t = igniteT;
        const [hx, hy] = handSpot(igniter.f, igniter.box, igniter.at);
        const drawn = sources.filter(src => t >= src.draw).length / Math.max(1, sources.length);
        const flame = (key: string, at: Pt, sz: number, cls = "") => <LoneFlame key={key} className={`scene-lone-flame ${cls}`} at={at} sz={sz} />;
        return (
          <>
            {/* Flames kindling in the dark. */}
            {t < IGNITE.flare && sources.filter(src => src.seen && t >= src.kindle && t < src.draw).map(src => flame(`src-${src.id}`, src.at, igniter.box.h * 0.1, "is-kindling"))}
            {/* Each one bursting into red wisps that spiral into his hand (the Usurp Flame's), each from when it is drawn in. */}
            {t >= IGNITE.draw && t < IGNITE.flare + 300 && (
              <WispStreams
                key={`wisps-${ignite.seed}`}
                routes={sources.map(src => ({ from: src.at, to: [hx, hy] as Pt, at: src.draw - IGNITE.draw }))}
                ms={900}
                count={5}
              />
            )}
            {/* His flame, growing as they pour in. */}
            {t >= IGNITE.draw && t < IGNITE.flare + 300 && flame("hand", [hx, hy], igniter.box.h * (0.1 + 0.3 * drawn), "is-gathering")}
            {/* Then it flares, and a ring of fire rolls out from him. */}
            {t >= IGNITE.flare && (
              <>
                <div key={`flare-${ignite.seed}`} className="blast-flash ignite-flare" style={{ left: hx, top: hy, width: igniter.box.h * 1.4, height: igniter.box.h * 1.4 }}>
                  <FireballFlash />
                </div>
                {posNow(ignite.who) && <Shockwave key={`ring-${ignite.seed}`} center={posNow(ignite.who)!} reach={16} toward={0} flame={1.4} proj={proj} full dome fade={0.5} />}
              </>
            )}
          </>
        );
      })()}
      {projectiles.map(pr => {
        const thrower = placed.find(x => x.f.id === pr.from);
        const a = thrower?.box;
        const b = placed.find(x => x.f.id === pr.to)?.box;
        if (!a || !b) return null;
        // Flames licking a unit a fire attack has hit.
        if (pr.kind === "flamehit") return <FlameHit key={pr.key} cx={b.x + b.w / 2} cy={b.y + b.h * 0.6} size={b.h} />;
        // An eternal effect taking hold: a small halo where the blow met a Block, where it hit, or on the one who used it.
        if (pr.kind === "eternity" || pr.kind === "eternityDeath") {
          const cx0 = a.x + a.w / 2;
          const blockX = thrower && b ? cx0 + Math.sign(b.x + b.w / 2 - cx0) * a.w * 0.45 : cx0;
          const at = pr.where === "block" ? [blockX, a.y + a.h * 0.42] : pr.where === "self" ? [cx0, a.y + a.h * 0.5] : [cx0, a.y + a.h * 0.45];
          return <EternityHalo key={pr.key} cx={at[0]} cy={at[1]} diameter={a.h * 0.34} death={pr.kind === "eternityDeath"} />;
        }
        // From the thrower's chest height to the target's, and on through it.
        const sx = a.x + a.w / 2, sy = a.y + a.h * 0.42;
        const tx = b.x + b.w / 2, ty = b.y + b.h * 0.45;
        const dx = tx - sx, dy = ty - sy;
        // Past the target it keeps coming, toward the camera: further along, and down the screen.
        const ex = dx * 1.35, ey = dy + b.h * 0.35;
        const size = Math.max(a.h, b.h) * (pr.kind === "wax" ? 0.12 : pr.kind === "fan" ? 1.1 : 0.45);
        const flight = (Math.atan2(dy, dx) * 180) / Math.PI;
        const angle = pr.kind === "fan" ? 0 : flight; // the fan's lean is drawn into its shape
        if (pr.kind === "clang") {
          // A blocked blow clangs: a starburst of white spikes at the point where the weapons met,
          // on the blocker's side facing the attacker, at chest height.
          const bx = a.x + a.w / 2 + Math.sign(tx - (a.x + a.w / 2)) * a.w * 0.45, by = a.y + a.h * 0.42;
          return <ClangBurst key={pr.key} cx={bx} cy={by} reach={a.h * 0.38} />;
        }
        if (pr.kind === "impact") {
          // A melee blow into the ground: no fire, just a small white ring kicked out flat across
          // the floor from the fist.
          const [ax, ay] = originOf(thrower!, a, pr.origin);
          return (
            <div key={pr.key}>
              {!pr.fiery && <ImpactRing cx={ax} cy={ay} reach={a.h * 0.4} />}
              {(() => {
                const A = posNow(pr.from), B = posNow(pr.to);
                if (!A || !B) return null;
                // (from where the blow really lands on the floor: the Warden's flail's head or fist, from his 3D rig; else under it on the screen)
                const at = thrower!.f.warden3d && w > 0 ? wardenFloorAt(thrower!.f, A) : floorAt(A, ax);
                // A flaming flail's burns are the Flame Blast's: the same dome of flame all the way round, out past everyone in the fight, with its red light.
                return pr.fiery
                  ? <Shockwave center={at} reach={Math.max(4, ...placed.map(({ at: p }) => Math.hypot(p.x - at.x, p.z - at.z))) * 1.25} toward={0} flame={1.4} proj={proj} full dome />
                  : <Shockwave center={at} reach={1.5} toward={Math.atan2(B.z - at.z, B.x - at.x)} flame={0.8} proj={proj} impact />;
              })()}
            </div>
          );
        }
        if (pr.kind === "halo") {
          // The guide's halo: rings growing out of its orb, until they have swept through the target.
          const o = pr.origin ?? [50, 80];
          const ox = (isMirrored(thrower!.f) ? 100 - o[0] : o[0]) / 100;
          const hx = a.x + a.w * ox, hy = a.y + (a.h * o[1]) / 120;
          return <HaloBurst key={pr.key} cx={hx} cy={hy} diameter={Math.max(a.h * 0.9, Math.hypot(tx - hx, ty - hy) * 2.3)} />;
        }
        if (pr.kind === "burst") {
          // A lit waxed bursting: a fireball out of its head, and a ring of flame rolling out from it across the floor the same all the way round,
          // on past everyone in the fight.
          const [hx, hy] = flameSpot(pr.fromPose && pr.fromPose in ALL_POSES ? { ...thrower!.f, pose: pr.fromPose as PoseName } : thrower!.f, a, thrower!.at, true);
          const ball = a.h * 0.9;
          const A = posNow(pr.from);
          const reach = Math.max(4, ...placed.map(({ at: p }) => (A ? Math.hypot(p.x - A.x, p.z - A.z) : 0))) * 1.25;
          return (
            <div key={pr.key}>
              <div className="blast-flash" style={{ left: hx, top: hy, width: ball, height: ball }}>
                <FireballFlash />
              </div>
              {A && <Shockwave center={A} reach={reach} toward={0} flame={1.4} proj={proj} full dome />}
            </div>
          );
        }
        if (pr.kind === "blast") {
          // A giant fireball flashes in before him and fades fast; a shockwave of flame follows
          // through, spreading flat across the floor from his feet. Seen at the same 3/4 angle
          // as the fan, it's a ring, but only burns on the side heading for the target: tall
          // flames there, dying away around the sides, nothing behind him and nothing inside.
          // It all comes from his fist striking the ground (or his feet, without one).
          const [ax, ay] = originOf(thrower!, a, pr.origin);
          const o = pr.origin;
          const bx = tx;
          const fx = o ? ax : ax + (bx - ax) * 0.2, fy = o ? ay - a.h * 0.12 : (a.y + a.h * 0.45) + (ty - (a.y + a.h * 0.45)) * 0.2;
          const ball = a.h * 0.9;
          return (
            <div key={pr.key}>
              <div className="blast-flash" style={{ left: fx, top: fy, width: ball, height: ball }}>
                <FireballFlash />
              </div>
              {(() => {
                const A = posNow(pr.from);
                if (!A) return null;
                // (from where the blow really lands on the floor: his fist, from his 3D rig; else under it on the screen)
                const at = thrower!.f.warden3d && w > 0 ? wardenFloorAt(thrower!.f, A) : floorAt(A, ax);
                // The same dome of flame as a lit waxed's Flame Immolation (`burst`): all the way round, on past everyone in the fight.
                const reach = Math.max(4, ...placed.map(({ at: p }) => Math.hypot(p.x - at.x, p.z - at.z))) * 1.25;
                return <Shockwave center={at} reach={reach} toward={0} flame={1.4} proj={proj} full dome />;
              })()}
            </div>
          );
        }
        return (
          <div
            key={pr.key}
            className={`projectile projectile-${pr.kind}`}
            style={{
              left: sx, top: sy, width: size, height: pr.kind === "fan" ? size * 0.32 : size,
              ["--dx" as string]: `${dx}px`, ["--dy" as string]: `${dy}px`,
              ["--ex" as string]: `${ex}px`, ["--ey" as string]: `${ey}px`, ["--rot" as string]: `${angle}deg`,
            }}
          >
            <ProjectileShape kind={pr.kind} />
          </div>
        );
      })}
    </div>
  );
}

/** A lone flame floating over the scene, in screen pixels: a glow, and the flame standing on `at`. */
function LoneFlame({ at, sz, className, zIndex }: { at: Pt; sz: number; className: string; zIndex?: number }) {
  return (
    <svg className={className} style={{ left: at[0] - sz / 2, top: at[1] - sz * 0.8, width: sz, height: sz, zIndex }} viewBox="-10 -16 20 20" aria-hidden="true">
      <circle cx={0} cy={-3} r={9} className="fig-glow" />
      <LittleFlame x={0} y={0} height={12} />
    </svg>
  );
}

/** A fireball's flash, filling its box (Flame Blast, and the phase-two flare). */
function FireballFlash() {
  return (
    <svg viewBox="-50 -50 100 100" className="shockwave-svg">
      <circle cx={0} cy={0} r={48} className="fig-burst-outer" />
      <circle cx={-6} cy={4} r={34} className="blast-mid" />
      <circle cx={-10} cy={6} r={20} className="fig-burst-inner" />
    </svg>
  );
}

/** Faint lines on the floor, drawn in perspective, so the ground visibly moves when the camera does. */
/** Whether two cameras look the same (a new `Cam` object is made every frame, even when the camera has not moved). */
const sameCam = (a: Cam, b: Cam) => a.x === b.x && a.z === b.z && a.yaw === b.yaw && a.look?.x === b.look?.x && a.look?.z === b.look?.z && a.eye === b.eye && a.pitch === b.pitch;

const FloorGrid = memo(FloorGridDrawn, (a, b) => a.w === b.w && a.h === b.h && sameCam(a.cam, b.cam));
function FloorGridDrawn({ cam, w, h }: { cam: Cam; w: number; h: number }) {
  const SPACING = 2;
  const RANGE = 40;
  // Snap the grid to whole cells around the camera, so lines stay put in the world as it moves.
  const ox = Math.round(cam.x / SPACING) * SPACING;
  const oz = Math.round(cam.z / SPACING) * SPACING;
  const segment = (a: Vec, b: Vec) => {
    let A = toCamera(cam, a);
    let B = toCamera(cam, b);
    if (A.v < NEAR && B.v < NEAR) return null;
    // Clip the part behind the camera.
    if (A.v < NEAR) A = { u: A.u + ((B.u - A.u) * (NEAR - A.v)) / (B.v - A.v), v: NEAR };
    if (B.v < NEAR) B = { u: B.u + ((A.u - B.u) * (NEAR - B.v)) / (A.v - B.v), v: NEAR };
    const p = screenOf(A.u, A.v, w, h);
    const q = screenOf(B.u, B.v, w, h);
    return `M${p.sx} ${p.sy}L${q.sx} ${q.sy}`;
  };
  const paths: string[] = [];
  for (let i = -RANGE; i <= RANGE; i += SPACING) {
    const s1 = segment({ x: ox + i, z: oz - RANGE }, { x: ox + i, z: oz + RANGE });
    const s2 = segment({ x: ox - RANGE, z: oz + i }, { x: ox + RANGE, z: oz + i });
    if (s1) paths.push(s1);
    if (s2) paths.push(s2);
  }
  return (
    <svg className="scene-grid" width={w} height={h} aria-hidden="true">
      <path d={paths.join("")} />
    </svg>
  );
}

/**
 * The fight's light: black closing in from beyond a circle on the floor around what the camera is on
 * (you while you plan, the middle of the two fighting during an attack). The
 * circle is drawn in perspective (so it is an ellipse on screen), in many thin rings that each
 * add a little darkness, so it fades smoothly: clear near the player, dim and dark at the back
 * line, black from the edge on. That hides the far floor and the horizon. It lies under the
 * figures, which are shaded by their own distance instead (see `lightAt`), so no sprite inside
 * the light is darkened by it.
 */
const LightFall = memo(LightFallDrawn, (a, b) => a.w === b.w && a.h === b.h && a.center.x === b.center.x && a.center.z === b.center.z && sameCam(a.cam, b.cam));
function LightFallDrawn({ cam, center, w, h }: { cam: Cam; center: Vec; w: number; h: number }) {
  const STEP = 0.25, POINTS = 72, BIG = 60000;
  /** The ring of floor at distance `r` from the player, as screen points (what lies behind the camera is pinned to its near edge). */
  const ring = (r: number) => {
    const pts: string[] = [];
    for (let i = 0; i < POINTS; i++) {
      const a = (i / POINTS) * Math.PI * 2;
      const { u, v } = toCamera(cam, { x: center.x + r * Math.cos(a), z: center.z + r * Math.sin(a) });
      const { sx, sy } = screenOf(u, Math.max(v, NEAR), w, h);
      pts.push(`${i ? "L" : "M"}${sx.toFixed(1)} ${sy.toFixed(1)}`);
    }
    return `${pts.join("")}Z`;
  };
  const outside = `M${-BIG} ${-BIG}H${BIG}V${BIG}H${-BIG}Z`;
  const layers: { r: number; alpha: number }[] = [];
  let before = 0;
  for (let r = LIGHT.clear + STEP; r < LIGHT.edge + 1e-6; r += STEP) {
    const now = darkAt(Math.min(r, LIGHT.edge));
    // This ring has to add just enough on top of those inside it to reach the darkness wanted at r.
    layers.push({ r: Math.min(r, LIGHT.edge), alpha: before >= 1 ? 0 : 1 - (1 - now) / (1 - before) });
    before = now;
  }
  return (
    <svg className="scene-light" width={w} height={h} aria-hidden="true">
      {layers.map(({ r, alpha }) => (
        <path key={r} d={`${outside}${ring(r)}`} fillRule="evenodd" fill="#000" fillOpacity={alpha} />
      ))}
    </svg>
  );
}
