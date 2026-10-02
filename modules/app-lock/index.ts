import { requireNativeModule } from 'expo-modules-core';

export type InstalledApp = { packageName: string; appName: string; icon?: string | null };
export type LockedApp = { packageName: string; unlockAt: number; appName: string };

type NativeShape = {
  getInstalledApps(): Promise<{ apps: InstalledApp[] }>;
  getLockedApps(): Promise<{ locks: LockedApp[] }>;
  lockApps(args: { packages: string[]; unlockAt: number }): Promise<{ locked: number; error?: string }>;
  isAccessibilityEnabled(): Promise<{ enabled: boolean }>;
  getDiagnostics(): Promise<Record<string, unknown>>;
  openAccessibilitySettings(): Promise<void>;
  openAppInfoSettings(): Promise<void>;
};

let native: NativeShape | null = null;
try {
  native = requireNativeModule<NativeShape>('AppLockModule');
} catch (e) {
  console.warn('AppLockModule not available:', e);
}

const fallback: NativeShape = {
  getInstalledApps: async () => ({ apps: [] }),
  getLockedApps: async () => ({ locks: [] }),
  lockApps: async () => ({ locked: 0, error: 'unavailable' }),
  isAccessibilityEnabled: async () => ({ enabled: false }),
  getDiagnostics: async () => ({}),
  openAccessibilitySettings: async () => {},
  openAppInfoSettings: async () => {},
};

export default native ?? fallback;
