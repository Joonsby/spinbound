import Phaser from 'phaser';
import { closeAudio } from './audio';
import { MainMenuScene, MenuScreenScene } from './menus';
import { GameScene } from './game/game-scene';
import { PHYSICS } from './game/config';
import { installDebugClock } from './game/debug';
import './style.css';

document.addEventListener('contextmenu', (event) => event.preventDefault());
document.addEventListener('dblclick', (event) => event.preventDefault());

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#101d32',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: Math.max(1, Math.round(window.innerWidth / window.innerHeight * 600)),
    height: 600,
  },
  // Long frames (app resume, GC) are clamped to 50 ms so physics never jumps several steps at once.
  fps: { min: 20 },
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: PHYSICS.gravity } } },
  audio: { noAudio: true },
  scene: [MainMenuScene, MenuScreenScene, GameScene],
});
game.events.once(Phaser.Core.Events.DESTROY, closeAudio);
installDebugClock(game);

const resize = () => {
  const parent = document.querySelector<HTMLElement>('#game')!;
  game.scale.setGameSize(Math.max(1, Math.round(parent.clientWidth / Math.max(1, parent.clientHeight) * 600)), 600);
};
const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(document.querySelector('#game')!);
game.events.once(Phaser.Core.Events.DESTROY, () => resizeObserver.disconnect());
