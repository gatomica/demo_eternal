/**
 * figures.ts — the map's figures: you, the enemies and the hooded keepers.
 */
import type { KindId } from "../core/bestiary";
import type { ArmorTier, WeaponTier } from "../core/types";
import { COLORS } from "./tuning";
import type { Dir } from "./world";

export type Frame = "stand" | "stepL" | "stepR";

/** How a figure on the map looks. */
export interface Look {
  ink: string;
  /** Eye color, or null for closed eyes (sleepwalkers walk in their sleep). */
  eye: string | null;
  /** The waxed: on their knees, shins bound and head sealed in wax of this color, crawling on their hands. */
  wax?: string;
  /** Arms held out in front, the way sleepwalkers walk. */
  reach?: boolean;
  /** What it carries in its hand and wears, as in a fight (none if left out). */
  weapon?: WeaponTier;
  armor?: ArmorTier;
  /** The Penitent Warden's pointed hood (a patrol warden): its point hangs behind, the face in shadow. */
  hood?: boolean;
}

const PLAYER_LOOK: Look = { ink: COLORS.ink, eye: COLORS.eye };

/** You on the map, wearing what you have equipped. */
export const playerLook = (gear: { weapon: WeaponTier; armor: ArmorTier }): Look => ({ ...PLAYER_LOOK, ...gear });

/** Gear colors, the same as in a fight (index.css: --metal, --grip, --armor). */
const METAL = "#b9bccb", GRIP = "#8a6b4a", ARMOR_INK = "#6f7489";
/** The demo's weapons, as the fight draws them (index.css): the torch's wax, the bedchamber brick, mortar, cord. */
const WAX_INK = "#b9a14e", BRICK = "#85838d", MORTAR = "#c9c6bd", CORD = "#b39d73";

/** How wide the plate over the torso is, in tiles (wider is heavier). */
const PLATE_WIDTH: Record<ArmorTier, number> = { none: 0, light: 0.11, normal: 0.13, heavy: 0.15 };

export const SLEEPWALKER_LOOK: Look = { ink: "#aaa5b8", eye: null, reach: true };

/** A patrol warden: a sleepwalker in the Penitent Warden's pointed hood. */
export const PATROL_LOOK: Look = { ...SLEEPWALKER_LOOK, hood: true };

export const WAXED_LOOK: Look = { ink: "#9d98aa", eye: null, wax: "#b9a14e" };

