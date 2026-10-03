import { AppError, serializeError, type StoredError } from '@/lib/errors';
import { z } from 'zod';
import {
  backupSchema,
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
  folderSchema,
  siteSchema,
  siteIconSchema,
  siteIconBackgroundSchema,
  spaceSettingsSchema,
  spaceResourceIds,
} from '@/storage/model';
import { upgradeSettings, upgradeV4Site } from '@/storage/upgrade-local';
import { applyCommand } from '@/storage/operations';
import { mergeSpaceData, createSyncConflict, syncConflictSchema, type SyncConflict } from './merge';
import { createProvider, type SyncConnection } from '../providers';

export type SyncConfig = {
  connection: SyncConnection;
  includePrivate: boolean;
  privatePassword?: string;
  automatic: boolean;
};
export type SyncStatus = {
  schemaVersion: 1;
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

export async function saveSyncConfig(config: SyncConfig) {
  return withSyncLock(async () => {
    const { privatePassword, ...persisted } = config;
    await browser.storage.local.set({ [CONFIG_KEY]: persisted });
    if (privatePassword) await browser.storage.session.set({ [SECRET_KEY]: privatePassword });
    else await browser.storage.session.remove(SECRET_KEY);
  });
}
export async function loadSyncConfig() {
  const config = (await browser.storage.local.get(CONFIG_KEY))[CONFIG_KEY] as
    Omit<SyncConfig, 'privatePassword'> | undefined;
  if (!config) return undefined;
  const privatePassword = (await browser.storage.session.get(SECRET_KEY))[SECRET_KEY] as
    string | undefined;
  return { ...config, privatePassword };
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
  if (raw === undefined) return undefined;
  const baseline = z.object({ document: z.unknown(), version: z.string().nullable() }).parse(raw);
  return { ...baseline, document: await parseBackup(baseline.document) };
}

async function upgradeSyncMetadata() {
  const values: Record<string, unknown> = {};
  const baseline = (await browser.storage.local.get(BASELINE_KEY))[BASELINE_KEY];
  if (typeof baseline === 'object' && baseline !== null && 'document' in baseline) {
    const normalized = await loadBaseline();
    if (JSON.stringify(normalized) !== JSON.stringify(baseline)) values[BASELINE_KEY] = normalized;
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

export async function synchronize(mode: 'auto' | 'push' | 'pull' = 'auto') {
  return withSyncLock(async () => {
    await upgradeSyncMetadata();
    return synchronizeUnlocked(mode);
  });
}

export async function synchronizeAutomatically() {
  return withSyncLock(async () => {
    const config = await loadSyncConfig();
    if (!config?.automatic) return;
    const status = await loadSyncStatus();
    if (status.nextRetryAt && Date.parse(status.nextRetryAt) > Date.now()) return;
    await upgradeSyncMetadata();
    return synchronizeUnlocked('auto');
  });
}

async function synchronizeUnlocked(mode: 'auto' | 'push' | 'pull') {
  let config: SyncConfig | undefined;
  try {
    config = await loadSyncConfig();
    if (!config) throw new AppError('messages.saveASyncConnectionFirst');
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
    if (mode === 'push' || !remote) {
      const document = structuredClone(local);
      if (!config.includePrivate && remote?.spaces.private)
        document.spaces.private = remote.spaces.private;
      await assertLocalRevision(snapshot.state.revision);
      const version = await provider.write(JSON.stringify(document), remoteFile?.version ?? null);
      await saveSuccess(document, version);
      return { document, conflicts: [] };
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
      await repository.restore(restored.state, restored.resources, {
        expectedRevision: snapshot.state.revision,
        range,
      });
      await saveSuccess(remote, remoteFile?.version ?? null);
      return { document: remote, conflicts: [] };
    }
    const baseline = (await loadBaseline())?.document;
    const { document, conflicts: incomingConflicts } = await mergeDocuments(
      baseline,
      local,
      remote,
      config.privatePassword,
    );
    const previousStatus = await loadSyncStatus();
    const previousConflicts = previousStatus.conflicts;
    const privateConflict = incomingConflicts.find((conflict) => conflict.id === 'private-space');
    if (privateConflict) {
      await browser.storage.local.set({
        [STATUS_KEY]: {
          ...previousStatus,
          conflicts: [
            ...new Map(
              [...previousConflicts, privateConflict].map((conflict) => [conflict.key, conflict]),
            ).values(),
          ],
        } satisfies SyncStatus,
      });
      throw new AppError('errors.sync.privateConflictRequiresChoice');
    }
    const conflicts = [
      ...new Map(
        [...previousConflicts, ...incomingConflicts].map((conflict) => [conflict.key, conflict]),
      ).values(),
    ];
    retainConflictResources(document, conflicts, baseline);
    const restored = await restoreBackup(
      snapshot.state,
      config.includePrivate ? document : normalOnly(document),
      'replace',
      config.privatePassword,
    );
    await assertLocalRevision(snapshot.state.revision);
    const version = await provider.write(JSON.stringify(document), remoteFile?.version ?? null);
    await repository.restore(restored.state, restored.resources, {
      expectedRevision: snapshot.state.revision,
      range,
    });
    await saveSuccess(document, version, conflicts);
    return { document, conflicts };
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
  if (conflict.id === 'private-space')
    throw new AppError('messages.resolvePrivateSpaceVersionsWithLocalToCloudOrCloudToLocal');
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
  password?: string,
) {
  const document = structuredClone(local);
  const conflicts: SyncConflict[] = [];
  if (local.spaces.normal && remote.spaces.normal) {
    const normal = structuredClone(local.spaces.normal);
    const merged = mergeSpaceData(
      base?.spaces.normal?.data,
      local.spaces.normal.data,
      remote.spaces.normal.data,
    );
    normal.data = merged.data;
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
    if (JSON.stringify(left) === JSON.stringify(ancestor))
      document.spaces.private = remote.spaces.private;
    else if (
      JSON.stringify(right) !== JSON.stringify(ancestor) &&
      JSON.stringify(left) !== JSON.stringify(right)
    )
      conflicts.push(
        createSyncConflict({
          entity: 'group',
          id: 'private-space',
          field: '*',
          local: 'local',
          remote: 'remote',
        }),
      );
  }
  document.createdAt = new Date().toISOString();
  return { document: backupSchema.parse(document), conflicts };
}
function mergeResources<T extends { id: string }>(local: T[], remote: T[]) {
  return [...new Map([...remote, ...local].map((item) => [item.id, item])).values()];
}
async function saveSuccess(
  document: BackupDocument,
  version: string | null,
  conflicts: SyncConflict[] = [],
) {
  await browser.storage.local.set({
    [BASELINE_KEY]: { document, version },
    [STATUS_KEY]: {
      schemaVersion: 1,
      lastSuccess: new Date().toISOString(),
      conflicts,
      retryCount: 0,
    } satisfies SyncStatus,
  });
}
