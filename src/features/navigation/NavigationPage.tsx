import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useImperativeHandle,
  useRef,
  type Ref,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/errors';
import { NavigationMenuItems, type NavigationAction } from './NavigationMenu';
import { useShallow } from 'zustand/react/shallow';
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
import {
  ArrowDown,
  ArrowUp,
  FolderOpen,
  LockKeyhole,
  Plus,
  ListChecks,
  CheckSquare,
  Square,
  Pencil,
  FolderInput,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogHeader,
} from '@/components/ui/dialog';
import { ContextMenu, ContextMenuTrigger, ContextMenuContent } from '@/components/ui/context-menu';
import { selectEffectiveSettings, useRayTabStore } from '@/storage/store';
import type { Command } from '@/storage/operations';
import type { GroupTab } from '@/storage/group-privacy';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { type Site, type Folder, type Group } from '@/storage/model';
import { resolveHomeTextColors } from '@/features/appearance/text-colors';
import { cn } from '@/lib/utils';
import { SiteCard, SiteCardView, FolderCard, FolderCardView, SiteTitle } from './NavigationCards';
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

export type NavigationHandle = { addSite: () => void; addFolder: () => void; organize: () => void };

export interface NavigationPageProps {
  spaceId: 'normal' | 'private';
  groupId?: string;
  active: boolean;
  groupTabs: GroupTab[];
  showGrid: boolean;
  showHidden: boolean;
  legacyLocked: boolean;
  onSelectGroup: (group?: GroupTab) => void;
  onToggleHidden: () => void;
  onDeleteGroup: (group: GroupTab) => void;
  ref?: Ref<NavigationHandle>;
}

const byOrder = (a: { order: number; id: string }, b: { order: number; id: string }) =>
  a.order - b.order || a.id.localeCompare(b.id);
const groupTabClass =
  'relative h-10 max-w-40 justify-start px-2.5 text-current opacity-75 hover:no-underline hover:opacity-100 focus-visible:ring-current aria-pressed:font-semibold aria-pressed:opacity-100 aria-pressed:after:absolute aria-pressed:after:inset-x-2.5 aria-pressed:after:bottom-1 aria-pressed:after:h-0.5 aria-pressed:after:rounded-full aria-pressed:after:bg-current';
const groupStripClass =
  'flex min-w-0 items-center gap-1 overflow-x-auto overscroll-x-contain px-0.5 py-0.5';

type RootItem = { kind: 'folder'; folder: Folder } | { kind: 'site'; site: Site };

