# CLAUDE.md

Guidance for Claude working in this repo (`okitsdrew/Heaven`).

## What this is
An incremental isometric bullet-heaven (think *20 Minutes Till Dawn*). Full design lives in [DESIGN.md](DESIGN.md). **Read it before making gameplay decisions.** All numbers in it are test values, expect them to change.

## Roles
- Claude writes the code, makes placeholder art (code-drawn) and manages GitHub.
- The owner supplies ideas, tweaks values and playtests. They test on a Steam Deck via the GitHub Pages build.

## Stack and conventions
- TypeScript + Phaser 3 + Vite. Browser game, deployed to GitHub Pages by GitHub Actions on push to `main`.
- Commit straight to `main` in small commits. Use a PR only for risky experiments.
- Keep code in the style of the surrounding code. Comment sparingly.
- **Data-driven:** no gameplay number is hard-coded in a system. Everything comes from the central config module and must be editable in the dev menu. When you add a mechanic, add its tunables to the config and the dev menu in the same change.
- Simulate in flat top-down world coordinates. Isometric is a rendering projection only. WASD follows screen directions.
- Input goes through an abstraction layer (keyboard and mouse now, gamepad later).
- Performance targets: 250 live enemies, many projectiles and many gold piles. Use spatial hashing for collisions, object pools for projectiles and enemies, and store gold by world position (never despawned) while rendering only what's near the player.
- The skill tree is data-driven (nodes defined as data: id, parents, currency, cost list, max level, effect). Adding a node should not need code changes beyond the effect handler.
- Save to `localStorage` with a versioned schema. Support export/import and a full reset.
- Art is placeholder, code-drawn, and must be swappable for sprite sheets later without touching gameplay code.

## Priorities
1. The first 5 minutes of a run must feel great. Polish game feel (hit feedback, screen shake, smoke, glows) before adding breadth.
2. The dev menu is a first-class feature. Extend it with every system.
3. Ask the owner before changing agreed design. Flag contradictions rather than guessing.

## Key facts to remember
- One-hit death for the player, with a small forgiving hitbox.
- Base run is 10s. Time upgrades max out at 135s total, so the 120s boss is reachable only with a maxed time tree. The dev menu needs a run length override and a clock jump so the 5:00 ramp can be tested.
- Gold never despawns. Enemies far from the player despawn and drop nothing.
- Level and XP persist between runs.
- Skill tree nodes are hidden until prerequisites are met. Two-parent nodes need both parents bought at least once. Bonuses are additive.
- The boss is a grey copy of the player with a windup the player can exploit to shoot once then dash away.

## Commands
- `npm install`: install dependencies.
- `npm run dev`: dev server with hot reload.
- `npm run build`: type-check, then build to `dist/` (this is what CI runs).
- `npm run typecheck`: type-check only.
- `npm run preview`: serve the built `dist/`.

## Code map
- `src/config.ts`: every tunable plus its dev menu range (`meta`). Tweaks persist to `localStorage` as overrides of the defaults.
- `src/input.ts`: action-based input. Gameplay reads actions, never keys. Add a gamepad as another `InputSource`.
- `src/iso.ts`: world to screen projection and back.
- `src/dev/DevMenu.ts`: DOM overlay built from `meta`. Scene-specific buttons are passed in as actions.
- `src/art/placeholders.ts`: code-drawn textures under the keys in `Tex`.
- `src/game/`: simulation (`Player`, `Arrows`, `Dummies`) and rendering (`PlayerView`, `Fx`, `Ground`).
- `src/scenes/GameScene.ts`: wires systems together and owns the camera.
