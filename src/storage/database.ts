import { AppError } from '@/lib/errors';
import { z } from 'zod';
import {
  hasRetiredAppearanceSettings,
  hasRetiredIconDisplay,
  upgradeLocalSpace,
  upgradeLocalState,
  upgradeSettings,
} from './upgrade-local';
import { type IDBPObjectStore } from 'idb';
import { openRayDatabase, RAY_DATABASE_NAME, type RayDatabase } from './connection';
import { decryptJson, encryptJson, type EncryptedEnvelope } from '@/security/crypto';
import {
  createInitialState,
  createLockedPrivateSpace,
  rayStateSchema,
  resourceIds,
  spaceResourceIds,
  spaceDataSchema,
  effectiveSettings,
  type RayState,
  type SpaceId,
} from './model';

type VaultSerialized = {
  schemaVersion: 5;
  space: RayState['spaces']['private'];
  overrides: RayState['privateSettingOverrides'];
  resources: { id: string; type: string; data: string }[];
};
type VaultSession = Omit<VaultSerialized, 'resources' | 'schemaVersion'> & {
  resources: Map<string, Blob>;
};

export function createRepository(name = RAY_DATABASE_NAME, onCommit = () => {}) {
  let session: VaultSession | null = null;
  let sessionPassword: string | null = null;
  let sessionGeneration = 0;
  const dbPromise = openRayDatabase(name);

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
    if (state.schemaVersion !== upgraded.schemaVersion || state.revision !== upgraded.revision)
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
      const next = await deserializeSession(await decryptJson<unknown>(stored.envelope, password));
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
        throw new AppError('messages.dataChangedInAnotherPageTryAgain');
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
      throw new AppError('messages.localDataChangedDuringThisOperationTryAgain');
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
        resources: new Map(),
      };
      for (const id of privateResourceIds(valid)) {
        const blob = assets.get(id) ?? session.resources.get(id) ?? (await db.get('resources', id));
        if (!blob) throw new AppError('messages.aPrivateSpaceImageIsMissingNoChangesWereSaved');
        nextSession.resources.set(id, blob);
      }
      envelope = await encryptJson(await serializeSession(nextSession), password);
    } else if (
      valid.privateSecurity.protected &&
      (JSON.stringify(valid.spaces.private) !== JSON.stringify(raw.spaces.private) ||
        JSON.stringify(valid.privateSettingOverrides) !==
          JSON.stringify(raw.privateSettingOverrides))
    ) {
      throw new AppError('messages.unlockThePrivateSpaceFirst');
    }
    if (nextSession && session !== startingSession)
      throw new AppError('messages.thePrivateSpaceStateChangedTryAgain');
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
      if (state.privateSecurity.protected)
        throw new AppError('messages.thePrivateSpaceAlreadyHasAPassword');
      const resources = new Map<string, Blob>();
      const db = await dbPromise;
      for (const id of privateResourceIds(state)) {
        const blob = await db.get('resources', id);
        if (!blob)
          throw new AppError(
            'messages.aPrivateSpaceImageIsMissingSoPasswordProtectionCannotBeEnabled',
          );
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
      const stored = await readStored();
      let { envelope } = stored;
      if (!envelope) throw new AppError('messages.thePrivateSpaceHasNoEncryptedData');
      const plaintext = await decryptJson<unknown>(envelope, password);
      const unlocked = await deserializeSession(plaintext);
      if (
        typeof plaintext === 'object' &&
        plaintext !== null &&
        (!('schemaVersion' in plaintext) ||
          ('overrides' in plaintext && hasRetiredAppearanceSettings(plaintext.overrides)) ||
          ('space' in plaintext && hasRetiredIconDisplay(plaintext.space)))
      ) {
        envelope = await encryptJson(await serializeSession(unlocked), password);
        if (generation !== sessionGeneration)
          throw new AppError('messages.thePrivateSpaceStateChangedTryAgain');
        await persist(
          stored,
          { ...stored.state, revision: stored.state.revision + 1 },
          new Map(),
          envelope,
        );
      }
      if (generation !== sessionGeneration)
        throw new AppError('messages.thePrivateSpaceStateChangedTryAgain');
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
      if (!stored.envelope) throw new AppError('messages.thePrivateSpaceDoesNotHaveAPassword');
      const payload = await deserializeSession(
        await decryptJson<unknown>(stored.envelope, currentPassword),
      );
      const envelope = await encryptJson(await serializeSession(payload), nextPassword);
      const next = { ...stored.state, revision: stored.state.revision + 1 };
      await persist(stored, next, new Map(), envelope);
      clearSession();
      onCommit();
    },
    async removePrivatePassword(password: string) {
      const stored = await readStored();
      if (!stored.envelope) throw new AppError('messages.thePrivateSpaceDoesNotHaveAPassword');
      const payload = await deserializeSession(
        await decryptJson<unknown>(stored.envelope, password),
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
        throw new AppError('messages.unlockThePrivateSpaceBeforeCreatingABackupThatIncludesIt');
      const resources = new Map<string, Blob>();
      const ids = new Set<string>();
      for (const spaceId of ['normal', 'private'] as const) {
        if (range !== 'all' && range !== spaceId) continue;
        for (const id of spaceResourceIds(state.spaces[spaceId], effectiveSettings(state, spaceId)))
          ids.add(id);
      }
      for (const key of ids) {
        const blob = await this.resource(key);
        if (!blob)
          throw new AppError('messages.aLocalImageIsMissingSoACompleteBackupCannotBeCreated');
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
            throw new AppError('messages.unlockThePrivateSpaceFirst');
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
  return spaceResourceIds(state.spaces.private, state.privateSettingOverrides);
}
type ResourceStore = IDBPObjectStore<
  RayDatabase,
  ('state' | 'resources' | 'vault')[],
  'resources',
  'readwrite'
>;
async function validateResources(state: RayState, store: ResourceStore) {
  for (const key of resourceIds(state))
    if (!(await store.getKey(key)))
      throw new AppError('messages.anImageResourceIsMissingNoChangesWereSaved');
}
async function removePrivateOnlyResources(state: RayState, store: ResourceStore) {
  const normalIds = spaceResourceIds(state.spaces.normal, state.normalSettings);
  for (const id of await store.getAllKeys()) if (!normalIds.has(id)) await store.delete(id);
}
async function serializeSession(session: VaultSession): Promise<VaultSerialized> {
  const resources = [];
  for (const [id, blob] of session.resources)
    resources.push({
      id,
      type: blob.type || 'application/octet-stream',
      data: await blobToBase64(blob),
    });
  return { schemaVersion: 5, space: session.space, overrides: session.overrides, resources };
}
async function deserializeSession(value: unknown): Promise<VaultSession> {
  const payload = z
    .object({
      schemaVersion: z.literal(5).optional(),
      space: z.unknown(),
      overrides: z.unknown(),
      resources: z.array(z.object({ id: z.string().min(1), type: z.string(), data: z.string() })),
    })
    .parse(value);
  const space =
    payload.schemaVersion === 5
      ? spaceDataSchema.parse(payload.space)
      : upgradeLocalSpace(payload.space);
  const overrides = rayStateSchema.shape.privateSettingOverrides.parse(
    payload.schemaVersion === 5 ? payload.overrides : upgradeSettings(payload.overrides),
  );
  const ids = spaceResourceIds(space, overrides);
  const resources = new Map<string, Blob>();
  for (const item of payload.resources)
    if (ids.has(item.id))
      resources.set(item.id, new Blob([fromBase64(item.data)], { type: item.type }));
  for (const id of ids)
    if (!resources.has(id))
      throw new AppError('messages.aPrivateSpaceImageIsMissingNoChangesWereSaved');
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
