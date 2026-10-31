/**
 * waxed.ts — the Waxed, the weakest enemy: a sleepwalker the wardens tried to soothe back to
 * sleep. It kneels, shins bound together in wax, head encased in it. No weapon, no armor. Fully
 * telegraphed: every stance leads to one kind of action.
 */
import type { EnemyKind } from "../bestiary";
import { parsePattern } from "../patterns";

export const WAXED: EnemyKind = {
  name: "Waxed",
  maxHP: 12,
  weapon: "baseline",
  armor: "none",
  variant: "waxed",
  // Lit: its flame burns on its head (the Warden's phase two lights it, and raises it staggered if it has fallen).
  flags: { lit: false },
  statuses: [{ key: "lit", off: "Unlit", on: "Lit" }],
  // A lit waxed that bursts is spent: it dies as its blast finishes, sealed in wax (no candle left to burn).
  afterTurn: r => {
    if (r.action !== "Flame Immolation" || r.outcome !== "done") return;
    r.self.alive = false;
    r.self.fate = "encased";
    r.self.hp = 0;
    r.self.fatigue = 0;
    r.event({ kind: "fall", who: r.self.id });
  },
  pattern: parsePattern("Waxed", `
    actions:
      Scratch:      attack, baseline
      Hurl Wax:     attack, light, ranged
      Brace:        block, baseline
      Drag Forward: maneuver, advance, *Far   // crawls in only when far away
      Slither Back: maneuver, retreat, *Close // backs off only when close
      Clutch Flame: rest
      Flame Immolation: attack, heavy, ranged, *Lit, #fire, #shockwave   // a lit waxed bursts: it dies, and its fire hits everyone
    stances:
      All > Hands Raised      > Scratch
      All > Wax on Hand       > Hurl Wax
      All > Cowering Sideways > Brace
      All > Crawling          > Drag Forward, Slither Back
      All > Cradle Flame      > Flame Immolation, Clutch Flame
  `),
  modelPoses: { front: "w-t", back: "w-t-b" },
  stancePoses: {
    "Hands Raised": "w-hands",
    "Wax on Hand": "w-wax-hand",
    "Cowering Sideways": "w-cower",
    Crawling: "w-crawl",
    "Cradle Flame": "w-cradle",
  },
  idlePose: "w-idle",
  downPose: "w-fallen",
  flinchPose: "w-flinch",
  actionPoses: {
    Scratch: { act: "w-hands", strike: "w-scratch" },
    "Hurl Wax": { act: "w-wax-hand", strike: "w-hurl", projectile: "wax" },
    Brace: { act: "w-cower" },
    "Drag Forward": { act: "w-crawl" },
    "Slither Back": { act: "w-slither" },
    "Clutch Flame": { act: "w-clutch" },
    // The cradled flame bursts: the same pose as clutching it, as the blast rolls out.
    "Flame Immolation": { act: "w-clutch", strike: "w-clutch", projectile: "blast" },
  },
  // It still holds a flame of its own, cradled at its chest.
  flame: { stance: "Cradle Flame", action: "Clutch Flame" },
  // Where it falls, it stays: faded, for the rest of the fight.
  remains: true,
  deathLook: "wax",
  // Folded right down, hugging itself.
  deathPose: "w-dead",
};
