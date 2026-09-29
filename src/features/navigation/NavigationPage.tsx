import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  MeasuringStrategy,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { Plus, FolderPlus, ListTree, CheckSquare, House, Layers, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogHeader,
} from '@/components/ui/dialog';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from '@/components/ui/context-menu';
import { dispatch } from '@/storage/store';
import type { Command } from '@/storage/operations';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  type RayState,
  type Site,
  type Folder,
  type Group,
  effectiveSettings,
} from '@/storage/model';
import { t } from '@/locales';
import { resolveHomeTextColors } from '@/features/appearance/text-colors';
import { cn } from '@/lib/utils';
import { SiteCard, SiteCardView, FolderCard, FolderCardView } from './NavigationCards';
import { SiteEditor } from './SiteEditor';
import { NameDialog, MoveDialog } from './NavigationDialogs';
import { navigationDropCommand, type NavigationDrag } from './navigation-drop';
import {
  createNavigationCollision,
  resolveDropTarget,
  DroppableRootGrid,
  DroppableGroupTab,
  FolderModalDropTargets,
} from './NavigationDrag';

export interface NavigationPageProps {
  state: RayState;
  spaceId: 'normal' | 'private';
  onError: (message: string) => void;
  groupsPortal?: HTMLElement | null;
  onOpenSettings?: () => void;
}

const byOrder = (a: { order: number; id: string }, b: { order: number; id: string }) =>
  a.order - b.order || a.id.localeCompare(b.id);

type RootItem = { kind: 'folder'; folder: Folder } | { kind: 'site'; site: Site };

