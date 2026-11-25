import { AppError } from '@/lib/errors';
import {
  groupLabelSchema,
  catalogLimits,
  type Group,
  type GroupLabel,
  type RayState,
  type SpaceData,
  type SpaceId,
} from './model';

export type GroupTab = GroupLabel & { spaceId: SpaceId; encrypted: boolean; hidden: boolean };

export const emptyGroupId = (spaceId: SpaceId) => `raytab-empty-${spaceId}`;
export const isPlaceholderGroup = (id: string) =>
  id === emptyGroupId('normal') || id === emptyGroupId('private');

export function ensureSpaceGroup(state: RayState, spaceId: SpaceId) {
  const groups = state.spaces[spaceId].groups;
  if (!groups.length) {
    const id = emptyGroupId(spaceId);
    groups.push({ id, name: 'Home', order: 0, createdAt: 0, updatedAt: 0, changeId: id });
  }
  return groups.find((group) => isUserGroup(state, spaceId, group)) ?? groups[0];
}

export function isUserGroup(state: RayState, spaceId: SpaceId, group: Group) {
  return (
    !isPlaceholderGroup(group.id) &&
    (spaceId === 'normal' || isStoredPrivateGroup(state.spaces.private, group))
  );
}

export function isStoredPrivateGroup(space: SpaceData, group: Group) {
  if (isPlaceholderGroup(group.id)) return false;
  return (
    group.id !== 'private-group-home' ||
    group.updatedAt !== 0 ||
    group.hidden !== undefined ||
    space.folders.some((folder) => folder.groupId === group.id) ||
    space.sites.some((site) => site.groupId === group.id)
  );
}

function catalogUsage(state: RayState, id: SpaceId) {
  const space = state.spaces[id];
  return {
    groups: space.groups.filter((group) => isUserGroup(state, id, group)).length,
    sites: space.sites.length,
    folders: space.folders.length,
    tombstones: space.tombstones.length,
  };
}

export function assertCatalogCapacity(state: RayState) {
  const ordinary = catalogUsage(state, 'normal');
  // Locked pre-catalog vaults disclose no counts. Their published maximum was
  // half of today's shared limit; use that reservation until authentication.
  const protectedUsage =
    state.privateSecurity.protected && state.privateSecurity.locked
      ? (state.encryptedGroupIndex?.usage ?? {
          groups: 200,
          folders: 2000,
          sites: 10000,
          tombstones: 20000,
        })
      : catalogUsage(state, 'private');
  for (const field of ['groups', 'folders', 'sites', 'tombstones'] as const)
    if (ordinary[field] + protectedUsage[field] > catalogLimits[field])
      throw new AppError('errors.invalidInput');
}

export function indexEncryptedGroups(
  state: RayState,
): NonNullable<RayState['encryptedGroupIndex']> {
  const groups = state.spaces.private.groups.filter((group) =>
    isUserGroup(state, 'private', group),
  );
  const labels = groups.filter((group) => group.hidden !== undefined);
  const groupIds = new Set(labels.map((group) => group.id));
  return {
    labels: labels.map((group) => groupLabelSchema.parse(group)),
    hasLegacyGroups: groups.length !== labels.length,
    usage: catalogUsage(state, 'private'),
    folderIds: state.spaces.private.folders
      .filter((folder) => groupIds.has(folder.groupId))
      .map((folder) => folder.id),
    siteIds: state.spaces.private.sites
      .filter((site) => groupIds.has(site.groupId))
      .map((site) => site.id),
  };
}

export function assertEncryptedGroupBoundary(
  state: RayState,
  incoming?: RayState['encryptedGroupIndex'],
) {
  const current = state.privateSecurity.protected ? state.encryptedGroupIndex : undefined;
  const groupIds = new Set(
    [...(current?.labels ?? []), ...(incoming?.labels ?? [])].map((group) => group.id),
  );
  const folderIds = new Set([...(current?.folderIds ?? []), ...(incoming?.folderIds ?? [])]);
  const siteIds = new Set([...(current?.siteIds ?? []), ...(incoming?.siteIds ?? [])]);
  const normal = state.spaces.normal;
  if (
    normal.groups.some((group) => groupIds.has(group.id)) ||
    normal.folders.some((folder) => folderIds.has(folder.id)) ||
    normal.sites.some((site) => siteIds.has(site.id))
  )
    throw new AppError('navigation.encryptedGroupConflict');
}

