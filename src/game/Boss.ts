import Phaser from 'phaser';
import { sfx } from '../audio';
import { Tex } from '../art/placeholders';
import { cfg } from '../config';
import { toScreen, Vec2 } from '../iso';
import { stats } from '../skills';
import { Hittable } from './Arrows';
import { Fx } from './Fx';
import { Player } from './Player';
import { drawHaze } from './haze';
import { drawSwordArt, flame, RED_SWORD } from './swordArt';
import { PlayerView } from './PlayerView';

// A vivid, flickering purple shape with a red aura; its own swing is the red version of the Sword Slash.
const BOSS_TONE = 0xc060ff;
const RED = 0xff3b3b;

type State = 'spawn' | 'chase' | 'dash' | 'telegraph' | 'distort' | 'strike' | 'recover';

// What the boss copies from the player when it spawns.
interface Snapshot {
  moveSpeed: number;
  teleportDistance: number;
}

interface Effect {
  ox: number;
  oy: number;
  base: number;
  age: number;
}

// Reality Distortion: the sword plunges in first, then he lifts off the ground for the rest of the windup.
const STAB_TIME = 0.35;
const HOVER_HEIGHT = 16;
const BLAST_TIME = 2;
const FIRE_TIME = 0.7;
const SWEEP_TIME = 0.1;
const KILL = 1e9;
const screen = { x: 0, y: 0 };

// A bright purple copy of the player whose only attack is a red Sword Slash swing, telegraphed first.
// It teleports close, winds up behind a red orbiting sword, then swings it in a burst of fire.
// Anything the swing touches dies at once, the player included. Contact is harmless.
// The simulation is flat world space; the view reuses PlayerView on a stand-in Player.
export class Boss implements Hittable {
  readonly kind = 'boss' as const;
  readonly id = -1;
  x = 0;
  y = 0;
  radius = 0;
  alive = false;
  hp = 0;
  maxHp = 0;

  onKilled: (x: number, y: number) => void = () => {};
  // The swing kills whatever else it touches.
  onSlay: (target: Hittable) => void = () => {};
  // Damage from burn or poison ticking, for the floating numbers.
  onDot: (x: number, y: number, amount: number) => void = () => {};

