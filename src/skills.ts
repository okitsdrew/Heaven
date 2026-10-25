import { cfg, Config } from './config';
import { profile } from './save';

type Currency = 'gold' | 'sp';

// Which `cfg.upgrade` value a node adds per level.
type Effect = keyof Config['upgrade'] | null;

export interface SkillNode {
  id: string;
  name: string;
  desc: (per: number) => string;
  parents: string[];
  currency: Currency;
  costs: number[];
  effect: Effect;
  // Default position in px around the root. Players can drag nodes; their layout is saved separately.
  x: number;
  y: number;
}

const doubling = (n: number, base = 1) => Array.from({ length: n }, (_, i) => base * 2 ** i);
const pct = (v: number) => `${Math.round(v * 100)}%`;

// Adding a node is just a new entry here plus, for a new stat, an effect value in config and a reader below.
export const nodes: SkillNode[] = [
  { id: 'dash', name: 'Dash', desc: () => 'Unlocks the dash', parents: [], currency: 'gold', costs: [1], effect: null, x: 0, y: 0 },

  { id: 'fireRate', name: 'Fire Rate', desc: (p) => `+${pct(p)} fire rate`, parents: ['damage'], currency: 'gold', costs: doubling(5, 100), effect: 'fireRate', x: -480, y: 0 },
  { id: 'pierce', name: 'Pierce', desc: (p) => `+${p} pierce`, parents: ['moreBullets'], currency: 'gold', costs: [100], effect: 'pierce', x: -480, y: 190 },
  { id: 'time', name: 'Time', desc: (p) => `+${p}s run time`, parents: ['dash'], currency: 'gold', costs: doubling(5, 1), effect: 'time', x: 240, y: 0 },
  { id: 'moveSpeed', name: 'Move Speed', desc: (p) => `+${pct(p)} move speed`, parents: ['time'], currency: 'gold', costs: doubling(5, 100), effect: 'moveSpeed', x: 480, y: 190 },
  { id: 'damage', name: 'Damage', desc: (p) => `+${p} damage`, parents: ['dash'], currency: 'gold', costs: doubling(5, 1), effect: 'damage', x: -240, y: -85 },
  { id: 'range', name: 'More Range', desc: (p) => `+${pct(p)} arrow range`, parents: ['damage'], currency: 'gold', costs: doubling(5, 100), effect: 'range', x: -480, y: -170 },

  { id: 'moreFireRate', name: 'More Fire Rate', desc: (p) => `+${pct(p)} fire rate`, parents: ['moreDamage'], currency: 'gold', costs: doubling(5, 1000), effect: 'moreFireRate', x: -960, y: -170 },
  { id: 'moreBullets', name: 'More Bullets', desc: (p) => `+${p} arrow per shot`, parents: ['dash'], currency: 'gold', costs: doubling(2, 1), effect: 'moreBullets', x: -240, y: 110 },
  { id: 'moreTime', name: 'More MORE Time', desc: (p) => `+${p}s run time`, parents: ['goldValue'], currency: 'gold', costs: doubling(5, 1000), effect: 'moreTime', x: 720, y: -130 },
  { id: 'moreDamage', name: 'More Damage', desc: (p) => `+${p} damage`, parents: ['fireRate'], currency: 'gold', costs: doubling(5, 1000), effect: 'moreDamage', x: -720, y: 0 },
  { id: 'moreMoreBullets', name: 'More MORE Bullets', desc: (p) => `+${p} arrow per shot`, parents: ['moreDamage'], currency: 'gold', costs: doubling(3, 1000), effect: 'moreMoreBullets', x: -960, y: 190 },
  { id: 'moreMoreRange', name: 'more MORE Range', desc: (p) => `+${pct(p)} arrow range`, parents: ['moreMorePierce'], currency: 'gold', costs: doubling(5, 1000), effect: 'moreMoreRange', x: -1200, y: 110 },

  { id: 'goldValue', name: 'Gold Value', desc: (p) => `+${p} gold per kill`, parents: ['time'], currency: 'gold', costs: doubling(5, 100), effect: 'goldValue', x: 480, y: 0 },
  { id: 'pickupRadius', name: 'Pickup Radius', desc: (p) => `+${pct(p)} pickup radius`, parents: ['time'], currency: 'gold', costs: doubling(5, 100), effect: 'pickupRadius', x: 480, y: -240 },
  { id: 'doubleGold', name: 'Double Gold', desc: (p) => `x${1 + p} gold per kill`, parents: ['goldValue'], currency: 'gold', costs: [1000], effect: 'doubleGold', x: 720, y: 110 },

  { id: 'moreMorePierce', name: 'more MORE Pierce', desc: (p) => `+${p} pierce`, parents: ['moreDamage'], currency: 'gold', costs: doubling(3, 1000), effect: 'moreMorePierce', x: -960, y: 0 },
  { id: 'biggerArrows', name: 'Bigger Arrows', desc: (p) => `+${pct(p)} arrow size and hitbox`, parents: ['moreMorePierce'], currency: 'gold', costs: doubling(5, 1000), effect: 'biggerArrows', x: -1200, y: -70 },
  { id: 'teleport', name: 'Teleport', desc: () => 'Unlocks teleport (right click)', parents: ['dash'], currency: 'sp', costs: [1], effect: null, x: 0, y: 190 },

  { id: 'fireFairy', name: 'Fire Fairy', desc: () => 'Unlocks Q: Fire Wave', parents: ['teleport'], currency: 'sp', costs: [3], effect: null, x: -240, y: 340 },
  { id: 'iceFairy', name: 'Ice Fairy', desc: () => 'Unlocks E: Ice Storm', parents: ['teleport'], currency: 'sp', costs: [3], effect: null, x: 0, y: 340 },
  { id: 'swordSlash', name: 'Sword Slash', desc: () => 'Unlocks R: Sword Slash combo', parents: ['teleport'], currency: 'sp', costs: [3], effect: null, x: 240, y: 340 },
];

