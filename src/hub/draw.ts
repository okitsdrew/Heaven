import Phaser from 'phaser';

// Code-drawn scenery for the hub. Everything is drawn in screen space on a fixed virtual canvas (W x H);
// the scene scales the camera to fit the window.

export type G = Phaser.GameObjects.Graphics;
export type Rng = () => number;

export const W = 1120;
export const H = 630;
export const WALL = 150;
// Bodies are drawn small and scaled up by this much.
export const BODY = 1.7;

export function rng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shade(c: number, k: number): number {
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((c >> s) & 255) * k)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export function mix(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

function blob(g: G, x: number, y: number, rx: number, ry: number, color: number, alpha = 1, rot = 0): void {
  g.fillStyle(color, alpha);
  if (rot) {
    g.save();
    g.translateCanvas(x, y);
    g.rotateCanvas(rot);
    g.fillEllipse(0, 0, rx * 2, ry * 2);
    g.restore();
  } else g.fillEllipse(x, y, rx * 2, ry * 2);
}

function limb(g: G, x0: number, y0: number, x1: number, y1: number, w: number, color: number): void {
  g.lineStyle(w, color, 1);
  g.lineBetween(x0, y0, x1, y1);
  g.fillStyle(color, 1);
  g.fillCircle(x1, y1, w / 2);
}

export interface Palette {
  floor: number;
  wall: number;
  trim: number;
  tint: number;
}

// Floor tiles, a brick back wall and brick side strips, with stains and cracks.
export function drawShell(g: G, r: Rng, p: Palette): void {
  g.fillStyle(p.floor, 1);
  g.fillRect(0, 0, W, H);
  let row = 0;
  for (let y = WALL; y < H; row++) {
    const th = 30 + (y - WALL) * 0.07;
    let x = -((row % 2) * 35) - r() * 4;
    while (x < W) {
      const tw = 70;
      g.fillStyle(shade(p.floor, 0.82 + r() * 0.36), 1);
      g.fillRect(x + 1, y + 1, tw - 2, th - 2);
      if (r() < 0.12) {
        g.lineStyle(1, shade(p.floor, 0.5), 0.8);
        const cx = x + r() * tw;
        g.lineBetween(cx, y + 2, cx + (r() - 0.5) * 30, y + th - 2);
      }
      x += tw;
    }
    y += th;
  }
  for (let i = 0; i < 26; i++) {
    blob(g, 70 + r() * (W - 140), WALL + 30 + r() * (H - WALL - 60), 14 + r() * 40, 5 + r() * 14, 0x1a0508, 0.18 + r() * 0.2, r() * 0.3 - 0.15);
  }
  // Back wall.
  g.fillStyle(p.wall, 1);
  g.fillRect(0, 0, W, WALL);
  for (let y = 0, rowIdx = 0; y < WALL; y += 24, rowIdx++) {
    let x = -r() * 40;
    while (x < W) {
      const bw = 40 + r() * 34;
      g.fillStyle(shade(p.wall, 0.75 + r() * 0.5), 1);
      g.fillRect(x + 1, y + 1, bw - 2, 22);
      if (r() < 0.07) {
        g.fillStyle(0x000000, 0.35);
        g.fillRect(x + 1, y + 1, bw - 2, 22);
      }
      x += bw;
    }
  }
  for (let i = 0; i < 8; i++) {
    g.fillStyle(0x000000, 0.1);
    g.fillRect(0, i * 8, W, 8);
  }
  g.fillStyle(p.trim, 1);
  g.fillRect(0, WALL - 8, W, 8);
  g.fillStyle(shade(p.trim, 1.35), 1);
  g.fillRect(0, WALL - 8, W, 2);
  for (let i = 0; i < 7; i++) {
    g.fillStyle(0x000000, 0.28 - i * 0.04);
    g.fillRect(0, WALL + i * 4, W, 4);
  }
  // Side walls.
  for (const side of [0, 1]) {
    const x0 = side ? W - 46 : 0;
    g.fillStyle(shade(p.wall, 0.7), 1);
    g.fillRect(x0, WALL, 46, H - WALL);
    for (let y = WALL; y < H; y += 26) {
      g.fillStyle(shade(p.wall, 0.45 + r() * 0.45), 1);
      g.fillRect(x0 + 1, y + 1, 44, 24);
    }
    for (let i = 0; i < 6; i++) {
      g.fillStyle(0x000000, 0.3 - i * 0.045);
      g.fillRect(side ? x0 - (i + 1) * 5 : 46 + i * 5, WALL, 5, H - WALL);
    }
  }
  g.fillStyle(shade(p.wall, 0.5), 1);
  g.fillRect(0, H - 28, W, 28);
  for (let i = 0; i < 5; i++) {
    g.fillStyle(0x000000, 0.3 - i * 0.05);
    g.fillRect(0, H - 28 - (i + 1) * 5, W, 5);
  }
  g.fillStyle(p.tint, 0.1);
  g.fillRect(0, 0, W, H);
}

export type BodyKind = 'human' | 'beast' | 'dragon' | 'elephant';

const CLOTH = [0x4a3a3a, 0x3a4250, 0x5a4a32, 0x46303c, 0x32403a, 0x6a5238];
const SKIN = [0xb9a58f, 0x9c8570, 0x7a6a5c, 0xc2ad94];
const FUR = [0x5a4228, 0x3f3a36, 0x6a5a48, 0x4a3030, 0x2e2a28];

function pool(g: G, r: Rng, rx: number, ry: number): void {
  blob(g, 0, 3, rx * 1.15, ry * 0.7, 0x3a0608, 0.55);
  blob(g, r() * 6 - 3, 4, rx * 0.8, ry * 0.5, 0x520a0c, 0.4);
}

function human(g: G, r: Rng, s: number): void {
  const cloth = CLOTH[Math.floor(r() * CLOTH.length)];
  const skin = SKIN[Math.floor(r() * SKIN.length)];
  pool(g, r, 14 * s, 8 * s);
  const a = r() * 6.28;
  g.save();
  g.rotateCanvas(a);
  limb(g, -4 * s, -3 * s, -15 * s, -6 * s + r() * 6, 3.4 * s, shade(cloth, 0.8));
  limb(g, -4 * s, 3 * s, -14 * s, 5 * s + r() * 6, 3.4 * s, shade(cloth, 0.8));
  blob(g, 0, 0, 9 * s, 5.6 * s, cloth);
  blob(g, -2 * s, -1.5 * s, 6 * s, 2.4 * s, shade(cloth, 1.35), 0.7);
  limb(g, 5 * s, -4 * s, 11 * s, -9 * s + r() * 8, 2.8 * s, skin);
  limb(g, 5 * s, 4 * s, 12 * s, 8 * s - r() * 8, 2.8 * s, skin);
  blob(g, 12 * s, 0, 4.4 * s, 4.2 * s, skin);
  blob(g, 13.2 * s, -1 * s, 1.3 * s, 1 * s, 0x1a0e0e);
  if (r() < 0.4) blob(g, 8 * s, 2 * s, 3.4 * s, 2.2 * s, 0x6a1010, 0.7);
  g.restore();
}

function beast(g: G, r: Rng, s: number): void {
  const fur = FUR[Math.floor(r() * FUR.length)];
  pool(g, r, 24 * s, 12 * s);
  g.save();
  g.rotateCanvas(r() * 6.28);
  for (const [lx, ly] of [[-8, -9], [-8, 9], [9, -8], [9, 9]]) limb(g, lx * s, ly * s * 0.6, (lx + (r() - 0.5) * 10) * s, ly * s * 1.2, 4 * s, shade(fur, 0.8));
  blob(g, 0, 0, 20 * s, 9.5 * s, fur);
  blob(g, -2 * s, -3 * s, 13 * s, 3.6 * s, shade(fur, 1.3), 0.6);
  blob(g, 22 * s, 1 * s, 8 * s, 6 * s, shade(fur, 1.1));
  g.fillStyle(shade(fur, 0.7), 1);
  g.fillTriangle(20 * s, -4 * s, 24 * s, -12 * s, 26 * s, -3 * s);
  g.fillStyle(0xd8cfc0, 1);
  g.fillTriangle(27 * s, 2 * s, 33 * s, 4 * s, 28 * s, 5 * s);
  blob(g, 24 * s, -1 * s, 1.4 * s, 1.2 * s, 0x100808);
  blob(g, -20 * s, 2 * s, 8 * s, 2.4 * s, shade(fur, 0.85), 1, 0.2);
  g.restore();
}

function dragon(g: G, r: Rng, s: number): void {
  const hide = [0x2e4a3c, 0x44304e, 0x4a3a2a][Math.floor(r() * 3)];
  pool(g, r, 60 * s, 22 * s);
  g.save();
  g.rotateCanvas((r() - 0.5) * 0.6);
  // Wings spread like torn sails.
  for (const side of [-1, 1]) {
    g.fillStyle(shade(hide, 0.75), 1);
    g.fillTriangle(0, side * 8 * s, -30 * s, side * 56 * s, 34 * s, side * 44 * s);
    g.fillStyle(shade(hide, 1.15), 0.8);
    g.fillTriangle(0, side * 8 * s, -14 * s, side * 40 * s, 20 * s, side * 30 * s);
    g.lineStyle(2.2 * s, shade(hide, 0.55), 1);
    g.lineBetween(0, side * 8 * s, -30 * s, side * 56 * s);
    g.lineBetween(0, side * 8 * s, 34 * s, side * 44 * s);
    g.lineBetween(0, side * 8 * s, 2 * s, side * 50 * s);
  }
  for (let i = 0; i < 7; i++) {
    const k = i / 6;
    blob(g, -80 * s + k * 20 * s, 2 * s, (3 + (1 - k) * 8) * s, (2 + (1 - k) * 5) * s, hide);
  }
  blob(g, 0, 0, 40 * s, 17 * s, hide);
  blob(g, -3 * s, -5 * s, 30 * s, 6.5 * s, shade(hide, 1.45), 0.6);
  for (let i = -5; i <= 5; i++) {
    g.fillStyle(shade(hide, 0.55), 1);
    g.fillTriangle(i * 7 * s, -15 * s, i * 7 * s + 3 * s, -22 * s, i * 7 * s + 6 * s, -15 * s);
  }
  limb(g, 36 * s, 2 * s, 60 * s, -6 * s, 12 * s, hide);
  blob(g, 70 * s, -6 * s, 14 * s, 9 * s, shade(hide, 1.1));
  g.fillStyle(0xd8d0bc, 1);
  for (let i = 0; i < 4; i++) g.fillTriangle((74 + i * 4) * s, -2 * s, (76 + i * 4) * s, 4 * s, (78 + i * 4) * s, -2 * s);
  blob(g, 68 * s, -12 * s, 2.2 * s, 1.6 * s, 0x1a1a10);
  g.fillStyle(0xcfc6b0, 1);
  g.fillTriangle(60 * s, -12 * s, 52 * s, -26 * s, 66 * s, -14 * s);
  g.restore();
}

function elephant(g: G, r: Rng, s: number): void {
  const hide = 0x6d6b72;
  pool(g, r, 50 * s, 22 * s);
  g.save();
  g.rotateCanvas((r() - 0.5) * 0.8);
  for (const [lx, ly] of [[-20, -14], [-20, 14], [22, -14], [22, 14]]) limb(g, lx * s, ly * s * 0.6, (lx + (r() - 0.5) * 8) * s, ly * s * 1.35, 12 * s, shade(hide, 0.78));
  blob(g, 0, 0, 40 * s, 22 * s, hide);
  blob(g, -4 * s, -8 * s, 28 * s, 7 * s, shade(hide, 1.3), 0.5);
  blob(g, 44 * s, 0, 17 * s, 15 * s, shade(hide, 1.05));
  blob(g, 40 * s, -14 * s, 12 * s, 9 * s, shade(hide, 0.85));
  g.lineStyle(9 * s, shade(hide, 0.95), 1);
  g.beginPath();
  g.moveTo(58 * s, 2 * s);
  g.lineTo(70 * s, 14 * s);
  g.lineTo(62 * s, 28 * s);
  g.strokePath();
  g.lineStyle(3.5 * s, 0xe6dcc4, 1);
  g.lineBetween(56 * s, -4 * s, 76 * s, -12 * s);
  g.lineBetween(56 * s, 8 * s, 78 * s, 12 * s);
  blob(g, 52 * s, -4 * s, 1.6 * s, 1.3 * s, 0x0e0a0a);
  blob(g, -40 * s, 2 * s, 6 * s, 2 * s, shade(hide, 0.7));
  g.restore();
}

export function body(g: G, r: Rng, kind: BodyKind, x: number, y: number, s = 1): void {
  g.save();
  g.translateCanvas(x, y);
  s *= BODY;
  if (kind === 'human') human(g, r, s);
  else if (kind === 'beast') beast(g, r, s);
  else if (kind === 'dragon') dragon(g, r, s);
  else elephant(g, r, s);
  g.restore();
}

// A heap of bodies: smaller ones on top, sorted so lower ones overlap higher ones.
export function pile(g: G, r: Rng, cx: number, cy: number, rx: number, ry: number, count: number): void {
  const items: { x: number; y: number; kind: BodyKind; s: number }[] = [];
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r());
    const pick = r();
    const kind: BodyKind = pick < 0.6 ? 'human' : pick < 0.82 ? 'beast' : pick < 0.93 ? 'elephant' : 'dragon';
    items.push({ x: cx + Math.cos(a) * d * rx, y: cy + Math.sin(a) * d * ry, kind, s: (kind === 'human' ? 1.05 : kind === 'beast' ? 0.9 : 0.55) * (0.8 + r() * 0.4) });
  }
  items.sort((a, b) => a.y - b.y);
  blob(g, cx, cy + ry * 0.35, rx * 1.12, ry * 0.9, 0x120305, 0.45);
  for (const it of items) body(g, r, it.kind, it.x, it.y, it.s);
}

