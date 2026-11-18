/**
 * skills.ts — weapon skills: actions a weapon gives you, paid with Eternity, taking the place of the weapons' old always-on effects.
 *
 * A skill has an Eternity scaling (0 to 1): it spends that share of your max Eternity, in full, the moment its action is made, however much
 * its effect turns out to help; what your Eternity can't pay becomes Death on you (an ordinary, picked-up weapon's skill too: it draws on your Eternity
 * as an eternal one's does). Its effect is as big as
 * what was paid (Eternity and Death alike): one for one in Fatigue or Death, half that in damage or healing.
 *
 * An **Area** attack (`Skill.area`; an enemy's `#area` tag) hits everything in its range, each at half: half the damage, half the Poise and Deadly,
 * half the skill's effect. Its cost is paid once, in full.
 *
 * Enemies use the very same skills, by the same rules (`skill <id>` on an action of their pattern): the weapon they hold gives them, each has its own
 * conditions, and each is paid with Eternity. An enemy's max Eternity is its max health, and it never runs out: it never pays in Death.
 */
import { kindOf } from "./bestiary";
import { blowShares, type HeldWeapon, heldStats, type WeaponStats } from "./rules";
import type { ArsenalSlot, ArsenalWeapon, CombatState, Enemy, Fighter, Hand, Player, Side, Stance, Swing, WeaponItem, WeaponSwap, WeaponTier } from "./types";

export type SkillId = "stab" | "hookshot" | "reap" | "knockback" | "usurp" | "flameblast" | "chisel";

export interface Skill {
  name: string;
  /**
   * The kind of action it is. `attack`: made with the weapon's own numbers (its cost, damage, Poise, Deadly), changed by the skill. `rest`: a Rest
   * (Reap: it readies the weapon for the attack that follows, which is the skill's attack and pays its price).
   */
  type: "attack" | "rest";
  /** The share of your max Eternity it spends (0 to 1). */
  scaling: number;
  /** Only at an enemy on the front line (Close). */
  close?: boolean;
  /** Only at an enemy on the back line (Far). */
  far?: boolean;
  /** Only at certain enemies: `waxed`, one with the Waxed status; `usurpable`, one staggered while Waxed (sealed in wax), or a waxed cradling its flame. */
  aim?: "waxed" | "usurpable";
  /** A ranged attack: you stay where you are, a Block sends nothing back, and it can always be dodged. */
  ranged?: boolean;
  /**
   * What the Eternity paid does: `cheaper`, the attack's Fatigue cost is cut by it; `tire`, it is put on the target as Fatigue (unless the attack is
   * dodged); `death`, as Death on the target (unless dodged); `damage`, half of it as more damage in the blow.
   */
  effect: "cheaper" | "tire" | "death" | "damage";
  /** Its own weapon modifiers, in place of the weapon's Poise, Deadly and Light (Hookshot: 0.25 Light, 0.25 Poise, whatever sickle throws it). */
  mods?: Partial<WeaponStats>;
  /** It pulls its target to you, onto the front line, unless it is dodged (Hookshot). */
  pull?: boolean;
  /** It pushes its target away from you, onto the back line, unless it is dodged; you do not close in (Knockback). */
  push?: boolean;
  /** An Area attack (see above): `close`, at every enemy on the front line; `all`, at every enemy. */
  area?: "close" | "all";
  /** Made with both hands (Reap's attack): from the two-handed base, the weapon held alone in both. */
  both?: boolean;
  /** What it does to its weapon: `light`, a Waxed Torch it lands with becomes Flaming (Usurp Flame); `spend`, making it puts the flame out (Flame Blast). */
  flame?: "light" | "spend";
  /** Landed on one that is always Waxed (a waxed, a Wax Blob's part), it seals it whole in wax: dead on the spot (Usurp Flame). */
  seals?: boolean;
  /** Landed, it takes the Waxed status off its target, where it can come off (Chisel). */
  unwax?: boolean;
  /**
   * How an attack skill is drawn, whatever your stance. `stab`: a thrust (`p3-stab-up` into `p3-stab`). `hook`: an overhead throw, then a sideways pull
   * (`hookSwing`). `usurp`: a Stab's wind-up, then the weapon raised high overhead (the Hookshot's wind-up). `overhead`: an overhead, from any stance. `chisel`: an overhead with the
   * weapon in a reverse grip, point down (`p3-chisel-up` into `p3-chisel`), as the Waxbound's. `openhand`: its hand's Openhand (a Swing Left, the left
   * hand's mirrored), whatever the stance (Reap's attack, held in both hands). Otherwise it swings as the
   * stance swings.
   */
  swing?: "stab" | "hook" | "usurp" | "overhead" | "chisel" | "openhand";
  /** What it does, in plain words (the item card). */
  text: string;
}

