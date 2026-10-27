import Phaser from 'phaser';
import { G, Rng, shade } from './draw';

const V = (x: number, y: number) => new Phaser.Math.Vector2(x, y);

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

// A flickering flame drawn from three nested teardrops, base at (0, 0).
export function drawFlame(g: G, t: number, size: number, seed: number): void {
  g.clear();
  const layers: [number, number, number, number][] = [
    [1, 0xff5a0c, 0.85, 0],
    [0.72, 0xffa224, 0.9, 1.3],
    [0.42, 0xfff0a0, 0.95, 2.6],
  ];
  for (const [k, color, alpha, ph] of layers) {
    const flick = 0.82 + 0.18 * Math.sin(t * 13 + seed * 7 + ph) + 0.08 * Math.sin(t * 29 + seed + ph * 2);
    const h = 40 * size * k * flick;
    const w = 12 * size * k;
    const sway = Math.sin(t * 7 + seed * 3 + ph) * w * 0.7;
    g.fillStyle(color, alpha);
    g.fillPoints(
      [V(-w, 0), V(-w * 1.05, -h * 0.28), V(-w * 0.6 + sway * 0.3, -h * 0.62), V(sway, -h), V(w * 0.6 + sway * 0.3, -h * 0.6), V(w * 1.05, -h * 0.28), V(w, 0)],
      true,
    );
  }
}

// Wall torch: a bracket and a pitch-soaked stick. The flame sits at (0, -46).
export function torch(g: G): void {
  g.fillStyle(0x15131a, 1);
  g.fillRect(-9, -8, 18, 6);
  g.fillRect(-7, -14, 14, 4);
  g.fillStyle(0x4a3220, 1);
  g.fillPoints([V(-4.5, -4), V(4.5, -4), V(6, -40), V(-6, -40)], true);
  g.fillStyle(0x2a1a10, 1);
  g.fillRect(-1, -38, 2, 34);
  g.fillStyle(0x0a0708, 1);
  g.fillEllipse(0, -40, 14, 7);
}

// Iron brazier on three legs. The flame sits at (0, -34).
export function brazier(g: G): void {
  blob(g, 0, 2, 30, 10, 0x000000, 0.45);
  g.lineStyle(5, 0x23212a, 1);
  g.lineBetween(-20, -24, -26, 0);
  g.lineBetween(20, -24, 26, 0);
  g.lineBetween(0, -22, 0, 2);
  blob(g, 0, -28, 32, 11, 0x1a1820);
  blob(g, 0, -30, 27, 8, 0x0a080c);
  blob(g, 0, -31, 22, 6, 0xc23a08, 0.9);
  blob(g, 0, -32, 14, 3.4, 0xffa030, 0.9);
  g.lineStyle(3, 0x3a3844, 1);
  g.strokeEllipse(0, -28, 64, 22);
}

// The throne: a dais, a spiked backrest and the vast shape sitting in it. Base centre at (0, 0).
export function throne(g: G, r: Rng): void {
  const stone = 0x1b1722;
  const rim = 0x4a3a52;
  // Dais.
  blob(g, 0, 6, 190, 38, 0x0b090e);
  blob(g, 0, -4, 172, 32, shade(stone, 0.85));
  blob(g, 0, -12, 142, 26, stone);
  // Backrest spires first, so the seated shape can sit in front of them.
  for (let i = -5; i <= 5; i++) {
    const hgt = 40 + (5 - Math.abs(i)) * 14 + r() * 10;
    g.fillStyle(stone, 1);
    g.fillPoints([V(i * 28 - 11, -70), V(i * 28, -70 - hgt - 70), V(i * 28 + 11, -70)], true);
    g.lineStyle(1.5, rim, 0.6);
    g.lineBetween(i * 28 - 11, -70, i * 28, -70 - hgt - 70);
  }
  // The backrest itself: a tall pointed arch with a carved border.
  g.fillStyle(shade(stone, 1.12), 1);
  g.fillPoints([V(-104, -8), V(-104, -150), V(-62, -206), V(0, -236), V(62, -206), V(104, -150), V(104, -8)], true);
  g.lineStyle(3, rim, 0.7);
  g.strokePoints([V(-104, -8), V(-104, -150), V(-62, -206), V(0, -236), V(62, -206), V(104, -150), V(104, -8)], false);
  g.lineStyle(2, rim, 0.45);
  g.strokePoints([V(-84, -14), V(-84, -146), V(-52, -190), V(0, -214), V(52, -190), V(84, -146), V(84, -14)], false);
  // Armrests and a pair of skull finials.
  for (const s of [-1, 1]) {
    g.fillStyle(stone, 1);
    g.fillRoundedRect(s * 150 - 22, -70, 44, 70, 8);
    g.lineStyle(2, rim, 0.6);
    g.strokeRoundedRect(s * 150 - 22, -70, 44, 70, 8);
    blob(g, s * 150, -78, 15, 13, 0xb8ab90);
    blob(g, s * 150 - 5, -80, 3.4, 4.4, 0x0a0608);
    blob(g, s * 150 + 5, -80, 3.4, 4.4, 0x0a0608);
  }
  g.lineStyle(2, rim, 0.6);
  g.strokeEllipse(0, -12, 284, 52);
}

