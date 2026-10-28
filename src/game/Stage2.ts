import Phaser from 'phaser';
import { Tex } from '../art/placeholders';
import { cfg } from '../config';
import { toScreen, toWorld, Vec2 } from '../iso';
import { persist, profile } from '../save';
import { Fx } from './Fx';
import { Player } from './Player';

const screen = { x: 0, y: 0 };
const RED = 0xff2a3a;

// Where things sit, relative to where every run starts (the origin): the Mind's Eye far to the south east on
// screen, and the Resting Ground the same distance again to the north east of it.
export function stage2Points(): { eye: Vec2; cave: Vec2 } {
  const unit = (sx: number, sy: number): Vec2 => {
    const w = toWorld(sx, sy);
    const len = Math.hypot(w.x, w.y) || 1;
    return { x: w.x / len, y: w.y / len };
  };
  const se = unit(1, 1);
  const ne = unit(1, -1);
  const eye = { x: se.x * cfg.stage2.eyeDistance, y: se.y * cfg.stage2.eyeDistance };
  return { eye, cave: { x: eye.x + ne.x * cfg.stage2.restDistance, y: eye.y + ne.y * cfg.stage2.restDistance } };
}

// Stage 2 of a battle: the quest box and arrow, the giant stationary Mind's Eye with its soul-hungry zone, and the
// cave entrance to Anathema's Resting Ground.
export class Stage2 {
  active = false;
  readonly eye: Vec2;
  readonly cave: Vec2;

  onAnnounce: (text: string) => void = () => {};
  onEnterCave: () => void = () => {};

