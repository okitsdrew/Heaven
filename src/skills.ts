import { cfg, Config } from './config';
import { profile, setSaveOverride } from './save';

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
  // Extra unlock condition beyond the parents; the node stays hidden until it holds.
  requires?: () => boolean;
  // Nodes that cannot be bought once any of these is owned (and vice versa, since each lists the other).
  excludes?: string[];
  // The skill's own colour, for its button, its slot and the HUD.
  color?: number;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const small = (t: string) => `<small>(${t})</small>`;

// Adding a node is just a new entry here plus, for a new stat, an effect value in config and a reader below.
export const nodes: SkillNode[] = [
  { id: 'pierce', name: 'Stronger Shot', desc: (p) => `+${p} pierce`, parents: [], currency: 'gold', levels: 1, base: 1, effect: 'pierce', x: 0, y: 0 },

  // The column above Pierce.
  { id: 'fireRate', name: 'Faster Shots', desc: (p) => `+${pct(p)} fire rate`, parents: ['pierce'], currency: 'gold', levels: 2, base: 50, costs: [50, 100], effect: 'fireRate', x: 0, y: -130 },
  { id: 'moreFireRate', name: 'Peak Efficiency', desc: (p) => `+${pct(p)} fire rate`, parents: ['fireRate'], currency: 'gold', levels: 2, base: 500, costs: [500, 1000], effect: 'moreFireRate', x: 0, y: -260 },
  { id: 'dustDevil', name: 'Dust Devil', desc: () => `Each kill: +${pct(cfg.upgrade.dustPerKill)} move and attack speed (max ${pct(cfg.upgrade.dustCap)}), lasts ${cfg.upgrade.dustHold + cfg.upgrade.dustDuration}s.`, parents: ['moreFireRate'], currency: 'gold', levels: 1, base: 500, effect: null, x: 0, y: -390 },

  // The column below Pierce.
  { id: 'moreBullets', name: 'Dexterous', desc: (p) => `+${p} arrow per shot`, parents: ['pierce'], currency: 'gold', levels: 2, base: 1, effect: 'moreBullets', x: 0, y: 130 },
  { id: 'moreMoreBullets', name: 'Void Fingers', desc: (p) => `+${p} arrow per shot`, parents: ['moreBullets'], currency: 'gold', levels: 3, base: 500, effect: 'moreMoreBullets', x: 0, y: 260 },

  // Left: damage, and the pair that both lead to More Damage.
  { id: 'damage', name: 'More Power', desc: (p) => `+${p} damage`, parents: ['pierce'], currency: 'gold', levels: 5, base: 1, effect: 'damage', x: -180, y: 0 },
  { id: 'range', name: 'Sniper', desc: (p) => `+${pct(p)} arrow range`, parents: ['damage'], currency: 'gold', levels: 1, base: 100, costs: [100], effect: 'range', x: -340, y: -170 },
  { id: 'taunt', name: 'Taunt', desc: () => `Increase enemy spawn rate in the first ${cfg.spawn.holdTime + cfg.spawn.secondHold} seconds.`, parents: ['damage'], currency: 'gold', levels: 1, base: 500, costs: [500], effect: null, x: -340, y: 0 },
  { id: 'moreMorePierce', name: 'Denser Arrows', desc: (p) => `+${p} pierce`, parents: ['damage'], currency: 'gold', levels: 3, base: 500, effect: 'moreMorePierce', x: -340, y: 170 },
  { id: 'moreDamage', name: 'Destructive Tendencies', desc: (p) => `+${p} damage`, parents: ['range', 'moreMorePierce'], currency: 'gold', levels: 3, base: 500, costs: [500, 750, 1000], effect: 'moreDamage', x: -540, y: 0 },

  // Right: time, its two side nodes, and souls.
  { id: 'time', name: 'Mental Fortitude', desc: (p) => `+${p}s run time`, parents: ['pierce'], currency: 'gold', levels: 5, base: 2, effect: 'time', x: 180, y: 0 },
  { id: 'pickupRadius', name: 'Siphon Range', desc: (p) => `+${pct(p)} pickup radius`, parents: ['time'], currency: 'gold', levels: 2, base: 100, costs: [100, 200], effect: 'pickupRadius', x: 260, y: -130 },
  { id: 'moveSpeed', name: 'Fleet Feet', desc: (p) => `+${pct(p)} move speed`, parents: ['time'], currency: 'gold', levels: 2, base: 100, costs: [100, 200], effect: 'moveSpeed', x: 260, y: 130 },
  { id: 'goldValue', name: 'Siphon Strength', desc: (p) => `+${p} souls per kill`, parents: ['time'], currency: 'gold', levels: 5, base: 25, effect: 'goldValue', x: 360, y: 0 },
  { id: 'moreTime', name: 'Endless Misery', desc: () => `Each kill adds ${cfg.upgrade.killTime}s of run time`, parents: ['goldValue'], currency: 'gold', levels: 1, base: 5000, costs: [5000], effect: null, x: 520, y: -80 },
  { id: 'doubleGold', name: 'Soul Battery', desc: () => `x${1 + cfg.upgrade.doubleGold} souls per kill, then x${1 + cfg.upgrade.doubleGold + cfg.upgrade.quadGold}`, parents: ['goldValue'], currency: 'gold', levels: 2, base: 500, costs: [500, 1000], effect: null, x: 520, y: 80 },
  { id: 'timeWarp', name: 'Time Warp', desc: () => `Battles start ${cfg.upgrade.warpTime} seconds in`, parents: ['moreTime', 'doubleGold'], requires: () => level('doubleGold') >= 2 && profile.bossIntroSeen, currency: 'gold', levels: 1, base: 5000, costs: [5000], effect: null, x: 700, y: 0 },

  // Unlocked by stage 2: four more upgrades on the main tree. They fade in together on the first visit to the tree after it.
  { id: 'backshots', name: 'Backshots', desc: () => `Fires a second bow behind you with ${pct(cfg.bow.backshotsMult)} of the shots and pierce`, parents: ['dustDevil'], requires: () => profile.stage >= 2, currency: 'gold', levels: 1, base: 20000, costs: [20000], effect: null, x: 0, y: -570 },
  { id: 'swiftKick', name: 'Swift Kick', desc: () => `Teleport deals ${cfg.upgrade.swiftKickDamage} damage to enemies you pass through`, parents: ['timeWarp'], requires: () => profile.stage >= 2, currency: 'gold', levels: 1, base: 10000, costs: [10000], effect: null, x: 880, y: 0 },
  { id: 'zeroGravity', name: 'Zero Gravity', desc: (p) => `+${pct(p)} arrow range`, parents: ['moreDamage'], requires: () => profile.stage >= 2, currency: 'gold', levels: 1, base: 10000, costs: [10000], effect: 'zeroGravity', x: -720, y: 0 },

  // The book: Teleport, with the four equippable skills in a row beneath it.
  { id: 'teleport', name: 'Teleport', desc: () => 'Unlocks teleport (right click)', parents: [], currency: 'sp', levels: 1, base: 1, effect: null, x: 0, y: 0, tree: 'book' },
  {
    id: 'fireFairy',
    name: 'Fire Wave',
    desc: () => `Unleash a fire wave in front, burning enemies for ${cfg.fireWave.burnTime} seconds.${small(`Cooldown ${cfg.fireWave.cooldown}s, damage ${cfg.fireWave.damage}`)}`,
    parents: ['teleport'], currency: 'sp', levels: 1, base: 1, effect: null, x: 0, y: -310, tree: 'book', color: 0xff7a20,
  },
  {
    id: 'iceFairy',
    name: 'Ice Storm',
    desc: () => `Direct an ice storm onto an area for ${cfg.iceStorm.duration} seconds. Damages and slows enemies. Freezes bosses for ${cfg.iceStorm.bossFreeze} second.${small(`Cooldown ${cfg.iceStorm.cooldown}s, damage ${cfg.iceStorm.damage} x${cfg.iceStorm.ticksPerSecond}/s`)}`,
    parents: ['teleport'], requires: () => profile.skillsRevealed, currency: 'sp', levels: 1, base: 1, effect: null, x: -410, y: -130, tree: 'book', color: 0x7fd4ff,
  },
  {
    id: 'doomsday',
    name: 'Doomsday Scenario',
    desc: () => `Teleport to an area and unleashes an explosion. Damages, stuns, and knocks back enemies. Damages and stuns bosses.${small(`Cooldown ${cfg.doomsday.cooldown}s, damage ${cfg.doomsday.damage}`)}`,
    parents: ['teleport'], requires: () => profile.skillsRevealed, currency: 'sp', levels: 1, base: 1, effect: null, x: 410, y: -175, tree: 'book', color: 0xffe14a,
  },
  {
    id: 'swordSlash',
    name: 'Sword Slash',
    desc: () => `Convert your next ${cfg.swordSlash.charges} attacks into a sword slash combo. Damages enemies and stuns bosses.${small(`Cooldown ${cfg.swordSlash.cooldown}s, damage ${cfg.swordSlash.coneDamage} cone, ${cfg.swordSlash.slamDamage} slam`)}`,
    parents: ['teleport'], requires: () => profile.skillsRevealed, currency: 'sp', levels: 1, base: 1, effect: null, x: 410, y: 150, tree: 'book', color: 0xb070ff,
  },
  {
    id: 'aegis',
    name: 'Worldbreaker Aegis',
    desc: () => `Defends yourself against the next attack for ${cfg.aegis.duration} seconds. Counterattack, detonating an area around you and stunning enemies and bosses.${small(`Cooldown ${cfg.aegis.cooldown}s, damage ${cfg.aegis.damage}`)}`,
    parents: ['teleport'], requires: () => profile.skillsRevealed, currency: 'sp', levels: 1, base: 1, effect: null, x: 0, y: 310, tree: 'book', color: 0xffffff,
  },
  {
    id: 'lotus',
    name: 'Festering Lotus',
    desc: () => `Throw out a flower to attract and poison enemies for ${cfg.lotus.life} seconds. Dash/Teleport through the flower to shoot out poisonous leaves.${small(`Cooldown ${cfg.lotus.cooldown}s, damage ${cfg.lotus.damage}`)}`,
    parents: ['teleport'], requires: () => profile.skillsRevealed, currency: 'sp', levels: 1, base: 1, effect: null, x: -410, y: 150, tree: 'book', color: 0x8fe04a,
  },

  // Enhancements: each skill has a damage node and one or more special nodes. All cost skill points and open at stage 2.
  { id: 'fireFairyDamage', name: 'Fire Wave: Damage Increase', desc: (p) => `Increase damage of Fire Wave by ${pct(p)} ${small(`total +${pct(p * level('fireFairyDamage'))}`)}`, parents: ['fireFairy'], requires: () => profile.stage >= 2, currency: 'sp', levels: 2, base: 1, costs: [1, 1], effect: 'skillDamage', x: -200, y: -470, tree: 'book', color: 0xff7a20 },
  { id: 'fireFairyBurn', name: 'Fire Wave: Searing Arrows', desc: () => 'When Fire Wave is equipped, arrows apply burn on hit', parents: ['fireFairy'], requires: () => profile.stage >= 2, currency: 'sp', levels: 1, base: 1, costs: [1], effect: null, x: 200, y: -470, tree: 'book', color: 0xff7a20 },
  { id: 'iceFairyDamage', name: 'Ice Storm: Damage Increase', desc: (p) => `Increase damage of Ice Storm by ${pct(p)} ${small(`total +${pct(p * level('iceFairyDamage'))}`)}`, parents: ['iceFairy'], requires: () => profile.stage >= 2, currency: 'sp', levels: 2, base: 1, costs: [1, 1], effect: 'skillDamage', x: -810, y: -300, tree: 'book', color: 0x7fd4ff },
  { id: 'iceFairyCold', name: 'Ice Storm: Frostbite Arrows', desc: () => 'When Ice Storm is equipped, arrows apply cold on hit', parents: ['iceFairy'], requires: () => profile.stage >= 2, currency: 'sp', levels: 1, base: 1, costs: [1], effect: null, x: -810, y: -100, tree: 'book', color: 0x7fd4ff },
  { id: 'lotusDamage', name: 'Festering Lotus: Damage Increase', desc: (p) => `Increase damage of Festering Lotus by ${pct(p)} ${small(`total +${pct(p * level('lotusDamage'))}`)}`, parents: ['lotus'], requires: () => profile.stage >= 2, currency: 'sp', levels: 2, base: 1, costs: [1, 1], effect: 'skillDamage', x: -810, y: 100, tree: 'book', color: 0x8fe04a },
  { id: 'lotusPoison', name: 'Festering Lotus: Venom Arrows', desc: () => 'When Festering Lotus is equipped, arrows apply poison on hit', parents: ['lotus'], requires: () => profile.stage >= 2, currency: 'sp', levels: 1, base: 1, costs: [1], effect: null, x: -810, y: 300, tree: 'book', color: 0x8fe04a },
  { id: 'doomsdayDamage', name: 'Doomsday Scenario: Damage Increase', desc: (p) => `Increase damage of Doomsday Scenario by ${pct(p)} ${small(`total +${pct(p * level('doomsdayDamage'))}`)}`, parents: ['doomsday'], requires: () => profile.stage >= 2, currency: 'sp', levels: 2, base: 1, costs: [1, 1], effect: 'skillDamage', x: 810, y: -300, tree: 'book', color: 0xffe14a },
  { id: 'efficientDust', name: 'Efficient Dust', desc: () => `When Doomsday Scenario is equipped, ${cfg.upgrade.dustEfficiency}x the efficiency of Dust Devil`, parents: ['doomsday'], requires: () => profile.stage >= 2, currency: 'sp', levels: 1, base: 1, costs: [1], effect: null, x: 810, y: -100, tree: 'book', color: 0xffe14a },
  { id: 'swordSlashDamage', name: 'Sword Slash: Damage Increase', desc: (p) => `Increase damage of Sword Slash by ${pct(p)} ${small(`total +${pct(p * level('swordSlashDamage'))}`)}`, parents: ['swordSlash'], requires: () => profile.stage >= 2, currency: 'sp', levels: 2, base: 1, costs: [1, 1], effect: 'skillDamage', x: 810, y: 100, tree: 'book', color: 0xb070ff },
  { id: 'powerhouse', name: 'Powerhouse', desc: () => `When Sword Slash is equipped, ${cfg.upgrade.powerhouseDamage}x more arrow damage and ${cfg.upgrade.powerhousePierce}x pierce`, parents: ['swordSlash'], requires: () => profile.stage >= 2, currency: 'sp', levels: 1, base: 1, costs: [1], effect: null, x: 810, y: 300, tree: 'book', color: 0xb070ff },
  { id: 'aegisDamage', name: 'Aegis: Damage Increase', desc: (p) => `Increase damage of Worldbreaker Aegis by ${pct(p)} ${small(`total +${pct(p * level('aegisDamage'))}`)}`, parents: ['aegis'], requires: () => profile.stage >= 2, currency: 'sp', levels: 2, base: 1, costs: [1, 1], effect: 'skillDamage', x: -420, y: 470, tree: 'book', color: 0xffffff },
  { id: 'bubbleShield', name: 'Bubble Shield', desc: () => `When Aegis is equipped, it is always active, but has ${cfg.upgrade.bubbleCooldownMult}x cooldown when popped. Cannot be combined with Panic Button`, parents: ['aegis'], excludes: ['panicButton'], requires: () => profile.stage >= 2, currency: 'sp', levels: 1, base: 1, costs: [1], effect: null, x: 0, y: 470, tree: 'book', color: 0xffffff },
  { id: 'panicButton', name: 'Panic Button', desc: () => `When Aegis is equipped, ${cfg.upgrade.panicMult}x damage and range of Aegis. Cannot be combined with Bubble Shield`, parents: ['aegis'], excludes: ['bubbleShield'], requires: () => profile.stage >= 2, currency: 'sp', levels: 1, base: 1, costs: [1], effect: null, x: 420, y: 470, tree: 'book', color: 0xffffff },
];

