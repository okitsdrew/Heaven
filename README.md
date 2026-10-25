# Heaven

An incremental isometric bullet-heaven about a robed archer holding off an endless horde of shadowed wraiths on a dying battlefield. Influenced by *20 Minutes Till Dawn*.

- Fight for a short, timed run. You die in one hit.
- Kill wraiths for XP and gold. Dodge with a dash, shoot with a big bow.
- Spend gold and skill points on a skill tree between runs, then go again.
- Boss fights at set times.

## Status
Build order steps 2 and 3 are in: movement, aiming, shooting, dash, abilities and the dev menu, plus enemies (Wraith, Shade, Husk), the spawn ramp and an infinite chunked battlefield. Gold, XP and the run loop come next. See [DESIGN.md](DESIGN.md) for the full spec and build order, and [CLAUDE.md](CLAUDE.md) for contributor guidance.

## Controls
| Input | Action |
|---|---|
| WASD | Move |
| Left click (hold) | Shoot toward cursor |
| Space | Dash in move direction |
| Right click | Teleport toward cursor |
| Q, then left click | Fire Wave: Q shows the path (Q again cancels), click casts (needs Fire Fairy; dev menu `abilities` section) |
| E, then left click | Ice Storm: E shows the circle at the cursor, click casts (needs Ice Fairy) |
| R (toggle) | Sword Slash: arms it, and the next attack becomes a 3-swing combo (dash or teleport cancels) |
| Backtick | Dev menu |

## Tech
TypeScript, Phaser 3, Vite. Deployed to GitHub Pages from `main`.

## Development
```bash
npm install
npm run dev      # local dev server
npm run build    # type-check and build to dist/
```

Every push to `main` builds and deploys to GitHub Pages via `.github/workflows/deploy.yml`.
