import { nodeById } from '../skills';
import { G, mix, Rng, shade } from './draw';
import { blob, feather, P, severedHead, shape, spline, V } from './props';

// Anathema whole, crawling: the hub's head on a dragon's body with every skill in it. Fire and gold down his
// near side, ice and a dark leathery wing down the far side, poison on his claws and tail, lightning crackling
// along his back, a purple blade on his tail and a pale halo behind it all.
// Drawn facing left, with the ground at y = 0 and the middle of the body at x = 0; it spans about (-330..380, -380..10).

const color = (id: string) => nodeById.get(id)?.color ?? 0xffffff;
const FIRE = color('fireFairy');
const ICE = color('iceFairy');
const POISON = color('lotus');
const BOLT = color('doomsday');
const BLADE = color('swordSlash');
const HOLY = color('aegis');

const hide = 0x23281a;
const hideLight = 0x3e4e28;
const belly = 0x6b6a3c;
const rim = 0x050804;
const bone = 0xe6dcc4;

function flame(g: G, x: number, y: number, h: number, w: number, lean = 0): void {
  for (const [k, c, a] of [[1, 0xff5a0c, 0.9], [0.7, 0xffa224, 0.95], [0.4, 0xfff0a0, 1]] as const) {
    g.fillStyle(c, a).fillPoints([V(x - w * k, y), V(x - w * 0.9 * k, y - h * 0.4 * k), V(x + lean * k, y - h * k), V(x + w * 0.9 * k, y - h * 0.4 * k), V(x + w * k, y)], true);
  }
}

function shard(g: G, x: number, y: number, h: number, w: number, deg = 0): void {
  const a = (deg * Math.PI) / 180;
  const at = (u: number, v: number): P => [x + Math.sin(a) * u + Math.cos(a) * v, y - Math.cos(a) * u + Math.sin(a) * v];
  shape(g, [at(0, -w), at(h, 0), at(0, w)], mix(ICE, 0xffffff, 0.35), 0x2a5a78, 1.5, false);
  shape(g, [at(0, 0), at(h, 0), at(0, w)], shade(ICE, 0.7), 0, 0, false, 0.8);
}

function bolt(g: G, x: number, y: number, dx: number, dy: number, jag: number, r: Rng): void {
  const pts: P[] = [[x, y]];
  for (let i = 1; i <= 5; i++) pts.push([x + (dx * i) / 5 + (r() - 0.5) * jag, y + (dy * i) / 5 + (r() - 0.5) * jag]);
  g.lineStyle(5, BOLT, 0.35).strokePoints(pts.map(([a, b]) => V(a, b)), false);
  g.lineStyle(2, 0xfffbe0, 0.95).strokePoints(pts.map(([a, b]) => V(a, b)), false);
}

// A limb as a chain of thickening joints.
function limb(g: G, pts: P[], widths: number[], fill: number): void {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const a = Math.atan2(y1 - y0, x1 - x0) + Math.PI / 2;
    const [w0, w1] = [widths[i], widths[i + 1]];
    const c = Math.cos(a);
    const s = Math.sin(a);
    shape(g, [[x0 + c * w0, y0 + s * w0], [x1 + c * w1, y1 + s * w1], [x1 - c * w1, y1 - s * w1], [x0 - c * w0, y0 - s * w0]], fill, rim, 3, false);
  }
  for (let i = 0; i < pts.length; i++) blob(g, pts[i][0], pts[i][1], widths[i] * 1.05, widths[i] * 1.05, fill);
}

function claws(g: G, x: number, y: number, dir: number, tint: number, scale = 1): void {
  for (let i = 0; i < 4; i++) {
    const cx = x + dir * (6 + i * 16) * scale;
    const cy = y + 4 - Math.abs(i - 1.5) * 3;
    shape(g, [[cx - 6 * scale, cy - 7 * scale], [cx + dir * 22 * scale, cy + 6 * scale], [cx + 7 * scale, cy - 2 * scale]], mix(bone, tint, 0.35), rim, 2, false);
  }
}

// His chest is raised off the ground on his arms, as he crawls.
const LIFT = 90;

