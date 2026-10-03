import { NavigationMenuItems, type NavigationAction } from './NavigationMenu';
import { useSortable } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { Check, Folder as FolderIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Site, Folder } from '@/storage/model';
import { SiteIcon } from '@/features/navigation/SiteIcon';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu';

type DragPresentation = Partial<
  Pick<
    ReturnType<typeof useSortable>,
    | 'isDragging'
    | 'setNodeRef'
    | 'setActivatorNodeRef'
    | 'attributes'
    | 'listeners'
    | 'transform'
    | 'transition'
  >
>;

export type CardBaseProps = {
  showTitle: boolean;
  manageMode: boolean;
  disabledDrag?: boolean;
  selected?: boolean;
  dragOverlay?: boolean;
  onToggleSelection?: () => void;
  menuActions?: NavigationAction[];
};

export type SiteCardProps = CardBaseProps & {
  site: Site;
  openInNewTab: boolean;
};

export type FolderCardProps = CardBaseProps & {
  folder: Folder;
  previewSites: Site[];
  onClick?: (e: React.MouseEvent) => void;
};

export function SiteTitle({ title }: { title: string }) {
  return (
    <span className="w-full mt-1.5 px-0.5 overflow-hidden">
      <span
        className="block text-xs font-medium truncate leading-tight drop-shadow-xs"
        title={title}
      >
        {title}
      </span>
    </span>
  );
}

export function SiteCardView({
  site,
  openInNewTab,
  showTitle,
  manageMode,
  selected = false,
  dragOverlay = false,
  isDragging = false,
  onToggleSelection,
  setNodeRef,
  setActivatorNodeRef,
  attributes,
  listeners,
  transform,
  transition,
  menuActions,
}: SiteCardProps & DragPresentation) {
  const cardNode = (
    <article
      data-navigation-object
      ref={setNodeRef}
      {...listeners}
      onDragStart={(event) => event.preventDefault()}
      inert={dragOverlay || undefined}
      aria-hidden={dragOverlay || undefined}
      className={cn(
        'site-card group relative',
        isDragging && !dragOverlay && 'opacity-45 scale-95 z-50',
        dragOverlay && 'scale-105 z-50 shadow-xl opacity-90',
        manageMode && 'site-card--managing',
        selected && 'site-card--selected',
      )}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        transition: dragOverlay ? undefined : transition,
      }}
    >
      {manageMode ? (
        <button
          type="button"
          className="site-card-main"
          aria-label={site.title}
          aria-pressed={selected}
          onClick={(e) => {
            e.preventDefault();
            onToggleSelection?.();
          }}
        >
          <SiteIcon site={site} interactive />
          {showTitle && <SiteTitle title={site.title} />}
        </button>
      ) : (
        <a
          {...attributes}
          role={undefined}
          ref={setActivatorNodeRef}
          draggable={false}
          href={site.url}
          target={openInNewTab ? '_blank' : undefined}
          rel={openInNewTab ? 'noreferrer' : undefined}
          aria-label={site.title}
          className="site-card-main no-underline"
        >
          <SiteIcon site={site} interactive />
          {showTitle && <SiteTitle title={site.title} />}
        </a>
      )}
      {manageMode && (
        <span className={cn('site-card-selection', selected && 'is-selected')} aria-hidden="true">
          {selected && <Check size={15} />}
        </span>
      )}
    </article>
  );

  if (manageMode || !menuActions || dragOverlay) {
    return cardNode;
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{cardNode}</ContextMenuTrigger>
      <ContextMenuContent>
        <NavigationMenuItems actions={menuActions} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function SiteCard(props: SiteCardProps) {
  const { manageMode, dragOverlay, disabledDrag, site } = props;
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `site:${site.id}`,
    data: { type: 'site', site },
    disabled: manageMode || dragOverlay || disabledDrag,
  });

  return (
    <SiteCardView
      {...props}
      isDragging={isDragging}
      setNodeRef={setNodeRef}
      setActivatorNodeRef={setActivatorNodeRef}
      attributes={!manageMode && !dragOverlay && !disabledDrag ? attributes : undefined}
      listeners={!manageMode && !dragOverlay && !disabledDrag ? listeners : undefined}
      transform={transform}
      transition={transition}
    />
  );
}

