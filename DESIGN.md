# Heaven: Design Spec

Incremental bullet-heaven, heavily influenced by *20 Minutes Till Dawn*. 2D isometric. All numbers below are **starting test values**; they will change drastically in playtesting, so every one must live in config and be editable from the dev menu.

## 1. Pillars
- Dark, shadowed battlefield. Dark pastels, low orange fire glows.
- Endless wraith horde, one-hit death, short runs, spend currency on a skill tree, restart fast.
- **Current focus: make the first 5 minutes feel great** before expanding. Enemy variants, a second boss and more tree upgrades come after initial testing, to bring the player up to the 5 minute mark comfortably.
- Long-term goal: reach 10 minutes and fight a final boss.

## 2. Tech and workflow
- TypeScript + Phaser 3 + Vite, browser-based. Deployed to GitHub Pages by GitHub Actions on every push to `main`.
- Repo: `okitsdrew/heaven`. Claude writes the code, makes placeholder art and manages GitHub. The owner supplies ideas, tweaks and testing.
- Commit straight to `main` in small commits. Use PRs only for risky experiments.
- Keyboard and mouse only for now. Input must go through an abstraction layer so gamepad can be added later.
- Every gameplay number lives in one config module (data-driven). Nothing is hard-coded in systems.

## 3. Dev menu (build early, extend constantly)
In-game overlay, toggled with backtick. Must include:
- Live sliders/fields for every config value; preset save/load.
- God mode, add gold, add skill points, set level.
- Time scale; run length override; jump the run clock forward (so the 5:00 ramp is testable although the max run is 135s).
- Spawn boss; enemy count / FPS readout.
- Edit skill tree node costs, values, max levels.
- Full save reset.

## 4. World and rendering
- Simulation runs in flat top-down world coordinates. Rendering projects to 2:1 isometric. Sprites depth-sorted by Y.
- WASD moves along **screen** directions (W = up the screen). Aiming is toward the cursor in screen space, converted to world space.
- Infinite map via chunk streaming. Chunks are seeded by coordinates (deterministic, so revisits look the same) and freed when far away.
- Battlefield decor: charred barricades, destroyed siege equipment, fallen soldiers, burning wreckage (orange light pools).
- Collision obstacles are rare. They block the player **and enemies**. Enemies use simple steering/avoidance, no full pathfinding.

## 5. Art direction (placeholders first)
- Code-drawn shapes, no external art needed at first. Chunky pixel-art-ish look. Real sprite sheets swap in later without code changes.
- Palette: dark pastels, low orange fire glows, heavy vignette.
- **Player:** robed rogue with a large bow. The bow is a floating, animated dark-purple magic bow that phases in while shooting and out afterwards, pulled by a small yellow hand; his hands glow purple while shooting. The cloak billows behind with a procedural cloth/trail simulation.
- **Enemies:** shadowed wraiths (dark tattered silhouettes, glowing eyes). All types share a silhouette and differ by size, speed and a minor color variation. Models will be redesigned later.
- Dead enemies puff into smoke and leave no body.
- Dash visual: Bloodborne-style quick step.
- Teleport visual (later): a deep purple/black line zips between the start and end points, with small purple puffs at each end.

## 6. Player
| Stat | Base |
|---|---|
| Move | WASD (base speed tunable) |
| Fire | Left click, hold to fire at max rate. 1 arrow/sec |
| Arrow damage | 5 |
| Pierce | 0 |
| Arrow speed | ~900 units/s |
| Arrow range | ~400 units |
| Arrow hit width | more forgiving than the sprite |
| Pickup radius | ~90 units (upgradable later) |

