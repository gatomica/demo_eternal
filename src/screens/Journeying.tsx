/**
 * Journeying.tsx — exploration, with fights: walk the map, and touching an enemy opens its fight.
 * Win and you're back where you stood with it gone, and what it carried is yours; fall and you
 * wake by the keeper you last rested by, having lost all your gear but the eternal. There is no
 * tutorial fight: a new game opens on the map, and the control hints (`explore/hints.ts`) show how to
 * do things through the first fights.
 */
import { useEffect, useState } from "react";
import { CombatScreen } from "../combat/CombatScreen";
import { newFight } from "../combat/fight";
import { FightLoading } from "../combat/FightLoading";
import { hasWarden, useFightGate, warmFights } from "../combat/preload";
import type { CombatState, EnemySetup, Opening } from "../core/types";
import { Exploration, type Journey } from "../explore/Exploration";
import { START_STATS } from "../explore/empower";
import { type ClassId, startingInventory } from "../explore/items";
import { dropOffset, ETERNAL_SLOT, ETERNAL_STRING_CHANCE, MAP_FOES, type MapFoe, memberKey, wakeEnemies, withCorpses } from "../explore/foes";
import { ENEMY_KINDS } from "../core/bestiary";
import { dropsOf, loadoutOf, lose } from "../explore/gear";
import type { GroundItem } from "../explore/pickups";
import { clearSave, loadJourney, saveJourney } from "../explore/save";
import { knotCharges, NEW_TUTORIAL } from "../explore/tutorial";
import { resetHints, useHints } from "../explore/hints";

type Fight = { id: number; foes: MapFoe[]; state: CombatState; opening?: Opening; backTo: Journey };

/**
 * The enemies of these map enemies, together. The one that touched you (the first map enemy's first) starts
 * on the front line, everyone else behind it. (A fight with an opening scene, the Warden's, keeps its own lines.)
 */
function enemiesOf(foes: MapFoe[], holding: Record<string, number> = {}): EnemySetup[] {
  // (Whoever holds String you lost carries it into the fight: `holds`.)
  const holds = (key: string) => { const n = holding[key]; return n ? { holds: n } : {}; };
  const all = foes.flatMap(f => groupOf(f).map(({ setup, key }) => ({ ...setup, ...holds(key) })));
  if (all.some(e => e.offering)) return all;
  // (The parts of one body share a line, so they all go with the first.)
  return foes.flatMap((f, i) => groupOf(f).map(({ setup, key }, j) => ({ ...setup, ...holds(key), line: i === 0 && (j === 0 || setup.body) ? "front" as const : "back" as const })));
}

/**
 * A map enemy's members in its fight, each with its map key: those still up, or, for a group that `keepsDead` (the Warden's), all of
 * them, the ones dead for good lying dead from the start.
 */
function groupOf(f: MapFoe): { setup: EnemySetup; key: string }[] {
  const whole = f.keepsDead && f.members ? MAP_FOES.find(x => x.id === f.id) : undefined;
  if (whole) return whole.fight.map((setup, i) => ({ setup: f.members!.includes(i) ? setup : { ...setup, dead: true }, key: memberKey(f.id, i) }));
  return f.fight.map((setup, j) => ({ setup, key: memberKey(f.id, f.members?.[j] ?? j) }));
}

/** A fight against these map enemies as you are now: what you wear and the knot's revive. */
const fightFor = (foes: MapFoe[], backTo: Journey) =>
  newFight(enemiesOf(foes, backTo.held), loadoutOf(backTo.inventory), knotCharges(backTo.knot), {}, backTo.eternity, { maxHP: backTo.maxHP ?? START_STATS.maxHP, maxEternity: backTo.maxEternity ?? START_STATS.maxEternity });

/** The map keys of the enemies of these map enemies, in the fight's order (enemy `e3` is the fourth of them). */
const keysOf = (foes: MapFoe[]) => foes.flatMap(f => groupOf(f).map(g => g.key));

/** A new game that skips the tutorial, for testing: the lesson is behind you, and all that is left is to rest with the guide. */
function skippedTutorial(): Journey {
  return { defeated: [], taken: [], tutorial: { beaten: true, done: false }, inventory: startingInventory("soldier") };
}

