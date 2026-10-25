// Every gameplay number lives here. Systems read `cfg` live each frame, so dev menu edits apply instantly.

export const defaults = {
  player: {
    moveSpeed: 300,
    uniformScreenSpeed: true,
    screenSpeedMult: 1,
    accel: 4000,
    hitRadius: 6,
  },
  bow: {
    fireRate: 1,
    damage: 10,
    pierce: 0,
    arrowsPerShot: 1,
    spreadDeg: 8,
    arrowSpeed: 900,
    arrowRange: 400,
    arrowHitRadius: 15,
    muzzleOffset: 16,
    fireWhileDashing: true,
  },
  dash: {
    duration: 0.15,
    distance: 250,
    cooldown: 0.75,
    inputBuffer: 0.12,
    afterimages: 6,
    afterimageFade: 0.3,
  },
  camera: {
    followRate: 12,
    shakeOnHit: 2,
    shakeDecay: 18,
  },
  feel: {
    hitFlashTime: 0.06,
    bowKickTime: 0.08,
    strideLength: 140,
    walkBob: 1.5,
    armReadyTime: 0.6,
    armRaiseTime: 0.12,
    drawTime: 0.3,
    drawDistance: 6,
    damageNumbers: true,
  },
  dummy: {
    hp: 50,
    count: 8,
    ringRadius: 220,
    radius: 12,
    respawnTime: 1,
  },
  render: {
    isoScale: Math.SQRT1_2,
    pixelScale: 2,
    tileSize: 64,
    arrowScale: 3.375,
    arrowHeight: 11,
    aimHeight: 16,
    vignette: 0.85,
  },
  time: {
    timeScale: 1,
  },
  debug: {
    showHitboxes: false,
    showStats: true,
  },
};

export type Config = typeof defaults;
export type Section = keyof Config;

export type Param = { min: number; max: number; step: number } | 'bool';

// Ranges for the dev menu. The type forces an entry for every config value.
export const meta: { [S in Section]: { [K in keyof Config[S]]: Param } } = {
  player: {
    moveSpeed: { min: 50, max: 800, step: 5 },
    uniformScreenSpeed: 'bool',
    screenSpeedMult: { min: 0.3, max: 2, step: 0.05 },
    accel: { min: 200, max: 20000, step: 100 },
    hitRadius: { min: 1, max: 30, step: 1 },
  },
  bow: {
    fireRate: { min: 0.1, max: 20, step: 0.1 },
    damage: { min: 1, max: 500, step: 1 },
    pierce: { min: 0, max: 20, step: 1 },
    arrowsPerShot: { min: 1, max: 15, step: 1 },
    spreadDeg: { min: 0, max: 45, step: 0.5 },
    arrowSpeed: { min: 100, max: 3000, step: 10 },
    arrowRange: { min: 50, max: 2000, step: 10 },
    arrowHitRadius: { min: 1, max: 40, step: 1 },
    muzzleOffset: { min: 0, max: 40, step: 1 },
    fireWhileDashing: 'bool',
  },
  dash: {
    duration: { min: 0.02, max: 1, step: 0.01 },
    distance: { min: 0, max: 800, step: 5 },
    cooldown: { min: 0, max: 5, step: 0.05 },
    inputBuffer: { min: 0, max: 0.5, step: 0.01 },
    afterimages: { min: 0, max: 20, step: 1 },
    afterimageFade: { min: 0.05, max: 1.5, step: 0.05 },
  },
  camera: {
    followRate: { min: 1, max: 60, step: 1 },
    shakeOnHit: { min: 0, max: 20, step: 0.5 },
    shakeDecay: { min: 1, max: 60, step: 1 },
  },
  feel: {
    hitFlashTime: { min: 0, max: 0.5, step: 0.01 },
    bowKickTime: { min: 0, max: 0.5, step: 0.01 },
    strideLength: { min: 40, max: 400, step: 5 },
    walkBob: { min: 0, max: 5, step: 0.1 },
    armReadyTime: { min: 0, max: 3, step: 0.05 },
    armRaiseTime: { min: 0, max: 1, step: 0.01 },
    drawTime: { min: 0.02, max: 1.5, step: 0.01 },
    drawDistance: { min: 0, max: 12, step: 0.5 },
    damageNumbers: 'bool',
  },
  dummy: {
    hp: { min: 1, max: 5000, step: 1 },
    count: { min: 1, max: 64, step: 1 },
    ringRadius: { min: 40, max: 800, step: 10 },
    radius: { min: 2, max: 60, step: 1 },
    respawnTime: { min: 0, max: 10, step: 0.1 },
  },
  render: {
    isoScale: { min: 0.3, max: 1.5, step: 0.01 },
    pixelScale: { min: 1, max: 6, step: 1 },
    tileSize: { min: 16, max: 256, step: 8 },
    arrowScale: { min: 0.5, max: 10, step: 0.125 },
    arrowHeight: { min: 0, max: 40, step: 1 },
    aimHeight: { min: 0, max: 80, step: 1 },
    vignette: { min: 0, max: 1, step: 0.05 },
  },
  time: {
    timeScale: { min: 0, max: 4, step: 0.05 },
  },
  debug: {
    showHitboxes: 'bool',
    showStats: 'bool',
  },
};

