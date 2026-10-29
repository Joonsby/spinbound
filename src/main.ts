import Phaser from 'phaser';
import { closeAudio } from './audio';
import { startCloudSave } from './cloud-save';
import { lockLandscapeInToss } from './screen-orientation';
import { BootScene } from './boot-scene';
import { MainMenuScene, MenuScreenScene } from './menus';
import { GameScene } from './game/game-scene';
import { PHYSICS } from './game/config';
import { installDebugClock } from './game/debug';
import { getPlayerProgress } from './progress';
import { configureQuality, renderScaleFor } from './graphics/quality';
import { APPLY_DISPLAY_EVENT, LOGICAL_HEIGHT, RENDER_SCALE_EVENT, getRenderScale, setRenderScale } from './graphics/display';
import './style.css';

document.addEventListener('contextmenu', (event) => event.preventDefault());
document.addEventListener('dblclick', (event) => event.preventDefault());

lockLandscapeInToss();
configureQuality(getPlayerProgress().graphicsQuality);
const parent = document.querySelector<HTMLElement>('#game')!;
// Canvas size = logical size × render scale; cameras zoom by the same factor.
const gameSize = () => {
  const height = Math.max(1, parent.clientHeight || window.innerHeight);
  const width = Math.max(1, parent.clientWidth || window.innerWidth);
  setRenderScale(renderScaleFor(height));
  const scale = getRenderScale();
  return { width: Math.max(1, Math.round(width / height * LOGICAL_HEIGHT * scale)), height: Math.round(LOGICAL_HEIGHT * scale) };
};

const initial = gameSize();
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#101d32',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: initial.width, height: initial.height },
  // Long frames (app resume, GC) are clamped to 50 ms so physics never jumps several steps at once.
  fps: { min: 20 },
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: PHYSICS.gravity } } },
  audio: { noAudio: true },
  scene: [BootScene, MainMenuScene, MenuScreenScene, GameScene],
});
game.events.once(Phaser.Core.Events.DESTROY, closeAudio);
installDebugClock(game);
// Inside Toss, progress also syncs per player; open menus redraw when the cloud copy wins.
startCloudSave(() => {
  for (const scene of game.scene.getScenes(true)) {
    if (scene instanceof MainMenuScene || scene instanceof MenuScreenScene) scene.scene.restart(scene.sys.settings.data);
  }
});

function applyGameSize() {
  const previous = getRenderScale();
  const { width, height } = gameSize();
  game.scale.setGameSize(width, height);
  if (getRenderScale() !== previous) game.events.emit(RENDER_SCALE_EVENT, getRenderScale());
}
// Settings emit APPLY_DISPLAY_EVENT after a quality change.
game.events.on(APPLY_DISPLAY_EVENT, applyGameSize);
const resizeObserver = new ResizeObserver(applyGameSize);
resizeObserver.observe(parent);
game.events.once(Phaser.Core.Events.DESTROY, () => resizeObserver.disconnect());
