import { describe, expect, it } from 'vitest';
import { createInitialState, rayStateSchema, type RayState } from '../src/storage/model';
import { applyCommand } from '../src/storage/operations';

const rootIds = (state: RayState, groupId = state.local.activeGroup.normal) =>
  [
    ...state.spaces.normal.sites.filter(
      (item) => item.groupId === groupId && item.folderId === null,
    ),
    ...state.spaces.normal.folders.filter((item) => item.groupId === groupId),
  ]
    .sort((a, b) => a.order - b.order)
    .map((item) => item.id);

describe('mixed navigation containers', () => {
  it('starts flat and lets folders and websites sort before each other', () => {
    const state = createInitialState();
    const groupId = state.local.activeGroup.normal;
    const [first, second] = state.spaces.normal.sites;
    expect(state.spaces.normal.folders).toEqual([]);
    applyCommand(state, {
      type: 'save-folder',
      spaceId: 'normal',
      id: 'folder',
      groupId,
      name: 'Folder',
    });
    expect(rootIds(state).at(-1)).toBe('folder');
    applyCommand(state, {
      type: 'move-folder',
      spaceId: 'normal',
      id: 'folder',
      groupId,
      beforeId: first.id,
    });
    applyCommand(state, {
      type: 'move-site',
      spaceId: 'normal',
      id: second.id,
      groupId,
      folderId: null,
      beforeId: 'folder',
    });
    expect(rootIds(state).slice(0, 3)).toEqual([second.id, 'folder', first.id]);
    const before = structuredClone(state);
    applyCommand(state, {
      type: 'move-folder',
      spaceId: 'normal',
      id: 'folder',
      groupId,
      beforeId: 'folder',
    });
    expect(state).toEqual(before);
  });

  it('dissolves a folder at its position while preserving website order and URLs', () => {
    const state = createInitialState();
    const groupId = state.local.activeGroup.normal;
    const [first, second, third] = state.spaces.normal.sites;
    const urls = state.spaces.normal.sites.map((item) => item.url);
    applyCommand(state, {
      type: 'save-folder',
      spaceId: 'normal',
      id: 'folder',
      groupId,
      name: 'Folder',
    });
    applyCommand(state, {
      type: 'move-sites',
      spaceId: 'normal',
      ids: [first.id, second.id],
      groupId,
      folderId: 'folder',
    });
    applyCommand(state, {
      type: 'move-folder',
      spaceId: 'normal',
      id: 'folder',
      groupId,
      beforeId: third.id,
    });
    applyCommand(state, { type: 'delete-folder', spaceId: 'normal', id: 'folder' });
    expect(rootIds(state).slice(0, 3)).toEqual([first.id, second.id, third.id]);
    expect(state.spaces.normal.sites.map((item) => item.url)).toEqual(urls);
    expect(state.spaces.normal.folders).toEqual([]);
    expect(rayStateSchema.safeParse(state).success).toBe(true);
  });

  it('moves a group’s mixed contents and folder children without losing their order', () => {
    const state = createInitialState();
    const groupId = state.local.activeGroup.normal;
    const [first, second] = state.spaces.normal.sites;
    applyCommand(state, { type: 'save-group', spaceId: 'normal', id: 'target', name: 'Target' });
    applyCommand(state, {
      type: 'save-folder',
      spaceId: 'normal',
      id: 'folder',
      groupId,
      name: 'Folder',
    });
    applyCommand(state, {
      type: 'move-site',
      spaceId: 'normal',
      id: first.id,
      groupId,
      folderId: 'folder',
    });
    applyCommand(state, {
      type: 'move-folder',
      spaceId: 'normal',
      id: 'folder',
      groupId,
      beforeId: second.id,
    });
    const order = rootIds(state);
    applyCommand(state, {
      type: 'delete-group',
      spaceId: 'normal',
      id: groupId,
      destinationGroupId: 'target',
    });
    expect(rootIds(state)).toEqual(order);
    expect(state.spaces.normal.sites.every((item) => item.groupId === 'target')).toBe(true);
    expect(first.folderId).toBe('folder');
    expect(rayStateSchema.safeParse(state).success).toBe(true);
  });

  it('rejects invalid destinations and batches before changing anything', () => {
    const state = createInitialState();
    const groupId = state.local.activeGroup.normal;
    const id = state.spaces.normal.sites[0].id;
    applyCommand(state, { type: 'save-group', spaceId: 'normal', id: 'target', name: 'Target' });
    applyCommand(state, {
      type: 'save-folder',
      spaceId: 'normal',
      id: 'other-folder',
      groupId: 'target',
      name: 'Other',
    });
    const before = structuredClone(state);
    expect(() =>
      applyCommand(state, {
        type: 'move-site',
        spaceId: 'normal',
        id,
        groupId,
        folderId: 'other-folder',
      }),
    ).toThrow('messages.theDestinationFolderDoesNotExist');
    expect(() =>
      applyCommand(state, {
        type: 'move-site',
        spaceId: 'normal',
        id,
        groupId,
        folderId: null,
        beforeId: 'other-folder',
      }),
    ).toThrow('messages.theSortTargetIsNotInTheDestination');
    expect(() =>
      applyCommand(state, {
        type: 'move-sites',
        spaceId: 'normal',
        ids: [id, 'missing'],
        groupId: 'target',
        folderId: null,
      }),
    ).toThrow('messages.theSiteDoesNotExist');
    expect(state).toEqual(before);
  });
});
