/**
 * explore.tsx — the exploration demo: a top-down dungeon you walk around with WASD or the arrows.
 *
 * Classic grid movement: one tile per step, sliding smoothly between tiles. Hold a direction to
 * keep walking; the most recently pressed direction wins. Escape pauses.
 *
 * The map is authored as floor only ('.' floor, '@' start, '#' a pillar, anything else void).
 * Walls grow on their own around every floor tile, so rooms and corridors are always closed.
 * Everything is drawn on one canvas: the map is painted once to an offscreen canvas, then each
 * frame copies it under the camera and draws the walker on top.
 */

import { useEffect, useRef, useState } from "react";

/* ============================================================
 * Map
 * ============================================================ */

const FLOOR_PLAN = [
  "  ........                                   ",
  "  ........        ...........                ",
  "  ..@.....        ...........                ",
  "  ........................... .              ",
  "  ........        ...........        .......",
  "  ........        ....#...#..        .......",
  "     .            ...........        .......",
  "     .                 .             .......",
  "     .                 .                .   ",
  "     .                 .                .   ",
  " ..........      ...............        .   ",
  " ..........      ...............        .   ",
  " ...#..#...      ...#.......#...............",
  " ..........      ...............           .",
  " ..........      ...............           .",
  "      .                 .                ....",
  "      ...................                ....",
  "                                         ....",
];

const VOID = 0, FLOOR = 1, WALL = 2;

interface TileMap { w: number; h: number; tiles: Uint8Array; start: { x: number; y: number } }

function buildMap(plan: string[]): TileMap {
  // One tile of margin all round, so the walls that grow around the edge fit.
  const w = Math.max(...plan.map(r => r.length)) + 2;
  const h = plan.length + 2;
  const tiles = new Uint8Array(w * h);
  let start = { x: 1, y: 1 };
  plan.forEach((row, y) => [...row].forEach((c, x) => {
    const i = (y + 1) * w + x + 1;
    if (c === "." || c === "@") tiles[i] = FLOOR;
    if (c === "#") tiles[i] = WALL;
    if (c === "@") start = { x: x + 1, y: y + 1 };
  }));
  // Any void touching a floor tile (diagonals too) becomes wall.
  const grown = tiles.slice();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (tiles[y * w + x] !== VOID) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && tiles[ny * w + nx] === FLOOR) grown[y * w + x] = WALL;
    }
  }
  return { w, h, tiles: grown, start };
}

const MAP = buildMap(FLOOR_PLAN);
const tileAt = (x: number, y: number) =>
  x < 0 || y < 0 || x >= MAP.w || y >= MAP.h ? VOID : MAP.tiles[y * MAP.w + x];

/* ============================================================
 * Look
 * ============================================================ */

const COLORS = {
  void: "#000000",
  wallTop: "#232327",
  wallFace: "#2c2c31",
  wallEdge: "#36363c",
  floor: "#3e3e45",
  floorGrout: "#38383e",
  ink: "#ece9f4",
  eye: "#15141b",
  shadow: "rgb(0 0 0 / 0.35)",
};

/** How many tiles fit the screen's height (the width follows the window's shape). */
const TILES_TALL = 11;
/** How long one step takes, in milliseconds. */
const STEP_MS = 210;

type Dir = "up" | "down" | "left" | "right";
const DELTA: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

function readDir(key: string): Dir | null {
  switch (key.toLowerCase()) {
    case "w": case "arrowup": return "up";
    case "s": case "arrowdown": return "down";
    case "a": case "arrowleft": return "left";
    case "d": case "arrowright": return "right";
    default: return null;
  }
}

