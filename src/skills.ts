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
  // Cost of level i is ceil(base * tree.costScale^i), so the scaling stays tunable in the dev menu.
  levels: number;
  base: number;
  // Explicit price per level, used instead of base and the scaling when present.
  costs?: number[];
  effect: Effect;
  // Default position in px around the root. Players can drag nodes; their layout is saved separately.
  x: number;
  y: number;
  // Which tree shows the node. The book holds the skills; everything else is on the main tree.
  tree?: 'book';
  // The skill's own colour, for its button, its slot and the HUD.
  color?: number;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const small = (t: string) => `<small>(${t})</small>`;

// Adding a node is just a new entry here plus, for a new stat, an effect value in config and a reader below.
export const nodes: SkillNode[] = [
  { id: 'pierce', name: 'Pierce', desc: (p) => `+${p} pierce`, parents: [], currency: 'gold', levels: 1, base: 1, effect: 'pierce', x: 0, y: 0 },

  // The column above Pierce.
  { id: 'fireRate', name: 'Fire Rate', desc: (p) => `+${pct(p)} fire rate`, parents: ['pierce'], currency: 'gold', levels: 2, base: 50, costs: [50, 100], effect: 'fireRate', x: 0, y: -130 },
  { id: 'moreFireRate', name: 'More Fire Rate', desc: (p) => `+${pct(p)} fire rate`, parents: ['fireRate'], currency: 'gold', levels: 2, base: 500, costs: [500, 1000], effect: 'moreFireRate', x: 0, y: -260 },
  { id: 'dustDevil', name: 'Dust Devil', desc: () => `Each kill: +${pct(cfg.upgrade.dustPerKill)} move and attack speed (max ${pct(cfg.upgrade.dustCap)}), lasts ${cfg.upgrade.dustHold + cfg.upgrade.dustDuration}s, reset by kills`, parents: ['moreFireRate'], currency: 'gold', levels: 1, base: 500, effect: null, x: 0, y: -390 },

  // The column below Pierce.
  { id: 'moreBullets', name: 'More Bullets', desc: (p) => `+${p} arrow per shot`, parents: ['pierce'], currency: 'gold', levels: 2, base: 1, effect: 'moreBullets', x: 0, y: 130 },
  { id: 'moreMoreBullets', name: 'More MORE Bullets', desc: (p) => `+${p} arrow per shot`, parents: ['moreBullets'], currency: 'gold', levels: 3, base: 500, effect: 'moreMoreBullets', x: 0, y: 260 },

  // Left: damage, and the pair that both lead to More Damage.
  { id: 'damage', name: 'Damage', desc: (p) => `+${p} damage`, parents: ['pierce'], currency: 'gold', levels: 5, base: 1, effect: 'damage', x: -180, y: 0 },
  { id: 'range', name: 'More Range', desc: (p) => `+${pct(p)} arrow range`, parents: ['damage'], currency: 'gold', levels: 1, base: 100, costs: [100], effect: 'range', x: -340, y: -90 },
  { id: 'moreMorePierce', name: 'more MORE Pierce', desc: (p) => `+${p} pierce`, parents: ['damage'], currency: 'gold', levels: 3, base: 500, effect: 'moreMorePierce', x: -340, y: 90 },
  { id: 'moreDamage', name: 'More Damage', desc: (p) => `+${p} damage`, parents: ['range', 'moreMorePierce'], currency: 'gold', levels: 3, base: 500, costs: [500, 750, 1000], effect: 'moreDamage', x: -540, y: 0 },

  // Right: time, its two side nodes, and souls.
  { id: 'time', name: 'Time', desc: (p) => `+${p}s run time`, parents: ['pierce'], currency: 'gold', levels: 5, base: 1, effect: 'time', x: 180, y: 0 },
  { id: 'pickupRadius', name: 'Pickup Radius', desc: (p) => `+${pct(p)} pickup radius`, parents: ['time'], currency: 'gold', levels: 2, base: 100, costs: [100, 200], effect: 'pickupRadius', x: 260, y: -130 },
  { id: 'moveSpeed', name: 'Move Speed', desc: (p) => `+${pct(p)} move speed`, parents: ['time'], currency: 'gold', levels: 2, base: 100, costs: [100, 200], effect: 'moveSpeed', x: 260, y: 130 },
  { id: 'goldValue', name: 'Soul Value', desc: (p) => `+${p} souls per kill`, parents: ['time'], currency: 'gold', levels: 5, base: 25, effect: 'goldValue', x: 360, y: 0 },
  { id: 'moreTime', name: 'Endless Misery', desc: () => `Each kill adds ${cfg.upgrade.killTime}s of run time`, parents: ['goldValue'], currency: 'gold', levels: 1, base: 1000, costs: [1000], effect: null, x: 520, y: -80 },
  { id: 'doubleGold', name: 'Double Souls', desc: () => `x${1 + cfg.upgrade.doubleGold} souls per kill, then x${1 + cfg.upgrade.doubleGold + cfg.upgrade.quadGold}`, parents: ['goldValue'], currency: 'gold', levels: 2, base: 500, costs: [500, 1000], effect: null, x: 520, y: 80 },

  // The book: Teleport, with the four equippable skills in a row beneath it.
  { id: 'teleport', name: 'Teleport', desc: () => 'Unlocks teleport (right click)', parents: [], currency: 'sp', levels: 1, base: 1, effect: null, x: 0, y: 0, tree: 'book' },
  {
    id: 'fireFairy',
    name: 'Fire Wave',
    desc: () => `Unleash a fire wave in front, burning enemies for ${cfg.fireWave.burnTime} seconds.${small(`Cooldown ${cfg.fireWave.cooldown}s, damage ${cfg.fireWave.damage}`)}`,
    parents: ['teleport'], currency: 'sp', levels: 1, base: 1, effect: null, x: -495, y: 190, tree: 'book', color: 0xff7a20,
  },
  {
    id: 'iceFairy',
    name: 'Ice Storm',
    desc: () => `Direct an ice storm onto an area for ${cfg.iceStorm.duration} seconds. Damages and slows enemies. Freezes bosses for ${cfg.iceStorm.bossFreeze} second.${small(`Cooldown ${cfg.iceStorm.cooldown}s, damage ${cfg.iceStorm.damage} x${cfg.iceStorm.ticksPerSecond}/s`)}`,
    parents: ['teleport'], currency: 'sp', levels: 1, base: 2, effect: null, x: -165, y: 190, tree: 'book', color: 0x7fd4ff,
  },
  {
    id: 'doomsday',
    name: 'Doomsday Scenario',
    desc: () => `Teleport to an area and unleashes an explosion. Damages, stuns, and knocks back enemies. Damages and stuns bosses.${small(`Cooldown ${cfg.doomsday.cooldown}s, damage ${cfg.doomsday.damage}`)}`,
    parents: ['teleport'], currency: 'sp', levels: 1, base: 2, effect: null, x: 165, y: 190, tree: 'book', color: 0xffe14a,
  },
  {
    id: 'swordSlash',
    name: 'Sword Slash',
    desc: () => `Convert your next ${cfg.swordSlash.charges} attacks into a sword slash combo. Damages enemies and stuns bosses.${small(`Cooldown ${cfg.swordSlash.cooldown}s, damage ${cfg.swordSlash.coneDamage} cone, ${cfg.swordSlash.slamDamage} slam`)}`,
    parents: ['teleport'], currency: 'sp', levels: 1, base: 2, effect: null, x: 495, y: 190, tree: 'book', color: 0xb070ff,
  },
];

