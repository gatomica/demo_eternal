/**
 * debugLimbs.ts — the Model viewer's "Debug" status: while it is on, every figure draws its right
 * arm and right leg red, to tell the sides apart while tuning poses. Provided by `CombatScreen`
 * (its `debugLimbs`), read by the figures.
 */
import { createContext } from "react";

export const DebugLimbsContext = createContext(false);
