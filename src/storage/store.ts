import { useSyncExternalStore } from 'react';
import { repository } from './repository';
import { applyCommand, type Command } from './operations';
import {
  createLockedPrivateSpace,
  effectiveSettings,
  rayStateSchema,
  type RayState,
} from './model';

const QUICK_CACHE_KEY = 'raytab-quick-cache';
const QUICK_META_KEY = 'raytab-quick-meta';

function saveQuickCache(state: RayState) {
  if (typeof localStorage === 'undefined') return;
  try {
    const safeState = structuredClone(state);
    if (safeState.privateSecurity.protected) {
      safeState.spaces.private = createLockedPrivateSpace();
      safeState.privateSettingOverrides = {};
      safeState.local.activeSpace = 'normal';
      safeState.privateSecurity.locked = true;
    }
    localStorage.setItem(QUICK_CACHE_KEY, JSON.stringify(safeState));
    const activeSpace = safeState.local.activeSpace;
    const settings = effectiveSettings(safeState, activeSpace);
    localStorage.setItem(
      QUICK_META_KEY,
      JSON.stringify({
        theme: settings.theme,
        homeMode: safeState.local.homeMode,
      }),
    );
  } catch {
    /* ignore quota or serialization errors */
  }
}

function loadQuickCache(): RayState | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(QUICK_CACHE_KEY);
    return raw ? rayStateSchema.parse(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

type Snapshot = { state: RayState | null; error: string | null };
let snapshot: Snapshot = { state: loadQuickCache(), error: null };
const listeners = new Set<() => void>();
const channel =
  typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('raytab-updates');
function notify() {
  listeners.forEach((listener) => listener());
}
export async function refresh() {
  try {
    const state = await repository.read();
    if (!snapshot.state || state.revision >= snapshot.state.revision) {
      snapshot = { state, error: null };
      saveQuickCache(state);
      notify();
    }
  } catch {
    snapshot = { ...snapshot, error: '本地数据暂时无法读取。请重试；不要清除浏览器数据。' };
    notify();
  }
}
channel?.addEventListener('message', () => void refresh());
window.addEventListener('focus', () => void refresh());
void refresh();
export function useRayTab() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => snapshot,
  );
}
export async function dispatch(command: Command, assets?: Map<string, Blob>) {
  const state = await repository.update((draft) => applyCommand(draft, command), assets);
  channel?.postMessage('updated');
  if (!snapshot.state || state.revision >= snapshot.state.revision) {
    snapshot = { state, error: null };
    saveQuickCache(state);
    notify();
  }
}

async function runSecurity(action: () => Promise<RayState>) {
  const state = await action();
  channel?.postMessage('updated');
  snapshot = { state, error: null };
  saveQuickCache(state);
  notify();
}
export const privateVault = {
  protect: (password: string) => runSecurity(() => repository.protectPrivate(password)),
  unlock: (password: string) => runSecurity(() => repository.unlockPrivate(password)),
  lock: () => runSecurity(() => repository.lockPrivate()),
  changePassword: async (current: string, next: string) => {
    await repository.changePrivatePassword(current, next);
    await refresh();
  },
  removePassword: (password: string) =>
    runSecurity(() => repository.removePrivatePassword(password)),
};

export { repository };
