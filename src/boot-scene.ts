import Phaser from 'phaser';
import { queueExternalAssets } from './graphics/asset-loader';
import { createRobotArt } from './graphics/robot-art';
import { reportOneStoreLoading, startOneStoreGame } from './onestore';

// Loads delivered PNGs first so code-painted fallbacks are only made for keys still missing.
export class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  preload() {
    queueExternalAssets(this);
    this.load.on(Phaser.Loader.Events.PROGRESS, reportOneStoreLoading);
  }

  create() {
    createRobotArt(this);
    startOneStoreGame();
    this.scene.start('MainMenuScene');
  }
}
