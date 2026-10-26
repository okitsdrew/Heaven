import Phaser from 'phaser';
import { cfg } from '../config';
import { toScreen, Vec2 } from '../iso';
import { stats } from '../skills';
import { Hittable } from './Arrows';
import { Fx } from './Fx';
import { Player } from './Player';
import { PlayerView } from './PlayerView';

// Bright like the player's Sword Slash; its own swing is the red version.
const BOSS_TONE = 0xb070ff;
const RED = 0xff3b3b;
const RED_LIGHT = 0xff9a8a;

type State = 'chase' | 'telegraph' | 'strike' | 'recover';

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
  private bar: Phaser.GameObjects.Graphics;
  private name: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, private fx: Fx, private targets: () => readonly Hittable[]) {
    this.view = new PlayerView(scene, this.sim, fx);
    this.view.setTone(BOSS_TONE);
    this.view.setVisible(false);
    this.telegraph = scene.add.graphics();
    this.waveGfx = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
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
    this.radius = b.radius;
    this.maxHp = this.hp = b.hp;
    this.alive = true;
    this.state = 'chase';
    this.timer = 0;
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
    this.waves.length = 0;
    this.view.setVisible(false);
    this.name.setVisible(false);
    this.telegraph.clear();
    this.waveGfx.clear();
    this.bar.clear();
  }

  damage(amount: number): void {
    if (!this.alive) return;
    this.hp -= amount;
    this.view.flash();
    if (this.hp > 0) return;
    // Waves already in flight keep going after it dies.
    this.alive = false;
    this.view.setVisible(false);
    this.name.setVisible(false);
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

    let vx = 0;
    let vy = 0;
    if (this.state === 'chase') {
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
    this.sim.armsUpTimer = this.state === 'telegraph' || this.state === 'strike' ? 0.1 : 0;
    return hit;
  }

  render(dt: number, width: number): void {
    this.telegraph.clear();
    this.waveGfx.clear();
    this.bar.clear();
    if (this.effect) this.drawEffect(this.effect);
    for (const w of this.waves) this.drawWave(w);
    if (!this.alive) return;
    this.view.update(dt);
    if (this.state === 'telegraph' && cfg.boss.showTelegraph) this.drawTelegraph();
    this.drawSword();

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

export const slayDamage = KILL;
