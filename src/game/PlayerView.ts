import Phaser from 'phaser';
import { Tex, walkFrames } from '../art/placeholders';
import { cfg } from '../config';
import { ellipseHalfSize, toScreen, Vec2 } from '../iso';
import { Fx } from './Fx';
import { Player } from './Player';

// Art measurements, in sprite pixels (multiplied by render.pixelScale).
const SHOULDER_X = 4;
const SHOULDER_Y = 12;
const CHEST_Y = 10;
const ARM_SEGMENT = 6;
const BOW_TIP_X = -1.1;
const BOW_TIP_Y = 12.5;

const screen = { x: 0, y: 0 };
const ahead = { x: 0, y: 0 };

const SLEEVE = 0x3d3754;
const SLEEVE_EDGE = 0x120f18;
const SKIN = 0xc8b08a;

export class PlayerView {
  private body: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Image;
  private bow: Phaser.GameObjects.Image;
  private arms: Phaser.GameObjects.Graphics;
  private ring: Phaser.GameObjects.Graphics;
  private kick = 0;
  private afterimageTimer = 0;
  private readyPulse = 0;
  private wasCooling = false;
  private phase = 0;
  private raise = 0;

  constructor(scene: Phaser.Scene, private player: Player, private fx: Fx) {
    this.shadow = scene.add.image(0, 0, Tex.shadow);
    this.body = scene.add.image(0, 0, Tex.player).setOrigin(0.5, 1);
    this.bow = scene.add.image(0, 0, Tex.bow).setOrigin(0.3, 0.5);
    this.arms = scene.add.graphics();
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

    const speed = Math.hypot(p.vx, p.vy);
    const moving = !p.dashing && speed > cfg.player.moveSpeed * 0.1;
    this.phase = moving ? (this.phase + (speed * dt) / cfg.feel.strideLength) % 1 : 0;
    const bob = moving ? Math.abs(Math.sin(this.phase * Math.PI * 2)) * cfg.feel.walkBob * px : 0;
    const swing = moving ? Math.sin(this.phase * Math.PI * 2) * 2.5 * px : 0;

    this.body
      .setTexture(moving ? walkFrames[Math.floor(this.phase * 4) % 4] : Tex.player)
      .setPosition(screen.x, screen.y - bob)
      .setScale(px)
      .setFlipX(facingLeft)
      .setDepth(screen.y)
      .setAlpha(p.dashing ? 0.55 : 1);
    this.shadow.setPosition(screen.x, screen.y).setScale(px * 0.9, px * 0.35).setDepth(screen.y - 1000);

    // Arms ease up to the bow while firing and drop back to the sides afterwards.
    const step = cfg.feel.armRaiseTime > 0 ? dt / cfg.feel.armRaiseTime : 1;
    this.raise = Phaser.Math.Clamp(this.raise + (p.readyTimer > 0 ? step : -step), 0, 1);
    const t = this.raise * this.raise * (3 - 2 * this.raise);

    this.kick = Math.max(0, this.kick - dt);
    const kickT = cfg.feel.bowKickTime > 0 ? this.kick / cfg.feel.bowKickTime : 0;

    const cx = screen.x;
    const cy = screen.y - bob;
    const bowSide = facingLeft ? -1 : 1;
    const dirX = Math.cos(aimAngle);
    const dirY = Math.sin(aimAngle);

    const shoulderBow = { x: cx + bowSide * SHOULDER_X * px, y: cy - SHOULDER_Y * px };
    const shoulderDraw = { x: cx - bowSide * SHOULDER_X * px, y: cy - SHOULDER_Y * px };
    const reach = (4 - kickT * 2) * px;
    const grip = { x: cx + dirX * reach, y: cy - CHEST_Y * px + dirY * reach };
    const pull = (1 + p.drawProgress * cfg.feel.drawDistance) * px;
    const nock = { x: grip.x - dirX * pull, y: grip.y - dirY * pull };

    const handBow = lerp(
      { x: shoulderBow.x + bowSide * 1.5 * px, y: shoulderBow.y + 8 * px + swing },
      grip,
      t,
    );
    const handDraw = lerp(
      { x: shoulderDraw.x - bowSide * 1.5 * px, y: shoulderDraw.y + 8 * px - swing },
      nock,
      t,
    );

    const bowAngle = lerpAngle(bowSide > 0 ? 0 : Math.PI, aimAngle, t);
    this.bow
      .setPosition(handBow.x, handBow.y)
      .setRotation(bowAngle)
      .setScale(px)
      .setDepth(screen.y + (t > 0.5 && dirY < 0 ? -0.5 : 0.5))
      .setAlpha(this.body.alpha);

    const g = this.arms;
    g.clear().setDepth(screen.y + 0.3).setAlpha(this.body.alpha);
    const armA = solveArm(shoulderBow, handBow, ARM_SEGMENT * px);
    const armB = solveArm(shoulderDraw, handDraw, ARM_SEGMENT * px);
    for (const [width, color] of [
      [3 * px, SLEEVE_EDGE],
      [2 * px, SLEEVE],
    ] as const) {
      g.lineStyle(width, color, 1);
      for (const arm of [armA, armB]) {
        g.beginPath();
        g.moveTo(arm.shoulder.x, arm.shoulder.y);
        g.lineTo(arm.elbow.x, arm.elbow.y);
        g.lineTo(arm.hand.x, arm.hand.y);
        g.strokePath();
      }
    }
    g.fillStyle(SKIN, 1);
    g.fillCircle(armA.hand.x, armA.hand.y, 1.2 * px);
    g.fillCircle(armB.hand.x, armB.hand.y, 1.2 * px);

    if (t > 0.5) {
      // String through the drawing hand, and the nocked arrow while it is pulled.
      const cos = Math.cos(bowAngle);
      const sin = Math.sin(bowAngle);
      const tip = (side: number): Vec2 => ({
        x: handBow.x + (BOW_TIP_X * cos - side * BOW_TIP_Y * sin) * px,
        y: handBow.y + (BOW_TIP_X * sin + side * BOW_TIP_Y * cos) * px,
      });
      const a = tip(-1);
      const b = tip(1);
      g.lineStyle(1, 0xd8d0c0, 0.9);
      g.beginPath();
      g.moveTo(a.x, a.y);
      if (p.drawProgress > 0.02) g.lineTo(armB.hand.x, armB.hand.y);
      g.lineTo(b.x, b.y);
      g.strokePath();
      if (p.drawProgress > 0.02) {
        g.lineStyle(Math.max(1, px), 0x8a6a48, 1);
        g.beginPath();
        g.moveTo(armB.hand.x, armB.hand.y);
        g.lineTo(handBow.x + dirX * 5 * px, handBow.y + dirY * 5 * px);
        g.strokePath();
      }
    }

    if (p.dashing && cfg.dash.afterimages > 0) {
      this.afterimageTimer -= dt;
      if (this.afterimageTimer <= 0) {
        this.fx.afterimage(this.body.texture.key, screen.x, screen.y, facingLeft, px, screen.y);
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

function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function lerpAngle(a: number, b: number, t: number): number {
  return a + Phaser.Math.Angle.Wrap(b - a) * t;
}

// Two-bone arm. The elbow bends downward, and the hand stops short if the target is out of reach.
function solveArm(shoulder: Vec2, target: Vec2, segment: number): { shoulder: Vec2; elbow: Vec2; hand: Vec2 } {
  const dx = target.x - shoulder.x;
  const dy = target.y - shoulder.y;
  const len = Math.hypot(dx, dy) || 1;
  const d = Math.min(len, segment * 2 - 0.01);
  const ux = dx / len;
  const uy = dy / len;
  const h = Math.sqrt(Math.max(0, segment * segment - (d * d) / 4));
  const mx = shoulder.x + (ux * d) / 2;
  const my = shoulder.y + (uy * d) / 2;
  const a = { x: mx - uy * h, y: my + ux * h };
  const b = { x: mx + uy * h, y: my - ux * h };
  return {
    shoulder,
    elbow: a.y > b.y ? a : b,
    hand: { x: shoulder.x + ux * d, y: shoulder.y + uy * d },
  };
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
