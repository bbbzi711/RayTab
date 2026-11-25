import { AppError } from '@/lib/errors';
import { z } from '@/lib/zod';
import { decryptJson, encryptedEnvelopeSchema } from '@/security/crypto';
import {
  rayStateSchema,
  effectiveSettings,
  createInitialState,
  createLockedPrivateSpace,
  spaceIdSchema,
  spaceResourceIds,
  type RayState,
  type SpaceData,
  type SpaceId,
} from '@/storage/model';
import { upgradeSettings, upgradeV4Space } from '@/storage/upgrade-local';
import { reconcileMergedContainers, type ContainerRecovery } from '@/storage/merge-containers';
import {
  assertEncryptedGroupBoundary,
  indexEncryptedGroups,
  normalizePlainGroups,
  isPlaceholderGroup,
  isStoredPrivateGroup,
} from '@/storage/group-privacy';

import {
  decodePortable,
  openProtectedGroups,
  ordinaryRevisions,
  type OrdinaryRevision,
  type Payload,
  payloadSchema as spacePayloadSchema,
  protectPayload,
  resourceSchema,
  sealedGroupsSchema,
} from './group-codec';
export { encodeBackup, protectPayload, ordinaryRevisions } from './group-codec';

const legacyPayloadSchema = z.object({
  data: z.unknown(),
  settings: z.unknown(),
  resources: z.array(resourceSchema),
});
const legacyBackupSchema = z.object({
  format: z.literal('raytab-backup'),
  version: z.literal(2),
  createdAt: z.string().datetime(),
  spaces: z.object({
    normal: legacyPayloadSchema.optional(),
    private: z
      .discriminatedUnion('protected', [
        z.object({ protected: z.literal(false), payload: legacyPayloadSchema }),
        z.object({ protected: z.literal(true), envelope: encryptedEnvelopeSchema }),
      ])
      .optional(),
  }),
});
const privatePayloadSchema = z.discriminatedUnion('protected', [
  z.object({ protected: z.literal(false), payload: spacePayloadSchema }),
  z.object({
    protected: z.literal(true),
    envelope: encryptedEnvelopeSchema,
    groups: sealedGroupsSchema.optional(),
    archiveOnly: z.literal(true).optional(),
  }),
]);
export const backupSchema = z.object({
  format: z.literal('raytab-backup'),
  version: z.literal(3),
  createdAt: z.string().datetime(),
  spaces: z.object({
    normal: spacePayloadSchema.optional(),
    private: privatePayloadSchema.optional(),
  }),
});
export type BackupDocument = z.infer<typeof backupSchema>;

export async function createBackup(
  state: RayState,
  resources: Map<string, Blob>,
  range: SpaceId | 'all',
  privatePassword?: string,
): Promise<BackupDocument> {
  if (range !== 'normal' && state.privateSecurity.protected) {
    if (state.privateSecurity.locked) throw new AppError('messages.unlockThePrivateSpaceFirst');
    if (!privatePassword) throw new AppError('messages.enterTheBackupEncryptionPassword');
  }
  const document: BackupDocument = {
    format: 'raytab-backup',
    version: 3,
    createdAt: new Date().toISOString(),
    spaces: {},
  };
  if (range === 'all' || range === 'normal')
    document.spaces.normal = await payloadFor(state, resources, 'normal');
  if (range === 'all' || range === 'private') {
    const payload = await payloadFor(state, resources, 'private');
    document.spaces.private = privatePassword
      ? await protectPayload(
          payload,
          privatePassword,
          !state.privateSecurity.protected,
          state.privateSecurity.protected ? [] : await ordinaryRevisions(document.spaces.normal),
        )
      : { protected: false, payload };
  }
  return backupSchema.parse(document);
}

export async function parseBackup(input: string | unknown) {
  let value: unknown;
  try {
    value = typeof input === 'string' ? JSON.parse(input) : input;
  } catch {
    throw new AppError('messages.theBackupFileIsNotValidJson');
  }
  if (typeof value === 'object' && value !== null && 'version' in value && value.version === 4)
    return decodePortable(value);
  if (typeof value === 'object' && value !== null && 'version' in value && value.version === 2) {
    const legacy = legacyBackupSchema.safeParse(value);
    if (!legacy.success)
      throw new AppError('messages.theBackupFormatIsInvalidOrItsVersionIsUnsupported');
    const spaces: BackupDocument['spaces'] = {};
    if (legacy.data.spaces.normal) spaces.normal = upgradeBackupPayload(legacy.data.spaces.normal);
    const privateSpace = legacy.data.spaces.private;
    if (privateSpace)
      spaces.private = privateSpace.protected
        ? privateSpace
        : { protected: false, payload: upgradeBackupPayload(privateSpace.payload) };
    return backupSchema.parse({ ...legacy.data, version: 3, spaces });
  }
  const parsed = backupSchema.safeParse(value);
  if (!parsed.success)
    throw new AppError('messages.theBackupFormatIsInvalidOrItsVersionIsUnsupported');
  return parsed.data;
}