export function NavigationPage({
  spaceId,
  groupId,
  ref,
  active,
  groupTabs,
  showGrid,
  showHidden,
  legacyLocked,
  onSelectGroup,
  onToggleHidden,
  onDeleteGroup,
}: NavigationPageProps) {
  const space = useRayTabStore((store) => store.state?.spaces[spaceId])!;
  const settings = useRayTabStore(useShallow((store) => selectEffectiveSettings(store, 'normal')))!;
  const selectedGroupId = useRayTabStore((store) => store.state?.local.activeGroup[spaceId]);
  const activeGroupId = groupId ?? selectedGroupId ?? space.groups[0].id;
  const selectedFolderId = useRayTabStore(
    (store) => store.state?.local.selectedFolder[spaceId]?.[activeGroupId] ?? null,
  );
  const dispatch = useRayTabStore((store) => store.dispatch);
  const { t } = useTranslation();
  const [confirm, confirmDialog] = useConfirm();

  const run = useCallback(
    async (command: Command) => {
      try {
        await dispatch(command);
        return true;
      } catch (err) {
        toast.error(errorMessage(err));
        return false;
      }
    },
    [dispatch],
  );

  const orderedGroups = useMemo(
    () =>
      space.groups
        .filter((group) => groupTabs.some((tab) => tab.spaceId === spaceId && tab.id === group.id))
        .sort(byOrder),
    [groupTabs, spaceId, space.groups],
  );
  const activeGroup = orderedGroups.find((group) => group.id === activeGroupId) ?? space.groups[0];
  const groupStrip = useRef<HTMLDivElement>(null);
  const pendingClick = useRef<{ count: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const firstGestureGroup = groupTabs.find((group) => !group.hidden && !group.encrypted);
  const hasHiddenGroups = legacyLocked || groupTabs.some((group) => group.hidden);
  const visibleTabs = [
    ...groupTabs.filter((group) => !group.hidden),
    ...(showHidden ? groupTabs.filter((group) => group.hidden) : []),
  ];

  const clearPendingClick = () => {
    if (pendingClick.current) clearTimeout(pendingClick.current.timer);
    pendingClick.current = null;
  };
  useEffect(() => clearPendingClick, [active, firstGestureGroup?.id, firstGestureGroup?.spaceId]);
  useEffect(() => {
    if (active) {
      groupStrip.current
        ?.querySelector('[aria-pressed="true"]')
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [active, activeGroup.id]);

  const activateTab = (event: ReactMouseEvent, tab: GroupTab) => {
    const previousCount = pendingClick.current?.count ?? 0;
    clearPendingClick();
    if (!hasHiddenGroups || tab !== firstGestureGroup || !event.detail) {
      onSelectGroup(tab);
      return;
    }
    if (previousCount === 2) {
      onToggleHidden();
      return;
    }
    pendingClick.current = {
      count: previousCount + 1,
      timer: setTimeout(() => {
        pendingClick.current = null;
        onSelectGroup(tab);
      }, 350),
    };
  };

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

  const managementLocation = JSON.stringify([spaceId, activeGroup.id, selectedFolderId]);
  const [managedLocation, setManagedLocation] = useState<string | null>(null);
  const manageMode = managedLocation === managementLocation;
  const setManageMode = useCallback(
    (enabled: boolean) => setManagedLocation(enabled ? managementLocation : null),
    [managementLocation],
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | undefined>();
  const [nameTarget, setNameTarget] = useState<{
    type: 'group' | 'folder';
    item?: Group | Folder;
  } | null>(null);
  const [moveTarget, setMoveTarget] = useState<{
    type: 'site' | 'folder' | 'sites';
    item?: Site | Folder;
    ids?: string[];
  } | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      addSite: () => {
        if (!showGrid) return;
        setEditingSite(undefined);
        setEditorOpen(true);
      },
      addFolder: () => {
        if (showGrid) setNameTarget({ type: 'folder' });
      },
      organize: () => {
        if (showGrid) setManageMode(true);
      },
    }),
    [showGrid, setManageMode],
  );

  const [activeDrag, setActiveDrag] = useState<NavigationDrag | null>(null);

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
    setActiveDrag(null);
  }, []);

  useEffect(() => {
    setSelectedIds(new Set());
    setManagedLocation((current) => (current === managementLocation ? current : null));
  }, [managementLocation]);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key !== 'Escape' ||
        e.defaultPrevented ||
        e.isComposing ||
        document.querySelector(
          '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]',
        )
      )
        return;
      if (!selectedFolderId && !editorOpen && !nameTarget && !moveTarget && manageMode) {
        setManageMode(false);
        setSelectedIds(new Set());
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, selectedFolderId, editorOpen, nameTarget, moveTarget, manageMode, setManageMode]);

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
    '--site-icon-radius': `${settings.iconRadius}%`,
    maxWidth: `${settings.cardSize * settings.maxCardsPerRow + settings.iconSpacing * (settings.maxCardsPerRow - 1) + 16}px`,
    margin: '0 auto',
  } as React.CSSProperties;

  const handleNameSave = async (name: string) => {
    if (!nameTarget) return;
    const isNew = !nameTarget.item;
    const id = isNew ? crypto.randomUUID() : nameTarget.item!.id;
    const expected = isNew ? undefined : nameTarget.item!.updatedAt;
    if (nameTarget.type === 'group') {
      const destination = isNew ? 'normal' : spaceId;
      await dispatch({ type: 'save-group', spaceId: destination, id, name, expected });
      if (isNew)
        onSelectGroup({
          id,
          name,
          order: 0,
          spaceId: destination,
          encrypted: false,
          hidden: false,
        });
    } else {
      await dispatch({ type: 'save-folder', spaceId, id, groupId: activeGroup.id, name, expected });
    }
  };

  const handleMoveSave = async (groupId: string, folderId: string | null) => {
    if (!moveTarget) return false;
    if (moveTarget.type === 'site' && moveTarget.item) {
      const site = space.sites.find((item) => item.id === moveTarget.item!.id);
      if (site?.groupId === groupId && site.folderId === folderId) return false;
      await dispatch({ type: 'move-site', spaceId, id: moveTarget.item.id, groupId, folderId });
    } else if (moveTarget.type === 'folder' && moveTarget.item) {
      if (space.folders.find((item) => item.id === moveTarget.item!.id)?.groupId === groupId)
        return false;
      await dispatch({ type: 'move-folder', spaceId, id: moveTarget.item.id, groupId });
    } else if (moveTarget.type === 'sites' && moveTarget.ids) {
      const ids = moveTarget.ids.filter((id) => {
        const site = space.sites.find((item) => item.id === id);
        return site?.groupId !== groupId || site.folderId !== folderId;
      });
      if (!ids.length) return false;
      await dispatch({ type: 'move-sites', spaceId, ids, groupId, folderId });
      setSelectedIds(new Set());
      setManageMode(false);
    }
    return true;
  };

  const openEditor = (site?: Site) => {
    setEditingSite(site);
    setEditorOpen(true);
  };
  const siteActions = (site: Site): NavigationAction[] => [
    { id: 'edit', label: t('messages.editSite'), icon: Pencil, run: () => openEditor(site) },
    {
      id: 'move',
      label: t('messages.move'),
      icon: FolderInput,
      run: () => setMoveTarget({ type: 'site', item: site }),
    },
    {
      id: 'delete',
      icon: Trash2,
      label: t('messages.delete'),
      destructive: true,
      separator: true,
      run: async () => {
        if (
          await confirm({
            title: t('messages.deleteThisSite'),
            description: site.title,
            confirmText: t('messages.delete'),
            cancelText: t('messages.cancel'),
            variant: 'destructive',
          })
        ) {
          if (await run({ type: 'delete-site', spaceId, id: site.id }))
            toast.success(t('messages.deleted'));
        }
      },
    },
  ];
  const folderActions = (folder: Folder): NavigationAction[] => [
    {
      id: 'rename',
      label: t('messages.rename'),
      icon: Pencil,
      run: () => setNameTarget({ type: 'folder', item: folder }),
    },
    {
      id: 'move',
      label: t('messages.move'),
      icon: FolderInput,
      run: () => setMoveTarget({ type: 'folder', item: folder }),
    },
    {
      id: 'organize',
      label: t('navigation.organizeContents'),
      icon: ListChecks,
      run: async () => {
        if (
          await run({
            type: 'select-folder',
            spaceId,
            groupId: folder.groupId,
            folderId: folder.id,
          })
        )
          setManagedLocation(JSON.stringify([spaceId, folder.groupId, folder.id]));
      },
    },
    {
      id: 'dissolve',
      label: t('messages.dissolveFolder'),
      icon: FolderOpen,
      separator: true,
      destructive: true,
      run: async () => {
        if (
          await confirm({
            title: t('messages.dissolveThisFolder'),
            description: t('messages.sitesInThisFolderWillMoveToTheCurrentGroupAndRemain'),
            confirmText: t('messages.dissolveFolder'),
            cancelText: t('messages.cancel'),
            variant: 'destructive',
          })
        ) {
          if (await run({ type: 'delete-folder', spaceId, id: folder.id }))
            toast.success(t('messages.deleted'));
        }
      },
    },
  ];
  const groupActions = (group: Group, index: number, tab: GroupTab): NavigationAction[] => [
    {
      id: 'rename',
      label: t('messages.rename'),
      icon: Pencil,
      run: () => setNameTarget({ type: 'group', item: group }),
    },
    {
      id: 'earlier',
      label: t('messages.moveEarlier'),
      icon: ArrowUp,
      disabled: index === 0,
      run: () =>
        run({ type: 'move-group', spaceId, id: group.id, beforeId: orderedGroups[index - 1]?.id }),
    },
    {
      id: 'later',
      label: t('messages.moveLater'),
      icon: ArrowDown,
      disabled: index === orderedGroups.length - 1,
      run: () =>
        run({ type: 'move-group', spaceId, id: group.id, beforeId: orderedGroups[index + 2]?.id }),
    },
    {
      id: 'delete',
      label: t('messages.delete'),
      icon: Trash2,
      separator: true,
      destructive: true,
      run: () => onDeleteGroup(tab),
    },
  ];

  const renderGroupTab = (tab: GroupTab) => {
    const groupIndex =
      tab.spaceId === spaceId ? orderedGroups.findIndex((group) => group.id === tab.id) : -1;
    const editable = orderedGroups[groupIndex];
    const key = `${tab.spaceId}:${tab.id}`;
    const button = (
      <Button
        type="button"
        variant="link"
        size="sm"
        aria-label={tab.name}
        aria-pressed={tab.spaceId === spaceId && tab.id === activeGroup.id}
        className={cn(groupTabClass, 'shrink-0')}
        onClick={(event) => activateTab(event, tab)}
      >
        {tab.encrypted && <LockKeyhole className="size-3.5 shrink-0" aria-hidden="true" />}
        <span className="truncate">{tab.name}</span>
      </Button>
    );
    if (!editable)
      return (
        <Tooltip key={key} content={tab.name}>
          {button}
        </Tooltip>
      );
    return (
      <DroppableGroupTab key={key} group={editable} className="min-w-0 shrink-0">
        <ContextMenu>
          <Tooltip content={tab.name}>
            <ContextMenuTrigger asChild>{button}</ContextMenuTrigger>
          </Tooltip>
          <ContextMenuContent>
            <NavigationMenuItems actions={groupActions(editable, groupIndex, tab)} />
          </ContextMenuContent>
        </ContextMenu>
      </DroppableGroupTab>
    );
  };

  const renderToolbar = (currentSites: Site[]) => {
    const allSelected = currentSites.length > 0 && currentSites.every((s) => selectedIds.has(s.id));
    const selectLabel = allSelected
      ? t('messages.clearVisibleSelection')
      : t('messages.selectVisible');
    const actionClass =
      'relative min-w-8 text-current after:absolute after:inset-x-2 after:bottom-0.5 after:h-px after:bg-current after:opacity-0 hover:no-underline hover:after:opacity-100 focus-visible:ring-0 focus-visible:after:opacity-100 pointer-coarse:min-h-11 @min-[13rem]:pointer-coarse:min-w-11';
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
      <div className="@container mb-4 w-full">
        <div
          className={cn(
            'mx-auto grid w-fit max-w-full grid-cols-[repeat(4,auto)] items-center gap-x-0.5 gap-y-1 text-[color:var(--home-cards-color,#fff)] @min-[34rem]:flex @min-[34rem]:gap-x-1',
            !selectedFolderId &&
              'text-shadow-[0_1px_3px_rgb(0_0_0/0.7)] [&_svg]:drop-shadow-[0_1px_2px_rgb(0_0_0/0.65)]',
          )}
        >
          <Button
            type="button"
            variant="link"
            size="sm"
            className={actionClass}
            aria-pressed={allSelected}
            aria-label={selectLabel}
            title={selectLabel}
            onClick={handleToggleAll}
          >
            {allSelected ? <CheckSquare aria-hidden="true" /> : <Square aria-hidden="true" />}
            <span className="hidden @min-[34rem]:inline">{selectLabel}</span>
          </Button>
          <Button
            type="button"
            variant="link"
            size="sm"
            className={actionClass}
            disabled={selectedIds.size === 0}
            aria-label={t('messages.moveSelected')}
            title={t('messages.moveSelected')}
            onClick={() => setMoveTarget({ type: 'sites', ids: Array.from(selectedIds) })}
          >
            <FolderInput aria-hidden="true" />
            <span className="hidden @min-[34rem]:inline">{t('messages.moveSelected')}</span>
          </Button>
          <Button
            type="button"
            variant="link"
            size="sm"
            className={actionClass}
            disabled={selectedIds.size === 0}
            aria-label={t('messages.deleteSelected')}
            title={t('messages.deleteSelected')}
            onClick={async () => {
              const ok = await confirm({
                title: t('messages.deleteSelectedSites'),
                description: t('navigation.selectedSites', { count: selectedIds.size }),
                confirmText: t('messages.delete'),
                cancelText: t('messages.cancel'),
                variant: 'destructive',
              });
              if (ok) {
                if (await run({ type: 'delete-sites', spaceId, ids: Array.from(selectedIds) })) {
                  setSelectedIds(new Set());
                }
              }
            }}
          >
            <Trash2 aria-hidden="true" />
            <span className="hidden @min-[34rem]:inline">{t('messages.deleteSelected')}</span>
          </Button>
          <span
            role="status"
            className="col-span-full row-start-2 px-2 py-0.5 text-center text-xs tabular-nums opacity-90"
          >
            {t('navigation.selectedSites', { count: selectedIds.size })}
          </span>
          <Button
            type="button"
            variant="link"
            size="sm"
            className={cn(actionClass, 'font-semibold')}
            onClick={() => {
              setManageMode(false);
              setSelectedIds(new Set());
            }}
          >
            {t('messages.done')}
          </Button>
        </div>
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
      <div className="flex min-h-0 w-full flex-1 flex-col items-center text-[color:var(--home-tabs-color)]">
        <nav
          aria-label={t('messages.groupNavigation')}
          className="mx-auto flex w-full shrink-0 items-center justify-center gap-1 px-2 pb-2 text-shadow-[0_1px_3px_rgb(0_0_0/0.7)] [&_svg]:drop-shadow-[0_1px_2px_rgb(0_0_0/0.65)]"
          style={{ maxWidth: gridStyle.maxWidth }}
        >
          <div ref={groupStrip} className={groupStripClass}>
            {visibleTabs.map(renderGroupTab)}
            {showHidden && legacyLocked && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className={groupTabClass}
                onClick={() => onSelectGroup()}
              >
                <LockKeyhole className="size-3.5 shrink-0" aria-hidden="true" />
                {t('navigation.unlockLegacyGroups')}
              </Button>
            )}
          </div>
          <Tooltip content={t('messages.addGroup')}>
            <Button
              type="button"
              variant="link"
              size="icon"
              className="size-10 shrink-0 text-current opacity-80 hover:opacity-100 focus-visible:ring-current"
              aria-label={t('messages.addGroup')}
              onClick={() => setNameTarget({ type: 'group' })}
            >
              <Plus aria-hidden="true" />
            </Button>
          </Tooltip>
        </nav>

        <div
          data-testid="site-navigation"
          className={cn(
            'min-h-0 w-full flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pt-2 pb-8',
            !showGrid && 'hidden',
          )}
        >
          {manageMode &&
            !selectedFolderId &&
            renderToolbar(
              rootItems
                .filter((i) => i.kind === 'site')
                .map((i) => (i as { kind: 'site'; site: Site }).site),
            )}

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
                      showTitle={settings.showSiteTitle}
                      manageMode={false}
                      disabledDrag={manageMode}
                      selected={false}
                      onClick={() => {
                        run({
                          type: 'select-folder',
                          spaceId,
                          groupId: activeGroup.id,
                          folderId: item.folder.id,
                        });
                      }}
                      menuActions={folderActions(item.folder)}
                    />
                  ) : (
                    <SiteCard
                      key={item.site.id}
                      site={item.site}
                      openInNewTab={settings.openInNewTab}
                      showTitle={settings.showSiteTitle}
                      manageMode={manageMode}
                      disabledDrag={manageMode}
                      selected={selectedIds.has(item.site.id)}
                      onToggleSelection={() => toggleSelection(item.site.id)}
                      menuActions={siteActions(item.site)}
                    />
                  ),
                )}
                {!manageMode && (
                  <button
                    type="button"
                    className="add-site-card cursor-pointer"
                    aria-label={t('messages.addSite')}
                    title={t('messages.addSite')}
                    onClick={() => {
                      openEditor();
                    }}
                  >
                    <span className="add-site-icon">
                      <Plus size={22} />
                    </span>
                    {settings.showSiteTitle && <SiteTitle title={t('messages.addSite')} />}
                  </button>
                )}
              </SortableContext>
            </DroppableRootGrid>
          </div>
        </div>

        <Dialog
          open={showGrid && Boolean(selectedFolderId)}
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
            closeLabel={t('messages.close')}
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
                    {t('navigation.siteCount', { count: folderSites.length })}
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
                    <ListChecks className="ui-icon-action" aria-hidden="true" />
                    {t('messages.organize')}
                  </Button>
                )}
              </div>
            </DialogHeader>

            {activeDrag && (
              <FolderModalDropTargets activeGroupId={activeGroup.id} groups={orderedGroups} />
            )}

            {manageMode && renderToolbar(folderSites)}

            <div className="site-grid w-full" style={gridStyle}>
              <SortableContext items={folderSortableIds} strategy={rectSortingStrategy}>
                {folderSites.map((site) => (
                  <SiteCard
                    key={site.id}
                    site={site}
                    openInNewTab={settings.openInNewTab}
                    showTitle={settings.showSiteTitle}
                    manageMode={manageMode}
                    disabledDrag={manageMode}
                    selected={selectedIds.has(site.id)}
                    onToggleSelection={() => toggleSelection(site.id)}
                    menuActions={siteActions(site)}
                  />
                ))}
                {!manageMode && (
                  <button
                    type="button"
                    className="add-site-card cursor-pointer"
                    aria-label={t('messages.addSite')}
                    title={t('messages.addSite')}
                    onClick={() => {
                      openEditor();
                    }}
                  >
                    <span className="add-site-icon">
                      <Plus size={22} />
                    </span>
                    {settings.showSiteTitle && <SiteTitle title={t('messages.addSite')} />}
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
                  ? t('messages.renameGroup')
                  : t('messages.newGroup')
                : nameTarget.item
                  ? t('messages.renameFolder')
                  : t('messages.newFolder')
            }
            initialName={nameTarget.item?.name}
            onSave={handleNameSave}
            onClose={() => setNameTarget(null)}
          />
        )}

        {moveTarget && (
          <MoveDialog
            title={t('messages.move')}
            groups={orderedGroups}
            folders={space.folders}
            initialGroupId={activeGroupId}
            initialFolderId={
              moveTarget.type === 'site'
                ? space.sites.find((site) => site.id === moveTarget.item?.id)?.folderId
                : moveTarget.type === 'sites'
                  ? selectedFolderId
                  : null
            }
            allowFolders={moveTarget.type !== 'folder'}
            onMove={handleMoveSave}
            onClose={() => setMoveTarget(null)}
          />
        )}

        {showGrid && editorOpen && (
          <SiteEditor
            site={editingSite}
            space={{ ...space, groups: orderedGroups }}
            spaceId={spaceId}
            groupId={activeGroupId}
            folderId={selectedFolderId}
            onClose={() => setEditorOpen(false)}
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
                    '--site-icon-radius': `${settings.iconRadius}%`,
                  } as React.CSSProperties
                }
              >
                <SiteCardView
                  site={activeSite}
                  openInNewTab={settings.openInNewTab}
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
                    '--site-icon-radius': `${settings.iconRadius}%`,
                  } as React.CSSProperties
                }
              >
                <FolderCardView
                  folder={activeFolder}
                  previewSites={space.sites
                    .filter((s) => s.folderId === activeFolder.id)
                    .sort(byOrder)}
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
