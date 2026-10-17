/**
 * figures.ts — the map's figures: you, the enemies and the hooded keepers.
 */
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
}

const PLAYER_LOOK: Look = { ink: COLORS.ink, eye: COLORS.eye };

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

  if (facing === "up" || facing === "down") {
    // Legs: the stepping foot lifts; the arm on the other side swings.
    const lift = (side: number) => (step === side ? -0.08 : 0);
    leg(-0.04, hip, -0.08, foot + lift(-1));
    leg(0.04, hip, 0.08, foot + lift(1));
    line(0, neck, 0, hip);
    if (look.reach) {
      // Arms held out ahead: toward you when facing down, away when facing up.
      const out = facing === "down" ? 0.17 : -0.12;
      line(-0.03, shoulder, -0.07, shoulder + out);
      line(0.03, shoulder, 0.07, shoulder + out);
    } else {
      const swing = (side: number) => (step === -side ? (facing === "down" ? 0.05 : -0.05) : step === side ? (facing === "down" ? -0.03 : 0.03) : 0);
      line(-0.02, shoulder, -0.16, 0.02 + swing(-1));
      line(0.02, shoulder, 0.16, 0.02 + swing(1));
    }
  } else {
    const m = facing === "right" ? 1 : -1;
    // Legs scissor, arms swing against them.
    const reach = step ? 0.12 : 0.045;
    leg(0, hip, m * reach, foot);
    leg(0, hip, -m * reach, foot + (step ? -0.02 : 0));
    line(0, neck, 0, hip);
    if (look.reach) {
      line(0, shoulder, m * 0.24, shoulder + 0.02);
      line(0, shoulder + 0.02, m * 0.21, shoulder + 0.06);
    } else {
      const arm = step ? 0.1 : 0.045;
      line(0, shoulder, -m * arm, 0.03);
      line(0, shoulder, m * arm, 0.03);
    }
  }

  g.fillStyle = look.ink;
  g.beginPath(); g.arc(X(0), Y(headY), r * T, 0, Math.PI * 2); g.fill();

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
