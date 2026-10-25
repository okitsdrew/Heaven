import Phaser from 'phaser';

// Code-drawn placeholder art. Gameplay only refers to these texture keys, so real sprite sheets
// can be loaded under the same keys later without touching gameplay code.
export const Tex = {
  player: 'player',
  bow: 'bow',
  arrow: 'arrow',
  shadow: 'shadow',
  dummy: 'dummy',
  smoke: 'smoke',
  vignette: 'vignette',
  glow: 'glow',
} as const;

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

// Ornate silver recurve bow drawn aiming along +x. The string is not part of the texture: PlayerView
// draws it between the tips so it can be pulled. Measurements are in texture pixels.
export const bowArt = { width: 20, height: 36, gripX: 13.5, stringX: 2, halfHeight: 17.5 };

function bow(scene: Phaser.Scene): void {
  const { width, height } = bowArt;
  const dark = 0x3c3850;
  const mid = 0x8a869a;
  const light = 0xc9c6d6;
  const bright = 0xf0ecfa;
  const g = scene.make.graphics({}, false);
  const px = (x: number, y: number, color: number) => {
    g.fillStyle(color, 1);
    g.fillRect(Math.round(x), Math.round(y), 1, 1);
  };
  const center = (t: number) => {
    const k = Math.pow(t, 1.6);
    let x = 13 * (1 - k) + 4 * k;
    if (t > 0.88) x -= (t - 0.88) * 18;
    return x;
  };

  for (let y = 0; y < height; y++) {
    const t = Math.abs((y - 17.5) / 17.5);
    const w = Math.max(1, Math.round(1 + 3 * Math.pow(1 - t, 0.8)));
    const x0 = Math.round(center(t) - w / 2);
    for (let i = 0; i < w; i++) px(x0 + i, y, w === 1 ? mid : i === 0 ? dark : i === w - 1 ? mid : light);
  }

  // Swept barbs on each limb, like the wings on the reference.
  for (const side of [-1, 1]) {
    for (const [t, len] of [
      [0.28, 4],
      [0.52, 3],
      [0.72, 2],
    ] as const) {
      const y = 17.5 + side * t * 17.5;
      const x = center(t) + 2;
      for (let i = 0; i < len; i++) px(x + i, y, i === len - 1 ? bright : light);
      px(x + len - 1, y - side, mid);
    }
  }

  // Riser band with a gem, and the spearhead arrow rest pointing along the aim.
  for (let y = 14; y <= 21; y++) {
    px(11, y, dark);
    px(12, y, y === 14 || y === 21 ? mid : light);
    px(14, y, mid);
    px(15, y, dark);
  }
  px(13, 17, 0xa070ff);
  px(13, 18, 0x6a40c0);
  for (let x = 15; x <= 19; x++) {
    px(x, 17, x === 19 ? bright : light);
    px(x, 18, x === 19 ? mid : mid);
  }
  px(15, 16, mid);
  px(16, 16, light);
  px(15, 19, dark);
  px(16, 19, mid);
  px(17, 16, mid);
  px(17, 19, dark);

  g.generateTexture(Tex.bow, width, height);
  g.destroy();
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
    ['fw........h.', 'ffwwwwwwwhhh', 'fw........h.'],
    { f: 0xb9a9d6, w: 0x8a6a48, h: 0xd8d2c4 },
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

  softCircle(scene, Tex.glow, 32, 0xffffff, 0.9);
  softCircle(scene, Tex.shadow, 16, 0x000000, 0.6);
  softCircle(scene, Tex.smoke, 12, 0x8a8698, 0.9);
  bow(scene);
  vignette(scene);
}
