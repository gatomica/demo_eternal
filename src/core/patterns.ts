/**
 * patterns.ts — how enemies decide what to do: stances and actions, written in the same
 * notation as the design doc, parsed when the game loads.
 *
 * An enemy loops: stance (shown to you) → action (hidden, unless the stance has only one) →
 * next stance → … Each stance lists the actions it allows; each action lists the stances it
 * can lead to.
 *
 * NOTATION
 *
 *   actions:
 *     Scratch:       attack, baseline
 *     Hurl Wax:      attack, light, ranged
 *     Drag Forward:  maneuver, advance
 *     Wax Guard:     block, light, *Sealed
 *   stances:
 *     All > Hands Raised > Scratch
 *     Rising Flail > Flail Spinning Overhead > Flail Slam
 *     Flail Swing / Wind Up Flail > Flail Spinning Behind > Rising Flail / Wax Guard, Stride
 *
 * - An action line is `Name: kind, modifiers…`. Kinds: attack, block, maneuver, rest.
 *   Modifiers: a weight (baseline, light, normal, heavy), `ranged`, a Maneuver direction
 *   (`advance` closes in on you, `retreat` backs off, `by-line` does whichever its line calls
 *   for), `*Condition` (only available while that condition holds), and `#tag` (a rule it
 *   triggers, e.g. `#waxing`: a direct hit leaves the target Waxed).
 * - A stance line is `Comes from > Stance > Leads to`.
 *   - Comes from: action names (and `Recover`, or `Second Phase`: right after a boss enters its
 *     second phase) separated by `/` or `,`, or `All`.
 *   - Leads to: `/` separates kinds of action, `,` separates actions of the same kind.
 * - Recover is the turn after being staggered (or reviving). `Recover >` stances are also the
 *   ones an enemy opens a fight with.
 *
 * PICKING (every choice is even)
 * 1. Next stance, evenly among those the last action leads to. If the last action didn't
 *    happen (a Rest cut short, a Block with nothing to block, a cancelled action), or it was the
 *    Recover after a stagger: evenly among the Recover stances.
 * 2. Within the stance: a kind evenly among the kinds it offers, then an action of that kind
 *    evenly. Actions whose conditions don't hold are skipped.
 * 3. Safety net: if none of the stance's actions are available, the enemy acts as if it just
 *    Recovered and picks again from the Recover stances.
 */
import type { ActionType, WeaponTier } from "./types";

export const ACTION_KINDS: ActionType[] = ["attack", "block", "maneuver", "rest"];

/** Which kind of action counts as which: Attack, Defense (Block and Maneuver) or Rest. */
export const KIND_GROUP: Record<ActionType, "attack" | "defense" | "rest"> = {
  attack: "attack", block: "defense", maneuver: "defense", rest: "rest",
};

const WEIGHTS: WeaponTier[] = ["baseline", "light", "normal", "heavy"];

export interface ActionDef {
  name: string;
  type: ActionType;
  /** Its own weight, for an Attack or Block. Otherwise the fighter's weapon. */
  weight?: WeaponTier;
  ranged: boolean;
  /** For a Maneuver: closes in on you, backs off, or whichever its current line calls for. */
  dir?: "advance" | "retreat" | "by-line";
  /** Conditions that must all hold for it to be available. */
  needs: string[];
  /** Rules it triggers (`#tag`), e.g. "waxing". */
  tags: string[];
}

export interface StanceDef {
  name: string;
  /** Actions it can follow ("Recover" included), or "all". */
  from: "all" | Set<string>;
  /** The actions it allows, grouped by kind (`/` in the notation). */
  groups: ActionDef[][];
}

export interface Pattern {
  label: string;
  actions: Map<string, ActionDef>;
  stances: StanceDef[];
  /** The stances that can follow each action ("recover" included), worked out once. */
  after: Map<string, StanceDef[]>;
}

export class PatternError extends Error {}

