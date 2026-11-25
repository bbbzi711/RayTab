import { z } from '@/lib/zod';
import { AppError } from '@/lib/errors';
import {
  createLockedPrivateSpace,
  catalogUsageSchema,
  folderSchema,
  groupLabelSchema,
  groupSchema,
  rayStateSchema,
  siteSchema,
  spaceSettingsSchema,
  tombstoneSchema,
  type RayState,
  type SpaceData,
  type SpaceId,
} from './model';
import {
  assertCatalogCapacity,
  assertEncryptedGroupBoundary,
  emptyGroupId,
  isUserGroup,
} from './group-privacy';

const groupDataSchema = z.object({
  storage: z.literal('plain'),
  group: groupSchema,
  folders: z.array(folderSchema),
  sites: z.array(siteSchema),
  legacyPrivate: z.literal(true).optional(),
});
const encryptedLabelSchema = z.object({ storage: z.literal('vault'), group: groupLabelSchema });
const catalogSchema = z.object({
  schemaVersion: z.literal(6),
  revision: z.number().int().nonnegative(),
  groups: z.array(z.discriminatedUnion('storage', [groupDataSchema, encryptedLabelSchema])),
  tombstones: z.array(tombstoneSchema.extend({ legacyPrivate: z.literal(true).optional() })),
  settings: spaceSettingsSchema,
  legacySettings: rayStateSchema.shape.privateSettingOverrides.optional(),
  passwordProtected: z.boolean(),
  vaultIndex: z
    .object({
      hasLegacyGroups: z.boolean(),
      usage: catalogUsageSchema.optional(),
      folderIds: z.array(z.string()).optional(),
      siteIds: z.array(z.string()).optional(),
    })
    .optional(),
  local: z.object({
    homeMode: rayStateSchema.shape.local.shape.homeMode,
    onboardingComplete: z.boolean(),
    groupId: z.string(),
    legacyPrivateSelection: z.literal(true).optional(),
    folders: z.array(
      z.object({
        groupId: z.string(),
        folderId: z.string().nullable(),
        legacyPrivate: z.literal(true).optional(),
      }),
    ),
  }),
});

export type GroupCatalog = z.infer<typeof catalogSchema>;

// v5 is the in-memory view used by existing commands, importers and sync adapters.
// The on-disk directory owns the groups. Each accessible group's contents live with it.
export function encodeCatalog(state: RayState): GroupCatalog {
  assertCatalogCapacity(state);
  const groups: GroupCatalog['groups'] = [];
  const tombstones: GroupCatalog['tombstones'] = [];
  const folders: GroupCatalog['local']['folders'] = [];
  for (const source of ['normal', 'private'] as const) {
    if (source === 'private' && state.privateSecurity.protected) continue;
    const space = state.spaces[source];
    const legacy = source === 'private' ? { legacyPrivate: true as const } : {};
    const byId = new Map<string, z.infer<typeof groupDataSchema>>();
    for (const group of space.groups) {
      if (!isUserGroup(state, source, group)) continue;
      const entry: z.infer<typeof groupDataSchema> = {
        storage: 'plain',
        group,
        folders: [],
        sites: [],
        ...legacy,
      };
      groups.push(entry);
      byId.set(group.id, entry);
    }
    for (const folder of space.folders) byId.get(folder.groupId)!.folders.push(folder);
    for (const site of space.sites) byId.get(site.groupId)!.sites.push(site);
    for (const item of space.tombstones) tombstones.push({ ...item, ...legacy });
    for (const [groupId, folderId] of Object.entries(state.local.selectedFolder[source]))
      folders.push({ groupId, folderId, ...legacy });
  }
  const index = state.encryptedGroupIndex;
  for (const group of index?.labels ?? []) groups.push({ storage: 'vault', group });
  const active = state.privateSecurity.protected ? 'normal' : state.local.activeSpace;
  return {
    schemaVersion: 6,
    revision: state.revision,
    groups,
    tombstones,
    settings: state.normalSettings,
    ...(Object.keys(state.privateSettingOverrides).length && !state.privateSecurity.protected
      ? { legacySettings: state.privateSettingOverrides }
      : {}),
    passwordProtected: state.privateSecurity.protected,
    ...(index
      ? {
          vaultIndex: {
            hasLegacyGroups: index.hasLegacyGroups,
            usage: index.usage,
            folderIds: index.folderIds,
            siteIds: index.siteIds,
          },
        }
      : {}),
    local: {
      homeMode: state.local.homeMode,
      onboardingComplete: state.local.onboardingComplete,
      groupId: state.local.activeGroup[active],
      ...(active === 'private' ? { legacyPrivateSelection: true } : {}),
      folders,
    },
  };
}

