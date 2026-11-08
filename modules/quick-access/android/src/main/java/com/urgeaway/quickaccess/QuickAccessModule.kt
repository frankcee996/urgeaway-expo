package com.urgeaway.quickaccess

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class QuickAccessModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("QuickAccessModule")

    // Best-effort early registration of the screen-off receiver; refreshWidget
    // (called from App.tsx on launch) registers it again if the context
    // wasn't ready yet. Registration is idempotent.
    OnCreate {
      appContext.reactContext?.let { ScreenEvents.ensureRegistered(it) }
    }

    AsyncFunction("refreshWidget") {
      val context = appContext.reactContext ?: return@AsyncFunction
      ScreenEvents.ensureRegistered(context)
      UrgeAwayWidgetProvider.updateAll(context, advance = false)
    }
  }
}
