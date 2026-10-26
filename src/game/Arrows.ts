import Phaser from 'phaser';
import { Tex } from '../art/placeholders';
import { cfg } from '../config';
import { toScreen, toWorld } from '../iso';
import { Pool } from '../util/pool';
import { SpatialHash } from '../util/spatialHash';
import { stats } from '../skills';
import { Fx } from './Fx';
import type { Obstacle } from './Chunks';

export interface Hittable {
  kind: 'dummy' | 'enemy' | 'boss';
  id: number;
  x: number;
  y: number;
  radius: number;
  alive: boolean;
}

interface Arrow {
  active: boolean;
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  stretch: number;
  traveled: number;
  range: number;
  speed: number;
  damage: number;
  pierce: number;
  hitRadius: number;
  size: number;
  hits: Set<number>;
  sprite: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  trail: number;
}

const screen = { x: 0, y: 0 };
const ahead = { x: 0, y: 0 };

export class Arrows {
  private pool: Pool<Arrow>;
  private candidates: Hittable[] = [];
  private contacts: { t: number; target: Hittable }[] = [];

  onBlocked: (x: number, y: number) => void = () => {};
  onHit: (target: Hittable, damage: number, arrowX: number, arrowY: number) => void = () => {};

  constructor(scene: Phaser.Scene, private fx: Fx) {
    this.pool = new Pool(() => ({
      active: false,
      x: 0,
      y: 0,
      dirX: 1,
      dirY: 0,
      stretch: 1,
      traveled: 0,
      range: 0,
      speed: 0,
      damage: 0,
      pierce: 0,
      hitRadius: 0,
      size: 1,
      hits: new Set(),
      sprite: scene.add.image(0, 0, Tex.arrow).setVisible(false),
      glow: scene.add
        .image(0, 0, Tex.glow)
        .setTint(0x8a3fe0)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setVisible(false),
      trail: 0,
    }));
  }

  get activeCount(): number {
    return this.pool.activeCount;
  }

  // Fires a volley; extra arrows fan out around the aim direction. Speed, range and the fan are measured
  // on screen, so every arrow visibly travels the same distance whichever way the iso projection skews it.
  fire(x: number, y: number, dirX: number, dirY: number): void {
    const b = cfg.bow;
    const count = stats.arrows();
    const aim = toScreen(dirX, dirY);
    const base = Math.atan2(aim.y, aim.x);
    const spread = Phaser.Math.DegToRad(b.spreadDeg);
    for (let i = 0; i < count; i++) {
      const angle = base + (i - (count - 1) / 2) * spread;
      const a = this.pool.obtain();
      a.active = true;
      const w = toWorld(Math.cos(angle), Math.sin(angle));
      a.stretch = Math.hypot(w.x, w.y);
      a.dirX = w.x / a.stretch;
      a.dirY = w.y / a.stretch;
      a.x = x;
      a.y = y;
      a.traveled = 0;
      a.range = stats.range();
      a.speed = b.arrowSpeed;
      a.damage = stats.damage();
      a.pierce = stats.pierce();
      a.size = stats.arrowSize();
      a.hitRadius = b.arrowHitRadius * a.size;
      a.hits.clear();
      a.trail = 0;
      a.sprite.setVisible(true).setAlpha(1);
      a.glow.setVisible(true);
    }
  }

