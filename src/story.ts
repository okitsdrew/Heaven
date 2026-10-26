// The intro cutscene as data. The words are placeholders until the owner supplies the real story.

export interface StoryScene {
  // Each line fades in after the previous one finishes typing.
  lines: string[];
  mood: 'ember' | 'void' | 'dawn';
}

export const intro: StoryScene[] = [
  { mood: 'dawn', lines: ['The gates of Heaven held for a thousand years.'] },
  { mood: 'void', lines: ['Then the dark came, and the wraiths with it.', 'They do not tire. They do not stop.'] },
  { mood: 'ember', lines: ['You are the last archer on the wall.', 'The fires burn low, and the horde is endless.'] },
];

// Shown after the story as the quick tutorial card.
export const controls: [string, string][] = [
  ['W A S D', 'Move'],
  ['Hold left click', 'Shoot toward the cursor'],
  ['Space', 'Dash (you cannot be hurt mid-dash)'],
  ['One touch kills you', 'Every run is short. Gold and XP carry over.'],
  ['Skill Tree', 'Spend what you collected, then go again'],
  ['`', 'Dev menu'],
];

export const tutorialTitle = 'Survive until the clock runs out';
