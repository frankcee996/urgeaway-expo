/* ==========================================================================
   withWebAssets — copies web/ (your original, untouched www/ folder) into
   the native project during `expo prebuild`, exactly like `npx cap sync`
   copies www/ into android/app/src/main/assets and the iOS app bundle for
   Capacitor. Runs as a plain Node filesystem copy — never touches Metro,
   never parses your .js/.css/.html files as anything but bytes to copy.
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function withWebAssetsAndroid(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const src = path.join(config.modRequest.projectRoot, 'web');
      const dest = path.join(config.modRequest.platformProjectRoot, 'app', 'src', 'main', 'assets', 'web');
      copyDir(src, dest);
      return config;
    },
  ]);
}

function withWebAssetsIos(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const src = path.join(config.modRequest.projectRoot, 'web');
      const dest = path.join(config.modRequest.platformProjectRoot, 'web');
      copyDir(src, dest);
      // Note: on iOS this copies the folder next to the Xcode project. To
      // actually bundle it into the app, add `web` as a folder reference
      // (blue folder, not yellow group) in Xcode so it's copied verbatim
      // into the app bundle rather than compiled — File > Add Files to
      // "App" > select the `ios/web` folder > "Create folder references".
      // This one manual step is needed once; expo prebuild --clean will
      // re-copy the files but won't re-add the Xcode reference if it's
      // already there.
      return config;
    },
  ]);
}

module.exports = function withWebAssets(config) {
  config = withWebAssetsAndroid(config);
  config = withWebAssetsIos(config);
  return config;
};