/** Parses a pattern written in the notation above, and checks it for typos and dead ends. */
export function parsePattern(label: string, src: string): Pattern {
  const fail = (msg: string): never => { throw new PatternError(`${label}: ${msg}`); };
  const actions = new Map<string, ActionDef>();
  const stanceLines: { from: string; name: string; to: string; line: number }[] = [];
  let section: "actions" | "stances" | null = null;

  src.split("\n").forEach((raw, i) => {
    const line = raw.replace(/\/\/.*/, "").trim(); // "//" starts a comment
    if (!line) return;
    const lower = line.toLowerCase();
    if (lower === "actions:" || lower === "stances:") { section = lower.slice(0, -1) as "actions" | "stances"; return; }
    if (section === "actions") {
      const m = line.match(/^(.+?):\s*(.+)$/);
      if (!m) fail(`line ${i + 1}: expected "Name: kind, modifiers", got "${line}"`);
      const [, name, rest] = m!;
      const words = rest.split(",").map(w => w.trim().toLowerCase()).filter(Boolean);
      const type = words.shift() as ActionType;
      if (!ACTION_KINDS.includes(type)) fail(`action "${name}": unknown kind "${type}" (use ${ACTION_KINDS.join(", ")})`);
      const def: ActionDef = { name: name.trim(), type, ranged: false, needs: [], tags: [] };
      for (const w of words) {
        if ((WEIGHTS as string[]).includes(w)) def.weight = w as WeaponTier;
        else if (w === "ranged") def.ranged = true;
        else if (w === "advance" || w === "retreat" || w === "by-line") def.dir = w;
        else if (w.startsWith("*")) def.needs.push(w.slice(1));
        else if (w.startsWith("#")) def.tags.push(w.slice(1));
        else fail(`action "${name}": unknown modifier "${w}"`);
      }
      if (def.type === "maneuver" && !def.dir) fail(`Maneuver "${name}" needs a direction: advance, retreat or by-line`);
      if (def.type !== "maneuver" && def.dir) fail(`"${name}" isn't a Maneuver, so it can't have a direction`);
      if (actions.has(def.name.toLowerCase())) fail(`action "${name}" is defined twice`);
      actions.set(def.name.toLowerCase(), def);
    } else if (section === "stances") {
      const parts = line.split(">").map(p => p.trim());
      if (parts.length !== 3 || parts.some(p => !p)) fail(`line ${i + 1}: expected "Comes from > Stance > Leads to", got "${line}"`);
      stanceLines.push({ from: parts[0], name: parts[1], to: parts[2], line: i + 1 });
    } else {
      fail(`line ${i + 1}: write "actions:" or "stances:" before "${line}"`);
    }
  });

  const find = (name: string, where: string): ActionDef => {
    const a = actions.get(name.trim().toLowerCase());
    if (!a) fail(`${where}: no action named "${name.trim()}"`);
    return a!;
  };

  const stances: StanceDef[] = stanceLines.map(({ from, name, to, line }) => {
    const where = `stance "${name}" (line ${line})`;
    let fromSet: StanceDef["from"];
    if (from.toLowerCase() === "all") fromSet = "all";
    else {
      fromSet = new Set<string>();
      for (const n of from.split(/[/,]/).map(x => x.trim()).filter(Boolean)) {
        if (n.toLowerCase() === "recover" || n.toLowerCase() === "second phase") fromSet.add(n.toLowerCase());
        else fromSet.add(find(n, where).name.toLowerCase());
      }
    }
    const groups = to.split("/").map(g => g.split(",").map(n => find(n, where)));
    for (const g of groups) {
      const kinds = new Set(g.map(a => KIND_GROUP[a.type]));
      if (kinds.size > 1) fail(`${where}: "${g.map(a => a.name).join(", ")}" mixes kinds of action; separate kinds with "/"`);
    }
    const kinds = groups.map(g => KIND_GROUP[g[0].type]);
    if (new Set(kinds).size !== kinds.length) fail(`${where}: the same kind of action appears in two groups; join them with ","`);
    return { name, from: fromSet, groups };
  });

  // No dead ends: Recover, and every action a stance can lead to, must lead to some stance.
  const leadsSomewhere = (n: string) => stances.some(s => s.from === "all" || s.from.has(n));
  if (!leadsSomewhere("recover")) fail(`no stance comes from Recover (or All), so it can't open a fight or recover from a stagger`);
  for (const s of stances) for (const g of s.groups) for (const a of g) {
    if (!leadsSomewhere(a.name.toLowerCase())) fail(`"${a.name}" (from stance "${s.name}") doesn't lead to any stance`);
  }
  if (new Set(stances.map(s => s.name.toLowerCase())).size !== stances.length) fail(`a stance name is used twice`);

  // What can follow each action, looked up every time an enemy picks.
  const after = new Map<string, StanceDef[]>();
  for (const key of ["recover", "second phase", ...actions.keys()]) {
    const next = stances.filter(s => s.from === "all" || s.from.has(key));
    if (next.length) after.set(key, next);
  }
  return { label, actions, stances, after };
}

/** What happened with the last action, as far as picking the next stance is concerned. */
export interface PatternMemory {
  /** The action's name, if it had one. */
  action?: string;
  outcome: "done" | "undone" | "recover";
}

const pick = <T>(items: readonly T[], rng: () => number): T => items[Math.floor(rng() * items.length)];

/** The stances that can follow the last action (or the Recover stances at the start of a fight). */
export function nextStances(p: Pattern, last: PatternMemory | null): StanceDef[] {
  const key = last && last.outcome === "done" && last.action ? last.action.toLowerCase() : "recover";
  const known = p.after.get(key);
  if (known) return known;
  // Not an action of its own (or one nothing follows): only the "All >" stances, or else Recover's.
  const any = p.stances.filter(s => s.from === "all");
  return any.length ? any : p.after.get("recover")!;
}

/** Within a stance: a kind evenly among the available ones, then an action of that kind evenly. */
export function pickAction(stance: StanceDef, available: (a: ActionDef) => boolean, rng: () => number): ActionDef | null {
  const groups = stance.groups.map(g => g.filter(available)).filter(g => g.length);
  if (!groups.length) return null;
  return pick(pick(groups, rng), rng);
}

/**
 * The next stance and action. Falls back to the Recover stances when the picked stance has
 * nothing available; returns null only if no Recover stance has anything available either.
 */
export function choose(
  p: Pattern,
  last: PatternMemory | null,
  available: (a: ActionDef) => boolean,
  rng: () => number,
): { stance: StanceDef; action: ActionDef } | null {
  const stance = pick(nextStances(p, last), rng);
  const action = pickAction(stance, available, rng);
  if (action) return { stance, action };
  // Safety net: act as if it just Recovered.
  const open = nextStances(p, null).filter(s => s.groups.some(g => g.some(available)));
  if (!open.length) return null;
  const again = pick(open, rng);
  return { stance: again, action: pickAction(again, available, rng)! };
}
