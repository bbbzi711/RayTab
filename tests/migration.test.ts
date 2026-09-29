import { openDB } from 'idb';
import { describe, expect, it } from 'vitest';
import { createInitialState, defaultSettings } from '../src/storage/model';
import { createRepository } from '../src/storage/database';
import { encryptJson } from '../src/security/crypto';
import { upgradeLocalState } from '../src/storage/upgrade-local';

function legacyState() {
  const state = createInitialState();
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
  const state = createInitialState();
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
  it('recovers the previously shipped v3 settings without changing navigation data', async () => {
    const old = previousV3State();
    const name = crypto.randomUUID();
    const db = await openDB(name, 2, {
      upgrade(db) {
        for (const store of ['state', 'resources', 'vault']) db.createObjectStore(store);
      },
    });
    await db.put('state', old, 'current');
    const repo = createRepository(name);
    try {
      const recovered = await repo.read();
      expect(recovered.spaces).toEqual(old.spaces);
      expect(recovered.local).toEqual(old.local);
      expect(recovered.normalSettings.cardSize * recovered.normalSettings.iconSizeRatio).toBe(80);
      expect(recovered.normalSettings.showGroups).toBe(defaultSettings.showGroups);
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
    const state = createInitialState();
    const old = { ...state, schemaVersion: 3 };
    const upgraded = upgradeLocalState(old);
    expect(upgraded.normalSettings).toEqual(old.normalSettings);
    expect(upgraded.spaces).toEqual(old.spaces);
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
    const db = await openDB(name, 2, {
      upgrade(db) {
        for (const store of ['state', 'resources', 'vault']) db.createObjectStore(store);
      },
    });
    await db.put('state', stored, 'current');
    await db.put('vault', envelope, 'private');
    const repo = createRepository(name);
    try {
      expect((await repo.read()).privateSecurity.locked).toBe(true);
      expect(await db.get('vault', 'private')).toEqual(envelope);
      await expect(repo.unlockPrivate('wrong-password')).rejects.toThrow('密码错误');
      const unlocked = await repo.unlockPrivate('vault-password');
      expect(
        unlocked.privateSettingOverrides.cardSize! *
          unlocked.privateSettingOverrides.iconSizeRatio!,
      ).toBe(44);
      expect(unlocked.spaces.normal).toEqual(old.spaces.normal);
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
    const db = await openDB(name, 2, {
      upgrade(db) {
        for (const store of ['state', 'resources', 'vault']) db.createObjectStore(store);
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
    expect(upgraded.schemaVersion).toBe(4);
    expect(upgraded.spaces.normal.folders).toEqual([]);
    expect(upgraded.spaces.normal.sites.map((item) => item.url)).toEqual(
      old.spaces.normal.sites.map((item) => item.url),
    );
    expect(upgraded.normalSettings).toMatchObject({
      cardSize: 136,
      iconSpacing: 33,
      showGroups: false,
    });
    expect(upgraded.privateSettingOverrides).toEqual({ showGroups: false, cardOpacity: 0.7 });
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
    const db = await openDB(name, 2, {
      upgrade(db) {
        for (const store of ['state', 'resources', 'vault']) db.createObjectStore(store);
      },
    });
    await db.put('state', old, 'current');
    await db.put('vault', envelope, 'private');
    const repo = createRepository(name);
    const locked = await repo.read();
    expect(locked.schemaVersion).toBe(4);
    expect(locked.spaces.private.sites).toEqual([]);
    expect(await db.get('vault', 'private')).toEqual(envelope);
    await expect(repo.unlockPrivate('wrong-password')).rejects.toThrow('密码错误');
    const unlocked = await repo.unlockPrivate('vault-password');
    expect(unlocked.spaces.private.sites.map((item) => item.url)).toEqual(
      privateSpace.sites.map((item) => item.url),
    );
    expect(unlocked.privateSettingOverrides).toEqual({ showGroups: false, cardOpacity: 0.7 });
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
