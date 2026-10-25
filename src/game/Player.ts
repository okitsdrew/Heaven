import { cfg } from '../config';
import { Input } from '../input';
import { toScreen, toWorld, Vec2 } from '../iso';

const tmp = { x: 0, y: 0 };

// Turns a screen-space direction (length = amount, 0..1) into a world velocity.
// Uniform mode keeps on-screen speed equal in every direction; the iso projection otherwise
// makes horizontal screen movement twice as fast as vertical and diagonals feel slow.
function screenToWorldVel(dx: number, dy: number, speed: number, out: Vec2): Vec2 {
  if (cfg.player.uniformScreenSpeed) {
    const s = speed * cfg.player.screenSpeedMult * cfg.render.isoScale * Math.SQRT2;
    return toWorld(dx * s, dy * s, out);
  }
  toWorld(dx, dy, out);
  const len = Math.hypot(out.x, out.y);
  const k = len > 0 ? (speed * Math.hypot(dx, dy)) / len : 0;
  out.x *= k;
  out.y *= k;
  return out;
}

// Pure simulation in world space. Rendering lives in PlayerView.
export class Player {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  aimX = 1;
  aimY = 0;

  fireCooldown = 0;
  dashTime = 0;
  dashCooldown = 0;
  dashBuffer = 0;
  dashVx = 0;
  dashVy = 0;
  dashEndVx = 0;
  dashEndVy = 0;
  readyTimer = 0;
  private lastMoveX = 0;
  private lastMoveY = 0;

  onFire: (x: number, y: number, dirX: number, dirY: number) => void = () => {};
  onDashStart: () => void = () => {};

  get dashing(): boolean {
    return this.dashTime > 0;
  }

  get invincible(): boolean {
    return this.dashing;
  }

  // 0 right after a shot, rising to 1 as the next shot is about to release.
  get drawProgress(): number {
    if (this.fireCooldown <= 0) return 0;
    const window = Math.min(cfg.feel.drawTime, 1 / Math.max(cfg.bow.fireRate, 0.01));
    return 1 - Math.min(1, this.fireCooldown / window);
  }

  // 0 while ready, 1 right after a dash ends.
  get dashCooldownFraction(): number {
    return cfg.dash.cooldown > 0 ? Math.max(0, this.dashCooldown / cfg.dash.cooldown) : 0;
  }

  update(dt: number, input: Input, aimWorld: Vec2 | null): void {
    if (aimWorld) {
      const dx = aimWorld.x - this.x;
      const dy = aimWorld.y - this.y;
      const len = Math.hypot(dx, dy);
      if (len > 1e-3) {
        this.aimX = dx / len;
        this.aimY = dy / len;
      }
    }

    if (input.justPressed('dash')) this.dashBuffer = Math.max(cfg.dash.inputBuffer, 1e-4);
    if (this.dashBuffer > 0 && !this.dashing && this.dashCooldown <= 0) this.startDash(input);
    this.dashBuffer -= dt;

    if (this.dashing) this.updateDash(dt);
    else this.updateMove(dt, input);

    if (!this.dashing) this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.updateFire(dt, input);
  }

  private updateMove(dt: number, input: Input): void {
    // Move input is in screen directions (W = up the screen); convert to a world direction.
    screenToWorldVel(input.move.x, input.move.y, cfg.player.moveSpeed, tmp);
    const tx = tmp.x;
    const ty = tmp.y;
    const dvx = tx - this.vx;
    const dvy = ty - this.vy;
    const dv = Math.hypot(dvx, dvy);
    const maxStep = cfg.player.accel * dt;
    if (dv <= maxStep) {
      this.vx = tx;
      this.vy = ty;
    } else {
      this.vx += (dvx / dv) * maxStep;
      this.vy += (dvy / dv) * maxStep;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  // Dashes in the direction of movement, or the last one if standing still.
  private startDash(input: Input): void {
    const len = Math.hypot(input.move.x, input.move.y);
    if (len > 0.01) {
      this.lastMoveX = input.move.x / len;
      this.lastMoveY = input.move.y / len;
    } else if (this.lastMoveX === 0 && this.lastMoveY === 0) {
      // Never moved yet: fall back to the aim direction as seen on screen.
      const from = toScreen(this.x, this.y, { x: 0, y: 0 });
      const to = toScreen(this.x + this.aimX, this.y + this.aimY, { x: 0, y: 0 });
      const l = Math.hypot(to.x - from.x, to.y - from.y) || 1;
      this.lastMoveX = (to.x - from.x) / l;
      this.lastMoveY = (to.y - from.y) / l;
    }
    screenToWorldVel(this.lastMoveX, this.lastMoveY, cfg.dash.distance / cfg.dash.duration, tmp);
    this.dashVx = tmp.x;
    this.dashVy = tmp.y;
    // Carry normal run speed out of the dash rather than the dash speed.
    screenToWorldVel(this.lastMoveX, this.lastMoveY, cfg.player.moveSpeed, tmp);
    this.dashEndVx = tmp.x;
    this.dashEndVy = tmp.y;
    this.dashBuffer = 0;
    this.dashTime = cfg.dash.duration;
    this.onDashStart();
  }

  private updateDash(dt: number): void {
    const step = Math.min(dt, this.dashTime);
    this.x += this.dashVx * step;
    this.y += this.dashVy * step;
    this.dashTime -= dt;
    if (this.dashTime <= 0) {
      this.dashTime = 0;
      this.dashCooldown = cfg.dash.cooldown;
      this.vx = this.dashEndVx;
      this.vy = this.dashEndVy;
    }
  }

  private updateFire(dt: number, input: Input): void {
    this.fireCooldown -= dt;
    if (input.isDown('fire')) this.readyTimer = cfg.feel.armReadyTime;
    else this.readyTimer = Math.max(0, this.readyTimer - dt);
    const canFire = !this.dashing || cfg.bow.fireWhileDashing;
    if (input.isDown('fire') && canFire) {
      // Keep the remainder so holding fire gives an exact cadence.
      while (this.fireCooldown <= 0) {
        this.onFire(this.x, this.y, this.aimX, this.aimY);
        this.fireCooldown += 1 / Math.max(cfg.bow.fireRate, 0.01);
      }
    } else if (this.fireCooldown < 0) {
      this.fireCooldown = 0;
    }
  }
}
