import { openDB } from 'idb';
import { describe, expect, it } from 'vitest';
import { createBackup, parseBackup, restoreBackup } from '../src/features/backup/backup';
import { encryptJson } from '../src/security/crypto';
import { createRepository } from '../src/storage/database';
import { createInitialState, effectiveSettings } from '../src/storage/model';
import { applyCommand } from '../src/storage/operations';

const retiredSettings = {
  customGreetings: { morning: ['An old custom greeting'] },
  textColorMode: 'custom',
  textColors: {
    clock: '#123456',
    date: '#234567',
    greeting: '#345678',
    search: '#456789',
    tabs: '#567890',
    cards: '#678901',
  },
};

function populatedState() {
  const state = createInitialState();
  state.revision = 9;
  state.normalSettings.wallpaperId = 'normal-wallpaper';
  state.spaces.normal.sites[0].icon = { source: 'auto', resourceId: 'normal-icon' };
  state.privateSettingOverrides = { showGreeting: false, wallpaperId: 'private-wallpaper' };
  state.spaces.private.sites.push({
    ...state.spaces.normal.sites[0],
    id: 'private-site',
    groupId: state.spaces.private.groups[0].id,
    title: 'Private bookmark',
    url: 'https://private.example/path?value=%2F#preserved',
    icon: { source: 'resource', resourceId: 'private-icon' },
  });
  const resources = new Map(
    ['normal-wallpaper', 'normal-icon', 'private-wallpaper', 'private-icon'].map((id) => [
      id,
      new Blob([id], { type: 'image/webp' }),
    ]),
  );
  return { state, resources };
}

describe('retired preferences at existing data boundaries', () => {
  it('reads old preferences without rewriting data and preserves both spaces after a partial save', async () => {
    const { state, resources } = populatedState();
    const stored = {
      ...state,
      normalSettings: { ...state.normalSettings, ...retiredSettings },
      privateSettingOverrides: { ...state.privateSettingOverrides, ...retiredSettings },
    };
    const name = crypto.randomUUID();
    const db = await openDB(name, 3, {
      upgrade(database) {
        for (const store of ['state', 'resources', 'vault', 'wallpapers'])
          database.createObjectStore(store);
      },
    });
    await db.put('state', stored, 'current');
    for (const [id, blob] of resources) await db.put('resources', blob, id);
    const repo = createRepository(name);
    try {
      expect(await repo.read()).toEqual(state);
      expect(await db.get('state', 'current')).toEqual(stored);

      const updated = await repo.update((draft) =>
        applyCommand(draft, { type: 'settings', spaceId: 'normal', patch: { hour12: true } }),
      );
      expect(updated.revision).toBe(state.revision + 1);
      expect(updated.normalSettings).toEqual({ ...state.normalSettings, hour12: true });
      expect(updated.privateSettingOverrides).toEqual(state.privateSettingOverrides);
      expect(updated.spaces).toEqual(state.spaces);
      expect(await repo.read()).toEqual(updated);
      expect(await db.get('state', 'current')).toEqual(updated);
      for (const [id, blob] of resources)
        expect(await (await repo.resource(id))?.text()).toBe(await blob.text());
    } finally {
      await repo.close();
      db.close();
    }
  });

  it('restores old preferences through plain and encrypted backups without losing navigation or images', async () => {
    const { state, resources } = populatedState();
    const document = await createBackup(state, resources, 'all');
    const normal = document.spaces.normal!;
    const privateSpace = document.spaces.private!;
    if (privateSpace.protected) throw new Error('Expected an unencrypted fixture');
    const withOldPreferences = {
      ...document,
      spaces: {
        normal: { ...normal, settings: { ...normal.settings, ...retiredSettings } },
        private: {
          protected: true,
          envelope: await encryptJson(
            {
              schemaVersion: 5,
              ...privateSpace.payload,
              settings: { ...privateSpace.payload.settings, ...retiredSettings },
            },
            'backup-password',
          ),
        },
      },
    };
    const parsed = await parseBackup(JSON.stringify(withOldPreferences));
    expect(parsed.spaces.normal?.settings).toEqual(state.normalSettings);
    const restored = await restoreBackup(
      createInitialState(),
      parsed,
      'replace',
      'backup-password',
    );
    expect(restored.state.spaces).toEqual(state.spaces);
    expect(restored.state.normalSettings).toEqual(state.normalSettings);
    expect(effectiveSettings(restored.state, 'private')).toEqual(
      effectiveSettings(state, 'private'),
    );
    for (const [id, blob] of resources)
      expect(await restored.resources.get(id)?.text()).toBe(await blob.text());

    const repo = createRepository(crypto.randomUUID());
    try {
      await repo.restore(restored.state, restored.resources);
      await repo.protectPrivate('vault-password');
      expect((await repo.read()).privateSecurity).toEqual({ protected: true, locked: true });
      const unlocked = await repo.unlockPrivate('vault-password');
      expect(unlocked.spaces.private).toEqual(state.spaces.private);
      expect(effectiveSettings(unlocked, 'private')).toEqual(effectiveSettings(state, 'private'));
      const snapshot = await repo.snapshot('all');
      const roundTrip = await createBackup(
        snapshot.state,
        snapshot.resources,
        'all',
        'backup-password',
      );
      const recovered = await restoreBackup(
        createInitialState(),
        await parseBackup(JSON.stringify(roundTrip)),
        'replace',
        'backup-password',
      );
      expect(recovered.state.spaces).toEqual(state.spaces);
      for (const key of Object.keys(retiredSettings)) {
        expect(recovered.state.normalSettings).not.toHaveProperty(key);
        expect(effectiveSettings(recovered.state, 'private')).not.toHaveProperty(key);
      }
      for (const [id, blob] of resources)
        expect(await recovered.resources.get(id)?.text()).toBe(await blob.text());
    } finally {
      await repo.close();
    }
  });
});
