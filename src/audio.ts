import { cfg } from './config';

// Every sound is synthesised with the Web Audio API, so there are no sound files to ship. Gameplay asks for a
// sound by name; this module decides how loud it is, whether it is too busy to play, and how it is routed.
// Replacing a synth with a recorded sample later only means changing that entry in `defs`.

export type Cat = 'bow' | 'impact' | 'move' | 'skills' | 'voice' | 'enemies' | 'world' | 'ui' | 'ambience';

export interface PlayOpts {
  vol?: number;
  // -1 (left) to 1 (right).
  pan?: number;
  pitch?: number;
  // Length in seconds for sounds that stretch to fit an animation (a windup, a dive).
  dur?: number;
}

interface Voice {
  c: AudioContext;
  out: AudioNode;
  t: number;
  p: number;
  dur: number;
}

interface Def {
  cat: Cat;
  vol?: number;
  // Minimum seconds between two plays; extra requests are dropped.
  gap?: number;
  // Quieter the more of these are being asked for at once.
  crowd?: boolean;
  // Share sent to the echo.
  wet?: number;
  // Random pitch wobble so repeats do not sound machined.
  jitter?: number;
  len: number;
  play(v: Voice): void;
}

let c: AudioContext | null = null;
let master: GainNode;
let echo: ConvolverNode;
let noiseBuf: AudioBuffer;
const last: Record<string, number> = {};
const heat: Record<string, { v: number; at: number }> = {};
let live: number[] = [];
const MAX_VOICES = 64;

// --- Building blocks ------------------------------------------------------------------------------------

interface ToneOpts {
  type?: OscillatorType;
  f: number;
  to?: number;
  at?: number;
  dur: number;
  vol: number;
  atk?: number;
  // Shape of the pitch slide: exponential by default.
  vib?: [number, number];
}

function tone(v: Voice, o: ToneOpts): void {
  const { c, out, t } = v;
  const at = t + (o.at ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.f * v.p, at);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to * v.p), at + o.dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(o.vol, at + (o.atk ?? 0.004));
  g.gain.exponentialRampToValueAtTime(0.0001, at + o.dur);
  osc.connect(g).connect(out);
  if (o.vib) {
    const lfo = c.createOscillator();
    const depth = c.createGain();
    lfo.frequency.value = o.vib[0];
    depth.gain.value = o.vib[1];
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(at);
    lfo.stop(at + o.dur + 0.05);
  }
  osc.start(at);
  osc.stop(at + o.dur + 0.05);
}

interface NoiseOpts {
  type?: BiquadFilterType;
  f: number;
  to?: number;
  q?: number;
  at?: number;
  dur: number;
  vol: number;
  atk?: number;
}

function noise(v: Voice, o: NoiseOpts): void {
  const { c, out, t } = v;
  const at = t + (o.at ?? 0);
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const filter = c.createBiquadFilter();
  filter.type = o.type ?? 'bandpass';
  filter.frequency.setValueAtTime(o.f * v.p, at);
  if (o.to) filter.frequency.exponentialRampToValueAtTime(Math.max(20, o.to * v.p), at + o.dur);
  filter.Q.value = o.q ?? 0.8;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(o.vol, at + (o.atk ?? 0.004));
  g.gain.exponentialRampToValueAtTime(0.0001, at + o.dur);
  src.connect(filter).connect(g).connect(out);
  src.start(at, Math.random() * 1.5);
  src.stop(at + o.dur + 0.05);
}

// Notes of a minor chord, as frequencies.
const A3 = 220;
const note = (semis: number, base = A3) => base * Math.pow(2, semis / 12);


// One meep. `len` stretches it, and the voice's pitch sets how high it is.
function meep(v: Voice, at: number, len = 1): void {
  const { c, out, p } = v;
  const t = v.t + at;
  const osc = c.createOscillator();
  const g = c.createGain();
  const body = c.createBiquadFilter();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(620 * p, t);
  osc.frequency.exponentialRampToValueAtTime(1150 * p, t + 0.07 * len);
  osc.frequency.exponentialRampToValueAtTime(880 * p, t + 0.17 * len);
  body.type = 'bandpass';
  body.frequency.value = 1700 * p;
  body.Q.value = 1.4;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5, t + 0.015);
  g.gain.setValueAtTime(0.5, t + 0.09 * len);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.19 * len);
  const lfo = c.createOscillator();
  const depth = c.createGain();
  lfo.frequency.value = 30;
  depth.gain.value = 26 * p;
  lfo.connect(depth).connect(osc.frequency);
  osc.connect(body).connect(g).connect(out);
  lfo.start(t);
  osc.start(t);
  lfo.stop(t + 0.22 * len);
  osc.stop(t + 0.22 * len);
  tone({ ...v, t }, { f: 1240, to: 1760, dur: 0.1 * len, vol: 0.05, at: 0.01 });
}

