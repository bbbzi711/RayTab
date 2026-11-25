import { AppError, serializeError, type StoredError } from '@/lib/errors';
import { z } from '@/lib/zod';
import {
  backupSchema,
  encodeBackup,
  ordinaryRevisions,
  protectPayload,
  createBackup,
  parseBackup,
  restoreBackup,
  type BackupDocument,
  decodeResources,
  privateBackupPayload,
} from '@/features/backup/backup';
import { repository } from '@/storage/repository';
import {
  groupSchema,
  type RayState,
  folderSchema,
  siteSchema,
  siteIconSchema,
  siteIconBackgroundSchema,
  spaceSettingsSchema,
  spaceResourceIds,
} from '@/storage/model';
import { upgradeSettings, upgradeV4Site } from '@/storage/upgrade-local';
import { applyCommand } from '@/storage/operations';
import type { ContainerRecovery } from '@/storage/merge-containers';
import {
  mergeSpaceData,
  reconcileMergeConflicts,
  createSyncConflict,
  syncConflictSchema,
  type SyncConflict,
} from './merge';
import {
  assertUnchangedPlainCopies,
  digest,
  redactBaseline,
  difference,
  recordIds,
  redactionsSchema,
  type ProtectionSelection,
} from './privacy-boundary';
import { createProvider, type SyncConnection } from '../providers';
import { resolveWebDavFileUrl } from '../providers/webdav';
import { SyncProviderError, syncConnectionSchema } from '../providers/types';

const storedSyncConfigSchema = z.object({
  connection: syncConnectionSchema,
  includePrivate: z.boolean(),
  automatic: z.boolean(),
});
const syncPasswordSchema = z.string().optional();
export type SyncConfig = z.infer<typeof storedSyncConfigSchema> & { privatePassword?: string };
export type SyncStatus = {
  schemaVersion: 1;
  /** Older versions paused the entire schedule while groups were protected. */
  automaticPaused?: never;
  recovery?: ContainerRecovery;
  lastSuccess?: string;
  lastError?: StoredError | string;
  conflicts: SyncConflict[];
  retryCount?: number;
  nextRetryAt?: string;
};
const CONFIG_KEY = 'raytab-sync-config';
const BASELINE_KEY = 'raytab-sync-baseline';
const STATUS_KEY = 'raytab-sync-status';
const SECRET_KEY = 'raytab-sync-private-password';
const SYNC_LOCK = 'raytab-sync';
const storedErrorSchema = z.object({
  code: z.string(),
  values: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  detail: z.string().optional(),
});
const legacyConflictSchema = syncConflictSchema.omit({ key: true });
const statusFields = {
  recovery: z
    .object({
      groupId: z.string().min(1),
      sites: z.number().int().nonnegative(),
      folders: z.number().int().nonnegative(),
      createdGroup: z.boolean(),
    })
    .optional(),
  lastSuccess: z.string().optional(),
  lastError: z.union([storedErrorSchema, z.string()]).optional(),
  retryCount: z.number().int().nonnegative().optional(),
  nextRetryAt: z.string().optional(),
};
const syncStatusSchema = z.object({
  schemaVersion: z.literal(1),
  ...statusFields,
  conflicts: z.array(syncConflictSchema),
});

export class SyncBusyError extends AppError {
  constructor() {
    super('messages.anotherPageIsSyncingTryAgainShortly');
    this.name = 'SyncBusyError';
  }
}

export class InvalidSyncConfigError extends AppError {
  constructor() {
    super('errors.invalidInput');
    this.name = 'InvalidSyncConfigError';
  }
}

async function readStoredSyncConfig() {
  const raw: unknown = (await browser.storage.local.get(CONFIG_KEY))[CONFIG_KEY];
  return storedSyncConfigSchema.optional().safeParse(raw);
}

async function readStoredSyncPassword(): Promise<unknown> {
  return (await browser.storage.session.get(SECRET_KEY))[SECRET_KEY];
}

