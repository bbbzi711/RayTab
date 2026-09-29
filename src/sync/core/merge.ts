import { spaceDataSchema, type SpaceData } from '@/storage/model';

export type SyncConflict = {
  entity: 'group' | 'folder' | 'site';
  id: string;
  field: string;
  local: unknown;
  remote: unknown;
};

export function mergeSpaceData(base: SpaceData | undefined, local: SpaceData, remote: SpaceData) {
  const conflicts: SyncConflict[] = [];
  const deleted = mergeTombstones(base?.tombstones ?? [], local.tombstones, remote.tombstones);
  const deletedKeys = new Set(deleted.map((item) => `${item.entity}:${item.id}`));
  const groups = mergeRecords(
    'group',
    base?.groups ?? [],
    local.groups,
    remote.groups,
    conflicts,
  ).filter((item) => !deletedKeys.has(`group:${item.id}`));
  const folders = mergeRecords(
    'folder',
    base?.folders ?? [],
    local.folders,
    remote.folders,
    conflicts,
  ).filter(
    (item) =>
      !deletedKeys.has(`folder:${item.id}`) && groups.some((group) => group.id === item.groupId),
  );
  const sites = mergeRecords('site', base?.sites ?? [], local.sites, remote.sites, conflicts)
    .map((site) => {
      const folder = folders.find((item) => item.id === site.folderId);
      return { ...site, groupId: folder?.groupId ?? site.groupId, folderId: folder?.id ?? null };
    })
    .filter((item) => {
      return (
        !deletedKeys.has(`site:${item.id}`) && groups.some((group) => group.id === item.groupId)
      );
    });
  return {
    data: spaceDataSchema.parse({ groups, folders, sites, tombstones: deleted }),
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
    const fields = new Set([...Object.keys(left), ...Object.keys(right)]);
    if (entity === 'site' || entity === 'folder') {
      fields.delete('groupId');
      fields.delete('folderId');
      fields.delete('order');
      fields.add('location');
    }
    for (const key of fields) {
      const value = (record: T) => {
        const fields = record as Record<string, unknown>;
        return key === 'location'
          ? {
              groupId: fields.groupId,
              order: fields.order,
              ...(entity === 'site' ? { folderId: fields.folderId } : {}),
            }
          : fields[key];
      };
      const baseValue = value(ancestor);
      const localValue = value(left);
      const remoteValue = value(right);
      if (key === 'updatedAt') {
        merged[key] = Math.max(Number(localValue), Number(remoteValue));
        continue;
      }
      if (key === 'changeId') {
        merged[key] = localValue;
        continue;
      }
      let selected: unknown;
      if (same(localValue, baseValue)) selected = remoteValue;
      else if (same(remoteValue, baseValue) || same(localValue, remoteValue)) selected = localValue;
      else {
        selected = localValue;
        conflicts.push({ entity, id, field: key, local: localValue, remote: remoteValue });
      }
      if (key === 'location') Object.assign(merged, selected);
      else merged[key] = selected;
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
