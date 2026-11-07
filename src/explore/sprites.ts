/**
 * sprites.ts — the map's figures drawn with the fight's own figures.
 *
 * A figure in a fight (`render/StickFigure.tsx`) is an SVG with the true proportions (the rig). Here the very same component is
 * rendered once per look, facing and step, turned into a picture and kept; the map then only copies that picture onto the ground
 * (`drawSprite`). Nothing about a figure's shape is written down twice: change a pose, a weapon or the rig, and the map follows.
 *
 * The fight sees a figure from a 3/4 angle (side-on, `stand`/`sw-idle`...). On the map there are four ways to face:
 *  - left and right: the fight's 3/4 view (the player seen from behind, an enemy from the front), turned round for the other side;
 *  - down (toward you) and up (away): the same figure seen straight on, from the front and from behind (the Model viewer's views).
 * Walking is two more frames of each (a foot lifted, a stride); the poses for them are made here from the fight's.
 *
 * The picture is made when first asked for (it is an image that has to load), so `drawSprite` says whether it drew anything:
 * until it has, the caller draws the figure its old way.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Pt } from "../render/geom";
import { ALL_POSES, type PoseName, type Skeleton } from "../render/poses";
import { stand } from "../render/playerPoses";
import { StickFigure } from "../render/StickFigure";
import type { Frame, Look } from "./figures";
import type { Dir } from "./world";

/** A figure's units (100 wide, 120 tall: the fight's) per tile on the map: a quarter bigger than the map's old stick figure (115). */
export const UNITS_PER_TILE = 92;
/** Where the feet are in a figure's box, and how far below the figure's middle they stand on the map (in tiles). */
const FOOT_Y = 114, FOOT_BELOW_MIDDLE = 0.36;
/** The picture shows this much around the 100 × 120 box (a weapon held out, a hand raised): x from -30 to 130, y from -20 to 140. */
const BOX = { x: -30, y: -20, size: 160 };
/** The pictures are made this many times finer than they are shown, so they stay sharp when the map is zoomed a little. */
const SHARPNESS = 1.5;

type Side = "side" | "up" | "down";

/** How a figure is seen, and the skeleton that makes it. */
interface Spec {
  pose: PoseName;
  skeleton?: Skeleton;
  view: "front" | "back";
  straight: boolean;
  /** The way the picture faces, if it is a side view: the player's faces right, an enemy's (turned to face the player) left. */
  native?: "left" | "right";
}

const sideOf = (facing: Dir): Side => (facing === "up" ? "up" : facing === "down" ? "down" : "side");

/* ---------- The poses ---------- */

/** One leg or none lifted a little, as a foot comes off the ground in a step. */
const STEP_LIFT = 7;

/** The player's walk, seen at 3/4 from behind: the idle's body, a stride either way, the arms swinging against the legs. */
function playerStride(frame: Frame): Skeleton | undefined {
  if (frame === "stand") return undefined;
  const left = frame === "stepL";
  return stand({ psiS: 15, psiH: 10, D: left ? 20 : -20, W: 5, c: 0, lean: 1, weaponHand: [left ? 13 : 2, 4], angle: 66, freeHand: [left ? -10 : 8, 3] });
}

/** An enemy's walk: the same body, the legs set one ahead and one behind, whichever leads swapping each step. */
function enemyStride(base: Skeleton, frame: Frame): Skeleton {
  if (frame === "stand") return base;
  const s = frame === "stepL" ? 1 : -1;
  const hx = base.hip[0], hy = base.hip[1];
  const leg = (ahead: number): Skeleton["leadLeg"] => ({ knee: [hx + ahead * 0.5, hy + (FOOT_Y - hy) * 0.5 - 1], foot: [hx + ahead, FOOT_Y] });
  return { ...base, leadLeg: leg(s * 12), rearLeg: leg(-s * 12) };
}

/**
 * A figure seen straight on, standing or stepping: the body upright on the middle, the arms hanging at the shoulders, the legs
 * straight down (the foot that steps is lifted and its shin foreshortened, as it comes toward or away from you).
 * `kneeling`: the waxed, down on their knees, the bound shins behind them out of sight.
 */
