import { AppError } from '@/lib/errors';
import { z } from 'zod';
import { decryptJson, encryptJson, encryptedEnvelopeSchema } from '@/security/crypto';
import {
  rayStateSchema,
  effectiveSettings,
  spaceDataSchema,
  spaceIdSchema,
  spaceSettingsSchema,
  spaceResourceIds,
  type RayState,
  type SpaceData,
  type SpaceId,
} from '@/storage/model';
import { upgradeSettings, upgradeV4Space } from '@/storage/upgrade-local';

const resourceSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  data: z.string(),
});
const spacePayloadSchema = z
  .object({
    data: spaceDataSchema,
    settings: spaceSettingsSchema,
    resources: z.array(resourceSchema),
  })
  .superRefine((payload, ctx) => {
    const ids = new Set(payload.resources.map((item) => item.id));
    for (const id of spaceResourceIds(payload.data, payload.settings))
      if (!ids.has(id))
        ctx.addIssue({
          code: 'custom',
          message: 'messages.anImageResourceIsMissingNoChangesWereSaved',
        });
  });
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
  z.object({ protected: z.literal(true), envelope: encryptedEnvelopeSchema }),
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
      ? {
          protected: true,
          envelope: await encryptJson({ schemaVersion: 5, ...payload }, privatePassword),
        }
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

export async function restoreBackup(
  current: RayState,
  document: BackupDocument,
  mode: 'merge' | 'replace',
  privatePassword?: string,
) {
  if (
    document.spaces.private &&
    current.privateSecurity.protected &&
    current.privateSecurity.locked
  )
    throw new AppError('messages.unlockThePrivateSpaceFirst');
  const next = rayStateSchema.parse(structuredClone(current));
  const resources = new Map<string, Blob>();
  if (document.spaces.normal) {
    next.spaces.normal =
      mode === 'replace'
        ? document.spaces.normal.data
        : mergeSpace(next.spaces.normal, document.spaces.normal.data);
    next.normalSettings = document.spaces.normal.settings;
    decodeResources(document.spaces.normal.resources, resources);
  }
  if (document.spaces.private) {
    const valid = await privateBackupPayload(document, privatePassword);
    if (!valid) throw new AppError('messages.theBackupFormatIsInvalidOrItsVersionIsUnsupported');
    next.spaces.private =
      mode === 'replace' ? valid.data : mergeSpace(next.spaces.private, valid.data);
    next.privateSettingOverrides = diffSettings(next.normalSettings, valid.settings);
    decodeResources(valid.resources, resources);
  }
  for (const spaceId of spaceIdSchema.options) {
    if (!next.spaces[spaceId].groups.some((item) => item.id === next.local.activeGroup[spaceId]))
      next.local.activeGroup[spaceId] = next.spaces[spaceId].groups[0].id;
  }
  return { state: rayStateSchema.parse(next), resources };
}

export function backupSummary(document: BackupDocument) {
  const count = (payload?: z.infer<typeof spacePayloadSchema>) =>
    payload
      ? {
          groups: payload.data.groups.length,
          folders: payload.data.folders.length,
          sites: payload.data.sites.length,
          resources: payload.resources.length,
        }
      : undefined;
  return {
    normal: count(document.spaces.normal),
    private: document.spaces.private?.protected
      ? { protected: true }
      : count(document.spaces.private?.payload),
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

export async function privateBackupPayload(document: BackupDocument, password?: string) {
  const privateSpace = document.spaces.private;
  if (!privateSpace) return undefined;
  if (!privateSpace.protected) return privateSpace.payload;
  const plaintext = await decryptJson<unknown>(privateSpace.envelope, password ?? '');
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

function mergeSpace(local: SpaceData, incoming: SpaceData): SpaceData {
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
  return spaceDataSchema.parse({
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
