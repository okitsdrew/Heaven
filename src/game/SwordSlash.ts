import Phaser from 'phaser';
import { Tex } from '../art/placeholders';
import { cfg } from '../config';
import { Input } from '../input';
import { toScreen, Vec2 } from '../iso';
import { Hittable } from './Arrows';
import { Fx } from './Fx';
import { Player } from './Player';

interface Slash {
  swing: number;
  phase: 'telegraph' | 'strike';
  t: number;
}

interface Effect {
  kind: 'cone' | 'slam';
  ox: number;
  oy: number;
  base: number;
  sign: number;
  age: number;
}

const screen = { x: 0, y: 0 };
const SLASH_LIGHT = 0xb070ff;
const SLASH_WHITE = 0xf0e0ff;

// Toggle skill: press R to arm it, and the next attack becomes three consecutive sword swings
// (cone right to left, cone left to right, then a forward slam). Each swing is telegraphed first.
export class SwordSlash {
  armed = false;
  cooldown = 0;
  private slash: Slash | null = null;
  private effects: Effect[] = [];
  private time = 0;
  private orbit = 0;
  private ground: Phaser.GameObjects.Graphics;
  private flash: Phaser.GameObjects.Graphics;
  private swordGfx: Phaser.GameObjects.Graphics;
  private swordGlow: Phaser.GameObjects.Graphics;
  private sword = { x: 0, y: 0, angle: 0, unsheathed: 0, placed: false };
  private wispTimer = 0;

  onDamage: (target: Hittable, amount: number, x: number, y: number) => void = () => {};

  constructor(scene: Phaser.Scene, private fx: Fx, private targets: () => readonly Hittable[]) {
    this.ground = scene.add.graphics().setDepth(-5e8).setBlendMode(Phaser.BlendModes.ADD);
    this.flash = scene.add.graphics().setDepth(9e5).setBlendMode(Phaser.BlendModes.ADD);
    this.swordGfx = scene.add.graphics();
    this.swordGlow = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
  }

  get active(): boolean {
    return this.slash !== null;
  }

  // While armed or swinging, the attack button belongs to the sword instead of the bow.
  get blocksFire(): boolean {
    return cfg.abilities.swordSlash && (this.armed || this.active);
  }

  // Only a dash or teleport interrupts the combo.
  cancel(): void {
    this.slash = null;
    this.armed = false;
  }

  update(dt: number, player: Player, input: Input): void {
    this.time += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);

    if (!cfg.abilities.swordSlash) this.cancel();
    else {
      if (input.justPressed('abilityR') && !this.slash) {
        if (this.armed) this.armed = false;
        else if (this.cooldown <= 0) this.armed = true;
      }
      if (this.armed && !this.slash && input.isDown('fire')) {
        this.armed = false;
        this.slash = { swing: 0, phase: 'telegraph', t: 0 };
        this.cooldown = cfg.swordSlash.cooldown;
      }
    }

    this.advance(dt, player);
    for (let i = this.effects.length - 1; i >= 0; i--) {
      this.effects[i].age += dt;
      if (this.effects[i].age >= cfg.swordSlash.effectTime) this.effects.splice(i, 1);
    }