export function drawAnathema(g: G, r: Rng): void {
  const whole = true;
  const lifted = (draw: () => void) => {
    g.save();
    g.translateCanvas(0, -LIFT);
    draw();
    g.restore();
  };
  // A pale halo, then the ground shadow.
  lifted(() => {
    g.lineStyle(10, HOLY, 0.12).strokeEllipse(40, -190, 560, 520);
    g.lineStyle(3, HOLY, 0.45).strokeEllipse(40, -190, 540, 500);
  });
  blob(g, 20, 8, 400, 34, 0x000000, 0.55);
  lifted(() => {

  // The far wing: dark leather with ice-blue bones and edges, spread up and back behind the body.
  const finger: P[] = [[180, -130], [310, -360], [470, -300], [560, -170], [520, -50]];
  shape(g, [[170, -110], ...finger, [330, -40], [240, -50]], 0x15111f, rim, 3, false);
  shape(g, [[185, -118], [320, -330], [440, -270], [530, -160], [490, -60], [330, -55], [240, -62]], 0x241d36, 0, 0, false, 0.9);
  for (const [fx, fy] of finger.slice(1)) {
    g.lineStyle(7, 0x0a0710, 1).lineBetween(180, -130, fx, fy);
    g.lineStyle(3, mix(ICE, 0x203040, 0.45), 0.9).lineBetween(180, -130, fx, fy);
  }
  g.lineStyle(2, ICE, 0.7).strokePoints([V(310, -360), V(390, -270), V(470, -300), V(520, -215), V(560, -170), V(525, -105), V(520, -50)].map((p) => p), false);
  for (const [fx, fy] of [[390, -270], [520, -215], [525, -105]] as const) g.fillStyle(mix(ICE, 0xffffff, 0.4), 0.8).fillCircle(fx, fy, 4);
  // Claws at the wing's joints.
  for (const [fx, fy] of finger.slice(1)) shape(g, [[fx - 5, fy + 4], [fx + 2, fy - 18], [fx + 7, fy + 2]], bone, rim, 1.5, false);

  // The near wing: tarnished gold feathers, flame-coloured and lightning-yellow, fanned up and forward over the back.
  for (let i = 0; i < 9; i++) feather(g, 150, -118, -150 + i * 17, 200 + (i % 3) * 16, 17, shade(i % 2 ? BOLT : FIRE, 0.6));
  for (let i = 0; i < 9; i++) feather(g, 154, -122, -158 + i * 17, 270 + (i % 3) * 22, 21, [FIRE, 0xd8a030, BOLT][i % 3]);

  });

  // The far limbs, darker: an arm reaching forward on the ice side and the far hind leg.
  limb(g, [[170, -150], [135, -85], [95, -28], [70, -6]], [40, 30, 24, 20], shade(hide, 0.7));
  claws(g, 52, -2, -1, ICE);
  for (let i = 0; i < 5; i++) shard(g, 100 + i * 8, -70 - i * 12, 40 - i * 4, 7, -50 + i * 25);
  limb(g, [[330, -130], [380, -60], [350, -4]], [46, 30, 22], shade(hide, 0.7));
  claws(g, 332, -2, -1, ICE, 0.9);

  lifted(() => {
  // The tail: a thick tapering curve ending in a purple blade, with poison running down it.
  const tail: P[] = [[340, -60], [430, -10], [520, 30], [600, 70], [665, 60]];
  const tailPath = spline(tail, false, 10);
  tailPath.forEach((p, i) => {
    const t = i / (tailPath.length - 1);
    blob(g, p.x, p.y, 36 - t * 26, 36 - t * 26, rim);
  });
  tailPath.forEach((p, i) => {
    const t = i / (tailPath.length - 1);
    blob(g, p.x, p.y, 32 - t * 24, 32 - t * 24, hide);
    if (i % 3 === 0) blob(g, p.x - 2, p.y - 6, 14 - t * 10, 9 - t * 7, hideLight, 0.7);
  });
  shape(g, [[652, 48], [730, 0], [782, 2], [730, 44], [668, 82]], 0x2a1646, rim, 3, false);
  shape(g, [[658, 52], [728, 10], [770, 8], [726, 42]], mix(BLADE, 0xffffff, 0.35), 0, 0, false, 0.9);
  g.lineStyle(2, BLADE, 0.9).lineBetween(662, 60, 774, 5);
  g.fillStyle(POISON, 0.85);
  for (const [x, y, h] of [[470, 6, 24], [545, 44, 30], [610, 80, 18]] as const) {
    g.fillRect(x, y, 4, h);
    g.fillCircle(x + 2, y + h, 4.5);
  }

  // The torso: a barrel chest tapering to the hips, with the belly plates showing underneath.
  const torso: P[] = [[20, -150], [110, -190], [220, -180], [330, -130], [370, -50], [330, 10], [230, 22], [120, 10], [40, -50]];
  shape(g, torso, hide, rim, 4);
  shape(g, [[60, -90], [150, -130], [260, -130], [330, -80], [310, -10], [220, 0], [120, -5], [60, -40]], hideLight, 0, 0, true, 0.35);
  shape(g, [[50, -40], [120, 6], [230, 18], [320, 6], [300, -20], [230, -4], [130, -14]], belly, rim, 2.5);
  g.lineStyle(2, shade(belly, 0.55), 0.9);
  for (let i = 0; i < 9; i++) g.lineBetween(70 + i * 29, -18 + (i % 3), 76 + i * 29, 14);
  // Scales over the flanks.
  g.lineStyle(1.4, 0x7a9a40, 0.45);
  for (let n = 0; n < 160; n++) {
    const x = 30 + r() * 330;
    const y = -190 + r() * 190;
    if (y > -24 || Math.hypot(x - 200, y + 100) > 190) continue;
    g.beginPath();
    g.arc(x, y, 4 + r() * 2, 0.15 * Math.PI, 0.85 * Math.PI);
    g.strokePath();
  }
  // The elements: fire glowing in the front half of the body, ice creeping over the back half.
  blob(g, 90, -70, 80, 62, FIRE, 0.28);
  blob(g, 80, -64, 46, 36, BOLT, 0.28);
  blob(g, 300, -90, 80, 66, ICE, 0.26);
  for (let i = 0; i < 6; i++) flame(g, 40 + i * 24, -42 + (i % 2) * 6, 70 - (i % 3) * 14, 14, -5 + i * 2);
  for (let i = 0; i < 5; i++) shard(g, 300 + i * 17, -126 + Math.abs(i - 2) * 10, 40 - (i % 2) * 10, 8, 10 + i * 14);
  // A ridge of spines along the back, fire-tipped then frost-tipped.
  for (let i = 0; i < 9; i++) {
    const x = 60 + i * 33;
    const y = -166 + Math.abs(i - 3) * 6 + (i > 5 ? (i - 5) * 12 : 0);
    shape(g, [[x - 8, y + 6], [x + 3, y - 34 - (i % 2) * 10], [x + 12, y + 8]], i < 5 ? mix(FIRE, 0x14120c, 0.45) : mix(ICE, 0x14120c, 0.45), rim, 2, false);
    g.fillStyle(i < 5 ? FIRE : ICE, 0.9).fillPoints([V(x + 1, y - 30 - (i % 2) * 10), V(x - 3, y - 12), V(x + 8, y - 12)], true);
  }
  // Shoulder plate in white-gold, the aegis.
  shape(g, [[10, -150], [70, -196], [130, -170], [110, -120], [50, -108]], mix(HOLY, 0xd8a030, 0.35), rim, 3);
  g.lineStyle(2, 0xffffff, 0.7).strokePoints(spline([[24, -142], [70, -184], [118, -164]], false), false);
  // Lightning crackling over the back.
  bolt(g, 150, -210, 60, -60, 28, r);
  bolt(g, 260, -190, 80, -50, 28, r);
  bolt(g, 330, -110, 60, 10, 24, r);

  });

  // The near hind leg: a heavy thigh, a bent shin and a clawed foot.
  limb(g, [[300, -150], [352, -70], [305, -4]], [54, 34, 26], hide);
  blob(g, 306, -156, 40, 36, hideLight, 0.5);
  claws(g, 272, -2, -1, POISON, 1.1);
  g.fillStyle(POISON, 0.5).fillEllipse(262, 4, 110, 14);
  g.fillStyle(POISON, 0.85);
  for (const x of [248, 274]) g.fillCircle(x, -2, 4);

  // The near arm, wreathed in flame: the one he drags himself forward on.
  limb(g, [[85, -205], [25, -125], [-25, -55], [-45, -8]], [50, 38, 30, 26], hide);
  blob(g, 30, -125, 30, 22, hideLight, 0.55);
  // Blades along the forearm, purple as the sword slash.
  for (let i = 0; i < 3; i++) shape(g, [[34 - i * 22, -122 + i * 24], [50 - i * 22 - 8, -150 + i * 24 - 26], [54 - i * 22, -118 + i * 24]], mix(BLADE, 0xffffff, 0.3), rim, 2, false);
  for (let i = 0; i < 6; i++) flame(g, -52 + i * 16, -40 - (i % 2) * 10, 80 - (i % 3) * 12, 13, -4 + i * 2);
  claws(g, -78, -2, -1, FIRE, 1.3);
  blob(g, -60, 0, 60, 9, FIRE, 0.3);

  // The head, whole, held low and forward.
  g.save();
  g.translateCanvas(78, -112 - LIFT);
  severedHead(g, r, whole);
  g.restore();

  // Poison from the maw.
  g.fillStyle(POISON, 0.8);
  for (const [x, y, h] of [[-50, -110 - LIFT, 34], [-34, -108 - LIFT, 22], [-66, -104 - LIFT, 18]] as const) {
    g.fillRect(x, y, 3, h);
    g.fillCircle(x + 1.5, y + h, 4);
  }
  // Frost breath and embers drifting off the near side.
  for (let i = 0; i < 14; i++) {
    g.fillStyle(i % 2 ? ICE : FIRE, 0.7).fillCircle(-230 + r() * 140, -150 - LIFT + r() * 130, 1.6 + r() * 2.2);
  }
}
