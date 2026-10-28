// Persistent player progress. Versioned so old saves can be migrated as the schema grows.

const SAVE_KEY = 'heaven.save.v1';
const LAYOUT_KEY = 'heaven.treeLayout.v6';
const OLD_LAYOUT_KEYS = ['heaven.treeLayout.v5', 'heaven.treeLayout.v4', 'heaven.treeLayout.v3', 'heaven.treeLayout.v2'];
// Nodes whose default spot moved; their saved drags from the old layout are dropped.
const MOVED = ['pierce', 'dash', 'dustDevil', 'teleport', 'fireFairy', 'iceFairy', 'swordSlash', 'doomsday', 'fireRate', 'moreFireRate', 'moreBullets', 'moreMoreBullets', 'damage', 'range', 'moreMorePierce', 'moreDamage', 'time', 'pickupRadius', 'moveSpeed', 'goldValue', 'moreTime', 'doubleGold'];
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
  // The book unlock scene plays once, and the bow hint shows on the first battle only.
  bookIntroSeen: boolean;
  bowHintShown: boolean;
  // The tip about assigning a skill to a slot has been shown.
  skillTipShown: boolean;
  // The throne's talk before the first Shade has played.
  bossIntroSeen: boolean;
  // The player has looked at Time Warp since it unlocked, which clears its red alerts.
  warpSeen: boolean;
  // Fire Wave has been looked at since the first time it was affordable.
  fireSeen: boolean;
  // The right-click teleport tip has been shown in the hub.
  teleportHintShown: boolean;
  // Story stage: 1 until the throne's talk after the Mimic falls, then 2.
  stage: number;
  // The run clock when the Mimic fell; stage 2 picks up from there.
  stage2Clock: number;
  // Stage 2 quest: 'find' the Mind's Eye, 'feed' it, then 'follow' the aura to the Resting Ground.
  quest: 'find' | 'feed' | 'follow';
  // Souls the Mind's Eye has taken so far.
  eyeFed: number;
  // The death screen has nudged the player into the upgrade tree once.
  treeTutorialDone: boolean;
  // The other skills have faded in on the book once.
  skillsFaded: boolean;
  // Fire Wave has been cast in a battle, which readies the throne's reveal of the other skills.
  firewaveUsed: boolean;
  // The throne has shown the other skills; until then only Teleport and Fire Wave are on the book.
  skillsRevealed: boolean;
  // Which skill sits on Q, E and R (null when empty).
  binds: (string | null)[];
}

const SKILL_IDS = ['fireFairy', 'iceFairy', 'swordSlash', 'doomsday', 'aegis', 'lotus'];

function fresh(): SaveData {
  return { version: VERSION, gold: 0, skillPoints: 0, level: 1, xp: 0, nodes: {}, introDone: false, bookUnlocked: false, visitedHead: false, bookOpened: false, bookIntroSeen: false, bowHintShown: false, skillTipShown: false, bossIntroSeen: false, warpSeen: false, fireSeen: false, teleportHintShown: false, stage: 1, stage2Clock: 0, quest: 'find', eyeFed: 0, treeTutorialDone: false, skillsFaded: false, firewaveUsed: false, skillsRevealed: false, binds: [null, null, null] };
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
  out.bookIntroSeen = s.bookIntroSeen === true || out.bookUnlocked;
  out.bowHintShown = s.bowHintShown === true;
  out.skillTipShown = s.skillTipShown === true;
  out.bossIntroSeen = s.bossIntroSeen === true;
  out.warpSeen = s.warpSeen === true;
  out.fireSeen = s.fireSeen === true;
  out.teleportHintShown = s.teleportHintShown === true;
  out.stage = s.stage === 2 ? 2 : 1;
  out.stage2Clock = num(s.stage2Clock, 0, 0);
  out.quest = s.quest === 'feed' || s.quest === 'follow' ? s.quest : 'find';
  out.eyeFed = num(s.eyeFed, 0, 0);
  out.treeTutorialDone = s.treeTutorialDone === true || out.bookUnlocked || Object.keys(out.nodes).length > 0;
  out.skillsFaded = s.skillsFaded === true;
  out.firewaveUsed = s.firewaveUsed === true;
  out.skillsRevealed = s.skillsRevealed === true;
  if (s.nodes && typeof s.nodes === 'object') {
    for (const [k, v] of Object.entries(s.nodes)) if (typeof v === 'number' && v > 0) out.nodes[k] = Math.floor(v);
  }
  // Dash is unlocked from the start now; refund the point spent on its old node.
  if (out.nodes.dash) {
    delete out.nodes.dash;
    out.skillPoints += 1;
  }
  // Rebalanced nodes: clamp to the new maximum and refund the old price of the dropped levels.
  for (const [id, max, base] of [['moreDamage', 3, 500], ['moreFireRate', 2, 250], ['moreTime', 1, 500]] as const) {
    for (let i = max; i < (out.nodes[id] ?? 0); i++) out.gold += Math.ceil(base * Math.pow(1.5, i) - 1e-9);
    if ((out.nodes[id] ?? 0) > max) out.nodes[id] = max;
  }
  // Quadruple Souls became the second level of Double Souls.
  if (out.nodes.quadGold) {
    delete out.nodes.quadGold;
    out.nodes.doubleGold = 2;
  }
  // Better Arrows is gone: refund what was spent on it.
  for (let i = 0; i < (out.nodes.biggerArrows ?? 0); i++) out.gold += Math.ceil(500 * Math.pow(1.5, i) - 1e-9);
  delete out.nodes.biggerArrows;
  // Abilities used to be unlocked from a separate list; they are tree nodes now.
  const old = (src as { skills?: Record<string, unknown> }).skills;
  if (old && typeof old === 'object') {
    for (const [k, v] of Object.entries(old)) if (v === true) out.nodes[k] = Math.max(1, out.nodes[k] ?? 0);
  }
  if ((out.nodes.teleport ?? 0) > 0) out.teleportHintShown = true;
  // Saves that already own a skill beyond Fire Wave have been through the reveal.
  if (['iceFairy', 'swordSlash', 'doomsday', 'aegis'].some((id) => (out.nodes[id] ?? 0) > 0)) {
    out.skillsRevealed = true;
    out.skillsFaded = true;
    out.firewaveUsed = true;
  }
  // Equipped skills: validated, no repeats, and only owned ones. Old saves had fixed keys (Q fire, E ice, R sword, F doomsday).
  const given = Array.isArray(s.binds) ? s.binds : null;
  const owned = (id: string) => (out.nodes[id] ?? 0) > 0;
  const seen = new Set<string>();
  const clean = (v: unknown) => (typeof v === 'string' && SKILL_IDS.includes(v) && owned(v) && !seen.has(v) && seen.add(v) ? v : null);
  out.binds = given ? [clean(given[0]), clean(given[1]), clean(given[2])] : [null, null, null];
  if (!given) {
    for (const id of ['fireFairy', 'iceFairy', 'swordSlash', 'doomsday', 'aegis']) {
      const free = out.binds.indexOf(null);
      if (owned(id) && free >= 0) out.binds[free] = id;
    }
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
