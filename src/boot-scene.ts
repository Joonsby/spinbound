import Phaser from 'phaser';
import { queueExternalAssets } from './graphics/asset-loader';
import { createRobotArt } from './graphics/robot-art';

// Loads delivered PNGs first so code-painted fallbacks are only made for keys still missing.
export class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  preload() {
    queueExternalAssets(this);
  }

  create() {
    createRobotArt(this);
    this.scene.start('MainMenuScene');
  }
}