/** A little stick figure seen from above and in front, centered on (x, y), `T` pixels per tile. */
export function drawWalker(
  g: CanvasRenderingContext2D, x: number, y: number, T: number, facing: Dir, frame: Frame,
  shadow = true, shadowDrop = 0, look: Look = PLAYER_LOOK,
) {
  const X = (u: number) => x + u * T;
  const Y = (v: number) => y + v * T;
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    g.beginPath(); g.moveTo(X(x1), Y(y1)); g.lineTo(X(x2), Y(y2)); g.stroke();
  };
  const leg = line;
  const step = frame === "stepL" ? -1 : frame === "stepR" ? 1 : 0;
  const bob = step ? -0.025 : 0;
  const foot = 0.36, hip = 0.08 + bob, neck = -0.2 + bob, shoulder = neck + 0.05, headY = -0.36 + bob, r = 0.15;

  if (shadow) {
    g.fillStyle = COLORS.shadow;
    // Mid-fall, the shadow stays on the ground below and shrinks the higher you are above it.
    const s = 1 / (1 + shadowDrop);
    g.beginPath(); g.ellipse(X(0), Y(foot + 0.01 + shadowDrop), 0.2 * T * s, 0.07 * T * s, 0, 0, Math.PI * 2); g.fill();
  }

  g.strokeStyle = look.ink;
  g.lineWidth = Math.max(2, 0.075 * T);
  g.lineCap = "round";
  g.lineJoin = "round";

  if (look.wax) { drawKneeler(g, X, Y, line, T, facing, step, foot, look); return; }

  /** A stroke in a color of its own, then back to the figure's ink. */
  const stroke = (color: string, w: number, x1: number, y1: number, x2: number, y2: number) => {
    g.strokeStyle = color; g.lineWidth = Math.max(1.5, w * T); line(x1, y1, x2, y2);
    g.strokeStyle = look.ink; g.lineWidth = Math.max(2, 0.075 * T);
  };
  /** Armor: a plate over the torso, as in a fight. */
  const plate = () => {
    const armor = look.armor ?? "none";
    if (armor !== "none") stroke(ARMOR_INK, PLATE_WIDTH[armor], 0, neck + 0.03, 0, neck + (hip - neck) * 0.86);
  };
  /** Normal and heavy armor add pauldrons, at these shoulders (both from the front, one from the side). */
  const pads = (at: number[]) => {
    if (look.armor !== "normal" && look.armor !== "heavy") return;
    g.fillStyle = ARMOR_INK;
    for (const u of at) { g.beginPath(); g.arc(X(u), Y(shoulder + 0.01), (look.armor === "heavy" ? 0.055 : 0.042) * T, 0, Math.PI * 2); g.fill(); }
  };
  /** The weapon, held at the hand (u, v) and hanging down, its tip leaning `lean` tiles out per tile down. */
  const weapon = (u: number, v: number, lean: number) => {
    const tier = look.weapon ?? "baseline";
    if (tier === "baseline") return;
    const n = Math.hypot(lean, 1), du = lean / n, dv = 1 / n;
    const at = (d: number, across = 0): [number, number] => [u + du * d - dv * across, v + dv * d + du * across];
    const seg = (color: string, w: number, a: [number, number], b: [number, number]) => stroke(color, w, a[0], a[1], b[0], b[1]);
    const fill = (color: string, pts: [number, number][]) => {
      g.fillStyle = color; g.beginPath();
      pts.forEach(([pu, pv], i) => (i ? g.lineTo(X(pu), Y(pv)) : g.moveTo(X(pu), Y(pv))));
      g.closePath(); g.fill();
    };
    if (tier === "light") { // the Jagged Chisel: a broad short sword snapped off and ground square
      seg(GRIP, 0.035, at(-0.04), at(0.02));
      seg(METAL, 0.03, at(0.02, -0.04), at(0.02, 0.04));
      fill(METAL, [at(0.03, -0.028), at(0.135, -0.028), at(0.145, -0.018), at(0.145, 0.028), at(0.03, 0.028)]);
    } else if (tier === "normal") { // the Waxed Torch: a shaft, its head a bulb of sealing wax
      seg(GRIP, 0.032, at(-0.04), at(0.26));
      seg(WAX_INK, 0.014, at(0.15, 0.014), at(0.26, 0.016));
      fill(WAX_INK, [at(0.25, -0.04), at(0.31, -0.05), at(0.345, 0), at(0.31, 0.05), at(0.25, 0.04)]);
    } else { // the Brick Hammer: a crooked haft, a brick lashed to its end near the floor
      seg(GRIP, 0.04, at(-0.06), at(0.29));
      fill(BRICK, [at(0.27, -0.075), at(0.37, -0.075), at(0.385, -0.05), at(0.385, 0.075), at(0.27, 0.075)]);
      seg(MORTAR, 0.012, at(0.38, -0.04), at(0.38, 0.07));
      seg(CORD, 0.012, at(0.28, -0.07), at(0.32, 0.07));
    }
  };

  if (facing === "up" || facing === "down") {
    // Legs: the stepping foot lifts; the arm on the other side swings.
    const lift = (side: number) => (step === side ? -0.08 : 0);
    leg(-0.04, hip, -0.08, foot + lift(-1));
    leg(0.04, hip, 0.08, foot + lift(1));
    line(0, neck, 0, hip);
    plate();
    if (look.reach) {
      // Arms held out ahead: toward you when facing down, away when facing up.
      const out = facing === "down" ? 0.17 : -0.12;
      line(-0.03, shoulder, -0.07, shoulder + out);
      line(0.03, shoulder, 0.07, shoulder + out);
    } else {
      const swing = (side: number) => (step === -side ? (facing === "down" ? 0.05 : -0.05) : step === side ? (facing === "down" ? -0.03 : 0.03) : 0);
      // The weapon is in your right hand: on the left of the screen when you face it, the
      // right when you turn away. Seen from behind, it hangs behind the body.
      const side = facing === "down" ? -1 : 1;
      if (facing === "up") weapon(side * 0.16, 0.02 + swing(side), side * 0.35);
      line(-0.02, shoulder, -0.16, 0.02 + swing(-1));
      line(0.02, shoulder, 0.16, 0.02 + swing(1));
      if (facing === "down") weapon(side * 0.16, 0.02 + swing(side), side * 0.35);
    }
    pads([-0.05, 0.05]);
  } else {
    const m = facing === "right" ? 1 : -1;
    // Legs scissor, arms swing against them.
    const reach = step ? 0.12 : 0.045;
    leg(0, hip, m * reach, foot);
    leg(0, hip, -m * reach, foot + (step ? -0.02 : 0));
    line(0, neck, 0, hip);
    plate();
    if (look.reach) {
      line(0, shoulder, m * 0.24, shoulder + 0.02);
      line(0, shoulder + 0.02, m * 0.21, shoulder + 0.06);
    } else {
      const arm = step ? 0.1 : 0.045;
      // The weapon hangs from the front hand, tip a little ahead. Facing right, your right hand
      // is the far one, so it goes behind the body.
      if (facing === "right") weapon(m * arm, 0.03, m * 0.3);
      line(0, shoulder, -m * arm, 0.03);
      line(0, shoulder, m * arm, 0.03);
      if (facing === "left") weapon(m * arm, 0.03, m * 0.3);
    }
    pads([0]);
  }

  g.fillStyle = look.ink;
  g.beginPath(); g.arc(X(0), Y(headY), r * T, 0, Math.PI * 2); g.fill();
  // Heavy armor comes with a helmet over the top of the head, stopping above the eyes.
  if (look.armor === "heavy") {
    g.fillStyle = ARMOR_INK;
    g.beginPath(); g.arc(X(0), Y(headY - 0.015), r * 1.07 * T, Math.PI, Math.PI * 2); g.fill();
    g.fillRect(X(-r * 1.14), Y(headY - 0.04), r * 2.28 * T, 0.03 * T);
  }

  // A patrol warden's hood: a little larger than the head, its point hanging behind it (the way it
  // isn't facing), and the dark of its opening where the face is.
  if (look.hood) {
    const back = facing === "left" ? 1 : facing === "right" ? -1 : 0;
    g.fillStyle = "#6c6871";
    g.beginPath();
    if (back) { g.moveTo(X(back * 0.05), Y(headY - 0.13)); g.lineTo(X(back * 0.24), Y(headY - 0.2)); g.lineTo(X(back * 0.15), Y(headY + 0.02)); }
    else { g.moveTo(X(-0.07), Y(headY - 0.12)); g.lineTo(X(0), Y(headY - (facing === "up" ? 0.3 : 0.27))); g.lineTo(X(0.07), Y(headY - 0.12)); }
    g.fill();
    g.beginPath(); g.arc(X(0), Y(headY), r * 1.18 * T, 0, Math.PI * 2); g.fill();
    if (facing !== "up") {
      g.fillStyle = "#0c0a0f";
      g.beginPath(); g.ellipse(X(-back * 0.06), Y(headY + 0.02), (back ? 0.06 : 0.09) * T, 0.1 * T, 0, 0, Math.PI * 2); g.fill();
    }
    return;
  }
  // Eyes give away which way the head faces; from behind there are none.
  if (!look.eye) return;
  g.fillStyle = look.eye;
  const eye = (u: number, v: number) => { g.beginPath(); g.arc(X(u), Y(v), Math.max(1, 0.022 * T), 0, Math.PI * 2); g.fill(); };
  if (facing === "down") { eye(-0.05, headY + 0.01); eye(0.05, headY + 0.01); }
  if (facing === "left") eye(-0.08, headY);
  if (facing === "right") eye(0.08, headY);
}