export const nodeById = new Map(nodes.map((n) => [n.id, n]));

export type SkillId = 'fireFairy' | 'iceFairy' | 'swordSlash' | 'doomsday';
export const skillIds: SkillId[] = ['fireFairy', 'iceFairy', 'swordSlash', 'doomsday'];
export type AbilityAction = 'abilityQ' | 'abilityE' | 'abilityR' | 'abilityF';

// Skills are not tied to a key: the three slots hold whichever skills the player has equipped.
export const slotActions: AbilityAction[] = ['abilityQ', 'abilityE', 'abilityR'];
export const slotKeys = ['Q', 'E', 'R'];
const FALLBACK: Record<SkillId, AbilityAction> = { fireFairy: 'abilityQ', iceFairy: 'abilityE', swordSlash: 'abilityR', doomsday: 'abilityF' };

export function isSkill(id: string): id is SkillId {
  return (skillIds as string[]).includes(id);
}

// The key that triggers a skill, or null when it is not equipped.
export function actionFor(id: SkillId): AbilityAction | null {
  const i = profile.binds.indexOf(id);
  if (i >= 0) return slotActions[i];
  return cfg.debug.unlockAll ? FALLBACK[id] : null;
}

// Puts a skill in a slot; it leaves any other slot, and the slot's old skill takes its place.
export function bind(id: SkillId, slot: number): void {
  const from = profile.binds.indexOf(id);
  const old = profile.binds[slot];
  profile.binds[slot] = id;
  if (from >= 0 && from !== slot) profile.binds[from] = old;
}

function autoBind(id: SkillId): void {
  if (profile.binds.includes(id)) return;
  const free = profile.binds.indexOf(null);
  if (free >= 0) profile.binds[free] = id;
}

