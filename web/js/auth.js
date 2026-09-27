/* ==========================================================================
   Auth — optional account layer on top of Firebase Authentication.

   Signing in is never required to use UrgeAway; every core feature (urge
   button, activities, journal, local history) already works with zero
   account, per the app's own privacy-first MVP principle. This exists
   purely as an opt-in extra (e.g. a future step toward optional cloud
   backup), so it lives in Settings, not onboarding or a login gate.
   ========================================================================== */

const Auth = (() => {
  let currentUser = null;
  let listeners = [];

  function available() {
    return !!(window.CapAuth && window.CapAuth.FirebaseAuthentication);
  }

  function getCurrentUser() {
    return currentUser;
  }

  function onChange(cb) {
    listeners.push(cb);
  }

  function notify() {
    listeners.forEach((cb) => { try { cb(currentUser); } catch (e) { console.error(e); } });
  }

  async function init() {
    if (!available()) return;
    const { FirebaseAuthentication } = window.CapAuth;
    try {
      const { user } = await FirebaseAuthentication.getCurrentUser();
      currentUser = user;
      notify();
    } catch (e) {
      // no signed-in user yet — not an error
    }
    FirebaseAuthentication.addListener('authStateChange', (change) => {
      currentUser = change.user || null;
      notify();
    });
  }

  // The sign-in/sign-up calls below sometimes resolve without a fully
  // populated user object even on real success (a known quirk of this
  // plugin family) — trusting that value directly caused exactly the bug
  // where the app says "Signed in" but currentUser stays empty and every
  // screen keeps showing Guest. Refetching from getCurrentUser() right
  // after is the authoritative check, so this is always used instead of
  // whatever the sign-in call itself returned.
  async function refreshCurrentUser() {
    if (!available()) return null;
    const { FirebaseAuthentication } = window.CapAuth;
    try {
      const { user } = await FirebaseAuthentication.getCurrentUser();
      currentUser = user || null;
    } catch (e) {
      currentUser = null;
    }
    notify();
    return currentUser;
  }

  async function signUpEmail(email, password) {
    if (!available()) return { ok: false, reason: 'unsupported' };
    const { FirebaseAuthentication } = window.CapAuth;
    try {
      await FirebaseAuthentication.createUserWithEmailAndPassword({ email, password });
      await refreshCurrentUser();
      if (!currentUser) return { ok: false, reason: 'error', message: 'Account created, but signing in didn\u2019t fully complete \u2014 try signing in again.' };
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: 'error', message: friendlyError(e) };
    }
  }

  async function signInEmail(email, password) {
    if (!available()) return { ok: false, reason: 'unsupported' };
    const { FirebaseAuthentication } = window.CapAuth;
    try {
      await FirebaseAuthentication.signInWithEmailAndPassword({ email, password });
      await refreshCurrentUser();
      if (!currentUser) return { ok: false, reason: 'error', message: 'Signed in, but couldn\u2019t confirm the account \u2014 try again.' };
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: 'error', message: friendlyError(e) };
    }
  }

  async function signInGoogle() {
    if (!available()) return { ok: false, reason: 'unsupported' };
    // Defensive backstop — the button that calls this is already hidden on
    // iOS in account.js, since there's no iOS Google auth setup here.
    if (window.isIOS && isIOS()) {
      return { ok: false, reason: 'unsupported', message: 'Google Sign-In isn\u2019t available on iOS in this app.' };
    }
    const { FirebaseAuthentication } = window.CapAuth;
    try {
      const res = await FirebaseAuthentication.signInWithGoogle();
      currentUser = res.user;
      notify();
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: 'error', message: friendlyError(e) };
    }
  }

  async function signOutUser() {
    if (!available()) return { ok: true };
    const { FirebaseAuthentication } = window.CapAuth;
    try {
      await FirebaseAuthentication.signOut();
      currentUser = null;
      notify();
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: 'error', message: friendlyError(e) };
    }
  }

  async function sendPasswordReset(email) {
    if (!available()) return { ok: false, reason: 'unsupported' };
    const { FirebaseAuthentication } = window.CapAuth;
    try {
      await FirebaseAuthentication.sendPasswordResetEmail({ email });
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: 'error', message: friendlyError(e) };
    }
  }

  function friendlyError(e) {
    const msg = (e && e.message) || '';
    if (/invalid-email/i.test(msg)) return 'That email address doesn\u2019t look right.';
    if (/wrong-password|invalid-credential/i.test(msg)) return 'Incorrect email or password.';
    if (/user-not-found/i.test(msg)) return 'No account found with that email.';
    if (/email-already-in-use/i.test(msg)) return 'An account already exists with that email.';
    if (/weak-password/i.test(msg)) return 'Choose a password with at least 6 characters.';
    if (/network/i.test(msg)) return 'Network error — check your connection.';
    return 'Something went wrong. Please try again.';
  }

  return { available, init, getCurrentUser, onChange, signUpEmail, signInEmail, signInGoogle, signOutUser, sendPasswordReset };
})();
