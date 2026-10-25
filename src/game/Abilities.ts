import Phaser from 'phaser';
import { cfg } from '../config';
import { Input } from '../input';
import { ellipseHalfSize, toScreen, Vec2 } from '../iso';
import { Hittable } from './Arrows';
import { Fx } from './Fx';
import { Player } from './Player';

interface Storm {
  x: number;
  y: number;
  age: number;
  tickTimer: number;
  flash: number;
  snowTimer: number;
}

interface Wave {
  ox: number;
  oy: number;
  dirX: number;
  dirY: number;
  dist: number;
  hits: Set<number>;
  emberTimer: number;
}

const screen = { x: 0, y: 0 };
const screen2 = { x: 0, y: 0 };
const emberColors = [0xff5a10, 0xff8a28, 0xffb347, 0xffd98a];

// Q: Fire Wave and E: Ice Storm. Damages anything Hittable; `slowAt` is for enemy movement to read later.
export class Abilities {
  fireCooldown = 0;
  iceCooldown = 0;
  private storms: Storm[] = [];
  private gfx: Phaser.GameObjects.Graphics;
  private waves: Wave[] = [];
  private waveGfx: Phaser.GameObjects.Graphics;
  private time = 0;

  onDamage: (target: Hittable, amount: number, x: number, y: number) => void = () => {};
  onCast: (kind: 'fire' | 'ice') => void = () => {};

  constructor(scene: Phaser.Scene, private fx: Fx, private targets: () => readonly Hittable[]) {
    this.gfx = scene.add.graphics().setDepth(-5e8).setBlendMode(Phaser.BlendModes.ADD);
    this.waveGfx = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
  }

  resetCooldowns(): void {
    this.fireCooldown = 0;
    this.iceCooldown = 0;
  }

  // Where each fairy should go while its attack is active, or null.
  fireAttach(): Vec2 | null {
    const w = this.waves[this.waves.length - 1];
    return w ? this.waveCenter(w) : null;
  }

  iceAttach(): Vec2 | null {
    const s = this.storms[0];
    return s ? { x: s.x, y: s.y } : null;
  }

  private waveCenter(w: Wave): Vec2 {
    return { x: w.ox + w.dirX * w.dist, y: w.oy + w.dirY * w.dist };
  }

  // Strongest slow multiplier (1 = none) from any storm covering a circle. Slows never stack.
  slowAt(x: number, y: number, radius: number): number {
    for (const s of this.storms) {
      if (Math.hypot(x - s.x, y - s.y) <= cfg.iceStorm.radius + radius) return 1 - cfg.iceStorm.slow;
    }
    return 1;
  }

  update(dt: number, player: Player, input: Input, cursor: Vec2 | null): void {
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.iceCooldown = Math.max(0, this.iceCooldown - dt);

    if (cfg.abilities.fireFairy && input.justPressed('abilityQ') && this.fireCooldown <= 0) {
      this.fireCooldown = cfg.fireWave.cooldown;
      this.castFireWave(player.x, player.y, player.aimX, player.aimY);
    }
    if (cfg.abilities.iceFairy && input.justPressed('abilityE') && this.iceCooldown <= 0) {
      this.iceCooldown = cfg.iceStorm.cooldown;
      this.castIceStorm(cursor ?? { x: player.x + player.aimX * 200, y: player.y + player.aimY * 200 });
    }

    this.time += dt;
    this.updateWaves(dt, player);
    for (let i = this.storms.length - 1; i >= 0; i--) {
      const s = this.storms[i];
      s.age += dt;
      s.flash = Math.max(0, s.flash - dt);
      if (s.age >= cfg.iceStorm.duration) {
        this.storms.splice(i, 1);
        continue;
      }
      this.tickStorm(s, dt);
    }
    this.draw();
  }

  private castFireWave(x: number, y: number, dirX: number, dirY: number): void {
    this.waves.push({ ox: x, oy: y, dirX, dirY, dist: 0, hits: new Set(), emberTimer: 0 });
    this.fx.addShake(cfg.camera.shakeOnCast);
    this.onCast('fire');
  }

