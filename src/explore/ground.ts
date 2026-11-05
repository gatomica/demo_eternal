/**
 * ground.ts — what is underfoot at a place on the map, for the sounds of walking: stone paving, wax, planks, dug rock and rubble,
 * the steps of a stair, the rungs of a ladder.
 */
import { LEVELS, LADDER, STAIRS, minedAt, rubbleAt, splodgeAt, tileAt, woodAt } from "./world";
import { isWaxedLevel } from "./tuning";

export type Ground = "stone" | "wax" | "wood" | "rock" | "stairs" | "ladder";

/** The ground under feet at (x, y), `alt` high (storeys): the surface whose level it is nearest to. */
export function groundAt(x: number, y: number, alt: number): Ground {
  const tx = Math.floor(x), ty = Math.floor(y);
  // A stair is a tile of its own level, and you are on it between that level and the next; the floor you stand on is the level you are at.
  const base = Math.min(LEVELS - 1, Math.max(0, Math.floor(alt + 0.02)));
  for (const z of [base, base - 1]) {
    if (z < 0) continue;
    const t = tileAt(z, tx, ty);
    if (t === LADDER) return "ladder";
    if (t === STAIRS && alt - z < 1.02 && alt - z > -0.02) return "stairs";
    if (z !== base && Math.abs(alt - z) > 0.3) continue;
    if (!t || t === 2 /* WALL */) continue;
    if (woodAt(z, tx, ty)) return "wood";
    if (minedAt(z, tx, ty) || rubbleAt(z, tx, ty)) return "rock";
    if (isWaxedLevel(z) || splodgeAt(z, tx, ty) >= 160) return "wax";
    return "stone";
  }
  return "stone";
}
