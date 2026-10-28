import Phaser from 'phaser';
import { sfx } from '../audio';
import { Tex } from '../art/placeholders';
import { cfg } from '../config';
import { Input } from '../input';
import { ellipseHalfSize, toScreen, Vec2 } from '../iso';
import { actionFor, canUse, skillDamage, slotActions } from '../skills';
import { Hittable } from './Arrows';
import { Fx } from './Fx';
import { Player } from './Player';

interface Blast {
  ox: number;
  oy: number;
  hx: number;
  hy: number;
  age: number;
  radius: number;
  pal: Palette;
}

export interface Palette {
  hot: number[];
  outer: number;
  mid: number;
  core: number;
  ground: number;
  ground2: number;
  ring: number;
  smoke: [number, number];
}

const FIRE: Palette = { hot: [0xffd21a, 0xffe680, 0xffffff, 0xff9a10], outer: 0xff7a10, mid: 0xffd21a, core: 0xfff2b0, ground: 0xff9a10, ground2: 0xffe680, ring: 0xfff2b0, smoke: [0x1a1408, 0x4a3a10] };
// The Worldbreaker Aegis counter-blast: the same explosion in white and gold.
export const HOLY: Palette = { hot: [0xffffff, 0xfff2b0, 0xffd21a, 0xffe680], outer: 0xffd070, mid: 0xfff0b0, core: 0xffffff, ground: 0xffd21a, ground2: 0xffffff, ring: 0xffffff, smoke: [0x3a3320, 0x6a5a30] };

const screen = { x: 0, y: 0 };
const YELLOW = 0xffd21a;
const HOT = [0xffd21a, 0xffe680, 0xffffff, 0xff9a10];
const LIFE = 1.4;

// F: Doomsday Scenario. Aim a circle, click, and he teleports there, thrusts his gauntlet overhead and detonates.
// The blast damages everything inside the circle, then knocks back and stuns everything within a wider ring.
export class Doomsday {
  cooldown = 0;
  aiming = false;
  // 0 to 1: how far the casting arm is raised.
  raise = 0;
  private windup = 0;
  private origin: Vec2 = { x: 0, y: 0 };
  private casting = false;
  private swallowFire = false;
  private blasts: Blast[] = [];
  private time = 0;
  private ground: Phaser.GameObjects.Graphics;
  private glow: Phaser.GameObjects.Graphics;
  private flash: Phaser.GameObjects.Rectangle;
  private flashAlpha = 0;
  private sparkTimer = 0;

  onAimStart: () => void = () => {};
  // The scene teleports the player here; the explosion goes off after the wind-up.
  onCast: (x: number, y: number) => void = () => {};
  onImpact: () => void = () => {};
  onDamage: (target: Hittable, amount: number, x: number, y: number) => void = () => {};
  onStun: (target: Hittable, seconds: number) => void = () => {};
  onKnock: (target: Hittable, dirX: number, dirY: number, force: number) => void = () => {};

