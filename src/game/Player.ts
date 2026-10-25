import { cfg } from '../config';
import { Input } from '../input';
import { toWorld, Vec2 } from '../iso';

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
  dashDirX = 1;
  dashDirY = 0;

  onFire: (x: number, y: number, dirX: number, dirY: number) => void = () => {};
  onDashStart: () => void = () => {};

  get dashing(): boolean {
    return this.dashTime > 0;
  }

  get invincible(): boolean {
    return this.dashing;
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
    if (this.dashBuffer > 0 && !this.dashing && this.dashCooldown <= 0) this.startDash();
    this.dashBuffer -= dt;

    if (this.dashing) this.updateDash(dt);
    else this.updateMove(dt, input);

    if (!this.dashing) this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.updateFire(dt, input);
  }

  private updateMove(dt: number, input: Input): void {
    // Move input is in screen directions (W = up the screen); convert to a world direction.
    let tx = 0;
    let ty = 0;
    const amount = Math.hypot(input.move.x, input.move.y);
    if (amount > 0) {
      const w = toWorld(input.move.x, input.move.y);
      const len = Math.hypot(w.x, w.y);
      tx = (w.x / len) * amount * cfg.player.moveSpeed;
      ty = (w.y / len) * amount * cfg.player.moveSpeed;
    }
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

  private startDash(): void {
    this.dashBuffer = 0;
    this.dashTime = cfg.dash.duration;
    this.dashDirX = this.aimX;
    this.dashDirY = this.aimY;
    this.onDashStart();
  }

  private updateDash(dt: number): void {
    const step = Math.min(dt, this.dashTime);
    const speed = cfg.dash.distance / cfg.dash.duration;
    this.x += this.dashDirX * speed * step;
    this.y += this.dashDirY * speed * step;
    this.dashTime -= dt;
    if (this.dashTime <= 0) {
      this.dashTime = 0;
      this.dashCooldown = cfg.dash.cooldown;
      // Carry normal run speed out of the dash rather than the dash speed.
      this.vx = this.dashDirX * cfg.player.moveSpeed;
      this.vy = this.dashDirY * cfg.player.moveSpeed;
    }
  }

  private updateFire(dt: number, input: Input): void {
    this.fireCooldown -= dt;
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
