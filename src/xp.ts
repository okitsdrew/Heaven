import { cfg } from './config';
import { persist, profile } from './save';

export function xpToNext(level: number): number {
  return Math.max(1, Math.round(cfg.xp.curveBase * Math.pow(level, cfg.xp.curveExp)));
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
