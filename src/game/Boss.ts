import Phaser from 'phaser';
import { cfg } from '../config';
import { toScreen, Vec2 } from '../iso';
import { stats } from '../skills';
import { Hittable } from './Arrows';
import { Fx } from './Fx';
import { Player } from './Player';
import { drawHaze } from './haze';
import { PlayerView } from './PlayerView';

// A dark purple flickering shape with a red aura; its own swing is the red version of the Sword Slash.
const BOSS_TONE = 0x5a2a9a;
const RED = 0xff3b3b;
const RED_LIGHT = 0xff9a8a;

type State = 'spawn' | 'chase' | 'dash' | 'telegraph' | 'strike' | 'recover';

// What the boss copies from the player when it spawns.
interface Snapshot {
  moveSpeed: number;
  teleportDistance: number;
}

interface Effect {
  ox: number;
  oy: number;
  base: number;
  age: number;
}

interface Wave {
  ox: number;
  oy: number;
  dirX: number;
  dirY: number;
  dist: number;
  hits: Set<Hittable>;
  ember: number;
}

const EFFECT_TIME = 0.25;
const KILL = 1e9;
const screen = { x: 0, y: 0 };

// A bright purple copy of the player whose only attack is a red Sword Slash swing, telegraphed first.
// It teleports close, winds up, then swings; the swing also sends a wave that travels on like the Fire Wave.
// Anything the swing or wave touches dies at once, the player included. Contact is harmless.
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
  // The swing and its wave kill whatever else they touch.
  onSlay: (target: Hittable) => void = () => {};

  private sim = new Player();
  private view: PlayerView;
  private state: State = 'chase';
  private timer = 0;
  private teleportGap = 0;
  private snap!: Snapshot;
  private effect: Effect | null = null;
  private waves: Wave[] = [];
  private telegraph: Phaser.GameObjects.Graphics;
  private waveGfx: Phaser.GameObjects.Graphics;
  private aura: Phaser.GameObjects.Graphics;
  private portal: Phaser.GameObjects.Graphics;
  private age = 0;
  private time = 0;
  private bar: Phaser.GameObjects.Graphics;
  private name: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, private fx: Fx, private targets: () => readonly Hittable[]) {
    this.view = new PlayerView(scene, this.sim, fx);
    this.view.setTone(BOSS_TONE, 1.2);
    this.view.setVisible(false);
    this.telegraph = scene.add.graphics();
    this.waveGfx = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.aura = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.portal = scene.add.graphics();
    this.bar = scene.add.graphics().setScrollFactor(0).setDepth(5e6);
    this.name = scene.add
      .text(0, 0, 'THE SHADE OF YOU', { fontFamily: 'monospace', fontSize: '13px', color: '#d9b8ff' })
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
    this.radius = b.radius * b.size;
    this.view.sizeMult = b.size;
    this.view.flicker = b.flicker;
    this.view.rise = 0;
    this.age = 0;
    this.maxHp = this.hp = b.hp;
    this.alive = true;
    this.state = 'spawn';
    this.timer = 0;
    this.teleportGap = 0;
    this.effect = null;
    this.snap = { moveSpeed: stats.moveSpeed(), teleportDistance: cfg.teleport.distance };
    Object.assign(this.sim, { x: this.x, y: this.y, vx: 0, vy: 0, armsUpTimer: 0 });
    this.view.setVisible(true);
    this.name.setVisible(true);
    this.faceToward(px, py);
  }

  // Can be hit once it is out of the portal.
  get targetable(): boolean {
    return this.alive && this.state !== 'spawn';
  }

  clear(): void {
    this.alive = false;
    this.effect = null;
    this.waves.length = 0;
    this.view.setVisible(false);
    this.name.setVisible(false);
    this.telegraph.clear();
    this.waveGfx.clear();
    this.aura.clear();
    this.portal.clear();
    this.bar.clear();
  }

  damage(amount: number): void {
    if (!this.targetable) return;
    this.hp -= amount;
    this.view.flash();
    if (this.hp > 0) return;
    // Waves already in flight keep going after it dies.
    this.alive = false;
    this.view.setVisible(false);
    this.name.setVisible(false);
    this.aura.clear();
    this.bar.clear();
    this.onKilled(this.x, this.y);
  }

  // Returns true if the swing or a wave caught the player this frame.
  update(dt: number, px: number, py: number, playerSafe: boolean, playerRadius: number): boolean {
    if (this.effect) {
      this.effect.age += dt;
      if (this.effect.age >= EFFECT_TIME) this.effect = null;
    }
    let hit = this.updateWaves(dt, px, py, playerSafe, playerRadius);
    if (!this.alive) return hit;
    const b = cfg.boss;
    const dx = px - this.x;
    const dy = py - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    this.teleportGap = Math.max(0, this.teleportGap - dt);
    this.age += dt;

    let vx = 0;
    let vy = 0;
    if (this.state === 'spawn') {
      // A portal opens, then he rises out of it with his hands raised.
      const t = (this.age - b.portalTime) / Math.max(b.riseTime, 1e-3);
      this.view.rise = Math.min(1, Math.max(0, t));
      this.view.rise = this.view.rise * this.view.rise * (3 - 2 * this.view.rise);
      this.faceToward(px, py);
      if (t >= 1) {
        this.view.rise = 1;
        this.state = 'chase';
      }
    } else if (this.state === 'dash') {
      // The player slipped out of range mid-attack: close the gap at dash speed, then wind up again.
      const speed = cfg.dash.distance / cfg.dash.duration;
      const step = Math.min(speed * dt, Math.max(0, dist - b.closeDistance * 0.8));
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
      this.faceToward(px, py);
      this.sim.dashTime = cfg.dash.duration;
      if (dist - step <= b.closeDistance * 0.8 + 1e-3) {
        this.sim.dashTime = 0;
        this.state = 'telegraph';
        this.timer = Math.max(this.timer, b.aimLockTime + 0.15);
      }
    } else if (this.state === 'chase') {
      this.faceToward(px, py);
      if (dist <= b.closeDistance) {
        this.state = 'telegraph';
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
    } else if (this.state === 'telegraph' && dist > cfg.swordSlash.coneRange) {
      this.state = 'dash';
      this.view.onDashStart();
    } else if (this.state === 'telegraph') {
      this.timer -= dt;
      // Aim follows the player until just before the swing, then locks so a dash away dodges it.
      if (this.timer > b.aimLockTime) this.faceToward(px, py);
      if (this.timer <= 0) {
        hit = this.strike(px, py, playerRadius, playerSafe) || hit;
        this.state = 'strike';
        this.timer = cfg.swordSlash.slashTime;
      }
    } else if (this.state === 'strike') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = 'recover';
        this.timer = b.recover;
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
    this.sim.armsUpTimer = this.state === 'telegraph' || this.state === 'strike' || this.state === 'spawn' ? 0.1 : 0;
    return hit;
  }

  render(dt: number, width: number): void {
    this.telegraph.clear();
    this.waveGfx.clear();
    this.aura.clear();
    this.portal.clear();
    this.bar.clear();
    this.time += dt;
    if (this.alive) this.drawPortal();
    if (this.effect) this.drawEffect(this.effect);
    for (const w of this.waves) this.drawWave(w);
    if (!this.alive) return;
    this.view.update(dt);
    this.drawAura();
    if (this.state === 'telegraph' && cfg.boss.showTelegraph) this.drawTelegraph();
    if (this.state !== 'spawn') this.drawSword();

    const w = Math.min(420, width - 40);
    const x = width / 2 - w / 2;
    this.name.setPosition(width / 2, 110);
    this.bar.fillStyle(0x14111c, 0.9).fillRect(x - 2, 114, w + 4, 12);
    this.bar.fillStyle(0xb070ff, 1).fillRect(x, 116, w * Math.max(0, this.hp / this.maxHp), 8);
  }

  // The cone swing: kills whatever is inside it, then launches the wave along the same aim.
  private strike(px: number, py: number, r: number, playerSafe: boolean): boolean {
    const c = cfg.swordSlash;
    const ax = this.sim.aimX;
    const ay = this.sim.aimY;
    this.effect = { ox: this.x, oy: this.y, base: Math.atan2(ay, ax), age: 0 };
    const half = Phaser.Math.DegToRad(c.coneAngle) / 2;
    const inCone = (tx: number, ty: number, tr: number) => {
      const dx = tx - this.x;
      const dy = ty - this.y;
      const d = Math.hypot(dx, dy);
      if (d > c.coneRange + tr) return false;
      const pad = d > tr ? Math.asin(tr / d) : Math.PI;
      const angle = d > 1e-3 ? Math.acos(Phaser.Math.Clamp((dx * ax + dy * ay) / d, -1, 1)) : 0;
      return angle <= half + pad;
    };
    for (const t of this.targets()) if (t.alive && t.kind !== 'boss' && inCone(t.x, t.y, t.radius)) this.onSlay(t);
    this.waves.push({ ox: this.x, oy: this.y, dirX: ax, dirY: ay, dist: 0, hits: new Set(), ember: 0 });
    this.fx.addShake(c.slamShake * 0.5);
    return !playerSafe && inCone(px, py, r);
  }

  // Waves travel until they pass the despawn ring around the player, killing each thing once.
  private updateWaves(dt: number, px: number, py: number, playerSafe: boolean, playerRadius: number): boolean {
    const b = cfg.boss;
    let hit = false;
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      const prev = w.dist;
      w.dist += b.waveSpeed * dt;
      const lo = prev - b.waveLength / 2;
      const hi = w.dist + b.waveLength / 2;
      const inside = (tx: number, ty: number, tr: number) => {
        const rx = tx - w.ox;
        const ry = ty - w.oy;
        const along = rx * w.dirX + ry * w.dirY;
        const side = -rx * w.dirY + ry * w.dirX;
        return Math.abs(side) <= b.waveWidth / 2 + tr && along >= lo - tr && along <= hi + tr;
      };
      for (const t of this.targets()) {
        if (!t.alive || t.kind === 'boss' || w.hits.has(t) || !inside(t.x, t.y, t.radius)) continue;
        w.hits.add(t);
        this.onSlay(t);
      }
      if (!playerSafe && inside(px, py, playerRadius)) hit = true;

      const cx = w.ox + w.dirX * w.dist;
      const cy = w.oy + w.dirY * w.dist;
      if (Math.hypot(cx - px, cy - py) > cfg.world.despawnRadius) {
        this.waves.splice(i, 1);
        continue;
      }
      w.ember += dt * 120;
      while (w.ember >= 1) {
        w.ember -= 1;
        const side = (Math.random() - 0.5) * b.waveWidth;
        const along = (Math.random() - 0.5) * b.waveLength;
        toScreen(cx - w.dirY * side + w.dirX * along, cy + w.dirX * side + w.dirY * along, screen);
        this.fx.particle({
          x: screen.x,
          y: screen.y - 6 * cfg.render.pixelScale,
          life: 0.3 + Math.random() * 0.3,
          from: 0.35,
          to: 0.05,
          alpha: 0.9,
          tint: Math.random() < 0.5 ? RED : RED_LIGHT,
          vx: (Math.random() - 0.5) * 40,
          vy: -30 - Math.random() * 60,
          depth: screen.y + 2,
        });
      }
    }
    return hit;
  }

  private cone(ox: number, oy: number, base: number): Vec2[] {
    const c = cfg.swordSlash;
    const half = Phaser.Math.DegToRad(c.coneAngle) / 2;
    const poly: Vec2[] = [toScreen(ox, oy, { x: 0, y: 0 })];
    for (let i = 0; i <= 16; i++) {
      const a = base - half + (i / 16) * half * 2;
      poly.push(toScreen(ox + Math.cos(a) * c.coneRange, oy + Math.sin(a) * c.coneRange, { x: 0, y: 0 }));
    }
    return poly;
  }

  // The area about to be hit: faint while the aim still tracks, bright red once it is locked.
  private drawTelegraph(): void {
    const g = this.telegraph;
    const locked = this.timer <= cfg.boss.aimLockTime;
    const poly = this.cone(this.x, this.y, Math.atan2(this.sim.aimY, this.sim.aimX));
    g.setDepth(-5e8);
    g.fillStyle(locked ? RED : RED_LIGHT, locked ? 0.3 : 0.1);
    g.fillPoints(poly, true);
    g.lineStyle(2, locked ? RED : RED_LIGHT, locked ? 0.9 : 0.4);
    g.strokePoints(poly, true);
  }

  private drawEffect(e: Effect): void {
    const g = this.telegraph;
    g.setDepth(9e5);
    g.fillStyle(RED, 0.6 * (1 - e.age / EFFECT_TIME));
    g.fillPoints(this.cone(e.ox, e.oy, e.base), true);
  }

  private drawWave(w: Wave): void {
    const b = cfg.boss;
    const g = this.waveGfx;
    g.setDepth(9e5);
    const cx = w.ox + w.dirX * w.dist;
    const cy = w.oy + w.dirY * w.dist;
    const hw = b.waveWidth / 2;
    const hl = b.waveLength / 2;
    const corner = (side: number, along: number) =>
      toScreen(cx + w.dirX * along - w.dirY * hw * side, cy + w.dirY * along + w.dirX * hw * side, { x: 0, y: 0 });
    const poly = [corner(-1, -hl), corner(1, -hl), corner(1, hl), corner(-1, hl)];
    g.fillStyle(RED, 0.45);
    g.fillPoints(poly, true);
    g.lineStyle(3, RED_LIGHT, 0.9);
    g.strokePoints(poly, true);
  }

  // A wavy red glow around him, like the fairies' but red.
  private drawAura(): void {
    const b = cfg.boss;
    const px = cfg.render.pixelScale * b.size;
    toScreen(this.x, this.y, screen);
    const grow = this.state === 'spawn' ? this.view.rise : 1;
    const pulse = 0.85 + 0.15 * Math.sin(this.time * 9);
    this.aura.setDepth(screen.y - 0.1);
    drawHaze(this.aura, screen.x, screen.y - 9 * px, b.auraSize * b.size * grow, b.auraWave, this.time, 3, RED, b.auraAlpha * pulse);
  }

  // The purple portal in the ground: it opens, holds while he rises, then closes.
  private drawPortal(): void {
    const b = cfg.boss;
    const total = b.portalTime + b.riseTime + b.closeTime;
    if (this.age >= total) return;
    const open = Math.min(1, this.age / Math.max(b.portalTime, 1e-3));
    const closing = this.age > b.portalTime + b.riseTime ? 1 - (this.age - b.portalTime - b.riseTime) / Math.max(b.closeTime, 1e-3) : 1;
    const k = open * open * (3 - 2 * open) * Math.max(0, closing);
    const rx = b.portalRadius * b.size * k;
    const ry = rx * 0.5;
    toScreen(this.x, this.y, screen);
    const g = this.portal;
    g.setDepth(screen.y - 1001);
    g.fillStyle(0x07000d, 0.95).fillEllipse(screen.x, screen.y, rx * 2, ry * 2);
    for (let i = 0; i < 3; i++) {
      const f = 1 - i * 0.28;
      g.lineStyle(3 - i, i === 0 ? 0xb070ff : 0x7a2fd0, 0.9 - i * 0.2);
      g.strokeEllipse(screen.x, screen.y, rx * 2 * f, ry * 2 * f);
    }
    // Swirling arcs and sparks rising out of it.
    const arcs = this.waveGfx;
    arcs.setDepth(screen.y - 1000);
    for (let i = 0; i < 6; i++) {
      const a = this.time * 3 + (i / 6) * Math.PI * 2;
      arcs.lineStyle(2, 0xa060ff, 0.7 * k);
      arcs.lineBetween(screen.x + Math.cos(a) * rx * 0.3, screen.y + Math.sin(a) * ry * 0.3, screen.x + Math.cos(a + 0.7) * rx * 0.9, screen.y + Math.sin(a + 0.7) * ry * 0.9);
    }
    if (Math.random() < 40 * k * 0.016) {
      const a = Math.random() * Math.PI * 2;
      this.fx.particle({
        x: screen.x + Math.cos(a) * rx * 0.8,
        y: screen.y + Math.sin(a) * ry * 0.8,
        life: 0.5 + Math.random() * 0.4,
        from: 0.3,
        to: 0.05,
        alpha: 0.9,
        tint: Math.random() < 0.5 ? 0xb070ff : 0x6a20c0,
        vx: (Math.random() - 0.5) * 20,
        vy: -50 - Math.random() * 60,
        depth: screen.y + 3,
      });
    }
  }

  // A red blade held out along the aim while swinging.
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
    g.lineStyle(3 * px, RED, 1);
    g.lineBetween(a.x + ux * 6 * px, y0 + uy * 6 * px * 0.5, a.x + ux * reach * px, y0 + uy * reach * px * 0.5);
  }

  private teleportBy(dirX: number, dirY: number, distance: number): void {
    if (distance <= 1) return;
    const x0 = this.x;
    const y0 = this.y;
    this.x += dirX * distance;
    this.y += dirY * distance;
    this.view.onTeleport(x0, y0, this.x, this.y, 0, cfg.boss.teleportLineWidth);
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

export const slayDamage = KILL;
