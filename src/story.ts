import { cfg } from './config';
import { persistNow, profile } from './save';
import { unlockEverything } from './skills';

// Marks every story beat before the stage 2 cutscene as done and buys every skill and upgrade, so the later
// parts of the game can be reached (or the cutscene replayed) straight away.
export function completeStoryBeforeStage2(): void {
  Object.assign(profile, {
    introDone: true,
    visitedHead: true,
    bookUnlocked: true,
    bookOpened: true,
    bookIntroSeen: true,
    bowHintShown: true,
    skillTipShown: true,
    bossIntroSeen: true,
    teleportHintShown: true,
    treeTutorialDone: true,
    firewaveUsed: true,
    skillsRevealed: true,
    skillsFaded: true,
    warpSeen: true,
    fireSeen: true,
    stage: 1,
    stage2Clock: cfg.stage2.startClock,
    quest: 'find',
    eyeFed: 0,
  });
  unlockEverything();
  persistNow();
}

// Puts the save at the very start of stage 2.
export function startStage2State(): void {
  completeStoryBeforeStage2();
  profile.stage = 2;
  persistNow();
}
