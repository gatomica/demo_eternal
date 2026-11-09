/**
 * waxed.ts — the Waxed, the weakest enemy: a sleepwalker the wardens tried to soothe back to
 * sleep. It kneels, shins bound together in wax, head encased in it. No weapon, no armor. Fully
 * telegraphed: every stance leads to one kind of action.
 */
import type { EnemyKind } from "../bestiary";
import { parsePattern } from "../patterns";

/**
 * The Waxed's pattern, as text. Its two clawing attacks are blows of whatever it holds in its free hand
 * (Hurl Wax still tears the wax off with the other): barehanded, they are its own baseline blow
 * (damage 2, cost 2, as its old Scratch); armed, the weapon's weight, numbers and effect.
 *
 * Stances lead by what just happened: a Brace that stopped an attack (`Brace`) takes it to
 * Crawling or Reared Back, one that stopped nothing (`!Brace`) to Wax on Hand or Cradle Flame.
 * Actions nothing follows (Hurl Wax, Overhead Attack) go back to the Recover stances.
 */
export const waxedPatternText = (armed: boolean, flame = true) => [
  "    actions:",
  `      Low Attack:      attack${armed ? "" : ", baseline, damage 2, cost 2"}   // a low blow, from the crawl`,
  `      Overhead Attack: attack${armed ? "" : ", baseline, damage 2, cost 2"}, *Close   // only within reach`,
  "      Hurl Wax:     attack, light, ranged",
  "      Brace:        block, baseline",
  "      Drag Forward: maneuver, advance, *Far   // crawls in only when far away",
  "      Slither Back: maneuver, retreat, *Close // backs off only when close",
  ...(flame ? [
    "      Clutch Flame: rest",
    "      Flame Immolation: attack, heavy, ranged, *Lit, #fire, #shockwave   // a lit waxed bursts: it dies, and its fire hits everyone",
  ] : []),
  "    stances:",
  `      Recover${flame ? ", Clutch Flame" : ""}                > Idle        > Drag Forward, Slither Back`,
  "      Recover, Drag Forward, Brace         > Crawling    > Drag Forward, Low Attack",
  "      Slither Back, !Brace                 > Wax on Hand > Hurl Wax",
  // (Without its flame, a Brace that stopped nothing only leads to Wax on Hand.)
  ...(flame ? ["      Recover, Slither Back, !Brace        > Cradle Flame > Flame Immolation, Clutch Flame"] : []),
  "      Low Attack, Brace                    > Reared Back > Overhead Attack, Brace",
].join("\n");

/**
 * The Waxed's pattern (see `waxedPatternText`). `flame`: with its Cradle Flame stance (and Clutch Flame, its Rest, and Flame Immolation);
 * the Wax Blob's side parts have none.
 */
export const waxedPattern = (name: string, armed: boolean, flame = true) => parsePattern(name, waxedPatternText(armed, flame));

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
    "Reared Back": "w-reared",
  },
  idlePose: "w-idle",
  downPose: "w-staggered",
  flinchPose: "w-flinch",
  actionPoses: {
    "Low Attack": { act: "w-low-windup", strike: "w-low-strike" },
    "Overhead Attack": { act: "w-overhead-windup", strike: "w-overhead-strike" },
    "Hurl Wax": { act: "w-hurl-windup", strike: "w-hurl", projectile: "wax" },
    // (It holds the Reared Back pose with the arms lowered and bent until the blow lands, then takes its guard: the hips lower, the forearms crossed in front of the face.)
    Brace: { act: "w-cower", windup: "w-brace", guard: "w-brace-block" },
    "Drag Forward": { act: "w-drag" },
    "Slither Back": { act: "w-slither" },
    // (The Rest folds over the flame from the start of the turn, and once it goes through the flame is gone: it pressed its hands to its wax mouth, as if it ate it.)
    "Clutch Flame": { act: "w-clutch", windup: "w-clutch", rest: "w-clutch-eat" },
    // The flame bursts: it gathers it folded over as if clutching it (its head flame blazing, none in its hands), and as the fire bursts out of
    // its head and rolls out all the way round it dies on the spot, in the pose it lies in.
    "Flame Immolation": { act: "w-clutch", strike: "w-dead", projectile: "burst" },
  },
  // It still holds a flame of its own, cradled at its chest.
  flame: { stance: "Cradle Flame", action: "Clutch Flame" },
  // Lit, it does not cradle a flame in its hands: the one on its head blazes, about to burst.
  blazePoses: ["w-cradle", "w-clutch"],
  // Its burst is the end of it.
  fatalActions: ["Flame Immolation"],
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