export const nodeById = new Map(nodes.map((n) => [n.id, n]));

// The stage 2 upgrades, which fade onto the tree together.
export const stage2Nodes = ['backshots', 'swiftKick', 'zeroGravity'];

export type SkillId = 'fireFairy' | 'iceFairy' | 'swordSlash' | 'doomsday' | 'aegis' | 'lotus';
export const skillIds: SkillId[] = ['fireFairy', 'iceFairy', 'swordSlash', 'doomsday', 'aegis', 'lotus'];
export type AbilityAction = 'abilityQ' | 'abilityE' | 'abilityR' | 'abilityF' | 'abilityG' | 'abilityH';

// Skills are not tied to a key: the three slots hold whichever skills the player has equipped.
export const slotActions: AbilityAction[] = ['abilityQ', 'abilityE', 'abilityR'];
export const slotKeys = ['Q', 'E', 'R'];
const FALLBACK: Record<SkillId, AbilityAction> = { fireFairy: 'abilityQ', iceFairy: 'abilityE', swordSlash: 'abilityR', doomsday: 'abilityF', aegis: 'abilityG', lotus: 'abilityH' };

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

// The testing grounds: skills are free to take and swap, and the real loadout comes back afterwards.
let backup: { nodes: Record<string, number>; binds: (string | null)[] } | null = null;