export async function saveSyncConfig(config: SyncConfig) {
  return withSyncLock(async () => {
    const [previous, previousPassword] = await Promise.all([
      readStoredSyncConfig(),
      readStoredSyncPassword(),
    ]);
    const nextTarget = syncTarget(config.connection);
    let previousTarget: string | undefined;
    try {
      if (previous.success && previous.data) previousTarget = syncTarget(previous.data.connection);
    } catch (reason) {
      // An invalid saved address must remain replaceable with a valid connection.
      if (!(reason instanceof SyncProviderError && reason.code === 'invalid')) throw reason;
    }
    const changedTarget = previousTarget !== nextTarget;
    const baseline = changedTarget
      ? (await browser.storage.local.get(BASELINE_KEY))[BASELINE_KEY]
      : undefined;
    const { privatePassword, ...persisted } = config;
    if (privatePassword) await browser.storage.session.set({ [SECRET_KEY]: privatePassword });
    else await browser.storage.session.remove(SECRET_KEY);
    try {
      await browser.storage.local.set({
        [CONFIG_KEY]: persisted,
        ...(changedTarget && {
          ...(baseline === undefined ? {} : { [BASELINE_KEY]: null }),
          [STATUS_KEY]: { schemaVersion: 1, conflicts: [] } satisfies SyncStatus,
        }),
      });
    } catch (reason) {
      try {
        if (previousPassword !== undefined)
          await browser.storage.session.set({ [SECRET_KEY]: previousPassword });
        else await browser.storage.session.remove(SECRET_KEY);
      } catch (rollbackReason) {
        throw new AggregateError(
          [reason, rollbackReason],
          'errors.sync.connectionSaveRollbackFailed',
        );
      }
      throw reason;
    }
  });
}

export function syncTarget(connection: SyncConnection) {
  if (connection.type === 'webdav') {
    return JSON.stringify([
      connection.type,
      resolveWebDavFileUrl(connection.url),
      connection.username,
    ]);
  }
  return JSON.stringify([
    connection.type,
    connection.owner,
    connection.repo,
    connection.path,
    connection.branch ?? '',
  ]);
}
export async function loadSyncConfig(): Promise<SyncConfig | undefined> {
  const config = await readStoredSyncConfig();
  if (!config.success) throw new InvalidSyncConfigError();
  if (!config.data) return undefined;
  const privatePassword = syncPasswordSchema.safeParse(await readStoredSyncPassword());
  if (!privatePassword.success) throw new InvalidSyncConfigError();
  return { ...config.data, privatePassword: privatePassword.data };
}
export async function setAutomaticSync(automatic: boolean) {
  return withSyncLock(async () => {
    const stored = await readStoredSyncConfig();
    if (!stored.success) throw new InvalidSyncConfigError();
    if (!stored.data) throw new AppError('messages.saveASyncConnectionFirst');
    await browser.storage.local.set({ [CONFIG_KEY]: { ...stored.data, automatic } });
  });
}
export async function clearSyncConfig() {
  return withSyncLock(async () => {
    await browser.storage.local.remove([CONFIG_KEY, BASELINE_KEY, STATUS_KEY]);
    await browser.storage.session.remove(SECRET_KEY);
  });
}
export async function loadSyncStatus(): Promise<SyncStatus> {
  return upgradeSyncStatus((await browser.storage.local.get(STATUS_KEY))[STATUS_KEY]);
}

function upgradeSyncStatus(value: unknown): SyncStatus {
  if (value === undefined) return { schemaVersion: 1, conflicts: [] };
  const legacy =
    typeof value === 'object' && value !== null && 'schemaVersion' in value
      ? syncStatusSchema.parse(value)
      : z.object({ ...statusFields, conflicts: z.array(legacyConflictSchema) }).parse(value);
  return {
    ...legacy,
    schemaVersion: 1,
    conflicts: legacy.conflicts.map((conflict) => {
      if (protectedConflict(conflict)) return createSyncConflict(conflict);
      if (conflict.id === 'private-space')
        return createSyncConflict({ ...conflict, local: 'local', remote: 'remote' });
      if (conflict.id === 'settings') {
        const upgrade = (settings: unknown) =>
          spaceSettingsSchema.parse(upgradeSettings(settings, true));
        return createSyncConflict({
          ...conflict,
          local: upgrade(conflict.local),
          remote: upgrade(conflict.remote),
        });
      }
      if (conflict.entity === 'site' && conflict.field === 'iconId') {
        const upgrade = (id: unknown) =>
          siteIconSchema.parse(id ? { source: 'resource', resourceId: id } : { source: 'auto' });
        return createSyncConflict({
          ...conflict,
          field: 'icon',
          local: upgrade(conflict.local),
          remote: upgrade(conflict.remote),
        });
      }
      if (conflict.entity === 'site' && conflict.field === 'color') {
        const upgrade = (color: unknown) =>
          siteIconBackgroundSchema.parse({ mode: 'color', color });
        return createSyncConflict({
          ...conflict,
          field: 'iconBackground',
          local: upgrade(conflict.local),
          remote: upgrade(conflict.remote),
        });
      }
      if (conflict.entity === 'site' && conflict.field === 'icon')
        return createSyncConflict({
          ...conflict,
          local: siteIconSchema.parse(conflict.local),
          remote: siteIconSchema.parse(conflict.remote),
        });
      if (conflict.entity === 'site' && conflict.field === '*') {
        const upgrade = (site: unknown) => {
          const current = siteSchema.safeParse(site);
          return current.success ? current.data : upgradeV4Site(site);
        };
        return createSyncConflict({
          ...conflict,
          local: upgrade(conflict.local),
          remote: upgrade(conflict.remote),
        });
      }
      return createSyncConflict(conflict);
    }),
  };
}

