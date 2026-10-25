import Phaser from 'phaser';
import { makePlaceholderArt, Tex } from '../art/placeholders';
import { cfg } from '../config';
import { DevMenu } from '../dev/DevMenu';
import { Abilities } from '../game/Abilities';
import { Arrows, Hittable } from '../game/Arrows';
import { Dummies } from '../game/Dummies';
import { Fairies } from '../game/Fairies';
import { Fx } from '../game/Fx';
import { Ground } from '../game/Ground';
import { Hud } from '../game/Hud';
import { Player } from '../game/Player';
import { PlayerView } from '../game/PlayerView';
import { Input, KeyboardMouseSource } from '../input';
import { ellipseHalfSize, toScreen, toWorld } from '../iso';
import { SpatialHash } from '../util/spatialHash';

const screen = { x: 0, y: 0 };

export class GameScene extends Phaser.Scene {
  private input2!: Input;
  private player!: Player;
  private playerView!: PlayerView;
  private arrows!: Arrows;
  private dummies!: Dummies;
  private fx!: Fx;
  private ground!: Ground;
  private abilities!: Abilities;
  private fairies!: Fairies;
  private hud!: Hud;
  private targets = new SpatialHash<Hittable>(64);
  private devMenu!: DevMenu;
  private debugGfx!: Phaser.GameObjects.Graphics;
  private stats!: Phaser.GameObjects.Text;
  private vignette!: Phaser.GameObjects.Image;
  private camCenter = { x: 0, y: 0 };

  constructor() {
    super('game');
  }

