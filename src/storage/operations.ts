import {
  normalizeUrl,
  type RayState,
  type Site,
  type SpaceData,
  type SpaceId,
  type SpaceSettings,
} from './model';
import type { BookmarkCandidate } from '@/features/import/bookmarks';

type SiteInput = Pick<Site, 'title' | 'url' | 'color' | 'iconId'>;
type Destination = { groupId: string; folderId: string | null };
export type Command =
  | { type: 'switch-space'; spaceId: SpaceId }
  | { type: 'set-home-mode'; mode: RayState['local']['homeMode'] }
  | { type: 'complete-onboarding' }
  | { type: 'select-group'; spaceId: SpaceId; groupId: string }
  | { type: 'move-group'; spaceId: SpaceId; id: string; beforeId?: string }
  | { type: 'select-folder'; spaceId: SpaceId; groupId: string; folderId: string | null }
  | { type: 'save-group'; spaceId: SpaceId; id: string; name: string; expected?: number }
  | { type: 'delete-group'; spaceId: SpaceId; id: string; destinationGroupId: string }
  | {
      type: 'save-folder';
      spaceId: SpaceId;
      id: string;
      groupId: string;
      name: string;
      expected?: number;
    }
  | { type: 'delete-folder'; spaceId: SpaceId; id: string }
  | ({
      type: 'save-site';
      spaceId: SpaceId;
      id: string;
      site: SiteInput;
      expected?: number;
    } & Destination)
  | { type: 'delete-site'; spaceId: SpaceId; id: string }
  | { type: 'delete-sites'; spaceId: SpaceId; ids: string[] }
  | ({ type: 'move-sites'; spaceId: SpaceId; ids: string[] } & Destination)
  | ({ type: 'move-site'; spaceId: SpaceId; id: string; beforeId?: string } & Destination)
  | { type: 'move-folder'; spaceId: SpaceId; id: string; groupId: string; beforeId?: string }
  | { type: 'settings'; spaceId: SpaceId; patch: Partial<SpaceSettings> }
  | { type: 'reset-private-setting'; key: keyof SpaceSettings }
  | { type: 'import-bookmarks'; spaceId: SpaceId; groupId: string; items: BookmarkCandidate[] };

const byOrder = (a: { order: number; id: string }, b: { order: number; id: string }) =>
  a.order - b.order || a.id.localeCompare(b.id);
function changed(current = 0) {
  return { updatedAt: Math.max(Date.now(), current + 1), changeId: crypto.randomUUID() };
}
function reorder<T extends { id: string; order: number; updatedAt: number; changeId: string }>(
  items: T[],
  movingId: string,
  beforeId?: string,
) {
  const ordered = [...items].sort(byOrder);
  const moving = ordered.find((item) => item.id === movingId);
  if (!moving) throw new Error('要移动的项目不存在');
  if (beforeId === movingId) return;
  const rest = ordered.filter((item) => item.id !== movingId);
  const index = beforeId ? rest.findIndex((item) => item.id === beforeId) : -1;
  if (beforeId && index < 0) throw new Error('排序目标不在目标容器中');
  rest.splice(index < 0 ? rest.length : index, 0, moving);
  rest.forEach((item, order) => {
    if (item.order !== order) Object.assign(item, { order, ...changed(item.updatedAt) });
  });
}
function ensureExpected(item: { updatedAt: number } | undefined, expected?: number) {
  if (expected !== undefined && (!item || item.updatedAt !== expected))
    throw new Error('这个项目已在另一个页面更改，请关闭编辑后重试');
}
function destination(space: SpaceData, target: Destination) {
  if (!space.groups.some((item) => item.id === target.groupId)) throw new Error('目标分组不存在');
  if (
    target.folderId !== null &&
    !space.folders.some((item) => item.id === target.folderId && item.groupId === target.groupId)
  )
    throw new Error('目标文件夹不存在');
}
const at = (item: Site, target: Destination) =>
  item.groupId === target.groupId && item.folderId === target.folderId;

function containerItems(space: SpaceData, target: Destination) {
  return [
    ...space.sites.filter((item) => at(item, target)),
    ...(target.folderId === null
      ? space.folders.filter((item) => item.groupId === target.groupId)
      : []),
  ];
}
function checkBefore(space: SpaceData, target: Destination, beforeId?: string) {
  if (beforeId && !containerItems(space, target).some((item) => item.id === beforeId))
    throw new Error('排序目标不在目标容器中');
}

