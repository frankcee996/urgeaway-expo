import * as Notifications from 'expo-notifications';

/* ==========================================================================
   Implements the same window.CapNotifications.LocalNotifications contract
   notifications.js already expects (previously supplied by Capacitor's
   CI-built notifications-bundle.js). Uses expo-notifications — a
   first-party Expo package, no custom native module needed like App Lock
   / Screen Pinning required.

   Ids: the original uses integer ids; expo-notifications uses string
   identifiers. Stringified both ways so schedule/cancel still match up.
   ========================================================================== */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestPermissions(): Promise<{ display: 'granted' | 'denied' }> {
  const { status } = await Notifications.requestPermissionsAsync();
  return { display: status === 'granted' ? 'granted' : 'denied' };
}

export async function createChannel(opts: {
  id: string;
  name: string;
  description?: string;
  importance?: number;
}): Promise<void> {
  await Notifications.setNotificationChannelAsync(opts.id, {
    name: opts.name,
    description: opts.description,
    importance: (opts.importance ?? 4) as Notifications.AndroidImportance,
  });
}

type ScheduleEntry = {
  id: number;
  title: string;
  body: string;
  channelId?: string;
  schedule: { on?: { hour: number; minute: number }; at?: string; allowWhileIdle?: boolean };
};

export async function schedule(opts: { notifications: ScheduleEntry[] }): Promise<void> {
  for (const n of opts.notifications) {
    // Re-scheduling the same id should replace, not stack — cancel first.
    await Notifications.cancelScheduledNotificationAsync(String(n.id)).catch(() => {});
    const trigger: Notifications.NotificationTriggerInput = n.schedule.on
      ? {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: n.schedule.on.hour,
          minute: n.schedule.on.minute,
        }
      : {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(n.schedule.at as string),
        };
    await Notifications.scheduleNotificationAsync({
      identifier: String(n.id),
      content: { title: n.title, body: n.body, data: { channelId: n.channelId } },
      trigger,
    });
  }
}

export async function cancel(opts: { notifications: { id: number }[] }): Promise<void> {
  for (const n of opts.notifications) {
    await Notifications.cancelScheduledNotificationAsync(String(n.id)).catch(() => {});
  }
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

// Pushes native notification events into the WebView via
// window.__notifDispatch (see bridge/injectedBridge.ts) — these are
// fire-and-forget events, not request/response bridge calls.
export function listen(injectJavaScript: (script: string) => void) {
  Notifications.addNotificationReceivedListener((notification) => {
    const payload = {
      id: notification.request.identifier,
      title: notification.request.content.title || '',
      body: notification.request.content.body || '',
    };
    injectJavaScript(`window.__notifDispatch('localNotificationReceived', ${JSON.stringify(payload)}); true;`);
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
    injectJavaScript(`window.__notifDispatch('localNotificationActionPerformed', ${JSON.stringify(payload)}); true;`);
  });
}
