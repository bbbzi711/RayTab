import { openDB } from 'idb';
import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/storage/model';
import { createRepository } from '../src/storage/database';
import { decryptJson, encryptJson } from '../src/security/crypto';
import { upgradeLocalState } from '../src/storage/upgrade-local';
import { createLegacyV4State, legacyNavigation } from './helpers/legacy';

function legacyState() {
  const state = createLegacyV4State();
  const { showGroups, ...settings } = state.normalSettings;
  const space = (kind: 'normal' | 'private') => {
    const group = state.spaces[kind].groups[0];
    const category = {
      ...group,
      id: `${kind}-category`,
      desktopId: group.id,
      isDefault: true,
      showInAll: true,
      color: '#123456',
    };
    return {
      desktops: [group],
      categories: [category],
      tombstones: [],
      sites: state.spaces.normal.sites.map(({ groupId, folderId, ...site }) => ({
        ...site,
        id: `${kind}-${site.id}`,
        categoryId: category.id,
      })),
    };
  };
  return {
    ...state,
    schemaVersion: 2,
    normalSettings: { ...settings, showCategories: false, cardSize: 136, iconSpacing: 33 },
    privateSettingOverrides: { showCategories: false, cardOpacity: 0.7 },
    spaces: { normal: space('normal'), private: space('private') },
    local: {
      activeSpace: 'normal' as const,
      activeDesktop: state.local.activeGroup,
      selectedCategory: { normal: {}, private: {} },
      homeMode: 'focus' as const,
      onboardingComplete: true,
    },
  };
}

// Settings actually written by the earlier v3 UI, before that UI was reverted.
function previousV3State() {
  const state = createLegacyV4State();
  const {
    cardSize,
    iconSizeRatio,
    showGroups,
    showCardBackground,
    cardOpacity,
    navigationCollapsed,
    sidebarMode,
    ...settings
  } = state.normalSettings;
  const site = state.spaces.normal.sites[0];
  const folder = { ...state.spaces.normal.groups[0], id: 'existing-folder', groupId: site.groupId };
  state.spaces.normal.folders.push(folder);
  site.folderId = folder.id;
  site.url = 'https://example.com/Case/?a=1&a=2&encoded=%2F#Keep';
  return {
    ...state,
    schemaVersion: 3,
    normalSettings: { ...settings, iconSize: 80, iconSpacing: 27 },
    privateSettingOverrides: { iconSize: 44 },
  };
}

