package com.urgeaway.screenpinning

/* ==========================================================================
   ScreenPinningModule — Expo Modules translation of the original
   ScreenPinningPlugin.java (capacitor-plugins/screen-pinning/). Same
   Android APIs, same behavior, same comments explaining why — only the
   plugin-framework glue (Capacitor's Plugin/PluginCall/JSObject vs Expo's
   Module/AsyncFunction) changed. See that original file for the full
   design rationale.
   ========================================================================== */

import android.app.Activity
import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ScreenPinningModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ScreenPinningModule")

    AsyncFunction("start") { promise: expo.modules.kotlin.Promise ->
      val activity: Activity? = appContext.currentActivity
      if (activity == null) {
        promise.resolve(mapOf("started" to false, "reason" to "no_activity"))
        return@AsyncFunction
      }
      try {
        activity.startLockTask()
        promise.resolve(mapOf("started" to true))
      } catch (e: Exception) {
        // Most commonly thrown when Screen Pinning / App Pinning is turned
        // off in Settings on this device or OEM build.
        promise.resolve(mapOf("started" to false, "reason" to "unavailable"))
      }
    }

    AsyncFunction("stop") { promise: expo.modules.kotlin.Promise ->
      val activity: Activity? = appContext.currentActivity
      if (activity != null) {
        try {
          if (isCurrentlyPinned(activity)) activity.stopLockTask()
        } catch (e: Exception) {
          // User already exited pinning manually — desired end state
          // (not pinned) already holds.
        }
      }
      promise.resolve(mapOf("stopped" to true))
    }

    AsyncFunction("isPinned") { promise: expo.modules.kotlin.Promise ->
      val activity: Activity? = appContext.currentActivity
      promise.resolve(mapOf("pinned" to (activity != null && isCurrentlyPinned(activity))))
    }

    AsyncFunction("openPinningSettings") { promise: expo.modules.kotlin.Promise ->
      try {
        val intent = Intent(Settings.ACTION_SECURITY_SETTINGS)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        appContext.reactContext?.startActivity(intent)
        promise.resolve(null)
      } catch (e: Exception) {
        promise.reject("ERR_SETTINGS", "Could not open Settings", e)
      }
    }
  }

  private fun isCurrentlyPinned(activity: Activity): Boolean {
    val am = activity.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager ?: return false
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      am.lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE
    } else {
      @Suppress("DEPRECATION")
      am.isInLockTaskMode
    }
  }
}
