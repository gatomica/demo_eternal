/** The black screen shown while a fight is made ready (see `preload.ts`), in the map's loading style. */
export function FightLoading({ progress }: { progress: number }) {
  return <div className="fight-loading">Preparing the fight… {Math.round(progress * 100)}%</div>;
}