export function level(id: string): number {
  return profile.nodes[id] ?? 0;
}

export function isVisible(n: SkillNode): boolean {
  return cfg.tree.revealAll || n.parents.every((p) => level(p) >= 1);
}

export function maxLevel(n: SkillNode): number {
  return n.levels;
}

export function costAt(n: SkillNode, i: number): number {
  if (n.costs) return n.costs[Math.min(i, n.costs.length - 1)];
  return Math.ceil(n.base * Math.pow(cfg.tree.costScale, i) - 1e-9);
}

export function nextCost(n: SkillNode): number | null {
  return level(n.id) >= maxLevel(n) ? null : costAt(n, level(n.id));
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
    if (n.currency === 'gold') profile.gold += costAt(n, lvl - 1);
    else profile.skillPoints += costAt(n, lvl - 1);
  }
  if (lvl === 1) {
    delete profile.nodes[n.id];
    if (isSkill(n.id)) profile.binds = profile.binds.map((b) => (b === n.id ? null : b));
  } else profile.nodes[n.id] = lvl - 1;
  return true;
}

export function unlockEverything(): void {
  for (const n of nodes) profile.nodes[n.id] = maxLevel(n);
  for (const id of skillIds) autoBind(id);
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

export const bookSkills = nodes.filter((n) => n.tree === 'book');

// Dev toggles in `cfg.abilities` can force an ability off; otherwise it must be unlocked in the profile.
export function canUse(a: Gated): boolean {
  if (!cfg.abilities[a]) return false;
  if (a === 'dash') return true;
  const owned = cfg.debug.unlockAll || level(a) >= 1;
  return a === 'teleport' ? owned : owned && actionFor(a) !== null;
}

// Per-run buffs that reset on restart. A kill refreshes the hold, then the stacks run out after the countdown.
export const runBuffs = { dust: 0, hold: 0, left: 0, bonusTime: 0 };

export function onKillBuffs(): void {
  if (level('moreTime') >= 1) runBuffs.bonusTime += cfg.upgrade.killTime;
  if (level('dustDevil') < 1) return;
  runBuffs.dust = Math.min(cfg.upgrade.dustCap, runBuffs.dust + cfg.upgrade.dustPerKill);
  runBuffs.hold = cfg.upgrade.dustHold;
  runBuffs.left = cfg.upgrade.dustDuration;
}

export function tickBuffs(dt: number): void {
  if (runBuffs.hold > 0) {
    runBuffs.hold -= dt;
    return;
  }
  if (runBuffs.left <= 0) return;
  runBuffs.left -= dt;
  if (runBuffs.left <= 0) runBuffs.dust = 0;
}

export function resetBuffs(): void {
  runBuffs.dust = 0;
  runBuffs.hold = 0;
  runBuffs.left = 0;
  runBuffs.bonusTime = 0;
}

// 1 while the stacks are held or fully fresh, draining to 0 as they run out.
export function dustFraction(): number {
  if (runBuffs.dust <= 0) return 0;
  return runBuffs.hold > 0 ? 1 : Math.max(0, runBuffs.left / Math.max(cfg.upgrade.dustDuration, 1e-3));
}

const dust = () => (level('dustDevil') >= 1 ? runBuffs.dust : 0);

export const stats = {
  fireRate: () => cfg.bow.fireRate * (1 + sum(['fireRate', 'moreFireRate']) + dust()),
  damage: () => cfg.bow.damage + sum(['damage', 'moreDamage']),
  pierce: () => Math.round(cfg.bow.pierce + sum(['pierce', 'moreMorePierce'])),
  pickupRadius: () => cfg.gold.pickupRadius * (1 + sum(['pickupRadius'])),
  arrowSize: () => 1 + sum(['biggerArrows']),
  arrows: () => Math.max(1, Math.round(cfg.bow.arrowsPerShot + sum(['moreBullets', 'moreMoreBullets']))),
  range: () => cfg.bow.arrowRange * (1 + sum(['range', 'biggerArrows'])),
  goldValue: () => Math.max(0, cfg.gold.perKill + sum(['goldValue'])) * (1 + (level('doubleGold') >= 1 ? cfg.upgrade.doubleGold : 0) + (level('doubleGold') >= 2 ? cfg.upgrade.quadGold : 0)),
  moveSpeed: () => cfg.player.moveSpeed * (1 + sum(['moveSpeed']) + dust()),
  runTime: () => (cfg.run.lengthOverride > 0 ? cfg.run.lengthOverride : cfg.run.baseTime + sum(['time']) + runBuffs.bonusTime),
};
