import Phaser from 'phaser';
import { enemyFrames, Tex } from '../art/placeholders';
import { cfg } from '../config';
import { toScreen, toWorld } from '../iso';
import { Pool } from '../util/pool';
import { SpatialHash } from '../util/spatialHash';
import { Hittable } from './Arrows';
import { Obstacle } from './Chunks';

export const enemyKinds = ['wraith', 'shade', 'husk'] as const;
export type EnemyKind = (typeof enemyKinds)[number];

interface Enemy extends Hittable {
  active: boolean;
  type: EnemyKind;
  hp: number;
  vx: number;
  vy: number;
  kx: number;
  ky: number;
  flash: number;
  phase: number;
  // Which way round the current obstacle this enemy committed to, so it doesn't dither head-on.
  avoid: Obstacle | null;
  side: number;
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
}

// The spawn and despawn rings are rectangles around the player's screen position, so they hug the view
// on any window size.
export interface View {
  halfW: number;
  halfH: number;
}

const screen = { x: 0, y: 0 };
const off = { x: 0, y: 0 };

// Spawns per second at a run time: flat for the first stretch, then ramping to the max at rampEnd.
export function spawnRateAt(t: number): number {
  const s = cfg.spawn;
  if (t <= s.holdTime) return s.startRate;
  const f = Phaser.Math.Clamp((t - s.holdTime) / Math.max(s.rampEnd - s.holdTime, 1e-3), 0, 1);
  return s.startRate + (s.maxRate - s.startRate) * Math.pow(f, s.rateCurve);
}

// Base enemy HP at a run time. A high curve keeps it gentle early with a steep tail.
export function hpAt(t: number): number {
  const s = cfg.spawn;
  const f = Phaser.Math.Clamp(t / Math.max(s.rampEnd, 1e-3), 0, 1);
  return s.hpStart + (s.hpMax - s.hpStart) * Math.pow(f, s.hpCurve);
}

export class Enemies {
  private pool: Pool<Enemy>;
  private hash = new SpatialHash<Enemy>(64);
  private near: Enemy[] = [];
  private spawnAcc = 0;
  private nextId = 1;
  private live: Enemy[] = [];

  onKilled: (x: number, y: number, type: EnemyKind) => void = () => {};

  constructor(scene: Phaser.Scene) {
    this.pool = new Pool(() => ({
      kind: 'enemy',
      active: false,
      alive: false,
      id: 0,
      type: 'wraith',
      x: 0,
      y: 0,
      radius: 1,
      hp: 0,
      vx: 0,
      vy: 0,
      kx: 0,
      ky: 0,
      flash: 0,
      phase: 0,
      avoid: null,
      side: 1,
      sprite: scene.add.image(0, 0, enemyFrames.wraith[0]).setOrigin(0.5, 1).setVisible(false),
      shadow: scene.add.image(0, 0, Tex.shadow).setVisible(false),
    }));
  }

  get count(): number {
    return this.live.length;
  }

  get list(): readonly Hittable[] {
    return this.live;
  }

  get maxRadius(): number {
    return Math.max(...enemyKinds.map((k) => cfg[k].radius));
  }

  clear(): void {
    for (const e of this.live) this.release(e);
    this.live.length = 0;
    this.spawnAcc = 0;
  }

  // Picks a type by weight among those that have appeared by this run time.
  private pickType(t: number): EnemyKind {
    let total = 0;
    for (const k of enemyKinds) if (t >= cfg[k].appearAt) total += cfg[k].weight;
    let r = Math.random() * total;
    for (const k of enemyKinds) {
      if (t < cfg[k].appearAt) continue;
      r -= cfg[k].weight;
      if (r <= 0) return k;
    }
    return 'wraith';
  }

  spawn(t: number, px: number, py: number, view: View, type = this.pickType(t)): void {
    if (this.live.length >= cfg.spawn.maxEnemies) return;
    // A random point on the perimeter of the screen rectangle, pushed just past the edge.
    const w = view.halfW + cfg.spawn.screenMargin;
    const h = view.halfH + cfg.spawn.screenMargin;
    let r = Math.random() * (w + h) * 2;
    let sx: number;
    let sy: number;
    if (r < w * 2) {
      sx = r - w;
      sy = Math.random() < 0.5 ? -h : h;
    } else {
      r -= w * 2;
      sx = Math.random() < 0.5 ? -w : w;
      sy = r - h;
    }
    toWorld(sx, sy, off);

    const e = this.pool.obtain();
    const c = cfg[type];
    e.active = true;
    e.alive = true;
    e.id = this.nextId++;
    e.type = type;
    e.x = px + off.x;
    e.y = py + off.y;
    e.radius = c.radius;
    e.hp = hpAt(t) * c.hpMult;
    e.vx = 0;
    e.vy = 0;
    e.kx = 0;
    e.ky = 0;
    e.flash = 0;
    e.phase = Math.random() * Math.PI * 2;
    e.avoid = null;
    e.sprite.setTexture(enemyFrames[type][0]).setVisible(true);
    e.shadow.setVisible(true);
    this.live.push(e);
  }

