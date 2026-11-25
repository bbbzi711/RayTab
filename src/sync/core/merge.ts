import { folderSchema, normalizeUrl, siteSchema, type Site, type SpaceData } from '@/storage/model';
import { reconcileMergedContainers, type MergeLocation } from '@/storage/merge-containers';
import { z } from '@/lib/zod';

export const syncConflictSchema = z.object({
  key: z.string().min(1),
  entity: z.enum(['group', 'folder', 'site']),
  id: z.string().min(1),
  field: z.string().min(1),
  local: z.unknown(),
  remote: z.unknown(),
  choice: z.enum(['local', 'remote']).optional(),
});
export type SyncConflict = z.infer<typeof syncConflictSchema>;
export function createSyncConflict(conflict: Omit<SyncConflict, 'key'>): SyncConflict {
  return { key: JSON.stringify([conflict.entity, conflict.id, conflict.field]), ...conflict };
}

function iconPriority(icon: Site['icon']) {
  if (icon.source !== 'auto' || icon.fit === 'original') return 2;
  return icon.resourceId ? 1 : 0;
}

// A URL is a match only for unambiguous, independently added records.
// Existing records, unilateral copies and ambiguous additions keep their identities.
function uniqueAdditions(sites: Site[], knownIds: Set<string>, liveIds: Set<string>) {
  const additions = new Map<string, Site | null>();
  for (const site of sites) {
    if (knownIds.has(site.id) || !liveIds.has(site.id)) continue;
    const key = JSON.stringify([site.groupId, normalizeUrl(site.url)]);
    additions.set(key, additions.has(key) ? null : site);
  }
  return additions;
}

function mergeSiteAdditions(
  data: SpaceData,
  base: SpaceData | undefined,
  local: SpaceData,
  remote: SpaceData,
) {
  const baseIds = base?.sites.map((site) => site.id) ?? [];
  const localIds = new Set([...baseIds, ...local.sites.map((site) => site.id)]);
  const remoteIds = new Set([...baseIds, ...remote.sites.map((site) => site.id)]);
  const liveIds = new Set(data.sites.map((site) => site.id));
  const left = uniqueAdditions(local.sites, remoteIds, liveIds);
  const right = uniqueAdditions(remote.sites, localIds, liveIds);
  const replacements = new Map<string, Site>();
  for (const [key, a] of left) {
    const b = right.get(key);
    if (!a || !b) continue;
    // Both devices must retain the same identity regardless of which initiates sync.
    const keepA = a.createdAt === b.createdAt ? a.id < b.id : a.createdAt < b.createdAt;
    const [kept, copy] = keepA ? [a, b] : [b, a];
    const [latest, older] = kept.updatedAt >= copy.updatedAt ? [kept, copy] : [copy, kept];
    replacements.set(kept.id, {
      ...kept,
      title: latest.title,
      icon: iconPriority(older.icon) > iconPriority(latest.icon) ? older.icon : latest.icon,
      iconBackground:
        latest.iconBackground.mode === 'color' ? latest.iconBackground : older.iconBackground,
      updatedAt: latest.updatedAt,
      changeId: latest.changeId,
    });
    liveIds.delete(copy.id);
    data.tombstones.push({
      entity: 'site',
      id: copy.id,
      deletedAt: latest.updatedAt,
      changeId: copy.changeId,
    });
  }
  if (replacements.size)
    data.sites = data.sites
      .filter((site) => liveIds.has(site.id))
      .map((site) => replacements.get(site.id) ?? site);
}

type ChooseConflict = (conflict: SyncConflict) => 'local' | 'remote' | undefined;

export function mergeSpaceData(
  base: SpaceData | undefined,
  local: SpaceData,
  remote: SpaceData,
  choose?: ChooseConflict,
) {
  const conflicts: SyncConflict[] = [];
  const deleted = mergeTombstones(base, local, remote);
  const deletedKeys = new Set(deleted.map((item) => `${item.entity}:${item.id}`));
  const groups = mergeRecords(
    'group',
    base?.groups ?? [],
    local.groups,
    remote.groups,
    conflicts,
    choose,
  ).filter((item) => !deletedKeys.has(`group:${item.id}`));
  const folders = mergeRecords(
    'folder',
    base?.folders ?? [],
    local.folders,
    remote.folders,
    conflicts,
    choose,
  ).filter((item) => !deletedKeys.has(`folder:${item.id}`));
  const sites = mergeRecords(
    'site',
    base?.sites ?? [],
    local.sites,
    remote.sites,
    conflicts,
    choose,
  ).filter((item) => !deletedKeys.has(`site:${item.id}`));
  const data = { groups, folders, sites, tombstones: deleted };
  mergeSiteAdditions(data, base, local, remote);
  return reconcileMergeConflicts(data, conflicts);
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
  choose?: ChooseConflict,
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
        const conflict = createSyncConflict({ entity, id, field: '*', local: left, remote: right });
        const choice = choose?.(conflict);
        if (!choice) conflicts.push(conflict);
        result.push(choice === 'remote' ? right : left);
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
        const conflict = createSyncConflict({
          entity,
          id,
          field: key,
          local: localValue,
          remote: remoteValue,
        });
        const choice = choose?.(conflict);
        selected = choice === 'remote' ? remoteValue : localValue;
        if (!choice) conflicts.push(conflict);
      }
      if (key === 'location') Object.assign(merged, selected);
      else merged[key] = selected;
    }
    result.push(merged as T);
  }
  return result;
}

function mergeTombstones(base: SpaceData | undefined, local: SpaceData, remote: SpaceData) {
  const keyOf = (item: SpaceData['tombstones'][number]) => item.entity + ':' + item.id;
  const ancestor = new Map((base?.tombstones ?? []).map((item) => [keyOf(item), item]));
  const values = new Map(ancestor);
  for (const item of [...local.tombstones, ...remote.tombstones]) {
    const key = keyOf(item);
    if (!values.has(key) || values.get(key)!.deletedAt < item.deletedAt) values.set(key, item);
  }
  // A group moved back across the encryption boundary explicitly retires its
  // previous deletion. Only revive it against that exact common tombstone.
  for (const space of [local, remote]) {
    const tombstones = new Set(space.tombstones.map(keyOf));
    const inspect = (entity: string, records: { id: string; updatedAt: number }[]) => {
      for (const record of records) {
        const key = entity + ':' + record.id;
        const deletion = ancestor.get(key);
        if (
          deletion &&
          !tombstones.has(key) &&
          values.get(key)?.changeId === deletion.changeId &&
          record.updatedAt > deletion.deletedAt
        )
          values.delete(key);
      }
    };
    inspect('group', space.groups);
    inspect('folder', space.folders);
    inspect('site', space.sites);
  }
  return [...values.values()];
}
function same(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}
