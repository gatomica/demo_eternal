/**
 * scenes.ts — timings of the Warden's own scenes.
 */

/**
 * The Warden's phase-two scene, its moments in ms: in the dark, flames kindle all
 * around (the waxed, the sealed sleepwalkers in the floor and walls, and more beyond the edges of
 * the screen); then one by one they stream into his hand, his flame growing; then it flares.
 */
export const IGNITE = { kindle: 1500, draw: 2900, flare: 4700, end: 5700 } as const;
