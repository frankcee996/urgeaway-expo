/* ==========================================================================
   Injected into the WebView before your page loads. Defines
   window.CapScreenPinning and window.CapAppLock — the exact globals
   screenpinning.js and applock.js already check for (previously supplied
   by Capacitor's CI-built *-bundle.js files). Neither of those two files
   is touched; this just fills the slot they already expect, the same way
   auth-bundle.js does for sign-in.

   Each call is forwarded to React Native via postMessage, correlated by
   an id, and resolved/rejected when App.tsx calls back in via
   injectJavaScript() with the native module's result.
   ========================================================================== */
export const INJECTED_BRIDGE = `
(function () {
  if (window.__urgeawayBridgeInstalled) return true;
  window.__urgeawayBridgeInstalled = true;

  window.__bridge = { pending: {}, seq: 0 };

  window.__bridgeCall = function (kind, method, args) {
    return new Promise(function (resolve, reject) {
      var id = 'b' + (window.__bridge.seq++);
      window.__bridge.pending[id] = { resolve: resolve, reject: reject };
      window.ReactNativeWebView.postMessage(JSON.stringify({
        id: id, kind: kind, method: method, args: args || {}
      }));
    });
  };

  window.__bridgeResolve = function (id, result, error) {
    var p = window.__bridge.pending[id];
    if (!p) return;
    delete window.__bridge.pending[id];
    if (error) p.reject(new Error(error)); else p.resolve(result);
  };

  window.CapScreenPinning = {
    ScreenPinning: {
      start: function () { return window.__bridgeCall('screenpinning', 'start'); },
      stop: function () { return window.__bridgeCall('screenpinning', 'stop'); },
      isPinned: function () { return window.__bridgeCall('screenpinning', 'isPinned'); },
      openPinningSettings: function () { return window.__bridgeCall('screenpinning', 'openPinningSettings'); }
    }
  };

  // Notifications.listen()'s addListener is an event subscription, not a
  // request/response call — events arrive pushed from native (App.tsx
  // calls injectJavaScript to invoke __notifDispatch) rather than through
  // __bridgeCall's promise-per-request pattern used everywhere else.
  window.__notifListeners = { localNotificationReceived: [], localNotificationActionPerformed: [] };
  window.__notifDispatch = function (event, payload) {
    (window.__notifListeners[event] || []).forEach(function (cb) { cb(payload); });
  };

  window.CapNotifications = {
    LocalNotifications: {
      requestPermissions: function () { return window.__bridgeCall('notifications', 'requestPermissions'); },
      createChannel: function (opts) { return window.__bridgeCall('notifications', 'createChannel', opts); },
      schedule: function (opts) { return window.__bridgeCall('notifications', 'schedule', opts); },
      cancel: function (opts) { return window.__bridgeCall('notifications', 'cancel', opts); },
      getDeliveredNotifications: function () { return window.__bridgeCall('notifications', 'getDeliveredNotifications'); },
      addListener: function (event, cb) {
        window.__notifListeners[event] = window.__notifListeners[event] || [];
        window.__notifListeners[event].push(cb);
      }
    }
  };

  window.CapAppLock = {
    AppLock: {
      getInstalledApps: function () { return window.__bridgeCall('applock', 'getInstalledApps'); },
      getLockedApps: function () { return window.__bridgeCall('applock', 'getLockedApps'); },
      lockApps: function (opts) { return window.__bridgeCall('applock', 'lockApps', opts); },
      isAccessibilityEnabled: function () { return window.__bridgeCall('applock', 'isAccessibilityEnabled'); },
      getDiagnostics: function () { return window.__bridgeCall('applock', 'getDiagnostics'); },
      openAccessibilitySettings: function () { return window.__bridgeCall('applock', 'openAccessibilitySettings'); },
      openAppInfoSettings: function () { return window.__bridgeCall('applock', 'openAppInfoSettings'); }
    }
  };

  true;
})();
`;