async function loadBaseline() {
  const raw = (await browser.storage.local.get(BASELINE_KEY))[BASELINE_KEY];
  if (raw == null) return undefined;
  const { document, schemaVersion, privateAncestor, ...metadata } = z
    .object({
      schemaVersion: z.literal(1).optional(),
      document: z.unknown(),
      version: z.string().nullable(),
      redactions: redactionsSchema.optional(),
      privateAncestor: backupSchema.shape.spaces.shape.private,
    })
    .parse(raw);
  const decoded = await parseBackup(document);
  // Older clients also cached encrypted sections they merely forwarded. Without
  // proof of a common ancestor, a missing local record cannot imply deletion.
  if (!schemaVersion) delete decoded.spaces.private;
  else if (privateAncestor) decoded.spaces.private = privateAncestor;
  return { ...metadata, document: decoded };
}

type SyncBaseline = NonNullable<Awaited<ReturnType<typeof loadBaseline>>>;

function encodeBaseline({ document, ...metadata }: SyncBaseline) {
  if (!document.spaces.normal && !document.spaces.private) return null;
  // The two ancestors can come from different revisions and can overlap after
  // a protection change. Keep them separate from the portable file format.
  const hasNormal = Boolean(document.spaces.normal);
  return {
    schemaVersion: 1,
    ...metadata,
    document: encodeBackup(hasNormal ? normalOnly(document) : document),
    ...(hasNormal && document.spaces.private && { privateAncestor: document.spaces.private }),
  };
}

async function upgradeSyncMetadata() {
  const values: Record<string, unknown> = {};
  const baseline = (await browser.storage.local.get(BASELINE_KEY))[BASELINE_KEY];
  if (typeof baseline === 'object' && baseline !== null && 'document' in baseline) {
    const normalized = await loadBaseline();
    if (normalized) {
      const encoded = encodeBaseline(normalized);
      if (JSON.stringify(encoded) !== JSON.stringify(baseline)) values[BASELINE_KEY] = encoded;
    }
  }
  const status = (await browser.storage.local.get(STATUS_KEY))[STATUS_KEY];
  if (status !== undefined) {
    const normalized = upgradeSyncStatus(status);
    if (JSON.stringify(normalized) !== JSON.stringify(status)) values[STATUS_KEY] = normalized;
  }
  if (Object.keys(values).length) await browser.storage.local.set(values);
}

function retainConflictResources(
  document: BackupDocument,
  conflicts: SyncConflict[],
  baseline?: BackupDocument,
) {
  const normal = document.spaces.normal;
  if (!normal) return;
  const ids = spaceResourceIds(normal.data, normal.settings);
  for (const conflict of conflicts) {
    if (protectedConflict(conflict)) continue;
    for (const value of [conflict.local, conflict.remote]) {
      if (conflict.id === 'settings') {
        const settings = spaceSettingsSchema.parse(value);
        if (settings.wallpaperId) ids.add(settings.wallpaperId);
      } else if (conflict.entity === 'site' && conflict.field === 'icon') {
        const icon = siteIconSchema.parse(value);
        if ('resourceId' in icon && icon.resourceId) ids.add(icon.resourceId);
      } else if (conflict.entity === 'site' && conflict.field === '*') {
        const site = siteSchema.parse(value);
        if ('resourceId' in site.icon && site.icon.resourceId) ids.add(site.icon.resourceId);
      }
    }
  }
  const resources = new Map(
    [...(baseline?.spaces.normal?.resources ?? []), ...normal.resources].map((resource) => [
      resource.id,
      resource,
    ]),
  );
  normal.resources = [...ids].map((id) => {
    const resource = resources.get(id);
    if (!resource) throw new AppError('errors.backup.missingResource', { id });
    return resource;
  });
}

export async function withGroupProtectionSyncGuard<T>(
  selection: ProtectionSelection | ProtectionSelection[],
  protect: () => Promise<T>,
): Promise<T> {
  if (typeof browser === 'undefined' || !browser.storage?.local) return protect();
  return withSyncLock(async () => {
    const state = await repository.read();
    const original = await redactSyncCache(selection, state);
    // If the page exits during protection, the retained fingerprints are enough
    // to recognize common ancestors without writing private plaintext back.
    try {
      return await protect();
    } catch (reason) {
      if (original && (await repository.read()).revision === state.revision)
        await browser.storage.local.set({
          [BASELINE_KEY]: encodeBaseline(original),
        });
      throw reason;
    }
  });
}