// A rock chunk broken off the ceiling.
export function rock(g: G, r: Rng, size: number): void {
  const pts: Phaser.Math.Vector2[] = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const d = size * (0.7 + r() * 0.5);
    pts.push(new Phaser.Math.Vector2(Math.cos(a) * d, Math.sin(a) * d * 0.8 - size * 0.3));
  }
  g.fillStyle(0x2c2a32, 1);
  g.fillPoints(pts, true);
  g.fillStyle(0x4a4754, 1);
  g.fillPoints(pts.slice(5, 9).concat(pts[0]).map((p) => new Phaser.Math.Vector2(p.x * 0.8, p.y * 0.8)), true);
  g.fillStyle(0x6a6676, 0.8);
  g.fillEllipse(-size * 0.25, -size * 0.65, size * 0.7, size * 0.35);
  g.lineStyle(1.5, 0x15131a, 1);
  g.strokePoints(pts, true);
}

export function door(g: G, openLeaf: boolean): void {
  // Opening 110 wide, 128 tall, centred on x = 0 with its base at y = 0.
  g.fillStyle(0x0a0709, 1);
  g.fillRect(-55, -128, 110, 128);
  g.fillCircle(0, -128, 55);
  g.fillStyle(0xa8541a, 0.08);
  g.fillRect(-45, -90, 90, 90);
  g.lineStyle(14, 0x3a3640, 1);
  g.beginPath();
  g.moveTo(-62, 4);
  g.lineTo(-62, -128);
  g.arc(0, -128, 62, Math.PI, 0, false);
  g.lineTo(62, 4);
  g.strokePath();
  g.lineStyle(3, 0x56525e, 1);
  g.beginPath();
  g.arc(0, -128, 68, Math.PI, 0, false);
  g.strokePath();
  g.fillStyle(0x56525e, 1);
  g.fillRect(-72, -2, 144, 8);
  if (openLeaf) {
    // The door itself hangs open and splintered against the left jamb.
    g.fillStyle(0x3a2616, 1);
    g.fillPoints(
      [new Phaser.Math.Vector2(-62, -120), new Phaser.Math.Vector2(-96, -108), new Phaser.Math.Vector2(-96, -4), new Phaser.Math.Vector2(-62, 0)],
      true,
    );
    g.lineStyle(2, 0x170e07, 1);
    for (let i = 1; i < 4; i++) g.lineBetween(-62 - i * 8.5, -120 + i * 3, -62 - i * 8.5, -4 + i * 1);
    g.fillStyle(0x15131a, 1);
    g.fillRect(-96, -90, 34, 6);
    g.fillRect(-96, -40, 34, 6);
  }
}

