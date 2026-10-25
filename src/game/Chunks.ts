import Phaser from 'phaser';
import { Tex } from '../art/placeholders';
import { cfg } from '../config';
import { ellipseHalfSize, toScreen, toWorld } from '../iso';
import { Fx } from './Fx';

export interface Obstacle {
  x: number;
  y: number;
  radius: number;
}

interface Item {
  sprite: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image | null;
  sx: number;
  sy: number;
  top: number;
  seed: number;
  flameAcc: number;
}

interface Chunk {
  items: Item[];
  obstacles: Obstacle[];
}

const flameColors = [0xff5a10, 0xff8a28, 0xffb347];
const upright = [Tex.barricade, Tex.siege] as const;

// Seeded per chunk coordinate, so a revisited chunk is rebuilt exactly as it was.
function rng(seed: number, cx: number, cy: number): () => number {
  let s = (Math.imul(cx, 374761393) + Math.imul(cy, 668265263) + Math.imul(seed, 2246822519)) | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Infinite battlefield streamed in chunks around the camera: decor, burning wreckage with light pools,
// and rare obstacles that block the player and enemies.
export class Chunks {
  private chunks = new Map<string, Chunk>();
  private sprites: Phaser.GameObjects.Image[] = [];
  private glows: Phaser.GameObjects.Image[] = [];
  private lastKey = '';
  private time = 0;
  readonly obstacles: Obstacle[] = [];

  constructor(private scene: Phaser.Scene, private fx: Fx) {}

  get loaded(): number {
    return this.chunks.size;
  }

  update(dt: number, cam: Phaser.Cameras.Scene2D.Camera): void {
    const m = cfg.map;
    const key = [m.seed, m.chunkSize, m.decorPerChunk, m.burningChance, m.obstacleChance, m.obstacleMinRadius,
      m.obstacleMaxRadius, m.safeRadius, cfg.render.isoScale, cfg.render.pixelScale].join();
    if (key !== this.lastKey) {
      this.lastKey = key;
      for (const k of [...this.chunks.keys()]) this.unload(k);
    }

    // Keep chunks loaded out to the enemy despawn ring so obstacles exist wherever enemies are.
    const pad = cfg.spawn.despawnMargin;
    const corners = [
      toWorld(cam.scrollX - pad, cam.scrollY - pad),
      toWorld(cam.scrollX + cam.width + pad, cam.scrollY - pad),
      toWorld(cam.scrollX - pad, cam.scrollY + cam.height + pad),
      toWorld(cam.scrollX + cam.width + pad, cam.scrollY + cam.height + pad),
    ];
    const size = m.chunkSize;
    const x0 = Math.floor(Math.min(...corners.map((c) => c.x)) / size);
    const x1 = Math.floor(Math.max(...corners.map((c) => c.x)) / size);
    const y0 = Math.floor(Math.min(...corners.map((c) => c.y)) / size);
    const y1 = Math.floor(Math.max(...corners.map((c) => c.y)) / size);

    let changed = false;
    for (const [k] of this.chunks) {
      const [cx, cy] = k.split(',').map(Number);
      if (cx < x0 - 1 || cx > x1 + 1 || cy < y0 - 1 || cy > y1 + 1) {
        this.unload(k);
        changed = true;
      }
    }
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const k = `${cx},${cy}`;
        if (this.chunks.has(k)) continue;
        this.chunks.set(k, this.generate(cx, cy));
        changed = true;
      }
    }
    if (changed) {
      this.obstacles.length = 0;
      for (const c of this.chunks.values()) this.obstacles.push(...c.obstacles);
    }

    this.time += dt;
    this.animate(dt, cam);
  }

  private generate(cx: number, cy: number): Chunk {
    const m = cfg.map;
    const r = rng(m.seed, cx, cy);
    const size = m.chunkSize;
    const px = cfg.render.pixelScale;
    const chunk: Chunk = { items: [], obstacles: [] };

    const count = Math.round(m.decorPerChunk * (0.5 + r()));
    for (let i = 0; i < count; i++) {
      const x = (cx + r()) * size;
      const y = (cy + r()) * size;
      const burning = r() < m.burningChance;
      const pick = r();
      const tex = burning ? Tex.wreck : pick < 0.4 ? Tex.soldier : upright[Math.floor(pick * 10) % 2];
      const s = toScreen(x, y);
      const flat = tex === Tex.soldier;
      const sprite = this.sprite(tex)
        .setOrigin(0.5, flat ? 0.5 : 0.85)
        .setPosition(s.x, s.y)
        .setScale(px)
        .setFlipX(r() < 0.5)
        // Bodies lie on the ground; everything else sorts with the actors.
        .setDepth(flat ? -1e8 : s.y);
      const top = sprite.displayHeight * 0.85;
      chunk.items.push({ sprite, glow: burning ? this.glow() : null, sx: s.x, sy: s.y, top, seed: r() * 100, flameAcc: 0 });
    }

    if (r() < m.obstacleChance) {
      const radius = m.obstacleMinRadius + r() * Math.max(0, m.obstacleMaxRadius - m.obstacleMinRadius);
      const x = (cx + 0.2 + r() * 0.6) * size;
      const y = (cy + 0.2 + r() * 0.6) * size;
      if (Math.hypot(x, y) > m.safeRadius + radius) {
        chunk.obstacles.push({ x, y, radius });
        const s = toScreen(x, y);
        const width = ellipseHalfSize(radius).x * 2;
        const sprite = this.sprite(Tex.rubble).setOrigin(0.5, 0.8).setPosition(s.x, s.y).setFlipX(r() < 0.5);
        sprite.setScale(width / sprite.width).setDepth(s.y);
        chunk.items.push({ sprite, glow: null, sx: s.x, sy: s.y, top: 0, seed: 0, flameAcc: 0 });
      }
    }
    return chunk;
  }

  // Flickering orange light pools and rising flames on burning wreckage, only where the camera can see.
  private animate(dt: number, cam: Phaser.Cameras.Scene2D.Camera): void {
    const m = cfg.map;
    const half = ellipseHalfSize(m.lightRadius);
    const px = cfg.render.pixelScale;
    for (const c of this.chunks.values()) {
      for (const it of c.items) {
        if (!it.glow) continue;
        const t = this.time + it.seed;
        const n = (Math.sin(t * 7.3) + Math.sin(t * 13.1) * 0.6 + Math.sin(t * 2.1) * 0.4) / 2 * 0.5 + 0.5;
        it.glow
          .setPosition(it.sx, it.sy)
          .setScale((half.x * 2) / 32, (half.y * 2) / 32)
          .setAlpha(m.lightAlpha * (1 - m.lightFlicker * n));

        if (it.sx < cam.scrollX - 50 || it.sx > cam.scrollX + cam.width + 50) continue;
        if (it.sy < cam.scrollY - 50 || it.sy > cam.scrollY + cam.height + 100) continue;
        it.flameAcc += dt * m.flameRate;
        while (it.flameAcc >= 1) {
          it.flameAcc -= 1;
          this.fx.particle({
            x: it.sx + (Math.random() - 0.5) * 10 * px,
            y: it.sy - it.top * 0.4 - Math.random() * 3 * px,
            life: 0.5 + Math.random() * 0.4,
            from: 0.45,
            to: 0.1,
            alpha: 0.85,
            tint: flameColors[Math.floor(Math.random() * flameColors.length)],
            vx: (Math.random() - 0.5) * 15,
            vy: -35 - Math.random() * 35,
            depth: it.sy + 1,
          });
        }
      }
    }
  }

  private sprite(tex: string): Phaser.GameObjects.Image {
    const s = this.sprites.pop() ?? this.scene.add.image(0, 0, tex);
    return s.setTexture(tex).setVisible(true);
  }

  private glow(): Phaser.GameObjects.Image {
    const g =
      this.glows.pop() ??
      this.scene.add.image(0, 0, Tex.glow).setTint(0xff7a28).setBlendMode(Phaser.BlendModes.ADD).setDepth(-6e8);
    return g.setVisible(true);
  }

  private unload(key: string): void {
    const c = this.chunks.get(key);
    if (!c) return;
    for (const it of c.items) {
      this.sprites.push(it.sprite.setVisible(false));
      if (it.glow) this.glows.push(it.glow.setVisible(false));
    }
    this.chunks.delete(key);
  }
}
