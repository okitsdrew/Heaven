import Phaser from 'phaser';
import { cfg } from '../config';
import { toScreen, toWorld } from '../iso';

const colors = [0x17151d, 0x19161f, 0x1b1822, 0x15131a];
const scorch = 0x110f14;
const dayColors = [0x6f9a4c, 0x76a052, 0x6a944a, 0x7ba656];
const dayPatch = 0x5e8640;

function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Placeholder iso floor drawn around the camera. Deterministic per tile, so revisits look the same.
export class Ground {
  private g: Phaser.GameObjects.Graphics;
  private lastKey = '';
  private day = false;
  private p = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ];

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(-1e9);
  }

  setDay(day: boolean): void {
    this.day = day;
    this.lastKey = '';
  }

  update(cam: Phaser.Cameras.Scene2D.Camera): void {
    const size = cfg.render.tileSize;
    const corners = [
      toWorld(cam.scrollX, cam.scrollY),
      toWorld(cam.scrollX + cam.width, cam.scrollY),
      toWorld(cam.scrollX, cam.scrollY + cam.height),
      toWorld(cam.scrollX + cam.width, cam.scrollY + cam.height),
    ];
    const x0 = Math.floor(Math.min(...corners.map((c) => c.x)) / size) - 1;
    const x1 = Math.floor(Math.max(...corners.map((c) => c.x)) / size) + 1;
    const y0 = Math.floor(Math.min(...corners.map((c) => c.y)) / size) - 1;
    const y1 = Math.floor(Math.max(...corners.map((c) => c.y)) / size) + 1;

    const key = `${x0},${x1},${y0},${y1},${size},${cfg.render.isoScale}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    const g = this.g;
    g.clear();
    for (let tx = x0; tx <= x1; tx++) {
      for (let ty = y0; ty <= y1; ty++) {
        const r = hash(tx, ty);
        const palette = this.day ? dayColors : colors;
        const color = r < 0.06 ? (this.day ? dayPatch : scorch) : palette[Math.floor(r * 1000) % palette.length];
        toScreen(tx * size, ty * size, this.p[0]);
        toScreen((tx + 1) * size, ty * size, this.p[1]);
        toScreen((tx + 1) * size, (ty + 1) * size, this.p[2]);
        toScreen(tx * size, (ty + 1) * size, this.p[3]);
        g.fillStyle(color, 1);
        g.fillPoints(this.p, true);
      }
    }
  }
}