// A blast made of noise rather than a thump: a bright crack, a roaring body that darkens, a long low tail
// and debris falling afterwards. `size` stretches the whole thing; `dark` muffles it for far-off blasts.
function explosion(v: Voice, size = 1, dark = 1, power = 1): void {
  noise(v, { type: 'highpass', f: 900 * dark, dur: 0.07, vol: 0.5 * power, atk: 0.001 });
  noise(v, { type: 'lowpass', f: 4200 * dark, to: 140, q: 0.4, dur: 0.9 * size, vol: 0.8 * power, atk: 0.002 });
  noise(v, { f: 1100 * dark, to: 180, q: 0.5, dur: 0.55 * size, vol: 0.6 * power, atk: 0.004 });
  noise(v, { type: 'lowpass', f: 320 * dark, to: 45, q: 0.6, dur: 2 * size, vol: 0.6 * power, atk: 0.06 });
  tone(v, { f: 60, to: 30, dur: 1.2 * size, vol: 0.18 * power, atk: 0.03 });
  const bits = Math.round(10 * size);
  for (let i = 0; i < bits; i++) {
    noise(v, { f: (1500 + Math.random() * 3500) * dark, q: 1.2, dur: 0.03 + Math.random() * 0.05, vol: (0.06 + Math.random() * 0.1) * power, at: 0.15 + Math.random() * 1.4 * size, atk: 0.002 });
  }
}

// --- The sounds -----------------------------------------------------------------------------------------