async function redactSyncCache(
  selection: ProtectionSelection | ProtectionSelection[],
  state: RayState,
) {
  const baseline = await loadBaseline();
  const status = await loadSyncStatus();
  const original = baseline && structuredClone(baseline);
  const removed = await redactBaseline(
    selection,
    state.spaces.normal,
    status.conflicts,
    baseline?.document.spaces.normal?.data,
  );
  if (!baseline) return undefined;
  const legacy = baseline.document.spaces.private;
  const removedLegacy =
    legacy && !legacy.protected
      ? await redactBaseline(selection, state.spaces.normal, status.conflicts, legacy.payload.data)
      : [];
  if (!removed.length && !removedLegacy.length) return undefined;
  // A legacy unencrypted section can still contain ordinary groups waiting
  // for migration. Its copies and resources also leave the cache on protection.
  if (removedLegacy.length) delete baseline.document.spaces.private;
  retainConflictResources(baseline.document, status.conflicts);
  await browser.storage.local.set({
    [BASELINE_KEY]: encodeBaseline({
      ...baseline,
      redactions: [...(baseline.redactions ?? []), ...removed],
    }),
  });
  return original;
}
async function redactRestoredProtection(
  current: RayState,
  result: Awaited<ReturnType<typeof restoreBackup>>,
) {
  if (!result.preserveGroupEncryption) return;
  const next = result.state.spaces.private;
  const ordinary = recordIds(current.spaces.normal);
  const selection: ProtectionSelection[] = next.groups
    .filter((item) => ordinary.groups.has(item.id))
    .map((item) => ({ groupId: item.id }));
  selection.push(
    ...next.folders
      .filter((item) => ordinary.children.has(item.id))
      .map((item) => ({ folderId: item.id })),
  );
  const sites = next.sites.filter((item) => ordinary.children.has(item.id)).map((item) => item.id);
  if (sites.length) selection.push({ siteIds: sites });
  if (selection.length) await redactSyncCache(selection, current);
}

export async function synchronize(
  mode: 'auto' | 'push' | 'pull' = 'auto',
  expected?: { target: string; includePrivate: boolean },
) {
  return withSyncLock(async () => {
    const config = expected ? await loadSyncConfig() : undefined;
    if (
      expected &&
      (!config ||
        syncTarget(config.connection) !== expected.target ||
        config.includePrivate !== expected.includePrivate)
    )
      throw new AppError('messages.dataChangedInAnotherPageTryAgain');
    await upgradeSyncMetadata();
    return synchronizeUnlocked(mode, undefined, config);
  });
}

export async function synchronizeAutomatically({
  afterUnlock = false,
  requestUnlockedPage,
}: { afterUnlock?: boolean; requestUnlockedPage?: () => Promise<boolean> } = {}) {
  // An unlocked page owns its vault session and needs to take this lock itself.
  if (requestUnlockedPage) {
    const config = await loadSyncConfig();
    if (
      config?.automatic &&
      config.includePrivate &&
      config.privatePassword &&
      (await requestUnlockedPage())
    )
      return;
  }
  return withSyncLock(async () => {
    const config = await loadSyncConfig();
    if (!config?.automatic) return;
    const status = await loadSyncStatus();
    if (status.nextRetryAt && Date.parse(status.nextRetryAt) > Date.now()) return;
    const includePrivate = Boolean(
      config.includePrivate &&
      config.privatePassword &&
      !(await repository.read()).privateSecurity.locked,
    );
    if (afterUnlock && !includePrivate) return;
    await upgradeSyncMetadata();
    return synchronizeUnlocked('auto', undefined, { ...config, includePrivate });
  });
}

type Decision = { conflict: SyncConflict; choice: 'local' | 'remote' };
const protectedConflict = (conflict: Pick<SyncConflict, 'field'>) =>
  conflict.field === 'protected-group' || conflict.field === 'protected-settings';