export const SKILLS: Record<SkillId, Skill> = {
  // Stab: an attack at a Close enemy whose Fatigue cost is cut by what it spends (a 0.25 attack, less 0.2: 0.05 of your health).
  stab: { name: "Stab", type: "attack", scaling: 0.2, close: true, effect: "cheaper", swing: "stab", text: "Stabs a nearby enemy. Reduced Fatigue cost." },
  // Hookshot: the sickle thrown on its braid at a Far enemy, which it pulls to you: no damage and no cost of its own (0.25 Light), 0.25 Poise, and all
  // it spends put on the target as more Fatigue.
  hookshot: {
    name: "Hookshot", type: "attack", scaling: 0.1, far: true, ranged: true, effect: "tire", mods: { light: 0.25, poise: 0.25 }, pull: true, swing: "hook",
    text: "Hooks a faraway enemy and pulls it close. Tires it further.",
  },
  // Reap (the Barbarian's Axe): a Rest that takes the axe up in both hands. Until your next attack you can only Attack and Block with both hands, and
  // attack only Close enemies; that attack is an Area one at every Close enemy, and its price is paid as it is made, put on them as Death.
  reap: {
    name: "Reap", type: "rest", scaling: 0.25, close: true, effect: "death", area: "close", both: true, swing: "openhand",
    text: "Takes the axe up in both hands. Its next attack reaps every nearby enemy. Inflicts Death.",
  },
  // Knockback (the Brick Hammer): an attack that drives its target back onto the back line (you stay where you are), all it spends put on it as Fatigue.
  knockback: { name: "Knockback", type: "attack", scaling: 0.1, effect: "tire", push: true, text: "Knocks an enemy away from you. Tires it further." },
  // Usurp Flame (the Waxed Torch): at a waxed cradling its flame, or one sealed in wax by a stagger; 0.25 Light and 0.25 Deadly, all it spends put on its
  // target as more Death. Landed, it lights the torch (Flaming), and one that is always Waxed dies sealed in wax.
  usurp: {
    name: "Usurp Flame", type: "attack", scaling: 0.05, aim: "usurpable", effect: "death", mods: { light: 0.25, deadly: 0.25 }, flame: "light", seals: true, swing: "usurp",
    text: "Takes the flame of a waxed enemy cradling it, or sealed in wax. Inflicts Death. Kills the waxed. Sets the torch Flaming.",
  },
  // Flame Blast (the Flaming torch's, in place of Usurp Flame): an Area attack at every enemy, all it spends put on them as Death. It puts the flame out.
  flameblast: {
    name: "Flame Blast", type: "attack", scaling: 0.2, ranged: true, effect: "death", area: "all", flame: "spend", swing: "overhead",
    text: "Blasts every enemy with the torch's flame. Inflicts Death. Puts the flame out.",
  },
  // Chisel (the Broken Shortsword): at a Waxed enemy only, half of what it spends as more damage; it chips the wax off, where it can come off.
  chisel: { name: "Chisel", type: "attack", scaling: 0.1, aim: "waxed", effect: "damage", unwax: true, swing: "chisel", text: "Chips the wax off a waxed enemy. More damage." },
};

/** Which weapon gives skills: a class's own (by its item), or a weapon by its weight (the Broken Shortsword, the Waxed Torch, the Brick Hammer). */
export type WeaponKey = WeaponItem | "chisel" | "torch" | "hammer";
const TIER_KEY: Partial<Record<WeaponTier, WeaponKey>> = { light: "chisel", normal: "torch", heavy: "hammer" };
export const weaponKey = (tier: WeaponTier, item?: WeaponItem): WeaponKey | undefined => item ?? TIER_KEY[tier];

/** The skills each weapon gives the hand that holds it. */
export const WEAPON_SKILLS: Partial<Record<WeaponKey, SkillId[]>> = {
  shortsword: ["stab"],
  sickle: ["hookshot"],
  axe: ["reap"],
  hammer: ["knockback"],
  torch: ["usurp"],
  chisel: ["chisel"],
};

/** A weapon's skills (a Flaming Waxed Torch has Flame Blast in place of Usurp Flame). */
export const skillsOfWeapon = (w?: HeldWeapon): SkillId[] => {
  const key = w ? weaponKey(w.tier, w.item) : undefined;
  if (key === "torch" && w?.flaming) return ["flameblast"];
  return key ? WEAPON_SKILLS[key] ?? [] : [];
};

