import Phaser from 'phaser';
import { Tex } from '../art/placeholders';
import { cfg } from '../config';
import { Input } from '../input';
import { toScreen, Vec2 } from '../iso';
import { actionFor, canUse, skillDamage, slotActions } from '../skills';
import { Hittable, segmentCircle } from './Arrows';
import { Fx } from './Fx';
import { Player } from './Player';

interface Flower {
  sx: number;
  sy: number;
  x: number;
  y: number;
  age: number;
}

interface Petal {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  age: number;
  spin: number;
  hits: Set<number>;
}

interface Burst {
  x: number;
  y: number;
  age: number;
  radius: number;
  life: number;
  big: boolean;
}

const screen = { x: 0, y: 0 };
const GREEN = 0x7aff5a;
const PETAL_COLORS = [0x3a1458, 0x5a2090, 0x7a38b8, 0xa060e0];

// H: Festering Lotus. Lob a flower; every enemy and the boss heads for it while it poisons everything near it.
// After its countdown it blooms, hurting what is nearby and throwing out spinning petals. Arrows make it pulse,
// and dashing or teleporting through it sets it off early.
export class Lotus {
  cooldown = 0;
  aiming = false;
  // The flower as arrows see it; only alive while it sits on the ground.
  readonly body: Hittable = { kind: 'flower', id: -2, x: 0, y: 0, radius: 0, alive: false };

  private flower: Flower | null = null;
  private petals: Petal[] = [];
  private bursts: Burst[] = [];
  private swallowFire = false;
  private pulseCooldown = 0;
  private zoneAcc = 0;
  private time = 0;
  private prev: Vec2 | null = null;
  private ground: Phaser.GameObjects.Graphics;
  private glow: Phaser.GameObjects.Graphics;
  private art: Phaser.GameObjects.Graphics;
  private petalGfx: Phaser.GameObjects.Graphics;

  onAimStart: () => void = () => {};
  onDamage: (target: Hittable, amount: number, x: number, y: number) => void = () => {};
  onPoison: (target: Hittable) => void = () => {};

  constructor(scene: Phaser.Scene, private fx: Fx, private targets: () => readonly Hittable[]) {
    this.ground = scene.add.graphics().setDepth(-5e8 + 2).setBlendMode(Phaser.BlendModes.ADD);
    this.glow = scene.add.graphics().setDepth(9e5).setBlendMode(Phaser.BlendModes.ADD);
    this.art = scene.add.graphics();
    this.petalGfx = scene.add.graphics().setDepth(1e6);
  }

  get blocksFire(): boolean {
    return this.aiming || this.swallowFire;
  }

  get active(): boolean {
    return this.flower !== null;
  }

  // Where enemies head while the flower is on the ground.
  get lure(): Vec2 | null {
    return this.flower && this.landed(this.flower) ? this.flower : null;
  }

  reset(): void {
    this.aiming = false;
    this.cooldown = 0;
    this.flower = null;
    this.body.alive = false;
    this.petals.length = 0;
    this.bursts.length = 0;
    this.pulseCooldown = 0;
    this.zoneAcc = 0;
    this.prev = null;
    this.clearGfx();
  }

  cancel(): void {
    this.aiming = false;
  }

  // Keeps the flower in the arrow hit-test hash while it is on the ground.
  insertInto(hash: { insert: (item: Hittable, x: number, y: number) => void }): void {
    if (this.body.alive) hash.insert(this.body, this.body.x, this.body.y);
  }

  private landed(f: Flower): boolean {
    return f.age >= cfg.lotus.lobTime;
  }

  private aimPoint(player: Player, cursor: Vec2 | null): Vec2 {
    const t = cursor ?? { x: player.x + player.aimX * 200, y: player.y + player.aimY * 200 };
    const dx = t.x - player.x;
    const dy = t.y - player.y;
    const d = Math.hypot(dx, dy);
    const max = cfg.lotus.maxRange;
    if (d <= max || d < 1e-3) return t;
    return { x: player.x + (dx / d) * max, y: player.y + (dy / d) * max };
  }

