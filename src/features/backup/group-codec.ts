import { AppError } from '@/lib/errors';
import { z } from '@/lib/zod';
import {
  createVaultKey,
  decryptJson,
  encryptedEnvelopeSchema,
  encryptJson,
  importVaultKey,
  openChunk,
  sealChunk,
  vaultChunkSchema,
} from '@/security/crypto';
import { emptyGroupId, isPlaceholderGroup } from '@/storage/group-privacy';
import {
  catalogLimits,
  createLockedPrivateSpace,
  groupSchema,
  rayStateSchema,
  spaceDataSchema,
  spaceResourceIds,
  spaceSettingsSchema,
} from '@/storage/model';

const invalid = () => new AppError('messages.theBackupFormatIsInvalidOrItsVersionIsUnsupported');
export const resourceSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  data: z.string(),
});
export const payloadSchema = z
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
export type Payload = z.infer<typeof payloadSchema>;
const ordinaryRevision = z.object({ id: groupSchema.shape.id, digest: z.string() });
export type OrdinaryRevision = z.infer<typeof ordinaryRevision>;
export async function ordinaryRevisions(payload?: Payload): Promise<OrdinaryRevision[]> {
  if (!payload) return [];
  return Promise.all(
    split(payload).map(async ({ group, folders, sites }) => {
      const byId = (a: { id: string }, b: { id: string }) =>
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      const content = JSON.stringify({
        group,
        folders: folders.sort(byId),
        sites: sites.sort(byId),
      });
      const hashed = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
      return {
        id: group.id,
        digest: Array.from(new Uint8Array(hashed), (byte) =>
          byte.toString(16).padStart(2, '0'),
        ).join(''),
      };
    }),
  );
}

const encryptedIndex = rayStateSchema.shape.encryptedGroupIndex.unwrap();
const groupBodySchema = z.object({
  group: groupSchema,
  folders: spaceDataSchema.shape.folders,
  sites: spaceDataSchema.shape.sites,
});
const groupRefsSchema = z.object({
  id: groupSchema.shape.id,
  folderIds: encryptedIndex.shape.folderIds.unwrap(),
  siteIds: encryptedIndex.shape.siteIds.unwrap(),
});
const sealedGroupSchema = groupRefsSchema.extend({ chunk: vaultChunkSchema });
export const sealedGroupsSchema = z.array(sealedGroupSchema).max(catalogLimits.groups);
const sectionSchema = z.object({
  settings: spaceSettingsSchema,
  resources: z.array(resourceSchema),
  tombstones: spaceDataSchema.shape.tombstones,
});
const groupEntrySchema = z.discriminatedUnion('protection', [
  groupBodySchema.extend({
    protection: z.literal('none'),
    legacyProfile: z.literal(true).optional(),
  }),
  sealedGroupSchema.extend({ protection: z.literal('password') }),
]);

// v2/v3 used a single encrypted payload. A client syncing only ordinary groups
// must preserve that opaque envelope until an authenticated upgrade is possible.
const portableSchema = z.object({
  format: z.literal('raytab-backup'),
  version: z.literal(4),
  coverage: z.enum(['all', 'normal', 'private']),
  createdAt: z.string().datetime(),
  groups: z.array(groupEntrySchema).max(catalogLimits.groups),
  preferences: sectionSchema.optional(),
  legacyPreferences: sectionSchema.optional(),
  protection: z
    .object({
      format: z.enum(['groups', 'legacy']),
      archiveOnly: z.literal(true).optional(),
      envelope: encryptedEnvelopeSchema,
    })
    .optional(),
});

type PlainGroup = z.infer<typeof groupBodySchema>;
type Protected = {
  protected: true;
  envelope: z.infer<typeof encryptedEnvelopeSchema>;
  groups?: z.infer<typeof sealedGroupsSchema>;
  archiveOnly?: true;
};
type Private = Protected | { protected: false; payload: Payload };
type Adapter = {
  format: 'raytab-backup';
  version: 3;
  createdAt: string;
  spaces: { normal?: Payload; private?: Private };
};

