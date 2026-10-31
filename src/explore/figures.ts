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
}

const PLAYER_LOOK: Look = { ink: COLORS.ink, eye: COLORS.eye };

/** You on the map, wearing what you have equipped. */
export const playerLook = (gear: { weapon: WeaponTier; armor: ArmorTier }): Look => ({ ...PLAYER_LOOK, ...gear });

/** Gear colors, the same as in a fight (index.css: --metal, --grip, --armor). */
const METAL = "#b9bccb", GRIP = "#8a6b4a", ARMOR_INK = "#6f7489";

/** How wide the plate over the torso is, in tiles (wider is heavier). */
const PLATE_WIDTH: Record<ArmorTier, number> = { none: 0, light: 0.11, normal: 0.13, heavy: 0.15 };

export const SLEEPWALKER_LOOK: Look = { ink: "#aaa5b8", eye: null, reach: true };

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
    if (tier === "light") { // dagger
      seg(GRIP, 0.035, at(-0.03), at(0.02));
      seg(METAL, 0.025, at(0.02, -0.035), at(0.02, 0.035));
      fill(METAL, [at(0.02, -0.02), at(0.15), at(0.02, 0.02)]);
    } else if (tier === "normal") { // sword
      seg(GRIP, 0.035, at(-0.04), at(0.03));
      seg(METAL, 0.03, at(0.03, -0.055), at(0.03, 0.055));
      fill(METAL, [at(0.03, -0.022), at(0.29, -0.016), at(0.33), at(0.29, 0.016), at(0.03, 0.022)]);
    } else { // maul, its head near the floor
      seg(GRIP, 0.04, at(-0.06), at(0.3));
      fill(METAL, [at(0.27, -0.08), at(0.38, -0.08), at(0.38, 0.08), at(0.27, 0.08)]);
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
 * A hooded keeper on the map: a tall robe and a deep hood, a small candle held before it. The
 * candle burns where you last rested.
 */
export function drawKeeper(g: CanvasRenderingContext2D, x: number, y: number, T: number, lit: boolean, t: number) {
  const X = (u: number) => x + u * T, Y = (v: number) => y + v * T;
  g.fillStyle = COLORS.shadow;
  g.beginPath(); g.ellipse(X(0), Y(0.37), 0.24 * T, 0.08 * T, 0, 0, Math.PI * 2); g.fill();
  // The robe, flaring to the floor.
  g.fillStyle = "#4b4656";
  g.beginPath();
  g.moveTo(X(-0.11), Y(-0.22)); g.lineTo(X(0.11), Y(-0.22));
  g.lineTo(X(0.2), Y(0.36)); g.lineTo(X(-0.2), Y(0.36)); g.closePath(); g.fill();
  g.fillStyle = "#3d3946";
  g.fillRect(X(-0.012), Y(-0.05), Math.max(1, 0.024 * T), 0.4 * T);
  // The hood, peaked, its opening dark.
  g.fillStyle = "#544e60";
  g.beginPath();
  g.moveTo(X(0), Y(-0.6)); g.quadraticCurveTo(X(0.19), Y(-0.38), X(0.15), Y(-0.17));
  g.lineTo(X(-0.15), Y(-0.17)); g.quadraticCurveTo(X(-0.19), Y(-0.38), X(0), Y(-0.6)); g.fill();
  g.fillStyle = "#121117";
  g.beginPath(); g.ellipse(X(0), Y(-0.32), 0.075 * T, 0.1 * T, 0, 0, Math.PI * 2); g.fill();
  // Hands together before it, a candle in them.
  g.fillStyle = "#c9c2b0";
  g.fillRect(X(-0.018), Y(-0.08), Math.max(2, 0.036 * T), 0.09 * T);
  if (!lit) return;
  const flick = 1 + Math.sin(t / 90) * 0.08 + Math.sin(t / 37) * 0.05;
  const glow = g.createRadialGradient(X(0), Y(-0.12), 0, X(0), Y(-0.12), 0.45 * T);
  glow.addColorStop(0, "rgb(255 190 110 / 0.35)");
  glow.addColorStop(1, "rgb(255 190 110 / 0)");
  g.fillStyle = glow;
  g.beginPath(); g.arc(X(0), Y(-0.12), 0.45 * T, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#f2b45c";
  g.beginPath(); g.ellipse(X(0), Y(-0.13), 0.022 * T, 0.045 * T * flick, 0, 0, Math.PI * 2); g.fill();
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
export function drawRemains(g: CanvasRenderingContext2D, x: number, y: number, T: number) {
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
  waxed: drawDeadWaxed,
  warden: drawCloakRemains,
  guide: drawGuideRemains,
};

/**
 * A broken sword lying on the floor: a hilt and a stub of blade, the snapped tip a little way
 * off, and a small glint that comes and goes so it catches the eye.
 */
export function drawBrokenSword(g: CanvasRenderingContext2D, x: number, y: number, T: number, t: number) {
  const X = (u: number) => x + u * T, Y = (v: number) => y + v * T;
  const foot = 0.32;
  g.lineCap = "round"; g.lineJoin = "round";
  g.fillStyle = COLORS.shadow;
  g.beginPath(); g.ellipse(X(0), Y(foot), 0.3 * T, 0.06 * T, 0, 0, Math.PI * 2); g.fill();
  // The hilt and the stub of the blade, slanting across the floor.
  const line = (x1: number, y1: number, x2: number, y2: number, color: string, w: number) => {
    g.strokeStyle = color; g.lineWidth = Math.max(2, w * T);
    g.beginPath(); g.moveTo(X(x1), Y(y1)); g.lineTo(X(x2), Y(y2)); g.stroke();
  };
  line(-0.22, foot - 0.02, -0.28, foot - 0.07, "#6d5a3c", 0.07);
  line(-0.2, foot - 0.04, 0.08, foot - 0.1, "#b9b6c6", 0.06);
  line(-0.12, foot - 0.12, -0.08, foot + 0.02, "#8d7a54", 0.05);
  // The snapped tip.
  g.fillStyle = "#b9b6c6";
  g.beginPath(); g.moveTo(X(0.17), Y(foot - 0.12)); g.lineTo(X(0.34), Y(foot - 0.06)); g.lineTo(X(0.18), Y(foot - 0.04)); g.closePath(); g.fill();
  // A glint.
  const glint = 0.5 + 0.5 * Math.sin(t / 380);
  g.strokeStyle = `rgb(255 244 210 / ${0.15 + 0.6 * glint})`; g.lineWidth = Math.max(1, 0.02 * T);
  const gx = X(0.0), gy = Y(foot - 0.13), r = (0.03 + 0.05 * glint) * T;
  g.beginPath(); g.moveTo(gx - r, gy); g.lineTo(gx + r, gy); g.moveTo(gx, gy - r); g.lineTo(gx, gy + r); g.stroke();
}

/** A whole sword lying on the floor, a glint on its blade. */
function drawSword(g: CanvasRenderingContext2D, x: number, y: number, T: number, t: number) {
  const X = (u: number) => x + u * T, Y = (v: number) => y + v * T;
  const foot = 0.32;
  g.lineCap = "round"; g.lineJoin = "round";
  g.fillStyle = COLORS.shadow;
  g.beginPath(); g.ellipse(X(0), Y(foot), 0.34 * T, 0.06 * T, 0, 0, Math.PI * 2); g.fill();
  const line = (x1: number, y1: number, x2: number, y2: number, color: string, w: number) => {
    g.strokeStyle = color; g.lineWidth = Math.max(2, w * T);
    g.beginPath(); g.moveTo(X(x1), Y(y1)); g.lineTo(X(x2), Y(y2)); g.stroke();
  };
  line(-0.26, foot - 0.02, -0.32, foot - 0.06, "#6d5a3c", 0.07);
  line(-0.2, foot - 0.03, 0.34, foot - 0.12, "#cfcde0", 0.06);
  line(-0.2, foot - 0.12, -0.16, foot + 0.04, "#8d7a54", 0.05);
  glint(g, X(0.1), Y(foot - 0.16), T, t);
}

/** A breastplate lying on the floor, a glint on its shoulder. */
function drawArmorPiece(g: CanvasRenderingContext2D, x: number, y: number, T: number, t: number) {
  const X = (u: number) => x + u * T, Y = (v: number) => y + v * T;
  const foot = 0.32;
  g.fillStyle = COLORS.shadow;
  g.beginPath(); g.ellipse(X(0), Y(foot), 0.3 * T, 0.06 * T, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#8f8da1";
  g.beginPath();
  g.moveTo(X(-0.22), Y(foot - 0.22)); g.lineTo(X(0.22), Y(foot - 0.22));
  g.lineTo(X(0.16), Y(foot - 0.02)); g.lineTo(X(-0.16), Y(foot - 0.02)); g.closePath(); g.fill();
  g.strokeStyle = "#5c5a6c"; g.lineWidth = Math.max(1, 0.03 * T); g.stroke();
  g.fillStyle = "#6a6879";
  g.beginPath(); g.ellipse(X(0), Y(foot - 0.22), 0.08 * T, 0.04 * T, 0, 0, Math.PI * 2); g.fill();
  glint(g, X(-0.12), Y(foot - 0.18), T, t);
}

/** A small star of light that comes and goes, so a thing on the floor catches the eye. */
function glint(g: CanvasRenderingContext2D, gx: number, gy: number, T: number, t: number) {
  const pulse = 0.5 + 0.5 * Math.sin(t / 380);
  g.strokeStyle = `rgb(255 244 210 / ${0.15 + 0.6 * pulse})`; g.lineWidth = Math.max(1, 0.02 * T);
  const r = (0.03 + 0.05 * pulse) * T;
  g.beginPath(); g.moveTo(gx - r, gy); g.lineTo(gx + r, gy); g.moveTo(gx, gy - r); g.lineTo(gx, gy + r); g.stroke();
}

/** Gear lying on the map floor, by its look. */
export function drawPickup(g: CanvasRenderingContext2D, x: number, y: number, T: number, t: number, look: "broken-sword" | "sword" | "armor") {
  if (look === "broken-sword") drawBrokenSword(g, x, y, T, t);
  else if (look === "sword") drawSword(g, x, y, T, t);
  else drawArmorPiece(g, x, y, T, t);
}

const GUIDE_NAVY = "#1d2a4f";

/**
 * The guide on the map: a short pointed navy cloak, tall hat and all, a glowing orb hanging in
 * front of it, a bare foot under the hem. (Not yet placed on the map.)
 */
function drawGuideMap(g: CanvasRenderingContext2D, x: number, y: number, T: number) {
  const X = (u: number) => x + u * T, Y = (v: number) => y + v * T;
  const foot = 0.36;
  g.fillStyle = COLORS.shadow;
  g.beginPath(); g.ellipse(X(0), Y(foot), 0.22 * T, 0.07 * T, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = GUIDE_NAVY;
  g.beginPath(); g.moveTo(X(-0.2), Y(foot - 0.02)); g.quadraticCurveTo(X(-0.12), Y(foot - 0.3), X(-0.04), Y(-0.4)); g.quadraticCurveTo(X(0.08), Y(foot - 0.3), X(0.2), Y(foot - 0.02)); g.closePath(); g.fill();
  const glow = g.createRadialGradient(X(0.02), Y(0.04), 0, X(0.02), Y(0.04), 0.3 * T);
  glow.addColorStop(0, "rgb(255 255 245 / 0.55)");
  glow.addColorStop(1, "rgb(255 255 245 / 0)");
  g.fillStyle = glow;
  g.beginPath(); g.arc(X(0.02), Y(0.04), 0.3 * T, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#f7f5ee";
  g.beginPath(); g.arc(X(0.02), Y(0.04), 0.075 * T, 0, Math.PI * 2); g.fill();
}

/** How each kind of enemy is drawn on the map. */
export const MAP_FIGURES: Record<KindId, (g: CanvasRenderingContext2D, x: number, y: number, T: number, facing: Dir, frame: Frame) => void> = {
  sleepwalker: (g, x, y, T, facing, frame) => drawWalker(g, x, y, T, facing, frame, true, 0, SLEEPWALKER_LOOK),
  waxed: (g, x, y, T, facing, frame) => drawWalker(g, x, y, T, facing, frame, true, 0, WAXED_LOOK),
  warden: (g, x, y, T, facing) => drawWardenMap(g, x, y, T, facing),
  guide: (g, x, y, T) => drawGuideMap(g, x, y, T),
};
