import Phaser from 'phaser';
import { G } from './draw';

const FINGERS = [
  // Base offset on the palm, resting angle (rad), segment lengths, base width and a crooked bend per joint.
  { bx: 58, by: -17, a: -0.08, len: [26, 20, 15], w: 12, kink: [0.08, -0.12, 0.1] },
  { bx: 60, by: -6, a: -0.02, len: [31, 23, 17], w: 12.5, kink: [-0.06, 0.12, -0.1] },
  { bx: 59, by: 5, a: 0.03, len: [27, 21, 15], w: 12, kink: [0.1, -0.1, 0.12] },
  { bx: 55, by: 16, a: 0.1, len: [20, 15, 11], w: 10.5, kink: [-0.08, 0.1, -0.1] },
];
const BEND = [1.25, 1.45, 1.1];

// A gnarled black hand on a long arm that comes out of the dark. The hand's origin is the wrist and its
// fingers point along +x before rotation. Curl runs 0 (open) to 1 (fist) per digit: thumb, index, middle, ring, pinky.
export class Hand {
  readonly g: G;
  x = 0;
  y = 0;
  rot = 0;
  scale = 3;
  flip = 1;
  alpha = 1;
  curl = [0, 0, 0, 0, 0];
  // Where the arm starts, in the dark behind the throne.
  anchorX = 560;
  anchorY = 170;
  private time = 0;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics();
  }

  setCurl(thumb: number, index: number, middle: number, ring: number, pinky: number): void {
    this.curl = [thumb, index, middle, ring, pinky];
  }

  fist(v: number): void {
    this.curl = [v, v, v, v, v];
  }

  // Index finger out, the rest closed.
  point(): void {
    this.curl = [1, 0, 1, 1, 1];
  }

  update(dt: number): void {
    this.time += dt;
    const g = this.g;
    g.clear();
    g.setAlpha(this.alpha);
    g.setVisible(this.alpha > 0.01);
    if (this.alpha <= 0.01) return;
    for (const pass of [0, 1]) {
      const off = pass === 0 ? 0 : 1.6;
      const fill = pass === 0 ? 0x34244e : 0x050308;
      const grow = pass === 0 ? 3.4 : 0;
      this.drawArm(g, off, fill, grow);
      this.drawHand(g, off, fill, grow);
    }
  }

  private drawArm(g: G, off: number, color: number, grow: number): void {
    const s = this.scale;
    const dirX = Math.cos(this.rot);
    const dirY = Math.sin(this.rot);
    const dist = Math.hypot(this.x - this.anchorX, this.y - this.anchorY);
    const cx = this.x - dirX * dist * 0.42;
    const cy = this.y - dirY * dist * 0.42 + dist * 0.12;
    const n = 20;
    const left: Phaser.Math.Vector2[] = [];
    const right: Phaser.Math.Vector2[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const u = 1 - t;
      const px = u * u * this.anchorX + 2 * u * t * cx + t * t * this.x;
      const py = u * u * this.anchorY + 2 * u * t * cy + t * t * this.y;
      const tx = 2 * u * (cx - this.anchorX) + 2 * t * (this.x - cx);
      const ty = 2 * u * (cy - this.anchorY) + 2 * t * (this.y - cy);
      const len = Math.hypot(tx, ty) || 1;
      const nx = -ty / len;
      const ny = tx / len;
      // Thick at the shoulder, thin at the wrist, with knotted joints and a slow writhe.
      const knot = 1 + 0.16 * Math.sin(t * 19 + 1) + 0.1 * Math.sin(t * 7 + this.time * 1.4);
      const w = (s * 11 * (1 - t) + s * 6.4 * t) * knot + grow;
      const wob = Math.sin(t * 9 + this.time * 2.2) * 3 * s * 0.3 * (1 - t);
      left.push(new Phaser.Math.Vector2(px + nx * (w + wob) + off, py + ny * (w + wob) + off));
      right.push(new Phaser.Math.Vector2(px - nx * (w - wob) + off, py - ny * (w - wob) + off));
    }
    g.fillStyle(color, 1);
    g.fillPoints(left.concat(right.reverse()), true);
  }

  private drawHand(g: G, off: number, color: number, grow: number): void {
    g.save();
    g.translateCanvas(this.x + off, this.y + off);
    g.rotateCanvas(this.rot);
    g.scaleCanvas(this.scale, this.scale * this.flip);
    const k = 1 / this.scale;
    g.fillStyle(color, 1);
    const e = (grow * k) / 2;
    g.fillRoundedRect(6 - e, -25 - e, 56 + 2 * e, 50 + 2 * e, 13);
    g.fillEllipse(0, 0, 26 + grow * k, 30 + grow * k);
    FINGERS.forEach((f, i) => this.finger(g, f.bx, f.by, f.a, this.curl[i + 1], f.len, f.w, color, grow * k, f.kink));
    this.finger(g, 16, 22, 0.95, this.curl[0], [20, 16, 12], 12.5, color, grow * k, [0.1, -0.12, 0.1]);
    if (grow === 0) {
      // Creases and knuckle ridges, barely lighter than the shadow.
      g.lineStyle(1.4, 0x1c1228, 1);
      g.beginPath();
      g.arc(30, 4, 17, 0.4, 2.6, false);
      g.moveTo(22, -22);
      g.lineTo(26, 4);
      g.moveTo(46, -22);
      g.lineTo(40, 20);
      g.strokePath();
    }
    g.restore();
  }

  private finger(g: G, bx: number, by: number, a0: number, curl: number, len: number[], w0: number, color: number, grow: number, kink: number[]): void {
    let x = bx;
    let y = by;
    let a = a0;
    // Curling goes toward -y so a fist closes over whatever the palm holds.
    for (let i = 0; i < 3; i++) {
      a += kink[i] * (1 - curl) - curl * BEND[i];
      const w = w0 * (1 - i * 0.2) + grow;
      const x1 = x + Math.cos(a) * len[i];
      const y1 = y + Math.sin(a) * len[i];
      g.lineStyle(w, color, 1);
      g.lineBetween(x, y, x1, y1);
      g.fillStyle(color, 1);
      g.fillCircle(x1, y1, w * 0.58 + (i < 2 ? 1.2 : 0));
      x = x1;
      y = y1;
    }
    // A long cracked claw.
    g.fillTriangle(x + Math.cos(a - 1.5) * w0 * 0.34, y + Math.sin(a - 1.5) * w0 * 0.34, x + Math.cos(a + 1.5) * w0 * 0.34, y + Math.sin(a + 1.5) * w0 * 0.34, x + Math.cos(a - 0.2) * 9, y + Math.sin(a - 0.2) * 9);
  }

  setVisible(v: boolean): void {
    this.g.setVisible(v);
  }

  destroy(): void {
    this.g.destroy();
  }
}
