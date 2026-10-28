import type Phaser from 'phaser';
import { getOperationalEnvironment, SafeAreaInsets } from '@apps-in-toss/web-framework';

// Browser events are used deliberately: the documented SDK has no AppState API.
export function bindAppEnvironment(scene: Phaser.Scene, resetInput: () => void, pauseAudio: () => void, resumeAudio: () => void) {
  let pausedByEnvironment = false;
  let unsubscribeSafeArea: (() => void) | undefined;
  const root = document.documentElement;
  try {
    const environment = getOperationalEnvironment();
    if (environment === 'toss' || environment === 'sandbox') {
      root.dataset.appsInToss = 'true';
      const applyInsets = (insets: ReturnType<typeof SafeAreaInsets.get>) => {
        for (const edge of ['top', 'right', 'bottom', 'left'] as const) {
          const value = insets[edge];
          if (Number.isFinite(value)) root.style.setProperty(`--native-safe-${edge}`, `${Math.max(0, value)}px`);
        }
      };
      applyInsets(SafeAreaInsets.get());
      unsubscribeSafeArea = SafeAreaInsets.subscribe({ onEvent: applyInsets });
    }
  } catch {
    // Standalone browsers have no bridge; CSS env() remains the fallback.
  }

  const pause = () => {
    resetInput();
    pauseAudio();
    if (!pausedByEnvironment && scene.scene.isActive()) {
      pausedByEnvironment = true;
      scene.scene.pause();
    }
  };
  const resume = () => {
    if (document.hidden) return;
    if (pausedByEnvironment) {
      pausedByEnvironment = false;
      // Resume the scene, not the physics world: game-over/clear must stay frozen.
      scene.scene.resume();
    }
    resumeAudio();
  };
  const visibility = () => { if (document.hidden) pause(); else resume(); };
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('blur', pause);
  window.addEventListener('focus', resume);
  window.addEventListener('pagehide', pause);
  window.addEventListener('pageshow', resume);
  if (document.hidden) pause();

  return () => {
    unsubscribeSafeArea?.();
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('blur', pause);
    window.removeEventListener('focus', resume);
    window.removeEventListener('pagehide', pause);
    window.removeEventListener('pageshow', resume);
  };
}
