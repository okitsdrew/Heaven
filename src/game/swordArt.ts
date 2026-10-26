import Phaser from 'phaser';
import { Vec2 } from '../iso';
import { Fx } from './Fx';

export interface SwordPalette {
  fire: number[];
  handleEdge: number;
  handle: number;
  guard: number;
  glow: number;
  blade: number;
  edge: number;
}

export const PURPLE_SWORD: SwordPalette = {
  fire: [0x7a2fd0, 0xb070ff, 0xf0e0ff],
  handleEdge: 0x07000d,
  handle: 0x4a1a7a,
  guard: 0x7a2fd0,
  glow: 0xa060ff,
  blade: 0xcfb0ff,
  edge: 0x5a1aa0,
};

export const RED_SWORD: SwordPalette = {
  fire: [0xc01818, 0xff4a2a, 0xffe0b0],
  handleEdge: 0x1a0000,
  handle: 0x7a1010,
  guard: 0xd02a1a,
  glow: 0xff3b2a,
  blade: 0xffb0a0,
  edge: 0xa01010,
};

// A flickering flame tongue standing on a screen point.
export function flame(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  height: number,
  width: number,
  seed: number,
  alpha: number,
  time: number,
  colors: number[],
): void {
  const sway = Math.sin(time * 9 + seed) * width * 0.6;
  colors.forEach((color, i) => {
    const k = 1 - i * 0.28;
    g.fillStyle(color, alpha * (0.55 + i * 0.2));
    g.fillTriangle(x - width * k, y, x + width * k, y, x + sway * k, y - height * k);
  });
}

// Draws the floating sword at a screen position and angle. `heat` is 0 to 1 and lights the blade with fire.
export function drawSwordArt(
  gfx: Phaser.GameObjects.Graphics,
  glow: Phaser.GameObjects.Graphics,
  fx: Fx,
  sw: { x: number; y: number; angle: number },
  px: number,
  heat: number,
  time: number,
  dt: number,
  depth: number,
  pal: SwordPalette,
  state: { wisp: number },
): void {
gfx.setDepth(depth);
glow.setDepth(depth - 0.1);
  const cos = Math.cos(sw.angle);
  const sin = Math.sin(sw.angle);
  const at = (d: number, w = 0): Vec2 => ({
    x: sw.x + cos * d * px - sin * w * px,
    y: sw.y + sin * d * px + cos * w * px,
  });
  const pulse = 0.8 + 0.2 * Math.sin(time * 14);

  // Grip and cross guard.
  const g0 = at(-1);
  const g1 = at(4);
  gfx.lineStyle(2.4 * px, pal.handleEdge, 1);
  gfx.lineBetween(g0.x, g0.y, g1.x, g1.y);
  gfx.lineStyle(1.4 * px, pal.handle, 1);
  gfx.lineBetween(g0.x, g0.y, g1.x, g1.y);
  const gl = at(4, -3.5);
  const gr = at(4, 3.5);
  gfx.lineStyle(1.6 * px, pal.guard, 1);
  gfx.lineBetween(gl.x, gl.y, gr.x, gr.y);

  // Sharp tapered blade with a bright edge.
  const tip = at(27);
  const blade = [at(4, -2.2), at(4, 2.2), at(23, 1.6), tip, at(23, -1.6)];
  glow.lineStyle(7 * px, pal.glow, (0.35 + 0.35 * heat) * pulse);
  glow.lineBetween(g1.x, g1.y, tip.x, tip.y);
  gfx.fillStyle(pal.blade, 1);
  gfx.fillPoints(blade, true);
  gfx.fillStyle(0xffffff, 1);
  gfx.fillTriangle(at(4, 0).x, at(4, 0).y, at(23, 0.6).x, at(23, 0.6).y, tip.x, tip.y);
  gfx.lineStyle(1, pal.edge, 1);
  gfx.strokePoints(blade, true);

  // Purple fire radiating off the blade while the skill is on.
  if (heat > 0.02) {
    for (let i = 0; i < 6; i++) {
      const d = 7 + i * 3.6;
      const p = at(d, Math.sin(time * 7 + i * 1.7) * 1.2);
      const h = px * (7 + 6 * Math.sin(time * 11 + i * 2.3) ** 2) * heat * (1 - i * 0.07);
      flame(glow, p.x, p.y, h, px * 2.2, i * 5 + 1, heat * 0.85, time, pal.fire);
    }
    glow.fillStyle(pal.glow, 0.25 * heat);
    glow.fillCircle(at(16).x, at(16).y, 14 * px * pulse);

    state.wisp += dt * 40 * heat;
    while (state.wisp >= 1) {
      state.wisp -= 1;
      const p = at(5 + Math.random() * 22, (Math.random() - 0.5) * 3);
      fx.particle({
        x: p.x,
        y: p.y,
        life: 0.3 + Math.random() * 0.3,
        from: 0.3,
        to: 0.05,
        alpha: 0.9,
        tint: pal.fire[Math.floor(Math.random() * pal.fire.length)],
        vx: (Math.random() - 0.5) * 24,
        vy: -25 - Math.random() * 35,
        depth: depth + 1,
      });
    }
  }
  glow.fillStyle(pal.glow, 0.35 + 0.25 * heat);
  glow.fillCircle(g1.x, g1.y, 2.2 * px);
}