function split(payload: Payload) {
  const groups: PlainGroup[] = payload.data.groups.map((group) => ({
    group,
    folders: [],
    sites: [],
  }));
  const byId = new Map(groups.map((body) => [body.group.id, body]));
  for (const folder of payload.data.folders) byId.get(folder.groupId)!.folders.push(folder);
  for (const site of payload.data.sites) byId.get(site.groupId)!.sites.push(site);
  return groups.filter(
    ({ group, sites, folders }) =>
      !isPlaceholderGroup(group.id) &&
      !(
        group.id === 'private-group-home' &&
        group.updatedAt === 0 &&
        group.hidden === undefined &&
        !sites.length &&
        !folders.length
      ),
  );
}
function header(payload: Payload) {
  return {
    settings: payload.settings,
    resources: payload.resources,
    tombstones: payload.data.tombstones,
  };
}
function join(
  groups: PlainGroup[],
  section: z.infer<typeof sectionSchema>,
  scope: 'normal' | 'private',
) {
  if (
    groups.some((body) =>
      [...body.sites, ...body.folders].some((record) => record.groupId !== body.group.id),
    )
  )
    throw invalid();
  return payloadSchema.parse({
    data: {
      groups: groups.length
        ? groups.map((body) => body.group)
        : [
            scope === 'private'
              ? createLockedPrivateSpace().groups[0]
              : {
                  id: emptyGroupId('normal'),
                  name: 'Home',
                  order: 0,
                  createdAt: 0,
                  updatedAt: 0,
                  changeId: emptyGroupId('normal'),
                },
          ],
      folders: groups.flatMap((body) => body.folders),
      sites: groups.flatMap((body) => body.sites),
      tombstones: section.tombstones,
    },
    settings: section.settings,
    resources: section.resources,
  });
}
function refs(body: PlainGroup) {
  return {
    id: body.group.id,
    folderIds: body.folders.map((r) => r.id),
    siteIds: body.sites.map((r) => r.id),
  };
}
function assertBoundary(doc: Adapter) {
  const entries = doc.spaces.private?.protected && doc.spaces.private.groups;
  if (!entries || !doc.spaces.normal) return;
  const { data } = doc.spaces.normal;
  const groups = new Set(data.groups.map((g) => g.id));
  const children = new Set([...data.sites, ...data.folders].map((r) => r.id));
  if (
    entries.some(
      (entry) =>
        groups.has(entry.id) ||
        [...entry.folderIds, ...entry.siteIds].some((id) => children.has(id)),
    )
  )
    throw new AppError('navigation.encryptedGroupConflict');
}
export function encodeBackup(doc: Adapter): z.infer<typeof portableSchema> {
  assertBoundary(doc);
  const { normal, private: privateData } = doc.spaces;
  const groups: z.infer<typeof groupEntrySchema>[] = [];
  if (normal)
    groups.push(...split(normal).map((body) => ({ protection: 'none' as const, ...body })));
  if (privateData && !privateData.protected)
    groups.push(
      ...split(privateData.payload).map((body) => ({
        protection: 'none' as const,
        legacyProfile: true as const,
        ...body,
      })),
    );
  if (privateData?.protected && privateData.groups)
    groups.push(
      ...privateData.groups.map((group) => ({ protection: 'password' as const, ...group })),
    );
  const hasLegacyPreferences =
    privateData &&
    !privateData.protected &&
    (!normal ||
      groups.some((body) => body.protection === 'none' && body.legacyProfile) ||
      privateData.payload.data.tombstones.length ||
      JSON.stringify(privateData.payload.settings) !== JSON.stringify(normal.settings));
  return {
    format: doc.format,
    version: 4,
    coverage: normal ? (privateData ? 'all' : 'normal') : 'private',
    createdAt: doc.createdAt,
    groups,
    ...(normal && { preferences: header(normal) }),
    ...(hasLegacyPreferences &&
      privateData &&
      !privateData.protected && { legacyPreferences: header(privateData.payload) }),
    ...(privateData?.protected && {
      protection: {
        format: privateData.groups ? 'groups' : 'legacy',
        envelope: privateData.envelope,
        ...(privateData.archiveOnly && { archiveOnly: true as const }),
      },
    }),
  };
}
export function decodePortable(input: unknown): Adapter {
  const parsed = portableSchema.safeParse(input);
  if (!parsed.success) throw invalid();
  const { coverage, createdAt, groups, preferences, legacyPreferences, protection } = parsed.data;
  const open: PlainGroup[] = [];
  const legacy: PlainGroup[] = [];
  const sealed: z.infer<typeof sealedGroupsSchema> = [];
  for (const group of groups) {
    if (group.protection === 'password') sealed.push(sealedGroupSchema.parse(group));
    else (group.legacyProfile ? legacy : open).push(group);
  }
  if (
    (coverage !== 'private') !== Boolean(preferences) ||
    (coverage === 'normal' && (protection || legacyPreferences)) ||
    (!preferences && open.length) ||
    (!legacyPreferences && legacy.length) ||
    (legacyPreferences && protection) ||
    (protection?.archiveOnly && protection.format !== 'groups') ||
    (protection?.format !== 'groups' && sealed.length) ||
    sealed.length !== new Set(sealed.map((group) => group.id)).size ||
    (!preferences && !legacyPreferences && !protection)
  )
    throw invalid();
  const doc: Adapter = { format: 'raytab-backup', version: 3, createdAt, spaces: {} };
  if (preferences) doc.spaces.normal = join(open, preferences, 'normal');
  if (legacyPreferences)
    doc.spaces.private = { protected: false, payload: join(legacy, legacyPreferences, 'private') };
  if (coverage === 'all' && preferences && !legacyPreferences && !protection)
    doc.spaces.private = {
      protected: false,
      payload: join(
        [],
        {
          settings: preferences.settings,
          tombstones: [],
          resources: preferences.resources.filter(
            (item) => item.id === preferences.settings.wallpaperId,
          ),
        },
        'private',
      ),
    };
  if (protection)
    doc.spaces.private = {
      protected: true,
      envelope: protection.envelope,
      ...(protection.archiveOnly && { archiveOnly: true }),
      ...(protection.format === 'groups' && { groups: sealed }),
    };
  assertBoundary(doc);
  return doc;
}

