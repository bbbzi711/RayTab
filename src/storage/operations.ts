import { normalizeUrl, type RayState, type Site, type SpaceId, type SpaceSettings } from './model';
import type { BookmarkCandidate } from '@/features/import/bookmarks';

type SiteInput = Pick<Site, 'title' | 'url' | 'color' | 'iconId'>;
export type Command =
  | { type: 'switch-space'; spaceId: SpaceId }
  | { type: 'set-home-mode'; mode: RayState['local']['homeMode'] }
  | { type: 'complete-onboarding' }
  | { type: 'select-desktop'; spaceId: SpaceId; desktopId: string }
  | { type: 'move-desktop'; spaceId: SpaceId; id: string; beforeId?: string }
  | { type: 'select-category'; spaceId: SpaceId; desktopId: string; categoryId: string | null }
  | { type: 'save-desktop'; spaceId: SpaceId; id: string; name: string; expected?: number }
  | { type: 'delete-desktop'; spaceId: SpaceId; id: string; destinationDesktopId: string }
  | {
      type: 'save-category';
      spaceId: SpaceId;
      id: string;
      desktopId: string;
      name: string;
      color: string;
      showInAll: boolean;
      expected?: number;
    }
  | { type: 'delete-category'; spaceId: SpaceId; id: string }
  | {
      type: 'save-site';
      spaceId: SpaceId;
      id: string;
      categoryId: string;
      site: SiteInput;
      expected?: number;
    }
  | { type: 'delete-site'; spaceId: SpaceId; id: string }
  | { type: 'move-site'; spaceId: SpaceId; id: string; categoryId: string; beforeId?: string }
  | { type: 'move-category'; spaceId: SpaceId; id: string; desktopId: string; beforeId?: string }
  | { type: 'settings'; spaceId: SpaceId; patch: Partial<SpaceSettings> }
  | { type: 'reset-private-setting'; key: keyof SpaceSettings }
  | { type: 'import-bookmarks'; spaceId: SpaceId; desktopId: string; items: BookmarkCandidate[] };

function changed(id: string, current?: number) {
  const updatedAt = Math.max(Date.now(), (current ?? 0) + 1);
  return { updatedAt, changeId: crypto.randomUUID() };
}
function reorder<T extends { id: string; order: number; updatedAt: number; changeId: string }>(
  items: T[],
  movingId: string,
  beforeId?: string,
) {
  const ordered = [...items].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const moving = ordered.find((item) => item.id === movingId);
  if (!moving) throw new Error('要移动的项目不存在');
  const rest = ordered.filter((item) => item.id !== movingId);
  const index = beforeId ? rest.findIndex((item) => item.id === beforeId) : -1;
  rest.splice(index < 0 ? rest.length : index, 0, moving);
  rest.forEach((item, order) => {
    if (item.order !== order) Object.assign(item, { order, ...changed(item.id, item.updatedAt) });
  });
}
function tombstone(
  state: RayState,
  spaceId: SpaceId,
  entity: 'desktop' | 'category' | 'site',
  id: string,
) {
  const { updatedAt, changeId } = changed(id);
  state.spaces[spaceId].tombstones.push({ id, entity, deletedAt: updatedAt, changeId });
}
function ensureExpected(item: { updatedAt: number } | undefined, expected?: number) {
  if (expected !== undefined && (!item || item.updatedAt !== expected))
    throw new Error('这个项目已在另一个页面更改，请关闭编辑后重试');
}