  constructor(scene: Phaser.Scene, private fx: Fx, private targets: () => readonly Hittable[]) {
    this.ground = scene.add.graphics().setDepth(-5e8 + 1).setBlendMode(Phaser.BlendModes.ADD);
    this.glow = scene.add.graphics().setDepth(1e6).setBlendMode(Phaser.BlendModes.ADD);
    this.flash = scene.add
      .rectangle(0, 0, 10, 10, 0xfff2b0)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(3.5e6)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);
  }

  get blocksFire(): boolean {
    return this.aiming || this.casting || this.swallowFire;
  }

  get busy(): boolean {
    return this.casting;
  }

  reset(): void {
    this.aiming = false;
    this.casting = false;
    this.raise = 0;
    this.cooldown = 0;
    this.blasts.length = 0;
    this.flashAlpha = 0;
  }

  cancel(): void {
    this.aiming = false;
  }

  // Where the circle sits: under the cursor, held within range of the player.
  private aimPoint(player: Player, cursor: Vec2 | null): Vec2 {
    const t = cursor ?? { x: player.x + player.aimX * 200, y: player.y + player.aimY * 200 };
    const dx = t.x - player.x;
    const dy = t.y - player.y;
    const d = Math.hypot(dx, dy);
    const max = cfg.doomsday.maxRange;
    if (d <= max || d < 1e-3) return t;
    return { x: player.x + (dx / d) * max, y: player.y + (dy / d) * max };
  }

  update(dt: number, player: Player, input: Input, cursor: Vec2 | null, hand: Vec2, cam: { width: number; height: number }): void {
    this.time += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.swallowFire && !input.isDown('fire')) this.swallowFire = false;

    if (!canUse('doomsday')) {
      this.aiming = false;
    } else if (!this.casting) {
      const key = actionFor('doomsday');
      if (key && input.justPressed(key)) {
        if (this.aiming) this.aiming = false;
        else if (this.cooldown <= 0) {
          this.aiming = true;
          this.onAimStart();
        }
      }
      for (const other of [...slotActions, 'abilityF'] as const) if (other !== key && input.justPressed(other)) this.aiming = false;
      // A click while it is cooling down does nothing and keeps it aimed.
      if (this.aiming && input.justPressed('fire')) {
        this.swallowFire = true;
        if (this.cooldown <= 0) {
          const p = this.aimPoint(player, cursor);
          this.aiming = false;
          this.cooldown = cfg.doomsday.cooldown;
          this.casting = true;
          this.windup = cfg.doomsday.windup;
          this.origin = p;
          this.onCast(p.x, p.y);
        }
      }
    }

    if (this.casting) {
      this.windup -= dt;
      const total = Math.max(cfg.doomsday.windup, 1e-3);
      this.raise = Math.min(1, (total - this.windup) / (total * 0.35));
      this.charge(hand, 1 - Math.max(0, this.windup) / total, dt);
      if (this.windup <= 0) {
        this.casting = false;
        this.detonate(hand);
      }
    } else {
      // Lower the arm again after the blast.
      this.raise = Math.max(0, this.raise - dt / 0.25);
    }

    for (let i = this.blasts.length - 1; i >= 0; i--) {
      this.blasts[i].age += dt;
      if (this.blasts[i].age >= LIFE) this.blasts.splice(i, 1);
    }
    this.flashAlpha = Math.max(0, this.flashAlpha - dt / 0.5);
    this.flash.setVisible(this.flashAlpha > 0).setSize(cam.width, cam.height).setAlpha(this.flashAlpha * cfg.doomsday.flash);
    this.draw(player, cursor, hand);
  }

  // Energy gathers into the raised gauntlet.
  private charge(hand: Vec2, t: number, dt: number): void {
    const px = cfg.render.pixelScale;
    this.sparkTimer += dt * (30 + 90 * t);
    while (this.sparkTimer >= 1) {
      this.sparkTimer -= 1;
      const a = Math.random() * Math.PI * 2;
      const r = (30 + Math.random() * 40) * px;
      this.fx.particle({
        x: hand.x + Math.cos(a) * r,
        y: hand.y + Math.sin(a) * r * 0.7,
        life: 0.25,
        from: 0.3,
        to: 0.05,
        alpha: 0.95,
        tint: HOT[Math.floor(Math.random() * HOT.length)],
        vx: (-Math.cos(a) * r) / 0.25,
        vy: (-Math.sin(a) * r * 0.7) / 0.25,
        depth: 1e6,
      });
    }
  }

  // The explosion proper: damage inside the circle, knockback and stun in the wider ring, then the show.
  private detonate(hand: Vec2): void {
    this.blastAt(this.origin.x, this.origin.y, hand, cfg.doomsday.radius, cfg.doomsday.damage * skillDamage('doomsday'), FIRE);
  }

  // Any blast of this kind: damage inside the radius, knockback and stun in the wider ring.
  blastAt(ox: number, oy: number, hand: Vec2, radius: number, damage: number, pal: Palette, knockMult = 1): void {
    const c = cfg.doomsday;
    const wide = radius * c.stunRadiusMult;
    // Damage first, so survivors are caught by the second ring too.
    for (const t of this.targets()) {
      if (!t.alive) continue;
      if (Math.hypot(t.x - ox, t.y - oy) <= radius + t.radius) this.onDamage(t, damage, t.x, t.y);
    }
    for (const t of this.targets()) {
      if (!t.alive) continue;
      const dx = t.x - ox;
      const dy = t.y - oy;
      const d = Math.hypot(dx, dy);
      if (d > wide + t.radius) continue;
      this.onStun(t, cfg.stun.duration);
      if (t.kind === 'boss') continue;
      const nx = d > 1e-3 ? dx / d : Math.cos(Math.random() * Math.PI * 2);
      const ny = d > 1e-3 ? dy / d : Math.sin(Math.random() * Math.PI * 2);
      this.onKnock(t, nx, ny, c.knockback * knockMult * (1 - 0.5 * Math.min(1, d / wide)));
    }

    this.blasts.push({ ox, oy, hx: hand.x, hy: hand.y, age: 0, radius, pal });
    this.flashAlpha = 1;
    sfx.play('doomBoom');
    this.fx.addShake(c.shake);
    this.onImpact();
    this.debris(ox, oy, hand, radius, pal);
  }

  private debris(ox: number, oy: number, hand: Vec2, radius: number, pal: Palette): void {
    const px = cfg.render.pixelScale;
    for (let i = 0; i < 160; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 150 + Math.random() * 600;
      this.fx.particle({
        x: hand.x + (Math.random() - 0.5) * 10 * px,
        y: hand.y + (Math.random() - 0.5) * 10 * px,
        life: 0.4 + Math.random() * 0.7,
        from: 0.5 + Math.random() * 0.6,
        to: 0.05,
        alpha: 1,
        tint: pal.hot[Math.floor(Math.random() * pal.hot.length)],
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed * 0.55 - 120,
        depth: 1e6,
      });
    }
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * radius;
      toScreen(ox + Math.cos(a) * r, oy + Math.sin(a) * r, screen);
      this.fx.particle({
        texture: Tex.smoke,
        x: screen.x,
        y: screen.y - 4 * px,
        life: 0.6 + Math.random() * 0.8,
        from: px * 0.8,
        to: px * (2.5 + Math.random() * 2),
        alpha: 0.9,
        tint: Math.random() < 0.5 ? pal.smoke[0] : pal.smoke[1],
        additive: false,
        vx: (Math.random() - 0.5) * 120,
        vy: -60 - Math.random() * 140,
        depth: screen.y + 3,
      });
    }
  }

  private draw(player: Player, cursor: Vec2 | null, hand: Vec2): void {
    const g = this.ground;
    const fg = this.glow;
    g.clear();
    fg.clear();
    const c = cfg.doomsday;
    const pulse = 0.7 + 0.3 * Math.sin(this.time * 10);

    if (this.aiming) {
      const p = this.aimPoint(player, cursor);
      const ready = this.cooldown <= 0;
      toScreen(p.x, p.y, screen);
      for (const [r, a] of [[c.radius, 1], [c.radius * c.stunRadiusMult, 0.45]] as const) {
        const h = ellipseHalfSize(r);
        g.fillStyle(YELLOW, (ready ? 0.1 : 0.04) * pulse * a);
        g.fillEllipse(screen.x, screen.y, h.x * 2, h.y * 2);
        g.lineStyle(2, YELLOW, (ready ? 0.9 : 0.3) * pulse * a);
        g.strokeEllipse(screen.x, screen.y, h.x * 2, h.y * 2);
      }
    }

    if (this.casting) {
      // The casting circle stays marked and a charged orb swells at the gauntlet.
      const t = 1 - Math.max(0, this.windup) / Math.max(c.windup, 1e-3);
      toScreen(this.origin.x, this.origin.y, screen);
      const h = ellipseHalfSize(c.radius);
      g.lineStyle(3, YELLOW, 0.4 + 0.5 * t);
      g.strokeEllipse(screen.x, screen.y, h.x * 2, h.y * 2);
      const r = (6 + 22 * t * t) * cfg.render.pixelScale;
      fg.fillStyle(YELLOW, 0.35 * pulse).fillCircle(hand.x, hand.y, r * 1.6);
      fg.fillStyle(0xfff2b0, 0.8).fillCircle(hand.x, hand.y, r);
      fg.fillStyle(0xffffff, 0.9).fillCircle(hand.x, hand.y, r * 0.45);
    }

    for (const b of this.blasts) this.drawBlast(g, fg, b);
  }

  private drawBlast(g: Phaser.GameObjects.Graphics, fg: Phaser.GameObjects.Graphics, b: Blast): void {
    const c = cfg.doomsday;
    const pal = b.pal;
    const t = b.age / LIFE;
    const wide = b.radius * c.stunRadiusMult;
    toScreen(b.ox, b.oy, screen);
    const gx = screen.x;
    const gy = screen.y;
    const px = cfg.render.pixelScale;
    const ease = (v: number) => 1 - Math.pow(1 - Math.min(1, v), 3);

    // Scorched ground that glows and slowly cools.
    const hot = ellipseHalfSize(b.radius);
    g.fillStyle(pal.ground, 0.5 * (1 - t));
    g.fillEllipse(gx, gy, hot.x * 2 * ease(b.age / 0.15), hot.y * 2 * ease(b.age / 0.15));
    g.fillStyle(pal.ground2, 0.35 * Math.max(0, 1 - t * 2));
    g.fillEllipse(gx, gy, hot.x * 1.4, hot.y * 1.4);

    // Two shockwave rings rolling out across the ground to the stun radius.
    for (const delay of [0, 0.12]) {
      const w = (b.age - delay) / 0.45;
      if (w < 0 || w > 1) continue;
      const h = ellipseHalfSize(wide * ease(w));
      g.lineStyle(10 * (1 - w) + 2, pal.ring, 0.9 * (1 - w));
      g.strokeEllipse(gx, gy, h.x * 2, h.y * 2);
    }

    // The fireball: born at the hand, it swells into a dome over the circle, then collapses into the ground.
    const swell = ease(b.age / 0.22);
    const fade = Math.max(0, 1 - b.age / 0.75);
    if (fade > 0) {
      const rx = ellipseHalfSize(b.radius).x * swell;
      const cy = gy - 22 * px * swell + (b.hy - (gy - 40 * px)) * (1 - swell) * 0.6;
      const cx = gx + (b.hx - gx) * (1 - swell);
      fg.fillStyle(pal.outer, 0.35 * fade).fillCircle(cx, cy, rx * 1.15);
      fg.fillStyle(pal.mid, 0.55 * fade).fillCircle(cx, cy, rx * 0.85);
      fg.fillStyle(pal.core, 0.8 * fade).fillCircle(cx, cy, rx * 0.55);
      fg.fillStyle(0xffffff, 0.9 * fade).fillCircle(cx, cy, rx * 0.28);
    }
  }
}
