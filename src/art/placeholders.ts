import Phaser from 'phaser';

// Code-drawn placeholder art. Gameplay only refers to these texture keys, so real sprite sheets
// can be loaded under the same keys later without touching gameplay code.
export const Tex = {
  player: 'player',
  hero: 'hero',
  arrow: 'arrow',
  shadow: 'shadow',
  dummy: 'dummy',
  smoke: 'smoke',
  vignette: 'vignette',
  glow: 'glow',
  barricade: 'decor_barricade',
  soldier: 'decor_soldier',
  siege: 'decor_siege',
  wreck: 'decor_wreck',
  rubble: 'obstacle_rubble',
  wall: 'ruin_wall',
  pillar: 'ruin_pillar',
  ribs: 'bones_ribs',
  femur: 'bones_femur',
  skull: 'bones_skull',
  coin: 'coin',
} as const;

export const enemyFrames = {
  wraith: ['enemy_wraith_0', 'enemy_wraith_1'],
  shade: ['enemy_shade_0', 'enemy_shade_1'],
  husk: ['enemy_husk_0', 'enemy_husk_1'],
};

export const heroWalkFrames = ['hero_walk0', 'hero_walk1', 'hero_walk2', 'hero_walk3'];

export const walkFrames = ['player_walk0', 'player_walk1', 'player_walk2', 'player_walk3'];

export const fairyFrames = {
  fire: ['fairy_fire_0', 'fairy_fire_1'],
  ice: ['fairy_ice_0', 'fairy_ice_1'],
};

type Palette = Record<string, number>;

function fromGrid(scene: Phaser.Scene, key: string, rows: string[], palette: Palette): void {
  const g = scene.make.graphics({}, false);
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const color = palette[ch];
      if (color === undefined) return;
      g.fillStyle(color, 1);
      g.fillRect(x, y, 1, 1);
    });
  });
  g.generateTexture(key, rows[0].length, rows.length);
  g.destroy();
}

// Pads a grid by one cell and fills every empty cell touching a filled one with `ch`, giving sprites a 1px border.
function outlined(rows: string[], ch: string): string[] {
  const w = rows[0].length + 2;
  const filled = (x: number, y: number) => (rows[y - 1]?.[x - 1] ?? '.') !== '.' && rows[y - 1]?.[x - 1] !== undefined;
  const out: string[] = [];
  for (let y = 0; y < rows.length + 2; y++) {
    let line = '';
    for (let x = 0; x < w; x++) {
      if (filled(x, y)) {
        line += rows[y - 1][x - 1];
        continue;
      }
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (filled(x + dx, y + dy)) near = true;
      line += near ? ch : '.';
    }
    out.push(line);
  }
  return out;
}

function softCircle(scene: Phaser.Scene, key: string, size: number, color: number, alpha: number): void {
  const g = scene.make.graphics({}, false);
  const r = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - r, y + 0.5 - r) / r;
      if (d > 1) continue;
      g.fillStyle(color, alpha * (1 - d * d));
      g.fillRect(x, y, 1, 1);
    }
  }
  g.generateTexture(key, size, size);
  g.destroy();
}

function vignette(scene: Phaser.Scene): void {
  const size = 256;
  const tex = scene.textures.createCanvas(Tex.vignette, size, size);
  if (!tex) return;
  const ctx = tex.getContext();
  const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.2, size / 2, size / 2, size * 0.72);
  grad.addColorStop(0, 'rgba(4,3,8,0)');
  grad.addColorStop(0.6, 'rgba(4,3,8,0.55)');
  grad.addColorStop(1, 'rgba(4,3,8,1)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  tex.refresh();
}

let made = false;

