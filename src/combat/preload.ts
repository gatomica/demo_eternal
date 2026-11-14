/**
 * preload.ts — getting a fight ready before it opens, so that its first turns do not stall: the combat's sounds (Tone.js and its reverb rooms), the
 * map's sounds, the music it will play (fetched and decoded) and, for the Penitent Warden, his 3D pose rigs (each worked out the first time it is shown).
 * Everything here is kept once it is done, so asking again, for a retry or for a second fight, is instant.
 */
import { useCallback, useRef, useState } from "react";
import { preloadMusic, type Track } from "../audio/music";
import { sfxReady } from "../audio/sfx";
import { walkReady } from "../audio/walk";
import { warmWardenPose } from "../render/Warden3D";
import { WARDEN_STANCE, wardenRig } from "../warden/pose3d";

/** What a fight is: the tutorial (its music is the menu's, already loaded), the Penitent Warden's (two halves of one track), or an ordinary one. */
export interface FightKind { warden?: boolean; lesson?: boolean }

/** The music a fight starts with. */
export const musicFor = ({ warden, lesson }: FightKind): Track => (lesson ? "church" : warden ? "wardenOne" : "dungeon");

/** Whether any of these enemies (their kinds) is the Penitent Warden. */
export const hasWarden = (kinds: readonly string[]) => kinds.includes("warden");

let wardenWarm: Promise<void> | null = null;
/**
 * Works out every pose of the Warden's rig, and all of each pose's drawing that the camera does not change (`warmWardenPose`: some 70 ms a pose, which would
 * otherwise stall the fight the first time he takes it up), a pose at a time so the page stays alive.
 */
function warmWarden(): Promise<void> {
  wardenWarm ??= new Promise<void>(done => {
    const names = Object.keys(WARDEN_STANCE);
    let i = 0;
    const next = () => {
      const stop = performance.now() + 8;
      while (i < names.length && performance.now() < stop) { wardenRig(names[i]); warmWardenPose(names[i++]); }
      if (i < names.length) setTimeout(next, 0);
      else done();
    };
    next();
  });
  return wardenWarm;
}

/**
 * Makes ready what a fight of this kind needs. `onProgress` is told how far along it is (0 to 1). Never rejects: what fails to load is left to
 * load (or not) when it is wanted, as it would have been.
 */
export async function preloadFight(kind: FightKind, onProgress?: (share: number) => void): Promise<void> {
  const jobs: Promise<unknown>[] = [sfxReady(), walkReady(), preloadMusic(musicFor(kind))];
  if (kind.warden) jobs.push(warmWarden(), preloadMusic("wardenTwo"));
  let done = 0;
  onProgress?.(0);
  await Promise.all(jobs.map(j => j.catch(() => undefined).then(() => onProgress?.(++done / jobs.length))));
}

/** Starts the slow parts quietly (when the map opens), so a fight that comes up finds them done. Not waited for. */
export function warmFights() {
  void preloadFight({});
}

/**
 * Starts a fight behind the loading step: `gate(kind, go)` makes the fight ready and then calls `go`. `progress` is null until the step has taken
 * long enough to be worth showing (a fight that is already ready opens with no flash of it), then how far along it is. One at a time.
 */
export function useFightGate() {
  const [progress, setProgress] = useState<number | null>(null);
  const busy = useRef(false);
  const gate = useCallback((kind: FightKind, go: () => void) => {
    if (busy.current) return;
    busy.current = true;
    let shown = false;
    const timer = window.setTimeout(() => { shown = true; setProgress(0); }, 150);
    void preloadFight(kind, share => { if (shown) setProgress(share); }).then(() => {
      window.clearTimeout(timer);
      busy.current = false;
      setProgress(null);
      go();
    });
  }, []);
  return { progress, gate };
}
