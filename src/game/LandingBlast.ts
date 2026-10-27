import Phaser from 'phaser';
import { Tex } from '../art/placeholders';
import { cfg } from '../config';
import { ellipseHalfSize } from '../iso';
import { Fx } from './Fx';

const LIFE = 1.1;
const PURPLES = [0x7a2fd0, 0xb070ff, 0x3a0f6a, 0xe0c8ff];

// The crash landing at the start of a run: Doomsday's blast in purple and black.
export class LandingBlast {
  private ground: Phaser.GameObjects.Graphics;
  private glow: Phaser.GameObjects.Graphics;
  private flash: Phaser.GameObjects.Rectangle;
  private flashAlpha = 0;
  private age = -1;
  private x = 0;
  private y = 0;

  constructor(scene: Phaser.Scene, private fx: Fx) {
    this.ground = scene.add.graphics().setDepth(-5e8 + 1);
    this.glow = scene.add.graphics().setDepth(1e6).setBlendMode(Phaser.BlendModes.ADD);
    this.flash = scene.add.rectangle(0, 0, 10, 10, 0xd8b8ff).setOrigin(0).setScrollFactor(0).setDepth(3.5e6).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
  }

  trigger(sx: number, sy: number): void {
    this.x = sx;
    this.y = sy;
    this.age = 0;
    this.flashAlpha = 1;
    this.fx.addShake(cfg.entry.blastShake);
    const px = cfg.render.pixelScale;
    const r = cfg.entry.blastRadius;
    for (let i = 0; i < 140; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 150 + Math.random() * 600;
      this.fx.particle({
        x: sx + (Math.random() - 0.5) * 10 * px,
        y: sy - 10 * px,
        life: 0.4 + Math.random() * 0.7,
        from: 0.5 + Math.random() * 0.6,
        to: 0.05,
        tint: PURPLES[Math.floor(Math.random() * PURPLES.length)],
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed * 0.55 - 120,
        depth: 1e6,
      });
    }
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * r;
      this.fx.particle({
        texture: Tex.smoke,
        x: sx + Math.cos(a) * d,
        y: sy + Math.sin(a) * d * 0.5 - 4 * px,
        life: 0.6 + Math.random() * 0.8,
        from: px * 0.8,
        to: px * (2.5 + Math.random() * 2),
        alpha: 0.9,
        tint: Math.random() < 0.5 ? 0x07000d : 0x2a0f4a,
        additive: false,
        vx: (Math.random() - 0.5) * 120,
        vy: -60 - Math.random() * 140,
        depth: sy + 3,
      });
    }
  }

  update(dt: number, cam: { width: number; height: number }): void {
    this.flashAlpha = Math.max(0, this.flashAlpha - dt / 0.5);
    this.flash.setVisible(this.flashAlpha > 0).setSize(cam.width, cam.height).setAlpha(this.flashAlpha * cfg.entry.blastFlash);
    this.ground.clear();
    this.glow.clear();
    if (this.age < 0) return;
    this.age += dt;
    if (this.age >= LIFE) {
      this.age = -1;
      return;
    }
    const t = this.age / LIFE;
    const g = this.ground;
    const fg = this.glow;
    const r = cfg.entry.blastRadius;
    const ease = (v: number) => 1 - Math.pow(1 - Math.min(1, v), 3);
    const px = cfg.render.pixelScale;

    // Scorched ground that glows and slowly cools.
    const hot = ellipseHalfSize(r);
    const swell = ease(this.age / 0.15);
    g.fillStyle(0x07000d, 0.8 * (1 - t));
    g.fillEllipse(this.x, this.y, hot.x * 2.2 * swell, hot.y * 2.2 * swell);
    g.fillStyle(0x3a0f6a, 0.7 * (1 - t));
    g.fillEllipse(this.x, this.y, hot.x * 2 * swell, hot.y * 2 * swell);

    // Two shockwave rings rolling out across the ground.
    for (const delay of [0, 0.12]) {
      const w = (this.age - delay) / 0.45;
      if (w < 0 || w > 1) continue;
      const h = ellipseHalfSize(r * 1.7 * ease(w));
      fg.lineStyle(10 * (1 - w) + 2, 0xd8b8ff, 0.9 * (1 - w));
      fg.strokeEllipse(this.x, this.y, h.x * 2, h.y * 2);
    }

    // The dome: swells over the point of impact then collapses into the ground.
    const dome = ease(this.age / 0.22);
    const fade = Math.max(0, 1 - this.age / 0.75);
    if (fade > 0) {
      const rx = ellipseHalfSize(r).x * dome;
      const cy = this.y - 22 * px * dome;
      fg.fillStyle(0x3a0f6a, 0.5 * fade).fillCircle(this.x, cy, rx * 1.15);
      fg.fillStyle(0x7a2fd0, 0.6 * fade).fillCircle(this.x, cy, rx * 0.85);
      fg.fillStyle(0xb070ff, 0.8 * fade).fillCircle(this.x, cy, rx * 0.55);
      fg.fillStyle(0xf0e0ff, 0.9 * fade).fillCircle(this.x, cy, rx * 0.28);
    }
  }
}