export const sandboxed = () => backup !== null;
const free = () => cfg.tree.free || backup !== null;

export function enterSandbox(): void {
  if (backup) return;
  backup = { nodes: { ...profile.nodes }, binds: [...profile.binds] };
  setSaveOverride(() => (backup ? { nodes: backup.nodes, binds: backup.binds } : {}));
}

export function leaveSandbox(): void {
  if (!backup) return;
  profile.nodes = backup.nodes;
  profile.binds = backup.binds;
  backup = null;
  setSaveOverride(null);
}

export function level(id: string): number {
  return profile.nodes[id] ?? 0;
}

// A skill's own upgrades (damage, special arrows and so on), as opposed to the skill itself.
const isEnhancement = (n: SkillNode) => n.tree === 'book' && n.parents.some((p) => isSkill(p));

export function isVisible(n: SkillNode): boolean {
  return cfg.tree.revealAll || (n.parents.every((p) => level(p) >= 1) && (n.requires?.() ?? true)) && !(backup && isEnhancement(n));
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
  if (n.requires && !n.requires()) return false;
  if (n.excludes?.some((id) => level(id) > 0)) return false;
  if (free()) return true;
  return (n.currency === 'gold' ? profile.gold : profile.skillPoints) >= cost;
}

export function buy(n: SkillNode): boolean {
  if (!canBuy(n)) return false;
  const cost = nextCost(n) ?? 0;
  if (!free()) {
    if (n.currency === 'gold') profile.gold -= cost;
    else profile.skillPoints -= cost;
  }
  profile.nodes[n.id] = level(n.id) + 1;
  // A new skill takes the first open slot.
  if (isSkill(n.id) && level(n.id) === 1) autoBind(n.id);
  return true;
}

