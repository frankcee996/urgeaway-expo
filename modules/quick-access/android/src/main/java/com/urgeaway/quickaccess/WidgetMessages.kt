package com.urgeaway.quickaccess

import android.content.Context

/* ==========================================================================
   The 50 widget messages live in res/values/quick_widget_messages.xml — edit
   that file to refresh them. This object just deals them out in a shuffled
   order: every message is shown once before any repeats, and the order is
   reshuffled when a round finishes. State is persisted so the widget shows
   the same message until it is advanced.
   ========================================================================== */
internal object WidgetMessages {
  private const val PREFS = "urgeaway_quick_access"
  private const val KEY_ORDER = "widget_order"
  private const val KEY_POS = "widget_pos"

  private fun all(ctx: Context): Array<String> =
    ctx.resources.getStringArray(R.array.quick_widget_messages)

  private fun newOrder(size: Int, avoidFirst: Int?): MutableList<Int> {
    val order = (0 until size).shuffled().toMutableList()
    // Don't open a new round with the message that just closed the last one.
    if (avoidFirst != null && size > 1 && order[0] == avoidFirst) {
      val swap = 1 + kotlin.random.Random.nextInt(size - 1)
      val tmp = order[0]
      order[0] = order[swap]
      order[swap] = tmp
    }
    return order
  }

  private fun load(ctx: Context, size: Int): Pair<MutableList<Int>, Int> {
    val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val stored = prefs.getString(KEY_ORDER, null)
    val order = stored?.split(",")?.mapNotNull { it.toIntOrNull() }?.toMutableList()
    val pos = prefs.getInt(KEY_POS, 0)
    // First run, or the message list was edited to a different length: start fresh.
    if (order == null || order.size != size || pos < 0 || pos >= size) {
      val fresh = newOrder(size, null)
      save(ctx, fresh, 0)
      return Pair(fresh, 0)
    }
    return Pair(order, pos)
  }

  private fun save(ctx: Context, order: List<Int>, pos: Int) {
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putString(KEY_ORDER, order.joinToString(","))
      .putInt(KEY_POS, pos)
      .apply()
  }

  @Synchronized
  fun current(ctx: Context): String {
    val msgs = all(ctx)
    if (msgs.isEmpty()) return ""
    val (order, pos) = load(ctx, msgs.size)
    return msgs[order[pos]]
  }

  @Synchronized
  fun advance(ctx: Context): String {
    val msgs = all(ctx)
    if (msgs.isEmpty()) return ""
    var (order, pos) = load(ctx, msgs.size)
    pos += 1
    if (pos >= msgs.size) {
      order = newOrder(msgs.size, order[msgs.size - 1])
      pos = 0
    }
    save(ctx, order, pos)
    return msgs[order[pos]]
  }
}
