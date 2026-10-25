# Heaven

An incremental isometric bullet-heaven about a robed archer holding off an endless horde of shadowed wraiths on a dying battlefield. Influenced by *20 Minutes Till Dawn*.

- Fight for a short, timed run. You die in one hit.
- Kill wraiths for XP and gold. Dodge with a dash, shoot with a big bow.
- Spend gold and skill points on a skill tree between runs, then go again.
- Boss fights at set times.

## Status
Build order step 2 is in: movement, aiming, shooting, dash and the dev menu, with target dummies to shoot at. Enemies come next. See [DESIGN.md](DESIGN.md) for the full spec and build order, and [CLAUDE.md](CLAUDE.md) for contributor guidance.

## Controls
| Input | Action |
|---|---|
| WASD | Move |
| Left click (hold) | Shoot toward cursor |
| Space | Dash in move direction |
| Q | Fire Cone (after Fire Fairy) |
| E | Ice Storm (after Ice Fairy) |
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