// The vast shape sitting in the throne, darker than the stone so it reads as a hole in the room. It stays unseen until it wakes.
export function throneFigure(g: G): void {
  const rim = 0x4a3a52;
  blob(g, 0, -44, 142, 46, 0x040207);
  g.fillStyle(0x040207, 1);
  g.fillPoints([V(-122, -44), V(-134, -6), V(134, -6), V(122, -44)], true);
  blob(g, 0, -92, 88, 60, 0x040207);
  // Horns sweeping back from the brow.
  for (const s of [-1, 1]) {
    g.lineStyle(14, 0x040207, 1);
    g.beginPath();
    g.moveTo(s * 58, -128);
    g.lineTo(s * 98, -166);
    g.lineTo(s * 86, -218);
    g.strokePath();
    g.lineStyle(2, rim, 0.55);
    g.lineBetween(s * 64, -132, s * 102, -168);
  }
}

// A giant rat-kangaroo thing, severed and twisted. Base at (0, 0); the head sits above it.
export function severedHead(g: G, r: Rng): void {
  const fur = 0x2c3a1c;
  const sick = 0x9ccc3c;
  blob(g, 0, 4, 60, 14, 0x000000, 0.5);
  // The ragged neck and the bone in it.
  blob(g, -4, -8, 38, 15, 0x4a0f10);
  blob(g, -4, -10, 28, 10, 0x7a1c1a);
  blob(g, -4, -11, 10, 5, 0xe6dcc4);
  for (let i = 0; i < 5; i++) {
    g.lineStyle(3, 0x4a0f10, 1);
    g.lineBetween(-30 + i * 14, -6, -34 + i * 14 + r() * 8, 12 + r() * 8);
  }
  // Skull and fur, tilted the wrong way, with a dark outline so it reads through the glow.
  blob(g, -2, -50, 62, 50, 0x0a1004, 1, -0.22);
  blob(g, -2, -50, 58, 46, shade(fur, 0.8), 1, -0.22);
  blob(g, -6, -58, 46, 30, fur, 1, -0.22);
  g.lineStyle(2, 0x6f9a2c, 0.75);
  for (let i = 0; i < 16; i++) {
    const a = -2.6 + i * 0.22;
    const x = -6 + Math.cos(a) * 48;
    const y = -52 + Math.sin(a) * 38;
    g.lineBetween(x, y, x + Math.cos(a) * 9 + (r() - 0.5) * 4, y + Math.sin(a) * 9);
  }
  // Ears, one standing and one folded over.
  g.fillStyle(0x0a1004, 1);
  g.fillPoints([V(-40, -76), V(-58, -158), V(-12, -86)], true);
  g.fillPoints([V(10, -90), V(62, -116), V(66, -80), V(26, -78)], true);
  g.fillStyle(shade(fur, 0.9), 1);
  g.fillPoints([V(-34, -80), V(-52, -150), V(-18, -88)], true);
  g.fillStyle(0x6a8a28, 0.8);
  g.fillPoints([V(-34, -86), V(-46, -136), V(-24, -90)], true);
  g.fillStyle(shade(fur, 0.9), 1);
  g.fillPoints([V(14, -88), V(56, -110), V(60, -84), V(26, -82)], true);
  // The snout, bent sideways.
  blob(g, 52, -34, 44, 24, 0x0a1004, 1, 0.55);
  blob(g, 52, -34, 40, 20, shade(fur, 1.25), 1, 0.55);
  blob(g, 80, -14, 10, 7, 0x1a1210, 1, 0.55);
  // Jaw hanging crooked, with the long front teeth.
  g.fillStyle(0x3a0c0e, 1);
  g.fillPoints([V(40, -26), V(86, -4), V(70, 10), V(30, -8)], true);
  g.fillStyle(0xd8cc7a, 1);
  g.fillPoints([V(58, -18), V(63, 4), V(68, -14)], true);
  g.fillPoints([V(70, -12), V(74, 7), V(80, -8)], true);
  g.lineStyle(2, 0xcfc8a0, 0.9);
  for (let i = 0; i < 4; i++) {
    g.lineBetween(70, -30 + i * 2, 120, -50 + i * 11 + r() * 6);
  }
  // One bulging eye, one empty socket.
  blob(g, 12, -62, 15, 13, 0xcfe85a);
  blob(g, 14, -62, 3.4, 11, 0x0c1004);
  blob(g, -38, -60, 11, 9, 0x050804);
  g.lineStyle(2, 0x0c1004, 1);
  g.strokeEllipse(12, -62, 30, 26);
  // Sick veins crawling over the skull.
  g.lineStyle(2, sick, 0.7);
  for (let i = 0; i < 6; i++) {
    const x = -40 + r() * 70;
    const y = -90 + r() * 30;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 24, y + 12);
    g.lineTo(x + (r() - 0.5) * 30, y + 26);
    g.strokePath();
  }
  // Drips of ichor.
  g.fillStyle(sick, 0.85);
  for (const [x, y, h] of [[-26, 2, 16], [8, 8, 24], [40, 4, 12]] as const) {
    g.fillRect(x, y, 3, h);
    g.fillCircle(x + 1.5, y + h, 3.4);
  }
}

