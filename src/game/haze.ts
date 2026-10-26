import Phaser from 'phaser';

// A soft blob whose edge ripples like heat rising off hot ground, stretched a little upward.
export function drawHaze(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  radius: number,
  wave: number,
  time: number,
  seed: number,
  color: number,
  alpha: number,
): void {
  const layers = [1, 0.62, 0.3];
  layers.forEach((k, layer) => {
    g.fillStyle(color, alpha * (0.14 + layer * 0.12));
    g.beginPath();
    const n = 22;
    for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2;
      const w = 1 + wave * (0.6 * Math.sin(3 * a + time * 5 + seed + layer) + 0.4 * Math.sin(5 * a - time * 7 + seed * 2));
      const r = radius * k * w;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r * 1.15 - Math.max(0, -Math.sin(a)) * r * 0.2;
      if (j === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.fillPath();
  });
}
