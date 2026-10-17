/**
 * endTurn.ts — a turn's last phase: Fatigue decays, falls and staggers settle, revives are
 * spent, each enemy remembers how its action went, and each kind's own rules have their say.
 */
import { kindOf } from "../bestiary";
import { backOnFeet, fatigueGone } from "./statuses";
import type { Turn } from "./turn";

export function endTurn(t: Turn) {
  const { p, s, alive, fighters } = t;
  for (const f of fighters) {
    if (!t.gained.has(f.id) && !f.staggered) f.fatigue /= 2;
    f.death /= 2; // nothing applies Death yet; kept so the rule is in place
  }
  for (const e of alive) {
    if (t.fallen.has(e.id) && e.revives > 0) {
      // A boss with a revive left: its protected turn is next, then it rises at full health.
      e.revives -= 1;
      e.reviving = true;
      e.hp = 0;
      e.fatigue = 0;
      e.death = 0;
      e.staggered = false;
      t.fellReviving.add(e.id);
    } else if (t.fallen.has(e.id)) {
      e.alive = false;
      e.fate = "fallen";
      e.hp = 0;
      e.fatigue = 0;
    } else if (!e.staggered && e.fatigue >= e.hp) {
      e.staggered = true;
      t.emit({ kind: "stagger", who: e.id });
    }
  }

  p.reviving = false;
  if (p.hp <= 0) {
    if (p.charges > 0) {
      // A charge is spent now, but the health only comes back at the end of next turn.
      p.charges -= 1;
      p.reviving = true;
      p.hp = 0;
      p.fatigue = 0;
      p.death = 0;
      p.staggered = false;
    } else {
      p.hp = 0;
      s.status = "lost";
      t.emit({ kind: "defeat", who: p.id });
    }
  } else if (!p.staggered && p.fatigue >= p.hp) {
    p.staggered = true;
    t.emit({ kind: "stagger", who: p.id });
  }
  // Wax only lasts while there's Fatigue to hold it (a staggered fighter keeps it until it recovers).
  for (const f of fighters) if (f.waxed && f.fatigue <= 0 && !f.staggered) fatigueGone(f);
  // Back on its feet, the wax sealing it breaks away.
  for (const f of fighters) if (f.encased && !f.staggered) f.encased = false;
  t.pinStaggered();
  t.endStep();

  // How each enemy's action went, for what it can do next turn.
  for (const e of alive) {
    if (!e.alive) continue;
    const { type, forced } = e.intent;
    const undone =
      t.cancelled.has(e.id) ||
      (type === "rest" && t.interrupted.has(e.id)) ||
      (type === "block" && !t.blockedSomething.has(e.id));
    e.last = { name: e.intent.action, outcome: forced ? "recover" : undone ? "undone" : "done" };
  }

  // Each kind's own rules (the Warden's flame, phases, Usurp Flame).
  for (const e of alive) {
    const kind = kindOf(e);
    if (!kind.afterTurn || !e.alive) continue;
    kind.afterTurn({
      self: e,
      state: s,
      action: e.intent.action,
      outcome: e.last?.outcome ?? "undone",
      staggered: e.staggered && !t.wasStaggered.has(e.id),
      fell: t.fellReviving.has(e.id),
      was: t.wasFlags.get(e.id)!,
      event: t.emit,
    });
  }
  t.endStep();
  if (t.recoverLast) {
    // The forced Rest ends the break, as always: the wax sealing you breaks away with it.
    p.staggered = false;
    p.fatigue = 0;
    backOnFeet(p);
    t.emit({ kind: "rest", who: p.id, result: "recovered", forced: true });
    t.endStep();
  }

  if (s.enemies.every(e => !e.alive) && s.status === "playing") s.status = "won";
}
