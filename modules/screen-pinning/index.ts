import { requireNativeModule } from 'expo-modules-core';

type StartResult = { started: boolean; reason?: string };
type NativeShape = {
  start(): Promise<StartResult>;
  stop(): Promise<{ stopped: boolean }>;
  isPinned(): Promise<{ pinned: boolean }>;
  openPinningSettings(): Promise<void>;
};

let native: NativeShape | null = null;
try {
  native = requireNativeModule<NativeShape>('ScreenPinningModule');
} catch (e) {
  console.warn('ScreenPinningModule not available:', e);
}

const fallback: NativeShape = {
  start: async () => ({ started: false, reason: 'unavailable' }),
  stop: async () => ({ stopped: true }),
  isPinned: async () => ({ pinned: false }),
  openPinningSettings: async () => {},
};

export default native ?? fallback;
