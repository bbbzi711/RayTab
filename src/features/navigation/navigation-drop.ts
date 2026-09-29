import type { SpaceData, SpaceId } from '@/storage/model';
import type { Command } from '@/storage/operations';

export type NavigationDrag = { type: 'site' | 'folder'; id: string };
export type NavigationDrop =
  | { type: 'item'; id: string }
  | { type: 'folder-center'; folderId: string }
  | { type: 'container'; groupId: string; folderId: string | null };

const byOrder = (a: { order: number; id: string }, b: { order: number; id: string }) =>
  a.order - b.order || a.id.localeCompare(b.id);

export function navigationDropCommand(
  space: SpaceData,
  spaceId: SpaceId,
  drag: NavigationDrag,
  drop: NavigationDrop,
): Command | undefined {
  const moving = (drag.type === 'site' ? space.sites : space.folders).find(
    (item) => item.id === drag.id,
  );
  if (!moving) return;

  let groupId: string;
  let folderId: string | null;
  let beforeId: string | undefined;
  if (drop.type === 'container') {
    ({ groupId, folderId } = drop);
  } else if (drop.type === 'folder-center') {
    if (drag.type !== 'site') return;
    const folder = space.folders.find((item) => item.id === drop.folderId);
    if (!folder) return;
    groupId = folder.groupId;
    folderId = folder.id;
  } else {
    if (drop.id === moving.id) return;
    const target = [...space.sites, ...space.folders].find((item) => item.id === drop.id);
    if (!target) return;
    groupId = target.groupId;
    folderId = 'folderId' in target ? target.folderId : null;
    beforeId = target.id;
    const movingFolderId = 'folderId' in moving ? moving.folderId : null;
    if (moving.groupId === groupId && movingFolderId === folderId) {
      const siblings = [
        ...space.sites.filter((site) => site.groupId === groupId && site.folderId === folderId),
        ...(folderId === null ? space.folders.filter((folder) => folder.groupId === groupId) : []),
      ].sort(byOrder);
      const from = siblings.findIndex((item) => item.id === moving.id);
      const to = siblings.findIndex((item) => item.id === target.id);
      if (from < to) beforeId = siblings[to + 1]?.id;
    }
  }

  if (!space.groups.some((group) => group.id === groupId)) return;
  if (
    folderId !== null &&
    !space.folders.some((folder) => folder.id === folderId && folder.groupId === groupId)
  )
    return;
  if (drag.type === 'folder') {
    if (folderId !== null) return;
    return { type: 'move-folder', spaceId, id: moving.id, groupId, beforeId };
  }
  return { type: 'move-site', spaceId, id: moving.id, groupId, folderId, beforeId };
}
