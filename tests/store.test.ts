import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRepository } from '../src/storage/database';
import { type RayState } from '../src/storage/model';
import { applyStartupMeta } from '../src/entrypoints/newtab/startup';
import { wallpaperDisplay } from '../src/features/appearance/wallpaper-source';

const repositoryMock = vi.hoisted(() => ({
  read: vi.fn(),
  update: vi.fn(),
  protectPrivate: vi.fn(),
  unlockPrivate: vi.fn(),
  lockPrivate: vi.fn(),
  changePrivatePassword: vi.fn(),
  removePrivatePassword: vi.fn(),
}));
vi.mock('../src/storage/repository', () => ({ repository: repositoryMock }));

class TestBroadcastChannel extends EventTarget {
  static channels: TestBroadcastChannel[] = [];
  closed = false;
  sent = 0;
  constructor(public name: string) {
    super();
    TestBroadcastChannel.channels.push(this);
  }
  postMessage(data: unknown) {
    this.sent++;
    for (const channel of TestBroadcastChannel.channels)
      if (channel !== this && !channel.closed && channel.name === this.name)
        channel.dispatchEvent(new MessageEvent('message', { data }));
  }
  close() {
    this.closed = true;
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

let actual: ReturnType<typeof createRepository>;
let other: ReturnType<typeof createRepository> | undefined;
let emitter: TestBroadcastChannel;
let storage: Map<string, string>;
let storeModule: typeof import('../src/storage/store');
let stop: (() => void) | undefined;
let databaseName: string;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  TestBroadcastChannel.channels = [];
  storage = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('BroadcastChannel', TestBroadcastChannel);
  emitter = new TestBroadcastChannel('raytab-updates');
  databaseName = crypto.randomUUID();
  actual = createRepository(databaseName, () => emitter.postMessage('updated'));
  for (const method of Object.keys(repositoryMock) as (keyof typeof repositoryMock)[])
    repositoryMock[method].mockImplementation(actual[method]);
  storeModule = await import('../src/storage/store');
});

afterEach(async () => {
  stop?.();
  stop = undefined;
  await actual.close();
  await other?.close();
  other = undefined;
  for (const channel of TestBroadcastChannel.channels) channel.close();
  vi.unstubAllGlobals();
});

