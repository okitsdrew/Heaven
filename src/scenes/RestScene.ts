import Phaser from 'phaser';
import { makePlaceholderArt } from '../art/placeholders';
import { cfg } from '../config';
import { Fx } from '../game/Fx';
import { Player } from '../game/Player';
import { PlayerView } from '../game/PlayerView';
import { Input, KeyboardMouseSource } from '../input';
import { toScreen, toWorld } from '../iso';

const HALF = 260;

// Anathema's Resting Ground: for now just a small black room to stand in. Walking out through the glowing
// doorway at the south end returns to the hub.
export class RestScene extends Phaser.Scene {
  private input2!: Input;
  private player!: Player;
  private view!: PlayerView;
  private fx!: Fx;
  private floor!: Phaser.GameObjects.Graphics;
  private leaving = false;

  constructor() {
    super('rest');
  }

  create(): void {
    makePlaceholderArt(this);
    this.cameras.main.setBackgroundColor(0x000000);
    this.leaving = false;
    this.input2 = new Input([new KeyboardMouseSource(this.game.canvas)]);
    this.fx = new Fx(this);
    this.player = new Player();
    this.player.fireBlocked = true;
    this.view = new PlayerView(this, this.player, this.fx);
    this.view.hero = true;
    this.view.stepSound = 'stone';
    this.view.hideBow = true;
    this.player.onDashStart = () => this.view.onDashStart();
    this.player.onTeleport = (x0, y0, x1, y1, t) => this.view.onTeleport(x0, y0, x1, y1, t);
    this.player.onTeleportArrive = (x, y) => this.view.onTeleportArrive(x, y);
    this.player.x = 0;
    this.player.y = 120;
    this.player.aimX = 0;
    this.player.aimY = -1;

    // A black diamond of floor with a faint edge, and a glowing doorway at the south corner.
    this.floor = this.add.graphics().setDepth(-1e9);
    const corners = [toScreen(-HALF, -HALF), toScreen(HALF, -HALF), toScreen(HALF, HALF), toScreen(-HALF, HALF)];
    this.floor.fillStyle(0x07050b, 1).fillPoints(corners, true);
    this.floor.lineStyle(3, 0x2a2040, 1).strokePoints(corners, true);
    const door = toScreen(0, HALF);
    this.floor.fillStyle(0x7a1020, 0.5).fillEllipse(door.x, door.y, 120, 40);
    this.add
      .text(0, toScreen(-HALF, -HALF).y - 60, "Anathema's Resting Ground", { fontFamily: 'monospace', fontSize: '18px', color: '#6f6788' })
      .setOrigin(0.5)
      .setDepth(-1e8);
    this.add
      .text(0, toScreen(-HALF, -HALF).y - 34, '(placeholder: walk out through the red glow to leave)', { fontFamily: 'monospace', fontSize: '12px', color: '#4a4166' })
      .setOrigin(0.5)
      .setDepth(-1e8);

    const veil = this.add.rectangle(0, 0, 10000, 10000, 0x000000).setDepth(5e6);
    this.tweens.add({ targets: veil, alpha: 0, duration: 600, onComplete: () => veil.destroy() });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input2.destroy());
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.05);
    const cam = this.cameras.main;
    const input = this.input2;
    input.update();
    const aim = input.aim ? toWorld(cam.scrollX + input.aim.x, cam.scrollY + input.aim.y + cfg.render.aimHeight) : null;
    this.player.update(dt, input, aim);
    this.player.x = Phaser.Math.Clamp(this.player.x, -HALF, HALF);
    this.player.y = Phaser.Math.Clamp(this.player.y, -HALF, HALF + 40);
    this.view.update(dt);
    this.fx.update(dt);
    toScreen(this.player.x, this.player.y, this.camPos);
    cam.centerOn(this.camPos.x + this.fx.shakeOffset.x, this.camPos.y + this.fx.shakeOffset.y);
    if (!this.leaving && this.player.y > HALF + 20 && Math.abs(this.player.x) < 70) {
      this.leaving = true;
      this.input2.destroy();
      this.scene.start('hub', {});
    }
    input.endFrame();
  }

  private camPos = { x: 0, y: 0 };
}
