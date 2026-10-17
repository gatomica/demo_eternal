/**
 * intents.ts — how each enemy picks what it does next: stance, then action (see patterns.ts).
 */
import { ENEMY_KINDS } from "./bestiary";
import { type ActionDef, choose } from "./patterns";
import type { ActionType, CombatState, Enemy, Intent, Line, Rng } from "./types";

/** The intent for an enemy of this kind doing this action, shown in this stance (or none). */
export function describeAction(kindName: string, line: Line, stance: string | undefined, a: ActionDef): Intent {
  const kind = ENEMY_KINDS[kindName];
  const lineDir = line === "back" ? "advance" : "retreat";
  const dir = a.dir === "advance" || a.dir === "retreat" ? a.dir : lineDir;
  const poses = kind.actionPoses?.[a.name];
  return {
    type: a.type, dir, forced: false, stance, action: a.name,
    pose: stance ? kind.stancePoses[stance] ?? poses?.act : poses?.act,
    actPose: poses?.act, strikePose: poses?.strike, projectile: poses?.projectile, restPose: poses?.rest, guardPose: poses?.guard,
    weight: a.weight, ranged: a.ranged || undefined, tags: a.tags.length ? a.tags : undefined,
  };
}

/**
 * The next intent: forced Rest while staggered, a script step if there is one, otherwise the
 * kind's pattern (stance, then action; see patterns.ts).
 */
function chooseIntent(e: Enemy, state: CombatState, rng: Rng): Intent {
  const kind = ENEMY_KINDS[e.kind];
  const lineDir = e.line === "back" ? "advance" : "retreat";
  if (e.reviving) return { type: "rest", dir: lineDir, forced: true };
  if (e.staggered) return { type: "rest", dir: lineDir, forced: true };

  const describe = (stance: string | undefined, a: ActionDef) => describeAction(e.kind, e.line, stance, a);

  // Scripted turns show the action itself (the tutorial uses this to show every pose once).
  const step = e.script[state.turn - 1];
  if (step) {
    const all = [...kind.pattern.actions.values()];
    const a = all.find(x => x.name.toLowerCase() === step.toLowerCase()) ?? all.find(x => x.type === step);
    return a ? describe(undefined, a) : { type: step as ActionType, dir: lineDir, forced: false };
  }

  const available = (a: ActionDef) => a.needs.every(n => kind.conditions?.[n]?.(e, state) ?? false);
  // Something it must pick on from (a boss's second phase) overrides what it just did.
  const memory = e.nextFrom ? { action: e.nextFrom, outcome: "done" as const } : e.last ? { action: e.last.name, outcome: e.last.outcome } : null;
  e.nextFrom = undefined;
  const picked = choose(kind.pattern, memory, available, rng);
  // A fixed rule overrides the action (the stance still shows as picked).
  const fixed = kind.forced?.(e, state, rng);
  if (fixed) {
    const a = kind.pattern.actions.get(fixed.action.toLowerCase());
    if (a) {
      const intent = describe(picked?.stance.name, a);
      if (fixed.target && fixed.target !== "player") {
        // Aimed at an ally: it moves toward them, which pushes you away.
        intent.target = fixed.target;
        if (a.type === "maneuver") intent.dir = "retreat";
      }
      return intent;
    }
  }
  if (!picked) return { type: "rest", dir: lineDir, forced: false };
  return describe(picked.stance.name, picked.action);
}

/** Every enemy's next intent. Those with fixed rules decide last, so they can react to the rest. */
export function chooseIntents(state: CombatState, rng: Rng) {
  const order = [...state.enemies.filter(e => e.alive)].sort(
    (a, b) => Number(!!ENEMY_KINDS[a.kind].forced) - Number(!!ENEMY_KINDS[b.kind].forced),
  );
  for (const e of order) e.intent = chooseIntent(e, state, rng);
}
