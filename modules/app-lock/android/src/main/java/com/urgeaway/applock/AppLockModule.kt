package com.urgeaway.applock

/* ==========================================================================
   AppLockModule — Expo Modules translation of the JS-facing half of the
   original AppLockPlugin.java (capacitor-plugins/app-lock/). Only the
   plugin-framework glue changed (Capacitor's Plugin/PluginCall/JSObject vs
   Expo's Module/AsyncFunction) — the actual enforcement logic lives
   untouched in AppLockAccessibilityService.java, AppLockStore.java, and
   LockInBlockActivity.java (copied verbatim, zero Capacitor dependency in
   any of the three). See AppLockPlugin.java's original class comment for
   the full "why not PackageManager#setComponentEnabledSetting()" rationale
   and the commitment-device design intent — both still apply unchanged.
   ========================================================================== */

import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.Drawable
import android.net.Uri
import android.provider.Settings
import android.util.Base64
import android.view.accessibility.AccessibilityManager
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream

// Never lockable, regardless of what the caller sends — same reasoning as
// the original: locking Settings would strand the person unable to reach
// Accessibility settings, and locking UrgeAway itself would strand them
// unable to manage locks.
private const val PACKAGE_SETTINGS = "com.android.settings"

class AppLockModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AppLockModule")

    AsyncFunction("getInstalledApps") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.resolve(mapOf("apps" to emptyList<Any>()))
        return@AsyncFunction
      }
      val pm = context.packageManager
      val launcherIntent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
      val resolved = pm.queryIntentActivities(launcherIntent, 0)
      val selfPackage = context.packageName
      val seen = HashSet<String>()
      val apps = mutableListOf<Map<String, Any?>>()
      for (info in resolved) {
        val pkg = info.activityInfo.packageName
        if (pkg == selfPackage || pkg == PACKAGE_SETTINGS) continue
        if (!seen.add(pkg)) continue // some apps expose more than one launcher activity
        apps.add(
          mapOf(
            "packageName" to pkg,
            "appName" to info.loadLabel(pm).toString(),
            "icon" to iconToBase64(info.loadIcon(pm))
          )
        )
      }
      promise.resolve(mapOf("apps" to apps))
    }

    AsyncFunction("getLockedApps") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.resolve(mapOf("locks" to emptyList<Any>()))
        return@AsyncFunction
      }
      val locks = AppLockStore.pruneExpired(context)
      val pm = context.packageManager
      val out = mutableListOf<Map<String, Any?>>()
      val keys = locks.keys()
      while (keys.hasNext()) {
        val pkg = keys.next()
        val unlockAt = locks.optLong(pkg, 0)
        out.add(mapOf("packageName" to pkg, "unlockAt" to unlockAt, "appName" to labelFor(pm, pkg)))
      }
      promise.resolve(mapOf("locks" to out))
    }

    AsyncFunction("lockApps") { args: Map<String, Any?>, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.resolve(mapOf("locked" to 0, "error" to "no_context"))
        return@AsyncFunction
      }
      @Suppress("UNCHECKED_CAST")
      val packagesArg = args["packages"] as? List<String>
      val unlockAtArg = (args["unlockAt"] as? Number)?.toLong()
      if (packagesArg == null || packagesArg.isEmpty() || unlockAtArg == null) {
        promise.resolve(
          mapOf("locked" to 0, "error" to "packages (non-empty array) and unlockAt (epoch millis) are required")
        )
        return@AsyncFunction
      }
      if (unlockAtArg <= System.currentTimeMillis()) {
        promise.resolve(mapOf("locked" to 0, "error" to "unlockAt must be in the future"))
        return@AsyncFunction
      }
      val selfPackage = context.packageName
      val packages = packagesArg.filter { it.isNotEmpty() && it != selfPackage && it != PACKAGE_SETTINGS }
      AppLockStore.lock(context, packages, unlockAtArg)
      promise.resolve(mapOf("locked" to packages.size))
    }

    AsyncFunction("isAccessibilityEnabled") { promise: Promise ->
      promise.resolve(mapOf("enabled" to isServiceEnabled()))
    }

    // Surfaces the on-device heartbeat AppLockAccessibilityService writes,
    // so the app can show whether the service is genuinely alive and
    // receiving events versus just toggled on in Settings but dead
    // (e.g. an OEM battery optimizer killed it).
    AsyncFunction("getDiagnostics") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.resolve(null)
        return@AsyncFunction
      }
      val diag = AppLockStore.readDiagnostics(context)
      promise.resolve(
        mapOf(
          "accessibilityEnabled" to isServiceEnabled(),
          "serviceConnectedAt" to diag.optLong("serviceConnectedAt", 0),
          "lastEventAt" to diag.optLong("lastEventAt", 0),
          "lastEventPackage" to diag.opt("lastEventPackage"),
          "lastBlockAt" to diag.optLong("lastBlockAt", 0),
          "lastBlockPackage" to diag.opt("lastBlockPackage"),
          "lastBlockActionResult" to diag.optBoolean("lastBlockActionResult", false),
          "now" to System.currentTimeMillis()
        )
      )
    }

    AsyncFunction("openAccessibilitySettings") { promise: Promise ->
      try {
        val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        appContext.reactContext?.startActivity(intent)
        promise.resolve(null)
      } catch (e: Exception) {
        promise.reject("ERR_SETTINGS", "Could not open Accessibility settings", e)
      }
    }

    // On Android 13+, a sideloaded install has sensitive permissions
    // (Accessibility included) behind "Restricted settings" until the
    // person visits this exact screen and taps through the overflow menu
    // themselves — this just gets them to the right screen for that.
    AsyncFunction("openAppInfoSettings") { promise: Promise ->
      try {
        val context = appContext.reactContext
        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
        intent.data = Uri.parse("package:${context?.packageName}")
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context?.startActivity(intent)
        promise.resolve(null)
      } catch (e: Exception) {
        promise.reject("ERR_SETTINGS", "Could not open App info settings", e)
      }
    }
  }

  private fun isServiceEnabled(): Boolean {
    val context = appContext.reactContext ?: return false
    val am = context.getSystemService(Context.ACCESSIBILITY_SERVICE) as? AccessibilityManager ?: return false
    val enabledServices = am.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK)
    val targetId = "${context.packageName}/${AppLockAccessibilityService::class.java.name}"
    return enabledServices.any { it.id == targetId }
  }

  private fun labelFor(pm: PackageManager, packageName: String): String {
    return try {
      val ai: ApplicationInfo = pm.getApplicationInfo(packageName, 0)
      pm.getApplicationLabel(ai).toString()
    } catch (e: PackageManager.NameNotFoundException) {
      packageName
    }
  }

  private fun iconToBase64(drawable: Drawable?): String? {
    if (drawable == null) return null
    return try {
      val size = 96
      val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
      val canvas = Canvas(bitmap)
      drawable.setBounds(0, 0, size, size)
      drawable.draw(canvas)
      val stream = ByteArrayOutputStream()
      bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)
      bitmap.recycle()
      "data:image/png;base64," + Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
    } catch (e: Exception) {
      null
    }
  }
}