const defs = {
  // Player
  bow: {
    cat: 'bow', vol: 0.8, gap: 0.03, jitter: 0.1, len: 0.2,
    play(v) {
      tone(v, { type: 'triangle', f: 380, to: 150, dur: 0.1, vol: 0.2 });
      tone(v, { f: 110, to: 60, dur: 0.07, vol: 0.12 });
      noise(v, { f: 3200, to: 900, q: 1, dur: 0.07, vol: 0.09 });
    },
  },
  arrowHit: {
    cat: 'impact', vol: 1, gap: 0.045, crowd: true, jitter: 0.15, len: 0.15,
    play(v) {
      noise(v, { type: 'lowpass', f: 2200, to: 400, dur: 0.06, vol: 0.2 });
      tone(v, { f: 190, to: 85, dur: 0.07, vol: 0.18 });
    },
  },
  // A skill landing on someone: meatier than an arrow, and still thinned out when many are hit together.
  hurt: {
    cat: 'impact', vol: 1.1, gap: 0.03, crowd: true, jitter: 0.2, len: 0.2,
    play(v) {
      noise(v, { f: 1900, to: 500, q: 0.8, dur: 0.09, vol: 0.3 });
      tone(v, { f: 210, to: 75, dur: 0.1, vol: 0.28 });
      noise(v, { type: 'highpass', f: 3500, dur: 0.025, vol: 0.1 });
    },
  },
  arrowBlock: {
    cat: 'impact', vol: 0.5, gap: 0.08, crowd: true, jitter: 0.1, len: 0.2,
    play(v) {
      tone(v, { f: 1700, dur: 0.1, vol: 0.08 });
      noise(v, { type: 'highpass', f: 4500, dur: 0.03, vol: 0.06 });
    },
  },
  dash: {
    cat: 'move', vol: 1.6, gap: 0.08, jitter: 0.08, len: 0.25,
    play(v) {
      noise(v, { f: 350, to: 2400, q: 1.2, dur: 0.13, vol: 0.2, atk: 0.03 });
      tone(v, { f: 160, to: 70, dur: 0.1, vol: 0.08 });
    },
  },
  teleport: {
    cat: 'move', vol: 0.8, gap: 0.06, jitter: 0.1, wet: 0.2, len: 0.25,
    play(v) {
      // A quick rising blink, then a small dip as the air closes behind him.
      tone(v, { type: 'triangle', f: 260, to: 1900, dur: 0.07, vol: 0.14, atk: 0.008 });
      tone(v, { f: 130, to: 520, dur: 0.07, vol: 0.12 });
      noise(v, { f: 700, to: 6000, q: 2, dur: 0.08, vol: 0.12, atk: 0.01 });
      tone(v, { f: 1500, to: 380, dur: 0.1, vol: 0.07, at: 0.06 });
    },
  },
  teleportArrive: {
    cat: 'move', vol: 0.6, gap: 0.06, jitter: 0.1, wet: 0.15, len: 0.2,
    play(v) {
      tone(v, { f: 140, to: 300, dur: 0.07, vol: 0.1 });
      noise(v, { type: 'lowpass', f: 900, to: 200, dur: 0.1, vol: 0.12 });
    },
  },
  stepField: {
    cat: 'move', vol: 0.55, gap: 0.12, jitter: 0.2, len: 0.15,
    play(v) {
      noise(v, { type: 'lowpass', f: 600, to: 250, dur: 0.06, vol: 0.12 });
      tone(v, { f: 95, to: 55, dur: 0.07, vol: 0.1 });
    },
  },
  // Footsteps in the hub carry a long echo, like a stone hall.
  stepStone: {
    cat: 'move', vol: 0.7, gap: 0.12, jitter: 0.15, wet: 1.1, len: 0.3,
    play(v) {
      noise(v, { f: 1300, to: 600, q: 1.5, dur: 0.035, vol: 0.14 });
      noise(v, { type: 'lowpass', f: 500, dur: 0.07, vol: 0.12 });
      tone(v, { f: 130, to: 65, dur: 0.09, vol: 0.12 });
    },
  },
  // The cute one.
  meep: {
    cat: 'voice', vol: 0.9, jitter: 0.07, len: 0.3, gap: 0.15,
    play(v) {
      meep(v, 0);
    },
  },
  gold: {
    cat: 'world', vol: 0.6, gap: 0.05, crowd: true, jitter: 0.12, len: 0.3,
    play(v) {
      tone(v, { f: 1180, dur: 0.14, vol: 0.09 });
      tone(v, { f: 1770, dur: 0.1, vol: 0.04, at: 0.02 });
    },
  },
  levelUp: {
    cat: 'world', vol: 0.9, wet: 0.35, len: 1.4,
    play(v) {
      [0, 3, 7, 12].forEach((s, i) => tone(v, { type: 'triangle', f: note(s, 330), dur: 0.7, vol: 0.18, at: i * 0.09, atk: 0.01 }));
      tone(v, { f: 110, to: 82, dur: 0.6, vol: 0.2 });
    },
  },
  toast: {
    cat: 'ui', vol: 0.8, gap: 0.4, wet: 0.3, len: 1,
    play(v) {
      tone(v, { f: 523, dur: 0.7, vol: 0.08 });
      tone(v, { f: 784, dur: 0.6, vol: 0.05, at: 0.05 });
    },
  },
  click: {
    cat: 'ui', vol: 0.8, gap: 0.03, len: 0.1,
    play(v) {
      tone(v, { f: 520, to: 380, dur: 0.04, vol: 0.12 });
      noise(v, { type: 'highpass', f: 3500, dur: 0.02, vol: 0.05 });
    },
  },
  // Three meeps, each longer and deeper than the last.
  playerDeath: {
    cat: 'voice', vol: 1, wet: 0.35, len: 2,
    play(v) {
      meep({ ...v, p: v.p * 0.9 }, 0, 1.5);
      meep({ ...v, p: v.p * 0.72 }, 0.4, 1.5);
      meep({ ...v, p: v.p * 0.55 }, 0.8, 1.5);
    },
  },
  timeUp: {
    cat: 'world', vol: 0.9, wet: 0.7, len: 3,
    play(v) {
      tone(v, { f: 98, dur: 2.4, vol: 0.3, atk: 0.02 });
      tone(v, { f: 147, dur: 2, vol: 0.12, atk: 0.02 });
      tone(v, { f: 392, dur: 1.4, vol: 0.05, atk: 0.02 });
    },
  },

  // Enemies
  enemyDie: {
    cat: 'enemies', vol: 0.7, gap: 0.04, crowd: true, jitter: 0.2, len: 0.25,
    play(v) {
      noise(v, { type: 'lowpass', f: 1500, to: 200, dur: 0.13, vol: 0.16 });
      tone(v, { f: 220, to: 70, dur: 0.1, vol: 0.1 });
    },
  },
  // Poison and burn ticking: kept barely there however many things are burning.
  dotTick: {
    cat: 'enemies', vol: 0.35, gap: 0.14, crowd: true, jitter: 0.3, len: 0.1,
    play(v) {
      tone(v, { f: 260, to: 620, dur: 0.045, vol: 0.07 });
    },
  },
  soulFeed: {
    cat: 'world', vol: 0.5, gap: 0.09, crowd: true, jitter: 0.2, wet: 0.3, len: 0.4,
    play(v) {
      tone(v, { f: 700, to: 1500, dur: 0.2, vol: 0.06 });
      tone(v, { f: 1050, to: 2200, dur: 0.2, vol: 0.03 });
    },
  },

  // Skills
  castFire: {
    cat: 'skills', vol: 0.9, wet: 0.15, len: 0.9,
    play(v) {
      noise(v, { f: 250, to: 1400, q: 0.7, dur: 0.5, vol: 0.28, atk: 0.12 });
      tone(v, { type: 'sawtooth', f: 90, to: 55, dur: 0.5, vol: 0.1 });
      noise(v, { type: 'highpass', f: 4000, dur: 0.35, vol: 0.05, at: 0.1 });
    },
  },
  castIce: {
    cat: 'skills', vol: 0.8, wet: 0.35, len: 1,
    play(v) {
      [0, 7, 12, 19].forEach((s, i) => tone(v, { f: note(s, 880), dur: 0.5, vol: 0.05, at: i * 0.05 }));
      noise(v, { type: 'highpass', f: 6500, dur: 0.4, vol: 0.07, atk: 0.05 });
      tone(v, { f: 110, to: 70, dur: 0.4, vol: 0.12 });
    },
  },
  slash: {
    cat: 'skills', vol: 0.85, gap: 0.06, jitter: 0.1, len: 0.35,
    play(v) {
      noise(v, { f: 500, to: 3200, q: 1, dur: 0.2, vol: 0.28, atk: 0.04 });
      tone(v, { f: 180, to: 80, dur: 0.15, vol: 0.12 });
    },
  },
  slam: {
    cat: 'skills', vol: 1, wet: 0.2, len: 0.9,
    play(v) {
      noise(v, { f: 500, to: 3000, q: 1, dur: 0.14, vol: 0.2, atk: 0.03 });
      tone(v, { f: 110, to: 32, dur: 0.6, vol: 0.55, at: 0.1 });
      noise(v, { type: 'lowpass', f: 1400, to: 100, dur: 0.5, vol: 0.4, at: 0.1 });
    },
  },
  doomCharge: {
    cat: 'skills', vol: 0.8, wet: 0.2, len: 4,
    play(v) {
      const d = v.dur;
      tone(v, { type: 'sawtooth', f: 50, to: 320, dur: d, vol: 0.18, atk: d * 0.8 });
      noise(v, { f: 200, to: 3000, q: 1, dur: d, vol: 0.22, atk: d * 0.85 });
      tone(v, { f: 800, to: 2400, dur: d, vol: 0.04, atk: d * 0.9 });
    },
  },
  doomBoom: {
    cat: 'skills', vol: 1, wet: 0.35, gap: 0.15, len: 3.2,
    play(v) {
      explosion(v, 1.5);
    },
  },
  aegisRaise: {
    cat: 'skills', vol: 0.8, wet: 0.4, len: 1.2,
    play(v) {
      [0, 7, 12, 16].forEach((s, i) => tone(v, { type: 'triangle', f: note(s, 440), dur: 0.8, vol: 0.07, atk: 0.12, at: i * 0.04 }));
      noise(v, { type: 'highpass', f: 5000, dur: 0.3, vol: 0.04, atk: 0.1 });
    },
  },
  // A sword parry: a bright steel strike, a ring that hangs, and a scrape along the blade.
  aegisBlock: {
    cat: 'skills', vol: 1, wet: 0.3, jitter: 0.05, len: 1.4,
    play(v) {
      noise(v, { type: 'highpass', f: 3500, dur: 0.06, vol: 0.5, atk: 0.001 });
      [1850, 2790, 4210, 5630, 7400].forEach((f, i) => tone(v, { f, dur: 0.9 - i * 0.12, vol: 0.2 / (i + 1) ** 0.6, atk: 0.001 }));
      tone(v, { f: 1850, dur: 0.5, vol: 0.1, at: 0.09, atk: 0.001 });
      noise(v, { type: 'bandpass', f: 3000, to: 9000, q: 2, dur: 0.16, vol: 0.2, at: 0.02, atk: 0.01 });
      tone(v, { f: 220, to: 120, dur: 0.12, vol: 0.14 });
    },
  },
  lotusThrow: {
    cat: 'skills', vol: 0.7, len: 0.4,
    play(v) {
      noise(v, { f: 700, to: 1800, dur: 0.2, vol: 0.12, atk: 0.04 });
      tone(v, { f: 300, to: 700, dur: 0.18, vol: 0.06 });
    },
  },
  lotusPlant: {
    cat: 'skills', vol: 0.8, wet: 0.2, len: 0.6,
    play(v) {
      tone(v, { f: 180, to: 520, dur: 0.12, vol: 0.2 });
      tone(v, { f: 260, to: 90, dur: 0.2, vol: 0.2, at: 0.1 });
      noise(v, { type: 'lowpass', f: 900, dur: 0.18, vol: 0.14 });
    },
  },
  lotusBloom: {
    cat: 'skills', vol: 0.9, wet: 0.3, len: 1.2,
    play(v) {
      noise(v, { type: 'lowpass', f: 1200, to: 150, dur: 0.6, vol: 0.4 });
      tone(v, { f: 120, to: 50, dur: 0.5, vol: 0.3 });
      [0, 4, 7, 11].forEach((s, i) => tone(v, { f: note(s, 660), dur: 0.5, vol: 0.04, at: 0.05 + i * 0.05 }));
    },
  },
  lotusPulse: {
    cat: 'skills', vol: 0.6, gap: 0.15, wet: 0.2, len: 0.4,
    play(v) {
      tone(v, { f: 160, to: 90, dur: 0.2, vol: 0.18 });
      noise(v, { type: 'lowpass', f: 700, dur: 0.15, vol: 0.1 });
    },
  },

  // Bosses and set pieces
  dive: {
    cat: 'world', vol: 0.8, len: 4,
    play(v) {
      noise(v, { f: 2800, to: 200, q: 0.8, dur: v.dur, vol: 0.3, atk: v.dur * 0.5 });
      tone(v, { f: 900, to: 90, dur: v.dur, vol: 0.12, atk: v.dur * 0.6 });
    },
  },
  landing: {
    cat: 'world', vol: 1, wet: 0.3, gap: 0.3, len: 2.6,
    play(v) {
      explosion(v, 1.1, 0.85);
    },
  },
  waveCast: {
    cat: 'world', vol: 1, wet: 0.5, len: 5,
    play(v) {
      tone(v, { f: 60, to: 30, dur: 3, vol: 0.55, atk: 0.1 });
      noise(v, { type: 'lowpass', f: 300, to: 1600, dur: 1.4, vol: 0.4, atk: 0.8 });
      noise(v, { type: 'lowpass', f: 1600, to: 80, dur: 2.6, vol: 0.3, at: 1.4 });
    },
  },
  bossSpawn: {
    cat: 'world', vol: 1, wet: 0.5, len: 4,
    play(v) {
      tone(v, { type: 'sawtooth', f: 48, to: 70, dur: 3, vol: 0.28, atk: 1.2 });
      tone(v, { f: 36, dur: 3, vol: 0.5, atk: 1 });
      tone(v, { type: 'sawtooth', f: 51, to: 74, dur: 3, vol: 0.2, atk: 1.2 });
    },
  },
  bossWindup: {
    cat: 'skills', vol: 0.7, wet: 0.3, len: 3,
    play(v) {
      tone(v, { type: 'sawtooth', f: 120, to: 520, dur: v.dur, vol: 0.1, atk: v.dur * 0.8 });
      noise(v, { f: 300, to: 2000, q: 1, dur: v.dur, vol: 0.14, atk: v.dur * 0.85 });
    },
  },
  bossSlash: {
    cat: 'skills', vol: 1, wet: 0.25, len: 1,
    play(v) {
      noise(v, { f: 400, to: 3000, dur: 0.2, vol: 0.3, atk: 0.03 });
      tone(v, { f: 100, to: 30, dur: 0.6, vol: 0.5, at: 0.1 });
      noise(v, { type: 'lowpass', f: 1200, to: 100, dur: 0.5, vol: 0.3, at: 0.1 });
    },
  },
  bossBlast: {
    cat: 'skills', vol: 1, wet: 0.5, len: 4,
    play(v) {
      explosion(v, 2, 0.8, 1.1);
    },
  },
  bossDeath: {
    cat: 'world', vol: 1, wet: 0.6, len: 4,
    play(v) {
      tone(v, { type: 'sawtooth', f: 180, to: 30, dur: 2.2, vol: 0.25 });
      tone(v, { f: 60, to: 20, dur: 2, vol: 0.7 });
      noise(v, { type: 'lowpass', f: 2200, to: 80, dur: 2.4, vol: 0.5 });
    },
  },
  caveEnter: {
    cat: 'world', vol: 0.8, wet: 0.7, len: 2,
    play(v) {
      tone(v, { f: 70, to: 140, dur: 1.2, vol: 0.3, atk: 0.4 });
      noise(v, { type: 'lowpass', f: 400, to: 1200, dur: 1.2, vol: 0.2, atk: 0.5 });
    },
  },

  // Menus
  menuOpen: {
    cat: 'ui', vol: 0.8, gap: 0.2, wet: 0.35, len: 0.7,
    play(v) {
      noise(v, { f: 300, to: 1100, q: 1, dur: 0.25, vol: 0.09, atk: 0.1 });
      [0, 7].forEach((s, i) => tone(v, { type: 'triangle', f: note(s, 196), dur: 0.5, vol: 0.09, atk: 0.06, at: i * 0.05 }));
    },
  },
  buy: {
    cat: 'ui', vol: 0.9, wet: 0.25, len: 0.8,
    play(v) {
      tone(v, { type: 'triangle', f: 523, dur: 0.25, vol: 0.16 });
      tone(v, { type: 'triangle', f: 784, dur: 0.4, vol: 0.16, at: 0.07 });
      tone(v, { f: 1568, dur: 0.3, vol: 0.05, at: 0.09 });
      noise(v, { type: 'highpass', f: 5000, dur: 0.04, vol: 0.06, at: 0.07 });
    },
  },
  refund: {
    cat: 'ui', vol: 0.9, wet: 0.25, len: 0.8,
    play(v) {
      tone(v, { type: 'triangle', f: 784, dur: 0.22, vol: 0.14 });
      tone(v, { type: 'triangle', f: 523, dur: 0.3, vol: 0.14, at: 0.08 });
      tone(v, { f: 330, to: 200, dur: 0.3, vol: 0.1, at: 0.14 });
    },
  },
  equip: {
    cat: 'ui', vol: 0.9, wet: 0.15, len: 0.4,
    play(v) {
      noise(v, { f: 1800, q: 2, dur: 0.03, vol: 0.14, atk: 0.001 });
      tone(v, { f: 330, to: 300, dur: 0.1, vol: 0.14 });
      tone(v, { f: 880, dur: 0.18, vol: 0.07, at: 0.03 });
    },
  },
  deny: {
    cat: 'ui', vol: 0.8, gap: 0.12, len: 0.3,
    play(v) {
      tone(v, { type: 'triangle', f: 150, to: 95, dur: 0.14, vol: 0.2 });
      noise(v, { type: 'lowpass', f: 500, dur: 0.06, vol: 0.1 });
    },
  },

  // The hub
  warDistant: {
    cat: 'ambience', vol: 0.5, wet: 0.7, jitter: 0.25, len: 2.5,
    play(v) {
      const d = 0.5 + Math.random() * 0.9;
      noise(v, { type: 'lowpass', f: 420, to: 90, q: 0.5, dur: d, vol: 0.5, atk: 0.02 });
      tone(v, { f: 62, to: 38, dur: d * 0.8, vol: 0.35 });
    },
  },
  warClang: {
    cat: 'ambience', vol: 0.18, wet: 0.9, jitter: 0.35, len: 1.5,
    play(v) {
      const f = 900 + Math.random() * 700;
      tone(v, { f, dur: 0.5, vol: 0.12 });
      tone(v, { f: f * 1.51, dur: 0.35, vol: 0.07 });
      noise(v, { type: 'highpass', f: 2500, dur: 0.03, vol: 0.1 });
    },
  },
  // The loud one, played alongside the screen shake.
  warCrash: {
    cat: 'ambience', vol: 0.9, wet: 0.8, len: 3.5,
    play(v) {
      explosion(v, 1.2, 0.35, 0.8);
    },
  },
  // One fire pop: a short cluster of crisp snaps with a little body, never a plain click.
  crackle: {
    cat: 'ambience', vol: 0.5, jitter: 0.4, len: 0.4,
    play(v) {
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const at = i * (0.012 + Math.random() * 0.03);
        const dur = 0.015 + Math.random() * 0.05;
        noise(v, { f: 1400 + Math.random() * 2800, to: 500, q: 0.6, dur, vol: 0.25 + Math.random() * 0.3, at, atk: 0.002 });
        noise(v, { type: 'lowpass', f: 900, dur: dur * 2, vol: 0.12, at, atk: 0.003 });
      }
      if (Math.random() < 0.18) {
        noise(v, { type: 'highpass', f: 2500, dur: 0.012, vol: 0.4, atk: 0.0008 });
        noise(v, { type: 'lowpass', f: 700, to: 250, dur: 0.08, vol: 0.25 });
      }
    },
  },
  rockDrop: {
    cat: 'world', vol: 1, wet: 0.7, len: 3,
    play(v) {
      explosion(v, 0.9, 0.5);
    },
  },
  // A tick of crayon on paper while a letter is being drawn.
  scribble: {
    cat: 'ui', vol: 0.6, gap: 0.05, jitter: 0.25, len: 0.1,
    play(v) {
      noise(v, { f: 3200, to: 1800, q: 1.5, dur: 0.04, vol: 0.12, atk: 0.006 });
    },
  },
  bookBeat: {
    cat: 'ambience', vol: 0.9, wet: 0.5, len: 0.6,
    play(v) {
      tone(v, { f: 75, to: 40, dur: 0.25, vol: 0.5 });
      noise(v, { type: 'lowpass', f: 250, dur: 0.1, vol: 0.12 });
    },
  },
  bookDeny: {
    cat: 'world', vol: 0.8, wet: 0.5, len: 0.8,
    play(v) {
      tone(v, { f: 110, to: 60, dur: 0.3, vol: 0.4 });
      noise(v, { type: 'lowpass', f: 500, dur: 0.15, vol: 0.2 });
    },
  },
  bookOpen: {
    cat: 'ui', vol: 0.8, wet: 0.4, len: 0.8,
    play(v) {
      for (let i = 0; i < 4; i++) noise(v, { f: 2800 + Math.random() * 1500, q: 1, dur: 0.12, vol: 0.07, at: i * 0.07, atk: 0.02 });
      tone(v, { f: 98, dur: 0.5, vol: 0.1, atk: 0.1 });
    },
  },
  eyesOpen: {
    cat: 'world', vol: 0.9, wet: 0.7, len: 3,
    play(v) {
      tone(v, { f: 55, to: 38, dur: 1.6, vol: 0.3, atk: 0.5 });
      noise(v, { f: 180, to: 400, q: 3, dur: 1.4, vol: 0.12, atk: 0.5 });
      tone(v, { type: 'sawtooth', f: 72, to: 66, dur: 1.4, vol: 0.05, atk: 0.6, vib: [5, 2] });
    },
  },
  voidOpen: {
    cat: 'world', vol: 0.9, wet: 0.6, len: 2,
    play(v) {
      tone(v, { f: 45, to: 220, dur: 0.8, vol: 0.35, atk: 0.4 });
      noise(v, { type: 'lowpass', f: 200, to: 1800, dur: 0.8, vol: 0.2, atk: 0.5 });
    },
  },
  door: {
    cat: 'world', vol: 0.8, wet: 0.7, len: 1.4,
    play(v) {
      noise(v, { f: 260, to: 700, q: 4, dur: 0.7, vol: 0.12, atk: 0.2 });
      tone(v, { f: 80, to: 55, dur: 0.4, vol: 0.2, at: 0.5 });
    },
  },
  battleDive: {
    cat: 'world', vol: 0.9, wet: 0.3, len: 3,
    play(v) {
      noise(v, { f: 200, to: 2600, dur: 1.2, vol: 0.35, atk: 0.9 });
      tone(v, { type: 'sawtooth', f: 50, to: 400, dur: 1.2, vol: 0.2, atk: 0.9 });
    },
  },
} satisfies Record<string, Def>;