  update(dt: number, targets: SpatialHash<Hittable>, maxTargetRadius: number, obstacles: readonly Obstacle[]): void {
    for (const a of this.pool.items) {
      if (!a.active) continue;
      const stepPx = Math.min(a.speed * dt, a.range - a.traveled);
      const step = stepPx * a.stretch;
      const x1 = a.x + a.dirX * step;
      const y1 = a.y + a.dirY * step;

      // Swept test along this frame's segment so fast arrows can't tunnel.
      const pad = a.hitRadius + maxTargetRadius;
      targets.query(
        Math.min(a.x, x1) - pad,
        Math.min(a.y, y1) - pad,
        Math.max(a.x, x1) + pad,
        Math.max(a.y, y1) + pad,
        this.candidates,
      );
      // Terrain stops the arrow where it first touches an obstacle; anything behind that point is safe.
      let wall = -1;
      for (const o of obstacles) {
        if (o.x + o.radius < Math.min(a.x, x1) || o.x - o.radius > Math.max(a.x, x1)) continue;
        if (o.y + o.radius < Math.min(a.y, y1) || o.y - o.radius > Math.max(a.y, y1)) continue;
        const t = segmentCircle(a.x, a.y, a.dirX, a.dirY, step, o.x, o.y, o.radius);
        if (t >= 0 && (wall < 0 || t < wall)) wall = t;
      }
      this.contacts.length = 0;
      for (const target of this.candidates) {
        if (!target.alive || a.hits.has(target.id)) continue;
        const t = segmentCircle(a.x, a.y, a.dirX, a.dirY, step, target.x, target.y, target.radius + a.hitRadius);
        if (t >= 0 && (wall < 0 || t <= wall)) this.contacts.push({ t, target });
      }
      this.contacts.sort((p, q) => p.t - q.t);

      let stopAt = -1;
      for (const { t, target } of this.contacts) {
        a.hits.add(target.id);
        this.onHit(target, a.damage, a.x + a.dirX * t, a.y + a.dirY * t);
        if (a.pierce > 0) {
          a.pierce--;
        } else {
          stopAt = t;
          break;
        }
      }

      if (stopAt >= 0) {
        this.release(a);
        continue;
      }
      if (wall >= 0) {
        this.onBlocked(a.x + a.dirX * wall, a.y + a.dirY * wall);
        this.release(a);
        continue;
      }
      a.x = x1;
      a.y = y1;
      a.traveled += stepPx;
      if (a.traveled >= a.range - 1e-6) this.release(a);
    }
  }

  render(): void {
    const height = cfg.render.arrowHeight;
    for (const a of this.pool.items) {
      if (!a.active) continue;
      toScreen(a.x, a.y, screen);
      toScreen(a.x + a.dirX, a.y + a.dirY, ahead);
      const remaining = 1 - a.traveled / a.range;
      a.sprite
        .setPosition(screen.x, screen.y - height)
        .setRotation(Math.atan2(ahead.y - screen.y, ahead.x - screen.x))
        .setScale(cfg.render.arrowScale * a.size)
        .setAlpha(Math.min(1, remaining * 6))
        .setDepth(screen.y);
      a.glow
        .setPosition(screen.x, screen.y - height)
        .setScale(cfg.render.arrowScale * 0.3 * a.size)
        .setAlpha(Math.min(1, remaining * 6) * 0.7)
        .setDepth(screen.y - 0.1);

      // Shadowy wisps shed behind the bolt.
      while (a.traveled - a.trail >= 14) {
        a.trail += 14;
        this.fx.particle({
          x: screen.x - (ahead.x - screen.x) * 12 + (Math.random() - 0.5) * 6,
          y: screen.y - height - (ahead.y - screen.y) * 12 + (Math.random() - 0.5) * 6,
          life: 0.25 + Math.random() * 0.2,
          from: 0.3,
          to: 0.05,
          alpha: 0.8,
          tint: Math.random() < 0.5 ? 0x7a2fd0 : 0x3a0f6a,
          vx: (Math.random() - 0.5) * 20,
          vy: (Math.random() - 0.5) * 20,
          depth: screen.y - 0.2,
        });
      }
    }
  }

  forEachActive(fn: (x: number, y: number, hitRadius: number) => void): void {
    for (const a of this.pool.items) if (a.active) fn(a.x, a.y, a.hitRadius);
  }

  private release(a: Arrow): void {
    a.active = false;
    a.sprite.setVisible(false);
    a.glow.setVisible(false);
  }
}

// Distance along the ray (within [0, len]) where it first touches the circle, or -1.
export function segmentCircle(
  x: number,
  y: number,
  dx: number,
  dy: number,
  len: number,
  cx: number,
  cy: number,
  r: number,
): number {
  const ox = x - cx;
  const oy = y - cy;
  const c = ox * ox + oy * oy - r * r;
  if (c <= 0) return 0;
  const b = ox * dx + oy * dy;
  if (b > 0) return -1;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t <= len ? t : -1;
}
