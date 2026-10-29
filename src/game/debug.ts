/// <reference types="vite/client" />
import Phaser from 'phaser';

// Dev server only, opt in with `?debug=1`. Production builds compile both functions to an early return.
const enabled = () => import.meta.env.DEV && new URLSearchParams(window.location.search).get('debug') === '1';

// Scripted-input handle for browser playtests: window.__spinbound.state() / press() / release() / teleport().
export function installDebugHooks(scene: Phaser.Scene, api: object) {
  if (!enabled()) return;
  const target = window as unknown as { __spinbound?: object };
  target.__spinbound = api;
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { if (target.__spinbound === api) delete target.__spinbound; });
}

// Deterministic frame stepping that also works in a background tab where requestAnimationFrame is paused.
// advance() stops the real loop so the two clocks never interleave; wake() hands control back.
export function installDebugClock(game: Phaser.Game) {
  if (!enabled()) return;
  let clock = performance.now();
  (window as unknown as { __spinboundClock?: object }).__spinboundClock = {
    advance(ms: number, frameMs = 1000 / 60) {
      if (game.loop.running) game.loop.sleep();
      for (let elapsed = 0; elapsed < ms; elapsed += frameMs) {
        clock += frameMs;
        game.step(clock, frameMs);
      }
      return Math.round(clock);
    },
    wake() { if (!game.loop.running) game.loop.wake(); },
  };
}
