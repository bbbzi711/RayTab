import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  rayStateSchema,
  siteSchema,
  type RayState,
} from '../src/storage/model';
import { applyCommand } from '../src/storage/operations';
import {
  createSyncConflict,
  mergeSpaceData,
  reconcileMergeConflicts,
} from '../src/sync/core/merge';

function addSite(state: RayState, id: string, groupId: string, folderId: string | null = null) {
  applyCommand(state, {
    type: 'save-site',
    spaceId: 'normal',
    id,
    groupId,
    folderId,
    site: {
      title: id,
      url: `https://${id}.example/`,
      icon: { source: 'auto' },
      iconBackground: { mode: 'auto' },
    },
  });
}

function concurrentGroupAdditions() {
  const initial = createInitialState();
  const groupId = initial.local.activeGroup.normal;
  applyCommand(initial, { type: 'save-group', spaceId: 'normal', id: 'target', name: 'Target' });
  const local = structuredClone(initial);
  const remote = structuredClone(initial);
  applyCommand(local, {
    type: 'delete-group',
    spaceId: 'normal',
    id: groupId,
    destinationGroupId: 'target',
  });
  addSite(remote, 'remote-root', groupId);
  applyCommand(remote, {
    type: 'save-folder',
    spaceId: 'normal',
    id: 'remote-folder',
    groupId,
    name: 'Remote folder',
  });
  addSite(remote, 'remote-child', groupId, 'remote-folder');
  return {
    initial,
    local,
    remote,
    merged: mergeSpaceData(initial.spaces.normal, local.spaces.normal, remote.spaces.normal),
  };
}

