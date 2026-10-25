import Phaser from 'phaser';
import { Tex } from '../art/placeholders';
import { cfg } from '../config';
import { toScreen } from '../iso';
import { SpatialHash } from '../util/spatialHash';
import { Hittable } from './Arrows';

interface Dummy extends Hittable {
  hp: number;
  respawn: number;
  flash: number;
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
}

const screen = { x: 0, y: 0 };

// Training targets for testing arrows before enemies exist. Spawned from the dev menu.
export class Dummies {
  readonly list: Dummy[] = [];
  private nextId = 1;

  onDestroyed: (x: number, y: number) => void = () => {};

  constructor(private scene: Phaser.Scene) {}

  spawnRing(cx: number, cy: number): void {
    const n = Math.round(cfg.dummy.count);
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2;
      this.spawn(cx + Math.cos(angle) * cfg.dummy.ringRadius, cy + Math.sin(angle) * cfg.dummy.ringRadius);
    }
  }

  spawn(x: number, y: number): void {
    this.list.push({
      id: this.nextId++,
      x,
      y,
      radius: cfg.dummy.radius,
      alive: true,
      hp: cfg.dummy.hp,
      respawn: 0,
      flash: 0,
      sprite: this.scene.add.image(0, 0, Tex.dummy).setOrigin(0.5, 1),
      shadow: this.scene.add.image(0, 0, Tex.shadow),
    });
  }

  clear(): void {
    for (const d of this.list) {
      d.sprite.destroy();
      d.shadow.destroy();
    }
    this.list.length = 0;
  }

  damage(target: Hittable, amount: number): void {
    const d = target as Dummy;
    d.hp -= amount;
    d.flash = cfg.feel.hitFlashTime;
    if (d.hp <= 0) {
      d.alive = false;
      d.respawn = cfg.dummy.respawnTime;
      this.onDestroyed(d.x, d.y);
    }
  }

  get aliveCount(): number {
    return this.list.reduce((n, d) => n + (d.alive ? 1 : 0), 0);
  }

  update(dt: number, hash: SpatialHash<Hittable>): void {
    for (const d of this.list) {
      d.radius = cfg.dummy.radius;
      d.flash -= dt;
      if (!d.alive) {
        d.respawn -= dt;
        if (d.respawn <= 0) {
          d.alive = true;
          d.hp = cfg.dummy.hp;
        }
      }
      if (d.alive) hash.insert(d, d.x, d.y);
    }
  }

  render(): void {
    const px = cfg.render.pixelScale;
    for (const d of this.list) {
      toScreen(d.x, d.y, screen);
      d.sprite.setVisible(d.alive).setPosition(screen.x, screen.y).setScale(px).setDepth(screen.y);
      d.shadow.setVisible(d.alive).setPosition(screen.x, screen.y).setScale(px * 0.9, px * 0.35).setDepth(screen.y - 1000);
      if (d.flash > 0) d.sprite.setTintFill(0xffffff);
      else d.sprite.clearTint();
    }
  }
}