async function synchronizeUnlocked(
  mode: 'auto' | 'push' | 'pull',
  decision?: Decision,
  config?: SyncConfig,
) {
  try {
    config ??= await loadSyncConfig();
    if (!config) throw new AppError('messages.saveASyncConnectionFirst');
    if (decision && !config.includePrivate) throw new AppError('errors.sync.conflictChanged');
    const provider = createProvider(config.connection);
    const range = config.includePrivate ? 'all' : 'normal';
    const snapshot = await repository.snapshot(range);
    if (
      config.includePrivate &&
      snapshot.state.privateSecurity.protected &&
      !config.privatePassword
    )
      throw new AppError(
        'messages.enterASyncEncryptionPasswordBeforeSyncingTheProtectedPrivateSpace',
      );
    const local = await createBackup(
      snapshot.state,
      snapshot.resources,
      range,
      config.privatePassword,
    );
    const remoteFile = await provider.read();
    if (!remoteFile && mode === 'pull')
      throw new AppError('messages.thereIsNoRemoteBackupToRestore');
    const remote = remoteFile ? await parseBackup(remoteFile.content) : undefined;
    const saved = await loadBaseline();
    const baseline = saved?.document;
    if (remote && mode === 'auto') {
      const secured = (doc: BackupDocument) =>
        doc.spaces.private?.protected ? (doc.spaces.private.groups ?? []) : [];

      const ids = (entries: ReturnType<typeof secured>) => ({
        groups: new Set(entries.map((entry) => entry.id)),
        children: new Set(entries.flatMap((entry) => [...entry.siteIds, ...entry.folderIds])),
      });
      const localIndex = ids(secured(local));
      for (const group of snapshot.state.encryptedGroupIndex?.labels ?? [])
        localIndex.groups.add(group.id);
      for (const id of [
        ...(snapshot.state.encryptedGroupIndex?.siteIds ?? []),
        ...(snapshot.state.encryptedGroupIndex?.folderIds ?? []),
      ])
        localIndex.children.add(id);
      // Removing protection is an authenticated full-range operation. Its
      // originating side explicitly removes the group from the sealed section.
      const opened = (doc: BackupDocument) => {
        return config?.includePrivate && doc.spaces.private && baseline
          ? difference(ids(secured(baseline)), ids(secured(doc)))
          : recordIds();
      };
      await assertUnchangedPlainCopies(
        remote.spaces.normal?.data,
        localIndex,
        baseline?.spaces.normal?.data,
        saved?.redactions,
        opened(remote),
      );
      await assertUnchangedPlainCopies(
        local.spaces.normal?.data,
        ids(secured(remote)),
        baseline?.spaces.normal?.data,
        saved?.redactions,
        opened(local),
      );
    }
    if (mode === 'push' || !remote) {
      const document = structuredClone(local);
      if (!config.includePrivate && remote?.spaces.private)
        document.spaces.private = remote.spaces.private;
      await assertLocalRevision(snapshot.state.revision);
      const version = await provider.write(
        JSON.stringify(encodeBackup(document)),
        remoteFile?.version ?? null,
      );
      await assertLocalRevision(snapshot.state.revision);
      const conflicts = await saveSuccess(document, version, range);
      return { document, conflicts };
    }
    if (!config.includePrivate && !remote.spaces.normal)
      throw new AppError('messages.theRemoteBackupDoesNotContainThePersonalSpace');
    if (mode === 'pull') {
      const restored = await restoreBackup(
        snapshot.state,
        config.includePrivate ? remote : normalOnly(remote),
        'replace',
        config.privatePassword,
      );
      await redactRestoredProtection(snapshot.state, restored);
      await repository.restore(restored.state, restored.resources, {
        expectedRevision: snapshot.state.revision,
        range: restored.range,
        ...(restored.preserveGroupEncryption ? { protectWith: config.privatePassword } : {}),
      });
      const conflicts = await saveSuccess(remote, remoteFile?.version ?? null, restored.range);
      return { document: remote, conflicts };
    }
    const previousStatus = await loadSyncStatus();
    const previousConflicts = previousStatus.conflicts;
    const ordinaryConflicts = previousConflicts.filter(
      (item) => item.id !== 'private-space' && !protectedConflict(item),
    );
    const pending = new Map<string, SyncConflict>();
    const remoteRevision = remoteFile?.version ?? (await digest(remoteFile!.content));
    const choose = (id: string, field: string): 'local' | 'remote' | undefined => {
      const item = createSyncConflict({
        entity: 'group',
        id,
        field,
        local: snapshot.state.revision,
        remote: remoteRevision,
      });
      const previous = previousConflicts.find(
        (entry) =>
          entry.key === item.key && entry.local === item.local && entry.remote === item.remote,
      );
      const choice =
        previous && (decision?.conflict.key === previous.key ? decision.choice : previous.choice);
      pending.set(item.key, choice ? { ...item, choice } : item);
      return choice;
    };
    const {
      document,
      conflicts: incomingConflicts,
      recovery: mergedRecovery,
      releasedBySync,
    } = await mergeDocuments(baseline, local, remote, config.privatePassword, choose);
    const outstanding = [...pending.values()];
    if (
      decision &&
      !outstanding.some(
        (item) => item.key === decision.conflict.key && item.choice === decision.choice,
      )
    )
      throw new AppError('errors.sync.conflictChanged');
    if (outstanding.some((item) => !item.choice)) {
      const conflicts = [...ordinaryConflicts, ...outstanding];
      await browser.storage.local.set({
        [STATUS_KEY]: { ...previousStatus, conflicts } satisfies SyncStatus,
      });
      if (!decision) throw new AppError('errors.sync.protectedGroupConflict');
      return { document, conflicts };
    }
    let conflicts = [
      ...new Map(
        [...ordinaryConflicts, ...incomingConflicts].map((conflict) => [conflict.key, conflict]),
      ).values(),
    ];
    let recovery = mergedRecovery;
    if (document.spaces.normal) {
      const reconciled = reconcileMergeConflicts(document.spaces.normal.data, conflicts);
      document.spaces.normal.data = reconciled.data;
      conflicts = reconciled.conflicts;
      recovery ??= reconciled.recovery;
    }
    retainConflictResources(document, conflicts, baseline);
    const restored = await restoreBackup(
      snapshot.state,
      config.includePrivate ? document : normalOnly(document),
      'replace',
      config.privatePassword,
      releasedBySync,
    );
    await redactRestoredProtection(snapshot.state, restored);
    await assertLocalRevision(snapshot.state.revision);
    const version = await provider.write(
      JSON.stringify(encodeBackup(document)),
      remoteFile?.version ?? null,
    );
    await repository.restore(restored.state, restored.resources, {
      expectedRevision: snapshot.state.revision,
      range: restored.range,
      ...(restored.preserveGroupEncryption ? { protectWith: config.privatePassword } : {}),
    });
    conflicts = await saveSuccess(document, version, restored.range, conflicts, recovery);
    return { document, conflicts, recovery };
  } catch (error) {
    const previous = await loadSyncStatus();
    const retryCount = Math.min((previous.retryCount ?? 0) + 1, 8);
    await browser.storage.local.set({
      [STATUS_KEY]: {
        ...previous,
        lastError: serializeSyncFailure(error, config),
        retryCount,
        nextRetryAt: new Date(Date.now() + Math.min(2 ** retryCount, 60) * 60_000).toISOString(),
      } satisfies SyncStatus,
    });
    throw error;
  }
}

