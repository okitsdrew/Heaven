import Phaser from 'phaser';
import { heroWalkFrames, Tex, walkFrames } from '../art/placeholders';
import { cfg } from '../config';
import { ellipseHalfSize, toScreen, toWorld, Vec2 } from '../iso';
import { Fx } from './Fx';
import { Player } from './Player';

// Art measurements, in sprite pixels (multiplied by render.pixelScale).
const SHOULDER_X = 4;
const SHOULDER_Y = 12;
const CHEST_Y = 10;
// The magic bow is drawn procedurally in this local frame: grip at the origin, aiming along +x.
const BOW_HALF = 17;
const BOW_STRING = 11;
const BOW_POINTS = 28;

const screen = { x: 0, y: 0 };
const ahead = { x: 0, y: 0 };

const SLEEVE = 0x3d3754;
const SLEEVE_EDGE = 0x120f18;
const SKIN = 0xc8b08a;
const HERO_SLEEVE = 0x7a46c8;
const HERO_SLEEVE_EDGE = 0x1a0c30;
const HERO_GLOVE = 0x17121f;
const HAND_YELLOW = 0xf2d34a;

export class PlayerView {
  private body: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Image;
  private bowGfx: Phaser.GameObjects.Graphics;
  private bowGlow: Phaser.GameObjects.Graphics;
  private handGlow: Phaser.GameObjects.Image[];
  private bowVis = 0;
  private wispTimer = 0;
  private arms: Phaser.GameObjects.Graphics;
  private ring: Phaser.GameObjects.Graphics;
  private dustRing: Phaser.GameObjects.Graphics;
  private kick = 0;
  private afterimageTimer = 0;
  private readyPulse = 0;
  private wasCooling = false;
  private phase = 0;
  private raise = 0;
  private walk = 0;
  private armsUp = 0;
  private flapAmt = [0, 0];
  // Which screen-side arms flap for the current sword slash.
  slashArms: () => { right: boolean; left: boolean } = () => ({ right: false, left: false });
  private dustTimer = 0;
  private time = 0;
  // Time left on the Dust Devil stacks, 0 to 1; drawn as a small ring at his bottom right.
  dustFraction = 0;
  private tone: number | null = null;
  private frozen = false;
  // Doomsday Scenario: the glowing gauntlet on his screen-right hand, and how far that arm is raised overhead.
  gauntlet = false;
  handRaise = 0;
  readonly handPos = { x: 0, y: 0 };
  private gauntletGfx: Phaser.GameObjects.Graphics;
  // The boss reuses this view: bigger, flickering, and rising out of the ground while `rise` < 1.
  sizeMult = 1;
  flicker = 0;
  rise = 1;
  // The hub reaches out with empty hands, slowly: no bow, and a longer raise.
  hideBow = false;
  // The player's own look (black helm, white tabard, cloak). The boss keeps the shade's original body.
  hero = false;
  private cloak: Phaser.GameObjects.Graphics;
  private cloakPts: Vec2[] = [];
  private cloakPrev: Vec2[] = [];
  private eyeGlow: Phaser.GameObjects.Image[];
  armsRate = 0.06;
  private flashTime = 0;

  constructor(scene: Phaser.Scene, private player: Player, private fx: Fx) {
    this.shadow = scene.add.image(0, 0, Tex.shadow);
    this.body = scene.add.image(0, 0, Tex.player).setOrigin(0.5, 1);
    this.cloak = scene.add.graphics();
    this.eyeGlow = [0, 1].map(() => scene.add.image(0, 0, Tex.glow).setTint(0xa060ff).setBlendMode(Phaser.BlendModes.ADD).setVisible(false));
    this.bowGfx = scene.add.graphics();
    this.bowGlow = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.handGlow = [0, 1].map(() =>
      scene.add.image(0, 0, Tex.glow).setTint(0xa060ff).setBlendMode(Phaser.BlendModes.ADD),
    );
    this.arms = scene.add.graphics();
    this.ring = scene.add.graphics();
    this.dustRing = scene.add.graphics();
    this.gauntletGfx = scene.add.graphics();
  }

