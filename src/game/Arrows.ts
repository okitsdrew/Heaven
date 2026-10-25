import Phaser from 'phaser';
import { Tex } from '../art/placeholders';
import { cfg } from '../config';
import { toScreen } from '../iso';
import { Pool } from '../util/pool';
import { SpatialHash } from '../util/spatialHash';

export interface Hittable {
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
  traveled: number;
  range: number;
  speed: number;
  damage: number;
  pierce: number;
  hitRadius: number;
  hits: Set<number>;
  sprite: Phaser.GameObjects.Image;
}

const screen = { x: 0, y: 0 };
const ahead = { x: 0, y: 0 };

export class Arrows {
  private pool: Pool<Arrow>;
  private candidates: Hittable[] = [];
  private contacts: { t: number; target: Hittable }[] = [];

  onHit: (target: Hittable, damage: number, arrowX: number, arrowY: number) => void = () => {};

  constructor(scene: Phaser.Scene) {
    this.pool = new Pool(() => ({
      active: false,
      x: 0,
      y: 0,
      dirX: 1,
      dirY: 0,
      traveled: 0,
      range: 0,
      speed: 0,
      damage: 0,
      pierce: 0,
      hitRadius: 0,
      hits: new Set(),
      sprite: scene.add.image(0, 0, Tex.arrow).setVisible(false),
    }));
  }

  get activeCount(): number {
    return this.pool.activeCount;
  }

  // Fires a volley; extra arrows fan out around the aim direction.
  fire(x: number, y: number, dirX: number, dirY: number): void {
    const b = cfg.bow;
    const count = Math.max(1, Math.round(b.arrowsPerShot));
    const base = Math.atan2(dirY, dirX);
    const spread = Phaser.Math.DegToRad(b.spreadDeg);
    for (let i = 0; i < count; i++) {
      const angle = base + (i - (count - 1) / 2) * spread;
      const a = this.pool.obtain();
      a.active = true;
      a.dirX = Math.cos(angle);
      a.dirY = Math.sin(angle);
      a.x = x;
      a.y = y;
      a.traveled = 0;
      a.range = b.arrowRange;
      a.speed = b.arrowSpeed;
      a.damage = b.damage;
      a.pierce = Math.round(b.pierce);
      a.hitRadius = b.arrowHitRadius;
      a.hits.clear();
      a.sprite.setVisible(true).setAlpha(1);
    }
  }

  update(dt: number, targets: SpatialHash<Hittable>, maxTargetRadius: number): void {
    for (const a of this.pool.items) {
      if (!a.active) continue;
      const step = Math.min(a.speed * dt, a.range - a.traveled);
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
      this.contacts.length = 0;
      for (const target of this.candidates) {
        if (!target.alive || a.hits.has(target.id)) continue;
        const t = segmentCircle(a.x, a.y, a.dirX, a.dirY, step, target.x, target.y, target.radius + a.hitRadius);
        if (t >= 0) this.contacts.push({ t, target });
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
      a.x = x1;
      a.y = y1;
      a.traveled += step;
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
        .setScale(cfg.render.arrowScale)
        .setAlpha(Math.min(1, remaining * 6))
        .setDepth(screen.y);
    }
  }

  forEachActive(fn: (x: number, y: number, hitRadius: number) => void): void {
    for (const a of this.pool.items) if (a.active) fn(a.x, a.y, a.hitRadius);
  }

  private release(a: Arrow): void {
    a.active = false;
    a.sprite.setVisible(false);
  }
}

// Distance along the ray (within [0, len]) where it first touches the circle, or -1.
function segmentCircle(
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
