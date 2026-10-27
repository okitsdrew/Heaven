import Phaser from 'phaser';

let counter = 0;

export const CRAYON_FONT = '"Gloria Hallelujah", "Comic Sans MS", "Chalkboard SE", cursive';

// Warms the font up so the first line isn't drawn in a fallback.
export function preloadCrayonFont(): void {
  try {
    void document.fonts?.load(`32px ${CRAYON_FONT}`);
  } catch {
    // Offline: the cursive fallback will do.
  }
}

export interface CrayonLine {
  image: Phaser.GameObjects.Image;
  width: number;
  height: number;
  // 0..1, how much of the line has been scribbled in, left to right.
  setReveal(t: number): void;
  destroy(): void;
}

// A line of thick, smudged, child-like crayon lettering drawn into its own canvas texture.
export function crayonLine(scene: Phaser.Scene, text: string, size: number, color = '#f1ead2'): CrayonLine {
  const pad = 18;
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = `${size}px ${CRAYON_FONT}`;
  const widths = [...text].map((c) => probe.measureText(c).width + size * 0.06);
  const w = Math.ceil(widths.reduce((a, b) => a + b, 0) + pad * 2);
  const h = Math.ceil(size * 1.9);
  const key = `crayon_${counter++}`;
  const tex = scene.textures.createCanvas(key, w, h)!;
  const ctx = tex.getContext();
  ctx.font = `${size}px ${CRAYON_FONT}`;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  let x = pad;
  [...text].forEach((c, i) => {
    const jx = (Math.random() - 0.5) * 3;
    const jy = (Math.random() - 0.5) * size * 0.22;
    const rot = (Math.random() - 0.5) * 0.28;
    const sc = 0.92 + Math.random() * 0.2;
    ctx.save();
    ctx.translate(x + widths[i] / 2 + jx, h / 2 + jy);
    ctx.rotate(rot);
    ctx.scale(sc, sc);
    ctx.textAlign = 'center';
    // Smudge, then a heavy double-struck outline, then the waxy fill.
    ctx.globalAlpha = 0.35;
    ctx.shadowColor = color;
    ctx.shadowBlur = size * 0.35;
    ctx.fillStyle = color;
    ctx.fillText(c, 2, 2);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = color;
    ctx.lineWidth = size * 0.17;
    ctx.strokeText(c, 0, 0);
    ctx.lineWidth = size * 0.1;
    ctx.strokeText(c, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3);
    ctx.globalAlpha = 0.95;
    ctx.fillText(c, 0, 0);
    ctx.restore();
    x += widths[i];
  });
  // Waxy grain: scrape the paper tooth back out of the strokes.
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < w * h * 0.03; i++) {
    ctx.globalAlpha = 0.25 + Math.random() * 0.4;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 1.5);
  }
  ctx.globalAlpha = 0.18;
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#000';
  for (let i = 0; i < 30; i++) {
    const sx = Math.random() * w;
    ctx.beginPath();
    ctx.moveTo(sx, Math.random() * h);
    ctx.lineTo(sx + (Math.random() - 0.5) * 40, Math.random() * h);
    ctx.stroke();
  }
  tex.refresh();
  const image = scene.add.image(0, 0, key).setOrigin(0, 0.5);
  image.setCrop(0, 0, 0, h);
  return {
    image,
    width: w,
    height: h,
    setReveal(t: number) {
      const v = Phaser.Math.Clamp(t, 0, 1);
      image.setCrop(0, 0, Math.max(0.001, w * v), h);
    },
    destroy() {
      image.destroy();
      scene.textures.remove(key);
    },
  };
}
