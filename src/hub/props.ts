import Phaser from 'phaser';
import { nodeById } from '../skills';
import { G, mix, Rng, shade } from './draw';

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

type P = [number, number];

// A smooth closed (or open) curve through the points, sampled into a polygon.
function spline(pts: P[], closed = true, seg = 6): Phaser.Math.Vector2[] {
  const n = pts.length;
  const at = (i: number) => pts[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  const out: Phaser.Math.Vector2[] = [];
  const count = closed ? n : n - 1;
  for (let i = 0; i < count; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let k = 0; k < seg; k++) {
      const t = k / seg;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
      out.push(V(f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])));
    }
  }
  if (!closed) out.push(V(pts[n - 1][0], pts[n - 1][1]));
  return out;
}

// A filled shape with a dark rim. Smooth for flesh and bone, sharp for spikes and horns.
function shape(g: G, pts: P[], fill: number, rim = 0x050804, lw = 3, smooth = true, alpha = 1): void {
  const poly = smooth ? spline(pts) : pts.map(([x, y]) => V(x, y));
  g.fillStyle(fill, alpha).fillPoints(poly, true);
  if (lw > 0) g.lineStyle(lw, rim, 1).strokePoints(poly, true);
}

function inside(pts: P[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// One feather: a leaf-shaped vane with a centre shaft and barbs, rooted at (x, y) and pointing along `deg`.
function feather(g: G, x: number, y: number, deg: number, len: number, wid: number, color: number): void {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const at = (u: number, v: number): P => [x + c * u - s * v, y + s * u + c * v];
  const outline: P[] = [at(0, 0), at(len * 0.22, -wid * 0.85), at(len * 0.58, -wid), at(len * 0.88, -wid * 0.55), at(len, 0), at(len * 0.88, wid * 0.55), at(len * 0.58, wid), at(len * 0.22, wid * 0.85)];
  shape(g, outline, shade(color, 0.35), 0x050804, 2.2);
  shape(g, outline.map(([px, py]) => [x + (px - x) * 0.86 + (at(len * 0.5, 0)[0] - x) * 0.08, y + (py - y) * 0.86 + (at(len * 0.5, 0)[1] - y) * 0.08] as P), shade(color, 0.8), 0, 0);
  // The brighter outer half of the vane.
  shape(g, [at(len * 0.5, -wid * 0.8), at(len * 0.72, -wid * 0.85), at(len * 0.92, -wid * 0.4), at(len * 0.98, 0), at(len * 0.9, wid * 0.4), at(len * 0.72, wid * 0.85), at(len * 0.5, wid * 0.8)], mix(color, 0xffffff, 0.35), 0, 0);
  // Barbs slanting toward the tip, and the shaft.
  g.lineStyle(1, shade(color, 0.45), 0.7);
  for (let t = 0.12; t < 0.92; t += 0.085) {
    const w = wid * Math.min(1, 0.5 + t * 1.2) * (t > 0.8 ? (1 - t) * 5 : 1);
    const [x0, y0] = at(len * t, 0);
    const [x1, y1] = at(len * (t + 0.12), -w * 0.9);
    const [x2, y2] = at(len * (t + 0.12), w * 0.9);
    g.lineBetween(x0, y0, x1, y1);
    g.lineBetween(x0, y0, x2, y2);
  }
  g.lineStyle(1.8, mix(color, 0xffffff, 0.7), 0.95).lineBetween(x, y, ...at(len * 0.97, 0));
}

// The six skills' colours, in the order they sit along Anathema's crest.
const CREST = ['fireFairy', 'doomsday', 'aegis', 'lotus', 'iceFairy', 'swordSlash'] as const;
const crestColor = (i: number) => nodeById.get(CREST[i % CREST.length])?.color ?? 0xffffff;

// The eye alone, in a given colour, to draw over the one in the head (which faces right here before being flipped).
export function severedHeadEye(g: G, color: number): void {
  blob(g, 40, -71, 14, 7.5, 0x050804, 1, 0.22);
  blob(g, 40, -71, 11, 5.8, color, 1, 0.22);
  blob(g, 41, -71, 2.2, 6, 0x050804, 1, 0.22);
  g.fillStyle(0xffffff, 0.9).fillCircle(36, -73, 1.4);
}

// The thick cable his neck stump is plugged into: clean, office-grey sheathing with a blue stripe, numbered label
// tags and black cable ties, the way a data centre would run it. It has plenty of slack: it hangs from the stump,
// lies on the floor in a lazy loop, then runs off toward the back of the throne. `top` is the part by the stump
// (drawn above the floor); `floor` lies flat on the ground and is drawn under everything. Room coordinates.
export function headWire(top: G, floor: G): void {
  const way: P[] = [
    [940, 334], [943, 350], [940, 366], [926, 382], [902, 390], [868, 388], [846, 398], [838, 418], [856, 434], [882, 426],
    [890, 402], [882, 380], [868, 358], [848, 336], [822, 312], [792, 284], [766, 262], [740, 246], [716, 228], [700, 204], [690, 180],
  ];
  const seg = 8;
  const pts = spline(way, false, seg);
  const w = 14;
  const split = 3 * seg;

  const stroke = (g: G, list: Phaser.Math.Vector2[], width: number, color: number, alpha = 1) => {
    g.lineStyle(width, color, alpha);
    g.beginPath();
    list.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.strokePath();
  };
  const frame = (list: Phaser.Math.Vector2[], i: number) => {
    const p = list[i];
    const a = list[Math.max(0, i - 1)];
    const b = list[Math.min(list.length - 1, i + 1)];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { p, tx: (b.x - a.x) / len, ty: (b.y - a.y) / len, nx: -(b.y - a.y) / len, ny: (b.x - a.x) / len };
  };
  // The same curve shifted sideways, for stripes and shading.
  const side = (list: Phaser.Math.Vector2[], d: number) =>
    list.map((_, i) => {
      const f = frame(list, i);
      return V(f.p.x + f.nx * d, f.p.y + f.ny * d);
    });
  const band = (g: G, list: Phaser.Math.Vector2[], i: number, k: number, hw: number, color: number) => {
    const f = frame(list, i);
    g.fillStyle(color, 1).fillPoints([V(f.p.x + f.nx * hw - f.tx * k, f.p.y + f.ny * hw - f.ty * k), V(f.p.x + f.nx * hw + f.tx * k, f.p.y + f.ny * hw + f.ty * k), V(f.p.x - f.nx * hw + f.tx * k, f.p.y - f.ny * hw + f.ty * k), V(f.p.x - f.nx * hw - f.tx * k, f.p.y - f.ny * hw - f.ty * k)], true);
    return f;
  };

  const draw = (g: G, list: Phaser.Math.Vector2[], base: number) => {
    // A soft shadow under the whole length, so it reads as lying on the floor.
    stroke(g, list.map((p) => V(p.x + 2, p.y + 4)), w + 5, 0x000000, 0.35);
    // Chunk by chunk, so where it crosses itself the later part sits over the earlier.
    const step = 10;
    for (let i = 0; i < list.length - 1; i += step) {
      const part = list.slice(i, Math.min(list.length, i + step + 3));
      stroke(g, part, w + 2.5, 0x1c1f25);
      stroke(g, part, w, 0xa4a9b2);
      stroke(g, side(part, w * 0.24), w * 0.5, 0x7b808b);
      stroke(g, side(part, -w * 0.2), 3, 0xdfe3e9, 0.9);
      stroke(g, side(part, -w * 0.02), 2, 0x2f63c8);
    }
    for (const p of [list[0], list[list.length - 1]]) {
      g.fillStyle(0x1c1f25, 1).fillCircle(p.x, p.y, (w + 2.5) / 2);
      g.fillStyle(0xa4a9b2, 1).fillCircle(p.x, p.y, w / 2);
    }
    // Black cable ties, and numbered label tags, at fixed spots along it.
    for (let i = 14; i < list.length - 2; i += 36) {
      band(g, list, i, 1.6, w / 2 + 2, 0x15171b);
      band(g, list, i, 0.7, w / 2 + 2.6, 0x15171b);
    }
    for (let i = base; i < list.length - 2; i += 46) {
      band(g, list, i, 7, w / 2 + 1.5, 0x1c1f25);
      band(g, list, i, 6, w / 2 + 0.5, 0xf1f3f6);
      band(g, list, i, 6, w / 2 - 3, 0xd9dde3);
      const f = frame(list, i);
      g.fillStyle(0x2f63c8, 1).fillRect(f.p.x - 2, f.p.y - 2, 4, 4);
      band(g, list, i, 0.8, w / 2 + 1.5, 0x2f63c8);
    }
  };
  draw(top, pts.slice(0, split + 2), 6);
  draw(floor, pts.slice(split), 30);

  // Where the cable meets the stump: a black strain-relief boot, a grey plug jammed into the flesh, and ichor.
  const [sx, sy] = way[0];
  blob(top, sx, sy - 2, 24, 7, 0x4a0f10, 0.95);
  blob(top, sx, sy - 3, 19, 5, 0x8a2220, 0.95);
  top.fillStyle(0xd0c04a, 1);
  for (const dx of [-8, -4, 0, 4, 8]) top.fillRect(sx + dx - 1, sy - 13, 2, 8);
  top.fillStyle(0x1c1f25, 1).fillRect(sx - 14, sy - 7, 28, 11);
  top.fillStyle(0xc8ccd3, 1).fillRect(sx - 13, sy - 6, 26, 9);
  top.fillStyle(0xeef0f3, 0.9).fillRect(sx - 13, sy - 6, 26, 2);
  top.fillStyle(0x7b808b, 1).fillRect(sx - 13, sy + 1, 26, 2);
  top.fillStyle(0x15171b, 1).fillPoints([V(sx - 13, sy + 3), V(sx + 13, sy + 3), V(sx + 9, sy + 20), V(sx - 9, sy + 20)], true);
  top.lineStyle(1.4, 0x3a3f48, 1);
  for (const y of [8, 12, 16]) top.lineBetween(sx - 11 + (y - 8) * 0.25, sy + y, sx + 11 - (y - 8) * 0.25, sy + y);
  top.fillStyle(0x9ccc3c, 0.85);
  for (const [x, h] of [[-16, 8], [14, 12]] as const) {
    top.fillRect(sx + x, sy + 2, 2.5, h);
    top.fillCircle(sx + x + 1.2, sy + 2 + h, 2.6);
  }
}

// Anathema, severed: a dragon's head with a ragged neck, swept horns, a burnt-gold crest behind it, torn dark fins,
// cracked scales and a hanging jaw full of teeth. Base of the neck at (0, 0); it faces right and fits (-140..140, -200..60).
export function severedHead(g: G, r: Rng): void {
  const scale = 0x23281a;
  const scaleLight = 0x3e4e28;
  const rim = 0x050804;
  const bone = 0xe6dcc4;
  const sick = 0x9ccc3c;
  // Drawn facing right, then flipped so he looks to the left.
  g.scaleCanvas(-1, 1);
  blob(g, 0, 4, 70, 14, 0x000000, 0.5);

  // Behind everything: the crest of tarnished gold feathers to one side and dark, torn fins on the other.
  // A crest of feathers, one colour for each of the six skills: a short underlay and then the long ones over it.
  for (let i = 0; i < 6; i++) feather(g, -4, -92, -163 + i * 21 + 10, 74 + (i % 2) * 8, 11, shade(crestColor(i), 0.7));
  for (let i = 0; i < 6; i++) feather(g, -4, -94, -170 + i * 21, 104 + (i % 3) * 7, 14, crestColor(i));
  // A ruff of smaller ones hanging round the neck.
  for (let i = 0; i < 5; i++) feather(g, -42, -42 + i * 4, 98 + i * 15, 34 + (i % 2) * 6, 7, crestColor(i + 2));

  // The neck: thick scaled flesh cut off raggedly, with the bone showing.
  shape(g, [[-54, -44], [-60, -14], [-44, 8], [-14, 14], [22, 8], [42, -8], [38, -38]], scale, rim, 3);
  g.lineStyle(1.5, scaleLight, 0.5);
  for (let i = 0; i < 5; i++) g.lineBetween(-50 + i * 20, -36, -52 + i * 20 + r() * 6, 2);
  blob(g, -10, 8, 46, 11, 0x4a0f10);
  blob(g, -10, 7, 38, 8, 0x8a2220);
  blob(g, -10, 6, 10, 5, bone);
  blob(g, -10, 6, 4, 2.4, 0x2a0a0a);
  g.lineStyle(3, 0x4a0f10, 1);
  for (let i = 0; i < 6; i++) g.lineBetween(-42 + i * 14, 10, -44 + i * 14 + r() * 8, 22 + r() * 10);

  // The inside of the mouth, the tongue, then the hanging lower jaw.
  // The back of the mouth is dark throat with a little red; further forward the jaws are open, so the floor shows
  // through between the front teeth.
  g.fillStyle(0x0c0406, 1).fillPoints(spline([[14, -36], [58, -41], [96, -42], [102, -28], [96, -14], [62, -12], [18, -22]]), true);
  g.fillStyle(0x3a0a10, 1).fillPoints(spline([[14, -33], [50, -38], [86, -40], [98, -32], [90, -20], [56, -15], [22, -20]]), true);
  g.fillStyle(0x7a1c28, 1).fillPoints(spline([[28, -21], [58, -25], [84, -23], [90, -18], [66, -15], [38, -15]]), true);
  g.lineStyle(1.5, 0x4a0f18, 0.8).strokePoints(spline([[34, -18], [60, -20], [84, -19]], false), false);
  shape(g, [[-18, -26], [8, -12], [48, 2], [94, 10], [128, 2], [132, -12], [116, -20], [70, -21], [36, -24]], 0x1c2014, rim, 3);
  g.lineStyle(1.5, scaleLight, 0.5).strokePoints(spline([[0, -14], [40, -2], [88, 5], [122, -3]], false), false);
  // Lower teeth, pointing up.
  for (const [x, tipY, w] of [[112, -42, 4], [92, -34, 3.5], [70, -32, 3.5], [50, -30, 3], [34, -26, 3]] as const) {
    shape(g, [[x - w, -19], [x, tipY], [x + w, -19]], bone, 0x2a2418, 1.5, false);
  }

  // Cheek spikes sweeping back from the jaw hinge.
  for (const [tx, ty] of [[-70, -22], [-76, -44], [-66, -64]] as const) {
    shape(g, [[-28, ty * 0.55 - 14], [tx, ty], [-30, ty * 0.55 - 4]], 0x14120c, rim, 2, false);
    g.fillStyle(bone, 0.9).fillPoints([V(tx, ty), V(tx + 12, ty + (ty < -40 ? 5 : -2)), V(tx + 10, ty + (ty < -40 ? 9 : 3))], true);
  }

  // The skull and snout.
  const head: P[] = [[-62, -52], [-56, -82], [-30, -104], [8, -108], [42, -98], [78, -84], [112, -72], [130, -60], [128, -46], [104, -42], [70, -38], [40, -36], [14, -30], [-20, -24], [-50, -28]];
  shape(g, head, scale, rim, 3.5);
  shape(g, [[-30, -100], [10, -103], [46, -93], [80, -81], [118, -69], [124, -61], [100, -66], [60, -76], [20, -88], [-20, -92]], scaleLight, rim, 0, true, 0.75);

  // Scales: little arcs scattered over the skull.
  g.lineStyle(1.4, 0x7a9a40, 0.5);
  for (let n = 0; n < 130; n++) {
    const x = -60 + r() * 190;
    const y = -108 + r() * 80;
    if (!inside(head, x, y) || Math.hypot(x - 40, y + 72) < 18) continue;
    g.beginPath();
    g.arc(x, y, 3.6 + r() * 1.6, 0.15 * Math.PI, 0.85 * Math.PI);
    g.strokePath();
  }

  // Ridge of spines along the crown.
  for (const [x, y] of [[-52, -90], [-38, -101], [-22, -107], [-4, -110], [14, -110], [32, -105], [48, -98]] as const) {
    shape(g, [[x - 5, y + 2], [x - 9 - r() * 3, y - 16 - r() * 6], [x + 5, y + 1]], 0x14120c, rim, 1.8, false);
  }

  // Horns: two long swept-back ones from the crown and a short one over the brow.
  shape(g, [[-34, -98], [-26, -106], [-56, -122], [-98, -126], [-132, -146], [-133, -139], [-104, -118], [-78, -102], [-58, -92]], 0x1a160e, rim, 2.5, false);
  g.lineStyle(1.5, 0x5a4a30, 0.7);
  for (const [x, y] of [[-48, -112], [-68, -118], [-92, -122]] as const) g.lineBetween(x, y, x - 3, y + 8);
  g.fillStyle(bone, 1).fillPoints([V(-122, -142), V(-132, -146), V(-133, -139), V(-126, -136)], true);
  shape(g, [[-4, -106], [4, -110], [-6, -138], [-18, -166], [-23, -160], [-20, -136], [-14, -116]], 0x1a160e, rim, 2.2, false);
  g.fillStyle(bone, 1).fillPoints([V(-18, -166), V(-23, -160), V(-22, -152), V(-16, -158)], true);
  shape(g, [[56, -90], [70, -94], [82, -122], [76, -128], [64, -110]], 0x1a160e, rim, 2.2, false);
  g.fillStyle(bone, 1).fillPoints([V(82, -122), V(76, -128), V(78, -116)], true);

  // Brow ridge, the eye and the nostril: it is still looking at you.
  shape(g, [[10, -84], [32, -94], [64, -88], [70, -76], [40, -82], [16, -72]], 0x0f120a, rim, 2.5, false);
  g.fillStyle(sick, 0.18).fillEllipse(40, -72, 44, 24);
  blob(g, 40, -71, 14, 7.5, 0x050804, 1, 0.22);
  blob(g, 40, -71, 11, 5.8, 0xd8ff40, 1, 0.22);
  blob(g, 41, -71, 2.2, 6, 0x050804, 1, 0.22);
  g.fillStyle(0xffffff, 0.9).fillCircle(36, -73, 1.4);
  blob(g, 118, -61, 5, 2.6, 0x050804, 1, 0.5);

  // Upper teeth over the jaw, with fangs in front.
  for (const [x, len, w] of [[118, 14, 3.5], [102, 30, 4.5], [84, 18, 3.5], [66, 14, 3.5], [50, 11, 3], [36, 8, 3]] as const) {
    shape(g, [[x - w, -41], [x + 1, -41 + len], [x + w, -41]], bone, 0x2a2418, 1.5, false);
  }
  // Drool from the fangs.
  g.lineStyle(1.5, 0xcfe8b0, 0.55);
  for (const x of [101, 118]) g.lineBetween(x, -12, x + 1, 12 + r() * 10);

  // Ichor and blood dripping from the neck.
  g.fillStyle(sick, 0.85);
  for (const [x, y, h] of [[-38, 14, 16], [-6, 18, 26], [26, 12, 14]] as const) {
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