type Values = { [section: string]: { [key: string]: number | boolean } };

export const cfg: Config = structuredClone(defaults);

const CURRENT_KEY = 'heaven.config.v1';
const PRESETS_KEY = 'heaven.configPresets.v1';

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage blocked; tweaks just won't persist.
  }
}

export function getValue(section: string, key: string): number | boolean {
  return (cfg as unknown as Values)[section][key];
}

export function getDefault(section: string, key: string): number | boolean {
  return (defaults as unknown as Values)[section][key];
}

export function setValue(section: string, key: string, value: number | boolean): void {
  (cfg as unknown as Values)[section][key] = value;
  scheduleSave();
}

// Copies only known keys with matching types, so old or hand-edited JSON can't break the config.
export function applyValues(src: unknown): void {
  if (!src || typeof src !== 'object') return;
  const target = cfg as unknown as Values;
  for (const [section, entries] of Object.entries(src as Values)) {
    if (!(section in target) || !entries || typeof entries !== 'object') continue;
    for (const [key, value] of Object.entries(entries)) {
      if (key in target[section] && typeof value === typeof target[section][key]) {
        target[section][key] = value;
      }
    }
  }
  scheduleSave();
}

// Only values that differ from defaults, so changing a default in code still takes effect.
export function overrides(): Values {
  const out: Values = {};
  const cur = cfg as unknown as Values;
  const def = defaults as unknown as Values;
  for (const section of Object.keys(def)) {
    for (const key of Object.keys(def[section])) {
      if (cur[section][key] !== def[section][key]) (out[section] ??= {})[key] = cur[section][key];
    }
  }
  return out;
}

export function resetAll(): void {
  applyValues(structuredClone(defaults));
}

let saveTimer: number | undefined;
function scheduleSave(): void {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => storageSet(CURRENT_KEY, JSON.stringify(overrides())), 250);
}

export function loadSavedConfig(): void {
  const raw = storageGet(CURRENT_KEY);
  if (!raw) return;
  try {
    applyValues(JSON.parse(raw));
  } catch {
    storageSet(CURRENT_KEY, null);
  }
}

export function exportJson(): string {
  return JSON.stringify(overrides(), null, 2);
}

export function importJson(text: string): void {
  resetAll();
  applyValues(JSON.parse(text));
}

export function listPresets(): Record<string, Values> {
  try {
    return JSON.parse(storageGet(PRESETS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function savePreset(name: string): void {
  const presets = listPresets();
  presets[name] = overrides();
  storageSet(PRESETS_KEY, JSON.stringify(presets));
}

export function loadPreset(name: string): void {
  const preset = listPresets()[name];
  if (!preset) return;
  resetAll();
  applyValues(preset);
}

export function deletePreset(name: string): void {
  const presets = listPresets();
  delete presets[name];
  storageSet(PRESETS_KEY, JSON.stringify(presets));
}
