package com.urgeaway.quickaccess

import android.app.PendingIntent
import android.content.Intent
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

/* ==========================================================================
   Quick Settings tile ("I have an urge"). Tapping it opens UrgeAway through
   the urgeaway://urge link, which the web app turns into Urge Mode — the
   same flow as the Home screen's "I have an urge" button.
   On a locked phone Android asks for unlock first, then continues.
   ========================================================================== */
class UrgeTileService : TileService() {

  override fun onStartListening() {
    super.onStartListening()
    val tile = qsTile ?: return
    tile.state = Tile.STATE_ACTIVE
    tile.label = getString(R.string.quick_tile_label)
    if (Build.VERSION.SDK_INT >= 29) {
      tile.subtitle = getString(R.string.quick_tile_subtitle)
    }
    tile.icon = Icon.createWithResource(this, R.drawable.quick_ic_tile_urge)
    tile.updateTile()
  }

  override fun onClick() {
    super.onClick()
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("urgeaway://urge"))
      .setPackage(packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)

    val launch = Runnable {
      if (Build.VERSION.SDK_INT >= 34) {
        val pending = PendingIntent.getActivity(
          this, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        startActivityAndCollapse(pending)
      } else {
        @Suppress("DEPRECATION")
        startActivityAndCollapse(intent)
      }
    }

    if (isLocked) unlockAndRun(launch) else launch.run()
  }
}