export function makePlaceholderArt(scene: Phaser.Scene): void {
  if (made) return;
  made = true;
  // Robed rogue, hood up, cloak in muted wine. Arms are drawn separately by PlayerView.
  const legs = [
    ['...ll..ll...', '...ll..ll...'],
    ['..ll...ll...', '.......ll...'],
    ['...ll..ll...', '...ll..ll...'],
    ['...ll...ll..', '...ll.......'],
  ];
  const playerColors = {
    h: 0x3b3550,
    H: 0x585074,
    f: 0x110e17,
    e: 0xd9c9a8,
    r: 0x2c283d,
    R: 0x3d3754,
    b: 0x8a6440,
    c: 0x5a2a3c,
    l: 0x18151f,
  };
  const torso = [
    '....hhhh....',
    '...hHHHHh...',
    '..hHhhhhHh..',
    '..hhffffhh..',
    '..hhfeefhh..',
    '..chhffhhc..',
    '.ccrrRRrrcc.',
    '.ccrRRRRrcc.',
    'cccrrRRrrccc',
    'cccrbbbbrccc',
    'cc.rrrrrr.cc',
    'cc.rrRrrr.cc',
    'c..rrRrrr..c',
    '...rrRrrr...',
    '..rrrRrrrr..',
    '..rrrrrrrr..',
  ];
  fromGrid(scene, Tex.player, [...torso, ...legs[0]], playerColors);
  walkFrames.forEach((key, i) => fromGrid(scene, key, [...torso, ...legs[i]], playerColors));

  // The hero: a black helm with two glowing purple eyes, purple sleeves, a white tabard over a thick black belt.
  // Same 12x18 footprint and arm anchors as the shade, so hitbox and animation are unchanged.
  const heroColors = {
    k: 0x0b0910,
    K: 0x1c1826,
    p: 0x9a50ff,
    P: 0xf0e0ff,
    s: 0x6a3ab0,
    S: 0x8a58d8,
    w: 0xe9e9f0,
    W: 0xb4b4c6,
    e: 0x5a2a9a,
    b: 0x07070a,
    B: 0x9a50ff,
    l: 0x18151f,
  };
  const heroTorso = [
    '...k.kk.k...',
    '..kkkkkkkk..',
    '.kkpPkkPpkk.',
    '.kkppkkppkk.',
    '.kkkkkkkkkk.',
    '..kkkkkkkk..',
    '...kwwwwk...',
    '...kwWWwk...',
    '...kweewk...',
    '...kwwwwk...',
    '..kbbBBbbk..',
    '..kbbbbbbk..',
    '..kkkkkkkk..',
    '..kkKkkKkk..',
    '..kkkkkkkk..',
    '..kkKkkKkk..',
  ];
  fromGrid(scene, Tex.hero, [...heroTorso, ...legs[0]], heroColors);
  heroWalkFrames.forEach((key, i) => fromGrid(scene, key, [...heroTorso, ...legs[i]], heroColors));

  fromGrid(
    scene,
    Tex.arrow,
    ['..wdd.......', '.wddkkkdpp..', 'wddkkkkkdpPP', '.wddkkkdpp..', '..wdd.......'],
    { w: 0x4a1a7a, d: 0x2a0a4a, k: 0x07000d, p: 0x7a2fd0, P: 0xe0c8ff },
  );

  fromGrid(
    scene,
    Tex.dummy,
    [
      '...tttt...',
      '..tTTTTt..',
      '..tTttTt..',
      '...tttt...',
      '....pp....',
      'pppppppppp',
      '.tTTTTTTt.',
      '.tTtttTTt.',
      '.tTTTTTTt.',
      '.tTTtTTTt.',
      '..tTTTTt..',
      '....pp....',
      '....pp....',
      '....pp....',
      '...pppp...',
      '..pppppp..',
    ],
    { t: 0x6e5a3c, T: 0x8f7650, p: 0x3e3226 },
  );

  const fairyWings = [
    ['w.....w', 'ww.o.ww', '.wwoww.', '..OoO..', '...O...'],
    ['.......', '.w.o.w.', 'ww.o.ww', '.wOoOw.', '...O...'],
  ];
  const fairyColors = {
    fire: { o: 0xffe9a8, O: 0xff7a20, w: 0xffb060 },
    ice: { o: 0xf2fdff, O: 0x7fd4ff, w: 0xbfeaff },
  };
  for (const kind of ['fire', 'ice'] as const) {
    fairyWings.forEach((rows, i) => fromGrid(scene, fairyFrames[kind][i], rows, fairyColors[kind]));
  }

  // Wraiths share one tattered silhouette with glowing eyes; types only differ in color for now.
  const wraithTop = [
    '....kkkk....',
    '...kKKKKk...',
    '..kKkkkkKk..',
    '..kkEkkEkk..',
    '..kkekkekk..',
    '.kkKkkkkKkk.',
    'kkKkkkkkkKkk',
    'Kk.kkkkkk.kK',
    'k..kKkkKk..k',
    '...kkkkkk...',
    '..kKkkkkKk..',
    '..kkkkkkkk..',
    '.kkKkkkkKkk.',
    '.kkkkkkkkkk.',
  ];
  const wraithHem = [
    ['.k.kk.kk.k..', 'k...k..k...k', '....k.....k.'],
    ['..kk.kk.kk..', '.k..k..k..k.', '.k.....k....'],
  ];
  const wraithColors = {
    wraith: { k: 0x1c1826, K: 0x3a3352, E: 0x9fe8ff, e: 0x3f8fb0, O: 0x8a8a98 },
    shade: { k: 0x154f61, K: 0x1f6e86, E: 0xffe14a, e: 0xb08a10, O: 0x8a8a98 },
    husk: { k: 0x221818, K: 0x4a3030, E: 0xffa040, e: 0xa04a18, O: 0x8a8a98 },
  };
  for (const kind of ['wraith', 'shade'] as const) {
    wraithHem.forEach((hem, i) => fromGrid(scene, enemyFrames[kind][i], outlined([...wraithTop, ...hem], 'O'), wraithColors[kind]));
  }

  huskArt(scene);
  ruinArt(scene);

  const charred = { b: 0x2a2018, B: 0x3d2e22, a: 0x1a1714, e: 0x8a3a1a, o: 0x342820 };
  fromGrid(
    scene,
    Tex.barricade,
    [
      '.b.....b.....b..',
      '.bB...bB....bB..',
      '..bB.bB.b..bB.b.',
      'BBBBBBBBBBBBBBBB',
      'bbbbbbbbbbbbbbbb',
      '...bB.bB..bB....',
      '..bB...bB..bB...',
      '.bB.....bB..bB..',
      'ab.......b...b..',
    ],
    charred,
  );
  fromGrid(
    scene,
    Tex.siege,
    [
      '..........bb......',
      '.........bB.......',
      '........bB........',
      '..ooo..bB.........',
      '.o...obB..........',
      'o..o..oBBBBBBBB...',
      'o.ooo.obbbbbbbbbb.',
      'o..o..o...b....b..',
      '.o...o....b....b..',
      '..ooo.....aaaaaaaa',
      '.......aaaaaaa....',
    ],
    charred,
  );
  fromGrid(
    scene,
    Tex.wreck,
    [
      '.....b..b.....',
      '....bB.bBb....',
      '...bbeBbbeb...',
      '..bBbbbeBbbb..',
      '.abbebbbbbebba',
      'aaabbbbbbbbaaa',
      '.aaaaaaaaaaaa.',
    ],
    charred,
  );
  fromGrid(
    scene,
    Tex.soldier,
    [
      '..........ss..',
      '.hh..rrrrrr.s.',
      'hHHhrRRRRRrr.s',
      '.hh.rrrrrrr...',
      '.....ll..ll...',
    ],
    { h: 0x4a4a52, H: 0x6a6a74, r: 0x3a1c22, R: 0x4a2830, l: 0x1e1a20, s: 0x7a7a88 },
  );
  fromGrid(
    scene,
    Tex.rubble,
    [
      '.......gggg.........',
      '.....ggGGGGgg.......',
      '....gGGGggGGGg..gg..',
      '...gGGgggggGGgggGGg.',
      '..gGgggggggggGggGGGg',
      '.gGggggggggggggggggg',
      '.gggggggggggggggggg.',
      'ggggggggggggggggggg.',
      '.ggggggggggggggggg..',
      '..dddddddddddddd....',
    ],
    { g: 0x2a2830, G: 0x3e3b48, d: 0x15131a },
  );

  fromGrid(scene, Tex.coin, ['.yyyy.', 'yYYYYy', 'yYwwYy', 'yYwYYy', 'yYYYYy', '.yyyy.'], {
    y: 0x2f78e8,
    Y: 0x8fd0ff,
    w: 0xf0faff,
  });

  softCircle(scene, Tex.glow, 32, 0xffffff, 0.9);
  softCircle(scene, Tex.shadow, 16, 0x000000, 0.6);
  softCircle(scene, Tex.smoke, 12, 0x8a8698, 0.9);
  vignette(scene);
}


