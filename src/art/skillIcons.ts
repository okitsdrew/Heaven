// Code-drawn icons for the six skills, shared by the in-run HUD (as textures) and the skill book (as images).
// Each is drawn on a 64x64 canvas; swap this file for sprites later without touching anything that uses it.

type Draw = (g: CanvasRenderingContext2D) => void;

const poly = (g: CanvasRenderingContext2D, pts: [number, number][]) => {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
};

const draw: Record<string, Draw> = {
  // A flame with a hot yellow heart.
  fireFairy(g) {
    const flame = (s: number, dy: number) => {
      g.beginPath();
      g.moveTo(32, 5 + dy);
      g.bezierCurveTo(32 + 11 * s, 20 + dy, 32 + 21 * s, 28 + dy, 32 + 18 * s, 42 + dy);
      g.bezierCurveTo(32 + 16 * s, 54 + dy, 32 + 8 * s, 58, 32, 58);
      g.bezierCurveTo(32 - 10 * s, 58, 32 - 18 * s, 52, 32 - 18 * s, 42 + dy);
      g.bezierCurveTo(32 - 18 * s, 34 + dy, 32 - 12 * s, 30 + dy, 32 - 8 * s, 22 + dy);
      g.bezierCurveTo(32 - 6 * s, 28 + dy, 32 - 4 * s, 30 + dy, 32 - 2 * s, 30 + dy);
      g.bezierCurveTo(32 - 4 * s, 20 + dy, 32 - 2 * s, 12 + dy, 32, 5 + dy);
      g.closePath();
    };
    g.shadowColor = '#ff7a20';
    g.shadowBlur = 8;
    const grad = g.createLinearGradient(0, 58, 0, 5);
    grad.addColorStop(0, '#d8280c');
    grad.addColorStop(0.6, '#ff7a20');
    grad.addColorStop(1, '#ffc040');
    g.fillStyle = grad;
    flame(1, 0);
    g.fill();
    g.shadowBlur = 0;
    for (const [k, color] of [[0.58, '#ffe680'], [0.3, '#fffbe0']] as const) {
      g.save();
      g.translate(32, 58);
      g.scale(k, k);
      g.translate(-32, -58);
      g.fillStyle = color;
      flame(1, 0);
      g.fill();
      g.restore();
    }
  },

  // A six-armed snowflake.
  iceFairy(g) {
    g.translate(32, 32);
    g.lineCap = 'round';
    g.shadowColor = '#7fd4ff';
    g.shadowBlur = 8;
    g.strokeStyle = '#bff0ff';
    for (let i = 0; i < 6; i++) {
      g.save();
      g.rotate((i * Math.PI) / 3);
      g.lineWidth = 4.5;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(0, -27);
      g.stroke();
      g.lineWidth = 3.2;
      for (const [d, w] of [[-17, 8], [-10, 5]] as const) {
        g.beginPath();
        g.moveTo(-w, d - w * 0.9);
        g.lineTo(0, d);
        g.lineTo(w, d - w * 0.9);
        g.stroke();
      }
      g.restore();
    }
    g.shadowBlur = 0;
    g.fillStyle = '#ffffff';
    poly(g, [0, 1, 2, 3, 4, 5].map((i) => [Math.cos((i * Math.PI) / 3) * 6, Math.sin((i * Math.PI) / 3) * 6] as [number, number]));
    g.fill();
  },

  // A blade swung diagonally, with the arc of the slash behind it.
  swordSlash(g) {
    g.lineCap = 'round';
    g.shadowColor = '#b070ff';
    g.shadowBlur = 8;
    g.strokeStyle = '#d9b8ff';
    g.lineWidth = 5;
    g.globalAlpha = 0.9;
    g.beginPath();
    g.arc(30, 46, 26, Math.PI * 1.1, Math.PI * 1.9);
    g.stroke();
    g.globalAlpha = 1;
    g.shadowBlur = 0;
    g.translate(33, 31);
    g.rotate(Math.PI / 4);
    const blade = g.createLinearGradient(-5, 0, 5, 0);
    blade.addColorStop(0, '#9a86c8');
    blade.addColorStop(0.5, '#f2eaff');
    blade.addColorStop(1, '#8070b0');
    g.fillStyle = blade;
    poly(g, [[0, -29], [5.5, -18], [5.5, 9], [-5.5, 9], [-5.5, -18]]);
    g.fill();
    g.strokeStyle = '#2a1646';
    g.lineWidth = 1.6;
    g.stroke();
    g.fillStyle = '#b070ff';
    g.fillRect(-13, 9, 26, 5);
    g.strokeRect(-13, 9, 26, 5);
    g.fillStyle = '#3a2260';
    g.fillRect(-2.5, 14, 5, 12);
    g.beginPath();
    g.arc(0, 28, 3.4, 0, Math.PI * 2);
    g.fillStyle = '#b070ff';
    g.fill();
  },

  // An explosion going off inside a glass case.
  doomsday(g) {
    // The glass dome: a bell jar on a base.
    const dome = () => {
      g.beginPath();
      g.moveTo(10, 50);
      g.lineTo(10, 28);
      g.bezierCurveTo(10, 2, 54, 2, 54, 28);
      g.lineTo(54, 50);
      g.closePath();
    };
    g.save();
    dome();
    g.clip();
    const bg = g.createLinearGradient(0, 4, 0, 50);
    bg.addColorStop(0, '#1b2a3a');
    bg.addColorStop(1, '#2a1a1a');
    g.fillStyle = bg;
    g.fillRect(0, 0, 64, 64);
    // The blast, cramped by the glass.
    g.translate(32, 31);
    g.shadowColor = '#ffb020';
    g.shadowBlur = 8;
    const pts: [number, number][] = [];
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? (i % 4 === 0 ? 27 : 22) : 12;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    const grad = g.createRadialGradient(0, 0, 2, 0, 0, 27);
    grad.addColorStop(0, '#fff6c0');
    grad.addColorStop(0.5, '#ffe14a');
    grad.addColorStop(1, '#ff6a20');
    g.fillStyle = grad;
    poly(g, pts);
    g.fill();
    g.shadowBlur = 0;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(0, 0, 6, 0, Math.PI * 2);
    g.fill();
    g.restore();
    // Glass: a pale sheen, a bright rim and a glint.
    g.save();
    dome();
    g.clip();
    const sheen = g.createLinearGradient(10, 0, 54, 0);
    sheen.addColorStop(0, 'rgba(190,230,255,0.38)');
    sheen.addColorStop(0.5, 'rgba(190,230,255,0.06)');
    sheen.addColorStop(1, 'rgba(190,230,255,0.25)');
    g.fillStyle = sheen;
    g.fillRect(0, 0, 64, 64);
    g.restore();
    g.strokeStyle = '#cfeaff';
    g.lineWidth = 2.4;
    dome();
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(17, 30);
    g.bezierCurveTo(17, 18, 22, 12, 29, 9);
    g.stroke();
    g.fillStyle = '#6a7a8a';
    g.fillRect(6, 50, 52, 7);
    g.fillStyle = '#9aaabb';
    g.fillRect(6, 50, 52, 2.5);
    g.strokeStyle = '#1a2230';
    g.lineWidth = 1.5;
    g.strokeRect(6, 50, 52, 7);
  },

  // The shield: black rim, purple field, spiral and a white gem, as in the game.
  aegis(g) {
    // The shield as it looks while active: a glowing yellow halo behind it.
    const halo = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    halo.addColorStop(0, 'rgba(255,255,255,0.95)');
    halo.addColorStop(0.35, 'rgba(255,242,176,0.75)');
    halo.addColorStop(0.7, 'rgba(255,210,26,0.45)');
    halo.addColorStop(1, 'rgba(255,210,26,0)');
    g.fillStyle = halo;
    g.beginPath();
    g.arc(32, 32, 31, 0, Math.PI * 2);
    g.fill();
    g.save();
    g.translate(32, 33);
    g.scale(0.8, 0.8);
    g.translate(-32, -32);
    const pt = (x: number, y: number): [number, number] => [32 + x * 1.05, 32 + y * 1.0];
    const outline = [pt(-18, -22), pt(8, -26), pt(22, -10), pt(16, 12), pt(-2, 28), pt(-20, 16), pt(-24, -6)];
    const inner = [pt(-13, -16), pt(6, -19), pt(16, -8), pt(11, 8), pt(-2, 20), pt(-15, 10), pt(-17, -5)];
    g.shadowColor = '#ffd21a';
    g.shadowBlur = 8;
    g.fillStyle = '#0a0610';
    poly(g, outline);
    g.fill();
    g.shadowBlur = 0;
    g.fillStyle = '#6a35b8';
    poly(g, inner);
    g.fill();
    g.strokeStyle = '#b08cff';
    g.lineWidth = 2.6;
    g.beginPath();
    for (let k = 0; k <= 14; k++) {
      const t = k / 14;
      const a = t * Math.PI * 3;
      const r = 3 + t * 9;
      const [x, y] = pt(Math.cos(a) * r, Math.sin(a) * r);
      if (k) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    g.stroke();
    g.strokeStyle = '#0a0610';
    g.lineWidth = 3;
    poly(g, outline);
    g.stroke();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(...pt(14, -16), 3.6, 0, Math.PI * 2);
    g.fill();
    g.restore();
  },

  // Layered dark purple petals around a sickly green heart.
  lotus(g) {
    g.translate(32, 54);
    g.scale(1.28, 1.28);
    const layers: [number, number, number, number, string][] = [
      [7, 1.7, 30, 7.5, '#3a1458'],
      [6, 1.4, 27, 7.5, '#5a2090'],
      [5, 1.0, 23, 7, '#7a38b8'],
    ];
    g.lineWidth = 1.4;
    g.strokeStyle = '#d0a8ff';
    for (const [n, spread, len, wid, color] of layers) {
      g.fillStyle = color;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i / (n - 1) - 0.5) * spread;
        g.save();
        g.rotate(a + Math.PI / 2);
        g.beginPath();
        g.ellipse(0, -len / 2, wid, len / 2, 0, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.restore();
      }
    }
    g.shadowColor = '#7aff5a';
    g.shadowBlur = 10;
    g.fillStyle = '#b0ff80';
    g.beginPath();
    g.arc(0, -16, 6, 0, Math.PI * 2);
    g.fill();
    g.shadowBlur = 0;
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i / 6 - 0.5) * 2.4;
      g.beginPath();
      g.arc(Math.cos(a) * 11, -16 + Math.sin(a) * 11, 1.5, 0, Math.PI * 2);
      g.fill();
    }
  },
};

const cache = new Map<string, HTMLCanvasElement>();

// The icon for a skill id as a 64x64 canvas, or null if it has none.
export function skillIcon(id: string): HTMLCanvasElement | null {
  const hit = cache.get(id);
  if (hit) return hit;
  const fn = draw[id];
  if (!fn) return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d')!;
  g.lineJoin = 'round';
  fn(g);
  cache.set(id, canvas);
  return canvas;
}

export function skillIconUrl(id: string): string | null {
  return skillIcon(id)?.toDataURL() ?? null;
}

export const skillIconKey = (id: string) => `skillIcon_${id}`;
