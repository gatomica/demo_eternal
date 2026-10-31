# Turn-based soulslike demo

A Vite + React 19 + TypeScript browser game, hosted on Netlify (`npm run build`, publishes `dist/`).
Screens from the main menu: **Test combat** (pick a loadout and an encounter), **Exploration**
(walk a multi-floor map; touching an enemy starts its fight), the **Model viewer** (one enemy, its
stances and actions, played against a dummy that never gets hurt; or "You": the player with any weapon
and armor, any pose held, and your actions played against a dummy Sleepwalker) and the **Map viewer**
(each level's plan as a grid, with keepers, gear, enemies and seals marked; click a tile to copy its address).

The design doc is `docs/enemies.md`. Read it before changing rules or enemies, and
keep it up to date when a rule, enemy or map change is decided or built.

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
    game loads. `kinds/`: one file per enemy (`sleepwalker`, `waxed`, `warden`, `guide`). The Penitent
    Warden's flame, phases, Usurp Flame and opening scene live in `kinds/warden.ts`.
- `combat/`: the combat screen. `CombatScreen.tsx` plays a turn back step by step (camera, poses,
  dodges and knockbacks, the Usurp Flame scene, the phase-two scene); `lesson.ts` + `LessonBox.tsx` (the scripted tutorial against the guide: beats, the key gate, the typed text box; `CombatScreen`'s `lesson` prop), `playback.ts` (timings,
  phases, `viewAt`, the per-turn step index), `selection.ts`, `ActionWheel.tsx`, `fight.ts`
  (`newFight`: your loadout, health and revives).
- `screens/`: the main menu, Test combat, the Model viewer (`viewerModel.ts`: what it shows and
  plays, for an enemy and for the player), the Map viewer (`MapViewer.tsx`, reads `explore/` data) and
  `Journeying` (exploration plus its fights). `ui/`: keys (`input.ts`), menus,
  pickers, the setup screen.
- `render/`: drawing. `camera.ts` (floor plan, camera, formations, shots), `poses.ts` (`POSES`,
  which pose a fighter shows; checks every kind's poses exist), `StickFigure.tsx` (stick figures,
  wax looks), `looks.ts` (what a `variant` draws differently: its own figure, candle arm, scenes),
  `rig.ts` (the true bone lengths, `RIG`, and `fitTorso`/`fitLimbs`, which re-solve a pose to them when a figure is drawn), `Scene.tsx` (the field, figures, darkness, flames, and the fight's light: `LightFall`, tuned by `LIGHT` in `camera.ts`), `effects.tsx` (projectiles, shockwaves),
  `HealthBar.tsx`, `geom.ts`.
- `warden/`: the Warden's figure. `skeleton.ts` (`WARDEN_POSES`, built with `pose(...)` and its
  flags, `flailOf`), `parts.tsx` (cloak, hood, beard, flame, flail, candle arm), `trails.tsx`,
  `WardenFigure.tsx` (the layering), `look.ts`, `arena.tsx` (sealed sleepwalkers, lit in phase
  two), `scenes.ts` (`IGNITE` timings).
- `guide/`: the guide's figure (`GuideFigure.tsx`: cloak, orb, string, bare feet), its poses (`poses.ts`: a few numbers each) and its `look.ts`. The kind is `core/kinds/guide.ts`.
- `explore/`: the exploration map. `plans.ts` (`LEVEL_PLANS`, one ASCII plan per level on a
  shared grid, levels 0-1 below ground, 2 the ground floor, 3-6 above), `world.ts` (tiles,
  ramps), `movement.ts`, `sight.ts`, `paint.ts` (chunked level painting), `figures.ts` (map
  figures, `MAP_FIGURES` by kind), `foes.ts` (`MAP_FOES`, chasing), `keepers.ts` (`KEEPERS`, rest
  points; the guide fades in at each), `tutorial.ts` (the guide's teaching: state, lines, the
  knot), `seals.ts` (the wax closing the start room), `gear.ts` (inventory, drops, losing it all on
  a fall), `pickups.ts` (gear lying on the floor), gear lying where enemies fell (`Journey.ground`, `GroundItem` in `pickups.ts`), the beaten enemies' remains (`Journey.corpses`, drawn by `MAP_REMAINS` in `figures.ts`; the sleepwalkers get up when you rest, per `respawns`), `save.ts` (progress in localStorage), `Inventory.tsx`, `Dialogue.tsx`, `tuning.ts`, `Exploration.tsx`. The tutorial fight starts when you
  speak to the guide (`Exploration`'s `onLesson`, `Journeying`'s `lessonFight`): the guide against you, bare-handed,
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
- Map plans: no floor should hang over another (except the original bridge over the hall); stairs
  sit on the lower level and point uphill, with floor past their top end on the level above.
- Don't change gameplay numbers or enemy patterns unless asked; propose them first.
