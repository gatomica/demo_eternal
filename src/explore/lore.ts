/**
 * lore.ts — what the guide reads in an eternal weapon's dreams: its lore, and the effect it carries
 * (see `ETERNAL_EFFECT` in core/rules.ts and the design doc). Armor has none yet.
 */
import type { WeaponTier } from "../core/types";

/** Each weapon's lore, as written for the demo. */
export const LORE: Partial<Record<WeaponTier, string>> = {
  light: "An imperial short sword broken in half. Though repurposed to carve into wax, it carves into flesh as well as in the age it was forged on.",
  normal: "A torch whose own flame has been extinguished with sealing wax. A sleep warden has no need for light, as bright is the path they are set upon.",
  heavy: "A makeshift hammer using a brick of the bedchambers. Though the holy foundations were thought to be eternal, being struck by might in their likeness brings them ruin all the same.",
};

/** What each eternal weapon does besides its blow, and what it costs you, in plain words. */
export const EFFECT: Partial<Record<WeaponTier, string>> = {
  light: "Empowers consecutive attacks against the same target.",
  normal: "Empowers direct hits, tiring them further and leaving them coated in wax.",
  heavy: "Empowers blows they Block, tiring them further.",
};