  // Recolours everything toward one vivid tone, for the boss's copy of the player. Null restores the colours.
  setTone(tone: number | null, boost = 2): void {
    this.tone = tone;
    this.body.preFX?.clear();
    if (tone !== null) {
      const m = this.body.preFX?.addColorMatrix();
      m?.saturate(1, true);
      m?.brightness(boost, true);
    }
    this.body.setTint(tone ?? 0xffffff);
    for (const img of this.handGlow) img.setTint(this.c(0xa060ff));
  }

  setFrozen(frozen: boolean): void {
    this.frozen = frozen;
  }

  private flickerAlpha(): number {
    if (this.flicker <= 0) return 1;
    const v = 0.5 + 0.5 * Math.sin(this.time * 41) * Math.sin(this.time * 23 + 1);
    return 1 - this.flicker * v;
  }

  // Briefly lights the body up when hit.
  flash(): void {
    this.flashTime = cfg.feel.hitFlashTime;
  }

  private c(color: number): number {
    if (this.tone === null) return color;
    const y = (0.3 * ((color >> 16) & 255) + 0.59 * ((color >> 8) & 255) + 0.11 * (color & 255)) / 255;
    const k = Math.min(1, 0.7 + y * 0.5);
    const ch = (shift: number) => Math.round(((this.tone! >> shift) & 255) * k);
    return (ch(16) << 16) | (ch(8) << 8) | ch(0);
  }

  private get px(): number {
    return cfg.render.pixelScale * this.sizeMult;
  }

  private skin(moving: boolean): string {
    if (this.hero) return moving ? heroWalkFrames[Math.floor(this.phase * 4) % 4] : Tex.hero;
    return moving ? walkFrames[Math.floor(this.phase * 4) % 4] : Tex.player;
  }

