/**
 * lostString.ts — the String you lost, as it shows on whoever holds it (an enemy on the map or in a fight, or the pile on the floor): a single
 * string that now and then slips out, very slowly spins once round its holder and is gone. Not a constant effect.
 */
import { strokeSmooth } from "./smoothTrail";

/** How often the lost String's string shows itself (ms), and how long its one spin round takes: slow, and only now and then. */
const LOST_EVERY = 16000, LOST_SPIN = 6500;

/**
 * The String you lost, as a single string: now and then (not all the time) it slips out from behind whatever holds it, very slowly spins once
 * round it, and is gone, like the String that flies from a fallen enemy. It goes round an ellipse of radii (`rx`, `ry`) centred on (`x`, `y`),
 * sinking `drift` over the spin. Drawn in two goes so it passes behind and in front: the `back` half before the holder is drawn, the `front` half
 * after. `seed` (0 to 1) puts each holder on a clock of its own.
 */
export function drawLostString(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, drift: number, width: number, t: number, layer: "back" | "front", seed: number) {
  const since = ((((t + seed * LOST_EVERY) % LOST_EVERY) + LOST_EVERY) % LOST_EVERY);
  if (since > LOST_SPIN) return;
  const u = since / LOST_SPIN;
  // Eased round: it starts slowly, behind, and ends the same way (the head goes round once, from the back, past one side, the front, the other, to the back).
  const e = u * u * (3 - 2 * u);
  const head = Math.PI + e * Math.PI * 2, tail = 0.9 * Math.PI;
  // Fades in as it slips out and out as it goes back behind.
  const alpha = Math.min(1, u / 0.15, (1 - u) / 0.2);
  const at = (a: number) => {
    const k = (a - Math.PI) / (Math.PI * 2);
    return [x + Math.sin(a) * rx, y - drift / 2 + k * drift + Math.cos(a) * ry, Math.cos(a)] as const;
  };
  g.save();
  g.lineCap = "round";
  g.lineJoin = "round";
  g.shadowColor = `rgba(255, 255, 255, ${0.7 * alpha})`;
  g.shadowBlur = 5;
  const STEPS = 48;
  const from = Math.max(Math.PI, head - tail);
  const pts = Array.from({ length: STEPS + 1 }, (_, i) => at(from + ((head - from) * i) / STEPS));
  // The side of the holder each bit passes: the lower half of the ellipse is the near one.
  strokeSmooth(
    g,
    pts.map(([x, y]) => ({ x, y })),
    k => ({ color: `rgba(255, 255, 255, ${(0.12 + 0.8 * k) * alpha})`, width: width * (0.4 + 0.9 * k) }),
    i => (pts[i][2] + pts[i - 1][2] > 0) === (layer === "front"),
  );
  g.restore();
}
