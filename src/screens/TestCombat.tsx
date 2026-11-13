/**
 * TestCombat.tsx — Test combat: pick a loadout and encounter, then fight.
 */
import { useState } from "react";
import { CombatScreen } from "../combat/CombatScreen";
import { newFight } from "../combat/fight";
import { FightLoading } from "../combat/FightLoading";
import { LESSON } from "../combat/lesson";
import { hasWarden, useFightGate } from "../combat/preload";
import { ENCOUNTERS } from "../core/encounters";
import type { CombatState, Opening } from "../core/types";
import { loadoutOfItems, type Picks } from "../explore/items";
import { SetupScreen } from "../ui/SetupScreen";

/** The starting gear to wear (any piece, or none) and the encounter to face with it. */
type Setup = Picks & { encounterId: string };

function startFight(setup: Setup) {
  const encounter = ENCOUNTERS.find(e => e.id === setup.encounterId)!;
  return newFight(encounter.enemies, loadoutOfItems(setup), encounter.charges, encounter.lesson ? { sparring: true } : {});
}

export function TestCombat({ onExit }: { onExit: () => void }) {
  const [setup, setSetup] = useState<Setup>({ weaponItem: "shortsword", armorItem: "bronze-chestplate", headItem: "helm", encounterId: "one" });
  // `id` gives every new fight a fresh screen state.
  const [run, setRun] = useState<{ id: number; state: CombatState; opening?: Opening } | null>(null);
  const { progress, gate } = useFightGate();
  // (The fight's sounds, music and figures are made ready first: a retry finds them done.)
  const start = () => {
    const encounter = ENCOUNTERS.find(e => e.id === setup.encounterId)!;
    gate({ warden: hasWarden(encounter.enemies.map(e => e.kind)), lesson: encounter.lesson }, () => setRun(r => ({ id: (r?.id ?? 0) + 1, ...startFight(setup) })));
  };

  if (!run) return <><SetupScreen setup={setup} onChange={setSetup} onStart={start} onExit={onExit} />{progress !== null && <FightLoading progress={progress} />}</>;
  const encounter = ENCOUNTERS.find(e => e.id === setup.encounterId);
  const wonText = encounter?.wonText;
  return <><CombatScreen music key={run.id} initial={run.state} opening={run.opening} onRetry={start} onChangeLoadout={() => setRun(null)} wonText={wonText} lesson={encounter?.lesson ? LESSON : undefined} onExit={onExit} />{progress !== null && <FightLoading progress={progress} />}</>;
}