export type SoundName = keyof typeof defs;
export const soundNames = Object.keys(defs) as SoundName[];

// --- Playing --------------------------------------------------------------------------------------------

function setup(): void {
  if (c) return;
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  c = new Ctx();
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -6;
  comp.knee.value = 12;
  comp.ratio.value = 3;
  comp.attack.value = 0.003;
  comp.release.value = 0.2;
  master = c.createGain();
  master.connect(comp).connect(c.destination);

  noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  // A dim, stony room: noise that fades out quickly and loses its high end.
  const secs = 2.4;
  const ir = c.createBuffer(2, Math.floor(c.sampleRate * secs), c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < d.length; i++) {
      const k = 1 - i / d.length;
      lp += ((Math.random() * 2 - 1) * k ** 3 - lp) * (0.25 + 0.5 * (1 - k));
      d[i] = lp * 2.2;
    }
  }
  echo = c.createConvolver();
  echo.buffer = ir;
  const echoOut = c.createGain();
  echoOut.gain.value = 0.9;
  echo.connect(echoOut).connect(master);
}

// Browsers keep audio locked until the player does something, so the first key or click wakes it.
function unlock(): void {
  setup();
  if (c && c.state !== 'running') void c.resume();
}
for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, unlock, { passive: true });

function heatOf(name: string, now: number): number {
  const h = (heat[name] ??= { v: 0, at: now });
  h.v *= Math.pow(0.5, (now - h.at) / 0.6);
  h.at = now;
  h.v += 1;
  return h.v;
}

