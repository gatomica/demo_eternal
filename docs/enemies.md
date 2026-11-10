# Enemies & the Warden — design notes

Tutorial-area enemy roster and boss, as agreed in brainstorming. Items marked **(proposal)** are suggestions not yet confirmed; everything else is decided. Items marked **(built)** are in the playable demo; **(not built yet)** marks decided rules the demo doesn't follow yet.

---

## 1. Principles

**One rule, many skins.** There are only two harmful mechanics: **Fatigue** (fills current health) and **Death** (fills missing health). Everything else is presentation.

- Death sources: curses, poison, burns, wounds… Mechanically identical; the VFX on the bar and body follow whatever inflicted it last.
- Fatigue sources: Sleep, Wax, Freezing, Binds… Mechanically identical; VFX follow the last source.
- Statuses like *waxed* carry no stat effect of their own. They matter only as conditions in enemy patterns (and the few explicit rules that name them).

**Always symmetrical.** The player and enemies follow the same combat rules. Learning your own mechanics teaches you the enemies', and vice versa.

**States change patterns, never numbers.** An enemy's state (sealed/unsealed, phase one/two) never grants buffs or nerfs. It only changes which actions its stances can lead to.

**Stances are menus.** During planning, an enemy's stance shows the set of actions it might take. Reading the stance narrows the options; knowing what it just did narrows them further.

**Stances are random, actions are not.** The next stance is picked evenly among those the last action leads to; nothing weights the odds, not even Fatigue. Within the stance, the enemy takes the **first action in its list that it can take** (see Picking), so what it does depends on its state and yours, never on chance.

**Enemies can overreach.** Unless a kind is written with an explicit restriction, an enemy may pick any action, including an attack it can't afford, which staggers it.

**Bosses revive.** Bosses carry the same revive item as the player, juiced up: it restores them to **full** health. They never use it mid-fight, only when they would fall. Bosses therefore effectively have multiple health bars.

**Revives land at the end of the turn (built):** a revive (yours, from the knot, or a boss's) takes effect at the end of the very turn the unit is felled: full health, fresh, back on its feet, with no turn spent lying there (the old protected turn is gone, and so is its rule that blows pass through). The playback shows the fall, then the unit rises in a step of its own at the turn's end. For you, that step waits for the red string: it comes out of the revive numeral, winds round your remains, and then you rise. The reviving unit's bars (yours or the boss's) stay empty through the rise and fill only once it is over (for the Warden, once his phase-two scene has played): `barsOf` in `CombatScreen.tsx`. `endTurn` in `core/resolve/endTurn.ts`; `youReviveIn` in `combat/playback.ts`.

---

## 2. Combat rules decided in design

