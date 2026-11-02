# Turn-based soulslike demo

A Vite + React 19 + TypeScript browser game, hosted on Netlify (`npm run build`, publishes `dist/`).
Screens from the main menu: **Test combat** (pick a loadout and an encounter), **Exploration**
(walk a multi-floor map; touching an enemy starts its fight), the **Model viewer** (one enemy, its
stances and actions, played against a dummy that never gets hurt; an enemy with several targetable parts, like the Wax Blob, is shown as one body with all its parts at once, each with its own stance and actions; or "You": the player with any weapon
and armor, any pose held, and your actions played against a dummy Sleepwalker) and the **Map viewer**
(the map drawn exactly as the game draws it, with a free camera and no light radius: WASD pans, Q and E go down and up a level).

The design doc is `docs/enemies.md`. Read it before changing rules or enemies, and
keep it up to date when a rule, enemy or map change is decided or built.
What is planned but not built is in `docs/todo.md`: read it when starting a task from it, and update it when something is built or decided.

## Commands

- `npm run dev`: dev server.
- `npm run build`: production build (what Netlify runs). Type errors fail it, so run it after changes.
- `npx tsc -b`: type-check only. (Plain `npx tsc --noEmit` checks nothing here: the root tsconfig only has project references.)

## Source map (`src/`)