- **One-hit death**, with a small forgiving hitbox (about the torso only).
- Arrows: if they hit an enemy they consume 1 pierce and deal damage. At 0 pierce the arrow disappears on hit. If pierce is greater than 0, the arrow continues through until it runs out of range or hits another enemy.
- Extra arrows (More Bullets) fire in a small fan, about 8° apart, not parallel.
- **Dash (Space):** ~0.075s, ~150 units in the direction the player is moving (the last move direction if standing still), fully invincible during it, passes through enemies, 0.3s cooldown shown as a ring on the player.
- **Teleport (right click, later unlock):** jump ~200 units toward the cursor at its own speed (`teleport.speed`) (invincible while travelling), 0.1s cooldown. Input is locked for 0.2s afterwards while he keeps walking the way he went; the dash does the same. Shown as a dark purple line zipping between start and end. For now it is a dev toggle that runs alongside the dash; whether it eventually replaces the dash is open.
- **Level and XP persist across runs.** (Mechanic to be fleshed out later.) Each level-up grants 1 skill point. Start with a gentle curve like `10 x level^1.5` and tune.

## 7a. Current build notes (phase 3)
- Fire Fairy, Ice Fairy, Sword Slash and Teleport are tree nodes (skill points for the abilities, gold for teleport). Dash, teleport and the abilities start locked and are bought in the tree; all nodes are free while `tree.free` is on.
- Tree node positions are draggable and saved to `localStorage` separately from progress; `tree.revealAll` shows hidden nodes so they can be arranged.
- Obstacles stop arrows and fire waves. Dash and teleport each grant 0.2s of invincibility afterwards (`player.invulnAfter`). Right-click a tree node or skill card to refund it.
- Gold and XP persist in the versioned save (`heaven.save.v1`). Uncollected gold from a run is lost when a new run starts.

## 7b. Skill tree pricing (current)
- Tier 0 Dash: 1 gold. Tier 1 (Time, Damage, More Bullets): 1 gold, doubling. Tier 2 (Pickup Radius, Gold Value, Move Speed, More Range, Fire Rate, Pierce): 100 gold, doubling. Tier 3 (More Damage, More Fire Rate, more MORE Pierce, More MORE Bullets, Bigger Arrows, more MORE Range, More MORE Time, Double Gold): 1000 gold, doubling.
- Magic: Teleport 1 skill point; Fire Fairy, Ice Fairy, Sword Slash 3 skill points each.
- Tree structure follows the owner's drawing: Dash leads to Damage, More Bullets, Time and Teleport. Damage leads to More Range and Fire Rate; More Bullets leads to Pierce; Fire Rate to More Damage; More Damage to More Fire Rate, more MORE Pierce and More MORE Bullets; more MORE Pierce to Bigger Arrows and more MORE Range. Time leads to Gold Value, Pickup Radius and Move Speed; Gold Value to Double Gold and More MORE Time. Teleport leads to the three magic abilities.

## 7e. Round 3 (phase 3 branch)
- Pierce is now the tree root: 1 gold, one level, and the parent of everything Dash used to parent (Time, Damage, More Bullets, Dust Devil). Dash moved below it and costs 1 skill point; Teleport costs 2 skill points; both chains sit lower. Obstacles are off (`map.obstacleChance` 0). Run base time 15s. Spawn `rampEnd` 180, `hpMax` 100.

## 7f. Round 4 (phase 3 branch)
- Pickup Radius: 2 levels, +50% each, 100g then 200g. Move Speed: 2 levels, +25% each, 100g then 200g. XP per kill back to 1.
- Boss: 25% bigger (`boss.size`), a dark purple flickering copy of the player with a wavy red aura (`auraSize`, `auraWave`, `auraAlpha`, `flicker`). Teleport gap 0.15s with a width 8 line. If the player leaves sword range during the windup it dashes after them and winds up again. It spawns 320 units away from a purple portal in the ground (`portalTime`, `riseTime`, `closeTime`) and rises with its hands raised; it cannot be hit until it is out.

## 7g. Round 5 (phase 3 branch)
- Boss is vivid purple (no grey) with the red aura, 1.5625x size (`boss.size`). Its red sword circles it like ours, winds up behind during the windup, then sweeps right to left in a fire explosion. No ground lines and no extra wave. The swing still kills enemies in the cone and kills the player unless dashing or teleporting. The sword art is shared with the player's in `src/game/swordArt.ts`.

