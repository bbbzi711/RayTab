import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSyncConfig,
  loadSyncConfig,
  loadSyncStatus,
  saveSyncConfig,
} from '../src/sync/core/engine';
import { createTestLockManager } from './helpers/locks';
import type { SyncConfig } from '../src/sync/core/engine';

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

  it('retains sync metadata when replacing a file URL with its equivalent server URL', async () => {
    const config = {
      connection: {
        type: 'webdav',
        url: 'https://dav.jianguoyun.com/dav/raytab.json',
        username: 'user',
        password: 'password',
      },
      automatic: false,
      includePrivate: false,
    } satisfies SyncConfig;
    await saveSyncConfig(config);
    const baseline = { document: 'existing', version: 'v1' };
    const status = { schemaVersion: 1, conflicts: [], lastSuccess: 'previous-success' };
    local['raytab-sync-baseline'] = baseline;
    local['raytab-sync-status'] = status;
    for (const url of ['https://dav.jianguoyun.com/dav/', 'https://dav.jianguoyun.com/dav']) {
      await saveSyncConfig({
        ...config,
        connection: { ...config.connection, url },
      });
      expect(local['raytab-sync-baseline']).toBe(baseline);
      expect(local['raytab-sync-status']).toBe(status);
      await expect(loadSyncConfig()).resolves.toMatchObject({ connection: { url } });
    }
  });

  it('allows replacing an invalid saved address without retaining its sync metadata', async () => {
    const config: SyncConfig = {
      connection: {
        type: 'webdav',
        url: 'https://dav.jianguoyun.com/tab',
        username: 'user',
        password: 'password',
      },
      automatic: false,
      includePrivate: false,
    };
    local['raytab-sync-config'] = config;
    local['raytab-sync-baseline'] = { document: 'old target', version: 'v1' };
    await saveSyncConfig({
      ...config,
      connection: {
        type: 'webdav',
        url: 'https://dav.jianguoyun.com/dav/',
        username: 'user',
        password: 'password',
      },
    });
    expect(local['raytab-sync-baseline']).toBeNull();
    await expect(loadSyncStatus()).resolves.toEqual({ schemaVersion: 1, conflicts: [] });
  });

  it.each([
    { type: 'webdav', url: 'https://dav.test/a.json', username: 'user', password: 'old' },
    { type: 'github', owner: 'raytab', repo: 'data', path: 'a.json', branch: 'main', token: 'old' },
    { type: 'gitee', owner: 'raytab', repo: 'data', path: 'a.json', branch: 'main', token: 'old' },
  ] satisfies SyncConfig['connection'][])(
    'retains the baseline and unresolved conflicts when rotating $type credentials',
    async (connection) => {
      await saveSyncConfig({ connection, automatic: false, includePrivate: false });
      const baseline = { document: 'existing', version: 'v1' };
      const status = { schemaVersion: 1, conflicts: [], lastSuccess: 'previous-success' };
      local['raytab-sync-baseline'] = baseline;
      local['raytab-sync-status'] = status;
      const next =
        connection.type === 'webdav'
          ? { ...connection, password: 'new' }
          : { ...connection, token: 'new' };
      await saveSyncConfig({ connection: next, automatic: true, includePrivate: false });
      expect(local['raytab-sync-baseline']).toBe(baseline);
      expect(local['raytab-sync-status']).toBe(status);
    },
  );

  it.each([
    { type: 'webdav', url: 'https://dav.test/b.json', username: 'user', password: 'old' },
    { type: 'webdav', url: 'https://dav.test/a.json', username: 'another-user', password: 'old' },
    { type: 'github', owner: 'other', repo: 'data', path: 'a.json', branch: 'main', token: 'old' },
    {
      type: 'github',
      owner: 'raytab',
      repo: 'other',
      path: 'a.json',
      branch: 'main',
      token: 'old',
    },
    { type: 'github', owner: 'raytab', repo: 'data', path: 'b.json', branch: 'main', token: 'old' },
    {
      type: 'github',
      owner: 'raytab',
      repo: 'data',
      path: 'a.json',
      branch: 'other',
      token: 'old',
    },
    { type: 'gitee', owner: 'raytab', repo: 'data', path: 'a.json', branch: 'main', token: 'old' },
  ] satisfies SyncConfig['connection'][])(
    'discards metadata from a different sync destination ($type $url $owner $repo $path $branch)',
    async (connection) => {
      const initial: SyncConfig['connection'] =
        connection.type === 'webdav'
          ? { type: 'webdav', url: 'https://dav.test/a.json', username: 'user', password: 'old' }
          : {
              type: 'github',
              owner: 'raytab',
              repo: 'data',
              path: 'a.json',
              branch: 'main',
              token: 'old',
            };
      await saveSyncConfig({ connection: initial, automatic: false, includePrivate: false });
      local['raytab-sync-baseline'] = { document: 'old target', version: 'old-etag' };
      local['raytab-sync-status'] = {
        schemaVersion: 1,
        conflicts: [],
        lastSuccess: 'old target success',
        lastError: { code: 'errors.invalidInput' },
        retryCount: 4,
        nextRetryAt: '2999-01-01T00:00:00Z',
      };
      await saveSyncConfig({ connection, automatic: false, includePrivate: false });
      expect(local['raytab-sync-baseline']).toBeNull();
      await expect(loadSyncStatus()).resolves.toEqual({ schemaVersion: 1, conflicts: [] });
      await expect(loadSyncConfig()).resolves.toMatchObject({ connection });
    },
  );

  it('keeps the prior connection, baseline, status and session password when target saving fails', async () => {
    const config: SyncConfig = {
      connection: {
        type: 'webdav',
        url: 'https://dav.test/a.json',
        username: 'user',
        password: 'old',
      },
      automatic: false,
      includePrivate: true,
      privatePassword: 'old-private-password',
    };
    await saveSyncConfig(config);
    const baseline = { document: 'previous', version: 'previous-etag' };
    const status = { schemaVersion: 1, conflicts: [], lastSuccess: 'previous-success' };
    local['raytab-sync-baseline'] = baseline;
    local['raytab-sync-status'] = status;
    vi.spyOn(browser.storage.local, 'set').mockRejectedValueOnce(new Error('quota'));
    await expect(
      saveSyncConfig({
        ...config,
        connection: {
          type: 'webdav',
          url: 'https://dav.test/b.json',
          username: 'user',
          password: 'new',
        },
        privatePassword: 'new-private-password',
      }),
    ).rejects.toThrow('quota');
    await expect(loadSyncConfig()).resolves.toEqual(config);
    expect(local['raytab-sync-baseline']).toBe(baseline);
    expect(local['raytab-sync-status']).toBe(status);
  });
});
