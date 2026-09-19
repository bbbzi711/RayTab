import { spaceDataSchema, type SpaceData } from '@/storage/model';

export type SyncConflict = {
  entity: 'desktop' | 'category' | 'site';
  id: string;
  field: string;
  local: unknown;
  remote: unknown;
};

export function mergeSpaceData(base: SpaceData | undefined, local: SpaceData, remote: SpaceData) {
  const conflicts: SyncConflict[] = [];
  const deleted = mergeTombstones(base?.tombstones ?? [], local.tombstones, remote.tombstones);
  const deletedKeys = new Set(deleted.map((item) => `${item.entity}:${item.id}`));
  const desktops = mergeRecords(
    'desktop',
    base?.desktops ?? [],
    local.desktops,
    remote.desktops,
    conflicts,
  ).filter((item) => !deletedKeys.has(`desktop:${item.id}`));
  const categories = mergeRecords(
    'category',
    base?.categories ?? [],
    local.categories,
    remote.categories,
    conflicts,
  ).filter(
    (item) =>
      !deletedKeys.has(`category:${item.id}`) &&
      desktops.some((desktop) => desktop.id === item.desktopId),
  );
  const sites = mergeRecords(
    'site',
    base?.sites ?? [],
    local.sites,
    remote.sites,
    conflicts,
  ).filter(
    (item) =>
      !deletedKeys.has(`site:${item.id}`) &&
      categories.some((category) => category.id === item.categoryId),
  );
  return {
    data: spaceDataSchema.parse({ desktops, categories, sites, tombstones: deleted }),
    conflicts,
  };
}

function mergeRecords<T extends { id: string }>(
  entity: SyncConflict['entity'],
  base: T[],
  local: T[],
  remote: T[],
  conflicts: SyncConflict[],
): T[] {
  const baseMap = new Map(base.map((item) => [item.id, item]));
  const localMap = new Map(local.map((item) => [item.id, item]));
  const remoteMap = new Map(remote.map((item) => [item.id, item]));
  const ids = new Set([...localMap.keys(), ...remoteMap.keys()]);
  const result: T[] = [];
  for (const id of ids) {
    const ancestor = baseMap.get(id);
    const left = localMap.get(id);
    const right = remoteMap.get(id);
    if (!left) {
      if (right && !ancestor) result.push(right);
      continue;
    }
    if (!right) {
      if (!ancestor) result.push(left);
      continue;
    }
    if (!ancestor) {
      if (same(left, right)) result.push(left);
      else {
        conflicts.push({ entity, id, field: '*', local: left, remote: right });
        result.push(left);
      }
      continue;
    }
    if (same(left, ancestor)) {
      result.push(right);
      continue;
    }
    if (same(right, ancestor) || same(left, right)) {
      result.push(left);
      continue;
    }
    const merged = { ...ancestor } as Record<string, unknown>;
    for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
      const baseValue = (ancestor as Record<string, unknown>)[key];
      const localValue = (left as Record<string, unknown>)[key];
      const remoteValue = (right as Record<string, unknown>)[key];
      if (same(localValue, baseValue)) merged[key] = remoteValue;
      else if (same(remoteValue, baseValue) || same(localValue, remoteValue))
        merged[key] = localValue;
      else {
        merged[key] = localValue;
        conflicts.push({ entity, id, field: key, local: localValue, remote: remoteValue });
      }
    }
    result.push(merged as T);
  }
  return result;
}

function mergeTombstones(
  base: SpaceData['tombstones'],
  local: SpaceData['tombstones'],
  remote: SpaceData['tombstones'],
) {
  const values = new Map<string, SpaceData['tombstones'][number]>();
  for (const item of [...base, ...local, ...remote]) {
    const key = `${item.entity}:${item.id}`;
    if (!values.has(key) || values.get(key)!.deletedAt < item.deletedAt) values.set(key, item);
  }
  return [...values.values()];
}
function same(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}