export function applyCommand(state: RayState, command: Command) {
  if (command.type === 'complete-onboarding') {
    state.local.onboardingComplete = true;
    return;
  }
  if (command.type === 'switch-space') {
    if (command.spaceId === 'private' && state.privateSecurity.locked)
      throw new Error('请先解锁私密空间');
    state.local.activeSpace = command.spaceId;
    return;
  }
  if (command.type === 'set-home-mode') {
    state.local.homeMode = command.mode;
    return;
  }
  if (command.type === 'reset-private-setting') {
    if (state.privateSecurity.locked) throw new Error('请先解锁私密空间');
    delete state.privateSettingOverrides[command.key];
    if (command.key === 'searchEngines') delete state.privateSettingOverrides.searchEngine;
    return;
  }
  if (command.spaceId === 'private' && state.privateSecurity.locked)
    throw new Error('请先解锁私密空间');
  const space = state.spaces[command.spaceId];
  const tombstone = (entity: 'group' | 'folder' | 'site', id: string) => {
    const { updatedAt, changeId } = changed();
    space.tombstones.push({ id, entity, deletedAt: updatedAt, changeId });
  };
  if (command.type === 'select-group') {
    destination(space, { groupId: command.groupId, folderId: null });
    state.local.activeGroup[command.spaceId] = command.groupId;
    state.local.selectedFolder[command.spaceId] = {};
    return;
  }
  if (command.type === 'select-folder') {
    destination(space, command);
    state.local.selectedFolder[command.spaceId][command.groupId] = command.folderId;
    return;
  }
  if (command.type === 'settings') {
    Object.assign(
      command.spaceId === 'normal' ? state.normalSettings : state.privateSettingOverrides,
      command.patch,
    );
    return;
  }
  if (command.type === 'move-group') {
    reorder(space.groups, command.id, command.beforeId);
    return;
  }
  if (command.type === 'save-group' || command.type === 'save-folder') {
    const list = command.type === 'save-group' ? space.groups : space.folders;
    const item = list.find((entry) => entry.id === command.id);
    ensureExpected(item, command.expected);
    const name = command.name.trim();
    if (!name) throw new Error('请输入名称');
    if (command.type === 'save-folder') {
      destination(space, { groupId: command.groupId, folderId: null });
      if (item && 'groupId' in item && item.groupId !== command.groupId)
        throw new Error('文件夹已移到其他分组，请重新打开');
    }
    if (item) Object.assign(item, { name, ...changed(item.updatedAt) });
    else {
      const record = {
        id: command.id,
        name,
        order:
          Math.max(
            -1,
            ...(command.type === 'save-group'
              ? space.groups
              : containerItems(space, { groupId: command.groupId, folderId: null })
            ).map((item) => item.order),
          ) + 1,
        createdAt: Date.now(),
        ...changed(),
      };
      if (command.type === 'save-group') space.groups.push(record);
      else space.folders.push({ ...record, groupId: command.groupId });
    }
    return;
  }
  if (command.type === 'delete-group') {
    if (space.groups.length === 1) throw new Error('至少保留一个分组');
    if (command.id === command.destinationGroupId) throw new Error('请选择其他分组接收内容');
    destination(space, { groupId: command.id, folderId: null });
    destination(space, { groupId: command.destinationGroupId, folderId: null });
    for (const item of containerItems(space, { groupId: command.id, folderId: null }).sort(byOrder))
      applyCommand(
        state,
        'folderId' in item
          ? {
              type: 'move-site',
              spaceId: command.spaceId,
              id: item.id,
              groupId: command.destinationGroupId,
              folderId: null,
            }
          : {
              type: 'move-folder',
              spaceId: command.spaceId,
              id: item.id,
              groupId: command.destinationGroupId,
            },
      );
    space.groups = space.groups.filter((item) => item.id !== command.id);
    tombstone('group', command.id);
    if (state.local.activeGroup[command.spaceId] === command.id)
      state.local.activeGroup[command.spaceId] = command.destinationGroupId;
    delete state.local.selectedFolder[command.spaceId][command.id];
    return;
  }
  if (command.type === 'delete-folder') {
    const folder = space.folders.find((item) => item.id === command.id);
    if (!folder) throw new Error('文件夹不存在');
    for (const site of space.sites.filter((item) => item.folderId === folder.id).sort(byOrder))
      applyCommand(state, {
        type: 'move-site',
        spaceId: command.spaceId,
        id: site.id,
        groupId: folder.groupId,
        folderId: null,
        beforeId: folder.id,
      });
    space.folders = space.folders.filter((item) => item.id !== folder.id);
    if (state.local.selectedFolder[command.spaceId][folder.groupId] === folder.id)
      state.local.selectedFolder[command.spaceId][folder.groupId] = null;
    tombstone('folder', folder.id);
    return;
  }
  if (command.type === 'save-site') {
    destination(space, command);
    const item = space.sites.find((entry) => entry.id === command.id);
    ensureExpected(item, command.expected);
    const value = {
      ...command.site,
      title: command.site.title.trim(),
      url: normalizeUrl(command.site.url),
      groupId: command.groupId,
      folderId: command.folderId,
    };
    if (!value.title) throw new Error('请输入名称');
    if (item) {
      const moved = !at(item, command);
      Object.assign(item, value, changed(item.updatedAt));
      if (moved) reorder(containerItems(space, command), item.id);
    } else
      space.sites.push({
        id: command.id,
        ...value,
        order: Math.max(-1, ...containerItems(space, command).map((entry) => entry.order)) + 1,
        createdAt: Date.now(),
        ...changed(),
      });
    return;
  }
  if (command.type === 'delete-site' || command.type === 'delete-sites') {
    const ids = new Set(command.type === 'delete-site' ? [command.id] : command.ids);
    if ([...ids].some((id) => !space.sites.some((item) => item.id === id)))
      throw new Error('网站不存在');
    space.sites = space.sites.filter((item) => !ids.has(item.id));
    ids.forEach((id) => tombstone('site', id));
    return;
  }
  if (command.type === 'move-sites') {
    const ids = [...new Set(command.ids)];
    destination(space, command);
    if (ids.some((id) => !space.sites.some((item) => item.id === id)))
      throw new Error('网站不存在');
    for (const id of space.sites
      .filter((item) => ids.includes(item.id))
      .sort(byOrder)
      .map((item) => item.id))
      applyCommand(state, {
        type: 'move-site',
        spaceId: command.spaceId,
        id,
        groupId: command.groupId,
        folderId: command.folderId,
      });
    return;
  }
  if (command.type === 'move-site') {
    destination(space, command);
    const item = space.sites.find((entry) => entry.id === command.id);
    if (!item) throw new Error('网站不存在');
    if (command.beforeId === command.id && at(item, command)) return;
    checkBefore(space, command, command.beforeId);
    Object.assign(item, {
      groupId: command.groupId,
      folderId: command.folderId,
      ...changed(item.updatedAt),
    });
    reorder(containerItems(space, command), item.id, command.beforeId);
    return;
  }
  if (command.type === 'move-folder') {
    const item = space.folders.find((entry) => entry.id === command.id);
    if (!item) throw new Error('文件夹不存在');
    destination(space, { groupId: command.groupId, folderId: null });
    if (command.beforeId === command.id && item.groupId === command.groupId) return;
    checkBefore(space, { groupId: command.groupId, folderId: null }, command.beforeId);
    if (
      state.local.selectedFolder[command.spaceId][item.groupId] === item.id &&
      item.groupId !== command.groupId
    )
      state.local.selectedFolder[command.spaceId][item.groupId] = null;
    Object.assign(item, { groupId: command.groupId, ...changed(item.updatedAt) });
    for (const site of space.sites.filter((entry) => entry.folderId === item.id))
      Object.assign(site, { groupId: command.groupId, ...changed(site.updatedAt) });
    reorder(
      containerItems(space, { groupId: command.groupId, folderId: null }),
      item.id,
      command.beforeId,
    );
    return;
  }
  destination(space, { groupId: command.groupId, folderId: null });
  for (const candidate of command.items) {
    let folderId: string | null = null;
    const folderName = candidate.folder?.trim().slice(0, 80);
    if (folderName) {
      let folder = space.folders.find(
        (item) => item.groupId === command.groupId && item.name === folderName,
      );
      if (!folder) {
        folder = {
          id: crypto.randomUUID(),
          groupId: command.groupId,
          name: folderName,
          order:
            Math.max(
              -1,
              ...containerItems(space, { groupId: command.groupId, folderId: null }).map(
                (item) => item.order,
              ),
            ) + 1,
          createdAt: Date.now(),
          ...changed(),
        };
        space.folders.push(folder);
      }
      folderId = folder.id;
    }
    applyCommand(state, {
      type: 'save-site',
      spaceId: command.spaceId,
      id: crypto.randomUUID(),
      groupId: command.groupId,
      folderId,
      site: { title: candidate.title.slice(0, 80), url: candidate.url, color: '#4f7c68' },
    });
  }
}
