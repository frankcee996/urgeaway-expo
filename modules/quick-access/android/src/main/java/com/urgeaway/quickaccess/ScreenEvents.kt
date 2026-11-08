package com.urgeaway.quickaccess

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import java.util.concurrent.atomic.AtomicBoolean

/* ==========================================================================
   Android does not allow ACTION_SCREEN_OFF to be declared in a manifest, so
   this registers a receiver at runtime. It lives as long as the UrgeAway
   process does: if Android has fully stopped the process, the widget still
   shuffles on tap and on its periodic refresh, and the receiver comes back
   the next time the app or widget wakes up.
   ========================================================================== */
internal object ScreenEvents {
  private val registered = AtomicBoolean(false)

  fun ensureRegistered(context: Context) {
    if (!registered.compareAndSet(false, true)) return
    val app = context.applicationContext
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(c: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_SCREEN_OFF) {
          UrgeAwayWidgetProvider.updateAll(app, advance = true)
        }
      }
    }
    try {
      val filter = IntentFilter(Intent.ACTION_SCREEN_OFF)
      if (Build.VERSION.SDK_INT >= 33) {
        app.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
      } else {
        app.registerReceiver(receiver, filter)
      }
    } catch (e: Exception) {
      registered.set(false)
    }
  }
}
