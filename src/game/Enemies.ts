import Phaser from 'phaser';
import { enemyFrames, Tex } from '../art/placeholders';
import { cfg } from '../config';
import { level } from '../skills';
import { ellipseHalfSize, toScreen, toWorld } from '../iso';
import { Pool } from '../util/pool';
import { SpatialHash } from '../util/spatialHash';
import { Hittable } from './Arrows';
import type { Fx } from './Fx';
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
  // Seconds of burn and stun left, and the time since the last burn tick.
  burn: number;
  burnTick: number;
  // Poison stacks, seconds left on them, and the time since the last poison tick.
  // Seconds of cold left; cold enemies are slowed.
  cold: number;
  poison: number;
  poisonLeft: number;
  poisonAcc: number;
  stun: number;
  // The husk's leap: 0 walking, 1 crouching on its mark, 2 in the air; the time in that attack, its mark and where it jumped from.
  leap: number;
  leapT: number;
  leapCd: number;
  tx: number;
  ty: number;
  sx: number;
  sy: number;
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
  // Unit direction the player is heading on screen, or zero when standing still.
  heading?: { x: number; y: number };
}

const screen = { x: 0, y: 0 };
const off = { x: 0, y: 0 };

// Spawns per second at a run time: a flat first stage, a flat second stage, then a ramp to the max at rampEnd.
export function spawnRateAt(t: number, maxMult = 1): number {
  const s = cfg.spawn;
  const taunt = level('taunt') >= 1 ? cfg.upgrade.tauntRate : 0;
  if (t <= s.holdTime) return s.startRate + taunt;
  const rampStart = s.holdTime + s.secondHold;
  if (t <= rampStart) return s.secondRate + taunt;
  const f = Phaser.Math.Clamp((t - rampStart) / Math.max(s.rampEnd - rampStart, 1e-3), 0, 1);
  return s.secondRate + taunt + (s.maxRate * maxMult - s.secondRate - taunt) * Math.pow(f, s.rateCurve);
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
  onBurnTick: (x: number, y: number, amount: number) => void = () => {};
  fx: Fx | null = null;
  // Stage 2 multiplies the top spawn rate and enemy HP.
  stageRate = 1;
  stageHp = 1;
  // Fixed fights (the training grounds and stage 2): a flat spawn rate and base HP, whatever the clock says.
  // Stage 2 mixes every kind in, with HP scaled off the base; training sends wraiths only.
  fixed: { rate: number; hp: number; max: number; wraithsOnly: boolean } | null = null;
  // The husk's smash has landed; the scene decides who it hits.
  onSlam: (x: number, y: number, radius: number) => void = () => {};
  private tele!: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.tele = scene.add.graphics().setDepth(-5e7);
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
      burn: 0,
      burnTick: 0,
      cold: 0,
      poison: 0,
      poisonLeft: 0,
      poisonAcc: 0,
      stun: 0,
      leap: 0,
      leapT: 0,
      leapCd: 0,
      tx: 0,
      ty: 0,
      sx: 0,
      sy: 0,
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

  // Husks only come in stage 2.
  private allowed(k: EnemyKind): boolean {
    return k !== 'husk' || (this.fixed !== null && !this.fixed.wraithsOnly);
  }

  // Picks a type by weight among those that have appeared by this run time.
  private pickType(t: number): EnemyKind {
    let total = 0;
    for (const k of enemyKinds) if (this.allowed(k) && t >= cfg[k].appearAt) total += cfg[k].weight;
    let r = Math.random() * total;
    for (const k of enemyKinds) {
      if (!this.allowed(k) || t < cfg[k].appearAt) continue;
      r -= cfg[k].weight;
      if (r <= 0) return k;
    }
    return 'wraith';
  }

  spawn(t: number, px: number, py: number, view: View, type: EnemyKind = this.fixed?.wraithsOnly ? 'wraith' : this.pickType(t)): void {
    if (this.live.length >= (this.fixed?.max ?? cfg.spawn.maxEnemies)) return;
    // A random point on the perimeter of the screen rectangle, pushed just past the edge.
    const w = view.halfW + cfg.spawn.screenMargin;
    const h = view.halfH + cfg.spawn.screenMargin;
    // Points ahead of the player's heading are kept more often than points behind, so walking one way meets more enemies.
    const bias = cfg.spawn.directionBias;
    const hd = view.heading;
    let sx = 0;
    let sy = 0;
    for (let tries = 0; tries < 8; tries++) {
      let r = Math.random() * (w + h) * 2;
      if (r < w * 2) {
        sx = r - w;
        sy = Math.random() < 0.5 ? -h : h;
      } else {
        r -= w * 2;
        sx = Math.random() < 0.5 ? -w : w;
        sy = r - h;
      }
      if (!hd || bias <= 0 || (hd.x === 0 && hd.y === 0)) break;
      const cos = (sx * hd.x + sy * hd.y) / (Math.hypot(sx, sy) || 1);
      if (Math.random() < 1 - bias * (1 - (1 + cos) / 2)) break;
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
    e.hp = this.fixed ? this.fixed.hp * (this.fixed.wraithsOnly ? 1 : c.hpMult) : hpAt(t) * c.hpMult * this.stageHp;
    e.vx = 0;
    e.vy = 0;
    e.kx = 0;
    e.ky = 0;
    e.flash = 0;
    e.phase = Math.random() * Math.PI * 2;
    e.avoid = null;
    e.burn = 0;
    e.burnTick = 0;
    e.cold = 0;
    e.poison = 0;
    e.poisonLeft = 0;
    e.poisonAcc = 0;
    e.stun = 0;
    e.leap = 0;
    e.leapT = 0;
    e.leapCd = 1 + Math.random() * 2;
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

  // Sets an enemy alight; a fresh application restarts the timer.
  ignite(target: Hittable): void {
    const e = target as Enemy;
    if (e.kind !== 'enemy' || !e.alive) return;
    e.burn = cfg.fireWave.burnTime;
  }

  // Chills an enemy; a fresh application restarts the timer.
  chill(target: Hittable): void {
    const e = target as Enemy;
    if (e.kind !== 'enemy' || !e.alive) return;
    e.cold = cfg.iceStorm.coldTime;
  }

  // Adds a poison stack and restarts the timer; stacks are unlimited.
  poison(target: Hittable, stacks = 1): void {
    const e = target as Enemy;
    if (e.kind !== 'enemy' || !e.alive) return;
    e.poison += stacks;
    e.poisonLeft = cfg.lotus.poisonTime;
  }

  stun(target: Hittable, seconds: number): void {
    const e = target as Enemy;
    if (e.kind !== 'enemy' || !e.alive) return;
    e.stun = Math.max(e.stun, seconds);
  }

  knock(target: Hittable, dirX: number, dirY: number, force: number): void {
    const e = target as Enemy;
    if (e.kind !== 'enemy' || !e.alive) return;
    const k = force / cfg[e.type].scale;
    e.kx += dirX * k;
    e.ky += dirY * k;
  }

  // Run-time spawning, steering toward the player, soft separation and obstacle avoidance.
  update(
    dt: number,
    t: number,
    px: number,
    py: number,
    view: View,
    obstacles: readonly Obstacle[],
    spawning: boolean,
    // Everything heads for this point instead of the player while it is set (the Festering Lotus).
    lure: { x: number; y: number } | null = null,
  ): void {
    if (spawning && cfg.spawn.enabled) {
      this.spawnAcc += (this.fixed ? this.fixed.rate : spawnRateAt(t, this.stageRate)) * dt;
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1;
        this.spawn(t, px, py, view);
      }
      if (this.live.length >= (this.fixed?.max ?? cfg.spawn.maxEnemies)) this.spawnAcc = 0;
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
      if (e.burn > 0) this.burnTick(e, dt);
      if (e.poison > 0 && e.alive) this.poisonTick(e, dt);
      if (e.cold > 0) e.cold -= dt;
      if (!e.alive) continue;
      if (e.type === 'husk' && this.huskLeap(e, dt, px, py, lure !== null, obstacles)) {
        e.kx *= kdecay;
        e.ky *= kdecay;
        continue;
      }

      let dx = (lure ? lure.x : px) - e.x;
      let dy = (lure ? lure.y : py) - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      dx /= dist;
      dy /= dist;

      // Steer round obstacles in the way. The first time one blocks the path the enemy picks the side nearer its
      // heading and keeps it until clear, and a close obstacle gets a full sideways push so nothing stalls head-on.
      let blocked: Obstacle | null = null;
      let worst = Infinity;
      for (const o of obstacles) {
        const ox = e.x - o.x;
        const oy = e.y - o.y;
        const od = Math.hypot(ox, oy) || 1;
        const gap = od - o.radius - e.radius;
        if (gap > ec.avoidLookahead || ox * dx + oy * dy > 0.3 * od || gap >= worst) continue;
        worst = gap;
        blocked = o;
      }
      if (blocked) {
        const o = blocked;
        const ox = e.x - o.x;
        const oy = e.y - o.y;
        const od = Math.hypot(ox, oy) || 1;
        const gap = od - o.radius - e.radius;
        // Slide along the obstacle the way that gets nearer the target; only when it is dead ahead does it stick with its first pick.
        const lean = (-oy / od) * dx + (ox / od) * dy;
        if (e.avoid !== o && Math.abs(lean) < 1e-3) e.side = e.id % 2 ? 1 : -1;
        if (Math.abs(lean) > 0.25) e.side = lean > 0 ? 1 : -1;
        e.avoid = o;
        const tx = (-oy / od) * e.side;
        const ty = (ox / od) * e.side;
        const a = Phaser.Math.Clamp(1.4 - gap / Math.max(ec.avoidLookahead, 1e-3), 0.35, 1);
        dx = dx * (1 - a) + tx * a;
        dy = dy * (1 - a) + ty * a;
        const l = Math.hypot(dx, dy) || 1;
        dx /= l;
        dy /= l;
      }
      if (!blocked) e.avoid = null;

      let speed = c.speedMult * cfg.player.moveSpeed * (e.cold > 0 ? 1 - cfg.iceStorm.slow : 1);
      // The iso projection squashes vertical screen travel, so equalise on-screen speed the way the player's is.
      if (ec.uniformScreenSpeed) {
        toScreen(dx, dy, off);
        speed *= (cfg.render.isoScale * Math.SQRT2) / (Math.hypot(off.x, off.y) || 1);
      }
      e.vx += (dx * speed - e.vx) * turn;
      e.vy += (dy * speed - e.vy) * turn;
      e.kx *= kdecay;
      e.ky *= kdecay;
      if (e.stun > 0) {
        e.stun -= dt;
        e.vx = 0;
        e.vy = 0;
      }

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

  // The husk's attack. Returns true while it is crouching or in the air, so it does nothing else.
  private huskLeap(e: Enemy, dt: number, px: number, py: number, lured: boolean, obstacles: readonly Obstacle[]): boolean {
    const h = cfg.husk;
    e.leapCd -= dt;
    if (e.stun > 0 && e.leap > 0) e.leap = 0;
    if (e.leap === 0) {
      if (e.leapCd <= 0 && !lured && e.stun <= 0 && Math.hypot(px - e.x, py - e.y) < h.range) {
        e.leap = 1;
        e.leapT = 0;
        e.tx = px;
        e.ty = py;
      }
      return false;
    }
    e.leapT += dt;
    e.vx = 0;
    e.vy = 0;
    if (e.leap === 1 && e.leapT >= h.windup) {
      e.leap = 2;
      e.sx = e.x;
      e.sy = e.y;
    }
    if (e.leap === 2) {
      const k = (e.leapT - h.windup) / Math.max(h.airTime, 1e-3);
      if (k >= 1) {
        e.x = e.tx;
        e.y = e.ty;
        slideOut(e, obstacles);
        e.leap = 0;
        e.leapCd = h.cooldown;
        this.slam(e);
      } else {
        e.x = e.sx + (e.tx - e.sx) * k;
        e.y = e.sy + (e.ty - e.sy) * k;
      }
    }
    return e.leap > 0;
  }

  // The landing: everything else in the circle is thrown back, and the scene is told so it can check the player.
  private slam(h: Enemy): void {
    const r = cfg.husk.slamRadius;
    for (const e of this.live) {
      if (e === h || !e.alive) continue;
      const dx = e.x - h.x;
      const dy = e.y - h.y;
      const d = Math.hypot(dx, dy);
      if (d > r + e.radius) continue;
      this.knock(e, d > 1e-3 ? dx / d : 1, d > 1e-3 ? dy / d : 0, cfg.husk.slamKnock);
    }
    if (this.fx) {
      toScreen(h.x, h.y, screen);
      this.fx.smoke(screen.x, screen.y - 6, 14, 30);
      this.fx.addShake(cfg.husk.slamShake);
    }
    this.onSlam(h.x, h.y, r);
  }

  private burnTick(e: Enemy, dt: number): void {
    const c = cfg.fireWave;
    e.burn -= dt;
    e.burnTick += dt;
    const interval = Math.max(c.burnTick, 0.05);
    while (e.burnTick >= interval && e.alive) {
      e.burnTick -= interval;
      this.tickDamage(e, c.burnDps * interval);
    }
    if (e.burn <= 0) e.burnTick = 0;
  }

  // Each stack deals its own damage per second until the timer runs out.
  private poisonTick(e: Enemy, dt: number): void {
    const c = cfg.lotus;
    e.poisonLeft -= dt;
    e.poisonAcc += dt;
    const interval = Math.max(c.poisonTick, 0.05);
    while (e.poisonAcc >= interval && e.alive) {
      e.poisonAcc -= interval;
      this.tickDamage(e, e.poison * c.poisonDps * interval);
    }
    if (e.poisonLeft <= 0) {
      e.poison = 0;
      e.poisonAcc = 0;
    }
  }

  private tickDamage(e: Enemy, amount: number): void {
    e.hp -= amount;
    this.onBurnTick(e.x, e.y, amount);
    if (e.hp <= 0) {
      e.alive = false;
      e.sprite.setVisible(false);
      e.shadow.setVisible(false);
      this.onKilled(e.x, e.y, e.type);
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
      if (!e.alive || e.leap === 2) continue;
      const min = r + e.radius * k;
      const dx = e.x - x;
      const dy = e.y - y;
      if (dx * dx + dy * dy < min * min) return true;
    }
    return false;
  }

  render(px: number, dt: number): void {
    const pxs = cfg.render.pixelScale;
    const ec = cfg.enemy;
    const tele = this.tele;
    tele.clear();
    for (const e of this.live) {
      if (!e.alive) continue;
      const c = cfg[e.type];
      toScreen(e.x, e.y, screen);
      let bob = (Math.sin(e.phase) * 0.5 + 0.5) * ec.bobHeight * pxs;
      let squash = 1;
      if (e.type === 'husk' && e.leap > 0) {
        const h = cfg.husk;
        const k = Math.min(1, e.leapT / (h.windup + h.airTime));
        const half = ellipseHalfSize(h.slamRadius);
        toScreen(e.tx, e.ty, off);
        tele.fillStyle(0xff4a20, 0.12 + 0.3 * k).fillEllipse(off.x, off.y, half.x * 2 * k, half.y * 2 * k);
        tele.lineStyle(3, 0xff6a30, 0.9).strokeEllipse(off.x, off.y, half.x * 2, half.y * 2);
        if (e.leap === 1) squash = 1 - 0.18 * Math.min(1, e.leapT / Math.max(h.windup, 1e-3));
        else {
          const air = (e.leapT - h.windup) / Math.max(h.airTime, 1e-3);
          bob = Math.sin(Math.min(1, air) * Math.PI) * h.leapHeight;
        }
      }
      const frame = Math.floor((e.phase / Math.max(ec.bobSpeed, 1e-3)) * ec.hemFlicker) % 2;
      const scale = pxs * c.scale;
      e.sprite
        .setTexture(enemyFrames[e.type][frame])
        .setPosition(screen.x, screen.y - bob)
        .setScale(scale, scale * squash)
        .setFlipX(toScreen(px - e.x, 0).x < 0)
        .setDepth(screen.y);
      e.shadow
        .setPosition(screen.x, screen.y)
        .setScale(scale * 0.9, scale * 0.35)
        .setDepth(screen.y - 1000);
      if (e.flash > 0) e.sprite.setTintFill(0xffffff);
      else if (e.burn > 0) e.sprite.setTint(0xff9a50);
      else if (e.poison > 0) e.sprite.setTint(0x9aff90);
      else if (e.cold > 0) e.sprite.setTint(0x8fdcff);
      else if (e.stun > 0) e.sprite.setTint(0xfff0a0);
      else e.sprite.clearTint();
      if (c.trail > 0 && this.fx && Math.random() < c.trail * dt) {
        this.fx.particle({
          x: screen.x - Math.sign(e.vx || 1) * 3 * scale,
          y: screen.y - (3 + Math.random() * 8) * scale,
          life: 0.3 + Math.random() * 0.15,
          from: 0.5 * scale,
          to: 0.05,
          alpha: 0.7,
          tint: Math.random() < 0.5 ? 0xffd21a : 0xfff2a0,
          depth: screen.y - 1,
        });
      }
      if (e.cold > 0 && this.fx && Math.random() < 0.2) {
        this.fx.particle({
          x: screen.x + (Math.random() - 0.5) * 8 * scale / pxs * 1.5,
          y: screen.y - (4 + Math.random() * 10) * scale,
          life: 0.4 + Math.random() * 0.25,
          from: 0.3,
          to: 0.05,
          alpha: 0.9,
          tint: Math.random() < 0.5 ? 0xe8fbff : 0x8fdcff,
          vy: 10 + Math.random() * 20,
          vx: (Math.random() - 0.5) * 14,
          depth: screen.y + 1,
        });
      }
      if (e.burn > 0 && this.fx && Math.random() < 0.25) {
        this.fx.particle({
          x: screen.x + (Math.random() - 0.5) * 8 * scale / pxs * 1.5,
          y: screen.y - (4 + Math.random() * 10) * scale,
          life: 0.35 + Math.random() * 0.2,
          from: 0.35,
          to: 0.05,
          alpha: 0.9,
          tint: Math.random() < 0.5 ? 0xff6a10 : 0xffc060,
          vy: -30 - Math.random() * 30,
          vx: (Math.random() - 0.5) * 16,
          depth: screen.y + 1,
        });
      }
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
