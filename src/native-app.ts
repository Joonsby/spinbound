import type Phaser from 'phaser';

// The Android app (Capacitor) runs this same bundle; its bridge is in the page before any script.
export const inNativeApp = () =>
  (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() === true;

// Called once at start-up. Only the app loads the back key handling and the Capacitor plugin with it.
export function setUpNativeApp(game: Phaser.Game) {
  if (!inNativeApp()) return;
  document.documentElement.dataset.nativeApp = 'true';
  void import('./back-button').then(({ bindBackButton }) => bindBackButton(game));
}
