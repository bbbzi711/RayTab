import { z } from 'zod';
import { decryptJson, encryptJson, encryptedEnvelopeSchema } from '@/security/crypto';
import {
  rayStateSchema,
  spaceDataSchema,
  spaceIdSchema,
  spaceSettingsSchema,
  type RayState,
  type SpaceData,
  type SpaceId,
} from '@/storage/model';

const resourceSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  data: z.string(),
});
const spacePayloadSchema = z.object({
  data: spaceDataSchema,
  settings: spaceSettingsSchema,
  resources: z.array(resourceSchema),
});
const privatePayloadSchema = z.discriminatedUnion('protected', [
  z.object({ protected: z.literal(false), payload: spacePayloadSchema }),
  z.object({ protected: z.literal(true), envelope: encryptedEnvelopeSchema }),
]);
export const backupSchema = z.object({
  format: z.literal('raytab-backup'),
  version: z.literal(1),
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
  const document: BackupDocument = {
    format: 'raytab-backup',
    version: 1,
    createdAt: new Date().toISOString(),
    spaces: {},
  };
  if (range === 'all' || range === 'normal')
    document.spaces.normal = await payloadFor(state, resources, 'normal');
  if (range === 'all' || range === 'private') {
    const payload = await payloadFor(state, resources, 'private');
    document.spaces.private = privatePassword
      ? { protected: true, envelope: await encryptJson(payload, privatePassword) }
      : { protected: false, payload };
  }
  return backupSchema.parse(document);
}

export async function parseBackup(input: string | unknown) {
  let value: unknown;
  try {
    value = typeof input === 'string' ? JSON.parse(input) : input;
  } catch {
    throw new Error('备份文件不是有效的 JSON');
  }
  const parsed = backupSchema.safeParse(value);
  if (!parsed.success) throw new Error('备份格式无效或版本不受支持');
  return parsed.data;
}

export async function restoreBackup(
  current: RayState,
  document: BackupDocument,
  mode: 'merge' | 'replace',
  privatePassword?: string,
) {
  const next = rayStateSchema.parse(structuredClone(current));
  const resources = new Map<string, Blob>();
  if (document.spaces.normal) {
    next.spaces.normal =
      mode === 'replace'
        ? document.spaces.normal.data
        : mergeSpace(next.spaces.normal, document.spaces.normal.data);
    next.normalSettings = document.spaces.normal.settings;
    await decodeResources(document.spaces.normal.resources, resources);
  }
  if (document.spaces.private) {
    const payload = document.spaces.private.protected
      ? await decryptJson<z.infer<typeof spacePayloadSchema>>(
          document.spaces.private.envelope,
          privatePassword ?? '',
        )
      : document.spaces.private.payload;
    const valid = spacePayloadSchema.parse(payload);
    next.spaces.private =
      mode === 'replace' ? valid.data : mergeSpace(next.spaces.private, valid.data);
    next.privateSettingOverrides = diffSettings(next.normalSettings, valid.settings);
    await decodeResources(valid.resources, resources);
  }
  for (const spaceId of spaceIdSchema.options) {
    if (
      !next.spaces[spaceId].desktops.some((item) => item.id === next.local.activeDesktop[spaceId])
    )
      next.local.activeDesktop[spaceId] = next.spaces[spaceId].desktops[0].id;
  }
  return { state: rayStateSchema.parse(next), resources };
}

export function backupSummary(document: BackupDocument) {
  const count = (payload?: z.infer<typeof spacePayloadSchema>) =>
    payload
      ? {
          desktops: payload.data.desktops.length,
          categories: payload.data.categories.length,
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
  const ids = new Set(
    space.sites.map((item) => item.iconId).filter((id): id is string => Boolean(id)),
  );
  const settings =
    spaceId === 'normal'
      ? state.normalSettings
      : { ...state.normalSettings, ...state.privateSettingOverrides };
  if (settings.wallpaperId) ids.add(settings.wallpaperId);
  const encoded = [];
  for (const id of ids) {
    const blob = resources.get(id);
    if (!blob) throw new Error(`备份需要的资源 ${id} 不存在`);
    encoded.push({
      id,
      type: blob.type || 'application/octet-stream',
      data: await blobToBase64(blob),
    });
  }
  return spacePayloadSchema.parse({ data: space, settings, resources: encoded });
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
    desktops: merge(local.desktops, incoming.desktops).filter(
      (item) => !deleted.has(`desktop:${item.id}`),
    ),
    categories: merge(local.categories, incoming.categories).filter(
      (item) => !deleted.has(`category:${item.id}`),
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
      ([key, value]) => normal[key as keyof typeof normal] !== value,
    ),
  );
}
async function decodeResources(input: z.infer<typeof resourceSchema>[], output: Map<string, Blob>) {
  for (const item of input)
    output.set(item.id, new Blob([fromBase64(item.data)], { type: item.type }));
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
