import Phaser from 'phaser';
import { Tex } from '../art/placeholders';
import { cfg } from '../config';
import { ellipseHalfSize, toScreen } from '../iso';
import { Fx } from './Fx';
import { Player } from './Player';

const screen = { x: 0, y: 0 };
const ahead = { x: 0, y: 0 };

export class PlayerView {
  private body: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Image;
  private bow: Phaser.GameObjects.Image;
  private ring: Phaser.GameObjects.Graphics;
  private kick = 0;
  private afterimageTimer = 0;
  private readyPulse = 0;
  private wasCooling = false;

  constructor(scene: Phaser.Scene, private player: Player, private fx: Fx) {
    this.shadow = scene.add.image(0, 0, Tex.shadow);
    this.body = scene.add.image(0, 0, Tex.player).setOrigin(0.5, 1);
    this.bow = scene.add.image(0, 0, Tex.bow).setOrigin(0.3, 0.5);
    this.ring = scene.add.graphics();
  }

  onFire(): void {
    this.kick = cfg.feel.bowKickTime;
  }

  onDashStart(): void {
    this.afterimageTimer = 0;
  }

  update(dt: number): void {
    const p = this.player;
    const px = cfg.render.pixelScale;
    toScreen(p.x, p.y, screen);
    toScreen(p.x + p.aimX, p.y + p.aimY, ahead);
    const aimAngle = Math.atan2(ahead.y - screen.y, ahead.x - screen.x);
    const facingLeft = ahead.x < screen.x;

    this.body
      .setPosition(screen.x, screen.y)
      .setScale(px)
      .setFlipX(facingLeft)
      .setDepth(screen.y)
      .setAlpha(p.dashing ? 0.55 : 1);
    this.shadow.setPosition(screen.x, screen.y).setScale(px * 0.9, px * 0.35).setDepth(screen.y - 1000);

    // Bow is held at chest height and pulled back briefly on each shot.
    this.kick = Math.max(0, this.kick - dt);
    const kickT = cfg.feel.bowKickTime > 0 ? this.kick / cfg.feel.bowKickTime : 0;
    const chestY = screen.y - 10 * px;
    const reach = (4 - kickT * 2) * px;
    this.bow
      .setPosition(screen.x + Math.cos(aimAngle) * reach, chestY + Math.sin(aimAngle) * reach)
      .setRotation(aimAngle)
      .setScale(px)
      .setDepth(screen.y + (Math.sin(aimAngle) > 0 ? 0.5 : -0.5))
      .setAlpha(this.body.alpha);

    if (p.dashing && cfg.dash.afterimages > 0) {
      this.afterimageTimer -= dt;
      if (this.afterimageTimer <= 0) {
        this.fx.afterimage(Tex.player, screen.x, screen.y, facingLeft, px, screen.y);
        this.afterimageTimer += cfg.dash.duration / cfg.dash.afterimages;
      }
    }

    this.drawCooldownRing(dt);
  }

  private drawCooldownRing(dt: number): void {
    const p = this.player;
    const g = this.ring;
    g.clear();
    g.setDepth(screen.y - 999);

    const cooling = p.dashing || p.dashCooldownFraction > 0;
    if (this.wasCooling && !cooling) this.readyPulse = 0.25;
    this.wasCooling = cooling;
    this.readyPulse = Math.max(0, this.readyPulse - dt);

    const half = ellipseHalfSize(18);
    if (cooling) {
      const progress = p.dashing ? 0 : 1 - p.dashCooldownFraction;
      g.lineStyle(2, 0x2a2638, 0.8);
      ellipseArc(g, screen.x, screen.y, half.x, half.y, 1);
      g.lineStyle(2, 0xc9b6ff, 0.9);
      ellipseArc(g, screen.x, screen.y, half.x, half.y, progress);
    } else if (this.readyPulse > 0) {
      const t = this.readyPulse / 0.25;
      g.lineStyle(2, 0xffffff, t);
      ellipseArc(g, screen.x, screen.y, half.x * (1 + (1 - t) * 0.3), half.y * (1 + (1 - t) * 0.3), 1);
    }
  }
}

function ellipseArc(g: Phaser.GameObjects.Graphics, cx: number, cy: number, rx: number, ry: number, fraction: number): void {
  if (fraction <= 0) return;
  const segments = Math.max(2, Math.ceil(40 * fraction));
  const start = -Math.PI / 2;
  g.beginPath();
  for (let i = 0; i <= segments; i++) {
    const a = start + (i / segments) * fraction * Math.PI * 2;
    const x = cx + Math.cos(a) * rx;
    const y = cy + Math.sin(a) * ry;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.strokePath();
}
