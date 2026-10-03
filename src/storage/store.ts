import { create } from 'zustand';
import { serializeError, type StoredError } from '@/lib/errors';
import { repository } from './repository';
import { applyCommand, type Command } from './operations';
import { wallpaperDisplay } from '@/features/appearance/wallpaper-source';
import {
  createLockedPrivateSpace,
  effectiveSettings,
  type RayState,
  type SpaceId,
  type SpaceSettings,
} from './model';

const STARTUP_META_KEY = 'raytab-startup-meta';
const readError = (reason: unknown): StoredError => {
  const error = serializeError(reason);
  return error.code === 'messages.anErrorOccurredTryAgain'
    ? { ...error, code: 'errors.localRead' }
    : error;
};

function saveStartupMeta(state: RayState) {
  if (typeof localStorage === 'undefined') return;
  try {
    const wallpaper = wallpaperDisplay(state.normalSettings);
    const previous: unknown = JSON.parse(localStorage.getItem(STARTUP_META_KEY) || '{}');
    if (typeof previous === 'object' && previous && 'wallpaper' in previous) {
      const cached = previous.wallpaper;
      if (
        (wallpaper.resourceId || wallpaper.remoteUrl) &&
        typeof cached === 'object' &&
        cached &&
        'color' in cached &&
        typeof cached.color === 'string' &&
        /^#[\da-f]{6}$/i.test(cached.color)
      )
        wallpaper.color = cached.color;
    }
    localStorage.setItem(
      STARTUP_META_KEY,
      JSON.stringify({
        theme: state.normalSettings.theme,
        homeMode: state.local.homeMode,
        wallpaper,
      }),
    );
  } catch {
    // First-paint metadata is optional; IndexedDB remains the saved data source.
  }
}

type RayTabStore = {
  state: RayState | null;
  error: StoredError | null;
  resourceVersion: number;
  settingsPreview: { spaceId: SpaceId; patch: Partial<SpaceSettings> } | null;
  previewSettings: (spaceId: SpaceId, patch: Partial<SpaceSettings>) => void;
  clearSettingsPreview: (spaceId?: SpaceId, savedPatch?: Partial<SpaceSettings>) => void;
  refresh: () => Promise<void>;
  dispatch: (command: Command, assets?: Map<string, Blob>) => Promise<void>;
  protectPrivate: (password: string) => Promise<void>;
  unlockPrivate: (password: string) => Promise<void>;
  lockPrivate: () => Promise<void>;
  changePrivatePassword: (current: string, next: string) => Promise<void>;
  removePrivatePassword: (password: string) => Promise<void>;
};

