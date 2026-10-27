import Phaser from 'phaser';
import { makePlaceholderArt, Tex } from '../art/placeholders';
import { cfg } from '../config';
import { DevMenu } from '../dev/DevMenu';
import { Abilities } from '../game/Abilities';
import { Arrows, Hittable } from '../game/Arrows';
import { Boss, slayDamage } from '../game/Boss';
import { Chunks } from '../game/Chunks';
import { Doomsday } from '../game/Doomsday';
import { Dummies } from '../game/Dummies';
import { Enemies, hpAt, pushOut, spawnRateAt } from '../game/Enemies';
import { Fairies } from '../game/Fairies';
import { Fx } from '../game/Fx';
import { Ground } from '../game/Ground';
import { Gold } from '../game/Gold';
import { Hud, RunHud } from '../game/Hud';
import { Player } from '../game/Player';
import { SwordSlash } from '../game/SwordSlash';
import { PlayerView } from '../game/PlayerView';
import { Input, KeyboardMouseSource } from '../input';
import { ellipseHalfSize, toScreen, toWorld } from '../iso';
import { exportSave, importSave, persist, persistNow, profile, resetSave } from '../save';
import { canUse, dustFraction, onKillBuffs, resetBuffs, runBuffs, stats as upgrades, tickBuffs, unlockEverything } from '../skills';
import { Screens } from '../ui/Screens';
import { SpatialHash } from '../util/spatialHash';
import { addXp, setLevel, xpToNext } from '../xp';

const screen = { x: 0, y: 0 };

export class GameScene extends Phaser.Scene {
  private input2!: Input;
  private player!: Player;
  private playerView!: PlayerView;
  private arrows!: Arrows;
  private dummies!: Dummies;
  private enemies!: Enemies;
  private chunks!: Chunks;
  private boss!: Boss;
  private bossSpawned = false;
  private targetList: Hittable[] = [];
  private clock = 0;
  // Where the run clock began (Time Warp starts it ahead); the run length counts from here.
  private clockStart = 0;
  private run = { kills: 0, gold: 0, xp: 0, levels: 0 };
  private endTimer = 0;
  private endTitle = '';
  private endDied = false;
  private dead = false;
  private menu = false;
  private gold!: Gold;
  private runHud!: RunHud;
  private screens!: Screens;
  private fx!: Fx;
  private ground!: Ground;
  private abilities!: Abilities;
  private fairies!: Fairies;
  private swordSlash!: SwordSlash;
  private doomsday!: Doomsday;
  private hitStop = 0;
  private hud!: Hud;
  private targets = new SpatialHash<Hittable>(64);
  private devMenu = DevMenu.get();
  private debugGfx!: Phaser.GameObjects.Graphics;
  private stats!: Phaser.GameObjects.Text;
  private vignette!: Phaser.GameObjects.Image;
  private camCenter = { x: 0, y: 0 };

  constructor() {
    super('game');
  }

