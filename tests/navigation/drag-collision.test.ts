import { describe, expect, it } from 'vitest';
import type { ClientRect, CollisionDetection, DroppableContainer } from '@dnd-kit/core';
import { createNavigationCollision } from '../../src/features/navigation/NavigationDrag';
import { createInitialState } from '../../src/storage/model';
describe('navigation drag hit areas', () => {
  function fixture() {
    const space = createInitialState().spaces.normal;
    const folder = { ...space.groups[0], id: 'target-folder', groupId: space.groups[0].id };
    space.folders.push(folder);
    const rectangle = (left: number, top: number, width: number, height: number): ClientRect => ({
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
    });
    const siteId = `site:${space.sites[0].id}`;
    const folderId = `folder:${folder.id}`;
    const centerId = `folder-center:${folder.id}`;
    const sourceRect = rectangle(0, 0, 100, 100);
    const rects = new Map([
      [siteId, sourceRect],
      [folderId, rectangle(200, 0, 100, 100)],
      // The nested center follows a sortable animation into the source slot.
      [centerId, rectangle(25, 25, 50, 50)],
    ]);
    const containers: DroppableContainer[] = [...rects].map(([id, rect]) => ({
      id,
      key: id,
      disabled: false,
      data: { current: {} },
      node: { current: null },
      rect: { current: rect },
    }));
    const args: Parameters<CollisionDetection>[0] = {
      active: {
        id: siteId,
        data: { current: {} },
        rect: { current: { initial: sourceRect, translated: sourceRect } },
      },
      collisionRect: sourceRect,
      droppableRects: rects,
      droppableContainers: containers,
      pointerCoordinates: { x: 250, y: 50 },
    };
    const options = {
      activeDrag: { type: 'site' as const, id: space.sites[0].id },
      selectedFolderId: null,
      space,
    };
    return { args, options, siteId, folderId, centerId, rectangle };
  }

  it('enters the logical folder center even when the inner center has animated elsewhere', () => {
    const { args, options, centerId } = fixture();
    expect(createNavigationCollision(options)(args)[0]?.id).toBe(centerId);
  });

  it('keeps the folder edge available for sibling sorting', () => {
    const { args, options, folderId } = fixture();
    args.pointerCoordinates = { x: 210, y: 50 };
    expect(createNavigationCollision(options)(args)[0]?.id).toBe(folderId);
  });

  it('does not treat the displaced center over the source slot as a folder drop', () => {
    const { args, options, siteId } = fixture();
    args.pointerCoordinates = { x: 50, y: 50 };
    expect(createNavigationCollision(options)(args)[0]?.id).toBe(siteId);
  });

  it('keeps keyboard navigation on sortable items instead of nesting into their center', () => {
    const { args, options, folderId, rectangle } = fixture();
    args.pointerCoordinates = null;
    args.collisionRect = rectangle(225, 25, 50, 50);
    expect(createNavigationCollision(options)(args)[0]?.id).toBe(folderId);
  });

  it('does not enter another folder while dragging a folder or from an open folder', () => {
    const { args, options, folderId } = fixture();
    expect(
      createNavigationCollision({
        ...options,
        activeDrag: { type: 'folder', id: 'other-folder' },
      })(args)[0]?.id,
    ).toBe(folderId);
    expect(
      createNavigationCollision({ ...options, selectedFolderId: 'open-folder' })(args),
    ).toEqual([]);
  });
});