  // A black cloak that hangs from the shoulders on a short rope, so it streams behind him as he moves and dashes.
  private updateCloak(dt: number, cx: number, cy: number, px: number): void {
    const g = this.cloak;
    g.clear();
    const eyes = this.eyeGlow;
    if (!this.hero) {
      eyes.forEach((e) => e.setVisible(false));
      return;
    }
    const c = cfg.cloak;
    const n = Math.max(3, Math.round(c.segments));
    const seg = (c.length * px) / n;
    const ax = cx;
    const ay = cy - (SHOULDER_Y - 1) * px;
    if (this.cloakPts.length !== n + 1) {
      this.cloakPts = Array.from({ length: n + 1 }, (_, i) => ({ x: ax, y: ay + i * seg }));
      this.cloakPrev = this.cloakPts.map((p) => ({ ...p }));
    }
    const pts = this.cloakPts;
    const prev = this.cloakPrev;
    const damp = Math.exp(-c.drag * dt);
    pts[0].x = ax;
    pts[0].y = ay;
    for (let i = 1; i <= n; i++) {
      const vx = (pts[i].x - prev[i].x) * damp;
      const vy = (pts[i].y - prev[i].y) * damp;
      prev[i].x = pts[i].x;
      prev[i].y = pts[i].y;
      pts[i].x += vx;
      pts[i].y += vy + c.gravity * px * dt * dt * 0.5;
    }
    for (let it = 0; it < 4; it++) {
      for (let i = 1; i <= n; i++) {
        const dx = pts[i].x - pts[i - 1].x;
        const dy = pts[i].y - pts[i - 1].y;
        const d = Math.hypot(dx, dy) || 1e-4;
        const k = seg / d;
        pts[i].x = pts[i - 1].x + dx * k;
        pts[i].y = pts[i - 1].y + dy * k;
      }
    }
    const left: Vec2[] = [];
    const right: Vec2[] = [];
    for (let i = 0; i <= n; i++) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(n, i + 1)];
      const tx = b.x - a.x;
      const ty = b.y - a.y;
      const len = Math.hypot(tx, ty) || 1;
      const w = ((c.width * px) / 2) * (0.75 + 0.6 * (i / n));
      left.push({ x: pts[i].x - (ty / len) * w, y: pts[i].y + (tx / len) * w });
      right.push({ x: pts[i].x + (ty / len) * w, y: pts[i].y - (tx / len) * w });
    }
    const depth = this.body.depth - 0.6;
    g.setDepth(depth).setAlpha(this.body.alpha);
    const poly = left.concat(right.slice().reverse());
    g.fillStyle(this.c(0x050408), 1);
    g.fillPoints(poly.map((p) => new Phaser.Math.Vector2(p.x, p.y)), true);
    // A thin purple lining shows along the fold, and the hem is torn into points.
    g.lineStyle(Math.max(1, px * 0.8), this.c(0x3a1c66), 0.9);
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i <= n; i++) g.lineTo(pts[i].x, pts[i].y);
    g.strokePath();
    const l = left[n];
    const r = right[n];
    const tipX = pts[n].x + (pts[n].x - pts[n - 1].x) * 0.7;
    const tipY = pts[n].y + (pts[n].y - pts[n - 1].y) * 0.7;
    g.fillStyle(this.c(0x050408), 1);
    g.fillTriangle(l.x, l.y, (l.x + r.x) / 2, (l.y + r.y) / 2, (l.x + tipX) / 2 - 2 * px, (l.y + tipY) / 2);
    g.fillTriangle(r.x, r.y, (l.x + r.x) / 2, (l.y + r.y) / 2, (r.x + tipX) / 2 + 2 * px, (r.y + tipY) / 2);
    g.fillTriangle(l.x, l.y, r.x, r.y, tipX, tipY);

    // The two glowing eyes, in the teleport's purple.
    const pulse = 0.85 + 0.15 * Math.sin(this.time * 6);
    eyes.forEach((e, i) => {
      e.setVisible(this.body.visible)
        .setPosition(cx + (i === 0 ? -3 : 3) * px, cy - 14 * px)
        .setScale(px * 0.17)
        .setAlpha(c.eyeGlow * pulse * this.body.alpha)
        .setDepth(this.body.depth + 0.2);
    });
  }

  setVisible(visible: boolean): void {
    for (const o of [this.body, this.shadow, this.cloak, ...this.eyeGlow, this.bowGfx, this.bowGlow, this.arms, this.ring, this.dustRing, this.gauntletGfx, ...this.handGlow]) {
      o.setVisible(visible);
    }
  }

  onFire(): void {
    this.kick = cfg.feel.bowKickTime;
  }

  onDashStart(): void {
    this.afterimageTimer = 0;
  }

  // A dark purple line zips between the two points, with a puff of void at the start.
  onTeleport(fromX: number, fromY: number, toX: number, toY: number, travelTime: number, lineWidth?: number): void {
    const px = this.px;
    const a = toScreen(fromX, fromY);
    const b = toScreen(toX, toY);
    const lift = 10 * px;
    this.fx.streak(a.x, a.y - lift, b.x, b.y - lift, travelTime > 0 ? travelTime : undefined, lineWidth);
    this.voidPuff(a.x, a.y - lift);
    this.fx.addShake(cfg.camera.shakeOnCast * 0.5);
  }

  onTeleportArrive(x: number, y: number): void {
    const a = toScreen(x, y);
    this.voidPuff(a.x, a.y - 10 * this.px);
  }

  private voidPuff(x: number, y: number): void {
    for (let i = 0; i < cfg.teleport.puffs; i++) {
      const angle = Math.random() * Math.PI * 2;
      this.fx.particle({
        texture: Math.random() < 0.5 ? Tex.smoke : Tex.glow,
        x,
        y,
        life: 0.3 + Math.random() * 0.3,
        from: 0.5 + Math.random() * 0.5,
        to: 1.5 + Math.random(),
        alpha: 0.9,
        tint: [0x07000d, 0x2a0a4a, 0x5a1a9a][Math.floor(Math.random() * 3)],
        additive: false,
        vx: Math.cos(angle) * 50,
        vy: Math.sin(angle) * 30,
      });
    }
  }

  // Where arrows start in world space: the nocked arrow on the fully drawn string.
  muzzle(): Vec2 {
    const p = this.player;
    const px = this.px;
    const g = toScreen(p.x, p.y);
    const a = toScreen(p.x + p.aimX, p.y + p.aimY);
    const angle = Math.atan2(a.y - g.y, a.x - g.x);
    const d = (cfg.feel.bowFloatDistance - BOW_STRING * cfg.render.bowScale - cfg.feel.drawDistance) * px;
    const sx = g.x + Math.cos(angle) * d;
    const sy = g.y - CHEST_Y * px + Math.sin(angle) * d;
    return toWorld(sx, sy + cfg.render.arrowHeight);
  }

  update(dt: number): void {
    const p = this.player;
    const px = this.px;
    const f = cfg.feel;
    toScreen(p.x, p.y, screen);
    toScreen(p.x + p.aimX, p.y + p.aimY, ahead);
    const aimAngle = Math.atan2(ahead.y - screen.y, ahead.x - screen.x);
    const facingLeft = ahead.x < screen.x;

    const speed = Math.hypot(p.vx, p.vy);
    const sliding = p.sliding;
    const moving = !p.dashing && !sliding && speed > cfg.player.moveSpeed * 0.1;
    this.phase = moving ? (this.phase + (speed * dt) / f.strideLength) % 1 : 0;
    const bob = moving ? Math.abs(Math.sin(this.phase * Math.PI * 2)) * f.walkBob * px : 0;
    const swing = moving ? Math.sin(this.phase * Math.PI * 2) * 2.5 * px : 0;

    this.body
      .setTexture(this.skin(moving))
      .setPosition(screen.x, screen.y - bob)
      .setScale(px)
      .setFlipX(facingLeft)
      .setDepth(screen.y)
      .setAlpha((p.dashing || p.teleporting ? 0.55 : 1) * this.flickerAlpha());
    if (this.flicker > 0 && Math.sin(this.time * 31) > 0.6) this.body.x += (Math.sin(this.time * 97) > 0 ? 1 : -1) * 1.5 * px;
    // Rising out of the ground: only the top part of the sprite shows, sliding up.
    const riseDrop = (1 - this.rise) * this.body.height * px;
    if (this.rise < 1) {
      this.body.setCrop(0, 0, this.body.width, this.body.height * Math.max(this.rise, 0.001));
      this.body.y += riseDrop;
    } else {
      this.body.setCrop();
    }
    this.flashTime = Math.max(0, this.flashTime - dt);
    if (this.frozen) this.body.setTintFill(0xbfeaff);
    else if (this.flashTime > 0) this.body.setTintFill(0xffffff);
    else this.body.setTint(this.tone ?? 0xffffff);
    this.shadow.setPosition(screen.x, screen.y).setScale(px * 0.9, px * 0.35).setDepth(screen.y - 1000);

    // While shooting he holds his arms up as if steering the bow with magic, and flaps them.
    const rate = p.readyTimer > 0 ? dt / Math.max(f.shootPoseTime, 1e-4) : -dt / Math.max(f.shootPoseTime, 1e-4);
    this.raise = Phaser.Math.Clamp(this.raise + rate, 0, 1);
    const t = this.raise * this.raise * (3 - 2 * this.raise);
    this.time += dt;
    this.armsUp = Phaser.Math.Clamp(this.armsUp + (p.armsUpTimer > 0 ? dt : -dt) / this.armsRate, 0, 1);
    const poseT = Math.max(t, this.armsUp * this.armsUp * (3 - 2 * this.armsUp));

    this.kick = Math.max(0, this.kick - dt);
    const kickT = f.bowKickTime > 0 ? this.kick / f.bowKickTime : 0;

    const cx = screen.x;
    const cy = screen.y - bob + riseDrop;
    this.updateCloak(dt, cx, cy, px);
    const bowSide = facingLeft ? -1 : 1;
    const dirX = Math.cos(aimAngle);
    const dirY = Math.sin(aimAngle);
    const bs = px * cfg.render.bowScale;

    const shoulderA = { x: cx + bowSide * SHOULDER_X * px, y: cy - SHOULDER_Y * px };
    const shoulderB = { x: cx - bowSide * SHOULDER_X * px, y: cy - SHOULDER_Y * px };

    // Walking holds the arms out to the sides (< I >) and wiggles them; standing they hang down.
    this.walk = Phaser.Math.Clamp(this.walk + (moving ? dt : -dt) / 0.1, 0, 1);
    const walkFlap = swing * (f.walkArmFlap / 2.5);
    const shootFlap = Math.sin(this.time * f.shootFlapRate) * f.walkArmFlap * px;
    const slash = this.slashArms();
    const wantA = bowSide > 0 ? slash.right : slash.left;
    const wantB = bowSide > 0 ? slash.left : slash.right;
    this.flapAmt[0] += ((wantA ? 1 : 0) - this.flapAmt[0]) * Math.min(1, dt / 0.05);
    this.flapAmt[1] += ((wantB ? 1 : 0) - this.flapAmt[1]) * Math.min(1, dt / 0.05);
    const pose = (shoulder: Vec2, side: number, flapSign: number, flap: number): Vec2 => {
      const rest = { x: shoulder.x + side * 1.5 * px, y: shoulder.y + 8 * px + swing * flapSign };
      const walking = {
        x: shoulder.x + side * f.walkArmSpread * px,
        y: shoulder.y + f.walkArmDrop * px + walkFlap * flapSign,
      };
      const shooting = {
        x: shoulder.x + side * f.shootArmSpread * px,
        y: shoulder.y + f.shootArmDrop * px + shootFlap * flapSign,
      };
      return lerp(lerp(rest, walking, this.walk), shooting, Math.max(poseT, flap));
    };
    let armA = solveArm(shoulderA, pose(shoulderA, bowSide, 1, this.flapAmt[0]), f.armLength * px);
    let armB = solveArm(shoulderB, pose(shoulderB, -bowSide, -1, this.flapAmt[1]), f.armLength * px);
    // The screen-right arm wears the gauntlet and can be thrust overhead.
    const rightIsA = bowSide > 0;
    const rightShoulder = rightIsA ? shoulderA : shoulderB;
    if (this.handRaise > 0) {
      const cur = rightIsA ? armA.hand : armB.hand;
      const up = { x: rightShoulder.x + 2 * px, y: rightShoulder.y - f.armLength * 2 * px * 0.92 };
      const raised = solveArm(rightShoulder, lerp(cur, up, this.handRaise), f.armLength * px);
      if (rightIsA) armA = raised;
      else armB = raised;
    }
    const rightHand = rightIsA ? armA.hand : armB.hand;
    this.handPos.x = rightHand.x;
    this.handPos.y = rightHand.y;

    // The bow floats in front of him toward the cursor and phases in only while he shoots.
    const visRate = p.readyTimer > 0 ? dt / Math.max(f.bowPhaseInTime, 1e-4) : -dt / Math.max(f.bowPhaseOutTime, 1e-4);
    const prevVis = this.bowVis;
    this.bowVis = Phaser.Math.Clamp(this.bowVis + visRate, 0, 1);
    const vis = this.bowVis;
    const dist = (f.bowFloatDistance - kickT * 3) * px;
    const bowPos = {
      x: cx + dirX * dist,
      y: cy - CHEST_Y * px + dirY * dist + Math.sin(this.time * 3) * f.bowFloatBob * px,
    };
    const bowAngle = aimAngle;

    const g = this.arms;
    g.clear().setDepth(screen.y + 0.3).setAlpha(this.body.alpha * Phaser.Math.Clamp((this.rise - 0.4) / 0.3, 0, 1));
    for (const [width, color] of [
      [3 * px, this.c(this.hero ? HERO_SLEEVE_EDGE : SLEEVE_EDGE)],
      [2 * px, this.c(this.hero ? HERO_SLEEVE : SLEEVE)],
    ] as const) {
      g.lineStyle(width, color, 1);
      for (const arm of [armA, armB]) {
        g.beginPath();
        g.moveTo(arm.shoulder.x, arm.shoulder.y);
        g.lineTo(arm.elbow.x, arm.elbow.y);
        g.lineTo(arm.hand.x, arm.hand.y);
        g.strokePath();
      }
    }
    g.fillStyle(this.c(this.hero ? HERO_GLOVE : SKIN), 1);
    g.fillCircle(armA.hand.x, armA.hand.y, 1.2 * px);
    g.fillCircle(armB.hand.x, armB.hand.y, 1.2 * px);

    this.drawGauntlet(rightHand, px);
    if (sliding) this.slideDust(dt);
    if (this.hideBow) {
      this.bowGfx.clear();
      this.bowGlow.clear();
    } else this.drawBow(bowPos, bowAngle, bs, vis, prevVis, p.drawProgress, p.readyTimer > 0, dirY < 0 ? -0.5 : 0.5, dt);

    // Hands glow purple while he is shooting.
    this.handGlow.forEach((img, i) => {
      const hand = i === 0 ? armA.hand : armB.hand;
      img
        .setVisible(t > 0.01)
        .setPosition(hand.x, hand.y)
        .setScale(px * (0.32 + Math.sin(this.time * 12 + i * 2) * 0.05))
        .setAlpha(t * f.handGlow)
        .setDepth(screen.y + 0.4);
    });

    if (p.dashing && cfg.dash.afterimages > 0) {
      this.afterimageTimer -= dt;
      if (this.afterimageTimer <= 0) {
        this.fx.afterimage(this.body.texture.key, screen.x, screen.y, facingLeft, px, screen.y, this.tone ?? undefined);
        this.afterimageTimer += cfg.dash.duration / cfg.dash.afterimages;
      }
    }

    this.drawCooldownRing(dt);
    this.drawDustRing();
  }

  // Dust kicked up at his feet while he drifts out of a teleport.
  private slideDust(dt: number): void {
    const p = this.player;
    const px = this.px;
    const v = toScreen(p.vx, p.vy);
    const len = Math.hypot(v.x, v.y) || 1;
    this.dustTimer += dt * 70;
    while (this.dustTimer >= 1) {
      this.dustTimer -= 1;
      const life = 0.25 + Math.random() * 0.25;
      this.fx.particle({
        texture: Tex.smoke,
        x: screen.x + (Math.random() - 0.5) * 8 * px,
        y: screen.y - Math.random() * 2 * px,
        life,
        from: px * 0.3,
        to: px * (0.7 + Math.random() * 0.5),
        alpha: 0.55,
        tint: Math.random() < 0.5 ? 0x4a3a66 : 0x2a1f40,
        additive: false,
        vx: (-v.x / len) * 40 + (Math.random() - 0.5) * 30,
        vy: (-v.y / len) * 20 + (Math.random() - 0.5) * 10,
        depth: screen.y - 0.5,
      });
      if (Math.random() < 0.25) {
        this.fx.particle({
          x: screen.x + (Math.random() - 0.5) * 6 * px,
          y: screen.y,
          life: 0.2,
          from: 0.25,
          to: 0.05,
          alpha: 0.9,
          tint: 0xa060ff,
          vx: (-v.x / len) * 80,
          vy: (-v.y / len) * 40,
          depth: screen.y + 0.5,
        });
      }
    }
  }

  private drawBow(
    pos: Vec2,
    angle: number,
    scale: number,
    vis: number,
    prevVis: number,
    pull: number,
    shooting: boolean,
    depthOffset: number,
    dt: number,
  ): void {
    const g = this.bowGfx;
    const glow = this.bowGlow;
    g.clear();
    glow.clear();
    if (vis <= 0.005) return;
    g.setDepth(screen.y + depthOffset);
    glow.setDepth(screen.y + depthOffset - 0.1);

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const place = (lx: number, ly: number): Vec2 => ({
      x: pos.x + (lx * cos - ly * sin) * scale,
      y: pos.y + (lx * sin + ly * cos) * scale,
    });

    // Limbs wobble and shimmer; while phasing in or out, segments flicker away.
    const pts: Vec2[] = [];
    const flicker = 1 + Math.sin(this.time * 31) * 0.15;
    for (let i = 0; i < BOW_POINTS; i++) {
      const u = (i / (BOW_POINTS - 1)) * 2 - 1;
      const k = Math.pow(Math.abs(u), 1.5);
      const x = -BOW_STRING * k + Math.sin(this.time * 7 + u * 9) * 0.7 * flicker + (Math.abs(u) > 0.9 ? 1.5 : 0);
      const y = u * BOW_HALF + Math.sin(this.time * 5 + u * 6) * 0.5;
      pts.push(place(x, y));
    }
    const frame = Math.floor(this.time * 30);
    const segVisible = (i: number) => vis >= 0.99 || hash(i, frame) < vis * 1.15;
    for (const [target, width, color, alpha] of [
      [glow, 6 * scale, this.c(0x7a2fd0), 0.5],
      [g, 3.4 * scale, this.c(0x3a0f6a), 0.95],
      [g, 1.6 * scale, this.c(0x07000d), 1],
    ] as const) {
      target.lineStyle(width, color, alpha * vis);
      for (let i = 0; i < pts.length - 1; i++) {
        if (segVisible(i)) target.lineBetween(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
      }
    }

    // Spearhead rest with a glowing core.
    const tip = place(5, 0);
    const l = place(-1, -2.2);
    const r = place(-1, 2.2);
    g.fillStyle(this.c(0x2a0a4a), vis);
    g.fillTriangle(tip.x, tip.y, l.x, l.y, r.x, r.y);
    glow.fillStyle(this.c(0xc9a0ff), 0.7 * vis);
    glow.fillCircle(pos.x, pos.y, 1.6 * scale);

    // The string, pulled by a small yellow hand.
    const pulledX = -BOW_STRING - (shooting ? pull : 0) * cfg.feel.drawDistance;
    const nock = place(pulledX, 0);
    const a = pts[0];
    const b = pts[pts.length - 1];
    g.lineStyle(1, this.c(0xd9b8ff), 0.9 * vis);
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(nock.x, nock.y);
    g.lineTo(b.x, b.y);
    g.strokePath();
    if (shooting && pull > 0.02) {
      const head = place(5, 0);
      g.lineStyle(Math.max(1, scale), this.c(0xc9a0ff), vis);
      g.beginPath();
      g.moveTo(nock.x, nock.y);
      g.lineTo(head.x, head.y);
      g.strokePath();
    }
    glow.fillStyle(this.c(HAND_YELLOW), 0.5 * vis);
    glow.fillCircle(nock.x, nock.y, 3.2 * scale);
    g.fillStyle(this.c(0x8a6a10), vis);
    g.fillCircle(nock.x, nock.y, 1.9 * scale);
    g.fillStyle(this.c(HAND_YELLOW), vis);
    g.fillCircle(nock.x, nock.y, 1.5 * scale);
    for (const [fx, fy] of [[-1.2, -1.6], [-1.9, 0], [-1.2, 1.6]] as const) {
      const f = place(pulledX + fx, fy);
      g.fillCircle(f.x, f.y, 0.7 * scale);
    }

    // Wisps drift off the limbs, with a burst as it phases in or out.
    this.wispTimer += dt * 25 * vis;
    const burst = (prevVis <= 0.005 && vis > 0.005) || (prevVis >= 0.999 && vis < 0.999 && !shooting) ? 8 : 0;
    let count = burst;
    while (this.wispTimer >= 1) {
      this.wispTimer -= 1;
      count++;
    }
    for (let i = 0; i < count; i++) {
      const w = pts[Math.floor(Math.random() * pts.length)];
      this.fx.particle({
        x: w.x,
        y: w.y,
        life: 0.3 + Math.random() * 0.3,
        from: 0.25 + Math.random() * 0.2,
        to: 0.05,
        alpha: 0.9,
        tint: Math.random() < 0.5 ? this.c(0xa060ff) : this.c(0x6a20c0),
        vx: (Math.random() - 0.5) * 30,
        vy: -10 - Math.random() * 25,
        depth: screen.y + 1,
      });
    }
  }

  private drawGauntlet(hand: Vec2, px: number): void {
    const g = this.gauntletGfx;
    g.clear();
    if (!this.gauntlet) return;
    g.setDepth(screen.y + 0.45);
    const pulse = 0.8 + 0.2 * Math.sin(this.time * 9);
    g.fillStyle(0xffd21a, 0.28 * pulse + 0.3 * this.handRaise).fillCircle(hand.x, hand.y, 4.2 * px);
    g.fillStyle(0x16120a, 1).fillCircle(hand.x, hand.y, 2.3 * px);
    g.lineStyle(Math.max(1, px * 0.7), 0xffd21a, 1).strokeCircle(hand.x, hand.y, 2.3 * px);
    // Knuckle studs.
    for (let i = -1; i <= 1; i++) g.fillStyle(0xffe680, 1).fillCircle(hand.x + i * 1.3 * px, hand.y - 2.1 * px, 0.45 * px);
  }

  private drawDustRing(): void {
    const g = this.dustRing;
    g.clear();
    if (this.dustFraction <= 0) return;
    const px = this.px;
    const x = screen.x + 9 * px;
    const y = screen.y - 1 * px;
    g.setDepth(screen.y + 0.5);
    g.lineStyle(2, 0x2a2638, 0.8).strokeCircle(x, y, 3 * px);
    g.lineStyle(2, 0xe8c56a, 0.95);
    g.beginPath();
    g.arc(x, y, 3 * px, -Math.PI / 2, -Math.PI / 2 + this.dustFraction * Math.PI * 2, false);
    g.strokePath();
  }

  private drawCooldownRing(dt: number): void {
    const p = this.player;
    const g = this.ring;
    g.clear();
    g.setDepth(screen.y - 999);

    const cooling = p.dashing || p.dashCooldownFraction > 0;
    if (this.wasCooling && !cooling) this.readyPulse = 0.25;
    this.wasCooling = cooling;
    this.readyPulse = Math.max(0, this.readyPulse - dt);

    const half = ellipseHalfSize(18);
    if (cooling) {
      const progress = p.dashing ? 0 : 1 - p.dashCooldownFraction;
      g.lineStyle(2, 0x2a2638, 0.8);
      ellipseArc(g, screen.x, screen.y, half.x, half.y, 1);
      g.lineStyle(2, this.c(0xc9b6ff), 0.9);
      ellipseArc(g, screen.x, screen.y, half.x, half.y, progress);
    } else if (this.readyPulse > 0) {
      const t = this.readyPulse / 0.25;
      g.lineStyle(2, 0xffffff, t);
      ellipseArc(g, screen.x, screen.y, half.x * (1 + (1 - t) * 0.3), half.y * (1 + (1 - t) * 0.3), 1);
    }
  }
}

