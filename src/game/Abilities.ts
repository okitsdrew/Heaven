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

const screen = { x: 0, y: 0 };
const screen2 = { x: 0, y: 0 };
const flameColors = [0xff5a10, 0xff8a28, 0xffb347, 0xffd98a];

// Q: Fire Cone and E: Ice Storm. Damages anything Hittable; `slowAt` is for enemy movement to read later.
export class Abilities {
  fireCooldown = 0;
  iceCooldown = 0;
  private storms: Storm[] = [];
  private gfx: Phaser.GameObjects.Graphics;
  private cone = { t: 0, x: 0, y: 0, dirX: 1, dirY: 0 };

  onDamage: (target: Hittable, amount: number, x: number, y: number) => void = () => {};
  onCast: (kind: 'fire' | 'ice') => void = () => {};

  constructor(scene: Phaser.Scene, private fx: Fx, private targets: () => readonly Hittable[]) {
    this.gfx = scene.add.graphics().setDepth(-5e8).setBlendMode(Phaser.BlendModes.ADD);
  }

  resetCooldowns(): void {
    this.fireCooldown = 0;
    this.iceCooldown = 0;
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
      this.fireCooldown = cfg.fireCone.cooldown;
      this.castFireCone(player.x, player.y, player.aimX, player.aimY);
    }
    if (cfg.abilities.iceFairy && input.justPressed('abilityE') && this.iceCooldown <= 0) {
      this.iceCooldown = cfg.iceStorm.cooldown;
      this.castIceStorm(cursor ?? { x: player.x + player.aimX * 200, y: player.y + player.aimY * 200 });
    }

    this.cone.t = Math.max(0, this.cone.t - dt);
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

  private castFireCone(x: number, y: number, dirX: number, dirY: number): void {
    const c = cfg.fireCone;
    const half = Phaser.Math.DegToRad(c.angleDeg) / 2;
    for (const t of this.targets()) {
      if (!t.alive) continue;
      const dx = t.x - x;
      const dy = t.y - y;
      const d = Math.hypot(dx, dy);
      if (d > c.range + t.radius) continue;
      // Pad the angle by the target's size so grazing its edge counts.
      const pad = d > t.radius ? Math.asin(t.radius / d) : Math.PI;
      const angle = d > 1e-3 ? Math.acos(Phaser.Math.Clamp((dx * dirX + dy * dirY) / d, -1, 1)) : 0;
      if (angle <= half + pad) this.onDamage(t, c.damage, t.x, t.y);
    }

    this.cone = { t: c.flashTime, x, y, dirX, dirY };
    const base = Math.atan2(dirY, dirX);
    toScreen(x, y, screen);
    const px = cfg.render.pixelScale;
    for (let i = 0; i < c.flames; i++) {
      const angle = base + (Math.random() * 2 - 1) * half;
      const dist = c.range * (0.25 + Math.random() * 0.75);
      toScreen(x + Math.cos(angle) * dist, y + Math.sin(angle) * dist, screen2);
      const life = 0.25 + Math.random() * 0.3;
      this.fx.particle({
        x: screen.x,
        y: screen.y - 10 * px,
        life,
        from: 0.5 + Math.random() * 0.5,
        to: 1.6 + Math.random(),
        alpha: 0.9,
        tint: flameColors[Math.floor(Math.random() * flameColors.length)],
        vx: (screen2.x - screen.x) / life,
        vy: (screen2.y - screen.y) / life,
        depth: 1e6,
      });
    }
    this.fx.addShake(cfg.camera.shakeOnCast);
    this.onCast('fire');
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

    if (this.cone.t > 0) {
      const c = cfg.fireCone;
      const t = this.cone.t / c.flashTime;
      const base = Math.atan2(this.cone.dirY, this.cone.dirX);
      const half = Phaser.Math.DegToRad(c.angleDeg) / 2;
      const steps = 16;
      toScreen(this.cone.x, this.cone.y, screen);
      const points: Vec2[] = [{ x: screen.x, y: screen.y }];
      for (let i = 0; i <= steps; i++) {
        const a = base - half + (i / steps) * half * 2;
        const p = toScreen(this.cone.x + Math.cos(a) * c.range, this.cone.y + Math.sin(a) * c.range);
        points.push(p);
      }
      g.fillStyle(0xff6a1a, 0.35 * t);
      g.fillPoints(points, true);
      g.lineStyle(2, 0xffc060, 0.8 * t);
      g.strokePoints(points, true);
    }

    for (const s of this.storms) this.drawStorm(g, s);
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
