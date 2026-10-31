# To do

What is planned but not built yet, one block per separate session. The demo's deadline is **Thursday, Nov 5, 2026**.
Keep this list up to date: tick things off (or delete them) when they are built, and add what is decided but not done.
Rules and designs live in `enemies.md`; this is only the list.

## Before the deadline

- [ ] **Map** (own session). Focus on the map: layout, enemy and gear placement, the guide's presence at the rest points, an exit or ending room. Nothing decided yet; start by asking what is wanted. (`explore/plans.ts`, `foes.ts`, `pickups.ts`, `keepers.ts`; the Map viewer shows the plans.)
- [ ] **Ending screen.** There is none: after the Warden the game just goes on. A "demo complete" screen, then back to the menu. Needed for a full playthrough to have an end.
- [ ] **Full playthrough.** Start to finish (tutorial, map, Warden, ending) to catch bugs; also save/load and dying and waking at a rest point.
- [ ] **Warden playtest and numbers.** The mechanics, phases and scenes are built; his numbers and poses have not been tuned in a real fight (`kinds/warden.ts`, `FLAMING_BONUS` is a first guess). Don't change gameplay numbers without proposing them first.
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
