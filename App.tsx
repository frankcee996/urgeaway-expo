import React from 'react';
import { StyleSheet, Platform, BackHandler, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { StatusBar } from 'expo-status-bar';
import ScreenPinning from './modules/screen-pinning';
import AppLock from './modules/app-lock';
import { INJECTED_BRIDGE } from './bridge/injectedBridge';

/* ==========================================================================
   This is the entire app. It loads your original www/ (copied verbatim to
   web/, see plugins/withWebAssets.js) inside a WebView — same model as
   Capacitor: your HTML/CSS/JS is untouched and runs exactly as it always
   has. Nothing here changes any screen, color, layout, or behavior.

   Two source modes, controlled by DEV_SERVER_URL below:
   - Set DEV_SERVER_URL to your Termux http.server address (e.g.
     'http://127.0.0.1:8080') for instant reload during development in
     Expo Go — no prebuild/rebuild needed, same as the README's "try it in
     a browser" step, just inside the app shell.
   - Leave DEV_SERVER_URL null for the production path: loads the copy of
     web/ that withWebAssets.js bundled into the native app at
     `expo prebuild` time (file:///android_asset/web/index.html on
     Android). This is the offline, no-server-needed mode and needs a dev
     client / EAS build — same requirement your native plugins already
     have, not something this WebView step adds.
   ========================================================================== */
const DEV_SERVER_URL: string | null = null; // e.g. 'http://127.0.0.1:8080'

const PROD_SOURCE =
  Platform.OS === 'android'
    ? { uri: 'file:///android_asset/web/index.html' }
    : { uri: 'web/index.html' }; // iOS: after adding `ios/web` as a folder reference in Xcode (see withWebAssets.js)

export default function App() {
  const webviewRef = React.useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = React.useState(false);

  React.useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack) {
        webviewRef.current?.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  // Dispatches a bridged call (from window.CapScreenPinning / window.CapAppLock
  // inside the WebView, see bridge/injectedBridge.ts) to the real native
  // module, then injects the result back so the WebView's pending Promise
  // resolves. Screen Pinning and App Lock are Android-only, matching the
  // originals' own iOS fallback.
  const onMessage = React.useCallback((event: WebViewMessageEvent) => {
    (async () => {
      let msg: { id: string; kind: string; method: string; args?: any };
      try {
        msg = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }
      let result: unknown = null;
      let error: string | null = null;
      try {
        if (Platform.OS !== 'android') {
          throw new Error('unsupported on this platform');
        }
        if (msg.kind === 'screenpinning') {
          const fn = (ScreenPinning as any)[msg.method];
          result = await fn();
        } else if (msg.kind === 'applock') {
          const fn = (AppLock as any)[msg.method];
          result = msg.args && Object.keys(msg.args).length ? await fn(msg.args) : await fn();
        } else {
          throw new Error('unknown bridge kind: ' + msg.kind);
        }
      } catch (e: any) {
        error = e?.message || String(e);
      }
      const payload = JSON.stringify(result);
      const errPayload = error ? JSON.stringify(error) : 'null';
      webviewRef.current?.injectJavaScript(
        `window.__bridgeResolve(${JSON.stringify(msg.id)}, ${payload}, ${errPayload}); true;`
      );
    })();
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar style="light" translucent />
      <WebView
        ref={webviewRef}
        source={DEV_SERVER_URL ? { uri: DEV_SERVER_URL } : PROD_SOURCE}
        style={styles.webview}
        originWhitelist={['*']}
        allowFileAccess
        allowUniversalAccessFromFileURLs
        domStorageEnabled
        javaScriptEnabled
        injectedJavaScriptBeforeContentLoaded={INJECTED_BRIDGE}
        onMessage={onMessage}
        // localStorage under file:// / android_asset origin persists
        // across app launches the same way it did under Capacitor —
        // no extra storage bridging needed for your existing storage.js.
        onNavigationStateChange={(nav) => setCanGoBack(nav.canGoBack)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0c1626' },
  webview: { flex: 1, backgroundColor: '#0c1626' },
});
