import {
  backupSchema,
  createBackup,
  parseBackup,
  restoreBackup,
  type BackupDocument,
} from '@/features/backup/backup';
import { repository } from '@/storage/repository';
import { spaceSettingsSchema } from '@/storage/model';
import { mergeSpaceData, type SyncConflict } from './merge';
import { createProvider, type SyncConnection } from '../providers';

export type SyncConfig = {
  connection: SyncConnection;
  includePrivate: boolean;
  privatePassword?: string;
  automatic: boolean;
};
export type SyncStatus = {
  lastSuccess?: string;
  lastError?: string;
  conflicts: SyncConflict[];
  retryCount?: number;
  nextRetryAt?: string;
};
const CONFIG_KEY = 'raytab-sync-config';
const BASELINE_KEY = 'raytab-sync-baseline';
const STATUS_KEY = 'raytab-sync-status';
const SECRET_KEY = 'raytab-sync-private-password';
const LEASE_KEY = 'raytab-sync-lease';
const LEASE_MS = 2 * 60_000;

export async function saveSyncConfig(config: SyncConfig) {
  const { privatePassword, ...persisted } = config;
  await browser.storage.local.set({ [CONFIG_KEY]: persisted });
  if (privatePassword) await browser.storage.session.set({ [SECRET_KEY]: privatePassword });
  else await browser.storage.session.remove(SECRET_KEY);
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
  await browser.storage.local.remove([CONFIG_KEY, BASELINE_KEY, STATUS_KEY, LEASE_KEY]);
  await browser.storage.session.remove(SECRET_KEY);
}
export async function loadSyncStatus(): Promise<SyncStatus> {
  return (
    ((await browser.storage.local.get(STATUS_KEY))[STATUS_KEY] as SyncStatus | undefined) ?? {
      conflicts: [],
    }
  );
}

export async function synchronize(mode: 'auto' | 'push' | 'pull' = 'auto') {
  return withSyncLease(() => synchronizeUnlocked(mode));
}

async function synchronizeUnlocked(mode: 'auto' | 'push' | 'pull') {
  const config = await loadSyncConfig();
  if (!config) throw new Error('请先保存同步连接');
  const provider = createProvider(config.connection);
  const snapshot = await repository.snapshot();
  if (config.includePrivate && snapshot.state.privateSecurity.protected && !config.privatePassword)
    throw new Error('同步受密码保护的私密空间需要填写同步加密密码');
  const local = await createBackup(
    snapshot.state,
    snapshot.resources,
    config.includePrivate ? 'all' : 'normal',
    config.privatePassword,
  );
  try {
    const remoteFile = await provider.read();
    if (mode === 'push' || !remoteFile) {
      const version = await provider.write(JSON.stringify(local), remoteFile?.version ?? null);
      await saveSuccess(local, version);
      return { document: local, conflicts: [] };
    }
    const remote = await parseBackup(remoteFile.content);
    if (mode === 'pull') {
      const restored = await restoreBackup(
        snapshot.state,
        remote,
        'replace',
        config.privatePassword,
      );
      await repository.restore(restored.state, restored.resources);
      await saveSuccess(remote, remoteFile.version);
      return { document: remote, conflicts: [] };
    }
    const stored = (await browser.storage.local.get(BASELINE_KEY))[BASELINE_KEY] as
      { document?: unknown } | undefined;
    const baseline = stored?.document ? backupSchema.parse(stored.document) : undefined;
    const { document, conflicts } = mergeDocuments(baseline, local, remote);
    const version = await provider.write(JSON.stringify(document), remoteFile.version);
    const restored = await restoreBackup(
      snapshot.state,
      document,
      'replace',
      config.privatePassword,
    );
    await repository.restore(restored.state, restored.resources);
    await saveSuccess(document, version, conflicts);
    return { document, conflicts };
  } catch (error) {
    const previous = await loadSyncStatus();
    const retryCount = Math.min((previous.retryCount ?? 0) + 1, 8);
    await browser.storage.local.set({
      [STATUS_KEY]: {
        ...previous,
        lastError: (error as Error).message,
        retryCount,
        nextRetryAt: new Date(Date.now() + Math.min(2 ** retryCount, 60) * 60_000).toISOString(),
      } satisfies SyncStatus,
    });
    throw error;
  }
}