  create(): void {
    makePlaceholderArt(this);
    this.menu = false;
    this.dead = false;
    this.bossSpawned = false;
    this.hitStop = 0;
    this.run = { kills: 0, gold: 0, xp: 0, levels: 0 };
    resetBuffs();

    this.input2 = new Input([new KeyboardMouseSource(this.game.canvas)]);
    this.ground = new Ground(this);
    this.fx = new Fx(this);
    this.player = new Player();
    this.playerView = new PlayerView(this, this.player, this.fx);
    this.playerView.hero = true;
    this.playerView.slashArms = () => this.swordSlash.flapArms();
    this.arrows = new Arrows(this, this.fx);
    this.dummies = new Dummies(this);
    this.enemies = new Enemies(this);
    this.chunks = new Chunks(this, this.fx);
    this.boss = new Boss(this, this.fx, () => this.targetList);
    this.boss.onSlay = (t) => this.damage(t, slayDamage);
    this.gold = new Gold(this);
    this.runHud = new RunHud(this);
    this.screens = Screens.get();
    this.gold.onCollect = (v) => {
      profile.gold += v;
      this.run.gold += v;
      persist();
    };
    this.fairies = new Fairies(this, this.fx);
    this.abilities = new Abilities(this, this.fx, () => this.targetList);
    this.swordSlash = new SwordSlash(this, this.fx, () => this.targetList);
    this.doomsday = new Doomsday(this, this.fx, () => this.targetList);
    this.hud = new Hud(this, 4);

    this.player.onFire = (_x, _y, dx, dy) => {
      const m = this.playerView.muzzle();
      this.arrows.fire(m.x, m.y, dx, dy);
      this.playerView.onFire();
    };
    this.player.onDashStart = () => {
      this.swordSlash.interrupt();
      this.playerView.onDashStart();
    };
    this.player.onTeleport = (x0, y0, x1, y1, t) => {
      this.swordSlash.interrupt();
      this.playerView.onTeleport(x0, y0, x1, y1, t);
    };
    this.player.onTeleportArrive = (x, y) => this.playerView.onTeleportArrive(x, y);
    this.abilities.onCast = (kind) => this.fairies.flare(kind);
    this.abilities.onAimStart = () => {
      this.swordSlash.armed = false;
      this.doomsday.cancel();
    };
    this.abilities.onBurn = (t) => this.enemies.ignite(t);
    this.abilities.onFreeze = () => this.boss.freeze();
    this.enemies.fx = this.fx;
    this.enemies.onBurnTick = (x, y, amount) => {
      toScreen(x, y, screen);
      this.fx.damageNumber(screen.x, screen.y - 40, amount);
    };
    this.doomsday.onAimStart = () => {
      this.abilities.aiming = null;
      this.swordSlash.cancel();
    };
    this.doomsday.onCast = (x, y) => this.player.teleportTo(x, y, cfg.doomsday.windup);
    this.doomsday.onImpact = () => (this.hitStop = 0.14);
    this.doomsday.onDamage = (target, amount, x, y) => {
      this.damage(target, amount);
      toScreen(x, y, screen);
      this.fx.damageNumber(screen.x, screen.y - 40, amount);
    };
    this.doomsday.onStun = (target) => {
      if (target.kind === 'boss') this.boss.stun(cfg.stun.duration);
      else this.enemies.stun(target, cfg.stun.duration);
    };
    this.doomsday.onKnock = (target, dx, dy, force) => this.enemies.knock(target, dx, dy, force);
    this.swordSlash.onDamage = (target, amount, x, y) => {
      this.damage(target, amount);
      if (target.kind === 'boss') this.boss.stun(cfg.stun.duration);
      else this.enemies.stun(target, cfg.stun.duration);
      toScreen(x, y, screen);
      this.fx.damageNumber(screen.x, screen.y - 40, amount);
    };
    this.abilities.onDamage = (target, amount, x, y) => {
      this.damage(target, amount);
      toScreen(x, y, screen);
      this.fx.damageNumber(screen.x, screen.y - 40, amount);
    };
    this.arrows.onHit = (target, damage, hx, hy) => {
      this.damage(target, damage);
      toScreen(hx, hy, screen);
      this.fx.damageNumber(screen.x, screen.y - cfg.render.arrowHeight - 8, damage);
      this.fx.addShake(cfg.camera.shakeOnHit);
    };
    this.arrows.onBlocked = (x, y) => {
      toScreen(x, y, screen);
      this.fx.smoke(screen.x, screen.y - cfg.render.arrowHeight, 3, 3);
    };
    this.dummies.onDestroyed = (x, y) => {
      toScreen(x, y, screen);
      this.fx.smoke(screen.x, screen.y - 8 * cfg.render.pixelScale, 10, 10);
    };
    this.enemies.onKilled = (x, y, type) => {
      this.run.kills++;
      onKillBuffs();
      this.run.xp += cfg.xp.perKill;
      const gained = addXp(cfg.xp.perKill);
      if (gained > 0) {
        this.run.levels += gained;
        this.runHud.announce(`LEVEL ${profile.level}!`);
      }
      this.gold.drop(x, y, upgrades.goldValue());
      const px = cfg.render.pixelScale;
      const size = cfg[type].scale;
      toScreen(x, y, screen);
      const cy = screen.y - 9 * px * size;
      this.fx.smoke(screen.x, cy, Math.round(cfg.enemy.deathSmoke * size), 6 * px * size);
      if (cfg.enemy.deathFlash > 0) {
        this.fx.particle({ x: screen.x, y: cy, life: 0.15, from: cfg.enemy.deathFlash * size, to: 0, tint: 0xb9a4ff, depth: screen.y + 2 });
      }
    };

    this.boss.onKilled = (x, y) => {
      toScreen(x, y, screen);
      const px = cfg.render.pixelScale;
      this.fx.smoke(screen.x, screen.y - 10 * px, cfg.boss.deathSmoke, 24 * px);
      this.fx.particle({ x: screen.x, y: screen.y - 10 * px, life: 0.4, from: 6, to: 0, tint: 0xffffff, depth: screen.y + 2 });
      this.fx.addShake(cfg.boss.deathShake);
      this.gold.drop(x, y, cfg.boss.rewardGold);
      profile.skillPoints += cfg.boss.rewardSkillPoints;
      persist();
      this.runHud.announce(`BOSS DEFEATED  +${cfg.boss.rewardSkillPoints} skill point`);
    };

    this.debugGfx = this.add.graphics().setDepth(2e6);
    this.vignette = this.add.image(0, 0, Tex.vignette).setOrigin(0).setScrollFactor(0).setDepth(3e6);
    this.stats = this.add
      .text(8, 8, '', { fontFamily: 'monospace', fontSize: '12px', color: '#9a93b0' })
      .setScrollFactor(0)
      .setDepth(4e6);

    // Jumps move the clock and its start together, so the ramp advances without using up the run.
    const setClock = (t: number) => {
      this.clockStart += t - this.clock;
      this.clock = t;
    };
    const jump = (s: number) => () => setClock(Math.max(0, this.clock + s));
    this.devMenu.setActions([
      { label: 'Clock +30s', run: jump(30) },
      { label: 'Clock +60s', run: jump(60) },
      { label: 'Clock to 5:00', run: () => setClock(300) },
      { label: 'Clock to 0', run: () => setClock(0) },
      { label: 'Spawn boss', run: () => this.spawnBoss() },
      { label: 'Kill boss', run: () => this.boss.damage(this.boss.hp) },
      { label: 'Clock to boss spawn -5s', run: () => setClock(cfg.boss.spawnTime - 5) },
      { label: 'Spawn 50 enemies', run: () => this.spawnBurst(50) },
      { label: 'Clear enemies', run: () => this.enemies.clear() },
      { label: 'Go home (hub)', run: () => this.goHome() },
      { label: 'Restart run', run: () => this.startRun() },
      { label: 'End run (show summary)', run: () => this.endRun('Run ended') },
      { label: 'Open skill tree', run: () => this.openTree() },
      { label: 'Add 100 souls', run: () => this.addProfile('gold', 100) },
      { label: 'Add 10 skill points', run: () => this.addProfile('skillPoints', 10) },
      {
        label: 'Set level...',
        run: () => {
          const v = Number(prompt('Set level', String(profile.level)));
          if (Number.isFinite(v) && v >= 1) setLevel(v);
        },
      },
      {
        label: 'Unlock the book',
        run: () => {
          profile.bookUnlocked = true;
          persistNow();
        },
      },
      {
        label: 'Unlock all nodes and skills',
        run: () => {
          unlockEverything();
          persistNow();
        },
      },
      { label: 'Export save', run: () => prompt('Save JSON (copy it)', exportSave()) },
      {
        label: 'Import save',
        run: () => {
          const text = prompt('Paste save JSON');
          if (!text) return;
          try {
            importSave(text);
          } catch {
            alert('That is not valid save JSON.');
          }
        },
      },
      {
        label: 'Reset save (souls, level, tree)',
        run: () => {
          if (confirm('Erase souls, level, XP and every skill tree purchase?')) resetSave();
        },
      },
      { label: 'Spawn target dummies', run: () => this.dummies.spawnRing(this.player.x, this.player.y) },
      { label: 'Clear dummies', run: () => this.dummies.clear() },
      {
        label: 'Reset ability cooldowns',
        run: () => {
          this.abilities.resetCooldowns();
          this.swordSlash.cooldown = 0;
          this.doomsday.cooldown = 0;
        },
      },
      { label: 'Recenter player', run: () => Object.assign(this.player, { x: 0, y: 0, vx: 0, vy: 0 }) },
    ]);

    this.clockStart = 0;
    this.clock = this.clockStart;

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input2.destroy());
  }

  update(_time: number, deltaMs: number): void {
    const input = this.input2;
    input.update();
    if (input.justPressed('devMenu')) this.devMenu.toggle();
    if (this.menu) {
      input.endFrame();
      return;
    }

    let dt = Math.min(deltaMs / 1000, 0.05) * cfg.time.timeScale;
    // A brief slow-motion beat on the Doomsday impact.
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      dt *= 0.08;
    }
    const cam = this.cameras.main;

    // The cursor usually sits on a sprite's body, not its feet, so aim at the ground point below it.
    let aimWorld = null;
    if (input.aim) aimWorld = toWorld(cam.scrollX + input.aim.x, cam.scrollY + input.aim.y + cfg.render.aimHeight);

    // Abilities place things on the ground under the cursor, unlike aiming which targets bodies.
    const cursor = input.aim ? toWorld(cam.scrollX + input.aim.x, cam.scrollY + input.aim.y) : null;

    this.targets.clear();
    this.dummies.update(dt, this.targets);
    this.player.fireBlocked = this.swordSlash.blocksFire || this.abilities.blocksFire || this.doomsday.blocksFire;
    if (!this.dead) {
      this.player.update(dt, input, aimWorld);
      const body = { x: this.player.x, y: this.player.y, radius: cfg.player.bodyRadius };
      pushOut(body, this.chunks.obstacles);
      this.player.x = body.x;
      this.player.y = body.y;
      this.clock += dt;
      tickBuffs(dt);
      if (cfg.boss.enabled && !this.bossSpawned && this.clock >= cfg.boss.spawnTime) this.spawnBoss();
      if (this.clock - this.clockStart >= upgrades.runTime()) this.endRun("Time's up");
    }

    const view = { halfW: cam.width / 2, halfH: cam.height / 2, heading: this.heading() };
    const slowAt = (x: number, y: number, r: number) => this.abilities.slowAt(x, y, r);
    this.enemies.update(dt, this.clock, this.player.x, this.player.y, view, this.chunks.obstacles, slowAt, !this.dead);
    this.gold.update(dt, this.player.x, this.player.y, !this.dead);
    this.enemies.insertInto(this.targets);
    this.targetList.length = 0;
    for (const d of this.dummies.list) if (d.alive) this.targetList.push(d);
    for (const e of this.enemies.list) if (e.alive) this.targetList.push(e);
    if (this.boss.targetable) {
      this.targets.insert(this.boss, this.boss.x, this.boss.y);
      this.targetList.push(this.boss);
    }

    this.abilities.obstacles = this.chunks.obstacles;
    this.arrows.update(dt, this.targets, Math.max(cfg.dummy.radius, this.enemies.maxRadius, this.boss.radius), this.chunks.obstacles);
    this.abilities.update(dt, this.player, input, cursor);
    this.swordSlash.update(dt, this.player, input);
    this.playerView.gauntlet = canUse('doomsday');
    this.playerView.handRaise = this.doomsday.raise;
    this.doomsday.update(dt, this.player, input, cursor, this.playerView.handPos, { width: cam.width, height: cam.height });
    if (!this.dead && !this.player.safe && !cfg.debug.godMode) {
      if (this.enemies.touching(this.player.x, this.player.y, cfg.player.hitRadius)) this.endRun('You died', true);
    }
    const bossHit = this.boss.update(dt, this.player.x, this.player.y, this.player.safe || this.dead, cfg.player.hitRadius);
    if (bossHit && !this.dead && !cfg.debug.godMode) this.endRun('Cut down by your shade', true);
    if (this.dead) {
      this.endTimer -= dt;
      if (this.endTimer <= 0) this.showSummary();
    }
    this.fairies.update(dt, this.player, { fire: this.abilities.fireAttach(), ice: this.abilities.iceAttach() });
    this.fx.update(dt);

    // Camera follows the player's projected position, with screen shake on top.
    toScreen(this.player.x, this.player.y, screen);
    const follow = 1 - Math.exp(-cfg.camera.followRate * dt);
    this.camCenter.x += (screen.x - this.camCenter.x) * follow;
    this.camCenter.y += (screen.y - this.camCenter.y) * follow;
    cam.scrollX = this.camCenter.x - cam.width / 2 + this.fx.shakeOffset.x;
    cam.scrollY = this.camCenter.y - cam.height / 2 + this.fx.shakeOffset.y;

    this.ground.update(cam);
    this.chunks.update(dt, cam);
    if (!this.dead) {
      this.playerView.dustFraction = dustFraction();
      this.playerView.update(dt);
    }
    this.arrows.render();
    this.boss.render(dt, cam.width);
    this.dummies.render();
    this.enemies.render(this.player.x);
    this.gold.render(cam);
    this.runHud.update(dt, cam.width, {
      left: upgrades.runTime() - (this.clock - this.clockStart),
      gold: profile.gold,
      level: profile.level,
      xp: profile.xp,
      need: xpToNext(profile.level),
      dust: runBuffs.dust,
    });
    this.hud.update(cam.width, cam.height, [
      { key: 'Q', color: 0xff7a20, enabled: canUse('fireFairy'), remaining: this.abilities.fireCooldown, total: cfg.fireWave.cooldown, active: this.abilities.aiming === 'fire' },
      { key: 'E', color: 0x7fd4ff, enabled: canUse('iceFairy'), remaining: this.abilities.iceCooldown, total: cfg.iceStorm.cooldown, active: this.abilities.aiming === 'ice' },
      { key: 'F', color: 0xffd21a, enabled: canUse('doomsday'), remaining: this.doomsday.cooldown, total: cfg.doomsday.cooldown, active: this.doomsday.aiming || this.doomsday.busy },
      { key: 'R', color: 0xb070ff, enabled: canUse('swordSlash'), remaining: this.swordSlash.cooldown, total: cfg.swordSlash.cooldown, active: this.swordSlash.armed || this.swordSlash.active },
    ]);
    this.vignette.setDisplaySize(cam.width, cam.height).setAlpha(cfg.render.vignette);
    this.drawDebug();

    input.endFrame();
  }

  private damage(target: Hittable, amount: number): void {
    if (target.kind === 'enemy') this.enemies.damage(target, amount, this.player.x, this.player.y);
    else if (target.kind === 'boss') this.boss.damage(amount);
    else this.dummies.damage(target, amount);
  }

  // Screen-space direction of travel, unit length, or zero while (nearly) still.
  private heading(): { x: number; y: number } {
    const p = this.player;
    toScreen(p.vx, p.vy, screen);
    const len = Math.hypot(screen.x, screen.y);
    if (len < cfg.player.moveSpeed * 0.1) return { x: 0, y: 0 };
    return { x: screen.x / len, y: screen.y / len };
  }

  private spawnBurst(n: number): void {
    const cam = this.cameras.main;
    const view = { halfW: cam.width / 2, halfH: cam.height / 2, heading: this.heading() };
    for (let i = 0; i < n; i++) this.enemies.spawn(this.clock, this.player.x, this.player.y, view);
  }

  private spawnBoss(): void {
    this.bossSpawned = true;
    this.boss.spawn(this.player.x, this.player.y);
    this.runHud.announce('Your shade approaches');
    this.fx.addShake(cfg.camera.shakeOnCast);
  }

  private addProfile(field: 'gold' | 'skillPoints', amount: number): void {
    profile[field] += amount;
    persistNow();
  }

  // Ends the run: a death gets smoke and shake first, then the summary menu appears.
  private endRun(title: string, died = false): void {
    if (this.dead) return;
    this.dead = true;
    this.endTitle = title;
    this.endDied = died;
    this.endTimer = died ? 0.9 : 0.5;
    this.swordSlash.interrupt();
    persistNow();
    if (!died) return;
    this.playerView.setVisible(false);
    toScreen(this.player.x, this.player.y, screen);
    const px = cfg.render.pixelScale;
    this.fx.smoke(screen.x, screen.y - 10 * px, cfg.run.deathSmoke, 8 * px);
    this.fx.particle({ x: screen.x, y: screen.y - 10 * px, life: 0.3, from: 3, to: 0, tint: 0xffe0b0 });
    this.fx.addShake(cfg.run.deathShake);
  }

  private showSummary(): void {
    this.menu = true;
    // The first death after earning a skill point leads straight to the throne room, where the book is offered.
    if (this.endDied && profile.introDone && !profile.bookUnlocked && profile.skillPoints > 0) {
      this.screens.hide();
      persistNow();
      this.scene.start('hub', { bookIntro: true });
      return;
    }
    this.screens.showSummary(
      { title: this.endTitle, kills: this.run.kills, gold: this.run.gold, xp: this.run.xp, levelsGained: this.run.levels, time: this.clock - this.clockStart },
      () => this.startRun(),
      () => this.openTree(),
    );
  }

  private goHome(): void {
    this.screens.hide();
    persistNow();
    this.scene.start('hub');
  }

  private openTree(): void {
    this.menu = true;
    this.screens.showTree(() => this.startRun(), () => this.goHome());
  }

  private startRun(): void {
    this.screens.hide();
    this.menu = false;
    this.dead = false;
    this.clockStart = 0;
    this.clock = this.clockStart;
    resetBuffs();
    this.run = { kills: 0, gold: 0, xp: 0, levels: 0 };
    this.enemies.clear();
    this.boss.clear();
    this.bossSpawned = false;
    this.gold.clear();
    this.abilities.reset();
    this.doomsday.reset();
    this.hitStop = 0;
    this.swordSlash.cancel();
    this.swordSlash.cooldown = 0;
    Object.assign(this.player, { x: 0, y: 0, vx: 0, vy: 0, dashTime: 0, teleportTime: 0, lockTime: 0 });
    toScreen(0, 0, this.camCenter);
    this.playerView.setVisible(true);
  }

  private drawDebug(): void {
    const g = this.debugGfx;
    g.clear();
    this.stats.setVisible(cfg.debug.showStats);
    if (cfg.debug.showStats) {
      this.stats.setText(
        [
          `fps ${this.game.loop.actualFps.toFixed(0)}`,
          `enemies ${this.enemies.count}/${cfg.spawn.maxEnemies}`,
          `clock ${clock(this.clock)}${cfg.debug.godMode ? '  GOD' : ''}`,
          `spawn ${spawnRateAt(this.clock).toFixed(1)}/s  hp ${Math.round(hpAt(this.clock))}`,
          `kills ${this.run.kills}  gold piles ${this.gold.piles}`,
          `arrows ${this.arrows.activeCount}`,
          `chunks ${this.chunks.loaded}  obstacles ${this.chunks.obstacles.length}`,
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
    circle(this.player.x, this.player.y, cfg.player.hitRadius, this.player.safe ? 0x55ff99 : 0xff5566);
    for (const d of this.dummies.list) if (d.alive) circle(d.x, d.y, d.radius, 0xffcc55);
    this.enemies.forEach((x, y, r) => circle(x, y, r, 0xff9944));
    for (const o of this.chunks.obstacles) circle(o.x, o.y, o.radius, 0x99aaff);
    this.arrows.forEachActive((x, y, r) => circle(x, y, r, 0x66ccff));
  }
}

function clock(t: number): string {
  const m = Math.floor(t / 60);
  const sec = Math.floor(t % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}
