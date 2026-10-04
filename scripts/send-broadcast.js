#!/usr/bin/env node
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { Expo } = require('expo-server-sdk');
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
const expo = new Expo();

async function main() {
  const snapshot = await db.collection('pushTokens').get();
  if (snapshot.empty) {
    console.log('No registered devices found in pushTokens — nothing to send.');
    return;
  }

  const tokenDocs = snapshot.docs.map((doc) => doc.id);
  const validTokens = tokenDocs.filter((t) => Expo.isExpoPushToken(t));
  const invalidTokens = tokenDocs.filter((t) => !Expo.isExpoPushToken(t));

  if (invalidTokens.length) {
    console.log(`Skipping ${invalidTokens.length} token(s) that aren't valid Expo push tokens (stale format?).`);
  }
  if (!validTokens.length) {
    console.log('No valid Expo push tokens to send to.');
    return;
  }

  console.log(`Sending to ${validTokens.length} device(s)...`);

  const messages = validTokens.map((token) => ({ to: token, sound: 'default', title, body }));
  const chunks = expo.chunkPushNotifications(messages);
  const tickets = [];

  for (const chunk of chunks) {
    try {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...ticketChunk);
    } catch (e) {
      console.error('Error sending a chunk:', e);
    }
  }

  const staleTokens = [];
  tickets.forEach((ticket, i) => {
    if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
      staleTokens.push(validTokens[i]);
    }
  });

  const successCount = tickets.filter((t) => t.status === 'ok').length;
  console.log(`Done. Accepted: ${successCount}/${tickets.length}.`);

  if (staleTokens.length) {
    console.log(`Removing ${staleTokens.length} stale token(s) from Firestore...`);
    await Promise.all(staleTokens.map((t) => db.collection('pushTokens').doc(t).delete()));
  }
}

main().catch((e) => {
  console.error('Broadcast failed:', e);
  process.exit(1);
});
