import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSyncConfig,
  loadSyncConfig,
  loadSyncStatus,
  saveSyncConfig,
} from '../src/sync/core/engine';

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
    vi.stubGlobal('browser', {
      storage: { local: storageArea(local), session: storageArea(session) },
    });
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

  it('clears connection, baseline, status, lease and session password', async () => {
    local['raytab-sync-config'] = { connection: { type: 'webdav' } };
    local['raytab-sync-baseline'] = { document: {} };
    local['raytab-sync-status'] = { conflicts: [], lastSuccess: 'today' };
    local['raytab-sync-lease'] = { owner: 'tab' };
    session['raytab-sync-private-password'] = 'private-password';

    await clearSyncConfig();

    await expect(loadSyncConfig()).resolves.toBeUndefined();
    await expect(loadSyncStatus()).resolves.toEqual({ conflicts: [] });
    expect(local).toEqual({});
    expect(session).toEqual({});
  });
});
