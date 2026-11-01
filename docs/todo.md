# To do

What is planned but not built yet, one block per separate session. The demo's deadline is **Thursday, Nov 5, 2026**.
Keep this list up to date: tick things off (or delete them) when they are built, and add what is decided but not done.
Rules and designs live in `enemies.md`; this is only the list.

## Before the deadline

- [ ] **Map** (tutorial segment built; **dungeon layout built, first pass**). Done: the waxed ring labyrinth, the shaft room with the Wax Blob, the 7-level ladder, and above it the dungeon: Floor A (the Nave round the shaft hole, four diagonal exits to corner halls, a ring of links, four chapels), Floor B (the Gallery: side rooms joined by thin bridges across the open space over the Nave) and Floor C (just the Warden's arena), each 3 levels above the last, a free-camera Map viewer, a new game that opens inside the lesson. The dungeon was then shrunk to about a third of its first size, and the shaft became a walled tube (`:` cells). To do: walk it in the Map viewer and adjust sizes; then **place the enemies, gear, the Warden and the extra safe spots** (the shortcut safe spot, e.g. in Floor B's south room before the stairs, or beside the arena's entrance), the ending room (no longer reserved: Floor C is only the arena, so decide where it goes), and tune the tutorial's own numbers (`FOE_TUNING`, `SEALED_DENSITY`, `LADDER_SPEED`). Known: the labyrinth's east and south corridors join the ring (a player can reach the shaft room before finishing the circle). (`explore/plans.ts`, `foes.ts`, `keepers.ts`.)
- [ ] **Ending screen.** There is none: after the Warden the game just goes on. A "demo complete" screen, then back to the menu. Needed for a full playthrough to have an end.
- [ ] **Full playthrough.** Start to finish (tutorial, map, Warden, ending) to catch bugs; also save/load and dying and waking at a rest point.
- [ ] **Warden playtest and numbers.** The mechanics, phases and scenes are built; his numbers and poses have not been tuned in a real fight (`kinds/warden.ts`, `FLAMING_BONUS` is a first guess). Don't change gameplay numbers without proposing them first.
- [ ] **Wax Blob** (built, first pass; `docs/enemies.md` §5b). To do: watch it in play and in the Model viewer (it uses the Waxed's poses; the heap, the lean of the side parts and the shared position want animation passes), balance (three attackers per turn against 20 shared Health and Fatigue; attack damage scales with the attacker's max Health, so the blob's Scratch hits harder than a lone Waxed's; the Waxed' Scratch buff also affects the Warden's escort), a reward for beating it (it drops nothing), default selection on the middle part, and the heap's death animation.
- [ ] **Enemy variants.** Not started. Variants of the sleepwalker and the waxed (see "Adding an enemy" in `CLAUDE.md`).
- [ ] **Guide dialogue remake.** The guide's words outside the lesson are placeholders (`explore/tutorial.ts`: greeting, reminder, relief, gift).

## Tutorial polish (the fight against the guide, `combat/lesson.ts`)

- [ ] Placeholder wording to replace: "Not that one, sleepless one." / "Press Q to cancel" (the wrong-target detour), the closing "Well done...", and the E prompt after "Promising...". Nothing was written for after turn 2's Rest.
- [ ] Halo Blast has no sound yet (`audio/sfx.ts`, `sfxFor`).
- [ ] The guide's first-pass poses to tune by eye in the Model viewer: `gd-hover` (orb floats up) and `gd-halo` (released), and the other `gd-*` poses; also its remains (`GuideRemains`) and the halo's look.
- [ ] The halo's origin on the figure is a guess (`[66, 86]` in `CombatScreen`), and `HaloBurst`'s size and timing (`effects.tsx`, `.halo-burst` in `index.css`).
- [ ] The guide's own pattern (`kinds/guide.ts`) is a placeholder; the tutorial uses a script. Decide whether the guide ever fights for real.

## Combat screen

- [ ] The action wheel and its mark (`ActionWheel.tsx`, `render/ring.tsx`): sizes, thickness and fade stops are first guesses. The ring follows the figure's settled position, not its live one, so it can lead the figure while the camera eases. A target near the screen edge shifts the wheel to keep all four options on-screen.
- [ ] Player animations in the Model viewer ("You" mode is built; poses are tuned by eye with the user, see the pose workflow in `CLAUDE.md`).

## Housekeeping

- [ ] Code optimization: only write an audit to `docs/cleanup.md` (no refactors yet).
- [ ] Merge to `main` when the user says so (work is on `rig-and-sleepwalker-poses`).
