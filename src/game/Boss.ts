import Phaser from 'phaser';
import { Tex } from '../art/placeholders';
import { cfg } from '../config';
import { toScreen, toWorld } from '../iso';
import { stats } from '../skills';
import { Pool } from '../util/pool';
import { Hittable, segmentCircle } from './Arrows';
import type { Obstacle } from './Chunks';
import { Fx } from './Fx';
import { Player } from './Player';
import { PlayerView } from './PlayerView';

type State = 'chase' | 'windup' | 'recover' | 'dodge';

interface BossArrow {
  active: boolean;
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  stretch: number;
  traveled: number;
  sprite: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
}

// What the boss copies from the player when it spawns.
interface Snapshot {
  arrows: number;
  range: number;
  moveSpeed: number;
  dashDistance: number;
  dashDuration: number;
  dashCooldown: number;
}

const GREY = 0xb8b8c8;
const screen = { x: 0, y: 0 };
const ahead = { x: 0, y: 0 };

// A grey copy of the player. It dashes close, winds up, then fires aimed arrows that kill in one hit.
// Contact is harmless. The simulation is flat world space; the view reuses PlayerView on a stand-in Player.
export class Boss implements Hittable {
  readonly kind = 'boss' as const;
  readonly id = -1;
  x = 0;
  y = 0;
  radius = 0;
  alive = false;
  hp = 0;
  maxHp = 0;

  onKilled: (x: number, y: number) => void = () => {};

