/**
 * stats.ts — the F3 readout: press F3 on the map and a small box shows how long the frames take,
 * what the renderer draws and how much it keeps in memory.
 */

/** Wires F3 to a readout that shows `text()` (refreshed a few times a second). Returns what undoes it. */
export function createStatsOverlay(text: () => string) {
  let el: HTMLDivElement | null = null;
  let timer = 0;
  const hide = () => {
    el?.remove();
    el = null;
    window.clearInterval(timer);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.code !== "F3") return;
    e.preventDefault();
    if (el) { hide(); return; }
    el = document.createElement("div");
    el.style.cssText = "position:fixed;left:8px;top:8px;z-index:100;padding:6px 8px;background:rgba(0,0,0,0.7);color:#cfe;font:12px/1.4 monospace;white-space:pre;pointer-events:none;border-radius:4px";
    document.body.appendChild(el);
    const show = () => { if (el) el.textContent = text(); };
    show();
    timer = window.setInterval(show, 250);
  };
  window.addEventListener("keydown", onKey);
  return () => {
    window.removeEventListener("keydown", onKey);
    hide();
  };
}
