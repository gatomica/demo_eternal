/**
 * sprites.ts — the map's figures drawn with the fight's own 3D figures.
 *
 * A figure in a fight (`render/Sleepwalker3D.tsx`, `render/Waxed3D.tsx`) is an SVG drawn from a 3D rig. Here the very same components are
 * rendered once per look, facing and step through a fixed camera, turned into a picture and kept; the map then only copies that picture onto the
 * ground (`drawSprite`). Nothing about a figure's shape is written down twice: change a pose, a weapon or the rig, and the map follows.
 *
 * There are four ways to face: left, right, down (toward you) and up (away), each a yaw of the 3D figure (the sides turned a little toward the
 * camera for an enemy, away from it for you, as the fight shows each). Walking is two more frames of each, made here from the fight's own poses:
 *  - you: Idle (`p3-idle`), the feet shuffling along the floor;
 *  - the sleepwalkers: Idle (`sw-idle`) with the feet shuffling, and once they have seen you the Chase (`sw-charge`), its legs swapping each step;
 *  - the waxed: the Crawl (`w-crawl`), one hand reaching ahead while the other pulls back;
 *  - the Wax Blob: its three parts, the waxed sealed in wax (`encased`), crawling out of the low dome of wax they share (`BlobPool`).
 *
 * The picture is made when first asked for (it is an image that has to load), so `drawSprite` says whether it drew anything:
 * until it has, the caller draws the figure its old way.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { WeaponTier } from "../core/types";
import { type Cam, FEET_Y, floorDisc, orbitBox, orbitCamera, type Vec } from "../render/camera";
import type { Pt } from "../render/geom";
import { ALL_POSES, type PoseName, type Skeleton } from "../render/poses";
import { Sleepwalker3D } from "../render/Sleepwalker3D";
import { liftPose, placeRig } from "../render/rig3d";
import { HEAD_TOP, Waxed3D } from "../render/Waxed3D";
import { BlobPool } from "../render/WaxBlob";
import type { Frame, Look } from "./figures";
import type { Dir } from "./world";

/** A figure's units (100 wide, 120 tall: the fight's) per tile on the map: a quarter bigger than the map's old stick figure (115). */
export const UNITS_PER_TILE = 92;
/** Where the feet are in a figure's box, and how far below the figure's middle they stand on the map (in tiles). */
const FOOT_Y = FEET_Y, FOOT_BELOW_MIDDLE = 0.36;
/** The picture shows this much around the 100 × 120 box (a weapon held out, a hand raised): x from -30 to 130, y from -20 to 140. */
const BOX = { x: -30, y: -20, size: 160 };
/** The Wax Blob's picture: its dome is wider than a figure is tall (about 1.6 meters out from the middle each way). */
const BLOB_BOX = { x: -55, y: -10, size: 210 };
/** The pictures are made this many times finer than they are shown, so they stay sharp when the map is zoomed a little. */
const SHARPNESS = 1.5;

type Box = typeof BOX;

/* ---------- The camera ---------- */

/** One fixed camera for every picture: a little above, looking down at a figure standing 6 meters off, on a screen of W × H pixels. */
const W = 800, H = 600, SPOT: Vec = { x: 0, z: 6 };
const CAM: Cam = orbitCamera(SPOT, 24, 1.0, 6);
/** How far an enemy's side view is turned toward the camera (and yours away from it), radians: the fight's 3/4. */
const TURN = 0.6;

/** The way a figure faces on the map, as the yaw the camera sees it at (0 faces away from the camera, π toward it, π/2 faces right). */
function yawFor(facing: Dir, enemy: boolean): number {
  if (facing === "down") return Math.PI;
  if (facing === "up") return 0;
  const t = enemy ? TURN : -TURN;
  return facing === "right" ? Math.PI / 2 + t : -Math.PI / 2 - t;
}

/* ---------- The poses ---------- */

type Leg = Skeleton["leadLeg"];

/** A pose made here for the map, kept with the fight's own (the 3D figures look their pose up by name). */
function made(name: string, skeleton: Skeleton): PoseName {
  (ALL_POSES as Record<string, Skeleton>)[name] = skeleton;
  return name as PoseName;
}

