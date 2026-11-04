/**
 * render.ts — the map renderer the screens use: the WebGL one where the browser has it, else
 * the plain 2D one (also forced by `?gl=0`, to compare the two).
 */
import { createGLRenderer } from "./gl/renderer";
import { createMapRenderer2D } from "./render2d";
import type { MapRenderer } from "./view";

export type { ActorDrawer, Light, MapRenderer, View, ViewPlayer } from "./view";
export { seeAll } from "./view";

export function createMapRenderer(canvas: HTMLCanvasElement): MapRenderer {
  const forced = new URLSearchParams(window.location.search).get("gl") === "0";
  if (!forced) {
    const gl = createGLRenderer(canvas);
    if (gl) {
      console.info("Map renderer: WebGL2");
      return gl;
    }
  }
  console.warn(forced ? "Map renderer: the old 2D one (?gl=0 is in the address)" : "Map renderer: the old 2D one, because WebGL2 is not available here");
  return createMapRenderer2D(canvas);
}