function serializeSyncFailure(error: unknown, config?: SyncConfig): StoredError {
  // External diagnostics can include response bodies or credentials. Persist
  // only controlled business errors and validation keys, never arbitrary detail.
  if (!(error instanceof AppError) && !(error instanceof z.ZodError))
    return { code: 'messages.anErrorOccurredTryAgain' };
  const { code, values } = serializeError(error);
  const secrets = config
    ? [
        config.privatePassword,
        config.connection.type === 'webdav' ? config.connection.password : config.connection.token,
      ].filter((value): value is string => Boolean(value))
    : [];
  const safeValues =
    values &&
    Object.fromEntries(
      Object.entries(values).map(([key, value]) => [
        key,
        typeof value === 'string'
          ? secrets.reduce((result, secret) => result.split(secret).join('[redacted]'), value)
          : value,
      ]),
    );
  return safeValues ? { code, values: safeValues } : { code };
}

function normalOnly(document: BackupDocument): BackupDocument {
  return { ...document, spaces: { normal: document.spaces.normal } };
}

async function assertLocalRevision(revision: number) {
  if ((await repository.read()).revision !== revision)
    throw new AppError('messages.localDataChangedDuringSyncTryAgain');
}

async function withSyncLock<T>(task: () => Promise<T>) {
  if (!globalThis.navigator?.locks)
    throw new AppError('messages.thisBrowserDoesNotSupportWebLocksSafeSyncIsUnavailable');
  return navigator.locks.request(SYNC_LOCK, { mode: 'exclusive', ifAvailable: true }, (lock) => {
    if (!lock) throw new SyncBusyError();
    return task();
  });
}

export async function resolveSyncConflict(expected: SyncConflict, choice: 'local' | 'remote') {
  return withSyncLock(async () => {
    await upgradeSyncMetadata();
    return resolveSyncConflictUnlocked(expected, choice);
  });
}

