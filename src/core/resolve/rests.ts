/**
 * rests.ts — a turn's second phase: revives land, and Rests settle. A damaging hit breaks a
 * voluntary Rest; the forced Rest after a stagger always ends the stagger.
 */
import { kindOf } from "../bestiary";
import { bodyOf } from "../body";
import { heal, restAmount } from "../rules";
import { backOnFeet, fatigueGone } from "./statuses";
import type { Turn } from "./turn";

export function settleRests(t: Turn) {
  const { p } = t;
  if (t.reviving) {
    // The revive lands at the end of the protected turn: back to full health, fresh, like a boss.
    p.hp = p.maxHP;
    p.fatigue = 0;
    p.death = 0;
    p.staggered = false;
    backOnFeet(p);
    t.emit({ kind: "revive", who: p.id });
  }
  for (const e of t.alive) {
    if (!t.foeReviving.has(e.id)) continue;
    // A boss rises again at full health.
    e.hp = e.maxHP;
    e.fatigue = 0;
    e.death = 0;
    e.staggered = false;
    e.reviving = false;
    t.emit({ kind: "revive", who: e.id });
  }
  // Something being done to you that keeps you down (Usurp Flame taking your flame, aimed at no ally):
  // that turn's forced Rest does not end your stagger. You stay down, sealed in wax, and get up with
  // the next forced Rest.
  const heldDown = t.alive.some(e => !!e.intent.action && !!kindOf(e).holdsTargetDown?.includes(e.intent.action) && !e.intent.target && !t.out.has(e.id));
  for (const [id, wasForced] of t.resting) {
    const f = t.byId(id)!;
    if (t.fallen.has(id)) continue;
    if (wasForced && f === p && heldDown && p.staggered) continue;
    if (wasForced) {
      // The forced Rest always ends the break, hit or not, with Fatigue back to 0.
      f.staggered = false;
      f.fatigue = 0;
      // With its Fatigue gone, so is everything that hung on it: the wax breaks away.
      backOnFeet(f);
      t.emit({ kind: "rest", who: id, result: "recovered", forced: true });
      continue;
    }
    if (t.hurt.has(id) || t.out.has(id)) {
      // A blow breaks the Rest: no recovery.
      t.interrupted.add(id);
      t.emit({ kind: "rest", who: id, result: "interrupted", forced: false });
      continue;
    }
    f.fatigue -= restAmount(f);
    if (f.fatigue < 0) {
      // Rested past zero Fatigue: half the excess heals.
      heal(f, -f.fatigue / 2);
      // (A part of a multi-target enemy heals the whole body.)
      for (const mate of bodyOf(t.s.enemies, f)) mate.hp = f.hp;
      f.fatigue = 0;
    }
    // (Resting rests the whole body: they share one bar.)
    for (const mate of bodyOf(t.s.enemies, f)) mate.fatigue = f.fatigue;
    if (f.fatigue <= 0) fatigueGone(f);
    t.emit({ kind: "rest", who: id, result: "rested", forced: false });
  }
  t.endStep();
}
