package com.urgeaway.applock;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * LockInBlockActivity — the screen a person actually sees when they try to
 * open something they've locked, instead of just silently bouncing to
 * Home. AppLockAccessibilityService launches this right after sending the
 * locked app's task home.
 *
 * Purely informational + one way out: "GO TO HOME". No "unlock early"
 * button here either, for the same commitment-device reason the rest of
 * Lock In Mode doesn't have one (see AppLockPlugin's class comment).
 *
 * Built with plain Views instead of a layout XML/theme resource to keep
 * this plugin's resource footprint minimal, matching the rest of it.
 */
public class LockInBlockActivity extends Activity {

    public static final String EXTRA_PACKAGE_NAME = "packageName";
    public static final String EXTRA_UNLOCK_AT = "unlockAt";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private TextView subtitleView;
    private String lockedPackage;
    private long unlockAt;

    private final Runnable ticker = new Runnable() {
        @Override
        public void run() {
            long remaining = unlockAt - System.currentTimeMillis();
            if (remaining <= 0) {
                // Timer ran out while this screen happened to be open —
                // nothing left to block, so just step aside.
                goHome();
                return;
            }
            subtitleView.setText(appLabel(lockedPackage) + " is locked for another " + formatRemaining(remaining) + ".");
            handler.postDelayed(this, 1000);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        lockedPackage = getIntent().getStringExtra(EXTRA_PACKAGE_NAME);
        unlockAt = getIntent().getLongExtra(EXTRA_UNLOCK_AT, 0);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setBackgroundColor(Color.parseColor("#0B0F14"));
        int pad = dp(32);
        root.setPadding(pad, pad, pad, pad);

        TextView icon = new TextView(this);
        icon.setText("\uD83D\uDD12");
        icon.setTextSize(48);
        icon.setGravity(Gravity.CENTER);
        root.addView(icon);

        TextView title = new TextView(this);
        title.setText("You're in Lock In Mode");
        title.setTextColor(Color.WHITE);
        title.setTextSize(22);
        title.setTypeface(null, Typeface.BOLD);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, dp(16), 0, dp(8));
        root.addView(title);

        subtitleView = new TextView(this);
        subtitleView.setTextColor(Color.parseColor("#9AA5B1"));
        subtitleView.setTextSize(15);
        subtitleView.setGravity(Gravity.CENTER);
        subtitleView.setLineSpacing(dp(4), 1f);
        root.addView(subtitleView);

        Button homeBtn = new Button(this);
        homeBtn.setText("GO TO HOME");
        homeBtn.setAllCaps(true);
        homeBtn.setOnClickListener(v -> goHome());
        LinearLayout.LayoutParams btnParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        btnParams.topMargin = dp(28);
        root.addView(homeBtn, btnParams);

        setContentView(root);
    }

    @Override
    protected void onResume() {
        super.onResume();
        handler.post(ticker);
    }

    @Override
    protected void onPause() {
        super.onPause();
        handler.removeCallbacks(ticker);
    }

    @Override
    public void onBackPressed() {
        goHome(); // there's no "back" into the locked app from this screen
    }

    private void goHome() {
        Intent home = new Intent(Intent.ACTION_MAIN);
        home.addCategory(Intent.CATEGORY_HOME);
        home.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(home);
        finish();
    }

    private String appLabel(String packageName) {
        if (packageName == null) return "That app";
        try {
            PackageManager pm = getPackageManager();
            ApplicationInfo ai = pm.getApplicationInfo(packageName, 0);
            return String.valueOf(pm.getApplicationLabel(ai));
        } catch (PackageManager.NameNotFoundException e) {
            return "That app";
        }
    }

    private String formatRemaining(long ms) {
        long totalMin = (ms + 59_999) / 60000;
        if (totalMin < 60) return totalMin + " minute" + (totalMin == 1 ? "" : "s");
        long totalHours = (totalMin + 59) / 60;
        if (totalHours < 24) return totalHours + " hour" + (totalHours == 1 ? "" : "s");
        long totalDays = (totalHours + 23) / 24;
        return totalDays + " day" + (totalDays == 1 ? "" : "s");
    }

    private int dp(int value) {
        float density = getResources().getDisplayMetrics().density;
        return Math.round(value * density);
    }
}
