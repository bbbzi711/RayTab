import { folderSchema, siteSchema, type SpaceData } from '@/storage/model';
import { reconcileMergedContainers, type MergeLocation } from '@/storage/merge-containers';
import { z } from 'zod';

export const syncConflictSchema = z.object({
  key: z.string().min(1),
  entity: z.enum(['group', 'folder', 'site']),
  id: z.string().min(1),
  field: z.string().min(1),
  local: z.unknown(),
  remote: z.unknown(),
});
export type SyncConflict = z.infer<typeof syncConflictSchema>;
export function createSyncConflict(conflict: Omit<SyncConflict, 'key'>): SyncConflict {
  return { key: JSON.stringify([conflict.entity, conflict.id, conflict.field]), ...conflict };
}

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
  ).filter((item) => !deletedKeys.has(`folder:${item.id}`));
  const sites = mergeRecords(
    'site',
    base?.sites ?? [],
    local.sites,
    remote.sites,
    conflicts,
  ).filter((item) => !deletedKeys.has(`site:${item.id}`));
  return reconcileMergeConflicts({ groups, folders, sites, tombstones: deleted }, conflicts);
}

export function reconcileMergeConflicts(data: SpaceData, conflicts: SyncConflict[]) {
  const deletedKeys = new Set(data.tombstones.map((item) => `${item.entity}:${item.id}`));
  const existing = {
    group: new Map(data.groups.map((item) => [item.id, item])),
    folder: new Map(data.folders.map((item) => [item.id, item])),
    site: new Map(data.sites.map((item) => [item.id, item])),
  };
  const retainedConflicts = conflicts
    .filter(
      (conflict) =>
        conflict.id === 'settings' ||
        conflict.id === 'private-space' ||
        (!deletedKeys.has(`${conflict.entity}:${conflict.id}`) &&
          existing[conflict.entity].has(conflict.id)),
    )
    .map((conflict) => ({ ...conflict }));
  const locationConflicts = retainedConflicts.filter(
    (conflict) =>
      (conflict.entity === 'site' || conflict.entity === 'folder') &&
      (conflict.field === 'location' || conflict.field === '*'),
  );
  const locationOf = (conflict: SyncConflict, value: unknown): MergeLocation =>
    conflict.entity === 'site'
      ? siteSchema.pick({ groupId: true, folderId: true, order: true }).parse(value)
      : folderSchema.pick({ groupId: true, order: true }).parse(value);
  const reconciled = reconcileMergedContainers(
    data,
    locationConflicts.map((conflict) => locationOf(conflict, conflict.remote)),
  );
  locationConflicts.forEach((conflict, index) => {
    const update = (value: unknown, location: MergeLocation) =>
      conflict.field === '*'
        ? {
            ...(conflict.entity === 'site' ? siteSchema.parse(value) : folderSchema.parse(value)),
            ...location,
          }
        : location;
    const current =
      conflict.entity === 'site'
        ? reconciled.data.sites.find((item) => item.id === conflict.id)
        : reconciled.data.folders.find((item) => item.id === conflict.id);
    conflict.local = update(current, locationOf(conflict, current));
    conflict.remote = update(conflict.remote, reconciled.locations[index]);
  });
  return {
    data: reconciled.data,
    conflicts: retainedConflicts.filter((conflict) => !same(conflict.local, conflict.remote)),
    recovery: reconciled.recovery,
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
        conflicts.push(createSyncConflict({ entity, id, field: '*', local: left, remote: right }));
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
        conflicts.push(
          createSyncConflict({ entity, id, field: key, local: localValue, remote: remoteValue }),
        );
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
