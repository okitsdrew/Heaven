import Phaser from 'phaser';

// Code-drawn placeholder art. Gameplay only refers to these texture keys, so real sprite sheets
// can be loaded under the same keys later without touching gameplay code.
export const Tex = {
  player: 'player',
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
  coin: 'coin',
} as const;

export const enemyFrames = {
  wraith: ['enemy_wraith_0', 'enemy_wraith_1'],
  shade: ['enemy_shade_0', 'enemy_shade_1'],
  husk: ['enemy_husk_0', 'enemy_husk_1'],
};

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

export function makePlaceholderArt(scene: Phaser.Scene): void {
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
    shade: { k: 0x141a2a, K: 0x2e3d5c, E: 0xc9b4ff, e: 0x6a4fb0, O: 0x8a8a98 },
    husk: { k: 0x221818, K: 0x4a3030, E: 0xffa040, e: 0xa04a18, O: 0x8a8a98 },
  };
  for (const kind of ['wraith', 'shade', 'husk'] as const) {
    wraithHem.forEach((hem, i) => fromGrid(scene, enemyFrames[kind][i], outlined([...wraithTop, ...hem], 'O'), wraithColors[kind]));
  }

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
    y: 0xb8821c,
    Y: 0xf2c94a,
    w: 0xfff2b0,
  });

  softCircle(scene, Tex.glow, 32, 0xffffff, 0.9);
  softCircle(scene, Tex.shadow, 16, 0x000000, 0.6);
  softCircle(scene, Tex.smoke, 12, 0x8a8698, 0.9);
  vignette(scene);
}