/** One foot set `reach` ahead along the floor and a little lifted, the other as far behind, whichever leads swapping with `lead` (1 or -1). */
function shuffle(base: Skeleton, lead: 1 | -1, reach: number, lift: number): Skeleton {
  const leg = (l: Leg, d: number, up: number): Leg => ({ knee: [l.knee[0] + d * 0.5, l.knee[1] - up * 0.5] as Pt, foot: [l.foot[0] + d, l.foot[1] - up] as Pt });
  return { ...base, leadLeg: leg(base.leadLeg, lead * reach, lead > 0 ? lift : 0), rearLeg: leg(base.rearLeg, -lead * reach, lead > 0 ? 0 : lift) };
}

/** Three frames of a walk (standing, then each foot leading), as the poses' names. */
interface Walk { stand: PoseName; stepL: PoseName; stepR: PoseName }

/** An idle that shuffles its feet: the same body, the feet sliding along the floor. */
function shuffling(name: string, base: PoseName, reach: number, lift: number): Walk {
  const sk = ALL_POSES[base];
  return { stand: base, stepL: made(`${name}-L`, shuffle(sk, 1, reach, lift)), stepR: made(`${name}-R`, shuffle(sk, -1, reach, lift)) };
}

/** The chase: the pose's own stride one way, its legs swapped the other, and the feet under it between. */
function running(name: string, base: PoseName): Walk {
  const sk = ALL_POSES[base];
  const swapped: Skeleton = { ...sk, leadLeg: sk.rearLeg, rearLeg: sk.leadLeg };
  const hip = sk.hip[0];
  const planted: Skeleton = { ...sk, leadLeg: { knee: [hip - 2, 92], foot: [hip - 8, 114] }, rearLeg: { knee: [hip + 8, 92], foot: [hip + 8, 114] } };
  return { stand: made(`${name}-stand`, planted), stepL: base, stepR: made(`${name}-R`, swapped) };
}

/** The crawl: one hand reaching ahead off the floor while the other pulls back, then the other way. */
function crawling(name: string): Walk {
  const sk = ALL_POSES["w-crawl"], f3 = sk.for3d!;
  const right = f3.arms3!.right as { to: readonly [number, number, number]; bend?: readonly [number, number, number] };
  const left = f3.arms3!.left as { plant: { out: number; reach?: number; bend?: readonly [number, number, number]; shift?: number } };
  const stride = (ahead: number, lift: number, pull: number): Skeleton => ({
    ...sk,
    for3d: {
      ...f3,
      arms3: {
        right: { to: [right.to[0], right.to[1] + lift, right.to[2] + ahead], bend: right.bend },
        left: { plant: { ...left.plant, shift: (left.plant.shift ?? 0) + pull } },
      },
    },
  });
  return { stand: "w-crawl", stepL: made(`${name}-L`, stride(8, 4, -4)), stepR: made(`${name}-R`, stride(-5, 0, 9)) };
}

/** A howl: standing tall, the head thrown back, both arms flung up and forward with the weapon raised. */
function howling(): PoseName {
  const sk = ALL_POSES["sw-idle"], f3 = sk.for3d!;
  return made("map-howl", {
    ...sk,
    for3d: {
      ...f3, hunch3: 0, head3: 38,
      arms3: { right: { dirs: [[0.3, 0.9, 0.3], [0.15, 1, 0.3]] }, left: { dirs: [[-0.3, 0.9, 0.3], [-0.15, 1, 0.3]] } },
      weapon3: [0.2, 0.9, 0.4],
    },
  });
}

const WALKS = {
  player: shuffling("map-idle", "p3-idle", 4, 1.2),
  sleepwalker: shuffling("map-sleepwalk", "sw-idle", 6, 1.5),
  chasing: running("map-chase", "sw-charge"),
  waxed: crawling("map-crawl"),
  howl: howling(),
};

/** The pose a figure has in this frame of its walk. */
function poseFor(look: Look, frame: Frame): PoseName {
  if (look.wax) return WALKS.waxed[frame];
  if (look.reach) return look.howl !== undefined ? WALKS.howl : (look.chasing ? WALKS.chasing : WALKS.sleepwalker)[frame];
  return WALKS.player[frame];
}