export const useRayTabStore = create<RayTabStore>((set, get) => {
  let readRequest = 0;
  let privateSessionVersion = 0;

  const publish = (state: RayState, sessionVersion: number) => {
    if (sessionVersion !== privateSessionVersion) return false;
    const current = get().state;
    if (current && state.revision < current.revision) return false;
    readRequest++;
    const resourcesChanged =
      !current ||
      state.revision !== current.revision ||
      state.privateSecurity.protected !== current.privateSecurity.protected ||
      state.privateSecurity.locked !== current.privateSecurity.locked;
    set({
      state,
      error: null,
      resourceVersion: get().resourceVersion + Number(resourcesChanged),
      settingsPreview:
        current?.local.activeSpace !== state.local.activeSpace ||
        (state.privateSecurity.locked && !current?.privateSecurity.locked)
          ? null
          : get().settingsPreview,
    });
    saveStartupMeta(state);
    return true;
  };

  const runPrivate = async (action: () => Promise<RayState>) => {
    const sessionVersion = ++privateSessionVersion;
    readRequest++;
    const state = await action();
    if (!publish(state, sessionVersion)) await get().refresh();
  };

  return {
    state: null,
    error: null,
    resourceVersion: 0,
    settingsPreview: null,
    previewSettings: (spaceId, patch) => {
      const current = get();
      if (!current.state || (spaceId === 'private' && current.state.privateSecurity.locked)) return;
      set({
        settingsPreview: {
          spaceId,
          patch: {
            ...(current.settingsPreview?.spaceId === spaceId ? current.settingsPreview.patch : {}),
            ...patch,
          },
        },
      });
    },
    clearSettingsPreview: (spaceId, savedPatch) => {
      const preview = get().settingsPreview;
      if (!preview || (spaceId && preview.spaceId !== spaceId)) return;
      if (!savedPatch) {
        set({ settingsPreview: null });
        return;
      }
      const patch = { ...preview.patch };
      for (const key of Object.keys(savedPatch) as (keyof SpaceSettings)[])
        if (Object.is(patch[key], savedPatch[key])) delete patch[key];
      set({ settingsPreview: Object.keys(patch).length ? { ...preview, patch } : null });
    },
    refresh: async () => {
      const request = ++readRequest;
      const sessionVersion = privateSessionVersion;
      try {
        const state = await repository.read();
        if (request === readRequest) publish(state, sessionVersion);
      } catch (reason) {
        if (request === readRequest && sessionVersion === privateSessionVersion)
          set({ error: readError(reason) });
      }
    },
    dispatch: async (command, assets) => {
      const sessionVersion = privateSessionVersion;
      const state = await repository.update((draft) => applyCommand(draft, command), assets);
      if (!publish(state, sessionVersion)) await get().refresh();
    },
    protectPrivate: (password) => runPrivate(() => repository.protectPrivate(password)),
    unlockPrivate: (password) => runPrivate(() => repository.unlockPrivate(password)),
    lockPrivate: () =>
      runPrivate(() => {
        const current = get().state;
        set({ settingsPreview: null });
        if (current?.privateSecurity.protected && !current.privateSecurity.locked) {
          const privateSpace = createLockedPrivateSpace();
          set({
            state: {
              ...current,
              spaces: { ...current.spaces, private: privateSpace },
              privateSettingOverrides: {},
              privateSecurity: { protected: true, locked: true },
              local: {
                ...current.local,
                activeSpace: 'normal',
                activeGroup: { ...current.local.activeGroup, private: privateSpace.groups[0].id },
                selectedFolder: { ...current.local.selectedFolder, private: {} },
              },
            },
            resourceVersion: get().resourceVersion + 1,
          });
        }
        return repository.lockPrivate();
      }),
    changePrivatePassword: (current, next) =>
      runPrivate(async () => {
        await repository.changePrivatePassword(current, next);
        return repository.read();
      }),
    removePrivatePassword: (password) =>
      runPrivate(() => repository.removePrivatePassword(password)),
  };
});

export function selectEffectiveSettings(store: RayTabStore, spaceId?: SpaceId) {
  if (!store.state) return null;
  const selectedSpace = spaceId ?? store.state.local.activeSpace;
  const settings = effectiveSettings(store.state, selectedSpace);
  return store.settingsPreview?.spaceId === selectedSpace
    ? { ...settings, ...store.settingsPreview.patch }
    : settings;
}

export function startRayTabStore() {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem('raytab-quick-cache');
      localStorage.removeItem('raytab-quick-meta');
    } catch {
      // Discarding an obsolete optional cache does not change saved data.
    }
  }
  const channel =
    typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('raytab-updates');
  const refresh = () => void useRayTabStore.getState().refresh();
  const lock = () => {
    if (!useRayTabStore.getState().state?.privateSecurity.protected) return;
    void useRayTabStore
      .getState()
      .lockPrivate()
      .catch((reason: unknown) => {
        useRayTabStore.setState({ error: readError(reason) });
      });
  };
  channel?.addEventListener('message', refresh);
  window.addEventListener('focus', refresh);
  window.addEventListener('pagehide', lock);
  refresh();
  return () => {
    channel?.removeEventListener('message', refresh);
    channel?.close();
    window.removeEventListener('focus', refresh);
    window.removeEventListener('pagehide', lock);
  };
}