export const sfx = {
  play(name: SoundName, o: PlayOpts = {}): void {
    if (!c) return;
    if (c.state !== 'running') {
      void c.resume();
      return;
    }
    const a = cfg.audio;
    const d: Def = defs[name];
    const now = c.currentTime;
    const crowd = heatOf(name, now);
    if (a.muted) return;
    if (d.gap && now - (last[name] ?? -1) < d.gap) return;
    last[name] = now;
    // Sounds have different lengths, so expired ones are dropped from anywhere in the list.
    live = live.filter((end) => end > now);
    // When it gets busy the repeatable background sounds give way first; the big ones always play.
    if (live.length >= MAX_VOICES && (d.crowd || d.cat === 'ambience')) return;
    if (live.length >= MAX_VOICES * 2) return;

    let vol = a.master * a[d.cat] * (d.vol ?? 1) * (o.vol ?? 1);
    if (d.crowd) vol /= 1 + a.crowdSoftening * Math.max(0, crowd - 1) * 0.12;
    if (vol < 0.002) return;
    const out = c.createGain();
    out.gain.value = vol;
    let node: AudioNode = out;
    if (o.pan) {
      const pan = c.createStereoPanner();
      pan.pan.value = Math.max(-1, Math.min(1, o.pan));
      out.connect(pan);
      node = pan;
    }
    node.connect(master);
    const wet = (d.wet ?? 0) * a.echo;
    if (wet > 0.001) {
      const send = c.createGain();
      send.gain.value = wet;
      node.connect(send).connect(echo);
    }
    const jitter = d.jitter ? 1 + (Math.random() * 2 - 1) * d.jitter : 1;
    live.push(now + d.len + 0.1);
    d.play({ c, out, t: now + 0.005, p: (o.pitch ?? 1) * jitter, dur: o.dur ?? 1 });
  },

  // Left/right placement for a spot on the screen, 0 at the centre.
  panAt(screenX: number, width: number): number {
    return Math.max(-0.7, Math.min(0.7, ((screenX / Math.max(1, width)) - 0.5) * 1.4));
  },
};

