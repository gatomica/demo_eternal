# Turn-based soulslike demo

A Vite + React 19 + TypeScript browser game, hosted on Netlify (`npm run build`, publishes `dist/`).
Three screens from the main menu: **Test combat** (pick a loadout and an encounter), **Exploration**
(walk a multi-floor map; touching an enemy starts its fight) and the **Model viewer** (one enemy,
its stances and actions, played against a dummy that never gets hurt).

The design doc is `docs/enemies.md`. Read it before changing rules or enemies, and
keep it up to date when a rule, enemy or map change is decided or built.

## Commands

- `npm run dev`: dev server.
- `npm run build`: production build (what Netlify runs). Type errors fail it, so run it after changes.
- `npx tsc --noEmit`: type-check only.

## Source map (`src/`)

- `core/`: the rules, no rendering.
  - `types.ts` (fighters, intents, events, steps, the fight's state), `rules.ts` (weapon and armor
    tables, costs, damage, Fatigue), `intents.ts` (how enemies pick), `setup.ts` (`createCombat`,
    `openingOf`: a fight's opening scene), `encounters.ts` (`ENCOUNTERS`).
  - `resolve/`: `resolveTurn`, one file per phase of a turn (`attacks`, `rests`, `movement`,
    `endTurn`) sharing a `Turn` (`turn.ts`); a turn resolves into `steps`, each with the events and
    an `after` snapshot of every fighter, which the screen plays back. `statuses.ts`: when Waxed
    and encased come and go.
  - `patterns.ts`: how enemies pick their next stance and action, parsed from the same notation
    as the design doc (`Comes from > Stance > Leads to`, action lines with `*Condition` and `#tag`).
  - `bestiary.ts`: `EnemyKind` (stats, pattern, poses, flags, hooks: `forced`, `afterTurn`,
    `onDirectHit`, `opening`, viewer statuses...) and the `ENEMY_KINDS` registry, checked when the
    game loads. `kinds/`: one file per enemy (`sleepwalker`, `waxed`, `warden`). The Penitent
    Warden's flame, phases, Usurp Flame and opening scene live in `kinds/warden.ts`.
- `combat/`: the combat screen. `CombatScreen.tsx` plays a turn back step by step (camera, poses,
  dodges and knockbacks, the Usurp Flame scene, the phase-two scene); `playback.ts` (timings,
  phases, `viewAt`, the per-turn step index), `selection.ts`, `ActionWheel.tsx`, `fight.ts`
  (`newFight`: your loadout, health and revives).
- `screens/`: the main menu, Test combat, the Model viewer (`viewerModel.ts`: what it shows and
  plays) and `Journeying` (exploration plus its fights). `ui/`: keys (`input.ts`), menus,
  pickers, the setup screen.
- `render/`: drawing. `camera.ts` (floor plan, camera, formations, shots), `poses.ts` (`POSES`,
  which pose a fighter shows; checks every kind's poses exist), `StickFigure.tsx` (stick figures,
  wax looks), `looks.ts` (what a `variant` draws differently: its own figure, candle arm, scenes),
  `Scene.tsx` (the field, figures, darkness, flames), `effects.tsx` (projectiles, shockwaves),
  `HealthBar.tsx`, `geom.ts`.
- `warden/`: the Warden's figure. `skeleton.ts` (`WARDEN_POSES`, built with `pose(...)` and its
  flags, `flailOf`), `parts.tsx` (cloak, hood, beard, flame, flail, candle arm), `trails.tsx`,
  `WardenFigure.tsx` (the layering), `look.ts`, `arena.tsx` (sealed sleepwalkers, lit in phase
  two), `scenes.ts` (`IGNITE` timings).
- `explore/`: the exploration map. `plans.ts` (`LEVEL_PLANS`, one ASCII plan per level on a
  shared grid, levels 0-1 below ground, 2 the ground floor, 3-6 above), `world.ts` (tiles,
  ramps), `movement.ts`, `sight.ts`, `paint.ts` (chunked level painting), `figures.ts` (map
  figures, `MAP_FIGURES` by kind), `foes.ts` (`MAP_FOES`, chasing), `keepers.ts` (`KEEPERS`, rest
  points), `tuning.ts`, `Exploration.tsx`.
- `index.css`: all styles.

### Adding an enemy

1. Write it in `core/kinds/<name>.ts` (pattern in the doc's notation, poses, hooks) and list it in
   `ENEMY_KINDS` (`core/bestiary.ts`). The game refuses it at load if its pattern or poses are broken.
2. New poses go in `render/poses.ts`; a figure of its own goes behind a `variant` in `render/looks.ts`.
3. Give it a map figure in `MAP_FIGURES` (`explore/figures.ts`): the type checker asks for one.

## Conventions

- Comments explain the rule or the look in plain words (why, and what the player sees). Keep that
  style; JSDoc on exported things and non-obvious helpers.
- Poses are tuned by eye with the user, often over many rounds. When changing one pose, leave every
  other pose exactly as it is.
- Visual changes: check them in the Model viewer (each stance, each action, Staggered, Flinch) and
  in a real Test combat fight. Mid-turn timing bugs (a pose flashing for a frame, a status shown too
  early) usually come from `viewAt` / step snapshots vs. the final `fight` state in `combat/CombatScreen.tsx`.
- Map plans: no floor should hang over another (except the original bridge over the hall); stairs
  sit on the lower level and point uphill, with floor past their top end on the level above.
- Don't change gameplay numbers or enemy patterns unless asked; propose them first.
