import Phaser from 'phaser';
import { cfg } from '../config';
import { toScreen, Vec2 } from '../iso';
import { stats } from '../skills';
import { Hittable } from './Arrows';
import { Fx } from './Fx';
import { Player } from './Player';
import { PlayerView } from './PlayerView';

type State = 'chase' | 'telegraph' | 'strike' | 'recover';

// What the boss copies from the player when it spawns.
interface Snapshot {
  moveSpeed: number;
  teleportDistance: number;
}

interface Effect {
  swing: number;
  ox: number;
  oy: number;
  base: number;
  age: number;
}

const GREY = 0xb8b8c8;
const EFFECT_TIME = 0.25;

// A grey copy of the player whose only attack is Sword Slash: cone, cone, slam, each telegraphed first.
// It teleports close, winds up, then swings. Any swing that catches the player kills; contact is harmless.
// The simulation is flat world space; the view reuses PlayerView on a stand-in Player.
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
  private swing = 0;
  private teleportGap = 0;
  private snap!: Snapshot;
  private effect: Effect | null = null;
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
    this.swing = 0;
    this.teleportGap = 0;
    this.effect = null;
    this.snap = { moveSpeed: stats.moveSpeed(), teleportDistance: cfg.teleport.distance };
    Object.assign(this.sim, { x: this.x, y: this.y, vx: 0, vy: 0, armsUpTimer: 0 });
    this.view.setVisible(true);
    this.name.setVisible(true);
    this.faceToward(px, py);
  }

  clear(): void {
    this.alive = false;
    this.effect = null;
    this.view.setVisible(false);
    this.name.setVisible(false);
    this.telegraph.clear();
    this.bar.clear();
  }

  damage(amount: number): void {
    if (!this.alive) return;
    this.hp -= amount;
    this.view.flash();
    if (this.hp > 0) return;
    this.clear();
    this.onKilled(this.x, this.y);
  }

  // Returns true if a swing caught the player this frame.
  update(dt: number, px: number, py: number, playerSafe: boolean, playerRadius: number): boolean {
    if (this.effect) {
      this.effect.age += dt;
      if (this.effect.age >= EFFECT_TIME) this.effect = null;
    }
    if (!this.alive) return false;
    const b = cfg.boss;
    const dx = px - this.x;
    const dy = py - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    this.teleportGap = Math.max(0, this.teleportGap - dt);

    let vx = 0;
    let vy = 0;
    let hit = false;
    if (this.state === 'chase') {
      this.faceToward(px, py);
      if (dist <= b.closeDistance) {
        this.state = 'telegraph';
        this.swing = 0;
        this.timer = b.windup;
      } else if (this.teleportGap <= 0) {
        // Blink toward the player, stopping inside close range rather than overshooting.
        this.teleportBy(dx / dist, dy / dist, Math.min(this.snap.teleportDistance, dist - b.closeDistance * 0.5));
      } else {
        const speed = this.snap.moveSpeed * b.walkSpeedMult;
        vx = (dx / dist) * speed;
        vy = (dy / dist) * speed;
        this.x += vx * dt;
        this.y += vy * dt;
      }
    } else if (this.state === 'telegraph') {
      this.timer -= dt;
      // Aim follows the player until just before the swing, then locks so a dash away dodges it.
      if (this.timer > b.aimLockTime) this.faceToward(px, py);
      if (this.timer <= 0) {
        hit = !playerSafe && this.strike(px, py, playerRadius);
        this.state = 'strike';
        this.timer = cfg.swordSlash.slashTime;
      }
    } else if (this.state === 'strike') {
      this.timer -= dt;
      if (this.timer <= 0) {
        if (this.swing < 2) {
          this.swing++;
          this.state = 'telegraph';
          this.timer = b.swingTelegraph;
        } else {
          this.state = 'recover';
          this.timer = b.recover;
        }
      }
    } else {
      this.timer -= dt;
      this.faceToward(px, py);
      if (this.timer <= 0) {
        // Now and then blink sideways instead of standing to be shot.
        if (Math.random() < b.dodgeChance) {
          const side = Math.random() < 0.5 ? -1 : 1;
          this.teleportBy((-dy / dist) * side, (dx / dist) * side, this.snap.teleportDistance);
        }
        this.state = 'chase';
      }
    }

    this.sim.x = this.x;
    this.sim.y = this.y;
    this.sim.vx = vx;
    this.sim.vy = vy;
    // Arms flap while swinging, like the player's.
    this.sim.armsUpTimer = this.state === 'telegraph' || this.state === 'strike' ? 0.1 : 0;
    return hit;
  }

  render(dt: number, width: number): void {
    this.telegraph.clear();
    this.bar.clear();
    if (this.effect) this.drawEffect(this.effect);
    if (!this.alive) return;
    this.view.update(dt);
    if (this.state === 'telegraph' && cfg.boss.showTelegraph) this.drawTelegraph();
    this.drawSword();

    const w = Math.min(420, width - 40);
    const x = width / 2 - w / 2;
    this.name.setPosition(width / 2, 110);
    this.bar.fillStyle(0x14111c, 0.9).fillRect(x - 2, 114, w + 4, 12);
    this.bar.fillStyle(0xc8c8d8, 1).fillRect(x, 116, w * Math.max(0, this.hp / this.maxHp), 8);
  }

  // Applies the current swing to the player. Cone for swings 0 and 1, a long rectangle for the slam.
  private strike(px: number, py: number, r: number): boolean {
    const c = cfg.swordSlash;
    const ax = this.sim.aimX;
    const ay = this.sim.aimY;
    this.effect = { swing: this.swing, ox: this.x, oy: this.y, base: Math.atan2(ay, ax), age: 0 };
    const dx = px - this.x;
    const dy = py - this.y;
    if (this.swing < 2) {
      const d = Math.hypot(dx, dy);
      if (d > c.coneRange + r) return false;
      const pad = d > r ? Math.asin(r / d) : Math.PI;
      const angle = d > 1e-3 ? Math.acos(Phaser.Math.Clamp((dx * ax + dy * ay) / d, -1, 1)) : 0;
      return angle <= Phaser.Math.DegToRad(c.coneAngle) / 2 + pad;
    }
    const along = dx * ax + dy * ay;
    const side = -dx * ay + dy * ax;
    return Math.abs(side) <= c.slamWidth / 2 + r && along >= -r && along <= c.slamLength + r;
  }

  private area(swing: number, ox: number, oy: number, base: number): Vec2[] {
    const c = cfg.swordSlash;
    if (swing < 2) {
      const half = Phaser.Math.DegToRad(c.coneAngle) / 2;
      const poly: Vec2[] = [toScreen(ox, oy, { x: 0, y: 0 })];
      for (let i = 0; i <= 16; i++) {
        const a = base - half + (i / 16) * half * 2;
        poly.push(toScreen(ox + Math.cos(a) * c.coneRange, oy + Math.sin(a) * c.coneRange, { x: 0, y: 0 }));
      }
      return poly;
    }
    const dirX = Math.cos(base);
    const dirY = Math.sin(base);
    const hw = c.slamWidth / 2;
    const corner = (side: number, along: number) =>
      toScreen(ox + dirX * along - dirY * hw * side, oy + dirY * along + dirX * hw * side, { x: 0, y: 0 });
    return [corner(-1, 0), corner(1, 0), corner(1, c.slamLength), corner(-1, c.slamLength)];
  }

  // The area about to be hit: faint while the aim still tracks, bright red once it is locked.
  private drawTelegraph(): void {
    const g = this.telegraph;
    const locked = this.timer <= cfg.boss.aimLockTime;
    const base = Math.atan2(this.sim.aimY, this.sim.aimX);
    const poly = this.area(this.swing, this.x, this.y, base);
    g.setDepth(-5e8);
    g.fillStyle(locked ? 0xff6a6a : 0xd8d8e8, locked ? 0.3 : 0.1);
    g.fillPoints(poly, true);
    g.lineStyle(2, locked ? 0xff6a6a : 0xd8d8e8, locked ? 0.9 : 0.4);
    g.strokePoints(poly, true);
  }

  private drawEffect(e: Effect): void {
    const fade = 1 - e.age / EFFECT_TIME;
    const g = this.telegraph;
    g.setDepth(9e5);
    g.fillStyle(0xf0f0ff, 0.55 * fade);
    g.fillPoints(this.area(e.swing, e.ox, e.oy, e.base), true);
  }

  // A plain grey blade held out along the aim while swinging.
  private drawSword(): void {
    if (this.state !== 'telegraph' && this.state !== 'strike') return;
    const px = cfg.render.pixelScale;
    const reach = this.state === 'strike' ? 34 : 24;
    const a = toScreen(this.x, this.y, { x: 0, y: 0 });
    const b = toScreen(this.x + this.sim.aimX, this.y + this.sim.aimY, { x: 0, y: 0 });
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    const y0 = a.y - 12 * px;
    const g = this.telegraph;
    g.lineStyle(3 * px, GREY, 1);
    g.lineBetween(a.x + ux * 6 * px, y0 + uy * 6 * px * 0.5, a.x + ux * reach * px, y0 + uy * reach * px * 0.5);
  }

  private teleportBy(dirX: number, dirY: number, distance: number): void {
    if (distance <= 1) return;
    const x0 = this.x;
    const y0 = this.y;
    this.x += dirX * distance;
    this.y += dirY * distance;
    this.view.onTeleport(x0, y0, this.x, this.y, 0);
    this.view.onTeleportArrive(this.x, this.y);
    this.teleportGap = cfg.boss.teleportGap;
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
}
