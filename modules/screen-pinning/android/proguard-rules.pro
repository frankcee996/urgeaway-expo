# Same reasoning as app-lock's proguard-rules.pro — ScreenPinningModule is
# found via reflection, so R8 strips it in release/store builds unless
# kept explicitly.
-keep class com.urgeaway.screenpinning.** { *; }