describe('one-time local navigation migration', () => {
  it.each(['normalSettings', 'privateSettingOverrides'] as const)(
    'removes retired appearance settings from current %s once and preserves later partial updates',
    async (settingsKey) => {
      const state = createInitialState();
      state.revision = 17;
      state.normalSettings.cardSize = 136;
      state.privateSettingOverrides = { theme: 'dark', showSiteTitle: false };
      state.spaces.normal.groups.push({
        ...state.spaces.normal.groups[0],
        id: 'preserved-second-group',
        name: 'Preserved group',
        order: 1,
      });
      state.spaces.normal.sites[0].url = 'https://example.com/Case/?a=1&a=2&encoded=%2F#Keep';
      state.spaces.normal.sites[0].icon = {
        source: 'resource',
        resourceId: 'preserved-icon',
      };
      const retired = {
        showCardBackground: true,
        cardOpacity: 0.95,
        navigationCollapsed: true,
        showGroups: false,
      };
      const saved = {
        ...state,
        [settingsKey]: {
          ...state[settingsKey],
          ...retired,
        },
      };
      for (const field of [
        'showCardBackground',
        'cardOpacity',
        'navigationCollapsed',
        'showGroups',
      ] as const)
        expect(
          upgradeLocalState({
            ...state,
            [settingsKey]: { ...state[settingsKey], [field]: retired[field] },
          }),
        ).toEqual({ ...state, revision: 18 });
      const name = crypto.randomUUID();
      const db = await openDB(name, 3, {
        upgrade(db) {
          for (const store of ['state', 'resources', 'vault', 'wallpapers'])
            db.createObjectStore(store);
        },
      });
      const icon = new Blob(['preserved icon'], { type: 'image/png' });
      await db.put('state', saved, 'current');
      await db.put('resources', icon, 'preserved-icon');
      const repo = createRepository(name);
      try {
        const cleaned = await repo.read();
        expect(cleaned).toEqual({ ...state, revision: 18 });
        expect(await db.get('state', 'current')).toEqual(cleaned);
        expect(await repo.read()).toEqual(cleaned);
        expect(upgradeLocalState(cleaned)).toEqual(cleaned);

        const updated = await repo.update((draft) => {
          draft.normalSettings.iconSpacing = 31;
        });
        expect(updated.revision).toBe(19);
        expect(updated.normalSettings.cardSize).toBe(136);
        expect(updated.privateSettingOverrides).toEqual(state.privateSettingOverrides);
        expect(updated.spaces).toEqual(state.spaces);
        expect((await repo.resource('preserved-icon'))?.type).toBe(icon.type);
        expect(await (await repo.resource('preserved-icon'))?.text()).toBe('preserved icon');
        expect(JSON.stringify(await db.get('state', 'current'))).not.toContain(
          'showCardBackground',
        );
        expect(JSON.stringify(await db.get('state', 'current'))).not.toContain('cardOpacity');
        expect(JSON.stringify(await db.get('state', 'current'))).not.toContain(
          'navigationCollapsed',
        );
        expect(JSON.stringify(await db.get('state', 'current'))).not.toContain('showGroups');
        await repo.close();
        const reopened = createRepository(name);
        try {
          expect(await reopened.read()).toEqual(updated);
          expect(await db.get('state', 'current')).toEqual(updated);
        } finally {
          await reopened.close();
        }
      } finally {
        await repo.close();
        db.close();
      }
    },
  );

  it('keeps a current encrypted vault unchanged while locked and removes retired fields after unlocking', async () => {
    const state = createInitialState();
    state.privateSecurity = { protected: true, locked: true };
    const space = structuredClone(state.spaces.private);
    space.sites.push({
      ...state.spaces.normal.sites[0],
      id: 'private-preserved-site',
      groupId: space.groups[0].id,
      title: 'Preserved private site',
      url: 'https://private.example.com/Case/?a=1&a=2&encoded=%2F#Keep',
    });
    const overrides = { theme: 'dark', showSiteTitle: false };
    const payload = {
      schemaVersion: 5,
      space,
      overrides: {
        ...overrides,
        showCardBackground: true,
        cardOpacity: 0.95,
        navigationCollapsed: true,
        showGroups: false,
      },
      resources: [],
    };
    const envelope = await encryptJson(payload, 'vault-password');
    const name = crypto.randomUUID();
    const db = await openDB(name, 3, {
      upgrade(db) {
        for (const store of ['state', 'resources', 'vault', 'wallpapers'])
          db.createObjectStore(store);
      },
    });
    await db.put('state', state, 'current');
    await db.put('vault', envelope, 'private');
    const repo = createRepository(name);
    try {
      expect((await repo.read()).privateSecurity.locked).toBe(true);
      expect(await db.get('state', 'current')).toEqual(state);
      expect(await db.get('vault', 'private')).toEqual(envelope);
      await expect(repo.unlockPrivate('wrong-password')).rejects.toThrow(
        'messages.thePasswordIsIncorrectOrTheEncryptedDataIsDamaged',
      );
      expect(await db.get('vault', 'private')).toEqual(envelope);

      const unlocked = await repo.unlockPrivate('vault-password');
      expect(unlocked.revision).toBe(state.revision + 1);
      expect(unlocked.spaces.private).toEqual(space);
      expect(unlocked.privateSettingOverrides).toEqual(overrides);
      const convertedEnvelope = await db.get('vault', 'private');
      expect(convertedEnvelope.ciphertext).not.toBe(envelope.ciphertext);
      expect(await decryptJson(convertedEnvelope, 'vault-password')).toEqual({
        ...payload,
        overrides,
      });
      expect(JSON.stringify(await db.get('state', 'current'))).not.toContain(
        'Preserved private site',
      );
      await repo.lockPrivate();
      expect((await repo.unlockPrivate('vault-password')).revision).toBe(unlocked.revision);
      expect(await db.get('vault', 'private')).toEqual(convertedEnvelope);
      await repo.close();
      const reopened = createRepository(name);
      try {
        expect((await reopened.read()).privateSecurity.locked).toBe(true);
        expect((await reopened.unlockPrivate('vault-password')).privateSettingOverrides).toEqual(
          overrides,
        );
        expect(await db.get('vault', 'private')).toEqual(convertedEnvelope);
      } finally {
        await reopened.close();
      }
    } finally {
      await repo.close();
      db.close();
    }
  });

  it('recovers the previously shipped v3 settings without changing navigation data', async () => {
    const old = previousV3State();
    const name = crypto.randomUUID();
    const db = await openDB(name, 3, {
      upgrade(db) {
        for (const store of ['state', 'resources', 'vault', 'wallpapers'])
          db.createObjectStore(store);
      },
    });
    await db.put('state', old, 'current');
    const repo = createRepository(name);
    try {
      const recovered = await repo.read();
      expect(recovered.spaces.normal).toMatchObject(legacyNavigation(old.spaces.normal));
      expect(recovered.spaces.private).toMatchObject(legacyNavigation(old.spaces.private));
      expect(recovered.local).toEqual(old.local);
      expect(recovered.normalSettings.cardSize * recovered.normalSettings.iconSizeRatio).toBe(80);
      expect(recovered.normalSettings).not.toHaveProperty('showGroups');
      expect(recovered.normalSettings.iconSpacing).toBe(27);
      expect(recovered.normalSettings).not.toHaveProperty('iconSize');
      expect(
        recovered.privateSettingOverrides.cardSize! *
          recovered.privateSettingOverrides.iconSizeRatio!,
      ).toBe(44);
      expect(await db.get('state', 'current')).toEqual(recovered);
      expect(await repo.read()).toEqual(recovered);
    } finally {
      await repo.close();
      db.close();
    }
  });

  it('preserves the complete settings already saved by the latest v3 UI', () => {
    const state = createLegacyV4State();
    const old = { ...state, schemaVersion: 3 };
    const upgraded = upgradeLocalState(old);
    const {
      showGroups,
      showCardBackground,
      cardOpacity,
      navigationCollapsed,
      ...remainingSettings
    } = old.normalSettings;
    expect(upgraded.normalSettings).toEqual({ ...remainingSettings, iconRadius: 24 });
    expect(upgraded.spaces.normal).toMatchObject(legacyNavigation(old.spaces.normal));
    expect(upgraded.spaces.private).toMatchObject(legacyNavigation(old.spaces.private));
    expect(upgradeLocalState(upgraded)).toEqual(upgraded);
  });

  it('converts encrypted v3 icon settings only after unlocking', async () => {
    const old = previousV3State();
    const envelope = await encryptJson(
      { space: old.spaces.private, overrides: old.privateSettingOverrides, resources: [] },
      'vault-password',
    );
    old.privateSecurity = { protected: true, locked: true };
    const stored = { ...old, privateSettingOverrides: {} };
    const name = crypto.randomUUID();
    const db = await openDB(name, 3, {
      upgrade(db) {
        for (const store of ['state', 'resources', 'vault', 'wallpapers'])
          db.createObjectStore(store);
      },
    });
    await db.put('state', stored, 'current');
    await db.put('vault', envelope, 'private');
    const repo = createRepository(name);
    try {
      expect((await repo.read()).privateSecurity.locked).toBe(true);
      expect(await db.get('vault', 'private')).toEqual(envelope);
      await expect(repo.unlockPrivate('wrong-password')).rejects.toThrow(
        'messages.thePasswordIsIncorrectOrTheEncryptedDataIsDamaged',
      );
      const unlocked = await repo.unlockPrivate('vault-password');
      expect(
        unlocked.privateSettingOverrides.cardSize! *
          unlocked.privateSettingOverrides.iconSizeRatio!,
      ).toBe(44);
      expect(unlocked.spaces.normal).toMatchObject(legacyNavigation(old.spaces.normal));
      await repo.update(() => {});
      await repo.lockPrivate();
      expect((await repo.unlockPrivate('vault-password')).privateSettingOverrides).toEqual(
        unlocked.privateSettingOverrides,
      );
    } finally {
      await repo.close();
      db.close();
    }
  });

  it('leaves stored data untouched when a v3 record is invalid', async () => {
    const old = previousV3State();
    old.normalSettings.iconSize = 100;
    const name = crypto.randomUUID();
    const db = await openDB(name, 3, {
      upgrade(db) {
        for (const store of ['state', 'resources', 'vault', 'wallpapers'])
          db.createObjectStore(store);
      },
    });
    await db.put('state', old, 'current');
    const repo = createRepository(name);
    try {
      await expect(repo.read()).rejects.toThrow();
      expect(await db.get('state', 'current')).toEqual(old);
    } finally {
      await repo.close();
      db.close();
    }
  });
  it('preserves URLs and appearance, flattens categories and is idempotent', () => {
    const old = legacyState();
    const upgraded = upgradeLocalState(old);
    expect(upgraded.schemaVersion).toBe(5);
    expect(upgraded.spaces.normal.folders).toEqual([]);
    expect(upgraded.spaces.normal.sites.map((item) => item.url)).toEqual(
      old.spaces.normal.sites.map((item) => item.url),
    );
    expect(upgraded.normalSettings).toMatchObject({
      cardSize: 136,
      iconSpacing: 33,
    });
    expect(upgraded.normalSettings).not.toHaveProperty('showGroups');
    expect(upgraded.normalSettings).not.toHaveProperty('showCategories');
    expect(upgraded.privateSettingOverrides).toEqual({});
    expect(upgraded.local.homeMode).toBe('focus');
    expect(upgradeLocalState(upgraded)).toEqual(upgraded);
    expect(old.schemaVersion).toBe(2);
  });

  it('migrates an encrypted private space only after authentication and keeps it encrypted', async () => {
    const name = crypto.randomUUID();
    const old = legacyState();
    const privateSpace = structuredClone(old.spaces.private);
    const overrides = structuredClone(old.privateSettingOverrides);
    const envelope = await encryptJson(
      { space: privateSpace, overrides, resources: [] },
      'vault-password',
    );
    old.privateSecurity = { protected: true, locked: true };
    old.spaces.private.sites = [];
    const db = await openDB(name, 3, {
      upgrade(db) {
        for (const store of ['state', 'resources', 'vault', 'wallpapers'])
          db.createObjectStore(store);
      },
    });
    await db.put('state', old, 'current');
    await db.put('vault', envelope, 'private');
    const repo = createRepository(name);
    const locked = await repo.read();
    expect(locked.schemaVersion).toBe(5);
    expect(locked.spaces.private.sites).toEqual([]);
    expect(await db.get('vault', 'private')).toEqual(envelope);
    await expect(repo.unlockPrivate('wrong-password')).rejects.toThrow(
      'messages.thePasswordIsIncorrectOrTheEncryptedDataIsDamaged',
    );
    const unlocked = await repo.unlockPrivate('vault-password');
    expect(unlocked.spaces.private.sites.map((item) => item.url)).toEqual(
      privateSpace.sites.map((item) => item.url),
    );
    expect(unlocked.privateSettingOverrides).toEqual({});
    await repo.update((state) => {
      state.spaces.private.sites[0].title = 'Migrated private';
    });
    expect(JSON.stringify(await db.get('state', 'current'))).not.toContain('Migrated private');
    await repo.close();
    const reopened = createRepository(name);
    expect((await reopened.read()).privateSecurity.locked).toBe(true);
    expect((await reopened.unlockPrivate('vault-password')).spaces.private.sites[0].title).toBe(
      'Migrated private',
    );
    await reopened.close();
    db.close();
  });
});
