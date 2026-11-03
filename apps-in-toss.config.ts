import { defineConfig, type AppsInTossConfig } from '@apps-in-toss/web-framework/config';

// Toss reads webView.type from the bundle to tell a game ('game') from a non-game ('partner'). SDK 3.x
// left `type` out of the config's types, so it is cast in; without it the bundle counts as a non-game.
const webView = {
  type: 'game',
  bounces: false,
  pullToRefreshEnabled: false,
  overScrollMode: 'never',
  allowsBackForwardNavigationGestures: false,
  mediaPlaybackRequiresUserAction: true,
} as AppsInTossConfig['webView'];

export default defineConfig({
  // Must match the appName registered in the Apps in Toss console.
  appName: 'spinbound',
  brand: { primaryColor: '#234C48' },
  permissions: [],
  webBundleDir: 'dist',
  webView,
});
