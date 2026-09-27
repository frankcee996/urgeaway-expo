/* Generated bridge for window.CapAuth (email/password only, per current
   scope) — index.html already loads this file by name, expecting it to
   define window.CapAuth before auth.js runs, exactly like Capacitor's
   CI-built auth-bundle.js did. That original one wraps the
   @capacitor-firebase/authentication native plugin, which has no Expo/
   WebView equivalent. Email/password auth is plain HTTPS though — no
   native code needed — so this uses the Firebase Web SDK against your
   real project (config below is your public web API key from
   firebase/google-services.json; Firebase web API keys are not secrets,
   they're restricted server-side by Firebase's own rules).

   auth.js, account.js, and index.html are untouched — this only fills in
   the same window.CapAuth shape they already look for. */
(function () {
  var FIREBASE_CONFIG = {
    apiKey: 'AIzaSyD8mxKBDx46TypaMvhr3P-BOzIwQD9U4Og',
    authDomain: 'scholarix-d9c7c.firebaseapp.com',
    projectId: 'scholarix-d9c7c',
    storageBucket: 'scholarix-d9c7c.firebasestorage.app',
    messagingSenderId: '297659522394',
    appId: '1:297659522394:android:c763aaf72f1a7252e96763',
  };
  var CDN = 'https://www.gstatic.com/firebasejs/10.13.2/';

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function toUser(u) {
    return { uid: u.uid, email: u.email, displayName: u.displayName };
  }

  loadScript(CDN + 'firebase-app-compat.js')
    .then(function () {
      return loadScript(CDN + 'firebase-auth-compat.js');
    })
    .then(function () {
      firebase.initializeApp(FIREBASE_CONFIG);
      var auth = firebase.auth();
      var listeners = [];

      auth.onAuthStateChanged(function (user) {
        listeners.forEach(function (cb) {
          cb({ user: user ? toUser(user) : null });
        });
      });

      window.CapAuth = {
        FirebaseAuthentication: {
          getCurrentUser: function () {
            var u = auth.currentUser;
            return Promise.resolve({ user: u ? toUser(u) : null });
          },
          addListener: function (name, cb) {
            if (name === 'authStateChange') listeners.push(cb);
          },
          createUserWithEmailAndPassword: function (opts) {
            return auth.createUserWithEmailAndPassword(opts.email, opts.password);
          },
          signInWithEmailAndPassword: function (opts) {
            return auth.signInWithEmailAndPassword(opts.email, opts.password);
          },
          signInWithGoogle: function () {
            // Out of scope for now (email/password only) — this rejects
            // so signInGoogle()'s existing catch handles it the same way
            // it already handles any other provider error.
            return Promise.reject(new Error('signInWithGoogle not available in this build'));
          },
          signOut: function () {
            return auth.signOut();
          },
          sendPasswordResetEmail: function (opts) {
            return auth.sendPasswordResetEmail(opts.email);
          },
        },
      };
    })
    .catch(function (e) {
      console.error('Firebase auth bridge failed to load (offline?)', e);
      // window.CapAuth stays undefined on failure — auth.js's existing
      // available() check already handles that exactly like the app not
      // having the plugin at all, by design (e.g. no network yet).
    });
})();