export function restoreRange(document: BackupDocument, currentProtected = false): SpaceId | 'all' {
  const part = document.spaces.private;
  if (!part) return 'normal';
  if (!part.protected || (part.groups && part.archiveOnly))
    return currentProtected ? 'normal' : 'all';
  return document.spaces.normal ? 'all' : 'private';
}

export async function restoreBackup(
  current: RayState,
  document: BackupDocument,
  mode: 'merge' | 'replace',
  privatePassword?: string,
  releasedBySync = new Set<string>(),
) {
  if (
    document.spaces.private?.protected &&
    !(document.spaces.private.groups && document.spaces.private.archiveOnly) &&
    current.privateSecurity.protected &&
    current.privateSecurity.locked
  )
    throw new AppError('messages.unlockThePrivateSpaceFirst');
  const next = rayStateSchema.parse(structuredClone(current));
  const resources = new Map<string, Blob>();
  const recoveries: Partial<Record<SpaceId, ContainerRecovery>> = {};
  let preserveGroupEncryption = false;
  if (document.spaces.normal) {
    if (mode === 'replace') next.spaces.normal = document.spaces.normal.data;
    else {
      const merged = mergeSpace(next.spaces.normal, document.spaces.normal.data);
      next.spaces.normal = merged.data;
      if (merged.recovery) recoveries.normal = merged.recovery;
    }
    next.normalSettings = document.spaces.normal.settings;
    decodeResources(document.spaces.normal.resources, resources);
  }
  if (document.spaces.private) {
    const valid = await privateBackupPayload(document, privatePassword);
    if (!valid) throw new AppError('messages.theBackupFormatIsInvalidOrItsVersionIsUnsupported');
    if (
      document.spaces.private.protected &&
      !(document.spaces.private.groups && document.spaces.private.archiveOnly)
    ) {
      preserveGroupEncryption = true;
      const incoming = structuredClone(valid.data);
      if (mode === 'replace') next.spaces.private = incoming;
      else {
        const merged = mergeSpace(next.spaces.private, incoming);
        next.spaces.private = merged.data;
        if (merged.recovery) {
          recoveries.private = merged.recovery;
          const recovered = merged.data.groups.find(
            (group) => group.id === merged.recovery!.groupId,
          )!;
          recovered.hidden ??= true;
          if (!document.spaces.private.groups) recovered.manualIconFetchOnly = true;
        }
      }
      next.privateSettingOverrides = diffSettings(next.normalSettings, valid.settings);
    } else {
      // Import the sender's ordinary legacy groups without touching protected
      // content on the receiving device, even for a private-only v2/v3 file.
      const converted = createInitialState();
      converted.spaces.normal = structuredClone(
        document.spaces.normal?.data ?? {
          groups: [],
          folders: [],
          sites: [],
          tombstones: [],
        },
      );
      let legacyRecovery: ContainerRecovery | undefined;
      if (mode === 'merge' && !next.privateSecurity.protected) {
        const merged = mergeSpace(next.spaces.private, valid.data);
        converted.spaces.private = merged.data;
        legacyRecovery = merged.recovery;
      } else converted.spaces.private = structuredClone(valid.data);
      const oldDeletions = converted.spaces.private.tombstones;
      const migratedIds = normalizePlainGroups(converted);
      if (converted.spaces.normal.groups.length) {
        const merged = mergeSpace(next.spaces.normal, converted.spaces.normal);
        const groupId = legacyRecovery && migratedIds?.get(legacyRecovery.groupId);
        const recovery =
          merged.recovery ?? countNewlyRecovered(next.spaces.normal, merged.data, groupId);
        if (recovery) recoveries.normal = recovery;
        next.spaces.normal = merged.data;
      }
      if (!next.privateSecurity.protected) {
        next.privateSettingOverrides = diffSettings(next.normalSettings, valid.settings);
        next.spaces.private = { ...createLockedPrivateSpace(), tombstones: oldDeletions };
      }
    }
    decodeResources(valid.resources, resources);
  }
  if (releasedBySync.size && mode === 'replace') {
    const privateData = next.spaces.private;
    privateData.groups = privateData.groups.filter((r) => !releasedBySync.has(r.id));
    privateData.sites = privateData.sites.filter((r) => !releasedBySync.has(r.groupId));
    privateData.folders = privateData.folders.filter((r) => !releasedBySync.has(r.groupId));
    if (!privateData.groups.length) privateData.groups = createLockedPrivateSpace().groups;
  }
  for (const spaceId of spaceIdSchema.options) {
    if (!next.spaces[spaceId].groups.some((item) => item.id === next.local.activeGroup[spaceId]))
      next.local.activeGroup[spaceId] = next.spaces[spaceId].groups[0].id;
  }
  // A full authenticated backup can carry an explicit removal of protection.
  // The signed private tombstone and the ordinary record must describe the same
  // transfer. An old ordinary backup alone can never authorize it.
  if (
    (preserveGroupEncryption || releasedBySync.size) &&
    mode === 'replace' &&
    next.encryptedGroupIndex
  ) {
    const released = new Map(
      next.spaces.private.tombstones.map((record) => [record.entity + ':' + record.id, record]),
    );
    const includesRelease = (
      type: string,
      record: { id: string; changeId: string; updatedAt: number },
    ) => {
      const owner = 'groupId' in record ? record.groupId : record.id;
      if (typeof owner === 'string' && releasedBySync.has(owner)) return true;
      const change = released.get(type + ':' + record.id);
      return change && (change.changeId === record.changeId || record.updatedAt > change.deletedAt);
    };
    const oldIndex = next.encryptedGroupIndex;
    const freedGroups = new Set(
      next.spaces.normal.groups.filter((r) => includesRelease('group', r)).map((r) => r.id),
    );
    const freedFolders = new Set(
      next.spaces.normal.folders.filter((r) => includesRelease('folder', r)).map((r) => r.id),
    );
    const freedSites = new Set(
      next.spaces.normal.sites.filter((r) => includesRelease('site', r)).map((r) => r.id),
    );
    next.encryptedGroupIndex = {
      ...oldIndex,
      labels: oldIndex.labels.filter((r) => !freedGroups.has(r.id)),
      folderIds: oldIndex.folderIds?.filter((id) => !freedFolders.has(id)),
      siteIds: oldIndex.siteIds?.filter((id) => !freedSites.has(id)),
    };
  }
  assertEncryptedGroupBoundary(
    next,
    document.spaces.private && (preserveGroupEncryption || next.privateSecurity.protected)
      ? indexEncryptedGroups(next)
      : undefined,
  );
  return {
    state: rayStateSchema.parse(next),
    resources,
    recoveries,
    preserveGroupEncryption,
    range: releasedBySync.size
      ? ('all' as const)
      : restoreRange(document, current.privateSecurity.protected),
  };
}