## 7h. Round 6 (phase 3 branch)
- Holding right click repeats the teleport at its cooldown. The Dust Devil ring is smaller.
- Boss: windup 0.8, recover 1.2, teleport gap 0.2, portal radius 70 and 1.5s. A chase-dash cancels the attack and the next windup starts in full. It only abandons a windup when the player is beyond `boss.chaseRangeMult` (2.5) times the sword range.

## 7i. Skill effects and Doomsday Scenario (phase 3 branch)
- **Fire Wave** sets enemies alight (`fireWave.burnDps` 5 for `burnTime` 5, ticking every `burnTick`); a new application restarts the timer. The wave leaves burning ground behind (`groundTime` 5s) that ignites any enemy standing on it. Burning enemies glow orange and shed flames. Bosses do not burn.
- **Ice Storm**: damage 10, cooldown 20. It freezes a boss solid for 1s (`bossFreeze`), at most once per 6s (`bossFreezeCooldown`). A frozen boss is encased in ice and every timer resumes where it left off.
- **Sword Slash**: cooldown 10. Each of the three hits stuns for the universal stun time (`stun.duration`, 1s; a new hit restarts the timer). Stun cancels a boss's attack and shows a yellow anger mark over its head.
- **Doomsday Scenario** (F, 3 skill points, child of Teleport beside Sword Slash): a yellow-black glowing gauntlet on the screen-right hand. F shows a circle (and the wider stun ring) at the cursor, held within `maxRange`. A click teleports him there, he thrusts the gauntlet overhead (`windup`), then it detonates from the hand: 100 damage inside the circle, then everything within 1.5x the radius is stunned (`stun.duration`), and non-bosses are knocked back. Big flash, ground shockwaves, debris, heavy shake and a short slow-motion beat. Cooldown 8s.
- Dev menu sections are grouped: player, skills, enemies and boss, progression, world, look and feel, system.