  // Set each frame while a Festering Lotus is out.
  lure: Vec2 | null = null;
  // Burn and cold on him, like on any enemy: burn ticks damage and cold slows his walk.
  private burnLeft = 0;
  private burnAcc = 0;
  private coldLeft = 0;
  private poisonStacks = 0;
  private poisonLeft = 0;
  private poisonAcc = 0;
  private sim = new Player();
  private view: PlayerView;
  private state: State = 'chase';
  private timer = 0;
  private teleportGap = 0;
  private snap!: Snapshot;
  private effect: Effect | null = null;
  private telegraphTotal = 0;
  private frozen = 0;
  private freezeCooldown = 0;
  private stunned = 0;
  private iceGfx: Phaser.GameObjects.Graphics;
  private stunGfx: Phaser.GameObjects.Graphics;
  private sword = { x: 0, y: 0, angle: 0, placed: false };
  // How much the orbiting sword has grown and heated while he winds up.
  private swordGrow = 1;
  // Reality Distortion: where the sword is planted, how long the windup has run, and the blast once it goes off.
  private stab = { x: 0, y: 0 };
  private distortAge = 0;
  private hoverK = 0;
  private blast: { age: number; ox: number; oy: number } | null = null;
  private blastGfx: Phaser.GameObjects.Graphics;
  private scorchGfx: Phaser.GameObjects.Graphics;
  private warnGfx: Phaser.GameObjects.Graphics;
  private swordGfx: Phaser.GameObjects.Graphics;
  private swordGlow: Phaser.GameObjects.Graphics;
  private orbit = 0;
  private heat = 0;
  private wispState = { wisp: 0 };
  private fireGfx: Phaser.GameObjects.Graphics;
  private arcGfx: Phaser.GameObjects.Graphics;
  private aura: Phaser.GameObjects.Graphics;
  private portal: Phaser.GameObjects.Graphics;
  private age = 0;
  private time = 0;
  private bar: Phaser.GameObjects.Graphics;
  private name: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, private fx: Fx, private targets: () => readonly Hittable[]) {
    this.view = new PlayerView(scene, this.sim, fx);
    this.view.setTone(BOSS_TONE, 1.6);
    this.view.setVisible(false);
    this.warnGfx = scene.add.graphics().setDepth(-1e7);
    this.scorchGfx = scene.add.graphics().setDepth(-1e7 + 1);
    this.blastGfx = scene.add.graphics().setDepth(9e5).setBlendMode(Phaser.BlendModes.ADD);
    this.iceGfx = scene.add.graphics();
    this.stunGfx = scene.add.graphics();
    this.fireGfx = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.arcGfx = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.swordGfx = scene.add.graphics();
    this.swordGlow = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.aura = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.portal = scene.add.graphics();
    this.bar = scene.add.graphics().setScrollFactor(0).setDepth(5e6);
    this.name = scene.add
      .text(0, 0, 'ACCURSED MIMIC', { fontFamily: 'monospace', fontSize: '13px', color: '#d9b8ff' })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(5e6)
      .setVisible(false);
  }

  // Appears off to one side of the player and snapshots their current build.
  spawn(px: number, py: number): void {
    const b = cfg.boss;
    const angle = Math.random() * Math.PI * 2;
    this.x = px + Math.cos(angle) * b.spawnDistance;
    this.y = py + Math.sin(angle) * b.spawnDistance;
    this.radius = b.radius * b.size;
    this.view.sizeMult = b.size;
    this.view.flicker = b.flicker;
    this.view.rise = 0;
    this.age = 0;
    this.maxHp = this.hp = b.hp;
    this.alive = true;
    this.poisonStacks = 0;
    this.burnLeft = 0;
    this.burnAcc = 0;
    this.coldLeft = 0;
    this.lure = null;
    this.state = 'spawn';
    this.timer = 0;
    this.teleportGap = 0;
    this.effect = null;
    this.blast = null;
    this.hoverK = 0;
    this.view.hover = 0;
    this.frozen = 0;
    this.freezeCooldown = 0;
    this.stunned = 0;
    this.view.setFrozen(false);
    this.sword.placed = false;
    this.snap = { moveSpeed: stats.moveSpeed(), teleportDistance: cfg.teleport.distance };
    Object.assign(this.sim, { x: this.x, y: this.y, vx: 0, vy: 0, armsUpTimer: 0 });
    this.view.setVisible(true);
    this.name.setVisible(true);
    this.faceToward(px, py);
  }

  // Freezes him solid. He picks up where he left off afterwards, and it can only land once per cooldown.
  freeze(): void {
    if (!this.targetable || this.frozen > 0 || this.freezeCooldown > 0) return;
    this.frozen = cfg.iceStorm.bossFreeze;
    this.freezeCooldown = cfg.iceStorm.bossFreezeCooldown;
  }

  // Sets him alight; a fresh application restarts the timer.
  ignite(): void {
    if (!this.targetable) return;
    this.burnLeft = cfg.fireWave.burnTime;
  }

  // Chills him: his walk slows for a few seconds.
  chill(): void {
    if (!this.targetable) return;
    this.coldLeft = cfg.iceStorm.coldTime;
  }

  // Adds a poison stack and restarts the timer.
  poison(stacks = 1): void {
    if (!this.targetable) return;
    this.poisonStacks += stacks;
    this.poisonLeft = cfg.lotus.poisonTime;
  }

  private dot(amount: number): void {
    this.damage(amount);
    this.onDot(this.x, this.y, amount);
  }

  // Cancels whatever attack he was starting and holds him still. Another hit restarts the timer.
  stun(seconds: number): void {
    if (!this.targetable || seconds <= 0) return;
    this.stunned = seconds;
    if (this.state === 'telegraph' || this.state === 'distort' || this.state === 'strike' || this.state === 'dash') {
      this.state = 'chase';
      this.sim.dashTime = 0;
    }
  }

  // Can be hit once it is out of the portal.
  get targetable(): boolean {
    return this.alive && this.state !== 'spawn';
  }

  clear(): void {
    this.alive = false;
    this.frozen = 0;
    this.stunned = 0;
    this.view.setFrozen(false);
    this.iceGfx.clear();
    this.stunGfx.clear();
    this.effect = null;
    this.sword.placed = false;
    this.view.setVisible(false);
    this.name.setVisible(false);
    this.fireGfx.clear();
    this.arcGfx.clear();
    this.swordGfx.clear();
    this.swordGlow.clear();
    this.aura.clear();
    this.portal.clear();
    this.bar.clear();
    this.blast = null;
    this.blastGfx.clear();
    this.scorchGfx.clear();
    this.warnGfx.clear();
    this.view.hover = 0;
    this.hoverK = 0;
  }

  damage(amount: number): void {
    if (!this.targetable) return;
    this.hp -= amount;
    this.view.flash();
    if (this.hp > 0) return;
    this.alive = false;
    this.view.setVisible(false);
    this.name.setVisible(false);
    this.aura.clear();
    this.swordGfx.clear();
    this.swordGlow.clear();
    this.bar.clear();
    this.onKilled(this.x, this.y);
  }

  // Returns true if the swing caught the player this frame.
  update(dt: number, px: number, py: number, playerSafe: boolean, playerRadius: number, playerDead = false): boolean {
    this.freezeCooldown = Math.max(0, this.freezeCooldown - dt);
    // Frozen solid: nothing advances, so every timer resumes exactly where it was.
    if (this.alive && this.frozen > 0) {
      this.frozen -= dt;
      this.view.setFrozen(this.frozen > 0);
      return false;
    }
    if (this.effect) {
      this.effect.age += dt;
      if (this.effect.age >= FIRE_TIME) this.effect = null;
    }
    if (this.blast) {
      this.blast.age += dt;
      if (this.blast.age >= BLAST_TIME) this.blast = null;
    }
    let hit = false;
    if (!this.alive) return hit;
    const b = cfg.boss;
    // He goes after the Festering Lotus rather than the player while one is out.
    const tx = this.lure ? this.lure.x : px;
    const ty = this.lure ? this.lure.y : py;
    if (this.poisonStacks > 0) {
      this.poisonLeft -= dt;
      this.poisonAcc += dt;
      const interval = Math.max(cfg.lotus.poisonTick, 0.05);
      while (this.poisonAcc >= interval && this.alive) {
        this.poisonAcc -= interval;
        this.dot(this.poisonStacks * cfg.lotus.poisonDps * interval);
      }
      if (this.poisonLeft <= 0) this.poisonStacks = 0;
    }
    if (this.burnLeft > 0) {
      this.burnLeft -= dt;
      this.burnAcc += dt;
      const interval = Math.max(cfg.fireWave.burnTick, 0.05);
      while (this.burnAcc >= interval && this.alive) {
        this.burnAcc -= interval;
        this.dot(cfg.fireWave.burnDps * interval);
      }
    }
    if (this.coldLeft > 0) this.coldLeft -= dt;
    if (!this.alive) return false;
    if (this.stunned > 0) {
      this.stunned -= dt;
      this.faceToward(tx, ty);
      this.sim.vx = 0;
      this.sim.vy = 0;
      return false;
    }
    const dx = tx - this.x;
    const dy = ty - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    this.teleportGap = Math.max(0, this.teleportGap - dt);
    this.age += dt;

    let vx = 0;
    let vy = 0;
    if (this.state === 'spawn') {
      // A portal opens, then he rises out of it with his hands raised.
      const t = (this.age - b.portalTime) / Math.max(b.riseTime, 1e-3);
      this.view.rise = Math.min(1, Math.max(0, t));
      this.view.rise = this.view.rise * this.view.rise * (3 - 2 * this.view.rise);
      this.faceToward(tx, ty);
      if (t >= 1) {
        this.view.rise = 1;
        this.state = 'chase';
      }
    } else if (this.state === 'dash') {
      // The player slipped out of range mid-attack: close the gap at dash speed, then wind up again.
      const speed = cfg.dash.distance / cfg.dash.duration;
      const step = Math.min(speed * dt, Math.max(0, dist - b.closeDistance * 0.8));
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
      this.faceToward(tx, ty);
      this.sim.dashTime = cfg.dash.duration;
      if (dist - step <= b.closeDistance * 0.8 + 1e-3) {
        this.sim.dashTime = 0;
        this.state = 'telegraph';
        // A dash cancels the attack: the windup starts over in full.
        this.timer = this.telegraphTotal = b.windup;
      }
    } else if (this.state === 'chase') {
      this.faceToward(tx, ty);
      if (dist <= b.closeDistance) {
        this.beginAttack();
      } else if (this.teleportGap <= 0) {
        // Blink toward the player, stopping inside close range rather than overshooting.
        this.teleportBy(dx / dist, dy / dist, Math.min(this.snap.teleportDistance, dist - b.closeDistance * 0.5));
      } else {
        const speed = this.snap.moveSpeed * b.walkSpeedMult * (this.coldLeft > 0 ? 1 - cfg.iceStorm.slow : 1);
        vx = (dx / dist) * speed;
        vy = (dy / dist) * speed;
        this.x += vx * dt;
        this.y += vy * dt;
      }
    } else if (this.state === 'telegraph' && dist > cfg.swordSlash.coneRange * b.chaseRangeMult) {
      this.state = 'dash';
      this.view.onDashStart();
    } else if (this.state === 'telegraph') {
      this.timer -= dt;
      // Aim is fixed from the moment the windup starts, so moving out of the marked cone dodges the swing.
      if (this.timer <= 0) {
        hit = this.strike(px, py, playerRadius, playerSafe) || hit;
        this.state = 'strike';
        this.timer = cfg.swordSlash.slashTime;
      }
    } else if (this.state === 'distort') {
      // Rooted and facing one way; nothing he can do but wait for the blast.
      this.timer -= dt;
      this.distortAge += dt;
      if (this.timer <= 0) {
        hit = this.explode(px, py, playerRadius, playerDead) || hit;
        this.state = 'recover';
        this.timer = b.distortRecover;
      }
    } else if (this.state === 'strike') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = 'recover';
        this.timer = b.recover;
      }
    } else {
      this.timer -= dt;
      this.faceToward(tx, ty);
      if (this.timer <= 0) {
        // Now and then blink sideways instead of standing to be shot.
        if (Math.random() < b.dodgeChance) {
          const side = Math.random() < 0.5 ? -1 : 1;
          this.teleportBy((-dy / dist) * side, (dx / dist) * side, this.snap.teleportDistance);
        }
        this.state = 'chase';
      }
    }

    this.sim.x = this.x;
    this.sim.y = this.y;
    this.sim.vx = vx;
    this.sim.vy = vy;
    // Arms flap while swinging, like the player's.
    this.sim.armsUpTimer = this.state === 'telegraph' || this.state === 'distort' || this.state === 'strike' || this.state === 'spawn' ? 0.1 : 0;
    return hit;
  }

  render(realDt: number, width: number): void {
    const dt = this.frozen > 0 ? 0 : realDt;
    this.iceGfx.clear();
    this.stunGfx.clear();
    this.fireGfx.clear();
    this.arcGfx.clear();
    this.aura.clear();
    this.portal.clear();
    this.bar.clear();
    this.time += dt;
    if (this.alive) this.drawPortal();
    if (this.effect) this.drawFire(this.effect);
    const hoverTarget = this.state === 'distort' && this.distortAge > STAB_TIME ? 1 : 0;
    this.hoverK += (hoverTarget - this.hoverK) * Math.min(1, dt * 5);
    this.drawSword(dt);
    this.drawWarning();
    this.drawBlast();
    this.view.hover = this.hoverK * HOVER_HEIGHT;
    if (!this.alive) return;
    this.view.update(dt);
    this.drawAura();
    this.statusParticles();
    if (this.frozen > 0) this.drawIce();
    if (this.stunned > 0) this.drawStun();

    const w = Math.min(420, width - 40);
    const x = width / 2 - w / 2;
    this.name.setPosition(width / 2, 110);
    this.bar.fillStyle(0x14111c, 0.9).fillRect(x - 2, 114, w + 4, 12);
    this.bar.fillStyle(0xb070ff, 1).fillRect(x, 116, w * Math.max(0, this.hp / this.maxHp), 8);
  }

  // The cone swing: kills whatever is inside it and bursts into fire along its arc.
  private strike(px: number, py: number, r: number, playerSafe: boolean): boolean {
    const c = cfg.swordSlash;
    const ax = this.sim.aimX;
    const ay = this.sim.aimY;
    this.effect = { ox: this.x, oy: this.y, base: Math.atan2(ay, ax), age: 0 };
    const half = Phaser.Math.DegToRad(cfg.boss.slashConeAngle) / 2;
    const inCone = (tx: number, ty: number, tr: number) => {
      const dx = tx - this.x;
      const dy = ty - this.y;
      const d = Math.hypot(dx, dy);
      if (d > this.slashRange + tr) return false;
      const pad = d > tr ? Math.asin(tr / d) : Math.PI;
      const angle = d > 1e-3 ? Math.acos(Phaser.Math.Clamp((dx * ax + dy * ay) / d, -1, 1)) : 0;
      return angle <= half + pad;
    };
    for (const t of this.targets()) if (t.alive && t.kind !== 'boss' && inCone(t.x, t.y, t.radius)) this.onSlay(t);
    this.fx.addShake(c.slamShake * 0.5);
    sfx.play('bossSlash');
    this.burst(ax, ay);
    return !playerSafe && inCone(px, py, r);
  }

  // A block of ice around him while frozen.
  private drawIce(): void {
    const px = cfg.render.pixelScale * cfg.boss.size;
    toScreen(this.x, this.y, screen);
    const g = this.iceGfx;
    g.setDepth(screen.y + 5);
    const w = 11 * px;
    const h = 22 * px;
    const base = screen.y + 2 * px;
    const pts = [
      { x: screen.x - w, y: base - h * 0.15 },
      { x: screen.x - w * 0.8, y: base - h },
      { x: screen.x - w * 0.1, y: base - h * 1.15 },
      { x: screen.x + w * 0.7, y: base - h * 0.95 },
      { x: screen.x + w, y: base - h * 0.1 },
      { x: screen.x + w * 0.2, y: base + h * 0.05 },
    ];
    g.fillStyle(0x9fe4ff, 0.45);
    g.fillPoints(pts, true);
    g.lineStyle(2, 0xe8fbff, 0.95);
    g.strokePoints(pts, true);
    g.lineStyle(2, 0xffffff, 0.8);
    g.lineBetween(pts[1].x + 4, pts[1].y + 6, pts[1].x + 4, pts[0].y - 4);
    g.lineBetween(screen.x - w * 0.2, base - h * 1.0, screen.x + w * 0.35, base - h * 0.35);
  }

  // A yellow anger mark bobbing over his head while stunned.
  private drawStun(): void {
    const px = cfg.render.pixelScale * cfg.boss.size;
    toScreen(this.x, this.y, screen);
    const g = this.stunGfx;
    const bob = Math.sin(this.time * 10) * 2;
    const cx = screen.x;
    const cy = screen.y - 26 * px + bob;
    const s = 5 * px;
    g.setDepth(screen.y + 6);
    for (const [qx, qy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
      const pts = [
        { x: cx + qx * s * 0.25, y: cy + qy * s * 0.25 },
        { x: cx + qx * s, y: cy + qy * s * 0.25 },
        { x: cx + qx * s * 0.55, y: cy + qy * s * 0.55 },
        { x: cx + qx * s * 0.25, y: cy + qy * s },
      ];
      g.fillStyle(0xffd21a, 1);
      g.fillPoints(pts, true);
      g.lineStyle(1, 0x7a5a00, 1);
      g.strokePoints(pts, true);
    }
  }

  // A wavy red glow around him, like the fairies' but red.
  // Flames, frost and poison bubbles drifting off him while he is afflicted.
  private statusParticles(): void {
    if (this.frozen > 0) return;
    toScreen(this.x, this.y, screen);
    const px = cfg.render.pixelScale * cfg.boss.size;
    const puff = (tints: number[], vy: number) =>
      this.fx.particle({
        x: screen.x + (Math.random() - 0.5) * 10 * px,
        y: screen.y - (4 + Math.random() * 18) * px,
        life: 0.4 + Math.random() * 0.3,
        from: 0.4,
        to: 0.05,
        alpha: 0.9,
        tint: tints[Math.floor(Math.random() * tints.length)],
        vx: (Math.random() - 0.5) * 20,
        vy,
        depth: screen.y + 1,
      });
    if (this.burnLeft > 0 && Math.random() < 0.5) puff([0xff6a10, 0xffc060], -40 - Math.random() * 40);
    if (this.coldLeft > 0 && Math.random() < 0.4) puff([0xe8fbff, 0x8fdcff], 10 + Math.random() * 20);
    if (this.poisonStacks > 0 && Math.random() < 0.4) puff([0x7aff5a, 0xb070ff], -20 - Math.random() * 20);
  }

  private drawAura(): void {
    const b = cfg.boss;
    const px = cfg.render.pixelScale * b.size;
    toScreen(this.x, this.y, screen);
    const grow = this.state === 'spawn' ? this.view.rise : 1;
    const pulse = 0.85 + 0.15 * Math.sin(this.time * 9);
    this.aura.setDepth(screen.y - 0.1);
    drawHaze(this.aura, screen.x, screen.y - 9 * px, b.auraSize * b.size * grow, b.auraWave, this.time, 3, RED, b.auraAlpha * pulse);
  }

  // The purple portal in the ground: it opens, holds while he rises, then closes.
  private drawPortal(): void {
    const b = cfg.boss;
    const total = b.portalTime + b.riseTime + b.closeTime;
    if (this.age >= total) return;
    const open = Math.min(1, this.age / Math.max(b.portalTime, 1e-3));
    const closing = this.age > b.portalTime + b.riseTime ? 1 - (this.age - b.portalTime - b.riseTime) / Math.max(b.closeTime, 1e-3) : 1;
    const k = open * open * (3 - 2 * open) * Math.max(0, closing);
    const rx = b.portalRadius * b.size * k;
    const ry = rx * 0.5;
    toScreen(this.x, this.y, screen);
    const g = this.portal;
    g.setDepth(screen.y - 1001);
    g.fillStyle(0x07000d, 0.95).fillEllipse(screen.x, screen.y, rx * 2, ry * 2);
    for (let i = 0; i < 3; i++) {
      const f = 1 - i * 0.28;
      g.lineStyle(3 - i, i === 0 ? 0xb070ff : 0x7a2fd0, 0.9 - i * 0.2);
      g.strokeEllipse(screen.x, screen.y, rx * 2 * f, ry * 2 * f);
    }
    // Swirling arcs and sparks rising out of it.
    const arcs = this.arcGfx;
    arcs.setDepth(screen.y - 1000);
    for (let i = 0; i < 6; i++) {
      const a = this.time * 3 + (i / 6) * Math.PI * 2;
      arcs.lineStyle(2, 0xa060ff, 0.7 * k);
      arcs.lineBetween(screen.x + Math.cos(a) * rx * 0.3, screen.y + Math.sin(a) * ry * 0.3, screen.x + Math.cos(a + 0.7) * rx * 0.9, screen.y + Math.sin(a + 0.7) * ry * 0.9);
    }
    if (Math.random() < 40 * k * 0.016) {
      const a = Math.random() * Math.PI * 2;
      this.fx.particle({
        x: screen.x + Math.cos(a) * rx * 0.8,
        y: screen.y + Math.sin(a) * ry * 0.8,
        life: 0.5 + Math.random() * 0.4,
        from: 0.3,
        to: 0.05,
        alpha: 0.9,
        tint: Math.random() < 0.5 ? 0xb070ff : 0x6a20c0,
        vx: (Math.random() - 0.5) * 20,
        vy: -50 - Math.random() * 60,
        depth: screen.y + 3,
      });
    }
  }

  // Picks his next attack when he reaches the player: usually the sword slash, sometimes Reality Distortion.
  private beginAttack(): void {
    const b = cfg.boss;
    if (Math.random() < b.distortChance) {
      this.state = 'distort';
      this.timer = this.telegraphTotal = b.distortWindup;
      this.distortAge = 0;
      const reach = 70 * b.size;
      this.stab.x = this.x + this.sim.aimX * reach;
      this.stab.y = this.y + this.sim.aimY * reach;
      sfx.play('bossWindup', { dur: b.distortWindup, pitch: 0.7 });
    } else {
      this.state = 'telegraph';
      this.timer = this.telegraphTotal = b.windup;
      sfx.play('bossWindup', { dur: b.windup });
    }
  }

  // Reality Distortion lands: everything inside the circle dies, and nothing the player does can dodge it.
  private explode(px: number, py: number, r: number, playerDead: boolean): boolean {
    const R = cfg.boss.distortRadius;
    this.blast = { age: 0, ox: this.x, oy: this.y };
    for (const t of this.targets()) {
      if (t.alive && t.kind !== 'boss' && Math.hypot(t.x - this.x, t.y - this.y) <= R + t.radius) this.onSlay(t);
    }
    this.fx.addShake(cfg.boss.distortShake);
    sfx.play('bossBlast');
    const px2 = cfg.render.pixelScale * cfg.boss.size;
    const smokeTints = [0x050005, 0x120006, 0x240008];
    for (let i = 0; i < 420; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * R;
      const p = this.world(a, d);
      const smoke = i % 3 !== 0;
      this.fx.particle({
        texture: smoke ? Tex.smoke : Tex.glow,
        x: p.x,
        y: p.y - 6 * px2,
        life: smoke ? 1.2 + Math.random() * 1.2 : 0.5 + Math.random() * 0.8,
        from: smoke ? px2 * (0.8 + Math.random()) : 0.7 + Math.random() * 0.9,
        to: smoke ? px2 * (3 + Math.random() * 3) : 0.1,
        alpha: smoke ? 0.95 : 1,
        tint: smoke ? smokeTints[i % 3] : [0xff1a1a, 0xff5a1a, 0xff9a30][i % 3],
        additive: !smoke,
        vx: Math.cos(a) * (60 + Math.random() * 220) * (d / R + 0.3),
        vy: -120 - Math.random() * 380,
        depth: p.y + 3,
      });
    }
    return !playerDead && Math.hypot(px - this.x, py - this.y) <= R + r;
  }

  // A red circle on the ground that fills from the boss outward during the windup.
  private drawDistortWarning(): void {
    const g = this.warnGfx;
    const R = cfg.boss.distortRadius;
    const wind = Phaser.Math.Clamp(1 - Math.max(0, this.timer) / Math.max(this.telegraphTotal, 1e-3), 0, 1);
    const circle = (r: number) => {
      const pts: Vec2[] = [];
      for (let k = 0; k < 64; k++) pts.push(this.world((k / 64) * Math.PI * 2, r));
      return pts;
    };
    g.fillStyle(0x7a0010, 0.22 + 0.4 * wind).fillPoints(circle(R * wind), true);
    g.fillStyle(0x000000, 0.18 * wind).fillPoints(circle(R * wind * 0.7), true);
    g.lineStyle(4, 0xff2030, 0.55 + 0.4 * Math.abs(Math.sin(this.time * (4 + 10 * wind))));
    g.strokePoints(circle(R), true);
  }

  // The biggest blast in the game: a red shockwave, a wall of fire across the whole circle, black smoke, a scorched floor.
  private drawBlast(): void {
    const g = this.blastGfx;
    const sc = this.scorchGfx;
    g.clear();
    sc.clear();
    const bl = this.blast;
    if (!bl) return;
    const R = cfg.boss.distortRadius;
    const circle = (r: number, ox = bl.ox, oy = bl.oy) => {
      const pts: Vec2[] = [];
      for (let k = 0; k < 64; k++) pts.push(this.world((k / 64) * Math.PI * 2, r, ox, oy));
      return pts;
    };
    const px = cfg.render.pixelScale * cfg.boss.size;
    const ring = Math.min(1, bl.age / 0.45);
    const ringR = R * 1.1 * (1 - Math.pow(1 - ring, 3));
    // Opening white-red flash filling the circle.
    const flash = Math.max(0, 1 - bl.age / 0.5);
    g.fillStyle(0xff3020, 0.75 * flash).fillPoints(circle(R), true);
    g.fillStyle(0xffe0c0, 0.55 * flash * flash).fillPoints(circle(R * 0.6), true);
    // The shockwave ring, thick and red.
    const ringFade = Math.max(0, 1 - bl.age / 0.8);
    g.lineStyle(26 * ringFade + 2, 0xff2a2a, 0.9 * ringFade).strokePoints(circle(ringR), true);
    g.lineStyle(10 * ringFade + 1, 0xffd0a0, ringFade).strokePoints(circle(ringR), true);
    // Fire standing across the circle, burning down.
    const burn = Math.max(0, 1 - bl.age / 1.4);
    if (burn > 0) {
      const rings = 6;
      for (let j = 1; j <= rings; j++) {
        const rr = (R * j) / rings;
        const n = Math.round(8 + j * 6);
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 + j * 0.7;
          const p = this.world(a, rr, bl.ox, bl.oy);
          const flick = 0.6 + 0.4 * Math.sin(this.time * 14 + k * 1.9 + j * 2.3);
          flame(g, p.x, p.y, px * (16 + 20 * (1 - j / (rings + 1))) * flick * burn, px * 4, k * 3 + j, burn * 0.9, this.time, RED_SWORD.fire);
        }
      }
    }
    // Black scorch left on the floor that fades slowly.
    const scorch = Math.max(0, 1 - bl.age / BLAST_TIME);
    sc.fillStyle(0x000000, 0.7 * scorch).fillPoints(circle(R * 0.98), true);
    sc.fillStyle(0x3a0008, 0.4 * scorch).fillPoints(circle(R * 0.6), true);
  }

  // His swing reaches further than ours, while he still closes in to the same distance before attacking.
  private get slashRange(): number {
    return cfg.swordSlash.coneRange * cfg.boss.slashRangeMult;
  }

  // Marks the ground where the swing will land; the fill grows with the windup and is solid when it strikes.
  private drawWarning(): void {
    const g = this.warnGfx;
    g.clear();
    if (this.alive && this.state === 'distort') {
      this.drawDistortWarning();
      return;
    }
    if (!this.alive || this.state !== 'telegraph') return;
    const range = this.slashRange;
    const half = Phaser.Math.DegToRad(cfg.boss.slashConeAngle) / 2;
    const base = Math.atan2(this.sim.aimY, this.sim.aimX);
    const wind = Phaser.Math.Clamp(1 - Math.max(0, this.timer) / Math.max(this.telegraphTotal, 1e-3), 0, 1);
    const arc = (r: number) => {
      const pts = [this.world(0, 0)];
      for (let k = 0; k <= 24; k++) pts.push(this.world(base - half + (half * 2 * k) / 24, r));
      return pts;
    };
    g.fillStyle(0xff2a3a, 0.18 + 0.32 * wind).fillPoints(arc(range * wind), true);
    g.lineStyle(3, 0xff4050, 0.85);
    const edge = arc(range);
    g.strokePoints(edge, true);
  }

  private world(angle: number, r: number, ox = this.x, oy = this.y): Vec2 {
    return toScreen(ox + Math.cos(angle) * r, oy + Math.sin(angle) * r, { x: 0, y: 0 });
  }

  // Fire erupting across the swept arc, tallest at the leading edge, fading out.
  private drawFire(e: Effect): void {
    const c = cfg.swordSlash;
    const g = this.fireGfx;
    g.setDepth(9e5);
    const half = Phaser.Math.DegToRad(cfg.boss.slashConeAngle) / 2;
    const prog = Math.min(1, e.age / SWEEP_TIME);
    const span = -half * 2 * Math.pow(prog, c.sweepPower);
    const start = e.base + half;
    const fade = 1 - Math.max(0, (e.age - SWEEP_TIME) / (FIRE_TIME - SWEEP_TIME));
    const px = cfg.render.pixelScale * cfg.boss.size;
    const cols = 14;
    for (let k = 0; k <= cols; k++) {
      const f = k / cols;
      const ang = start + span * f;
      for (let j = 0; j < 5; j++) {
        const r = this.slashRange * (0.3 + 0.7 * ((j + 0.5) / 5));
        const p = this.world(ang, r, e.ox, e.oy);
        const flick = 0.6 + 0.4 * Math.sin(this.time * 18 + k * 2.1 + j * 1.3);
        flame(g, p.x, p.y, px * (8 + 18 * f * f) * flick, px * 3.2, k * 3 + j, fade * (0.35 + 0.65 * f), this.time, RED_SWORD.fire);
      }
    }
  }

  // Embers and smoke thrown off the whole arc the moment the swing lands.
  private burst(ax: number, ay: number): void {
    const half = Phaser.Math.DegToRad(cfg.boss.slashConeAngle) / 2;
    const base = Math.atan2(ay, ax);
    const px = cfg.render.pixelScale * cfg.boss.size;
    for (let i = 0; i < 90; i++) {
      const a = base - half + Math.random() * half * 2;
      const p = this.world(a, this.slashRange * (0.2 + Math.random() * 0.8));
      const smoke = Math.random() < 0.25;
      this.fx.particle({
        texture: smoke ? Tex.smoke : Tex.glow,
        x: p.x,
        y: p.y - 6 * px,
        life: 0.3 + Math.random() * 0.5,
        from: smoke ? px * 0.6 : 0.4 + Math.random() * 0.5,
        to: smoke ? px * 2 : 0.1,
        alpha: 0.9,
        tint: smoke ? 0x3a1010 : RED_SWORD.fire[Math.floor(Math.random() * 3)],
        additive: !smoke,
        vx: (Math.random() - 0.5) * 100,
        vy: -50 - Math.random() * 130,
        depth: p.y + 2,
      });
    }
  }

  // His red sword: it circles him like ours, winds up behind during the telegraph, then whips through the swing.
  private drawSword(dt: number): void {
    const gfx = this.swordGfx;
    const glow = this.swordGlow;
    gfx.clear();
    glow.clear();
    if (!this.alive || this.state === 'spawn') return;

    const c = cfg.swordSlash;
    const px = cfg.render.pixelScale * cfg.boss.size;
    const P = toScreen(this.x, this.y, { x: 0, y: 0 });
    const base = Math.atan2(this.sim.aimY, this.sim.aimX);
    const swinging = this.state === 'telegraph' || this.state === 'strike';
    const planting = this.state === 'distort';
    let tx: number;
    let ty: number;
    let tAngle: number;
    let rate = 10;
    let depth: number;
    let heatTarget = 0.35;
    let growTarget = 1;

    if (planting) {
      // Plunged point-down into the ground in front of him, growing hotter and bigger as the blast nears.
      const wind = Phaser.Math.Clamp(1 - Math.max(0, this.timer) / Math.max(this.telegraphTotal, 1e-3), 0, 1);
      const plunge = Phaser.Math.Clamp(this.distortAge / STAB_TIME, 0, 1);
      const ground = toScreen(this.stab.x, this.stab.y, { x: 0, y: 0 });
      const scale = 1 + 0.5 * wind;
      tx = ground.x;
      ty = ground.y - 27 * px * scale - (1 - plunge * plunge) * 60 * px;
      tAngle = Math.PI / 2;
      rate = 40;
      heatTarget = 0.5 + 0.9 * wind;
      growTarget = scale;
      depth = ground.y + 1;
    } else if (!swinging) {
      this.orbit += dt * c.orbitSpeed;
      tx = P.x + Math.cos(this.orbit) * c.orbitRadius * cfg.boss.size;
      ty = P.y - c.height * px + Math.sin(this.orbit) * c.orbitRadius * cfg.boss.size * 0.5;
      tAngle = this.orbit + Math.PI / 2;
      depth = P.y + (Math.sin(this.orbit) < 0 ? -0.6 : 0.6);
    } else {
      const wind = this.state === 'telegraph' ? 1 - Math.max(0, this.timer) / Math.max(this.telegraphTotal, 1e-3) : 1;
      const windEase = wind * wind * (3 - 2 * wind);
      const strike = this.state === 'strike' ? 1 - Math.max(0, this.timer) / Math.max(c.slashTime, 1e-3) : 0;
      const fast = Math.pow(strike, c.sweepPower);
      rate = this.state === 'strike' ? 70 : 12;
      // Brighter and up to half again as big as the windup builds; it holds through the swing.
      heatTarget = this.state === 'strike' ? 1 : 0.35 + 1.05 * windEase;
      growTarget = 1 + 0.5 * (this.state === 'strike' ? 1 : windEase);
      const half = Phaser.Math.DegToRad(cfg.boss.slashConeAngle) / 2;
      const back = Phaser.Math.DegToRad(c.windupAngle) * windEase;
      // Right to left, like our first swing.
      const a = base + half + back - (half * 2 + back) * fast;
      const pos = this.world(a, this.slashRange * 0.65);
      const out = toScreen(Math.cos(a), Math.sin(a), { x: 0, y: 0 });
      tx = pos.x;
      ty = pos.y - 10 * px;
      tAngle = Math.atan2(out.y, out.x);
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
    this.heat += (heatTarget - this.heat) * Math.min(1, dt * 6);
    this.swordGrow += (growTarget - this.swordGrow) * Math.min(1, dt * 8);
    drawSwordArt(gfx, glow, this.fx, sw, px * this.swordGrow, this.heat, this.time, dt, depth, RED_SWORD, this.wispState);
  }

  private teleportBy(dirX: number, dirY: number, distance: number): void {
    if (distance <= 1) return;
    const x0 = this.x;
    const y0 = this.y;
    this.x += dirX * distance;
    this.y += dirY * distance;
    this.view.onTeleport(x0, y0, this.x, this.y, 0, cfg.boss.teleportLineWidth);
    this.view.onTeleportArrive(this.x, this.y);
    sfx.play('teleport', { vol: 0.6, pitch: 0.6 });
    this.teleportGap = cfg.boss.teleportGap;
  }

  private faceToward(px: number, py: number): void {
    const dx = px - this.x;
    const dy = py - this.y;
    const len = Math.hypot(dx, dy);
    if (len > 1e-3) {
      this.sim.aimX = dx / len;
      this.sim.aimY = dy / len;
    }
  }
}

export const slayDamage = KILL;