    this.ground.clear();
    this.flash.clear();
    if (this.slash?.phase === 'telegraph') this.drawTelegraph(player, this.slash);
    for (const e of this.effects) this.drawEffect(e);
    this.updateSword(dt, player);
  }

  private advance(dt: number, player: Player): void {
    const s = this.slash;
    if (!s) return;
    const c = cfg.swordSlash;
    s.t += dt;
    if (s.phase === 'telegraph' && s.t >= c.telegraphTime) {
      this.strike(player, s.swing);
      s.phase = 'strike';
      s.t = 0;
    } else if (s.phase === 'strike' && s.t >= c.slashTime) {
      s.swing++;
      s.phase = 'telegraph';
      s.t = 0;
      if (s.swing > 2) this.slash = null;
    }
  }

  private strike(player: Player, swing: number): void {
    const c = cfg.swordSlash;
    const base = Math.atan2(player.aimY, player.aimX);
    if (swing < 2) {
      const half = Phaser.Math.DegToRad(c.coneAngle) / 2;
      for (const t of this.targets()) {
        if (!t.alive) continue;
        const dx = t.x - player.x;
        const dy = t.y - player.y;
        const d = Math.hypot(dx, dy);
        if (d > c.coneRange + t.radius) continue;
        const pad = d > t.radius ? Math.asin(t.radius / d) : Math.PI;
        const angle = d > 1e-3 ? Math.acos(Phaser.Math.Clamp((dx * player.aimX + dy * player.aimY) / d, -1, 1)) : 0;
        if (angle <= half + pad) this.onDamage(t, c.coneDamage, t.x, t.y);
      }
      // Swing 1 goes right to left, swing 2 back from left to right.
      this.effects.push({ kind: 'cone', ox: player.x, oy: player.y, base, sign: swing === 0 ? -1 : 1, age: 0 });
      return;
    }

    for (const t of this.targets()) {
      if (!t.alive) continue;
      const rx = t.x - player.x;
      const ry = t.y - player.y;
      const along = rx * player.aimX + ry * player.aimY;
      const side = -rx * player.aimY + ry * player.aimX;
      if (Math.abs(side) <= c.slamWidth / 2 + t.radius && along >= -t.radius && along <= c.slamLength + t.radius) {
        this.onDamage(t, c.slamDamage, t.x, t.y);
      }
    }
    this.effects.push({ kind: 'slam', ox: player.x, oy: player.y, base, sign: 1, age: 0 });
    this.fx.addShake(cfg.camera.shakeOnCast * 2);
    this.slamBurst(player.x, player.y, player.aimX, player.aimY);
  }

  private slamBurst(x: number, y: number, dirX: number, dirY: number): void {
    const c = cfg.swordSlash;
    const px = cfg.render.pixelScale;
    for (let i = 0; i < 40; i++) {
      const along = Math.random() * c.slamLength;
      const side = (Math.random() - 0.5) * c.slamWidth;
      toScreen(x + dirX * along - dirY * side, y + dirY * along + dirX * side, screen);
      const smoke = Math.random() < 0.4;
      this.fx.particle({
        texture: smoke ? Tex.smoke : Tex.glow,
        x: screen.x,
        y: screen.y - 4 * px,
        life: 0.3 + Math.random() * 0.4,
        from: smoke ? px * 0.6 : 0.5,
        to: smoke ? px * 1.8 : 0.1,
        alpha: 0.9,
        tint: smoke ? 0x3a2a55 : SLASH_LIGHT,
        additive: !smoke,
        vx: (Math.random() - 0.5) * 60,
        vy: -30 - Math.random() * 60,
        depth: screen.y + 2,
      });
    }
  }

  private world(x: number, y: number, angle: number, r: number): Vec2 {
    return toScreen(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
  }

  private drawTelegraph(player: Player, s: Slash): void {
    const c = cfg.swordSlash;
    const p = Math.min(1, s.t / c.telegraphTime);
    const g = this.ground;
    const base = Math.atan2(player.aimY, player.aimX);
    let poly: Vec2[];
    if (s.swing < 2) {
      const half = Phaser.Math.DegToRad(c.coneAngle) / 2;
      poly = [toScreen(player.x, player.y)];
      for (let i = 0; i <= 16; i++) {
        poly.push(this.world(player.x, player.y, base - half + (i / 16) * half * 2, c.coneRange));
      }
    } else {
      const hw = c.slamWidth / 2;
      const corner = (side: number, along: number) =>
        toScreen(
          player.x + player.aimX * along - player.aimY * hw * side,
          player.y + player.aimY * along + player.aimX * hw * side,
        );
      poly = [corner(-1, 0), corner(1, 0), corner(1, c.slamLength), corner(-1, c.slamLength)];
    }
    g.fillStyle(SLASH_LIGHT, 0.06 + 0.22 * p);
    g.fillPoints(poly, true);
    g.lineStyle(2, SLASH_LIGHT, 0.4 + 0.5 * p);
    g.strokePoints(poly, true);
  }

  private drawEffect(e: Effect): void {
    const c = cfg.swordSlash;
    const g = this.flash;
    const fade = 1 - Math.max(0, (e.age - c.slashTime) / Math.max(c.effectTime - c.slashTime, 1e-3));
    if (e.kind === 'cone') {
      const half = Phaser.Math.DegToRad(c.coneAngle) / 2;
      const prog = Math.min(1, e.age / c.slashTime);
      const eased = 1 - (1 - prog) * (1 - prog);
      const start = e.base - e.sign * half;
      const span = e.sign * half * 2 * eased;
      const r0 = c.coneRange * 0.4;
      const r1 = c.coneRange;
      const slices = 14;
      for (let k = 0; k < slices; k++) {
        const a0 = start + span * (k / slices);
        const a1 = start + span * ((k + 1) / slices);
        g.fillStyle(SLASH_LIGHT, fade * (0.12 + 0.6 * Math.pow(k / slices, 1.5)));
        g.fillPoints(
          [this.world(e.ox, e.oy, a0, r1), this.world(e.ox, e.oy, a1, r1), this.world(e.ox, e.oy, a1, r0), this.world(e.ox, e.oy, a0, r0)],
          true,
        );
      }
      const lead = start + span;
      const a = this.world(e.ox, e.oy, lead, r0);
      const b = this.world(e.ox, e.oy, lead, r1);
      g.lineStyle(3, SLASH_WHITE, fade);
      g.lineBetween(a.x, a.y, b.x, b.y);
      return;
    }

    // Slam: the whole rectangle flashes, a shockwave rolls out and cracks run along it.
    const dirX = Math.cos(e.base);
    const dirY = Math.sin(e.base);
    const hw = c.slamWidth / 2;
    const corner = (side: number, along: number) =>
      toScreen(e.ox + dirX * along - dirY * hw * side, e.oy + dirY * along + dirX * hw * side);
    const poly = [corner(-1, 0), corner(1, 0), corner(1, c.slamLength), corner(-1, c.slamLength)];
    g.fillStyle(SLASH_LIGHT, 0.55 * fade);
    g.fillPoints(poly, true);
    g.lineStyle(3, SLASH_WHITE, fade);
    g.strokePoints(poly, true);

    const wave = Math.min(1, e.age / (c.effectTime * 0.7));
    const ring = toScreen(e.ox + dirX * c.slamLength * wave, e.oy + dirY * c.slamLength * wave);
    g.lineStyle(3, SLASH_WHITE, fade * (1 - wave * 0.5));
    g.strokeEllipse(ring.x, ring.y, c.slamWidth * 1.6 * (0.4 + wave), c.slamWidth * 0.8 * (0.4 + wave));

    g.lineStyle(2, SLASH_WHITE, fade);
    let prev = corner(0, 0);
    for (let i = 1; i <= 8; i++) {
      const along = (c.slamLength * i) / 8;
      const jitter = Math.sin(i * 12.9898 + e.base * 7) * hw * 0.5;
      const next = toScreen(e.ox + dirX * along - dirY * jitter, e.oy + dirY * along + dirX * jitter);
      g.lineBetween(prev.x, prev.y, next.x, next.y);
      prev = next;
    }
  }

  // The sheathed sword circles the player like the fairies, on a wider ring. It unsheathes when armed
  // and flies to each swing's start while the combo plays out.
  private updateSword(dt: number, player: Player): void {
    const gfx = this.swordGfx;
    const glow = this.swordGlow;
    gfx.clear();
    glow.clear();
    if (!cfg.abilities.swordSlash) return;

    const c = cfg.swordSlash;
    const px = cfg.render.pixelScale;
    const s = this.slash;
    const P = toScreen(player.x, player.y);
    const base = Math.atan2(player.aimY, player.aimX);
    let tx: number;
    let ty: number;
    let tAngle: number;
    let unsheathed = 0;
    let rate = 10;
    let depth: number;

    if (!s) {
      this.orbit += dt * c.orbitSpeed * (this.armed ? 2 : 1);
      tx = P.x + Math.cos(this.orbit) * c.orbitRadius;
      ty = P.y - c.height * px + Math.sin(this.orbit) * c.orbitRadius * 0.5;
      tAngle = this.orbit + Math.PI / 2;
      unsheathed = this.armed ? 1 : 0;
      depth = P.y + (Math.sin(this.orbit) < 0 ? -0.6 : 0.6);
    } else {
      rate = 28;
      unsheathed = 1;
      if (s.swing < 2) {
        const half = Phaser.Math.DegToRad(c.coneAngle) / 2;
        const sign = s.swing === 0 ? -1 : 1;
        const sweep = s.phase === 'strike' ? Math.min(1, s.t / c.slashTime) : 0;
        const a = base - sign * half + sign * half * 2 * sweep;
        const pos = this.world(player.x, player.y, a, c.coneRange * 0.65);
        const out = toScreen(Math.cos(a), Math.sin(a));
        tx = pos.x;
        ty = pos.y - 10 * px;
        tAngle = Math.atan2(out.y, out.x);
      } else if (s.phase === 'telegraph') {
        tx = P.x;
        ty = P.y - 38 * px;
        tAngle = -Math.PI / 2;
      } else {
        const pos = this.world(player.x, player.y, base, c.slamLength * 0.55);
        const out = toScreen(player.aimX, player.aimY);
        tx = pos.x;
        ty = pos.y - 6 * px;
        tAngle = Math.atan2(out.y, out.x);
      }
      depth = ty + 1;
    }

    const sw = this.sword;
    if (!sw.placed) {
      sw.x = tx;
      sw.y = ty;
      sw.angle = tAngle;
      sw.placed = true;
    }
    const follow = 1 - Math.exp(-rate * dt);
    sw.x += (tx - sw.x) * follow;
    sw.y += (ty - sw.y) * follow;
    sw.angle += Phaser.Math.Angle.Wrap(tAngle - sw.angle) * follow;
    sw.unsheathed += (unsheathed - sw.unsheathed) * Math.min(1, dt * 15);
    const u = sw.unsheathed;

    gfx.setDepth(depth);
    glow.setDepth(depth - 0.1);
    const cos = Math.cos(sw.angle);
    const sin = Math.sin(sw.angle);
    const at = (d: number): Vec2 => ({ x: sw.x + cos * d * px, y: sw.y + sin * d * px });
    const pulse = 0.8 + 0.2 * Math.sin(this.time * 14);

    // Grip and cross guard.
    const g0 = at(-1);
    const g1 = at(4);
    gfx.lineStyle(2.4 * px, 0x07000d, 1);
    gfx.lineBetween(g0.x, g0.y, g1.x, g1.y);
    gfx.lineStyle(1.4 * px, 0x4a1a7a, 1);
    gfx.lineBetween(g0.x, g0.y, g1.x, g1.y);
    const gl = { x: g1.x - sin * 3.5 * px, y: g1.y + cos * 3.5 * px };
    const gr = { x: g1.x + sin * 3.5 * px, y: g1.y - cos * 3.5 * px };
    gfx.lineStyle(1.6 * px, 0x7a2fd0, 1);
    gfx.lineBetween(gl.x, gl.y, gr.x, gr.y);

    // Scabbard fades out as the blade slides into view.
    const sheathEnd = at(20);
    if (u < 0.99) {
      gfx.lineStyle(3.6 * px, 0x07000d, 1 - u);
      gfx.lineBetween(g1.x, g1.y, sheathEnd.x, sheathEnd.y);
      gfx.lineStyle(2.4 * px, 0x2a0a4a, 1 - u);
      gfx.lineBetween(g1.x, g1.y, sheathEnd.x, sheathEnd.y);
      glow.lineStyle(6 * px, 0x7a2fd0, 0.3 * (1 - u));
      glow.lineBetween(g1.x, g1.y, sheathEnd.x, sheathEnd.y);
    }
    if (u > 0.01) {
      const bladeEnd = at(4 + 18 * u);
      glow.lineStyle(7 * px, 0xa060ff, 0.5 * u * pulse);
      glow.lineBetween(g1.x, g1.y, bladeEnd.x, bladeEnd.y);
      gfx.lineStyle(2.2 * px, 0xe0c8ff, u);
      gfx.lineBetween(g1.x, g1.y, bladeEnd.x, bladeEnd.y);
      gfx.lineStyle(1 * px, 0xffffff, u);
      gfx.lineBetween(g1.x, g1.y, bladeEnd.x, bladeEnd.y);

      this.wispTimer += dt * 22 * u;
      while (this.wispTimer >= 1) {
        this.wispTimer -= 1;
        this.fx.particle({
          x: bladeEnd.x + (Math.random() - 0.5) * 4,
          y: bladeEnd.y + (Math.random() - 0.5) * 4,
          life: 0.25 + Math.random() * 0.25,
          from: 0.25,
          to: 0.05,
          alpha: 0.9,
          tint: Math.random() < 0.5 ? 0xa060ff : 0x6a20c0,
          vx: (Math.random() - 0.5) * 20,
          vy: -10 - Math.random() * 20,
          depth: depth + 1,
        });
      }
    }
    glow.fillStyle(0xa060ff, 0.35 + 0.25 * u);
    glow.fillCircle(g1.x, g1.y, 2.2 * px);
  }
}