/**
 * The waxed on the map: kneeling, the bound shins dragged behind, hauling itself along on its
 * hands, its head a lump of wax.
 */
function drawKneeler(
  g: CanvasRenderingContext2D, X: (u: number) => number, Y: (v: number) => number,
  line: (x1: number, y1: number, x2: number, y2: number) => void,
  T: number, facing: Dir, step: number, foot: number, look: Look,
) {
  const wax = look.wax!;
  const hip = 0.2, neck = 0.02;
  const waxLine = (x1: number, y1: number, x2: number, y2: number, w = 0.12) => {
    g.strokeStyle = wax; g.lineWidth = Math.max(3, w * T); line(x1, y1, x2, y2);
    g.strokeStyle = look.ink; g.lineWidth = Math.max(2, 0.075 * T);
  };
  const head = (u: number, v: number) => {
    g.fillStyle = wax;
    g.beginPath(); g.ellipse(X(u), Y(v), 0.15 * T, 0.16 * T, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 1; g.stroke();
    g.strokeStyle = look.ink; g.lineWidth = Math.max(2, 0.075 * T);
  };
  if (facing === "left" || facing === "right") {
    const m = facing === "right" ? 1 : -1;
    const lean = step ? 0.03 : 0;
    // Thighs down to the knees, the bound shins flat behind.
    line(0, hip, m * 0.06, foot - 0.02);
    waxLine(m * 0.05, foot - 0.02, -m * 0.2, foot);
    // Torso leaning forward, arms planted ahead, one reaching further each step.
    const nx = m * (0.12 + lean), ny = neck + 0.04;
    line(0, hip, nx, ny);
    line(nx, ny + 0.03, m * (0.22 + (step === 1 ? 0.05 : 0)), foot);
    line(nx, ny + 0.03, m * (0.17 + (step === -1 ? 0.05 : 0)), foot);
    head(m * (0.2 + lean), ny - 0.1);
  } else {
    // From the front or behind: knees apart on the ground, shins bound behind them.
    const toward = facing === "down" ? 1 : -1;
    waxLine(-0.07, foot - 0.04 * toward, 0.07, foot - 0.04 * toward, 0.11);
    line(-0.02, hip, -0.07, foot);
    line(0.02, hip, 0.07, foot);
    line(0, neck, 0, hip);
    const lift = (side: number) => (step === side ? -0.05 : 0);
    line(-0.02, neck + 0.05, -0.15, foot + lift(-1));
    line(0.02, neck + 0.05, 0.15, foot + lift(1));
    head(0, neck - 0.13);
  }
}

/**
 * The Warden on the map: a head taller than anyone, a long cloak and a peaked hood with a wax
 * beak, his wax arm hanging huge at one side, the flail at the other. His flame is out.
 */
export function drawWardenMap(g: CanvasRenderingContext2D, x: number, y: number, T: number, facing: Dir) {
  const k = 1.45;
  const X = (u: number) => x + u * T * k, Y = (v: number) => y + (v * k + 0.36 * (1 - k)) * T;
  const m = facing === "left" ? -1 : 1;
  g.fillStyle = COLORS.shadow;
  g.beginPath(); g.ellipse(X(0), Y(0.37), 0.26 * T * k, 0.08 * T * k, 0, 0, Math.PI * 2); g.fill();
  // The flail, hanging from his hand, its waxed head on the floor.
  g.strokeStyle = "#9a9db0"; g.lineWidth = Math.max(1, 0.02 * T * k);
  g.beginPath(); g.moveTo(X(-0.2 * m), Y(0.02)); g.lineTo(X(-0.26 * m), Y(0.3)); g.stroke();
  g.fillStyle = "#b9a14e";
  g.beginPath(); g.arc(X(-0.27 * m), Y(0.32), 0.06 * T * k, 0, Math.PI * 2); g.fill();
  // Cloak.
  g.fillStyle = "#5c5866";
  g.beginPath();
  g.moveTo(X(-0.13), Y(-0.24)); g.lineTo(X(0.13), Y(-0.24));
  g.lineTo(X(0.22), Y(0.36)); g.lineTo(X(-0.22), Y(0.36)); g.closePath(); g.fill();
  g.fillStyle = "#b9a14e";
  g.fillRect(X(-0.015), Y(-0.2), Math.max(1, 0.03 * T * k), 0.56 * T * k);
  // The wax arm, swollen toward the hand.
  g.strokeStyle = "#b9a14e"; g.lineCap = "round";
  g.lineWidth = 0.09 * T * k;
  g.beginPath(); g.moveTo(X(0.12 * m), Y(-0.2)); g.lineTo(X(0.2 * m), Y(0.02)); g.stroke();
  g.fillStyle = "#b9a14e";
  g.beginPath(); g.arc(X(0.21 * m), Y(0.06), 0.065 * T * k, 0, Math.PI * 2); g.fill();
  // The flail arm.
  g.strokeStyle = "#ece9f4"; g.lineWidth = Math.max(2, 0.06 * T * k);
  g.beginPath(); g.moveTo(X(-0.12 * m), Y(-0.2)); g.lineTo(X(-0.2 * m), Y(0.02)); g.stroke();
  // Hood and beak.
  g.fillStyle = "#6a6574";
  g.beginPath();
  g.moveTo(X(0.02 * m), Y(-0.66)); g.quadraticCurveTo(X(0.2), Y(-0.42), X(0.15), Y(-0.2));
  g.lineTo(X(-0.15), Y(-0.2)); g.quadraticCurveTo(X(-0.2), Y(-0.42), X(0.02 * m), Y(-0.66)); g.fill();
  g.fillStyle = "#121117";
  g.beginPath(); g.ellipse(X(0), Y(-0.36), 0.08 * T * k, 0.1 * T * k, 0, 0, Math.PI * 2); g.fill();
  if (facing !== "up") {
    g.fillStyle = "#b9a14e";
    const dir = facing === "down" ? 0 : m;
    g.beginPath();
    g.moveTo(X(-0.035 + dir * 0.02), Y(-0.38)); g.lineTo(X(0.035 + dir * 0.02), Y(-0.38));
    g.lineTo(X(dir * 0.14), Y(-0.22)); g.closePath(); g.fill();
  }
}

/**
 * The guide on the map, wherever it appears to let you rest (see `drawGuideBody`). Its orb shines
 * where you last rested.
 */
export function drawKeeper(g: CanvasRenderingContext2D, x: number, y: number, T: number, lit: boolean, t: number) {
  drawGuideBody(g, x, y, T, lit ? 1 : 0.25, t);
}

/** The ground under a body: a pool of the given color, flat on the floor. */
function pool(g: CanvasRenderingContext2D, x: number, y: number, T: number, rx: number, ry: number, color: string) {
  g.fillStyle = color;
  g.beginPath(); g.ellipse(x, y, rx * T, ry * T, 0, 0, Math.PI * 2); g.fill();
}

const BLOOD = "#5a0b10", BLOOD_CUT = "#8a1219";

/**
 * A sleepwalker that has been beaten: its body in pieces on the floor, as in a fight. A few short
 * stumps (two with torn red ends), a split ribcage, its head half sunk into the ground, a small
 * pool of blood.
 */
export function drawRemains(g: CanvasRenderingContext2D, x: number, y: number, T: number, hooded = false) {
  const X = (u: number) => x + u * T, Y = (v: number) => y + v * T;
  const foot = 0.36;
  g.lineCap = "round"; g.lineJoin = "round";
  pool(g, X(0), Y(foot - 0.02), T, 0.26, 0.07, BLOOD);
  g.strokeStyle = SLEEPWALKER_LOOK.ink; g.lineWidth = Math.max(2, 0.07 * T);
  const stump = (x1: number, y1: number, x2: number, y2: number, torn: boolean) => {
    g.beginPath(); g.moveTo(X(x1), Y(y1)); g.lineTo(X(x2), Y(y2)); g.stroke();
    if (torn) { g.fillStyle = BLOOD_CUT; g.beginPath(); g.ellipse(X(x2), Y(y2), 0.03 * T, 0.06 * T, 0.5, 0, Math.PI * 2); g.fill(); }
  };
  stump(0.1, foot - 0.04, 0.2, foot - 0.07, true);
  stump(0.28, foot - 0.01, 0.36, foot, false);
  stump(-0.3, foot - 0.03, -0.18, foot, true);
  stump(-0.08, foot + 0.02, 0.02, foot, false);
  // The ribcage, split open.
  g.beginPath(); g.moveTo(X(-0.14), Y(foot - 0.08)); g.lineTo(X(-0.02), Y(foot - 0.14)); g.lineTo(X(0.05), Y(foot - 0.09)); g.stroke();
  // The head, sunk half into the ground.
  g.fillStyle = SLEEPWALKER_LOOK.ink;
  g.beginPath(); g.arc(X(0.3), Y(foot - 0.08), 0.1 * T, Math.PI, 0); g.fill();
  // A patrol warden's: its pointed hood still on it, the point flopped along the ground.
  if (hooded) {
    g.fillStyle = "#6c6871";
    g.beginPath(); g.arc(X(0.3), Y(foot - 0.08), 0.12 * T, Math.PI, 0); g.fill();
    g.beginPath(); g.moveTo(X(0.22), Y(foot - 0.13)); g.lineTo(X(0.06), Y(foot - 0.075)); g.lineTo(X(0.2), Y(foot - 0.08)); g.closePath(); g.fill();
  }
  pool(g, X(0.3), Y(foot - 0.08), T, 0.12, 0.025, BLOOD);
}

/**
 * A waxed that has been beaten, as in a fight: sealed whole in wax, folded right down on its
 * knees, hunched over itself, hugging itself.
 */
export function drawDeadWaxed(g: CanvasRenderingContext2D, x: number, y: number, T: number) {
  const X = (u: number) => x + u * T, Y = (v: number) => y + v * T;
  const foot = 0.36, wax = WAXED_LOOK.wax!;
  g.lineCap = "round"; g.lineJoin = "round";
  g.fillStyle = COLORS.shadow;
  g.beginPath(); g.ellipse(X(0), Y(foot), 0.36 * T, 0.08 * T, 0, 0, Math.PI * 2); g.fill();
  // The bound legs behind it, the folded body over them, the head bowed to its knees.
  g.strokeStyle = wax; g.lineWidth = Math.max(3, 0.13 * T);
  g.beginPath(); g.moveTo(X(-0.05), Y(foot - 0.06)); g.lineTo(X(-0.34), Y(foot - 0.03)); g.stroke();
  g.fillStyle = wax;
  g.beginPath(); g.ellipse(X(0.03), Y(foot - 0.13), 0.22 * T, 0.14 * T, -0.15, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(X(0.2), Y(foot - 0.12), 0.1 * T, 0.09 * T, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 1; g.stroke();
  // The arms wrapped round itself.
  g.strokeStyle = WAXED_LOOK.ink; g.lineWidth = Math.max(2, 0.05 * T);
  g.beginPath(); g.moveTo(X(-0.1), Y(foot - 0.2)); g.quadraticCurveTo(X(0.08), Y(foot - 0.26), X(0.16), Y(foot - 0.12)); g.stroke();
}

/**
 * The Wax Blob on the map, seen from above: a round heap of wax two tiles across, three heads rising from it, and
 * three arms stretched out toward where it is trying to go (`aimX`, `aimY` a unit vector; `reach` 0 to 1, how far
 * out they are), stirring a little. When a wall stops it, the arms still reach for what it is after.
 */
export function drawBlobTop(g: CanvasRenderingContext2D, x: number, y: number, T: number, aimX: number, aimY: number, reach: number, t: number) {
  const wax = WAXED_LOOK.wax!, rim = "#6b5b25";
  const cx = x, cy = y + 0.36 * T, R = T; // its feet are 0.36 tiles below the point it is drawn from
  g.lineCap = "round"; g.lineJoin = "round";
  g.fillStyle = COLORS.shadow;
  g.beginPath(); g.ellipse(cx, cy + 0.08 * T, R * 1.04, R * 0.98, 0, 0, Math.PI * 2); g.fill();
  // The arms first, so the heap's edge covers their roots.
  const ang = Math.atan2(aimY, aimX);
  [-0.55, 0, 0.55].forEach((spread, i) => {
    const a = ang + spread * (1.15 - 0.55 * reach);
    const wave = Math.sin(t / 280 + i * 2.1) * 0.12;
    // (Short: half as long as a waxed's own arms, past the heap's edge.)
    const len = (0.04 + 0.08 * reach) * T;
    const sx = cx + Math.cos(a) * R * 0.6, sy = cy + Math.sin(a) * R * 0.6;
    const ex = cx + Math.cos(a + wave) * (R + len), ey = cy + Math.sin(a + wave) * (R + len);
    const bow = Math.sin(t / 340 + i * 1.7) * 0.18 * T;
    const mx = (sx + ex) / 2 + Math.cos(a + Math.PI / 2) * bow, my = (sy + ey) / 2 + Math.sin(a + Math.PI / 2) * bow;
    g.strokeStyle = rim; g.lineWidth = 0.22 * T;
    g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(mx, my, ex, ey); g.stroke();
    g.strokeStyle = wax; g.lineWidth = 0.16 * T;
    g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(mx, my, ex, ey); g.stroke();
  });
  // The heap: a circle, with its rim a little darker.
  g.fillStyle = wax; g.strokeStyle = rim; g.lineWidth = Math.max(2, 0.07 * T);
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill(); g.stroke();
  // The three heads, rising out of it.
  for (const [u, v] of [[0, -0.34], [-0.5, 0.26], [0.5, 0.26]]) {
    g.fillStyle = wax; g.strokeStyle = rim; g.lineWidth = Math.max(1.5, 0.05 * T);
    g.beginPath(); g.arc(cx + u * R, cy + v * R, 0.27 * R, 0, Math.PI * 2); g.fill(); g.stroke();
  }
}

/** A beaten Wax Blob, seen from above: the heap slumped flat, a ring of dark wax (the middle part stands for the whole). */
export function drawDeadBlob(g: CanvasRenderingContext2D, x: number, y: number, T: number) {
  const wax = WAXED_LOOK.wax!;
  // (The middle part lies a little right of the heap's centre.)
  const cx = x - 0.25 * T, cy = y + 0.36 * T + 0.08 * T;
  g.fillStyle = COLORS.shadow;
  g.beginPath(); g.ellipse(cx, cy + 0.06 * T, 0.98 * T, 0.9 * T, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#6b5b25";
  g.beginPath(); g.arc(cx, cy, 0.92 * T, 0, Math.PI * 2); g.fill();
  g.fillStyle = wax;
  g.beginPath(); g.arc(cx, cy, 0.8 * T, 0, Math.PI * 2); g.fill();
  g.fillStyle = "rgba(60,48,16,0.5)";
  for (const [u, v] of [[0, -0.3], [-0.45, 0.22], [0.45, 0.22]]) { g.beginPath(); g.arc(cx + u * T, cy + v * T, 0.17 * T, 0, Math.PI * 2); g.fill(); }
}

/** The Warden, beaten: his cloak lying in a low pyramid over a thick pool of wax. */
export function drawCloakRemains(g: CanvasRenderingContext2D, x: number, y: number, T: number) {
  const X = (u: number) => x + u * T, Y = (v: number) => y + v * T;
  const foot = 0.36, wax = WAXED_LOOK.wax!;
  g.lineJoin = "round";
  pool(g, X(0), Y(foot - 0.02), T, 0.46, 0.13, "#6b5b25");
  pool(g, X(0), Y(foot - 0.06), T, 0.46, 0.13, wax);
  g.fillStyle = "#6c6871"; g.strokeStyle = "#4f4b55"; g.lineWidth = 1;
  g.beginPath(); g.moveTo(X(-0.34), Y(foot - 0.05)); g.lineTo(X(0), Y(foot - 0.3)); g.lineTo(X(0.02), Y(foot + 0.02)); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = "#58545f";
  g.beginPath(); g.moveTo(X(0.02), Y(foot + 0.02)); g.lineTo(X(0), Y(foot - 0.3)); g.lineTo(X(0.36), Y(foot - 0.05)); g.closePath(); g.fill(); g.stroke();
}

/** The guide beaten: the navy cloak in a heap, the orb dim beside it. */
export function drawGuideRemains(g: CanvasRenderingContext2D, x: number, y: number, T: number) {
  const X = (u: number) => x + u * T, Y = (v: number) => y + v * T;
  const foot = 0.36;
  g.fillStyle = COLORS.shadow;
  g.beginPath(); g.ellipse(X(0), Y(foot), 0.34 * T, 0.08 * T, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = GUIDE_NAVY;
  g.beginPath(); g.moveTo(X(-0.3), Y(foot - 0.02)); g.quadraticCurveTo(X(-0.22), Y(foot - 0.26), X(0.02), Y(foot - 0.24)); g.quadraticCurveTo(X(0.26), Y(foot - 0.22), X(0.3), Y(foot - 0.02)); g.closePath(); g.fill();
  g.fillStyle = "rgba(240,238,226,0.5)";
  g.beginPath(); g.arc(X(0.38), Y(foot - 0.06), 0.06 * T, 0, Math.PI * 2); g.fill();
}

/** What lies where each kind of enemy fell. */
export const MAP_REMAINS: Record<KindId, (g: CanvasRenderingContext2D, x: number, y: number, T: number) => void> = {
  sleepwalker: drawRemains,
  patrolWarden: (g, x, y, T) => drawRemains(g, x, y, T, true),
  sleepwalkerHammer: drawRemains,
  waxed: drawDeadWaxed,
  waxedChisel: drawDeadWaxed,
  waxedHammer: drawDeadWaxed,
  blobLeft: () => {},
  blobMid: drawDeadBlob,
  blobRight: () => {},
  blobLeftHammer: () => {},
  blobRightHammer: () => {},
  warden: drawCloakRemains,
  guide: drawGuideRemains,
};

/**
 * Gear lying on the map floor: whatever it is, a small ball of yarn like the guide's orb, glowing
 * faintly. Eternal gear glows light blue instead, a light of its own that pulses slowly.
 */
export function drawPickup(g: CanvasRenderingContext2D, x: number, y: number, T: number, t: number, eternal = false) {
  const X = (u: number) => x + u * T, Y = (v: number) => y + v * T;
  const foot = 0.32, r = 0.055, cx = 0, cy = foot - r;
  const pulse = eternal ? 0.5 + 0.5 * Math.sin(t / 520) : 0.5 + 0.5 * Math.sin(t / 900);
  // Its light: warm and faint, or (eternal) light blue, wider and stronger, pulsing.
  const reach = (eternal ? 0.62 + 0.12 * pulse : 0.3) * T;
  const halo = g.createRadialGradient(X(cx), Y(cy), 0, X(cx), Y(cy), reach);
  halo.addColorStop(0, eternal ? `rgb(190 228 255 / ${0.5 + 0.3 * pulse})` : `rgb(255 250 235 / ${0.22 + 0.08 * pulse})`);
  halo.addColorStop(1, eternal ? "rgb(190 228 255 / 0)" : "rgb(255 250 235 / 0)");
  g.fillStyle = halo;
  g.beginPath(); g.arc(X(cx), Y(cy), reach, 0, Math.PI * 2); g.fill();
  // Its shadow, then the ball.
  g.fillStyle = COLORS.shadow;
  g.beginPath(); g.ellipse(X(cx), Y(foot), r * 1.3 * T, r * 0.45 * T, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = eternal ? "#eef8ff" : "#f2efe4";
  g.beginPath(); g.arc(X(cx), Y(cy), r * T, 0, Math.PI * 2); g.fill();
  // The yarn wound round it, every which way.
  g.save();
  g.beginPath(); g.arc(X(cx), Y(cy), r * T, 0, Math.PI * 2); g.clip();
  g.strokeStyle = eternal ? "#a9c9df" : "#c9c2aa"; g.lineWidth = Math.max(1, 0.008 * T);
  for (const k of [-0.5, -0.1, 0.3]) { g.beginPath(); g.ellipse(X(cx), Y(cy + k * r), r * T, r * 0.55 * T, 0, 0, Math.PI * 2); g.stroke(); }
  for (const k of [-0.4, 0.4]) { g.beginPath(); g.ellipse(X(cx + k * r), Y(cy), r * 0.5 * T, r * T, 0, 0, Math.PI * 2); g.stroke(); }
  g.restore();
}

const GUIDE_NAVY = "#1d2a4f";

/**
 * The guide as the map shows it, like its model in a fight: a short navy cloak that is also a pointed
 * hat (its tip as high as a player's head), a dark hollow for a face, a white orb of yarn hanging on
 * black string that crosses in front of it, bare feet under the hem. `glow` (0..1): how brightly the
 * orb shines; it burns bright by the place where you last rested.
 */
function drawGuideBody(g: CanvasRenderingContext2D, x: number, y: number, T: number, glow: number, t: number) {
  const X = (u: number) => x + u * T, Y = (v: number) => y + v * T;
  const hem = 0.36, tip = -0.5, half = 0.21;
  // The shadow, and the bare feet barely out from under the hem.
  g.fillStyle = COLORS.shadow;
  g.beginPath(); g.ellipse(X(0), Y(hem + 0.01), 0.25 * T, 0.08 * T, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#e5cdb8";
  g.beginPath(); g.ellipse(X(-0.065), Y(hem + 0.025), 0.035 * T, 0.022 * T, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(X(0.07), Y(hem + 0.03), 0.035 * T, 0.022 * T, 0, 0, Math.PI * 2); g.fill();
  // The cloak: straight sides from the hem to the tip of the hat, which curls a little.
  g.fillStyle = GUIDE_NAVY;
  g.strokeStyle = "#111a33"; g.lineWidth = Math.max(1, 0.02 * T); g.lineJoin = "round";
  g.beginPath();
  g.moveTo(X(-half), Y(hem));
  g.lineTo(X(-0.082), Y(-0.28)); g.quadraticCurveTo(X(-0.05), Y(-0.42), X(-0.03), Y(tip));
  g.quadraticCurveTo(X(0.045), Y(-0.42), X(0.082), Y(-0.28));
  g.lineTo(X(half), Y(hem));
  g.quadraticCurveTo(X(0), Y(hem + 0.05), X(-half), Y(hem));
  g.closePath(); g.fill(); g.stroke();
  // Folds running up from the hem.
  g.strokeStyle = "#131d3a"; g.lineWidth = Math.max(1, 0.015 * T); g.lineCap = "round";
  for (const [a, b] of [[-0.09, -0.05], [0.01, 0.01], [0.1, 0.06]]) { g.beginPath(); g.moveTo(X(a), Y(hem - 0.01)); g.lineTo(X(b), Y(0.02)); g.stroke(); }
  // The face opening: a hollow.
  g.fillStyle = "#03050c";
  g.beginPath(); g.ellipse(X(0), Y(-0.15), 0.05 * T, 0.068 * T, 0, 0, Math.PI * 2); g.fill();
  // The orb, hanging from the opening on its string.
  const ox = 0, oy = 0.07, r = 0.078;
  const pulse = glow * (0.85 + Math.sin(t / 420) * 0.15);
  if (glow > 0) {
    const halo = g.createRadialGradient(X(ox), Y(oy), 0, X(ox), Y(oy), 0.5 * T);
    halo.addColorStop(0, `rgb(255 255 245 / ${0.45 * pulse})`);
    halo.addColorStop(1, "rgb(255 255 245 / 0)");
    g.fillStyle = halo;
    g.beginPath(); g.arc(X(ox), Y(oy), 0.5 * T, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = "#07070b"; g.lineWidth = Math.max(1, 0.014 * T);
  const wrap = (tilt: number, front: boolean) => {
    g.beginPath();
    g.ellipse(X(ox), Y(oy), (r + 0.004) * T, r * 0.3 * T, tilt, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
    g.stroke();
  };
  // The string from the opening to the orb's top, and the far halves of its two turns, behind the yarn.
  g.beginPath(); g.moveTo(X(-0.016), Y(-0.1)); g.lineTo(X(-0.045), Y(oy - r * 0.8)); g.moveTo(X(0.016), Y(-0.1)); g.lineTo(X(0.045), Y(oy - r * 0.8)); g.stroke();
  wrap(0.49, false); wrap(-0.49, false);
  g.fillStyle = glow > 0 ? "#f7f5ee" : "#cfcbbd";
  g.beginPath(); g.arc(X(ox), Y(oy), r * T, 0, Math.PI * 2); g.fill();
  // The yarn: loops wound round it.
  g.save();
  g.beginPath(); g.arc(X(ox), Y(oy), r * T, 0, Math.PI * 2); g.clip();
  g.strokeStyle = "#cfc9b4"; g.lineWidth = Math.max(1, 0.008 * T);
  for (const k of [-0.5, -0.1, 0.3]) { g.beginPath(); g.ellipse(X(ox), Y(oy + k * r), r * T, r * 0.55 * T, 0, 0, Math.PI * 2); g.stroke(); }
  for (const k of [-0.4, 0.4]) { g.beginPath(); g.ellipse(X(ox + k * r), Y(oy), r * 0.5 * T, r * T, 0, 0, Math.PI * 2); g.stroke(); }
  g.restore();
  // The near halves cross in front of it, in an X.
  g.strokeStyle = "#07070b"; g.lineWidth = Math.max(1, 0.014 * T);
  wrap(0.49, true); wrap(-0.49, true);
}

/** The guide as an enemy on the map (the lesson is not fought on the map; this is for the fight's map presence if it ever is). */
function drawGuideMap(g: CanvasRenderingContext2D, x: number, y: number, T: number) {
  drawGuideBody(g, x, y, T, 1, performance.now());
}

/** How each kind of enemy is drawn on the map. */
export const MAP_FIGURES: Record<KindId, (g: CanvasRenderingContext2D, x: number, y: number, T: number, facing: Dir, frame: Frame) => void> = {
  sleepwalker: (g, x, y, T, facing, frame) => drawWalker(g, x, y, T, facing, frame, true, 0, SLEEPWALKER_LOOK),
  // (The eternal ones look the same on the map for now.)
  patrolWarden: (g, x, y, T, facing, frame) => drawWalker(g, x, y, T, facing, frame, true, 0, PATROL_LOOK),
  sleepwalkerHammer: (g, x, y, T, facing, frame) => drawWalker(g, x, y, T, facing, frame, true, 0, SLEEPWALKER_LOOK),
  waxed: (g, x, y, T, facing, frame) => drawWalker(g, x, y, T, facing, frame, true, 0, WAXED_LOOK),
  // (The armed ones look the same on the map for now.)
  waxedChisel: (g, x, y, T, facing, frame) => drawWalker(g, x, y, T, facing, frame, true, 0, WAXED_LOOK),
  waxedHammer: (g, x, y, T, facing, frame) => drawWalker(g, x, y, T, facing, frame, true, 0, WAXED_LOOK),
  blobLeft: () => {},
  blobMid: (g, x, y, T) => drawBlobTop(g, x, y, T, 0, 1, 0.2, performance.now()),
  blobRight: () => {},
  blobLeftHammer: () => {},
  blobRightHammer: () => {},
  warden: (g, x, y, T, facing) => drawWardenMap(g, x, y, T, facing),
  guide: (g, x, y, T) => drawGuideMap(g, x, y, T),
};
