import { requireNativeModule } from 'expo-modules-core';

export type InstalledApp = { packageName: string; appName: string; icon?: string | null };
export type LockedApp = { packageName: string; unlockAt: number; appName: string };

const NativeAppLock = requireNativeModule<{
  getInstalledApps(): Promise<{ apps: InstalledApp[] }>;
  getLockedApps(): Promise<{ locks: LockedApp[] }>;
  lockApps(args: { packages: string[]; unlockAt: number }): Promise<{ locked: number; error?: string }>;
  isAccessibilityEnabled(): Promise<{ enabled: boolean }>;
  getDiagnostics(): Promise<Record<string, unknown>>;
  openAccessibilitySettings(): Promise<void>;
  openAppInfoSettings(): Promise<void>;
}>('AppLockModule');

export default NativeAppLock;