/* ---------- Turning the figure into a picture ---------- */

let cssText: string | undefined;

/** The figure's styles (`.fig-*`, the armor classes and the Wax Blob's pool of index.css), gathered once, to travel inside the picture. */
function figureCss(): string {
  if (cssText !== undefined) return cssText;
  let css = "";
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try { rules = sheet.cssRules; } catch { continue; }
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule && /\.(fig-|armor-|blob-)/.test(rule.selectorText)) css += `${rule.cssText}\n`;
    }
  }
  const root = getComputedStyle(document.documentElement);
  // (Every variable those rules use, and the ones the figures always have.)
  const names = new Set(["--ink", "--ink-shade", "--ink-far", "--metal", "--grip", "--armor", "--wax", "--eyes"]);
  for (const m of css.matchAll(/var\((--[\w-]+)/g)) names.add(m[1]);
  const vars = [...names].map(v => `${v}:${root.getPropertyValue(v).trim()};`).join("");
  cssText = `svg{${vars}}\n${css}`;
  return cssText;
}

/** Everything about a look that changes how its picture comes out. */
const lookKey = (l: Look) =>
  [l.ink, l.wax, l.weapon, l.armor, l.weaponItem, l.armorItem, l.headItem, l.hood, l.reach, l.howl !== undefined, l.chasing, l.lit].join("|");

/** What one figure is drawn as, in the camera's pixels: its inside markup (a group placed where its box is) and the class of its root. */
function figureInner(look: Look, pose: PoseName, yaw: number, at: Vec, encased = false): { inner: string; cls: string } | undefined {
  const box = orbitBox(CAM, at, W, H);
  const weapon = look.weapon ?? "baseline";
  const element = look.wax
    ? createElement(Waxed3D, { pose, weapon, encased: encased || look.lit, meldLegs: encased, cam: CAM, at, yaw, w: W, h: H, box })
    : createElement(Sleepwalker3D, {
      pose, weapon, hooded: look.hood, cam: CAM, at, yaw, w: W, h: H, box,
      // (You, on the same body: your class's weapon and what you wear. The sleepwalkers wear nothing.)
      gear: look.reach ? undefined : { weaponItem: look.weaponItem, armor: look.armor ?? "none", armorItem: look.armorItem, headItem: look.headItem },
    });
  const html = renderToStaticMarkup(element);
  const open = /^<svg[^>]*?class="([^"]*)"[^>]*>/.exec(html);
  const end = html.lastIndexOf("</svg>");
  if (!open || end < 0) return undefined;
  return { cls: open[1], inner: `<g transform="translate(${box.x} ${box.y}) scale(${box.w / 100})">${html.slice(open[0].length, end)}</g>` };
}

/** The finished picture: `inner` (in the camera's pixels) shown through `box`, around where the figure stands, `px` pixels square, in the look's colours. */
function pictureSvg(inner: string, cls: string, look: Look, box: Box, px: number): string {
  const at = orbitBox(CAM, SPOT, W, H), unit = at.w / 100;
  const x = at.x + 50 * unit + (box.x - 50) * unit, y = at.y + FOOT_Y * unit + (box.y - FOOT_Y) * unit, size = box.size * unit;
  // The map's colours for this look, over the fight's: its ink (a sleepwalker is greyer than you) and its wax.
  const own = `svg{--ink:${look.ink};--ink-far:color-mix(in srgb, ${look.ink} 68%, black);${look.wax ? `--wax:${look.wax};` : ""}}.fig-shadow{display:none}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="${x} ${y} ${size} ${size}" class="${cls}"><style>${figureCss()}${own}</style>${inner}</svg>`;
}

/** One figure, facing `facing`, in this frame of its walk. */
function figureSvg(look: Look, facing: Dir, frame: Frame, px: number): string | undefined {
  const one = figureInner(look, poseFor(look, frame), yawFor(facing, !!(look.wax || look.reach)), SPOT);
  return one && pictureSvg(one.inner, one.cls, look, BOX, px);
}

