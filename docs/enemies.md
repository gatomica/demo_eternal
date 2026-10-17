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

**Every choice is even.** Whenever an enemy picks from a set of options (a stance, a kind of action, an action within a kind), each option is equally likely. Nothing weights the odds, not even its Fatigue.

**Enemies can overreach.** Unless a kind is written with an explicit restriction, an enemy may pick any action, including an attack it can't afford, which staggers it.

**Bosses revive.** Bosses carry the same revive item as the player, juiced up: it restores them to **full** health. They never use it mid-fight, only when they would fall. Bosses therefore effectively have multiple health bars.

---

## 2. Combat rules decided in design

- **Staggered** is the name for a broken guard: Fatigue reached your health, so you lose your next turn to a forced Rest. (Replaces "broken" everywhere.)
- **Maneuver (built):**
  - **A Maneuver has a target.** It pulls its target closer (front line) and pushes its *opponents* away (back line), never its allies. Falling back is a Maneuver with no target. An enemy's Maneuver either closes in on you (you're its target) or backs off.
  - **Distance is settled per enemy, between you and it.** If only one of you Maneuvered, that one decides. If you both did and agree, it happens. If one wants closer and the other farther, both play the move but the distance stays.
  - **A melee attack closes in on its target only if the target didn't Maneuver.** You can't drag in an enemy that's backing off, and an enemy can't follow you when you fall back, even if its attack hits you.
  - **Dodging works like Blocking:** a Maneuver dodges every attack from the back line, plus its own target's attack even from the front line. Every other front-line melee attack hits. Ranged attacks are always dodged.
  - **Cost:** a Maneuver itself is free, so even heavy builds can reposition on safe turns. A dodged attack does no damage and becomes Fatigue instead: (1 + armor weight + weapon weight) / 16 of its damage, by **true weight** (what you carry, whatever the action).

    | Weights | None / Baseline | Light | Normal | Heavy |
    |---|---|---|---|---|
    | Armor | 0 | 1 | 3 | 8 |
    | Weapon | 0 | 1 | 3 | 8 |

    For example, light armor and a normal weapon: 1 + 1 + 3 = 5/16 of the damage. Heavy armor and a heavy weapon: 17/16, more than the hit itself; heavy builds are built to Block.
- **Baseline weight (built):** bare hands. A baseline Attack costs 1/16 and deals 1/16, and is the fastest of all (speed follows weight: bare hands, light, normal, heavy). Still not worth it damage-wise next to a light attack. A baseline Block adds no Resistance, relying fully on the fighter's base Resistance and armor (both to reduce damage and to send Fatigue back).
  - **No weapon = baseline.** "None" is a weapon choice: the starting, bare-handed loadout. Your Attack (still labelled "Attack") is a bare-handed blow and your Block is a baseline Block. Only available with no weapon equipped.
- **Ranged attacks (built; the waxed's Hurl Wax is the first):**
  - The attacker doesn't move (melee attackers close in on their target).
  - When Blocked, no Fatigue is sent back to the attacker.
  - In exchange, they can always be dodged, even from the front line.
- **Direct hit:** an attack that was neither Blocked nor dodged.
- **Each action has its own weight (built):** an Attack or Block can carry its own tier (cost, damage, speed, Block strength) instead of the fighter's weapon.

---

## 3. Stances and actions: how enemies are built (built)

Every enemy is a loop: **stance** (shown to you) → **action** (hidden, unless the stance has only one) → **next stance** → …

- Each **stance** lists the actions it allows that turn.
- Each **action** lists the stances it can lead to next turn.
- Actions come in three **kinds**: **Attack**, **Defense** (Block or Maneuver) and **Rest**. Each named action also carries its own numbers (weight tier for attacks and Blocks, ranged or melee, special effects).

**Picking (the global rule, all even):**
1. Next stance: evenly among the stances the last action leads to.
2. Within the stance: first a kind, evenly among the kinds it offers; then an action of that kind, evenly.

**Recover** is the turn after being staggered, or after reviving. It is not the same as a voluntary Rest.
- `Recover >` stances are also the stances an enemy can **open a fight** with.

**Actions that didn't happen fall back to Recover.** If an enemy's action didn't actually happen, its next stance comes from its `Recover >` stances instead of from that action:
- A **Rest** cancelled by a hit.
- A **Block** that had nothing to block.
- Any action **cancelled** before it happened, such as an attack whose target was already gone.

**Attacks and Maneuvers can't whiff.** They commit the body (closing in, changing lines), so once performed they always count, even if the attack was Blocked or dodged, or the Maneuver dodged nothing.

Effects tied to an action (like the Warden becoming Sealed after Clutch Arm) also only apply if the action actually happened.

**Safety net.** Enemies are written with no dead ends. But if every action in a stance is unavailable when it's time to act (locked to a phase, needs a status, silenced, depends on the player's state…), the enemy acts as if it just Recovered: it goes back to an opening stance.

