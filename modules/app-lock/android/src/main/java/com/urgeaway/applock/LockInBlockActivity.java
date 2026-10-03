package com.urgeaway.applock;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
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
 * this plugin's resource footprint minimal — styled here to match the
 * web app's own dark/cyan theme (see web/css/styles.css's :root custom
 * properties) instead of using unstyled default widgets.
 */
public class LockInBlockActivity extends Activity {

    public static final String EXTRA_PACKAGE_NAME = "packageName";
    public static final String EXTRA_UNLOCK_AT = "unlockAt";

    // Matches web/css/styles.css's :root custom properties.
    private static final int COLOR_BG0 = Color.parseColor("#060B14");
    private static final int COLOR_CYAN = Color.parseColor("#34E0D6");
    private static final int COLOR_CYAN_GLOW = Color.parseColor("#2634E0D6"); // cyan at low alpha, for the icon badge
    private static final int COLOR_TEXT0 = Color.parseColor("#F4F9FB");
    private static final int COLOR_TEXT2 = Color.parseColor("#7F93AC");

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
        root.setBackgroundColor(COLOR_BG0);
        int pad = dp(32);
        root.setPadding(pad, pad, pad, pad);

        // Circular glow badge behind the lock icon, matching the
        // rounded/soft-glow card language used throughout the rest of
        // the app instead of a bare emoji floating on black.
        FrameLayout iconBadge = new FrameLayout(this);
        GradientDrawable badgeBg = new GradientDrawable();
        badgeBg.setShape(GradientDrawable.OVAL);
        badgeBg.setColor(COLOR_CYAN_GLOW);
        iconBadge.setBackground(badgeBg);
        int badgeSize = dp(76);

        TextView icon = new TextView(this);
        icon.setText("\uD83D\uDD12");
        icon.setTextSize(32);
        icon.setGravity(Gravity.CENTER);
        FrameLayout.LayoutParams iconParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT);
        iconBadge.addView(icon, iconParams);
        root.addView(iconBadge, new LinearLayout.LayoutParams(badgeSize, badgeSize));

        TextView title = new TextView(this);
        title.setText("You're in Lock In Mode");
        title.setTextColor(COLOR_TEXT0);
        title.setTextSize(20);
        title.setTypeface(null, Typeface.BOLD);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, dp(20), 0, dp(10));
        root.addView(title);

        subtitleView = new TextView(this);
        subtitleView.setTextColor(COLOR_TEXT2);
        subtitleView.setTextSize(14.5f);
        subtitleView.setGravity(Gravity.CENTER);
        subtitleView.setLineSpacing(dp(4), 1f);
        root.addView(subtitleView);

        // Pill-shaped cyan button, matching .btn-primary in the web app,
        // instead of a default unstyled gray Button.
        Button homeBtn = new Button(this);
        homeBtn.setText("GO TO HOME");
        homeBtn.setAllCaps(true);
        homeBtn.setTypeface(null, Typeface.BOLD);
        homeBtn.setTextColor(COLOR_BG0);
        homeBtn.setTextSize(14);
        homeBtn.setStateListAnimator(null); // drop the default raised-button shadow/elevation
        homeBtn.setElevation(0);
        GradientDrawable btnBg = new GradientDrawable();
        btnBg.setColor(COLOR_CYAN);
        btnBg.setCornerRadius(dp(100)); // large enough to always read as a full pill at this height
        homeBtn.setBackground(btnBg);
        homeBtn.setPadding(dp(24), dp(16), dp(24), dp(16));
        homeBtn.setOnClickListener(v -> goHome());
        LinearLayout.LayoutParams btnParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        btnParams.topMargin = dp(32);
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
