package com.urgeaway.applock;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;

/**
 * AppLockAccessibilityService — the entire enforcement mechanism behind
 * Lock In Mode.
 *
 * Android tells every running AccessibilityService when the foreground
 * window changes (TYPE_WINDOW_STATE_CHANGED), including which package it
 * belongs to. That's all this reads — never the on-screen content itself
 * (canRetrieveWindowContent is off in the service config). If the package
 * that just came to the front has an active lock, it calls the same
 * documented performGlobalAction(GLOBAL_ACTION_HOME) any accessibility
 * service is allowed to call, which is the standard "press the Home
 * button" action — not a private API, not a permission escalation.
 *
 * This is a commitment device: UrgeAway itself never exposes a "cancel
 * this lock early" button (see AppLockPlugin). The one honest way out
 * before time's up is the same as anywhere else Android grants a
 * permission — the person can go to Settings -> Accessibility and turn
 * this service off themselves. Nothing here tries to prevent, hide, or
 * discourage that; it's simply not a shortcut this code offers from
 * inside the app.
 */
public class AppLockAccessibilityService extends AccessibilityService {

    private static final String TAG = "AppLockService";
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private String lastBlockedPackage = null;
    private long lastBlockedAt = 0L;
    private long lastHeartbeatAt = 0L;

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        // If this line never shows up in logcat, Android never actually
        // bound the service — that points at the permission toggle itself
        // (Restricted Settings still blocking it, or it got turned back
        // off), not at anything in the lock list/write path.
        Log.d(TAG, "Lock In Mode accessibility service connected and running");
        AppLockStore.recordServiceConnected(this);
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return;
        CharSequence pkgCs = event.getPackageName();
        if (pkgCs == null) return;
        final String packageName = pkgCs.toString();

        // Throttled so this doesn't hammer SharedPreferences on every
        // window change, but frequent enough that "last seen Xs ago" is a
        // meaningful, near-real-time signal in the on-screen diagnostics.
        long now0 = System.currentTimeMillis();
        if (now0 - lastHeartbeatAt > 1000) {
            lastHeartbeatAt = now0;
            AppLockStore.recordHeartbeat(this, packageName);
        }

        if (packageName.equals(getPackageName())) return; // never block UrgeAway itself
        // Android's own system UI (home launcher, notification shade, recents,
        // permission dialogs, etc.) must never be sent "home" — that would
        // just fight the OS. Only ever act on a package with an actual lock.
        Long unlockAt = AppLockStore.getUnlockAtIfLocked(this, packageName);
        if (unlockAt == null) return;

        Log.d(TAG, "Blocking locked package " + packageName + " (unlocks at " + unlockAt + ")");
        boolean actionResult = performGlobalAction(GLOBAL_ACTION_HOME);
        AppLockStore.recordBlockAttempt(this, packageName, actionResult);

        // Small debounce so rapidly retapping the locked app's icon
        // doesn't stack up several block-screen launches in a row.
        long now = System.currentTimeMillis();
        if (packageName.equals(lastBlockedPackage) && now - lastBlockedAt < 4000) return;
        lastBlockedPackage = packageName;
        lastBlockedAt = now;

        // Give GLOBAL_ACTION_HOME a beat to actually land before putting
        // the block screen on top of it — launching both in the same
        // instant is a common source of flicker/ordering issues.
        final long unlockAtFinal = unlockAt;
        mainHandler.postDelayed(() -> {
            Intent blockIntent = new Intent(AppLockAccessibilityService.this, LockInBlockActivity.class);
            blockIntent.putExtra(LockInBlockActivity.EXTRA_PACKAGE_NAME, packageName);
            blockIntent.putExtra(LockInBlockActivity.EXTRA_UNLOCK_AT, unlockAtFinal);
            blockIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            startActivity(blockIntent);
        }, 200);
    }

    @Override
    public void onInterrupt() {
        // Required override; no cleanup needed — AppLockStore has no
        // in-memory state and nothing here holds a resource to release.
    }
}
