import Phaser from 'phaser';

export interface HudSlot {
  key: string;
  color: number;
  enabled: boolean;
  remaining: number;
  total: number;
}

const SIZE = 44;
const GAP = 10;

// Screen-fixed cooldown boxes along the bottom edge.
export class Hud {
  private gfx: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private timers: Phaser.GameObjects.Text[] = [];

  constructor(scene: Phaser.Scene, slots: number) {
    this.gfx = scene.add.graphics().setScrollFactor(0).setDepth(5e6);
    for (let i = 0; i < slots; i++) {
      this.labels.push(
        scene.add
          .text(0, 0, '', { fontFamily: 'monospace', fontSize: '18px', fontStyle: 'bold', color: '#e9e3f5' })
          .setOrigin(0.5)
          .setScrollFactor(0)
          .setDepth(5e6 + 1),
      );
      this.timers.push(
        scene.add
          .text(0, 0, '', { fontFamily: 'monospace', fontSize: '13px', color: '#f2d7a6', stroke: '#120f18', strokeThickness: 3 })
          .setOrigin(0.5)
          .setScrollFactor(0)
          .setDepth(5e6 + 1),
      );
    }
  }

  update(width: number, height: number, slots: HudSlot[]): void {
    const g = this.gfx;
    g.clear();
    const shown = slots.filter((s) => s.enabled);
    const total = shown.length * SIZE + Math.max(0, shown.length - 1) * GAP;
    let x = (width - total) / 2;
    const y = height - SIZE - 36;

    this.labels.forEach((l) => l.setVisible(false));
    this.timers.forEach((t) => t.setVisible(false));
    shown.forEach((s, i) => {
      const ready = s.remaining <= 0.001;
      g.fillStyle(0x14111c, 0.85);
      g.fillRect(x, y, SIZE, SIZE);
      if (!ready && s.total > 0) {
        g.fillStyle(s.color, 0.22);
        g.fillRect(x, y + SIZE * (1 - s.remaining / s.total), SIZE, SIZE * (s.remaining / s.total));
      } else {
        g.fillStyle(s.color, 0.35);
        g.fillRect(x, y, SIZE, SIZE);
      }
      g.lineStyle(2, s.color, ready ? 1 : 0.4);
      g.strokeRect(x, y, SIZE, SIZE);

      this.labels[i].setVisible(true).setText(s.key).setPosition(x + SIZE / 2, y + SIZE / 2).setAlpha(ready ? 1 : 0.5);
      if (!ready) {
        const text = s.remaining >= 10 ? String(Math.ceil(s.remaining)) : s.remaining.toFixed(1);
        this.timers[i].setVisible(true).setText(text).setPosition(x + SIZE / 2, y + SIZE + 10);
      }
      x += SIZE + GAP;
    });
  }
}
