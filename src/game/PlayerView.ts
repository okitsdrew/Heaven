import Phaser from 'phaser';
import { bowArt, Tex, walkFrames } from '../art/placeholders';
import { cfg } from '../config';
import { ellipseHalfSize, toScreen, Vec2 } from '../iso';
import { Fx } from './Fx';
import { Player } from './Player';

// Art measurements, in sprite pixels (multiplied by render.pixelScale).
const SHOULDER_X = 4;
const SHOULDER_Y = 12;
const CHEST_Y = 10;
const BACK_Y = 13;

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
  private walk = 0;

  constructor(scene: Phaser.Scene, private player: Player, private fx: Fx) {
    this.shadow = scene.add.image(0, 0, Tex.shadow);
    this.body = scene.add.image(0, 0, Tex.player).setOrigin(0.5, 1);
    this.bow = scene.add.image(0, 0, Tex.bow).setOrigin(bowArt.gripX / bowArt.width, 0.5);
    this.arms = scene.add.graphics();
    this.ring = scene.add.graphics();
  }

  onFire(): void {
    this.kick = cfg.feel.bowKickTime;
  }

  onDashStart(): void {
    this.afterimageTimer = 0;
  }

  // A dark purple line zips between the two points, with a puff of void at each end.
  onTeleport(fromX: number, fromY: number, toX: number, toY: number): void {
    const px = cfg.render.pixelScale;
    const a = toScreen(fromX, fromY);
    const b = toScreen(toX, toY);
    const lift = 10 * px;
    this.fx.streak(a.x, a.y - lift, b.x, b.y - lift);
    for (const end of [a, b]) {
      for (let i = 0; i < cfg.teleport.puffs; i++) {
        const angle = Math.random() * Math.PI * 2;
        const life = 0.3 + Math.random() * 0.3;
        this.fx.particle({
          texture: Math.random() < 0.5 ? Tex.smoke : Tex.glow,
          x: end.x,
          y: end.y - lift,
          life,
          from: 0.5 + Math.random() * 0.5,
          to: 1.5 + Math.random(),
          alpha: 0.9,
          tint: [0x07000d, 0x2a0a4a, 0x5a1a9a][Math.floor(Math.random() * 3)],
          additive: false,
          vx: Math.cos(angle) * 50,
          vy: Math.sin(angle) * 30,
        });
      }
    }
    this.fx.addShake(cfg.camera.shakeOnCast * 0.5);
  }

  update(dt: number): void {
    const p = this.player;
    const px = cfg.render.pixelScale;
    const f = cfg.feel;
    toScreen(p.x, p.y, screen);
    toScreen(p.x + p.aimX, p.y + p.aimY, ahead);
    const aimAngle = Math.atan2(ahead.y - screen.y, ahead.x - screen.x);
    const facingLeft = ahead.x < screen.x;

    const speed = Math.hypot(p.vx, p.vy);
    const moving = !p.dashing && speed > cfg.player.moveSpeed * 0.1;
    this.phase = moving ? (this.phase + (speed * dt) / f.strideLength) % 1 : 0;
    const bob = moving ? Math.abs(Math.sin(this.phase * Math.PI * 2)) * f.walkBob * px : 0;
    const swing = moving ? Math.sin(this.phase * Math.PI * 2) * 2.5 * px : 0;

    this.body
      .setTexture(moving ? walkFrames[Math.floor(this.phase * 4) % 4] : Tex.player)
      .setPosition(screen.x, screen.y - bob)
      .setScale(px)
      .setFlipX(facingLeft)
      .setDepth(screen.y)
      .setAlpha(p.dashing ? 0.55 : 1);
    this.shadow.setPosition(screen.x, screen.y).setScale(px * 0.9, px * 0.35).setDepth(screen.y - 1000);

    // The bow lives on his back and is grabbed very fast when he shoots, then stowed more slowly.
    const rate = p.readyTimer > 0 ? dt / Math.max(f.bowGrabTime, 1e-4) : -dt / Math.max(f.bowStowTime, 1e-4);
    this.raise = Phaser.Math.Clamp(this.raise + rate, 0, 1);
    const t = this.raise * this.raise * (3 - 2 * this.raise);

    this.kick = Math.max(0, this.kick - dt);
    const kickT = f.bowKickTime > 0 ? this.kick / f.bowKickTime : 0;

    const cx = screen.x;
    const cy = screen.y - bob;
    const bowSide = facingLeft ? -1 : 1;
    const dirX = Math.cos(aimAngle);
    const dirY = Math.sin(aimAngle);
    const bs = px * cfg.render.bowScale;
    const stringDist = (bowArt.gripX - bowArt.stringX) * bs;

    const shoulderBow = { x: cx + bowSide * SHOULDER_X * px, y: cy - SHOULDER_Y * px };
    const shoulderDraw = { x: cx - bowSide * SHOULDER_X * px, y: cy - SHOULDER_Y * px };
    const reach = (4 - kickT * 2) * px;
    const grip = { x: cx + dirX * reach, y: cy - CHEST_Y * px + dirY * reach };
    const stringRest = { x: grip.x - dirX * stringDist, y: grip.y - dirY * stringDist };
    const pull = p.drawProgress;
    const nock = { x: stringRest.x - dirX * pull * f.drawDistance * px, y: stringRest.y - dirY * pull * f.drawDistance * px };

    // Walking holds the arms out to the sides (< I >) and wiggles them; standing they hang down.
    this.walk = Phaser.Math.Clamp(this.walk + (moving ? dt : -dt) / 0.1, 0, 1);
    const flap = swing * (f.walkArmFlap / 2.5);
    const restBow = { x: shoulderBow.x + bowSide * 1.5 * px, y: shoulderBow.y + 8 * px + swing };
    const restDraw = { x: shoulderDraw.x - bowSide * 1.5 * px, y: shoulderDraw.y + 8 * px - swing };
    const wideBow = { x: shoulderBow.x + bowSide * f.walkArmSpread * px, y: shoulderBow.y + f.walkArmDrop * px + flap };
    const wideDraw = { x: shoulderDraw.x - bowSide * f.walkArmSpread * px, y: shoulderDraw.y + f.walkArmDrop * px - flap };

    const armA = solveArm(shoulderBow, lerp(lerp(restBow, wideBow, this.walk), grip, t), f.armLength * px);
    const armB = solveArm(shoulderDraw, lerp(lerp(restDraw, wideDraw, this.walk), nock, t), f.armLength * px);

    // The bow follows the bow hand, so short arms keep it close to the body.
    const backPos = { x: cx - bowSide * 2 * px, y: cy - BACK_Y * px };
    const backAngle = bowSide > 0 ? Math.PI + f.bowBackTilt : -f.bowBackTilt;
    const bowPos = lerp(backPos, armA.hand, t);
    const bowAngle = lerpAngle(backAngle, aimAngle, t);
    this.bow
      .setPosition(bowPos.x, bowPos.y)
      .setRotation(bowAngle)
      .setScale(bs)
      .setDepth(screen.y + (t > 0.5 ? (dirY < 0 ? -0.5 : 0.5) : -0.5))
      .setAlpha(this.body.alpha);

    const g = this.arms;
    g.clear().setDepth(screen.y + 0.3).setAlpha(this.body.alpha);
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

    // The string is drawn between the limb tips, pulled toward the drawing hand while drawing.
    const cos = Math.cos(bowAngle);
    const sin = Math.sin(bowAngle);
    const tip = (side: number): Vec2 => {
      const u = (bowArt.stringX - bowArt.gripX) * bs;
      const v = side * bowArt.halfHeight * bs;
      return { x: bowPos.x + u * cos - v * sin, y: bowPos.y + u * sin + v * cos };
    };
    const a = tip(-1);
    const b = tip(1);
    const drawing = t > 0.5 && pull > 0.02;
    const rest = { x: bowPos.x + (bowArt.stringX - bowArt.gripX) * bs * cos, y: bowPos.y + (bowArt.stringX - bowArt.gripX) * bs * sin };
    const pulled = drawing ? lerp(rest, armB.hand, pull) : rest;
    g.lineStyle(1, 0xd8d0c0, 0.9);
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(pulled.x, pulled.y);
    g.lineTo(b.x, b.y);
    g.strokePath();
    if (drawing) {
      g.lineStyle(Math.max(1, px), 0x8a6a48, 1);
      g.beginPath();
      g.moveTo(pulled.x, pulled.y);
      g.lineTo(bowPos.x + dirX * 5 * px, bowPos.y + dirY * 5 * px);
      g.strokePath();
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
  for (let i = 0; i < segments + 1; i++) {
    const a = start + (i / segments) * fraction * Math.PI * 2;
    const x = cx + Math.cos(a) * rx;
    const y = cy + Math.sin(a) * ry;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.strokePath();
}
