import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.haloframe.app',
  appName: 'haloFrame',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    // During dev, set `CAPACITOR_LIVE_URL=https://<your-tunnel>.ngrok.io`
    // in your shell and rerun `npx cap sync` to point native shells at
    // your laptop. Unset (prod): the native shell loads the bundled dist/.
    url: process.env.CAPACITOR_LIVE_URL ?? undefined,
    cleartext: false,
  },
  ios: {
    contentInset: 'always',
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#FAF3E2',
      androidSplashResourceName: 'splash',
      splashFullScreen: true,
      splashImmersive: true,
    },
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
