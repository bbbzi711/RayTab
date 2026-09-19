import { openDB, type DBSchema, type IDBPObjectStore } from 'idb';
import { decryptJson, encryptJson, type EncryptedEnvelope } from '@/security/crypto';
import {
  createInitialState,
  createLockedPrivateSpace,
  rayStateSchema,
  resourceIds,
  spaceDataSchema,
  spaceSettingsSchema,
  type RayState,
} from './model';

type VaultSerialized = {
  space: RayState['spaces']['private'];
  overrides: RayState['privateSettingOverrides'];
  resources: { id: string; type: string; data: string }[];
};
type VaultSession = Omit<VaultSerialized, 'resources'> & { resources: Map<string, Blob> };
interface RayDatabase extends DBSchema {
  state: { key: string; value: RayState };
  resources: { key: string; value: Blob };
  vault: { key: string; value: EncryptedEnvelope };
}

export function createRepository(name = 'raytab-v2', onCommit = () => {}) {
  let session: VaultSession | null = null;
  let sessionPassword: string | null = null;
  const dbPromise = openDB<RayDatabase>(name, 2, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('state')) db.createObjectStore('state');
      if (!db.objectStoreNames.contains('resources')) db.createObjectStore('resources');
      if (!db.objectStoreNames.contains('vault')) db.createObjectStore('vault');
    },
  });

  async function readRaw() {
    const db = await dbPromise;
    const tx = db.transaction('state', 'readwrite');
    let state = await tx.store.get('current');
    if (!state) {
      state = createInitialState();
      await tx.store.put(state, 'current');
    }
    await tx.done;
    return rayStateSchema.parse(state);
  }
  function materialize(raw: RayState) {
    const state = structuredClone(raw);
    if (state.privateSecurity.protected && session) {
      state.spaces.private = structuredClone(session.space);
      state.privateSettingOverrides = structuredClone(session.overrides);
      state.privateSecurity.locked = false;
      if (
        !state.spaces.private.desktops.some((item) => item.id === state.local.activeDesktop.private)
      )
        state.local.activeDesktop.private = state.spaces.private.desktops[0].id;
    } else if (state.privateSecurity.protected) {
      state.local.activeSpace = 'normal';
    }
    return rayStateSchema.parse(state);
  }
  async function read() {
    return materialize(await readRaw());
  }
  async function update(change: (draft: RayState) => void, assets: Map<string, Blob> = new Map()) {
    const db = await dbPromise;
    const raw = rayStateSchema.parse((await db.get('state', 'current')) ?? createInitialState());
    const draft = materialize(raw);
    change(draft);
    draft.revision++;
    const valid = rayStateSchema.parse(draft);
    let envelope: EncryptedEnvelope | undefined;
    if (valid.privateSecurity.protected && session && sessionPassword) {
      session.space = structuredClone(valid.spaces.private);
      session.overrides = structuredClone(valid.privateSettingOverrides);
      for (const [id, blob] of assets) session.resources.set(id, blob);
      for (const id of privateResourceIds(valid)) {
        const blob = session.resources.get(id) ?? (await db.get('resources', id));
        if (!blob) throw new Error('私密空间图片缺失，未保存任何修改');
        session.resources.set(id, blob);
      }
      envelope = await encryptJson(await serializeSession(session), sessionPassword);
    } else if (
      valid.privateSecurity.protected &&
      (JSON.stringify(valid.spaces.private) !== JSON.stringify(raw.spaces.private) ||
        JSON.stringify(valid.privateSettingOverrides) !==
          JSON.stringify(raw.privateSettingOverrides))
    ) {
      throw new Error('请先解锁私密空间');
    }
    const tx = db.transaction(['state', 'resources', 'vault'], 'readwrite');
    try {
      const latest = await tx.objectStore('state').get('current');
      if (latest && latest.revision !== raw.revision)
        throw new Error('数据刚刚在另一个页面发生变化，请重试');
      for (const [key, blob] of assets) await tx.objectStore('resources').put(blob, key);

      if (valid.privateSecurity.protected) {
        if (envelope) {
          await tx.objectStore('vault').put(envelope, 'private');
          await removePrivateOnlyResources(valid, tx.objectStore('resources'));
        }
        const persisted = scrubPrivate(valid);
        await validateResources(persisted, tx.objectStore('resources'));
        await tx.objectStore('state').put(persisted, 'current');
      } else {
        await validateResources(valid, tx.objectStore('resources'));
        for (const key of await tx.objectStore('resources').getAllKeys())
          if (!resourceIds(valid).has(key)) await tx.objectStore('resources').delete(key);
        await tx.objectStore('state').put(valid, 'current');
      }
      await tx.done;
      onCommit();
      return valid;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* already aborted */
      }
      await tx.done.catch(() => {});
      throw error;
    }
  }

  return {
    read,
    update,
    async resource(key: string) {
      return session?.resources.get(key) ?? (await dbPromise).get('resources', key);
    },
    async protectPrivate(password: string) {
      const state = await read();
      if (state.privateSecurity.protected) throw new Error('私密空间已经设置密码');
      const resources = new Map<string, Blob>();
      const db = await dbPromise;
      for (const id of privateResourceIds(state)) {
        const blob = await db.get('resources', id);
        if (!blob) throw new Error('私密空间图片缺失，无法启用密码');
        resources.set(id, blob);
      }
      const payload: VaultSession = {
        space: state.spaces.private,
        overrides: state.privateSettingOverrides,
        resources,
      };
      const envelope = await encryptJson(await serializeSession(payload), password);
      const tx = db.transaction(['state', 'resources', 'vault'], 'readwrite');
      state.privateSecurity = { protected: true, locked: true };
      state.local.activeSpace = 'normal';
      await tx.objectStore('state').put(scrubPrivate(state), 'current');
      await tx.objectStore('vault').put(envelope, 'private');
      await removePrivateOnlyResources(state, tx.objectStore('resources'));
      await tx.done;
      session = null;
      sessionPassword = null;
      onCommit();
      return read();
    },
    async unlockPrivate(password: string) {
      const envelope = await (await dbPromise).get('vault', 'private');
      if (!envelope) throw new Error('私密空间没有加密数据');
      session = await deserializeSession(await decryptJson<VaultSerialized>(envelope, password));
      sessionPassword = password;
      const state = await read();
      onCommit();
      return state;
    },
    async lockPrivate() {
      session = null;
      sessionPassword = null;
      onCommit();
      return read();
    },
    async changePrivatePassword(currentPassword: string, nextPassword: string) {
      const db = await dbPromise;
      const envelope = await db.get('vault', 'private');
      if (!envelope) throw new Error('私密空间尚未设置密码');
      const payload = await decryptJson<VaultSerialized>(envelope, currentPassword);
      await db.put('vault', await encryptJson(payload, nextPassword), 'private');
      session = null;
      sessionPassword = null;
      onCommit();
    },
    async removePrivatePassword(password: string) {
      const db = await dbPromise;
      const envelope = await db.get('vault', 'private');
      if (!envelope) throw new Error('私密空间尚未设置密码');
      const payload = await deserializeSession(
        await decryptJson<VaultSerialized>(envelope, password),
      );
      const raw = await readRaw();
      raw.spaces.private = payload.space;
      raw.privateSettingOverrides = payload.overrides;
      raw.privateSecurity = { protected: false, locked: false };
      const tx = db.transaction(['state', 'resources', 'vault'], 'readwrite');
      for (const [id, blob] of payload.resources) await tx.objectStore('resources').put(blob, id);
      await tx.objectStore('state').put(rayStateSchema.parse(raw), 'current');
      await tx.objectStore('vault').delete('private');
      await tx.done;
      session = null;
      sessionPassword = null;
      onCommit();
      return read();
    },
    async snapshot() {
      const state = await read();
      if (state.privateSecurity.protected && state.privateSecurity.locked)
        throw new Error('请先解锁私密空间再生成包含私密空间的备份');
      const resources = new Map<string, Blob>();
      for (const key of resourceIds(state)) {
        const blob = await this.resource(key);
        if (!blob) throw new Error('本地图片缺失，无法生成完整备份');
        resources.set(key, blob);
      }
      return { state, resources };
    },
    async restore(state: RayState, assets: Map<string, Blob>) {
      const valid = rayStateSchema.parse(state);
      return update((draft) => {
        const revision = draft.revision;
        Object.assign(draft, valid, { revision });
      }, assets);
    },
    async close() {
      (await dbPromise).close();
    },
  };
}

