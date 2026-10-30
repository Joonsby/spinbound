import { getOperationalEnvironment } from '@apps-in-toss/web-framework';

// ONE store H5 Game SDK. The store runs the game in a frame and keeps its own loading screen
// up until startGameAsync; anywhere else initializeAsync resolves with `err` and nothing runs.
const SDK_URL = 'https://h5sdk.onestore.net/lib/v1.1.0/onestore-h5-sdk.min.js';

type Insets = { top: number; right: number; bottom: number; left: number };
type OneStoreSdk = {
  initializeAsync(): Promise<{ err?: string; safeArea?: Insets }>;
  setLoadingProgress(progress: number): void;
  startGameAsync(): Promise<unknown>;
  on(event: 'pause' | 'resume', listener: () => void): void;
};

const lifecycle = { pause: new Set<() => void>(), resume: new Set<() => void>() };
let sdk: Promise<OneStoreSdk | null> = Promise.resolve(null);
let connected = false;

// True once the store answered initializeAsync. No ads are connected there yet.
export const inOneStore = () => connected;

function inToss() {
  try {
    const environment = getOperationalEnvironment();
    return environment === 'toss' || environment === 'sandbox';
  } catch {
    return false;
  }
}

// Called once before the game is created. The Toss build never fetches the SDK.
export function loadOneStore() {
  if (inToss()) return;
  sdk = import(/* @vite-ignore */ SDK_URL)
    .then(async ({ createSDK }: { createSDK: () => OneStoreSdk }) => {
      const client = createSDK();
      client.on('pause', () => lifecycle.pause.forEach((listener) => listener()));
      client.on('resume', () => lifecycle.resume.forEach((listener) => listener()));
      const info = await client.initializeAsync();
      if (info.err) return null;
      connected = true;
      const root = document.documentElement;
      root.dataset.onestore = 'true';
      for (const edge of ['top', 'right', 'bottom', 'left'] as const) {
        const value = info.safeArea?.[edge];
        if (Number.isFinite(value)) root.style.setProperty(`--native-safe-${edge}`, `${Math.max(0, value!)}px`);
      }
      return client;
    })
    .catch((error: unknown) => { console.warn('[onestore]', error); return null; });
}

export function reportOneStoreLoading(progress: number) {
  void sdk.then((client) => client?.setLoadingProgress(Math.round(progress * 100)));
}

// Lifts the store's loading screen once the game can draw its first menu.
export function startOneStoreGame() {
  void sdk
    .then((client) => { client?.setLoadingProgress(100); return client?.startGameAsync(); })
    .catch((error: unknown) => console.warn('[onestore]', error));
}

export function onOneStoreLifecycle(pause: () => void, resume: () => void) {
  lifecycle.pause.add(pause);
  lifecycle.resume.add(resume);
  return () => { lifecycle.pause.delete(pause); lifecycle.resume.delete(resume); };
}
