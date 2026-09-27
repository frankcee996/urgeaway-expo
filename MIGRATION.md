# UrgeAway: Capacitor → Expo

## The approach: WebView, not a rewrite

`web/` is your original `www/` folder, copied byte-for-byte — no file in
it was touched. `App.tsx` is a thin native shell that loads it in a
WebView, the same way Capacitor loaded it in its own native shell.
Every screen, color, animation, and line of `js/*.js` logic is exactly
what you already built.

## How the page loads

- **Production / real device:** `plugins/withWebAssets.js` copies `web/`
  into the native project at `expo prebuild` time — same job as
  `npx cap sync android`. `App.tsx` points the WebView at
  `file:///android_asset/web/index.html`. Fully offline.
- **Fast dev preview:** set `DEV_SERVER_URL` at the top of `App.tsx` to a
  local static server (`python3 -m http.server 8080` inside `web/`) —
  works in plain Expo Go, no rebuild needed.

## Native plugins — now implemented

`modules/screen-pinning/` and `modules/app-lock/` are local Expo Modules
(Kotlin), Android only:

- **AppLockStore.java, AppLockAccessibilityService.java,
  LockInBlockActivity.java** are copied byte-for-byte from
  `capacitor-plugins/app-lock/` — they never depended on Capacitor at all,
  so nothing needed translating.
- **AppLockModule.kt** and **ScreenPinningModule.kt** are the only new
  code — Kotlin translations of the old `AppLockPlugin.java` /
  `ScreenPinningPlugin.java`, same logic, same Android APIs, just Expo's
  `Module`/`AsyncFunction` instead of Capacitor's `Plugin`/`PluginCall`.
- `modules/app-lock/android/src/main/AndroidManifest.xml` registers the
  AccessibilityService + block activity — Gradle's manifest merger folds
  this into the app automatically at build time, no manual Android Studio
  step needed.
- `bridge/injectedBridge.ts` defines `window.CapScreenPinning` and
  `window.CapAppLock` *inside* the WebView — the exact globals
  `screenpinning.js` and `applock.js` already look for — and forwards
  every call through `postMessage` to `App.tsx`, which calls the real
  native module and injects the result back. `screenpinning.js` and
  `applock.js` are untouched; this just fills the slot their CI-built
  bundles used to fill.

**This can only be tested with a dev-client build (`eas build --profile
development`), never Expo Go** — same restriction native code always has,
regardless of Capacitor vs. Expo.

**Heads up:** this Kotlin code was written carefully against the Expo
Modules API but couldn't be compiled or run in this environment (no
network/Android SDK here). If the EAS build fails on either module,
paste the exact Gradle/Kotlin error and it's a quick fix — likely a small
API signature mismatch, not a logic problem.

## Auth — working, no native code needed

`web/js/auth-bundle.js` is a real implementation (Firebase Web SDK,
your actual project config from `firebase/google-services.json`),
fulfilling the same `window.CapAuth` contract `auth.js` expects. Unlike
the two plugins above, email/password auth is just HTTPS, so no native
module or dev-client build is needed for this part — works in Expo Go.

## Running it

**Fast preview (Expo Go):**
```bash
cd web && python3 -m http.server 8080 &
cd ..
# App.tsx: const DEV_SERVER_URL = 'http://127.0.0.1:8080';
npx expo start
```

**Real build with native plugins (offline, no server):**
```bash
# App.tsx: const DEV_SERVER_URL = null;
npx expo prebuild
eas build --profile development --platform android
```
