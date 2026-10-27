import Phaser from 'phaser';
import { cfg } from '../config';
import { ellipseHalfSize, toScreen } from '../iso';
import { Fx } from './Fx';

const screen = { x: 0, y: 0 };

// The wave that clears the field at 78 seconds: a purple ring rolling out from the player across the ground.
export class PurpleWave {
  radius = -1;
  private x = 0;
  private y = 0;
  private ground: Phaser.GameObjects.Graphics;
  private glow: Phaser.GameObjects.Graphics;
  private flash: Phaser.GameObjects.Rectangle;
  private flashAlpha = 0;

  constructor(scene: Phaser.Scene, private fx: Fx) {
    this.ground = scene.add.graphics().setDepth(-5e8 + 2);
    this.glow = scene.add.graphics().setDepth(1e6).setBlendMode(Phaser.BlendModes.ADD);
    this.flash = scene.add.rectangle(0, 0, 10, 10, 0xb070ff).setOrigin(0).setScrollFactor(0).setDepth(3.5e6).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
  }

  get active(): boolean {
    return this.radius >= 0;
  }

  start(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.radius = 0;
    this.flashAlpha = 1;
    this.fx.addShake(cfg.boss.waveShake);
  }

  stop(): void {
    this.radius = -1;
    this.ground.clear();
    this.glow.clear();
  }

  // Grows the ring; returns true on the frame it reaches full size.
  update(dt: number, cam: { width: number; height: number }): boolean {
    this.flashAlpha = Math.max(0, this.flashAlpha - dt / 0.6);
    this.flash.setVisible(this.flashAlpha > 0).setSize(cam.width, cam.height).setAlpha(this.flashAlpha * 0.4);
    this.ground.clear();
    this.glow.clear();
    if (this.radius < 0) return false;
    this.radius += cfg.boss.waveSpeed * dt;
    const done = this.radius >= cfg.boss.waveRadius;
    const k = Math.min(1, this.radius / cfg.boss.waveRadius);
    toScreen(this.x, this.y, screen);
    for (const [back, w, color, a] of [
      [0, 46, 0x07000d, 0.55],
      [0, 24, 0x3a0f6a, 0.8],
      [0, 10, 0xb070ff, 0.95],
      [0, 4, 0xf0e0ff, 1],
    ] as const) {
      const h = ellipseHalfSize(Math.max(1, this.radius - back));
      const target = back === 0 && w > 20 ? this.ground : this.glow;
      target.lineStyle(w * (1 - 0.5 * k), color, a * (1 - 0.6 * k));
      target.strokeEllipse(screen.x, screen.y, h.x * 2, h.y * 2);
    }
    if (done) this.stop();
    return done;
  }
}