type Rect = [number, number, number, number];

function paint(scene: Phaser.Scene, key: string, w: number, h: number, draw: (fill: (color: number, ...rects: Rect[]) => void) => void): void {
  const g = scene.make.graphics({}, false);
  draw((color, ...rects) => {
    g.fillStyle(color, 1);
    for (const [x, y, rw, rh] of rects) g.fillRect(x, y, rw, rh);
  });
  g.generateTexture(key, w, h);
  g.destroy();
}

// A hulking rock golem: boulder shoulders and fists, a blocky head with one glowing slit, and stubby legs.
function huskArt(scene: Phaser.Scene): void {
  const O = 0x1c1a17;
  const dark = 0x4a4740;
  const base = 0x6d6a60;
  const mid = 0x85816f;
  const light = 0xa39e8a;
  const crack = 0x2f2c27;
  const eye = 0xffa040;
  enemyFrames.husk.forEach((key, i) => {
    const lift = i; // frame 1 raises one foot for a lumbering step
    paint(scene, key, 30, 34, (fill) => {
      // Outline first (slightly larger shapes), then fill on top.
      fill(O, [8, 2, 14, 10], [6, 9, 18, 15], [0, 10, 8, 14], [22, 10, 8, 14], [-0, 21, 7, 8], [23, 21, 7, 8], [6, 22, 7, 11 - lift], [17, 22, 7, 11 - (1 - lift)]);
      // Legs and feet.
      fill(dark, [7, 23, 5, 8 - lift], [18, 23, 5, 8 - (1 - lift)]);
      fill(base, [8, 23, 4, 7 - lift], [19, 23, 4, 7 - (1 - lift)]);
      fill(mid, [6, 30 - lift, 7, 3], [17, 30 - (1 - lift), 7, 3]);
      // Torso.
      fill(base, [7, 10, 16, 14]);
      fill(mid, [9, 11, 6, 6], [16, 13, 5, 5], [11, 19, 8, 4]);
      fill(light, [9, 11, 3, 2], [16, 13, 3, 1]);
      fill(dark, [7, 20, 16, 4], [20, 11, 3, 9]);
      // Shoulders and arms.
      fill(base, [1, 10, 7, 7], [22, 10, 7, 7]);
      fill(mid, [2, 10, 4, 3], [23, 10, 4, 3]);
      fill(light, [2, 10, 2, 1], [23, 10, 2, 1]);
      fill(base, [1, 17, 5, 5], [24, 17, 5, 5]);
      fill(dark, [1, 20, 5, 2], [24, 20, 5, 2]);
      // Fists.
      fill(mid, [0, 22, 7, 6], [23, 22, 7, 6]);
      fill(light, [1, 22, 3, 2], [24, 22, 3, 2]);
      fill(dark, [0, 26, 7, 2], [23, 26, 7, 2]);
      // Head.
      fill(base, [9, 3, 12, 8]);
      fill(mid, [10, 3, 5, 3]);
      fill(dark, [9, 9, 12, 2]);
      fill(eye, [11, 6, 8, 2]);
      // Cracks.
      fill(crack, [12, 14, 1, 4], [13, 17, 3, 1], [19, 21, 1, 3], [4, 12, 1, 3], [26, 13, 1, 3]);
    });
  });
}

