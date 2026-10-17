/**
 * TestCombat.tsx — Test combat: pick a loadout and encounter, then fight.
 */
import { useState } from "react";
import { CombatScreen } from "../combat/CombatScreen";
import { type Loadout, newFight } from "../combat/fight";
import { ENCOUNTERS } from "../core/encounters";
import type { CombatState, Opening } from "../core/types";
import { SetupScreen } from "../ui/SetupScreen";

/** A loadout and the encounter to face with it. */
type Setup = Loadout & { encounterId: string };

function startFight(setup: Setup) {
  const encounter = ENCOUNTERS.find(e => e.id === setup.encounterId)!;
  return newFight(encounter.enemies, setup, encounter.charges);
}

export function TestCombat({ onExit }: { onExit: () => void }) {
  const [setup, setSetup] = useState<Setup>({ weapon: "normal", armor: "normal", encounterId: "one" });
  // `id` gives every new fight a fresh screen state.
  const [run, setRun] = useState<{ id: number; state: CombatState; opening?: Opening } | null>(null);
  const start = () => setRun(r => ({ id: (r?.id ?? 0) + 1, ...startFight(setup) }));

  if (!run) return <SetupScreen setup={setup} onChange={setSetup} onStart={start} onExit={onExit} />;
  return <CombatScreen key={run.id} initial={run.state} opening={run.opening} onRetry={start} onChangeLoadout={() => setRun(null)} onExit={onExit} />;
}
