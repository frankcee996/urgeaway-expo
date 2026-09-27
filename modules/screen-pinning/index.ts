import { requireNativeModule } from 'expo-modules-core';

type StartResult = { started: boolean; reason?: string };

const NativeScreenPinning = requireNativeModule<{
  start(): Promise<StartResult>;
  stop(): Promise<{ stopped: boolean }>;
  isPinned(): Promise<{ pinned: boolean }>;
  openPinningSettings(): Promise<void>;
}>('ScreenPinningModule');

export default NativeScreenPinning;
