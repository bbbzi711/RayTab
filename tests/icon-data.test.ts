import { openDB } from 'idb';
import { describe, expect, it, vi } from 'vitest';
import { createRepository } from '../src/storage/database';
import { createInitialState, defaultSiteIcon, rayStateSchema } from '../src/storage/model';
import { applyCommand } from '../src/storage/operations';
import * as cryptoModule from '../src/security/crypto';
import {
  createBackup,
  parseBackup,
  privateBackupPayload,
  restoreBackup,
} from '../src/features/backup/backup';
import { createLegacyV4State, legacyNavigation } from './helpers/legacy';

const bytes = new Uint8Array([0, 255, 127, 13, 10, 42]);
const image = () => new Blob([bytes], { type: 'image/png' });
const encoded = (id: string) => ({
  id,
  type: 'image/png',
  data: btoa(String.fromCharCode(...bytes)),
});
async function fixtureDatabase(name: string) {
  return openDB(name, 3, {
    upgrade(db) {
      for (const store of ['state', 'resources', 'vault', 'wallpapers'])
        db.createObjectStore(store);
    },
  });
}

describe('atomic icon data and its conversion boundary', () => {
  it('converts saved transparent bases once and keeps site data and original resource bytes', async () => {
    const name = crypto.randomUUID();
    const db = await fixtureDatabase(name);
    const before = createInitialState();
    const original = before.spaces.normal.sites[0];
    const raw = {
      ...before,
      spaces: {
        ...before.spaces,
        normal: {
          ...before.spaces.normal,
          sites: before.spaces.normal.sites.map((site, index) =>
            index
              ? site
              : {
                  ...site,
                  icon: { source: 'resource', resourceId: 'kept-icon' },
                  iconBackground: { mode: 'transparent' },
                },
          ),
        },
      },
    };
    await db.put('state', raw, 'current');
    await db.put('resources', image(), 'kept-icon');
    let repo = createRepository(name);
    try {
      const converted = await repo.read();
      expect(converted.revision).toBe(before.revision + 1);
      expect(converted.spaces.normal.sites[0]).toEqual({
        ...original,
        icon: { source: 'resource', resourceId: 'kept-icon' },
        iconBackground: { mode: 'auto' },
      });
      expect(new Uint8Array(await (await repo.resource('kept-icon'))!.arrayBuffer())).toEqual(
        bytes,
      );
      expect(await db.get('state', 'current')).toEqual(converted);
      const backup = await createBackup(converted, new Map([['kept-icon', image()]]), 'normal');
      const imported = await parseBackup({
        ...backup,
        spaces: { normal: { ...backup.spaces.normal, data: raw.spaces.normal } },
      });
      const restored = await restoreBackup(createInitialState(), imported, 'replace');
      expect(restored.state.spaces.normal.sites[0]).toEqual(converted.spaces.normal.sites[0]);
      expect(new Uint8Array(await restored.resources.get('kept-icon')!.arrayBuffer())).toEqual(
        bytes,
      );
      await repo.close();
      repo = createRepository(name);
      expect(await repo.read()).toEqual(converted);
    } finally {
      await repo.close();
      db.close();
    }
  });
  it('converts v4 once while preserving navigation, original image bytes and physical DB version', async () => {
    const name = crypto.randomUUID();
    const db = await fixtureDatabase(name);
    const old = createLegacyV4State();
    old.spaces.normal.sites[0].iconId = 'old-icon';
    old.spaces.normal.sites[0].url = 'https://example.com/Case/?x=%2F&x=1#Keep';
    await db.put('state', old, 'current');
    await db.put('resources', image(), 'old-icon');
    let repo = createRepository(name);
    try {
      const current = await repo.read();
      expect(current).toMatchObject({ schemaVersion: 5, revision: old.revision + 1 });
      expect(current.spaces.normal).toMatchObject(legacyNavigation(old.spaces.normal));
      expect(current.spaces.normal.sites[0]).toMatchObject({
        icon: { source: 'resource', resourceId: 'old-icon' },
        iconBackground: { mode: 'color', color: '#123456' },
      });
      expect(current.spaces.normal.sites[0]).not.toHaveProperty('iconId');
      expect(current.spaces.normal.sites[0]).not.toHaveProperty('color');
      expect(current.normalSettings.iconRadius).toBe(24);
      expect(current.privateSettingOverrides).not.toHaveProperty('iconRadius');
      const blob = (await repo.resource('old-icon'))!;
      expect(blob.type).toBe('image/png');
      expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
      expect(db.version).toBe(3);
      await repo.close();
      repo = createRepository(name);
      expect(await repo.read()).toEqual(current);
      expect(await db.get('state', 'current')).toEqual(current);
    } finally {
      await repo.close();
      db.close();
    }
  });

  it('rejects invalid known data without writing a partially converted state', async () => {
    const name = crypto.randomUUID();
    const db = await fixtureDatabase(name);
    const old = createLegacyV4State();
    old.spaces.normal.sites[0].color = 'invalid';
    await db.put('state', old, 'current');
    await db.put('resources', image(), 'untouched');
    const repo = createRepository(name);
    try {
      await expect(repo.read()).rejects.toThrow();
      expect(await db.get('state', 'current')).toEqual(old);
      expect(new Uint8Array(await (await db.get('resources', 'untouched')).arrayBuffer())).toEqual(
        bytes,
      );
      const current = createInitialState();
      const { icon, iconBackground, ...site } = current.spaces.normal.sites[0];
      expect(
        rayStateSchema.safeParse({
          ...current,
          spaces: {
            ...current.spaces,
            normal: {
              ...current.spaces.normal,
              sites: [{ ...site, color: '#123456', iconId: 'old' }],
            },
          },
        }).success,
      ).toBe(false);
    } finally {
      await repo.close();
      db.close();
    }
  });

  it.each(['auto', 'resource'] as const)(
    'removes saved %s display choices once without losing navigation or image bytes',
    async (source) => {
      const name = crypto.randomUUID();
      const db = await fixtureDatabase(name);
      const initial = createInitialState();
      initial.spaces.normal.sites[0].icon = { source, resourceId: 'saved-icon' };
      const saved = {
        ...initial,
        spaces: {
          ...initial.spaces,
          normal: {
            ...initial.spaces.normal,
            sites: initial.spaces.normal.sites.map((site, index) =>
              index === 0 ? { ...site, icon: { ...site.icon, display: 'logo' } } : site,
            ),
          },
        },
      };
      await db.put('state', saved, 'current');
      await db.put('resources', image(), 'saved-icon');
      let repo = createRepository(name);
      try {
        const converted = await repo.read();
        expect(converted).toEqual({ ...initial, revision: initial.revision + 1 });
        expect(await db.get('state', 'current')).toEqual(converted);
        expect(new Uint8Array(await (await repo.resource('saved-icon'))!.arrayBuffer())).toEqual(
          bytes,
        );
        await repo.close();
        repo = createRepository(name);
        expect(await repo.read()).toEqual(converted);
        expect(await db.get('state', 'current')).toEqual(converted);
      } finally {
        await repo.close();
        db.close();
      }
    },
  );

  it('cleans current encrypted display choices only after authentication and retains cached website images', async () => {
    const name = crypto.randomUUID();
    const db = await fixtureDatabase(name);
    const initial = createInitialState();
    initial.privateSecurity = { protected: true, locked: true };
    const space = {
      ...initial.spaces.private,
      sites: [
        {
          ...initial.spaces.normal.sites[0],
          id: 'private-current',
          groupId: initial.spaces.private.groups[0].id,
          icon: { source: 'auto', resourceId: 'cached-private', display: 'full' },
        },
      ],
    };
    const envelope = await cryptoModule.encryptJson(
      { schemaVersion: 5, space, overrides: {}, resources: [encoded('cached-private')] },
      'vault-password',
    );
    await db.put('state', initial, 'current');
    await db.put('vault', envelope, 'private');
    const repo = createRepository(name);
    try {
      expect(await repo.read()).toEqual(initial);
      expect(await db.get('vault', 'private')).toEqual(envelope);
      await expect(repo.unlockPrivate('wrong-password')).rejects.toThrow();
      expect(await db.get('vault', 'private')).toEqual(envelope);
      const unlocked = await repo.unlockPrivate('vault-password');
      expect(unlocked.revision).toBe(initial.revision + 1);
      expect(unlocked.spaces.private.sites[0].icon).toEqual({
        source: 'auto',
        resourceId: 'cached-private',
      });
      expect(new Uint8Array(await (await repo.resource('cached-private'))!.arrayBuffer())).toEqual(
        bytes,
      );
      const cleaned = await db.get('vault', 'private');
      const plaintext = await cryptoModule.decryptJson<{ space: unknown; resources: unknown[] }>(
        cleaned,
        'vault-password',
      );
      expect(JSON.stringify(plaintext.space)).not.toContain('display');
      expect(plaintext.resources).toEqual([encoded('cached-private')]);
      await repo.lockPrivate();
      expect((await repo.unlockPrivate('vault-password')).revision).toBe(unlocked.revision);
      expect(await db.get('vault', 'private')).toEqual(cleaned);
      expect(await db.get('resources', 'cached-private')).toBeUndefined();
    } finally {
      await repo.close();
      db.close();
    }
  });

  it('authenticates unversioned private vaults before rewriting only the known plaintext format', async () => {
    const name = crypto.randomUUID();
    const db = await fixtureDatabase(name);
    const old = createLegacyV4State();
    old.spaces.private.sites = [
      {
        ...old.spaces.normal.sites[0],
        id: 'private-site',
        title: 'Private original',
        groupId: old.spaces.private.groups[0].id,
        iconId: 'private-image',
      },
    ];
    const space = structuredClone(old.spaces.private);
    const envelope = await cryptoModule.encryptJson(
      { space, overrides: { iconRadius: 33 }, resources: [encoded('private-image')] },
      'vault-password',
    );
    old.spaces.private.sites = [];
    old.privateSecurity = { protected: true, locked: true };
    await db.put('state', old, 'current');
    await db.put('vault', envelope, 'private');
    let repo = createRepository(name);
    try {
      await expect(repo.unlockPrivate('wrong-password')).rejects.toThrow(
        'messages.thePasswordIsIncorrectOrTheEncryptedDataIsDamaged',
      );
      expect(await db.get('vault', 'private')).toEqual(envelope);
      const unlocked = await repo.unlockPrivate('vault-password');
      expect(unlocked.spaces.private.sites[0].icon).toEqual({
        source: 'resource',
        resourceId: 'private-image',
      });
      expect(unlocked.privateSettingOverrides.iconRadius).toBe(33);
      const migrated = await db.get('vault', 'private');
      expect(migrated.version).toBe(1);
      const plaintext = await cryptoModule.decryptJson<{
        schemaVersion: number;
        resources: unknown[];
      }>(migrated, 'vault-password');
      expect(plaintext.schemaVersion).toBe(5);
      expect(plaintext.resources).toEqual([encoded('private-image')]);
      expect(await db.get('resources', 'private-image')).toBeUndefined();
      expect(JSON.stringify(await db.get('state', 'current'))).not.toContain('Private original');
      expect(new Uint8Array(await (await repo.resource('private-image'))!.arrayBuffer())).toEqual(
        bytes,
      );
      await repo.close();
      repo = createRepository(name);
      expect((await repo.read()).privateSecurity.locked).toBe(true);
      await repo.unlockPrivate('vault-password');
      expect(await db.get('vault', 'private')).toEqual(migrated);
    } finally {
      await repo.close();
      db.close();
    }
  });

  it('retains shared references and removes unreferenced public and encrypted private assets', async () => {
    const name = crypto.randomUUID();
    const repo = createRepository(name);
    const db = await fixtureDatabase(name);
    try {
      await repo.update(
        (state) => {
          state.spaces.normal.sites[0].icon = { source: 'resource', resourceId: 'shared' };
          state.spaces.normal.sites[1].icon = { source: 'auto', resourceId: 'shared' };
          const normal = state.spaces.normal.sites[0];
          state.spaces.private.sites.push({
            ...normal,
            id: 'private-shared',
            groupId: state.spaces.private.groups[0].id,
            icon: { source: 'auto', resourceId: 'shared' },
          });
        },
        new Map([['shared', image()]]),
      );
      await repo.update((state) => {
        state.spaces.normal.sites[0].icon = { ...defaultSiteIcon };
      });
      expect(await repo.resource('shared')).toBeDefined();
      await repo.update((state) => {
        state.spaces.normal.sites[1].icon = { ...defaultSiteIcon };
      });
      expect(await repo.resource('shared')).toBeDefined();
      await repo.protectPrivate('vault-password');
      expect(await db.get('resources', 'shared')).toBeUndefined();
      await repo.unlockPrivate('vault-password');
      expect(await repo.resource('shared')).toBeDefined();
      await repo.update((state) => {
        state.spaces.private.sites[0].icon = { ...defaultSiteIcon };
      });
      expect(await repo.resource('shared')).toBeUndefined();
      const payload = await cryptoModule.decryptJson<{ resources: unknown[] }>(
        await db.get('vault', 'private'),
        'vault-password',
      );
      expect(payload.resources).toEqual([]);
      await repo.lockPrivate();
      await repo.unlockPrivate('vault-password');
      expect(await repo.resource('shared')).toBeUndefined();
    } finally {
      await repo.close();
      db.close();
    }
  });

  it('converts v2 backups and encrypted private payloads without changing the original image data', async () => {
    const old = createLegacyV4State();
    old.spaces.normal.sites[0].iconId = 'normal-image';
    old.spaces.private.sites = [
      {
        ...old.spaces.normal.sites[0],
        id: 'private-backup',
        groupId: old.spaces.private.groups[0].id,
        iconId: 'private-image',
      },
    ];
    const envelope = await cryptoModule.encryptJson(
      {
        data: old.spaces.private,
        settings: old.normalSettings,
        resources: [encoded('private-image')],
      },
      'backup-password',
    );
    const legacy = {
      format: 'raytab-backup',
      version: 2,
      createdAt: new Date().toISOString(),
      spaces: {
        normal: {
          data: old.spaces.normal,
          settings: old.normalSettings,
          resources: [encoded('normal-image')],
        },
        private: { protected: true, envelope },
      },
    };
    const original = structuredClone(legacy);
    const document = await parseBackup(legacy);
    expect(document.version).toBe(3);
    expect(document.spaces.private).toEqual(legacy.spaces.private);
    expect(document.spaces.normal!.resources).toEqual([encoded('normal-image')]);
    expect(document.spaces.normal!.settings.iconRadius).toBe(24);
    await expect(privateBackupPayload(document, 'wrong-password')).rejects.toThrow(
      'messages.thePasswordIsIncorrectOrTheEncryptedDataIsDamaged',
    );
    const restored = await restoreBackup(
      createInitialState(),
      document,
      'replace',
      'backup-password',
    );
    const repo = createRepository(crypto.randomUUID());
    try {
      await repo.restore(restored.state, restored.resources);
      await repo.protectPrivate('local-password');
      await repo.unlockPrivate('local-password');
      const snapshot = await repo.snapshot();
      const exported = await createBackup(
        snapshot.state,
        snapshot.resources,
        'all',
        'export-password',
      );
      expect(exported.version).toBe(3);
      expect(exported.spaces.private!.protected).toBe(true);
      if (!exported.spaces.private!.protected) throw new Error('expected protected fixture');
      expect(
        (
          await cryptoModule.decryptJson<{ schemaVersion: number }>(
            exported.spaces.private!.envelope,
            'export-password',
          )
        ).schemaVersion,
      ).toBe(5);
      const roundtrip = await restoreBackup(
        createInitialState(),
        exported,
        'replace',
        'export-password',
      );
      expect(roundtrip.state.spaces).toEqual(snapshot.state.spaces);
      for (const id of ['normal-image', 'private-image'])
        expect(new Uint8Array(await roundtrip.resources.get(id)!.arrayBuffer())).toEqual(bytes);
      expect(legacy).toEqual(original);
      const future = structuredClone(exported);
      future.spaces.private = {
        protected: true,
        envelope: await cryptoModule.encryptJson(
          { schemaVersion: 6, ...(await privateBackupPayload(exported, 'export-password')) },
          'export-password',
        ),
      };
      await expect(
        restoreBackup(createInitialState(), future, 'replace', 'export-password'),
      ).rejects.toThrow();
    } finally {
      await repo.close();
    }
  });

  it('cancels a private restore if the unlocked session changes while encryption is in flight', async () => {
    const repo = createRepository(crypto.randomUUID());
    await repo.protectPrivate('vault-password');
    const before = await repo.unlockPrivate('vault-password');
    const incoming = structuredClone(before);
    applyCommand(incoming, {
      type: 'save-site',
      spaceId: 'private',
      id: 'restore-private',
      groupId: incoming.spaces.private.groups[0].id,
      folderId: null,
      site: {
        title: 'Cancelled private write',
        url: 'https://cancelled.example/',
        icon: { source: 'resource', resourceId: 'cancelled-image' },
        iconBackground: { mode: 'auto' },
      },
    });
    let started!: () => void;
    let resume!: () => void;
    const paused = new Promise<void>((resolve) => {
      started = resolve;
    });
    const release = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const original = cryptoModule.encryptJson;
    vi.spyOn(cryptoModule, 'encryptJson').mockImplementationOnce(async (...args) => {
      started();
      await release;
      return original(...args);
    });
    try {
      const restoring = repo.restore(incoming, new Map([['cancelled-image', image()]]));
      await paused;
      await repo.lockPrivate();
      resume();
      await expect(restoring).rejects.toThrow('messages.thePrivateSpaceStateChangedTryAgain');
      expect((await repo.read()).privateSecurity.locked).toBe(true);
      expect(await repo.resource('cancelled-image')).toBeUndefined();
      expect((await repo.unlockPrivate('vault-password')).spaces.private).toEqual(
        before.spaces.private,
      );
    } finally {
      resume();
      vi.restoreAllMocks();
      await repo.close();
    }
  });
});
