/**
 * shade.ts — the game's basic lighting: the world is a little darker than it really is, everywhere (the ground and the figures, in a fight and
 * on the map). This is not the sight radius (the dark beyond the circle round the player): it is a flat ambient level under that, so every colour
 * shows at `AMBIENT` of its true brightness unless a light (a flame out in someone's hands) lifts it nearby. The Model viewer can turn it off, to
 * check the colours as they really are.
 */

/** How much of its true brightness everything shows (1 = none lost). */
export const AMBIENT = 0.82;
