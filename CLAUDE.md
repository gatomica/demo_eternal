# Turn-based soulslike demo

A Vite + React 19 + TypeScript browser game, hosted on Netlify (`npm run build`, publishes `dist/`).
Screens from the main menu: **Test combat** (pick a loadout and an encounter), **Exploration**
(walk a multi-floor map; touching an enemy starts its fight), the **Model viewer** (one enemy, its
stances and actions, played against a dummy that never gets hurt; an enemy's weapon and armor variants (the Waxed's Chisel and Hammer; the Sleepwalker's bare hands, Hammer and Patrol Warden) are statuses to turn on and off, one at a time (`VARIANTS` in `screens/viewerModel.ts`); an enemy with several targetable parts, like the Wax Blob, is shown as one body with all its parts at once, each with its own stance and actions; or "You": the player with any weapon
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
  `rig.ts` (the true bone lengths, `RIG`, and `fitTorso`/`fitLimbs`, which re-solve a pose to them when a figure is drawn), `Scene.tsx` (the field, figures, darkness, flames, and the fight's light: `LightFall`, tuned by `LIGHT` in `camera.ts`), `effects.tsx` (projectiles, shockwaves), `WaxBlob.tsx` (the Wax Blob's pool: a flat disc on the floor behind its middle part, `floorDisc` in `camera.ts`, with a low dome, a few sleepers' arms, and tapering wax links out to the side parts' bound feet; the shade under every other figure is a `floorDisc` too, `.floor-shade`),
  `HealthBar.tsx`, `geom.ts`.
  **3D rig (trying it on the Waxed only):** `rig3d.ts` (a skeleton in meters in body space, x its right, y up, z the way it faces; `liftPose` lifts a flat pose into it; `placeRig` stands it on the floor at a facing and projects every joint through the scene's camera with `projectPoint` in `camera.ts`; `facingYaw`) and `Waxed3D.tsx` (connects the projected joints with segments, far to near by real depth, sized by perspective). `Waxed3D` draws its weapon from `gear3d.ts` (the chisel, torch or hammer, in the right hand along the forearm, `GearShape.tsx` draws each shape; a swing's arch ends as thick as the weapon's `damage` part, the blade, bulb or brick). `Scene.tsx` uses it for every waxed in a fight, the Wax Blob's parts too (not the map's sprites); the other figures still use `StickFigure`'s flat drawing. `debugLimbs.ts`: the Model viewer's Debug status (right arm and leg red). `shade.ts`: the game's basic lighting, `AMBIENT` (0.82, also `--ambient` in `index.css`): everything is a little darker than it really is, the ground and the figures, in a fight (`Scene.tsx`: each figure's haze, and `.scene-shade` over the sky and floor) and on the map (a CSS filter on the canvas); this is not the sight radius (`LightFall`). A flame out in someone's hands lights its surroundings red (`.flame-light` in `Scene.tsx`). The Model viewer's Light row (and the Map viewer's header) can turn the shade off, to check the real colours. `gear3d.ts`: (drawn, like the enemy sprites, from ellipses, round-ended lines, discs, hoops and flat two-tone plates, not a mesh) gear (the weapons so far) modelled in 3D, for the new rig to use: each weapon is a set of flat coloured faces in weapon space (units as the sprites; x along it from the grip, y across its broad face, z its thickness), `drawFaces` turns them to a view and lights and sorts them; `screens/GearViewer.tsx` is where they are looked at (the Model viewer's setup has a second row, Gear, besides the models; the 2D figures still draw the flat sprites in `StickFigure.tsx`). `LittleFlame.tsx`: every little flame (the one cupped in a waxed's hands, a lone flame in the dark, the sealed sleepers' candles) is gentle and see-through with a swirling knot at its heart; the Warden's flames and other big ones are the ordinary `.fig-flame`. New little flames use `LittleFlame`. A lit waxed's flame burns on its head (`headFlame` on a scene figure, placed from the 3D rig by `flameSpot` in `Scene.tsx`, and drawn by `HeadFlame.tsx`, which follows a marker inside the figure every frame and leans with its motion); in its kind's `blazePoses` it blazes, with red strings looping out of it and back in (`FlameStrings.tsx`).
- `warden/`: the Warden's figure. `skeleton.ts` (`WARDEN_POSES`, built with `pose(...)` and its
  flags, `flailOf`), `parts.tsx` (cloak, hood, beard, flame, flail, candle arm), `trails.tsx`,
  `WardenFigure.tsx` (the layering), `look.ts`, `arena.tsx` (sealed sleepwalkers, lit in phase
  two), `scenes.ts` (`IGNITE` timings).
- `guide/`: the guide's figure (`GuideFigure.tsx`: cloak, orb, string, bare feet), its poses (`poses.ts`: a few numbers each) and its `look.ts`. The kind is `core/kinds/guide.ts`.
- `explore/`: the exploration map. `plans.ts` (`LEVEL_PLANS`, one ASCII plan per level on a
  shared, stacked grid: the tutorial segment: level 0 the waxed ring labyrinth with the shaft room at its centre, 0-6 the shaft's ladder; then the dungeon: Floor A on level 7 (the Nave) with its outer wheel on 6, B on 10 and C on 13), `world.ts` (tiles; plan chars `w` wax wall, `/` `\` metal bars; `minedAt`: the mined tunnels on the shaft levels, painted as rock and cobbles,
  ramps), `movement.ts`, `sight.ts`, `paint.ts` (`paintRect`: painting a block of a level's tiles, only the content a page owns), `regions.ts` (the map cut into rooms and corridors, and those into the pages that are painted once: `PAGES`), `bake.ts` (painting the pages and keeping the pictures, outside any renderer), `render.ts` (the renderer the screens use: `gl/renderer.ts`, WebGL, where the browser has it, else `render2d.ts`, plain canvas, also forced by `?gl=0`; both draw the whole stack cut down to what is in sight, used by `Exploration` and the Map viewer; `view.ts` has what they are given). In the WebGL one light is worked out per pixel in the fragment shader from small textures (how brightly each tile is seen, which walls and cliffs show, which doorway lights a tile) and the circle of your sight; the pages are drawn whole. F3 on the map shows frame times, draw calls and memory. The loading step (`warm`) paints the map before the first frame, `sprites.ts` (the player, sleepwalkers and the waxed on the map are the fight's own `StickFigure`, rendered to cached pictures per look, facing and step; side views are the fight's 3/4 poses, up and down the straight-on views; `drawWalker` falls back to its old stick figure until a picture loads; a howl and the waxed crawl have poses of their own there), `figures.ts` (map
  figures, `MAP_FIGURES` by kind), `foes.ts` (`MAP_FOES`, chasing), `keepers.ts` (`KEEPERS`, rest
  points; the guide fades in at each), `tutorial.ts` (the guide's teaching: state, the gift, the
  knot), `sealed.ts` (the sleepers sealed in the labyrinth's wax, painted into the chunks), `props.ts` (`MAP_PROPS`: the people sealed whole in wax lying about the rooms, in eight poses, each a cached picture; not creatures, drawn in the floor-things pass so whoever stands behind goes under them), `gear.ts` (inventory, drops, losing it all on
  a fall; eternal memories, read and set with the guide), `InventoryScreen.tsx` (the inventory, E), `ItemCard.tsx` (the card every item menu shows in its middle: the item large, then name, type, lore, effects), `GuideMenu.tsx` (the guide's menu by a keeper), `lore.ts` (eternal weapons' lore and effect texts), `pickups.ts` (gear lying on the floor), gear lying where enemies fell (`Journey.ground`, `GroundItem` in `pickups.ts`), the beaten enemies' remains (`Journey.corpses`, drawn by `MAP_REMAINS` in `figures.ts`; the sleepwalkers get up when you rest, per `respawns`), `save.ts` (progress in localStorage), `Dialogue.tsx`, `tuning.ts`, `Exploration.tsx`. The tutorial fight:
  a new game opens in the lesson (`Journeying`'s `lessonFight`, `CombatScreen`'s `wakeUp`: you wake in the dark, the guide's light approaching): the guide against you, bare-handed,
  under `combat/lesson.ts` (`CombatScreen`'s `lesson` prop).
- `audio/sfx.ts`: the combat's sounds, synthesized with Tone.js (no files; loaded on the first sound); `sfxFor(event)` maps a
  combat event to a sound and `CombatScreen` plays it as the step's blow lands. Muted, and its volume set, from the menus.
- `audio/music.ts`: the music, mp3s in `public/music/` (Web Audio, not Tone; loop points per track, slow crossfades, its own mute and volume): `playMusic(track)`. Menu and class select (`App.tsx`) and the lesson: church; map: temple below level 6, quella from it up (`Exploration.tsx`); fights (`CombatScreen`'s `music` prop): dungeon, the Warden's two halves of `beast.mp3` (split at 1:25, phase one fades out as its scene begins, and phase one fades out over 5 seconds, and phase two starts 2 seconds in and fades in over 1 second, over its last 3).
- `audio/walk.ts`: the map's sounds (Tone.js, like `sfx.ts`): footsteps by floor (`explore/ground.ts`: `groundAt`) and by walker, enemies' cries (howl, moan, gurgle, slosh), wax drips, a landing, and the guide's speech blips (`speak`, used by the map's dialogue and the lesson's text box).
- `render/StringCounter.tsx` (the String counter, the yarn ball, the aura round an enemy holding String) and `render/StringFx.tsx` (String flying from a fallen enemy to you). The rules are in `docs/enemies.md`; where it lives: `Journey.string`/`held`, `Enemy.holds`, the `defeat` event's `by`, `screens/Journeying.tsx`.
- `ui/dev.ts`: the developer tools, kept secret (nothing on screen mentions them): **F4** turns them on and off. On: the main menu also lists Test combat, the Model viewer, the Map viewer and the Music viewer (`screens/MusicViewer.tsx`: pick an area or fight and hear its music with the game's own transition; "Last 15 seconds" jumps to the end of the loop), and a map fight's pause menu also offers Restart fight, Skip battle and Main menu (off, it offers only Resume and Reawaken, which forfeits the fight). F5 (light debug) works only with them on. Don't add text that announces them.
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
- Diagonal stairs (`↖ ↗ ↙ ↘`, pointing uphill) go on a floor square of a diagonal corridor, on the lower level; the diagonal tiles beside them tilt with them (`slopeAt` in `world.ts`). The ramp runs from the centre of the floor square before the stair to the centre of the square after it (`RAMP_START`/`RAMP_END`, half as steep as one tile): `buildWorld` cuts those squares along their centre lines, the foot square tilting in its half beside the stair, the head square on the level above becoming a half-floor hole rim (`topAt` 1) over a tilted diagonal tile on the stair's level (`topAt` 2).
- Map walls: a wall or cliff is a block on its own level, faded by its distance from yours (`wallFade` in `tuning.ts`, gone at `WALL_FADE_LEVELS`), and hidden where a floor is in the way. Floors below you fade the same way; floors above you are never drawn, and a cliff shows only from its floor's level or above. A chunk has three layers (`paint.ts`: walls, surface, cliffs; cliff blocks are `CLIFFS` in `world.ts`). To make a wall taller, write its `#` and `:` on the levels above in the plan.
- Don't change gameplay numbers or enemy patterns unless asked; propose them first.
