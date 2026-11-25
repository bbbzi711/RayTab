import { AppError } from '@/lib/errors';
import { isStoredPrivateGroup } from './group-privacy';
import { z } from '@/lib/zod';
import {
  createVaultKey,
  encryptJson,
  importVaultKey,
  openChunk,
  sealChunk,
  type EncryptedEnvelope,
  type VaultChunk,
} from '@/security/crypto';
import {
  createLockedPrivateSpace,
  groupSchema,
  folderSchema,
  siteSchema,
  tombstoneSchema,
  rayStateSchema,
  type RayState,
} from './model';

const groupBody = z.object({
  group: groupSchema,
  folders: z.array(folderSchema),
  sites: z.array(siteSchema),
});
const resourceBody = z.object({ id: z.string(), type: z.string(), data: z.string() });
const reference = z.object({ id: z.string(), slot: z.uuid() });
const manifestSchema = z.object({
  format: z.literal('raytab-group-vault'),
  version: z.literal(1),
  key: z.string(),
  groups: z.array(reference),
  resources: z.array(reference),
  tombstones: z.array(tombstoneSchema),
  overrides: rayStateSchema.shape.privateSettingOverrides,
});
type Manifest = z.infer<typeof manifestSchema>;
export type SerializedVault = {
  schemaVersion: 5;
  space: RayState['spaces']['private'];
  overrides: RayState['privateSettingOverrides'];
  resources: z.infer<typeof resourceBody>[];
};
type SavedChunk = { slot: string; json: string };
export type VaultCache = {
  key: CryptoKey;
  manifest: Manifest;
  groups: Map<string, SavedChunk>;
  resources: Map<string, SavedChunk>;
};
export type VaultWrite = { chunks: Map<string, VaultChunk>; keep: Set<string> };
const aad = (kind: 'groups' | 'resources', ref: z.infer<typeof reference>) =>
  JSON.stringify(['raytab-local-vault', 1, kind, ref.id, ref.slot]);

export async function prepareGroupVault(
  payload: SerializedVault,
  password: string,
  previous?: VaultCache,
  existingEnvelope?: EncryptedEnvelope,
) {
  const secret = previous
    ? { key: previous.key, encoded: previous.manifest.key }
    : await createVaultKey();
  const manifest: Manifest = {
    format: 'raytab-group-vault',
    version: 1,
    key: secret.encoded,
    groups: [],
    resources: [],
    tombstones: payload.space.tombstones,
    overrides: payload.overrides,
  };
  const cache: VaultCache = { key: secret.key, manifest, groups: new Map(), resources: new Map() };
  const write: VaultWrite = { chunks: new Map(), keep: new Set() };
  const save = async (kind: 'groups' | 'resources', id: string, data: unknown) => {
    const json = JSON.stringify(data);
    const old = previous?.[kind].get(id);
    const ref = { id, slot: old?.slot ?? crypto.randomUUID() };
    if (old?.json !== json)
      write.chunks.set(ref.slot, await sealChunk(data, secret.key, aad(kind, ref)));
    cache[kind].set(id, { slot: ref.slot, json });
    manifest[kind].push(ref);
    write.keep.add(ref.slot);
  };
  const bodies = new Map(
    payload.space.groups.map((group) => [
      group.id,
      {
        group,
        folders: [] as RayState['spaces']['private']['folders'],
        sites: [] as RayState['spaces']['private']['sites'],
      },
    ]),
  );
  for (const folder of payload.space.folders) bodies.get(folder.groupId)!.folders.push(folder);
  for (const site of payload.space.sites) bodies.get(site.groupId)!.sites.push(site);
  for (const body of bodies.values()) {
    if (isStoredPrivateGroup(payload.space, body.group)) await save('groups', body.group.id, body);
  }
  for (const resource of payload.resources) await save('resources', resource.id, resource);
  const unchanged =
    existingEnvelope &&
    !write.chunks.size &&
    previous &&
    JSON.stringify(manifest) === JSON.stringify(previous.manifest);
  return {
    envelope: unchanged ? existingEnvelope : await encryptJson(manifest, password),
    write,
    cache,
  };
}

export async function readGroupVault(
  plain: unknown,
  load: (slots: string[]) => Promise<unknown[]>,
) {
  if (
    !plain ||
    typeof plain !== 'object' ||
    !('format' in plain) ||
    plain.format !== 'raytab-group-vault'
  )
    return undefined;
  const manifest = manifestSchema.parse(plain);
  const key = await importVaultKey(manifest.key);
  const slots = [...manifest.groups, ...manifest.resources].map((ref) => ref.slot);
  if (new Set(slots).size !== slots.length)
    throw new AppError('messages.thePasswordIsIncorrectOrTheEncryptedDataIsDamaged');
  const records = await load(slots);
  const cache: VaultCache = { key, manifest, groups: new Map(), resources: new Map() };
  const payload: SerializedVault = {
    schemaVersion: 5,
    space: { groups: [], sites: [], folders: [], tombstones: manifest.tombstones },
    overrides: manifest.overrides,
    resources: [],
  };
  let index = 0;
  for (const kind of ['groups', 'resources'] as const)
    for (const ref of manifest[kind]) {
      if (cache[kind].has(ref.id))
        throw new AppError('messages.thePasswordIsIncorrectOrTheEncryptedDataIsDamaged');
      const value = await openChunk(records[index++], key, aad(kind, ref));
      cache[kind].set(ref.id, { slot: ref.slot, json: JSON.stringify(value) });
      if (kind === 'groups') {
        const body = groupBody.parse(value);
        if (
          body.group.id !== ref.id ||
          body.sites.some((site) => site.groupId !== ref.id) ||
          body.folders.some((folder) => folder.groupId !== ref.id)
        )
          throw new AppError('messages.thePasswordIsIncorrectOrTheEncryptedDataIsDamaged');
        payload.space.groups.push(body.group);
        payload.space.sites.push(...body.sites);
        payload.space.folders.push(...body.folders);
      } else {
        const resource = resourceBody.parse(value);
        if (resource.id !== ref.id)
          throw new AppError('messages.thePasswordIsIncorrectOrTheEncryptedDataIsDamaged');
        payload.resources.push(resource);
      }
    }
  if (!payload.space.groups.length) payload.space.groups = createLockedPrivateSpace().groups;
  return { payload, cache };
}