  damage(target: Hittable, amount: number, fromX: number, fromY: number): void {
    const e = target as Enemy;
    if (!e.alive) return;
    e.hp -= amount;
    e.flash = cfg.feel.hitFlashTime;
    const dx = e.x - fromX;
    const dy = e.y - fromY;
    const d = Math.hypot(dx, dy) || 1;
    // Big enemies get shoved less.
    const k = cfg.enemy.knockback / cfg[e.type].scale;
    e.kx += (dx / d) * k;
    e.ky += (dy / d) * k;
    if (e.hp <= 0) {
      e.alive = false;
      e.sprite.setVisible(false);
      e.shadow.setVisible(false);
      this.onKilled(e.x, e.y, e.type);
    }
  }

  // Run-time spawning, steering toward the player, soft separation and obstacle avoidance.
  update(
    dt: number,
    t: number,
    px: number,
    py: number,
    view: View,
    obstacles: readonly Obstacle[],
    slowAt: (x: number, y: number, r: number) => number,
    spawning: boolean,
  ): void {
    if (spawning && cfg.spawn.enabled) {
      this.spawnAcc += spawnRateAt(t) * dt;
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1;
        this.spawn(t, px, py, view);
      }
      if (this.live.length >= cfg.spawn.maxEnemies) this.spawnAcc = 0;
    }