- `core/`: the rules, no rendering.
  - `types.ts` (fighters, intents, events, steps, the fight's state), `rules.ts` (weapon and armor
    tables, costs, damage, Fatigue), `intents.ts` (how enemies pick), `setup.ts` (`createCombat`,
    `openingOf`: a fight's opening scene), `encounters.ts` (`ENCOUNTERS`).
  - `resolve/`: `resolveTurn`, one file per phase of a turn (`attacks`, `rests`, `movement`,
    `endTurn`) sharing a `Turn` (`turn.ts`); a turn resolves into `steps`, each with the events and
    an `after` snapshot of every fighter, which the screen plays back. `statuses.ts`: when Waxed
    and encased come and go.
  - `conditions.ts`: the `*Condition`s actions can name (`*Hurt`, `*Tired`, `*Close`, `*!Far`, statuses...).
  - `patterns.ts`: how enemies pick their next stance and action, parsed from the same notation
    as the design doc (`Comes from > Stance > Leads to`, action lines with `*Condition` and `#tag`).
  - `bestiary.ts`: `EnemyKind` (stats, pattern, poses, flags, hooks: `forced`, `afterTurn`,
    `onDirectHit`, `opening`, viewer statuses...) and the `ENEMY_KINDS` registry, checked when the
    game loads. `kinds/`: one file per enemy (`sleepwalker`, `waxed`, `warden`, `guide`; `blob`: the Wax Blob's three parts, one multi-target enemy whose parts share Health and a line, see `body.ts` and `Enemy.body`). The Penitent
    Warden's flame, phases, Usurp Flame and opening scene live in `kinds/warden.ts`.
- `combat/`: the combat screen. `CombatScreen.tsx` plays a turn back step by step (camera, poses,
  dodges and knockbacks, the Usurp Flame scene, the phase-two scene); `lesson.ts` + `LessonBox.tsx` (the scripted tutorial against the guide: beats, the key gate, the typed text box; `CombatScreen`'s `lesson` prop), `playback.ts` (timings,
  phases, `viewAt`, the per-turn step index), `selection.ts`, `ActionWheel.tsx`, `fight.ts`
  (`newFight`: your loadout, health and revives).
- `screens/`: the main menu, Test combat, the Model viewer (`viewerModel.ts`: what it shows and
  plays, for an enemy, a multi-target body (`BODIES` in `core/bestiary.ts`) and for the player), the Map viewer (`MapViewer.tsx`, draws through `explore/render.ts`) and
  `Journeying` (exploration plus its fights). `ui/`: keys (`input.ts`), menus,
  pickers, the setup screen.
- `render/`: drawing. `camera.ts` (floor plan, camera, formations, shots), `poses.ts` (`POSES`,
  which pose a fighter shows; checks every kind's poses exist), `StickFigure.tsx` (stick figures,
  wax looks), `looks.ts` (what a `variant` draws differently: its own figure, candle arm, scenes),
  `rig.ts` (the true bone lengths, `RIG`, and `fitTorso`/`fitLimbs`, which re-solve a pose to them when a figure is drawn), `Scene.tsx` (the field, figures, darkness, flames, and the fight's light: `LightFall`, tuned by `LIGHT` in `camera.ts`), `effects.tsx` (projectiles, shockwaves), `WaxBlob.tsx` (the heap round the Wax Blob's three parts),
  `HealthBar.tsx`, `geom.ts`.
- `warden/`: the Warden's figure. `skeleton.ts` (`WARDEN_POSES`, built with `pose(...)` and its
  flags, `flailOf`), `parts.tsx` (cloak, hood, beard, flame, flail, candle arm), `trails.tsx`,
  `WardenFigure.tsx` (the layering), `look.ts`, `arena.tsx` (sealed sleepwalkers, lit in phase
  two), `scenes.ts` (`IGNITE` timings).
- `guide/`: the guide's figure (`GuideFigure.tsx`: cloak, orb, string, bare feet), its poses (`poses.ts`: a few numbers each) and its `look.ts`. The kind is `core/kinds/guide.ts`.
- `explore/`: the exploration map. `plans.ts` (`LEVEL_PLANS`, one ASCII plan per level on a
  shared, stacked grid: the tutorial segment: level 0 the waxed ring labyrinth with the shaft room at its centre, 0-6 the shaft's ladder; then the dungeon: Floor A on level 7 (the Nave) with its outer wheel on 6, B on 10 and C on 13), `world.ts` (tiles,
  ramps), `movement.ts`, `sight.ts`, `paint.ts` (chunked level painting), `render.ts` (draws the whole stack cut down to what is in sight; used by `Exploration` and the Map viewer), `figures.ts` (map
  figures, `MAP_FIGURES` by kind), `foes.ts` (`MAP_FOES`, chasing), `keepers.ts` (`KEEPERS`, rest
  points; the guide fades in at each), `tutorial.ts` (the guide's teaching: state, the gift, the
  knot), `sealed.ts` (the sleepers sealed in the labyrinth's wax, painted into the chunks), `gear.ts` (inventory, drops, losing it all on
  a fall), `pickups.ts` (gear lying on the floor), gear lying where enemies fell (`Journey.ground`, `GroundItem` in `pickups.ts`), the beaten enemies' remains (`Journey.corpses`, drawn by `MAP_REMAINS` in `figures.ts`; the sleepwalkers get up when you rest, per `respawns`), `save.ts` (progress in localStorage), `Inventory.tsx`, `Dialogue.tsx`, `tuning.ts`, `Exploration.tsx`. The tutorial fight:
  a new game opens in the lesson (`Journeying`'s `lessonFight`, `CombatScreen`'s `wakeUp`: you wake in the dark, the guide's light approaching): the guide against you, bare-handed,
  under `combat/lesson.ts` (`CombatScreen`'s `lesson` prop).
- `audio/sfx.ts`: the combat's sounds, synthesized with Tone.js (no files; loaded on the first sound); `sfxFor(event)` maps a
  combat event to a sound and `CombatScreen` plays it as the step's blow lands. Muted from the main menu.
- `index.css`: all styles.

### Adding an enemy

1. Write it in `core/kinds/<name>.ts` (pattern in the doc's notation, poses, hooks) and list it in
   `ENEMY_KINDS` (`core/bestiary.ts`). The game refuses it at load if its pattern or poses are broken.
2. New poses go in `render/poses.ts`; a figure of its own goes behind a `variant` in `render/looks.ts`. What lies where it dies is `render/Remains.tsx` (pieces), or the kind's `deathLook: "wax"`.
3. Give it a map figure in `MAP_FIGURES` (`explore/figures.ts`): the type checker asks for one.

## Conventions

- Comments explain the rule or the look in plain words (why, and what the player sees). Keep that
  style; JSDoc on exported things and non-obvious helpers.
- The sprites are drawn in 2D but oriented in 3D, seen from a 3/4 angle. "Front" means closer to the
  screen (lower on screen), "back" means away from it (higher), never the left or right of the
  screen. A figure faces +x in its poses (toward the player once an enemy is mirrored), so a
  shoulder or hip turned to the front or back is a change in depth (a few px of `y`, a layer
  in front of or behind the body), not a long move along `x`.
- Figures keep their size through the rig (`render/rig.ts`): a pose gives each bone a direction, and the
  bone's length is the rig's true length, so a pose's elbow, hand, knee or foot may sit a little off
  where it's written. To shorten a bone for perspective (a forearm pointing at the camera, a crouch), or
  stretch one on purpose (a punch's reach), set `adjust` on the pose, as a multiple of the true length
  (`adjust: { weaponFore: 0.7 }`), never a length of its own; change `RIG` only to resize every figure.
  Every enemy is rigged, the Warden's poses once at load (`warden/skeleton.ts`).
- Sides are explicit in the rig: a pose's `weaponArm` is the arm on the kind's `weaponHand` (default right),
  and its `leadLeg` is the `leadSide` leg (default left; `sw-chop` leads with the right). `sided()` in
  `render/rig.ts` maps the slots to a figure's right and left; use it (never near/far) to put anything on a
  particular limb. The Model stance tags hands and feet R and L.
- Poses are tuned by eye with the user, often over many rounds. When changing one pose, leave every
  other pose exactly as it is.
- Visual changes: check them in the Model viewer (each stance, each action, Staggered, Flinch, and the
  Model stance: a T-pose seen 3/4 front, straight front, 3/4 back and straight back, to check proportions) and
  in a real Test combat fight. Mid-turn timing bugs (a pose flashing for a frame, a status shown too
  early) usually come from `viewAt` / step snapshots vs. the final `fight` state in `combat/CombatScreen.tsx`.
- Map plans: a diagonal tile (◤ ◥ ◣ ◢: the character shows its floor half; the other half is wall) cuts corners for non-square rooms. Ladders (`H`, an `H` on consecutive levels at one tile is one tall ladder) are climbed in place. Floors are stacked on one shared footprint (a higher floor may sit right over a lower one; one level is `RISE` = one tile of height on screen). Stairs
  are one tile at 45 degrees (it climbs a whole level), sit on the lower level and point uphill, with floor past their top end on the level above and a hole in that floor above the stairs themselves. While you are on the stairs the level above's floors are not drawn (not even the hole); they appear when you reach the top (`levelOf` in `world.ts`, drawn by `render.ts`).
- Diagonal stairs (`↖ ↗ ↙ ↘`, pointing uphill) go on a floor square of a diagonal corridor, on the lower level; the diagonal tiles beside them tilt with them (`slopeAt` in `world.ts`).
- Map walls: a wall or cliff is a block on its own level, faded by its distance from yours (`wallFade` in `tuning.ts`, gone at `WALL_FADE_LEVELS`), and hidden where a floor is in the way. Floors below you fade the same way; floors above you are never drawn, and a cliff shows only from its floor's level or above. A chunk has three layers (`paint.ts`: walls, surface, cliffs; cliff blocks are `CLIFFS` in `world.ts`). To make a wall taller, write its `#` and `:` on the levels above in the plan.
- Don't change gameplay numbers or enemy patterns unless asked; propose them first.