export const nodeById = new Map(nodes.map((n) => [n.id, n]));

export type SkillId = 'fireFairy' | 'iceFairy' | 'swordSlash';

export function level(id: string): number {
  return profile.nodes[id] ?? 0;
}

export function isVisible(n: SkillNode): boolean {
  return cfg.tree.revealAll || n.parents.every((p) => level(p) >= 1);
}

export function maxLevel(n: SkillNode): number {
  return n.costs.length;
}

export function nextCost(n: SkillNode): number | null {
  return level(n.id) >= maxLevel(n) ? null : n.costs[level(n.id)];
}

export function canBuy(n: SkillNode): boolean {
  const cost = nextCost(n);
  if (cost === null) return false;
  if (!n.parents.every((p) => level(p) >= 1)) return false;
  if (cfg.tree.free) return true;
  return (n.currency === 'gold' ? profile.gold : profile.skillPoints) >= cost;
}

export function buy(n: SkillNode): boolean {
  if (!canBuy(n)) return false;
  const cost = nextCost(n) ?? 0;
  if (!cfg.tree.free) {
    if (n.currency === 'gold') profile.gold -= cost;
    else profile.skillPoints -= cost;
  }
  profile.nodes[n.id] = level(n.id) + 1;
  return true;
}

// Gives back the most recent level. Blocked if it would orphan a purchased child node.
export function refund(n: SkillNode): boolean {
  const lvl = level(n.id);
  if (lvl <= 0) return false;
  if (lvl === 1 && nodes.some((c) => c.parents.includes(n.id) && level(c.id) > 0)) return false;
  if (!cfg.tree.free) {
    if (n.currency === 'gold') profile.gold += n.costs[lvl - 1];
    else profile.skillPoints += n.costs[lvl - 1];
  }
  if (lvl === 1) delete profile.nodes[n.id];
  else profile.nodes[n.id] = lvl - 1;
  return true;
}

export function unlockEverything(): void {
  for (const n of nodes) profile.nodes[n.id] = maxLevel(n);
}

// Additive total of every purchased level for one effect, so +5 x 10% is +50% rather than compounding.
function sum(effects: Effect[]): number {
  let total = 0;
  for (const n of nodes) {
    if (n.effect && effects.includes(n.effect)) total += cfg.upgrade[n.effect] * level(n.id);
  }
  return total;
}

export type Gated = 'dash' | 'teleport' | SkillId;

// Dev toggles in `cfg.abilities` can force an ability off; otherwise it must be unlocked in the profile.
export function canUse(a: Gated): boolean {
  if (!cfg.abilities[a]) return false;
  if (cfg.debug.unlockAll) return true;
  return level(a) >= 1;
}

export const stats = {
  fireRate: () => cfg.bow.fireRate * (1 + sum(['fireRate', 'moreFireRate'])),
  damage: () => cfg.bow.damage + sum(['damage', 'moreDamage']),
  pierce: () => Math.round(cfg.bow.pierce + sum(['pierce', 'moreMorePierce'])),
  pickupRadius: () => cfg.gold.pickupRadius * (1 + sum(['pickupRadius'])),
  arrowSize: () => 1 + sum(['biggerArrows']),
  arrows: () => Math.max(1, Math.round(cfg.bow.arrowsPerShot + sum(['moreBullets', 'moreMoreBullets']))),
  range: () => cfg.bow.arrowRange * (1 + sum(['range', 'moreMoreRange'])),
  goldValue: () => Math.max(0, cfg.gold.perKill + sum(['goldValue'])) * (1 + sum(['doubleGold'])),
  moveSpeed: () => cfg.player.moveSpeed * (1 + sum(['moveSpeed'])),
  runTime: () => (cfg.run.lengthOverride > 0 ? cfg.run.lengthOverride : cfg.run.baseTime + sum(['time', 'moreTime'])),
};