export function barricade(g: G, r: Rng): void {
  // A door in the east wall, boarded over. Base at y = 0, centred on x = 0, 56 wide.
  g.fillStyle(0x0a0709, 1);
  g.fillRect(-26, -150, 52, 150);
  g.lineStyle(10, 0x3a3640, 1);
  g.strokeRect(-30, -154, 60, 154);
  for (let i = 0; i < 6; i++) {
    const y = -140 + i * 24 + r() * 6;
    g.save();
    g.translateCanvas(0, y);
    g.rotateCanvas((r() - 0.5) * 0.5);
    g.fillStyle(shade(0x5a3d22, 0.7 + r() * 0.5), 1);
    g.fillRect(-50, -6, 100, 12);
    g.lineStyle(1, 0x1a0f08, 1);
    g.strokeRect(-50, -6, 100, 12);
    g.fillStyle(0x15131a, 1);
    g.fillCircle(-38, 0, 1.8);
    g.fillCircle(38, 0, 1.8);
    g.restore();
  }
  g.save();
  g.translateCanvas(0, -75);
  for (const a of [0.9, -0.9]) {
    g.rotateCanvas(a);
    g.fillStyle(0x4a3018, 1);
    g.fillRect(-90, -7, 180, 14);
    g.lineStyle(1, 0x1a0f08, 1);
    g.strokeRect(-90, -7, 180, 14);
    g.rotateCanvas(-a);
  }
  g.restore();
  // Old claw marks gouged from the other side.
  g.lineStyle(2, 0x1a0a08, 0.8);
  for (let i = 0; i < 4; i++) g.lineBetween(-20 + i * 9, -60, -14 + i * 9, -20);
}

