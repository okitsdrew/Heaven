import Phaser from 'phaser';
import { fairyFrames } from '../art/placeholders';
import { cfg } from '../config';
import { toScreen, Vec2 } from '../iso';
import { canUse } from '../skills';
import { Fx } from './Fx';
import { drawHaze } from './haze';
import { Player } from './Player';

type Kind = 'fire' | 'ice';

interface Fairy {
  kind: Kind;
  sprite: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Graphics;
  x: number;
  y: number;
  flare: number;
  trailTimer: number;
  placed: boolean;
  lastAttach: Vec2 | null;
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
      glow: scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD),
      x: 0,
      y: 0,
      flare: 0,
      trailTimer: 0,
      placed: false,
      lastAttach: null,
    }));
  }

  private drawGlow(f: Fairy, scale: number, alpha: number, seed: number, depth: number): void {
    f.glow.clear().setDepth(depth);
    drawHaze(f.glow, f.x, f.y, cfg.fairy.glowSize * scale, cfg.fairy.glowWave, this.time, seed, tints[f.kind].glow, alpha);
  }

  flare(kind: Kind): void {
    for (const f of this.fairies) if (f.kind === kind) f.flare = cfg.fairy.flareTime;
  }

  // `attach` is where each fairy's attack currently is, if active. The fairy flies there and stays until it ends,
  // then flies back. If that point is inside the despawn zone it teleports to the player instead.
  update(dt: number, player: Player, attach: Record<Kind, Vec2 | null>): void {
    this.time += dt;
    const px = cfg.render.pixelScale;
    const c = cfg.fairy;
    const enabled = { fire: canUse('fireFairy'), ice: canUse('iceFairy') };
    const despawn = cfg.world.despawnRadius;
    const outside = (p: Vec2, factor = 1) => Math.hypot(p.x - player.x, p.y - player.y) > despawn * factor;
    toScreen(player.x, player.y, screen);

    this.fairies.forEach((f) => {
      const show = enabled[f.kind];
      f.sprite.setVisible(show);
      f.glow.setVisible(show);
      if (!show) {
        f.placed = false;
        f.lastAttach = null;
      }
    });

    const states = this.fairies
      .filter((f) => enabled[f.kind])
      .map((f) => {
        const a = attach[f.kind];
        if (a && outside(a)) {
          f.placed = false;
          f.lastAttach = null;
          return { f, at: null };
        }
        // A wave that just ended at the despawn ring was last seen a frame short of it.
        if (!a && f.lastAttach && outside(f.lastAttach, 0.9)) f.placed = false;
        f.lastAttach = a;
        return { f, at: a };
      });
    const orbiters = states.filter((s) => !s.at);

    states.forEach(({ f, at }, i) => {
      let tx: number;
      let ty: number;
      let angle = 0;
      let rate = c.followRate;
      if (at) {
        const p = toScreen(at.x, at.y);
        tx = p.x;
        ty = p.y - (c.attachHeight + Math.sin(this.time * 3 + i * 2) * c.bob * 0.5) * px;
        rate = c.travelRate;
      } else {
        // Spread orbiting fairies evenly around the player.
        const slot = orbiters.findIndex((o) => o.f === f);
        angle = this.time * c.orbitSpeed + (slot / orbiters.length) * Math.PI * 2 + (f.kind === 'ice' ? 0.5 : 0);
        tx = screen.x + Math.cos(angle) * c.orbitRadius;
        ty = screen.y - (c.height + Math.sin(this.time * 3 + i * 2) * c.bob) * px + Math.sin(angle) * c.orbitRadius * 0.5;
        if (f.lastAttach === null && f.placed) rate = c.followRate;
      }
      if (!f.placed) {
        f.x = tx;
        f.y = ty;
        f.placed = true;
      }
      const follow = 1 - Math.exp(-rate * dt);
      f.x += (tx - f.x) * follow;
      f.y += (ty - f.y) * follow;
      f.flare = Math.max(0, f.flare - dt);
      const flare = c.flareTime > 0 ? f.flare / c.flareTime : 0;

      const flutter = Math.floor(this.time * 14 + i) % 2;
      const depth = at ? toScreen(at.x, at.y).y + 4 : screen.y + (Math.sin(angle) < 0 ? -0.6 : 0.6);
      const big = at ? 1.4 : 1;
      f.sprite
        .setTexture(fairyFrames[f.kind][flutter])
        .setPosition(f.x, f.y)
        .setScale(px * (1 + flare * 0.6) * big)
        .setDepth(depth);
      this.drawGlow(f, px * big * (1 + flare * 1.8), 0.55 + flare * 0.45, i, depth - 0.1);

      f.trailTimer += dt * c.trailRate * (at ? 2 : 1);
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
