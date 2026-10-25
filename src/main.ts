import Phaser from 'phaser';
import { loadSavedConfig } from './config';
import { GameScene } from './scenes/GameScene';

loadSavedConfig();

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0b0a10',
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  scene: [GameScene],
});