- **Turn order is player-centric (built; `core/resolve/attacks.ts`):** your action happens first, then the enemies' attacks. Your **Attack** lands first. Your **Block** or **Maneuver** aimed at an enemy forces that enemy's attack (every part of its body, for a multi-part one) to follow at once, so the Block or dodge you planned meets the attack you aimed it at. Every other enemy's attack then plays one at a time in **random order**; weapon weight no longer decides who is first (there is no speed). Each blow is its own beat, and after every blow whoever fell or was staggered loses what they hadn't done yet: an attack, a Block for later attacks, a Rest, a move. So an enemy you stagger or drop with your attack never gets to answer it. **There is no grit** any more (a fighter dropped or staggered by a tied attack used to finish its own): blows are never simultaneous.
- **Staggered** is the name for a broken guard: Fatigue reached your health, so you lose your next turn to a forced Rest. (Replaces "broken" everywhere.)
- **Maneuver (built):**
  - **A Maneuver has a target.** It pulls its target closer (front line) and pushes its *opponents* away (back line), never its allies. Falling back is a Maneuver with no target. An enemy's Maneuver either closes in on you (you're its target) or backs off.
  - **Distance is settled per enemy, between you and it.** If only one of you Maneuvered, that one decides. If you both did and agree, it happens. If one wants closer and the other farther, both play the move but the distance stays.
  - **A melee attack closes in on its target only if the target didn't Maneuver.** You can't drag in an enemy that's backing off, and an enemy can't follow you when you fall back, even if its attack hits you.
  - **Dodging (built):** a Maneuver dodges attacks on it, from either line, melee or ranged. **Falling back dodges every attack.** **Advancing on an enemy dodges only that enemy's attacks** (every part of its body, for a multi-part one such as the Wax Blob); the others still hit you. A retreating dodge goes back and away from the attacker; an advancing one goes **past the attacker, to its far side** (the dodger ends up on the opposite side of the attacker from where it started, passing it on the side away from the camera rather than through it). The dodge starts late in the attacker's approach (about 0.14 s in), timed to be clear just as the blow arrives, so the target is already out of the way when the attack animation lands; its pose changes only when it starts to dodge. A dodging Waxed (drawn in 3D) faces the way it goes (away from it, backing off) until its repositioning step starts, then faces you again.
  - **Cost:** a Maneuver itself is free, so even heavy builds can reposition on safe turns. A dodged attack does no damage and becomes Fatigue instead: (8 + armor weight + weapon weight) / 16 of its damage (weights 0 / 0.5 / 1 / 1.5, as below). Half of it is the baseline; the weight of what you carry (**true weight**, whatever the action) is added on top.
  - **Rest presentation (built):** an enemy that Rests shows its health bar below it from the moment the turn starts, as the Rest winds up (so you can see what the Rest changes; a body of several parts has one bar, below its middle part), and when the Rest lands it flashes white (the same quick flash as a block's) and the bar shows the change. The recovery after a stagger does the same. A Rest broken by a blow does not flash. The Waxed is drawn in 3D: sealed in wax (staggered and waxed, fallen, lit, a part of a body) only its wax shell shows, none of its body.
  - **Maneuver sprites (built):** a unit that dodged an attack this turn holds its dodge pose, then takes the sprite of its next stance as the repositioning step (its Maneuver) starts, and walks to its new spot in that. One that didn't dodge takes its Maneuver sprite from the repositioning step.

    | Weights | None / Baseline | Light | Normal | Heavy |
    |---|---|---|---|---|
    | Armor | 0 | 0.5 | 1 | 1.5 |
    | Weapon | 0 | 0.5 | 1 | 1.5 |

    For example, light armor and a normal weapon: 8 + 0.5 + 1 = 9.5/16 of the damage. Heavy armor and a heavy weapon: 8 + 1.5 + 1.5 = 11/16. (Head gear counts for half of its tier's number.) Gear is a small matter next to the base: a lot of what you wear is for how it looks.
- **Baseline weight (built):** bare hands. A baseline Attack costs 1/16 and deals 1/16, and is the weakest of all. Still not worth it damage-wise next to a light attack. A baseline Block adds only the Block baseline (below) to the fighter's base Resistance and armor (both to reduce damage and to send Fatigue back).
- **Weapon tiers (built; `WEAPONS` in `core/rules.ts`):** cost / damage, in sixteenths: baseline 1 / 1, light 1 / 2, normal 3 / 3, heavy 5 / 4 (heavy was 8 / 4; buffed to 5). In this demo each weight is one weapon: light the **Jagged Chisel**, normal the **Waxed Torch**, heavy the **Brick Hammer** (ordinary and eternal; both go by the same name, and an eternal one is told apart by the place it is set in). Their lore and looks (built; `Weapon` in `render/StickFigure.tsx`, the map's in `explore/figures.ts`):
  - **Jagged Chisel:** "An imperial short sword broken in half. Though repurposed to carve into wax, it carves into flesh as well as in the age it was forged on." A ball pommel, a ridged wooden grip, the bulky oval guard edge-on, a broad gladius blade with its fuller, snapped off and ground **square like a chisel** (a bevel across its end), with small nicks and chips along its edges and a chipped corner, and wax from carving smeared on the blade in two streaks, like paint. No blood.
  - **Waxed Torch:** "A torch whose own flame has been extinguished with sealing wax. A sleep warden has no need for light, as bright is the path they are set upon." A wooden shaft, cord bound under the head, the charred rags sealed in a bulb of wax stamped with the **sealing king's mark**: a closed eye whose point is its lashes, three straight parallel lines hanging from the lid toward the torch's tip, stopping short of it, the middle one longer than the other two (the lid lies across the torch). The wax has run down the shaft in runnels ending in drops.
  - **Brick Hammer:** "A makeshift hammer using a brick of the bedchambers. Though the holy foundations were thought to be eternal, being struck by might in their likeness brings them ruin all the same." A crooked branch with a knot, a **grey** brick lashed on with cord (wound round the haft and over the brick's near face), a corner knocked off, mortar still on its far edge, a crack running through it. No symbol.
  - **Spending Eternity flashes the weapon:** when your eternal effect costs you Eternity, your weapon flashes pale blue (the colour of Eternity) once as the blow lands (`HeldWeapon`'s `flash`, `.fig-eternal-flash`). Yours only: enemies have no Eternity, and an eternal weapon otherwise looks like its ordinary one. Lying on the map floor each weapon has its own little picture (`drawChisel`, `drawTorch`, `drawHammer`).
- **Eternal weapons (built):** every weapon has an eternal version: kept when you fall, and its blows carry an extra effect, always **1/4 of the weapon's damage** (`ETERNAL_SHARE`; only for a blow of the weapon itself, not an action with its own weight or damage):
  - **Jagged Chisel:** attacking the same one two turns running (the first blow hit, blocked or dodged, it doesn't matter), a direct hit deals that much more damage (straight to Health, like a burn). Only blows of the weapon itself count (not an armed waxed's Hurl Wax).
  - **Waxed Torch:** it only works on a target that is **not Waxed**, and needs no clean hit: a hit or a blocked blow (a blocked ranged one stops) adds that much Fatigue and leaves the target **Waxed** (wax caked on it). The wax goes when its Fatigue reaches 0, like any Waxed. The waxed and the Wax Blob's parts (`alwaysWaxed` on the kind) **always have the Waxed status**, which nothing takes off them, so the Torch never works on them.
  - **Brick Hammer:** a target that Blocks it (melee) takes that much Fatigue, on top of the Fatigue the Block sends back.
- **Eternity (built):** your eternal effects are paid with **Eternity**, a thin pale blue, almost white bar right under your health bar, as long as it and holding as much as your max health. Fatigue effects cost their amount; damage (or healing) effects cost **twice** it. It fills again only when you **reawaken** (resting by a keeper, or waking after a fall or Reawaken); it carries over from fight to fight (`Journey.eternity`), and Test combat starts it full. Enemies carrying eternal weapons pay nothing (they have no Eternity). **An effect only counts if it happens (built):** Fatigue that has nowhere to go, because the target is already staggered or the blow itself already filled its bar (the rest would be lost past the stagger), is no effect: nothing is paid, no Eternity is spent and no flash or `eternal` event shows. The same goes for damage effects (Chisel, Axe, Sickle): only the Health really left to take counts (none past zero, none where the fight takes no Health, like the guide's training), and the Death an unpaid effect puts on you is only ever the price of an effect that happened. A partial fit is paid for only in what fitted; the Shortsword likewise pays only for the Fatigue it really spares you.
- **Eternal effects show themselves (built; yours only):** an enemy's weapon effect takes place silently, with none of this (Eternity is the player's). When yours takes hold, the bar it touches flashes pale blue (your Eternity bar as it is spent; the target's bar for extra Fatigue or damage; yours for Fatigue the Shortsword saves), the weapon that carried it flashes (its aura), a small halo swells where it happened (light blue; where the blow hit, where it met a Block, or on the one who used it), and a wisp sounds like the String's. **Paid in Death** (Eternity could not cover it): the halo and the weapon's aura are dark red and the wisp is lower and dull. See `eternalHere` in `CombatScreen.tsx`, `EternityHalo` in `render/effects.tsx`, `eternalSfx` in `audio/sfx.ts`.
- **Underflow into Death (built; `addDeath`, `spendEternity` in `rules.ts`):** whatever Eternity can't pay becomes **Death** on you. Death first fills missing health; past that, the excess lowers Health by half of what is left over, and the Health lost is filled with Death too (which takes from the excess as well: every point of Health lost costs three of the excess). Example: 1 missing Health, 0 Death, +4 Death: the room takes 1, the other 3 lower Health by 1, leaving 2 missing, all of it Death. Health lost this way can drop you.
- **Blocking (built):** a Block adds +8/16 Resistance as a baseline, on top of armor and the Block weight's bonus (0.5 / 1 / 1.5 for light / normal / heavy, as armor gives: at most 8 + 1.5 + 1.5 = 11/16, and 11.75/16 with a heavy helm, so a Block never stops a whole blow). It covers only its direct target: one Block per turn, and attackers on the back line are not covered unless they are the target. Enemy Blocks get the same baseline. A blocked melee blow "clangs": a starburst of white spikes at the point of contact, flying outward and leaving the center empty, to show the Fatigue sent back (ranged attacks send none, so no clang).
- **Rest preview (built):** with Rest lit on your wheel, your bar flickers what it would give back: the Fatigue it clears (white, flickering away) and, if it clears more than you have, what returns (half the excess): first the black Death flickering back into waking room, then, past it, the Health restored, flickering where the bar's health grows (`restRecovery` in `core/rules.ts`, `Segments` in `render/HealthBar.tsx`). Like the attack cost preview, it is only shown while you choose.
- **Fatigue and Death don't decay (built):** nothing halves them at the end of a turn. Fatigue goes down only by Resting (or a revive, a fall, a forced recovery); Death only by healing.
  - **No weapon = baseline.** "None" is a weapon choice: the starting, bare-handed loadout. Your Attack (still labelled "Attack") is a bare-handed blow and your Block is a baseline Block. Only available with no weapon equipped.
- **Ranged attacks (built; the waxed's Hurl Wax is the first):**
  - The attacker doesn't move (melee attackers close in on their target).
  - When Blocked, no Fatigue is sent back to the attacker.
  - In exchange, they can always be dodged, even from the front line.
- **Direct hit:** an attack that was neither Blocked nor dodged.
- **Death sprites (built):** a unit that falls leaves its remains where it fell, for the rest of the fight, a little faded (about 65% opaque). Set by the kind's `deathLook`:
  - **Pieces** (default; the sleepwalker): a few short stumps, a split ribcage, a head half sunk into the ground (no eyes showing), a small pool of blood and its weapon beside it. Only some of the stumps have torn red ends, each at its own angle.
  - **Wax** (the waxed): sealed whole in wax, as if the Warden had taken their flame, folded right down on their knees, hugging themselves (`w-dead`).
  - **Cloak** (the Warden): his cloak draped in folds over a thick pool of wax.
  A waxed whose flame the Warden takes, or that dies lit in phase two, lies in the same wax remains from that moment; the others burn as candles in phase two until the shockwave raises them.
  A unit that falls with a revive left shows the same remains, but still repositions with the lines, until it actually rises and gets its normal sprite back. The Model viewer has a "Dead" stance to see them.
- **Target bar and camera (built):** while you plan, the health bar of whoever you're targeting hangs right below that enemy in the scene, the same size per health as your own bar; while a turn plays it sits bottom right, mirroring your bar, following whoever the action involves. The planning camera swings around you (up to about 37 degrees either way) to the least turn that leaves the selected enemy in view, counting front-line enemies in the way double.
- **Remains on the map (built):** after a fight, whoever fell lies where it fell on the exploration map, in the same remains as in the fight (pieces, wax, the cloak over its pool). When you rest by a keeper, **every enemy goes back to where it started**, and the **sleepwalkers get up again** (`respawns` on the kind) and their remains go; the **waxed and the Warden stay dead**, their remains lying there for good. In a group with both, only the sleepwalkers come back.
- **Drops on the ground (built):** what a beaten enemy carried now lies on the map where it fell, on its remains, to pick up with E; nothing goes straight into your bag any more. Resting by a keeper (or coming back after a loss) clears **everything lying on the ground**: what enemies dropped (the sleepwalkers drop it again when they fall again) and what you left there yourself. Gear set on the map (not yet taken) stays. Picking up ordinary gear while you already **wear** ordinary gear of that slot opens the inventory instead, offering to **swap** them (E): you take the one on the ground and leave the one you wore in its place.
- **The action wheel (built):** a see-through white ring that opens (growing) around whoever you selected, the same size for everyone and big enough to hold them inside (about the screen's height, never wider than 60% of its width). Four white diagonal lines cut it into four pieces, one per direction (W above, A left, S below, D right), each with its action's name; the piece being selected is brighter (dark text), solid white at the inner edge and fading out more slowly than the rest, which are see-through, their fill fading out away from the ring's center (strongest at the inner edge, nothing at the outer), with no outline; the four dividing lines are white and pointed at both ends. **The target mark is this same ring:** while you plan it is small, sitting on the wheel's center (the target's center, nudged only as far as it takes to keep every option of the wheel on-screen); focusing (E) grows it into the wheel, and cancelling (Q) shrinks the wheel back into the mark (it also slides between targets as you move the cursor). A direction with no action is faint and blank. A mouse hover lights a piece and a click commits it.
- **Cost preview (built):** hovering Attack in the wheel (before you commit) flickers the Fatigue it would cost on your health bar, beside the Fatigue you already have.
- **Inventory (built; `explore/InventoryScreen.tsx`):** **E** on the map opens it (when there is no keeper by you); E by gear you could wield also opens it, on that slot's ground place, to take it (a memory is picked up at once). **Q** (or Esc) closes it. It is framed like a fight's cinematic moments: the black strips slide in top and bottom, your bars sit where they do in a fight (health, the knot's revive as a red numeral, Eternity under it; full health between fights), and your figure stands large at the left, seen 3/4 from the front, turned toward the slots, wearing what you wield (a change shows at once); the bottom strip comes up to its knees, as in a visual novel (`--fig-h`, `--fig-knee` in `index.css`). Beside it, a column of slots: **Weapon** and **Armor** (passive items would be more rows), W/S to pick one. Each slot is a row of places, A/D to pick one: the **eternal** place on the left (only once a piece is set there at a safe spot), the **ordinary** place, and, only while gear of that slot lies within reach, the place **on the ground** (dashed; the nearest). A place shows only the gear's sprite; the one under the cursor stretches sideways to show its name, and its weight if it is **Lightweight** or **Heavyweight**. The place you wield from is highlighted, and the place under the cursor outlined: in white, but in the light blue of Eternity for the eternal place (none highlighted bare-handed). **E** on the eternal or ordinary place wields it; on the one you wield, unequips it (bare hands, no armor). **E** on the ground place takes what lies there: into the ordinary place if it is free, or swapping it for your ordinary piece, which is left on the ground where the other lay. Taking never equips anything (but a swapped piece takes the place of the one you wielded, if you did).
- **Eternal gear: memories, read and set at safe spots (built):** an eternal piece you find is a **Memory of …** ("Memory of Jagged Chisel"). It can't be set until the guide **reads its dreams**, which makes it known ("Jagged Chisel", no prefix) and shows its lore and effect. Only a read piece can be set in its slot's eternal place, and only at a safe spot, with the guide. Old saves' eternal gear counts as unread.
- **The guide's menu (built; `explore/GuideMenu.tsx`):** E by a keeper speaks with the guide instead of resting at once. The same letterbox; the guide large at the right, seen 3/4 from the front, the bottom strip up to its knees like your figure in the inventory, and on the left: **Talk** (its words in the dialogue box, then back to the menu; placeholder lines, `CHAT` in `explore/tutorial.ts`), **Rest** (the sleep, as before: the knot rewinds, Eternity refills, the sleepwalkers get up, and the first floor's gift), **Unwind Memories** and **Leave**. W/S choose, E picks, Q goes back.
- **Unwind Memories (built):** there once you have found your first memory; the first time you speak with the guide after that, its menu opens right on it (`TutorialState.unwound`). A row per slot of all your eternal gear (W/S the slot, A/D the piece): **E** on a memory whose dreams are unread (its sprite dimmed): the guide reads them, and it is known for what it is (it goes by its own name, "Brick Hammer"); **E** on a read one: sets it in the slot's eternal place (if you wield from that place, you now wield it). The piece under the cursor shows in a box in the middle, between the slots and the guide: its name, and once read its lore and effect (`explore/lore.ts`).
- **Pause menu (built, placeholder):** Esc on the map: Resume, Reawaken (die here, wake by the last safe spot) and Save and Quit (back to the main menu). To be reworked.
- **No pop-up texts on the map (built):** nothing is announced in floating text (resting, the knot, what a fight dropped). Picking something up shows it instead: its sprite and name in a box where the "E Pick Up" prompt was, fading away (`got` in `Exploration.tsx`).
- **Light and camera in an attack (built):** the fight's light is centered on whatever the camera is on: you while you plan, and during an attack the **middle point between the two fighters**. The attack's camera stays centered on that point as they move, so it follows them closing in, being knocked back by a hit or a block, and dodging, and the light (and who it shades) moves with it.
- **Formation (built):** each line stands on an arc around the player, all the same distance from them (front about 2.6 m, back about 5.6 m), not on a straight line. The fight's light fades with that distance (see `LIGHT` in `render/camera.ts`).
- **Each action has its own weight (built):** an Attack or Block can carry its own tier (cost, damage, Block strength) instead of the fighter's weapon.

---

## 3. Stances and actions: how enemies are built (built)

Every enemy is a loop: **stance** (shown to you) → **action** (hidden, unless the stance has only one) → **next stance** → …

- Each **stance** lists the actions it allows that turn.
- Each **action** lists the stances it can lead to next turn.
- Actions come in three **kinds**: **Attack**, **Defense** (Block or Maneuver) and **Rest**. Each named action also carries its own numbers (weight tier for attacks and Blocks, ranged or melee, special effects).

**Picking (the global rule):**
1. Next stance: evenly among the stances the last action leads to.
2. Within the stance: the **first action in the order written** whose conditions hold. Nothing is random here; write an action with no conditions last, as the fallback.

**Recover** is the turn after being staggered, or after reviving. It is not the same as a voluntary Rest.
- `Recover >` stances are also the stances an enemy can **open a fight** with.

**Actions that didn't happen fall back to Recover.** If an enemy's action didn't actually happen, its next stance comes from its `Recover >` stances instead of from that action. (A **Block** always counts, even with nothing to block: it leads on to the stances written for it.)
- A **Rest** cancelled by a hit.
- Any action **cancelled** before it happened, such as an attack whose target was already gone.

**Flinching (global rule).** A unit whose Rest is broken by a blow *flinches* (any blow that takes its Health: a direct hit, an ally's shockwave, a burn, an eternal effect; it flinches in the step that hurts it), and recovers into a **different stance** than the one it was flinched out of (when it has another to go to). Otherwise a stance that is itself a `Recover >` stance could loop: Idle, Wind Up Flail, flinch, Idle, Wind Up Flail, flinch...

**Attacks and Maneuvers can't whiff.** They commit the body (closing in, changing lines), so once performed they always count, even if the attack was Blocked or dodged, or the Maneuver dodged nothing.

Effects tied to an action (like the Warden becoming Sealed after Clutch Arm) also only apply if the action actually happened.

**Disabled stances.** A stance whose actions are all unavailable (conditions not met) is *disabled*: it can't be picked, and the other stances the last action leads to share its turn (the lit waxed's Cradle Flame, whose only action is a Rest they can no longer use).

**Safety net.** Enemies are written with no dead ends. But if every stance an action leads to is disabled, or every action in the picked stance is unavailable when it's time to act (locked to a phase, needs a status, silenced, depends on the player's state…), the enemy acts as if it just Recovered: it goes back to an opening stance.

**Notation.** Enemies are written in this notation in the game's code (one file per kind in `src/core/kinds/`) and parsed when the game loads, so the doc and the game read the same.
- `A / B > Stance > X / Y` means: after action A or B, the enemy can take this stance; from it, it can do X or Y.
- **Telling a Block by what it did:** `Brace` in a "comes from" list is a Brace that stopped at least one attack, `!Brace` one that stopped nothing. This only splits a Block in two once a pattern writes `!Brace` somewhere (the Waxed's does); otherwise `Brace` is either, as before.
- **An action no stance comes from** goes back to the **Recover** stances (it is not an error).
- A stance's actions are an ordered list (`,` or `/`, they mean the same): the first available one is taken. `> Stride, Wax Guard, Rising Flail` is Stride if it can, else Wax Guard, else Rising Flail.
- `All >` means the stance can follow any action. `Recover` can be listed like an action.
- Actions are declared first, one per line: `Name: kind, modifiers`.
  - Kinds: `attack`, `block`, `maneuver`, `rest`.
  - Weight: `baseline`, `light`, `normal`, `heavy` (default: the enemy's weapon).
  - Own numbers: `damage N` and `cost N`, in sixteenths of the attacker's max health, in place of its weight's (the Waxed' Scratch: `damage 2, cost 2`).
  - `ranged`.
  - **Every Maneuver says its direction:** `advance` (closes in on you; you're its target), `retreat` (backs off), or `by-line` (closes in from the back line, backs off from the front).
  - `*Condition`: only available while that condition holds (e.g. `*Sealed`); `*!Condition` while it doesn't. Several (separated by commas) must all hold; `*A or *B` is one condition that holds while either does (`Flail Swing: attack, normal, *Far or *Flaming`).
    - Common to every enemy: `*Hurt` (below half health), `*Tired` (Fatigue above half its health), `*Close` (front line), `*Far` (back line), `*PlayerStaggered`, `*PlayerReviving`, `*PlayerWaxed`.
    - Its own statuses work by name (`*Sealed`, `*Phase2`...), and a kind can write conditions of its own.
  - `#tag`: a rule the action triggers, e.g. `#waxing` (a direct hit leaves the target Waxed).
  - `//` starts a comment.

```
actions:
  Wax Guard: block, light, *Sealed
  Stride:    maneuver, retreat
stances:
  Stride > Flail Clutched > Flail Swing / Chain Guard
```

- **The parser refuses broken patterns** when the game loads: an unknown action name (typos), a Maneuver without a direction, an action listed twice in a stance, no stance coming from Recover, or no stance coming from Recover.
- **The game also refuses broken kinds** when it loads: a `*Condition` that doesn't exist, a pose for a stance or action that isn't in the pattern, a pose that doesn't exist, or a fixed-rule action that isn't in the pattern.

### Sleepwalker in this format

See section 6 for its stances and actions.

---|---|
| Slash | Attack |
| Parry | Block |
| Step | Maneuver |
| Catch Breath | Rest |

```
All > Ready        > Slash / Parry, Step
All > Intimidating > Slash / Catch Breath
All > Cautious     > Catch Breath / Parry, Step
```

---

## 4. Lore context

All of humanity fell into eternal sleep long ago. Every person is a **sleepwalker**. The current age is one of decay, the antithesis of the eternity that was promised.

**Wardens** are sleepwalkers too. They see themselves as preserving the eternal paradise, and blame restless sleepwalkers for the decay. Their duty is to soothe sleepwalkers back to sleep, or at least render them immobile with wax. They see this as atonement, hoping to one day be granted eternal sleep once more. It will never happen; that hope is the crux of their faith.

**Flame** stands for restlessness: ambition, desire, the will to live. It is blasphemous to the eternal faith. **Wax** stands for stillness and the faith itself.

---

## 5. The Waxed — weakest enemy

Sleepwalkers that wardens have tried to soothe back to sleep. Always **on their knees**, their lower legs bound together with wax, their heads encased in wax. **No armor or weapons.**

- **Reworked after the playtest (built; `kinds/waxed.ts`):** the playtests found defensive options spammed and too many attacks from the back line. It is no longer "one action per stance": a stance can offer actions by condition, and **what the last action did decides where it goes next**. A Block that stopped an attack (`Brace`) and one that stopped nothing (`!Brace`) lead to different stances.

**Built:** 12 health, baseline weight, no armor. Barehanded, its two clawing attacks (**Low Attack**, **Overhead Attack**) deal and cost 2/16 each (`damage 2, cost 2`, as its old Scratch); armed, they are blows of the weapon. Its Hurl Wax is a plain light attack.

| Action | Kind | Notes |
|---|---|---|
| Low Attack | Attack | Baseline barehanded; the weapon's weight when armed |
| Overhead Attack | Attack | As Low Attack; only when close (`*Close`) |
| Hurl Wax | Attack | Light, ranged |
| Brace | Block | Baseline (no bonus Resistance) |
| Drag Forward | Maneuver | Advance; only when far (`*Far`) |
| Slither Back | Maneuver | Retreat; only when close (`*Close`) |
| Clutch Flame | Rest | |

```
Recover, Clutch Flame         > Idle         > Drag Forward, Slither Back
Recover, Drag Forward, Brace  > Crawling     > Drag Forward, Low Attack
Slither Back, !Brace          > Wax on Hand  > Hurl Wax
Recover, Slither Back, !Brace > Cradle Flame > Flame Immolation, Clutch Flame
Low Attack, Brace             > Reared Back  > Overhead Attack, Brace
```

- Order matters inside a stance (the first available action is taken): Idle drags in when far, else slithers; Crawling drags in when far, else attacks low; Reared Back strikes overhead when close, else braces. Hurl Wax and Overhead Attack lead to no stance, so the next one is picked among the **Recover** stances (Idle, Crawling, Cradle Flame). The ranged Hurl Wax now only comes after backing off or a wasted Brace.
- **Stance poses (reused, to be redrawn; the lone Waxed is drawn from a 3D skeleton, `render/rig3d.ts`; Idle and Drag Forward are redrawn):** Idle `w-idle`, Drag Forward `w-drag`, Crawling `w-crawl`, Wax on Hand `w-wax-hand`, Cradle Flame `w-cradle`, Reared Back `w-hands`. Brace shows `w-cower` when it happens. Both attacks use the Scratch's strike pose for now. The old Hands Raised and Cowering Sideways stances are gone.
- **The Wax Blob uses the new Waxed** (its 3D figure, sealed whole in wax, and its pattern; see §5b).

- **Armed variants (built; `kinds/waxed.ts`):** the **Chisel Waxed** and the **Hammer Waxed** hold a Jagged Chisel or Brick Hammer in their **free hand**: the other hand still tears off the wax for Hurl Wax, which is unchanged (a light ranged attack, no eternal effect). Their Low Attack and Overhead Attack become blows of the weapon (the weapon's weight, numbers and speed, scaled to the waxed's 12 health, and its eternal effect, free for them); everything else is the Waxed's (Brace still bare, the flame, the stances, death sealed in wax). Beaten, they drop the ordinary weapon (they don't get up again). No Waxed Torch variant: the torch is the wardens' own. Drawn (flat sprites): the weapon in the free hand, pointing on along the forearm (raised with Hands Raised, thrust forward in the strike), tilting up just enough to rest its tip on the floor where that would run it into it, and the hammer held like a walking stick outside its attack. **In 3D (the lone Waxed in a fight), the weapon is always in the figure's right hand, in every pose, using the same poses as the bare-handed Waxed:** it points on along the forearm and is kept off the floor, and the swing arch of an attack runs from the weapon's far end, not from the hand. In Test combat as "Chisel waxed" and "Hammer waxed"; not yet on the map, where they look like any waxed.
- Stances are picked evenly among those the last action leads to. It attacks even when the attack will stagger it.
- **Body (built):** seen from the front in a fight, the Waxed has the Model's 3/4 front body: chest and hips turned toward the player, level shoulders, the right (weapon) side toward the player, hips set 4 apart (not one point). Each leg keeps the direction its pose gave it, from its own hip. (In the 3D rig, in every pose the knees are apart, as far as in Idle, and the feet meet, so the legs don't share a knee.) Seen from behind or straight on, nothing changed.
- **Looks (built):** kneeling, shins bound in wax and laid flat behind, head a lump of wax (no face). Reared Back: both hands up, clawing. Wax on Hand: leaning back, a wax lump held behind the shoulder; the lump (also in Hurl Wax's wind-up, and the Wax Blob's) is molten, paler and glossier than its body, drips stretching from it and drops falling, so it reads apart from the figure from afar. Brace: twisted away, arms over the head. Crawling: on its hands. Cradle Flame: a small flame cupped at the chest; Clutch Flame folds over it. **Lit** (built): its little flame burns on top of its head (in a fight and in the Model viewer); in Cradle Flame and Flame Immolation's wind-up (the clutch pose) there is no flame in its hands: the head flame blazes, bigger and brighter with a red light, and red strings loop out of it and back in (kin of the lost String's, `render/FlameStrings.tsx`). The head flame follows the head through every pose and every lunge, shake and step, and leans with the motion (trailing it, swinging back upright; stretching moving down, squatting moving up: `render/HeadFlame.tsx`). The head flame casts a faint red light round it, as a flame in its hands does. Flame Immolation's blast bursts out of its head (a fireball where its head flame was) and its ring of flame rolls out across the floor the same all the way round, past everyone in the fight (projectile `burst`; the Wax Blob's middle part's too). Its strike pose is its death pose (`w-dead`): it dies on the spot as the blast rolls out, its head flame is gone, and it stays in that pose until it is taken off the field, even if the turn staggers it (and the Model viewer shows it Dead after: the kind's `fatalActions`). Staggered: toppled forward onto its head.
- On the map it crawls slowly after you on its hands once it sees you.
- Assumed (unconfirmed): Hurl Wax has no extra effect.

**Proposals**
- *The wax decides what it can't do.* Variants sealed differently (a waxed arm means no Hurl Wax) give variety without new rules.
- *Long wind-ups.* Hold the stance a beat longer during planning.
- *Cracking.* When staggered, its wax cracks and it becomes slightly more sleepwalker-like over the fight.

---

## 5b. The Wax Blob — the first multi-target enemy (built, first pass)

A heap of yellow wax with three people sealed into it, their upper bodies rising out of it. It is **one enemy with three targets**: the left, middle and right part. Think of three Waxed that share a body.

- **3D version (built):** each part is the new Waxed, drawn from its 3D skeleton (`Waxed3D`), always sealed whole in wax, with the Waxed's own stances, actions and poses. The **middle** part has the **whole Waxed pattern** (Crawling, Drag Forward and Slither Back, which move the whole heap; Cradle Flame, Clutch Flame and Flame Immolation) and stands at the heap's **near edge, toward you** (`BODY_FORWARD`, 0.5 m out of the heap, in `render/camera.ts`), not in its middle. The **sides** have the Waxed pattern **without Cradle Flame** (so no Clutch Flame or Flame Immolation; they never rest on their own); their Maneuvers only dodge. The Super Wax Blob's sides hold Brick Hammers as the Hammer Waxed does (their Low and Overhead Attacks are hammer blows). The heap is lower than before (its dome to about a third of a figure's height, the front mound to about a fifth), so the kneeling parts' chests, heads and arms rise out of it. The points below about the old pattern (no Dodge, the Scratch) are superseded by this.

- **Each part acts alone.** Each has its own stance and action every turn, picked from the **standard Waxed pattern** (same stances, actions and poses, **except the Crawling stance: the blob has no Dodge** (no Drag Forward or Slither Back), so it never moves or dodges by itself; its Health is **20, as much as the player's**), and each is a separate target you select (A/D walks across them). Each part attacks you, blocks and dodges on its own; but they share one bar, so Fatigue is shared too (see below).
- **One bar: Health and Fatigue.** The three share one Health and one Fatigue: a hit, burn or splash on any part is taken by all three, and every attack any part makes (or block it makes, or dodge) tires the whole body. The health bar of whichever part you target shows the same bar. So **a stagger staggers the whole blob** (all three are forced to Rest together and recover together), and when Health reaches 0 **all three fall together**, sealed in wax where they are; the heap stays as the remains. A hit on any part breaks the middle part's Rest.
- **One place.** The parts always stand on the same line. Since none of them has a Maneuver, only you move it: your Maneuver on any part brings the whole heap to the front line, and a melee hit on any part pulls it forward. (If a part ever gets a Maneuver, the middle one's moves the whole heap; a side part's only dodges.)
- **The one change from the Waxed:** only the **middle** part has **Cradle Flame** (and with it Clutch Flame, the Rest, and Flame Immolation). The sides never Rest on their own (they recover only from their forced Rest after a stagger).
- **Look.** Each part is **sealed whole in wax** (no bare limbs or body showing). The heap is **exactly the wax colour of the three figures** (one flat colour with a single outline round all of it), so they melt into it and what tells them apart is only the heads and hands sticking out: a plain dome behind and a bumpy mound in front swallow their legs (no drips or pressed-in faces), with a few **arms of more sleepers sticking out of it**: four dragging along the floor in front at its foot and four lagging out of the dome's far flanks, behind, stirring slowly. They are kept low and at the far edges, so the three figures' heads and hands stay clear. The five lumps along its foot arch downwards (the ends as low as before, the others lower, the middle one lowest). **Whichever part you target, the health bar hangs below the middle part.** The middle part stands upright and tallest; the sides are smaller and lean out. They use the Waxed's own poses. **The whole heap moves with its parts**: when one lunges to attack, dodges or is knocked back, the other two follow part of the way and the heap stretches toward it, then settles back together. **On the map** (seen from above) it is a round heap of wax **two tiles across** (a circular body: it moves and is blocked as a circle of radius 1, so it fits the shaft room but not a one-tile corridor), with three heads rising from it and **three arms stretched out toward where it is trying to go**: when it chases you the arms reach for you, and when a wall or a corridor mouth stops it they still reach through it; idle, they hang short. **It only starts its fight when you are inside the shaft room or at its edge** (the first tile of each corridor mouth; `fightWithin` on its map enemy): elsewhere it may chase you but cannot reach you.
- Built as three kinds in `core/kinds/blob.ts` (`blobLeft`, `blobMid`, `blobRight`), tied by `Enemy.body` / `part`; the rules are in `core/body.ts`, `resolve/attacks.ts` (shared health), `rests.ts`, `movement.ts`; the look is `render/WaxBlob.tsx`. In Test combat as "Wax blob (three targets)". **In the Model viewer** the blob is one subject showing all three parts at once: each part has its own Stance and Action chips (clicking an action plays it for that part while the other two hold their stance), "Whole body" sets Staggered, Dead or the T-pose for all, and "Play all parts together" plays every part's last action in one turn. The viewer works for any multi-target enemy listed in `BODIES` (`core/bestiary.ts`): a future enemy with, say, a targetable tail is one more entry there.
- **To tune:** three attackers per turn is a lot (nothing changed from the Waxed's numbers; to review in play), the heap's animations (it only reuses the Waxed's poses), and it drops nothing (no weapon or armor).

## 6. The Sleepwalker — standard enemy (built)

Reused across the whole game. A hunched, desperate wretch dragging a weapon too heavy for it: its own poses, nothing like the player's trained stances. It shows only its stance while you plan; the action is revealed as the turn plays out, and distance and exhaustion decide it (first available action, in order).

**Gear:** a **Jagged Chisel** (light weapon, with its effect; it carried a normal weapon before) and, for now, no armor (some may wear armor later); it drops the weapon it carries.

**Drawn in 3D in fights (first pass built; `render/Sleepwalker3D.tsx`):** like the Waxed, from a skeleton in space: two free legs, a dark head with two pale eyes (the Patrol Warden's hood: a round with its point hanging behind, the face in shadow), the 3D chisel, hammer or torch in its weapon hand. The poses are still the flat ones lifted as they are; on the map it is the flat figure.

**Every enemy's weapon carries its effect (built):** there are no enemies with ordinary weapons. Whatever an enemy carries (the Sleepwalker's Jagged Chisel, the Patrol Warden's Waxed Torch, the Hammer Sleepwalker's and Hammer Waxed's Brick Hammer...) fights with its eternal effect, free for it; only the Warden's own flail carries none (`ownWeapon`).

**Variants (built; `kinds/sleepwalker.ts`):** the **Patrol Warden** and the **Hammer Sleepwalker** (only a select few) are the same wretch (pattern, poses, respawning) carrying a Waxed Torch or Brick Hammer instead of the chisel. The **Patrol Warden** is the sleepwalker of the wardens' rounds: it carries the Waxed Torch and wears the Penitent Warden's **pointed hood** (its point hanging behind, the face in its shadow), but no wax beak, no drool and no cloak (`PatrolHood` in `StickFigure.tsx`; on the map too, `PATROL_LOOK`). Its remains keep the hood on the sunk head, the point flopped along the ground (`Remains`' `hooded`, and the map's `drawRemains`). Their blows carry the weapon's eternal effect against you, free (no Eternity). Beaten, a Patrol Warden also drops its **Patrol Warden's Hood** (head gear, light, placeholder lore; `wardenhood` in `explore/items.ts`). Beaten, they drop the **ordinary** weapon, not the eternal one: enemies fight with the eternal effects, but eternal gear is only found, as memories. In Test combat as their own encounters and "Sleepwalker, patrol warden and hammer"; **not yet placed on the map.** On the map the hammer one looks like any sleepwalker for now (the patrol warden wears its hood).

**New moveset (built; replaces Charging / Struggling / Guarded and the Weapon Strike):** like the Waxed's, what it last did decides where it goes next; a swing ends turned the way it swings, into the stance turned that way.

```
actions:
  Swing Left:      attack, *Close        // whatever weapon it carries
  Swing Right:     attack, *Close
  Overhead Strike: attack
  Parry:           block, *Close
  Chase:           maneuver, advance, *Far
  Retreat:         maneuver, retreat, *Close
  Despair:         rest
stances:
  Recover, !Parry                         > Idle          > Chase, Retreat
  Chase, Swing Right, !Parry              > Charging      > Chase, Swing Left
  Swing Left, Retreat                     > Shoulder In   > Swing Right, Parry
  Swing Left, Swing Right, Parry, Retreat > Arms Overhead > Overhead Strike
  Recover, Retreat, Parry                 > Struggling    > Despair
```

| Stance | Look | Does | Safe answer |
|---|---|---|---|
| **Idle** | Slumped, the weapon's tip dragging | Chase if you're far, else Retreat | Far: it comes at you. Close: it backs off |
| **Charging** | Head thrust out, weapon drawn back; in 3D turned to his right | Chase if you're far, else Swing Left | Far: only the Chase. Close: Block or dodge the swing |
| **Shoulder In** | The old Guarded crouch, weapon braced across the body; in 3D turned to his left, presenting his right shoulder | Swing Right (it is always close here) | Block or dodge the swing |
| **Arms Overhead** | The weapon hauled up over the head in both hands | Overhead Strike, from either line | Block or dodge |
| **Struggling** | Hunched and swaying, a hand pressed to the face | Despair (Rest) | A free hit |
| **Staggered** | Kneeling on one knee (the right knee raised, the left shin laid back up the screen), hunched right over and dejected, arms limp out to his sides, eyes on the ground | Forced Rest | Free hit |

- **Recover** opens a fight in Idle or Struggling. The Overhead Strike and Despair lead to no stance, so they go back to those two. A Parry that stopped a blow (`Parry`) goes on to Arms Overhead or Struggling; one that stopped nothing (`!Parry`), to Idle or Charging.
- **Open question: Parry is never reached.** It is only in Shoulder In, after Swing Right, and both need `*Close`, so Swing Right is always taken first; `Parry` and `!Parry` in the "comes from" lists never happen. (Far, Shoulder In has nothing it can do and is disabled; it only follows Swing Left, which is close.)
- **Poses (first pass, built):** Idle `sw-idle`, Charging `sw-charging` (3D: `turn3` 35), Shoulder In `sw-shoulder-in` (the old `sw-guarded`; 3D: `turn3` -40), Arms Overhead `sw-overhead` (in 3D standing on both feet), Struggling `sw-struggling`. Each swing runs between the two turned stances, its wind-up and landing taking their bodies: Swing Left `sw-swing-l-windup` (Charging turned further, the straight arm drawn back behind him) then `sw-swing-l` (swept round into Shoulder In's crouch, the arm across to his left); Swing Right `sw-swing-r-windup` (Shoulder In coiled further, the weapon drawn back on his left) then `sw-swing-r` (a backhand round into Charging's body, the straight arm swept round to straight back behind him); Overhead Strike `sw-overhead-leap` (Arms Overhead leaping: reared further back, both feet off the ground) then `sw-overhead-strike` (straight down ahead in both hands). Parry, Chase (`sw-charge`), Retreat (`sw-backstep`) and Despair keep their poses. Each strike leaves an arch. The flat drawings of the new strikes are the old cross strike's (the map never shows them).

**How it plays:**
- First playtest of the old random version: far more engaging with the uncertainty, but very few safe turns. To be re-playtested now that actions are conditional.


**Super Wax Blob (built; `SUPER_BLOB_BODY` in `kinds/blob.ts`):** the same heap, but its **two side parts wield Brick Hammers**, held like the Hammer Waxed's (in the free hand; Hurl Wax still thrown with the other): their Scratch is a **Hammer Blow** (heavy, with the hammer's eternal effect, free for them). The middle part is the Wax Blob's own, unarmed, flame and all. Its parts' numbers scale with the shared 20 Health, so a Hammer Blow is 5 damage (two of them a turn at most). Beaten, it drops ordinary Brick Hammers, one per side. In Test combat as "Super wax blob (hammers)" and in the Model viewer as one body; not on the map yet.
---|---|---|---|---|
| **Ready** | En garde: knees bent, blade levelled at you | Attack, Block, Maneuver | Block | — (attacking risks a block that sends damage back, or a dodge; resting gets punished) |
| **Intimidating** | Open stance | Rest, Attack | Block | Attack (catches the rest, your action goes first, then its attack) |
| **Cautious** | Low, leaning back, blade held crosswise before the face | Rest, Block, Maneuver | Rest (it never attacks) | Attack (hoping to catch its rest) |
| **Staggered** | Fallen | Forced Rest | Free hit | — |

**Odds (built):** each stance a third of the time; within a stance, by the global rule.

| Stance | Odds |
|---|---|
| Ready | Attack 50%, Block 25%, Maneuver 25% |
| Intimidating | Attack 50%, Rest 50% |
| Cautious | Rest 50%, Block 25%, Maneuver 25% |

**How it plays (built):**
- Sleepwalkers only ever show their stances while you plan, from the first turn; the action is revealed as the turn plays out.
- First playtest: far more engaging with the uncertainty. There are very few truly "safe" turns, so the player gets hit much more often.

---

## 7. The Penitent Warden — tutorial boss (rules built; visuals not yet)

**Goal of the fight:** teach Fatigue management and keeping pressure on an enemy.

**Numbers (built):** 15 health per bar, two bars (one revive, to full health), normal armor, normal weapon. The player gets **one revive** in this fight. Playable now as "Penitent Warden" in Test combat, drawn as a placeholder figure until phase 4.

### Look (built)
- A tall figure (about 1.2× a normal figure) in a **gray cloak** reaching the ground, its hem crusted with wax. The cloak is **ripped along his waxed (left) side**: sealed with wax from the armpit to the hip, failing from the hip down, gaping open to show his left leg over a wax-caked lining.
- **Hood** (one flat color, pointed at the back) hiding his face; only a **waxed, beak-like mask** pokes out. **Wax drool** runs from under the beak down the front of the cloak like a beard, over an older, duller **stain**; both only show while his front faces you.
- **Right arm: the flail.** A long wooden handle held at its middle, the chain hanging from its tip, a wax-filled censer at the end (fixed chain length).
- **Left arm: encased in wax**, the forearm swelling toward a thick hand. Unsealed: a candle flame at the hand. Sealed: smoke rising from it. Phase two: a black, scorched arm with embers, the hand engulfed in flames.
- No shape is see-through except effects (shadows, glows, smoke, trails, whirls).
- Per-pose options: how far he turns (candle side toward you, or flail shoulder toward you), head tilt, looking back over his shoulder, face turned toward the camera, arm tucked behind the head or body, arm starting from the rip's armpit.

**Poses fine-tuned with the user** (in the model viewer): Idle, Wax Shoulder In, Wax Arm Back, Flail Spinning Behind; actions Fan Flames (swat + flat fan of flame flying through you), Flame Blast (kneels and punches the ground; a near-straight flame-coloured trail follows the fist; the fireball flash bursts at the impact, then the shockwave ring of tall flames), Wax Punch (the same kneeling punch with the cold wax fist and a wax-coloured trail; melee; a small white impact ring where it lands); stance Kneeling (flail hand on the raised knee, handle up; wax hand at his side holding the chain, head hanging below it; the cloak runs flat over the raised thigh, then drops); Clutch Arm (its own rest pose: hunched, the wax fist gripping the flail head and pulling it up, then straight into Wax Shoulder In, flame out unless in phase 2, with a wide wax trail from the old head position through his wax hand to the flail head); Wax Guard (holds whatever stance he's in; only as a blow lands does he swat it away with Fan Flames' backhand, a wax trail and no fire, then settles into his next stance; in the Model viewer, playing a Block makes the player attack so there's something to block); Chain Guard (as the blow lands: braced, the flail hand holding the handle up in front, the wax hand gripping the chain pulled taut diagonally across his front, the head swinging below the fist). All Blocks and Maneuvers, for every fighter, hold their stance until the blow lands, then block or dodge; a block jolts both fighters apart and they stay there; a dodge, seen from the camera, steps 1.5 m back and 1.5 m across the screen (away from the attacker) when retreating, 1.2 m across when closing in, and keeps its maneuver pose to the end of the turn, walking off in it; Stride (his back to you, spun on his right leg and crouched low, the wax arm trailing, the flail arm leading the spin with the flail flung out level behind him, just the tip of his beak past the hood); stance Flail Clutched (Wax Arm Back, but the wax fist has hauled the flail up by its chain, crossing over his cloak, the head hanging below); Flail Swing (Wind Up Flail's pose, but its first spin trail is the blow, a level sweep across his front through you, then two spins behind him into Flail Spinning Behind); Flail Spinning Overhead (handle up and away from you, the flail a level blur of chains above him); Rising Flail (hips nearly front-on, shoulders twisted flail-first, leaning back onto his left leg, Wax Arm Back's head; first trail swung up from below behind his cloak, then two level spins overhead, snapping to Flail Spinning Overhead on the third); Flail Slam (Kneeling's body, Wax Arm Back's head, wax elbow above the shoulder, flail arm down and back over his torso, the flail slanting along the floor, a trail bringing the head down from overhead and a white impact shockwave where it lands); Arm Over Chest (wax arm folded up across his chest, elbow low; flail held a little up with the handle almost level, the flail hanging in the air). Maneuvers: the maneuver pose only comes with a dodge or the actual move (hit while holding the stance, it stays), and is kept through the walk to the new spot. Usurp Flame (fine-tuned): a scene plays before the turn's final step: the light dies (0.9 s) as the camera settles between him and his target, only the target's flame still burning (the flame a waxed ally holds, or a candle above the player's head); he springs from a low Wax Arm Back crouch (looking at the flame) and dashes at it, wax hand raised, the camera closing in on both (0.6 s); black (0.5 s); the light returns (1 s) on him in Idle, his flame lit, as a flame trail streams from the target, arching over him into his hand; then the turn's repositioning plays. The dash's reaching hand is held low (a waxed-staggered player is about a waxed sleepwalker's height). A Rest broken by a blow shows the kind's flinch pose (flinch / w-flinch / wd-flinch) from the hit to the end of the turn. Staggered in phase one, his flame is out; whenever it goes out (stagger, Clutch Arm, Flame Blast) a puff of smoke leaves his hand, Wind Up Flail (its own rest pose: three timed spin trails, then straight into Flail Spinning Behind).
**Windup poses (first pass, to tune by eye in the Model viewer):** `wd-chain-ready` (Chain Guard), `wd-wax-ready` (Wax Guard), `wd-winding-up` (Wind Up Flail) and `wd-clutch-ready` (Clutch Arm): each is its action's pose half-formed, shown from the start of the turn until the Block lands or the Rest goes through.
**Still first-pass:** the staggered pose.
**A quiet turn still lasts (built):** a turn in which nothing happens (you Block and nobody attacks, say) plays one empty step, so it takes the minimum a turn takes (`MIN_ATTACK_PHASE_MS`, then the step) instead of ending the moment you commit (`play` in `CombatScreen.tsx`).

**No steering in the air (built):** once you start falling on the map, the way you were going is kept (or you stay put) until you land; the keys change nothing (`airDir` in `Exploration.tsx`).

**Rest windup (built):** an enemy that is going to Rest takes its Rest's **windup pose** from the start of the turn (if its action has one; otherwise it holds its stance), to show its intent, until the Rest actually happens; then it shows its rest pose (if it has one, 0.3 s) and settles into the next stance. A Rest that is interrupted never leaves the windup: it flinches out of it as the blow lands. The flinch is the windup knocked apart by the hit (the Sleepwalker's: thrown back off balance and hunched over, one foot off the ground, the hands torn off his head, held just clear of it). **Block windup (built):** a Block works the same way: from the start of the turn the unit takes its Block's windup pose (if its action has one; otherwise it holds its stance), and only takes its blocking pose as the blow lands. The Sleepwalker's Parry braces in Guarded's crouch with the blade raised steeper and the left hand on its middle. The Depraved Sleepwalker's Despair winds up in Struggling's pose with both hands clutching the sides of his head. **Minimum attack phase (built):** the attack phase of a turn lasts at least 0.5 s from the moment you commit, and everything that happens after the attacks (a Maneuver, a Rest...) waits for it, so a turn with no attacks still gives a moment to see what everyone is about to do, such as a Rest's windup pose (the model viewer too). The windup pose shows only while the turn plays, before the Rest goes through; the Rest animation itself (its rest pose) then starts instantly and lasts 0.5 s.

**Built since:** wax showing on the player (caked, then encased when staggered), the encasing of the player and of waxed allies, the arena candles, his two health bars.

**A staggered waxed shows its flame (built):** in the Warden's fight, a waxed that is staggered has a flame burning on its head, the one he can take.

**Opening scene (built):** the Warden fight opens with the three waxed on the front line, the middle one (Waxed C, set up with `offering: true`) cradling its flame, and him on the back line, Sealed, his flame out. After a 1.2 s look at the arena, the Usurp Flame scene plays exactly as in a fight (the light dies, he dashes at it, black, the light returns on him in Idle as the flame arcs into his hand), leaving it encased for good and him Unsealed, stepping into its place on the front line: the three left (Waxed A, him, Waxed B) are all on the front line when the fight starts on turn 1, his stance coming from `Usurp Flame >` (Idle). It's built by `openingOf` in combat.ts and played by the combat screen as a turn with no action of yours; Retry plays it again.

**Settled after playtesting:** the staggered pose is final; the Warden's tuning stays as is (punishing at first, then learnable: the intended soulslike loop, even for a tutorial boss); Test combat covers the Test Boss button; everything checks out in a real fight (the arena may get another pass later).

**Shelved:** the waxed sleepwalkers' *Cracking* (maybe for a future variant; the waxed stay the most basic enemy).

**Later:** Overflow into Eternity on healing (the healing item and revives both heal to full), after Eternal weapons exist.

**Built since:** Slither Back has its own sprite (sat down, dragging itself backwards on its rear, hands planted behind, bound legs out toward you); a clean hit (not blocked or dodged) flashes the target red; a Maneuvering unit holds its stance until it dodges or repositions (a Maneuver now dodges everything, so it is never hit). An attack that leaves its user staggered (or down) still plays out in full (a strike that spins on into its next stance, like Rising Flail, still snaps to the pose it ends in, flame unchanged), and only drops to the staggered pose once its step is over.

**Tools built for this:** a **model viewer** (main menu) to pick an enemy, flip its statuses, set its stance and play any action from it; a **Model stance** shows it in a T-pose from four angles (3/4 front, front, 3/4 back, back), drawn from the shared rig (every figure's bones have the same true lengths, with per-pose adjustments); its hands and feet are tagged R and L, so asymmetric designs and weapon hands (right by default, per kind) can be checked; ranged attacks throw **projectiles** across the field; Rests can have their **own pose** for when they go through (shown briefly, 0.3 s, then the next stance).

### The waxed escort (built)
- The fight opens with **two waxed** on his side (in front), the Warden behind them.
- **Usurp Flame on allies:** the fixed rule also covers them. While Sealed and able to act, he always uses Usurp Flame on a waxed that is **staggered** or **about to use Clutch Flame** (Cradle Flame always leads to it, so it's readable).
  - He becomes Unsealed; the waxed loses its flame and is **encased in wax whole**: out of the fight for good.
  - Aimed at an ally, the Maneuver pushes you away, like backing off. From the front line it doesn't dodge your melee (a **free hit** on him); from the back line it does (a **free Rest** for you). He ends on the back line.
  - If the waxed is gone before he reaches it, Usurp Flame fails (counts as an action that didn't happen) and he stays Sealed.
- **Several flames at once** (you and a waxed, or both waxed): even odds.
- **Phase two raises the escort (built):** the fire shockwave of his phase-two transition lights **all three waxed**: any that have fallen (or been sealed in wax) rise at full health but **staggered** (their first turn is the forced Rest), and the rest are lit too. A **lit** waxed has its flame burning on its head, and in its Cradle Flame stance it uses **Flame Immolation** (a heavy ranged attack, only while lit, first in that stance): its blast rolls out like Flame Blast's, hitting whoever it is aimed at and, as a shockwave, every other unit in the fight, and it dies as the blast rolls out (its strike pose is its death pose, sealed in wax; the Wax Blob's middle part keeps the clutch pose). Whenever he is **staggered in phase two**, one fallen waxed rises again, lit and staggered, as a flame trail whisks from his hand to it. A lit waxed that gets **staggered during a turn dies as that turn ends**: its flame streams in a trail of fire into his hand, and it lies sealed in wax again; unless he is staggered himself at that moment (then it stays staggered like any other). The ones raised staggered don't die: they are on their forced Rest. Besides Fatigue, the way to deal with their swarming is his own **shockwaves** (below).

### Weapon and opening
- A **flail** that was once an incense burner on a chain, used ages past to lull people to sleep. Its contents have solidified into wax.
- **Opening cutscene:** the warden grasps a flickering flame burning from a restless waxed sleepwalker, made into a candle. As the flame settles into his own waxed arm, the candle-sleepwalker finally rests. He starts the fight **Unsealed**, his arm a lit candle.

### Unique status: Unsealed / Sealed
"Unsealed" covers both the lit candle arm (phase one) and the bare burning arm (phase two).

| | |
|---|---|
| **Starts** | Unsealed (lit candle arm) |
| **Becomes Sealed** | When staggered, or after using Flame Blast or Clutch Arm |
| **Becomes Unsealed again** | By using Usurp Flame |
| **Permanently Unsealed (phase two)** | On his last health bar (his revive), as a burning arm |

### Wax on the player
- Any **flail** attack makes the player **Waxed**, hit or blocked, as long as you are not Waxed already (on a direct hit, wax already there also tires, 1/8 of its damage; a blocked flail adds no Fatigue that way). (`onBlocked` on his kind.)
- Hit directly by the flail while already Waxed: **bonus Fatigue equal to 1/8 of the damage** dealt.
- Losing all Fatigue clears Waxed.

### The fixed rule (in the pattern)
> **Usurp Flame is the first action of every stance**, available when he is **Sealed** and a flame is within reach (`*Sealed, *Usurpable`).

`*Usurpable` is the Warden's own condition: the **player is staggered and Waxed**, or a **waxed ally is staggered or about to Clutch Flame**. Being first in every stance, it wins over anything else he could do; its other options apply only when it isn't available. It is the one fully certain thing about him: the player can learn to bait it or deny it. Which flame he goes for (several at once: even odds) is decided by the kind's `aim` hook; he picks after the waxed (`decidesLast`) to see which of them is about to Clutch Flame.

**Read for the player:** wax is a warning light.
- *Waxed, with his flame out:* play safe. Getting staggered now hands him his flame back.
- *Not waxed:* you can push. A stagger only costs the usual lost turn.

### Actions

| Action | Kind | Weight | Conditions | Notes |
|---|---|---|---|---|
| Usurp Flame | Maneuver | Advance | `*Sealed`, `*Usurpable` | First in every stance. He becomes Unsealed; clears the player's Waxed |
| Flail Swing | Attack | Normal | `*Far or *Flaming` | Flail (waxes on direct hit) |
| Rising Flail | Attack | Normal | `*Close or *Flaming` | Flail |
| Flail Slam | Attack | Heavy | | Flail |
| Wax Punch | Attack | Light | `*Sealed` | |
| Fan Flames | Attack | Light, ranged | `*Unsealed`, `*Far` | |
| Flame Blast | Attack | Heavy, ranged | `*Unsealed` | He becomes Sealed |
| Chain Guard | Block | Normal | | |
| Wax Guard | Block | Light | `*Sealed` | |
| Stride | Maneuver | Retreat | `*Close` | Always backs off, never advances |
| Wind Up Flail | Rest | | | |
| Clutch Arm | Rest | | `*Unsealed`, `*!Flaming` | He becomes Sealed (phase two: sets the flail alight) |

### Stances

Usurp Flame comes first in every stance's list (see above); the rest, in order of priority:

```
Usurp Flame / Wax Punch / Recover / Second Phase > Idle          > Stride, Wind Up Flail
Chain Guard / Clutch Arm             > Wax Shoulder In         > Fan Flames, Wax Guard, Wind Up Flail
Fan Flames / Wax Guard               > Wax Arm Back            > Wax Punch, Stride, Flame Blast
Flame Blast / Recover                > Arm Over Chest          > Fan Flames, Wax Guard, Clutch Arm, Stride
Stride                               > Flail Clutched          > Flail Swing, Chain Guard
Flail Swing / Wind Up Flail          > Flail Spinning Behind   > Rising Flail, Wax Guard, Stride, Fan Flames
Rising Flail                         > Flail Spinning Overhead > Flail Slam
Recover / Flail Slam / Wax Punch     > Kneeling                > Clutch Arm, Chain Guard
```

He opens the fight in **Idle**, **Kneeling** or **Arm Over Chest** (the `Recover >` stances).

### Resolved picks by state

Nothing is random inside a stance: the first available action is taken. (Usurp Flame aside, which wins whenever it is available.) `Close` and `Far` are his line.

| Stance | Unsealed (phase 1) | Sealed (phase 1) | Phase 2, Flaming | Phase 2, not Flaming |
|---|---|---|---|---|
| Idle | Close: Stride · Far: Wind Up Flail | same | same | same |
| Wax Shoulder In | Close: Wind Up Flail · Far: Fan Flames | Wax Guard | same as Unsealed | same as Unsealed |
| Wax Arm Back | Close: Stride · Far: Flame Blast | Wax Punch, near or far (it comes before Stride) | same as Unsealed | same as Unsealed |
| Arm Over Chest | Close: Clutch Arm · Far: Fan Flames | Wax Guard | Close: Stride · Far: Fan Flames | same as Unsealed |
| Flail Clutched | Close: Chain Guard · Far: Flail Swing | same | Flail Swing | Close: Chain Guard · Far: Flail Swing |
| Flail Spinning Behind | Close: Rising Flail · Far: Fan Flames | Close: Rising Flail · Far: Wax Guard | Rising Flail | Close: Rising Flail · Far: Fan Flames |
| Flail Spinning Overhead | Flail Slam | same | same | same |
| Kneeling | Clutch Arm | Chain Guard | Chain Guard | Clutch Arm |

No gaps: every stance is covered in every state (Arm Over Chest ends with Stride for the one case that would otherwise have nothing: phase 2, Flaming, on the front line), and every action leads to a stance. (`Stride` in Flail Spinning Behind never comes up: Rising Flail takes every Close case first.)

### How it reads
- **The flail chain:** Wind Up or Flail Swing → Spinning Behind → Rising Flail → Spinning Overhead → a guaranteed Flail Slam → Kneeling. Overhead is the one 100% read, and Kneeling never attacks: survive the Slam, then punish.
- **Interrupting him breaks his chains.** Hitting his Wind Up Flail cancels it, so he drops to Idle or Kneeling instead of Flail Spinning Behind. A Chain Guard with nothing to block still leads on to Wax Shoulder In. An interrupted Clutch Arm doesn't Seal him.
- **The flame is a resource.** He spends it on Flame Blast or loses it to Clutch Arm or a stagger. The only way back is Usurp Flame.
- **Where he stands decides a lot now.** Far, he throws fire (Fan Flames, Flame Blast) or swings the flail to close in (Flail Swing); Close, he backs off (Stride) or strikes with Rising Flail. Sealed, he stays in a closed loop of Wax Punch, Kneeling, Chain Guard, Wax Shoulder In, Wax Guard and Wax Arm Back, until Usurp Flame or a stagger gets him out (with you standing still; your Maneuvers move his line).
- **Fire versus flail.** Fire is ranged, so it can always be dodged; the flail is melee, so from the front line it has to be Blocked.
- **Phase two** removes the Sealed-only actions (Wax Punch, Wax Guard, Usurp Flame). Without changing a single action, he becomes more aggressive: the flame half of his graph turns into Fan Flames and Flame Blast.

### Phase two
- **Trigger:** only his **revive**: when he falls with his last health bar, phase two begins as his revive lands. (Staggering him no longer starts it; a stagger just puts his flame out.)
- **Transition:** enraged, he breaks the wax off his arm, revealing his own sinful flame, sealed underneath. He had tried to hide and forget it even from himself. He is permanently Unsealed, as a bare burning arm.
- **Phase-two scene (built):** the step where he enters phase two plays a 5.7 s scene first. All light fades as the camera slowly pulls far back from him (he is already in Idle, unseen). In the dark, flames flicker up all around: the waxed (the fallen ones too), the sleepwalkers sealed into the floor and walls, and unseen ones beyond the screen edges. Then they stream one by one into his hand in arcs from every direction, his flame growing, until it flares like a Flame Blast with a full ring of flame rolling out (just for show), the light returning. From then on the arena's candles and the waxed remains burn for good. Phase-two look: his wax burnt pitch black, the inside of his cloak and his hood flickering with fire, the arm burning.
- **After the transition he always takes up Idle:** his pattern has `Usurp Flame / Recover / Second Phase > Idle`, and entering phase two makes his next stance come from `Second Phase` (once he's free to act: after the revive turn or the stagger's Recover). His pattern declares `Second Phase` as an event it can come from, so it's accepted in "comes from" like `Recover` (any kind can declare events of its own). During the scene he stays down while the light fades, still on his death sprite (the cloak over its wax pool), and is only standing in Idle, with the phase-two look, once all is dark.
- **Flaming Flail (phase two):** his flame can no longer be put out, so Clutch Arm sets the flail on fire instead (status `Flaming`). In phase two his flail no longer waxes. While Flaming, a direct hit from a flail attack (`#waxing`) deals 1/4 of its damage again as extra damage (`FLAMING_BONUS`, a first guess to tune in playtesting). A Flail Slam puts the fire out, and its shockwave burns (orange flames instead of white spikes), as big as Flame Blast's. Look: flames wrap the flail's head; its trails, spin ring and blurred heads turn to fire; Clutch Arm's trail is flame instead of wax.
- **Waxed player (built):** only flail attacks wax. Waxed and standing, wax is caked on you (a shoulder, your back, an arm, a thigh, a run down your head). Staggered while Waxed, you (and every enemy with the Waxed status on it, whatever its kind but the Warden, who has a figure of his own) are sealed whole in wax at once (encased: kneeling like a waxed sleepwalker, every limb, body and head in wax), your flame burning on your head, and you keep exactly that look until you recover (no other sprite in between); Usurp Flame takes that flame and you stay encased. When Usurp Flame targets you, that turn's forced Recover does not end your stagger: you stay down, encased, and get up with the next forced Recover (the flame is taken only once, so nothing else holds you). Recovering (or reviving) clears Waxed and the encasing, and from that moment you stand rather than kneel; a waxed ally whose flame is taken is encased the same way, for good. When your Fatigue clears, Waxed clears with it.
- **Fire hits (built):** wherever a fire attack lands (Fan Flames, Flame Blast, a Flaming flail's burn, a shockwave on his allies), flames flare up around the unit hit, with a whoosh-and-crackle sound.
- **Shockwaves hit his allies (built):** his `#shockwave` attacks, **Flame Blast** and **Flail Slam while the flail is Flaming**, send the shockwave through the whole fight after the blow: every other enemy still on its feet (the waxed) takes the attack's damage as a direct hit (armor still turns its share into Fatigue), with no Block or dodge to answer it. At 30 health his heavy attacks deal about 7, so two shockwaves clear a waxed (12 health). An unlit Flail Slam has none.
- **His death ends the fire (built):** when he falls for good (his last bar, no revive left), every flame he lit dies out: all the waxed still on their feet die with him, sealed in wax, and the candles of the fallen waxed and of the arena go dark. The wax in his own remains is burnt **black** if he died in his second form.
- **Cameras in the Warden's scenes (built):** an attack's camera backs off as far as it takes to show both fighters whole (head to feet inside the black strips, clear of the sides). When he is staggered in phase two, the camera frames him and the waxed his flame is sent to, to see it rise. At his phase-two transition, while the screen is dark, the three waxed are moved to the back line, so they stand in frame behind him when the light returns.
- **Revives heal to full** (the healing item, like the boss's revive). Overflow into Eternity comes later.
- **Arena:** the Warden's fight has sleepwalkers sealed into wax mounds on the floor and into wax walls around it, each with a candle on its head (unlit until phase two). The waxed stay where they fell for the rest of the fight, faded; they are never repositioned.
- **Built:** falling with his revive opens the way and takes it in the same turn: his revive lands at the end of the turn he fell (see "Revives land at the end of the turn" below), and the switch and its scene play right then, as he gets back up. He lies where he fell until the scene lifts him, then stands at full health in `Idle` (`Second Phase >`).

### Small touches (proposals)
- The candle-sleepwalker stays in the arena, resting.
- His bare, burning arm stays visible for the rest of the fight.

---

## 7b. The Guide — the tutorial's opponent (figure built; behavior still to design)

The tutorial is to be fought against the guide instead of a waxed. The guide is rigged as a unit (a kind in `core/kinds/guide.ts`, drawn by `guide/`), viewable in the Model viewer and in Test combat ("The guide").

**Look (built, first pass):** noticeably shorter than the player, in a **pointed navy cloak that doubles as a hat**: the tip of the hat reaches about the player's head height, the face opening is a dark hollow low in the hood. A **white glowing orb of yarn** hangs in front of it on **black string**, from the opening (the string wound twice round the orb: the far halves pass behind the yarn, the near halves cross in front in an X; the yarn drawn as loops). **No hands and no opening for arms**: only **bare feet**, barely out from under the hem. It fights with the orb. From behind, only the string looped round the neck shows.

**Poses (first pass):** a pose is a few numbers on the cloak (lean, orb swing and reach, squash, narrow, tuck, glow, curl, lift): `gd-idle`, `gd-hover` (Halo Blast gathering: the orb floats up on a slack string), `gd-halo` (Halo Blast released), `gd-drift`, `gd-orb-back`, `gd-swing`, `gd-tight`, `gd-hum`, `gd-shuffle`, `gd-down` (staggered), `gd-flinch`, and the Model stance `gd-t` / `gd-t-b`.

**Pattern: placeholder only** (20 health, no weapon or armor): stances Waiting (Hum, a Rest), Orb Back (Swing Orb), Pulled Tight (Cloak Tight, a Block), Drifting (Shuffle In / Shuffle Back) and Orb Hovering (Halo Blast). The tutorial fight does not use it: it follows a script.

**The tutorial fight (built; in Test combat as "Tutorial: the guide", and on the map when you speak to the guide).** Four scripted turns against the guide, which starts on the back line (script: Hum, Hum, Halo Blast, Halo Blast), under `combat/lesson.ts`. The player can't be killed and the guide can't fall (`sparring`); after the last words the fight is won.
- **The guide's box:** its words are written at the bottom of the screen one letter at a time (about 30 ms each, a little longer after a comma or full stop), with the instruction in brackets under them once written. **E finishes the words at once; while they are being written nothing else works.** Then you may **experiment**: WASD moves the cursor and lights other options, E opens a wheel, Q closes it; only **taking an action** is held back (E takes it only if it is the one asked for, on the one it was asked of). Undo a step (move away, close the wheel, light another option) and the box **switches back to the previous instruction**. Focusing on the **wrong one** is allowed: the guide then says "Not that one, sleepless one." (Press Q to cancel) until you cancel (placeholder words). The mouse's hover does nothing. Esc still pauses.
- **Turn 1, attack:** "Over here, sleepless one." (Press E to focus on your target) → "Come, prove your strength to me." (Press E to Attack focused target) → the turn plays → "Promising..." (Attacks deal damage in exchange for fatiguing yourself), E to go on.
- **Turn 2, rest:** "Gather yourself..." (Change your target to yourself with WASD) → "Catch your breath." (Select Rest with E).
- **Turn 3, dodge:** "Let's change pace." (your cursor is still on yourself: press E to focus, then WASD to light Dodge on your own wheel) → "Stand back now..." (Press E to fall back avoiding incoming attacks). The guide's orb hovers, then it releases its **halo** (Halo Blast, a light ranged attack: rings of white light that grow out of the orb as their center, widening until they have swept through you; not a projectile); you fall back out of its way.
- **Turn 4, block:** "Do not look away, brace thyself." (Select Block and press E to fend off a target's incoming attack). The same hovering orb and halo; this time you do the whole thing yourself: target the guide with WASD, focus with E, light Block, E.
- **Last words** (placeholder): "Well done..."
- **Names:** the wheel's **Fall back** and **Maneuver** are both called **Dodge** now (the rules keep the names Maneuver / falling back).
- **On the map (built):** there is no Waxed in the corner and no starting weapon any more. Speaking to the guide starts this fight (after its placeholder words); passing it leads to the relief, the rest and the knot (§8). The guide's dialogue outside the lesson is to be remade.


---

## 8. Tutorial progression (built as the demo map)

1. **Waxed alone:** one stance, one action.
2. **Waxed in pairs:** same reads, plus choosing a target.
3. **Sleepwalker:** stances become menus; hedging begins.
4. **Sleepwalker with waxed support:** mixed reads.
5. **Warden:** Fatigue pressure, the fixed rule, phase two, with a waxed escort. *(Built, with his opening scene; on the map he waits on the top floor.)*

**Bare-handed sleepwalker (built):** `sleepwalkerBare`, the same wretch with no weapon (a baseline weapon: no effect, drops nothing). On the map, a "sleepwalker" means this one unless a weapon is named (`sleepwalker` is the Jagged Chisel one, `sleepwalkerHammer` the hammer one).

**String (built, first pass):** a resource shown as a counter at the top right, on the health bar's row, with a ball of yarn to its right (wherever your bars show: fights and the inventory). Each enemy truly defeated (no revive left: the Warden pays on his last fall, not his first; a Wax Blob once; the waxed he raises pay nothing on a second death) gives String equal to its max health, **however it was defeated**: struck down, sealed in wax by the Warden's Usurp Flame, spent in its own Flame Immolation, or gone with the Warden when he falls; all count as killed by you, and pay what a kill by you would. It flies as a line of string that spirals out of its remains, wanders, coils and darts into you (`render/StringFx.tsx`, on its own clock, drawn through its points as a smooth curve (`render/smoothTrail.ts`) so it has no straight edges, interrupting nothing; its canvas sits in the fight's stage just under your figure's layer, so it winds round you from behind, and so does the revive knot's red string); the counter goes up, with a "+X" under it, only when it lands. **Dying** loses all your String, but none of it is gone for good: all of it is left on the enemy whose blow felled you (a single string, not a constant effect: about every sixteen seconds it slips out from behind the enemy's sprite, very slowly spins once round it, passing behind and in front, and is gone; on the map and in the fight, each enemy on its own clock, `render/lostString.ts`; it stacks if it kills you again, and is paid to you when it is defeated, as a string of its own flying out a moment after the enemy's own; the spin is wide and tall enough to go round its whole sprite, and a Wax Blob has just one, round the middle of its heap, whichever part holds it), or, with no enemy to blame (Reawaken, falling off the map), as a pile on the floor (its yarn ball shows the same single string now and then, spinning round it) on the last solid ground you stood on (the middle of that tile, so a fall off a ledge leaves it on the ledge, not in the air), to gather with E (`Journey.string`, `Journey.held`, `GroundItem.string`). The Warden drops nothing (`noDrops`). **A boss pays more (built):** the Penitent Warden leaves ten times the String of an ordinary enemy (`stringYield: 10`, so 150 at 15 health), which bursts out of him as twelve strings, flung every way before they all coil in to you, the "+X" adding them up in one pop. Each string has an ethereal, airy sound as it flies; a boss's is lower, breathier and echoing.

**Head gear and the Depraved (built, first pass):** a third gear slot, Head: the Soldier's Legionnaire's Helm (heavy), the Hunter's Nighthunter's Hood (normal), the Nomad's Desert Mask (light; the head pieces' lore is a placeholder). Head gear counts for half of an armor of its tier (`HEAD_SHARE` in `core/rules.ts`: half its resistance and its weight, added to the body armor's). The class armors cover the arms and legs too. The class screen shows only the characters facing the camera (Q previews a class's gear like the inventory, with the hovered slot's details in the middle); a fourth start, the **Depraved**, carries nothing.

**Starting classes (built, first pass; sprites to tune by eye):** a new game opens on a class screen (`screens/ClassSelect.tsx`): **Soldier** (Bronze Shortsword, normal; Bronze Chestplate, heavy), **Hunter** (Barbarian's Axe, heavy; Nighthunter's Garb, normal) or **Nomad** (Nomadic Sickle, light; Nomad's Robe, light). Each piece is eternal from the start (read, worn and set: `startingInventory` in `explore/items.ts`; eternal gear survives death), carried into the lesson too. A piece is its tier's stats under its own name, lore, look and effect (`ITEMS`, `GearSpec.item`, `Player.weaponItem`/`armorItem`). The weapons' effects are **half the weapon's damage** (the older three are a quarter), paid in Eternity: the Shortsword makes an attack right after an attack cost that much less Fatigue (1 Eternity a point); the Axe makes a direct hit after a turn of rest deal that much more damage (2 a point); the Sickle makes a direct hit on an enemy that was staggered deal that much more (2 a point). (`Player.lastAction` remembers last turn; `eternalEffect` and `strike` in `core/resolve/attacks.ts`.) Armor has no effect yet.

**The player's body geometry (redone):** the player is drawn in the 3/4 view from *behind* (not the enemies' view, and not its mirror): seen from behind, the player's **right** side (the weapon's) is the **near** one (lower on the page, toward +x) and the left the far one (higher, toward -x); the weapon arm and the right leg are drawn in front of the torso, the left arm and leg behind it. The shoulders and the pelvis are each turned by their own angle (`Skeleton.yaw`, degrees, positive: turned right, so the left side leads and the weapon shoulder draws back), and the player's poses are built from those turns (`render/body.ts`, `render/playerPoses.ts`): feet placed by a stride along the way the pelvis points and a width across it, knees bent forward, hands given relative to the hips. A weapon held across the chest passes behind the torso (`foreBehind`). The kneel and fallen (staggered, dead) poses are unchanged.

**The player's stance (built, first pass; poses to tune by eye in the Model viewer's "You" mode):** you hold a stance between turns (`Player.stance`, `core/stance.ts`), whatever you hover: idle (the start; a Rest, a stagger and its recovery return you to it), lowered (after a Block or an overhead swing), left leg leading (after a swing to the right, or dodging forward: a Maneuver on an enemy), right leg leading (after a swing to the left, or dodging back: falling back). Your attack swings overhead from idle and at any back-line or staggered enemy; otherwise to the left from the lowered and left-leading stances, to the right from the right-leading one (right = toward the enemies, on the screen). Bare hands swing the same way, as punches thrown from each side. A Rest is a deep breath, the left hand over the chest (`rest-in`, then `rest`). Poses: `low`, `low-left`, `low-right`, `dodge-fwd`, `dodge-back`, `swing-right-up`/`swing-right`, `swing-left-up`/`swing-left`.

**Empower Self (built, first pass) and the new health numbers:** at the guide, once you have String enough to raise at least one stat, a menu option "Empower Self" appears (the first time, the guide's menu opens right on it; after that it is an option whether or not you can afford a stat, like Unwind Memories; if a memory was waiting too, Empower Self goes first and the memory menu opens on the next visit, until you have been to it once). Raising max health or max Eternity (each on its own) by one costs the sum of 1 up to its present value (at 5: 1+2+3+4+5 = 15, to make it 6). Eternal String can pay too, but only for what your own String does not cover (`payment` in `explore/empower.ts`); under the String counter the menu shows a "-X" beneath each of the two counters, how much of each the highlighted stat would take. You start with 10 health and 10 Eternity (`START_STATS`, `explore/empower.ts`; kept in the journey, and not lost on death). Enemy max health: sleepwalkers 8 (patrol wardens 10, the Penitent Warden 15 per bar), waxed 5, the Wax Blob 15 (shared by its parts), the Penitent Warden 20 (the guide stays 20). The damage numbers and the health thresholds of patterns were not retuned for these: worth a balance pass.

**Eternal String (built, first pass):** a second counter, light blue, just left of the String counter. Death never takes it. It comes from lumps of eternal string lying on the floor (`GroundItem.eternalString`, `Pickup.eternalString`; E gathers them, with a "+X Eternal String" prompt): each enemy that falls has a 5% chance (`ETERNAL_STRING_CHANCE` in `explore/foes.ts`; a Wax Blob rolls once) to drop one worth its max health. Everything an enemy drops lies a little way off the remains in a direction of its own (`dropOffset`), so drops don't clump. Nothing spends eternal string yet.

**Chasing across the map (built, first pass):** enemies find their way over the whole map, **stairs and ramps included** (`stepsToNode`, `waypoint3` in `explore/foes.ts`: a graph of places to stand, its stair links worked out by walking them with the player's own rules); with you on another level and a way there on foot they follow you by sound (giving up four times slower); and when there is none, the ones that climb use a ladder (`ladderPlan`). **The boss** (the Penitent Warden in the middle of Floor C's platform, a waxed on each of the three tiles SE, SW and NW of him, all looking toward him) never chases: `MapFoe.trigger` starts the fight and its opening scene once you have stepped beyond the platform's corner tile (the four corner tiles, where the bridges come in, do not start it, so you can see him first; anywhere else on the platform, rim included, does). **Sounds on the map** (`audio/walk.ts`): footsteps change with the floor (stone, wax, planks, dug rock, stairs, rungs) and the walker; enemies cry out as they find you; wax drips in the dark; the guide's speech blips as its words are written.

**Map enemy behaviour (built, first pass):** an enemy that notices you alerts the others within 4 tiles (`ALERT_RADIUS`); a **patrol warden howls** first (1.4 s standing still, head back, arms and torch up, rings of sound), alerting everyone within 7 tiles (`HOWL_RADIUS`), and only then gives chase. Patrols (`MapFoe.patrol`) pace between points, `post` holds a spot without wandering. **Everything but the waxed and the blobs climbs ladders** (`FoeTuning.climbs`, `ladderPlan` in `explore/foes.ts`): chasing you to another level, or going back home. Decorations (`MAP_DECOR`) are bodies sealed in wax, lying about the chisel enemies' rooms.

**Placements cleared (Nov 5):** `MAP_FOES` and `PICKUPS` are empty, so the map has no enemies and no gear until they are placed by hand; the labyrinth's waxed, the Wax Blob in the shaft room and the eternal hammer in the south corridor, described below, are no longer there.

**The map (built, first pass): the tutorial segment, a waxed labyrinth round a shaft.** A miniature of the whole game's exploration philosophy, fourteen stacked levels on one grid (76 x 62) (one level is one tile of height on screen, `RISE = 1`). *Look:* floors and walls all of dark, yellowed wax (a palette per level, `LEVEL_LOOKS` in `tuning.ts`), with the dark outlines of **sleepers sealed into the wax** pressed into the wall faces and lying under the floor's skin (auto-scattered, the same every run: `explore/sealed.ts`, density `SEALED_DENSITY`). *Layout (level 0):* the **labyrinth is a short one-tile-wide ring round the shaft room**, its three far corners cut by **diagonal corridors**. It starts at the start room in the north-west (safe spot "start") and goes **clockwise**: along the north side, down the east side, along the south side, up the west side to the **west corridor** that leads into the shaft room. Following the main path you always end there, after a full circle. Branches and dead ends hang off the ring (nooks to the north, east and south, and a dead end up the west side), and **waxed stand in its corridors and must be beaten to pass** (four groups, one a pair). The shaft room also has an **east and a south corridor**, which join the ring (so the room can be entered from three sides). *The hurdle:* the **shaft room** is a tiny octagon (5 wide at most) at the centre, with a **Wax Blob** (§5b, three targets sharing one body) that is **too fat to enter a corridor** (`girth` on its map enemy: a wider footprint) and cannot climb ladders. On the room's north wall is the **long ladder out, seven levels tall** (an `H` on levels 0 to 6, climbed in place with W/S; it can't touch you once you are off the floor). The intended solution: lure it to one corridor mouth (it stands there, unable to follow), back out, come round the ring to another corridor, and run for the ladder. A bold player can instead fight it (it drops nothing for now). The ladder tops out on **Floor A** (level 7), the dungeon proper (see below), where the guide waits at the second safe spot ("floor1") a few tiles from the ladder and gives you the knot. Three safe spots are planned: the start, the first floor, and a third, optional one added much later in the dungeon as a shortcut for retrying the boss. Nothing else is placed yet (no gear, no ending room). *Mechanics built for it:* 45-degree one-tile stairs and sideways stairs, diagonal tiles (◤◥◣◢) that cut corners, ladders climbed in place, big enemies, and the rule that the floors of a level above the one you stand on are never drawn. *Walls (built):* every wall or cliff is a block on its own level, seen wherever no floor is in the way, darkening evenly (staying solid) with its distance above or below you until it is gone at 5 levels (`WALL_FADE_LEVELS`). Stacked levels read as one wall, with a line only at its top and foot. A cliff shows only from its own floor's level or above. Floors below you fade the same way. Only a wall seen from the front is drawn; a wall seen from the side or the back (a straight wall's other sides, a south diagonal) shows nothing at all. Everyone standing on a level is drawn over that level's walls and cliffs. The walls above you draw only while you stand in the walled room they surround (open air or a ladder right overhead, `roomLimit` in `world.ts`): step under them into a corridor and they are gone. In such a room, everything north of its north wall is pitch black, with one doorway tile showing, and past the room's east and west ends the wall counts as running on. The Map viewer's free camera has none of this. *Walking:* a wall (or a diagonal's wall half) at or below your height is solid even with floor somewhere under it; the rim of a hole is walked off like any straight edge, across its cut. The old multi-floor map (cold room, ossuary, crypt, gallery, belfry, sanctum with the Warden) and its gear spots, described below, are gone.

**The dungeon (layout built, compact; no enemies, gear or extra safe spots yet).** Three floors, each **3 levels above the one below** (a climb is a run of 1-tile stairs on successive levels, each starting where the last ends: 4 from the wheel, one level below the Nave, to Floor B, and 3 from Floor B to Floor C). All of it is arranged **around the Nave** (coordinates relative to the centre of the shaft hole; the whole map is a 52 x 36 grid).
- **The shaft** is a walled tube with the shaft room's own octagonal cross-section **all the way up**: on each level from 1 to 6 there are wall tiles all round it, **diagonal walls at its cut corners** (the same cut as the room's diagonal tiles), and open air inside (`:` and the shaft diagonals in the plan; lit and seen through like floor, so its walls show along its whole height), with the ladder in the north wall. **The hole in the Nave is exactly the tube's cross-section**, with a diagonal rim (floor on the outer half of the cut tiles, air on the inner half) and a cliff face hanging from it, one block per level. (A floor in front of a cliff hides it, instead of the cliff showing as a dark strip across the floor.)
- **Floor A, the Nave (level 7) and the wheel round it (level 6, one level below).** The ladder arrives in the **Nave**, a small octagonal room (17 x 13, corners cut 3 tiles) whose **walls rise unbroken from level 8 to level 12, up to the underside of the Sanctum** (the diagonal spokes pass under them, the Gallery's bridges through them), with the shaft hole in its centre (an open ledge, a 7-level drop: you can walk off it and fall into the Wax Blob's room). The guide stands a few tiles from the ladder. Through the middle of each **diagonal corner wall** (NE, NW, SE, SW) a short **diagonal corridor** (3 steps) goes down one **diagonal stair** to a **corner hall** (7 x 5); the diagonal tiles beside the stair tilt with it, since you walk across those too (`↖ ↗ ↙ ↘` in the plan). **The SE door is shut at the hall end by metal bars** (the Nave's SE diagonal door and its stair are open, but the corridor ends in a diagonal bar gate, plan char `/` or `\`: it blocks walking but not sight or light): the SE hall, with the stairs up to Floor B, can only be reached round the ring, from the neighbouring halls' links. The halls are joined into a ring by four 2-wide **links**, and a small **chapel** (dead end, 5 x 4) hangs off the middle of each link, outside the ring. The whole wheel, halls, links and chapels, is on level 6. The **stairs up** (4 steps north) are in the SE hall (walled off from the Nave, see above) and arrive at the south edge of Floor B's east room.
- **Floor B (level 10), the Gallery.** The Nave below is treated as an even bigger shaft: the open space above it is empty, and **side rooms around it are joined by two thin one-tile bridges that cross over it**, a west-east one and a north-south one, meeting in a cross above the middle (you look down at the Nave across the ledges, and can step off a bridge to drop three levels onto its floor). A bridge is one block thick: its face is one level tall, however far the drop. Four rooms: west, east, north and south (7 x 7 to 10 x 7), plus a north-east room linked to the east room by a short corridor (a dead end for now: the stairs from Floor A now arrive in the east room). The **stairs to Floor C** are in the west room (3 steps east), so you must cross a bridge to reach them.
- **Floor C (level 13), the Sanctum.** Just the **boss arena**: a big octagon (19 across) over the Nave, where the Warden waits. The stairs from Floor B arrive at its west edge. (The shortcut safe spot and the ending room are still to place.)
- Each floor has its own stone colour (Floor A plain, B blue-grey, C darker and warmer). Code: `explore/plans.ts`, `LEVEL_LOOKS` in `explore/tuning.ts`.

**Keepers (built):** one hooded guide with a candle, who is not always there: it fades in as you come near a safe spot (the start room, the first floor) and fades out as you leave. Stand by one and press E to rest (the screen fades out and in): your candle moves to it, the knot (once you have it) is wound tight again, and should you fall in a fight you wake in front of it. The sleepwalkers get up again when you rest; the waxed stay dead.

**The tutorial (built):** (1) **A new game opens inside the lesson.** You wake in the dark: the screen is black but for a pale glow, the guide's orb, which comes toward you from far off; then the dark lifts and the lesson begins (a fight against the guide itself, see §7b: four scripted turns, its words typed out at the bottom, only the keys it asks for working). It can't be lost or ended early. Continuing a save whose lesson is not passed starts it again. (2) Passed, you are on the map in the start room of the labyrinth, bare-handed, free to rest at its safe spot or walk on. There is no wax to melt and no more talk with the guide here. (3) At the **first floor's safe spot** (the second one), the first time you rest, the guide gives you the knot. **The guide's words are placeholders, to be remade.** Code: `explore/tutorial.ts` (state and the gift), `combat/lesson.ts` (the lesson), `combat/CombatScreen.tsx` (`wakeUp`, `WAKE` in `combat/playback.ts`: the opening), `render/Scene.tsx` (`dark.glow`).

**Who starts where (built):** in a fight that starts from the map, the enemy that touched you (its map enemy's first) starts on the **front line** and every other enemy, its group-mates and any that were chasing you, starts on the back line. (The Warden's fight keeps its own lines, for its opening scene.)

**The guide on the map (built):** drawn like its model: a short navy pointed cloak (the tip as high as the player's head), a dark face hollow, the yarn orb hanging on black string crossed in front, bare feet. The orb shines bright by the place where you last rested and dimly elsewhere.

**The knot (built):** the demo's only revive item, given by the guide the first time you rest at the first floor's safe spot. An impossibly tangled knot with no beginning or end: it keeps you from fading once ("unwinding"), after which it hangs slack; resting at a safe spot winds it tight again. Until then you have no revive. It is no inventory item: the guide's gift pops up as a "got item" box (the knot's red yarn ball and its name, fading away, where the Pick Up prompt is). Its state shows beside your health bar, wherever your bars show (fights and the inventory): **the knot's symbol** (a red ball of yarn, white towards the middle) with your revives left as a **red Roman numeral** over the white; when none is left, the middle is **black** and the numeral is gone. The symbol appears only once you have been given your first knot (`knot` on `PlayerBars`; Test combat, which has revives of its own, shows it too). It is spent whether you then win or lose the fight.

**Skipping the tutorial (testing aid, built):** there used to be a developer-tools menu entry "Exploration (skip tutorial)" (removed; the Journeying `skip` option remains): a new game with the lesson already passed and the guide waiting to be rested with (the wax melts after that, with the knot, as usual). It replaces any save.

**Saving (built):** your progress on the map (where you stand, who is beaten, the tutorial, the knot, your gear, your last rest) is saved in the browser whenever you rest, a fight starts or ends, and when you go back to the main menu. The main menu then offers "Continue exploration" and "New exploration". Code: `explore/save.ts`.

**Gear and inventory (built):** you start with nothing: bare hands (baseline weapon) and no armor. Enemies drop the weapon and armor they carry, all of it, every time (bare hands and no armor aren't gear, so a Waxed drops nothing; a Sleepwalker drops a Jagged Chisel, and an enemy fighting with an eternal effect still drops the ordinary weapon; weapons are named for the weapon ("Waxed Torch", "Eternal Brick Hammer"), armor for its weight). Press E on the map for the inventory screen (see "Inventory" in §2); gear lying at your feet: E opens the inventory on its ground place, to take it into your ordinary place or swap it for what is there, and an eternal piece comes as a memory for the guide to read. What you wear shows on your map figure, drawn like in a fight: the weapon hangs from your right hand (dagger, sword or maul by tier), armor is a plate over the torso (wider when heavier), Normal and Heavy add pauldrons and Heavy a helmet. You can carry any amount of eternal gear, but only one ordinary weapon and one ordinary armor at a time: a new one takes the place of the old (and is worn if the old one was), and the game says what you let go of. Nothing you pick up goes on by itself. Falling (with no revive) loses all gear except **eternal** gear, which is kept and worn again. **On the floor**, every piece looks the same: a small ball of yarn like the guide's orb, glowing faintly, drawn over the remains it lies on; an eternal piece glows light blue instead, wider, pulsing slowly (`drawPickup` in `explore/figures.ts`). **Reawakening** is the same whether you rest by a keeper or fall and wake there (`wakeEnemies` in `explore/foes.ts`; falling also costs your ordinary gear): the sleepwalkers get up, everything on the ground goes, and **remains that stay for good** (enemies that don't get up again: the waxed, the Warden...) get what they dropped back, lying on them again, every time, even if you still carry the one you took; what sleepwalkers dropped goes when they get up. Set on the map now: an eternal Brick Hammer at the west end of the wheel's south corridor (level 6), the ledge before the drop into the dug-out SW hall, and a Chisel Waxed in the labyrinth's little east room (level 0), for trying out picking weapons up (it drops an ordinary Jagged Chisel). (Older notes: a Normal armor in the cellar's first big room (the cold room, far corner), and a Normal weapon in its deepest one (the ossuary, past its sleepwalker). The rest is hidden across the dungeon, all of it eternal: a Light weapon on the raised platform east of the start room (up the stairs off the south path), Light armor in the hall's south-west corner, Heavy armor in the belfry's far corner, and a Heavy weapon in the crypt's far corner; that map is gone.) Code: `explore/gear.ts`, `explore/InventoryScreen.tsx`, `explore/GuideMenu.tsx`.

**Loadout (built):** what you wear (see Gear and inventory) is used for every fight on the map. Test combat still has its own loadout screen.

---

## 9. Open questions

- **Player health:** 20 everywhere now (was 40), so the map's waxed (12) and sleepwalkers (20) hit relatively harder. Revisit after playtesting.
- **Sleepwalker** redesigned (built): its own stances, actions and poses (section 6); staggered and flinch poses still generic.