export function applyCommand(state: RayState, command: Command) {
  if (command.type === 'complete-onboarding') {
    state.local.onboardingComplete = true;
    return;
  }
  if (command.type === 'switch-space') {
    state.local.activeSpace = command.spaceId;
    return;
  }
  if (command.type === 'set-home-mode') {
    state.local.homeMode = command.mode;
    return;
  }
  if (command.type === 'reset-private-setting') {
    delete state.privateSettingOverrides[command.key];
    return;
  }
  const space = state.spaces[command.spaceId];
  if (command.type === 'select-desktop') {
    if (!space.desktops.some((item) => item.id === command.desktopId))
      throw new Error('桌面不存在');
    state.local.activeDesktop[command.spaceId] = command.desktopId;
    return;
  }
  if (command.type === 'select-category') {
    if (
      command.categoryId &&
      !space.categories.some(
        (item) => item.id === command.categoryId && item.desktopId === command.desktopId,
      )
    )
      throw new Error('分类不存在');
    state.local.selectedCategory[command.spaceId][command.desktopId] = command.categoryId;
    return;
  }
  if (command.type === 'move-desktop') {
    if (!space.desktops.some((item) => item.id === command.id)) throw new Error('桌面不存在');
    if (command.beforeId === command.id) return;
    reorder(space.desktops, command.id, command.beforeId);
    return;
  }
  if (command.type === 'settings') {
    Object.assign(
      command.spaceId === 'normal' ? state.normalSettings : state.privateSettingOverrides,
      command.patch,
    );
    return;
  }
  if (command.type === 'import-bookmarks') {
    if (!space.desktops.some((item) => item.id === command.desktopId))
      throw new Error('目标桌面不存在');
    const categories = new Map(
      space.categories
        .filter((item) => item.desktopId === command.desktopId)
        .map((item) => [item.name, item]),
    );
    for (const candidate of command.items) {
      let category = categories.get(candidate.category);
      if (!category) {
        const now = Date.now();
        category = {
          id: crypto.randomUUID(),
          desktopId: command.desktopId,
          name: candidate.category.slice(0, 80),
          color: '#4f7c68',
          order: categories.size,
          isDefault: false,
          showInAll: true,
          createdAt: now,
          ...changed(candidate.category, now),
        };
        space.categories.push(category);
        categories.set(category.name, category);
      }
      const now = Date.now();
      space.sites.push({
        id: crypto.randomUUID(),
        categoryId: category.id,
        title: candidate.title.slice(0, 80),
        url: normalizeUrl(candidate.url),
        color: category.color,
        order: space.sites.filter((item) => item.categoryId === category!.id).length,
        createdAt: now,
        ...changed(candidate.url, now),
      });
    }
    return;
  }
  if (command.type === 'save-desktop') {
    const item = space.desktops.find((entry) => entry.id === command.id);
    ensureExpected(item, command.expected);
    const name = command.name.trim();
    if (!name) throw new Error('请输入桌面名称');
    if (item) Object.assign(item, { name, ...changed(item.id, item.updatedAt) });
    else {
      const now = Date.now();
      space.desktops.push({
        id: command.id,
        name,
        order: space.desktops.length,
        createdAt: now,
        ...changed(command.id, now),
      });
      space.categories.push({
        id: crypto.randomUUID(),
        desktopId: command.id,
        name: '未分类',
        color: '#718096',
        order: 0,
        isDefault: true,
        showInAll: true,
        createdAt: now,
        ...changed(command.id, now),
      });
    }
    return;
  }
  if (command.type === 'delete-desktop') {
    if (space.desktops.length === 1) throw new Error('至少保留一个桌面');
    if (command.id === command.destinationDesktopId) throw new Error('请选择其他桌面接收内容');
    if (!space.desktops.some((item) => item.id === command.destinationDesktopId))
      throw new Error('目标桌面不存在');
    const destination = space.categories.find(
      (item) => item.desktopId === command.destinationDesktopId && item.isDefault,
    )!;
    const categoryIds = new Set(
      space.categories.filter((item) => item.desktopId === command.id).map((item) => item.id),
    );
    for (const site of space.sites)
      if (categoryIds.has(site.categoryId))
        Object.assign(site, { categoryId: destination.id, ...changed(site.id, site.updatedAt) });
    for (const category of space.categories.filter((item) => categoryIds.has(item.id)))
      tombstone(state, command.spaceId, 'category', category.id);
    space.categories = space.categories.filter((item) => !categoryIds.has(item.id));
    space.desktops = space.desktops.filter((item) => item.id !== command.id);
    space.desktops.sort((a, b) => a.order - b.order).forEach((item, order) => (item.order = order));
    tombstone(state, command.spaceId, 'desktop', command.id);
    if (state.local.activeDesktop[command.spaceId] === command.id)
      state.local.activeDesktop[command.spaceId] = command.destinationDesktopId;
    delete state.local.selectedCategory[command.spaceId][command.id];
    return;
  }
  if (command.type === 'save-category') {
    if (!space.desktops.some((item) => item.id === command.desktopId))
      throw new Error('桌面不存在');
    const item = space.categories.find((entry) => entry.id === command.id);
    ensureExpected(item, command.expected);
    const name = command.name.trim();
    if (!name) throw new Error('请输入分类名称');
    if (item?.isDefault) throw new Error('默认分类不能编辑');
    if (item)
      Object.assign(item, {
        name,
        color: command.color,
        showInAll: command.showInAll,
        desktopId: command.desktopId,
        ...changed(item.id, item.updatedAt),
      });
    else {
      const now = Date.now();
      space.categories.push({
        id: command.id,
        desktopId: command.desktopId,
        name,
        color: command.color,
        showInAll: command.showInAll,
        isDefault: false,
        order: space.categories.filter((entry) => entry.desktopId === command.desktopId).length,
        createdAt: now,
        ...changed(command.id, now),
      });
    }
    return;
  }
  if (command.type === 'delete-category') {
    const item = space.categories.find((entry) => entry.id === command.id);
    if (!item) throw new Error('分类不存在');
    if (item.isDefault) throw new Error('默认分类不能删除');
    const destination = space.categories.find(
      (entry) => entry.desktopId === item.desktopId && entry.isDefault,
    )!;
    for (const site of space.sites)
      if (site.categoryId === item.id)
        Object.assign(site, { categoryId: destination.id, ...changed(site.id, site.updatedAt) });
    space.categories = space.categories.filter((entry) => entry.id !== item.id);
    tombstone(state, command.spaceId, 'category', item.id);
    return;
  }
  if (command.type === 'save-site') {
    if (!space.categories.some((item) => item.id === command.categoryId))
      throw new Error('分类不存在');
    const item = space.sites.find((entry) => entry.id === command.id);
    ensureExpected(item, command.expected);
    const value = {
      ...command.site,
      title: command.site.title.trim(),
      url: normalizeUrl(command.site.url),
      categoryId: command.categoryId,
    };
    if (item) Object.assign(item, value, changed(item.id, item.updatedAt));
    else {
      const now = Date.now();
      space.sites.push({
        id: command.id,
        ...value,
        order: space.sites.filter((entry) => entry.categoryId === command.categoryId).length,
        createdAt: now,
        ...changed(command.id, now),
      });
    }
    return;
  }
  if (command.type === 'delete-site') {
    if (!space.sites.some((item) => item.id === command.id)) throw new Error('网站不存在');
    space.sites = space.sites.filter((item) => item.id !== command.id);
    tombstone(state, command.spaceId, 'site', command.id);
    return;
  }
  if (command.type === 'move-site') {
    const item = space.sites.find((entry) => entry.id === command.id);
    if (!item) throw new Error('网站不存在');
    if (!space.categories.some((entry) => entry.id === command.categoryId))
      throw new Error('目标分类不存在');
    if (command.beforeId === command.id) return;
    item.categoryId = command.categoryId;
    Object.assign(item, changed(item.id, item.updatedAt));
    reorder(
      space.sites.filter((entry) => entry.categoryId === command.categoryId),
      item.id,
      command.beforeId,
    );
    return;
  }
  const item = space.categories.find((entry) => entry.id === command.id);
  if (!item || item.isDefault) throw new Error('分类不存在或不能移动');
  if (!space.desktops.some((entry) => entry.id === command.desktopId))
    throw new Error('目标桌面不存在');
  item.desktopId = command.desktopId;
  Object.assign(item, changed(item.id, item.updatedAt));
  reorder(
    space.categories.filter((entry) => entry.desktopId === command.desktopId),
    item.id,
    command.beforeId,
  );
}