export function NavigationPage({
  state,
  spaceId,
  onError,
  groupsPortal,
  onOpenSettings,
}: NavigationPageProps) {
  const space = state.spaces[spaceId];
  const settings = effectiveSettings(state, spaceId);
  const tr = (text: string) => t(settings.language, text);
  const [confirm, confirmDialog] = useConfirm();

  const run = useCallback(
    async (command: Command) => {
      try {
        await dispatch(command);
        return true;
      } catch (err) {
        onError(err instanceof Error ? err.message : String(err));
        return false;
      }
    },
    [onError],
  );

  const activeGroupId = state.local.activeGroup[spaceId] || space.groups[0]?.id;
  const selectedFolderId = state.local.selectedFolder[spaceId]?.[activeGroupId] ?? null;

  const orderedGroups = useMemo(() => [...space.groups].sort(byOrder), [space.groups]);
  const activeGroup = orderedGroups.find((g) => g.id === activeGroupId) || orderedGroups[0];

  const rootItems = useMemo<RootItem[]>(() => {
    const folders = space.folders
      .filter((f) => f.groupId === activeGroup.id)
      .map((f) => ({ kind: 'folder' as const, folder: f }));
    const sites = space.sites
      .filter((s) => s.groupId === activeGroup.id && s.folderId === null)
      .map((s) => ({ kind: 'site' as const, site: s }));
    return [...folders, ...sites].sort((a, b) =>
      byOrder(a.kind === 'folder' ? a.folder : a.site, b.kind === 'folder' ? b.folder : b.site),
    );
  }, [space.folders, space.sites, activeGroup.id]);

  const rootSortableIds = useMemo(
    () =>
      rootItems.map((item) =>
        item.kind === 'folder' ? `folder:${item.folder.id}` : `site:${item.site.id}`,
      ),
    [rootItems],
  );

  const folderSites = useMemo(() => {
    if (!selectedFolderId) return [];
    return space.sites
      .filter((s) => s.groupId === activeGroup.id && s.folderId === selectedFolderId)
      .sort(byOrder);
  }, [space.sites, activeGroup.id, selectedFolderId]);

  const folderSortableIds = useMemo(() => folderSites.map((s) => `site:${s.id}`), [folderSites]);

  const folderDialogWidth = useMemo(() => {
    const folderCols = Math.max(1, Math.min(folderSites.length + 1, settings.maxCardsPerRow, 5));
    const estimated = folderCols * settings.cardSize + (folderCols - 1) * settings.iconSpacing + 64;
    return Math.max(360, Math.min(estimated, 760));
  }, [folderSites.length, settings.cardSize, settings.maxCardsPerRow, settings.iconSpacing]);

  const selectedFolder = useMemo(
    () => (selectedFolderId ? space.folders.find((f) => f.id === selectedFolderId) || null : null),
    [space.folders, selectedFolderId],
  );

  const [manageMode, setManageMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | undefined>();
  const [nameTarget, setNameTarget] = useState<{
    type: 'group' | 'folder';
    item?: Group | Folder;
  } | null>(null);
  const [moveTarget, setMoveTarget] = useState<{
    type: 'site' | 'folder' | 'group' | 'sites';
    item?: Site | Folder | Group;
    ids?: string[];
  } | null>(null);

  const [activeDrag, setActiveDrag] = useState<NavigationDrag | null>(null);
  const dragEndAt = useRef(0);

  const activeSite = useMemo(
    () =>
      activeDrag?.type === 'site' ? space.sites.find((s) => s.id === activeDrag.id) : undefined,
    [activeDrag, space.sites],
  );
  const activeFolder = useMemo(
    () =>
      activeDrag?.type === 'folder' ? space.folders.find((f) => f.id === activeDrag.id) : undefined,
    [activeDrag, space.folders],
  );

  const isPointerIntercepted = useCallback((e?: React.MouseEvent) => {
    if (Date.now() - dragEndAt.current < 150) {
      if (!e || e.detail > 0) {
        e?.preventDefault();
        e?.stopPropagation();
        return true;
      }
    }
    return false;
  }, []);

  const handleContainerClickCapture = useCallback((e: React.MouseEvent) => {
    if (Date.now() - dragEndAt.current < 150) {
      if (e.detail > 0) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], end: ['Space'], cancel: ['Escape'] },
    }),
  );

  const collisionDetection = useMemo(
    () =>
      createNavigationCollision({
        activeDrag,
        selectedFolderId,
        space,
      }),
    [activeDrag, selectedFolderId, space],
  );

  const handleDragStart = useCallback(({ active }: DragStartEvent) => {
    const id = String(active.id);
    if (id.startsWith('site:')) {
      setActiveDrag({ type: 'site', id: id.replace('site:', '') });
    } else if (id.startsWith('folder:')) {
      setActiveDrag({ type: 'folder', id: id.replace('folder:', '') });
    }
  }, []);

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      dragEndAt.current = Date.now();
      setActiveDrag(null);
      if (!over) return;

      const activeId = String(active.id);
      const drag: NavigationDrag = activeId.startsWith('site:')
        ? { type: 'site', id: activeId.replace('site:', '') }
        : { type: 'folder', id: activeId.replace('folder:', '') };

      const drop = resolveDropTarget(
        String(over.id),
        over.data?.current as Record<string, unknown> | undefined,
      );

      if (drop) {
        const cmd = navigationDropCommand(space, spaceId, drag, drop);
        if (cmd) {
          run(cmd);
        }
      }
    },
    [space, spaceId, run],
  );

  const handleDragCancel = useCallback(() => {
    dragEndAt.current = Date.now();
    setActiveDrag(null);
  }, []);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [activeGroupId, selectedFolderId, spaceId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!selectedFolderId && !editorOpen && !nameTarget && !moveTarget && manageMode) {
          setManageMode(false);
          setSelectedIds(new Set());
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedFolderId, editorOpen, nameTarget, moveTarget, manageMode]);

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const gridStyle = {
    '--site-card-size': `${settings.cardSize}px`,
    '--site-icon-size': `${settings.cardSize * settings.iconSizeRatio}px`,
    '--site-grid-gap': `${settings.iconSpacing}px`,
    maxWidth: `${settings.cardSize * settings.maxCardsPerRow + settings.iconSpacing * (settings.maxCardsPerRow - 1) + 16}px`,
    margin: '0 auto',
  } as React.CSSProperties;

  const handleNameSave = async (name: string) => {
    if (!nameTarget) return;
    const isNew = !nameTarget.item;
    const id = isNew ? crypto.randomUUID() : nameTarget.item!.id;
    const expected = isNew ? undefined : nameTarget.item!.updatedAt;
    if (nameTarget.type === 'group') {
      await dispatch({ type: 'save-group', spaceId, id, name, expected });
      if (isNew) await dispatch({ type: 'select-group', spaceId, groupId: id });
    } else {
      await dispatch({ type: 'save-folder', spaceId, id, groupId: activeGroup.id, name, expected });
    }
  };

  const handleMoveSave = async (groupId: string, folderId: string | null) => {
    if (!moveTarget) return;
    if (moveTarget.type === 'site' && moveTarget.item) {
      await dispatch({ type: 'move-site', spaceId, id: moveTarget.item.id, groupId, folderId });
    } else if (moveTarget.type === 'folder' && moveTarget.item) {
      await dispatch({ type: 'move-folder', spaceId, id: moveTarget.item.id, groupId });
    } else if (moveTarget.type === 'sites' && moveTarget.ids) {
      await dispatch({ type: 'move-sites', spaceId, ids: moveTarget.ids, groupId, folderId });
      setSelectedIds(new Set());
      setManageMode(false);
    } else if (moveTarget.type === 'group' && moveTarget.item) {
      await dispatch({
        type: 'delete-group',
        spaceId,
        id: moveTarget.item.id,
        destinationGroupId: groupId,
      });
    }
  };

  const renderSiteContextMenu = (site: Site) => (
    <>
      <ContextMenuItem
        onClick={() => {
          setEditingSite(site);
          setEditorOpen(true);
        }}
      >
        {tr('编辑')}
      </ContextMenuItem>
      <ContextMenuItem
        onClick={() => {
          navigator.clipboard
            .writeText(site.url)
            .then(() => onError(tr('已复制网址到剪贴板')))
            .catch((e: Error) => onError(e.message || tr('复制失败')));
        }}
      >
        {tr('复制网址')}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => setMoveTarget({ type: 'site', item: site })}>
        {tr('移动')}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        className="text-red-500"
        onClick={async () => {
          const ok = await confirm({
            title: tr('确定删除网站？'),
            description: site.title,
            confirmText: tr('删除'),
            cancelText: tr('取消'),
            variant: 'destructive',
          });
          if (ok) {
            run({ type: 'delete-site', spaceId, id: site.id });
          }
        }}
      >
        {tr('删除')}
      </ContextMenuItem>
    </>
  );

  const renderFolderContextMenu = (folder: Folder) => (
    <>
      <ContextMenuItem onClick={() => setNameTarget({ type: 'folder', item: folder })}>
        {tr('重命名')}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => setMoveTarget({ type: 'folder', item: folder })}>
        {tr('移动')}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        className="text-red-500"
        onClick={async () => {
          const ok = await confirm({
            title: tr('确定解散文件夹？'),
            description: tr('文件夹内的网站将被移出到当前分组，不会被删除。'),
            confirmText: tr('解散'),
            cancelText: tr('取消'),
            variant: 'destructive',
          });
          if (ok) {
            run({ type: 'delete-folder', spaceId, id: folder.id });
          }
        }}
      >
        {tr('解散')}
      </ContextMenuItem>
    </>
  );

  const renderToolbar = (currentSites: Site[]) => {
    const allSelected = currentSites.length > 0 && currentSites.every((s) => selectedIds.has(s.id));
    const handleToggleAll = () => {
      if (allSelected) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          currentSites.forEach((s) => next.delete(s.id));
          return next;
        });
      } else {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          currentSites.forEach((s) => next.add(s.id));
          return next;
        });
      }
    };

    return (
      <div
        className="flex flex-wrap items-center gap-2 p-2 bg-black/10 dark:bg-white/10 rounded-xl mb-4 backdrop-blur-md w-full"
        style={{ maxWidth: gridStyle.maxWidth }}
      >
        <Button
          type="button"
          variant="ghost"
          className="rounded-xl cursor-pointer"
          aria-label={allSelected ? tr('取消全选') : tr('全选当前')}
          title={allSelected ? tr('取消全选') : tr('全选当前')}
          onClick={handleToggleAll}
        >
          <CheckSquare className="mr-2" size={16} />
          {allSelected ? tr('取消全选') : tr('全选当前')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={selectedIds.size === 0}
          className="rounded-xl cursor-pointer"
          aria-label={tr('移动所选')}
          title={tr('移动所选')}
          onClick={() => setMoveTarget({ type: 'sites', ids: Array.from(selectedIds) })}
        >
          {tr('移动所选')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="text-red-500 rounded-xl cursor-pointer hover:bg-red-500/10"
          disabled={selectedIds.size === 0}
          aria-label={tr('删除所选')}
          title={tr('删除所选')}
          onClick={async () => {
            const ok = await confirm({
              title: tr('确定删除所选网站？'),
              description: `${tr('已选择')} ${selectedIds.size} ${tr('个网站')}`,
              confirmText: tr('删除'),
              cancelText: tr('取消'),
              variant: 'destructive',
            });
            if (ok) {
              if (await run({ type: 'delete-sites', spaceId, ids: Array.from(selectedIds) })) {
                setSelectedIds(new Set());
              }
            }
          }}
        >
          {tr('删除所选')}
        </Button>
        {selectedIds.size > 0 && (
          <span className="text-xs text-muted-foreground px-2">
            {tr('已选择')} {selectedIds.size}
          </span>
        )}
        <div className="flex-1 min-w-[8px]" />
        <Button
          type="button"
          variant="default"
          className="rounded-xl cursor-pointer px-4 bg-slate-900 text-white dark:bg-white dark:text-slate-900"
          aria-label={tr('完成')}
          title={tr('完成')}
          onClick={() => {
            setManageMode(false);
            setSelectedIds(new Set());
          }}
        >
          {tr('完成')}
        </Button>
      </div>
    );
  };

  return (
    <DndContext
      sensors={sensors}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always, frequency: 100 } }}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div
        className="w-full flex flex-col items-center flex-1 min-h-0"
        style={{ color: 'var(--home-tabs-color)' }}
        onClickCapture={handleContainerClickCapture}
      >
        {groupsPortal &&
          createPortal(
            <div className="flex flex-col gap-[7px] w-full text-[var(--home-tabs-color)]">
              {orderedGroups.map((group, index) => {
                const GroupIcon = index === 0 ? House : Layers;
                return (
                  <DroppableGroupTab key={group.id} group={group} className="w-full">
                    <Tooltip content={group.name} side="right">
                      <ContextMenu>
                        <ContextMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label={group.name}
                            aria-pressed={group.id === activeGroup.id}
                            className={cn(
                              'relative flex flex-col items-center justify-center w-full min-h-[54px] gap-[5px] rounded-xl transition-all duration-150 cursor-pointer overflow-hidden',
                              group.id === activeGroup.id
                                ? 'bg-white/15 shadow-xs'
                                : 'opacity-75 hover:opacity-100 hover:bg-white/10',
                            )}
                            onClick={() =>
                              run({ type: 'select-group', spaceId, groupId: group.id })
                            }
                          >
                            {group.id === activeGroup.id && (
                              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[22px] bg-blue-400 rounded-r-md" />
                            )}
                            <GroupIcon size={19} strokeWidth={1.6} />
                            <span className="text-[11px] font-medium leading-none truncate w-full text-center px-1">
                              {group.name}
                            </span>
                          </button>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          <ContextMenuItem
                            onClick={() => setNameTarget({ type: 'group', item: group })}
                          >
                            {tr('重命名')}
                          </ContextMenuItem>
                          <ContextMenuItem
                            disabled={index === 0}
                            onClick={() =>
                              run({
                                type: 'move-group',
                                spaceId,
                                id: group.id,
                                beforeId: orderedGroups[index - 1].id,
                              })
                            }
                          >
                            {tr('前移')}
                          </ContextMenuItem>
                          <ContextMenuItem
                            disabled={index === orderedGroups.length - 1}
                            onClick={() =>
                              run({
                                type: 'move-group',
                                spaceId,
                                id: group.id,
                                beforeId: orderedGroups[index + 2]?.id,
                              })
                            }
                          >
                            {tr('后移')}
                          </ContextMenuItem>
                          <ContextMenuSeparator />
                          <ContextMenuItem
                            className="text-red-500"
                            disabled={orderedGroups.length <= 1}
                            onClick={() => setMoveTarget({ type: 'group', item: group })}
                          >
                            {tr('删除')}
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    </Tooltip>
                  </DroppableGroupTab>
                );
              })}
              <Tooltip content={tr('添加分组')} side="right">
                <button
                  type="button"
                  aria-label={tr('添加分组')}
                  className="flex flex-col items-center justify-center w-full min-h-[54px] gap-[5px] rounded-xl text-white/75 hover:text-white hover:bg-white/10 transition-all duration-150 cursor-pointer"
                  onClick={() => setNameTarget({ type: 'group' })}
                >
                  <Plus size={19} strokeWidth={1.6} />
                </button>
              </Tooltip>
            </div>,
            groupsPortal,
          )}

        {manageMode &&
          !selectedFolderId &&
          renderToolbar(
            rootItems
              .filter((i) => i.kind === 'site')
              .map((i) => (i as { kind: 'site'; site: Site }).site),
          )}

        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div className="w-full min-h-[40vh]">
              <DroppableRootGrid
                groupId={activeGroup.id}
                style={gridStyle}
                className="site-grid w-full mb-12 min-h-[200px]"
              >
                <SortableContext items={rootSortableIds} strategy={rectSortingStrategy}>
                  {rootItems.map((item) =>
                    item.kind === 'folder' ? (
                      <FolderCard
                        key={item.folder.id}
                        folder={item.folder}
                        previewSites={space.sites
                          .filter((s) => s.folderId === item.folder.id)
                          .sort(byOrder)}
                        showCardBackground={settings.showCardBackground}
                        cardOpacity={settings.cardOpacity}
                        showTitle={settings.showSiteTitle}
                        manageMode={false}
                        disabledDrag={manageMode}
                        selected={false}
                        onClick={(e) => {
                          if (isPointerIntercepted(e)) return;
                          run({
                            type: 'select-folder',
                            spaceId,
                            groupId: activeGroup.id,
                            folderId: item.folder.id,
                          });
                        }}
                        contextMenu={renderFolderContextMenu(item.folder)}
                      />
                    ) : (
                      <SiteCard
                        key={item.site.id}
                        site={item.site}
                        editLabel={tr('编辑网站')}
                        openInNewTab={settings.openInNewTab}
                        showCardBackground={settings.showCardBackground}
                        cardOpacity={settings.cardOpacity}
                        showTitle={settings.showSiteTitle}
                        manageMode={manageMode}
                        disabledDrag={manageMode}
                        selected={selectedIds.has(item.site.id)}
                        onToggleSelection={() => toggleSelection(item.site.id)}
                        onEdit={() => {
                          setEditingSite(item.site);
                          setEditorOpen(true);
                        }}
                        onClick={(e) => {
                          if (isPointerIntercepted(e)) {
                            e.preventDefault();
                            e.stopPropagation();
                          }
                        }}
                        contextMenu={renderSiteContextMenu(item.site)}
                      />
                    ),
                  )}
                  {!manageMode && (
                    <button
                      type="button"
                      className="add-site-card cursor-pointer"
                      aria-label={tr('添加网站')}
                      title={tr('添加网站')}
                      onClick={() => {
                        setEditingSite(undefined);
                        setEditorOpen(true);
                      }}
                    >
                      <span className="add-site-icon">
                        <Plus size={22} />
                      </span>
                      <span className="text-xs font-medium leading-tight">{tr('添加网站')}</span>
                    </button>
                  )}
                </SortableContext>
              </DroppableRootGrid>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem
              onClick={() => {
                setEditingSite(undefined);
                setEditorOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              {tr('添加网站')}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => setNameTarget({ type: 'folder' })}>
              <FolderPlus className="mr-2 h-4 w-4" />
              {tr('新建文件夹')}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => setManageMode(true)}>
              <ListTree className="mr-2 h-4 w-4" />
              {tr('整理')}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onOpenSettings?.()}>
              <Settings2 className="mr-2 h-4 w-4" />
              {tr('设置')}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>

        <Dialog
          open={Boolean(selectedFolderId)}
          onOpenChange={(open) => {
            if (!open) {
              run({
                type: 'select-folder',
                spaceId,
                groupId: activeGroup.id,
                folderId: null,
              });
            }
          }}
        >
          <DialogContent
            variant="center"
            closeLabel={tr('关闭')}
            className="folder-dialog w-full sm:max-w-none max-h-[min(80vh,800px)] overflow-y-auto flex flex-col gap-4 p-6"
            style={
              {
                width: `min(${folderDialogWidth}px, calc(100vw - 2rem))`,
                maxWidth: `min(${folderDialogWidth}px, calc(100vw - 2rem))`,
                '--home-cards-color': 'var(--dialog-text)',
              } as React.CSSProperties
            }
            onEscapeKeyDown={(event) => {
              if (activeDrag) event.preventDefault();
            }}
          >
            <DialogHeader>
              <div className="flex flex-wrap items-center justify-between gap-3 pr-10">
                <div className="min-w-0 flex-1">
                  <DialogTitle className="text-xl font-semibold truncate">
                    {selectedFolder?.name}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                    {folderSites.length} {tr('个网站')}
                  </DialogDescription>
                </div>
                {!manageMode && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-xl shrink-0"
                    onClick={() => setManageMode(true)}
                  >
                    <ListTree size={15} />
                    {tr('整理')}
                  </Button>
                )}
              </div>
            </DialogHeader>

            {activeDrag && (
              <FolderModalDropTargets
                activeGroupId={activeGroup.id}
                groups={orderedGroups}
                tr={tr}
              />
            )}

            {manageMode && renderToolbar(folderSites)}

            <div className="site-grid w-full" style={gridStyle}>
              <SortableContext items={folderSortableIds} strategy={rectSortingStrategy}>
                {folderSites.map((site) => (
                  <SiteCard
                    key={site.id}
                    site={site}
                    editLabel={tr('编辑网站')}
                    openInNewTab={settings.openInNewTab}
                    showCardBackground={settings.showCardBackground}
                    cardOpacity={settings.cardOpacity}
                    showTitle={settings.showSiteTitle}
                    manageMode={manageMode}
                    disabledDrag={manageMode}
                    selected={selectedIds.has(site.id)}
                    onToggleSelection={() => toggleSelection(site.id)}
                    onEdit={() => {
                      setEditingSite(site);
                      setEditorOpen(true);
                    }}
                    onClick={(e) => {
                      if (isPointerIntercepted(e)) {
                        e.preventDefault();
                        e.stopPropagation();
                      }
                    }}
                    contextMenu={renderSiteContextMenu(site)}
                  />
                ))}
                {!manageMode && (
                  <button
                    type="button"
                    className="add-site-card cursor-pointer"
                    aria-label={tr('添加网站')}
                    title={tr('添加网站')}
                    onClick={() => {
                      setEditingSite(undefined);
                      setEditorOpen(true);
                    }}
                  >
                    <span className="add-site-icon">
                      <Plus size={22} />
                    </span>
                    <span className="text-xs font-medium leading-tight">{tr('添加网站')}</span>
                  </button>
                )}
              </SortableContext>
            </div>
          </DialogContent>
        </Dialog>

        {nameTarget && (
          <NameDialog
            title={
              nameTarget.type === 'group'
                ? nameTarget.item
                  ? tr('重命名分组')
                  : tr('新建分组')
                : nameTarget.item
                  ? tr('重命名文件夹')
                  : tr('新建文件夹')
            }
            initialName={nameTarget.item?.name}
            onSave={handleNameSave}
            onClose={() => setNameTarget(null)}
            onError={onError}
            tr={tr}
          />
        )}

        {moveTarget && (
          <MoveDialog
            title={moveTarget.type === 'group' ? tr('删除分组') : tr('移动')}
            description={
              moveTarget.type === 'group'
                ? tr('请选择将分组内的网站和文件夹移动到哪个分组：')
                : undefined
            }
            groups={space.groups}
            folders={space.folders}
            initialGroupId={activeGroupId}
            excludeGroupId={moveTarget.type === 'group' ? moveTarget.item!.id : undefined}
            allowFolders={moveTarget.type !== 'group' && moveTarget.type !== 'folder'}
            confirmLabel={moveTarget.type === 'group' ? tr('删除并移动') : undefined}
            onMove={handleMoveSave}
            onClose={() => setMoveTarget(null)}
            onError={onError}
            tr={tr}
          />
        )}

        {editorOpen && (
          <SiteEditor
            site={editingSite}
            space={space}
            spaceId={spaceId}
            groupId={activeGroupId}
            folderId={selectedFolderId}
            onClose={() => setEditorOpen(false)}
            onError={onError}
            tr={tr}
          />
        )}

        {confirmDialog}

        {createPortal(
          <DragOverlay dropAnimation={null} zIndex={100}>
            {activeDrag?.type === 'site' && activeSite && (
              <div
                style={
                  {
                    width: `${settings.cardSize}px`,
                    height: `${settings.cardSize}px`,
                    '--home-cards-color': selectedFolder
                      ? 'var(--dialog-text)'
                      : resolveHomeTextColors(settings).cards,
                    '--site-card-size': `${settings.cardSize}px`,
                    '--site-icon-size': `${settings.cardSize * settings.iconSizeRatio}px`,
                  } as React.CSSProperties
                }
              >
                <SiteCardView
                  site={activeSite}
                  editLabel={tr('编辑网站')}
                  openInNewTab={settings.openInNewTab}
                  showCardBackground={settings.showCardBackground}
                  cardOpacity={settings.cardOpacity}
                  showTitle={settings.showSiteTitle}
                  manageMode={false}
                  dragOverlay
                />
              </div>
            )}
            {activeDrag?.type === 'folder' && activeFolder && (
              <div
                style={
                  {
                    width: `${settings.cardSize}px`,
                    height: `${settings.cardSize}px`,
                    '--home-cards-color': selectedFolder
                      ? 'var(--dialog-text)'
                      : resolveHomeTextColors(settings).cards,
                    '--site-card-size': `${settings.cardSize}px`,
                    '--site-icon-size': `${settings.cardSize * settings.iconSizeRatio}px`,
                  } as React.CSSProperties
                }
              >
                <FolderCardView
                  folder={activeFolder}
                  previewSites={space.sites
                    .filter((s) => s.folderId === activeFolder.id)
                    .sort(byOrder)}
                  showCardBackground={settings.showCardBackground}
                  cardOpacity={settings.cardOpacity}
                  showTitle={settings.showSiteTitle}
                  manageMode={false}
                  dragOverlay
                />
              </div>
            )}
          </DragOverlay>,
          document.body,
        )}
      </div>
    </DndContext>
  );
}
