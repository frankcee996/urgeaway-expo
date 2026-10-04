import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/* ==========================================================================
   Implements window.CapPush.PushNotifications (push.js already expects
   this exact shape — previously Capacitor's CI-built push-bundle.js).

   Device side only: gets a real FCM token and stores it in Firestore so
   it can be broadcast to later via Firebase Cloud Messaging directly
   (not through Expo's push relay). scripts/send-broadcast.js (project
   root) reads the `pushTokens` collection and sends to every token via
   the Firebase Admin SDK's messaging() API — see that file and
   PUSH_SETUP.md for the one-time setup only you can do (Firestore rules,
   service account key).
   ========================================================================== */

const FIRESTORE_PROJECT_ID = 'scholarix-d9c7c';

async function saveToken(token: string) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/pushTokens?documentId=${encodeURIComponent(token)}`;
  const body = {
    fields: {
      token: { stringValue: token },
      platform: { stringValue: Platform.OS },
      registeredAt: { timestampValue: new Date().toISOString() },
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Firestore token save failed (${res.status}): ${text.slice(0, 200)}`);
  }
}

export async function checkPermissions(): Promise<{ receive: 'granted' | 'denied' | 'prompt' }> {
  const { status } = await Notifications.getPermissionsAsync();
  return { receive: status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'prompt' };
}

export async function requestPermissions(): Promise<{ receive: 'granted' | 'denied' }> {
  const { status } = await Notifications.requestPermissionsAsync();
  return { receive: status === 'granted' ? 'granted' : 'denied' };
}

export async function register(): Promise<void> {
  const { data: token } = await Notifications.getDevicePushTokenAsync();
  await saveToken(token);
}

export async function getDeliveredNotifications(): Promise<{
  notifications: { id: string; title: string; body: string }[];
}> {
  const presented = await Notifications.getPresentedNotificationsAsync();
  return {
    notifications: presented.map((p) => ({
      id: p.request.identifier,
      title: p.request.content.title || '',
      body: p.request.content.body || '',
    })),
  };
}

// Same fire-and-forget event pattern as bridge/notifications.ts — pushed
// into the WebView via window.__pushDispatch, defined in injectedBridge.ts.
export function listen(injectJavaScript: (script: string) => void) {
  Notifications.addNotificationReceivedListener((notification) => {
    const payload = {
      id: notification.request.identifier,
      title: notification.request.content.title || '',
      body: notification.request.content.body || '',
    };
    injectJavaScript(`window.__pushDispatch('pushNotificationReceived', ${JSON.stringify(payload)}); true;`);
  });

  Notifications.addNotificationResponseReceivedListener((response) => {
    const n = response.notification;
    const payload = {
      notification: {
        id: n.request.identifier,
        title: n.request.content.title || '',
        body: n.request.content.body || '',
      },
    };
    injectJavaScript(`window.__pushDispatch('pushNotificationActionPerformed', ${JSON.stringify(payload)}); true;`);
  });
}