export function backupSummary(document: BackupDocument) {
  const count = (payload: z.infer<typeof spacePayloadSchema> | undefined, spaceId: SpaceId) =>
    payload
      ? {
          groups: payload.data.groups.filter(
            (group) =>
              !isPlaceholderGroup(group.id) &&
              !(
                spaceId === 'private' &&
                group.id === 'private-group-home' &&
                group.updatedAt === 0 &&
                group.hidden === undefined &&
                !payload.data.sites.some((r) => r.groupId === group.id) &&
                !payload.data.folders.some((r) => r.groupId === group.id)
              ),
          ).length,
          folders: payload.data.folders.length,
          sites: payload.data.sites.length,
          resources: payload.resources.length,
        }
      : undefined;
  return {
    normal: count(document.spaces.normal, 'normal'),
    private: document.spaces.private?.protected
      ? { protected: true }
      : count(document.spaces.private?.payload, 'private'),
  };
}

async function payloadFor(state: RayState, resources: Map<string, Blob>, spaceId: SpaceId) {
  const space = state.spaces[spaceId];
  const settings = effectiveSettings(state, spaceId);
  const ids = spaceResourceIds(space, settings);
  const encoded = [];
  for (const id of ids) {
    const blob = resources.get(id);
    if (!blob) throw new AppError('errors.backup.missingResource', { id });
    encoded.push({
      id,
      type: blob.type || 'application/octet-stream',
      data: await blobToBase64(blob),
    });
  }
  return spacePayloadSchema.parse({ data: space, settings, resources: encoded });
}

