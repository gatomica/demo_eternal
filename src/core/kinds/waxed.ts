/**
 * waxed.ts — the Waxed, the weakest enemy: a sleepwalker the wardens tried to soothe back to
 * sleep. It kneels, shins bound together in wax, head encased in it. No weapon, no armor. Fully
 * telegraphed: every stance leads to one kind of action.
 */
import type { EnemyKind } from "../bestiary";
import { parsePattern } from "../patterns";

/**
 * The Waxed's pattern. Its two clawing attacks are blows of whatever it holds in its free hand
 * (Hurl Wax still tears the wax off with the other): barehanded, they are its own baseline blow
 * (damage 2, cost 2, as its old Scratch); armed, the weapon's weight, numbers and effect.
 *
 * Stances lead by what just happened: a Brace that stopped an attack (`Brace`) takes it to
 * Crawling or Reared Back, one that stopped nothing (`!Brace`) to Wax on Hand or Cradle Flame.
 * Actions nothing follows (Hurl Wax, Overhead Attack) go back to the Recover stances.
 */
const waxedPattern = (name: string, armed: boolean) => parsePattern(name, `
    actions:
      Low Attack:      attack${armed ? "" : ", baseline, damage 2, cost 2"}   // a low blow, from the crawl
      Overhead Attack: attack${armed ? "" : ", baseline, damage 2, cost 2"}, *Close   // only within reach
      Hurl Wax:     attack, light, ranged
      Brace:        block, baseline
      Drag Forward: maneuver, advance, *Far   // crawls in only when far away
      Slither Back: maneuver, retreat, *Close // backs off only when close
      Clutch Flame: rest
      Flame Immolation: attack, heavy, ranged, *Lit, #fire, #shockwave   // a lit waxed bursts: it dies, and its fire hits everyone
    stances:
      Recover, Clutch Flame                > Idle        > Drag Forward, Slither Back
      Recover, Drag Forward, Brace         > Crawling    > Drag Forward, Low Attack
      Slither Back, !Brace                 > Wax on Hand > Hurl Wax
      Recover, Slither Back, !Brace        > Cradle Flame > Flame Immolation, Clutch Flame
      Low Attack, Brace                    > Reared Back > Overhead Attack, Brace
  `);

export const WAXED: EnemyKind = {
  name: "Waxed",
  maxHP: 5,
  weapon: "baseline",
  armor: "none",
  variant: "waxed",
  // Wax is what it is: it always has the Waxed status (the Wax Blob's parts and the armed waxed share it).
  alwaysWaxed: true,
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
  // Its blows hurt and tire as much as a light one, barehanded.
  pattern: waxedPattern("Waxed", false),
  modelPoses: { front: "w-t", back: "w-t-b" },
  stancePoses: {
    Idle: "w-idle",
    Crawling: "w-crawl",
    "Wax on Hand": "w-wax-hand",
    "Cradle Flame": "w-cradle",
    "Reared Back": "w-hands",
  },
  idlePose: "w-idle",
  downPose: "w-fallen",
  flinchPose: "w-flinch",
  actionPoses: {
    "Low Attack": { act: "w-low-windup", strike: "w-low-strike" },
    "Overhead Attack": { act: "w-hands", strike: "w-scratch" },
    "Hurl Wax": { act: "w-wax-hand", strike: "w-hurl", projectile: "wax" },
    Brace: { act: "w-cower" },
    "Drag Forward": { act: "w-drag" },
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

/**
 * A waxed carrying a weapon in its free hand: the same kneeling wretch, but its two clawing
 * attacks are blows of the weapon (its weight's numbers and speed, and its effect, free for it),
 * and beaten, it drops the ordinary weapon. Hurl Wax is thrown with its other hand, as ever, and
 * carries no effect; its Brace is still bare. (No Waxed Torch: that is the wardens' own.)
 */
const armedWaxed = (name: string, weapon: "light" | "heavy"): EnemyKind => ({
  ...WAXED,
  name,
  weapon,
  pattern: waxedPattern(name, true),
});

export const WAXED_CHISEL = armedWaxed("Chisel Waxed", "light");
export const WAXED_HAMMER = armedWaxed("Hammer Waxed", "heavy");
