import Phaser from 'phaser';

export interface HudSlot {
  key: string;
  color: number;
  enabled: boolean;
  remaining: number;
  total: number;
  active?: boolean;
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
      g.lineStyle(s.active ? 4 : 2, s.active ? 0xffffff : s.color, ready || s.active ? 1 : 0.4);
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

// Screen-fixed run info along the top edge: time left, gold, level and an XP bar.
export class RunHud {
  private timer: Phaser.GameObjects.Text;
  private info: Phaser.GameObjects.Text;
  private bar: Phaser.GameObjects.Graphics;
  private toast: Phaser.GameObjects.Text;
  private toastTime = 0;

  constructor(scene: Phaser.Scene) {
    const style = { fontFamily: 'monospace', stroke: '#120f18', strokeThickness: 4 };
    this.timer = scene.add
      .text(0, 14, '', { ...style, fontSize: '28px', fontStyle: 'bold', color: '#f2d7a6' })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(5e6);
    this.info = scene.add
      .text(0, 50, '', { ...style, fontSize: '15px', color: '#e9e3f5' })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(5e6);
    this.bar = scene.add.graphics().setScrollFactor(0).setDepth(5e6);
    this.toast = scene.add
      .text(0, 120, '', { ...style, fontSize: '22px', fontStyle: 'bold', color: '#d9b8ff' })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(5e6)
      .setVisible(false);
  }

  announce(text: string): void {
    this.toast.setText(text).setVisible(true).setAlpha(1);
    this.toastTime = 2;
  }

  update(dt: number, width: number, d: { left: number; gold: number; level: number; xp: number; need: number }): void {
    const secs = Math.max(0, Math.ceil(d.left));
    this.timer.setPosition(width / 2, 14).setText(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`);
    this.timer.setColor(d.left <= 3 ? '#ff7a7a' : '#f2d7a6');
    this.info.setPosition(width / 2, 50).setText(`gold ${d.gold}   level ${d.level}`);
    const w = 160;
    const x = width / 2 - w / 2;
    this.bar.clear();
    this.bar.fillStyle(0x14111c, 0.85).fillRect(x, 74, w, 6);
    this.bar.fillStyle(0xb070ff, 1).fillRect(x, 74, w * Math.min(1, d.xp / d.need), 6);
    this.toastTime -= dt;
    this.toast.setPosition(width / 2, 120).setAlpha(Math.max(0, Math.min(1, this.toastTime)));
    if (this.toastTime <= 0) this.toast.setVisible(false);
  }
}
