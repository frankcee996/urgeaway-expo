import { requireNativeModule } from 'expo-modules-core';

type NativeShape = {
  refreshWidget(): Promise<void>;
};

let native: NativeShape | null = null;
try {
  native = requireNativeModule<NativeShape>('QuickAccessModule');
} catch (e) {
  console.warn('QuickAccessModule not available:', e);
}

const fallback: NativeShape = {
  refreshWidget: async () => {},
};

export default native ?? fallback;