function hash(i: number, frame: number): number {
  const h = Math.sin(i * 12.9898 + frame * 78.233) * 43758.5453;
  return h - Math.floor(h);
}

function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

// Two-bone arm. The elbow bends downward, and the hand stops short if the target is out of reach.
function solveArm(shoulder: Vec2, target: Vec2, segment: number): { shoulder: Vec2; elbow: Vec2; hand: Vec2 } {
  const dx = target.x - shoulder.x;
  const dy = target.y - shoulder.y;
  const len = Math.hypot(dx, dy) || 1;
  const d = Math.min(len, segment * 2 - 0.01);
  const ux = dx / len;
  const uy = dy / len;
  const h = Math.sqrt(Math.max(0, segment * segment - (d * d) / 4));
  const mx = shoulder.x + (ux * d) / 2;
  const my = shoulder.y + (uy * d) / 2;
  const a = { x: mx - uy * h, y: my + ux * h };
  const b = { x: mx + uy * h, y: my - ux * h };
  return {
    shoulder,
    elbow: a.y > b.y ? a : b,
    hand: { x: shoulder.x + ux * d, y: shoulder.y + uy * d },
  };
}

function ellipseArc(g: Phaser.GameObjects.Graphics, cx: number, cy: number, rx: number, ry: number, fraction: number): void {
  if (fraction <= 0) return;
  const segments = Math.max(2, Math.ceil(40 * fraction));
  const start = -Math.PI / 2;
  g.beginPath();
  for (let i = 0; i < segments + 1; i++) {
    const a = start + (i / segments) * fraction * Math.PI * 2;
    const x = cx + Math.cos(a) * rx;
    const y = cy + Math.sin(a) * ry;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.strokePath();
}