function straightOn(view: "front" | "back", frame: Frame, o: { kneeling: boolean; hunch: number; weapon: boolean }): Skeleton {
  const front = view === "front";
  // The waxed crawl on all fours: seen straight on the torso leans toward or away from you, so it is short, the head sunk low in front of
  // the shoulders and the arms reaching down to the ground (as `w-crawl` is seen from the side). The kneeling thigh is shortened to
  // match, with the feet placed where the fitted legs end so nothing is dragged.
  const THIGH = 0.74, CRAWL_TORSO = 0.5, CRAWL_ARM = 1.3, SHIN = 0.25;
  const hipY = o.kneeling ? 90 : 65, neckY = hipY - (o.kneeling ? 32 * CRAWL_TORSO : 32);
  // (The shoulders sit 6 either side of the neck, the hips 3.5 either side of the middle; the weapon arm is the figure's right,
  // the page's left from the front. See `straight` in StickFigure.)
  const wx = 50 + (front ? -6 : 6), fx = 100 - wx;
  const arm = (x: number, out: number) => ({ elbow: [x + out * 0.6, neckY + 17] as Pt, hand: [x + out, neckY + 31] as Pt });
  const weaponArm = arm(wx, front ? -1.6 : 1.6), freeArm = arm(fx, front ? 1.6 : -1.6);
  // The left leg is the lead one, on the page's right from the front and its left from behind.
  const leadX = 50 + (front ? 3.5 : -3.5), rearX = 100 - leadX;
  const pageLeftIsLead = !front;
  const lifted = frame === "stepL" ? pageLeftIsLead : frame === "stepR" ? !pageLeftIsLead : null;
  const kneeY = hipY + 24.5 * THIGH, footY = kneeY + 24.5 * SHIN;
  const leg = (x: number, lift: boolean): Skeleton["leadLeg"] => {
    if (o.kneeling) return { knee: [x, kneeY], foot: [x, footY] };
    return lift ? { knee: [x, hipY + 22], foot: [x, hipY + 49 - STEP_LIFT] } : { knee: [x, hipY + 24.5], foot: [x, hipY + 49] };
  };
  const adjust: NonNullable<Skeleton["adjust"]> = {};
  if (o.kneeling) {
    adjust.torso = CRAWL_TORSO;
    adjust.leadThigh = adjust.rearThigh = THIGH;
    adjust.leadShin = adjust.rearShin = SHIN;
    adjust.weaponUpper = adjust.weaponFore = adjust.freeUpper = adjust.freeFore = CRAWL_ARM;
    // The hand that reaches comes up off the ground, toward or away from you, so its forearm is foreshortened; the other pulls back, planted.
    if (frame !== "stand") {
      const weaponReaches = (frame === "stepL") === !front;
      if (weaponReaches) adjust.weaponFore = CRAWL_ARM * 0.5; else adjust.freeFore = CRAWL_ARM * 0.5;
    }
  } else if (lifted !== null) { if (lifted) adjust.leadShin = 0.8; else adjust.rearShin = 0.8; }
  const handAt = weaponArm.hand;
  return {
    head: [50, neckY - o.hunch], neck: [50, neckY], hip: [50, hipY],
    weaponArm, freeArm,
    leadLeg: leg(leadX, lifted === true), rearLeg: leg(rearX, lifted === false),
    // A weapon hangs from the hand, its tip a little out from the body; the waxed carry theirs in the other hand, so nothing is drawn here.
    weapon: { at: handAt, angle: o.weapon ? (front ? 100 : 80) : 0 },
    adjust,
  };
}

