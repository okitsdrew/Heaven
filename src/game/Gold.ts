import Phaser from 'phaser';
import { Tex } from '../art/placeholders';
import { cfg } from '../config';
import { toScreen, toWorld } from '../iso';
import { stats } from '../skills';

interface Pile {
  x: number;
  y: number;
  value: number;
  dead: boolean;
  cell: Pile[] | null;
}

interface Flying {
  x: number;
  y: number;
  value: number;
  speed: number;
}

const screen = { x: 0, y: 0 };
const key = (cx: number, cy: number) => (cx + 0x8000) * 0x10000 + (cy + 0x8000);

// Gold is stored by world position and never despawns. Only piles near the camera get a sprite, and piles inside
// the pickup radius are pulled to the player. Past the pile cap the oldest piles merge so no value is lost.
export class Gold {
  private cells = new Map<number, Pile[]>();
  private order: Pile[] = [];
  private head = 0;
  private count = 0;
  private flying: Flying[] = [];
  private sprites: Phaser.GameObjects.Image[] = [];
  private glows: Phaser.GameObjects.Image[] = [];
  private near: Pile[] = [];

  onCollect: (value: number) => void = () => {};
  // Piles for which this returns true cannot be picked up (the Mind's Eye's zone).
  blocksPickup: (x: number, y: number) => boolean = () => false;

  constructor(private scene: Phaser.Scene) {}

  get piles(): number {
    return this.count;
  }

  clear(): void {
    this.cells.clear();
    this.order.length = 0;
    this.head = 0;
    this.count = 0;
    this.flying.length = 0;
    for (const s of [...this.sprites, ...this.glows]) s.setVisible(false);
  }

  drop(x: number, y: number, value: number): void {
    if (value <= 0) return;
    const size = cfg.gold.cellSize;
    const k = key(Math.floor(x / size), Math.floor(y / size));
    let cell = this.cells.get(k);
    if (!cell) this.cells.set(k, (cell = []));
    const pile: Pile = { x, y, value, dead: false, cell };
    cell.push(pile);
    this.order.push(pile);
    this.count++;
    while (this.count > cfg.gold.maxPiles) this.mergeOldest();
  }

  private mergeOldest(): void {
    const a = this.nextAlive();
    const b = this.nextAlive(1);
    if (!a || !b) return;
    b.value += a.value;
    this.kill(a);
  }

  private nextAlive(skip = 0): Pile | null {
    let seen = 0;
    for (let i = this.head; i < this.order.length; i++) {
      const p = this.order[i];
      if (p.dead) {
        if (i === this.head) this.head++;
        continue;
      }
      if (seen++ === skip) return p;
    }
    return null;
  }

  private kill(p: Pile): void {
    p.dead = true;
    this.count--;
    if (p.cell) {
      const i = p.cell.indexOf(p);
      if (i >= 0) {
        p.cell[i] = p.cell[p.cell.length - 1];
        p.cell.pop();
      }
      p.cell = null;
    }
    if (this.head > 2048 && this.head > this.order.length / 2) {
      this.order = this.order.slice(this.head);
      this.head = 0;
    }
  }

  private query(minX: number, minY: number, maxX: number, maxY: number): Pile[] {
    const size = cfg.gold.cellSize;
    this.near.length = 0;
    for (let cx = Math.floor(minX / size); cx <= Math.floor(maxX / size); cx++) {
      for (let cy = Math.floor(minY / size); cy <= Math.floor(maxY / size); cy++) {
        const cell = this.cells.get(key(cx, cy));
        if (cell) for (const p of cell) this.near.push(p);
      }
    }
    return this.near;
  }

  // Pulls nearby piles toward the player and hands their value over once they arrive.
  update(dt: number, px: number, py: number, collecting: boolean): void {
    const g = cfg.gold;
    if (collecting) {
      const r = stats.pickupRadius();
      for (const p of this.query(px - r, py - r, px + r, py + r)) {
        if (Math.hypot(p.x - px, p.y - py) > r || this.blocksPickup(p.x, p.y)) continue;
        this.flying.push({ x: p.x, y: p.y, value: p.value, speed: g.pullSpeed });
        this.kill(p);
      }
    }
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      f.speed += g.pullAccel * dt;
      const dx = px - f.x;
      const dy = py - f.y;
      const d = Math.hypot(dx, dy);
      const step = f.speed * dt;
      if (d <= step + 6 || !collecting) {
        this.onCollect(f.value);
        this.flying.splice(i, 1);
        continue;
      }
      f.x += (dx / d) * step;
      f.y += (dy / d) * step;
    }
  }

  render(cam: Phaser.Cameras.Scene2D.Camera): void {
    const px = cfg.render.pixelScale;
    const corners = [
      toWorld(cam.scrollX - 40, cam.scrollY - 40),
      toWorld(cam.scrollX + cam.width + 40, cam.scrollY - 40),
      toWorld(cam.scrollX - 40, cam.scrollY + cam.height + 80),
      toWorld(cam.scrollX + cam.width + 40, cam.scrollY + cam.height + 80),
    ];
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);
    const visible = this.query(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));

    let used = 0;
    const draw = (x: number, y: number, value: number, lift: number) => {
      toScreen(x, y, screen);
      if (screen.x < cam.scrollX - 40 || screen.x > cam.scrollX + cam.width + 40) return;
      if (screen.y < cam.scrollY - 80 || screen.y > cam.scrollY + cam.height + 80) return;
      const size = px * cfg.gold.scale * (1 + Math.log2(value) * cfg.gold.valueScale) * 0.6;
      const sprite = (this.sprites[used] ??= this.scene.add.image(0, 0, Tex.coin));
      const glow = (this.glows[used] ??= this.scene.add
        .image(0, 0, Tex.glow)
        .setTint(0x5ab4ff)
        .setBlendMode(Phaser.BlendModes.ADD));
      sprite.setVisible(true).setPosition(screen.x, screen.y - lift).setScale(size).setDepth(screen.y - 0.5);
      glow
        .setVisible(true)
        .setPosition(screen.x, screen.y - lift)
        .setScale(size * cfg.gold.glowSize)
        .setAlpha(cfg.gold.glow)
        .setDepth(screen.y - 0.6);
      used++;
    };
    for (const p of visible) draw(p.x, p.y, p.value, 4 * px * 0.6);
    for (const f of this.flying) draw(f.x, f.y, f.value, 8 * px * 0.6);
    for (let i = used; i < this.sprites.length; i++) {
      this.sprites[i].setVisible(false);
      this.glows[i].setVisible(false);
    }
  }
}
