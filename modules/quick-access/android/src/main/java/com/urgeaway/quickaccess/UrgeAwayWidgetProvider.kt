package com.urgeaway.quickaccess

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews

/* ==========================================================================
   The home-screen encouragement widget: UrgeAway logo + one short message.
   - Tap the message: shows the next one.
   - Tap the logo: opens UrgeAway.
   - Reshuffles when the screen turns off (see ScreenEvents), and whenever
     Android refreshes the widget (about every 30 minutes at most).
   ========================================================================== */
class UrgeAwayWidgetProvider : AppWidgetProvider() {

  override fun onUpdate(context: Context, manager: AppWidgetManager, appWidgetIds: IntArray) {
    ScreenEvents.ensureRegistered(context)
    updateAll(context, advance = true)
  }

  override fun onEnabled(context: Context) {
    ScreenEvents.ensureRegistered(context)
  }

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    if (intent.action == ACTION_NEXT) {
      ScreenEvents.ensureRegistered(context)
      updateAll(context, advance = true)
    }
  }

  companion object {
    const val ACTION_NEXT = "com.urgeaway.quickaccess.ACTION_NEXT_MESSAGE"

    fun updateAll(context: Context, advance: Boolean) {
      val app = context.applicationContext
      val manager = AppWidgetManager.getInstance(app)
      val ids = manager.getAppWidgetIds(ComponentName(app, UrgeAwayWidgetProvider::class.java))
      if (ids.isEmpty()) return
      val message = if (advance) WidgetMessages.advance(app) else WidgetMessages.current(app)
      for (id in ids) {
        manager.updateAppWidget(id, buildViews(app, message))
      }
    }

    private fun buildViews(context: Context, message: String): RemoteViews {
      val views = RemoteViews(context.packageName, R.layout.quick_widget_message)
      views.setTextViewText(R.id.quick_widget_message, message)

      val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

      val next = Intent(context, UrgeAwayWidgetProvider::class.java).setAction(ACTION_NEXT)
      views.setOnClickPendingIntent(
        R.id.quick_widget_message,
        PendingIntent.getBroadcast(context, 1, next, flags)
      )

      val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
      if (launch != null) {
        views.setOnClickPendingIntent(
          R.id.quick_widget_logo,
          PendingIntent.getActivity(context, 2, launch, flags)
        )
      }
      return views
    }
  }
}
