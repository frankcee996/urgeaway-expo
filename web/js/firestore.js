/* ==========================================================================
   Firestore — best-effort backend sync, used for exactly one thing right
   now: saving first name, last name, and gender to `users/{uid}` for
   people who are signed in. Deliberately narrow in scope:

   - Only ever called when there's a real signed-in Firebase user (a uid
     to attach the document to). Guests stay fully local, same as
     everything else in the app.
   - Only syncs the three fields above, plus email (already visible to
     Firebase via Auth itself) — never journal entries, sessions, triggers,
     setbacks, or anything else the app tracks. Those stay device-only.
   - Failures are silent/non-blocking — this is a nice-to-have sync, not
     something any feature depends on. The local copy (storage.js) is
     always the source of truth for what the app actually displays.
   ========================================================================== */

const Firestore = (() => {
  function available() {
    return !!(window.CapFirestore && window.CapFirestore.FirebaseFirestore);
  }

  async function saveProfile({ uid, firstName, lastName, gender, email }) {
    if (!available() || !uid) return false;
    try {
      const { FirebaseFirestore } = window.CapFirestore;
      await FirebaseFirestore.setDocument({
        reference: `users/${uid}`,
        data: {
          firstName: firstName || '',
          lastName: lastName || '',
          gender: gender || '',
          email: email || '',
          updatedAt: new Date().toISOString(),
        },
        merge: true,
      });
      return true;
    } catch (e) {
      console.error('Firestore.saveProfile failed', e);
      return false;
    }
  }

  return { available, saveProfile };
})();
