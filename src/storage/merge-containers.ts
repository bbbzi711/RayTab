import { spaceDataSchema, type Folder, type Site, type SpaceData } from './model';

const RECOVERY_GROUP_ID = 'raytab-recovered-group';

export type ContainerRecovery = {
  groupId: string;
  sites: number;
  folders: number;
  createdGroup: boolean;
};

export type MergeLocation = { groupId: string; folderId?: string | null; order: number };

// Group deletion moves the objects known to that device. Objects added elsewhere
// still need a visible destination when their original group no longer exists.
export function reconcileMergedContainers(
  space: SpaceData,
  locations: MergeLocation[] = [],
): { data: SpaceData; locations: MergeLocation[]; recovery: ContainerRecovery | undefined } {
  const groups = space.groups.map((group) => ({ ...group }));
  const folders = space.folders.map((folder) => ({ ...folder }));
  const sites = space.sites.map((site) => ({ ...site }));
  const groupIds = new Set(groups.map((group) => group.id));
  const recoveredFolders = new Set<string>();
  const movedRoots = new Set<Folder | Site>();
  let recovery: ContainerRecovery | undefined;

  const recoveryGroup = () => {
    if (!recovery) {
      const existing = groups.find((group) => group.id === RECOVERY_GROUP_ID);
      recovery = {
        groupId: RECOVERY_GROUP_ID,
        sites: 0,
        folders: 0,
        createdGroup: !existing,
      };
      if (!existing) {
        groups.push({
          id: RECOVERY_GROUP_ID,
          name: 'Recovered',
          order: Math.max(-1, ...groups.map((group) => group.order)) + 1,
          createdAt: 0,
          updatedAt: 0,
          changeId: RECOVERY_GROUP_ID,
        });
      }
    }
    return recovery;
  };

  if (!groups.length) recoveryGroup();
  for (const folder of folders) {
    if (groupIds.has(folder.groupId)) continue;
    const recovered = recoveryGroup();
    folder.groupId = recovered.groupId;
    recovered.folders++;
    recoveredFolders.add(folder.id);
    movedRoots.add(folder);
  }

  const folderMap = new Map(folders.map((folder) => [folder.id, folder]));
  for (const site of sites) {
    const folder = site.folderId === null ? undefined : folderMap.get(site.folderId);
    const missingGroup = !groupIds.has(site.groupId);
    if (folder) {
      site.groupId = folder.groupId;
      if (folder.groupId === RECOVERY_GROUP_ID && (missingGroup || recoveredFolders.has(folder.id)))
        recoveryGroup().sites++;
    } else {
      if (missingGroup) {
        const recovered = recoveryGroup();
        site.groupId = recovered.groupId;
        recovered.sites++;
      }
      if (missingGroup || site.folderId !== null) movedRoots.add(site);
      site.folderId = null;
    }
  }

  const nextOrder = new Map<string, number>();
  for (const item of [...folders, ...sites.filter((site) => site.folderId === null)]) {
    if (movedRoots.has(item)) continue;
    nextOrder.set(item.groupId, Math.max(nextOrder.get(item.groupId) ?? 0, item.order + 1));
  }
  const appendOrder = (groupId: string) => {
    const order = nextOrder.get(groupId) ?? 0;
    nextOrder.set(groupId, order + 1);
    return order;
  };
  for (const item of [...movedRoots].sort(
    (left, right) => left.order - right.order || left.id.localeCompare(right.id),
  ))
    item.order = appendOrder(item.groupId);

  const reconciledLocations = locations.map((location) => {
    const folder = location.folderId ? folderMap.get(location.folderId) : undefined;
    const groupId =
      folder?.groupId ??
      (groupIds.has(location.groupId) ? location.groupId : recoveryGroup().groupId);
    const folderId = folder?.id ?? null;
    const changed =
      groupId !== location.groupId ||
      (!folder && !groupIds.has(location.groupId)) ||
      ('folderId' in location && folderId !== location.folderId);
    return {
      ...location,
      groupId,
      ...('folderId' in location ? { folderId } : {}),
      order: changed && !folder ? (nextOrder.get(groupId) ?? 0) : location.order,
    };
  });

  // The fixed recovery bucket can be recreated after a user dissolved an older
  // one. Retaining that old tombstone would delete it again on the next merge.
  const tombstones = recovery
    ? space.tombstones.filter((item) => item.entity !== 'group' || item.id !== RECOVERY_GROUP_ID)
    : space.tombstones;
  return {
    data: spaceDataSchema.parse({ groups, folders, sites, tombstones }),
    locations: reconciledLocations,
    recovery,
  };
}
