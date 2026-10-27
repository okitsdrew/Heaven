import Phaser from 'phaser';
import { loadSavedConfig } from './config';
import { loadProfile } from './save';
import { GameScene } from './scenes/GameScene';
import { HubScene } from './scenes/HubScene';

loadSavedConfig();
loadProfile();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0b0a10',
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  scene: [HubScene, GameScene],
});

// Handy for poking at scenes from the browser console while tuning.
(window as unknown as { heaven: Phaser.Game }).heaven = game;
