/**
 * canvasLoop.ts — the animation loop of a canvas laid over the scene (the String aura, the flame's red strings): drawn every frame, cleared first,
 * at the canvas's size in CSS pixels. The size is read when the canvas is resized (not every frame, which would make the browser lay the page out
 * each time) and its context is kept.
 */

/**
 * Runs `draw(g, w, h, now)` on every frame for `cv`, after clearing it. `w` and `h` are its CSS size, and `g` is already scaled to them.
 * Returns what stops it.
 */
export function canvasLoop(cv: HTMLCanvasElement, draw: (g: CanvasRenderingContext2D, w: number, h: number, now: number) => void): () => void {
  const g = cv.getContext("2d")!;
  let w = cv.clientWidth, h = cv.clientHeight, dpr = window.devicePixelRatio || 1, sized = false;
  const fit = () => {
    dpr = window.devicePixelRatio || 1;
    const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    sized = true;
  };
  const watch = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { w = cv.clientWidth; h = cv.clientHeight; sized = false; }) : undefined;
  watch?.observe(cv);
  let raf = 0;
  const frame = (now: number) => {
    // (Without a ResizeObserver the size is read each frame, as it was.)
    if (!watch) { w = cv.clientWidth; h = cv.clientHeight; sized = false; }
    if (!sized) fit();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    draw(g, w, h, now);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => { cancelAnimationFrame(raf); watch?.disconnect(); };
}
