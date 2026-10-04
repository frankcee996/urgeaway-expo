#!/usr/bin/env node
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const path = require('path');

const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');

let serviceAccount;
try {
  serviceAccount = require(serviceAccountPath);
} catch (e) {
  console.error(
    `Couldn't find serviceAccountKey.json at the project root.\n` +
      `See PUSH_SETUP.md — download this once from Firebase Console\n` +
      `(Project settings → Service accounts → Generate new private key) and save\n` +
      `it as serviceAccountKey.json next to package.json. Never commit this file.`
  );
  process.exit(1);
}

const [title, body] = process.argv.slice(2);
if (!title || !body) {
  console.error('Usage: node scripts/send-broadcast.js "Title" "Body text"');
  process.exit(1);
}

const app = initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);
const messaging = getMessaging(app);

async function main() {
  const snapshot = await db.collection('pushTokens').get();
  if (snapshot.empty) {
    console.log('No registered devices found in pushTokens — nothing to send.');
    return;
  }

  const tokens = snapshot.docs.map((doc) => doc.id);
  console.log(`Sending to ${tokens.length} device(s)...`);

  const chunks = [];
  for (let i = 0; i < tokens.length; i += 500) chunks.push(tokens.slice(i, i + 500));

  let successCount = 0;
  let failureCount = 0;
  const staleTokens = [];

  for (const chunk of chunks) {
    const res = await messaging.sendEachForMulticast({
      tokens: chunk,
      notification: { title, body },
    });
    successCount += res.successCount;
    failureCount += res.failureCount;
    res.responses.forEach((r, i) => {
      if (!r.success && (r.error?.code === 'messaging/invalid-registration-token' || r.error?.code === 'messaging/registration-token-not-registered')) {
        staleTokens.push(chunk[i]);
      }
    });
  }

  console.log(`Done. Sent: ${successCount}, failed: ${failureCount}.`);

  if (staleTokens.length) {
    console.log(`Removing ${staleTokens.length} stale token(s) from Firestore...`);
    await Promise.all(staleTokens.map((t) => db.collection('pushTokens').doc(t).delete()));
  }
}

main().catch((e) => {
  console.error('Broadcast failed:', e);
  process.exit(1);
});