## 7j. Hub, story and the book (phase 3 branch)
- **Stun is universal**: one `stun.duration` (1s) for every source (Sword Slash, Doomsday Scenario), on enemies and bosses alike.
- **Dash is unlocked from the start** and has no tree node (an old save's Dash purchase is refunded as 1 skill point). Teleport, Fire Fairy, Ice Fairy, Sword Slash and Doomsday Scenario moved to **the book's own tree** (`tree: 'book'` on the node). The book is sealed (`bookUnlocked` false) until a later story trigger; the dev menu has Unlock the book / Open the book.
- The game now starts in the **hub** (`src/scenes/HubScene.ts`), two screen-space rooms drawn in code: the hallway and the throne room. The player moves with the real `Player` (dash included); collisions run in screen space against ellipses and rects. The camera follows at `hub.zoom` and clamps to the room. A dark veil with light holes (`Darkness`) gives the mood; `hub.ambientHall` and `hub.ambientThrone` set the brightness. Every `hub.shakeInterval` (3s) the ceiling thumps and dust falls, as if a battle rages upstairs.
- **First run (`introDone` false)**: he lies among the dead in the hallway, nearly dark, lit by two torches. Rocks fall beside him, he wakes, stands as the light comes up, and a ghostly "(W A S D to move. Space to Dash)" hangs for `hub.hintTime` then blows away like smoke. The hallway has a locked cell (left), the open north door and bodies everywhere, all with collision.
- **Throne room**: piles of bodies west, an apparently empty throne with two braziers, the severed head (top right, glowing green; Space starts a battle, dev name Anathema), a barricaded east door, and a floating book in the west with a heartbeat that sends distortion rings across the floor. Space near any of them interacts (Space is also the dash, the prompt takes priority).
- **The book cutscene** (first time Space at the book): he walks up and reaches out, the throne's eyes open and follow him, a crayon scrawl says the lines, a gnarled black hand takes him and holds him flat in front of the eyes, the other hand points at the ceiling (the eyes glance up) and later gestures at the head. The full script is in `bookCutscene()`. Afterwards `introDone` is set; the eyes follow him from then on and the game opens in the throne room.
- Placeholders worth knowing: the script text, the figure on the throne (never seen except as eyes and a silhouette), the head (named Anathema), and the crayon font (Gloria Hallelujah from Google Fonts, falls back to cursive offline). Tunables are in the `hub` config section.
- The skill tree has a **Home** button next to Battle that returns to the hub.
- Round 2: interaction prompts show the label with "(Space)" beneath; Space never dashes while something is in reach. The head ("Delve into the mind") only works after the throne conversation. The back of the throne room is solid black light cannot reach, so the throne's figure is never drawn: only its eyes and its hands (smaller, inky, short fingers) show. Dialogue is black text with a white outline in a text box, 25% faster. The eyes' lids sit inside the eye. The player has a new look (black helm with purple glowing eyes, purple sleeves, white tabard, black belt, dynamic black cloak on a rope sim, `cloak` config); the boss keeps the old shade body (`PlayerView.hero`).


### Round 3
- Gold is now **souls**: same mechanics, purple glow. Only visible names changed; code ids (`profile.gold`, `cfg.gold`, `currency: 'gold'`) are unchanged.
- The throne figure's hands slide out of the black fingers first, are half the size (`hub.handScale` 0.85) and are drawn as soft, undefined shadow with no claws.
- The hero lost the lower tabard (legs read clearly) and his eyes sit one pixel higher and closer together.
- Book unlock trigger: the first death while holding at least one skill point (and with the opening done) skips the summary and sends him to the throne room. The figure says "oh dear oh dear", "you're getting stronger. but so are they", then points at the book with "come, learn the way of my family". The book glows purple until he first opens it (`bookOpened`). Dev action: "Replay book unlock scene".
- Book tree: Teleport in the centre for 1 SP, with Fire Fairy, Ice Fairy, Sword Slash and Doomsday around it at 3 SP each.
### Round 4
- Teleport: one press per teleport (hold is gone). It lands exactly on the cursor when the cursor is inside `teleport.distance`, otherwise it jumps the full distance toward it.
- The throne's hands are removed (`hub.handScale` and `Hand` are gone). In the book cutscene he floats to the eyes and hovers over a black void circle while it speaks, then the circle closes and he floats down. At the end he walks to Anathema himself. In the unlock scene he walks to the book.
- The old purple glow on the book and Anathema is now a flashing white outline.
- The book unlock scene plays once (`bookIntroSeen`).
- Throne text is skippable: a click finishes the line being written, the next click moves on.
- Entering battle: the view spins in on Anathema with a closing iris (`cfg.entry`), then he dives head first from the sky and lands in a purple and black blast. The first time only, "Void Bow: Click to shoot" appears for 2s and blows away (`bowHintShown`).

### Round 5
- Souls are blue and brighter. The dive-in plays on every run start, restarts included. The first-battle hint also says "Collect souls to grow stronger" and "Level up to unlock new skills" and stays 3s (`entry.hintTime`).
- Throne speech waits for a click to move on (a small mouse icon sits on the box corner). The void circle spawns under him and travels with him, drawn under his body. "Become my champion" ends the scrawl without the dots.

### Round 6
- First-battle hint lasts 4s (`entry.hintTime`); no spawns and no run clock until it is gone.
- Hub dash and teleport use the same effects as a run.
- The book unlock scene is marked seen and unlocked the moment the death sends him there, so it cannot repeat.
- Tree: More MORE Time is Endless Misery (1000, each kill adds `upgrade.killTime` 0.5s). More Damage 3 levels (500, 750, 1000, +10 each). More Fire Rate 2 levels (500, 1000, +50% each). Quadruple Souls is gone: Double Souls has 2 levels (500, 1000), x2 then x4. Old saves are clamped and refunded.

### Round 7
- The unlock scene kept replaying because Phaser reuses the last start data when `scene.start` gets none, so the hub kept seeing `bookIntro`. Every hub start now passes explicit data.
- The throne's eyes blink about every 3s. The tree has a Hide/Show lines button and reacts to dev menu changes while open. After the book unlocks, the tree has a big Skills button (top right) that opens the book. The death summary has a Home button.

### Round 8
- The main tree is now the **upgrade tree**; the book holds the **skill tree**. Upgrade tree reshaped to Drew's drawing: Pierce in the middle, a column above (Fire Rate, More Fire Rate, Dust Devil) and below (More Bullets, More MORE Bullets), Damage to the left leading to More Range and more MORE Pierce, which both lead to More Damage, and Time to the right with Pickup Radius, Move Speed and Soul Value, which leads to Endless Misery and Double Souls. Better Arrows is removed (refunded). Layout key is now `heaven.treeLayout.v6`.
- Skills are no longer tied to keys. Q, E and R are three equip slots (`profile.binds`); only equipped skills work and show on the player. In the book, click an owned skill then a slot, or a slot then a skill. Right-click a slot to empty it. New skills fill the first empty slot. The slot box takes the skill's colour. The HUD follows the slots. Fire Wave is orange, Ice Storm blue, Doomsday yellow, Sword Slash purple. Teleport stays on right click.
- Souls grow less with value (`gold.valueScale`) and have a smaller aura (`gold.glowSize`). The throne blinks half as often.

### Round 9
- Anathema opens the upgrade tree first (Home or Battle), except the very first entry after the book cutscene, which goes straight to battle.
- Tree nodes can no longer be moved (layout tools removed). Skill buttons are all 300x128 so they match whatever the text.
- Buying a skill (not Teleport) the first time shows "click a skill and assign it a slot" for 2s, then it blows away (`skillTipShown`). Buying no longer equips. Double click or right-click a slot to unequip. Drag a skill from the tree onto a slot, or one slot onto another to swap; a coloured placeholder button follows the pointer and the real node stays put.

### Round 10
- The throne's eyes stay hidden in the hub until the first book cutscene wakes them.
- Shade spawns at 80s (`boss.spawnTime`). At 78s (`waveTime`, once per run) a purple wave rolls out from the player and kills every enemy it reaches; spawning is off until 90s (`resumeTime`). The very first time ever (`bossIntroSeen`) the game freezes and the throne's eyes speak 5 click-to-skip lines in a box at the top, then play resumes.
- Only enemies the player kills give xp and souls. Kills by the boss or the wave give nothing.
- The wave finishes clearing the screen first, then the first-time throne speech freezes the game.
- Fire Wave no longer leaves burning ground or ignites anything on it: it leaves a faint warm ground tint in 40-unit segments (`groundSpacing`) that cools over `groundTime`, culled at 1500 units so it doesn't pop in big chunks.

## 7d. Tweaks, 2026-10-26 (phase 3 branch)
- Dust Devil is a child of Dash, just above it. +1% move and attack speed per kill (max 25%). Each kill holds the stacks for 2s, then a 3s countdown runs and all stacks are lost at 0. A small ring at the player's bottom right shows the time left. Time Warp is removed.
- More Damage has 6 levels (+30 total from that node). Fire Rate: 2 levels, +25% each, 50g then 100g. More Range: 1 level, 100g, +25%. More MORE Range is removed. Bigger Arrows is now Better Arrows (+10% arrow size, hitbox and range, 5 levels). New Quadruple Gold (child of Double Gold, 1000g, x4 total with Double Gold). Fire Wave width 150.
- Sword Slash: R arms it for 5s (`swordSlash.armTime`). The next 3 clicks (`charges`) each start one swing at once: cone, cone, slam. A dash cancels a swing that is striking and spends it. Telegraph 0.2s, slash 0.1s. Cooldown counts from arming.

## 7c. More tree rules (current)
- Upgrade costs grow by `tree.costScale` (1.5) per level, rounded up. Dust Devil (500 gold): each kill gives +1% move and attack speed for the rest of the run, capped at 25%. Time Warp (500 gold) starts the run clock 30s in. XP per kill is 2.

## 7. Run loop
- Base run time: **10 seconds**. Max with all time upgrades: 10 + 25 + 100 = **135s**.
- Run ends on death or when time runs out. There is no penalty either way.
- End-of-run summary screen (kills, gold, XP, time survived) with two buttons: **Restart** (immediately, player keeps all currency) and **Skill Tree**.
- The skill tree has a side button to start the battle.
- Saves go to browser `localStorage`, with JSON export/import. The dev menu can fully reset it.

## 8. Enemies and spawning
- Spawn in a ring just off-screen, all around the player, weighted toward the direction the player is walking (`spawn.directionBias`), so walking one way meets more enemies. Standing still spawns evenly.
- Enemies beyond a larger ring are **despawned**: no drops and no XP.
- Max **250** live enemies. At the cap, spawning pauses.
- Spawn rate: 3/s during the first 20s, then ramping to the max of **50/s at 5:00**. After 5:00 it holds at 50/s.
- Enemy HP ramps from 10 at the start to **2,500 at 5:00** (curve shape tunable, a mostly gentle curve with a steep tail is preferred). After 5:00 it holds.
- Kill: player gets **1 XP immediately**. Enemy drops **1 gold** at its death position and puffs into smoke.
- Contact with an enemy kills the player (no ranged enemies yet). Enemies slow-chase and separate softly from each other.

| Type | Notes |
|---|---|
| Wraith | Baseline chaser, ~60% of player speed |
| Shade | Fast, low HP, appears ~0:30 |
| Husk | Slow, large, ~3x HP, appears ~1:30 |

Enemies are always slower than a dashing or upgraded player. Types have minor color differences for now.

## 9. Gold
- Drops at kill location and **never despawns**, so the player can go back for it.
- Store gold by world position (not as always-live objects). Render and simulate only what is near the player.
- Gold within the pickup radius is pulled to the player and collected.
- Performance cap: about 600 live gold objects. Past that, merge the oldest piles into larger stacks so no value is lost.

## 10. Skill tree
Radial graph on a pannable canvas. Nodes are **completely hidden** until their prerequisites are met, and connecting lines reveal as you progress. Bonuses are **additive** from base (5 x +10% = +50%, not compounding). A node with two parents unlocks when **both** parents have been purchased at least once. Each node declares its currency: gold or skill points.

**Center**
- **Dash**: 1 purchase, 1 gold. The only node visible until bought. It unlocks six branches.

**Tier 1** (children of Dash, 1 gold, doubling unless stated)
| Node | Effect | Max | Cost |
|---|---|---|---|
| Fire Rate | +10% base fire rate | 5 | 1, 2, 4, 8, 16 |
| Pierce | +1 pierce | 1 | 25 |
| Time | +5s run time | 5 | 1, 2, 4, 8, 16 |
| Move Speed | +10% base move speed | 5 | 1, 2, 4, 8, 16 |
| Damage | +1 base damage | 5 | 1, 2, 4, 8, 16 |
| More Range | +10% arrow range | 5 | 1, 2, 4, 8, 16 |

**Tier 2** (each child of its tier-1 node)
| Node | Parent | Effect | Max | Cost |
|---|---|---|---|---|
| More Fire Rate | Fire Rate | +20% base fire rate | 5 | 10, 20, 40, 80, 160 |
| More Bullets | Pierce | +1 arrow per shot | 2 | 100, 300 |
| More MORE Time | Time | +20s run time | 5 | 10, 20, 40, 80, 160 |
| More MORE Speed | Move Speed | +20% base move speed | 5 | 10, 20, 40, 80, 160 |
| More Damage | Damage | +5 base damage | 5 | 10, 20, 40, 80, 160 |

**Tier 3: fairies** (1 skill point each)
- **Fire Fairy** (requires More Fire Rate and More Bullets, each bought at least once). A fire fairy hovers around the player. Unlocks **Q: Fire Wave**: a rectangle of fire launched in the aim direction that travels until it reaches the despawn ring, hitting every enemy it passes once for 100 damage. 5s cooldown. The fairy rides inside the wave, then returns (teleporting to the player if it reaches the despawn zone).
- **Ice Fairy** (requires More MORE Time and More MORE Speed, each bought at least once). An ice fairy hovers around the player. Unlocks **E: Ice Storm**: a ~160-unit circle placed at the cursor on cast and fixed there for 5s. 5 ticks/s at 20 damage each. 50% slow on enemies inside (slows do not stack). 10s cooldown.
- **Sword Slash** (key R, toggle; unlock cost TBD). A sharp, unsheathed shadowy purple sword circles the player on a wider ring than the fairies. Pressing R arms it (press again to disarm); the next attack input then becomes three consecutive swings instead of an arrow: a cone swung right to left (50 dmg), a cone swung left to right (50 dmg), then a straight rectangle slam in front (100 dmg, with a bigger effect). While armed, purple fire radiates off the blade. Each area is shown for 0.5s before it hits and follows the aim until then; the sword winds up slowly during that time, then whips through the strike with an accelerating sweep. Swing 1 flaps the screen-right arm, swing 2 the left, swing 3 both. The slam ends in a flash and a small screen shake. A dash or teleport during a swing's telegraph shelves the swing (it pauses until the dash or teleport ends, then continues); during the strike itself it cancels that swing and the chain resumes with the next one after the dash. Values now: cone 100 dmg, slam 250 dmg and 500 long. Cone size, slam size and cooldown are placeholders.
- The ice fairy flies to the storm centre and stays until it ends, then returns. Fairies are visual companions that gate the abilities. They do not attack on their own yet. A cooldown HUD shows Q and E. Pressing Q or E shows a coloured outline of where the spell will land (press again to cancel, and R disarms it), and the next left click casts it instead of firing the bow. A click while the spell is on cooldown does nothing.

## 11. Boss 1 (spawns at 120s; now 60s in the build, see 11b)
- Spawns only if the run clock reaches 120s (a maxed time tree reaches 135s).
- A **greyed-out copy of the player**, snapshotting all stats, bow, dash and abilities at that moment. It has its own HP (placeholder **5,000**) and a visible HP bar.
- **AI loop:** dash close (within about 150 units), then a **windup** (~0.5s, tunable), then fire aimed arrows (one-hit kills for the player), and repeat. It may occasionally dodge-dash sideways. If the player runs, it dashes after them, and it never despawns.
- Intended dance: the boss dashes in and spooks the player, who dashes away. The only safe way to hurt it is to shoot once right after it lands, then dash away before it fires. The windup must be long enough to allow one quick shot plus a dodge, but not so long that it trivializes the fight.
- Boss **contact is safe**. Only its arrows kill.
- Normal spawns continue during the fight. If the run timer ends while it's alive, the run ends normally.
- Rewards: 100 gold and 1 skill point, plus a large smoke-burst death.

## 11b. Boss and intro: current build (phase 3 branch)
- Boss spawns at `boss.spawnTime` (60s of run clock, 2,000 HP) near the player, bright purple like the player's sword. No bow: its only attack is the first Sword Slash swing (cone), in red. It walks and teleports toward the player (`boss.teleportGap`, 0.1s so it can spam it like the player), winds up (`boss.windup`), locks aim `boss.aimLockTime` before the swing (red area shown), then swings. The swing also launches a red wave (`boss.waveSpeed`, `waveWidth`) that travels to the despawn ring like the Fire Wave. The swing and wave instantly kill every enemy they touch and kill the player unless dashing or teleporting. Contact is safe. Dev menu: Spawn boss, Kill boss, Clock to boss spawn -5s. Reward: 100 gold and 1 skill point.
- The old text intro is gone; see 7j for the hub and story.

## 12. Later (not now)
- Enemy variations, a second boss, more tree upgrades to carry the player to the 5 minute mark.
- Final boss at 10 minutes.
- Teleport unlock node.
- Gamepad support.
- A fuller level/XP persistence mechanic.
- Redesigned enemy models and real art.

## 13. Build order
1. Repo, tooling and GitHub Pages deploy.
2. Player movement, aiming, shooting and dash, plus the dev menu (config-driven from the start).
3. Enemies, chunked map and the spawn ramp.
4. Gold, XP and the run loop with the end-of-run screen.
5. Skill tree and save/load.
6. Fairies and abilities.
7. Boss.
8. Polish: lighting, cloak and effects.
