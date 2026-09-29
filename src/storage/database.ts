import { upgradeLocalSpace, upgradeLocalState, upgradeSettings } from './upgrade-local';
import { openDB, type DBSchema, type IDBPObjectStore } from 'idb';
import { decryptJson, encryptJson, type EncryptedEnvelope } from '@/security/crypto';
import {
  createInitialState,
  createLockedPrivateSpace,
  rayStateSchema,
  resourceIds,
  type RayState,
  type SpaceId,
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
  let sessionGeneration = 0;
  const dbPromise = openDB<RayDatabase>(name, 2, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('state')) db.createObjectStore('state');
      if (!db.objectStoreNames.contains('resources')) db.createObjectStore('resources');
      if (!db.objectStoreNames.contains('vault')) db.createObjectStore('vault');
    },
  });

  type Stored = { state: RayState; envelope?: EncryptedEnvelope };
  let sessionEnvelope: string | undefined;

  async function readStored(): Promise<Stored> {
    const db = await dbPromise;
    const tx = db.transaction(['state', 'vault'], 'readwrite');
    let state = await tx.objectStore('state').get('current');
    if (!state) {
      state = createInitialState();
      await tx.objectStore('state').put(state, 'current');
    }
    const upgraded = upgradeLocalState(state);
    if (state.schemaVersion !== upgraded.schemaVersion)
      await tx.objectStore('state').put(upgraded, 'current');
    const envelope = await tx.objectStore('vault').get('private');
    await tx.done;
    return { state: upgraded, envelope };
  }
  function clearSession() {
    sessionGeneration++;
    session = null;
    sessionPassword = null;
    sessionEnvelope = undefined;
  }
  async function refreshSession(stored: Stored) {
    if (!stored.state.privateSecurity.protected || !stored.envelope) {
      clearSession();
      return;
    }
    if (!session || !sessionPassword || sessionEnvelope === stored.envelope.ciphertext) return;
    const previous = session;
    const password = sessionPassword;
    try {
      const next = await deserializeSession(
        await decryptJson<VaultSerialized>(stored.envelope, password),
      );
      if (session === previous) {
        session = next;
        sessionEnvelope = stored.envelope.ciphertext;
      }
    } catch {
      if (session === previous) clearSession();
    }
  }
  function materialize(raw: RayState) {
    const state = structuredClone(raw);
    if (state.privateSecurity.protected && session) {
      state.spaces.private = structuredClone(session.space);
      state.privateSettingOverrides = structuredClone(session.overrides);
      state.privateSecurity.locked = false;
      if (!state.spaces.private.groups.some((item) => item.id === state.local.activeGroup.private))
        state.local.activeGroup.private = state.spaces.private.groups[0].id;
    } else if (state.privateSecurity.protected) {
      state.local.activeSpace = 'normal';
    }
    return rayStateSchema.parse(state);
  }
  async function read() {
    const stored = await readStored();
    await refreshSession(stored);
    return materialize(stored.state);
  }
  async function persist(
    stored: Stored,
    state: RayState,
    assets: Map<string, Blob>,
    envelope = stored.envelope,
  ) {
    const db = await dbPromise;
    const tx = db.transaction(['state', 'resources', 'vault'], 'readwrite');
    try {
      const latest = await tx.objectStore('state').get('current');
      const latestEnvelope = await tx.objectStore('vault').get('private');
      if (
        latest?.revision !== stored.state.revision ||
        latestEnvelope?.ciphertext !== stored.envelope?.ciphertext
      )
        throw new Error('数据刚刚在另一个页面发生变化，请重试');
      for (const [key, blob] of assets) await tx.objectStore('resources').put(blob, key);
      const persisted = state.privateSecurity.protected ? scrubPrivate(state) : state;
      if (state.privateSecurity.protected) {
        if (envelope) await tx.objectStore('vault').put(envelope, 'private');
        await removePrivateOnlyResources(state, tx.objectStore('resources'));
      } else {
        await tx.objectStore('vault').delete('private');
        const ids = resourceIds(state);
        for (const key of await tx.objectStore('resources').getAllKeys())
          if (!ids.has(key)) await tx.objectStore('resources').delete(key);
      }
      await validateResources(persisted, tx.objectStore('resources'));
      await tx.objectStore('state').put(persisted, 'current');
      await tx.done;
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
  async function update(
    change: (draft: RayState) => void,
    assets: Map<string, Blob> = new Map(),
    expectedRevision?: number,
  ) {
    const db = await dbPromise;
    const stored = await readStored();
    if (expectedRevision !== undefined && stored.state.revision !== expectedRevision)
      throw new Error('操作期间本地数据发生变化，请重试');
    await refreshSession(stored);
    const raw = stored.state;
    const startingSession = session;
    const draft = materialize(raw);
    change(draft);
    draft.revision++;
    const valid = rayStateSchema.parse(draft);
    let envelope = stored.envelope;
    let nextSession: VaultSession | undefined;
    if (valid.privateSecurity.protected && session && sessionPassword) {
      const password = sessionPassword;
      nextSession = {
        space: structuredClone(valid.spaces.private),
        overrides: structuredClone(valid.privateSettingOverrides),
        resources: new Map(session.resources),
      };
      for (const [id, blob] of assets) nextSession.resources.set(id, blob);
      for (const id of privateResourceIds(valid)) {
        const blob = nextSession.resources.get(id) ?? (await db.get('resources', id));
        if (!blob) throw new Error('私密空间图片缺失，未保存任何修改');
        nextSession.resources.set(id, blob);
      }
      envelope = await encryptJson(await serializeSession(nextSession), password);
    } else if (
      valid.privateSecurity.protected &&
      (JSON.stringify(valid.spaces.private) !== JSON.stringify(raw.spaces.private) ||
        JSON.stringify(valid.privateSettingOverrides) !==
          JSON.stringify(raw.privateSettingOverrides))
    ) {
      throw new Error('请先解锁私密空间');
    }
    if (nextSession && session !== startingSession)
      throw new Error('私密空间状态已变化，请重新操作');
    await persist(stored, valid, assets, envelope);
    const sessionChanged = nextSession && session !== startingSession;
    if (nextSession && !sessionChanged) {
      session = nextSession;
      sessionEnvelope = envelope?.ciphertext;
    }
    onCommit();
    return sessionChanged ? read() : valid;
  }

  return {
    read,
    update,
    async resource(key: string) {
      return session?.resources.get(key) ?? (await dbPromise).get('resources', key);
    },
    async protectPrivate(password: string) {
      const stored = await readStored();
      const state = stored.state;
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
      const next = structuredClone(state);
      next.privateSecurity = { protected: true, locked: true };
      next.local.activeSpace = 'normal';
      next.revision++;
      await persist(stored, next, new Map(), envelope);
      clearSession();
      onCommit();
      return read();
    },
    async unlockPrivate(password: string) {
      const generation = ++sessionGeneration;
      const { envelope } = await readStored();
      if (!envelope) throw new Error('私密空间没有加密数据');
      const unlocked = await deserializeSession(
        await decryptJson<VaultSerialized>(envelope, password),
      );
      if (generation !== sessionGeneration) throw new Error('私密空间状态已变化，请重新操作');
      session = unlocked;
      sessionPassword = password;
      sessionEnvelope = envelope.ciphertext;
      const state = await read();
      onCommit();
      return state;
    },
    async lockPrivate() {
      clearSession();
      onCommit();
      return read();
    },
    async changePrivatePassword(currentPassword: string, nextPassword: string) {
      const stored = await readStored();
      if (!stored.envelope) throw new Error('私密空间尚未设置密码');
      const payload = await decryptJson<VaultSerialized>(stored.envelope, currentPassword);
      const envelope = await encryptJson(payload, nextPassword);
      const next = { ...stored.state, revision: stored.state.revision + 1 };
      await persist(stored, next, new Map(), envelope);
      clearSession();
      onCommit();
    },
    async removePrivatePassword(password: string) {
      const stored = await readStored();
      if (!stored.envelope) throw new Error('私密空间尚未设置密码');
      const payload = await deserializeSession(
        await decryptJson<VaultSerialized>(stored.envelope, password),
      );
      const next = structuredClone(stored.state);
      next.spaces.private = payload.space;
      next.privateSettingOverrides = payload.overrides;
      next.privateSecurity = { protected: false, locked: false };
      next.local.activeGroup.private = payload.space.groups[0].id;
      next.revision++;
      await persist(stored, rayStateSchema.parse(next), payload.resources);
      clearSession();
      onCommit();
      return read();
    },
    async snapshot(range: SpaceId | 'all' = 'all') {
      const state = await read();
      if (range !== 'normal' && state.privateSecurity.protected && state.privateSecurity.locked)
        throw new Error('请先解锁私密空间再生成包含私密空间的备份');
      const resources = new Map<string, Blob>();
      const ids = new Set<string>();
      for (const spaceId of ['normal', 'private'] as const) {
        if (range !== 'all' && range !== spaceId) continue;
        for (const site of state.spaces[spaceId].sites) if (site.iconId) ids.add(site.iconId);
        const wallpaperId =
          spaceId === 'normal'
            ? state.normalSettings.wallpaperId
            : (state.privateSettingOverrides.wallpaperId ?? state.normalSettings.wallpaperId);
        if (wallpaperId) ids.add(wallpaperId);
      }
      for (const key of ids) {
        const blob = await this.resource(key);
        if (!blob) throw new Error('本地图片缺失，无法生成完整备份');
        resources.set(key, blob);
      }
      return { state, resources };
    },
    async restore(
      state: RayState,
      assets: Map<string, Blob>,
      {
        expectedRevision,
        range = 'all',
      }: { expectedRevision?: number; range?: SpaceId | 'all' } = {},
    ) {
      const valid = rayStateSchema.parse(state);
      return update(
        (draft) => {
          if (range !== 'normal' && draft.privateSecurity.protected && draft.privateSecurity.locked)
            throw new Error('请先解锁私密空间');
          for (const spaceId of ['normal', 'private'] as const) {
            if (range !== 'all' && range !== spaceId) continue;
            draft.spaces[spaceId] = valid.spaces[spaceId];
            draft.local.activeGroup[spaceId] = valid.local.activeGroup[spaceId];
            draft.local.selectedFolder[spaceId] = valid.local.selectedFolder[spaceId];
          }
          if (range !== 'private') draft.normalSettings = valid.normalSettings;
          if (range !== 'normal') draft.privateSettingOverrides = valid.privateSettingOverrides;
        },
        assets,
        expectedRevision,
      );
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
  persisted.local.activeGroup.private = persisted.spaces.private.groups[0].id;
  persisted.local.selectedFolder.private = {};
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
  const space = upgradeLocalSpace(value.space);
  const overrides = rayStateSchema.shape.privateSettingOverrides.parse(
    upgradeSettings(value.overrides),
  );
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
