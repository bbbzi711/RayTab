import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/storage/model';
import { applyCommand } from '../src/storage/operations';
import { mergeSpaceData } from '../src/sync/core/merge';

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
});