async function withSyncLease<T>(task: () => Promise<T>) {
  const owner = crypto.randomUUID();
  const existing = (await browser.storage.local.get(LEASE_KEY))[LEASE_KEY] as
    { owner: string; expiresAt: number } | undefined;
  if (existing && existing.expiresAt > Date.now())
    throw new Error('另一个页面正在同步，请稍后重试');
  await browser.storage.local.set({ [LEASE_KEY]: { owner, expiresAt: Date.now() + LEASE_MS } });
  const acquired = (await browser.storage.local.get(LEASE_KEY))[LEASE_KEY] as { owner: string };
  if (acquired.owner !== owner) throw new Error('另一个页面正在同步，请稍后重试');
  try {
    return await task();
  } finally {
    const current = (await browser.storage.local.get(LEASE_KEY))[LEASE_KEY] as
      { owner: string } | undefined;
    if (current?.owner === owner) await browser.storage.local.remove(LEASE_KEY);
  }
}

export async function resolveSyncConflict(index: number, choice: 'local' | 'remote') {
  const status = await loadSyncStatus();
  const conflict = status.conflicts[index];
  if (!conflict) throw new Error('冲突记录不存在');
  if (choice === 'remote') {
    const snapshot = await repository.snapshot();
    const state = snapshot.state;
    if (conflict.id === 'settings') {
      state.normalSettings = spaceSettingsSchema.parse(conflict.remote);
    } else if (conflict.id === 'private-space') {
      throw new Error('私密空间版本请使用本机覆盖或云端恢复处理');
    } else {
      const collection = `${conflict.entity}s` as 'desktops' | 'categories' | 'sites';
      const record = state.spaces.normal[collection].find((item) => item.id === conflict.id);
      if (!record) throw new Error('冲突对象已不存在');
      if (conflict.field === '*') Object.assign(record, conflict.remote);
      else (record as unknown as Record<string, unknown>)[conflict.field] = conflict.remote;
      record.updatedAt = Date.now();
      record.changeId = crypto.randomUUID();
    }
    await repository.restore(state, snapshot.resources);
  }
  status.conflicts.splice(index, 1);
  await browser.storage.local.set({ [STATUS_KEY]: status });
}

function mergeDocuments(
  base: BackupDocument | undefined,
  local: BackupDocument,
  remote: BackupDocument,
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
      conflicts.push({
        entity: 'desktop',
        id: 'settings',
        field: '*',
        local: local.spaces.normal.settings,
        remote: remote.spaces.normal.settings,
      });
    document.spaces.normal = normal;
  } else if (remote.spaces.normal) document.spaces.normal = remote.spaces.normal;
  if (remote.spaces.private && !local.spaces.private)
    document.spaces.private = remote.spaces.private;
  else if (
    remote.spaces.private &&
    local.spaces.private &&
    JSON.stringify(remote.spaces.private) !== JSON.stringify(local.spaces.private)
  ) {
    const basePrivate = JSON.stringify(base?.spaces.private);
    if (JSON.stringify(local.spaces.private) === basePrivate)
      document.spaces.private = remote.spaces.private;
    else if (JSON.stringify(remote.spaces.private) !== basePrivate)
      conflicts.push({
        entity: 'desktop',
        id: 'private-space',
        field: '*',
        local: '本机私密版本',
        remote: '远端私密版本',
      });
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
      lastSuccess: new Date().toISOString(),
      conflicts,
      retryCount: 0,
    } satisfies SyncStatus,
  });
}