async function resolveSyncConflictUnlocked(expected: SyncConflict, choice: 'local' | 'remote') {
  const status = await loadSyncStatus();
  const expectedConflict = syncConflictSchema.parse(expected);
  const index = status.conflicts.findIndex((conflict) => conflict.key === expectedConflict.key);
  const conflict = status.conflicts[index];
  if (!conflict || JSON.stringify(conflict) !== JSON.stringify(expectedConflict))
    throw new AppError('errors.sync.conflictChanged');
  if (protectedConflict(conflict)) {
    await synchronizeUnlocked('auto', { conflict, choice });
    return;
  }
  // Whole-space legacy conflicts have no group candidates to select. The UI
  // explicitly re-runs a merge to calculate the current group conflicts.
  if (conflict.id === 'private-space') throw new AppError('errors.sync.conflictChanged');
  if (choice === 'remote') {
    const snapshot = await repository.snapshot('normal');
    const state = snapshot.state;
    if (conflict.id === 'settings') {
      state.normalSettings = spaceSettingsSchema.parse(conflict.remote);
    } else {
      const collection = `${conflict.entity}s` as 'groups' | 'folders' | 'sites';
      const record = state.spaces.normal[collection].find((item) => item.id === conflict.id);
      if (!record) throw new AppError('messages.theConflictingItemNoLongerExists');
      if (
        (conflict.entity === 'site' || conflict.entity === 'folder') &&
        conflict.field === 'location'
      ) {
        const destination =
          conflict.entity === 'site'
            ? siteSchema.pick({ groupId: true, folderId: true, order: true }).parse(conflict.remote)
            : {
                ...folderSchema.pick({ groupId: true, order: true }).parse(conflict.remote),
                folderId: null,
              };
        const candidates = [
          ...state.spaces.normal.sites.filter(
            (item) =>
              item.groupId === destination.groupId && item.folderId === destination.folderId,
          ),
          ...(destination.folderId === null
            ? state.spaces.normal.folders.filter((item) => item.groupId === destination.groupId)
            : []),
        ]
          .filter((item) => item.id !== record.id)
          .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
        const beforeId = candidates.find((item) => item.order >= destination.order)?.id;
        applyCommand(
          state,
          conflict.entity === 'site'
            ? {
                type: 'move-site',
                spaceId: 'normal',
                id: record.id,
                groupId: destination.groupId,
                folderId: destination.folderId,
                beforeId,
              }
            : {
                type: 'move-folder',
                spaceId: 'normal',
                id: record.id,
                groupId: destination.groupId,
                beforeId,
              },
        );
      } else {
        const schema =
          conflict.entity === 'site'
            ? siteSchema
            : conflict.entity === 'folder'
              ? folderSchema
              : groupSchema;
        if (conflict.field === '*') Object.assign(record, schema.parse(conflict.remote));
        else {
          const field = schema.keyof().parse(conflict.field);
          const fields: Record<string, z.ZodType> = schema.shape;
          (record as unknown as Record<string, unknown>)[field] = fields[field].parse(
            conflict.remote,
          );
        }
      }
      record.updatedAt = Date.now();
      record.changeId = crypto.randomUUID();
    }
    const baseline = await loadBaseline();
    const resources = new Map([
      ...decodeResources(baseline?.document.spaces.normal?.resources ?? []),
      ...snapshot.resources,
    ]);
    await repository.restore(state, resources, {
      expectedRevision: snapshot.state.revision,
      range: 'normal',
    });
  }
  status.conflicts.splice(index, 1);
  await browser.storage.local.set({ [STATUS_KEY]: status });
}

