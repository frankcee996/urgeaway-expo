package com.urgeaway.applock;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

/**
 * AppLockStore — the single source of truth for which packages are locked
 * and until when, shared between AppLockPlugin (the JS-facing side, runs in
 * the app's main process) and AppLockAccessibilityService (runs whenever
 * Android delivers it an event, independent of whether the UrgeAway UI is
 * open). Backed by SharedPreferences so both sides always see the same
 * data without needing a running service connection between them.
 *
 * Format on disk: a single JSON object mapping packageName -> unlockAt
 * (epoch millis).
 */
final class AppLockStore {
    private static final String PREFS_NAME = "urgeaway_lockin";
    private static final String KEY_LOCKS = "locks";

    // Diagnostic heartbeat keys — deliberately separate from KEY_LOCKS so
    // they never touch the actual lock data. These exist purely so the
    // app can show, on-screen, whether the accessibility service is
    // really alive and seeing events (no logcat/adb access assumed).
    // See AppLockAccessibilityService and AppLockPlugin#getDiagnostics.
    private static final String KEY_SERVICE_CONNECTED_AT = "diag_service_connected_at";
    private static final String KEY_LAST_EVENT_AT = "diag_last_event_at";
    private static final String KEY_LAST_EVENT_PACKAGE = "diag_last_event_package";
    private static final String KEY_LAST_BLOCK_AT = "diag_last_block_at";
    private static final String KEY_LAST_BLOCK_PACKAGE = "diag_last_block_package";
    private static final String KEY_LAST_BLOCK_ACTION_RESULT = "diag_last_block_action_result";

    private AppLockStore() {}

    static synchronized JSONObject readAll(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String raw = prefs.getString(KEY_LOCKS, "{}");
        try {
            return new JSONObject(raw);
        } catch (JSONException e) {
            return new JSONObject();
        }
    }

    private static synchronized void writeAll(Context context, JSONObject locks) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString(KEY_LOCKS, locks.toString()).apply();
    }

    /** Adds/updates locks for the given packages, all sharing the same unlock timestamp. */
    static synchronized void lock(Context context, List<String> packages, long unlockAtMillis) {
        JSONObject locks = readAll(context);
        try {
            for (String pkg : packages) {
                locks.put(pkg, unlockAtMillis);
            }
        } catch (JSONException ignored) {
            // JSONObject#put only throws for a null key, which can't happen here.
        }
        writeAll(context, locks);
    }

    /** Drops entries whose unlock time has already passed, persists the result, and returns it. */
    static synchronized JSONObject pruneExpired(Context context) {
        JSONObject locks = readAll(context);
        long now = System.currentTimeMillis();
        JSONObject pruned = new JSONObject();
        List<String> keys = new ArrayList<>();
        Iterator<String> it = locks.keys();
        while (it.hasNext()) keys.add(it.next());
        try {
            for (String key : keys) {
                long unlockAt = locks.optLong(key, 0);
                if (unlockAt > now) pruned.put(key, unlockAt);
            }
        } catch (JSONException ignored) {}
        writeAll(context, pruned);
        return pruned;
    }

    /**
     * Fast, allocation-light check used by the AccessibilityService on every
     * window-state-changed event. Returns the unlock timestamp if the given
     * package currently has an active (non-expired) lock, or null otherwise.
     * Does not prune — pruning happens lazily on the JS-facing read path so
     * this hot path stays cheap.
     */
    static Long getUnlockAtIfLocked(Context context, String packageName) {
        JSONObject locks = readAll(context);
        long unlockAt = locks.optLong(packageName, 0);
        if (unlockAt <= 0 || unlockAt <= System.currentTimeMillis()) return null;
        return unlockAt;
    }

    /* ---------------- Diagnostic heartbeat (see field comments above) ---------------- */

    static void recordServiceConnected(Context context) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit().putLong(KEY_SERVICE_CONNECTED_AT, System.currentTimeMillis()).apply();
    }

    /** Called on (throttled) window-state events regardless of whether the
     *  foreground package is locked — proves the event stream itself is
     *  alive, independent of anything lock-related. */
    static void recordHeartbeat(Context context, String packageName) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putLong(KEY_LAST_EVENT_AT, System.currentTimeMillis())
            .putString(KEY_LAST_EVENT_PACKAGE, packageName)
            .apply();
    }

    /** Called only when a locked package was actually detected and a block
     *  was attempted — actionResult is performGlobalAction's own return
     *  value, so we can tell "we tried and Android said no" apart from
     *  "we never tried." */
    static void recordBlockAttempt(Context context, String packageName, boolean actionResult) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putLong(KEY_LAST_BLOCK_AT, System.currentTimeMillis())
            .putString(KEY_LAST_BLOCK_PACKAGE, packageName)
            .putBoolean(KEY_LAST_BLOCK_ACTION_RESULT, actionResult)
            .apply();
    }

    static JSONObject readDiagnostics(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        JSONObject out = new JSONObject();
        try {
            out.put("serviceConnectedAt", prefs.getLong(KEY_SERVICE_CONNECTED_AT, 0));
            out.put("lastEventAt", prefs.getLong(KEY_LAST_EVENT_AT, 0));
            out.put("lastEventPackage", prefs.getString(KEY_LAST_EVENT_PACKAGE, null));
            out.put("lastBlockAt", prefs.getLong(KEY_LAST_BLOCK_AT, 0));
            out.put("lastBlockPackage", prefs.getString(KEY_LAST_BLOCK_PACKAGE, null));
            out.put("lastBlockActionResult", prefs.getBoolean(KEY_LAST_BLOCK_ACTION_RESULT, false));
        } catch (JSONException ignored) {
            // put() only throws for a null key, which never happens above.
        }
        return out;
    }
}
