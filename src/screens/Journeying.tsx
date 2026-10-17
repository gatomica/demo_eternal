/**
 * Journeying.tsx — exploration, with fights: walk the map, and touching an enemy opens its fight.
 * Win and you're back where you stood with it gone; fall and you wake by the keeper you last
 * rested by.
 */
import { useState } from "react";
import { CombatScreen } from "../combat/CombatScreen";
import { type Loadout, newFight } from "../combat/fight";
import type { CombatState, Opening } from "../core/types";
import { Exploration, type Journey } from "../explore/Exploration";
import type { MapFoe } from "../explore/foes";
import { SetupScreen } from "../ui/SetupScreen";

/** What you carry on the map, until you pick. */
const MAP_LOADOUT: Loadout = { weapon: "normal", armor: "light" };

export function Journeying({ onExit }: { onExit: () => void }) {
  // First, what you set out with.
  const [loadout, setLoadout] = useState<Loadout>(MAP_LOADOUT);
  const [setOut, setSetOut] = useState(false);
  const [journey, setJourney] = useState<Journey>({ defeated: [] });
  // `id` gives every fight (and every return to the map) a fresh screen.
  // `foes`: the enemy that reached you plus everyone chasing you who piled in.
  const [fight, setFight] = useState<{ id: number; foes: MapFoe[]; state: CombatState; opening?: Opening; backTo: Journey } | null>(null);
  const enemiesOf = (foes: MapFoe[]) => foes.flatMap(f => f.fight);
  const [visit, setVisit] = useState(0);

  if (!setOut) {
    return (
      <SetupScreen
        setup={loadout}
        onChange={setLoadout}
        onStart={() => setSetOut(true)}
        onExit={onExit}
        title="Exploration"
        startLabel="Set out"
      />
    );
  }

  if (fight) {
    return (
      <CombatScreen
        key={fight.id}
        initial={fight.state}
        opening={fight.opening}
        onRetry={() => setFight(f => f && { ...f, id: f.id + 1, ...newFight(enemiesOf(f.foes), loadout) })}
        onExit={onExit}
        onDone={won => {
          // Won: back where you stood, the enemy gone. Lost: wake by the keeper you last rested
          // by (or at the start); your progress stays.
          setJourney(won
            ? { ...fight.backTo, defeated: [...fight.backTo.defeated, ...fight.foes.map(f => f.id)] }
            : { defeated: fight.backTo.defeated, rested: fight.backTo.rested });
          setFight(null);
          setVisit(v => v + 1);
        }}
      />
    );
  }
  return (
    <Exploration
      key={visit}
      journey={journey}
      onEncounter={(foes, backTo) => setFight(f => ({ id: (f?.id ?? 0) + 1, foes, ...newFight(enemiesOf(foes), loadout), backTo }))}
      onExit={onExit}
    />
  );
}