// --- Ambience -------------------------------------------------------------------------------------------

interface Bed {
  bus: GainNode;
  fire: GainNode;
  stop: (() => void)[];
}

let bed: Bed | null = null;
let bedKind: 'hub' | 'none' = 'none';
let warTimer = 2;
let clangTimer = 4;
let crackleAcc = 0;

function startHubBed(): Bed {
  const ctx = c!;
  const bus = ctx.createGain();
  bus.gain.value = 0;
  bus.connect(master);
  const stop: (() => void)[] = [];
  const keep = (n: AudioScheduledSourceNode) => stop.push(() => n.stop());

  // A low, sour drone: two sines a hair apart so they beat slowly, with a fifth below the surface.
  for (const [f, vol, type] of [[41.2, 0.5, 'sine'], [41.9, 0.4, 'sine'], [61.8, 0.12, 'triangle'], [123.5, 0.025, 'sine']] as const) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = f;
    g.gain.value = vol;
    o.connect(g).connect(bus);
    o.start();
    keep(o);
  }

  // The fighting upstairs: a muffled, surging rumble.
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 150;
  const rg = ctx.createGain();
  rg.gain.value = 0.35;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.13;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0.18;
  lfo.connect(lfoDepth).connect(rg.gain);
  src.connect(lp).connect(rg).connect(bus);
  src.start();
  lfo.start();
  keep(src);
  keep(lfo);

  // A thin draught under the door.
  const wind = ctx.createBufferSource();
  wind.buffer = noiseBuf;
  wind.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 380;
  bp.Q.value = 2.5;
  const wg = ctx.createGain();
  wg.gain.value = 0.025;
  const wl = ctx.createOscillator();
  wl.frequency.value = 0.07;
  const wd = ctx.createGain();
  wd.gain.value = 0.02;
  wl.connect(wd).connect(wg.gain);
  wind.connect(bp).connect(wg).connect(bus);
  wind.start();
  wl.start();
  keep(wind);
  keep(wl);

  // The steady hiss and low roar under the pops of burning wood; it only has a level near flames.
  const burn = ctx.createBufferSource();
  burn.buffer = noiseBuf;
  burn.loop = true;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 900;
  const bl = ctx.createBiquadFilter();
  bl.type = 'lowpass';
  bl.frequency.value = 1800;
  const fire = ctx.createGain();
  fire.gain.value = 0;
  burn.connect(hp).connect(bl).connect(fire).connect(bus);
  burn.start();
  keep(burn);
  return { bus, fire, stop };
}

