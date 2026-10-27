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
export function crayonLine(scene: Phaser.Scene, text: string, size: number, color = '#07060a', outline = '#ffffff'): CrayonLine {
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
  ctx.fillStyle = color;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  let x = pad;
  [...text].forEach((c, i) => {
    const jx = (Math.random() - 0.5) * 1.6;
    const jy = (Math.random() - 0.5) * size * 0.1;
    const rot = (Math.random() - 0.5) * 0.12;
    ctx.save();
    ctx.translate(x + widths[i] / 2 + jx, h / 2 + jy);
    ctx.rotate(rot);
    ctx.textAlign = 'center';
    // A white outline first, then thin black strokes on top so it stays readable on anything.
    ctx.strokeStyle = outline;
    ctx.lineWidth = size * 0.2;
    ctx.strokeText(c, 0, 0);
    ctx.fillStyle = color;
    ctx.fillText(c, 0, 0);
    ctx.restore();
    x += widths[i];
  });
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
