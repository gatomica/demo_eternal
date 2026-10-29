# Cleanup audit

A read-only look at where the code is hardest to read and update, with a proposed split for each and
how risky it is. Nothing here has been changed. The idea is to do a split **just before we change
that code for something else** (e.g. split `CombatScreen.tsx` before the boss rework), so each
refactor is checked by playing what we were going to touch anyway.

Sizes are from the day this was written (before the viewers' additions).

## 1. `combat/CombatScreen.tsx` (about 1,030 lines, one component with about 49 hooks)

One function component does all of this at once:

| Concern | Roughly | What it needs |
|---|---|---|
| Planning: selection, the action wheel, the camera that rides behind you | lines 100-380 | `fight`, `selection`, `anchor` |
| Resolving and playing a turn: `play`, the step timer, forced turns (stagger/revive) | 380-560 | `fight`, `playback` |
| Special scenes: Usurp Flame (`usurpStage`), the Warden's phase-two scene (`igniteState`), smoke | 419-480, 736-760, 810-840 | `playback`, a timer each |
| "Which pose is this fighter in right now?": a long chain of `stepOf(...)`, `reached(...)` lookups | 568-810 | `playback`, the fight |
| Building the scene's figures and projectiles, and the JSX | 810-1000 | everything above |
| Model viewer / training hooks (`override`, `playSignal`, `playerAction`, `coach`) | scattered | props |

Why it's slow to work in: the pose logic reads half the component's state, so it can't be read on its own, and
every new prop (the viewer's three, `coach`) adds branches in the middle of it.

Proposed split (each step keeps behavior exactly, and can be done one at a time):

1. **`combat/poses.ts` (or `usePoses.ts`)**: move `playbackPose`, `enemyPose`, `settledPose`, `restTelegraph`, `standingAfter` and the `stepOf`/`reached` helpers into a function that takes
   `{ playback, fight, ... }` and returns the poses. It is nearly pure, so it can be tested without the screen. *Risk: medium. It is the code the CLAUDE.md warns about for "mid-turn timing bugs"; check each stance and action in the viewer after.*
2. **`combat/useTurnPlayer.ts`**: `play`, the step timer and forced turns. *Risk: medium.*
3. **`combat/scenes.ts` hooks**: `useUsurpScene`, `useIgniteScene` (they each own a state and a timer already). *Risk: low-medium; both are Warden-only and the boss is about to be reworked, so do this one with that.*
4. **`combat/useCombatCamera.ts`**: the planning camera and `shoot`. *Risk: low.*
5. **Viewer props**: bundle `override`, `panel`, `playSignal`, `attackOnPlay`, `playerAction`, `playerHold`, `playerAngle`, `figureAngle` into one `viewer?: ViewerHooks` prop. Pure tidy-up. *Risk: low.*

## 2. `explore/Exploration.tsx` (about 880 lines, about 34 hooks)

Mixes the map loop (movement, chasing, drawing) with the guide's dialogue, resting, the inventory
and saving. The comments already mark the seams ("The keeper you last rested by", "Gear on the
floor", "Where the tutorial stands", "Resting is a sleep", "The guide speaking").

Proposed split:

1. `useResting` (the fade out, wake, rest note) and `useGuide` (lines, which line, what follows): *risk medium; they are woven into the loop through refs.*
2. The per-frame loop body into `explore/loop.ts` as plain functions over a mutable `state` object. *Risk: higher: it's timing-sensitive; do it only with the tutorial rework, which rewrites most of it anyway.*

## 3. `render/poses.ts` (about 610 lines) and `warden/*` (about 1,500 lines)

`poses.ts` is mostly data (one skeleton per pose), which is fine as one long file. Its second
half is helper functions (`poseForIntent`, `actionPose`, `impactPoint`, `flameOf`). They could go to `render/poseOf.ts`
so the data file is only data. *Risk: low (moves only).*

`warden/` is already split sensibly; the boss rework will change it, so leave it.

## 4. Smaller things

- The model viewer's two modes (`ViewerFight` for enemies, `PlayerViewerFight` for you) share chip/section markup; extract a `Chips` component once both are settled.
- `screens/ModelViewer.tsx` and `screens/viewerModel.ts` now hold two viewers each; split into `viewer/enemy*.ts(x)` and `viewer/player*.ts(x)` if they grow.
- `index.css` is one file for everything (the CLAUDE.md says so on purpose). It's fine until it passes about 1,500 lines; then split by screen.
- `core/` is in good shape (small files, one phase each); leave it.

## Suggested order

1. `CombatScreen` viewer props bundle (step 5) and `poses` extraction (step 1): before the boss rework.
2. Scenes hooks (step 3): with the boss rework.
3. `Exploration` resting/guide hooks: with the tutorial rework.
4. Leave the rest until it hurts.