  update(dt: number, player: Player, input: Input, cursor: Vec2 | null): void {
    this.time += dt;
    const c = cfg.lotus;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.pulseCooldown = Math.max(0, this.pulseCooldown - dt);
    if (this.swallowFire && !input.isDown('fire')) this.swallowFire = false;

    if (!canUse('lotus')) {
      this.aiming = false;
    } else {
      const key = actionFor('lotus');
      // Nothing is shown at the mouse while it is cooling down.
      if (key && input.justPressed(key)) {
        if (this.aiming) this.aiming = false;
        else if (this.cooldown <= 0 && !this.flower) {
          this.aiming = true;
          this.onAimStart();
        }
      }
      for (const other of [...slotActions, 'abilityF'] as const) if (other !== key && input.justPressed(other)) this.aiming = false;
      // A click while it is cooling down does nothing and keeps it aimed.
      if (this.aiming && input.justPressed('fire')) {
        this.swallowFire = true;
        if (this.cooldown <= 0 && !this.flower) {
          const p = this.aimPoint(player, cursor);
          this.aiming = false;
          this.cooldown = c.cooldown;
          this.flower = { sx: player.x, sy: player.y, x: p.x, y: p.y, age: 0 };
          this.zoneAcc = 0;
        }
      }
    }

    const f = this.flower;
    if (f) {
      f.age += dt;
      const landed = this.landed(f);
      this.body.x = f.x;
      this.body.y = f.y;
      this.body.radius = c.bodyRadius;
      this.body.alive = landed;

      if (landed) {
        // The zone adds a poison stack to everything inside at a steady rate.
        this.zoneAcc += dt;
        while (this.zoneAcc >= Math.max(c.zoneRate, 0.05)) {
          this.zoneAcc -= Math.max(c.zoneRate, 0.05);
          for (const t of this.targets()) {
            if (t.alive && Math.hypot(t.x - f.x, t.y - f.y) <= c.radius + t.radius) this.onPoison(t);
          }
        }
        // Dashing or teleporting through the flower sets it off on the spot.
        let burst = f.age - c.lobTime >= c.life;
        let through: Vec2 | null = null;
        if (!burst && this.prev && (player.dashing || player.teleporting)) {
          const dx = player.x - this.prev.x;
          const dy = player.y - this.prev.y;
          const len = Math.hypot(dx, dy);
          if (len > 1e-3 && segmentCircle(this.prev.x, this.prev.y, dx / len, dy / len, len, f.x, f.y, c.bodyRadius + cfg.player.bodyRadius) >= 0) {
            burst = true;
            through = { x: dx / len, y: dy / len };
          }
        }
        if (burst) this.explode(through);
      }
    }
    this.prev = { x: player.x, y: player.y };

    this.updatePetals(dt, player);
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      this.bursts[i].age += dt;
      if (this.bursts[i].age >= this.bursts[i].life) this.bursts.splice(i, 1);
    }
    this.draw(dt, player, cursor);
  }

  // An arrow hit: a smaller green pulse that does not set the flower off.
  shot(): void {
    const f = this.flower;
    if (!f || !this.landed(f) || this.pulseCooldown > 0) return;
    const c = cfg.lotus;
    this.pulseCooldown = c.pulseCooldown;
    const r = c.radius * c.pulseRadiusMult;
    for (const t of this.targets()) {
      if (t.alive && Math.hypot(t.x - f.x, t.y - f.y) <= r + t.radius) this.onDamage(t, c.pulseDamage * skillDamage('lotus'), t.x, t.y);
    }
    this.bursts.push({ x: f.x, y: f.y, age: 0, radius: r, life: 0.45, big: false });
    this.cloud(f.x, f.y, r, 30);
  }

  // `through` is the direction the player dashed or teleported through it, if that is what set it off.
  private explode(through: Vec2 | null): void {
    const f = this.flower;
    if (!f) return;
    const c = cfg.lotus;
    for (const t of this.targets()) {
      if (t.alive && Math.hypot(t.x - f.x, t.y - f.y) <= c.radius + t.radius) this.onDamage(t, c.damage * skillDamage('lotus'), t.x, t.y);
    }
    this.bursts.push({ x: f.x, y: f.y, age: 0, radius: c.radius, life: 0.8, big: true });
    this.cloud(f.x, f.y, c.radius, 110);
    this.fx.addShake(cfg.camera.shakeOnCast * 3);
    this.launchPetals(f.x, f.y, through);
    this.flower = null;
    this.body.alive = false;
  }

  // Poison-green and purple puffs thrown up across an area.
  private cloud(x: number, y: number, r: number, count: number): void {
    const px = cfg.render.pixelScale;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * r;
      toScreen(x + Math.cos(a) * d, y + Math.sin(a) * d, screen);
      const smoke = i % 3 === 0;
      this.fx.particle({
        texture: smoke ? Tex.smoke : Tex.glow,
        x: screen.x,
        y: screen.y - 6 * px,
        life: 0.5 + Math.random() * 0.6,
        from: smoke ? px * 0.8 : 0.4 + Math.random() * 0.5,
        to: smoke ? px * 2.5 : 0.08,
        alpha: 0.85,
        tint: smoke ? 0x1a0a2a : [GREEN, 0xb070ff, 0x30ff90][i % 3],
        additive: !smoke,
        vx: (Math.random() - 0.5) * 120,
        vy: -50 - Math.random() * 130,
        depth: screen.y + 3,
      });
    }
  }

  // Eight petals start bunched at the flower and burst outward like shotgun pellets.
  // On its own timer they fly in every direction; set off by a dash, they fan out in a cone along it.
  private launchPetals(x: number, y: number, through: Vec2 | null): void {
    const n = Math.max(1, Math.round(cfg.lotus.petals));
    const offset = Math.random() * Math.PI * 2;
    const cone = Phaser.Math.DegToRad(cfg.lotus.petalConeAngle);
    const heading = through ? Math.atan2(through.y, through.x) : 0;
    for (let i = 0; i < n; i++) {
      const a = through
        ? heading + (n > 1 ? (i / (n - 1) - 0.5) * cone : 0)
        : offset + (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.12;
      this.petals.push({
        x: x + (Math.random() - 0.5) * 10,
        y: y + (Math.random() - 0.5) * 10,
        dirX: Math.cos(a),
        dirY: Math.sin(a),
        age: 0,
        spin: Math.random() * Math.PI * 2,
        hits: new Set(),
      });
    }
  }

  private updatePetals(dt: number, player: Player): void {
    const c = cfg.lotus;
    const top = cfg.teleport.speed * c.petalSpeedMult;
    for (let i = this.petals.length - 1; i >= 0; i--) {
      const p = this.petals[i];
      p.age += dt;
      p.spin += dt * 24;
      // Bunched and slow for a beat, then flung out to full speed.
      const k = Math.min(1, p.age / Math.max(c.petalClumpTime, 1e-3));
      const speed = top * (0.12 + 0.88 * k * k);
      const step = speed * dt;
      for (const t of this.targets()) {
        if (!t.alive || p.hits.has(t.id)) continue;
        if (segmentCircle(p.x, p.y, p.dirX, p.dirY, step, t.x, t.y, t.radius + c.petalRadius) >= 0) {
          p.hits.add(t.id);
          this.onDamage(t, c.petalDamage * skillDamage('lotus'), t.x, t.y);
          this.onPoison(t);
        }
      }
      p.x += p.dirX * step;
      p.y += p.dirY * step;
      if (Math.hypot(p.x - player.x, p.y - player.y) > cfg.world.despawnRadius) {
        this.petals.splice(i, 1);
        continue;
      }
      if (Math.random() < 0.6) {
        toScreen(p.x, p.y, screen);
        this.fx.particle({
          x: screen.x + (Math.random() - 0.5) * 8,
          y: screen.y - 14,
          life: 0.3 + Math.random() * 0.2,
          from: 0.3,
          to: 0.05,
          alpha: 0.8,
          tint: Math.random() < 0.5 ? GREEN : 0xb070ff,
          vx: (Math.random() - 0.5) * 30,
          vy: -10 - Math.random() * 25,
          depth: screen.y,
        });
      }
    }
  }

  private clearGfx(): void {
    this.ground.clear();
    this.glow.clear();
    this.art.clear();
    this.petalGfx.clear();
  }

  private circle(x: number, y: number, r: number): Vec2[] {
    const pts: Vec2[] = [];
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * Math.PI * 2;
      pts.push(toScreen(x + Math.cos(a) * r, y + Math.sin(a) * r, { x: 0, y: 0 }));
    }
    return pts;
  }

  private draw(_dt: number, player: Player, cursor: Vec2 | null): void {
    this.clearGfx();
    const c = cfg.lotus;
    const px = cfg.render.pixelScale;
    const g = this.ground;

    // While aiming, the zone shows where the flower will land.
    if (this.aiming) {
      const p = this.aimPoint(player, cursor);
      g.fillStyle(GREEN, 0.08).fillPoints(this.circle(p.x, p.y, c.radius), true);
      g.lineStyle(3, GREEN, 0.5 + 0.2 * Math.sin(this.time * 6)).strokePoints(this.circle(p.x, p.y, c.radius), true);
    }

    const f = this.flower;
    if (f) {
      const landed = this.landed(f);
      const flight = Math.min(1, f.age / Math.max(c.lobTime, 1e-3));
      const gx = f.sx + (f.x - f.sx) * flight;
      const gy = f.sy + (f.y - f.sy) * flight;
      toScreen(gx, gy, screen);
      const lift = landed ? 0 : Math.sin(flight * Math.PI) * 150;
      const left = landed ? Math.max(0, 1 - (f.age - c.lobTime) / Math.max(c.life, 1e-3)) : 1;

      if (landed) {
        // The poison zone, with a ring growing out from the flower and going off when it fills the zone.
        g.fillStyle(GREEN, 0.1).fillPoints(this.circle(f.x, f.y, c.radius), true);
        g.lineStyle(3, GREEN, 0.55).strokePoints(this.circle(f.x, f.y, c.radius), true);
        g.lineStyle(4, 0xe0ffd0, 0.65).strokePoints(this.circle(f.x, f.y, Math.max(8, c.radius * (1 - left))), true);
        // Bubbling poison rising inside the zone.
        if (Math.random() < 0.5) {
          const a = Math.random() * Math.PI * 2;
          const d = Math.sqrt(Math.random()) * c.radius;
          toScreen(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d, screen);
          this.fx.particle({
            x: screen.x,
            y: screen.y - 4,
            life: 0.8 + Math.random() * 0.6,
            from: 0.2,
            to: 0.05,
            alpha: 0.7,
            tint: GREEN,
            vx: (Math.random() - 0.5) * 10,
            vy: -25 - Math.random() * 30,
            depth: screen.y - 1,
          });
        }
        toScreen(f.x, f.y, screen);
      }

      const hot = landed ? 1 - left : 0;
      // Slowly twists one way and then the other; in flight it tumbles.
      const sway = flight < 1 ? this.time * 14 * 0.02 : Math.sin(this.time * 1.1) * 0.07;
      this.art.setDepth(screen.y + 2);
      this.art.save();
      this.art.translateCanvas(screen.x, screen.y - lift);
      this.art.rotateCanvas(sway);
      this.drawLotus(this.art, 0, 0, px * 1.6, hot);
      this.art.restore();
      // A green glow behind the bloom that swells before it goes off.
      this.glow.fillStyle(GREEN, 0.15 + 0.3 * hot).fillCircle(screen.x, screen.y - lift - 14 * px, (20 + 26 * hot) * px);
      toScreen(f.x, f.y, screen);
      if (!landed) {
        toScreen(gx, gy, screen);
        g.fillStyle(0x000000, 0.35).fillEllipse(screen.x, screen.y, 36 * px * 0.5, 36 * px * 0.2);
      }
    }

    for (const b of this.bursts) this.drawBurst(g, b);

    for (const p of this.petals) {
      toScreen(p.x, p.y, screen);
      this.drawPetal(this.petalGfx, this.glow, screen.x, screen.y - 14, p.spin);
    }
  }

  private drawBurst(g: Phaser.GameObjects.Graphics, b: Burst): void {
    const t = b.age / b.life;
    const ease = 1 - Math.pow(1 - Math.min(1, t * 2), 3);
    const fade = 1 - t;
    g.fillStyle(GREEN, (b.big ? 0.5 : 0.35) * fade * fade).fillPoints(this.circle(b.x, b.y, b.radius), true);
    g.lineStyle(b.big ? 16 * fade + 2 : 8 * fade + 1, 0xd8ffc8, fade).strokePoints(this.circle(b.x, b.y, b.radius * (0.3 + 0.7 * ease)), true);
    if (b.big) g.lineStyle(8 * fade + 1, 0xb070ff, fade).strokePoints(this.circle(b.x, b.y, b.radius * (0.15 + 0.6 * ease)), true);
  }

  // A teardrop petal pointing along `angle` from (x, y).
  private petalShape(x: number, y: number, angle: number, len: number, wid: number): Vec2[] {
    const pts: Vec2[] = [];
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    for (let k = 0; k <= 12; k++) {
      const t = k / 12;
      const w = Math.sin(t * Math.PI) * wid * (1 - 0.35 * t);
      pts.push({ x: x + ca * len * t - sa * w, y: y + sa * len * t + ca * w });
    }
    for (let k = 11; k >= 1; k--) {
      const t = k / 12;
      const w = Math.sin(t * Math.PI) * wid * (1 - 0.35 * t);
      pts.push({ x: x + ca * len * t + sa * w, y: y + sa * len * t - ca * w });
    }
    return pts;
  }

  // The lotus: layered dark purple petals fanning up from a bright heart.
  private drawLotus(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, hot: number): void {
    const up = -Math.PI / 2;
    const layers = [
      { n: 7, spread: 1.7, len: 30, wid: 10, color: PETAL_COLORS[0] },
      { n: 6, spread: 1.4, len: 27, wid: 10, color: PETAL_COLORS[1] },
      { n: 5, spread: 1.0, len: 23, wid: 9, color: PETAL_COLORS[2] },
    ];
    for (const L of layers) {
      for (let i = 0; i < L.n; i++) {
        const a = up + (i / (L.n - 1) - 0.5) * L.spread;
        const poly = this.petalShape(x, y - 2 * s, a, L.len * s, L.wid * s);
        g.fillStyle(L.color, 1).fillPoints(poly, true);
        g.lineStyle(Math.max(1, s * 0.6), PETAL_COLORS[3], 0.8).strokePoints(poly, true);
      }
    }
    // The heart: pale stamens around a glowing core that turns green as it nears blooming.
    g.fillStyle(hot > 0.5 ? 0xb0ff80 : 0xd8c0ff, 1).fillCircle(x, y - 14 * s, 5 * s);
    for (let i = 0; i < 9; i++) {
      const a = up + (i / 8 - 0.5) * 2.2;
      g.lineStyle(Math.max(1, s * 0.7), 0xf2e4ff, 0.9).lineBetween(x, y - 12 * s, x + Math.cos(a) * 9 * s, y - 12 * s + Math.sin(a) * 9 * s);
      g.fillStyle(0xffffff, 1).fillCircle(x + Math.cos(a) * 9 * s, y - 12 * s + Math.sin(a) * 9 * s, 1.1 * s);
    }
  }

  // A shuriken of four spinning petals with a green glow.
  private drawPetal(g: Phaser.GameObjects.Graphics, glow: Phaser.GameObjects.Graphics, x: number, y: number, spin: number): void {
    // The drawn size follows the hit radius, so changing the radius changes how big they look.
    const s = (cfg.lotus.petalRadius * 1.8) / 22;
    glow.fillStyle(GREEN, 0.35).fillCircle(x, y, 17 * s);
    for (let i = 0; i < 4; i++) {
      const a = spin + (i * Math.PI) / 2;
      const poly = this.petalShape(x, y, a, 17 * s, 6 * s);
      g.fillStyle(i % 2 ? PETAL_COLORS[1] : PETAL_COLORS[2], 1).fillPoints(poly, true);
      g.lineStyle(Math.max(1, s * 0.6), 0xd8ffc8, 0.9).strokePoints(poly, true);
    }
    g.fillStyle(0xf2ffe0, 1).fillCircle(x, y, 2.4 * s);
  }
}
