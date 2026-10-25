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
- **Player:** robed rogue with a large bow. The cloak billows behind with a procedural cloth/trail simulation.
- **Enemies:** shadowed wraiths (dark tattered silhouettes, glowing eyes). All types share a silhouette and differ by size, speed and a minor color variation. Models will be redesigned later.
- Dead enemies puff into smoke and leave no body.
- Dash visual: Bloodborne-style quick step.
- Teleport visual (later): Fox/Falco fire-fox style from *Smash Bros.*, with light afterimage copies between the start and end points.

## 6. Player
| Stat | Base |
|---|---|
| Move | WASD (base speed tunable) |
| Fire | Left click, hold to fire at max rate. 1 arrow/sec |
| Arrow damage | 10 |
| Pierce | 0 |
| Arrow speed | ~900 units/s |
| Arrow range | ~400 units |
| Arrow hit width | more forgiving than the sprite |
| Pickup radius | ~90 units (upgradable later) |

- **One-hit death**, with a small forgiving hitbox (about the torso only).
- Arrows: if they hit an enemy they consume 1 pierce and deal damage. At 0 pierce the arrow disappears on hit. If pierce is greater than 0, the arrow continues through until it runs out of range or hits another enemy.
- Extra arrows (More Bullets) fire in a small fan, about 8° apart, not parallel.
- **Dash (Left Shift):** ~0.15s, ~250 units in the direction the player is moving (the last move direction if standing still), fully invincible during it, passes through enemies, 0.75s cooldown shown as a ring on the player.
- **Teleport (Space, later unlock):** instant jump ~200 units toward the cursor, 0.1s cooldown. Shown as a dark purple line zipping between start and end. For now it is a dev toggle that runs alongside the dash; whether it eventually replaces the dash is open.
- **Level and XP persist across runs.** (Mechanic to be fleshed out later.) Each level-up grants 1 skill point. Start with a gentle curve like `10 x level^1.5` and tune.

## 7. Run loop
- Base run time: **10 seconds**. Max with all time upgrades: 10 + 25 + 100 = **135s**.
- Run ends on death or when time runs out. There is no penalty either way.
- End-of-run summary screen (kills, gold, XP, time survived) with two buttons: **Restart** (immediately, player keeps all currency) and **Skill Tree**.
- The skill tree has a side button to start the battle.
- Saves go to browser `localStorage`, with JSON export/import. The dev menu can fully reset it.

## 8. Enemies and spawning
- Spawn in a ring just off-screen, all around the player, so enemies come from every side wherever the player moves.
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
- The ice fairy flies to the storm centre and stays until it ends, then returns. Fairies are visual companions that gate the abilities. They do not attack on their own yet. A cooldown HUD shows Q and E.

## 11. Boss 1 (spawns at 120s)
- Spawns only if the run clock reaches 120s (a maxed time tree reaches 135s).
- A **greyed-out copy of the player**, snapshotting all stats, bow, dash and abilities at that moment. It has its own HP (placeholder **5,000**) and a visible HP bar.
- **AI loop:** dash close (within about 150 units), then a **windup** (~0.5s, tunable), then fire aimed arrows (one-hit kills for the player), and repeat. It may occasionally dodge-dash sideways. If the player runs, it dashes after them, and it never despawns.
- Intended dance: the boss dashes in and spooks the player, who dashes away. The only safe way to hurt it is to shoot once right after it lands, then dash away before it fires. The windup must be long enough to allow one quick shot plus a dodge, but not so long that it trivializes the fight.
- Boss **contact is safe**. Only its arrows kill.
- Normal spawns continue during the fight. If the run timer ends while it's alive, the run ends normally.
- Rewards: 100 gold and 1 skill point, plus a large smoke-burst death.

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