    // Drop the dead and anything that wandered outside the despawn ring (no drops for those).
    const dw = view.halfW + cfg.spawn.despawnMargin;
    const dh = view.halfH + cfg.spawn.despawnMargin;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const e = this.live[i];
      toScreen(e.x - px, e.y - py, off);
      if (!e.alive || Math.abs(off.x) > dw || Math.abs(off.y) > dh) {
        this.release(e);
        this.live[i] = this.live[this.live.length - 1];
        this.live.pop();
      }
    }

    const ec = cfg.enemy;
    this.hash.clear();
    for (const e of this.live) this.hash.insert(e, e.x, e.y);
    const pad = this.maxRadius;
    const turn = 1 - Math.exp(-ec.turnRate * dt);
    const kdecay = Math.exp(-ec.knockbackDecay * dt);
    const sepK = ec.separation * Math.min(1, ec.separationRate * dt);

    for (const e of this.live) {
      const c = cfg[e.type];
      e.radius = c.radius;
      e.flash -= dt;
      e.phase += dt * ec.bobSpeed;

      let dx = px - e.x;
      let dy = py - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      dx /= dist;
      dy /= dist;

      // Steer round obstacles in the way. The first time one blocks the path the enemy picks the side nearer its
      // heading and keeps it until clear, and a close obstacle gets a full sideways push so nothing stalls head-on.
      let blocked: Obstacle | null = null;
      for (const o of obstacles) {
        const ox = e.x - o.x;
        const oy = e.y - o.y;
        const od = Math.hypot(ox, oy) || 1;
        const gap = od - o.radius - e.radius;
        if (gap > ec.avoidLookahead || ox * dx + oy * dy > 0.3 * od) continue;
        blocked = o;
        if (e.avoid !== o) {
          const cross = -ox * dy + oy * dx;
          e.side = Math.abs(cross) < 1e-3 ? (e.id % 2 ? 1 : -1) : cross > 0 ? 1 : -1;
          e.avoid = o;
        }
        const tx = (-oy / od) * e.side;
        const ty = (ox / od) * e.side;
        const a = Phaser.Math.Clamp(1.4 - gap / Math.max(ec.avoidLookahead, 1e-3), 0.35, 1);
        dx = dx * (1 - a) + tx * a;
        dy = dy * (1 - a) + ty * a;
        const l = Math.hypot(dx, dy) || 1;
        dx /= l;
        dy /= l;
        break;
      }
      if (!blocked) e.avoid = null;

      const speed = c.speedMult * cfg.player.moveSpeed * slowAt(e.x, e.y, e.radius);
      e.vx += (dx * speed - e.vx) * turn;
      e.vy += (dy * speed - e.vy) * turn;
      e.kx *= kdecay;
      e.ky *= kdecay;

      // Soft push away from overlapping neighbours.
      let sx = 0;
      let sy = 0;
      if (sepK > 0) {
        this.hash.query(e.x - e.radius - pad, e.y - e.radius - pad, e.x + e.radius + pad, e.y + e.radius + pad, this.near);
        for (const n of this.near) {
          if (n === e) continue;
          const nx = e.x - n.x;
          const ny = e.y - n.y;
          const min = e.radius + n.radius;
          const d2 = nx * nx + ny * ny;
          if (d2 >= min * min) continue;
          const d = Math.sqrt(d2);
          if (d < 1e-3) {
            sx += (Math.random() - 0.5) * min;
            sy += (Math.random() - 0.5) * min;
            continue;
          }
          const push = (min - d) / d;
          sx += nx * push;
          sy += ny * push;
        }
      }

      e.x += (e.vx + e.kx) * dt + sx * sepK;
      e.y += (e.vy + e.ky) * dt + sy * sepK;
      slideOut(e, obstacles);
    }
  }

  // Inserts live enemies into the shared hit-test hash.
  insertInto(hash: SpatialHash<Hittable>): void {
    for (const e of this.live) if (e.alive) hash.insert(e, e.x, e.y);
  }

  // True if any live enemy overlaps a circle (the player's forgiving hitbox).
  touching(x: number, y: number, r: number): boolean {
    const k = cfg.enemy.contactScale;
    for (const e of this.live) {
      if (!e.alive) continue;
      const min = r + e.radius * k;
      const dx = e.x - x;
      const dy = e.y - y;
      if (dx * dx + dy * dy < min * min) return true;
    }
    return false;
  }

  render(px: number): void {
    const pxs = cfg.render.pixelScale;
    const ec = cfg.enemy;
    for (const e of this.live) {
      if (!e.alive) continue;
      const c = cfg[e.type];
      toScreen(e.x, e.y, screen);
      const bob = (Math.sin(e.phase) * 0.5 + 0.5) * ec.bobHeight * pxs;
      const frame = Math.floor((e.phase / Math.max(ec.bobSpeed, 1e-3)) * ec.hemFlicker) % 2;
      const scale = pxs * c.scale;
      e.sprite
        .setTexture(enemyFrames[e.type][frame])
        .setPosition(screen.x, screen.y - bob)
        .setScale(scale)
        .setFlipX(toScreen(px - e.x, 0).x < 0)
        .setDepth(screen.y);
      e.shadow
        .setPosition(screen.x, screen.y)
        .setScale(scale * 0.9, scale * 0.35)
        .setDepth(screen.y - 1000);
      if (e.flash > 0) e.sprite.setTintFill(0xffffff);
      else e.sprite.clearTint();
    }
  }

  forEach(fn: (x: number, y: number, r: number) => void): void {
    for (const e of this.live) fn(e.x, e.y, e.radius);
  }

  private release(e: Enemy): void {
    e.active = false;
    e.alive = false;
    e.sprite.setVisible(false);
    e.shadow.setVisible(false);
  }
}

// Hard collision: circles never sink into obstacles.
export function pushOut(c: { x: number; y: number; radius: number }, obstacles: readonly Obstacle[]): void {
  for (const o of obstacles) {
    const dx = c.x - o.x;
    const dy = c.y - o.y;
    const min = o.radius + c.radius;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min * min) continue;
    const d = Math.sqrt(d2);
    if (d < 1e-3) {
      c.x += min;
      continue;
    }
    c.x = o.x + (dx / d) * min;
    c.y = o.y + (dy / d) * min;
  }
}

// Like pushOut, but also strips the velocity driving the enemy into the obstacle so it slides instead of sticking.
function slideOut(e: Enemy, obstacles: readonly Obstacle[]): void {
  for (const o of obstacles) {
    const dx = e.x - o.x;
    const dy = e.y - o.y;
    const min = o.radius + e.radius;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min * min) continue;
    const d = Math.sqrt(d2) || 1e-3;
    const nx = dx / d;
    const ny = dy / d;
    e.x = o.x + nx * min;
    e.y = o.y + ny * min;
    const into = e.vx * nx + e.vy * ny;
    if (into < 0) {
      e.vx -= into * nx;
      e.vy -= into * ny;
    }
    const kInto = e.kx * nx + e.ky * ny;
    if (kInto < 0) {
      e.kx -= kInto * nx;
      e.ky -= kInto * ny;
    }
  }
}