export function FolderPreview({ sites }: { sites: Site[] }) {
  return (
    <div
      className="relative flex items-center justify-center pointer-events-none"
      style={{ width: 'var(--site-icon-size, 48px)', height: 'var(--site-icon-size, 48px)' }}
    >
      <div
        className="folder-icon-frame absolute inset-0 flex flex-wrap content-start justify-center gap-[6%] p-[6%] overflow-hidden"
        style={{ borderRadius: 'var(--site-icon-radius, 24%)' }}
      >
        {sites.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center">
            <FolderIcon size="50%" strokeWidth={1.5} />
          </div>
        ) : (
          sites.slice(0, 4).map((site) => (
            <div
              key={site.id}
              className="relative w-[44%] aspect-square overflow-hidden"
              style={{ borderRadius: 'var(--site-icon-radius, 24%)' }}
            >
              <div
                className="absolute inset-0 origin-top-left flex items-center justify-center"
                style={{ width: '227%', height: '227%', transform: 'scale(0.44)' }}
              >
                <SiteIcon site={site} interactive={false} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function FolderCardView({
  folder,
  previewSites,
  showTitle,
  manageMode,
  selected = false,
  dragOverlay = false,
  isDragging = false,
  isCenterOver = false,
  onToggleSelection,
  onClick,
  setNodeRef,
  setActivatorNodeRef,
  setCenterDropRef,
  attributes,
  listeners,
  transform,
  transition,
  menuActions,
}: FolderCardProps &
  DragPresentation & {
    isCenterOver?: boolean;
    setCenterDropRef?: (node: HTMLElement | null) => void;
  }) {
  const cardNode = (
    <article
      data-navigation-object
      ref={setNodeRef}
      {...listeners}
      onDragStart={(event) => event.preventDefault()}
      inert={dragOverlay || undefined}
      aria-hidden={dragOverlay || undefined}
      className={cn(
        'site-card group relative',
        isDragging && !dragOverlay && 'opacity-45 scale-95 z-50',
        dragOverlay && 'scale-105 z-50 shadow-xl opacity-90',
        manageMode && 'site-card--managing',
        selected && 'site-card--selected',
        isCenterOver && !isDragging && 'ring-2 ring-white/60 shadow-lg scale-105 bg-white/10',
      )}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        transition: dragOverlay ? undefined : transition,
      }}
    >
      {!manageMode && !isDragging && !dragOverlay && (
        <div
          ref={setCenterDropRef}
          className="absolute inset-[25%] z-10 rounded-xl pointer-events-none"
          aria-hidden="true"
        />
      )}

      <button
        {...attributes}
        role={undefined}
        ref={setActivatorNodeRef}
        type="button"
        aria-label={folder.name}
        className="site-card-main"
        onClick={(e) => {
          if (manageMode) {
            e.preventDefault();
            onToggleSelection?.();
            return;
          }
          onClick?.(e);
        }}
      >
        <FolderPreview sites={previewSites} />
        {showTitle && <SiteTitle title={folder.name} />}
      </button>

      {manageMode && (
        <span className={cn('site-card-selection', selected && 'is-selected')} aria-hidden="true">
          {selected && <Check size={15} />}
        </span>
      )}
    </article>
  );

  if (manageMode || !menuActions || dragOverlay) {
    return cardNode;
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{cardNode}</ContextMenuTrigger>
      <ContextMenuContent>
        <NavigationMenuItems actions={menuActions} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function FolderCard(props: FolderCardProps) {
  const { manageMode, dragOverlay, disabledDrag, folder } = props;
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `folder:${folder.id}`,
    data: { type: 'folder', folder },
    disabled: manageMode || dragOverlay || disabledDrag,
  });

  const { setNodeRef: setCenterDropRef, isOver: isCenterOver } = useDroppable({
    id: `folder-center:${folder.id}`,
    data: { type: 'folder-center', folderId: folder.id },
    disabled: manageMode || dragOverlay || disabledDrag,
  });

  return (
    <FolderCardView
      {...props}
      isDragging={isDragging}
      isCenterOver={isCenterOver}
      setNodeRef={setSortableRef}
      setActivatorNodeRef={setActivatorNodeRef}
      setCenterDropRef={setCenterDropRef}
      attributes={!manageMode && !dragOverlay && !disabledDrag ? attributes : undefined}
      listeners={!manageMode && !dragOverlay && !disabledDrag ? listeners : undefined}
      transform={transform}
      transition={transition}
    />
  );
}