const protectedHeaderSchema = sectionSchema.extend({
  packet: z.string(),
  key: z.string(),
  archiveOnly: z.boolean(),
  ordinaryRevisions: z.array(ordinaryRevision).max(catalogLimits.groups),
  groups: z.array(groupRefsSchema).max(catalogLimits.groups),
});
const protectedBodySchema = groupBodySchema.extend({
  packet: z.string(),
  resources: z.array(resourceSchema),
});
export async function protectPayload(
  payload: Payload,
  password: string,
  archiveOnly = false,
  ordinary: OrdinaryRevision[] = [],
): Promise<Protected> {
  const packet = crypto.randomUUID();
  const { key, encoded } = await createVaultKey();
  const bodies = split(payload);
  const resources = new Map(payload.resources.map((r) => [r.id, r]));
  const groups: z.infer<typeof sealedGroupsSchema> = [];
  const assigned = new Set<string>();
  for (const body of bodies) {
    const ids = new Set(
      body.sites.flatMap(({ icon }) =>
        'resourceId' in icon && icon.resourceId ? [icon.resourceId] : [],
      ),
    );
    const images = [...ids].map((id) => {
      const asset = resources.get(id);
      if (!asset) throw new AppError('errors.backup.missingResource', { id });
      assigned.add(id);
      return asset;
    });
    groups.push({
      ...refs(body),
      chunk: await sealChunk(
        { ...body, packet, resources: images },
        key,
        JSON.stringify(['raytab-backup', 4, packet, body.group.id]),
      ),
    });
  }
  const envelope = await encryptJson(
    {
      ...header(payload),
      resources: payload.resources.filter((r) => !assigned.has(r.id)),
      packet,
      key: encoded,
      archiveOnly,
      ordinaryRevisions: ordinary,
      groups: bodies.map(refs),
    },
    password,
  );
  return { protected: true, envelope, groups, ...(archiveOnly && { archiveOnly: true }) };
}
export async function openProtectedGroups(part: Protected, password: string) {
  const section = protectedHeaderSchema.parse(await decryptJson(part.envelope, password));
  if (section.archiveOnly !== Boolean(part.archiveOnly)) throw invalid();
  const groups = part.groups ?? [];
  const key = await importVaultKey(section.key);
  if (
    JSON.stringify(groups.map((g) => groupRefsSchema.parse(g))) !== JSON.stringify(section.groups)
  )
    throw invalid();
  const resources = new Map(section.resources.map((item) => [item.id, item]));
  const bodies: PlainGroup[] = [];
  for (const group of groups) {
    const body = protectedBodySchema.parse(
      await openChunk(
        group.chunk,
        key,
        JSON.stringify(['raytab-backup', 4, section.packet, group.id]),
      ),
    );
    if (
      body.packet !== section.packet ||
      JSON.stringify(refs(body)) !== JSON.stringify(groupRefsSchema.parse(group))
    )
      throw invalid();
    for (const item of body.resources) {
      const previous = resources.get(item.id);
      if (previous && (previous.type !== item.type || previous.data !== item.data)) throw invalid();
      resources.set(item.id, item);
    }
    bodies.push(body);
  }
  return {
    ...join(bodies, { ...section, resources: [...resources.values()] }, 'private'),
    ordinaryRevisions: section.ordinaryRevisions,
  };
}
