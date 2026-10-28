import Phaser from 'phaser';
import { cfg } from '../config';

const KEY = 'mistTex';
const W = 256;
const H = 160;

const hash = (x: number, y: number, seed: number) => {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
};

// Smooth value noise, a few octaves deep.
function fbm(x: number, y: number, seed: number): number {
  let sum = 0;
  let amp = 0.55;
  let f = 1;
  for (let o = 0; o < 4; o++) {
    const gx = Math.floor(x * f);
    const gy = Math.floor(y * f);
    const fx = x * f - gx;
    const fy = y * f - gy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = hash(gx, gy, seed + o);
    const b = hash(gx + 1, gy, seed + o);
    const c = hash(gx, gy + 1, seed + o);
    const d = hash(gx + 1, gy + 1, seed + o);
    sum += (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy) * amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum;
}

// A ring of soft cloud that is clear in the middle and thickest at the edges.
function makeTexture(scene: Phaser.Scene, key: string, seed: number): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, W, H)!;
  const ctx = tex.getContext();
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x / W - 0.5) * 2;
      const dy = (y / H - 0.5) * 2;
      const d = Math.hypot(dx, dy * 0.9);
      const t = Math.min(1, Math.max(0, (d - 0.5) / 0.75));
      const mask = t * t * (3 - 2 * t);
      const n = Math.min(1, Math.max(0, (fbm(x / 38, y / 38, seed) - 0.25) * 1.9));
      const a = mask * (0.35 + 0.65 * n);
      const i = (y * W + x) * 4;
      img.data[i] = 168;
      img.data[i + 1] = 158;
      img.data[i + 2] = 196;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  tex.refresh();
}

// We are in someone's mind: the edges of the screen are faintly clouded, and the cloud slowly drifts.
export class Mist {
  private layers: Phaser.GameObjects.Image[] = [];
  private time = 0;

  constructor(scene: Phaser.Scene) {
    makeTexture(scene, KEY + 'A', 11);
    makeTexture(scene, KEY + 'B', 53);
    for (const k of ['A', 'B']) {
      this.layers.push(scene.add.image(0, 0, KEY + k).setScrollFactor(0).setDepth(2.9e6));
    }
  }

  update(dt: number, width: number, height: number): void {
    this.time += dt * cfg.mist.drift;
    const on = cfg.mist.enabled && cfg.mist.alpha > 0;
    this.layers.forEach((im, i) => {
      im.setVisible(on);
      if (!on) return;
      const t = this.time * (i ? -0.5 : 0.4) + i * 3;
      // Oversized, so drifting never uncovers the edge.
      im.setDisplaySize(width * 1.18, height * 1.18)
        .setPosition(width / 2 + Math.sin(t * 0.7) * width * 0.03, height / 2 + Math.cos(t * 0.5) * height * 0.03)
        .setRotation(Math.sin(t * 0.25) * 0.05)
        .setFlipX(i === 1)
        .setAlpha(cfg.mist.alpha * (0.75 + 0.25 * Math.sin(t * 0.9 + i)));
    });
  }
}
