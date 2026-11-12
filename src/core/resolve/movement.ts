/**
 * movement.ts — a turn's third phase: who ends up on which line.
 *
 * A Maneuver pulls its target closer and pushes its opponents away (never its allies): yours
 * brings your target to the front line and sends every other enemy back; an enemy's either
 * closes in on you or backs off. Each enemy's distance from you is settled on its own: if you
 * both Maneuvered and disagree, you both move but the distance stays. A melee attack closes in
 * on its target only if the target didn't Maneuver. An enemy striking an ally on the other line tries to step onto it, settled like
 * a Maneuver of its own. A Maneuver costs nothing in itself: only the
 * attacks it dodged tired you.
 */
import { bodyOf, leaderOf } from "../body";
import type { Enemy, Line } from "../types";
import type { Turn } from "./turn";

export function resolveMovement(t: Turn) {
  const { p, act, alive } = t;
  const before = new Map(alive.map(e => [e.id, e.line]));
  const movedBy = new Map<string, string>();
  const place = (e: Enemy, line: Line, by: string) => {
    e.line = line;
    movedBy.set(e.id, by);
  };
  const youMove = act?.type === "maneuver" && !t.out.has(p.id);
  if (youMove) t.emit({ kind: "maneuver", who: p.id, target: act!.target === "self" ? undefined : act!.target });
  for (const e of alive) {
    if (e.intent.type !== "maneuver") continue;
    if (t.out.has(e.id)) { t.cancelled.add(e.id); continue; }
    // Aimed at an ally that is already gone: nothing to reach.
    const ally = e.intent.target ? t.s.enemies.find(x => x.id === e.intent.target) : undefined;
    if (e.intent.target && (!ally || !ally.alive || t.fallen.has(ally.id))) {
      t.cancelled.add(e.id);
      t.emit({ kind: "canceled", who: e.id, action: "maneuver", reason: "no target" });
      continue;
    }
    t.emit({ kind: "maneuver", who: e.id, target: e.intent.target ?? (e.intent.dir === "advance" ? p.id : undefined) });
  }
  for (const e of alive) {
    if (t.fallen.has(e.id)) continue;
    // The parts of a multi-target enemy move as one: your Maneuver or melee hit on any part moves them all, and
    // only its leader (the middle one) moves the body with its own Maneuver.
    const mates = bodyOf(alive, e);
    const lead = leaderOf(mates.filter(m => !t.fallen.has(m.id)));
    const yours: Line | null = youMove ? (mates.some(m => m.id === act!.target) ? "front" : "back") : null;
    const its: Line | null = lead.intent.type === "maneuver" && !t.out.has(lead.id) && !t.cancelled.has(lead.id) ? (lead.intent.dir === "advance" ? "front" : "back") : (t.shifts.get(lead.id) ?? null);
    const pulled = mates.find(m => t.pulls.has(m.id));
    if (yours && its) { if (yours === its) place(e, yours, p.id); }
    else if (yours) place(e, yours, p.id);
    else if (its) place(e, its, lead.id);
    else if (pulled) place(e, "front", t.pulls.get(pulled.id)!);
  }
  for (const e of alive) {
    const from = before.get(e.id)!;
    if (!t.fallen.has(e.id) && from !== e.line) t.emit({ kind: "move", who: e.id, from, to: e.line, cause: movedBy.get(e.id)! });
  }
}
