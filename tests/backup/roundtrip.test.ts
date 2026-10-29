import { describe, expect, it } from 'vitest';
import { vectorArtwork, vectorImage } from '../helpers/images';
import {
  backupSummary,
  createBackup,
  parseBackup,
  restoreBackup,
} from '../../src/features/backup/backup';
import { createInitialState } from '../../src/storage/model';
import { createRepository } from '../../src/storage/database';
import { applyCommand } from '../../src/storage/operations';

describe('versioned backup', () => {
  it('backs up selected spaces and encrypts private content', async () => {
    const state = createInitialState();
    state.spaces.private.sites.push({
      id: 'secret',
      groupId: state.spaces.private.groups[0].id,
      folderId: null,
      title: 'Secret',
      url: 'https://secret.example/',
      iconBackground: { mode: 'color', color: '#123456' },
      order: 0,
      createdAt: 1,
      updatedAt: 1,
      changeId: 'secret-change',
      icon: { source: 'resource', resourceId: 'secret-icon' },
    });
    const document = await createBackup(
      state,
      new Map([['secret-icon', vectorImage()]]),
      'all',
      'private-pass',
    );
    expect(JSON.stringify(document.spaces.private)).not.toContain('secret.example');
    expect(JSON.stringify(document.spaces.private)).not.toContain(vectorArtwork);
    expect(backupSummary(document)).toMatchObject({
      normal: { sites: state.spaces.normal.sites.length },
      private: { protected: true },
    });
    const empty = createInitialState();
    empty.spaces.private.sites = [];
    const restored = await restoreBackup(empty, document, 'replace', 'private-pass');
    expect(restored.state.spaces.private.sites[0].url).toBe('https://secret.example/');
    expect(await restored.resources.get('secret-icon')?.text()).toBe(vectorArtwork);
    expect(restored.resources.get('secret-icon')?.type).toBe('image/svg+xml');
  });

  it('exports only the selected space', async () => {
    const state = createInitialState();
    const normal = await createBackup(state, new Map(), 'normal');
    expect(normal.spaces.normal).toBeDefined();
    expect(normal.spaces.private).toBeUndefined();
    const privateOnly = await createBackup(state, new Map(), 'private');
    expect(privateOnly.spaces.normal).toBeUndefined();
    expect(privateOnly.spaces.private).toBeDefined();
  });

  it('requires encryption when exporting a protected private space', async () => {
    const repo = createRepository(crypto.randomUUID());
    await repo.read();
    await repo.protectPrivate('vault-password');
    const locked = await repo.read();
    await expect(createBackup(locked, new Map(), 'all', 'backup-password')).rejects.toThrow(
      'messages.unlockThePrivateSpaceFirst',
    );
    const unlocked = await repo.unlockPrivate('vault-password');
    await expect(createBackup(unlocked, new Map(), 'all')).rejects.toThrow(
      'messages.enterTheBackupEncryptionPassword',
    );
    await repo.close();
  });

  it('snapshots only resources used by the selected space, including inherited wallpaper', async () => {
    const repo = createRepository(crypto.randomUUID());
    await repo.update(
      (state) => {
        state.normalSettings.wallpaperId = 'shared-wallpaper';
        state.spaces.normal.sites[0].icon = {
          source: 'auto',
          resourceId: 'normal-icon',
        };
      },
      new Map([
        ['shared-wallpaper', new Blob(['wallpaper'])],
        ['normal-icon', new Blob(['icon'])],
      ]),
    );
    expect([...(await repo.snapshot('private')).resources.keys()]).toEqual(['shared-wallpaper']);
    await repo.protectPrivate('vault-password');
    const normal = await repo.snapshot('normal');
    expect([...normal.resources.keys()].sort()).toEqual(['normal-icon', 'shared-wallpaper']);
    expect(
      (await createBackup(normal.state, normal.resources, 'normal')).spaces.private,
    ).toBeUndefined();
    await expect(repo.snapshot('private')).rejects.toThrow(
      'messages.unlockThePrivateSpaceBeforeCreatingABackupThatIncludesIt',
    );
    await repo.close();
  });

  it('preserves local password protection when restoring a backup', async () => {
    const repo = createRepository(crypto.randomUUID());
    const incoming = await repo.read();
    incoming.privateSettingOverrides.showClock = false;
    await repo.protectPrivate('vault-password');
    await expect(repo.restore(incoming, new Map())).rejects.toThrow(
      'messages.unlockThePrivateSpaceFirst',
    );
    await repo.unlockPrivate('vault-password');
    await repo.restore(incoming, new Map());
    await repo.lockPrivate();
    expect((await repo.read()).privateSecurity).toEqual({ protected: true, locked: true });
    expect((await repo.unlockPrivate('vault-password')).privateSettingOverrides.showClock).toBe(
      false,
    );
    await repo.close();
  });

  it('rejects corrupt, future and wrong-password backups without mutating input', async () => {
    const state = createInitialState();
    const before = structuredClone(state);
    await expect(parseBackup('{oops')).rejects.toThrow('messages.theBackupFileIsNotValidJson');
    await expect(parseBackup({ format: 'raytab-backup', version: 99 })).rejects.toThrow(
      'messages.theBackupFormatIsInvalidOrItsVersionIsUnsupported',
    );
    const document = await createBackup(state, new Map(), 'private', 'private-pass');
    await expect(restoreBackup(state, document, 'replace', 'wrong-pass')).rejects.toThrow(
      'messages.thePasswordIsIncorrectOrTheEncryptedDataIsDamaged',
    );
    expect(state).toEqual(before);
  });

  it.each(['auto', 'resource'] as const)(
    'restores settings, navigation data, and %s image resources into an empty repository',
    async (sourceKind) => {
      const source = createRepository(crypto.randomUUID());
      const initial = await source.read();
      const groupId = initial.spaces.normal.groups[0].id;
      await source.update(
        (state) => {
          applyCommand(state, {
            type: 'save-site',
            spaceId: 'normal',
            id: 'resource-site',
            groupId,
            folderId: null,
            site: {
              title: 'Resource site',
              url: 'https://resource.example',
              iconBackground: { mode: 'color', color: '#123456' },
              icon: { source: sourceKind, resourceId: 'resource-icon' },
            },
          });
          applyCommand(state, {
            type: 'settings',
            spaceId: 'normal',
            patch: { theme: 'dark', showClock: false },
          });
          applyCommand(state, {
            type: 'save-folder',
            spaceId: 'normal',
            id: 'backup-folder',
            groupId,
            name: 'Saved links',
          });
          applyCommand(state, {
            type: 'move-site',
            spaceId: 'normal',
            id: 'resource-site',
            groupId,
            folderId: 'backup-folder',
          });
        },
        new Map([['resource-icon', new Blob(['icon bytes'], { type: 'image/webp' })]]),
      );
      const snapshot = await source.snapshot();
      const document = await createBackup(snapshot.state, snapshot.resources, 'all');
      const destination = createRepository(crypto.randomUUID());
      const restored = await restoreBackup(await destination.read(), document, 'replace');
      await destination.restore(restored.state, restored.resources);

      const reopened = await destination.read();
      expect(reopened.spaces).toEqual(snapshot.state.spaces);
      expect(reopened.normalSettings).toMatchObject({ theme: 'dark', showClock: false });
      expect(reopened.spaces.normal.sites).toContainEqual(
        expect.objectContaining({
          id: 'resource-site',
          icon: { source: sourceKind, resourceId: 'resource-icon' },
        }),
      );
      expect(await (await destination.resource('resource-icon'))?.text()).toBe('icon bytes');
      await source.close();
      await destination.close();
    },
  );

  it('preserves text icons in a backup without adding image resources', async () => {
    const state = createInitialState();
    state.spaces.normal.sites[0].icon = { source: 'text', text: 'Ray中' };
    const document = await createBackup(state, new Map(), 'normal');
    expect(document.spaces.normal!.resources).toEqual([]);
    const restored = await restoreBackup(
      createInitialState(),
      await parseBackup(document),
      'replace',
    );
    expect(restored.state.spaces.normal.sites[0].icon).toEqual({ source: 'text', text: 'Ray中' });
    expect(restored.resources.size).toBe(0);
  });

  it.each(['auto', 'resource'] as const)(
    'rolls back a restore when a referenced %s resource is missing',
    async (source) => {
      const repo = createRepository(crypto.randomUUID());
      const before = await repo.read();
      const invalid = structuredClone(before);
      invalid.spaces.normal.sites[0].icon = {
        source,
        resourceId: 'missing-icon',
      };

      await expect(repo.restore(invalid, new Map())).rejects.toThrow(
        'messages.anImageResourceIsMissingNoChangesWereSaved',
      );
      expect(await repo.read()).toEqual(before);
      await repo.close();
    },
  );

  it.each(['normal', 'private'] as const)(
    'merges concurrent additions from a deleted %s group and preserves them across saving and reloading',
    async (spaceId) => {
      const initial = createInitialState();
      const groupId = initial.spaces[spaceId].groups[0].id;
      applyCommand(initial, { type: 'save-group', spaceId, id: 'target', name: 'Target' });
      const local = structuredClone(initial);
      const incoming = structuredClone(initial);
      applyCommand(local, {
        type: 'delete-group',
        spaceId,
        id: groupId,
        destinationGroupId: 'target',
      });
      applyCommand(incoming, {
        type: 'save-folder',
        spaceId,
        id: 'incoming-folder',
        groupId,
        name: 'Incoming folder',
      });
      applyCommand(incoming, {
        type: 'save-site',
        spaceId,
        id: 'incoming-site',
        groupId,
        folderId: 'incoming-folder',
        site: {
          title: 'Incoming site',
          url: 'https://incoming.example/',
          icon: { source: 'resource', resourceId: 'incoming-icon' },
          iconBackground: { mode: 'auto' },
        },
      });
      const password = spaceId === 'private' ? 'backup-password' : undefined;
      const backup = await createBackup(
        incoming,
        new Map([['incoming-icon', new Blob(['saved image'], { type: 'image/webp' })]]),
        spaceId,
        password,
      );
      const restored = await restoreBackup(local, await parseBackup(backup), 'merge', password);
      const recovery = restored.recoveries[spaceId]!;
      expect(recovery).toMatchObject({ sites: 1, folders: 1, createdGroup: true });
      expect(restored.state.spaces[spaceId].sites.map((site) => site.url).sort()).toEqual(
        incoming.spaces[spaceId].sites.map((site) => site.url).sort(),
      );
      expect(
        restored.state.spaces[spaceId].folders.find((folder) => folder.id === 'incoming-folder')
          ?.groupId,
      ).toBe(recovery.groupId);
      expect(
        restored.state.spaces[spaceId].sites.find((site) => site.id === 'incoming-site'),
      ).toMatchObject({ groupId: recovery.groupId, folderId: 'incoming-folder' });

      const name = crypto.randomUUID();
      const destination = createRepository(name);
      await destination.restore(local, new Map());
      await destination.restore(restored.state, restored.resources, { range: spaceId });
      await destination.close();
      const reopened = createRepository(name);
      try {
        const saved = await reopened.read();
        expect(saved.spaces[spaceId]).toEqual(restored.state.spaces[spaceId]);
        expect(await (await reopened.resource('incoming-icon'))?.text()).toBe('saved image');
        const repeated = await restoreBackup(saved, backup, 'merge', password);
        expect(repeated.state.spaces[spaceId]).toEqual(saved.spaces[spaceId]);
        expect(repeated.recoveries).toEqual({});
      } finally {
        await reopened.close();
      }

      const replaced = await restoreBackup(local, backup, 'replace', password);
      expect(replaced.state.spaces[spaceId]).toEqual(incoming.spaces[spaceId]);
      expect(replaced.recoveries).toEqual({});
    },
  );

  it('retains newly added websites at group root when merging a backup of a dissolved folder', async () => {
    const initial = createInitialState();
    const groupId = initial.local.activeGroup.normal;
    applyCommand(initial, {
      type: 'save-folder',
      spaceId: 'normal',
      id: 'folder',
      groupId,
      name: 'Folder',
    });
    const local = structuredClone(initial);
    const incoming = structuredClone(initial);
    applyCommand(local, { type: 'delete-folder', spaceId: 'normal', id: 'folder' });
    applyCommand(incoming, {
      type: 'save-site',
      spaceId: 'normal',
      id: 'incoming-site',
      groupId,
      folderId: 'folder',
      site: {
        title: 'Incoming site',
        url: 'https://incoming.example/',
        icon: { source: 'auto' },
        iconBackground: { mode: 'auto' },
      },
    });
    const backup = await createBackup(incoming, new Map(), 'normal');
    const restored = await restoreBackup(local, backup, 'merge');
    expect(restored.state.spaces.normal.folders).toEqual([]);
    expect(
      restored.state.spaces.normal.sites.find((site) => site.id === 'incoming-site'),
    ).toMatchObject({ groupId, folderId: null });
    expect(restored.recoveries).toEqual({});
  });
});