function migratedIds(existing: string[], incoming: string[]) {
  const occupied = new Set(existing);
  const reserved = new Set([...existing, ...incoming]);
  const ids = new Map<string, string>();
  for (const id of incoming) {
    let assigned = id;
    if (occupied.has(id)) {
      let number = 0;
      do {
        const suffix = '-migrated-' + ++number;
        assigned = id.slice(0, 100 - suffix.length) + suffix;
      } while (reserved.has(assigned));
      reserved.add(assigned);
    }
    ids.set(id, assigned);
  }
  return ids;
}

export function adoptLegacyEncryptedGroups(state: RayState) {
  const privateSpace = state.spaces.private;
  const groupIds = migratedIds(
    state.spaces.normal.groups.map((g) => g.id),
    privateSpace.groups.map((g) => g.id),
  );
  const recordIds = migratedIds(
    [...state.spaces.normal.folders, ...state.spaces.normal.sites].map((item) => item.id),
    [...privateSpace.folders, ...privateSpace.sites].map((item) => item.id),
  );
  for (const group of privateSpace.groups) {
    if (!isUserGroup(state, 'private', group) || group.hidden !== undefined) continue;
    if (groupIds.get(group.id) !== group.id) {
      const previous = group.id;
      group.id = groupIds.get(previous)!;
      for (const record of [...privateSpace.folders, ...privateSpace.sites])
        if (record.groupId === previous) record.groupId = group.id;
    }
    Object.assign(group, {
      hidden: true,
      manualIconFetchOnly: true,
      updatedAt: Math.max(Date.now(), group.updatedAt + 1),
      changeId: crypto.randomUUID(),
    });
    for (const folder of privateSpace.folders) {
      if (folder.groupId !== group.id || recordIds.get(folder.id) === folder.id) continue;
      const previous = folder.id;
      folder.id = recordIds.get(previous)!;
      for (const site of privateSpace.sites)
        if (site.folderId === previous) site.folderId = folder.id;
    }
    for (const site of privateSpace.sites)
      if (site.groupId === group.id) site.id = recordIds.get(site.id)!;
  }
}

export function listGroupTabs(state: RayState) {
  const { protected: encrypted, locked } = state.privateSecurity;
  const normal = state.spaces.normal.groups.filter((group) => isUserGroup(state, 'normal', group));
  const privateGroups =
    encrypted && locked
      ? (state.encryptedGroupIndex?.labels ?? [])
      : state.spaces.private.groups.filter((group) => isUserGroup(state, 'private', group));
  const tab = (group: GroupLabel, spaceId: SpaceId): GroupTab => ({
    ...groupLabelSchema.parse(group),
    spaceId,
    encrypted: spaceId === 'private' && encrypted,
    hidden: group.hidden ?? spaceId === 'private',
  });
  const order = (a: GroupLabel, b: GroupLabel) => a.order - b.order || a.id.localeCompare(b.id);
  return [
    ...normal.map((group) => tab(group, 'normal')),
    ...privateGroups.map((group) => tab(group, 'private')),
  ].sort(order);
}

export type GroupPrivacyTarget = { spaceId: SpaceId; groupId: string };

export function transferGroup(state: RayState, target: GroupPrivacyTarget, destinationId: SpaceId) {
  const source = state.spaces[target.spaceId];
  const destination = state.spaces[destinationId];
  const group = source.groups.find((item) => item.id === target.groupId);
  if (!group || !isUserGroup(state, target.spaceId, group))
    throw new AppError('messages.theDestinationGroupDoesNotExist');
  const groupId = destination.groups.some((item) => item.id === group.id)
    ? crypto.randomUUID()
    : group.id;
  const folders = source.folders.filter((item) => item.groupId === group.id);
  const sites = source.sites.filter((item) => item.groupId === group.id);
  const folderIds = new Map<string, string>();
  const destinationIds = new Set(
    [...destination.folders, ...destination.sites].map((item) => item.id),
  );

  function moveRecord<T extends { id: string; updatedAt: number }>(
    item: T,
    entity: 'group' | 'folder' | 'site',
    id: string,
  ) {
    const updatedAt = Math.max(Date.now(), item.updatedAt + 1);
    const changeId = crypto.randomUUID();
    source.tombstones = source.tombstones.filter(
      (entry) => entry.id !== item.id || entry.entity !== entity,
    );
    source.tombstones.push({ id: item.id, entity, deletedAt: updatedAt, changeId });
    destination.tombstones = destination.tombstones.filter(
      (entry) => entry.id !== id || entry.entity !== entity,
    );
    return { ...item, id, updatedAt, changeId };
  }

  destination.groups.push({
    ...moveRecord(group, 'group', groupId),
    hidden: group.hidden ?? target.spaceId === 'private',
  });
  for (const folder of folders) {
    const id = destinationIds.has(folder.id) ? crypto.randomUUID() : folder.id;
    destinationIds.add(id);
    folderIds.set(folder.id, id);
    destination.folders.push({ ...moveRecord(folder, 'folder', id), groupId });
  }
  for (const site of sites) {
    const id = destinationIds.has(site.id) ? crypto.randomUUID() : site.id;
    destinationIds.add(id);
    destination.sites.push({
      ...moveRecord(site, 'site', id),
      groupId,
      folderId: site.folderId ? folderIds.get(site.folderId)! : null,
    });
  }

  source.groups = source.groups.filter((item) => item.id !== group.id);
  source.folders = source.folders.filter((item) => item.groupId !== group.id);
  source.sites = source.sites.filter((item) => item.groupId !== group.id);
  const fallback = ensureSpaceGroup(state, target.spaceId);
  if (state.local.activeGroup[target.spaceId] === group.id) {
    state.local.activeGroup[target.spaceId] = fallback.id;
    if (state.local.activeSpace === target.spaceId) {
      state.local.activeSpace = destinationId;
      state.local.activeGroup[destinationId] = groupId;
      state.local.selectedFolder[destinationId] = {};
    }
  }
  delete state.local.selectedFolder[target.spaceId][group.id];
}

