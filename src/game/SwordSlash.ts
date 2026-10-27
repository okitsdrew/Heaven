import Phaser from 'phaser';
import { Tex } from '../art/placeholders';
import { cfg } from '../config';
import { Input } from '../input';
import { toScreen, Vec2 } from '../iso';
import { Hittable } from './Arrows';
import { actionFor, canUse } from '../skills';
import { Fx } from './Fx';
import { drawSwordArt, flame, PURPLE_SWORD } from './swordArt';
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
const FIRE = [0x7a2fd0, 0xb070ff, 0xf0e0ff];
const SLASH_WHITE = 0xf0e0ff;

// Press R to arm it for a few seconds. The next three attack clicks become sword swings, one per click
// (cone right to left, cone left to right, then a forward slam). Each swing is telegraphed first.
export class SwordSlash {
  armed = false;
  cooldown = 0;
  private charges = 0;
  private armTimer = 0;
  private slash: Slash | null = null;
  private effects: Effect[] = [];
  private time = 0;
  private orbit = 0;
  private ground: Phaser.GameObjects.Graphics;
  private flash: Phaser.GameObjects.Graphics;
  private swordGfx: Phaser.GameObjects.Graphics;
  private swordGlow: Phaser.GameObjects.Graphics;
  private sword = { x: 0, y: 0, angle: 0, placed: false };
  private wispState = { wisp: 0 };
  private heat = 0;

  onDamage: (target: Hittable, amount: number, x: number, y: number) => void = () => {};

  constructor(scene: Phaser.Scene, private fx: Fx, private targets: () => readonly Hittable[]) {
    this.ground = scene.add.graphics().setDepth(-5e8).setBlendMode(Phaser.BlendModes.ADD);
    this.flash = scene.add.graphics().setDepth(9e5).setBlendMode(Phaser.BlendModes.ADD);
    this.swordGfx = scene.add.graphics();
    this.swordGlow = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
  }

  // Which arms flap: right on the first swing, left on the second, both on the slam.
  flapArms(): { left: boolean; right: boolean } {
    const swing = this.slash?.swing;
    return { right: swing === 0 || swing === 2, left: swing === 1 || swing === 2 };
  }

  get active(): boolean {
    return this.slash !== null;
  }

  // While armed or swinging, the attack button belongs to the sword instead of the bow.
  get blocksFire(): boolean {
    return canUse('swordSlash') && (this.armed || this.active);
  }

  // A dash or teleport cancels a swing that is already striking; that swing stays spent.
  // A swing still in its telegraph is untouched here: update() shelves it until the dash or teleport ends.
  interrupt(): void {
    const s = this.slash;
    if (!s || s.phase !== 'strike') return;
    this.effects.length = 0;
    this.endSwing();
  }

  cancel(): void {
    this.slash = null;
    this.armed = false;
    this.charges = 0;
  }

  private endSwing(): void {
    this.slash = null;
    if (this.charges <= 0) this.armed = false;
  }

  update(dt: number, player: Player, input: Input): void {
    this.time += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);

    const shelved = player.invincible;
    if (!canUse('swordSlash')) this.cancel();
    else if (!shelved) {
      const key = actionFor('swordSlash');
      if (key && input.justPressed(key) && !this.slash) {
        if (this.armed) this.cancel();
        else if (this.cooldown <= 0) {
          this.armed = true;
          this.charges = cfg.swordSlash.charges;
          this.armTimer = cfg.swordSlash.armTime;
          this.cooldown = cfg.swordSlash.cooldown;
        }
      }
      if (this.armed) {
        this.armTimer -= dt;
        if (this.armTimer <= 0 && !this.slash) this.cancel();
      }
      // Each click starts the next swing at once.
      if (this.armed && !this.slash && input.justPressed('fire')) {
        const swing = cfg.swordSlash.charges - this.charges;
        this.charges--;
        this.slash = { swing: Math.min(swing, 2), phase: 'telegraph', t: 0 };
      }
    }

    if (!shelved) this.advance(dt, player);
    for (let i = this.effects.length - 1; i >= 0; i--) {
      this.effects[i].age += dt;
      if (this.effects[i].age >= cfg.swordSlash.effectTime) this.effects.splice(i, 1);
    }

