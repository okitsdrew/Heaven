// Persistent player progress. Versioned so old saves can be migrated as the schema grows.

const SAVE_KEY = 'heaven.save.v1';
const LAYOUT_KEY = 'heaven.treeLayout.v5';
const OLD_LAYOUT_KEYS = ['heaven.treeLayout.v4', 'heaven.treeLayout.v3', 'heaven.treeLayout.v2'];
// Nodes whose default spot moved; their saved drags from the old layout are dropped.
const MOVED = ['pierce', 'dash', 'dustDevil', 'teleport', 'fireFairy', 'iceFairy', 'swordSlash', 'doomsday'];
const VERSION = 1;

export interface SaveData {
  version: number;
  gold: number;
  skillPoints: number;
  level: number;
  xp: number;
  nodes: Record<string, number>;
  // Story progress: the opening has played, and the book's pages can be opened.
  introDone: boolean;
  bookUnlocked: boolean;
  // Whether he has gone through Anathema yet (it glows until he does).
  visitedHead: boolean;
  // Whether he has opened the book since it was unlocked (it glows until he does).
  bookOpened: boolean;
}

function fresh(): SaveData {
  return { version: VERSION, gold: 0, skillPoints: 0, level: 1, xp: 0, nodes: {}, introDone: false, bookUnlocked: false, visitedHead: false, bookOpened: false };
}

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
    // Storage blocked; progress just won't persist.
  }
}

// Copies only known fields with matching types, so hand-edited or old JSON can't break the save.
function sanitize(src: unknown): SaveData {
  const out = fresh();
  if (!src || typeof src !== 'object') return out;
  const s = src as Partial<SaveData>;
  const num = (v: unknown, min: number, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(min, v) : fallback;
  out.gold = Math.floor(num(s.gold, 0, 0));
  out.skillPoints = Math.floor(num(s.skillPoints, 0, 0));
  out.level = Math.floor(num(s.level, 1, 1));
  out.xp = num(s.xp, 0, 0);
  out.introDone = s.introDone === true;
  out.bookUnlocked = s.bookUnlocked === true;
  out.visitedHead = s.visitedHead === true;
  out.bookOpened = s.bookOpened === true;
  if (s.nodes && typeof s.nodes === 'object') {
    for (const [k, v] of Object.entries(s.nodes)) if (typeof v === 'number' && v > 0) out.nodes[k] = Math.floor(v);
  }
  // Dash is unlocked from the start now; refund the point spent on its old node.
  if (out.nodes.dash) {
    delete out.nodes.dash;
    out.skillPoints += 1;
  }
  // Abilities used to be unlocked from a separate list; they are tree nodes now.
  const old = (src as { skills?: Record<string, unknown> }).skills;
  if (old && typeof old === 'object') {
    for (const [k, v] of Object.entries(old)) if (v === true) out.nodes[k] = Math.max(1, out.nodes[k] ?? 0);
  }
  return out;
}

export const profile: SaveData = fresh();

export function loadProfile(): void {
  const raw = storageGet(SAVE_KEY);
  if (!raw) return;
  try {
    Object.assign(profile, sanitize(JSON.parse(raw)));
  } catch {
    // Corrupt save: keep the fresh profile and leave the raw string alone until the next write.
  }
}

let timer: number | undefined;

// Writes soon, coalescing bursts such as gold pickups.
export function persist(): void {
  clearTimeout(timer);
  timer = window.setTimeout(persistNow, 400);
}

export function persistNow(): void {
  clearTimeout(timer);
  storageSet(SAVE_KEY, JSON.stringify(profile));
}

export function exportSave(): string {
  return JSON.stringify(profile, null, 2);
}

export function importSave(text: string): void {
  Object.assign(profile, sanitize(JSON.parse(text)));
  persistNow();
}

export function resetSave(): void {
  Object.assign(profile, fresh());
  persistNow();
}

export type Layout = Record<string, { x: number; y: number }>;

export function loadLayout(): Layout {
  try {
    let raw = storageGet(LAYOUT_KEY);
    let migrated = false;
    if (raw === null) {
      for (const key of OLD_LAYOUT_KEYS) {
        raw = storageGet(key);
        if (raw !== null) break;
      }
      migrated = raw !== null;
    }
    const v = JSON.parse(raw ?? '{}');
    if (!v || typeof v !== 'object') return {};
    if (migrated) for (const id of MOVED) delete v[id];
    return v;
  } catch {
    return {};
  }
}

export function saveLayout(layout: Layout): void {
  storageSet(LAYOUT_KEY, JSON.stringify(layout));
}

export function clearLayout(): void {
  storageSet(LAYOUT_KEY, null);
}