/** The hand on that side, as the rules see it. */
export const handOn = (p: Player, side: Side): Hand =>
  side === "left" ? p.offhand : { weapon: p.weapon, weaponItem: p.weaponItem, eternal: p.eternal, mortal: p.mortalWeapon, flaming: p.flaming };

/** A hand's weapon as the wheel and the rules name it (`HeldWeapon`). */
export const heldOn = (p: Player, side: Side): HeldWeapon => {
  const h = handOn(p, side);
  return { tier: h.weapon, item: h.weaponItem, flaming: h.flaming };
};

/**
 * The weapons both hands make together (`HeldWeapon`s for `bothHands`): what they hold, or, while Reap holds the axe up in both, the axe alone (the
 * other hand's weapon set aside).
 */
export const bothHeld = (p: Player): [HeldWeapon, HeldWeapon] => {
  const none: HeldWeapon = { tier: "baseline" };
  if (p.reaping) return p.reaping === "left" ? [none, heldOn(p, "left")] : [heldOn(p, "right"), none];
  return [heldOn(p, "right"), heldOn(p, "left")];
};

/**
 * Every skill you can use, the hand it is made with, and (with an arsenal) the place of the weapon that gives it. With an arsenal (`Player.arsenal`),
 * every weapon in it, held or not: one you do not hold is taken into its hand for the turn (`swapIn`). Without (the Model viewer), what your hands
 * hold, the right hand's first. (Reap's attack is not one: it is the Attack you make while it lasts.)
 */
export function skillsOf(p: Player): { skill: SkillId; hand: Side; from?: ArsenalSlot }[] {
  if (!p.arsenal) return (["right", "left"] as const).flatMap(hand => skillsOfWeapon(heldOn(p, hand)).map(skill => ({ skill, hand })));
  return ARSENAL_SLOTS.flatMap(from => {
    const w = p.arsenal![from];
    return w ? skillsOfWeapon(arsenalHeld(p, w)).map(skill => ({ skill, hand: w.held ?? HAND_OF_SLOT[from], from })) : [];
  });
}

/** The arsenal's places, in the Skill menu's order of preference. */
export const ARSENAL_SLOTS: ArsenalSlot[] = ["right", "left", "up", "down"];

/** The hand a weapon of each place is taken into for its skill: an eternal one its own; an ordinary one the hand on its side of your back. */
export const HAND_OF_SLOT: Record<ArsenalSlot, Side> = { right: "right", left: "left", up: "right", down: "left" };

/** A weapon of your arsenal as the rules name it (`HeldWeapon`): a torch in your hand Flaming as that hand is, one not held as it was left. */
export const arsenalHeld = (p: Player, w: ArsenalWeapon): HeldWeapon =>
  ({ tier: w.tier, item: w.item, flaming: w.held ? handOn(p, w.held).flaming : w.flaming });

/**
 * The weapons on your back in a fight, in their places (the first from the right shoulder): the ordinary ones of your arsenal you do not hold (a
 * Flaming torch burning there too).
 */
export const backOf = (p: Player): ({ tier: WeaponTier; item?: WeaponItem; flaming?: boolean } | null)[] =>
  (["up", "down"] as const).map(s => {
    const w = p.arsenal?.[s];
    return w && !w.held ? { tier: w.tier, item: w.item, ...(w.flaming ? { flaming: true } : {}) } : null;
  });

/** Puts a hand's rules (`Hand`) on you: your right hand's own fields, or `offhand`. */
function setHand(p: Player, side: Side, h: Hand) {
  if (side === "left") { p.offhand = h; return; }
  p.weapon = h.weapon;
  p.weaponItem = h.weaponItem;
  p.eternal = h.weapon !== "baseline";
  p.mortalWeapon = h.mortal;
  p.flaming = h.flaming;
}

/** A weapon of your arsenal as a hand holds it (every weapon carries its effect; an ordinary one is `mortal`). */
const handFor = (w: ArsenalWeapon): Hand =>
  ({ weapon: w.tier, ...(w.item ? { weaponItem: w.item } : {}), eternal: true, mortal: !w.eternal, ...(w.flaming ? { flaming: true } : {}) });

/** A weapon as a swap shows it, with its arsenal place. */
const swapLook = (w: ArsenalWeapon, slot: ArsenalSlot) => ({ tier: w.tier, ...(w.item ? { item: w.item } : {}), eternal: w.eternal, slot, ...(w.flaming ? { flaming: true } : {}) });

/**
 * Takes the weapon in this arsenal place into its hand for a skill, if no hand holds it: what that hand held goes back where it came from (an ordinary
 * weapon to its place on your back; an eternal one out of sight), the torch's flame staying with its torch. Returns the hand it is in, and the swap
 * the screen plays (none, if it was already held).
 */