export function Journeying({ fresh = false, skip = false, classId = "soldier", onExit }: { fresh?: boolean; skip?: boolean; /** A new game: the class you chose, and so what you carry from the start. */ classId?: ClassId; onExit: () => void }) {
  // Where you left off, unless this is a new game.
  const [journey, setJourneyState] = useState<Journey>(() => {
    if (fresh || skip) { clearSave(); resetHints(); }
    if (skip) return skippedTutorial();
    // (The tutorial fight is gone: a game is never inside it. A save from when it was still there, left before passing it, starts on the map too.)
    const saved = !fresh && loadJourney();
    // (Floor B's west room no longer has a keeper, "floor2": a save that woke there wakes at the first floor's.)
    if (saved) return { ...saved, tutorial: { ...saved.tutorial, beaten: true }, rested: saved.rested === "floor2" ? "floor1" : saved.rested };
    return { defeated: [], taken: [], tutorial: { ...NEW_TUTORIAL, beaten: true }, inventory: startingInventory(classId) };
  });
  // Every change of where you stand is written down.
  const setJourney = (j: Journey) => { saveJourney(j); setJourneyState(j); };
  /**
   * Falling (a lost fight, Reawaken, or falling through the map): you wake by the keeper you last rested by (or at the start). Your
   * progress stays, but the gear you carried is gone. Coming back counts as a rest: the sleepwalkers get up again, and the knot is
   * wound again.
   */
  const fall = (backTo: Journey, earned = 0, killer?: string, lostAt?: { x: number; y: number; alt: number }) => {
    // (The map wakes exactly as it does when you rest: see `wakeEnemies`. Falling also costs your ordinary gear.)
    const woke = wakeEnemies({ corpses: withCorpses(backTo.corpses ?? {}, backTo.defeated), defeated: backTo.defeated, ground: backTo.ground });
    // All your String is lost (what you carried and what this fight gave you), none of it gone for good: all of it is left on the enemy that killed you,
    // to be had when it is defeated, or, with no enemy to blame, lies where you last stood, to gather.
    const half = Math.floor((backTo.string ?? 0) + earned);
    const held = { ...backTo.held };
    let ground = woke.ground;
    if (half > 0 && killer) held[killer] = (held[killer] ?? 0) + half;
    else if (half > 0 && lostAt) ground = [...ground.filter(g => g.string === undefined), { id: `string-${Date.now()}`, at: { x: lostAt.x, y: lostAt.y, z: lostAt.alt }, string: half }];
    setJourney({
      ...woke,
      ground,
      string: 0,
      // (Eternal String is never lost, nor what you have raised in yourself.)
      eternalString: backTo.eternalString,
      maxHP: backTo.maxHP,
      maxEternity: backTo.maxEternity,
      held,
      taken: backTo.taken,
      rested: backTo.rested,
      lowered: backTo.lowered,
      tutorial: backTo.tutorial,
      knot: backTo.knot && "wound",
      inventory: lose(backTo.inventory),
      // (Reawakening fills your Eternity again.)
      eternity: undefined,
    });
  };
  /** Back to the main menu, keeping `j`. */
  const leave = (j: Journey) => { saveJourney(j); onExit(); };
  // `id` gives every fight (and every return to the map) a fresh screen.
  // `foes`: the enemy that reached you plus everyone chasing you who piled in.
  const [fight, setFight] = useState<Fight | null>(null);
  // The keys fade in and out in fights until you reach the dungeon proper.
  const hints = useHints();
  const [visit, setVisit] = useState(0);
  // The slow parts of a fight (its sounds, music and figures) are made ready quietly from the start, while you walk.
  const { progress, gate } = useFightGate();
  useEffect(() => { warmFights(); }, []);

  if (fight) {
    const { backTo, foes } = fight;
    return (
      <CombatScreen
        key={fight.id}
        initial={fight.state}
        opening={fight.opening}
        music
        hints={!hints.off}
        onRetry={() => setFight(f => f && { ...f, id: f.id + 1, ...fightFor(f.foes, f.backTo) })}
        onExit={() => leave(backTo)}
        string={backTo.string ?? 0}
        knotOwned={backTo.knot !== undefined}
        eternalString={backTo.eternalString ?? 0}
        onDone={(won, charges, eternity, result) => {
          // A knot that kept you from fading is spent, whether you then won or not.
          const knot = backTo.knot && (charges > 0 ? "wound" : "unwound");
          if (won) {
            // Back where you stood, the enemy gone, and what it carried yours.
            // What they carried lies where they fell, to pick up.
            // (Each a little way off in a direction of its own, so they don't lie in a heap. And a small chance of a lump of eternal string, as much as its max health.)
            const dropped: GroundItem[] = Object.entries(backTo.fallen ?? {}).flatMap(([key, c]) => {
              const at = (slot: number) => ({ x: c.x + dropOffset(key, slot).x, y: c.y + dropOffset(key, slot).y, z: c.alt });
              const items: GroundItem[] = dropsOf([{ kind: c.kind }])
                .map((gear, i) => ({ id: `drop-${key}-${i}-${Date.now()}`, at: at(i), gear: { ...gear, origin: key }, from: key }));
              // (A Wax Blob's other parts roll with its middle: one roll for the body. One that is sure to drop something has no roll.)
              const sure = foes.some(f => f.drop && key.startsWith(`${f.id}#`));
              if (!/^blob(Left|Right)/.test(c.kind) && !sure && Math.random() < ETERNAL_STRING_CHANCE) {
                items.push({ id: `eternal-${key}-${Date.now()}`, at: at(ETERNAL_SLOT), eternalString: ENEMY_KINDS[c.kind].maxHP });
              }
              return items;
            });
            // What a group is sure to drop (the Wax Blobs': eternal string, or the hammer blob's eternal memory), once, where its first member lies.
            for (const f of foes) {
              if (!f.drop) continue;
              const [key, c] = Object.entries(backTo.fallen ?? {}).find(([k]) => k.startsWith(`${f.id}#`)) ?? [];
              if (!key || !c) continue;
              const at = (slot: number) => ({ x: c.x + dropOffset(key, slot).x, y: c.y + dropOffset(key, slot).y, z: c.alt });
              if (f.drop.gear) dropped.push({ id: `special-${key}-${Date.now()}`, at: at(1), gear: f.drop.gear });
              if (f.drop.eternalString) dropped.push({ id: `special-string-${key}-${Date.now()}`, at: at(ETERNAL_SLOT), eternalString: ENEMY_KINDS[c.kind].maxHP });
            }
            setJourney({
              ...backTo,
              knot,
              // What the fight left of your Eternity: it doesn't fill again between fights.
              eternity,
              defeated: [...backTo.defeated, ...foes.map(f => f.id)],
              // The String they gave you (and what they held of what you lost, which is theirs no longer).
              string: (backTo.string ?? 0) + result.earned,
              held: Object.fromEntries(Object.entries(backTo.held ?? {}).filter(([key]) => !keysOf(foes).includes(key))),
              // They lie where they fell.
              corpses: { ...backTo.corpses, ...backTo.fallen },
              fallen: undefined,
              ground: [...(backTo.ground ?? []), ...dropped],
            });
          } else {
            // (`killedBy` is the enemy's id in the fight: e0, e1...)
            const killer = result.killedBy ? keysOf(foes)[Number(result.killedBy.slice(1))] : undefined;
            // Those you beat before you fell stay beaten, if they are ones that stay dead (the waxed): they lie where they fell (the
            // sleepwalkers get up as you reawaken anyway).
            const beaten = Object.fromEntries((result.fell ?? []).map(id => keysOf(foes)[Number(id.slice(1))]).filter(key => key && backTo.fallen?.[key] && !ENEMY_KINDS[backTo.fallen[key].kind].respawns).map(key => [key, backTo.fallen![key]]));
            // (Giving up has no killer: half the String is left where the fight began.)
            fall({ ...backTo, corpses: { ...backTo.corpses, ...beaten } }, result.earned, killer, killer || !backTo.at ? undefined : { x: backTo.at.x, y: backTo.at.y, alt: backTo.at.alt });
          }
          setFight(null);
          setVisit(v => v + 1);
        }}
      />
    );
  }
  return (
    <>
    <Exploration
      key={visit}
      journey={journey}
      onSave={saveJourney}
      onDie={(j, at) => { fall(j, 0, undefined, at); setVisit(v => v + 1); }}
      onEncounter={(foes, backTo) => {
        saveJourney(backTo);
        // (The fight opens once its sounds, music and figures are ready: at once, when the map has already warmed them.)
        gate({ warden: hasWarden(foes.flatMap(f => f.fight.map(e => e.kind))) }, () => setFight(f => ({ id: (f?.id ?? 0) + 1, foes, ...fightFor(foes, backTo), backTo })));
      }}
      onExit={leave}
    />
    {progress !== null && <FightLoading progress={progress} />}
    </>
  );
}
