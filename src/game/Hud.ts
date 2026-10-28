import Phaser from 'phaser';
import { skillIcon, skillIconKey } from '../art/skillIcons';
import { sfx } from '../audio';
import { skillIds } from '../skills';
import { CRAYON_FONT } from '../hub/Crayon';

export interface HudSlot {
  key: string;
  // Skill id, for its icon.
  id?: string;
  color: number;
  enabled: boolean;
  remaining: number;
  total: number;
  active?: boolean;
}

const SIZE = 56;
const GAP = 12;
const MARGIN = 24;

// Screen-fixed skill boxes along the bottom-left: the icon in a box, its key underneath.
export class Hud {
  private gfx: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private timers: Phaser.GameObjects.Text[] = [];
  private icons: Phaser.GameObjects.Image[] = [];

  constructor(scene: Phaser.Scene, slots: number) {
    for (const id of skillIds) {
      const canvas = skillIcon(id);
      if (canvas && !scene.textures.exists(skillIconKey(id))) scene.textures.addCanvas(skillIconKey(id), canvas);
    }
    this.gfx = scene.add.graphics().setScrollFactor(0).setDepth(5e6);
    for (let i = 0; i < slots; i++) {
      this.icons.push(scene.add.image(0, 0, '__DEFAULT').setScrollFactor(0).setDepth(5e6 + 1).setVisible(false));
      this.labels.push(
        scene.add
          .text(0, 0, '', { fontFamily: 'monospace', fontSize: '18px', fontStyle: 'bold', color: '#e9e3f5', stroke: '#120f18', strokeThickness: 3 })
          .setOrigin(0.5)
          .setScrollFactor(0)
          .setDepth(5e6 + 1),
      );
      this.timers.push(
        scene.add
          .text(0, 0, '', { fontFamily: 'monospace', fontSize: '18px', fontStyle: 'bold', color: '#ffffff', stroke: '#120f18', strokeThickness: 4 })
          .setOrigin(0.5)
          .setScrollFactor(0)
          .setDepth(5e6 + 2),
      );
    }
  }

  update(_width: number, height: number, slots: HudSlot[]): void {
    const g = this.gfx;
    g.clear();
    const shown = slots.filter((s) => s.enabled);
    let x = MARGIN;
    const y = height - SIZE - MARGIN - 22;

    this.labels.forEach((l) => l.setVisible(false));
    this.timers.forEach((t) => t.setVisible(false));
    this.icons.forEach((im) => im.setVisible(false));
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

      const key = s.id ? skillIconKey(s.id) : null;
      if (key && this.icons[i].scene.textures.exists(key)) {
        this.icons[i].setTexture(key).setVisible(true).setPosition(x + SIZE / 2, y + SIZE / 2).setDisplaySize(SIZE - 8, SIZE - 8).setAlpha(ready ? 1 : 0.4);
      }
      this.labels[i].setVisible(true).setText(s.key).setPosition(x + SIZE / 2, y + SIZE + 12).setAlpha(ready ? 1 : 0.6);
      if (!ready) {
        const text = s.remaining >= 10 ? String(Math.ceil(s.remaining)) : s.remaining.toFixed(1);
        this.timers[i].setVisible(true).setText(text).setPosition(x + SIZE / 2, y + SIZE / 2);
      }
      x += SIZE + GAP;
    });
  }
}