export function swapIn(p: Player, from: ArsenalSlot): { hand: Side; swap?: WeaponSwap } {
  const w = p.arsenal?.[from];
  if (!w) return { hand: HAND_OF_SLOT[from] };
  if (w.held) return { hand: w.held };
  const hand = HAND_OF_SLOT[from], was = handOn(p, hand);
  const put = ARSENAL_SLOTS.find(s => p.arsenal![s]?.held === hand), old = put ? p.arsenal![put] : undefined;
  if (old) { old.held = undefined; old.flaming = was.flaming || undefined; }
  w.held = hand;
  setHand(p, hand, handFor(w));
  p.borrowed = { hand, from, ...(put ? { put } : {}) };
  return { hand, swap: { when: "start", hand, ...(old && put ? { out: swapLook(old, put) } : {}), in: swapLook(w, from) } };
}

/**
 * The weapon taken up for a skill put back as the turn ends (unless Reap still holds it up in both hands): to its place on your back, or out of sight,
 * and the hand takes up again what it held. Returns the swap the screen plays, if there was one.
 */
export function returnBorrowed(p: Player): WeaponSwap | undefined {
  const b = p.borrowed;
  if (!b || p.reaping || !p.arsenal) return undefined;
  const w = p.arsenal[b.from], old = b.put ? p.arsenal[b.put] : undefined;
  const now = handOn(p, b.hand);
  if (w) { w.held = undefined; w.flaming = now.flaming || undefined; }
  if (old) old.held = b.hand;
  setHand(p, b.hand, old ? handFor(old) : { weapon: "baseline" });
  p.borrowed = undefined;
  return { when: "end", hand: b.hand, ...(w ? { out: swapLook(w, b.from) } : {}), ...(old && b.put ? { in: swapLook(old, b.put) } : {}) };
}

/** Whether the hand holds a weapon with this skill. */
export const handHasSkill = (p: Player, hand: Side, skill: SkillId) => skillsOfWeapon(heldOn(p, hand)).includes(skill);

/** What a skill spends, in Eternity points: its share of your max Eternity. */
export const skillPrice = (p: Player, skill: SkillId) => SKILLS[skill].scaling * p.maxEternity;

/**
 * What a skill would be paid with right now (for the previews): the Eternity spent, and the Death on you for what it can't pay. Whatever weapon
 * gives it, eternal or picked up, it draws on your Eternity first.
 */
export function skillPayment(p: Player, skill: SkillId): { spent: number; death: number; price: number } {
  const price = skillPrice(p, skill);
  const spent = Math.min(Math.max(0, p.eternity), price);
  return { spent, death: price - spent, price };
}

/** A waxed cradling its flame (the Waxed's Cradle Flame stance), for Usurp Flame to take. */
const cradling = (e: Enemy) => {
  const flame = kindOf(e).flame;
  return !!flame && e.intent.stance === flame.stance;
};

/**
 * Whether a skill can be aimed at this enemy: Close (front line) or Far (back line) only, where it says; Usurp Flame only at one staggered while Waxed
 * (sealed whole in wax) or a waxed cradling its flame; Chisel only at a Waxed one.
 */
export const canTarget = (skill: SkillId, e: Enemy) => {
  const sk = SKILLS[skill];
  if (!e.alive || (sk.close && e.line !== "front") || (sk.far && e.line !== "back")) return false;
  if (sk.aim === "waxed") return e.waxed;
  if (sk.aim === "usurpable") return (e.staggered && e.waxed) || cradling(e);
  return true;
};

/** An enemy's weapon as the rules name it (a Waxed Torch Flaming while its `flaming` flag is on). */
export const heldByFoe = (e: Enemy): HeldWeapon => ({ tier: e.weapon, flaming: !!e.flags.flaming });

/** Whether an enemy's weapon gives this skill, as the same weapon would give it you (not the Warden's own flail, one of no demo weapon). */
export const foeHasSkill = (e: Enemy, skill: SkillId) => !kindOf(e).ownWeapon && skillsOfWeapon(heldByFoe(e)).includes(skill);

/** What a skill spends for an enemy, in Eternity points: its share of the enemy's max Eternity, which is its max health. */
export const foeSkillPrice = (e: Enemy, skill: SkillId) => SKILLS[skill].scaling * e.maxHP;

/**
 * Whether an enemy's skill can be aimed at this target, by the skill's own rules as yours are. At you: Close or Far measured from where the enemy
 * stands (Close: it is on the front line), Chisel only while you are Waxed, Usurp Flame only while you are staggered and Waxed (never on your revive).
 * At an ally, only Usurp Flame, as the Warden's: one staggered while Waxed, or a waxed cradling its flame.
 */
