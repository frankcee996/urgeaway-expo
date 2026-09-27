/* ==========================================================================
   Storage — thin wrapper around localStorage.
   Everything UrgeAway knows about a person lives only on their device.
   Nothing here ever leaves via network; there is no network code at all.
   ========================================================================== */

const Storage = (() => {
  const PREFIX = 'urgeaway:';

  function get(key, fallback) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.error('Storage.get failed', key, e);
      return fallback;
    }
  }

  function set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('Storage.set failed', key, e);
      return false;
    }
  }

  function remove(key) {
    localStorage.removeItem(PREFIX + key);
  }

  function clearAll() {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  }

  return { get, set, remove, clearAll };
})();

/* ---------- Domain-level helpers built on top of Storage ---------- */

const Data = (() => {
  const KEYS = {
    ONBOARDED: 'onboarded',
    SETTINGS: 'settings',
    SESSIONS: 'sessions',       // completed activity sessions
    JOURNAL: 'journal',         // journal entries
    STREAK: 'streak',
    PREFERRED_ACTIVITIES: 'preferred_activities', // from onboarding
    REMINDERS: 'custom_reminders', // user-set "for when the urge tends to hit" alarms
    REACH_OUT: 'reach_out_contact',
    REASONS: 'my_reasons',
    STREAK_PROTECTING: 'streak_protecting',
    LOGIN_PROMPT_SHOWN: 'login_prompt_shown',
    NOTIF_PERMISSION_ASKED: 'notif_permission_asked',
    NOTIF_BANNER_SHOWN: 'notif_banner_shown',
    APP_OPENS: 'app_opens', // { totalDays, lastDate } — distinct days the app was opened
    URGE_LOCK_SESSION: 'urge_lock_session', // the current/most recent Urge Lock session
    URGE_LOCK_SETUP_DONE: 'urge_lock_setup_done', // been through the Screen Pinning setup flow at least once
    PROFILE_NAME: 'profile_name',
    PROFILE_PIC: 'profile_pic', // base64 data URL, stored locally only — never uploaded
    NOTIF_HISTORY: 'notif_history', // last 10 { id, title, body, ts }, newest first
    NOTIF_LAST_VIEWED: 'notif_last_viewed', // timestamp the notification bell page was last opened
    NOTIF_LAST_SYNC: 'notif_last_sync', // timestamp last checked for scheduled reminders that should have fired by now
    MSG_SHUFFLE: 'msg_shuffle_queues', // { [kind]: number[] } remaining shuffled message-pool indices, per kind
    ANALYTICS_ENABLED: 'analytics_enabled', // opt-in flag for anonymous usage analytics — see analytics.js
    ANALYTICS_PROMPT_SHOWN: 'analytics_prompt_shown', // one-time first-launch nudge, see app.js maybeShowAnalyticsPrompt
    SETBACKS: 'setbacks', // { id, date, trigger, whatHappened, whatDifferent } — see addSetback
    CHECKINS: 'checkins', // { id, date, mood } — standalone daily check-ins, not tied to an urge
    REASONS_LAST_VIEWED: 'reasons_last_viewed_date', // date string, for the "review your reason" daily mission
    WALK_DONE_DATES: 'walk_done_dates', // date strings — self-reported "took a short walk" mission, off-app so it can't be auto-detected
    SUPPORT_USED: 'support_used', // { count } — times Reach Out / Get Support was used, see recordSupportUsed
    PROFILE_FIRST_NAME: 'profile_first_name',
    PROFILE_LAST_NAME: 'profile_last_name',
    PROFILE_GENDER: 'profile_gender', // 'male' | 'female' | '' — asked once at onboarding, never required
    JOURNAL_DRAFT: 'journal_draft', // { prompt, text, mood } — autosaved in-progress entry, see getJournalDraft
  };

  // Urge Lock duration mapping — intensity determines duration, never a
  // manual choice. 1-6 don't reach this map at all (no lock).
  const URGE_LOCK_DURATIONS_SEC = { 7: 5 * 60, 8: 8 * 60, 9: 12 * 60, 10: 15 * 60 };

  const defaultSettings = {
    notificationsEnabled: false,
    haptics: true,
    pushEnabled: false,
    theme: 'system', // 'system' | 'light' | 'dark'
  };

  function isOnboarded() {
    return !!Storage.get(KEYS.ONBOARDED, false);
  }
  function setOnboarded(prefs) {
    Storage.set(KEYS.ONBOARDED, true);
    if (prefs) Storage.set(KEYS.PREFERRED_ACTIVITIES, prefs);
  }

  function getSettings() {
    return Object.assign({}, defaultSettings, Storage.get(KEYS.SETTINGS, {}));
  }
  function setSettings(patch) {
    const merged = Object.assign({}, getSettings(), patch);
    Storage.set(KEYS.SETTINGS, merged);
    return merged;
  }

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  // todayStr() above is intentionally unpadded (matches how STREAK/APP_OPENS
  // already store it) — but session/journal/check-in dates are full ISO
  // strings, so comparing "is this ISO date today" needs its own check
  // rather than string-slicing against todayStr(), which would silently
  // mismatch on any single-digit month or day.
  function isToday(isoDateStr) {
    if (!isoDateStr) return false;
    const d = new Date(isoDateStr);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  }

  // A "session" is one completed activity: { id, activityId, category, date(iso), durationSec, outcome, fromUrgeMode }
  function getSessions() {
    return Storage.get(KEYS.SESSIONS, []);
  }
  function addSession(session) {
    const sessions = getSessions();
    const entry = Object.assign(
      { id: 'sess_' + Date.now() + '_' + Math.floor(Math.random() * 1000), date: new Date().toISOString() },
      session
    );
    sessions.push(entry);
    Storage.set(KEYS.SESSIONS, sessions);
    updateStreak();
    // Urge Lock already logs its own dedicated event (see urgelock.js) —
    // skip it here so it isn't double-counted under both names.
    if (window.Analytics && entry.category !== 'urge-lock') {
      Analytics.logActivityCompleted(entry.category || entry.activityId || 'unknown');
    }
    return entry;
  }

  function getTodaySessions() {
    const today = todayStr();
    return getSessions().filter((s) => {
      const d = new Date(s.date);
      return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` === today;
    });
  }

  function getUrgeSessionsToday() {
    return getTodaySessions().filter((s) => s.fromUrgeMode);
  }

  function updateStreak() {
    const streak = Storage.get(KEYS.STREAK, { count: 0, lastDate: null });
    const today = todayStr();
    if (streak.lastDate === today) return streak; // already counted today
    const yesterday = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    })();
    if (streak.lastDate === yesterday) {
      streak.count += 1;
    } else {
      streak.count = 1;
    }
    streak.lastDate = today;
    Storage.set(KEYS.STREAK, streak);
    return streak;
  }
  function getStreak() {
    const s = Storage.get(KEYS.STREAK, { count: 0, lastDate: null });
    // if last active day isn't today or yesterday, streak is effectively broken but we
    // don't zero it destructively here — just report it plainly, no shaming.
    return s;
  }

  // How many distinct days someone has opened the app at all — "showing up"
  // counts toward Resistance Level even on days with no logged session.
  function recordAppOpen() {
    const rec = Storage.get(KEYS.APP_OPENS, { totalDays: 0, lastDate: null, firstDate: null });
    const today = todayStr();
    if (rec.lastDate === today) return rec; // already counted today
    rec.totalDays += 1;
    rec.lastDate = today;
    if (!rec.firstDate) rec.firstDate = today;
    Storage.set(KEYS.APP_OPENS, rec);
    return rec;
  }
  function getAppOpens() {
    return Storage.get(KEYS.APP_OPENS, { totalDays: 0, lastDate: null });
  }

  // Journal: { id, date(iso), prompt, text }
  function getJournalEntries() {
    return Storage.get(KEYS.JOURNAL, []).sort((a, b) => new Date(b.date) - new Date(a.date));
  }
  function addJournalEntry(prompt, text, mood) {
    const entries = Storage.get(KEYS.JOURNAL, []);
    const entry = { id: 'jrnl_' + Date.now(), date: new Date().toISOString(), prompt, text, mood: mood || null };
    entries.push(entry);
    Storage.set(KEYS.JOURNAL, entries);
    return entry;
  }
  function updateJournalEntry(id, changes) {
    const entries = Storage.get(KEYS.JOURNAL, []);
    const idx = entries.findIndex((e) => e.id === id);
    if (idx === -1) return null;
    entries[idx] = Object.assign({}, entries[idx], changes, { editedAt: new Date().toISOString() });
    Storage.set(KEYS.JOURNAL, entries);
    return entries[idx];
  }
  function deleteJournalEntry(id) {
    const entries = Storage.get(KEYS.JOURNAL, []).filter((e) => e.id !== id);
    Storage.set(KEYS.JOURNAL, entries);
  }

  // Autosave for an in-progress, not-yet-saved entry — so closing the app
  // (or just navigating to another tab) mid-thought doesn't lose it. Wiped
  // the moment a real entry is saved from it.
  function getJournalDraft() {
    return Storage.get(KEYS.JOURNAL_DRAFT, null);
  }
  function setJournalDraft(draft) {
    Storage.set(KEYS.JOURNAL_DRAFT, draft);
  }
  function clearJournalDraft() {
    Storage.remove(KEYS.JOURNAL_DRAFT);
  }

  // Consecutive days ending today or yesterday with at least one entry —
  // purely informational, never shown as something that "breaks" (per the
  // Journal spec: missing a day should never feel like a penalty).
  function getJournalWritingStreak() {
    const days = new Set(getJournalEntries().map((e) => new Date(e.date).toDateString()));
    let count = 0;
    let cursor = new Date();
    if (!days.has(cursor.toDateString())) cursor.setDate(cursor.getDate() - 1); // allow "yesterday" to still count as current
    while (days.has(cursor.toDateString())) {
      count += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  }

  // Light, honest, keyword/mood-frequency observations about the person's
  // own writing — not AI analysis, nothing leaves the device, and nothing
  // here is a diagnosis or a guess about *why* someone feels something.
  // Gated by sample size so a couple of entries never gets over-read as a
  // pattern. See the Journal spec's own privacy rule for this feature.
  const JOURNAL_INSIGHT_WORDS = ['stress', 'stressed', 'anxious', 'anxiety', 'tired', 'lonely', 'alone', 'angry', 'sad', 'overwhelmed', 'grateful', 'proud', 'goal', 'goals', 'trigger', 'triggered', 'help', 'helped', 'better', 'calm'];
  function getJournalInsights() {
    const entries = getJournalEntries();
    if (entries.length < 3) return [];
    const insights = [];
    const wordCounts = {};
    entries.forEach((e) => {
      const lower = (e.text || '').toLowerCase();
      JOURNAL_INSIGHT_WORDS.forEach((w) => {
        if (lower.includes(w)) wordCounts[w] = (wordCounts[w] || 0) + 1;
      });
    });
    const [topWord, topCount] = Object.entries(wordCounts).sort((a, b) => b[1] - a[1])[0] || [];
    if (topWord && topCount >= 3) {
      insights.push(`You've mentioned "${topWord}" in ${topCount} of your last ${entries.length} entries.`);
    }
    const moods = entries.filter((e) => e.mood).map((e) => e.mood);
    if (moods.length >= 3) {
      const moodCounts = {};
      moods.forEach((m) => { moodCounts[m] = (moodCounts[m] || 0) + 1; });
      const [topMood, topMoodCount] = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0];
      if (topMoodCount / moods.length >= 0.4) {
        insights.push(`"${topMood}" has been your most-picked mood while journaling lately.`);
      }
    }
    if (entries.length >= 10) {
      insights.push(`You've made time to write ${entries.length} entries \u2014 that consistency matters.`);
    }
    return insights;
  }

  function isLoginPromptShown() {
    return !!Storage.get(KEYS.LOGIN_PROMPT_SHOWN, false);
  }
  function setLoginPromptShown() {
    Storage.set(KEYS.LOGIN_PROMPT_SHOWN, true);
  }

  // One-tap reach out: a trusted contact configured once, used during a hard
  // moment to open a pre-filled message with a single tap.
  function getReachOutContact() {
    return Storage.get(KEYS.REACH_OUT, null); // { platform, identifier, message }
  }
  function setReachOutContact(contact) {
    Storage.set(KEYS.REACH_OUT, contact);
  }

  // My Reasons: written once, in a calm moment, shown back during an urge.
  function getReasons() {
    return Storage.get(KEYS.REASONS, []);
  }
  function addReason(text) {
    const list = getReasons();
    list.push(text);
    Storage.set(KEYS.REASONS, list);
    return list;
  }
  function deleteReason(index) {
    const list = getReasons();
    list.splice(index, 1);
    Storage.set(KEYS.REASONS, list);
    return list;
  }

  // Four honest, real-data axes for the Progress tab's radar chart.
  // Nothing here is invented — each axis is a normalized (0-100) view of
  // data the app already tracks, just capped so early usage doesn't
  // instantly max out an axis and late usage doesn't need an unrealistic
  // amount to fill it:
  //   Consistency — current streak, capped at 30 days
  //   Resilience  — % of logged urge sessions that ended "better"
  //   Engagement  — total completed sessions/activities, capped at 40
  //   Reflection  — journal entries written, capped at 20
  function getGrowthAxes() {
    const streak = getStreak();
    const rl = getResistanceStats();
    const sessionCount = getSessions().length;
    const journalCount = getJournalEntries().length;
    const cap = (n, max) => Math.round(Math.min(100, (n / max) * 100));
    return [
      { label: 'Consistency', value: cap(streak.count, 30) },
      { label: 'Resilience', value: rl.totalUrgeSessions ? rl.percentResisted : 0 },
      { label: 'Engagement', value: cap(sessionCount, 40) },
      { label: 'Reflection', value: cap(journalCount, 20) },
    ];
  }

  function getResistanceTiers() {
    return RESISTANCE_TIERS.map((t) => ({ level: t.level, name: t.name, min: t.min }));
  }

  /* ---------- Support usage (for the "Support sessions" stat card) ----------
     Counts times the person actually reached for help — the Reach Out
     quick-message and the Get Support screen — rather than fabricating a
     number. See app.js's triggerReachOut()/openSupport(). */
  function recordSupportUsed() {
    const rec = Storage.get(KEYS.SUPPORT_USED, { count: 0 });
    rec.count += 1;
    Storage.set(KEYS.SUPPORT_USED, rec);
  }
  function getSupportUsedCount() {
    return Storage.get(KEYS.SUPPORT_USED, { count: 0 }).count;
  }

  /* ---------- Achievements ----------
     Every achievement is derived live from real stored data — nothing is
     a separate "unlocked" flag that could drift out of sync with what
     actually happened. Where a real date is available (the Nth entry that
     crossed the threshold), it's shown; thresholds built from monotonic
     counts (session/journal/app-open totals, which only ever grow) so an
     earned badge can never later un-earn itself the way a live streak
     count could.
     "Bounced Back" is deliberately framed as a positive milestone, not a
     penalty — consistent with how setbacks are treated everywhere else in
     the app (see addSetback's doc comment). */
  function getAchievements() {
    const sessions = getSessions().slice().sort((a, b) => new Date(a.date) - new Date(b.date));
    const journal = getJournalEntries().slice().sort((a, b) => new Date(a.date) - new Date(b.date));
    const appOpens = getAppOpens();
    const resisted = sessions.filter((s) => s.fromUrgeMode && (s.outcome === 'better' || s.outcome === 'a_little_better'));
    const nightResisted = resisted.find((s) => { const h = new Date(s.date).getHours(); return h >= 22 || h < 5; });
    const setbacks = getSetbacks();

    const defs = [
      { id: 'first-step', title: 'First Step', desc: 'Completed your first activity.', done: sessions.length >= 1, date: sessions[0] && sessions[0].date },
      { id: 'reflective', title: 'Reflective', desc: 'Wrote 5 journal entries.', done: journal.length >= 5, date: journal[4] && journal[4].date },
      { id: 'deep-reflection', title: 'Deep Reflection', desc: 'Wrote 20 journal entries.', done: journal.length >= 20, date: journal[19] && journal[19].date },
      { id: 'week-strong', title: 'Week Strong', desc: 'Opened UrgeAway on 7 different days.', done: appOpens.totalDays >= 7 },
      { id: 'month-shown-up', title: 'A Month of Showing Up', desc: 'Opened UrgeAway on 30 different days.', done: appOpens.totalDays >= 30 },
      { id: 'resilient', title: 'Resilient', desc: 'Made it through 10 urges feeling better.', done: resisted.length >= 10, date: resisted[9] && resisted[9].date },
      { id: 'night-guardian', title: 'Night Guardian', desc: 'Handled a late-night urge.', done: !!nightResisted, date: nightResisted && nightResisted.date },
      { id: 'reached-out', title: 'Reached Out', desc: "Used Reach Out or Get Support \u2014 you don't have to do this alone.", done: getSupportUsedCount() >= 1 },
      { id: 'bounced-back', title: 'Bounced Back', desc: 'Faced a difficult moment and kept going.', done: setbacks.length >= 1, date: setbacks.length ? setbacks[setbacks.length - 1].date : null },
    ];
    return defs;
  }

  function getStreakProtecting() {
    return Storage.get(KEYS.STREAK_PROTECTING, '');
  }
  function setStreakProtecting(text) {
    Storage.set(KEYS.STREAK_PROTECTING, text);
  }

  /* ---------------- Setbacks (Better Setback & Restart Handling) ----------------
     A setback is never destructive — it doesn't touch streak/points, and
     it's stored so the Recovery Timeline can show it as part of the real
     story ("a difficult moment — and a return"), not hide it. */
  function getSetbacks() {
    return Storage.get(KEYS.SETBACKS, []).sort((a, b) => new Date(b.date) - new Date(a.date));
  }
  function addSetback({ trigger, whatHappened, whatDifferent }) {
    const list = Storage.get(KEYS.SETBACKS, []);
    const entry = {
      id: 'setback_' + Date.now(),
      date: new Date().toISOString(),
      trigger: trigger || null,
      whatHappened: whatHappened || '',
      whatDifferent: whatDifferent || '',
    };
    list.push(entry);
    Storage.set(KEYS.SETBACKS, list);
    return entry;
  }

  /* ---------------- Check-ins (standalone, not urge-triggered) ---------------- */
  function getCheckIns() {
    return Storage.get(KEYS.CHECKINS, []).sort((a, b) => new Date(b.date) - new Date(a.date));
  }
  function addCheckIn(mood) {
    const list = Storage.get(KEYS.CHECKINS, []);
    const entry = { id: 'checkin_' + Date.now(), date: new Date().toISOString(), mood };
    list.push(entry);
    Storage.set(KEYS.CHECKINS, list);
    return entry;
  }
  function didCheckInToday() {
    return getCheckIns().some((c) => isToday(c.date));
  }

  /* ---------------- Small daily-mission support flags ---------------- */
  function markReasonsViewedToday() {
    Storage.set(KEYS.REASONS_LAST_VIEWED, todayStr());
  }
  function didViewReasonsToday() {
    return Storage.get(KEYS.REASONS_LAST_VIEWED, '') === todayStr();
  }
  function markWalkDoneToday() {
    const dates = Storage.get(KEYS.WALK_DONE_DATES, []);
    const t = todayStr();
    if (!dates.includes(t)) { dates.push(t); Storage.set(KEYS.WALK_DONE_DATES, dates); }
  }
  function didWalkToday() {
    return Storage.get(KEYS.WALK_DONE_DATES, []).includes(todayStr());
  }

  /* ---------------- Daily Missions ----------------
     Every mission's "done" state is derived from real activity wherever
     possible (sessions/journal/check-ins logged today) rather than its
     own separate tracking — walk is the one exception, since it happens
     off-app and there's nothing to detect. Missing a mission never
     removes it or penalizes anything; getDailyMissions() just reports
     today's state fresh each time it's called. */
  function getDailyMissions() {
    const todaysSessions = getSessions().filter((s) => isToday(s.date));
    const calmIds = ['breathing', 'grounding_54321', 'focus_reset'];
    return [
      { id: 'breathing', label: 'Complete one breathing session', done: todaysSessions.some((s) => calmIds.includes(s.activityId)) },
      { id: 'distraction', label: 'Finish one distraction activity', done: todaysSessions.some((s) => !calmIds.includes(s.activityId)) },
      { id: 'journal', label: 'Write a journal entry', done: getJournalEntries().some((e) => isToday(e.date)) },
      { id: 'trigger', label: 'Identify one trigger', done: todaysSessions.some((s) => !!s.trigger) },
      { id: 'walk', label: 'Take a short walk', done: didWalkToday(), selfReport: true },
      { id: 'reasons', label: 'Review your reason for starting', done: didViewReasonsToday() },
      { id: 'checkin', label: 'Check in with yourself', done: didCheckInToday(), selfReport: true },
    ];
  }

  /* ---------------- Trigger / pattern insights ----------------
     Reads whatever trigger/mood fields have been captured on sessions
     (added by the Urge Rescue Flow) and turns them into plain-language
     observations. Every insight here only appears once there's enough
     data to say it honestly — no insight is shown from a single data
     point pretending to be a pattern. */
  function getTriggerPatterns() {
    const urgeSessions = getSessions().filter((s) => s.fromUrgeMode);
    const withTrigger = urgeSessions.filter((s) => s.trigger);
    const insights = [];

    if (withTrigger.length >= 3) {
      const counts = {};
      withTrigger.forEach((s) => { counts[s.trigger] = (counts[s.trigger] || 0) + 1; });
      const [topTrigger, topCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      if (topCount / withTrigger.length >= 0.34) {
        insights.push(`${topTrigger} shows up as a trigger often — ${topCount} of your last ${withTrigger.length} logged urges.`);
      }
    }

    if (urgeSessions.length >= 5) {
      const buckets = { night: 0, morning: 0, afternoon: 0, evening: 0 };
      urgeSessions.forEach((s) => {
        const h = new Date(s.date).getHours();
        if (h >= 5 && h < 12) buckets.morning++;
        else if (h >= 12 && h < 17) buckets.afternoon++;
        else if (h >= 17 && h < 22) buckets.evening++;
        else buckets.night++;
      });
      const [topBucket, topBucketCount] = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0];
      if (topBucketCount / urgeSessions.length >= 0.4) {
        insights.push(`Urges tend to happen more in the ${topBucket}.`);
      }
    }

    const stats = getStats();
    if (stats.mostHelpful.length) {
      const [topId] = stats.mostHelpful[0];
      insights.push({ activityId: topId }); // resolved to a name by the caller, which has activity lookups
    }

    return { insights, sampleSize: urgeSessions.length, triggerSampleSize: withTrigger.length };
  }

  /* ---------------- Recovery Timeline ----------------
     Purely derived from data that already exists elsewhere — no separate
     "timeline events" store to keep in sync. Focuses on progress and
     learning rather than an unbroken streak: setbacks appear on the
     timeline too, framed as part of the story rather than left out. */
  function getRecoveryTimelineEvents() {
    const events = [];
    const opens = getAppOpens();
    if (opens.firstDate) {
      events.push({ date: opens.firstDate + 'T00:00:00', type: 'start', title: 'Started using UrgeAway', detail: null });
    }

    const sessions = getSessions().slice().sort((a, b) => new Date(a.date) - new Date(b.date));
    const firstUrge = sessions.find((s) => s.fromUrgeMode);
    if (firstUrge) {
      events.push({ date: firstUrge.date, type: 'first-urge', title: 'First urge session logged', detail: null });
    }
    [1, 10, 25, 50, 100].forEach((n) => {
      if (sessions.length >= n) {
        events.push({ date: sessions[n - 1].date, type: 'milestone', title: `${n} activit${n === 1 ? 'y' : 'ies'} completed`, detail: null });
      }
    });

    const journal = getJournalEntries().slice().sort((a, b) => new Date(a.date) - new Date(b.date));
    [1, 5, 10, 25].forEach((n) => {
      if (journal.length >= n) {
        events.push({ date: journal[n - 1].date, type: 'journal', title: `${n} journal entr${n === 1 ? 'y' : 'ies'} written`, detail: null });
      }
    });

    getSetbacks().forEach((sb) => {
      events.push({ date: sb.date, type: 'setback', title: 'A difficult moment — and a return', detail: sb.whatHappened || null });
    });

    return events.sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  /* ---------------- Smart Daily Plan ----------------
     A short, ordered list of suggestions for right now, built from real
     signals: what hasn't been done today (missions), and — once there's
     enough history — the time-of-day this person's urges tend to cluster,
     so a heads-up can appear before that window rather than after. */
  function getSmartDailyPlan() {
    const plan = [];
    const missions = getDailyMissions();
    const hour = new Date().getHours();

    if (!didCheckInToday()) plan.push({ id: 'checkin', title: 'Morning check-in', desc: 'A quick check-in to start the day grounded.' });
    if (!missions.find((m) => m.id === 'breathing').done) plan.push({ id: 'breathing', title: 'A breathing session', desc: 'Two minutes, whenever suits you today.' });
    if (!missions.find((m) => m.id === 'journal').done) plan.push({ id: 'journal', title: 'A journal prompt', desc: 'Even a few lines counts.' });

    const urgeSessions = getSessions().filter((s) => s.fromUrgeMode);
    if (urgeSessions.length >= 5) {
      const buckets = { night: 0, morning: 0, afternoon: 0, evening: 0 };
      const ranges = { morning: [5, 12], afternoon: [12, 17], evening: [17, 22], night: [22, 5] };
      urgeSessions.forEach((s) => {
        const h = new Date(s.date).getHours();
        if (h >= 5 && h < 12) buckets.morning++;
        else if (h >= 12 && h < 17) buckets.afternoon++;
        else if (h >= 17 && h < 22) buckets.evening++;
        else buckets.night++;
      });
      const [topBucket, topCount] = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0];
      const range = ranges[topBucket];
      const upcoming = range && ((hour < range[0] && range[0] - hour <= 3) || (topBucket === 'night' && hour < 22 && hour >= 19));
      if (topCount / urgeSessions.length >= 0.4 && upcoming) {
        plan.push({ id: 'prepare', title: `Prepare for the ${topBucket}`, desc: `Urges have tended to show up in the ${topBucket} — worth lining up a distraction now, before it hits.` });
      }
    }

    plan.push({ id: 'night', title: 'Night reflection', desc: 'A short look back at the day, whenever you\u2019re winding down.' });
    return plan;
  }

  function isNotifPermissionAsked() {
    return !!Storage.get(KEYS.NOTIF_PERMISSION_ASKED, false);
  }
  function setNotifPermissionAsked() {
    Storage.set(KEYS.NOTIF_PERMISSION_ASKED, true);
  }
  function isNotifBannerShown() {
    return !!Storage.get(KEYS.NOTIF_BANNER_SHOWN, false);
  }
  function setNotifBannerShown() {
    Storage.set(KEYS.NOTIF_BANNER_SHOWN, true);
  }

  // Personal reminders: a person-set alarm for a time an urge tends to hit,
  // carrying their own message to themselves.
  // { id, hour, minute, message, repeatDaily, enabled, createdAt }
  function getReminders() {
    return Storage.get(KEYS.REMINDERS, []).sort((a, b) => (a.hour * 60 + a.minute) - (b.hour * 60 + b.minute));
  }
  function addReminder(reminder) {
    const list = Storage.get(KEYS.REMINDERS, []);
    const entry = Object.assign(
      { id: 'rem_' + Date.now(), enabled: true, createdAt: new Date().toISOString() },
      reminder
    );
    list.push(entry);
    Storage.set(KEYS.REMINDERS, list);
    return entry;
  }
  function updateReminder(id, patch) {
    const list = Storage.get(KEYS.REMINDERS, []).map((r) => (r.id === id ? Object.assign({}, r, patch) : r));
    Storage.set(KEYS.REMINDERS, list);
    return list.find((r) => r.id === id);
  }
  function deleteReminder(id) {
    const list = Storage.get(KEYS.REMINDERS, []).filter((r) => r.id !== id);
    Storage.set(KEYS.REMINDERS, list);
  }

  // Simple personalization: which activity has the best "helpful" ratio, used >= 2 times
  function getRecommendedActivity(allActivities) {
    const sessions = getSessions();
    const byActivity = {};
    sessions.forEach((s) => {
      if (!byActivity[s.activityId]) byActivity[s.activityId] = { total: 0, helpful: 0 };
      byActivity[s.activityId].total += 1;
      if (s.outcome === 'better' || s.outcome === 'a_little_better') {
        byActivity[s.activityId].helpful += 1;
      }
    });
    let best = null;
    let bestScore = 0;
    Object.keys(byActivity).forEach((id) => {
      const stat = byActivity[id];
      if (stat.total < 2) return;
      const score = stat.helpful / stat.total;
      if (score > bestScore) {
        bestScore = score;
        best = id;
      }
    });
    if (!best) return null;
    return allActivities.find((a) => a.id === best) || null;
  }

  function getStats() {
    const sessions = getSessions();
    const urgeSessions = sessions.filter((s) => s.fromUrgeMode);
    const byActivity = {};
    sessions.forEach((s) => {
      byActivity[s.activityId] = (byActivity[s.activityId] || 0) + 1;
    });
    const mostUsed = Object.entries(byActivity).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const helpfulCounts = {};
    sessions.forEach((s) => {
      if (s.outcome === 'better' || s.outcome === 'a_little_better') {
        helpfulCounts[s.activityId] = (helpfulCounts[s.activityId] || 0) + 1;
      }
    });
    const mostHelpful = Object.entries(helpfulCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return {
      totalSessions: sessions.length,
      totalUrgeSessions: urgeSessions.length,
      mostUsed,
      mostHelpful,
    };
  }

  // Resistance Level: a numeric growth stat — points, not stars. It's built
  // from three things, so it climbs slowly and steadily just from staying
  // engaged, not only from logging urge sessions:
  //   1) distinct days you've opened the app at all (showing up counts)
  //   2) your current day streak (consistency)
  //   3) how your logged urge sessions went (a smaller bonus on top)
  const RESISTANCE_TIERS = [
    { level: 1, min: 0, name: 'Getting Started' },
    { level: 2, min: 15, name: 'Building Resistance' },
    { level: 3, min: 40, name: 'Steady' },
    { level: 4, min: 80, name: 'Resilient' },
    { level: 5, min: 140, name: 'Strong' },
    { level: 6, min: 220, name: 'Unshakeable' },
  ];
  function getResistanceStats() {
    const urgeSessions = getSessions().filter((s) => s.fromUrgeMode);
    let outcomePoints = 0;
    let resistedCount = 0;
    urgeSessions.forEach((s) => {
      if (s.outcome === 'better') { outcomePoints += 3; resistedCount += 1; }
      else if (s.outcome === 'a_little_better') { outcomePoints += 2; resistedCount += 1; }
      else if (s.outcome === 'still_need_help') { outcomePoints += 1; }
      // resisting despite reporting high intensity counts extra
      if (s.intensity && s.intensity >= 7 && (s.outcome === 'better' || s.outcome === 'a_little_better')) outcomePoints += 1;
    });

    const streak = getStreak();
    const appOpens = getAppOpens();
    // 1 point per distinct day opened + 1 point per day of current streak —
    // deliberately small and steady, like resistance actually builds over time.
    const points = appOpens.totalDays + streak.count + outcomePoints;

    let current = RESISTANCE_TIERS[0];
    let next = RESISTANCE_TIERS[1] || null;
    for (let i = 0; i < RESISTANCE_TIERS.length; i++) {
      if (points >= RESISTANCE_TIERS[i].min) {
        current = RESISTANCE_TIERS[i];
        next = RESISTANCE_TIERS[i + 1] || null;
      }
    }
    const progressToNext = next ? Math.min(1, (points - current.min) / (next.min - current.min)) : 1;
    const percentResisted = urgeSessions.length ? Math.round((resistedCount / urgeSessions.length) * 100) : 0;
    return {
      points,
      level: current.level,
      levelName: current.name,
      nextLevelName: next ? next.name : null,
      pointsToNext: next ? next.min - points : 0,
      progressToNext,
      percentResisted,
      totalUrgeSessions: urgeSessions.length,
      appOpenDays: appOpens.totalDays,
      streakDays: streak.count,
    };
  }

  /* ---------- Urge Lock ---------- */
  // Timestamp-based so remaining time is always computed as endTime -
  // currentTime, not tracked by an in-memory countdown — this way a
  // recreated Activity (rotation, OS reclaiming memory, etc.) just
  // recomputes the same remaining time instead of resetting the timer.
  function getUrgeLockDurationSec(intensity) {
    return URGE_LOCK_DURATIONS_SEC[intensity] || null;
  }

  function startUrgeLockSession(intensity) {
    const durationSec = getUrgeLockDurationSec(intensity);
    if (!durationSec) return null;
    const startTime = Date.now();
    const session = {
      id: 'ulock_' + startTime,
      intensity,
      durationSec,
      startTime,
      endTime: startTime + durationSec * 1000,
      status: 'active', // 'active' | 'completed'
      feeling: null, // 'better' | 'still_having_urge' | 'urge_gone', set on completion
    };
    Storage.set(KEYS.URGE_LOCK_SESSION, session);
    return session;
  }
  function getUrgeLockSession() {
    return Storage.get(KEYS.URGE_LOCK_SESSION, null);
  }
  function updateUrgeLockSession(patch) {
    const session = getUrgeLockSession();
    if (!session) return null;
    const merged = Object.assign({}, session, patch);
    Storage.set(KEYS.URGE_LOCK_SESSION, merged);
    return merged;
  }
  function completeUrgeLockSession(feeling) {
    return updateUrgeLockSession({ status: 'completed', feeling: feeling || null });
  }
  function clearUrgeLockSession() {
    Storage.remove(KEYS.URGE_LOCK_SESSION);
  }
  function isUrgeLockSetupDone() {
    return !!Storage.get(KEYS.URGE_LOCK_SETUP_DONE, false);
  }
  function setUrgeLockSetupDone() {
    Storage.set(KEYS.URGE_LOCK_SETUP_DONE, true);
  }

  /* ---------- Profile (local-only) ---------- */
  function getProfileName() {
    return Storage.get(KEYS.PROFILE_NAME, '');
  }
  function setProfileName(name) {
    Storage.set(KEYS.PROFILE_NAME, String(name || '').trim().slice(0, 40));
  }
  // First/last name and gender, asked once at onboarding (see flows.js).
  // setProfileName() above stays the single combined display name used
  // everywhere else in the app (Dashboard, personalization) — these three
  // exist alongside it specifically so Firestore gets real structured
  // fields rather than one free-text string.
  function getProfileFirstName() {
    return Storage.get(KEYS.PROFILE_FIRST_NAME, '');
  }
  function setProfileFirstName(v) {
    Storage.set(KEYS.PROFILE_FIRST_NAME, String(v || '').trim().slice(0, 40));
  }
  function getProfileLastName() {
    return Storage.get(KEYS.PROFILE_LAST_NAME, '');
  }
  function setProfileLastName(v) {
    Storage.set(KEYS.PROFILE_LAST_NAME, String(v || '').trim().slice(0, 40));
  }
  function getProfileGender() {
    return Storage.get(KEYS.PROFILE_GENDER, '');
  }
  function setProfileGender(v) {
    Storage.set(KEYS.PROFILE_GENDER, v === 'male' || v === 'female' ? v : '');
  }
  function getProfilePic() {
    return Storage.get(KEYS.PROFILE_PIC, null);
  }
  function setProfilePic(dataUrl) {
    Storage.set(KEYS.PROFILE_PIC, dataUrl);
  }
  function clearProfilePic() {
    Storage.remove(KEYS.PROFILE_PIC);
  }

  /* ---------- Notification history (local-only, capped at 10) ---------- */
  const NOTIF_HISTORY_MAX = 10;
  function addNotifToHistory(entry) {
    const list = Storage.get(KEYS.NOTIF_HISTORY, []);
    const id = (entry && entry.id) || ('notif_' + Date.now() + '_' + Math.floor(Math.random() * 1000));
    if (list.some((x) => x.id === id)) return null; // already logged — e.g. tray-sync saw one the listener already caught
    const item = {
      id,
      title: (entry && entry.title) || 'UrgeAway',
      body: (entry && entry.body) || '',
      ts: (entry && entry.ts) || Date.now(),
    };
    list.unshift(item);
    if (list.length > NOTIF_HISTORY_MAX) list.length = NOTIF_HISTORY_MAX;
    Storage.set(KEYS.NOTIF_HISTORY, list);
    return item;
  }
  function getNotifHistory() {
    return Storage.get(KEYS.NOTIF_HISTORY, []);
  }
  function clearNotifHistory() {
    Storage.set(KEYS.NOTIF_HISTORY, []);
  }
  function getNotifLastViewed() {
    return Storage.get(KEYS.NOTIF_LAST_VIEWED, 0);
  }
  function markNotifViewed() {
    Storage.set(KEYS.NOTIF_LAST_VIEWED, Date.now());
  }
  function getUnreadNotifCount() {
    const lastViewed = getNotifLastViewed();
    return getNotifHistory().filter((n) => n.ts > lastViewed).length;
  }
  function getNotifLastSync() {
    return Storage.get(KEYS.NOTIF_LAST_SYNC, 0);
  }
  function setNotifLastSync(ts) {
    Storage.set(KEYS.NOTIF_LAST_SYNC, ts);
  }

  // Opt-in, defaults false — see analytics.js for exactly what this
  // gates and what it deliberately never sends.
  function getAnalyticsEnabled() {
    return Storage.get(KEYS.ANALYTICS_ENABLED, false);
  }
  function setAnalyticsEnabled(enabled) {
    Storage.set(KEYS.ANALYTICS_ENABLED, !!enabled);
  }
  function isAnalyticsPromptShown() {
    return Storage.get(KEYS.ANALYTICS_PROMPT_SHOWN, false);
  }
  function setAnalyticsPromptShown() {
    Storage.set(KEYS.ANALYTICS_PROMPT_SHOWN, true);
  }

  // Pulls the next index from a persisted shuffled queue for the given
  // "kind" (e.g. one queue per message pool). Every index in the pool
  // is used exactly once before the queue reshuffles and starts a new
  // pass — so a 20-message pool can't repeat a message until the other
  // 19 have all shown at least once, and this survives app restarts
  // since the queue itself is what's persisted (not just a counter).
  function nextShuffledIndex(kind, poolSize) {
    const all = Storage.get(KEYS.MSG_SHUFFLE, {});
    let queue = all[kind];
    if (!Array.isArray(queue) || !queue.length) {
      queue = Array.from({ length: poolSize }, (_, i) => i);
      for (let i = queue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = queue[i]; queue[i] = queue[j]; queue[j] = tmp;
      }
    }
    const index = queue.shift();
    all[kind] = queue;
    Storage.set(KEYS.MSG_SHUFFLE, all);
    return index;
  }

  function exportAll() {
    return {
      exportedAt: new Date().toISOString(),
      sessions: getSessions(),
      journal: getJournalEntries(),
      streak: getStreak(),
      settings: getSettings(),
    };
  }

  function clearAllData() {
    Storage.clearAll();
  }

  return {
    KEYS,
    isOnboarded,
    setOnboarded,
    getSettings,
    setSettings,
    getSessions,
    addSession,
    getTodaySessions,
    getUrgeSessionsToday,
    getStreak,
    recordAppOpen,
    getAppOpens,
    getJournalEntries,
    addJournalEntry,
    updateJournalEntry,
    deleteJournalEntry,
    getJournalDraft,
    setJournalDraft,
    clearJournalDraft,
    getJournalWritingStreak,
    getJournalInsights,
    getReminders,
    addReminder,
    updateReminder,
    deleteReminder,
    getReachOutContact,
    setReachOutContact,
    getReasons,
    addReason,
    deleteReason,
    getStreakProtecting,
    setStreakProtecting,
    getSetbacks,
    addSetback,
    getCheckIns,
    addCheckIn,
    didCheckInToday,
    markReasonsViewedToday,
    didViewReasonsToday,
    markWalkDoneToday,
    didWalkToday,
    getDailyMissions,
    getTriggerPatterns,
    getRecoveryTimelineEvents,
    getSmartDailyPlan,
    getResistanceTiers,
    recordSupportUsed,
    getSupportUsedCount,
    getAchievements,
    isLoginPromptShown,
    setLoginPromptShown,
    isNotifPermissionAsked,
    setNotifPermissionAsked,
    isNotifBannerShown,
    setNotifBannerShown,
    getRecommendedActivity,
    getStats,
    getResistanceStats,
    getGrowthAxes,
    exportAll,
    clearAllData,
    todayStr,
    getUrgeLockDurationSec,
    startUrgeLockSession,
    getUrgeLockSession,
    updateUrgeLockSession,
    completeUrgeLockSession,
    clearUrgeLockSession,
    isUrgeLockSetupDone,
    setUrgeLockSetupDone,
    getProfileName,
    setProfileName,
    getProfileFirstName,
    setProfileFirstName,
    getProfileLastName,
    setProfileLastName,
    getProfileGender,
    setProfileGender,
    getProfilePic,
    setProfilePic,
    clearProfilePic,
    addNotifToHistory,
    getNotifHistory,
    clearNotifHistory,
    getNotifLastViewed,
    markNotifViewed,
    getUnreadNotifCount,
    getNotifLastSync,
    setNotifLastSync,
    nextShuffledIndex,
    getAnalyticsEnabled,
    setAnalyticsEnabled,
    isAnalyticsPromptShown,
    setAnalyticsPromptShown,
  };
})();