export function bars(g: G, w: number, h: number): void {
  // Slanted iron bars across a gate of w x h with its base at y = 0, left edge at x = 0.
  g.fillStyle(0x050407, 0.82);
  g.fillRect(0, -h, w, h);
  g.lineStyle(5, 0x4a4650, 1);
  g.strokeRect(0, -h, w, h);
  for (let x = 12; x < w; x += 20) {
    g.lineStyle(5, 0x2a2830, 1);
    g.lineBetween(x - 4, 0, x + 4, -h);
    g.lineStyle(2, 0x5a5662, 1);
    g.lineBetween(x - 5.5, 0, x + 2.5, -h);
  }
  for (const y of [-h * 0.3, -h * 0.72]) {
    g.lineStyle(6, 0x2f2d36, 1);
    g.lineBetween(0, y, w, y);
  }
  g.fillStyle(0x6b5a2a, 1);
  g.fillRect(w / 2 - 8, -h * 0.5, 16, 20);
  g.lineStyle(3, 0x6b5a2a, 1);
  g.strokeCircle(w / 2, -h * 0.5, 7);
}

export function cellInside(g: G, r: Rng, w: number, h: number): void {
  // Straw, a collapsed skeleton and chains in the dark behind the bars, drawn at the cell's base-left.
  g.fillStyle(0x0b090d, 1);
  g.fillRect(0, -h, w, h);
  for (let i = 0; i < 40; i++) {
    g.lineStyle(1.2, shade(0x7a6a30, 0.4 + r() * 0.5), 1);
    const x = r() * w;
    const y = -r() * h * 0.5;
    g.lineBetween(x, y, x + (r() - 0.5) * 16, y + (r() - 0.5) * 6);
  }
  for (let i = 0; i < 6; i++) {
    g.lineStyle(3, 0xcfc4a8, 0.9);
    const x = 24 + r() * (w - 60);
    const y = -12 - r() * 40;
    g.lineBetween(x, y, x + 16 + r() * 14, y + (r() - 0.5) * 8);
  }
  blob(g, w * 0.5, -22, 8, 7, 0xcfc4a8);
  blob(g, w * 0.5 - 3, -23, 1.8, 2.2, 0x050405);
  blob(g, w * 0.5 + 3, -23, 1.8, 2.2, 0x050405);
  g.lineStyle(2, 0x4a4650, 1);
  g.lineBetween(w * 0.25, -h + 8, w * 0.25, -h + 40);
  g.lineBetween(w * 0.25, -h + 40, w * 0.4, -h + 70);
}

