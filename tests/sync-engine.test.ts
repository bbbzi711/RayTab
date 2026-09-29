import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBackup } from '../src/features/backup/backup';
import { createInitialState } from '../src/storage/model';
import { repository } from '../src/storage/repository';
import { applyCommand } from '../src/storage/operations';
import { loadSyncStatus, saveSyncConfig, synchronize } from '../src/sync/core/engine';

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

describe('sync engine', () => {
  let local: Record<string, unknown>;
  let session: Record<string, unknown>;

  beforeEach(async () => {
    local = {};
    session = {};
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
      await expect(synchronize(mode)).rejects.toThrow('本地数据发生变化');
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
    await expect(synchronize('auto')).rejects.toThrow('本地数据发生变化');
    expect((await repository.read()).spaces.normal.sites[0].title).toBe('Edited during upload');
    expect(local['raytab-sync-baseline']).toBeUndefined();
  });

  it('records retry state after a network failure without advancing the baseline', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    await expect(synchronize('auto')).rejects.toThrow('网络连接失败');

    await expect(loadSyncStatus()).resolves.toMatchObject({ retryCount: 1 });
    expect((await loadSyncStatus()).nextRetryAt).toBeTruthy();
    expect(local['raytab-sync-baseline']).toBeUndefined();
    expect(local['raytab-sync-lease']).toBeUndefined();
  });

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
          color: '#123456',
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
    await expect(synchronize('auto')).rejects.toThrow('需要填写同步加密密码');

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
