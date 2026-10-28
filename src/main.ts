import Phaser from 'phaser';
import { sfx } from './audio';
import { loadSavedConfig } from './config';
import { loadProfile } from './save';
import { GameScene } from './scenes/GameScene';
import { HubScene } from './scenes/HubScene';
import { RestScene } from './scenes/RestScene';

loadSavedConfig();
loadProfile();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0b0a10',
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: 1280, height: 800 },
  scene: [HubScene, GameScene, RestScene],
});

// Every button press in the menus gets a click, except the dev menu's own.
document.addEventListener('click', (e) => {
  const t = e.target;
  if (t instanceof HTMLButtonElement && !t.closest('#dev-menu')) sfx.play('click');
});

// Handy for poking at scenes from the browser console while tuning.
(window as unknown as { heaven: Phaser.Game }).heaven = game;