/** The waxed's crawl: on their hands, one reaching ahead and the other pulling back each step (the rest, planted, is `w-crawl` itself). */
function crawlStride(frame: Frame): Skeleton {
  const base = ALL_POSES["w-crawl"];
  if (frame === "stand") return base;
  const reach = (a: Skeleton["weaponArm"], by: number, lift: number): Skeleton["weaponArm"] => ({ elbow: [a.elbow[0] + by * 0.6, a.elbow[1] - lift * 0.5], hand: [a.hand[0] + by, a.hand[1] - lift] });
  // (The hand reaching ahead is lifted a little off the ground, the one pulling back is planted.)
  const weaponAhead = frame === "stepL";
  return {
    ...base,
    weaponArm: weaponAhead ? reach(base.weaponArm, 8, 3) : reach(base.weaponArm, -5, 0),
    freeArm: weaponAhead ? reach(base.freeArm, -5, 0) : reach(base.freeArm, 8, 3),
    weapon: { at: weaponAhead ? [base.weaponArm.hand[0] + 8, base.weaponArm.hand[1] - 3] : [base.weaponArm.hand[0] - 5, base.weaponArm.hand[1]], angle: base.weapon.angle },
  };
}

/** A howl, seen at 3/4: standing tall, the head thrown back, both arms flung up and forward with the weapon raised. */
const HOWL_SIDE: Skeleton = {
  head: [43, 19], neck: [47, 31], hip: [49, 63],
  weaponArm: { elbow: [58, 27], hand: [66, 13] },
  freeArm: { elbow: [53, 28], hand: [59, 14] },
  leadLeg: { knee: [55, 89], foot: [57, 114] },
  rearLeg: { knee: [44, 89], foot: [41, 114] },
  weapon: { at: [66, 13], angle: -72 },
};

/** A howl seen straight on: the arms up either side of the head, the weapon raised. */
function howlStraight(view: "front" | "back"): Skeleton {
  const front = view === "front";
  const wx = 50 + (front ? -6 : 6), fx = 100 - wx, out = front ? -1 : 1;
  const hipY = 65, neckY = 33;
  const up = (x: number, o: number): Skeleton["weaponArm"] => ({ elbow: [x + o * 5, neckY - 8], hand: [x + o * 6, neckY - 24] });
  const weaponArm = up(wx, out);
  return {
    head: [50, neckY - 9], neck: [50, neckY], hip: [50, hipY],
    weaponArm, freeArm: up(fx, -out),
    leadLeg: { knee: [front ? 53.5 : 46.5, hipY + 24.5], foot: [front ? 53.5 : 46.5, hipY + 49] },
    rearLeg: { knee: [front ? 46.5 : 53.5, hipY + 24.5], foot: [front ? 46.5 : 53.5, hipY + 49] },
    weapon: { at: weaponArm.hand, angle: -90 },
  };
}

/** The skeleton, the pose and the view for a figure facing `facing` in `frame`. */
function specFor(look: Look, facing: Dir, frame: Frame): Spec {
  const side = sideOf(facing);
  const waxed = !!look.wax, sleepwalker = !waxed && !!look.reach;
  const armed = (look.weapon ?? "baseline") !== "baseline";
  if (side === "side") {
    if (waxed) return { pose: "w-crawl", skeleton: crawlStride(frame), view: "front", straight: false, native: "left" };
    if (sleepwalker && look.howl !== undefined) return { pose: "sw-idle", skeleton: HOWL_SIDE, view: "front", straight: false, native: "left" };
    if (sleepwalker) return { pose: "sw-idle", skeleton: enemyStride(ALL_POSES["sw-idle"], frame), view: "front", straight: false, native: "left" };
    return { pose: "idle", skeleton: playerStride(frame), view: "back", straight: false, native: "right" };
  }
  const view = side === "down" ? "front" : "back";
  if (sleepwalker && look.howl !== undefined) return { pose: "sw-idle", skeleton: howlStraight(view), view, straight: true };
  return {
    pose: waxed ? "w-crawl" : sleepwalker ? "sw-idle" : "idle",
    skeleton: straightOn(view, frame, { kneeling: waxed, hunch: waxed ? 6 : sleepwalker ? 8 : 11, weapon: armed && !waxed }),
    view, straight: true,
  };
}

/* ---------- Turning the figure into a picture ---------- */

let cssText: string | undefined;