describe('three-way sync merge', () => {
  it('combines independent edits and reports same-field conflicts', () => {
    const base = createInitialState().spaces.normal;
    const local = structuredClone(base);
    const remote = structuredClone(base);
    local.sites[0].title = 'Local title';
    local.sites[0].updatedAt++;
    remote.sites[1].title = 'Remote title';
    remote.sites[1].updatedAt++;
    let merged = mergeSpaceData(base, local, remote);
    expect(merged.data.sites[0].title).toBe('Local title');
    expect(merged.data.sites[1].title).toBe('Remote title');
    expect(merged.conflicts).toHaveLength(0);
    remote.sites[0].title = 'Remote conflict';
    remote.sites[0].updatedAt++;
    merged = mergeSpaceData(base, local, remote);
    expect(merged.conflicts).toContainEqual(
      expect.objectContaining({ entity: 'site', id: local.sites[0].id, field: 'title' }),
    );
    expect(merged.data.sites[0].title).toBe('Local title');
  });

  it('propagates deletions instead of reviving removed records', () => {
    const initial = createInitialState();
    const base = structuredClone(initial.spaces.normal);
    applyCommand(initial, { type: 'delete-site', spaceId: 'normal', id: base.sites[0].id });
    const merged = mergeSpaceData(base, initial.spaces.normal, structuredClone(base));
    expect(merged.data.sites.some((item) => item.id === base.sites[0].id)).toBe(false);
  });

  it('merges location atomically instead of mixing a group with an unrelated folder', () => {
    const initial = createInitialState();
    const groupId = initial.local.activeGroup.normal;
    applyCommand(initial, { type: 'save-group', spaceId: 'normal', id: 'target', name: 'Target' });
    applyCommand(initial, {
      type: 'save-folder',
      spaceId: 'normal',
      id: 'folder',
      groupId,
      name: 'Folder',
    });
    const base = structuredClone(initial.spaces.normal);
    const local = structuredClone(initial);
    const remote = structuredClone(initial);
    const id = base.sites[0].id;
    applyCommand(local, {
      type: 'move-site',
      spaceId: 'normal',
      id,
      groupId: 'target',
      folderId: null,
    });
    applyCommand(remote, { type: 'move-site', spaceId: 'normal', id, groupId, folderId: 'folder' });
    const merged = mergeSpaceData(base, local.spaces.normal, remote.spaces.normal);
    expect(merged.data.sites.find((item) => item.id === id)).toMatchObject({
      groupId: 'target',
      folderId: null,
      order: 0,
    });
    expect(merged.conflicts).toContainEqual(
      expect.objectContaining({
        id,
        field: 'location',
        remote: { groupId, folderId: 'folder', order: 0 },
      }),
    );
    expect(
      merged.conflicts.some((item) =>
        ['groupId', 'folderId', 'order', 'changeId', 'updatedAt'].includes(item.field),
      ),
    ).toBe(false);
  });

  it('keeps concurrent websites and folders visible after their group is deleted elsewhere', () => {
    const { initial, remote, merged } = concurrentGroupAdditions();
    const recovery = merged.recovery!;
    expect(recovery).toMatchObject({ sites: 2, folders: 1, createdGroup: true });
    expect(merged.data.sites.map((site) => site.url).sort()).toEqual(
      remote.spaces.normal.sites.map((site) => site.url).sort(),
    );
    expect(
      merged.data.sites
        .filter((site) => initial.spaces.normal.sites.some((known) => known.id === site.id))
        .every((site) => site.groupId === 'target'),
    ).toBe(true);
    expect(merged.data.groups.at(-1)?.id).toBe(recovery.groupId);
    expect(merged.data.folders.find((folder) => folder.id === 'remote-folder')?.groupId).toBe(
      recovery.groupId,
    );
    expect(merged.data.sites.find((site) => site.id === 'remote-child')).toMatchObject({
      groupId: recovery.groupId,
      folderId: 'remote-folder',
    });
    expect(merged.data.sites.find((site) => site.id === 'remote-root')).toMatchObject({
      groupId: recovery.groupId,
      folderId: null,
    });
    expect(merged.conflicts).toEqual([]);
  });

  it('preserves websites when devices each delete the other remaining group', () => {
    const initial = createInitialState();
    const groupId = initial.local.activeGroup.normal;
    applyCommand(initial, { type: 'save-group', spaceId: 'normal', id: 'target', name: 'Target' });
    const local = structuredClone(initial);
    const remote = structuredClone(initial);
    applyCommand(local, {
      type: 'delete-group',
      spaceId: 'normal',
      id: groupId,
      destinationGroupId: 'target',
    });
    applyCommand(remote, {
      type: 'delete-group',
      spaceId: 'normal',
      id: 'target',
      destinationGroupId: groupId,
    });
    const merged = mergeSpaceData(initial.spaces.normal, local.spaces.normal, remote.spaces.normal);
    expect(merged.data.groups).toHaveLength(1);
    expect(merged.recovery).toMatchObject({
      sites: initial.spaces.normal.sites.length,
      createdGroup: true,
    });
    expect(merged.data.sites.every((site) => site.groupId === merged.data.groups[0].id)).toBe(true);
    expect(merged.data.sites.map((site) => site.url)).toEqual(
      initial.spaces.normal.sites.map((site) => site.url),
    );
    const repeated = mergeSpaceData(merged.data, merged.data, merged.data);
    expect(repeated.data).toEqual(merged.data);
    expect(repeated.recovery).toBeUndefined();
  });

  it('reuses a renamed recovery group and appends newly recovered roots after saved contents', () => {
    const { local: initial, merged: previous } = concurrentGroupAdditions();
    initial.spaces.normal = previous.data;
    const recoveryId = previous.recovery!.groupId;
    applyCommand(initial, {
      type: 'save-group',
      spaceId: 'normal',
      id: recoveryId,
      name: 'Personal archive',
    });
    const local = structuredClone(initial);
    const remote = structuredClone(initial);
    applyCommand(local, {
      type: 'delete-group',
      spaceId: 'normal',
      id: 'target',
      destinationGroupId: recoveryId,
    });
    addSite(remote, 'another-addition', 'target');
    const merged = mergeSpaceData(initial.spaces.normal, local.spaces.normal, remote.spaces.normal);
    expect(merged.data.groups).toEqual([
      expect.objectContaining({ id: recoveryId, name: 'Personal archive' }),
    ]);
    expect(merged.recovery).toEqual({
      groupId: recoveryId,
      sites: 1,
      folders: 0,
      createdGroup: false,
    });
    const recovered = merged.data.sites.find((site) => site.id === 'another-addition')!;
    const otherRoots = [
      ...merged.data.folders,
      ...merged.data.sites.filter((site) => site.folderId === null && site.id !== recovered.id),
    ];
    expect(recovered.order).toBeGreaterThan(Math.max(...otherRoots.map((item) => item.order)));
  });

  it('recreates a dissolved recovery group once and clears its obsolete deletion marker', () => {
    const { local: initial, merged: previous } = concurrentGroupAdditions();
    initial.spaces.normal = previous.data;
    const recoveryId = previous.recovery!.groupId;
    const local = structuredClone(initial);
    const remote = structuredClone(initial);
    applyCommand(local, {
      type: 'delete-group',
      spaceId: 'normal',
      id: recoveryId,
      destinationGroupId: 'target',
    });
    addSite(remote, 'late-one', recoveryId);
    addSite(remote, 'late-two', recoveryId);
    const merged = mergeSpaceData(initial.spaces.normal, local.spaces.normal, remote.spaces.normal);
    expect(merged.recovery).toEqual({
      groupId: recoveryId,
      sites: 2,
      folders: 0,
      createdGroup: true,
    });
    expect(merged.data.sites).toHaveLength(initial.spaces.normal.sites.length + 2);
    expect(
      merged.data.sites
        .filter((site) => site.groupId === recoveryId)
        .map((site) => site.order)
        .sort(),
    ).toEqual([0, 1]);
    expect(merged.data.tombstones).not.toContainEqual(
      expect.objectContaining({ entity: 'group', id: recoveryId }),
    );
    const repeated = mergeSpaceData(merged.data, merged.data, merged.data);
    expect(repeated.data).toEqual(merged.data);
    expect(repeated.recovery).toBeUndefined();
  });

  it('keeps both new and previously saved location choices applicable after a group is deleted', () => {
    const initial = createInitialState();
    const groupId = initial.local.activeGroup.normal;
    const id = initial.spaces.normal.sites[0].id;
    applyCommand(initial, { type: 'save-group', spaceId: 'normal', id: 'target', name: 'Target' });
    const local = structuredClone(initial);
    const remote = structuredClone(initial);
    applyCommand(local, {
      type: 'delete-group',
      spaceId: 'normal',
      id: groupId,
      destinationGroupId: 'target',
    });
    applyCommand(remote, { type: 'move-site', spaceId: 'normal', id, groupId, folderId: null });
    const merged = mergeSpaceData(initial.spaces.normal, local.spaces.normal, remote.spaces.normal);
    const savedConflict = createSyncConflict({
      entity: 'site',
      id,
      field: 'location',
      local: { groupId, folderId: null, order: 0 },
      remote: { groupId, folderId: null, order: 4 },
    });
    const previous = reconcileMergeConflicts(local.spaces.normal, [savedConflict]);
    for (const result of [merged, previous]) {
      const conflict = result.conflicts.find(
        (item) => item.id === id && item.field === 'location',
      )!;
      const current = result.data.sites.find((site) => site.id === id)!;
      expect(conflict.local).toEqual({
        groupId: current.groupId,
        folderId: current.folderId,
        order: current.order,
      });
      const destination = siteSchema
        .pick({ groupId: true, folderId: true, order: true })
        .parse(conflict.remote);
      const resolved = structuredClone(local);
      resolved.spaces.normal = result.data;
      applyCommand(resolved, {
        type: 'move-site',
        spaceId: 'normal',
        id,
        groupId: destination.groupId,
        folderId: destination.folderId,
      });
      expect(rayStateSchema.safeParse(resolved).success).toBe(true);
      expect(resolved.spaces.normal.sites.find((site) => site.id === id)?.groupId).toBe(
        result.recovery?.groupId,
      );
    }
    expect(savedConflict.local).toEqual({ groupId, folderId: null, order: 0 });
  });

  it('drops obsolete conflicts after the conflicting website has been explicitly deleted', () => {
    const state = createInitialState();
    const id = state.spaces.normal.sites[0].id;
    const conflict = createSyncConflict({
      entity: 'site',
      id,
      field: 'title',
      local: 'Local',
      remote: 'Remote',
    });
    applyCommand(state, { type: 'delete-site', spaceId: 'normal', id });
    expect(reconcileMergeConflicts(state.spaces.normal, [conflict]).conflicts).toEqual([]);
  });

  it('keeps a whole-record remote choice usable when its original group has been deleted', () => {
    const initial = createInitialState();
    const groupId = initial.local.activeGroup.normal;
    applyCommand(initial, { type: 'save-group', spaceId: 'normal', id: 'target', name: 'Target' });
    const local = structuredClone(initial);
    const remote = structuredClone(initial);
    applyCommand(local, {
      type: 'delete-group',
      spaceId: 'normal',
      id: groupId,
      destinationGroupId: 'target',
    });
    addSite(local, 'shared-site', 'target');
    addSite(remote, 'shared-site', groupId);
    remote.spaces.normal.sites.find((site) => site.id === 'shared-site')!.title = 'Remote content';
    const merged = mergeSpaceData(undefined, local.spaces.normal, remote.spaces.normal);
    const conflict = merged.conflicts.find(
      (item) => item.id === 'shared-site' && item.field === '*',
    )!;
    expect(conflict.local).toEqual(merged.data.sites.find((site) => site.id === 'shared-site'));
    const chosen = siteSchema.parse(conflict.remote);
    expect(chosen).toMatchObject({ title: 'Remote content', groupId: merged.recovery?.groupId });
    const resolved = structuredClone(local);
    resolved.spaces.normal = merged.data;
    Object.assign(
      resolved.spaces.normal.sites.find((site) => site.id === 'shared-site')!,
      chosen,
    );
    expect(rayStateSchema.safeParse(resolved).success).toBe(true);
  });
});
