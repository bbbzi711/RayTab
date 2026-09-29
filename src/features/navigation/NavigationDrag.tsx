import * as React from 'react';
import { pointerWithin, closestCenter, useDroppable, type CollisionDetection } from '@dnd-kit/core';
import { FolderUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Group, SpaceData } from '@/storage/model';
import type { NavigationDrag, NavigationDrop } from './navigation-drop';

export function createNavigationCollision({
  activeDrag,
  selectedFolderId,
  space,
}: {
  activeDrag: NavigationDrag | null;
  selectedFolderId: string | null;
  space: SpaceData;
}): CollisionDetection {
  return (args) => {
    const { pointerCoordinates, droppableContainers } = args;

    const filtered = droppableContainers.filter((container) => {
      const id = String(container.id);

      if (activeDrag?.type === 'folder') {
        if (id === `folder-center:${activeDrag.id}`) return false;
        const site = space.sites.find((s) => s.id === id.replace('site:', ''));
        if (site && site.folderId === activeDrag.id) return false;
      }

      if (selectedFolderId !== null) {
        if (
          id === 'container:root' ||
          id.startsWith('container:group:') ||
          id.startsWith('folder:') ||
          id.startsWith('folder-center:')
        ) {
          return false;
        }
        if (id.startsWith('site:')) {
          const siteId = id.replace('site:', '');
          const site = space.sites.find((s) => s.id === siteId);
          if (site && site.folderId !== selectedFolderId) return false;
        }
      } else {
        if (id === 'container:out-of-folder' || id.startsWith('container:modal:group:')) {
          return false;
        }
      }

      return true;
    });

    if (pointerCoordinates) {
      const collisions = pointerWithin({
        ...args,
        droppableContainers: filtered,
      });

      if (collisions.length === 0) {
        return [];
      }

      if (activeDrag?.type === 'site') {
        const folderCenter = collisions.find((c) => String(c.id).startsWith('folder-center:'));
        if (folderCenter) return [folderCenter];
      }

      const itemCollision = collisions.find(
        (c) => String(c.id).startsWith('site:') || String(c.id).startsWith('folder:'),
      );
      if (itemCollision) return [itemCollision];

      const containerCollision = collisions.find((c) => String(c.id).startsWith('container:'));
      if (containerCollision) return [containerCollision];

      return collisions.slice(0, 1);
    }

    const sortableContainers = filtered.filter(
      (c) => String(c.id).startsWith('site:') || String(c.id).startsWith('folder:'),
    );

    return closestCenter({
      ...args,
      droppableContainers: sortableContainers,
    });
  };
}

export function resolveDropTarget(
  overId: string,
  overData: Record<string, unknown> | undefined,
): NavigationDrop | undefined {
  if (overData?.target) {
    return overData.target as NavigationDrop;
  }
  if (overData?.type === 'folder-center' && typeof overData.folderId === 'string') {
    return { type: 'folder-center', folderId: overData.folderId };
  }
  if (overId.startsWith('folder-center:')) {
    return { type: 'folder-center', folderId: overId.replace('folder-center:', '') };
  }
  if (overData?.type === 'site') {
    const site = overData.site as { id: string };
    return { type: 'item', id: site.id };
  }
  if (overData?.type === 'folder') {
    const folder = overData.folder as { id: string };
    return { type: 'item', id: folder.id };
  }
  if (overId.startsWith('site:')) {
    return { type: 'item', id: overId.replace('site:', '') };
  }
  if (overId.startsWith('folder:')) {
    return { type: 'item', id: overId.replace('folder:', '') };
  }
  return undefined;
}

export function DroppableRootGrid({
  groupId,
  children,
  style,
  className,
}: {
  groupId: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}) {
  const { setNodeRef } = useDroppable({
    id: 'container:root',
    data: {
      target: {
        type: 'container',
        groupId,
        folderId: null,
      } satisfies NavigationDrop,
    },
  });

  return (
    <div ref={setNodeRef} style={style} className={className}>
      {children}
    </div>
  );
}

export function DroppableGroupTab({
  group,
  className,
  children,
}: {
  group: Group;
  className?: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `container:group:${group.id}`,
    data: {
      target: {
        type: 'container',
        groupId: group.id,
        folderId: null,
      } satisfies NavigationDrop,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        className,
        'rounded-xl transition-transform',
        isOver && 'scale-105 ring-2 ring-sky-400',
      )}
    >
      {children}
    </div>
  );
}

export function FolderModalDropTargets({
  activeGroupId,
  groups,
  tr,
}: {
  activeGroupId: string;
  groups: Group[];
  tr: (text: string) => string;
}) {
  const { setNodeRef: setOutRef, isOver: isOutOver } = useDroppable({
    id: 'container:out-of-folder',
    data: {
      target: {
        type: 'container',
        groupId: activeGroupId,
        folderId: null,
      } satisfies NavigationDrop,
    },
  });

  return (
    <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-black/5 dark:bg-white/5 border border-dashed border-sky-400/30">
      <div
        ref={setOutRef}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border cursor-default',
          isOutOver
            ? 'bg-sky-500/20 border-sky-400 text-sky-200'
            : 'bg-black/10 dark:bg-white/10 border-transparent text-foreground/80',
        )}
      >
        <FolderUp size={14} />
        <span>{tr('移出文件夹')}</span>
      </div>
      {groups
        .filter((g) => g.id !== activeGroupId)
        .map((group) => (
          <ModalGroupDropItem key={group.id} group={group} />
        ))}
    </div>
  );
}

function ModalGroupDropItem({ group }: { group: Group }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `container:modal:group:${group.id}`,
    data: {
      target: {
        type: 'container',
        groupId: group.id,
        folderId: null,
      } satisfies NavigationDrop,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs transition-colors border cursor-default',
        isOver
          ? 'bg-sky-500/20 border-sky-400 text-sky-200'
          : 'bg-black/5 dark:bg-white/10 border-transparent text-foreground/70',
      )}
    >
      <span>{group.name}</span>
    </div>
  );
}
