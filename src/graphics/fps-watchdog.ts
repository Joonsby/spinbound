import Phaser from 'phaser';
import { downgradeQuality, qualitySetting } from './quality';
import { APPLY_DISPLAY_EVENT } from './display';

const SAMPLE_MS = 2000;
const SLOW_FPS = 45;
const SLOW_SAMPLES = 3;

// Auto quality only: steps the preset down after ~6 s of low frame rate.
// The canvas shrinks at once; particle and layer caps follow on the next stage load.
export function installFpsWatchdog(scene: Phaser.Scene) {
  let slow = 0;
  const timer = scene.time.addEvent({
    delay: SAMPLE_MS,
    loop: true,
    callback: () => {
      const loop = scene.game.loop;
      // A sleeping loop means the debug clock is stepping frames by hand.
      if (qualitySetting() !== 'auto' || document.hidden || !loop.running) { slow = 0; return; }
      slow = loop.actualFps < SLOW_FPS ? slow + 1 : 0;
      if (slow < SLOW_SAMPLES) return;
      slow = 0;
      if (downgradeQuality()) scene.game.events.emit(APPLY_DISPLAY_EVENT);
    },
  });
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => timer.remove(false));
}