  // Waves travel until they reach the despawn ring around the player, hitting each target once.
  private updateWaves(dt: number, player: Player): void {
    const c = cfg.fireWave;
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      const prev = w.dist;
      w.dist += c.speed * dt;
      const lo = prev - c.length / 2;
      const hi = w.dist + c.length / 2;
      for (const t of this.targets()) {
        if (!t.alive || w.hits.has(t.id)) continue;
        const rx = t.x - w.ox;
        const ry = t.y - w.oy;
        const along = rx * w.dirX + ry * w.dirY;
        const side = -rx * w.dirY + ry * w.dirX;
        if (Math.abs(side) <= c.width / 2 + t.radius && along >= lo - t.radius && along <= hi + t.radius) {
          w.hits.add(t.id);
          this.onDamage(t, c.damage, t.x, t.y);
        }
      }

      const center = this.waveCenter(w);
      if (Math.hypot(center.x - player.x, center.y - player.y) > cfg.world.despawnRadius) {
        this.waves.splice(i, 1);
        continue;
      }

      w.emberTimer += dt * c.embers;
      while (w.emberTimer >= 1) {
        w.emberTimer -= 1;
        const side = (Math.random() - 0.5) * c.width;
        const along = (Math.random() - 0.5) * c.length;
        toScreen(
          center.x - w.dirY * side + w.dirX * along,
          center.y + w.dirX * side + w.dirY * along,
          screen,
        );
        const life = 0.4 + Math.random() * 0.4;
        this.fx.particle({
          x: screen.x,
          y: screen.y - 6 * cfg.render.pixelScale,
          life,
          from: 0.4,
          to: 0.1,
          alpha: 0.9,
          tint: emberColors[Math.floor(Math.random() * emberColors.length)],
          vx: (Math.random() - 0.5) * 20,
          vy: -40 - Math.random() * 50,
          depth: screen.y + 3,
        });
      }
    }
  }

  private castIceStorm(at: Vec2): void {
    this.storms.push({ x: at.x, y: at.y, age: 0, tickTimer: 0, flash: 0, snowTimer: 0 });
    this.fx.addShake(cfg.camera.shakeOnCast * 0.5);
    this.onCast('ice');
  }

  private tickStorm(s: Storm, dt: number): void {
    const c = cfg.iceStorm;
    s.tickTimer += dt;
    const interval = 1 / Math.max(c.ticksPerSecond, 0.01);
    while (s.tickTimer >= interval) {
      s.tickTimer -= interval;
      s.flash = 0.08;
      for (const t of this.targets()) {
        if (t.alive && Math.hypot(t.x - s.x, t.y - s.y) <= c.radius + t.radius) this.onDamage(t, c.damage, t.x, t.y);
      }
    }

    s.snowTimer += dt * c.snow;
    while (s.snowTimer >= 1) {
      s.snowTimer -= 1;
      const angle = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * c.radius;
      toScreen(s.x + Math.cos(angle) * r, s.y + Math.sin(angle) * r, screen);
      this.fx.particle({
        x: screen.x,
        y: screen.y - 40 * cfg.render.pixelScale * Math.random(),
        life: 0.8 + Math.random() * 0.6,
        from: 0.25 + Math.random() * 0.2,
        to: 0.1,
        alpha: 0.8,
        tint: Math.random() < 0.5 ? 0xe8fbff : 0x8fdcff,
        vx: (Math.random() - 0.5) * 20,
        vy: 25 + Math.random() * 25,
        depth: screen.y + 2,
      });
    }
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();
    this.waveGfx.clear();
    for (const w of this.waves) this.drawWave(g, w);
    for (const s of this.storms) this.drawStorm(g, s);
  }

  // A rectangle of fire: a glowing slab on the ground with flame tongues licking up from it.
  private drawWave(ground: Phaser.GameObjects.Graphics, w: Wave): void {
    const c = cfg.fireWave;
    const px = cfg.render.pixelScale;
    const center = this.waveCenter(w);
    const perpX = -w.dirY;
    const perpY = w.dirX;
    const hw = c.width / 2;
    const hl = c.length / 2;
    const corner = (s: number, l: number) =>
      toScreen(center.x + perpX * hw * s + w.dirX * hl * l, center.y + perpY * hw * s + w.dirY * hl * l);
    ground.fillStyle(0xff5a10, 0.22);
    ground.fillPoints([corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)], true);

    const count = Math.max(1, Math.round(c.width / c.tongueSpacing));
    const tongues: { x: number; y: number; i: number; row: number }[] = [];
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < count; i++) {
        const side = -hw + ((i + 0.5) * c.width) / count;
        const along = (row === 0 ? -0.5 : 0.5) * hl;
        const p = toScreen(center.x + perpX * side + w.dirX * along, center.y + perpY * side + w.dirY * along);
        tongues.push({ x: p.x, y: p.y, i, row });
      }
    }
    tongues.sort((a, b) => a.y - b.y);

    const g = this.waveGfx;
    g.setDepth(toScreen(center.x, center.y, screen).y + 1);
    for (const t of tongues) {
      const flick = 0.5 + 0.5 * Math.sin(this.time * 14 + t.i * 1.9 + t.row * 2.3);
      const height = px * (6 + 9 * flick + 3 * Math.sin(this.time * 9 + t.i));
      const sway = Math.sin(this.time * 8 + t.i * 0.7) * 2.5 * px;
      const half = 6 * px;
      for (const [scale, color, alpha] of [
        [1, 0xff4a10, 0.85],
        [0.68, 0xff9a30, 0.9],
        [0.38, 0xffe0a0, 0.95],
      ] as const) {
        g.fillStyle(color, alpha);
        g.fillTriangle(
          t.x - half * (0.4 + 0.6 * scale),
          t.y,
          t.x + half * (0.4 + 0.6 * scale),
          t.y,
          t.x + sway * scale,
          t.y - height * scale,
        );
      }
    }
  }

  private drawStorm(g: Phaser.GameObjects.Graphics, s: Storm): void {
    const c = cfg.iceStorm;
    const fade = Phaser.Math.Clamp(Math.min(s.age / 0.25, (c.duration - s.age) / 0.4), 0, 1);
    toScreen(s.x, s.y, screen);
    const h = ellipseHalfSize(c.radius);

    g.fillStyle(0x7fd4ff, (0.13 + (s.flash > 0 ? 0.12 : 0)) * fade);
    g.fillEllipse(screen.x, screen.y, h.x * 2, h.y * 2);
    g.lineStyle(2, 0xbfeaff, 0.7 * fade);
    g.strokeEllipse(screen.x, screen.y, h.x * 2, h.y * 2);

    const pulse = (s.age * 1.5) % 1;
    g.lineStyle(2, 0xe8fbff, (1 - pulse) * 0.5 * fade);
    g.strokeEllipse(screen.x, screen.y, h.x * 2 * pulse, h.y * 2 * pulse);

    g.lineStyle(1, 0xbfeaff, 0.35 * fade);
    for (let k = 0; k < 6; k++) {
      const a = s.age * 0.8 + (k * Math.PI) / 3;
      toScreen(s.x + Math.cos(a) * c.radius * 0.92, s.y + Math.sin(a) * c.radius * 0.92, screen2);
      g.lineBetween(screen.x, screen.y, screen2.x, screen2.y);
    }
  }
}