/** Paints the whole map once, at `T` device pixels per tile. */
function paintMap(T: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = MAP.w * T;
  c.height = MAP.h * T;
  const g = c.getContext("2d")!;
  g.fillStyle = COLORS.void;
  g.fillRect(0, 0, c.width, c.height);
  const grout = Math.max(1, Math.round(T / 24));
  for (let y = 0; y < MAP.h; y++) for (let x = 0; x < MAP.w; x++) {
    const t = tileAt(x, y), px = x * T, py = y * T;
    if (t === FLOOR) {
      g.fillStyle = COLORS.floorGrout;
      g.fillRect(px, py, T, T);
      g.fillStyle = COLORS.floor;
      g.fillRect(px + grout, py + grout, T - grout, T - grout);
    } else if (t === WALL) {
      g.fillStyle = COLORS.wallTop;
      g.fillRect(px, py, T, T);
      // A wall with floor in front of it (below, in this view) shows its face.
      if (tileAt(x, y + 1) === FLOOR) {
        const face = Math.round(T * 0.55);
        g.fillStyle = COLORS.wallFace;
        g.fillRect(px, py + T - face, T, face);
        g.fillStyle = COLORS.wallEdge;
        g.fillRect(px, py + T - face, T, grout);
      }
    }
  }
  return c;
}

type Frame = "stand" | "stepL" | "stepR";

/** A little stick figure seen from above and in front, centered on (x, y), `T` pixels per tile. */
function drawWalker(g: CanvasRenderingContext2D, x: number, y: number, T: number, facing: Dir, frame: Frame) {
  const X = (u: number) => x + u * T;
  const Y = (v: number) => y + v * T;
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    g.beginPath(); g.moveTo(X(x1), Y(y1)); g.lineTo(X(x2), Y(y2)); g.stroke();
  };
  const step = frame === "stepL" ? -1 : frame === "stepR" ? 1 : 0;
  const bob = step ? -0.025 : 0;
  const foot = 0.36, hip = 0.08 + bob, neck = -0.2 + bob, shoulder = neck + 0.05, headY = -0.36 + bob, r = 0.15;

  // Shadow
  g.fillStyle = COLORS.shadow;
  g.beginPath(); g.ellipse(X(0), Y(foot + 0.01), 0.2 * T, 0.07 * T, 0, 0, Math.PI * 2); g.fill();

  g.strokeStyle = COLORS.ink;
  g.lineWidth = Math.max(2, 0.075 * T);
  g.lineCap = "round";
  g.lineJoin = "round";

  if (facing === "up" || facing === "down") {
    // Legs: the stepping foot lifts; the arm on the other side swings.
    const lift = (side: number) => (step === side ? -0.08 : 0);
    line(-0.04, hip, -0.08, foot + lift(-1));
    line(0.04, hip, 0.08, foot + lift(1));
    line(0, neck, 0, hip);
    const swing = (side: number) => (step === -side ? (facing === "down" ? 0.05 : -0.05) : step === side ? (facing === "down" ? -0.03 : 0.03) : 0);
    line(-0.02, shoulder, -0.16, 0.02 + swing(-1));
    line(0.02, shoulder, 0.16, 0.02 + swing(1));
  } else {
    const m = facing === "right" ? 1 : -1;
    // Legs scissor, arms swing against them.
    const reach = step ? 0.12 : 0.045;
    line(0, hip, m * reach, foot);
    line(0, hip, -m * reach, foot + (step ? -0.02 : 0));
    line(0, neck, 0, hip);
    const arm = step ? 0.1 : 0.045;
    line(0, shoulder, -m * arm, 0.03);
    line(0, shoulder, m * arm, 0.03);
  }

  g.fillStyle = COLORS.ink;
  g.beginPath(); g.arc(X(0), Y(headY), r * T, 0, Math.PI * 2); g.fill();

  // Eyes give away which way the head faces; from behind there are none.
  g.fillStyle = COLORS.eye;
  const eye = (u: number, v: number) => { g.beginPath(); g.arc(X(u), Y(v), Math.max(1, 0.022 * T), 0, Math.PI * 2); g.fill(); };
  if (facing === "down") { eye(-0.05, headY + 0.01); eye(0.05, headY + 0.01); }
  if (facing === "left") eye(-0.08, headY);
  if (facing === "right") eye(0.08, headY);
}

/* ============================================================
 * Screen
 * ============================================================ */

interface Walker {
  /** The tile you stand on, or are walking onto. */
  x: number; y: number;
  /** The tile you're walking from. */
  fromX: number; fromY: number;
  /** Progress of the current step, 0..1 (1 = standing still). */
  t: number;
  facing: Dir;
  steps: number;
}