  create(): void {
    makePlaceholderArt(this);

    this.input2 = new Input([new KeyboardMouseSource(this.game.canvas)]);
    this.ground = new Ground(this);
    this.fx = new Fx(this);
    this.player = new Player();
    this.playerView = new PlayerView(this, this.player, this.fx);
    this.arrows = new Arrows(this);
    this.dummies = new Dummies(this);
    this.fairies = new Fairies(this, this.fx);
    this.abilities = new Abilities(this, this.fx, () => this.dummies.list);
    this.hud = new Hud(this, 2);

    this.player.onFire = (x, y, dx, dy) => {
      this.arrows.fire(x, y, dx, dy);
      this.playerView.onFire();
    };
    this.player.onDashStart = () => this.playerView.onDashStart();
    this.player.onTeleport = (x0, y0, x1, y1) => this.playerView.onTeleport(x0, y0, x1, y1);
    this.abilities.onCast = (kind) => this.fairies.flare(kind);
    this.abilities.onDamage = (target, amount, x, y) => {
      this.dummies.damage(target, amount);
      toScreen(x, y, screen);
      this.fx.damageNumber(screen.x, screen.y - 40, amount);
    };
    this.arrows.onHit = (target, damage, hx, hy) => {
      this.dummies.damage(target, damage);
      toScreen(hx, hy, screen);
      this.fx.damageNumber(screen.x, screen.y - cfg.render.arrowHeight - 8, damage);
      this.fx.addShake(cfg.camera.shakeOnHit);
    };
    this.dummies.onDestroyed = (x, y) => {
      toScreen(x, y, screen);
      this.fx.smoke(screen.x, screen.y - 8 * cfg.render.pixelScale, 10, 10);
    };

    this.debugGfx = this.add.graphics().setDepth(2e6);
    this.vignette = this.add.image(0, 0, Tex.vignette).setOrigin(0).setScrollFactor(0).setDepth(3e6);
    this.stats = this.add
      .text(8, 8, '', { fontFamily: 'monospace', fontSize: '12px', color: '#9a93b0' })
      .setScrollFactor(0)
      .setDepth(4e6);

    this.devMenu = new DevMenu([
      { label: 'Spawn target dummies', run: () => this.dummies.spawnRing(this.player.x, this.player.y) },
      { label: 'Clear dummies', run: () => this.dummies.clear() },
      { label: 'Reset ability cooldowns', run: () => this.abilities.resetCooldowns() },
      { label: 'Recenter player', run: () => Object.assign(this.player, { x: 0, y: 0, vx: 0, vy: 0 }) },
    ]);
    this.dummies.spawnRing(0, 0);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input2.destroy());
  }

  update(_time: number, deltaMs: number): void {
    const input = this.input2;
    input.update();
    if (input.justPressed('devMenu')) this.devMenu.toggle();

    const dt = Math.min(deltaMs / 1000, 0.05) * cfg.time.timeScale;
    const cam = this.cameras.main;

    // The cursor usually sits on a sprite's body, not its feet, so aim at the ground point below it.
    let aimWorld = null;
    if (input.aim) aimWorld = toWorld(cam.scrollX + input.aim.x, cam.scrollY + input.aim.y + cfg.render.aimHeight);

    // Abilities place things on the ground under the cursor, unlike aiming which targets bodies.
    const cursor = input.aim ? toWorld(cam.scrollX + input.aim.x, cam.scrollY + input.aim.y) : null;

    this.targets.clear();
    this.dummies.update(dt, this.targets);
    this.player.update(dt, input, aimWorld);
    this.arrows.update(dt, this.targets, cfg.dummy.radius);
    this.abilities.update(dt, this.player, input, cursor);
    this.fairies.update(dt, this.player);
    this.fx.update(dt);

    // Camera follows the player's projected position, with screen shake on top.
    toScreen(this.player.x, this.player.y, screen);
    const follow = 1 - Math.exp(-cfg.camera.followRate * dt);
    this.camCenter.x += (screen.x - this.camCenter.x) * follow;
    this.camCenter.y += (screen.y - this.camCenter.y) * follow;
    cam.scrollX = this.camCenter.x - cam.width / 2 + this.fx.shakeOffset.x;
    cam.scrollY = this.camCenter.y - cam.height / 2 + this.fx.shakeOffset.y;

    this.ground.update(cam);
    this.playerView.update(dt);
    this.arrows.render();
    this.dummies.render();
    this.hud.update(cam.width, cam.height, [
      { key: 'Q', color: 0xff7a20, enabled: cfg.abilities.fireFairy, remaining: this.abilities.fireCooldown, total: cfg.fireCone.cooldown },
      { key: 'E', color: 0x7fd4ff, enabled: cfg.abilities.iceFairy, remaining: this.abilities.iceCooldown, total: cfg.iceStorm.cooldown },
    ]);
    this.vignette.setDisplaySize(cam.width, cam.height).setAlpha(cfg.render.vignette);
    this.drawDebug();

    input.endFrame();
  }

  private drawDebug(): void {
    const g = this.debugGfx;
    g.clear();
    this.stats.setVisible(cfg.debug.showStats);
    if (cfg.debug.showStats) {
      this.stats.setText(
        [
          `fps ${this.game.loop.actualFps.toFixed(0)}`,
          `arrows ${this.arrows.activeCount}`,
          `dummies ${this.dummies.aliveCount}/${this.dummies.list.length}`,
          `time x${cfg.time.timeScale}`,
        ].join('\n'),
      );
    }
    if (!cfg.debug.showHitboxes) return;
    const circle = (x: number, y: number, r: number, color: number) => {
      toScreen(x, y, screen);
      const h = ellipseHalfSize(r);
      g.lineStyle(1, color, 0.9);
      g.strokeEllipse(screen.x, screen.y, h.x * 2, h.y * 2);
    };
    circle(this.player.x, this.player.y, cfg.player.hitRadius, this.player.invincible ? 0x55ff99 : 0xff5566);
    for (const d of this.dummies.list) if (d.alive) circle(d.x, d.y, d.radius, 0xffcc55);
    this.arrows.forEachActive((x, y, r) => circle(x, y, r, 0x66ccff));
  }
}
