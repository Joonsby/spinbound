import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  // Must match the appName registered in the Apps in Toss console.
  appName: 'spinboundgame',
  brand: { primaryColor: '#234C48' },
  permissions: [],
  webBundleDir: 'dist',
  webView: {
    bounces: false,
    pullToRefreshEnabled: false,
    overScrollMode: 'never',
    allowsBackForwardNavigationGestures: false,
    mediaPlaybackRequiresUserAction: true,
  },
});
