/**
 * TestCombat.tsx — Test combat: pick a loadout and the enemies (as many of each non-boss enemy as you like, or a ready-made encounter), then fight.
 */
import { useState } from "react";
import { CombatScreen } from "../combat/CombatScreen";
import { newFight } from "../combat/fight";
import { FightLoading } from "../combat/FightLoading";
import { LESSON } from "../combat/lesson";
import { hasWarden, useFightGate } from "../combat/preload";
import { ENCOUNTERS, enemiesOfCounts } from "../core/encounters";
import type { CombatState, EnemySetup, Opening } from "../core/types";
import { loadoutOfItems, type Picks } from "../explore/items";
import { CUSTOM, type FoeSetup, SetupScreen } from "../ui/SetupScreen";

/** The starting gear to wear (any piece, or none) and the enemies to face with it. */
type Setup = Picks & FoeSetup & { encounterId: string };

/** The fight the setup calls for: its enemies, your revives, whether it is the lesson. */
function fightOf(setup: Setup): { enemies: EnemySetup[]; charges?: number; lesson?: boolean; wonText?: string } {
  if (setup.encounterId === CUSTOM) return { enemies: enemiesOfCounts(setup.counts ?? {}) };
  return ENCOUNTERS.find(e => e.id === setup.encounterId)!;
}

function startFight(setup: Setup) {
  const fight = fightOf(setup);
  return newFight(fight.enemies, loadoutOfItems(setup), fight.charges, fight.lesson ? { sparring: true } : {});
}

export function TestCombat({ onExit }: { onExit: () => void }) {
  const [setup, setSetup] = useState<Setup>({ weaponItem: "shortsword", armorItem: "bronze-chestplate", headItem: "helm", encounterId: CUSTOM, counts: { sleepwalker: 1 } });
  // `id` gives every new fight a fresh screen state.
  const [run, setRun] = useState<{ id: number; state: CombatState; opening?: Opening } | null>(null);
  const { progress, gate } = useFightGate();
  // (The fight's sounds, music and figures are made ready first: a retry finds them done.)
  const start = () => {
    const fight = fightOf(setup);
    // (no enemies counted out: nothing to fight)
    if (!fight.enemies.length) return;
    gate({ warden: hasWarden(fight.enemies.map(e => e.kind)), lesson: fight.lesson }, () => setRun(r => ({ id: (r?.id ?? 0) + 1, ...startFight(setup) })));
  };

  if (!run) return <><SetupScreen setup={setup} onChange={setSetup} onStart={start} onExit={onExit} />{progress !== null && <FightLoading progress={progress} />}</>;
  const fight = fightOf(setup);
  return <><CombatScreen music key={run.id} initial={run.state} opening={run.opening} onRetry={start} onChangeLoadout={() => setRun(null)} wonText={fight.wonText} lesson={fight.lesson ? LESSON : undefined} onExit={onExit} />{progress !== null && <FightLoading progress={progress} />}</>;
}