export function Exploration({ onExit }: { onExit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [paused, setPaused] = useState(false);
  const [pauseIndex, setPauseIndex] = useState(0);
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const held = useRef<Dir[]>([]);

  const pauseOptions = [
    { label: "Resume", run: () => setPaused(false) },
    { label: "Main menu", run: onExit },
  ];
  const keyHandler = useRef<(e: KeyboardEvent, down: boolean) => void>(() => {});
  keyHandler.current = (e, down) => {
    const dir = readDir(e.key);
    if (!down) {
      if (dir) held.current = held.current.filter(d => d !== dir);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === "escape") {
      e.preventDefault();
      if (!e.repeat) { held.current = []; setPauseIndex(0); setPaused(p => !p); }
      return;
    }
    if (paused) {
      if (e.repeat) return;
      if (dir === "up" || dir === "down") {
        e.preventDefault();
        setPauseIndex(i => (i + (dir === "up" ? -1 : 1) + pauseOptions.length) % pauseOptions.length);
      } else if (key === "e" || key === "enter" || key === " ") {
        e.preventDefault();
        pauseOptions[pauseIndex].run();
      } else if (key === "q") {
        e.preventDefault();
        setPaused(false);
      }
      return;
    }
    if (dir) {
      e.preventDefault();
      if (!e.repeat) held.current = [...held.current.filter(d => d !== dir), dir];
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
    const me: Walker = { x: MAP.start.x, y: MAP.start.y, fromX: MAP.start.x, fromY: MAP.start.y, t: 1, facing: "down", steps: 0 };
    let T = 0;
    let mapImage: HTMLCanvasElement | null = null;

    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      const next = Math.max(8, Math.round(Math.min(canvas.height / TILES_TALL, canvas.width / 13)));
      if (next !== T) { T = next; mapImage = paintMap(T); }
    };
    fit();
    window.addEventListener("resize", fit);

    /** Starts a step in the most recently held direction, if any. Returns whether you set off. */
    const setOff = () => {
      const dir = held.current[held.current.length - 1];
      if (!dir) return false;
      me.facing = dir;
      const [dx, dy] = DELTA[dir];
      if (tileAt(me.x + dx, me.y + dy) !== FLOOR) return false;
      me.fromX = me.x; me.fromY = me.y;
      me.x += dx; me.y += dy;
      me.steps++;
      return true;
    };

    const update = (dt: number) => {
      if (me.t < 1) {
        me.t += dt / STEP_MS;
        if (me.t < 1) return;
        // Step done: carry straight on into the next one without a hitch, if a direction is held.
        const spill = me.t - 1;
        me.t = 1;
        if (setOff()) me.t = Math.min(spill, 0.99);
      } else if (setOff()) {
        me.t = 0;
      }
    };

    const draw = () => {
      const W = canvas.width, H = canvas.height;
      g.fillStyle = COLORS.void;
      g.fillRect(0, 0, W, H);
      const px = me.fromX + (me.x - me.fromX) * me.t;
      const py = me.fromY + (me.y - me.fromY) * me.t;
      // The camera keeps you in the middle of the screen.
      const ox = Math.round(W / 2 - (px + 0.5) * T);
      const oy = Math.round(H / 2 - (py + 0.5) * T);
      if (mapImage) g.drawImage(mapImage, ox, oy);
      // First half of each step lifts a foot (alternating feet), second half lands.
      const frame: Frame = me.t < 0.5 ? (me.steps % 2 ? "stepL" : "stepR") : "stand";
      drawWalker(g, ox + (px + 0.5) * T, oy + (py + 0.5) * T, T, me.facing, frame);
    };

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(now - last, 100);
      last = now;
      if (!pausedRef.current) update(dt);
      draw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", fit); };
  }, []);

  return (
    <div className="explore">
      <canvas ref={canvasRef} className="explore-canvas" />
      {paused && (
        <div className="result" role="dialog" aria-label="Paused">
          <nav className="pause-menu">
            {pauseOptions.map((o, i) => (
              <button
                key={o.label}
                className={`menu-button ${i === pauseIndex ? "is-focused" : ""}`}
                onMouseEnter={() => setPauseIndex(i)}
                onClick={o.run}
              >
                {o.label}
              </button>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}