// Screen-fixed run info along the top edge: time left, souls, level and an XP bar.
export class RunHud {
  private timer: Phaser.GameObjects.Text;
  private info: Phaser.GameObjects.Text;
  private extra: Phaser.GameObjects.Text;
  private elapsed: Phaser.GameObjects.Text;
  private bar: Phaser.GameObjects.Graphics;
  private toast: Phaser.GameObjects.Text;
  private toastTime = 0;
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const style = { fontFamily: 'monospace', stroke: '#120f18', strokeThickness: 4 };
    this.timer = scene.add
      .text(0, 14, '', { ...style, fontSize: '28px', fontStyle: 'bold', color: '#f2d7a6' })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(5e6);
    const hand = { fontFamily: CRAYON_FONT, stroke: '#07060a', strokeThickness: 5, fontSize: '30px', color: '#ffffff' };
    this.info = scene.add.text(16, 8, '', { ...hand, lineSpacing: 2 }).setScrollFactor(0).setDepth(5e6);
    this.extra = scene.add.text(16, 0, '', { ...style, fontSize: '13px', color: '#e9e3f5' }).setScrollFactor(0).setDepth(5e6);
    this.elapsed = scene.add.text(16, 0, '', { ...hand, fontSize: '24px' }).setScrollFactor(0).setDepth(5e6);
    this.bar = scene.add.graphics().setScrollFactor(0).setDepth(5e6);
    this.toast = scene.add
      .text(0, 120, '', { ...style, fontSize: '22px', fontStyle: 'bold', color: '#d9b8ff' })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(5e6)
      .setVisible(false);
  }

  // Big lines that slam onto the middle of the screen one after another, then fade together.
  banner(lines: string[], hold: number): void {
    const cam = this.scene.cameras.main;
    lines.forEach((text, i) => {
      const t = this.scene.add
        .text(cam.width / 2, cam.height * 0.38 + i * 96, text, { fontFamily: CRAYON_FONT, fontSize: i === 0 ? '84px' : '52px', color: i === 0 ? '#ffffff' : '#d9b8ff', stroke: '#07060a', strokeThickness: 12 })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(6e6)
        .setAlpha(0)
        .setScale(2.6);
      this.scene.tweens.add({
        targets: t,
        alpha: 1,
        scale: 1,
        delay: i * 1000,
        duration: 240,
        ease: 'Cubic.easeIn',
        onStart: () => sfx.play('landing'),
        onComplete: () => cam.shake(220, 0.008),
      });
      this.scene.tweens.add({ targets: t, alpha: 0, delay: hold * 1000, duration: 600, onComplete: () => t.destroy() });
    });
  }

  announce(text: string, chime = true): void {
    if (chime) sfx.play('toast');
    this.toast.setText(text).setVisible(true).setAlpha(1);
    this.toastTime = 2;
  }

  update(dt: number, width: number, d: { left: number; gold: number; level: number; xp: number; need: number; dust: number; untimed?: boolean; title?: string; elapsed?: number }): void {
    const secs = Math.max(0, Math.ceil(d.left));
    // Stage 2 has no clock; the quest box takes over.
    this.timer.setPosition(width / 2, 14).setText(d.title ?? (d.untimed ? '' : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`));
    this.timer.setColor(d.left <= 3 ? '#ff7a7a' : '#f2d7a6');
    this.info.setText(`Souls: ${d.gold}\nlvl: ${d.level}`);
    const t = Math.floor(d.elapsed ?? 0);
    this.elapsed.setText(d.elapsed === undefined ? '' : `time ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`).setY(this.info.y + this.info.height + 24);
    this.extra.setText(d.dust > 0 ? `dust +${Math.round(d.dust * 100)}%` : '').setY(this.info.y + this.info.height + (d.elapsed === undefined ? 24 : 58));
    const w = 130;
    const x = 18;
    const y = this.info.y + this.info.height + 2;
    this.bar.clear();
    this.bar.fillStyle(0x07060a, 0.85).fillRect(x - 2, y - 2, w + 4, 18);
    this.bar.fillStyle(0xff2bd6, 1).fillRect(x, y, w * Math.min(1, d.xp / d.need), 14);
    this.bar.lineStyle(2, 0xffffff, 1).strokeRect(x - 2, y - 2, w + 4, 18);
    this.toastTime -= dt;
    this.toast.setPosition(width / 2, 120).setAlpha(Math.max(0, Math.min(1, this.toastTime)));
    if (this.toastTime <= 0) this.toast.setVisible(false);
  }
}
