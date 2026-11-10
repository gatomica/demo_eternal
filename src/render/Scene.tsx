/**
 * Scene.tsx — the battlefield: the floor and every figure, seen through the camera.
 */
import { StringAura } from "./StringCounter";
import { Fragment, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Variant } from "../core/bestiary";
import type { ArmorItem, ArmorTier, HeadItem, Side, WeaponItem, WeaponTier } from "../core/types";
import { BODY_FORWARD, BODY_RADIUS, BODY_SIDE_SLOT, type Cam, darkAt, floorDisc, SHADE_RADIUS, ease, figureBox, HORIZON, LIGHT, lerpAngle, lerpCam, lerpVec, facingVec, focusOf, NEAR, planningCamera, project, projectPoint, right, type SceneShot, screenOf, shotCamera, type ShotCamera, toCamera, trackingCamera, type Vec, yawOf } from "./camera";
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
import { FlameAnchor, HeadFlame } from "./HeadFlame";
import { HEAD_TOP, Waxed3D } from "./Waxed3D";
import { Sleepwalker3D } from "./Sleepwalker3D";
import { BlobPool, type BlobBox } from "./WaxBlob";
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
  dodge?: { dir: Vec; retreat: boolean };
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
  /** The player drawn in 3D, on the Sleepwalker's body (Sleepwalker3D's `gear`): its pose already one of the 3D ones (`player3dPose`). */
  player3d?: boolean;
  /** Sealed whole in wax (its flame taken by Usurp Flame). */
  encased?: boolean;
  /** It has fallen: its body in "pieces" on the floor (drawn instead of the figure), or sealed in "wax". */
  dead?: "pieces" | "wax" | "cloak" | "guide";
  /**
   * It is striking this one (`key`: which blow, the same for every beat of it): it faces the way it faced it when the blow began, and does not turn from
   * there, whatever the target does (knocked back, dodging past, backing off) until the blow is over.
   */
  faceToward?: { id: string; key: string };
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

interface Tween<T> { from: T; to: T }