export function skullCrawl(g: G, r: Rng, x: number, y: number): void {
  blob(g, x, y, 5, 4.4, 0xcfc4a8);
  blob(g, x - 2, y - 0.5, 1.2, 1.5, 0x100c0c);
  blob(g, x + 2, y - 0.5, 1.2, 1.5, 0x100c0c);
  g.fillStyle(0xcfc4a8, 1);
  g.fillRect(x - 2.4, y + 3, 4.8, 2.4 + r());
}

// A jail cell cut into the back wall: a dark recess with straw, bones and chains, behind a barred front.
// Origin at the recess's top-left; it is w wide and h tall, standing on its floor line at y = h.
export function cell(g: G, r: Rng, w: number, h: number): void {
  g.fillStyle(0x07050a, 1);
  g.fillRect(0, 0, w, h);
  for (let y = 0; y < h - 10; y += 20) {
    let x = -r() * 20;
    while (x < w) {
      const bw = 26 + r() * 22;
      g.fillStyle(shade(0x2a2530, 0.6 + r() * 0.5), 1);
      g.fillRect(Math.max(0, x) + 1, y + 1, Math.min(bw, w - x) - 2, 18);
      x += bw;
    }
  }
  g.fillStyle(0x050307, 0.55);
  g.fillRect(0, 0, w, h);
  // Straw and bones on the floor, a skeleton slumped in the corner.
  g.fillStyle(0x2a2420, 1);
  g.fillRect(0, h - 14, w, 14);
  for (let i = 0; i < 70; i++) {
    g.lineStyle(1.6, shade(0x9a8438, 0.55 + r() * 0.6), 1);
    const x = r() * w;
    const y = h - 14 + r() * 12;
    g.lineBetween(x, y, x + (r() - 0.5) * 18, y + (r() - 0.5) * 5);
  }
  for (let i = 0; i < 7; i++) {
    g.lineStyle(3.2, 0xcfc4a8, 0.95);
    const x = 20 + r() * (w - 70);
    const y = h - 12 + r() * 8;
    g.lineBetween(x, y, x + 14 + r() * 16, y + (r() - 0.5) * 6);
  }
  blob(g, w * 0.78, h - 34, 12, 11, 0xcfc4a8);
  blob(g, w * 0.78 - 4, h - 35, 2.6, 3.2, 0x050405);
  blob(g, w * 0.78 + 4, h - 35, 2.6, 3.2, 0x050405);
  g.lineStyle(5, 0xbfb498, 1);
  g.lineBetween(w * 0.78, h - 24, w * 0.78 - 10, h - 6);
  g.lineBetween(w * 0.78 - 8, h - 20, w * 0.78 + 14, h - 10);
  // Shackles hanging from the back wall.
  g.lineStyle(3, 0x4a4650, 1);
  for (const x of [w * 0.2, w * 0.34]) {
    g.lineBetween(x, 0, x, h * 0.45);
    for (let y = 4; y < h * 0.45; y += 9) g.strokeCircle(x, y, 2.6);
    g.strokeCircle(x, h * 0.45 + 5, 6);
  }
  // The barred front, with a heavy lock on the gate in the middle.
  g.fillStyle(0x000000, 0.4);
  g.fillRect(0, h - 6, w, 14);
  for (let x = 8; x < w; x += 19) {
    g.lineStyle(6, 0x1d1b22, 1);
    g.lineBetween(x, 0, x, h);
    g.lineStyle(2.2, 0x6a6672, 1);
    g.lineBetween(x - 1.6, 0, x - 1.6, h);
  }
  for (const y of [h * 0.1, h * 0.52, h - 3]) {
    g.lineStyle(7, 0x2b2932, 1);
    g.lineBetween(0, y, w, y);
    g.lineStyle(2, 0x5a5662, 1);
    g.lineBetween(0, y - 2.5, w, y - 2.5);
  }
  const gx = w / 2;
  g.lineStyle(4, 0x2b2932, 1);
  g.strokeRect(gx - 34, h * 0.1, 68, h - h * 0.1);
  g.lineStyle(4, 0x7a6630, 1);
  g.strokeCircle(gx, h * 0.52 + 3, 9);
  g.fillStyle(0x8a7436, 1);
  g.fillRoundedRect(gx - 9, h * 0.52 + 3, 18, 22, 3);
  g.fillStyle(0x15110a, 1);
  g.fillCircle(gx, h * 0.52 + 13, 2.6);
  g.lineStyle(10, 0x3a3640, 1);
  g.strokeRect(-5, -5, w + 10, h + 10);
}
