import { vi } from 'vitest';

// Test only: production code always delegates ownership and lifetime to Web Locks.
export function createTestLockManager() {
  const held = new Set<string>();
  return {
    request: vi.fn(
      async <T>(
        name: string,
        options: LockOptions,
        callback: (lock: Lock | null) => T | PromiseLike<T>,
      ): Promise<T> => {
        if (options.mode !== 'exclusive' || !options.ifAvailable)
          throw new Error('This test fixture only models immediate exclusive requests');
        if (held.has(name)) return await callback(null);
        held.add(name);
        try {
          return await callback({ name, mode: 'exclusive' });
        } finally {
          held.delete(name);
        }
      },
    ),
  };
}
