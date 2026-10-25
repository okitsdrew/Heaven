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
} as const;

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

function bow(scene: Phaser.Scene): void {
  // Drawn pointing right (rotation 0 = aiming along +x), limbs bulging toward the aim.
  const h = 26;
  const g = scene.make.graphics({}, false);
  for (let i = 0; i < h; i++) {
    const t = i / (h - 1);
    const bulge = Math.round(Math.sin(Math.PI * t) * 4);
    g.fillStyle(i === 0 || i === h - 1 ? 0xc9a36a : 0x7a5434, 1);
    g.fillRect(1 + bulge, i, 2, 1);
  }
  g.fillStyle(0xd8d0c0, 0.8);
  g.fillRect(1, 1, 1, h - 2);
  g.fillStyle(0xa07850, 1);
  g.fillRect(4, Math.floor(h / 2) - 2, 2, 4);
  g.generateTexture(Tex.bow, 7, h);
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
  // Robed rogue, hood up, cloak in muted wine.
  fromGrid(
    scene,
    Tex.player,
    [
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
      '...ll..ll...',
      '...ll..ll...',
    ],
    {
      h: 0x3b3550,
      H: 0x585074,
      f: 0x110e17,
      e: 0xd9c9a8,
      r: 0x2c283d,
      R: 0x3d3754,
      b: 0x8a6440,
      c: 0x5a2a3c,
      l: 0x18151f,
    },
  );

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

  softCircle(scene, Tex.shadow, 16, 0x000000, 0.6);
  softCircle(scene, Tex.smoke, 12, 0x8a8698, 0.9);
  bow(scene);
  vignette(scene);
}