function scrubPrivate(state: RayState) {
  const persisted = structuredClone(state);
  persisted.spaces.private = createLockedPrivateSpace();
  persisted.privateSettingOverrides = {};
  persisted.privateSecurity.locked = true;
  persisted.local.activeDesktop.private = persisted.spaces.private.desktops[0].id;
  persisted.local.selectedCategory.private = {};
  return rayStateSchema.parse(persisted);
}
function privateResourceIds(state: RayState) {
  const ids = new Set(
    state.spaces.private.sites.map((item) => item.iconId).filter((id): id is string => Boolean(id)),
  );
  const wallpaperId = state.privateSettingOverrides.wallpaperId;
  if (wallpaperId) ids.add(wallpaperId);
  return ids;
}
type ResourceStore = IDBPObjectStore<
  RayDatabase,
  ('state' | 'resources' | 'vault')[],
  'resources',
  'readwrite'
>;
async function validateResources(state: RayState, store: ResourceStore) {
  for (const key of resourceIds(state))
    if (!(await store.getKey(key))) throw new Error('图片资源缺失，未保存任何修改');
}
async function removePrivateOnlyResources(state: RayState, store: ResourceStore) {
  const normalIds = new Set(
    state.spaces.normal.sites.map((item) => item.iconId).filter((id): id is string => Boolean(id)),
  );
  if (state.normalSettings.wallpaperId) normalIds.add(state.normalSettings.wallpaperId);
  for (const id of privateResourceIds(state)) if (!normalIds.has(id)) await store.delete(id);
}
async function serializeSession(session: VaultSession): Promise<VaultSerialized> {
  const resources = [];
  for (const [id, blob] of session.resources)
    resources.push({
      id,
      type: blob.type || 'application/octet-stream',
      data: await blobToBase64(blob),
    });
  return { space: session.space, overrides: session.overrides, resources };
}
async function deserializeSession(value: VaultSerialized): Promise<VaultSession> {
  const space = spaceDataSchema.parse(value.space);
  const overrides = spaceSettingsSchema.partial().parse(value.overrides);
  const resources = new Map<string, Blob>();
  for (const item of value.resources)
    resources.set(item.id, new Blob([fromBase64(item.data)], { type: item.type }));
  return { space, overrides, resources };
}
async function blobToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
