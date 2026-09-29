import { describe, expect, it } from 'vitest';
import { createInitialState, rayStateSchema, type RayState } from '../src/storage/model';
import { applyCommand } from '../src/storage/operations';
import {
  navigationDropCommand,
  type NavigationDrag,
  type NavigationDrop,
} from '../src/features/navigation/navigation-drop';

function setup() {
  const state = createInitialState();
  const groupId = state.local.activeGroup.normal;
  applyCommand(state, { type: 'save-group', spaceId: 'normal', id: 'second', name: 'Second' });
  applyCommand(state, {
    type: 'save-folder',
    spaceId: 'normal',
    id: 'folder',
    groupId,
    name: 'Folder',
  });
  return { state, groupId, sites: state.spaces.normal.sites };
}

function drop(state: RayState, drag: NavigationDrag, target: NavigationDrop) {
  const command = navigationDropCommand(state.spaces.normal, 'normal', drag, target);
  if (command) applyCommand(state, command);
  expect(rayStateSchema.safeParse(state).success).toBe(true);
  return command;
}

const order = (state: RayState, groupId: string, folderId: string | null = null) =>
  [
    ...state.spaces.normal.sites.filter(
      (site) => site.groupId === groupId && site.folderId === folderId,
    ),
    ...(folderId === null
      ? state.spaces.normal.folders.filter((folder) => folder.groupId === groupId)
      : []),
  ]
    .sort((a, b) => a.order - b.order)
    .map((item) => item.id);

describe('navigation drop intent', () => {
  it('moves forward past the target, including the last mixed item', () => {
    const { state, groupId, sites } = setup();
    const first = sites[0].id;
    drop(state, { type: 'site', id: first }, { type: 'item', id: 'folder' });
    expect(order(state, groupId).slice(-2)).toEqual(['folder', first]);
    expect(sites[0].folderId).toBeNull();
  });

  it('moves backward before the target without putting a folder inside it', () => {
    const { state, groupId, sites } = setup();
    drop(state, { type: 'folder', id: 'folder' }, { type: 'item', id: sites[0].id });
    expect(order(state, groupId).slice(0, 2)).toEqual(['folder', sites[0].id]);
  });

  it('distinguishes folder center entry from edge sorting and allows moving out', () => {
    const { state, groupId, sites } = setup();
    const moving = sites[0];
    const originalUrl = moving.url;
    drop(state, { type: 'site', id: moving.id }, { type: 'folder-center', folderId: 'folder' });
    expect(order(state, groupId, 'folder')).toEqual([moving.id]);
    drop(state, { type: 'site', id: moving.id }, { type: 'container', groupId, folderId: null });
    expect(order(state, groupId).at(-1)).toBe(moving.id);
    expect(moving.url).toBe(originalUrl);
  });

  it('moves a populated folder across groups with its children', () => {
    const { state, sites } = setup();
    const child = sites[0];
    drop(state, { type: 'site', id: child.id }, { type: 'folder-center', folderId: 'folder' });
    drop(
      state,
      { type: 'folder', id: 'folder' },
      { type: 'container', groupId: 'second', folderId: null },
    );
    expect(order(state, 'second')).toEqual(['folder']);
    expect(child.groupId).toBe('second');
    expect(order(state, 'second', 'folder')).toEqual([child.id]);
  });

  it('inserts into a different container before the target site', () => {
    const { state, groupId, sites } = setup();
    const [first, second] = sites;
    drop(state, { type: 'site', id: second.id }, { type: 'folder-center', folderId: 'folder' });
    drop(state, { type: 'site', id: first.id }, { type: 'item', id: second.id });
    expect(order(state, groupId, 'folder')).toEqual([first.id, second.id]);
  });

  it('ignores stale targets, self drops and folder nesting without changing data', () => {
    const { state, sites } = setup();
    const before = structuredClone(state);
    const cases: [NavigationDrag, NavigationDrop][] = [
      [
        { type: 'site', id: sites[0].id },
        { type: 'item', id: sites[0].id },
      ],
      [
        { type: 'site', id: sites[0].id },
        { type: 'item', id: 'missing' },
      ],
      [
        { type: 'site', id: sites[0].id },
        { type: 'container', groupId: 'second', folderId: 'folder' },
      ],
      [
        { type: 'folder', id: 'folder' },
        { type: 'folder-center', folderId: 'folder' },
      ],
    ];
    for (const [drag, target] of cases) expect(drop(state, drag, target)).toBeUndefined();
    expect(state).toEqual(before);
  });
});