function emptySpace(): SpaceData {
  return { groups: [], folders: [], sites: [], tombstones: [] };
}

export function decodeCatalog(value: unknown): RayState {
  const catalog = catalogSchema.parse(value);
  const spaces = { normal: emptySpace(), private: emptySpace() };
  const labels = [];
  if (
    catalog.passwordProtected &&
    (catalog.legacySettings ||
      catalog.groups.some((entry) => entry.storage === 'plain' && entry.legacyPrivate))
  )
    throw new AppError('navigation.encryptedGroupConflict');
  for (const entry of catalog.groups) {
    if (entry.storage === 'vault') {
      labels.push(entry.group);
      continue;
    }
    if (
      entry.folders.some((folder) => folder.groupId !== entry.group.id) ||
      entry.sites.some((site) => site.groupId !== entry.group.id)
    )
      throw new AppError('errors.model.missingSiteGroup');
    const space = entry.legacyPrivate ? spaces.private : spaces.normal;
    space.groups.push(entry.group);
    space.folders.push(...entry.folders);
    space.sites.push(...entry.sites);
  }
  for (const { legacyPrivate, ...item } of catalog.tombstones)
    spaces[legacyPrivate ? 'private' : 'normal'].tombstones.push(item);
  if (!spaces.private.groups.length) spaces.private.groups = createLockedPrivateSpace().groups;
  if (!spaces.normal.groups.length) {
    const id = emptyGroupId('normal');
    spaces.normal.groups.push({
      id,
      name: 'Home',
      order: 0,
      createdAt: 0,
      updatedAt: 0,
      changeId: id,
    });
  }
  const activeSpace: SpaceId = catalog.local.legacyPrivateSelection ? 'private' : 'normal';
  const activeGroup = { normal: spaces.normal.groups[0].id, private: spaces.private.groups[0].id };
  if (spaces[activeSpace].groups.some((group) => group.id === catalog.local.groupId))
    activeGroup[activeSpace] = catalog.local.groupId;
  const selectedFolder: RayState['local']['selectedFolder'] = { normal: {}, private: {} };
  for (const entry of catalog.local.folders)
    selectedFolder[entry.legacyPrivate ? 'private' : 'normal'][entry.groupId] = entry.folderId;
  if (labels.length && (!catalog.vaultIndex || !catalog.passwordProtected))
    throw new AppError('navigation.encryptedGroupConflict');
  const state = rayStateSchema.parse({
    schemaVersion: 5,
    revision: catalog.revision,
    spaces,
    normalSettings: catalog.settings,
    privateSettingOverrides: catalog.legacySettings ?? {},
    privateSecurity: { protected: catalog.passwordProtected, locked: catalog.passwordProtected },
    ...(catalog.vaultIndex ? { encryptedGroupIndex: { ...catalog.vaultIndex, labels } } : {}),
    local: {
      activeSpace,
      activeGroup,
      selectedFolder,
      homeMode: catalog.local.homeMode,
      onboardingComplete: catalog.local.onboardingComplete,
    },
  });
  assertEncryptedGroupBoundary(state);
  assertCatalogCapacity(state);
  return state;
}

// Legacy lists have unrelated order scales. Preserve their previous display order at conversion.
export function migrateGroupOrder(state: RayState) {
  const compare = (a: { id: string; order: number }, b: { id: string; order: number }) =>
    a.order - b.order || a.id.localeCompare(b.id);
  const ordinary = state.spaces.normal.groups.filter((group) =>
    isUserGroup(state, 'normal', group),
  );
  const privateGroups = state.privateSecurity.protected
    ? (state.encryptedGroupIndex?.labels ?? [])
    : state.spaces.private.groups.filter((group) => isUserGroup(state, 'private', group));
  if (!ordinary.length || !privateGroups.length) return;
  let order = Math.max(...ordinary.map((group) => group.order)) + 1;
  for (const group of [...privateGroups].sort(compare)) group.order = order++;
}