// Older releases allowed unprotected content in the private workspace. Fold those
// groups into the common catalog without changing the visibility users saw.
export function normalizePlainGroups(state: RayState, mode: 'legacy' | 'unprotect' = 'legacy') {
  if (state.privateSecurity.protected) return;
  const source = state.spaces.private;
  const target = state.spaces.normal;
  const groups = source.groups.filter((group) => isUserGroup(state, 'private', group));
  if (!groups.length) return;
  const groupIds = migratedIds(
    target.groups.map((x) => x.id),
    groups.map((x) => x.id),
  );
  const itemIds = migratedIds(
    [...target.folders, ...target.sites].map((x) => x.id),
    [...source.folders, ...source.sites].map((x) => x.id),
  );
  const destinationDeletes = new Map(
    target.tombstones.map((entry) => [entry.entity + ':' + entry.id, entry]),
  );
  function publish(
    entity: 'group' | 'folder' | 'site',
    record: { id: string; updatedAt: number },
    id: string,
  ) {
    if (mode === 'legacy') return { id };
    const destinationKey = entity + ':' + id;
    const updatedAt = Math.max(
      Date.now(),
      record.updatedAt + 1,
      (destinationDeletes.get(destinationKey)?.deletedAt ?? 0) + 1,
    );
    const changeId = crypto.randomUUID();
    destinationDeletes.delete(destinationKey);
    return { id, updatedAt, changeId };
  }
  for (const group of groups)
    target.groups.push({
      ...group,
      ...publish('group', group, groupIds.get(group.id)!),
      hidden: group.hidden ?? true,
      ...(mode === 'legacy' ? { manualIconFetchOnly: true } : {}),
    });
  for (const folder of source.folders)
    target.folders.push({
      ...folder,
      ...publish('folder', folder, itemIds.get(folder.id)!),
      groupId: groupIds.get(folder.groupId)!,
    });
  for (const site of source.sites)
    target.sites.push({
      ...site,
      ...publish('site', site, itemIds.get(site.id)!),
      groupId: groupIds.get(site.groupId)!,
      folderId: site.folderId === null ? null : itemIds.get(site.folderId)!,
    });
  for (const [id, folder] of Object.entries(state.local.selectedFolder.private)) {
    const groupId = groupIds.get(id);
    if (groupId)
      state.local.selectedFolder.normal[groupId] = folder ? (itemIds.get(folder) ?? null) : null;
  }
  if (state.local.activeSpace === 'private') {
    const group = groupIds.get(state.local.activeGroup.private);
    if (group) state.local.activeGroup.normal = group;
    state.local.activeSpace = 'normal';
  }
  if (mode === 'unprotect') {
    target.tombstones = [...destinationDeletes.values()];
  }
  // Tombstones still carry their original ownership for old sync baselines. A
  // deletion in the old private workspace must not delete an unrelated public ID.
  source.groups = [];
  source.folders = [];
  source.sites = [];
  state.local.activeGroup.private = ensureSpaceGroup(state, 'private').id;
  state.local.selectedFolder.private = {};
  return groupIds;
}