export function foeCanTarget(skill: SkillId, self: Enemy, target: Fighter, state: CombatState): boolean {
  const sk = SKILLS[skill];
  const p = state.player;
  if (target === p || target.id === p.id) {
    if (p.reviving || (sk.close && self.line !== "front") || (sk.far && self.line !== "back")) return false;
    if (sk.aim === "waxed") return p.waxed;
    if (sk.aim === "usurpable") return p.staggered && p.waxed;
    return true;
  }
  const ally = target as Enemy;
  if (sk.aim !== "usurpable" || ally.id === self.id || !ally.alive) return false;
  return (ally.staggered && ally.waxed) || cradling(ally);
}

/** Whom an enemy's skill can be aimed at now: `"player"` (first, if it can), then the ids of the allies it can. */
export const foeTargetsOf = (state: CombatState, self: Enemy, skill: SkillId): string[] => [
  ...(foeCanTarget(skill, self, state.player, state) ? [state.player.id] : []),
  ...state.enemies.filter(e => e.id !== self.id && foeCanTarget(skill, self, e, state)).map(e => e.id),
];

/** Whether an enemy can make this skill now: its weapon gives it, and there is someone to aim it at. */
export const foeCanUse = (state: CombatState, self: Enemy, skill: SkillId) => foeHasSkill(self, skill) && foeTargetsOf(state, self, skill).length > 0;

/** The enemies a skill can be aimed at now (a Rest's, Reap: you, so it can always be made). */
export const targetsOf = (s: CombatState, skill: SkillId) => s.enemies.filter(e => canTarget(skill, e));

/** Effect per point paid: Fatigue and Death one for one, damage and healing half. */
export const SKILL_RATE = { fatigue: 1, death: 1, damage: 0.5, heal: 0.5 } as const;

/** What an Area attack does to each thing it hits, a share of what one blow would (see the file's note). */
export const AREA_SHARE = 0.5;

/**
 * A weapon's stats as a skill uses them: a skill with modifiers of its own has those in place of the weapon's Poise, Deadly and Light (any it does not
 * name are 0: Usurp Flame has no Poise, whatever torch makes it), keeping the weapon's Defense and subtype; one without, the weapon's own.
 */
export const skillStats = (w: WeaponStats, skill: SkillId): WeaponStats => {
  const mods = SKILLS[skill].mods;
  return mods ? { ...w, poise: 0, deadly: 0, light: 0, ...mods } : w;
};

/**
 * What an attack skill made with this weapon costs and deals to each target, shares of your max health (as `blowShares`), with its effect in: Stab's cost
 * cut by what it pays, the Hookshot's and Knockback's Poise grown by it (the Fatigue they put on the target), Usurp Flame's, Reap's and Flame Blast's
 * Deadly (the Death), Chisel's damage (half). An Area attack's numbers are each target's: half, but for its cost.
 */
export function skillShares(p: Player, skill: SkillId, w: WeaponStats) {
  const sk = SKILLS[skill], b = blowShares(skillStats(w, skill), !!sk.both), paid = skillPrice(p, skill) / p.maxHP;
  const k = sk.area ? AREA_SHARE : 1;
  const out = { ...b, damage: b.damage * k, poise: b.poise * k, deadly: b.deadly * k };
  switch (sk.effect) {
    case "cheaper": return { ...out, cost: Math.max(0, b.cost - paid * SKILL_RATE.fatigue) };
    case "tire": return { ...out, poise: out.poise + paid * SKILL_RATE.fatigue * k };
    case "death": return { ...out, deadly: out.deadly + paid * SKILL_RATE.death * k };
    case "damage": return { ...out, damage: out.damage + paid * SKILL_RATE.damage * k };
  }
}

/** The weapon a skill of this hand is made with, its stats (Reap's: the axe alone, in both hands; a Flaming torch's, its flame's). */
export const skillWeapon = (p: Player, hand: Side): WeaponStats => heldStats(heldOn(p, hand));

/**
 * How an attack skill swings (`Skill.swing`), from the stance its hand swings from (the left hand's: the mirrored one). A Hookshot pulls its target in
 * sideways: from Right Lead with a backhand (`hook-right`, a Swing Right's landing), from any other stance with an openhand (`hook-left`).
 */
export function skillSwing(skill: SkillId, stance: Stance): Swing | undefined {
  const s = SKILLS[skill].swing;
  if (s === "hook") return stance === "lead-right" ? "hook-right" : "hook-left";
  if (s === "openhand") return "left";
  return s;
}
