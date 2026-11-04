/**
 * MapViewer.tsx — the exploration map as the game draws it, with a free camera and no light
 * radius. It draws through the same renderer as the exploration screen (`explore/render.ts`),
 * so what you see is what you'd see standing there: floors above cover the ones below, ledges
 * drop away, stairs climb.
 *
 * WASD (or the arrows) move the camera over the grid. Q goes one level down, E one level up: the
 * camera is then "standing" at that height: the levels above it are not drawn (as in the game,
 * a floor overhead never covers your view; go up to look at it), and the levels below are dimmed.
 *
 * The address shown ("level 1, x 15, y 14") is the tile under the camera, in the coordinates the
 * code uses: the world grid, which is the plan's column/row + 1 (the map has a one-tile margin).
 */
import { useEffect, useRef, useState } from "react";
import { createMapRenderer, seeAll } from "../explore/render";
import { CAMERA_FOLLOW, RISE } from "../explore/tuning";
import { LEVELS, WORLD } from "../explore/world";

const LEVEL_NOTES = ["the labyrinth and the shaft room", "the shaft", "the shaft", "the shaft", "the shaft", "the shaft", "the shaft", "Floor A: the Nave and the wheel round it", "stairs up to Floor B", "stairs up to Floor B", "Floor B: the Gallery", "stairs up to Floor C", "stairs up to Floor C", "Floor C: the Sanctum"];

/** How fast the camera pans, in tiles per second. */
const PAN = 9;

const KEYS: Record<string, string> = {
  KeyW: "up", ArrowUp: "up", KeyS: "down", ArrowDown: "down", KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right",
};

export function MapViewer({ onExit }: { onExit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [alt, setAlt] = useState(0);
  const [at, setAt] = useState({ x: WORLD.start.x, y: WORLD.start.y });
  const [copied, setCopied] = useState(false);
  const altRef = useRef(alt);
  altRef.current = alt;
  const exit = useRef(onExit);
  exit.current = onExit;

  const address = `level ${alt}, x ${Math.floor(at.x)}, y ${Math.floor(at.y)}`;
  const copy = () => {
    try {
      void navigator.clipboard.writeText(address).then(() => setCopied(true), () => {});
    } catch {
      // No clipboard here: the address above is there to copy by hand.
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current!;
    const renderer = createMapRenderer(canvas);
    const held = new Set<string>();
    const eye = { x: WORLD.start.x + 0.5, y: WORLD.start.y + 0.5 };
    // The camera as the game keeps it: where the eye appears on screen (its height lifts it up the screen).
    const cam = { x: eye.x, y: eye.y - altRef.current * RISE };
    const seen = seeAll(altRef.current);
    let shown = "";

    const onDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === "Escape") { exit.current(); return; }
      const dir = KEYS[e.code];
      if (dir) { held.add(dir); e.preventDefault(); return; }
      if (e.repeat) return;
      if (e.code === "KeyQ") { setAlt(a => Math.max(0, a - 1)); setCopied(false); }
      else if (e.code === "KeyE") { setAlt(a => Math.min(LEVELS - 1, a + 1)); setCopied(false); }
    };
    const onUp = (e: KeyboardEvent) => { const dir = KEYS[e.code]; if (dir) held.delete(dir); };
    const onBlur = () => held.clear();
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);

    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const dtMs = Math.min(now - last, 100);
      last = now;
      const dt = dtMs / 1000;
      const ix = (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0);
      const iy = (held.has("down") ? 1 : 0) - (held.has("up") ? 1 : 0);
      const len = Math.hypot(ix, iy) || 1;
      eye.x = Math.min(WORLD.w - 0.5, Math.max(0.5, eye.x + (ix / len) * PAN * dt));
      eye.y = Math.min(WORLD.h - 0.5, Math.max(0.5, eye.y + (iy / len) * PAN * dt));
      const a = altRef.current;
      const c = 1 - Math.exp(-CAMERA_FOLLOW * dt);
      cam.x += (eye.x - cam.x) * c;
      cam.y += (eye.y - a * RISE - cam.y) * c;
      seeAll(a, seen);
      renderer.draw({ camX: cam.x, camY: cam.y, x: eye.x, y: eye.y, alt: a, seen }, dtMs);
      const here = `${Math.floor(eye.x)},${Math.floor(eye.y)}`;
      if (here !== shown) { shown = here; setAt({ x: eye.x, y: eye.y }); setCopied(false); }
      raf = requestAnimationFrame(tick);
    };
    // The map is painted first, so panning around doesn't stutter.
    let gone = false;
    void renderer.warm(eye.x, eye.y, altRef.current).then(() => {
      if (gone) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    });
    return () => {
      gone = true;
      cancelAnimationFrame(raf);
      renderer.dispose();
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  return (
    <main className="mapviewer">
      <header className="mapviewer-head">
        <h2 className="viewer-title">Map viewer</h2>
        <span className="hint">Level {alt}, {LEVEL_NOTES[alt] ?? ""}</span>
        <span className="hint">{address}</span>
        <button className="hud-button" onClick={copy}>{copied ? "Copied" : "Copy address"}</button>
        <span className="hint">WASD move · Q down a level · E up a level · Esc back</span>
        <button className="hud-button" onClick={onExit}>Menu</button>
      </header>
      <canvas ref={canvasRef} className="mapviewer-canvas" />
    </main>
  );
}