async function mergeDocuments(
  base: BackupDocument | undefined,
  local: BackupDocument,
  remote: BackupDocument,
  password: string | undefined,
  choose: (id: string, field: string) => 'local' | 'remote' | undefined,
) {
  const document = structuredClone(local);
  const releasedBySync = new Set<string>();
  const conflicts: SyncConflict[] = [];
  let recovery: ContainerRecovery | undefined;
  if (local.spaces.normal && remote.spaces.normal) {
    const normal = structuredClone(local.spaces.normal);
    const merged = mergeSpaceData(
      base?.spaces.normal?.data,
      local.spaces.normal.data,
      remote.spaces.normal.data,
    );
    normal.data = merged.data;
    recovery = merged.recovery;
    normal.resources = mergeResources(
      local.spaces.normal.resources,
      remote.spaces.normal.resources,
    );
    conflicts.push(...merged.conflicts);
    if (
      JSON.stringify(local.spaces.normal.settings) === JSON.stringify(base?.spaces.normal?.settings)
    )
      normal.settings = remote.spaces.normal.settings;
    else if (
      JSON.stringify(remote.spaces.normal.settings) !==
        JSON.stringify(base?.spaces.normal?.settings) &&
      JSON.stringify(remote.spaces.normal.settings) !== JSON.stringify(local.spaces.normal.settings)
    )
      conflicts.push(
        createSyncConflict({
          entity: 'group',
          id: 'settings',
          field: '*',
          local: local.spaces.normal.settings,
          remote: remote.spaces.normal.settings,
        }),
      );
    document.spaces.normal = normal;
  } else if (remote.spaces.normal) document.spaces.normal = remote.spaces.normal;
  if (remote.spaces.private && !local.spaces.private)
    document.spaces.private = remote.spaces.private;
  else if (remote.spaces.private && local.spaces.private) {
    const [left, right, ancestor] = await Promise.all([
      privateBackupPayload(local, password),
      privateBackupPayload(remote, password),
      base ? privateBackupPayload(base, password) : undefined,
    ]);
    if (!left || !right)
      throw new AppError('messages.theBackupFormatIsInvalidOrItsVersionIsUnsupported');
    if (ancestor) {
      // A release of protection must not silently discard a newer edit that
      // the other device made while the item was still protected.
      const previous = recordIds(ancestor.data);
      await assertUnchangedPlainCopies(
        right.data,
        difference(previous, recordIds(left.data)),
        ancestor.data,
      );
      await assertUnchangedPlainCopies(
        left.data,
        difference(previous, recordIds(right.data)),
        ancestor.data,
      );
    }
    const signed = [...(left.ordinaryRevisions ?? []), ...(right.ordinaryRevisions ?? [])];
    const published = await ordinaryRevisions(document.spaces.normal);
    const revisions = published.filter((item) =>
      signed.some((proof) => proof.id === item.id && proof.digest === item.digest),
    );
    if (ancestor && base?.spaces.private?.protected && !base.spaces.private.archiveOnly) {
      const before = recordIds(ancestor.data);
      for (const proof of revisions)
        if (
          before.groups.has(proof.id) &&
          (!left.data.groups.some((r) => r.id === proof.id) ||
            !right.data.groups.some((r) => r.id === proof.id))
        )
          releasedBySync.add(proof.id);
    }
    const groupOf = new Map(
      [...right.data.sites, ...right.data.folders, ...left.data.sites, ...left.data.folders].map(
        (item) => [item.id, item.groupId],
      ),
    );
    const merged = mergeSpaceData(ancestor?.data, left.data, right.data, (conflict) =>
      choose(
        conflict.entity === 'group' ? conflict.id : groupOf.get(conflict.id)!,
        'protected-group',
      ),
    );
    let settings = left.settings;
    if (JSON.stringify(left.settings) === JSON.stringify(ancestor?.settings))
      settings = right.settings;
    else if (
      JSON.stringify(right.settings) !== JSON.stringify(ancestor?.settings) &&
      JSON.stringify(left.settings) !== JSON.stringify(right.settings) &&
      choose('preferences', 'protected-settings') === 'remote'
    )
      settings = right.settings;
    const ids = spaceResourceIds(merged.data, settings);
    const resources = mergeResources(left.resources, right.resources).filter((item) =>
      ids.has(item.id),
    );
    const payload = { data: merged.data, settings, resources };
    document.spaces.private =
      local.spaces.private.protected || remote.spaces.private.protected
        ? await protectPayload(
            payload,
            password ?? '',
            (releasedBySync.size > 0 &&
              merged.data.groups.every(
                (g) => g.id === 'private-group-home' || g.id === 'raytab-empty-private',
              ) &&
              !merged.data.sites.length &&
              !merged.data.folders.length) ||
              ![local.spaces.private, remote.spaces.private].some(
                (part) => part?.protected && !part.archiveOnly,
              ),
            revisions,
          )
        : { protected: false, payload };
  }
  document.createdAt = new Date().toISOString();
  return { document: backupSchema.parse(document), conflicts, recovery, releasedBySync };
}
function mergeResources<T extends { id: string }>(local: T[], remote: T[]) {
  return [...new Map([...remote, ...local].map((item) => [item.id, item])).values()];
}
async function saveSuccess(
  document: BackupDocument,
  version: string | null,
  range: 'normal' | 'private' | 'all',
  conflicts: SyncConflict[] = [],
  recovery?: ContainerRecovery,
) {
  const previousStatus = await loadSyncStatus();
  const previousRecovery = previousStatus.recovery;
  const previous = range === 'all' ? undefined : await loadBaseline();
  const common: BackupDocument = {
    ...document,
    spaces: {
      normal: document.spaces.normal ?? previous?.document.spaces.normal,
      private: range === 'normal' ? previous?.document.spaces.private : document.spaces.private,
    },
  };
  if (range === 'normal')
    conflicts = [...conflicts, ...previousStatus.conflicts.filter(protectedConflict)];
  const retainedRecovery =
    recovery ??
    (document.spaces.normal?.data.groups.some((group) => group.id === previousRecovery?.groupId)
      ? previousRecovery
      : undefined);
  await browser.storage.local.set({
    [BASELINE_KEY]: encodeBaseline({
      document: common,
      version,
      ...(!document.spaces.normal && previous?.redactions && { redactions: previous.redactions }),
    }),
    [STATUS_KEY]: {
      schemaVersion: 1,
      lastSuccess: new Date().toISOString(),
      conflicts,
      ...(retainedRecovery ? { recovery: retainedRecovery } : {}),
      retryCount: 0,
    } satisfies SyncStatus,
  });
  return conflicts;
}