// Ruined walls and pillars for stage 2's road, and bones for the burial ground beyond.
function ruinArt(scene: Phaser.Scene): void {
  const mortar = 0x2a2420;
  const brick = [0x5a4a40, 0x6a5848, 0x4e403a];
  const chip = 0x7a6a58;
  paint(scene, Tex.wall, 40, 26, (fill) => {
    fill(mortar, [0, 8, 40, 18]);
    // Broken top: uneven courses of bricks.
    const tops = [10, 6, 8, 4, 9, 7, 5, 9];
    tops.forEach((top, i) => fill(mortar, [i * 5, top - 1, 5, 27 - top]));
    for (let row = 0; row < 5; row++) {
      for (let i = 0; i < 8; i++) {
        const y = 4 + row * 4;
        const x = i * 5 + (row % 2 ? 2 : 0);
        if (y < tops[i % 8]) continue;
        fill(brick[(i + row) % 3], [x, y, 4, 3]);
        if ((i * 7 + row * 3) % 5 === 0) fill(chip, [x, y, 2, 1]);
      }
    }
  });
  paint(scene, Tex.pillar, 14, 40, (fill) => {
    fill(mortar, [0, 8, 14, 32], [2, 3, 3, 6], [8, 0, 4, 9]);
    for (let row = 0; row < 8; row++) fill(brick[row % 3], [1, 9 + row * 4, 12, 3]);
    fill(brick[1], [3, 4, 2, 4], [9, 1, 2, 7]);
    fill(chip, [1, 9, 4, 1], [8, 17, 4, 1]);
  });
  const bone = 0xd8d0bc;
  const shade = 0xa89f88;
  const deep = 0x6e6654;
  paint(scene, Tex.femur, 44, 12, (fill) => {
    fill(deep, [3, 3, 38, 7], [0, 0, 8, 12], [36, 0, 8, 12]);
    fill(bone, [4, 3, 36, 5], [1, 1, 6, 5], [1, 7, 6, 4], [37, 1, 6, 5], [37, 7, 6, 4]);
    fill(shade, [4, 7, 36, 2]);
  });
  paint(scene, Tex.skull, 30, 28, (fill) => {
    fill(deep, [3, 0, 24, 18], [0, 6, 30, 10], [7, 16, 16, 12]);
    fill(bone, [4, 1, 22, 15], [1, 7, 28, 8], [8, 17, 14, 9]);
    fill(shade, [1, 13, 28, 3], [8, 22, 14, 3]);
    fill(0x15110d, [6, 8, 7, 6], [17, 8, 7, 6], [14, 14, 2, 3], [9, 22, 2, 5], [13, 22, 2, 5], [17, 22, 2, 5], [21, 22, 1, 5]);
  });
  paint(scene, Tex.ribs, 50, 34, (fill) => {
    fill(deep, [2, 28, 46, 6]);
    fill(bone, [3, 29, 44, 3]);
    // Five pairs of ribs, curving up and over from the spine.
    for (let i = 0; i < 5; i++) {
      const x = 5 + i * 9;
      fill(deep, [x - 1, 4 + Math.abs(2 - i) * 2, 6, 25]);
      fill(bone, [x, 6 + Math.abs(2 - i) * 2, 2, 23], [x + 1, 5 + Math.abs(2 - i) * 2, 3, 3], [x + 2, 8 + Math.abs(2 - i) * 2, 1, 20]);
      fill(shade, [x + 3, 9 + Math.abs(2 - i) * 2, 1, 19]);
    }
  });
}
