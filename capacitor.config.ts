import type { CapacitorConfig } from '@capacitor/cli';

// Android app (APK) wrapping the same dist the web and Toss builds ship.
const config: CapacitorConfig = {
  appId: 'com.fitplate.spinbound',
  appName: '스핀바운드',
  webDir: 'dist',
  // index.html already asks for viewport-fit=cover; saying so up front avoids a layout jump at launch.
  plugins: { SystemBars: { initialViewportFitValueHint: 'cover' } },
};

export default config;
