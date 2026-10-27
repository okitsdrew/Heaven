import Phaser from 'phaser';
import { CRAYON_FONT, crayonLine, CrayonLine } from '../hub/Crayon';
import { Eyes } from '../hub/Eyes';

const DEPTH = 6e6;

// The throne speaking mid-run: a box at the top of the screen with its eyes watching the player and its words beside them.
// A click finishes the line being written, and the next click moves on.
export class ThroneBox {
  private waiters: (() => void)[] = [];
  private eyes: Eyes | null = null;
  private lines: CrayonLine[] = [];
  private icon: Phaser.GameObjects.Graphics | null = null;

  constructor(private scene: Phaser.Scene) {}

  // Call every frame while the box is up (the game itself is frozen).
  update(dt: number, target: { x: number; y: number }): void {
    this.eyes?.update(dt, target.x, target.y, true);
  }

  async play(lines: string[]): Promise<void> {
    const scene = this.scene;
    const cam = scene.cameras.main;
    const boxW = Math.min(cam.width - 40, 880);
    const boxH = 150;
    const x0 = (cam.width - boxW) / 2;
    const y0 = 24;
    const handler = () => {
      const waiting = this.waiters.splice(0);
      for (const w of waiting) w();
    };
    scene.input.on('pointerdown', handler);

    const g = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH).setAlpha(0);
    g.fillStyle(0x16121f, 0.94).fillRoundedRect(x0, y0, boxW, boxH, 10);
    g.fillStyle(0x000000, 1).fillRoundedRect(x0 + 8, y0 + 8, 200, boxH - 16, 8);
    g.lineStyle(2, 0xffffff, 0.85).strokeRoundedRect(x0, y0, boxW, boxH, 10);
    const eyes = new Eyes(scene, x0 + 108, y0 + boxH / 2, DEPTH + 1);
    eyes.setScroll(0);
    eyes.open = 1;
    this.eyes = eyes;
    scene.tweens.add({ targets: g, alpha: 1, duration: 250 });

    const size = 28;
    const textX = x0 + 230;
    const maxW = boxW - 260;
    for (const text of lines) {
      const rows = this.wrap(text, size, maxW);
      const lh = size * 1.5;
      const top = y0 + boxH / 2 - (rows.length * lh) / 2 + lh / 2;
      for (let i = 0; i < rows.length; i++) {
        const line = crayonLine(scene, rows[i], size);
        line.image.setScrollFactor(0).setPosition(textX, top + i * lh).setDepth(DEPTH + 2);
        this.lines.push(line);
        const t = { v: 0 };
        await this.skippable({ targets: t, v: 1, duration: 70 * Math.max(4, rows[i].length), ease: 'Sine.easeInOut', onUpdate: () => line.setReveal(t.v) });
        line.setReveal(1);
      }
      this.showIcon(x0 + boxW, y0 + boxH);
      await new Promise<void>((res) => this.waiters.push(res));
      this.icon?.destroy();
      this.icon = null;
      for (const l of this.lines) l.destroy();
      this.lines = [];
    }

    scene.input.off('pointerdown', handler);
    await new Promise<void>((res) => scene.tweens.add({ targets: g, alpha: 0, duration: 250, onComplete: () => res() }));
    g.destroy();
    eyes.destroy();
    this.eyes = null;
  }

  private showIcon(right: number, bottom: number): void {
    const g = this.scene.add.graphics().setScrollFactor(0).setPosition(right - 20, bottom).setDepth(DEPTH + 3);
    g.fillStyle(0x16121f, 1).fillRoundedRect(-11, -13, 22, 26, 8);
    g.lineStyle(2, 0xffffff, 0.9).strokeRoundedRect(-8, -10, 16, 20, 6);
    g.lineBetween(-8, -2, 8, -2);
    g.lineBetween(0, -10, 0, -2);
    g.fillStyle(0xffffff, 0.9).fillRoundedRect(-7, -9, 7, 7, 2);
    this.scene.tweens.add({ targets: g, alpha: 0.35, duration: 500, yoyo: true, repeat: -1 });
    this.icon = g;
  }

  private skippable(config: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
    return new Promise((res) => {
      let done = false;
      const finish = (natural: boolean) => {
        if (done) return;
        done = true;
        this.waiters = this.waiters.filter((f) => f !== waiter);
        if (!natural) tween.stop();
        res();
      };
      const waiter = () => finish(false);
      const tween = this.scene.tweens.add({ ...config, onComplete: () => finish(true) });
      this.waiters.push(waiter);
    });
  }

  private wrap(text: string, size: number, maxW: number): string[] {
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.font = `${size}px ${CRAYON_FONT}`;
    const out: string[] = [];
    let cur = '';
    for (const w of text.split(' ')) {
      const next = cur ? `${cur} ${w}` : w;
      if (cur && ctx.measureText(next).width + size * 0.06 * next.length + 36 > maxW) {
        out.push(cur);
        cur = w;
      } else cur = next;
    }
    if (cur) out.push(cur);
    return out;
  }
}
