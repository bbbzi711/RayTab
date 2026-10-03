import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSyncConfig,
  loadSyncConfig,
  loadSyncStatus,
  saveSyncConfig,
} from '../src/sync/core/engine';
import { createTestLockManager } from './helpers/locks';

function storageArea(values: Record<string, unknown>) {
  return {
    async get(key: string) {
      return { [key]: values[key] };
    },
    async set(entries: Record<string, unknown>) {
      Object.assign(values, entries);
    },
    async remove(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key];
    },
  };
}

describe('sync connection storage', () => {
  let local: Record<string, unknown>;
  let session: Record<string, unknown>;

  beforeEach(() => {
    local = {};
    session = {};
    vi.stubGlobal('navigator', { locks: createTestLockManager() });
    vi.stubGlobal('browser', {
      storage: { local: storageArea(local), session: storageArea(session) },
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('releases the configuration lock after a failed save', async () => {
    const config = {
      connection: {
        type: 'webdav' as const,
        url: 'https://dav.test/backup.json',
        username: 'user',
        password: 'password',
      },
      includePrivate: false,
      automatic: true,
    };
    vi.spyOn(browser.storage.local, 'set').mockRejectedValueOnce(new Error('save failed'));
    await expect(saveSyncConfig(config)).rejects.toThrow('save failed');
    expect(local).toEqual({});
    await saveSyncConfig(config);
    await expect(loadSyncConfig()).resolves.toMatchObject(config);
  });

  it('restores the saved connection and keeps the private password in session storage', async () => {
    await saveSyncConfig({
      connection: {
        type: 'github',
        token: 'token',
        owner: 'raytab',
        repo: 'data',
        path: 'backup.json',
        branch: 'main',
      },
      includePrivate: true,
      privatePassword: 'private-password',
      automatic: false,
    });

    expect(local['raytab-sync-config']).not.toHaveProperty('privatePassword');
    await expect(loadSyncConfig()).resolves.toEqual({
      connection: {
        type: 'github',
        token: 'token',
        owner: 'raytab',
        repo: 'data',
        path: 'backup.json',
        branch: 'main',
      },
      includePrivate: true,
      privatePassword: 'private-password',
      automatic: false,
    });
  });

  it('clears connection, baseline, status and session password', async () => {
    local['raytab-sync-config'] = { connection: { type: 'webdav' } };
    local['raytab-sync-baseline'] = { document: {} };
    local['raytab-sync-status'] = { conflicts: [], lastSuccess: 'today' };
    session['raytab-sync-private-password'] = 'private-password';

    await clearSyncConfig();

    await expect(loadSyncConfig()).resolves.toBeUndefined();
    await expect(loadSyncStatus()).resolves.toEqual({ schemaVersion: 1, conflicts: [] });
    expect(local).toEqual({});
    expect(session).toEqual({});
  });
});