// The floating book: a closed tome with a glowing seal. Centre at (0, 0).
export function book(g: G): void {
  g.fillStyle(0x0c1a3a, 1);
  g.fillRoundedRect(-30, -40, 62, 80, 4);
  g.fillStyle(0x16305e, 1);
  g.fillRoundedRect(-30, -40, 58, 76, 4);
  g.fillStyle(0xcfc4a0, 1);
  g.fillRect(28, -36, 5, 72);
  g.lineStyle(1, 0x8a7e5a, 1);
  for (let i = 0; i < 8; i++) g.lineBetween(28, -34 + i * 10, 33, -34 + i * 10);
  g.fillStyle(0x0a1530, 1);
  g.fillRect(-30, -40, 9, 76);
  g.lineStyle(2, 0x7ab4ff, 0.95);
  g.strokeCircle(2, -2, 16);
  g.strokeCircle(2, -2, 9);
  g.beginPath();
  g.moveTo(-14, -2);
  g.lineTo(18, -2);
  g.moveTo(2, -18);
  g.lineTo(2, 14);
  g.strokePath();
  g.fillStyle(0xb8dcff, 1);
  g.fillCircle(2, -2, 3.4);
  g.lineStyle(1.5, 0x4a7ac8, 0.9);
  g.strokeRoundedRect(-27, -37, 52, 70, 3);
  for (const [x, y] of [[-24, -34], [22, -34], [-24, 30], [22, 30]] as const) {
    g.fillStyle(0x8aa0c8, 1);
    g.fillCircle(x, y, 2);
  }
}

// Rubble heaps and bone scatter that make the rooms feel lived in (and died in).
export function debris(g: G, r: Rng, count: number, w: number, h: number): void {
  for (let i = 0; i < count; i++) {
    const x = r() * w;
    const y = r() * h;
    if (r() < 0.5) blob(g, x, y, 2 + r() * 5, 1.4 + r() * 3, shade(0x4a4650, 0.6 + r() * 0.7), 1, r() * 3);
    else {
      g.lineStyle(2, 0xbdb398, 0.85);
      g.lineBetween(x, y, x + (r() - 0.5) * 14, y + (r() - 0.5) * 6);
    }
  }
}
