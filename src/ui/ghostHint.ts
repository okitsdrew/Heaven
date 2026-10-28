import Phaser from 'phaser';
import { Tex } from '../art/placeholders';
import { Fx } from '../game/Fx';

interface HintOptions {
  x: number;
  y: number;
  depth: number;
  // Seconds the text hangs in the air before it is blown away.
  hold: number;
  // Pin the text to the screen instead of the world (the camera moves in a run).
  screenSpace?: boolean;
}

// Ghostly text that hangs in the air for a moment and is then blown away like smoke.
export function ghostHint(scene: Phaser.Scene, fx: Fx, lines: string[], o: HintOptions): void {
  lines.forEach((line, i) => hintLine(scene, fx, line, { ...o, y: o.y + i * 38 }));
}

function hintLine(scene: Phaser.Scene, fx: Fx, text: string, o: HintOptions): void {
  const size = 26;
  const font = `italic ${size}px Georgia, serif`;
  const ctx = document.createElement('canvas').getContext('2d')!;
  ctx.font = font;
  const widths = [...text].map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0);
  let x = o.x - total / 2;
  const y = o.y;
  const cam = scene.cameras.main;
  const chars: Phaser.GameObjects.Text[] = [];
  [...text].forEach((c, i) => {
    const t = scene.add
      .text(x, y, c, { fontFamily: 'Georgia, serif', fontSize: `${size}px`, fontStyle: 'italic', color: '#e8f0ff' })
      .setOrigin(0, 0.5)
      .setDepth(o.depth)
      .setAlpha(0);
    if (o.screenSpace) t.setScrollFactor(0);
    chars.push(t);
    scene.tweens.add({ targets: t, alpha: 0.92, duration: 700, delay: i * 18 });
    x += widths[i];
  });
  scene.time.delayedCall(o.hold * 1000, () => {
    chars.forEach((t, i) => {
      const delay = i * 28;
      fx.particle({
        texture: Tex.smoke,
        x: t.x + 6 + (o.screenSpace ? cam.scrollX : 0),
        y: y + (o.screenSpace ? cam.scrollY : 0),
        life: 1.1,
        from: 0.5,
        to: 1.3,
        alpha: 0.5,
        tint: 0xd8e4ff,
        additive: false,
        vx: 150 + Math.random() * 90,
        vy: -22 - Math.random() * 24,
        depth: o.depth,
      });
      scene.tweens.add({
        targets: t,
        x: t.x + 260 + Math.random() * 260,
        y: y - 30 - Math.random() * 90,
        angle: -30 + Math.random() * 90,
        scale: 1.8,
        alpha: 0,
        delay,
        duration: 1400 + Math.random() * 500,
        ease: 'Cubic.easeIn',
        onComplete: () => t.destroy(),
      });
    });
  });
}
