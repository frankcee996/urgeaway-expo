# Expo Modules finds QuickAccessModule by class name via reflection, not a
# direct reference R8 can see — without this, release/store builds strip it.
-keep class com.urgeaway.quickaccess.** { *; }
