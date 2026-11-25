import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { vectorArtwork, vectorImage } from '../helpers/images';
import {
  createBackup,
  encodeBackup,
  parseBackup,
  privateBackupPayload,
} from '../../src/features/backup/backup';
import { createInitialState, type RayState } from '../../src/storage/model';
import { createSyncConflict } from '../../src/sync/core/merge';
import { encryptJson } from '../../src/security/crypto';
import { applyCommand } from '../../src/storage/operations';
import { createLegacyV4State } from '../helpers/legacy';
import { createTestLockManager } from '../helpers/locks';

const protectedId = 'work-private';
const vaultPassword = 'test-vault-password';
const STATUS = 'raytab-sync-status';
const BASELINE = 'raytab-sync-baseline';
const encoded = (id: string, text = id) => ({ id, type: 'image/png', data: btoa(text) });
const image = (text: string) => new Blob([text], { type: 'image/png' });
function storageArea(values: Record<string, unknown>) {
  return {
    async get(key: string) {
      return structuredClone({ [key]: values[key] });
    },
    async set(entries: Record<string, unknown>) {
      Object.assign(values, structuredClone(entries));
    },
    async remove(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key];
    },
  };
}

describe('icon sync, durable conflict resources and encrypted payloads', () => {
  let repository: typeof import('../../src/storage/repository').repository;
  let engine: typeof import('../../src/sync/core/engine');
  let values: Record<string, unknown>;
  let content: string;
  let version: number;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal('indexedDB', new IDBFactory());
    values = {};
    content = '';
    version = 0;
    vi.stubGlobal('navigator', { locks: createTestLockManager() });
    vi.stubGlobal('browser', { storage: { local: storageArea(values), session: storageArea({}) } });
    fetchMock = vi.fn(async (_url: string, init: RequestInit = {}) => {
      if (init.method === 'PUT') {
        expect(
          (init.headers as Record<string, string>)[content ? 'If-Match' : 'If-None-Match'],
        ).toBe(content ? `v${version}` : '*');
        content = String(init.body);
        version++;
        return new Response('', { status: 200, headers: { etag: `v${version}` } });
      }
      return content
        ? new Response(content, { status: 200, headers: { etag: `v${version}` } })
        : new Response('', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    repository = (await import('../../src/storage/repository')).repository;
    engine = await import('../../src/sync/core/engine');
    await repository.restore(createInitialState(), new Map());
    await engine.saveSyncConfig({
      connection: {
        type: 'webdav',
        url: 'https://dav.test/icons.json',
        username: 'test',
        password: 'test',
      },
      includePrivate: false,
      automatic: true,
    });
  });
  afterEach(async () => {
    await repository.close();
    vi.restoreAllMocks();
  });

  async function reload() {
    await repository.close();
    vi.resetModules();
    repository = (await import('../../src/storage/repository')).repository;
    engine = await import('../../src/sync/core/engine');
  }
  async function setAllRange() {
    await engine.saveSyncConfig({
      ...(await engine.loadSyncConfig())!,
      includePrivate: true,
      automatic: false,
      privatePassword: 'sync-password',
    });
  }
  async function createProtectedGroup() {
    await repository.update((state) =>
      applyCommand(state, { type: 'save-group', spaceId: 'normal', id: protectedId, name: 'Work' }),
    );
    await repository.protectPrivate(vaultPassword, { spaceId: 'normal', groupId: protectedId });
    await repository.unlockPrivate(vaultPassword);
  }
  async function updatePrivate(title: string) {
    await repository.update((state) => {
      const first = state.spaces.normal.sites[0];
      state.spaces.private.sites = [
        {
          ...first,
          id: 'private-sync',
          groupId: protectedId,
          title,
          url: 'https://private.example/',
          updatedAt: first.updatedAt + 1,
        },
      ];
    });
  }

  it('syncs vector bytes, MIME and deliberate composition through public and encrypted private payloads', async () => {
    await setAllRange();
    await createProtectedGroup();
    const privateArt = vectorArtwork.replace('RayTab 标记', 'Private artwork');
    await repository.update(
      (state) => {
        const first = state.spaces.normal.sites[0];
        first.icon = { source: 'auto', resourceId: 'normal-vector', fit: 'original' };
        state.spaces.private.sites = [
          {
            ...first,
            id: 'private-vector-site',
            groupId: protectedId,
            url: 'https://private.example/vector',
            icon: { source: 'resource', resourceId: 'private-vector' },
          },
        ];
      },
      new Map([
        ['normal-vector', vectorImage()],
        ['private-vector', new Blob([privateArt], { type: 'image/svg+xml' })],
      ]),
    );
    await engine.synchronize('push');
    expect(content).not.toContain('https://private.example/vector');
    expect(content).not.toContain(vectorArtwork);
    expect(content).not.toContain(Buffer.from(privateArt, 'utf8').toString('base64'));
    expect(content).toContain(Buffer.from(vectorArtwork, 'utf8').toString('base64'));
    await repository.restore(createInitialState(), new Map());
    await engine.synchronize('pull');
    await reload();
    const locked = await repository.read();
    expect(locked.privateSecurity).toEqual({ protected: true, locked: true });
    expect(await repository.resource('private-vector')).toBeUndefined();
    const restored = await repository.unlockPrivate(vaultPassword);
    expect(restored.spaces.normal.sites[0].icon).toEqual({
      source: 'auto',
      resourceId: 'normal-vector',
      fit: 'original',
    });
    expect(restored.spaces.private.sites[0].icon).toEqual({
      source: 'resource',
      resourceId: 'private-vector',
    });
    for (const id of ['normal-vector', 'private-vector']) {
      const image = await repository.resource(id);
      expect(image?.type).toBe('image/svg+xml');
      expect(await image?.text()).toBe(id === 'private-vector' ? privateArt : vectorArtwork);
    }
  });

  it('keeps icon source and resource atomic, merges the independent background and restores a remote icon after reload', async () => {
    await engine.synchronize();
    const before = await repository.read();
    const id = before.spaces.normal.sites[0].id;
    await repository.update(
      (state) => {
        const site = state.spaces.normal.sites.find((item) => item.id === id)!;
        site.icon = { source: 'resource', resourceId: 'local-icon' };
        site.updatedAt++;
        site.changeId = 'local-icon-change';
      },
      new Map([['local-icon', image('original local bytes')]]),
    );
    const remote = await parseBackup(content);
    const remoteSite = remote.spaces.normal!.data.sites.find(
      (site: { id: string }) => site.id === id,
    )!;
    remoteSite.icon = { source: 'auto', resourceId: 'remote-icon' };
    remoteSite.iconBackground = { mode: 'color', color: '#654321' };
    remoteSite.updatedAt++;
    remoteSite.changeId = 'remote-icon-change';
    remote.spaces.normal!.resources.push(encoded('remote-icon', 'original remote bytes'));
    content = JSON.stringify(encodeBackup(remote));
    await engine.synchronize();
    let status = await engine.loadSyncStatus();
    expect(status.conflicts).toHaveLength(1);
    expect(status.conflicts[0]).toMatchObject({
      entity: 'site',
      id,
      field: 'icon',
      local: { source: 'resource', resourceId: 'local-icon' },
      remote: { source: 'auto', resourceId: 'remote-icon' },
    });
    expect(
      (await repository.read()).spaces.normal.sites.find((site) => site.id === id),
    ).toMatchObject({
      icon: status.conflicts[0].local,
      iconBackground: { mode: 'color', color: '#654321' },
    });
    expect(await repository.resource('remote-icon')).toBeUndefined();
    expect(JSON.stringify(values[BASELINE])).toContain(
      encoded('remote-icon', 'original remote bytes').data,
    );
    await engine.synchronize();
    expect((await engine.loadSyncStatus()).conflicts).toEqual(status.conflicts);
    await reload();
    status = await engine.loadSyncStatus();
    expect(await repository.resource('remote-icon')).toBeUndefined();
    await engine.resolveSyncConflict(status.conflicts[0], 'remote');
    expect(
      (await repository.read()).spaces.normal.sites.find((site) => site.id === id)!.icon,
    ).toEqual({ source: 'auto', resourceId: 'remote-icon' });
    expect(await (await repository.resource('remote-icon'))!.text()).toBe('original remote bytes');
    expect(await repository.resource('local-icon')).toBeUndefined();
    expect((await engine.loadSyncStatus()).conflicts).toEqual([]);
    await engine.synchronize();
    expect(
      (await parseBackup(content)).spaces.normal!.resources.map(
        (resource: { id: string }) => resource.id,
      ),
    ).toEqual(['remote-icon']);
    expect(JSON.stringify(values[BASELINE])).not.toContain('local-icon');
  });

  it('retains cached website images for a whole-site conflict against a new text icon', async () => {
    await engine.synchronize();
    const before = await repository.read();
    const added = {
      ...before.spaces.normal.sites[0],
      id: 'concurrent-added-site',
      title: 'Local text icon',
      icon: { source: 'text' as const, text: 'Ray中' },
    };
    await repository.update((state) => {
      state.spaces.normal.sites.push(added);
    });
    const remote = await parseBackup(content);
    remote.spaces.normal!.data.sites.push({
      ...added,
      title: 'Remote website icon',
      icon: { source: 'auto', resourceId: 'whole-website-icon' },
    });
    remote.spaces.normal!.resources.push(encoded('whole-website-icon', 'website image bytes'));
    content = JSON.stringify(encodeBackup(remote));
    await engine.synchronize();
    const conflict = (await engine.loadSyncStatus()).conflicts[0];
    expect(conflict).toMatchObject({
      entity: 'site',
      id: added.id,
      field: '*',
      local: { icon: added.icon },
    });
    expect(
      (await parseBackup(content)).spaces.normal!.data.sites.find(
        (site: { id: string }) => site.id === added.id,
      )!.icon,
    ).toEqual(added.icon);
    expect(await repository.resource('whole-website-icon')).toBeUndefined();
    await engine.synchronize();
    expect((await engine.loadSyncStatus()).conflicts).toEqual([conflict]);
    await reload();
    await engine.resolveSyncConflict((await engine.loadSyncStatus()).conflicts[0], 'remote');
    expect(
      (await repository.read()).spaces.normal.sites.find((site) => site.id === added.id)!.icon,
    ).toEqual({ source: 'auto', resourceId: 'whole-website-icon' });
    expect(await (await repository.resource('whole-website-icon'))!.text()).toBe(
      'website image bytes',
    );
  });

  it('rejects stale conflict identity or payload instead of selecting the next remaining conflict', async () => {
    const state = await repository.read();
    const conflicts = state.spaces.normal.sites.slice(0, 2).map((site) =>
      createSyncConflict({
        entity: 'site',
        id: site.id,
        field: 'title',
        local: site.title,
        remote: `Remote ${site.title}`,
      }),
    );
    values[STATUS] = { schemaVersion: 1, conflicts };
    const expected = structuredClone(conflicts[0]);
    await engine.resolveSyncConflict(expected, 'local');
    await expect(engine.resolveSyncConflict(expected, 'remote')).rejects.toThrow(
      'errors.sync.conflictChanged',
    );
    expect((await engine.loadSyncStatus()).conflicts).toEqual([conflicts[1]]);
    values[STATUS] = { schemaVersion: 1, conflicts: [{ ...expected, remote: 'New remote value' }] };
    await expect(engine.resolveSyncConflict(expected, 'remote')).rejects.toThrow(
      'errors.sync.conflictChanged',
    );
    expect((await repository.read()).spaces.normal.sites).toEqual(state.spaces.normal.sites);
  });

  it('converts the known baseline and pending icon/color/whole-site conflicts, retaining the remote version token and candidate bytes', async () => {
    const old = createLegacyV4State();
    const site = old.spaces.normal.sites[0];
    const second = old.spaces.normal.sites[1];
    const legacyDocument = {
      format: 'raytab-backup',
      version: 2,
      createdAt: new Date().toISOString(),
      spaces: {
        normal: {
          data: old.spaces.normal,
          settings: old.normalSettings,
          resources: [encoded('pending-icon'), encoded('pending-whole')],
        },
      },
    };
    values[BASELINE] = { document: legacyDocument, version: 'original-etag' };
    values[STATUS] = {
      lastError: 'historical diagnostic',
      conflicts: [
        { entity: 'site', id: site.id, field: 'iconId', local: undefined, remote: 'pending-icon' },
        { entity: 'site', id: site.id, field: 'color', local: '#123456', remote: '#abcdef' },
        {
          entity: 'site',
          id: second.id,
          field: '*',
          local: second,
          remote: { ...second, title: 'Whole remote', iconId: 'pending-whole' },
        },
      ],
    };
    const status = await engine.loadSyncStatus();
    expect(status.lastError).toBe('historical diagnostic');
    expect(status.conflicts.map((conflict) => conflict.field)).toEqual([
      'icon',
      'iconBackground',
      '*',
    ]);
    expect(JSON.stringify(status)).not.toContain('iconId');
    await engine.resolveSyncConflict(status.conflicts[0], 'remote');
    expect(values[BASELINE]).toMatchObject({ version: 'original-etag', document: { version: 4 } });
    expect(values[STATUS]).toMatchObject({ schemaVersion: 1 });
    expect(await (await repository.resource('pending-icon'))!.text()).toBe('pending-icon');
    await reload();
    await engine.resolveSyncConflict((await engine.loadSyncStatus()).conflicts[0], 'remote');
    expect((await repository.read()).spaces.normal.sites[0].iconBackground).toEqual({
      mode: 'color',
      color: '#abcdef',
    });
    await engine.resolveSyncConflict((await engine.loadSyncStatus()).conflicts[0], 'remote');
    expect((await repository.read()).spaces.normal.sites[1]).toMatchObject({
      title: 'Whole remote',
      icon: { source: 'resource', resourceId: 'pending-whole' },
    });
    expect(await (await repository.resource('pending-whole'))!.text()).toBe('pending-whole');
  });

  it('cleans current baseline and conflict display fields once while preserving cached website candidates', async () => {
    const state = await repository.read();
    const first = state.spaces.normal.sites[0];
    const second = state.spaces.normal.sites[1];
    const document = await createBackup(state, new Map(), 'normal');
    const saved = {
      ...document,
      spaces: {
        normal: {
          ...document.spaces.normal!,
          data: {
            ...document.spaces.normal!.data,
            sites: document.spaces.normal!.data.sites.map((site) => ({
              ...site,
              icon: { ...site.icon, display: 'logo' },
            })),
          },
          resources: [encoded('pending-icon'), encoded('pending-whole')],
        },
      },
    };
    values[BASELINE] = { document: saved, version: 'original-etag' };
    values[STATUS] = {
      schemaVersion: 1,
      conflicts: [
        createSyncConflict({
          entity: 'site',
          id: first.id,
          field: 'icon',
          local: { source: 'text', text: 'Ray', display: 'full' },
          remote: { source: 'auto', resourceId: 'pending-icon', display: 'logo' },
        }),
        createSyncConflict({
          entity: 'site',
          id: second.id,
          field: '*',
          local: { ...second, icon: { ...second.icon, display: 'full' } },
          remote: {
            ...second,
            title: 'Cached whole remote',
            icon: { source: 'auto', resourceId: 'pending-whole', display: 'logo' },
          },
        }),
      ],
    };
    const normalized = await engine.loadSyncStatus();
    expect(normalized.conflicts[0].local).toEqual({ source: 'text', text: 'Ray' });
    expect(normalized.conflicts[0].remote).toEqual({ source: 'auto', resourceId: 'pending-icon' });
    expect(JSON.stringify(normalized)).not.toContain('display');
    await engine.resolveSyncConflict(normalized.conflicts[0], 'remote');
    const cleanedBaseline = values[BASELINE];
    expect(cleanedBaseline).toMatchObject({ version: 'original-etag', document: { version: 4 } });
    expect(JSON.stringify(cleanedBaseline)).not.toContain('display');
    expect(JSON.stringify(values[STATUS])).not.toContain('display');
    expect(await (await repository.resource('pending-icon'))!.text()).toBe('pending-icon');
    await reload();
    await engine.resolveSyncConflict((await engine.loadSyncStatus()).conflicts[0], 'remote');
    expect(values[BASELINE]).toBe(cleanedBaseline);
    expect((await repository.read()).spaces.normal.sites[1]).toMatchObject({
      title: 'Cached whole remote',
      icon: { source: 'auto', resourceId: 'pending-whole' },
    });
    expect(await (await repository.resource('pending-whole'))!.text()).toBe('pending-whole');
  });

  it('compares normalized authenticated private payloads instead of randomized ciphertext or their previous icon schema', async () => {
    const old = createLegacyV4State();
    old.spaces.private.sites = [
      {
        ...old.spaces.normal.sites[0],
        id: 'private-old',
        url: 'https://legacy-private.example/image',
        groupId: old.spaces.private.groups[0].id,
        iconId: 'old-private-image',
      },
    ];
    await setAllRange();
    const legacy = {
      format: 'raytab-backup',
      version: 2,
      createdAt: new Date().toISOString(),
      spaces: {
        normal: { data: old.spaces.normal, settings: old.normalSettings, resources: [] },
        private: {
          protected: true,
          envelope: await encryptJson(
            {
              data: old.spaces.private,
              settings: old.normalSettings,
              resources: [encoded('old-private-image')],
            },
            'sync-password',
          ),
        },
      },
    };
    content = JSON.stringify(legacy);
    version = 1;
    await engine.synchronize('pull');
    await reload();
    expect((await repository.read()).privateSecurity.locked).toBe(true);
    await repository.unlockPrivate('sync-password');
    values[BASELINE] = { document: structuredClone(legacy), version: 'v1' };
    await engine.synchronize();
    expect((await engine.loadSyncStatus()).conflicts).toEqual([]);
    expect(JSON.parse(content).version).toBe(4);
    expect(content).not.toContain(old.spaces.private.sites[0].url);
    expect((await repository.read()).spaces.private.sites[0].icon).toEqual({
      source: 'resource',
      resourceId: 'old-private-image',
    });
    expect(await (await repository.resource('old-private-image'))!.text()).toBe(
      'old-private-image',
    );
  });

  it.each(['local', 'remote'] as const)(
    'resolves only the conflicting protected group using the %s version after reload',
    async (choice) => {
      await setAllRange();
      await createProtectedGroup();
      await updatePrivate('Ancestor private');
      await engine.synchronize('push');
      const ancestor = await repository.snapshot();
      const baseline = structuredClone(values[BASELINE]);
      await updatePrivate('Local private');
      await repository.update((state) => {
        state.spaces.normal.sites[1].title = 'Local public';
      });
      const localBefore = await repository.read();
      const remoteState: RayState = structuredClone(ancestor.state);
      remoteState.spaces.private.sites[0].title = 'Remote private';
      remoteState.spaces.normal.sites[0].title = 'Remote public';
      content = JSON.stringify(
        encodeBackup(await createBackup(remoteState, ancestor.resources, 'all', 'sync-password')),
      );
      version++;
      const remoteBefore = content;
      fetchMock.mockClear();
      await expect(engine.synchronize()).rejects.toThrow('errors.sync.protectedGroupConflict');
      expect(content).toBe(remoteBefore);
      expect(await repository.read()).toEqual(localBefore);
      expect(values[BASELINE]).toEqual(baseline);
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
      const status = await engine.loadSyncStatus();
      expect(status).toMatchObject({
        retryCount: 1,
        lastError: { code: 'errors.sync.protectedGroupConflict' },
        conflicts: [
          {
            entity: 'group',
            id: protectedId,
            field: 'protected-group',
            local: localBefore.revision,
            remote: `v${version}`,
          },
        ],
      });
      expect(JSON.stringify(values[STATUS])).not.toContain('Local private');
      expect(JSON.stringify(values[STATUS])).not.toContain('Remote private');
      await reload();
      expect((await engine.loadSyncStatus()).conflicts).toEqual(status.conflicts);
      await expect(engine.resolveSyncConflict(status.conflicts[0], choice)).rejects.toThrow(
        'messages.unlockThePrivateSpaceBeforeCreatingABackupThatIncludesIt',
      );
      expect(content).toBe(remoteBefore);
      await repository.unlockPrivate(vaultPassword);
      await engine.resolveSyncConflict(status.conflicts[0], choice);
      expect((await engine.loadSyncStatus()).conflicts).toEqual([]);
      expect((await engine.loadSyncStatus()).lastError).toBeUndefined();
      const expected = choice === 'local' ? 'Local private' : 'Remote private';
      const state = await repository.read();
      const published = await parseBackup(content);
      expect(state.spaces.private.sites[0].title).toBe(expected);
      expect((await privateBackupPayload(published, 'sync-password'))?.data.sites[0].title).toBe(
        expected,
      );
      expect(content).not.toContain(expected);
      expect(state.spaces.normal.sites.slice(0, 2).map((r) => r.title)).toEqual([
        'Remote public',
        'Local public',
      ]);
      expect(published.spaces.normal!.data.sites.slice(0, 2).map((r) => r.title)).toEqual([
        'Remote public',
        'Local public',
      ]);
    },
  );

  it('does not advance storage or write data when a pending remote resource is missing', async () => {
    const before = await repository.read();
    const conflict = createSyncConflict({
      entity: 'site',
      id: before.spaces.normal.sites[0].id,
      field: 'icon',
      local: before.spaces.normal.sites[0].icon,
      remote: { source: 'auto', resourceId: 'missing-candidate' },
    });
    values[STATUS] = { schemaVersion: 1, conflicts: [conflict] };
    await expect(engine.resolveSyncConflict(conflict, 'remote')).rejects.toThrow(
      'messages.anImageResourceIsMissingNoChangesWereSaved',
    );
    expect(await repository.read()).toEqual(before);
    expect((await engine.loadSyncStatus()).conflicts).toEqual([conflict]);
  });
});
