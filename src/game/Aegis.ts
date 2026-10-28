import Phaser from 'phaser';
import { cfg } from '../config';
import { Input } from '../input';
import { toScreen } from '../iso';
import { actionFor, bubbleShield, canUse } from '../skills';
import { Player } from './Player';

const screen = { x: 0, y: 0 };

// Worldbreaker Aegis: a shield orbits the player and, once raised, swallows the next hit.
export class Aegis {
  cooldown = 0;
  // Seconds left of the raised shield (0 when down).
  timeLeft = 0;
  private time = 0;
  private g: Phaser.GameObjects.Graphics;
  private halo: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics();
    this.halo = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
  }

  get active(): boolean {
    return this.timeLeft > 0;
  }

  reset(): void {
    this.cooldown = 0;
    this.timeLeft = 0;
    this.g.clear();
    this.halo.clear();
  }

  // The hit has been taken: the shield is spent.
  consume(): void {
    this.timeLeft = 0;
    // A popped Bubble Shield takes a long time to come back.
    if (bubbleShield()) this.cooldown = cfg.aegis.cooldown * cfg.upgrade.bubbleCooldownMult;
  }

  update(dt: number, player: Player, input: Input, dead: boolean): void {
    this.time += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    const key = actionFor('aegis');
    const ready = !dead && canUse('aegis') && key;
    if (bubbleShield()) {
      // Always up while equipped and off cooldown; it never times out.
      if (!ready) this.timeLeft = 0;
      else if (this.cooldown <= 0 && this.timeLeft <= 0) this.timeLeft = 1e9;
    } else if (this.timeLeft > cfg.aegis.duration) {
      // Bubble Shield was refunded while it was up.
      this.timeLeft = 0;
    } else if (ready && input.justPressed(key) && this.cooldown <= 0 && this.timeLeft <= 0) {
      this.cooldown = cfg.aegis.cooldown;
      this.timeLeft = cfg.aegis.duration;
    }
    this.g.clear();
    this.halo.clear();
    // The shield stays out while the skill is equipped, cooldown or not.
    if (dead || !canUse('aegis') || !key) return;
    toScreen(player.x, player.y, screen);
    const px = cfg.render.pixelScale;
    const a = this.time * cfg.aegis.orbitSpeed;
    const x = screen.x + Math.cos(a) * cfg.aegis.orbitRadius * px;
    const y = screen.y - 14 * px + Math.sin(a) * cfg.aegis.orbitRadius * px * 0.5;
    const depth = screen.y + Math.sin(a) * 10 + 4;
    this.g.setDepth(depth);
    this.halo.setDepth(depth - 0.5);
    if (this.active) {
      const pulse = 0.75 + 0.25 * Math.sin(this.time * 12);
      // Runs out in a flicker over the last second.
      const flicker = this.timeLeft < 1 ? 0.5 + 0.5 * Math.sin(this.time * 30) : 1;
      for (const [r, c, al] of [[30, 0xffd21a, 0.18], [20, 0xfff2b0, 0.3], [11, 0xffffff, 0.45]] as const) {
        this.halo.fillStyle(c, al * pulse * flicker).fillCircle(x, y, r * px * 0.6);
      }
    }
    this.drawShield(x, y, px * cfg.aegis.shieldScale);
  }

  // The player lit white for the instant the hit lands.
  flash(player: Player): void {
    this.halo.clear();
    toScreen(player.x, player.y, screen);
    const px = cfg.render.pixelScale;
    this.halo.setDepth(screen.y + 6);
    for (const [r, c, al] of [[34, 0xffd21a, 0.3], [24, 0xfff2b0, 0.5], [14, 0xffffff, 0.8]] as const) {
      this.halo.fillStyle(c, al).fillEllipse(screen.x, screen.y - 12 * px, r * px, r * px * 1.5);
    }
  }

  // Black shield with a purple field and spiral, white gem.
  private drawShield(x: number, y: number, s: number): void {
    const g = this.g;
    const pt = (px: number, py: number) => new Phaser.Math.Vector2(x + px * s, y + py * s);
    const outline = [pt(-18, -22), pt(8, -26), pt(22, -10), pt(16, 12), pt(-2, 28), pt(-20, 16), pt(-24, -6)];
    g.fillStyle(0x0a0610, 1).fillPoints(outline, true);
    const inner = [pt(-13, -16), pt(6, -19), pt(16, -8), pt(11, 8), pt(-2, 20), pt(-15, 10), pt(-17, -5)];
    g.fillStyle(0x6a35b8, 1).fillPoints(inner, true);
    g.lineStyle(Math.max(1, s * 2), 0xb08cff, 0.9);
    let prev = pt(0, 0);
    for (let k = 1; k <= 14; k++) {
      const t = k / 14;
      const ang = t * Math.PI * 3;
      const rad = 3 + t * 9;
      const next = pt(Math.cos(ang) * rad, Math.sin(ang) * rad);
      g.lineBetween(prev.x, prev.y, next.x, next.y);
      prev = next;
    }
    g.lineStyle(Math.max(1, s * 2), 0x0a0610, 1).strokePoints(outline, true);
    g.fillStyle(0xffffff, 1).fillCircle(x + 14 * s, y - 16 * s, 3.4 * s);
  }
}