// Gives back the most recent level. Blocked if it would orphan a purchased child node.
export function refund(n: SkillNode): boolean {
  const lvl = level(n.id);
  if (lvl <= 0) return false;
  if (lvl === 1 && nodes.some((c) => c.parents.includes(n.id) && level(c.id) > 0)) return false;
  if (!free()) {
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
  for (const n of nodes) {
    if (n.excludes?.some((id) => level(id) > 0)) continue;
    profile.nodes[n.id] = maxLevel(n);
  }
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

// Time Warp is out for the player to notice: unlocked, not yet bought, and not yet looked at.
export function warpAlert(): boolean {
  const n = nodeById.get('timeWarp');
  return !!n && level('timeWarp') < 1 && isVisible(n) && !profile.warpSeen;
}

// Fire Wave is the first skill on offer: flag it once the player can afford it, until they look at it.
export function fireAlert(): boolean {
  const n = nodeById.get('fireFairy');
  return !!n && profile.bookUnlocked && level('fireFairy') < 1 && !profile.fireSeen && canBuy(n);
}

export function alertFor(id: string): (() => boolean) | null {
  return id === 'timeWarp' ? warpAlert : id === 'fireFairy' ? fireAlert : null;
}

export function markSeen(id: string): void {
  if (id === 'timeWarp') profile.warpSeen = true;
  if (id === 'fireFairy') profile.fireSeen = true;
}

// Per-run buffs that reset on restart. A kill refreshes the hold, then the stacks run out after the countdown.
export const runBuffs = { dust: 0, hold: 0, left: 0, bonusTime: 0 };

// Skill damage multiplier from its Damage Increase node.
export function skillDamage(id: SkillId): number {
  return equipped(id) ? 1 + cfg.upgrade.skillDamage * level(`${id}Damage`) : 1;
}

// Enhancements only work while the skill they belong to is equipped.
export function equipped(id: SkillId): boolean {
  return actionFor(id) !== null;
}

// An enhancement is live while its skill is equipped.
function enhanced(id: SkillId): boolean {
  return equipped(id);
}

// Panic Button doubles the Aegis counter-blast's damage and range.
export function aegisBoost(): number {
  return level('panicButton') >= 1 && enhanced('aegis') ? cfg.upgrade.panicMult : 1;
}

export function powerhouse(): boolean {
  return level('powerhouse') >= 1 && enhanced('swordSlash');
}

// The colour each of Q, E and R adds to the arrow trail: that slot's on-hit effect, or null when it has none.
export function trailColors(): (number | null)[] {
  return [0, 1, 2].map((i) => {
    const id = profile.binds[i];
    if (id === 'fireFairy' && level('fireFairyBurn') >= 1) return 0xff4030;
    if (id === 'iceFairy' && level('iceFairyCold') >= 1) return 0x9fe8ff;
    if (id === 'lotus' && level('lotusPoison') >= 1) return 0x5aff4a;
    return null;
  });
}

export function bubbleShield(): boolean {
  return level('bubbleShield') >= 1 && equipped('aegis');
}

// Which on-hit effects arrows carry: the node is owned and its skill is equipped.
export function arrowEffects(): { burn: boolean; cold: boolean; poison: boolean } {
  const on = (node: string, skill: SkillId) => level(node) >= 1 && enhanced(skill);
  return { burn: on('fireFairyBurn', 'fireFairy'), cold: on('iceFairyCold', 'iceFairy'), poison: on('lotusPoison', 'lotus') };
}

export function onKillBuffs(): void {
  if (level('moreTime') >= 1) runBuffs.bonusTime += cfg.upgrade.killTime;
  if (level('dustDevil') < 1) return;
  const eff = level('efficientDust') >= 1 && enhanced('doomsday') ? cfg.upgrade.dustEfficiency : 1;
  runBuffs.dust = Math.min(cfg.upgrade.dustCap * eff, runBuffs.dust + cfg.upgrade.dustPerKill * eff);
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
  startTime: () => (level('timeWarp') >= 1 ? cfg.upgrade.warpTime : 0),
  fireRate: () => cfg.bow.fireRate * (1 + sum(['fireRate', 'moreFireRate']) + dust()),
  damage: () => (cfg.bow.damage + sum(['damage', 'moreDamage'])) * (powerhouse() ? cfg.upgrade.powerhouseDamage : 1),
  pierce: () => Math.round((cfg.bow.pierce + sum(['pierce', 'moreMorePierce'])) * (powerhouse() ? cfg.upgrade.powerhousePierce : 1)),
  pickupRadius: () => cfg.gold.pickupRadius * (1 + sum(['pickupRadius'])),
  arrowSize: () => 1 + sum(['biggerArrows']),
  arrows: () => Math.max(1, Math.round(cfg.bow.arrowsPerShot + sum(['moreBullets', 'moreMoreBullets']))),
  range: () => cfg.bow.arrowRange * (1 + sum(['range', 'biggerArrows', 'zeroGravity'])),
  goldValue: () => Math.max(0, cfg.gold.perKill + sum(['goldValue'])) * (1 + (level('doubleGold') >= 1 ? cfg.upgrade.doubleGold : 0) + (level('doubleGold') >= 2 ? cfg.upgrade.quadGold : 0)),
  moveSpeed: () => cfg.player.moveSpeed * (1 + sum(['moveSpeed']) + dust()),
  runTime: () => (cfg.run.lengthOverride > 0 ? cfg.run.lengthOverride : cfg.run.baseTime + sum(['time']) + runBuffs.bonusTime),
};