  private time = 0;
  private blink = 0;
  private blinkIn = 4;
  private open = 1;
  private entered = false;
  private zone: Phaser.GameObjects.Graphics;
  private glow: Phaser.GameObjects.Graphics;
  private eyeGfx: Phaser.GameObjects.Graphics;
  private caveGfx: Phaser.GameObjects.Graphics;
  private beam: Phaser.GameObjects.Graphics;
  private panel: Phaser.GameObjects.Graphics;
  private arrow: Phaser.GameObjects.Graphics;
  private title: Phaser.GameObjects.Text;
  private goal: Phaser.GameObjects.Text;
  private sub: Phaser.GameObjects.Text;
  private dist: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, private fx: Fx) {
    const pts = stage2Points();
    this.eye = pts.eye;
    this.cave = pts.cave;
    this.zone = scene.add.graphics().setDepth(-5e8 + 3).setBlendMode(Phaser.BlendModes.ADD);
    this.glow = scene.add.graphics().setDepth(8e5).setBlendMode(Phaser.BlendModes.ADD);
    this.eyeGfx = scene.add.graphics();
    this.caveGfx = scene.add.graphics();
    this.beam = scene.add.graphics().setDepth(9e5).setBlendMode(Phaser.BlendModes.ADD);
    this.panel = scene.add.graphics().setScrollFactor(0).setDepth(5e6);
    this.arrow = scene.add.graphics().setScrollFactor(0).setDepth(5e6);
    const style = { fontFamily: 'monospace', stroke: '#120f18', strokeThickness: 3 };
    this.title = scene.add.text(0, 0, 'OBJECTIVE', { ...style, fontSize: '11px', color: '#d88a96' }).setOrigin(0, 0).setScrollFactor(0).setDepth(5e6 + 1);
    this.goal = scene.add.text(0, 0, '', { ...style, fontSize: '17px', fontStyle: 'bold', color: '#f2d7a6', wordWrap: { width: 310 } }).setOrigin(0, 0).setScrollFactor(0).setDepth(5e6 + 1);
    this.sub = scene.add.text(0, 0, '', { ...style, fontSize: '14px', color: '#ff9aa6' }).setOrigin(0, 0).setScrollFactor(0).setDepth(5e6 + 1);
    this.dist = scene.add.text(0, 0, '', { ...style, fontSize: '15px', fontStyle: 'bold', color: '#ffe0e4' }).setOrigin(0.5).setScrollFactor(0).setDepth(5e6 + 1);
    this.setActive(false);
  }

  setActive(on: boolean): void {
    this.active = on;
    this.entered = false;
    this.open = profile.quest === 'follow' ? 0.03 : 1;
    if (!on) this.clearAll();
  }

  private clearAll(): void {
    for (const g of [this.zone, this.glow, this.eyeGfx, this.caveGfx, this.beam, this.panel, this.arrow]) g.clear();
    for (const t of [this.title, this.goal, this.sub, this.dist]) t.setVisible(false);
  }

  // While the eye is hungry its zone is live: nothing in it can be picked up, and kills feed the eye.
  private get hungry(): boolean {
    return this.active && (profile.quest === 'find' || profile.quest === 'feed');
  }

  private inZone(x: number, y: number): boolean {
    return Math.hypot(x - this.eye.x, y - this.eye.y) <= cfg.stage2.eyeRadius;
  }

  blocksPickup(x: number, y: number): boolean {
    return this.hungry && this.inZone(x, y);
  }

  // A kill inside the zone feeds the eye one soul instead of dropping any. Returns true if the eye took it.
  absorb(x: number, y: number): boolean {
    if (!this.hungry || !this.inZone(x, y)) return false;
    if (profile.quest === 'find') this.setQuest('feed');
    profile.eyeFed += 1;
    persist();
    // Blue souls stream from the kill to the eye.
    toScreen(x, y, screen);
    const sx = screen.x;
    const sy = screen.y - 10;
    toScreen(this.eye.x, this.eye.y, screen);
    const ex = screen.x;
    const ey = screen.y - 300 * cfg.stage2.eyeSize;
    const life = 0.7;
    for (let i = 0; i < 4; i++) {
      this.fx.particle({ x: sx + (Math.random() - 0.5) * 10, y: sy, life, from: 0.35, to: 0.1, alpha: 0.9, tint: i % 2 ? 0x5ab4ff : 0xb8e4ff, vx: (ex - sx) / life, vy: (ey - sy) / life, depth: 1e6 });
    }
    return true;
  }

  private setQuest(q: 'find' | 'feed' | 'follow'): void {
    profile.quest = q;
    persist();
    if (q === 'feed') this.onAnnounce("Feed the Mind's Eye");
    if (q === 'follow') this.onAnnounce("Follow the Aura to Anathema's Resting Ground");
  }

  update(dt: number, player: Player, cam: Phaser.Cameras.Scene2D.Camera): void {
    if (!this.active) return;
    this.time += dt;
    const s = cfg.stage2;

    if (profile.quest === 'find' && Math.hypot(player.x - this.eye.x, player.y - this.eye.y) <= s.eyeRadius) this.setQuest('feed');
    if (profile.quest === 'feed' && profile.eyeFed >= s.eyeSouls) this.setQuest('follow');
    if (profile.quest === 'follow' && !this.entered && Math.hypot(player.x - this.cave.x, player.y - this.cave.y) <= s.caveRadius) {
      this.entered = true;
      this.onEnterCave();
    }

    // The eye blinks now and then and shuts for good once fed.
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blink = 0.28;
      this.blinkIn = 3.5 + Math.random() * 3.5;
    }
    this.blink = Math.max(0, this.blink - dt);
    this.open += ((profile.quest === 'follow' ? 0.03 : 1) - this.open) * Math.min(1, dt * 3);

    this.drawWorld(player, cam);
    this.drawQuest(player, cam);
  }

  private onScreen(x: number, y: number, cam: Phaser.Cameras.Scene2D.Camera, margin: number): boolean {
    toScreen(x, y, screen);
    return screen.x > cam.scrollX - margin && screen.x < cam.scrollX + cam.width + margin && screen.y > cam.scrollY - margin && screen.y < cam.scrollY + cam.height + margin;
  }

  private circle(x: number, y: number, r: number): Vec2[] {
    const pts: Vec2[] = [];
    for (let k = 0; k < 72; k++) {
      const a = (k / 72) * Math.PI * 2;
      pts.push(toScreen(x + Math.cos(a) * r, y + Math.sin(a) * r, { x: 0, y: 0 }));
    }
    return pts;
  }

  private drawWorld(player: Player, cam: Phaser.Cameras.Scene2D.Camera): void {
    const s = cfg.stage2;
    this.zone.clear();
    this.glow.clear();
    this.eyeGfx.clear();
    this.caveGfx.clear();
    this.beam.clear();

    const near = Math.hypot(player.x - this.eye.x, player.y - this.eye.y) < s.eyeRadius + 1800;
    if (this.hungry && near) {
      this.zone.fillStyle(RED, 0.06 + 0.02 * Math.sin(this.time * 2)).fillPoints(this.circle(this.eye.x, this.eye.y, s.eyeRadius), true);
      this.zone.lineStyle(6, RED, 0.5 + 0.2 * Math.sin(this.time * 3)).strokePoints(this.circle(this.eye.x, this.eye.y, s.eyeRadius), true);
    }
    if (this.onScreen(this.eye.x, this.eye.y, cam, 600 * s.eyeSize)) this.drawEye(player);
    if (profile.quest === 'follow' && this.onScreen(this.cave.x, this.cave.y, cam, 1200)) this.drawCave();
  }

  // The giant eye hanging over the zone: it tracks the player and blinks.
  private drawEye(player: Player): void {
    const S = cfg.stage2.eyeSize;
    toScreen(this.eye.x, this.eye.y, screen);
    const cx = screen.x;
    const cy = screen.y - 300 * S;
    const g = this.eyeGfx.setDepth(screen.y + 5);
    const W = 520 * S;
    const H = 280 * S;
    const open = Phaser.Math.Clamp(this.open * (this.blink > 0 ? Math.abs(1 - Math.sin((this.blink / 0.28) * Math.PI)) : 1), 0.03, 1);
    const lid = (t: number) => Math.pow(Math.sin(Math.PI * t), 0.85);
    const almond = (scale: number): Vec2[] => {
      const pts: Vec2[] = [];
      for (let k = 0; k <= 24; k++) {
        const t = k / 24;
        pts.push({ x: cx - (W * scale) / 2 + W * scale * t, y: cy - ((H * scale) / 2) * open * lid(t) });
      }
      for (let k = 24; k >= 0; k--) {
        const t = k / 24;
        pts.push({ x: cx - (W * scale) / 2 + W * scale * t, y: cy + ((H * scale) / 2) * 0.75 * open * lid(t) });
      }
      return pts;
    };
    // A red haze behind it, swelling with how much it has been fed.
    const fed = Math.min(1, profile.eyeFed / Math.max(cfg.stage2.eyeSouls, 1));
    this.glow.fillStyle(RED, 0.18 + 0.12 * fed + 0.04 * Math.sin(this.time * 2)).fillEllipse(cx, cy, W * 1.8, H * 1.9);
    this.glow.fillStyle(0xff6a20, 0.08).fillEllipse(cx, cy, W * 1.2, H * 1.2);
    g.fillStyle(0x000000, 0.35).fillEllipse(cx, cy + 300 * S, 300 * S, 70 * S);
    g.fillStyle(0x250408, 1).fillPoints(almond(1), true);
    g.fillStyle(0x3a0a10, 1).fillPoints(almond(0.82), true);

    // Iris and slit pupil slide toward the player's position on screen.
    toScreen(player.x - this.eye.x, player.y - this.eye.y, screen);
    const d = Math.hypot(screen.x, screen.y) || 1;
    const reach = Math.min(1, d / 700);
    const ox = (screen.x / d) * reach * 120 * S;
    const oy = (screen.y / d) * reach * 55 * S;
    const R = 92 * S;
    const squeeze = Math.min(1, open * 1.25);
    g.fillStyle(0x7a0a14, 1).fillEllipse(cx + ox, cy + oy, R * 2, R * 2 * squeeze);
    g.fillStyle(0xc81426, 1).fillEllipse(cx + ox, cy + oy, R * 1.6, R * 1.6 * squeeze);
    g.fillStyle(0xff5a20, 0.9).fillEllipse(cx + ox, cy + oy, R * 1.05, R * 1.05 * squeeze);
    g.fillStyle(0x000000, 1).fillEllipse(cx + ox, cy + oy, 20 * S, R * 1.85 * squeeze);
    g.fillStyle(0xffffff, 0.8).fillCircle(cx + ox - R * 0.35, cy + oy - R * 0.3 * squeeze, 7 * S);
    const rim = almond(1);
    g.lineStyle(10 * S, 0x000000, 1).strokePoints(rim, true);
    g.lineStyle(4 * S, 0xb0101e, 0.9).strokePoints(rim, true);
  }

  // A rocky mound with a black archway, and a column of aura rising from it.
  private drawCave(): void {
    toScreen(this.cave.x, this.cave.y, screen);
    const g = this.caveGfx.setDepth(screen.y);
    const x = screen.x;
    const y = screen.y;
    g.fillStyle(0x000000, 0.4).fillEllipse(x, y + 6, 380, 90);
    g.fillStyle(0x1b1624, 1).fillPoints(
      [
        { x: x - 190, y: y + 10 },
        { x: x - 150, y: y - 80 },
        { x: x - 70, y: y - 150 },
        { x: x + 20, y: y - 175 },
        { x: x + 110, y: y - 130 },
        { x: x + 175, y: y - 60 },
        { x: x + 195, y: y + 10 },
      ],
      true,
    );
    g.fillStyle(0x2c2538, 1).fillPoints(
      [
        { x: x - 120, y: y - 60 },
        { x: x - 40, y: y - 140 },
        { x: x + 40, y: y - 150 },
        { x: x + 20, y: y - 60 },
      ],
      true,
    );
    // The mouth.
    g.fillStyle(0x000000, 1).fillEllipse(x, y - 30, 130, 110);
    g.fillRect(x - 65, y - 30, 130, 38);
    g.lineStyle(4, 0x6a4a9a, 0.8).strokeEllipse(x, y - 30, 130, 110);
    // The aura.
    for (let i = 0; i < 5; i++) {
      const w = 90 - i * 14;
      const a = (0.1 + 0.03 * i) * (0.8 + 0.2 * Math.sin(this.time * 3 + i));
      this.beam.fillStyle(i % 2 ? 0xb070ff : RED, a).fillRect(x - w / 2, y - 1100, w, 1100);
    }
    this.beam.fillStyle(0xb070ff, 0.25).fillEllipse(x, y - 10, 300, 80);
    if (Math.random() < 0.5) {
      this.fx.particle({ texture: Tex.glow, x: x + (Math.random() - 0.5) * 60, y: y - 20, life: 1.2, from: 0.3, to: 0.05, alpha: 0.8, tint: Math.random() < 0.5 ? 0xb070ff : RED, vy: -180 - Math.random() * 120, vx: (Math.random() - 0.5) * 20, depth: y + 1 });
    }
  }

  private drawQuest(player: Player, cam: Phaser.Cameras.Scene2D.Camera): void {
    const s = cfg.stage2;
    const q = profile.quest;
    const goal = q === 'find' ? "Find the Mind's Eye" : q === 'feed' ? "Feed the Mind's Eye" : "Follow the Aura to Anathema's Resting Ground";
    const sub = q === 'feed' ? `${Math.min(s.eyeSouls, Math.floor(profile.eyeFed))}/${s.eyeSouls} souls` : '';

    const w = 340;
    const x = cam.width - 16 - w;
    const y = 16;
    this.title.setVisible(true).setPosition(x + 14, y + 8);
    this.goal.setVisible(true).setText(goal).setPosition(x + 14, y + 24);
    const goalH = this.goal.height;
    this.sub.setVisible(sub !== '').setText(sub).setPosition(x + 14, y + 28 + goalH);
    const h = 36 + goalH + (sub ? 24 : 6);
    const g = this.panel;
    g.clear();
    g.fillStyle(0x120a14, 0.82).fillRoundedRect(x, y, w, h, 8);
    g.lineStyle(2, 0x8a1020, 0.9).strokeRoundedRect(x, y, w, h, 8);

    // An arrow near the edge of the view points the way and says how far it is.
    const target = q === 'follow' ? this.cave : this.eye;
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const distance = Math.hypot(dx, dy);
    this.arrow.clear();
    if (distance <= s.arrowHideDistance) {
      this.dist.setVisible(false);
      return;
    }
    toScreen(dx, dy, screen);
    const len = Math.hypot(screen.x, screen.y) || 1;
    const ux = screen.x / len;
    const uy = screen.y / len;
    const R = s.arrowRadius;
    const cx = cam.width / 2 + ux * R;
    const cy = cam.height / 2 + uy * R;
    const px = -uy;
    const py = ux;
    const tip = { x: cx + ux * 26, y: cy + uy * 26 };
    const a = { x: cx - ux * 14 + px * 20, y: cy - uy * 14 + py * 20 };
    const b = { x: cx - ux * 14 - px * 20, y: cy - uy * 14 - py * 20 };
    const notch = { x: cx - ux * 4, y: cy - uy * 4 };
    this.arrow.fillStyle(0xff2a3a, 0.95).fillPoints([tip, a, notch, b], true);
    this.arrow.lineStyle(3, 0xffe0e4, 0.95).strokePoints([tip, a, notch, b], true);
    this.dist.setVisible(true).setText(`${Math.round(distance).toLocaleString()} units`).setPosition(cx - ux * 44, cy - uy * 44);
  }
}