  private sim = new Player();
  private view: PlayerView;
  private state: State = 'chase';
  private timer = 0;
  private dashGap = 0;
  private dashDirX = 0;
  private dashDirY = 0;
  private dashLeft = 0;
  private snap!: Snapshot;
  private arrows: Pool<BossArrow>;
  private telegraph: Phaser.GameObjects.Graphics;
  private bar: Phaser.GameObjects.Graphics;
  private name: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, fx: Fx) {
    this.view = new PlayerView(scene, this.sim, fx);
    this.view.setGrey(true);
    this.view.setVisible(false);
    this.telegraph = scene.add.graphics();
    this.bar = scene.add.graphics().setScrollFactor(0).setDepth(5e6);
    this.name = scene.add
      .text(0, 0, 'THE SHADE OF YOU', { fontFamily: 'monospace', fontSize: '13px', color: '#c8c8d8' })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(5e6)
      .setVisible(false);
    this.arrows = new Pool(() => ({
      active: false,
      x: 0,
      y: 0,
      dirX: 1,
      dirY: 0,
      stretch: 1,
      traveled: 0,
      sprite: scene.add.image(0, 0, Tex.arrow).setTint(GREY).setVisible(false),
      glow: scene.add.image(0, 0, Tex.glow).setTint(0xdcdcf0).setBlendMode(Phaser.BlendModes.ADD).setVisible(false),
    }));
  }

  // Appears off to one side of the player and snapshots their current build.
  spawn(px: number, py: number): void {
    const b = cfg.boss;
    const angle = Math.random() * Math.PI * 2;
    this.x = px + Math.cos(angle) * b.spawnDistance;
    this.y = py + Math.sin(angle) * b.spawnDistance;
    this.radius = b.radius;
    this.maxHp = this.hp = b.hp;
    this.alive = true;
    this.state = 'chase';
    this.timer = 0;
    this.dashGap = 0;
    this.dashLeft = 0;
    this.snap = {
      arrows: stats.arrows(),
      range: stats.range(),
      moveSpeed: stats.moveSpeed(),
      dashDistance: cfg.dash.distance,
      dashDuration: cfg.dash.duration,
      dashCooldown: cfg.dash.cooldown,
    };
    Object.assign(this.sim, { x: this.x, y: this.y, vx: 0, vy: 0, dashTime: 0, dashCooldown: 0, readyTimer: 0, fireCooldown: 0 });
    this.view.setVisible(true);
    this.name.setVisible(true);
    this.faceToward(px, py);
  }

  clear(): void {
    this.alive = false;
    this.view.setVisible(false);
    this.name.setVisible(false);
    this.telegraph.clear();
    this.bar.clear();
    for (const a of this.arrows.items) this.release(a);
  }

  damage(amount: number): void {
    if (!this.alive) return;
    this.hp -= amount;
    this.view.flash();
    if (this.hp > 0) return;
    this.alive = false;
    this.view.setVisible(false);
    this.name.setVisible(false);
    this.telegraph.clear();
    this.bar.clear();
    this.onKilled(this.x, this.y);
  }

  // Returns true if one of its arrows hit the player this frame.
  update(dt: number, px: number, py: number, playerSafe: boolean, playerRadius: number, obstacles: readonly Obstacle[]): boolean {
    const hit = this.updateArrows(dt, px, py, playerSafe, playerRadius, obstacles);
    if (!this.alive) return hit;
    const b = cfg.boss;
    const s = this.snap;
    const dx = px - this.x;
    const dy = py - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    this.sim.dashCooldown = Math.max(0, this.sim.dashCooldown - dt);
    this.dashGap = Math.max(0, this.dashGap - dt);

    let vx = 0;
    let vy = 0;
    if (this.dashLeft > 0) {
      // Mid-dash: a straight, fast burst.
      const step = Math.min(this.dashLeft, (s.dashDistance / s.dashDuration) * dt);
      this.x += this.dashDirX * step;
      this.y += this.dashDirY * step;
      this.dashLeft -= step;
      this.sim.dashTime = this.dashLeft > 0 ? s.dashDuration : 0;
      if (this.dashLeft <= 0) {
        this.sim.dashTime = 0;
        this.sim.dashCooldown = s.dashCooldown;
        this.sim.dashCooldownMax = s.dashCooldown;
        this.dashGap = b.dashGap;
      }
    } else if (this.state === 'chase') {
      this.faceToward(px, py);
      if (dist <= b.closeDistance) {
        this.state = 'windup';
        this.timer = b.windup;
      } else if (this.dashGap <= 0 && this.sim.dashCooldown <= 0) {
        // Dash in, but don't overshoot the close range.
        this.startDash(dx / dist, dy / dist, Math.min(s.dashDistance, dist - b.closeDistance * 0.5));
      } else {
        const speed = s.moveSpeed * b.walkSpeedMult;
        vx = (dx / dist) * speed;
        vy = (dy / dist) * speed;
        this.x += vx * dt;
        this.y += vy * dt;
      }
    } else if (this.state === 'windup') {
      this.timer -= dt;
      // Aim follows the player until just before the shot, then locks so a dash away dodges it.
      if (this.timer > b.aimLockTime) this.faceToward(px, py);
      if (this.timer <= 0) {
        this.fire();
        this.state = 'recover';
        this.timer = b.recover;
      }
    } else if (this.state === 'recover') {
      this.timer -= dt;
      this.faceToward(px, py);
      if (this.timer <= 0) {
        if (dist <= b.fireRange && Math.random() < b.dodgeChance && this.sim.dashCooldown <= 0) {
          const side = Math.random() < 0.5 ? -1 : 1;
          this.startDash((-dy / dist) * side, (dx / dist) * side, s.dashDistance);
        }
        this.state = 'chase';
      }
    }

    this.sim.x = this.x;
    this.sim.y = this.y;
    this.sim.vx = vx;
    this.sim.vy = vy;
    // Draw the bow back over the last stretch of the windup, with the arms raised throughout.
    const winding = this.state === 'windup';
    this.sim.readyTimer = winding ? 0.2 : 0;
    this.sim.fireCooldown = winding ? Math.max(0, this.timer) : 0;
    return hit;
  }

  render(dt: number, width: number): void {
    for (const a of this.arrows.items) {
      if (!a.active) continue;
      toScreen(a.x, a.y, screen);
      toScreen(a.x + a.dirX, a.y + a.dirY, ahead);
      const h = cfg.render.arrowHeight;
      a.sprite
        .setPosition(screen.x, screen.y - h)
        .setRotation(Math.atan2(ahead.y - screen.y, ahead.x - screen.x))
        .setScale(cfg.render.arrowScale)
        .setDepth(screen.y);
      a.glow.setPosition(screen.x, screen.y - h).setScale(cfg.render.arrowScale * 0.3).setAlpha(0.7).setDepth(screen.y - 0.1);
    }
    this.telegraph.clear();
    this.bar.clear();
    if (!this.alive) return;
    this.view.update(dt);
    this.drawTelegraph();

    const w = Math.min(420, width - 40);
    const x = width / 2 - w / 2;
    this.name.setPosition(width / 2, 110);
    this.bar.fillStyle(0x14111c, 0.9).fillRect(x - 2, 114, w + 4, 12);
    this.bar.fillStyle(0xc8c8d8, 1).fillRect(x, 116, w * Math.max(0, this.hp / this.maxHp), 8);
  }

  muzzle() {
    return this.view.muzzle();
  }

  // A thin line along the locked aim: faint while tracking, bright once the shot is committed.
  private drawTelegraph(): void {
    if (!cfg.boss.showTelegraph || this.state !== 'windup') return;
    const g = this.telegraph;
    const m = this.view.muzzle();
    const len = this.snap.range * 0.75;
    toScreen(m.x, m.y, screen);
    const aim = toScreen(m.x + this.sim.aimX * len, m.y + this.sim.aimY * len, ahead);
    const locked = this.timer <= cfg.boss.aimLockTime;
    g.setDepth(screen.y - 5);
    g.lineStyle(locked ? 3 : 1, locked ? 0xff6a6a : 0xd8d8e8, locked ? 0.85 : 0.35);
    g.lineBetween(screen.x, screen.y - cfg.render.arrowHeight, aim.x, aim.y - cfg.render.arrowHeight);
  }

  private startDash(dirX: number, dirY: number, distance: number): void {
    if (distance <= 1) return;
    this.dashDirX = dirX;
    this.dashDirY = dirY;
    this.dashLeft = distance;
    this.sim.dashTime = this.snap.dashDuration;
    this.view.onDashStart();
  }

  private faceToward(px: number, py: number): void {
    const dx = px - this.x;
    const dy = py - this.y;
    const len = Math.hypot(dx, dy);
    if (len > 1e-3) {
      this.sim.aimX = dx / len;
      this.sim.aimY = dy / len;
    }
  }

  // Fires the snapshot's volley along the locked aim, fanned like the player's.
  private fire(): void {
    const m = this.view.muzzle();
    this.view.onFire();
    const count = this.snap.arrows;
    const aim = toScreen(this.sim.aimX, this.sim.aimY);
    const base = Math.atan2(aim.y, aim.x);
    const spread = Phaser.Math.DegToRad(cfg.bow.spreadDeg);
    for (let i = 0; i < count; i++) {
      const angle = base + (i - (count - 1) / 2) * spread;
      const w = toWorld(Math.cos(angle), Math.sin(angle));
      const a = this.arrows.obtain();
      a.active = true;
      a.stretch = Math.hypot(w.x, w.y);
      a.dirX = w.x / a.stretch;
      a.dirY = w.y / a.stretch;
      a.x = m.x;
      a.y = m.y;
      a.traveled = 0;
      a.sprite.setVisible(true);
      a.glow.setVisible(true);
    }
  }

  private updateArrows(dt: number, px: number, py: number, playerSafe: boolean, playerRadius: number, obstacles: readonly Obstacle[]): boolean {
    let hit = false;
    const speed = cfg.bow.arrowSpeed * cfg.boss.arrowSpeedMult;
    for (const a of this.arrows.items) {
      if (!a.active) continue;
      const stepPx = Math.min(speed * dt, this.snap.range - a.traveled);
      const step = stepPx * a.stretch;
      let wall = -1;
      for (const o of obstacles) {
        const t = segmentCircle(a.x, a.y, a.dirX, a.dirY, step, o.x, o.y, o.radius);
        if (t >= 0 && (wall < 0 || t < wall)) wall = t;
      }
      const t = playerSafe ? -1 : segmentCircle(a.x, a.y, a.dirX, a.dirY, step, px, py, playerRadius + cfg.boss.arrowHitRadius);
      if (t >= 0 && (wall < 0 || t <= wall)) {
        hit = true;
        this.release(a);
        continue;
      }
      if (wall >= 0) {
        this.release(a);
        continue;
      }
      a.x += a.dirX * step;
      a.y += a.dirY * step;
      a.traveled += stepPx;
      if (a.traveled >= this.snap.range - 1e-6) this.release(a);
    }
    return hit;
  }

  private release(a: BossArrow): void {
    a.active = false;
    a.sprite.setVisible(false);
    a.glow.setVisible(false);
  }
}
