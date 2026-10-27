import Phaser from 'phaser';
import { Tex } from '../art/placeholders';
import { G } from './draw';

const V = (x: number, y: number) => new Phaser.Math.Vector2(x, y);

// The pair of eyes in the dark of the throne. They shut as thin slits until they open, then follow the player.
export class Eyes {
  private g: G;
  private glow: Phaser.GameObjects.Image[];
  open = 0;
  wide = 0;
  // Extra look offset (-1..1) added on top of following the target, used for glancing up.
  glance = { x: 0, y: 0 };
  private look = { x: 0, y: 0 };
  private time = 0;
  private blinkIn = 5;
  private blinkT = -1;
  readonly sep = 92;

  constructor(scene: Phaser.Scene, public x: number, public y: number, depth: number) {
    this.g = scene.add.graphics().setDepth(depth);
    this.glow = [0, 1].map(() =>
      scene.add.image(0, 0, Tex.glow).setTint(0xffa820).setBlendMode(Phaser.BlendModes.ADD).setDepth(depth - 0.1),
    );
  }

  update(dt: number, targetX: number, targetY: number, following: boolean): void {
    this.time += dt;
    // A slow blink every three seconds or so, once the eyes are open.
    this.blinkIn -= dt;
    if (this.blinkIn <= 0 && this.open > 0.5) {
      this.blinkT = 0;
      this.blinkIn = 5.2 + Math.random() * 1.6;
    }
    let blink = 0;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const k = this.blinkT / 0.28;
      if (k >= 1) this.blinkT = -1;
      else blink = Math.sin(Math.PI * k);
    }
    const g = this.g;
    g.clear();
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const len = Math.hypot(dx, dy) || 1;
    const want = following ? { x: (dx / len) * Math.min(1, len / 240), y: (dy / len) * Math.min(1, len / 240) } : { x: 0, y: 0 };
    const rate = 1 - Math.exp(-7 * dt);
    this.look.x += (want.x + this.glance.x - this.look.x) * rate;
    this.look.y += (want.y + this.glance.y - this.look.y) * rate;
    const o = Phaser.Math.Clamp(this.open, 0, 1);
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const cx = this.x + side * this.sep / 2;
      const tilt = side * 0.2;
      const lid = o * (1 + this.wide * 0.8) * (1 - 0.92 * blink);
      const hw = 30 * (1 + this.wide * 0.15);
      const hu = 16 * lid;
      const hl = 14 * lid;
      this.glow[i].setPosition(cx, this.y).setScale(1.7 + this.wide, 1 + 0.5 * o).setAlpha(0.7 * o);
      g.save();
      g.translateCanvas(cx, this.y);
      g.rotateCanvas(tilt);
      if (o < 0.04) {
        g.lineStyle(3, 0x6a4a1a, 0.35 + 0.1 * Math.sin(this.time * 2));
        g.beginPath();
        g.moveTo(-hw, 0);
        g.lineTo(0, 3);
        g.lineTo(hw, 0);
        g.strokePath();
      } else {
        const pts: Phaser.Math.Vector2[] = [];
        const n = 14;
        for (let k = 0; k <= n; k++) {
          const t = k / n;
          pts.push(V(-hw + 2 * hw * t, -hu * Math.sin(Math.PI * t) ** 0.8));
        }
        for (let k = n; k >= 0; k--) {
          const t = k / n;
          pts.push(V(-hw + 2 * hw * t, hl * Math.sin(Math.PI * t) ** 0.9));
        }
        g.fillStyle(0xffd070, 1);
        g.fillPoints(pts, true);
        g.fillStyle(0xff9a1c, 0.55);
        g.fillEllipse(0, 0, hw * 1.7, (hu + hl) * 0.8);
        // Pupil: a vertical slit that wanders toward whatever it is watching.
        // The iris always sits inside the lids: it is sized and kept to the open height, never past it.
        const inner = Math.min(hu, hl) * 0.9;
        const ih = Math.min(2 * inner, 22);
        const px = this.look.x * 10;
        const py = Phaser.Math.Clamp(this.look.y * 6, -(inner - ih / 2), inner - ih / 2);
        g.fillStyle(0xd05a08, 1);
        g.fillEllipse(px, py, 20, ih);
        g.fillStyle(0x080303, 1);
        g.fillEllipse(px, py, 6.5, ih);
        g.fillStyle(0xffffff, 0.8);
        g.fillCircle(px - 4, py - 4, 1.8);
        g.lineStyle(3, 0x1a0a04, 1);
        g.strokePoints(pts, true);
      }
      g.restore();
    }
  }

  setVisible(v: boolean): void {
    this.g.setVisible(v);
    for (const i of this.glow) i.setVisible(v);
  }
}
