import { cfg } from './config';
import { persist, profile } from './save';

export function xpToNext(level: number): number {
  const x = cfg.xp;
  const need = [x.level1, x.level2, x.level3, x.level4, x.level5][level - 1] ?? x.laterLevels;
  return Math.max(1, Math.round(need));
}

// Returns how many levels were gained. Each level grants skill points.
export function addXp(amount: number): number {
  profile.xp += amount;
  let gained = 0;
  while (profile.xp >= xpToNext(profile.level)) {
    profile.xp -= xpToNext(profile.level);
    profile.level++;
    profile.skillPoints += cfg.xp.pointsPerLevel;
    gained++;
  }
  persist();
  return gained;
}

export function setLevel(level: number): void {
  profile.level = Math.max(1, Math.floor(level));
  profile.xp = 0;
  persist();
}
