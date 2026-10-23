/**
 * Journeying.tsx — exploration, with fights: walk the map, and touching an enemy opens its fight.
 * Win and you're back where you stood with it gone, and what it carried is yours; fall and you
 * wake by the keeper you last rested by, having lost all your gear but the eternal. You set out
 * with nothing: the guide's first fight, against the Waxed in the start room, is also its lesson.
 */
import { useState } from "react";
import { CombatScreen } from "../combat/CombatScreen";
import { newFight } from "../combat/fight";
import { TRAINING_STEPS, tipAfter } from "../combat/training";
import type { CombatState, Opening } from "../core/types";
import { Exploration, type Journey } from "../explore/Exploration";
import type { MapFoe } from "../explore/foes";
import { dropsOf, EMPTY_INVENTORY, gotNote, loadoutOf, lose, receive } from "../explore/gear";
import { PICKUPS } from "../explore/pickups";
import { clearSave, loadJourney, saveJourney } from "../explore/save";
import { knotCharges, NEW_TUTORIAL, TUTORIAL_FOE } from "../explore/tutorial";

type Fight = { id: number; foes: MapFoe[]; state: CombatState; opening?: Opening; backTo: Journey };

/** The enemies of these map enemies, together. */
const enemiesOf = (foes: MapFoe[]) => foes.flatMap(f => f.fight);

/** Whether this is the guide's lesson. */
const isLesson = (foes: MapFoe[]) => foes.some(f => f.id === TUTORIAL_FOE);

/** A fight as you are now: what you wear, the knot's revive, and the lesson's safety until it's learned. */
const fightFor = (foes: MapFoe[], backTo: Journey) =>
  newFight(enemiesOf(foes), loadoutOf(backTo.inventory), knotCharges(backTo.knot), isLesson(foes) ? { sparring: true } : {});

/**
 * A new game that skips the tutorial, for testing: the lesson is behind you (the Waxed beaten, the
 * broken sword in hand), and all that is left is to rest with the guide.
 */
function skippedTutorial(): Journey {
  const sword = PICKUPS.find(p => p.id === "broken-sword")!;
  return {
    defeated: [TUTORIAL_FOE],
    taken: [sword.id],
    tutorial: { greeted: true, beaten: true, done: false, attempts: 0 },
    inventory: receive(EMPTY_INVENTORY, [sword.gear]).inventory,
  };
}

export function Journeying({ fresh = false, skip = false, onExit }: { fresh?: boolean; skip?: boolean; onExit: () => void }) {
  // Where you left off, unless this is a new game.
  const [journey, setJourneyState] = useState<Journey>(() => {
    if (fresh || skip) clearSave();
    if (skip) return skippedTutorial();
    return (!fresh && loadJourney()) || { defeated: [], taken: [], tutorial: NEW_TUTORIAL, inventory: EMPTY_INVENTORY };
  });
  // Every change of where you stand is written down.
  const setJourney = (j: Journey) => { saveJourney(j); setJourneyState(j); };
  /** Back to the main menu, keeping `j`. */
  const leave = (j: Journey) => { saveJourney(j); onExit(); };
  // `id` gives every fight (and every return to the map) a fresh screen.
  // `foes`: the enemy that reached you plus everyone chasing you who piled in.
  const [fight, setFight] = useState<Fight | null>(null);
  // Just beat the lesson: back on the map, the guide's relief, and its asking you to rest with it.
  const [finale, setFinale] = useState(false);
  const [visit, setVisit] = useState(0);

  if (fight) {
    const { backTo, foes } = fight;
    return (
      <CombatScreen
        key={fight.id}
        initial={fight.state}
        opening={fight.opening}
        coach={isLesson(foes) ? { steps: TRAINING_STEPS, tipAfter } : undefined}
        onRetry={() => setFight(f => f && { ...f, id: f.id + 1, ...fightFor(f.foes, f.backTo) })}
        onExit={() => leave(backTo)}
        onDone={(won, charges) => {
          const lesson = isLesson(foes);
          // A knot that kept you from fading is spent, whether you then won or not.
          const knot = backTo.knot && (charges > 0 ? "wound" : "unwound");
          if (won) {
            // Back where you stood, the enemy gone, and what it carried yours.
            const drops = dropsOf(enemiesOf(foes));
            const { inventory, replaced } = receive(backTo.inventory, drops);
            setJourney({
              ...backTo,
              knot,
              defeated: [...backTo.defeated, ...foes.map(f => f.id)],
              tutorial: lesson ? { ...backTo.tutorial, beaten: true } : backTo.tutorial,
              inventory,
              found: drops.length ? gotNote("Dropped", drops, replaced) : undefined,
            });
            setFinale(lesson);
          } else {
            // Wake by the keeper you last rested by (or at the start). Your progress stays, but
            // the gear you carried is gone.
            setJourney({
              defeated: backTo.defeated,
              taken: backTo.taken,
              rested: backTo.rested,
              tutorial: lesson ? { ...backTo.tutorial, attempts: backTo.tutorial.attempts + 1 } : backTo.tutorial,
              knot,
              inventory: lose(backTo.inventory),
            });
          }
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
      finale={finale}
      onSave={saveJourney}
      onEncounter={(foes, backTo) => {
        saveJourney(backTo);
        setFinale(false);
        setFight(f => ({ id: (f?.id ?? 0) + 1, foes, ...fightFor(foes, backTo), backTo }));
      }}
      onExit={leave}
    />
  );
}
