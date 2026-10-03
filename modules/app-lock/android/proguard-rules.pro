# Expo Modules finds AppLockModule by class name via reflection, not a
# direct reference R8 can see — without this, release/store builds strip
# it as "unused," which is exactly what's been happening.
-keep class com.urgeaway.applock.** { *; }