/** A repeatable random number in [0, 1) for each index. */
const rand = (seed: number, i: number) => {
  const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Draws the floor and every figure through the camera. When a new shot arrives, everyone (and
 * the camera) moves from wherever they are right now to the new spots, over the shot's duration.
 */
export function Scene({ figures, shot, projectiles = [], dark, usurpTrails = [], arena, arenaLit, ignite, light, shade = true, onSelectedBox }: {
  figures: SceneFigure[];
  shot: SceneShot;
  projectiles?: Projectile[];
  /** The light dying (0 to 1, over `ms`), all but one figure's flame, which keeps burning (or the glow of one figure's own light, the guide's orb). */
  dark?: { level: number; ms: number; flame?: string; glow?: string };
  /** Flames streaming from figures, each arching over another, into its candle hand. */
  usurpTrails?: { from: string; to: string; key: string }[];
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
  const pos = useRef(new Map<string, Tween<Vec>>());
  const timing = useRef({ start: 0, ms: 0 });
  const [, setFrame] = useState(0);
  const progress = () => {
    const { start, ms } = timing.current;
    return ms <= 0 ? 1 : Math.min(1, (performance.now() - start) / ms);
  };
  const posNow = (id: string, k = ease(progress())) => {
    const t = pos.current.get(id);
    return t ? lerpVec(t.from, t.to, k) : undefined;
  };
  const camNow = (k = ease(progress())): Cam => {
    const { from, to, fromYaw, tracking } = cam.current;
    if ("between" in to) {
      // Centered between the two wherever they are right now: pushed, knocked back or dodging. (One that is several parts, the Wax Blob, is
      // framed whole: all its parts count, not only the one in the action.)
      const whole = (id: string): Vec[] => {
        const body = figures.find(f => f.id === id)?.body;
        return (body ? figures.filter(f => f.body === body).map(f => f.id) : [id]).map(i => posNow(i, k)).filter((p): p is Vec => !!p);
      };
      const a = posNow(to.between[0], k), b = posNow(to.between[1], k);
      if (!a || !b) return from;
      // (Backing off as far as it takes to show the two whole.)
      const scale = (id: string) => figures.find(f => f.id === id)?.scale ?? 1;
      const centered = trackingCamera(to.yaw, whole(to.between[0]), whole(to.between[1]), size.h ? { aspect: size.w / size.h, scales: [scale(to.between[0]), scale(to.between[1])] } : undefined);
      return tracking ? centered : lerpCam(from, centered, k);
    }
    if (!("follow" in to)) return lerpCam(from, to, k);
    const at = posNow(to.follow, k);
    if (!at) return from;
    const riding = planningCamera(at, lerpAngle(fromYaw ?? from.yaw, to.yaw, k));
    // Already riding: stay locked on. Coming from a fixed shot: ease into the ride.
    return fromYaw !== null ? riding : lerpCam(from, riding, k);
  };

  useLayoutEffect(() => {
    // Start every move from where things are on screen right now.
    const k = ease(progress());
    const prev = cam.current.to;
    const nowCam = camNow(k);
    // Keep riding (and turning from the current angle) if the camera was riding the same figure.
    const stillRiding = "follow" in prev && "follow" in shot.camera && prev.follow === shot.camera.follow;
    const fromYaw = stillRiding && "follow" in prev ? lerpAngle(cam.current.fromYaw ?? prev.yaw, prev.yaw, k) : null;
    const tracking = "between" in prev && "between" in shot.camera && prev.between[0] === shot.camera.between[0] && prev.between[1] === shot.camera.between[1];
    for (const [id, to] of Object.entries(shot.positions)) {
      const t = pos.current.get(id);
      pos.current.set(id, { from: t && !shot.snap?.includes(id) ? lerpVec(t.from, t.to, k) : to, to });
    }
    cam.current = { from: nowCam, to: shot.camera, fromYaw, tracking };
    timing.current = { start: performance.now(), ms: shot.ms };
    let raf = 0;
    const tick = () => {
      setFrame(f => f + 1);
      if (progress() < 1) raf = requestAnimationFrame(tick);
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
  const c = camNow();
  let placed = figures
    .map(f => {
      const p = posNow(f.id);
      return p && w ? { f, box: figureBox(c, p, w, h, f.scale), at: p, raw: p } : null;
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
  /** The way a figure faces on the floor: along its dodge, else toward the player. */
  const figureYaw = (f: SceneFigure, at: Vec) => {
    if (dodgeFacing(f)) return yawOf(dodgeFacing(f)!);
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
        if (me && foe) faceLock.current.set(f.id, { key: f.faceToward.key, yaw: facingYaw(c, me, foe, f.player3d ? "front" : f.view, false), target: f.faceToward.id });
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
      if (foes.length) return facingYaw(c, at, { x: foes.reduce((n, p) => n + p.x, 0) / foes.length, z: foes.reduce((n, p) => n + p.z, 0) / foes.length }, "front", false);
    }
    return facingYaw(c, at, posNow("player"), f.view, !!f.straight);
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
    const [hx, hy] = toScreen(igniter.box, handOf(igniter.f), isMirrored(igniter.f));
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
    <div className="scene" ref={boxRef}>
      <div className="scene-floor" style={{ top: `${HORIZON * 100}%` }} />
      {w > 0 && <FloorGrid cam={c} w={w} h={h} />}
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
          <div key={f.stepKey} className={`fig-wrap ${f.classes.join(" ")}`}>
            {f.dead === "pieces" && !((f.sleepwalker3d || f.player3d) && w > 0) ? <Remains weapon={f.weapon} armor={f.armor} hooded={f.hooded} /> : f.dead === "cloak" ? <CloakRemains charred={f.charred} /> : f.dead === "guide" ? <GuideRemains /> : (f.sleepwalker3d || f.player3d) && w > 0 ? <Sleepwalker3D pose={f.pose} hand={f.hand} weapon={f.weapon} gear={f.player3d ? { weaponItem: f.weaponItem, armor: f.armor, armorItem: f.armorItem, headItem: f.headItem } : undefined} hooded={f.hooded} encased={f.encased} waxCaked={f.waxCaked && !f.dead} dead={!!f.dead} eternalFlash={f.eternalFlash} swayId={f.id} cam={c} at={at} yaw={figureYaw(f, at)} scale={f.scale} w={w} h={h} box={box} /> : f.variant === "waxed" && w > 0 ? <Waxed3D meldLegs={!!f.body} pose={f.pose} hand={f.hand} weapon={f.weapon} encased={f.encased} hideFlame={f.headFlame === "blaze"} eternalFlash={f.eternalFlash} cam={c} at={at} yaw={figureYaw(f, at)} scale={f.scale} w={w} h={h} box={box} /> : <StickFigure noShade view={f.view} straight={f.straight} foe={f.foe} hand={f.hand} sides={f.sides} pose={f.pose} weapon={f.weapon} armor={f.armor} weaponItem={f.weaponItem} armorItem={f.armorItem} headItem={f.headItem} trail={f.trail} variant={f.variant} arm={f.arm} lingerFrom={f.lingerFrom} smokeAgo={f.smokeSince !== undefined ? performance.now() - f.smokeSince : undefined} phase2Look={f.phase2Look} flailFire={f.flailFire} waxCaked={f.waxCaked} eternalFlash={f.eternalFlash} hooded={f.hooded} encased={f.encased} />}
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
      {light && w > 0 && <LightFall cam={c} center={focusOf(c)} w={w} h={h} />}
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
        const hand = toScreen(b.box, handOf(b.f), isMirrored(b.f));
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
        const [hx, hy] = toScreen(igniter.box, handOf(igniter.f), isMirrored(igniter.f));
        const drawn = sources.filter(src => t >= src.draw).length / Math.max(1, sources.length);
        const flame = (key: string, at: Pt, sz: number, cls = "") => <LoneFlame key={key} className={`scene-lone-flame ${cls}`} at={at} sz={sz} />;
        return (
          <>
            {/* Flames kindling in the dark. */}
            {t < IGNITE.flare && sources.filter(src => src.seen && t >= src.kindle && t < src.draw).map(src => flame(`src-${src.id}`, src.at, igniter.box.h * 0.1, "is-kindling"))}
            {/* Each one streaming into his hand, arching up as it comes. */}
            <svg className="shockwave usurp-trail-layer" aria-hidden="true">
              {sources.filter(src => t >= src.draw && t < src.draw + 700).map(src => {
                const ctl: Pt = [(src.at[0] + hx) / 2, Math.min(src.at[1], hy) - igniter.box.h * 0.35];
                const d = `M${src.at[0]} ${src.at[1]} Q${ctl[0]} ${ctl[1]} ${hx} ${hy}`;
                return (
                  <g key={`trail-${src.id}`} className="ignite-trail">
                    <path d={d} className="ignite-trail-outer" />
                    <path d={d} className="ignite-trail-core" />
                  </g>
                );
              })}
            </svg>
            {/* His flame, growing as they pour in. */}
            {t >= IGNITE.draw && t < IGNITE.flare + 300 && flame("hand", [hx, hy], igniter.box.h * (0.1 + 0.3 * drawn), "is-gathering")}
            {/* Then it flares, and a ring of fire rolls out from him. */}
            {t >= IGNITE.flare && (
              <>
                <div key={`flare-${ignite.seed}`} className="blast-flash ignite-flare" style={{ left: hx, top: hy, width: igniter.box.h * 1.4, height: igniter.box.h * 1.4 }}>
                  <FireballFlash />
                </div>
                {posNow(ignite.who) && <Shockwave key={`ring-${ignite.seed}`} center={posNow(ignite.who)!} reach={16} toward={0} flame={0.9} proj={proj} full />}
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
          const o = pr.origin;
          const ox = o ? (isMirrored(thrower!.f) ? 100 - o[0] : o[0]) / 100 : 0.5;
          const ax = a.x + a.w * ox, ay = o ? a.y + (a.h * o[1]) / 120 : a.y + a.h * 0.95;
          return (
            <div key={pr.key}>
              {!pr.fiery && <ImpactRing cx={ax} cy={ay} reach={a.h * 0.4} />}
              {(() => {
                const A = posNow(pr.from), B = posNow(pr.to);
                if (!A || !B) return null;
                const at = floorAt(A, ax);
                // A flaming flail's burns, as big as a Flame Blast's: out through the target, with flames as tall.
                return pr.fiery
                  ? <Shockwave center={at} reach={Math.hypot(B.x - at.x, B.z - at.z) * 1.25} toward={Math.atan2(B.z - at.z, B.x - at.x)} flame={1.4} proj={proj} />
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
              {A && <Shockwave center={A} reach={reach} toward={0} flame={1.4} proj={proj} full />}
            </div>
          );
        }
        if (pr.kind === "blast") {
          // A giant fireball flashes in before him and fades fast; a shockwave of flame follows
          // through, spreading flat across the floor from his feet. Seen at the same 3/4 angle
          // as the fan, it's a ring, but only burns on the side heading for the target: tall
          // flames there, dying away around the sides, nothing behind him and nothing inside.
          // It all comes from his fist striking the ground (or his feet, without one).
          const o = pr.origin;
          const ox = o ? (isMirrored(thrower!.f) ? 100 - o[0] : o[0]) / 100 : 0.5;
          const ax = a.x + a.w * ox, ay = o ? a.y + (a.h * o[1]) / 120 : a.y + a.h * 0.95;
          const bx = tx;
          const fx = o ? ax : ax + (bx - ax) * 0.2, fy = o ? ay - a.h * 0.12 : (a.y + a.h * 0.45) + (ty - (a.y + a.h * 0.45)) * 0.2;
          const ball = a.h * 0.9;
          return (
            <div key={pr.key}>
              <div className="blast-flash" style={{ left: fx, top: fy, width: ball, height: ball }}>
                <FireballFlash />
              </div>
              {(() => {
                const A = posNow(pr.from), B = posNow(pr.to);
                if (!A || !B) return null;
                const at = floorAt(A, ax);
                // It passes on through the target.
                return <Shockwave center={at} reach={Math.hypot(B.x - at.x, B.z - at.z) * 1.25} toward={Math.atan2(B.z - at.z, B.x - at.x)} flame={1.4} proj={proj} />;
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
function FloorGrid({ cam, w, h }: { cam: Cam; w: number; h: number }) {
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
function LightFall({ cam, center, w, h }: { cam: Cam; center: Vec; w: number; h: number }) {
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