export const ambience = {
  // Starts or stops the hub's bed of sound. Safe to call before audio is unlocked; it is re-applied on update.
  set(kind: 'hub' | 'none'): void {
    bedKind = kind;
    if (kind === 'none' && bed) {
      const old = bed;
      bed = null;
      if (c) old.bus.gain.setTargetAtTime(0, c.currentTime, 0.25);
      setTimeout(() => old.stop.forEach((s) => s()), 1500);
    }
  },

  // Called every frame by a scene with an ambience: keeps the bed's level live and fires the random events.
  update(dt: number, flames = 0): void {
    if (!c || c.state !== 'running') return;
    if (bedKind === 'hub' && !bed) bed = startHubBed();
    if (!bed) return;
    const a = cfg.audio;
    bed.bus.gain.setTargetAtTime(a.muted ? 0 : a.master * a.ambience * 0.35, c.currentTime, 0.2);
    if (bedKind !== 'hub') return;

    warTimer -= dt;
    if (warTimer <= 0) {
      warTimer = 1.2 + Math.random() * 3.2;
      sfx.play('warDistant', { vol: 0.35 + Math.random() * 0.65, pan: (Math.random() - 0.5) * 1.2 });
    }
    clangTimer -= dt;
    if (clangTimer <= 0) {
      clangTimer = 0.8 + Math.random() * 3.5;
      sfx.play('warClang', { vol: 0.4 + Math.random() * 0.6, pan: (Math.random() - 0.5) * 1.6 });
    }
    bed.fire.gain.setTargetAtTime(flames > 0 ? Math.min(1, flames / 2) * 0.05 * (0.6 + Math.random() * 0.8) : 0, c.currentTime, 0.08);
    crackleAcc += dt * flames * 2.2;
    while (crackleAcc >= 1) {
      crackleAcc -= 1 - Math.random() * 0.6;
      sfx.play('crackle', { vol: 0.4 + Math.random() * 0.8, pan: (Math.random() - 0.5) * 0.8 });
    }
  },
};