/** How far the dome of the Wax Blob reaches from its middle, meters. */
const BLOB_RADIUS = 1.6;
/** Where the three parts stand on it, in meters: `across` the way it goes (which is the line they stand on), and `ahead` of its middle. */
const BLOB_SPOTS: Record<"left" | "mid" | "right", { across: number; ahead: number }> = {
  left: { across: -1.0, ahead: 0.45 }, mid: { across: 0, ahead: -0.5 }, right: { across: 1.0, ahead: 0.45 },
};
/** Which way each facing goes on the floor (x to the right, z away from the camera). */
const GOING: Record<Dir, Vec> = { right: { x: 1, z: 0 }, left: { x: -1, z: 0 }, up: { x: 0, z: 1 }, down: { x: 0, z: -1 } };

/** The Wax Blob: its dome of wax, and its three parts sealed in wax, crawling, far ones first. */
function blobSvg(look: Look, weapons: Record<"left" | "mid" | "right", WeaponTier>, facing: Dir, frame: Frame, px: number): string | undefined {
  const go = GOING[facing], across = { x: -go.z, z: go.x };
  const disc = floorDisc(CAM, SPOT, BLOB_RADIUS, W, H), tall = orbitBox(CAM, SPOT, W, H).h;
  const pool = renderToStaticMarkup(createElement(BlobPool, { box: { cx: disc.cx, cy: disc.cy, rx: disc.rx, ry: disc.ry, tall, slumped: false, links: [] } }));
  const poolOpen = /^<svg[^>]*>/.exec(pool), poolEnd = pool.lastIndexOf("</svg>");
  if (!poolOpen || poolEnd < 0) return undefined;
  let inner = `<g transform="translate(${disc.cx - disc.rx} ${disc.cy - disc.ry})">${pool.slice(poolOpen[0].length, poolEnd)}</g>`;
  const parts = (Object.keys(BLOB_SPOTS) as (keyof typeof BLOB_SPOTS)[]).map(part => {
    const s = BLOB_SPOTS[part];
    return { part, at: { x: SPOT.x + across.x * s.across + go.x * s.ahead, z: SPOT.z + across.z * s.across + go.z * s.ahead } };
  }).sort((a, b) => b.at.z - a.at.z);
  for (const { part, at } of parts) {
    const one = figureInner({ ...look, weapon: weapons[part] }, poseFor(look, frame), yawFor(facing, true), at, true);
    if (!one) return undefined;
    inner += one.inner;
  }
  return pictureSvg(inner, "", look, BLOB_BOX, px);
}

/** The pictures made, by look, side, step and size; "pending" while one loads, "failed" if it will not come. */
const pictures = new Map<string, HTMLCanvasElement | "pending" | "failed">();
/** Pictures are kept until there are this many (a look is a few dozen of them), then dropped to start again. */
const MAX_PICTURES = 600;

function request(key: string, svg: string | undefined, px: number) {
  pictures.set(key, "pending");
  if (!svg) { pictures.set(key, "failed"); return; }
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = px;
    canvas.getContext("2d")!.drawImage(img, 0, 0, px, px);
    pictures.set(key, canvas);
  };
  img.onerror = () => pictures.set(key, "failed");
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const FRAMES: Frame[] = ["stand", "stepL", "stepR"];

/** Copies a figure's picture onto the map, centred on (x, y) with `T` pixels to a tile, making its pictures first if need be. False if it is not ready. */
function show(
  g: CanvasRenderingContext2D, x: number, y: number, T: number, facing: Dir, frame: Frame, key: string, box: Box,
  make: (f: Frame, px: number) => string | undefined,
): boolean {
  const tile = Math.round(T);
  const base = `${key}|${facing}|${tile}`;
  const here = pictures.get(`${base}|${frame}`);
  if (here === undefined) {
    // (Make all the steps at once, so walking never shows a frame missing.)
    if (pictures.size > MAX_PICTURES) pictures.clear();
    const px = Math.round((box.size * tile * SHARPNESS) / UNITS_PER_TILE);
    for (const f of FRAMES) {
      const k = `${base}|${f}`;
      if (!pictures.has(k)) request(k, make(f, px), px);
    }
  }
  if (!(here instanceof HTMLCanvasElement)) return false;
  const u = T / UNITS_PER_TILE;
  g.drawImage(here, x + (box.x - 50) * u, y + FOOT_BELOW_MIDDLE * T + (box.y - FOOT_Y) * u, box.size * u, box.size * u);
  return true;
}

