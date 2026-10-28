import Phaser from 'phaser';
import { Tex } from '../art/placeholders';
import { cfg } from '../config';
import { ellipseHalfSize, toScreen, toWorld, Vec2 } from '../iso';
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
  // Stage 2's road: ruins along the way to the Mind's Eye, then bones from there to the Resting Ground.
  private course: { eye: Vec2; cave: Vec2 } | null = null;

  setCourse(course: { eye: Vec2; cave: Vec2 } | null): void {
    this.course = course;
    this.lastKey = '';
  }

  constructor(private scene: Phaser.Scene, private fx: Fx) {}

  get loaded(): number {
    return this.chunks.size;
  }

  update(dt: number, cam: Phaser.Cameras.Scene2D.Camera): void {
    const m = cfg.map;
    const key = [m.seed, m.chunkSize, m.decorPerChunk, m.burningChance, m.obstacleChance, m.obstacleMinRadius,
      m.obstacleMaxRadius, m.safeRadius, cfg.render.isoScale, cfg.render.pixelScale, this.course ? 1 : 0].join();
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
    if (this.course) this.structures(chunk, cx, cy, r);
    return chunk;
  }

  // Stage 2 scenery: along the first leg, broken walls and shells of buildings; along the second, giant bones.
  private structures(chunk: Chunk, cx: number, cy: number, r: () => number): void {
    const { eye, cave } = this.course!;
    const size = cfg.map.chunkSize;
    const mx = (cx + 0.5) * size;
    const my = (cy + 0.5) * size;
    const near = (p: Vec2) => Math.hypot(mx - p.x, my - p.y);
    if (Math.hypot(mx, my) < 1400 || near(eye) < 1700 || near(cave) < 1700) return;
    // Ruins cover the whole map; once within 20000 of the Resting Ground, bones are mixed in among them.
    const boneZone = near(cave) < 20000;
    const px = cfg.render.pixelScale;
    const at = () => ({ x: (cx + 0.1 + r() * 0.8) * size, y: (cy + 0.1 + r() * 0.8) * size });
    // A screen-space offset turned into a world one, so walls run flat across the screen.
    const flat = (dx: number, dy: number) => toWorld(dx, dy);
    const put = (tex: string, x: number, y: number, scale: number, block: number, origin = 0.85, ground = false) => {
      const s = toScreen(x, y);
      const sprite = this.sprite(tex).setOrigin(0.5, origin).setPosition(s.x, s.y).setScale(px * scale).setFlipX(r() < 0.5);
      sprite.setDepth(ground ? -1e8 : s.y);
      chunk.items.push({ sprite, glow: null, sx: s.x, sy: s.y, top: 0, seed: 0, flameAcc: 0 });
      if (block > 0) chunk.obstacles.push({ x, y, radius: block });
    };
    const wall = (x: number, y: number, pieces: number, gapAt = -1) => {
      for (let i = 0; i < pieces; i++) {
        if (i === gapAt) continue;
        const o = flat(i * 120, 0);
        put(Tex.wall, x + o.x, y + o.y, 1.5, 66);
      }
    };

    // Two long walls with a lane between them: enemies get funnelled down it, and so does the player.
    const hallway = (p: Vec2) => {
      const len = 6 + Math.floor(r() * 5);
      wall(p.x, p.y, len);
      const o = flat(0, 300);
      wall(p.x + o.x, p.y + o.y, len);
    };
    // The shell of a building: front and back walls, a doorway, corner pillars and rubble inside.
    const building = (p: Vec2) => {
      const w = 4 + Math.floor(r() * 2);
      wall(p.x, p.y, w, Math.floor(w / 2));
      const back = flat(0, 330);
      wall(p.x + back.x, p.y + back.y, w);
      for (const dx of [-40, w * 120 - 80]) {
        for (const dy of [0, 110, 220, 330]) {
          const o = flat(dx, dy);
          if (r() < 0.75) put(Tex.pillar, p.x + o.x, p.y + o.y, 1.4, 34);
        }
      }
      for (let i = 0; i < 3; i++) {
        const o = flat(120 + r() * (w * 120 - 240), 90 + r() * 150);
        put(Tex.rubble, p.x + o.x, p.y + o.y, 1.2, 0, 0.8);
      }
    };

    if (r() >= (boneZone ? 0.14 : 0.1)) return;
    const p = at();
    if (boneZone && r() < 0.5) {
      const kind = r();
      if (kind < 0.35) put(Tex.ribs, p.x, p.y, 3, 85);
      else if (kind < 0.6) put(Tex.skull, p.x, p.y, 3.2, 65);
      else {
        put(Tex.femur, p.x, p.y, 4, 0, 0.5, true);
        const o = flat(60 + r() * 120, -40 + r() * 80);
        put(Tex.femur, p.x + o.x, p.y + o.y, 3.2, 0, 0.5, true);
      }
      return;
    }
    const kind = r();
    if (kind < 0.5) hallway(p);
    else if (kind < 0.75) building(p);
    else if (kind < 0.9) wall(p.x, p.y, 4 + Math.floor(r() * 5), r() < 0.35 ? 2 : -1);
    else {
      for (let i = 0; i < 4; i++) {
        const o = flat((r() - 0.5) * 500, (r() - 0.5) * 300);
        put(r() < 0.6 ? Tex.pillar : Tex.rubble, p.x + o.x, p.y + o.y, 1.4, r() < 0.5 ? 34 : 0);
      }
    }
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