**Notation.** Enemies are written in this notation in the game's code (one file per kind in `src/core/kinds/`) and parsed when the game loads, so the doc and the game read the same.
- `A / B > Stance > X / Y` means: after action A or B, the enemy can take this stance; from it, it can do X or Y.
- `/` separates kinds of action; `,` separates actions of the same kind.
- So `> Rising Flail / Wax Guard, Stride` is Attack 50%, Defense 50% (Wax Guard or Stride, 25% each).
- `All >` means the stance can follow any action. `Recover` can be listed like an action.
- Actions are declared first, one per line: `Name: kind, modifiers`.
  - Kinds: `attack`, `block`, `maneuver`, `rest`.
  - Weight: `baseline`, `light`, `normal`, `heavy` (default: the enemy's weapon).
  - `ranged`.
  - **Every Maneuver says its direction:** `advance` (closes in on you; you're its target), `retreat` (backs off), or `by-line` (closes in from the back line, backs off from the front).
  - `*Condition`: only available while that condition holds (e.g. `*Sealed`).
  - `#tag`: a rule the action triggers, e.g. `#waxing` (a direct hit leaves the target Waxed).
  - `//` starts a comment.

```
actions:
  Wax Guard: block, light, *Sealed
  Stride:    maneuver, retreat
stances:
  Stride > Flail Clutched > Flail Swing / Chain Guard
```

- **The parser refuses broken patterns** when the game loads: an unknown action name (typos), a Maneuver without a direction, mixed kinds after a `,`, the same kind in two `/` groups, no stance coming from Recover, or an action that leads to no stance (a dead end).
- **The game also refuses broken kinds** when it loads: a `*Condition` with no rule written for it, a pose for a stance or action that isn't in the pattern, a pose that doesn't exist, or a fixed-rule action that isn't in the pattern.

### Sleepwalker in this format

Action names are placeholders **(proposal)**; the user will name them.

| Action | Kind |
|---|---|
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

- **Extremely telegraphed: one kind of action per stance.** There's never any doubt about what kind of thing it will do this turn; which stance it takes from turn to turn is random. Its job is to teach the actions plainly: see this stance, answer with that action.

**Built:** 12 health, baseline weight, no armor.

| Action | Kind | Notes |
|---|---|---|
| Scratch | Attack | Baseline |
| Hurl Wax | Attack | Light, ranged |
| Brace | Block | Baseline (no bonus Resistance) |
| Drag Forward | Maneuver | Advance |
| Slither Back | Maneuver | Retreat |
| Clutch Flame | Rest | |

```
All > Hands Raised      > Scratch
All > Wax on Hand       > Hurl Wax
All > Cowering Sideways > Brace
All > Crawling          > Drag Forward, Slither Back
All > Cradle Flame      > Clutch Flame
```

- Each stance 20%. Crawling is the only one with two actions: Drag Forward or Slither Back, 10% each. It attacks even when the attack will stagger it.
- **Looks (built):** kneeling, shins bound in wax and laid flat behind, head a lump of wax (no face). Hands Raised: both hands up, clawing. Wax on Hand: leaning back, a wax lump held behind the shoulder. Cowering Sideways: twisted away, arms over the head. Crawling: on its hands. Cradle Flame: a small flame cupped at the chest; Clutch Flame folds over it. Staggered: toppled forward onto its head.
- On the map it crawls slowly after you on its hands once it sees you.
- Assumed (unconfirmed): Scratch is the "Lunge" in Hands Raised; Hurl Wax has no extra effect.

**Proposals**
- *The wax decides what it can't do.* Variants sealed differently (a waxed arm means no Hurl Wax) give variety without new rules.
- *Long wind-ups.* Hold the stance a beat longer during planning.
- *Cracking.* When staggered, its wax cracks and it becomes slightly more sleepwalker-like over the fight.

---

## 6. The Sleepwalker — standard enemy (built)

Reused across the whole game.

| Stance | Look | Can lead to | Safe answer | Greedy answer |
|---|---|---|---|---|
| **Ready** | En garde: knees bent, blade levelled at you | Attack, Block, Maneuver | Block | — (attacking risks a block that sends damage back, or a dodge; resting gets punished) |
| **Intimidating** | Open stance | Rest, Attack | Block | Attack (catches the rest, trades if it attacks; weapon speed decides) |
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

**Numbers (built):** 30 health per bar (1.5× the player's starting 20), two bars (one revive, to full health), normal armor, normal weapon. The player gets **one revive** in this fight. Playable now as "Penitent Warden" in Test combat, drawn as a placeholder figure until phase 4.

### Look (built)
- A tall figure (about 1.2× a normal figure) in a **gray cloak** reaching the ground, its hem crusted with wax. The cloak is **ripped along his waxed (left) side**: sealed with wax from the armpit to the hip, failing from the hip down, gaping open to show his left leg over a wax-caked lining.
- **Hood** (one flat color, pointed at the back) hiding his face; only a **waxed, beak-like mask** pokes out. **Wax drool** runs from under the beak down the front of the cloak like a beard, over an older, duller **stain**; both only show while his front faces you.
- **Right arm: the flail.** A long wooden handle held at its middle, the chain hanging from its tip, a wax-filled censer at the end (fixed chain length).
- **Left arm: encased in wax**, the forearm swelling toward a thick hand. Unsealed: a candle flame at the hand. Sealed: smoke rising from it. Phase two: a black, scorched arm with embers, the hand engulfed in flames.
- No shape is see-through except effects (shadows, glows, smoke, trails, whirls).
- Per-pose options: how far he turns (candle side toward you, or flail shoulder toward you), head tilt, looking back over his shoulder, face turned toward the camera, arm tucked behind the head or body, arm starting from the rip's armpit.

**Poses fine-tuned with the user** (in the model viewer): Idle, Wax Shoulder In, Wax Arm Back, Flail Spinning Behind; actions Fan Flames (swat + flat fan of flame flying through you), Flame Blast (kneels and punches the ground; a near-straight flame-coloured trail follows the fist; the fireball flash bursts at the impact, then the shockwave ring of tall flames), Wax Punch (the same kneeling punch with the cold wax fist and a wax-coloured trail; melee; a small white impact ring where it lands); stance Kneeling (flail hand on the raised knee, handle up; wax hand at his side holding the chain, head hanging below it; the cloak runs flat over the raised thigh, then drops); Clutch Arm (its own rest pose: hunched, the wax fist gripping the flail head and pulling it up, then straight into Wax Shoulder In, flame out unless in phase 2, with a wide wax trail from the old head position through his wax hand to the flail head); Wax Guard (holds whatever stance he's in; only as a blow lands does he swat it away with Fan Flames' backhand, a wax trail and no fire, then settles into his next stance; in the Model viewer, playing a Block makes the player attack so there's something to block); Chain Guard (as the blow lands: braced, the flail hand holding the handle up in front, the wax hand gripping the chain pulled taut diagonally across his front, the head swinging below the fist). All Blocks and Maneuvers, for every fighter, hold their stance until the blow lands, then block or dodge; a block jolts both fighters apart and they stay there; a dodge, seen from the camera, steps 1.5 m back and 1.5 m across the screen (away from the attacker) when retreating, 1.2 m across when closing in, and keeps its maneuver pose to the end of the turn, walking off in it; Stride (his back to you, spun on his right leg and crouched low, the wax arm trailing, the flail arm leading the spin with the flail flung out level behind him, just the tip of his beak past the hood); stance Flail Clutched (Wax Arm Back, but the wax fist has hauled the flail up by its chain, crossing over his cloak, the head hanging below); Flail Swing (Wind Up Flail's pose, but its first spin trail is the blow, a level sweep across his front through you, then two spins behind him into Flail Spinning Behind); Flail Spinning Overhead (handle up and away from you, the flail a level blur of chains above him); Rising Flail (hips nearly front-on, shoulders twisted flail-first, leaning back onto his left leg, Wax Arm Back's head; first trail swung up from below behind his cloak, then two level spins overhead, snapping to Flail Spinning Overhead on the third); Flail Slam (Kneeling's body, Wax Arm Back's head, wax elbow above the shoulder, flail arm down and back over his torso, the flail slanting along the floor, a trail bringing the head down from overhead and a white impact shockwave where it lands); Arm Over Chest (wax arm folded up across his chest, elbow low; flail held a little up with the handle almost level, the flail hanging in the air). Maneuvers: the maneuver pose only comes with a dodge or the actual move (hit while holding the stance, it stays), and is kept through the walk to the new spot. Usurp Flame (fine-tuned): a scene plays before the turn's final step: the light dies (0.9 s) as the camera settles between him and his target, only the target's flame still burning (the flame a waxed ally holds, or a candle above the player's head); he springs from a low Wax Arm Back crouch (looking at the flame) and dashes at it, wax hand raised, the camera closing in on both (0.6 s); black (0.5 s); the light returns (1 s) on him in Idle, his flame lit, as a flame trail streams from the target, arching over him into his hand; then the turn's repositioning plays. The dash's reaching hand is held low (a waxed-staggered player is about a waxed sleepwalker's height). A Rest broken by a blow shows the kind's flinch pose (flinch / w-flinch / wd-flinch) from the hit to the end of the turn. Staggered in phase one, his flame is out; whenever it goes out (stagger, Clutch Arm, Flame Blast) a puff of smoke leaves his hand, Wind Up Flail (its own rest pose: three timed spin trails, then straight into Flail Spinning Behind).
**Still first-pass:** the staggered pose.
**Resting keeps its stance** (done): an enemy that is going to Rest keeps its stance pose until the Rest actually happens, then shows its rest pose (if it has one). A Rest that gets interrupted never leaves the stance.

**Built since:** wax showing on the player (caked, then encased when staggered), the encasing of the player and of waxed allies, the arena candles, his two health bars.

**Opening scene (built):** the Warden fight opens with a third waxed (Waxed C, set up with `offering: true`) kneeling beside him, cradling its flame, while he stands Sealed, his flame out. After a 1.2 s look at the arena, the Usurp Flame scene plays exactly as in a fight (the light dies, he dashes at it, black, the light returns on him in Idle as the flame arcs into his hand), leaving it encased for good and him Unsealed. The fight then starts on turn 1, his stance coming from `Usurp Flame >` (Idle). It's built by `openingOf` in combat.ts and played by the combat screen as a turn with no action of yours; Retry plays it again.

**Settled after playtesting:** the staggered pose is final; the Warden's tuning stays as is (punishing at first, then learnable: the intended soulslike loop, even for a tutorial boss); Test combat covers the Test Boss button; everything checks out in a real fight (the arena may get another pass later).

**Shelved:** the waxed sleepwalkers' *Cracking* (maybe for a future variant; the waxed stay the most basic enemy).

**Later:** Overflow into Eternity on healing (the healing item and revives both heal to full), after Eternal weapons exist.

**Built since:** Slither Back has its own sprite (sat down, dragging itself backwards on its rear, hands planted behind, bound legs out toward you); a clean hit (not blocked or dodged) flashes the target red; a Maneuver hit anyway (front line) keeps its stance as it's hit, only taking its maneuver sprite on a successful dodge or for the repositioning. An attack that leaves its user staggered (or down) still plays out in full (a strike that spins on into its next stance, like Rising Flail, still snaps to the pose it ends in, flame unchanged), and only drops to the staggered pose once its step is over.

**Tools built for this:** a **model viewer** (main menu) to pick an enemy, flip its statuses, set its stance and play any action from it; ranged attacks throw **projectiles** across the field; Rests can have their **own pose** for when they go through (shown briefly, 0.3 s, then the next stance).

### The waxed escort (built)
- The fight opens with **two waxed** on his side (in front), the Warden behind them.
- **Usurp Flame on allies:** the fixed rule also covers them. While Sealed and able to act, he always uses Usurp Flame on a waxed that is **staggered** or **about to use Clutch Flame** (Cradle Flame always leads to it, so it's readable).
  - He becomes Unsealed; the waxed loses its flame and is **encased in wax whole**: out of the fight for good.
  - Aimed at an ally, the Maneuver pushes you away, like backing off. From the front line it doesn't dodge your melee (a **free hit** on him); from the back line it does (a **free Rest** for you). He ends on the back line.
  - If the waxed is gone before he reaches it, Usurp Flame fails (counts as an action that didn't happen) and he stays Sealed.
- **Several flames at once** (you and a waxed, or both waxed): even odds.
- **Phase two kills the escort:** whenever he enters phase two, any waxed still standing die in the transition. *(Phase 4 visuals:)* every waxed, however it left the fight, becomes a **human candle** as his arm unseals fully, flames spreading across the arena from the wax on the floor. Just for show.

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
| **Permanently Unsealed (phase two)** | On his last health bar, as a burning arm; or early, if staggered while already Sealed |

### Wax on the player
- A **direct hit** from any **flail** attack makes the player **Waxed**.
- Hit directly by the flail while already Waxed: **bonus Fatigue equal to 1/8 of the damage** dealt.
- Losing all Fatigue clears Waxed.

### The fixed rule
> If the player is **staggered and Waxed**, and the Warden is **Sealed** and able to act, he **always uses Usurp Flame**, whatever his stance.

Every stance effectively has Usurp Flame available under those conditions; its other options apply only when they aren't met. This is the one fully certain thing about him: the player can learn to bait it or deny it.

**Read for the player:** wax is a warning light.
- *Waxed, with his flame out:* play safe. Getting staggered now hands him his flame back.
- *Not waxed:* you can push. A stagger only costs the usual lost turn.

### Actions

| Action | Kind | Weight | Notes |
|---|---|---|---|
| Flail Swing | Attack | Normal | Flail (waxes on direct hit) |
| Rising Flail | Attack | Normal | Flail |
| Flail Slam | Attack | Heavy | Flail |
| Wax Punch | Attack | Light | Sealed only |
| Fan Flames | Attack | Light, ranged | Unsealed only |
| Flame Blast | Attack | Heavy, ranged | Unsealed only; he becomes Sealed |
| Chain Guard | Block | Normal | |
| Wax Guard | Block | Light | Sealed only |
| Stride | Maneuver | Retreat | Always backs off, never advances |
| Usurp Flame | Maneuver | | Sealed only; only through the fixed rule. He becomes Unsealed; clears the player's Waxed |
| Wind Up Flail | Rest | | |
| Clutch Arm | Rest | | He becomes Sealed |

### Stances

```
Usurp Flame / Recover   > Idle                    > Stride / Wind Up Flail
Chain Guard / Clutch Arm > Wax Shoulder In        > Fan Flames / Wax Guard / Wind Up Flail
Fan Flames / Wax Guard  > Wax Arm Back            > Wax Punch, Flame Blast / Stride
Flame Blast             > Arm Over Chest          > Fan Flames / Wax Guard / Clutch Arm
Stride                  > Flail Clutched          > Flail Swing / Chain Guard
Flail Swing / Wind Up Flail > Flail Spinning Behind > Rising Flail / Wax Guard, Stride
Rising Flail            > Flail Spinning Overhead > Flail Slam
Recover / Flail Slam / Wax Punch > Kneeling       > Chain Guard / Clutch Arm
```

He opens the fight in **Idle** or **Kneeling** (the `Recover >` stances).

### Resolved odds by state

| Stance | Unsealed | Sealed |
|---|---|---|
| Idle | Stride 50%, Wind Up 50% | same |
| Wax Shoulder In | Fan Flames 50%, Wind Up 50% | Wax Guard 50%, Wind Up 50% |
| Wax Arm Back | Flame Blast 50%, Stride 50% | Wax Punch 50%, Stride 50% |
| Arm Over Chest | Fan Flames 50%, Clutch Arm 50% | Wax Guard 50%, Clutch Arm 50% |
| Flail Clutched | Flail Swing 50%, Chain Guard 50% | same |
| Flail Spinning Behind | Rising Flail 50%, Stride 50% | Rising Flail 50%, Wax Guard 25%, Stride 25% |
| Flail Spinning Overhead | Flail Slam 100% | same |
| Kneeling | Chain Guard 50%, Clutch Arm 50% | same |

No dead ends in either state: every stance always has an available action, and every action leads to a stance.

### How it reads
- **The flail chain:** Wind Up or Flail Swing → Spinning Behind → Rising Flail → Spinning Overhead → a guaranteed Flail Slam → Kneeling. Overhead is the one 100% read, and Kneeling never attacks: survive the Slam, then punish.
- **Interrupting him breaks his chains.** Hitting his Wind Up Flail cancels it, so he drops to Idle or Kneeling instead of Flail Spinning Behind. A Chain Guard he wastes sends him to Idle or Kneeling instead of Wax Shoulder In. An interrupted Clutch Arm doesn't Seal him.
- **The flame is a resource.** He spends it on Flame Blast or loses it to Clutch Arm or a stagger. The only way back is Usurp Flame, through the fixed rule.
- **Fire versus flail.** Fire is ranged, so it can always be dodged; the flail is melee, so from the front line it has to be Blocked.
- **Phase two** removes the Sealed-only actions (Wax Punch, Wax Guard, Usurp Flame). Without changing a single action, he becomes more aggressive: the flame half of his graph turns into Fan Flames and Flame Blast.

### Phase two
- **Triggers** (whichever comes first):
  1. Staggering him while he's **already Sealed**: the skill route, with his revive still in hand.
  2. His **last health bar** (he uses his revive): the default route.
- **Transition:** enraged, he breaks the wax off his arm, revealing his own sinful flame, sealed underneath. He had tried to hide and forget it even from himself. He is permanently Unsealed, as a bare burning arm.
- **Phase-two scene (built):** the step where he enters phase two plays a 5.7 s scene first. All light fades as the camera slowly pulls far back from him (he is already in Idle, unseen). In the dark, flames flicker up all around: the waxed (the fallen ones too), the sleepwalkers sealed into the floor and walls, and unseen ones beyond the screen edges. Then they stream one by one into his hand in arcs from every direction, his flame growing, until it flares like a Flame Blast with a full ring of flame rolling out (just for show), the light returning. From then on the arena's candles and the waxed remains burn for good. Phase-two look: his wax burnt pitch black, the inside of his cloak and his hood flickering with fire, the arm burning.
- **After the transition he always takes up Idle:** his pattern has `Usurp Flame / Recover / Second Phase > Idle`, and entering phase two makes his next stance come from `Second Phase` (once he's free to act: after the revive turn or the stagger's Recover). His pattern declares `Second Phase` as an event it can come from, so it's accepted in "comes from" like `Recover` (any kind can declare events of its own). During the scene he stays down while the light fades, and is only standing in Idle, with the phase-two look, once all is dark.
- **Flaming Flail (phase two):** his flame can no longer be put out, so Clutch Arm sets the flail on fire instead (status `Flaming`). In phase two his flail no longer waxes. While Flaming, a direct hit from a flail attack (`#waxing`) deals 1/4 of its damage again as extra damage (`FLAMING_BONUS`, a first guess to tune in playtesting). A Flail Slam puts the fire out, and its shockwave burns (orange flames instead of white spikes). Look: flames wrap the flail's head; its trails, spin ring and blurred heads turn to fire; Clutch Arm's trail is flame instead of wax.
- **Waxed player (built):** only flail attacks wax. Waxed and standing, wax is caked on you (a shoulder, your back, an arm, a thigh, a run down your head). Staggered while Waxed, you are sealed whole in wax at once (encased: kneeling like a waxed sleepwalker, every limb, body and head in wax), your flame burning on your head, and you keep exactly that look until you recover (no other sprite in between); Usurp Flame takes that flame and you stay encased. When Usurp Flame targets you, your forced Recover waits until he has your flame: you only get up at the very end of that turn (otherwise you'd be standing before he reached you). Recovering (or reviving) clears Waxed and the encasing, and from that moment you stand rather than kneel; a waxed ally whose flame is taken is encased the same way, for good. When your Fatigue clears, Waxed clears with it.
- **Revives heal to full** (the healing item, like the boss's revive). Overflow into Eternity comes later.
- **Arena:** the Warden's fight has sleepwalkers sealed into wax mounds on the floor and into wax walls around it, each with a candle on its head (unlit until phase two). The waxed stay where they fell for the rest of the fight, faded; they are never repositioned.
- **Built:** falling with his revive, or a stagger while Sealed, only opens the way (`phase2Pending`); the switch, and its scene, happen as he gets back up: as his revive lands, or as he recovers from the stagger. On the revive turn your blows pass through him, then he rises at full health into a `Recover >` stance.

### Small touches (proposals)
- The candle-sleepwalker stays in the arena, resting.
- His bare, burning arm stays visible for the rest of the fight.

---

## 8. Tutorial progression (built as the demo map)

1. **Waxed alone:** one stance, one action.
2. **Waxed in pairs:** same reads, plus choosing a target.
3. **Sleepwalker:** stances become menus; hedging begins.
4. **Sleepwalker with waxed support:** mixed reads.
5. **Warden:** Fatigue pressure, the fixed rule, phase two, with a waxed escort. *(Built, with his opening scene; on the map he waits on the top floor.)*

**The map (built):** seven floors on one grid, each in its own area so no floor hangs over another (except the original bridge over the hall).
- **Crypt** (2 below): reached from the cellar by stairs east; a lone waxed and a pair of sleepwalkers round a central block.
- **Cellar** (1 below): stairs down from the ground floor's low corridor; the cold room (a waxed pair) and the ossuary (a sleepwalker with a waxed).
- **Ground floor** (start): the original hall, as before (a lone waxed, a pair, the first sleepwalker).
- **Upper** (1 up): the original bridge and far room; stairs east from the far room lead on up.
- **Gallery** (2 up): a long pillared hall (a waxed pair, a sleepwalker pair).
- **Belfry** (3 up): a landing (a lone sleepwalker) and the bell hall (a sleepwalker with two waxed).
- **Sanctum** (top): an antechamber, then the arena where the Warden waits with his three waxed. Touching him starts his fight, opening scene included.

**Keepers (built):** hooded figures with a candle, at the start, in the cellar's cold room, at the top of the stairs into the gallery, and in the sanctum's antechamber. Stand by one and press E to rest: your candle moves to it, and should you fall in a fight you wake in front of it (before resting anywhere, by the start's keeper). Beaten enemies stay gone; resting doesn't bring them back (yet).

**Loadout (built):** Exploration starts on a loadout screen (weapon and armor), used for every fight on the map.

---

## 9. Open questions

- **Player health:** 20 everywhere now (was 40), so the map's waxed (12) and sleepwalkers (20) hit relatively harder. Revisit after playtesting.
- **Sleepwalker action names** (Slash, Parry, Step, Catch Breath are placeholders).
