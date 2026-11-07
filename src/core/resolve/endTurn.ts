/**
 * endTurn.ts — a turn's last phase: falls and staggers settle, revives are
 * spent, each enemy remembers how its action went, and each kind's own rules have their say.
 */
import { kindOf } from "../bestiary";
import { stanceAfter } from "../stance";
import { backOnFeet, fatigueGone } from "./statuses";
import type { Turn } from "./turn";

export function endTurn(t: Turn) {
  const { p, s, alive, fighters } = t;
  for (const e of alive) {
    if (!e.alive) continue; // (gone with a boss that fell for good, say)
    if (t.fallen.has(e.id) && e.revives > 0) {
      // A boss with a revive left rises at once, at the end of the turn it fell: full health, fresh, like a boss (no turn spent lying there).
      e.revives -= 1;
      e.hp = e.maxHP;
      e.fatigue = 0;
      e.death = 0;
      e.staggered = false;
      e.reviving = false;
      backOnFeet(e);
      t.fellReviving.add(e.id);
      t.emit({ kind: "revive", who: e.id });
    } else if (t.fallen.has(e.id)) {
      e.alive = false;
      e.fate = "fallen";
      e.hp = 0;
      e.fatigue = 0;
      kindOf(e).onDeath?.({ self: e, state: s, event: t.emit });
    } else if (!e.staggered && e.fatigue >= e.hp) {
      e.staggered = true;
      t.emit({ kind: "stagger", who: e.id });
    }
  }

  p.reviving = false;
  let revivedNow = false;
  if (p.hp <= 0) {
    if (p.charges > 0) {
      // A charge is spent, and you are up again at once, at the end of the turn you fell: back to full health, fresh (no turn spent lying there).
      p.charges -= 1;
      p.hp = p.maxHP;
      p.fatigue = 0;
      p.death = 0;
      p.staggered = false;
      backOnFeet(p);
      revivedNow = true;
      t.emit({ kind: "revive", who: p.id });
    } else {
      p.hp = 0;
      s.status = "lost";
      t.emit({ kind: "defeat", who: p.id, by: t.hurtBy });
    }
  } else if (!p.staggered && p.fatigue >= p.hp) {
    p.staggered = true;
    t.emit({ kind: "stagger", who: p.id });
  }
  // Your stance for the next turn: what you did decides it, unless it did not happen (you were put down first), and a stagger or a fall
  // leaves you in idle (to kneel, and to stand up again).
  if (p.hp <= 0 || p.staggered || revivedNow) { p.stance = "idle"; p.lastAction = undefined; }
  else if (t.act && !t.out.has(p.id) && !t.cancelled.has(p.id)) {
    p.stance = stanceAfter(t.act, t.swing);
    // (A Rest broken by a blow was no rest.)
    p.lastAction = t.act.type === "rest" && t.interrupted.has(p.id) ? undefined : t.act.type;
  } else p.lastAction = undefined;
  // Wax only lasts while there's Fatigue to hold it (a staggered fighter keeps it until it recovers).
  for (const f of fighters) if ((f.waxed || f.coated) && f.fatigue <= 0 && !f.staggered) fatigueGone(f);
  // Whom each one attacked this turn (the Jagged Chisel bites deeper into them if it attacks them again next turn).
  for (const f of fighters) f.lastTarget = t.attacked.get(f.id);
  // Back on its feet, the wax sealing it breaks away.
  for (const f of fighters) if (f.encased && !f.staggered) f.encased = false;
  t.pinStaggered();
  t.endStep();

  // How each enemy's action went, for what it can do next turn.
  for (const e of alive) {
    if (!e.alive) continue;
    const { type, forced } = e.intent;
    const flinched = type === "rest" && t.interrupted.has(e.id);
    const undone = t.cancelled.has(e.id) || flinched;
    e.last = {
      name: e.intent.action,
      outcome: forced ? "recover" : undone ? "undone" : "done",
      blocked: type === "block" ? t.blocked.has(e.id) : undefined,
      // (A flinched unit recovers into a stance other than the one it was flinched out of.)
      flinchedFrom: flinched && !forced ? e.intent.stance : undefined,
    };
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

  if (s.enemies.every(e => !e.alive) && s.status === "playing") s.status = "won";
}
