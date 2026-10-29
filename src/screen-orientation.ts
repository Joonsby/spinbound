import { getOperationalEnvironment, Screen } from '@apps-in-toss/web-framework';

// Spinbound is played sideways. In Toss the orientation applies to the whole app,
// so it goes back to portrait when the mini app is left and returns on re-entry.
export function lockLandscapeInToss() {
  try {
    const environment = getOperationalEnvironment();
    if ((environment !== 'toss' && environment !== 'sandbox') || !Screen.setOrientation.isSupported()) return;
  } catch {
    return;
  }
  const set = (type: 'landscape' | 'portrait') => {
    Screen.setOrientation({ type }).catch((error: unknown) => console.warn('[orientation]', error));
  };
  set('landscape');
  window.addEventListener('pagehide', () => set('portrait'));
  window.addEventListener('pageshow', (event) => { if (event.persisted) set('landscape'); });
}
