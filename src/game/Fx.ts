import Phaser from 'phaser';
import { Tex } from '../art/placeholders';
import { cfg } from '../config';
import { Pool } from '../util/pool';

interface Fading {
  active: boolean;
  age: number;
  life: number;
  vx: number;
  vy: number;
  startScale: number;
  endScale: number;
  startAlpha: number;
  obj: Phaser.GameObjects.Image | Phaser.GameObjects.Text;
}

// Short-lived visual effects. Positions here are already in screen space.
export class Fx {
  private images: Pool<Fading>;
  private texts: Pool<Fading>;
  private shake = 0;
  readonly shakeOffset = { x: 0, y: 0 };

  constructor(scene: Phaser.Scene) {
    const fading = (obj: Fading['obj']): Fading => ({
      active: false,
      age: 0,
      life: 1,
      vx: 0,
      vy: 0,
      startScale: 1,
      endScale: 1,
      startAlpha: 1,
      obj,
    });
    this.images = new Pool(() => fading(scene.add.image(0, 0, Tex.smoke).setVisible(false)));
    this.texts = new Pool(() =>
      fading(
        scene.add
          .text(0, 0, '', {
            fontFamily: 'monospace',
            fontSize: '14px',
            fontStyle: 'bold',
            color: '#f2d7a6',
            stroke: '#1a1020',
            strokeThickness: 3,
          })
          .setOrigin(0.5, 1)
          .setVisible(false),
      ),
    );
  }

  afterimage(texture: string, x: number, y: number, flipX: boolean, scale: number, depth: number): void {
    const f = this.spawn(this.images, cfg.dash.afterimageFade, scale, scale, 0.5);
    const img = f.obj as Phaser.GameObjects.Image;
    img.setTexture(texture).setOrigin(0.5, 1).setFlipX(flipX).setTintFill(0x9a8fc4);
    img.setPosition(x, y).setDepth(depth - 0.5).setBlendMode(Phaser.BlendModes.ADD);
  }

  smoke(x: number, y: number, count: number, spread: number): void {
    const px = cfg.render.pixelScale;
    for (let i = 0; i < count; i++) {
      const f = this.spawn(this.images, 0.45 + Math.random() * 0.35, px * 0.8, px * (1.6 + Math.random()), 0.8);
      const img = f.obj as Phaser.GameObjects.Image;
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * spread;
      img.setTexture(Tex.smoke).setOrigin(0.5).setFlipX(false).clearTint().setBlendMode(Phaser.BlendModes.NORMAL);
      img.setPosition(x + Math.cos(angle) * r, y + Math.sin(angle) * r * 0.5).setDepth(y + 1);
      f.vx = Math.cos(angle) * 30;
      f.vy = Math.sin(angle) * 15 - 25;
    }
  }

  damageNumber(x: number, y: number, amount: number): void {
    if (!cfg.feel.damageNumbers) return;
    const f = this.spawn(this.texts, 0.55, 1, 1, 1);
    const text = f.obj as Phaser.GameObjects.Text;
    text.setText(String(Math.round(amount))).setPosition(x + (Math.random() - 0.5) * 10, y).setDepth(1e6);
    f.vy = -60;
  }

  addShake(amount: number): void {
    this.shake = Math.max(this.shake, amount);
  }

  update(dt: number): void {
    for (const pool of [this.images, this.texts]) {
      for (const f of pool.items) {
        if (!f.active) continue;
        f.age += dt;
        const t = f.age / f.life;
        if (t >= 1) {
          f.active = false;
          f.obj.setVisible(false);
          continue;
        }
        f.obj.x += f.vx * dt;
        f.obj.y += f.vy * dt;
        f.obj.setScale(f.startScale + (f.endScale - f.startScale) * t);
        f.obj.setAlpha(f.startAlpha * (1 - t));
      }
    }
    this.shake *= Math.exp(-cfg.camera.shakeDecay * dt);
    if (this.shake < 0.05) this.shake = 0;
    this.shakeOffset.x = (Math.random() * 2 - 1) * this.shake;
    this.shakeOffset.y = (Math.random() * 2 - 1) * this.shake;
  }

  private spawn(pool: Pool<Fading>, life: number, startScale: number, endScale: number, alpha: number): Fading {
    const f = pool.obtain();
    f.active = true;
    f.age = 0;
    f.life = life;
    f.vx = 0;
    f.vy = 0;
    f.startScale = startScale;
    f.endScale = endScale;
    f.startAlpha = alpha;
    f.obj.setVisible(true).setAlpha(alpha).setScale(startScale);
    return f;
  }
}
