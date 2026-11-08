# Quick access: tile, widget, daily nudges

## "I have an urge" Quick Settings tile
After installing the new build: swipe down twice to open Quick Settings, tap
the pencil / Edit icon, and drag **I have an urge** into the visible tiles.
Tapping it opens UrgeAway straight into Urge Mode (same as the Home button).
On a locked phone Android asks you to unlock first, then continues.
Android does not let apps add tiles to your panel by themselves.

## Home-screen message widget
Long-press an empty spot on the home screen, then Widgets, then UrgeAway, then
**UrgeAway message**. Drag it where you want it (the centre of the screen is
your call; Android never lets an app place a widget itself).
- Tap the message: next message. Tap the logo: opens UrgeAway.
- It reshuffles when the screen turns off, and about every 30 minutes.
- Messages: `modules/quick-access/android/src/main/res/values/quick_widget_messages.xml`
  (50 of them, shuffled so each shows once before any repeat).

## 10 a.m. daily nudge
- Messages: `web/js/nudges.js` (50 of them, `NUDGE_MESSAGES`).
- One different message each morning, no repeats for 50 days, then reshuffled.
- The next 50 mornings are scheduled ahead and topped up every time the app
  opens, so it keeps going as long as you open the app at least once in 50 days.
- To refresh the words (e.g. every 50 days): edit the two files above, rebuild.

All of this needs a new EAS build (native code changed):
`eas build -p android --profile preview`
