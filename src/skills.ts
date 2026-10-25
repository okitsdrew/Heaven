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
  // Polar default position around the root, in px. Players can drag nodes; their layout is saved separately.
  angle: number;
  radius: number;
}

const doubling = (n: number, base = 1) => Array.from({ length: n }, (_, i) => base * 2 ** i);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const six = (i: number) => -90 + i * 60;

// Adding a node is just a new entry here plus, for a new stat, an effect value in config and a reader below.
export const nodes: SkillNode[] = [
  { id: 'dash', name: 'Dash', desc: () => 'Unlocks the dash', parents: [], currency: 'gold', costs: [1], effect: null, angle: 0, radius: 0 },

  { id: 'fireRate', name: 'Fire Rate', desc: (p) => `+${pct(p)} fire rate`, parents: ['dash'], currency: 'gold', costs: doubling(5), effect: 'fireRate', angle: six(0), radius: 240 },
  { id: 'pierce', name: 'Pierce', desc: (p) => `+${p} pierce`, parents: ['dash'], currency: 'gold', costs: [25], effect: 'pierce', angle: six(1), radius: 240 },
  { id: 'time', name: 'Time', desc: (p) => `+${p}s run time`, parents: ['dash'], currency: 'gold', costs: doubling(5), effect: 'time', angle: six(2), radius: 240 },
  { id: 'moveSpeed', name: 'Move Speed', desc: (p) => `+${pct(p)} move speed`, parents: ['dash'], currency: 'gold', costs: doubling(5), effect: 'moveSpeed', angle: six(3), radius: 240 },
  { id: 'damage', name: 'Damage', desc: (p) => `+${p} damage`, parents: ['dash'], currency: 'gold', costs: doubling(5), effect: 'damage', angle: six(4), radius: 240 },
  { id: 'range', name: 'More Range', desc: (p) => `+${pct(p)} arrow range`, parents: ['dash'], currency: 'gold', costs: doubling(5), effect: 'range', angle: six(5), radius: 240 },

  { id: 'moreFireRate', name: 'More Fire Rate', desc: (p) => `+${pct(p)} fire rate`, parents: ['fireRate'], currency: 'gold', costs: doubling(5, 10), effect: 'moreFireRate', angle: six(0), radius: 450 },
  { id: 'moreBullets', name: 'More Bullets', desc: (p) => `+${p} arrow per shot`, parents: ['pierce'], currency: 'gold', costs: [100, 300], effect: 'moreBullets', angle: six(1), radius: 450 },
  { id: 'moreTime', name: 'More MORE Time', desc: (p) => `+${p}s run time`, parents: ['time'], currency: 'gold', costs: doubling(5, 10), effect: 'moreTime', angle: six(2), radius: 450 },
  { id: 'moreDamage', name: 'More Damage', desc: (p) => `+${p} damage`, parents: ['damage'], currency: 'gold', costs: doubling(5, 10), effect: 'moreDamage', angle: six(4), radius: 450 },
  { id: 'moreMoreBullets', name: 'More MORE Bullets', desc: (p) => `+${p} arrow per shot`, parents: ['moreBullets'], currency: 'gold', costs: [200, 500, 1000], effect: 'moreMoreBullets', angle: six(1), radius: 660 },
  { id: 'moreMoreRange', name: 'more MORE Range', desc: (p) => `+${pct(p)} arrow range`, parents: ['range'], currency: 'gold', costs: doubling(5, 10), effect: 'moreMoreRange', angle: six(5), radius: 450 },

  { id: 'goldValue', name: 'Gold Value', desc: (p) => `+${p} gold per kill`, parents: ['dash'], currency: 'gold', costs: doubling(5, 10), effect: 'goldValue', angle: 60, radius: 340 },
  { id: 'doubleGold', name: 'Double Gold', desc: (p) => `x${1 + p} gold per kill`, parents: ['goldValue'], currency: 'gold', costs: [250], effect: 'doubleGold', angle: 60, radius: 560 },
];

export const nodeById = new Map(nodes.map((n) => [n.id, n]));

export type SkillId = 'fireFairy' | 'iceFairy' | 'swordSlash';

export interface SkillDef {
  id: SkillId;
  name: string;
  key: string;
  desc: string;
  requires: string[];
  cost: number;
  color: string;
}

// Unlocked from the Skills page. Prerequisites are shown but not enforced while everything is free.
export const skills: SkillDef[] = [
  { id: 'fireFairy', name: 'Fire Fairy', key: 'Q', desc: 'Fire Wave: a rectangle of fire that sweeps out to the edge, hitting everything once.', requires: ['moreFireRate', 'moreBullets'], cost: 1, color: '#ff7a20' },
  { id: 'iceFairy', name: 'Ice Fairy', key: 'E', desc: 'Ice Storm: a freezing circle at the cursor that damages and slows enemies.', requires: ['moreTime'], cost: 1, color: '#7fd4ff' },
  { id: 'swordSlash', name: 'Sword Slash', key: 'R', desc: 'Toggle, then attack for a three-swing combo with a slam finisher.', requires: [], cost: 1, color: '#b070ff' },
];

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

export function refundSkill(s: SkillDef): boolean {
  if (!profile.skills[s.id]) return false;
  if (!cfg.tree.free) profile.skillPoints += s.cost;
  delete profile.skills[s.id];
  return true;
}

export function unlockSkill(s: SkillDef): boolean {
  if (profile.skills[s.id]) return false;
  if (!cfg.tree.free) {
    if (profile.skillPoints < s.cost) return false;
    profile.skillPoints -= s.cost;
  }
  profile.skills[s.id] = true;
  return true;
}

export function unlockEverything(): void {
  for (const n of nodes) profile.nodes[n.id] = maxLevel(n);
  for (const s of skills) profile.skills[s.id] = true;
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
  if (a === 'teleport' || cfg.debug.unlockAll) return true;
  return a === 'dash' ? level('dash') >= 1 : !!profile.skills[a];
}

export const stats = {
  fireRate: () => cfg.bow.fireRate * (1 + sum(['fireRate', 'moreFireRate'])),
  damage: () => cfg.bow.damage + sum(['damage', 'moreDamage']),
  pierce: () => Math.round(cfg.bow.pierce + sum(['pierce'])),
  arrows: () => Math.max(1, Math.round(cfg.bow.arrowsPerShot + sum(['moreBullets', 'moreMoreBullets']))),
  range: () => cfg.bow.arrowRange * (1 + sum(['range', 'moreMoreRange'])),
  goldValue: () => Math.max(0, cfg.gold.perKill + sum(['goldValue'])) * (1 + sum(['doubleGold'])),
  moveSpeed: () => cfg.player.moveSpeed * (1 + sum(['moveSpeed'])),
  runTime: () => (cfg.run.lengthOverride > 0 ? cfg.run.lengthOverride : cfg.run.baseTime + sum(['time', 'moreTime'])),
};