/** The figure's styles (`.fig-*` and the armor classes of index.css), gathered once, to travel inside the picture. */
function figureCss(): string {
  if (cssText !== undefined) return cssText;
  let css = "";
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try { rules = sheet.cssRules; } catch { continue; }
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule && /\.(fig-|armor-)/.test(rule.selectorText)) css += `${rule.cssText}\n`;
    }
  }
  const root = getComputedStyle(document.documentElement);
  const vars = ["--ink", "--ink-shade", "--ink-far", "--metal", "--grip", "--armor", "--wax", "--eyes"]
    .map(v => `${v}:${root.getPropertyValue(v).trim()};`).join("");
  cssText = `svg{${vars}}\n${css}`;
  return cssText;
}

/** Everything about a look that changes how its picture comes out. */
const lookKey = (l: Look) =>
  [l.ink, l.wax, l.weapon, l.armor, l.weaponItem, l.armorItem, l.headItem, l.hood, l.reach, l.howl !== undefined].join("|");

/** The SVG text of one figure, ready to load as an image `px` pixels square. */
function svgOf(spec: Spec, look: Look, px: number): string | undefined {
  const html = renderToStaticMarkup(createElement(StickFigure, {
    view: spec.view, pose: spec.pose, skeleton: spec.skeleton, straight: spec.straight,
    weapon: look.weapon ?? "baseline", armor: look.armor ?? "none",
    weaponItem: look.weaponItem, armorItem: look.armorItem, headItem: look.headItem,
    variant: look.wax ? "waxed" : undefined, hooded: look.hood,
    foe: !!look.wax || !!look.reach,
  }));
  const open = /^<svg[^>]*?class="([^"]*)"[^>]*>/.exec(html);
  const end = html.lastIndexOf("</svg>");
  if (!open || end < 0) return undefined;
  // The map's colours for this look, over the fight's: its ink (a sleepwalker is greyer than you) and its wax.
  const own = `svg{--ink:${look.ink};--ink-far:color-mix(in srgb, ${look.ink} 68%, black);${look.wax ? `--wax:${look.wax};` : ""}}.fig-shadow{display:none}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="${BOX.x} ${BOX.y} ${BOX.size} ${BOX.size}" class="${open[1]}"><style>${figureCss()}${own}</style>${html.slice(open[0].length, end)}</svg>`;
}

/** The pictures made, by look, side, step and size; "pending" while one loads, "failed" if it will not come. */
const pictures = new Map<string, HTMLCanvasElement | "pending" | "failed">();
/** Pictures are kept until there are this many (a look is a few dozen of them), then dropped to start again. */
const MAX_PICTURES = 600;

function request(key: string, spec: Spec, look: Look, px: number) {
  pictures.set(key, "pending");
  const svg = svgOf(spec, look, px);
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

/**
 * Draws the figure the way the fight draws it, centred on (x, y) with `T` pixels to a tile. Returns false (drawing nothing) if its
 * picture is not ready yet (it is being made: the next frame will have it) or cannot be made.
 */
export function drawSprite(g: CanvasRenderingContext2D, x: number, y: number, T: number, facing: Dir, frame: Frame, look: Look): boolean {
  const side = sideOf(facing);
  const tile = Math.round(T);
  const base = `${lookKey(look)}|${side}|${tile}`;
  const here = pictures.get(`${base}|${frame}`);
  if (here === undefined) {
    // (Make all the steps at once, so walking never shows a frame missing.)
    if (pictures.size > MAX_PICTURES) pictures.clear();
    const px = Math.round((BOX.size * tile * SHARPNESS) / UNITS_PER_TILE);
    for (const f of FRAMES) {
      const key = `${base}|${f}`;
      if (!pictures.has(key)) request(key, specFor(look, facing, f), look, px);
    }
  }
  if (!(here instanceof HTMLCanvasElement)) return false;
  const u = T / UNITS_PER_TILE;
  const left = x + (BOX.x - 50) * u, top = y + FOOT_BELOW_MIDDLE * T + (BOX.y - FOOT_Y) * u, size = BOX.size * u;
  // A side view faces its native way; the other way, it is turned round about the figure's middle.
  const native = look.wax || look.reach ? "left" : "right";
  const flip = side === "side" && facing !== native;
  if (flip) {
    g.save();
    g.translate(x, 0);
    g.scale(-1, 1);
    g.drawImage(here, left - x, top, size, size);
    g.restore();
  } else {
    g.drawImage(here, left, top, size, size);
  }
  return true;
}
