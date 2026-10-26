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
- **Sword Slash**: cooldown 10. Each of the three hits stuns a boss for 1s (`bossStun`, a new hit restarts the timer). Stun cancels the boss's attack and shows a yellow anger mark over its head.
- **Doomsday Scenario** (F, 3 skill points, child of Teleport beside Sword Slash): a yellow-black glowing gauntlet on the screen-right hand. F shows a circle (and the wider stun ring) at the cursor, held within `maxRange`. A click teleports him there, he thrusts the gauntlet overhead (`windup`), then it detonates from the hand: 100 damage inside the circle, then everything within 1.5x the radius is stunned for `stunTime`, and non-bosses are knocked back. Big flash, ground shockwaves, debris, heavy shake and a short slow-motion beat. Cooldown 8s.
- Dev menu sections are grouped: player, skills, enemies and boss, progression, world, look and feel, system.

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
- Intro cutscene (`src/story.ts`, `src/ui/Cutscene.ts`) plays once on a fresh save (`seenIntro`), then a controls card. Replay from the dev menu. Story text is placeholder.

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
