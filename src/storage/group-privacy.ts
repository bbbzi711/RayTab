import { AppError } from '@/lib/errors';
import {
  groupLabelSchema,
  type Group,
  type GroupLabel,
  type RayState,
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
  if (isPlaceholderGroup(group.id)) return false;
  return (
    spaceId === 'normal' ||
    group.id !== 'private-group-home' ||
    group.updatedAt !== 0 ||
    group.hidden !== undefined ||
    state.spaces.private.folders.some((folder) => folder.groupId === group.id) ||
    state.spaces.private.sites.some((site) => site.groupId === group.id)
  );
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

export function adoptLegacyEncryptedGroups(state: RayState) {
  const privateSpace = state.spaces.private;
  const normalIds = new Set(state.spaces.normal.groups.map((group) => group.id));
  const normalRecordIds = new Set(
    [...state.spaces.normal.folders, ...state.spaces.normal.sites].map((record) => record.id),
  );
  for (const group of privateSpace.groups) {
    if (!isUserGroup(state, 'private', group) || group.hidden !== undefined) continue;
    if (normalIds.has(group.id)) {
      const previous = group.id;
      group.id = crypto.randomUUID();
      for (const record of [...privateSpace.folders, ...privateSpace.sites])
        if (record.groupId === previous) record.groupId = group.id;
    }
    Object.assign(group, {
      hidden: true,
      updatedAt: Math.max(Date.now(), group.updatedAt + 1),
      changeId: crypto.randomUUID(),
    });
    for (const folder of privateSpace.folders) {
      if (folder.groupId !== group.id || !normalRecordIds.has(folder.id)) continue;
      const previous = folder.id;
      folder.id = crypto.randomUUID();
      for (const site of privateSpace.sites)
        if (site.folderId === previous) site.folderId = folder.id;
    }
    for (const site of privateSpace.sites)
      if (site.groupId === group.id && normalRecordIds.has(site.id)) site.id = crypto.randomUUID();
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
    ...normal.map((group) => tab(group, 'normal')).sort(order),
    ...privateGroups.map((group) => tab(group, 'private')).sort(order),
  ];
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
    order: Math.max(-1, ...destination.groups.map((item) => item.order)) + 1,
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