/** Where a figure's head is in its picture (the 100 × 120 box's units, feet at x 50, y 114), by look, facing and step: where a lit waxed's flame stands. */
const heads = new Map<string, { x: number; y: number }>();

function headSpot(look: Look, facing: Dir, frame: Frame): { x: number; y: number } {
  const key = `${lookKey(look)}|${facing}|${frame}`;
  let at = heads.get(key);
  if (!at) {
    const head = placeRig(liftPose(ALL_POSES[poseFor(look, frame)]), SPOT, yawFor(facing, true), CAM, W, H).seen.head;
    const box = orbitBox(CAM, SPOT, W, H), unit = box.w / 100;
    heads.set(key, at = { x: (head.sx - box.x) / unit, y: (head.sy - box.y) / unit });
  }
  return at;
}

/** A little flame standing on (x, y), `h` tall: a soft teardrop that sways and flickers, with a glow round it. */
function drawFlame(g: CanvasRenderingContext2D, x: number, y: number, h: number, seed: number) {
  const t = performance.now() / 1000 + seed, sway = Math.sin(t * 5.1) * 0.12 + Math.sin(t * 8.3) * 0.06, tall = h * (1 + Math.sin(t * 7.2) * 0.07), w = h * 0.34;
  g.save();
  g.translate(x, y);
  const glow = g.createRadialGradient(0, -h * 0.45, 0, 0, -h * 0.45, h * 1.3);
  glow.addColorStop(0, "rgba(255,170,80,0.38)"); glow.addColorStop(1, "rgba(255,170,80,0)");
  g.fillStyle = glow;
  g.fillRect(-h * 1.3, -h * 1.8, h * 2.6, h * 2.6);
  g.beginPath();
  g.moveTo(sway * tall, -tall);
  g.bezierCurveTo(w * 1.1, -tall * 0.5, w, 0, 0, 0);
  g.bezierCurveTo(-w, 0, -w * 1.1, -tall * 0.5, sway * tall, -tall);
  const body = g.createRadialGradient(0, -tall * 0.25, 0, 0, -tall * 0.3, tall * 0.7);
  body.addColorStop(0, "rgba(255,241,194,0.95)"); body.addColorStop(0.5, "rgba(242,166,90,0.8)"); body.addColorStop(1, "rgba(224,120,47,0.35)");
  g.fillStyle = body;
  g.fill();
  g.restore();
}

/**
 * Draws the figure the way the fight draws it, centred on (x, y) with `T` pixels to a tile. Returns false (drawing nothing) if its
 * picture is not ready yet (it is being made: the next frame will have it) or cannot be made.
 */
export function drawSprite(g: CanvasRenderingContext2D, x: number, y: number, T: number, facing: Dir, frame: Frame, look: Look): boolean {
  if (!show(g, x, y, T, facing, frame, lookKey(look), BOX, (f, px) => figureSvg(look, facing, f, px))) return false;
  // A lit waxed's flame burns over its head.
  if (look.lit) {
    const u = T / UNITS_PER_TILE, head = headSpot(look, facing, frame);
    drawFlame(g, x + (head.x - 50) * u, y + FOOT_BELOW_MIDDLE * T + (head.y - HEAD_TOP * 0.7 - FOOT_Y) * u, 17 * u, (x * 7 + y * 3) % 6);
  }
  return true;
}

/** The Wax Blob, its parts armed as given (left, middle, right), going `facing`: the same, for the heap of three. */
export function drawBlobSprite(
  g: CanvasRenderingContext2D, x: number, y: number, T: number, facing: Dir, frame: Frame, look: Look, weapons: Record<"left" | "mid" | "right", WeaponTier>,
): boolean {
  return show(g, x, y, T, facing, frame, `blob|${lookKey(look)}|${weapons.left}|${weapons.mid}|${weapons.right}`, BLOB_BOX, (f, px) => blobSvg(look, weapons, facing, f, px));
}
