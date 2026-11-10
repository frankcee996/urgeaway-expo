/* ==========================================================================
   Notifications — thin wrapper around the native LocalNotifications plugin
   (exposed on window.CapNotifications by the CI-built notifications-bundle.js).
   Falls back gracefully when running in a plain browser preview, where no
   native bridge exists.
   ========================================================================== */

const Notifications = (() => {
  const REMINDER_ID = 8801;
  const CHANNEL_ID = 'urgeaway_reminders';

  // The 10 a.m. daily nudge: 50 different messages (see nudges.js), one per
  // day, no repeats until the pool is used up. Instead of one repeating
  // notification (which would show the same words forever), the next 50
  // days are scheduled individually, each with its own message, and the
  // window is topped up whenever the app opens (see refreshNudges).
  const NUDGE_COUNT = 50;
  const NUDGE_ID_BASE = 880100; // ids 880100..880149, clear of REMINDER_ID and hashId()
  const NUDGE_TOPUP_KEY = 'nudges_topup_day';
  const NUDGE_ANCHOR_KEY = 'nudge_anchor_day'; // day number the nudges first started on

  // Shown when an Urge Lock session or a Lock In Mode lock finishes —
  // drawn from Data.nextShuffledIndex so all 20 cycle through once each
  // before any repeat. Deliberately generic enough to fit either context;
  // the notification's title says which one just ended.
  const CELEBRATION_MESSAGES = [
    'You stayed with it. That\u2019s the whole game, right there.',
    'Proud of you for seeing this through.',
    'That took real resistance \u2014 well done.',
    'You did the hard part. It counts.',
    'Another one you followed through on.',
    'That\u2019s strength you can feel good about.',
    'You showed up for yourself today.',
    'Nice work \u2014 you didn\u2019t give in.',
    'That\u2019s a win, even if it didn\u2019t feel like one.',
    'You made it to the other side of that urge.',
    'Every time you do this, it gets a little easier.',
    'That\u2019s discipline in action \u2014 good on you.',
    'You kept your word to yourself.',
    'One more piece of evidence that you can do this.',
    'You outlasted it. That\u2019s what matters.',
    'Solid work sticking with the plan.',
    'You chose yourself over the urge \u2014 that\u2019s huge.',
    'That commitment just paid off.',
    'You\u2019re building something real, one of these at a time.',
    'Well earned. Take a breath and be proud of that.',
  ];

  function available() {
    return !!(window.CapNotifications && window.CapNotifications.LocalNotifications);
  }

  // Without an explicit channel, Android puts local notifications on a
  // generic "default" one whose importance varies by OEM/version — on some
  // devices that means it lands in the tray silently with no heads-up
  // banner and no sound, which is very easy to mistake for "nothing was
  // delivered at all" while testing. Force HIGH importance explicitly.
  let channelReady = false;
  async function ensureChannel() {
    if (!available() || channelReady) return;
    const { LocalNotifications } = window.CapNotifications;
    try {
      await LocalNotifications.createChannel({
        id: CHANNEL_ID,
        name: 'UrgeAway Reminders',
        description: 'Daily nudges and personal reminders from UrgeAway',
        importance: 5, // IMPORTANCE_HIGH — heads-up banner + sound
        visibility: 1,
      });
      channelReady = true;
    } catch (e) {
      console.error('Notifications.ensureChannel failed', e);
    }
  }

  async function enable() {
    if (!available()) {
      return { ok: false, reason: 'unsupported' };
    }
    const { LocalNotifications } = window.CapNotifications;
    try {
      const perm = await LocalNotifications.requestPermissions();
      if (perm.display !== 'granted') {
        return { ok: false, reason: 'denied' };
      }
      await ensureChannel();
      await scheduleNudges();
      return { ok: true };
    } catch (e) {
      console.error('Notifications.enable failed', e);
      return { ok: false, reason: 'error' };
    }
  }

  async function disable() {
    if (!available()) return { ok: true };
    try {
      const { LocalNotifications } = window.CapNotifications;
      await LocalNotifications.cancel({ notifications: allNudgeIds().map((id) => ({ id })) });
      try { Storage.remove(NUDGE_TOPUP_KEY); } catch (e) { /* non-fatal */ }
      return { ok: true };
    } catch (e) {
      console.error('Notifications.disable failed', e);
      return { ok: false };
    }
  }

  function allNudgeIds() {
    const ids = [REMINDER_ID]; // REMINDER_ID = the old single repeating daily notification
    for (let i = 0; i < NUDGE_COUNT; i++) ids.push(NUDGE_ID_BASE + i);
    return ids;
  }

  // The first time nudges are scheduled, remember that day: the 50-message
  // rounds are counted from it, so the first 50 days never repeat a message.
  function nudgeAnchor() {
    let anchor = Storage.get(NUDGE_ANCHOR_KEY, null);
    if (anchor === null) {
      anchor = nudgeDayNumber(new Date());
      Storage.set(NUDGE_ANCHOR_KEY, anchor);
    }
    return anchor;
  }

  function todayKey() {
    return new Date().toDateString();
  }

  // Schedules the next 50 mornings at 10:00, each with its own message.
  // Re-running is safe: the ids are fixed, so this replaces whatever was
  // scheduled before (including the old single repeating daily reminder,
  // which is cancelled here so nobody ends up with two at 10 a.m.).
  async function scheduleNudges() {
    if (!available()) return { ok: false, reason: 'unsupported' };
    const { LocalNotifications } = window.CapNotifications;
    await ensureChannel();
    await LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] });

    const anchor = nudgeAnchor();
    const now = Date.now();
    const entries = [];
    const day = new Date();
    day.setHours(10, 0, 0, 0);
    // If today's 10:00 has already passed, start from tomorrow.
    while (entries.length < NUDGE_COUNT) {
      if (day.getTime() > now + 30000) {
        entries.push({
          id: NUDGE_ID_BASE + entries.length,
          title: 'UrgeAway',
          body: nudgeForDate(day, anchor),
          channelId: CHANNEL_ID,
          schedule: { at: new Date(day.getTime()), allowWhileIdle: true },
        });
      }
      day.setDate(day.getDate() + 1);
    }
    await LocalNotifications.schedule({ notifications: entries });
    try { Storage.set(NUDGE_TOPUP_KEY, todayKey()); } catch (e) { /* non-fatal */ }
    return { ok: true, count: entries.length };
  }

  // Called on every app launch: keeps the rolling 50-day window full, at
  // most once per calendar day. Does nothing unless Reminders are on.
  async function refreshNudges() {
    try {
      if (!available() || typeof Data === 'undefined') return;
      if (!Data.getSettings().notificationsEnabled) return;
      if (Storage.get(NUDGE_TOPUP_KEY, null) === todayKey()) return;
      await scheduleNudges();
    } catch (e) {
      console.error('Notifications.refreshNudges failed', e);
    }
  }

  // Stable positive int ID for the OS scheduler, derived from a reminder's
  // string id — so re-scheduling the same reminder (e.g. after editing)
  // always replaces the same underlying OS notification instead of stacking.
  function hashId(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return (Math.abs(h) % 1000000000) + 2000; // offset clear of REMINDER_ID
  }

  // Schedules a one-off "you made it" notification for the exact moment an
  // Urge Lock session or a Lock In Mode lock ends — fires whether or not
  // UrgeAway is open at that moment, which is the whole point: Lock In Mode
  // locks can run for months, long after anyone's left the app open.
  // idSeed should be unique per session/lock (caller's job) so re-calling
  // this for the same one replaces its own notification instead of
  // stacking a duplicate; different sessions/locks never collide.
  // The message is pulled from Data's persisted shuffle queue, so the
  // 20-message pool cycles through once each before any repeat.
  async function scheduleCelebration({ idSeed, title, atMs }) {
    if (!available()) return { ok: false, reason: 'unsupported' };
    const { LocalNotifications } = window.CapNotifications;
    try {
      const granted = await requestPermission();
      if (!granted) return { ok: false, reason: 'denied' };
      await ensureChannel();
      const index = window.Data ? Data.nextShuffledIndex('celebration', CELEBRATION_MESSAGES.length) : 0;
      const body = CELEBRATION_MESSAGES[index];
      const id = hashId('celebrate_' + idSeed);
      await LocalNotifications.schedule({
        notifications: [
          {
            id,
            title,
            body,
            channelId: CHANNEL_ID,
            schedule: { at: new Date(atMs), allowWhileIdle: true },
          },
        ],
      });
      return { ok: true, id, body };
    } catch (e) {
      console.error('Notifications.scheduleCelebration failed', e);
      return { ok: false, reason: 'error' };
    }
  }

  // Called when the app itself is open and already showing an in-app
  // completion screen at the moment the timer ends — cancels the matching
  // scheduled notification so the person doesn't get a redundant system
  // notification for something they're already looking at. Safe to call
  // even if it already fired or was never scheduled.
  async function cancelCelebration(idSeed) {
    if (!available()) return { ok: true };
    try {
      const { LocalNotifications } = window.CapNotifications;
      await LocalNotifications.cancel({ notifications: [{ id: hashId('celebrate_' + idSeed) }] });
      return { ok: true };
    } catch (e) {
      console.error('Notifications.cancelCelebration failed', e);
      return { ok: false };
    }
  }

  async function requestPermission() {
    if (!available()) return false;
    const { LocalNotifications } = window.CapNotifications;
    const perm = await LocalNotifications.requestPermissions();
    return perm.display === 'granted';
  }

  // A personal, user-authored reminder — "for when the urge tends to hit."
  // repeatDaily: fires every day at hour:minute.
  // otherwise: fires once, at the next upcoming occurrence of hour:minute.
  async function scheduleReminder(reminder) {
    if (!available()) return { ok: false, reason: 'unsupported' };
    const { LocalNotifications } = window.CapNotifications;
    try {
      const granted = await requestPermission();
      if (!granted) return { ok: false, reason: 'denied' };
      await ensureChannel();

      const id = hashId(reminder.id);
      const schedule = reminder.repeatDaily
        ? { on: { hour: reminder.hour, minute: reminder.minute }, allowWhileIdle: true }
        : { at: nextOccurrence(reminder.hour, reminder.minute), allowWhileIdle: true };

      await LocalNotifications.schedule({
        notifications: [
          {
            id,
            title: 'UrgeAway',
            body: reminder.message,
            channelId: CHANNEL_ID,
            schedule,
          },
        ],
      });
      return { ok: true };
    } catch (e) {
      console.error('Notifications.scheduleReminder failed', e);
      return { ok: false, reason: 'error' };
    }
  }

  async function cancelReminder(reminder) {
    if (!available()) return { ok: true };
    try {
      const { LocalNotifications } = window.CapNotifications;
      await LocalNotifications.cancel({ notifications: [{ id: hashId(reminder.id) }] });
      return { ok: true };
    } catch (e) {
      console.error('Notifications.cancelReminder failed', e);
      return { ok: false };
    }
  }

  function nextOccurrence(hour, minute) {
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    return target;
  }

  // The daily reminder (and any repeatDaily custom reminder) reuses the
  // SAME underlying OS notification id every time it fires — that's what
  // lets re-scheduling replace it instead of stacking duplicates in the
  // tray. But it means a bare 'local_' + id is identical on day 1 and day
  // 30, so the history's dedup-by-id (below) would treat every firing
  // after the first as "already logged" and silently drop it — the
  // notification still reaches the phone, it just never appears in-app.
  // Scoping the id to the calendar day it fired keeps same-day duplicate
  // catches (foreground listener + tray-sync seeing the same firing)
  // deduped, while still letting each new day's firing log as its own entry.
  function dayScopedId(osId) {
    return 'local_' + osId + '_' + new Date().toDateString();
  }

  // Records what actually reached the device into the local notification
  // history shown on the Dashboard/bell (capped at 5 there). Both
  // "received" (foreground) and "tapped" (background/killed) cases feed
  // the same log, using a deterministic id so re-firing the same
  // notification never duplicates an entry.
  let listening = false;
  function listen() {
    if (!available() || listening) return;
    listening = true;
    const { LocalNotifications } = window.CapNotifications;
    // Both local reminders and Firebase pushes arrive through these two
    // events (expo-notifications reports them the same way).
    LocalNotifications.addListener('localNotificationReceived', (notification) => {
      if (window.Data) Data.addNotifToHistory({ id: dayScopedId(notification.id), title: notification.title || 'UrgeAway', body: notification.body || '', ts: notification.date });
      // Light up the bell's red dot right away if Home is what's showing.
      if (window.App && App.refreshTab) App.refreshTab('home');
    });
    LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
      const n = (action && action.notification) || {};
      if (window.Data) Data.addNotifToHistory({ id: dayScopedId(n.id), title: n.title || 'UrgeAway', body: n.body || '', ts: n.date });
      // Tapping it opens the full notification; closing that lands on the
      // history list, where it is now saved.
      if (window.App && App.handleNotificationTapped) {
        App.handleNotificationTapped({
          key: String(n.id || '') + '|' + String(n.date || ''),
          title: n.title || 'UrgeAway',
          body: n.body || '',
          ts: n.date || Date.now(),
        });
      }
    });
  }

  // getDeliveredNotifications() (below) only sees notifications that are
  // STILL sitting in the tray. If the person swipes it away, or the OS
  // clears it, before the app is next opened, it's already gone by the
  // time we ask — so it would never reach history, not even the first
  // time. But for the daily reminder and any repeatDaily custom reminder
  // we already know exactly when they were supposed to fire, so we can
  // catch those up from the clock directly, independent of whether
  // Android still has them in the shade.
  //
  // Bounded by MAX_CATCHUP so an install that's sat untouched for months
  // doesn't suddenly dump months of backlog into history in one go.
  const MAX_CATCHUP = 10;
  function occurrencesBetween(hour, minute, from, to) {
    const out = [];
    const d = new Date(from);
    d.setHours(hour, minute, 0, 0);
    if (d.getTime() <= from) d.setDate(d.getDate() + 1);
    while (d.getTime() <= to && out.length < MAX_CATCHUP) {
      out.push(d.getTime());
      d.setDate(d.getDate() + 1);
    }
    return out;
  }

  function logElapsedReminders() {
    if (!window.Data) return;
    const now = Date.now();
    const lastSync = Data.getNotifLastSync();
    // First run after installing this fix (or a fresh install) — nothing
    // to catch up on yet, just start the clock running from here.
    if (!lastSync) {
      Data.setNotifLastSync(now);
      return;
    }

    const settings = Data.getSettings();
    if (settings.notificationsEnabled) {
      occurrencesBetween(10, 0, lastSync, now).forEach((ts) => {
        // The message for a day is a pure function of the date (nudges.js),
        // so this matches what was actually scheduled for that morning.
        const message = nudgeForDate(new Date(ts), Storage.get(NUDGE_ANCHOR_KEY, 0));
        Data.addNotifToHistory({ id: 'local_' + REMINDER_ID + '_' + new Date(ts).toDateString(), title: 'UrgeAway', body: message, ts });
      });
    }

    (Data.getReminders() || []).forEach((r) => {
      if (!r.enabled || !r.repeatDaily) return;
      occurrencesBetween(r.hour, r.minute, lastSync, now).forEach((ts) => {
        Data.addNotifToHistory({ id: 'local_' + hashId(r.id) + '_' + new Date(ts).toDateString(), title: 'UrgeAway', body: r.message, ts });
      });
    });

    Data.setNotifLastSync(now);
  }

  // The two listeners above only fire while the app is open (foreground) or
  // when a notification is tapped — a notification that just sits in the
  // tray, never tapped, while the app is closed never reaches either one.
  // This asks Android directly what's currently in the tray, so it still
  // shows up in history the next time the app is opened. Combined with
  // logElapsedReminders() above so history stays accurate even if the
  // notification was already dismissed from the tray by the time we check.
  async function syncDelivered() {
    logElapsedReminders();
    if (!available()) return;
    try {
      const { LocalNotifications } = window.CapNotifications;
      const res = await LocalNotifications.getDeliveredNotifications();
      const items = (res && res.notifications) || [];
      items.forEach((n) => {
        if (window.Data) Data.addNotifToHistory({ id: dayScopedId(n.id), title: n.title || 'UrgeAway', body: n.body || '' });
      });
    } catch (e) {
      console.error('Notifications.syncDelivered failed', e);
    }
  }

  return { available, enable, disable, refreshNudges, scheduleReminder, cancelReminder, requestPermission, scheduleCelebration, cancelCelebration, listen, syncDelivered };
})();