describe('Zustand saved state', () => {
  it('loads only from the repository and keeps only non-sensitive startup metadata', async () => {
    storage.set('raytab-quick-cache', JSON.stringify({ sites: ['outdated private content'] }));
    storage.set('raytab-quick-meta', JSON.stringify({ theme: 'dark' }));
    expect(storeModule.useRayTabStore.getState().state).toBeNull();
    expect(repositoryMock.read).not.toHaveBeenCalled();
    stop = storeModule.startRayTabStore();
    await vi.waitFor(() => expect(storeModule.useRayTabStore.getState().state).not.toBeNull());
    expect(storage.has('raytab-quick-cache')).toBe(false);
    expect(storage.has('raytab-quick-meta')).toBe(false);
    expect([...storage.keys()]).toEqual(['raytab-startup-meta']);
    expect(JSON.parse(storage.get('raytab-startup-meta')!)).toEqual({
      theme: 'system',
      homeMode: 'navigation',
      wallpaper: wallpaperDisplay(storeModule.useRayTabStore.getState().state!.normalSettings),
    });
    await storeModule.useRayTabStore.getState().dispatch({
      type: 'settings',
      spaceId: 'normal',
      patch: { theme: 'dark' },
    });
    expect(JSON.parse(storage.get('raytab-startup-meta')!)).toEqual({
      theme: 'dark',
      homeMode: 'navigation',
      wallpaper: wallpaperDisplay(storeModule.useRayTabStore.getState().state!.normalSettings),
    });
    expect(storage.get('raytab-startup-meta')).not.toMatch(/sites|spaces|password|revision/);
  });

  it('keeps saved state when saving fails and clears a read error after retry', async () => {
    const store = storeModule.useRayTabStore;
    await store.getState().refresh();
    const before = store.getState().state;
    repositoryMock.update.mockRejectedValueOnce(new Error('write failed'));
    await expect(
      store
        .getState()
        .dispatch({ type: 'settings', spaceId: 'normal', patch: { showClock: false } }),
    ).rejects.toThrow('write failed');
    expect(store.getState().state).toBe(before);
    repositoryMock.read.mockRejectedValueOnce(new Error('read failed'));
    await store.getState().refresh();
    expect(store.getState().state).toBe(before);
    expect(store.getState().error).toMatchObject({ code: 'errors.localRead' });
    await store.getState().refresh();
    expect(store.getState().error).toBeNull();
  });

  it.each(['success', 'failure'] as const)(
    'ignores a late refresh %s after a newer committed update',
    async (result) => {
      const store = storeModule.useRayTabStore;
      await store.getState().refresh();
      const stale = structuredClone(store.getState().state!);
      const read = deferred<RayState>();
      repositoryMock.read.mockImplementationOnce(() => read.promise);
      const refreshing = store.getState().refresh();
      await store.getState().dispatch({
        type: 'settings',
        spaceId: 'normal',
        patch: { showClock: false },
      });
      if (result === 'success') read.resolve(stale);
      else read.reject(new Error('outdated error'));
      await refreshing;
      expect(store.getState().state!.normalSettings.showClock).toBe(false);
      expect(store.getState().state!.revision).toBe(stale.revision + 1);
      expect(store.getState().error).toBeNull();
    },
  );

  it('does not accept a repository result older than the current revision', async () => {
    const store = storeModule.useRayTabStore;
    await store.getState().refresh();
    const stale = structuredClone(store.getState().state!);
    await store.getState().dispatch({ type: 'set-home-mode', mode: 'navigation' });
    repositoryMock.read.mockResolvedValueOnce(stale);
    await store.getState().refresh();
    expect(store.getState().state!.local.homeMode).toBe('navigation');
  });

  it('previews settings without saving and preserves pending values when a commit fails', async () => {
    const store = storeModule.useRayTabStore;
    await store.getState().refresh();
    const savedSize = store.getState().state!.normalSettings.cardSize;
    store.getState().previewSettings('normal', { cardSize: 140 });
    store.getState().previewSettings('normal', { iconSpacing: 30 });
    expect(storeModule.selectEffectiveSettings(store.getState())).toMatchObject({
      cardSize: 140,
      iconSpacing: 30,
    });
    expect(store.getState().state!.normalSettings.cardSize).toBe(savedSize);
    expect((await actual.read()).normalSettings.cardSize).toBe(savedSize);
    expect(storage.get('raytab-startup-meta')).not.toContain('140');
    repositoryMock.update.mockRejectedValueOnce(new Error('save failed'));
    await expect(
      store.getState().dispatch({ type: 'settings', spaceId: 'normal', patch: { cardSize: 140 } }),
    ).rejects.toThrow('save failed');
    expect(store.getState().settingsPreview?.patch.cardSize).toBe(140);
    store.getState().clearSettingsPreview();
    expect(storeModule.selectEffectiveSettings(store.getState())!.cardSize).toBe(savedSize);
  });

  it('retains newer previews when an earlier settings save finishes', async () => {
    const store = storeModule.useRayTabStore;
    await store.getState().refresh();
    store.getState().previewSettings('normal', { cardSize: 120, iconSpacing: 30 });
    store.getState().previewSettings('normal', { cardSize: 140 });
    store.getState().clearSettingsPreview('normal', { cardSize: 120, iconSpacing: 30 });
    expect(store.getState().settingsPreview).toEqual({
      spaceId: 'normal',
      patch: { cardSize: 140 },
    });
    store.getState().clearSettingsPreview('private');
    expect(store.getState().settingsPreview).not.toBeNull();
  });

  it('clears transient previews when switching spaces', async () => {
    const store = storeModule.useRayTabStore;
    await store.getState().refresh();
    store.getState().previewSettings('normal', { cardSize: 140 });
    await store.getState().dispatch({ type: 'switch-space', spaceId: 'private' });
    expect(store.getState().settingsPreview).toBeNull();
  });

  it('refreshes cross-page commits and removes channel and window listeners on teardown', async () => {
    const store = storeModule.useRayTabStore;
    stop = storeModule.startRayTabStore();
    await vi.waitFor(() => expect(store.getState().state).not.toBeNull());
    other = createRepository(databaseName, () => emitter.postMessage('updated'));
    await other.update((state) => {
      state.normalSettings.showSearch = false;
    });
    await vi.waitFor(() => expect(store.getState().state!.normalSettings.showSearch).toBe(false));
    emitter.sent = 0;
    await store.getState().dispatch({ type: 'set-home-mode', mode: 'navigation' });
    expect(emitter.sent).toBe(1);
    await store.getState().refresh();
    const previousReads = repositoryMock.read.mock.calls.length;
    stop();
    stop = undefined;
    expect(TestBroadcastChannel.channels[1].closed).toBe(true);
    window.dispatchEvent(new Event('focus'));
    emitter.postMessage('updated');
    expect(repositoryMock.read).toHaveBeenCalledTimes(previousReads);
  });
});