    this.ground.clear();
    this.flash.clear();
    if (this.slash?.phase === 'telegraph') this.drawTelegraph(player, this.slash);
    for (const e of this.effects) {
      this.drawEffect(e);
      if (e.kind === 'cone' && e.age <= cfg.swordSlash.slashTime) this.leadEmbers(e);
    }
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
      this.endSwing();
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
    this.fx.addShake(c.slamShake);
    this.slamBurst(player.x, player.y, player.aimX, player.aimY);
  }

  private slamBurst(x: number, y: number, dirX: number, dirY: number): void {
    const c = cfg.swordSlash;
    const px = cfg.render.pixelScale;
    // Explosion flash at the impact end of the rectangle and along its middle.
    for (const f of [0.55, 1]) {
      toScreen(x + dirX * c.slamLength * f, y + dirY * c.slamLength * f, screen);
      this.fx.particle({
        x: screen.x,
        y: screen.y - 6 * px,
        life: 0.3,
        from: 3 + 3 * f,
        to: 7 + 4 * f,
        alpha: 1,
        tint: 0xe6d0ff,
        depth: 1e6,
      });
    }
    for (let i = 0; i < 70; i++) {
      const along = Math.random() * c.slamLength;
      const side = (Math.random() - 0.5) * c.slamWidth;
      toScreen(x + dirX * along - dirY * side, y + dirY * along + dirX * side, screen);
      const smoke = Math.random() < 0.3;
      this.fx.particle({
        texture: smoke ? Tex.smoke : Tex.glow,
        x: screen.x,
        y: screen.y - 4 * px,
        life: 0.3 + Math.random() * 0.5,
        from: smoke ? px * 0.6 : 0.4 + Math.random() * 0.4,
        to: smoke ? px * 2 : 0.1,
        alpha: 0.9,
        tint: smoke ? 0x3a2a55 : FIRE[Math.floor(Math.random() * 3)],
        additive: !smoke,
        vx: (Math.random() - 0.5) * 90,
        vy: -50 - Math.random() * 110,
        depth: screen.y + 2,
      });
    }
  }

  // Purple fire thrown off the leading edge of a cone swing.
  private leadEmbers(e: Effect): void {
    const c = cfg.swordSlash;
    const half = Phaser.Math.DegToRad(c.coneAngle) / 2;
    const prog = Math.min(1, e.age / c.slashTime);
    const lead = e.base - e.sign * half + e.sign * half * 2 * Math.pow(prog, c.sweepPower);
    for (let i = 0; i < 6; i++) {
      const r = c.coneRange * (0.4 + Math.random() * 0.6);
      const p = this.world(e.ox, e.oy, lead, r);
      this.fx.particle({
        x: p.x,
        y: p.y - 6 * cfg.render.pixelScale,
        life: 0.25 + Math.random() * 0.25,
        from: 0.4 + Math.random() * 0.3,
        to: 0.05,
        alpha: 0.95,
        tint: FIRE[Math.floor(Math.random() * 3)],
        vx: (Math.random() - 0.5) * 40,
        vy: -30 - Math.random() * 70,
        depth: p.y + 2,
      });
    }
  }

  private flame(g: Phaser.GameObjects.Graphics, x: number, y: number, height: number, width: number, seed: number, alpha: number): void {
    flame(g, x, y, height, width, seed, alpha, this.time, FIRE);
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
      const eased = Math.pow(prog, c.sweepPower);
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
      g.lineStyle(4, SLASH_WHITE, fade);
      g.lineBetween(a.x, a.y, b.x, b.y);

      // Purple fire erupting across the swept area, tallest at the leading edge.
      const px = cfg.render.pixelScale;
      const cols = 12;
      for (let k = 0; k <= cols; k++) {
        const f = k / cols;
        const ang = start + span * f;
        for (let j = 0; j < 4; j++) {
          const r = r0 + (r1 - r0) * ((j + 0.5) / 4);
          const p = this.world(e.ox, e.oy, ang, r);
          const flick = 0.6 + 0.4 * Math.sin(this.time * 18 + k * 2.1 + j * 1.3);
          this.flame(g, p.x, p.y, px * (6 + 16 * f * f) * flick, px * 3, k * 3 + j, fade * (0.3 + 0.7 * f));
        }
      }
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

    const flash = Math.max(0, 1 - e.age / 0.12);
    if (flash > 0) {
      g.fillStyle(SLASH_WHITE, 0.8 * flash);
      g.fillPoints(poly, true);
    }
    const px = cfg.render.pixelScale;
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 9; j++) {
        const p = toScreen(
          e.ox + dirX * c.slamLength * ((j + 0.5) / 9) - dirY * hw * (((i + 0.5) / 6) * 2 - 1),
          e.oy + dirY * c.slamLength * ((j + 0.5) / 9) + dirX * hw * (((i + 0.5) / 6) * 2 - 1),
        );
        const flick = 0.6 + 0.4 * Math.sin(this.time * 16 + i * 1.7 + j * 2.3);
        this.flame(g, p.x, p.y, px * (10 + 14 * flick) * fade, px * 3.5, i * 9 + j, fade * 0.8);
      }
    }

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

  // The sword circles the player like the fairies, on a wider ring, blade out. It flies to each swing's start
  // and winds up slowly during the telegraph, then whips through the strike.
  private updateSword(dt: number, player: Player): void {
    const gfx = this.swordGfx;
    const glow = this.swordGlow;
    gfx.clear();
    glow.clear();
    if (!canUse('swordSlash')) return;

    const c = cfg.swordSlash;
    const px = cfg.render.pixelScale;
    const s = this.slash;
    const P = toScreen(player.x, player.y);
    const base = Math.atan2(player.aimY, player.aimX);
    let tx: number;
    let ty: number;
    let tAngle: number;
    let rate = 10;
    let depth: number;

    if (!s) {
      this.orbit += dt * c.orbitSpeed * (this.armed ? 2 : 1);
      tx = P.x + Math.cos(this.orbit) * c.orbitRadius;
      ty = P.y - c.height * px + Math.sin(this.orbit) * c.orbitRadius * 0.5;
      tAngle = this.orbit + Math.PI / 2;
      depth = P.y + (Math.sin(this.orbit) < 0 ? -0.6 : 0.6);
    } else {
      const wind = s.phase === 'telegraph' ? Math.min(1, s.t / c.telegraphTime) : 1;
      const windEase = wind * wind * (3 - 2 * wind);
      const strike = s.phase === 'strike' ? Math.min(1, s.t / c.slashTime) : 0;
      const fast = Math.pow(strike, c.sweepPower);
      rate = s.phase === 'strike' ? 70 : 12;
      if (s.swing < 2) {
        const half = Phaser.Math.DegToRad(c.coneAngle) / 2;
        const sign = s.swing === 0 ? -1 : 1;
        const back = Phaser.Math.DegToRad(c.windupAngle) * windEase;
        const from = base - sign * (half + back);
        const a = from + sign * (half * 2 + back) * fast;
        const pos = this.world(player.x, player.y, a, c.coneRange * 0.65);
        const out = toScreen(Math.cos(a), Math.sin(a));
        tx = pos.x;
        ty = pos.y - 10 * px;
        tAngle = Math.atan2(out.y, out.x);
      } else if (s.phase === 'telegraph') {
        tx = P.x;
        ty = P.y - (30 + 14 * windEase) * px;
        tAngle = -Math.PI / 2;
      } else {
        const pos = this.world(player.x, player.y, base, c.slamLength * 0.55 * Math.max(0.15, fast));
        const out = toScreen(player.aimX, player.aimY);
        tx = pos.x;
        ty = pos.y - (6 + 32 * (1 - fast)) * px;
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
    const lit = this.armed || this.active ? 1 : 0;
    this.heat += (lit - this.heat) * Math.min(1, dt * 6);
    const heat = this.heat;

    drawSwordArt(gfx, glow, this.fx, sw, px, heat, this.time, dt, depth, PURPLE_SWORD, this.wispState);
  }
}
