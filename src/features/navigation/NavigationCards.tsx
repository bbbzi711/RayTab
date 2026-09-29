import { type ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { Check, Folder as FolderIcon, MoreHorizontal } from 'lucide-react';
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
  showCardBackground: boolean;
  cardOpacity: number;
  showTitle: boolean;
  manageMode: boolean;
  disabledDrag?: boolean;
  editLabel?: string;
  selected?: boolean;
  dragOverlay?: boolean;
  onToggleSelection?: () => void;
  onEdit?: () => void;
  contextMenu?: ReactNode;
};

export type SiteCardProps = CardBaseProps & {
  site: Site;
  openInNewTab: boolean;
  onClick?: (e: React.MouseEvent) => void;
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
  showCardBackground,
  cardOpacity,
  showTitle,
  manageMode,
  selected = false,
  dragOverlay = false,
  isDragging = false,
  onToggleSelection,
  onEdit,
  editLabel = 'Edit',
  onClick,
  setNodeRef,
  setActivatorNodeRef,
  attributes,
  listeners,
  transform,
  transition,
  contextMenu,
}: SiteCardProps & DragPresentation) {
  const cardNode = (
    <article
      ref={setNodeRef}
      {...listeners}
      onDragStart={(event) => event.preventDefault()}
      inert={dragOverlay || undefined}
      aria-hidden={dragOverlay || undefined}
      className={cn(
        'site-card group relative',
        showCardBackground
          ? 'backdrop-blur-md shadow-sm border border-white/10 hover:border-white/25 hover:-translate-y-1'
          : 'hover:bg-white/10 hover:backdrop-blur-sm hover:-translate-y-1',
        isDragging && !dragOverlay && 'opacity-45 scale-95 z-50',
        dragOverlay && 'scale-105 z-50 shadow-xl opacity-90',
        manageMode && 'site-card--managing',
        selected && 'site-card--selected',
      )}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        transition: dragOverlay ? undefined : transition,
        backgroundColor: showCardBackground ? `rgba(255, 255, 255, ${cardOpacity})` : undefined,
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
          onClick={onClick}
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
      {onEdit && (
        <button
          type="button"
          className={cn(
            'site-card-action site-card-action--edit',
            manageMode && 'site-card-action--visible',
          )}
          aria-label={editLabel}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onEdit();
          }}
        >
          <MoreHorizontal size={17} />
        </button>
      )}
    </article>
  );

  if (manageMode || !contextMenu || dragOverlay) {
    return cardNode;
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{cardNode}</ContextMenuTrigger>
      <ContextMenuContent>{contextMenu}</ContextMenuContent>
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
      className="relative flex items-center justify-center transition-transform group-hover:scale-105 duration-300 pointer-events-none"
      style={{ width: 'var(--site-icon-size, 48px)', height: 'var(--site-icon-size, 48px)' }}
    >
      <div
        className="absolute inset-0 bg-white/10 border border-white/20 shadow-inner flex flex-wrap content-start justify-center gap-[6%] p-[6%] overflow-hidden"
        style={{ borderRadius: 'clamp(12px, calc(var(--site-icon-size, 48px) * 0.31), 22px)' }}
      >
        {sites.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center text-white/50">
            <FolderIcon size="50%" strokeWidth={1.5} />
          </div>
        ) : (
          sites.slice(0, 4).map((site) => (
            <div
              key={site.id}
              className="relative w-[44%] aspect-square overflow-hidden rounded-[20%] bg-black/10 dark:bg-white/10"
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
  showCardBackground,
  cardOpacity,
  showTitle,
  manageMode,
  selected = false,
  dragOverlay = false,
  isDragging = false,
  isCenterOver = false,
  onToggleSelection,
  onEdit,
  editLabel = 'Edit',
  onClick,
  setNodeRef,
  setActivatorNodeRef,
  setCenterDropRef,
  attributes,
  listeners,
  transform,
  transition,
  contextMenu,
}: FolderCardProps &
  DragPresentation & {
    isCenterOver?: boolean;
    setCenterDropRef?: (node: HTMLElement | null) => void;
  }) {
  const cardNode = (
    <article
      ref={setNodeRef}
      {...listeners}
      onDragStart={(event) => event.preventDefault()}
      inert={dragOverlay || undefined}
      aria-hidden={dragOverlay || undefined}
      className={cn(
        'site-card group relative',
        showCardBackground
          ? 'backdrop-blur-md shadow-sm border border-white/10 hover:border-white/25 hover:-translate-y-1'
          : 'hover:bg-white/10 hover:backdrop-blur-sm hover:-translate-y-1',
        isDragging && !dragOverlay && 'opacity-45 scale-95 z-50',
        dragOverlay && 'scale-105 z-50 shadow-xl opacity-90',
        manageMode && 'site-card--managing',
        selected && 'site-card--selected',
        isCenterOver && !isDragging && 'ring-2 ring-white/60 shadow-lg scale-105 bg-white/10',
      )}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        transition: dragOverlay ? undefined : transition,
        backgroundColor: showCardBackground ? `rgba(255, 255, 255, ${cardOpacity})` : undefined,
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

      {onEdit && (
        <button
          type="button"
          className={cn(
            'site-card-action site-card-action--edit',
            manageMode && 'site-card-action--visible',
          )}
          aria-label={editLabel}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onEdit();
          }}
        >
          <MoreHorizontal size={17} />
        </button>
      )}
    </article>
  );

  if (manageMode || !contextMenu || dragOverlay) {
    return cardNode;
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{cardNode}</ContextMenuTrigger>
      <ContextMenuContent>{contextMenu}</ContextMenuContent>
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