function upgradeBackupPayload(value: unknown) {
  const old = legacyPayloadSchema.parse(value);
  return spacePayloadSchema.parse({
    data: upgradeV4Space(old.data),
    settings: upgradeSettings(old.settings, true),
    resources: old.resources,
  });
}

export async function privateBackupPayload(
  document: BackupDocument,
  password?: string,
): Promise<(Payload & { ordinaryRevisions?: OrdinaryRevision[] }) | undefined> {
  const privateSpace = document.spaces.private;
  if (!privateSpace) return undefined;
  if (!privateSpace.protected) return privateSpace.payload;
  const payload = privateSpace.groups
    ? await openProtectedGroups(privateSpace, password ?? '')
    : await openLegacyPrivatePayload(privateSpace.envelope, password ?? '');
  if (!(privateSpace.groups && privateSpace.archiveOnly)) {
    for (const group of payload.data.groups) {
      if (group.hidden !== undefined || !isStoredPrivateGroup(payload.data, group)) continue;
      group.hidden = true;
      group.manualIconFetchOnly = true;
    }
  }
  return payload;
}

async function openLegacyPrivatePayload(
  envelope: z.infer<typeof encryptedEnvelopeSchema>,
  password: string,
) {
  const plaintext = await decryptJson<unknown>(envelope, password);
  // v2 encrypted payloads were unversioned. Preserve opaque ciphertext during
  // normal-only sync, and convert this known format only after authentication.
  if (typeof plaintext === 'object' && plaintext !== null && 'schemaVersion' in plaintext) {
    const current = z
      .object({ schemaVersion: z.literal(5) })
      .passthrough()
      .parse(plaintext);
    return spacePayloadSchema.parse(current);
  }
  return upgradeBackupPayload(plaintext);
}

// Legacy groups can be recovered before their IDs are mapped into the catalog.
function countNewlyRecovered(
  before: SpaceData,
  after: SpaceData,
  groupId?: string,
): ContainerRecovery | undefined {
  if (!groupId || !after.groups.some((group) => group.id === groupId)) return;
  function additions(kind: 'sites' | 'folders') {
    const existing = new Set(
      before[kind].filter((item) => item.groupId === groupId).map((item) => item.id),
    );
    return after[kind].filter((item) => item.groupId === groupId && !existing.has(item.id)).length;
  }
  const sites = additions('sites');
  const folders = additions('folders');
  const createdGroup = !before.groups.some((group) => group.id === groupId);
  if (createdGroup || sites || folders) return { groupId, sites, folders, createdGroup };
}

function mergeSpace(local: SpaceData, incoming: SpaceData) {
  const merge = <T extends { id: string; updatedAt: number }>(a: T[], b: T[]) => {
    const records = new Map(a.map((item) => [item.id, item]));
    for (const item of b)
      if (!records.has(item.id) || records.get(item.id)!.updatedAt < item.updatedAt)
        records.set(item.id, item);
    return [...records.values()];
  };
  const tombstones = merge(
    local.tombstones.map((item) => ({ ...item, updatedAt: item.deletedAt })),
    incoming.tombstones.map((item) => ({ ...item, updatedAt: item.deletedAt })),
  ).map(({ updatedAt: _, ...item }) => item);
  const deleted = new Set(tombstones.map((item) => `${item.entity}:${item.id}`));
  return reconcileMergedContainers({
    groups: merge(local.groups, incoming.groups).filter((item) => !deleted.has(`group:${item.id}`)),
    folders: merge(local.folders, incoming.folders).filter(
      (item) => !deleted.has(`folder:${item.id}`),
    ),
    sites: merge(local.sites, incoming.sites).filter((item) => !deleted.has(`site:${item.id}`)),
    tombstones,
  });
}

function diffSettings(
  normal: RayState['normalSettings'],
  privateSettings: RayState['normalSettings'],
) {
  return Object.fromEntries(
    Object.entries(privateSettings).filter(
      ([key, value]) =>
        JSON.stringify(normal[key as keyof typeof normal]) !== JSON.stringify(value),
    ),
  );
}
export function decodeResources(
  input: z.infer<typeof resourceSchema>[],
  output = new Map<string, Blob>(),
) {
  for (const item of input)
    output.set(item.id, new Blob([fromBase64(item.data)], { type: item.type }));
  return output;
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
