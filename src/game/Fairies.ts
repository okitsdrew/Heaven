import Phaser from 'phaser';
import { fairyFrames, Tex } from '../art/placeholders';
import { cfg } from '../config';
import { toScreen } from '../iso';
import { Fx } from './Fx';
import { Player } from './Player';

type Kind = 'fire' | 'ice';

interface Fairy {
  kind: Kind;
  sprite: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  x: number;
  y: number;
  flare: number;
  trailTimer: number;
  placed: boolean;
}

const screen = { x: 0, y: 0 };
const tints: Record<Kind, { glow: number; spark: number[] }> = {
  fire: { glow: 0xff7a20, spark: [0xff7a20, 0xffb347, 0xffd98a] },
  ice: { glow: 0x7fd4ff, spark: [0xbfeaff, 0xe8fbff, 0x7fd4ff] },
};

// Visual companions that hover around the player. They gate abilities but do not attack.
export class Fairies {
  private fairies: Fairy[];
  private time = 0;

  constructor(scene: Phaser.Scene, private fx: Fx) {
    this.fairies = (['fire', 'ice'] as const).map((kind) => ({
      kind,
      sprite: scene.add.image(0, 0, fairyFrames[kind][0]),
      glow: scene.add.image(0, 0, Tex.glow).setTint(tints[kind].glow).setBlendMode(Phaser.BlendModes.ADD),
      x: 0,
      y: 0,
      flare: 0,
      trailTimer: 0,
      placed: false,
    }));
  }

  flare(kind: Kind): void {
    for (const f of this.fairies) if (f.kind === kind) f.flare = cfg.fairy.flareTime;
  }

  update(dt: number, player: Player): void {
    this.time += dt;
    const px = cfg.render.pixelScale;
    const c = cfg.fairy;
    const enabled = { fire: cfg.abilities.fireFairy, ice: cfg.abilities.iceFairy };
    const active = this.fairies.filter((f) => enabled[f.kind]);
    toScreen(player.x, player.y, screen);

    this.fairies.forEach((f) => {
      const show = enabled[f.kind];
      f.sprite.setVisible(show);
      f.glow.setVisible(show);
      if (!show) f.placed = false;
    });

    active.forEach((f, i) => {
      // Spread active fairies evenly around the player.
      const angle = this.time * c.orbitSpeed + (i / active.length) * Math.PI * 2 + (f.kind === 'ice' ? 0.5 : 0);
      const tx = screen.x + Math.cos(angle) * c.orbitRadius;
      const ty =
        screen.y - (c.height + Math.sin(this.time * 3 + i * 2) * c.bob) * px + Math.sin(angle) * c.orbitRadius * 0.5;
      if (!f.placed) {
        f.x = tx;
        f.y = ty;
        f.placed = true;
      }
      const follow = 1 - Math.exp(-c.followRate * dt);
      f.x += (tx - f.x) * follow;
      f.y += (ty - f.y) * follow;
      f.flare = Math.max(0, f.flare - dt);
      const flare = c.flareTime > 0 ? f.flare / c.flareTime : 0;

      const flutter = Math.floor(this.time * 14 + i) % 2;
      const depth = screen.y + (Math.sin(angle) < 0 ? -0.6 : 0.6);
      f.sprite
        .setTexture(fairyFrames[f.kind][flutter])
        .setPosition(f.x, f.y)
        .setScale(px * (1 + flare * 0.6))
        .setDepth(depth);
      f.glow
        .setPosition(f.x, f.y)
        .setScale(px * (0.9 + flare * 1.8 + Math.sin(this.time * 8 + i) * 0.1))
        .setAlpha(0.55 + flare * 0.45)
        .setDepth(depth - 0.1);

      f.trailTimer += dt * c.trailRate;
      while (f.trailTimer >= 1) {
        f.trailTimer -= 1;
        const spark = tints[f.kind].spark;
        this.fx.particle({
          x: f.x + (Math.random() - 0.5) * 4,
          y: f.y + 3 * px,
          life: 0.4 + Math.random() * 0.3,
          from: 0.25,
          to: 0.05,
          alpha: 0.9,
          tint: spark[Math.floor(Math.random() * spark.length)],
          vx: (Math.random() - 0.5) * 12,
          vy: f.kind === 'fire' ? -14 : 14,
          depth,
        });
      }
    });
  }
}
