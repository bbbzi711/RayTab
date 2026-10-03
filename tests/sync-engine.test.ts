import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBackup } from '../src/features/backup/backup';
import { createInitialState } from '../src/storage/model';
import { repository } from '../src/storage/repository';
import { applyCommand } from '../src/storage/operations';
import {
  clearSyncConfig,
  loadSyncConfig,
  loadSyncStatus,
  resolveSyncConflict,
  saveSyncConfig,
  SyncBusyError,
  synchronize,
  synchronizeAutomatically,
} from '../src/sync/core/engine';
import { createTestLockManager } from './helpers/locks';
import { createSyncConflict } from '../src/sync/core/merge';
import { AppError } from '../src/lib/errors';

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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
const placeholderConflict = createSyncConflict({
  entity: 'site',
  id: 'placeholder',
  field: 'title',
  local: 'Local',
  remote: 'Remote',
});

describe('sync engine', () => {
  let local: Record<string, unknown>;
  let session: Record<string, unknown>;

  beforeEach(async () => {
    local = {};
    session = {};
    vi.stubGlobal('navigator', { locks: createTestLockManager() });
    vi.stubGlobal('browser', {
      storage: { local: storageArea(local), session: storageArea(session) },
    });
    await repository.restore(createInitialState(), new Map());
    await saveSyncConfig({
      connection: {
        type: 'webdav',
        url: 'https://dav.test/raytab.json',
        username: 'user',
        password: 'password',
      },
      includePrivate: false,
      automatic: true,
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it.each(['auto', 'push', 'pull'] as const)(
    'excludes background sync, configuration changes and conflict choices during manual %s',
    async (mode) => {
      const remote = await createBackup(createInitialState(), new Map(), 'normal');
      const started = deferred<void>();
      const release = deferred<void>();
      const fetchMock = vi.fn(async (_url: string, init: RequestInit = {}) => {
        if (init.method !== 'PUT') {
          started.resolve();
          await release.promise;
        }
        return new Response(JSON.stringify(remote), { status: 200, headers: { etag: 'v1' } });
      });
      vi.stubGlobal('fetch', fetchMock);
      const config = (await loadSyncConfig())!;
      const status = { schemaVersion: 1, conflicts: [], lastSuccess: 'previous-success' };
      local['raytab-sync-status'] = status;
      const running = synchronize(mode);
      await started.promise;
      try {
        await expect(synchronizeAutomatically()).rejects.toBeInstanceOf(SyncBusyError);
        await expect(
          saveSyncConfig({ ...config, privatePassword: 'changed' }),
        ).rejects.toBeInstanceOf(SyncBusyError);
        await expect(clearSyncConfig()).rejects.toBeInstanceOf(SyncBusyError);
        await expect(resolveSyncConflict(placeholderConflict, 'local')).rejects.toBeInstanceOf(
          SyncBusyError,
        );
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await expect(loadSyncConfig()).resolves.toEqual(config);
        expect(local['raytab-sync-status']).toEqual(status);
        expect(local['raytab-sync-baseline']).toBeUndefined();
      } finally {
        release.resolve();
        await running;
      }
    },
  );

  it('excludes manual sync while an automatic sync is running', async () => {
    const started = deferred<void>();
    const release = deferred<void>();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit = {}) => {
        if (init.method !== 'PUT') {
          started.resolve();
          await release.promise;
          return new Response('', { status: 404 });
        }
        return new Response('', { status: 200, headers: { etag: 'v1' } });
      }),
    );
    const running = synchronizeAutomatically();
    await started.promise;
    try {
      await expect(synchronize('push')).rejects.toBeInstanceOf(SyncBusyError);
    } finally {
      release.resolve();
      await running;
    }
    await expect(loadSyncStatus()).resolves.toMatchObject({ conflicts: [], retryCount: 0 });
  });

  it('holds the configuration lock until both connection and session password are saved', async () => {
    const config = (await loadSyncConfig())!;
    const started = deferred<void>();
    const release = deferred<void>();
    vi.spyOn(browser.storage.session, 'set').mockImplementationOnce(async (entries) => {
      started.resolve();
      await release.promise;
      Object.assign(session, entries);
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const saving = saveSyncConfig({ ...config, automatic: false, privatePassword: 'new-password' });
    await started.promise;
    try {
      await expect(synchronizeAutomatically()).rejects.toBeInstanceOf(SyncBusyError);
      await expect(resolveSyncConflict(placeholderConflict, 'remote')).rejects.toBeInstanceOf(
        SyncBusyError,
      );
      await expect(clearSyncConfig()).rejects.toBeInstanceOf(SyncBusyError);
    } finally {
      release.resolve();
      await saving;
    }
    await expect(loadSyncConfig()).resolves.toMatchObject({
      automatic: false,
      privatePassword: 'new-password',
    });
    await expect(synchronizeAutomatically()).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(local['raytab-sync-config']).not.toHaveProperty('privatePassword');
  });

  it('excludes synchronization and configuration changes until a remote conflict choice is saved', async () => {
    const state = await repository.read();
    local['raytab-sync-status'] = {
      conflicts: [
        {
          entity: 'site',
          id: state.spaces.normal.sites[0].id,
          field: 'title',
          local: 'Local',
          remote: 'Remote',
        },
      ],
    };
    const started = deferred<void>();
    const release = deferred<void>();
    const restore = repository.restore.bind(repository);
    vi.spyOn(repository, 'restore').mockImplementationOnce(async (...args) => {
      started.resolve();
      await release.promise;
      return restore(...args);
    });
    const expected = (await loadSyncStatus()).conflicts[0];
    const resolving = resolveSyncConflict(expected, 'remote');
    await started.promise;
    try {
      await expect(synchronize()).rejects.toBeInstanceOf(SyncBusyError);
      await expect(saveSyncConfig((await loadSyncConfig())!)).rejects.toBeInstanceOf(SyncBusyError);
      await expect(resolveSyncConflict(expected, 'local')).rejects.toBeInstanceOf(SyncBusyError);
      expect((await loadSyncStatus()).conflicts).toHaveLength(1);
    } finally {
      release.resolve();
      await resolving;
    }
    expect((await repository.read()).spaces.normal.sites[0].title).toBe('Remote');
    expect((await loadSyncStatus()).conflicts).toHaveLength(0);
    await clearSyncConfig();
    await expect(loadSyncConfig()).resolves.toBeUndefined();
  });

  it('checks automatic retry eligibility without performing a remote request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    local['raytab-sync-status'] = { conflicts: [], nextRetryAt: '2999-01-01T00:00:00Z' };
    await expect(synchronizeAutomatically()).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails explicitly without Web Locks and does not mutate saved data', async () => {
    const config = (await loadSyncConfig())!;
    vi.stubGlobal('navigator', {});
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(synchronize()).rejects.toThrow(
      'messages.thisBrowserDoesNotSupportWebLocksSafeSyncIsUnavailable',
    );
    await expect(saveSyncConfig({ ...config, automatic: false })).rejects.toThrow(
      'messages.thisBrowserDoesNotSupportWebLocksSafeSyncIsUnavailable',
    );
    await expect(clearSyncConfig()).rejects.toThrow(
      'messages.thisBrowserDoesNotSupportWebLocksSafeSyncIsUnavailable',
    );
    await expect(resolveSyncConflict(placeholderConflict, 'local')).rejects.toThrow(
      'messages.thisBrowserDoesNotSupportWebLocksSafeSyncIsUnavailable',
    );
    await expect(loadSyncConfig()).resolves.toEqual(config);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(local['raytab-sync-status']).toBeUndefined();
  });

  it('releases the lock after an invalid conflict choice without removing conflicts', async () => {
    const conflicts = [
      { entity: 'group', id: 'private-space', field: '*', local: 'Local', remote: 'Remote' },
    ];
    local['raytab-sync-status'] = { conflicts };
    const expected = (await loadSyncStatus()).conflicts[0];
    await expect(resolveSyncConflict(expected, 'remote')).rejects.toThrow(
      'messages.resolvePrivateSpaceVersionsWithLocalToCloudOrCloudToLocal',
    );
    expect((await loadSyncStatus()).conflicts).toEqual([expected]);
    await expect(resolveSyncConflict(expected, 'local')).rejects.toThrow(
      'messages.resolvePrivateSpaceVersionsWithLocalToCloudOrCloudToLocal',
    );
    expect((await loadSyncStatus()).conflicts).toEqual([expected]);
    await clearSyncConfig();
    expect((await loadSyncStatus()).conflicts).toHaveLength(0);
  });

  it('creates a missing remote file and records a successful baseline', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(new Response('', { status: 200, headers: { etag: 'v1' } }));
    vi.stubGlobal('fetch', fetchMock);

    await synchronize('auto');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'PUT' });
    expect(fetchMock.mock.calls[1][1].headers['If-None-Match']).toBe('*');
    expect(local['raytab-sync-baseline']).toMatchObject({ version: 'v1' });
    await expect(loadSyncStatus()).resolves.toMatchObject({ conflicts: [], retryCount: 0 });
  });

  it('pulls a remote snapshot into the local repository', async () => {
    const remoteState = createInitialState();
    remoteState.spaces.normal.sites[0].title = 'Remote title';
    remoteState.spaces.normal.sites[0].updatedAt++;
    const remote = await createBackup(remoteState, new Map(), 'normal');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(remote), { status: 200, headers: { etag: 'remote-v1' } }),
        ),
    );

    await synchronize('pull');

    expect((await repository.read()).spaces.normal.sites[0].title).toBe('Remote title');
    expect(local['raytab-sync-baseline']).toMatchObject({ version: 'remote-v1' });
  });

  it.each(['push', 'pull', 'auto'] as const)(
    'keeps local and remote private spaces untouched during normal-only %s',
    async (mode) => {
      await repository.update((state) => {
        state.privateSettingOverrides.showClock = false;
      });
      const before = await repository.read();
      await repository.protectPrivate('local-vault-password');
      const remote = await createBackup(createInitialState(), new Map(), 'all', 'remote-password');
      let content = JSON.stringify(remote);
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_url: string, init: RequestInit = {}) => {
          if (init.method === 'PUT') content = String(init.body);
          return new Response(content, { status: 200, headers: { etag: 'v1' } });
        }),
      );
      try {
        await synchronize(mode);
        expect((await repository.read()).privateSecurity.locked).toBe(true);
        expect(JSON.parse(content).spaces.private).toEqual(remote.spaces.private);
        const unlocked = await repository.unlockPrivate('local-vault-password');
        expect(unlocked.spaces.private).toEqual(before.spaces.private);
        expect(unlocked.privateSettingOverrides).toEqual(before.privateSettingOverrides);
      } finally {
        await repository.removePrivatePassword('local-vault-password');
      }
    },
  );

  it.each(['pull', 'auto'] as const)(
    'preserves edits made while a %s request is in flight',
    async (mode) => {
      const remote = await createBackup(createInitialState(), new Map(), 'normal');
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_url: string, init: RequestInit = {}) => {
          if (init.method !== 'PUT')
            await repository.update((state) => {
              state.spaces.normal.sites[0].title = 'New local edit';
            });
          return new Response(JSON.stringify(remote), { status: 200, headers: { etag: 'v1' } });
        }),
      );
      await expect(synchronize(mode)).rejects.toThrow(
        /(messages\.localDataChangedDuringSyncTryAgain|messages\.localDataChangedDuringThisOperationTryAgain)/,
      );
      expect((await repository.read()).spaces.normal.sites[0].title).toBe('New local edit');
      expect(local['raytab-sync-baseline']).toBeUndefined();
    },
  );

  it('keeps a local edit made during upload and leaves the baseline unchanged', async () => {
    const remote = await createBackup(createInitialState(), new Map(), 'normal');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit = {}) => {
        if (init.method === 'PUT')
          await repository.update((state) => {
            state.spaces.normal.sites[0].title = 'Edited during upload';
          });
        return new Response(JSON.stringify(remote), { status: 200, headers: { etag: 'v1' } });
      }),
    );
    await expect(synchronize('auto')).rejects.toThrow(
      /(messages\.localDataChangedDuringSyncTryAgain|messages\.localDataChangedDuringThisOperationTryAgain)/,
    );
    expect((await repository.read()).spaces.normal.sites[0].title).toBe('Edited during upload');
    expect(local['raytab-sync-baseline']).toBeUndefined();
  });

  it('records retry state after a network failure without advancing the baseline', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    await expect(synchronize('auto')).rejects.toThrow(
      'messages.theConnectionFailedCheckTheAddressAndNetwork',
    );

    await expect(loadSyncStatus()).resolves.toMatchObject({ retryCount: 1 });
    expect((await loadSyncStatus()).nextRetryAt).toBeTruthy();
    expect(local['raytab-sync-baseline']).toBeUndefined();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response('', { status: 404 }))
        .mockResolvedValueOnce(new Response('', { status: 200, headers: { etag: 'recovered' } })),
    );
    await synchronize();
    await expect(loadSyncStatus()).resolves.toMatchObject({ retryCount: 0 });
    expect(local['raytab-sync-baseline']).toMatchObject({ version: 'recovered' });
  });

  it.each([
    new Error('password=password private=fixture-private-token'),
    new Error('errors.password.password'),
    'password=password',
  ])('persists unknown failures without their diagnostic text: %s', async (failure) => {
    vi.spyOn(repository, 'snapshot').mockRejectedValueOnce(failure);
    await expect(synchronize()).rejects.toBe(failure);
    expect((await loadSyncStatus()).lastError).toEqual({
      code: 'messages.anErrorOccurredTryAgain',
    });
    expect(JSON.stringify(local['raytab-sync-status'])).not.toContain('password');
    expect(local['raytab-sync-baseline']).toBeUndefined();
  });

  it('retains semantic failure parameters while redacting configured secrets', async () => {
    await saveSyncConfig({
      ...(await loadSyncConfig())!,
      privatePassword: 'fixture-private-token',
    });
    vi.spyOn(repository, 'snapshot').mockRejectedValueOnce(
      new AppError('errors.backup.missingResource', {
        id: 'image-password-fixture-private-token',
        count: 2,
      }),
    );
    await expect(synchronize()).rejects.toThrow('errors.backup.missingResource');
    expect((await loadSyncStatus()).lastError).toEqual({
      code: 'errors.backup.missingResource',
      values: { id: 'image-[redacted]-[redacted]', count: 2 },
    });
    expect(JSON.stringify(local['raytab-sync-status'])).not.toContain('fixture-private-token');
  });

  it.each(['github', 'gitee'] as const)(
    'records an invalid %s response without copying its token-bearing body',
    async (type) => {
      const connection = {
        type,
        owner: 'ray',
        repo: 'tab',
        path: 'data.json',
        token: 'response-sensitive-token',
      };
      await saveSyncConfig({ ...(await loadSyncConfig())!, connection });
      const before = await repository.read();
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response(`${connection.token} is invalid JSON`, { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      await expect(synchronize()).rejects.toMatchObject({
        code: 'invalid',
        translationKey: 'errors.sync.invalidRemoteResponse',
      });
      expect((await loadSyncStatus()).lastError).toEqual({
        code: 'errors.sync.invalidRemoteResponse',
        values: {},
      });
      expect(JSON.stringify(local['raytab-sync-status'])).not.toContain(connection.token);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(local['raytab-sync-baseline']).toBeUndefined();
      expect(await repository.read()).toEqual(before);
    },
  );

  it('merges independent offline edits and retains same-field conflicts', async () => {
    let remoteContent = '';
    let version = 0;
    const fetchMock = vi.fn(async (_url: string, init: RequestInit = {}) => {
      if (init.method === 'PUT') {
        remoteContent = String(init.body);
        version++;
        return new Response('', { status: 200, headers: { etag: `v${version}` } });
      }
      return remoteContent
        ? new Response(remoteContent, { status: 200, headers: { etag: `v${version}` } })
        : new Response('', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    await synchronize('auto');

    const localBefore = await repository.read();
    const first = localBefore.spaces.normal.sites[0];
    const second = localBefore.spaces.normal.sites[1];
    await repository.update((state) =>
      applyCommand(state, {
        type: 'save-site',
        spaceId: 'normal',
        id: first.id,
        groupId: first.groupId,
        folderId: null,
        expected: first.updatedAt,
        site: { ...first, title: 'Local edit' },
      }),
    );
    const remote = JSON.parse(remoteContent);
    remote.spaces.normal.data.sites.find((site: { id: string }) => site.id === second.id).title =
      'Remote edit';
    remoteContent = JSON.stringify(remote);

    await synchronize('auto');

    const merged = await repository.read();
    expect(merged.spaces.normal.sites.find((site) => site.id === first.id)?.title).toBe(
      'Local edit',
    );
    expect(merged.spaces.normal.sites.find((site) => site.id === second.id)?.title).toBe(
      'Remote edit',
    );
    expect((await loadSyncStatus()).conflicts).toHaveLength(0);

    const currentFirst = merged.spaces.normal.sites.find((site) => site.id === first.id)!;
    await repository.update((state) =>
      applyCommand(state, {
        type: 'save-site',
        spaceId: 'normal',
        id: first.id,
        groupId: first.groupId,
        folderId: null,
        expected: currentFirst.updatedAt,
        site: { ...first, title: 'Second local edit' },
      }),
    );
    const conflictingRemote = JSON.parse(remoteContent);
    const remoteFirst = conflictingRemote.spaces.normal.data.sites.find(
      (site: { id: string }) => site.id === first.id,
    );
    remoteFirst.title = 'Second remote edit';
    remoteFirst.updatedAt++;
    remoteFirst.changeId = 'remote-change';
    remoteContent = JSON.stringify(conflictingRemote);

    await synchronize('auto');

    expect((await loadSyncStatus()).conflicts).toContainEqual(
      expect.objectContaining({ entity: 'site', id: first.id, field: 'title' }),
    );
    expect(
      (await repository.read()).spaces.normal.sites.find((site) => site.id === first.id)?.title,
    ).toBe('Second local edit');
  });

  it('publishes local deletions and does not revive them on a fresh pull', async () => {
    let remoteContent = '';
    let version = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit = {}) => {
        if (init.method === 'PUT') {
          remoteContent = String(init.body);
          version++;
          return new Response('', { status: 200, headers: { etag: `v${version}` } });
        }
        return remoteContent
          ? new Response(remoteContent, { status: 200, headers: { etag: `v${version}` } })
          : new Response('', { status: 404 });
      }),
    );
    await synchronize('auto');
    const deletedId = (await repository.read()).spaces.normal.sites[0].id;
    await repository.update((state) =>
      applyCommand(state, { type: 'delete-site', spaceId: 'normal', id: deletedId }),
    );

    await synchronize('auto');
    const remote = JSON.parse(remoteContent);
    expect(remote.spaces.normal.data.sites).not.toContainEqual(
      expect.objectContaining({ id: deletedId }),
    );
    expect(remote.spaces.normal.data.tombstones).toContainEqual(
      expect.objectContaining({ id: deletedId, entity: 'site' }),
    );

    await repository.restore(createInitialState(), new Map());
    await synchronize('pull');
    expect((await repository.read()).spaces.normal.sites).not.toContainEqual(
      expect.objectContaining({ id: deletedId }),
    );
  });

  it('keeps protected private data encrypted across a local password change', async () => {
    const initial = await repository.read();
    await repository.update((state) =>
      applyCommand(state, {
        type: 'save-site',
        spaceId: 'private',
        id: 'private-sync-site',
        groupId: initial.spaces.private.groups[0].id,
        folderId: null,
        site: {
          title: 'Private sync site',
          url: 'https://private-sync.example',
          icon: { source: 'auto' },
          iconBackground: { mode: 'color', color: '#123456' },
        },
      }),
    );
    await repository.protectPrivate('first-vault-password');
    await repository.unlockPrivate('first-vault-password');
    await saveSyncConfig({
      connection: {
        type: 'webdav',
        url: 'https://dav.test/raytab.json',
        username: 'user',
        password: 'password',
      },
      includePrivate: true,
      automatic: true,
    });
    vi.stubGlobal('fetch', vi.fn());
    await expect(synchronize('auto')).rejects.toThrow(
      'messages.enterASyncEncryptionPasswordBeforeSyncingTheProtectedPrivateSpace',
    );
    await expect(loadSyncStatus()).resolves.toMatchObject({
      lastError: {
        code: 'messages.enterASyncEncryptionPasswordBeforeSyncingTheProtectedPrivateSpace',
      },
      retryCount: 1,
    });

    let remoteContent = '';
    let version = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit = {}) => {
        if (init.method === 'PUT') {
          remoteContent = String(init.body);
          version++;
          return new Response('', { status: 200, headers: { etag: `v${version}` } });
        }
        return remoteContent
          ? new Response(remoteContent, { status: 200, headers: { etag: `v${version}` } })
          : new Response('', { status: 404 });
      }),
    );
    await saveSyncConfig({
      connection: {
        type: 'webdav',
        url: 'https://dav.test/raytab.json',
        username: 'user',
        password: 'password',
      },
      includePrivate: true,
      privatePassword: 'sync-encryption-password',
      automatic: true,
    });
    await synchronize('auto');
    expect(remoteContent).not.toContain('private-sync.example');

    await repository.changePrivatePassword('first-vault-password', 'second-vault-password');
    await repository.unlockPrivate('second-vault-password');
    await synchronize('auto');
    expect(remoteContent).not.toContain('private-sync.example');
    await expect(loadSyncStatus()).resolves.toMatchObject({ conflicts: [], retryCount: 0 });
    await repository.removePrivatePassword('second-vault-password');
  });
});