describe('private session invalidation', () => {
  it('immediately scrubs private data and invalidates resources even when an older read finishes later', async () => {
    const store = storeModule.useRayTabStore;
    await store.getState().refresh();
    const groupId = store.getState().state!.local.activeGroup.private;
    await store.getState().dispatch(
      {
        type: 'save-site',
        spaceId: 'private',
        id: 'secret',
        groupId,
        folderId: null,
        site: {
          title: 'Private title',
          url: 'https://private.example/',
          icon: { source: 'resource', resourceId: 'private-image' },
          iconBackground: { mode: 'color', color: '#123456' },
        },
      },
      new Map([['private-image', new Blob(['private image'])]]),
    );
    await store.getState().protectPrivate('vault-password');
    await store.getState().unlockPrivate('vault-password');
    await store.getState().dispatch({ type: 'switch-space', spaceId: 'private' });
    const unlocked = structuredClone(store.getState().state!);
    store.getState().previewSettings('private', { onlineWallpaperUrl: 'https://secret.example/' });
    const read = deferred<RayState>();
    repositoryMock.read.mockImplementationOnce(() => read.promise);
    const refreshing = store.getState().refresh();
    const version = store.getState().resourceVersion;
    const locking = store.getState().lockPrivate();
    expect(store.getState().state!.privateSecurity.locked).toBe(true);
    expect(store.getState().state!.local.activeSpace).toBe('normal');
    expect(store.getState().state!.spaces.private.sites).toEqual([]);
    expect(store.getState().resourceVersion).toBeGreaterThan(version);
    expect(store.getState().settingsPreview).toBeNull();
    store.getState().previewSettings('private', { onlineWallpaperUrl: 'https://secret.example/' });
    expect(store.getState().settingsPreview).toBeNull();
    read.resolve(unlocked);
    await Promise.all([refreshing, locking]);
    expect(store.getState().state!.privateSecurity.locked).toBe(true);
    expect(store.getState().state!.spaces.private.sites).toEqual([]);
    expect(await actual.resource('private-image')).toBeUndefined();
  });

  it("does not copy another page's unlocked session into this page", async () => {
    const store = storeModule.useRayTabStore;
    stop = storeModule.startRayTabStore();
    await vi.waitFor(() => expect(store.getState().state).not.toBeNull());
    await store.getState().protectPrivate('vault-password');
    other = createRepository(databaseName, () => emitter.postMessage('updated'));
    await other.unlockPrivate('vault-password');
    await other.update((state) => {
      state.privateSettingOverrides.theme = 'light';
    });
    await vi.waitFor(() => expect(store.getState().state!.revision).toBeGreaterThan(1));
    expect(store.getState().state!.privateSecurity.locked).toBe(true);
    expect(store.getState().state!.privateSettingOverrides).toEqual({});
    await store.getState().unlockPrivate('vault-password');
    expect(store.getState().state!.privateSettingOverrides.theme).toBe('light');
    await store.getState().changePrivatePassword('vault-password', 'next-password');
    expect(store.getState().state!.privateSecurity.locked).toBe(true);
    await store.getState().removePrivatePassword('next-password');
    expect(store.getState().state!.privateSecurity.protected).toBe(false);
    expect(store.getState().state!.privateSettingOverrides.theme).toBe('light');
  });

  it('locks on pagehide so a restored document cannot retain an unlocked session', async () => {
    const store = storeModule.useRayTabStore;
    stop = storeModule.startRayTabStore();
    await vi.waitFor(() => expect(store.getState().state).not.toBeNull());
    await store.getState().protectPrivate('vault-password');
    await store.getState().unlockPrivate('vault-password');
    window.dispatchEvent(new Event('pagehide'));
    expect(store.getState().state!.privateSecurity.locked).toBe(true);
    await vi.waitFor(() => expect(repositoryMock.lockPrivate).toHaveBeenCalledOnce());
    await store.getState().refresh();
    expect(store.getState().state!.privateSecurity.locked).toBe(true);
  });
});

describe('first-paint metadata', () => {
  it('applies valid metadata before React starts', () => {
    storage.set('raytab-startup-meta', JSON.stringify({ theme: 'dark', homeMode: 'navigation' }));
    const document = { documentElement: { dataset: {} } };
    vi.stubGlobal('document', document);
    applyStartupMeta();
    expect(document.documentElement.dataset).toEqual({ theme: 'dark', homeMode: 'navigation' });
  });

  it.each(['invalid JSON', JSON.stringify({ theme: 'unknown', homeMode: '<private>' })])(
    'ignores invalid optional metadata without reading a business state cache: %s',
    (value) => {
      storage.set('raytab-startup-meta', value);
      const document = { documentElement: { dataset: {} } };
      vi.stubGlobal('document', document);
      applyStartupMeta();
      expect(document.documentElement.dataset).toEqual({});
    },
  );
});
