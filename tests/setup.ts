import 'fake-indexeddb/auto';
import { afterEach, vi } from 'vitest';

// A test cannot leak a browser, network or timer stub into another business scenario.
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
