/**
 * Journeying.tsx — exploration, with fights: walk the map, and touching an enemy opens its fight.
 * Win and you're back where you stood with it gone, and what it carried is yours; fall and you
 * wake by the keeper you last rested by, having lost all your gear but the eternal. You set out
 * with nothing: a new game opens inside the guide's lesson, a fight in the dark.
 */
import { useState } from "react";
import { CombatScreen } from "../combat/CombatScreen";
import { newFight } from "../combat/fight";
import { LESSON } from "../combat/lesson";
import { ENCOUNTERS } from "../core/encounters";
import type { CombatState, EnemySetup, Opening } from "../core/types";
import { Exploration, type Journey } from "../explore/Exploration";
import { type MapFoe, wakeEnemies, withCorpses } from "../explore/foes";
import { dropsOf, EMPTY_INVENTORY, gotNote, loadoutOf, lose } from "../explore/gear";
import type { GroundItem } from "../explore/pickups";
import { clearSave, loadJourney, saveJourney } from "../explore/save";
import { knotCharges, NEW_TUTORIAL } from "../explore/tutorial";

/** `lesson`: the guide's tutorial fight (no map enemies; see combat/lesson.ts). */
type Fight = { id: number; foes: MapFoe[]; state: CombatState; opening?: Opening; backTo: Journey; lesson?: boolean; wake?: boolean };

/**
 * The enemies of these map enemies, together. The one that touched you (the first map enemy's first) starts
 * on the front line, everyone else behind it. (A fight with an opening scene, the Warden's, keeps its own lines.)
 */
function enemiesOf(foes: MapFoe[]): EnemySetup[] {
  const all = foes.flatMap(f => f.fight);
  if (all.some(e => e.offering)) return all;
  // (The parts of one body share a line, so they all go with the first.)
  return foes.flatMap((f, i) => f.fight.map((e, j) => ({ ...e, line: i === 0 && (j === 0 || e.body) ? "front" as const : "back" as const })));
}

/** The guide's lesson: its fight is the Test combat "tutorial" encounter, with what you wear (nothing, at first), and it can't be lost. */
const lessonFight = (backTo: Journey) =>
  newFight(ENCOUNTERS.find(e => e.id === "tutorial")!.enemies, loadoutOf(backTo.inventory), knotCharges(backTo.knot), { sparring: true });

/** A fight against these map enemies as you are now: what you wear and the knot's revive. */
const fightFor = (foes: MapFoe[], backTo: Journey) =>
  newFight(enemiesOf(foes), loadoutOf(backTo.inventory), knotCharges(backTo.knot));

/** A new game that skips the tutorial, for testing: the lesson is behind you, and all that is left is to rest with the guide. */
function skippedTutorial(): Journey {
  return { defeated: [], taken: [], tutorial: { beaten: true, done: false }, inventory: EMPTY_INVENTORY };
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
  // A game whose lesson is not passed opens inside it: you wake in the dark as the guide comes.
  const [fight, setFight] = useState<Fight | null>(() => (journey.tutorial.beaten ? null : { id: 1, foes: [], ...lessonFight(journey), backTo: journey, lesson: true, wake: true }));
  const [visit, setVisit] = useState(0);

  if (fight) {
    const { backTo, foes } = fight;
    return (
      <CombatScreen
        key={fight.id}
        initial={fight.state}
        opening={fight.opening}
        lesson={fight.lesson ? LESSON : undefined}
        wakeUp={fight.wake}
        wonText={fight.lesson ? "The lesson is over" : undefined}
        onRetry={() => setFight(f => f && { ...f, id: f.id + 1, wake: false, ...(f.lesson ? lessonFight(f.backTo) : fightFor(f.foes, f.backTo)) })}
        onExit={() => leave(backTo)}
        onDone={(won, charges) => {
          if (fight.lesson) {
            // The lesson can't be lost. Passed, you are on the map, in the labyrinth's first room.
            setJourney(won ? { ...backTo, tutorial: { ...backTo.tutorial, beaten: true } } : backTo);
            setFight(null);
            setVisit(v => v + 1);
            return;
          }
          // A knot that kept you from fading is spent, whether you then won or not.
          const knot = backTo.knot && (charges > 0 ? "wound" : "unwound");
          if (won) {
            // Back where you stood, the enemy gone, and what it carried yours.
            // What they carried lies where they fell, to pick up.
            const dropped: GroundItem[] = Object.entries(backTo.fallen ?? {}).flatMap(([key, c]) =>
              dropsOf([{ kind: c.kind }]).map((gear, i) => ({ id: `drop-${key}-${i}-${Date.now()}`, at: { x: c.x, y: c.y, z: c.alt }, gear, from: key })),
            );
            setJourney({
              ...backTo,
              knot,
              defeated: [...backTo.defeated, ...foes.map(f => f.id)],
              // They lie where they fell.
              corpses: { ...backTo.corpses, ...backTo.fallen },
              fallen: undefined,
              ground: [...(backTo.ground ?? []), ...dropped],
              found: dropped.length ? gotNote("Dropped", dropped.map(d => d.gear), []) : undefined,
            });
          } else {
            // Wake by the keeper you last rested by (or at the start). Your progress stays, but the
            // gear you carried is gone. Coming back counts as a rest: the sleepwalkers get up again
            //, and the knot is wound again.
            const woke = wakeEnemies({ corpses: withCorpses(backTo.corpses ?? {}, backTo.defeated), defeated: backTo.defeated });
            setJourney({
              ...woke,
              taken: backTo.taken,
              rested: backTo.rested,
              tutorial: backTo.tutorial,
              knot: backTo.knot && "wound",
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
      onSave={saveJourney}
      onEncounter={(foes, backTo) => {
        saveJourney(backTo);
        setFight(f => ({ id: (f?.id ?? 0) + 1, foes, ...fightFor(foes, backTo), backTo }));
      }}
      onExit={leave}
    />
  );
}
