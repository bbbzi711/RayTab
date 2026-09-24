import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  ExternalLink,
  FolderInput,
  Globe2,
  GripVertical,
  Layers3,
  ListTree,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { dispatch } from '@/storage/store';
import { prepareImage } from '@/lib/images';
import { effectiveSettings, type RayState, type Site, type SpaceId } from '@/storage/model';
import { t } from '@/locales';
import { fetchSiteIcon, fetchSiteMetadata } from './site-metadata';
import { SiteIcon } from './SiteIcon';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Tooltip } from '@/components/ui/tooltip';

type Editor = { site?: Site; open: boolean };
type Translator = (text: string) => string;

export function NavigationPage({
  state,
  spaceId,
  addRequested,
  manageRequested,
  onError,
}: {
  state: RayState;
  spaceId: SpaceId;
  addRequested: number;
  manageRequested: number;
  onError: (message: string) => void;
}) {
  const space = state.spaces[spaceId];
  const settings = effectiveSettings(state, spaceId);
  const tr = (text: string) => t(settings.language, text);
  const desktopId = state.local.activeDesktop[spaceId];
  const selected = state.local.selectedCategory[spaceId][desktopId] ?? null;
  const categories = useMemo(
    () => space.categories.filter((item) => item.desktopId === desktopId).sort(byOrder),
    [desktopId, space.categories],
  );
  const visibleSites = useMemo(() => {
    const categoryIds = new Set(categories.filter((item) => item.showInAll).map((item) => item.id));
    return space.sites
      .filter((item) =>
        selected ? item.categoryId === selected : categoryIds.has(item.categoryId),
      )
      .sort(byOrder);
  }, [categories, selected, space.sites]);
  const [editor, setEditor] = useState<Editor>({ open: false });
  const [managerOpen, setManagerOpen] = useState(false);
  const [manageMode, setManageMode] = useState(false);
  const [selectedSiteIds, setSelectedSiteIds] = useState<Set<string>>(() => new Set());
  const orderedDesktops = useMemo(() => [...space.desktops].sort(byOrder), [space.desktops]);
  useEffect(() => {
    if (addRequested) setEditor({ open: true });
  }, [addRequested]);
  useEffect(() => {
    if (!manageRequested) return;
    setManageMode(true);
    setManagerOpen(false);
  }, [manageRequested]);
  useEffect(() => {
    if (!manageMode) return;
    const exitManageMode = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelector('[role="dialog"]')) return;
      setManageMode(false);
    };
    window.addEventListener('keydown', exitManageMode);
    return () => window.removeEventListener('keydown', exitManageMode);
  }, [manageMode]);
  useEffect(() => {
    setSelectedSiteIds(new Set());
  }, [desktopId, spaceId]);
  useEffect(() => {
    if (!manageMode) setSelectedSiteIds(new Set());
  }, [manageMode]);
  useEffect(() => {
    const existingIds = new Set(space.sites.map((site) => site.id));
    setSelectedSiteIds((current) => {
      if ([...current].every((id) => existingIds.has(id))) return current;
      return new Set([...current].filter((id) => existingIds.has(id)));
    });
  }, [space.sites]);
  useEffect(() => {
    if (orderedDesktops.length < 2) return;
    const switchDesktop = (event: KeyboardEvent) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, button, [contenteditable="true"]')) return;
      if (document.querySelector('[role="dialog"]')) return;
      const current = orderedDesktops.findIndex((desktop) => desktop.id === desktopId);
      const next = current + (event.key === 'ArrowRight' ? 1 : -1);
      if (next < 0 || next >= orderedDesktops.length) return;
      event.preventDefault();
      void dispatch({ type: 'select-desktop', spaceId, desktopId: orderedDesktops[next].id });
    };
    window.addEventListener('keydown', switchDesktop);
    return () => window.removeEventListener('keydown', switchDesktop);
  }, [desktopId, orderedDesktops, spaceId]);

  const run = (command: Parameters<typeof dispatch>[0]) =>
    void dispatch(command).catch((error: Error) => onError(error.message));
  const toggleSiteSelection = (id: string) =>
    setSelectedSiteIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allVisibleSelected =
    visibleSites.length > 0 && visibleSites.every((site) => selectedSiteIds.has(site.id));
  const toggleVisibleSelection = () =>
    setSelectedSiteIds((current) => {
      const next = new Set(current);
      visibleSites.forEach((site) => {
        if (allVisibleSelected) next.delete(site.id);
        else next.add(site.id);
      });
      return next;
    });
  const [confirm, confirmDialog] = useConfirm();
  const deleteSelectedSites = async () => {
    const ids = [...selectedSiteIds];
    if (!ids.length) return;
    const names = space.sites
      .filter((site) => selectedSiteIds.has(site.id))
      .slice(0, 5)
      .map((site) => site.title);
    const remainder = ids.length - names.length;
    const summary = `${names.join('、')}${remainder > 0 ? '…' : ''}`;
    const ok = await confirm({
      title: `${tr('确定删除所选网站？')} (${ids.length} ${tr('个网站')})`,
      description: summary,
      confirmText: tr('删除'),
      cancelText: tr('取消'),
      variant: 'destructive',
    });
    if (!ok) return;
    void dispatch({ type: 'delete-sites', spaceId, ids })
      .then(() => {
        setSelectedSiteIds(new Set());
        onError(`${tr('已删除')} ${ids.length} ${tr('个网站')}`);
      })
      .catch((error: Error) => onError(error.message));
  };

  const handleDeleteSite = async (site: Site) => {
    const ok = await confirm({
      title: tr('确定删除网站？'),
      description: site.title,
      confirmText: tr('删除'),
      cancelText: tr('取消'),
      variant: 'destructive',
    });
    if (!ok) return;
    void dispatch({ type: 'delete-site', spaceId, id: site.id })
      .then(() => onError(`${tr('已删除')} ${site.title}`))
      .catch((error: Error) => onError(error.message));
  };

  const handleMoveCategory = (site: Site, categoryId: string) => {
    if (site.categoryId === categoryId) return;
    void dispatch({
      type: 'move-site',
      spaceId,
      id: site.id,
      categoryId,
    }).catch((error: Error) => onError(error.message));
  };

  return (
    <section
      className="w-full flex flex-col items-center select-none"
      aria-label={tr('网站导航')}
      data-show-site-title={settings.showSiteTitle}
    >
      {manageMode && (
        <div className="manage-toolbar" role="toolbar" aria-label={tr('整理导航')}>
          <span className="manage-toolbar__copy">
            <strong>{tr('整理导航')}</strong>
            <small aria-live="polite">
              {selectedSiteIds.size
                ? `${tr('已选择')} ${selectedSiteIds.size} ${tr('个网站')}`
                : tr('点击网站选择，拖动手柄排序，更多按钮编辑。')}
            </small>
          </span>
          <span className="manage-toolbar__actions">
            <Button
              type="button"
              variant="outline"
              disabled={!visibleSites.length}
              onClick={toggleVisibleSelection}
            >
              {tr(allVisibleSelected ? '取消全选' : '全选当前')}
            </Button>
            {selectedSiteIds.size > 0 && (
              <Button type="button" variant="destructive" onClick={deleteSelectedSites}>
                <Trash2 size={16} />
                {tr('删除所选')}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => setManagerOpen(true)}>
              <ListTree size={16} />
              {tr('桌面与分类')}
            </Button>
            <Button
              type="button"
              onClick={() => {
                setManagerOpen(false);
                setManageMode(false);
              }}
            >
              <Check size={16} />
              {tr('完成')}
            </Button>
          </span>
        </div>
      )}
      {space.desktops.length > 1 && (
        <div className="flex items-center justify-center mb-3">
          <div
            className="inline-flex items-center p-1 rounded-2xl bg-white/10 dark:bg-black/25 backdrop-blur-md border border-white/15 shadow-sm"
            role="tablist"
            aria-label={tr('桌面')}
          >
            {orderedDesktops.map((desktop) => (
              <button
                key={desktop.id}
                role="tab"
                aria-selected={desktop.id === desktopId}
                className={cn(
                  'min-h-9 px-3.5 py-1.5 rounded-xl text-xs font-medium transition-colors duration-150',
                  desktop.id === desktopId
                    ? 'bg-white/25 text-white shadow-xs font-semibold'
                    : 'text-white/70 hover:text-white hover:bg-white/10',
                )}
                onClick={() => run({ type: 'select-desktop', spaceId, desktopId: desktop.id })}
              >
                {desktop.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {settings.showCategories && !settings.navigationCollapsed && (
        <nav
          className="flex items-center justify-center flex-wrap gap-1.5 mb-5 px-2 max-w-4xl"
          aria-label={tr('分类')}
        >
          <button
            className={cn(
              'flex min-h-9 items-center gap-1.5 px-3.5 py-1 rounded-full text-xs transition-colors duration-150 border cursor-pointer select-none',
              selected === null
                ? 'bg-white/35 border-white/50 text-white shadow-sm font-semibold backdrop-blur-md'
                : 'bg-black/15 hover:bg-black/25 dark:bg-white/10 dark:hover:bg-white/20 border-white/20 text-white/85 hover:text-white backdrop-blur-md',
            )}
            onClick={() => run({ type: 'select-category', spaceId, desktopId, categoryId: null })}
          >
            <span>{tr('全部')}</span>
            <span className="inline-flex items-center justify-center px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 text-white font-normal">
              {
                space.sites.filter((site) =>
                  categories.some((category) => category.id === site.categoryId),
                ).length
              }
            </span>
          </button>
          {categories
            .filter((item) => !item.isDefault)
            .map((category) => (
              <button
                key={category.id}
                className={cn(
                  'flex min-h-9 items-center gap-1.5 px-3.5 py-1 rounded-full text-xs transition-colors duration-150 border cursor-pointer select-none',
                  selected === category.id
                    ? 'bg-white/35 border-white/50 text-white shadow-sm font-semibold backdrop-blur-md'
                    : 'bg-black/15 hover:bg-black/25 dark:bg-white/10 dark:hover:bg-white/20 border-white/20 text-white/85 hover:text-white backdrop-blur-md',
                )}
                onClick={() =>
                  run({ type: 'select-category', spaceId, desktopId, categoryId: category.id })
                }
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0 shadow-xs"
                  style={{ background: category.color }}
                />
                <span>{category.name}</span>
                <span className="inline-flex items-center justify-center px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 text-white font-normal">
                  {space.sites.filter((site) => site.categoryId === category.id).length}
                </span>
              </button>
            ))}
        </nav>
      )}

      <GridView
        sites={visibleSites}
        spaceId={spaceId}
        openInNewTab={settings.openInNewTab}
        showCardBackground={settings.showCardBackground}
        cardOpacity={settings.cardOpacity}
        showSiteTitle={settings.showSiteTitle}
        cardSize={settings.cardSize}
        iconSizeRatio={settings.iconSizeRatio}
        maxCardsPerRow={settings.maxCardsPerRow}
        iconSpacing={settings.iconSpacing}
        manageMode={manageMode}
        selectedSiteIds={selectedSiteIds}
        tr={tr}
        categories={categories}
        onToggleSelection={toggleSiteSelection}
        onEdit={(site) => setEditor({ open: true, site })}
        onAdd={() => setEditor({ open: true })}
        onDeleteSite={handleDeleteSite}
        onMoveCategory={handleMoveCategory}
        onCopyUrl={() => onError(tr('已复制网址到剪贴板'))}
      />

      <SiteEditor
        editor={editor}
        categories={space.categories}
        spaceId={spaceId}
        onClose={() => setEditor({ open: false })}
        onError={onError}
        tr={tr}
      />
      <NavigationManager
        state={state}
        spaceId={spaceId}
        open={managerOpen}
        onClose={() => setManagerOpen(false)}
        onError={onError}
        tr={tr}
      />
      {confirmDialog}
    </section>
  );
}

function GridView({
  sites,
  spaceId,
  openInNewTab,
  showCardBackground,
  cardOpacity,
  showSiteTitle,
  cardSize,
  iconSizeRatio,
  maxCardsPerRow,
  iconSpacing,
  manageMode,
  selectedSiteIds,
  categories,
  onToggleSelection,
  onEdit,
  onAdd,
  onDeleteSite,
  onMoveCategory,
  onCopyUrl,
  tr,
}: {
  sites: Site[];
  spaceId: SpaceId;
  openInNewTab: boolean;
  showCardBackground: boolean;
  cardOpacity: number;
  showSiteTitle: boolean;
  cardSize: number;
  iconSizeRatio: number;
  maxCardsPerRow: number;
  iconSpacing: number;
  manageMode: boolean;
  selectedSiteIds: Set<string>;
  categories: RayState['spaces']['normal']['categories'];
  onToggleSelection: (id: string) => void;
  onEdit: (site: Site) => void;
  onAdd: () => void;
  onDeleteSite: (site: Site) => void;
  onMoveCategory: (site: Site, categoryId: string) => void;
  onCopyUrl: () => void;
  tr: Translator;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const dropped = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return;
    const moving = sites.find((item) => `site:${item.id}` === event.active.id);
    const target = sites.find((item) => `site:${item.id}` === event.over?.id);
    if (moving && target)
      void dispatch({
        type: 'move-site',
        spaceId,
        id: moving.id,
        categoryId: target.categoryId,
        beforeId: target.id,
      });
  };
  const iconSize = Math.round(cardSize * iconSizeRatio);
  const gridMaxWidth =
    cardSize * maxCardsPerRow + iconSpacing * Math.max(0, maxCardsPerRow - 1) + 16;
  const gridStyle = {
    '--site-card-size': `${cardSize}px`,
    '--site-icon-size': `${iconSize}px`,
    '--site-grid-gap': `${iconSpacing}px`,
    maxWidth: `${gridMaxWidth}px`,
  } as CSSProperties;
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dropped}>
      <SortableContext
        items={sites.map((item) => `site:${item.id}`)}
        strategy={rectSortingStrategy}
      >
        <div className="site-grid" style={gridStyle}>
          {sites.map((site) => (
            <DraggableGridSite
              site={site}
              openInNewTab={openInNewTab}
              showCardBackground={showCardBackground}
              cardOpacity={cardOpacity}
              showSiteTitle={showSiteTitle}
              manageMode={manageMode}
              selected={selectedSiteIds.has(site.id)}
              categories={categories}
              onToggleSelection={onToggleSelection}
              onEdit={onEdit}
              onDeleteSite={onDeleteSite}
              onMoveCategory={onMoveCategory}
              onCopyUrl={onCopyUrl}
              tr={tr}
              key={site.id}
            />
          ))}
          <button
            type="button"
            onClick={onAdd}
            aria-label={tr('添加网站')}
            className="add-site-card group"
          >
            <div className="add-site-icon">
              <Plus size={20} />
            </div>
            <span className="text-xs font-medium leading-tight drop-shadow-xs">
              {tr('添加网站')}
            </span>
          </button>
        </div>
      </SortableContext>
    </DndContext>
  );
}

function DraggableGridSite({
  site,
  openInNewTab,
  showCardBackground,
  cardOpacity,
  showSiteTitle,
  manageMode,
  selected,
  categories,
  onToggleSelection,
  onEdit,
  onDeleteSite,
  onMoveCategory,
  onCopyUrl,
  tr,
}: {
  site: Site;
  openInNewTab: boolean;
  showCardBackground: boolean;
  cardOpacity: number;
  showSiteTitle: boolean;
  manageMode: boolean;
  selected: boolean;
  categories: RayState['spaces']['normal']['categories'];
  onToggleSelection: (id: string) => void;
  onEdit: (site: Site) => void;
  onDeleteSite?: (site: Site) => void;
  onMoveCategory?: (site: Site, categoryId: string) => void;
  onCopyUrl?: () => void;
  tr: Translator;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `site:${site.id}`,
    disabled: !manageMode,
  });

  const cardNode = (
    <article
      ref={setNodeRef}
      className={cn(
        'site-card group',
        showCardBackground
          ? 'backdrop-blur-md shadow-sm border border-white/10 hover:border-white/25 hover:-translate-y-1'
          : 'hover:bg-white/10 hover:backdrop-blur-sm hover:-translate-y-1',
        isDragging && 'opacity-45 scale-95 z-50',
        manageMode && 'site-card--managing',
        selected && 'site-card--selected',
      )}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        transition,
        backgroundColor: showCardBackground ? `rgba(255, 255, 255, ${cardOpacity})` : undefined,
      }}
    >
      {manageMode ? (
        <button
          type="button"
          className="site-card-main"
          aria-label={`${tr(selected ? '取消选择' : '选择')} ${site.title}`}
          aria-pressed={selected}
          onClick={() => onToggleSelection(site.id)}
        >
          <SiteIcon site={site} interactive />
          {showSiteTitle && <SiteTitle title={site.title} />}
        </button>
      ) : (
        <a
          href={site.url}
          target={openInNewTab ? '_blank' : undefined}
          rel={openInNewTab ? 'noreferrer' : undefined}
          aria-label={`${tr('打开')} ${site.title}`}
          className="site-card-main no-underline"
        >
          <SiteIcon site={site} interactive />
          {showSiteTitle && <SiteTitle title={site.title} />}
        </a>
      )}
      {manageMode && (
        <span className={cn('site-card-selection', selected && 'is-selected')} aria-hidden="true">
          {selected && <Check size={15} />}
        </span>
      )}
      <Tooltip content={`${tr('编辑')} ${site.title}`} side="top">
        <button
          type="button"
          className={cn(
            'site-card-action site-card-action--edit',
            manageMode && 'site-card-action--visible',
          )}
          aria-label={`${tr('编辑')} ${site.title}`}
          onClick={(e) => {
            e.stopPropagation();
            onEdit(site);
          }}
        >
          <MoreHorizontal size={17} />
        </button>
      </Tooltip>
      {manageMode && (
        <Tooltip content={`${tr('拖动排序')} ${site.title}`} side="top">
          <button
            type="button"
            className="site-card-action site-card-action--drag site-card-action--visible"
            aria-label={`${tr('拖动排序')} ${site.title}`}
            {...listeners}
            {...attributes}
          >
            <GripVertical size={17} />
          </button>
        </Tooltip>
      )}
    </article>
  );

  if (manageMode) {
    return cardNode;
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{cardNode}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => window.open(site.url, '_blank')}>
          <ExternalLink size={14} />
          <span>{tr('在新标签页打开')}</span>
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            void navigator.clipboard.writeText(site.url);
            onCopyUrl?.();
          }}
        >
          <Copy size={14} />
          <span>{tr('复制网址')}</span>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onEdit(site)}>
          <Pencil size={14} />
          <span>{tr('编辑网站')}</span>
        </ContextMenuItem>
        {categories.length > 1 && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <FolderInput size={14} />
              <span>{tr('移动到分类')}</span>
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {categories.map((cat) => (
                <ContextMenuCheckboxItem
                  key={cat.id}
                  checked={site.categoryId === cat.id}
                  onClick={() => onMoveCategory?.(site, cat.id)}
                >
                  <span
                    className="inline-block w-2 h-2 rounded-full mr-1.5 shrink-0"
                    style={{ backgroundColor: cat.color }}
                  />
                  <span>{cat.name}</span>
                </ContextMenuCheckboxItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={() => onDeleteSite?.(site)}>
          <Trash2 size={14} />
          <span>{tr('删除')}</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function SiteTitle({ title }: { title: string }) {
  return (
    <span className="w-full mt-1.5 px-0.5 overflow-hidden">
      <span className="block text-xs font-medium truncate leading-tight drop-shadow-xs text-white/95">
        {title}
      </span>
    </span>
  );
}

function NavigationManager({
  state,
  spaceId,
  open,
  onClose,
  onError,
  tr,
}: {
  state: RayState;
  spaceId: SpaceId;
  open: boolean;
  onClose: () => void;
  onError: (message: string) => void;
  tr: Translator;
}) {
  const [confirm, confirmDialog] = useConfirm();
  const space = state.spaces[spaceId];
  const activeDesktopId = state.local.activeDesktop[spaceId];
  const orderedDesktops = [...space.desktops].sort(byOrder);
  const run = async (command: Parameters<typeof dispatch>[0]) => {
    try {
      await dispatch(command);
    } catch (error) {
      onError((error as Error).message);
    }
  };
  const addDesktop = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get('name'));
    void run({ type: 'save-desktop', spaceId, id: crypto.randomUUID(), name }).then(() =>
      form.reset(),
    );
  };
  const addCategory = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void run({
      type: 'save-category',
      spaceId,
      id: crypto.randomUUID(),
      desktopId: activeDesktopId,
      name: String(data.get('name')),
      color: String(data.get('color')),
      showInAll: true,
    }).then(() => form.reset());
  };
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent variant="workspace" className="manager-workspace" closeLabel={tr('关闭')}>
        <DialogHeader className="manager-workspace-header">
          <DialogTitle>{tr('管理导航')}</DialogTitle>
          <DialogDescription>
            {tr('桌面保存不同场景，分类用于整理当前桌面的网站。')}
          </DialogDescription>
        </DialogHeader>
        <div className="manager-workspace-scroll">
          <div className="manager-grid">
            <section className="manager-section">
              <div className="manager-section-heading">
                <span>
                  <Layers3 size={17} />
                </span>
                <div>
                  <h3>{tr('桌面')}</h3>
                  <p>{tr('桌面保存不同场景，分类用于整理当前桌面的网站。')}</p>
                </div>
              </div>
              <div className="manager-list">
                {orderedDesktops.map((desktop, index) => {
                  const isActive = desktop.id === activeDesktopId;
                  return (
                    <div
                      key={desktop.id}
                      className="flex items-center gap-2.5 p-2 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] transition-colors"
                    >
                      <Button
                        type="button"
                        size="sm"
                        variant={isActive ? 'default' : 'outline'}
                        className={cn(
                          'h-7.5 px-3 text-xs rounded-lg cursor-pointer shrink-0 transition-all font-medium',
                          isActive
                            ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs'
                            : 'text-muted-foreground hover:text-foreground border-black/10 dark:border-white/15',
                        )}
                        aria-label={`${tr('选择')} ${desktop.name}`}
                        onClick={() =>
                          void run({ type: 'select-desktop', spaceId, desktopId: desktop.id })
                        }
                      >
                        {isActive ? (
                          <span className="flex items-center gap-1">
                            <Check size={13} strokeWidth={2.5} />
                            {tr('当前')}
                          </span>
                        ) : (
                          tr('选择')
                        )}
                      </Button>
                      <Input
                        aria-label={`${tr('桌面名称')} ${desktop.name}`}
                        defaultValue={desktop.name}
                        maxLength={80}
                        className="h-8 flex-1 min-w-0 text-xs rounded-lg border-black/10 dark:border-white/15 bg-transparent"
                        onBlur={(event) => {
                          if (event.currentTarget.value.trim() !== desktop.name)
                            void run({
                              type: 'save-desktop',
                              spaceId,
                              id: desktop.id,
                              name: event.currentTarget.value,
                              expected: desktop.updatedAt,
                            });
                        }}
                      />
                      <OrderButtons
                        label={desktop.name}
                        index={index}
                        length={orderedDesktops.length}
                        moveUp={() =>
                          void run({
                            type: 'move-desktop',
                            spaceId,
                            id: desktop.id,
                            beforeId: orderedDesktops[index - 1]?.id,
                          })
                        }
                        moveDown={() =>
                          void run({
                            type: 'move-desktop',
                            spaceId,
                            id: desktop.id,
                            beforeId: orderedDesktops[index + 2]?.id,
                          })
                        }
                        tr={tr}
                      />
                      {space.desktops.length > 1 && !isActive && (
                        <button
                          className="manager-icon-button hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                          aria-label={`${tr('删除桌面')} ${desktop.name}`}
                          onClick={async () => {
                            const ok = await confirm({
                              title: tr('确定删除桌面？'),
                              description: desktop.name,
                              confirmText: tr('删除'),
                              cancelText: tr('取消'),
                              variant: 'destructive',
                            });
                            if (!ok) return;
                            void run({
                              type: 'delete-desktop',
                              spaceId,
                              id: desktop.id,
                              destinationDesktopId: activeDesktopId,
                            });
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <form className="manager-add flex gap-2 mt-2" onSubmit={addDesktop}>
                <Input
                  name="name"
                  placeholder={tr('新桌面名称')}
                  required
                  maxLength={80}
                  className="rounded-xl border-black/10 dark:border-white/15 bg-black/[0.02] dark:bg-white/5"
                />
                <Button
                  type="submit"
                  size="sm"
                  className="rounded-xl px-3.5 bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 font-medium cursor-pointer shadow-xs shrink-0"
                >
                  <Plus size={15} />
                  {tr('新增')}
                </Button>
              </form>
            </section>
            <section className="manager-section">
              <div className="manager-section-heading">
                <span>
                  <Globe2 size={17} />
                </span>
                <div>
                  <h3>{tr('当前桌面的分类')}</h3>
                  <p>{tr('网站会保存到当前空间，可随时移动到其他分类。')}</p>
                </div>
              </div>
              <div className="manager-list">
                {space.categories
                  .filter((item) => item.desktopId === activeDesktopId)
                  .sort(byOrder)
                  .map((category, index, orderedCategories) => (
                    <div
                      key={category.id}
                      className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 p-2 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] transition-colors"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-[160px]">
                        <label
                          className={cn(
                            'relative flex items-center justify-center w-6 h-6 rounded-full shrink-0 overflow-hidden border border-black/15 dark:border-white/20 shadow-2xs transition-transform',
                            !category.isDefault && 'cursor-pointer hover:scale-110',
                          )}
                          title={category.isDefault ? undefined : tr('更改颜色')}
                        >
                          {!category.isDefault && (
                            <input
                              type="color"
                              defaultValue={category.color}
                              onChange={(event) =>
                                void run({
                                  type: 'save-category',
                                  spaceId,
                                  id: category.id,
                                  desktopId: category.desktopId,
                                  name: category.name,
                                  color: event.currentTarget.value,
                                  showInAll: category.showInAll,
                                  expected: category.updatedAt,
                                })
                              }
                              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                            />
                          )}
                          <span
                            className="block w-full h-full rounded-full"
                            style={{ backgroundColor: category.color }}
                          />
                        </label>
                        {category.isDefault ? (
                          <div className="flex items-center gap-2 flex-1">
                            <span className="text-xs font-semibold text-foreground">
                              {category.name}
                            </span>
                            <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-primary/10 text-primary border border-primary/20 shrink-0">
                              {tr('默认')}
                            </span>
                          </div>
                        ) : (
                          <Input
                            aria-label={`${tr('分类名称')} ${category.name}`}
                            defaultValue={category.name}
                            maxLength={80}
                            className="h-8 flex-1 min-w-0 text-xs rounded-lg border-black/10 dark:border-white/15 bg-transparent"
                            onBlur={(event) => {
                              if (event.currentTarget.value.trim() !== category.name)
                                void run({
                                  type: 'save-category',
                                  spaceId,
                                  id: category.id,
                                  desktopId: category.desktopId,
                                  name: event.currentTarget.value,
                                  color: category.color,
                                  showInAll: category.showInAll,
                                  expected: category.updatedAt,
                                });
                            }}
                          />
                        )}
                      </div>

                      {!category.isDefault && (
                        <div className="flex items-center gap-2 shrink-0 ml-auto sm:ml-0">
                          <Select
                            containerClassName="w-28 shrink-0"
                            className="h-8 text-xs py-1 pl-2.5 pr-7"
                            aria-label={`${tr('移动分类')} ${category.name}`}
                            value={category.desktopId}
                            onChange={(event) =>
                              void run({
                                type: 'move-category',
                                spaceId,
                                id: category.id,
                                desktopId: event.currentTarget.value,
                              })
                            }
                          >
                            {[...space.desktops].sort(byOrder).map((desktop) => (
                              <option key={desktop.id} value={desktop.id}>
                                {desktop.name}
                              </option>
                            ))}
                          </Select>

                          <label className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium border border-black/5 dark:border-white/10 bg-black/[0.02] dark:bg-white/5 cursor-pointer hover:bg-black/5 dark:hover:bg-white/10 transition-colors select-none text-muted-foreground has-checked:text-foreground has-checked:border-primary/30 has-checked:bg-primary/5 shrink-0">
                            <input
                              type="checkbox"
                              checked={category.showInAll}
                              onChange={(event) =>
                                void run({
                                  type: 'save-category',
                                  spaceId,
                                  id: category.id,
                                  desktopId: category.desktopId,
                                  name: category.name,
                                  color: category.color,
                                  showInAll: event.currentTarget.checked,
                                  expected: category.updatedAt,
                                })
                              }
                              className="rounded accent-primary w-3.5 h-3.5 cursor-pointer"
                            />
                            <span>{tr('全部中显示')}</span>
                          </label>

                          <OrderButtons
                            label={category.name}
                            index={index}
                            length={orderedCategories.length}
                            moveUp={() =>
                              void run({
                                type: 'move-category',
                                spaceId,
                                id: category.id,
                                desktopId: category.desktopId,
                                beforeId: orderedCategories[index - 1]?.id,
                              })
                            }
                            moveDown={() =>
                              void run({
                                type: 'move-category',
                                spaceId,
                                id: category.id,
                                desktopId: category.desktopId,
                                beforeId: orderedCategories[index + 2]?.id,
                              })
                            }
                            tr={tr}
                          />

                          <button
                            className="manager-icon-button hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                            aria-label={`${tr('删除分类')} ${category.name}`}
                            onClick={async () => {
                              const ok = await confirm({
                                title: tr('确定删除分类？'),
                                description: category.name,
                                confirmText: tr('删除'),
                                cancelText: tr('取消'),
                                variant: 'destructive',
                              });
                              if (!ok) return;
                              void run({ type: 'delete-category', spaceId, id: category.id });
                            }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
              <form className="manager-add flex items-center gap-2 mt-2" onSubmit={addCategory}>
                <div className="flex items-center justify-center w-8 h-8 rounded-xl border border-black/10 dark:border-white/15 bg-black/[0.02] dark:bg-white/5 shrink-0 overflow-hidden">
                  <input
                    name="color"
                    type="color"
                    defaultValue="#3b82f6"
                    aria-label={tr('分类颜色')}
                    className="w-9 h-9 -m-1 border-0 cursor-pointer p-0 bg-transparent"
                  />
                </div>
                <Input
                  name="name"
                  placeholder={tr('新分类名称')}
                  required
                  maxLength={80}
                  className="rounded-xl border-black/10 dark:border-white/15 bg-black/[0.02] dark:bg-white/5"
                />
                <Button
                  type="submit"
                  size="sm"
                  className="rounded-xl px-3.5 bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 font-medium cursor-pointer shadow-xs shrink-0"
                >
                  <Plus size={15} />
                  {tr('新增')}
                </Button>
              </form>
            </section>
          </div>
        </div>
        {confirmDialog}
      </DialogContent>
    </Dialog>
  );
}

function OrderButtons({
  label,
  index,
  length,
  moveUp,
  moveDown,
  tr,
}: {
  label: string;
  index: number;
  length: number;
  moveUp: () => void;
  moveDown: () => void;
  tr: Translator;
}) {
  return (
    <span className="order-buttons">
      <button
        type="button"
        aria-label={`${tr('上移')} ${label}`}
        disabled={index === 0}
        onClick={moveUp}
      >
        <ArrowUp size={13} />
      </button>
      <button
        type="button"
        aria-label={`${tr('下移')} ${label}`}
        disabled={index === length - 1}
        onClick={moveDown}
      >
        <ArrowDown size={13} />
      </button>
    </span>
  );
}

function SiteEditor({
  editor,
  categories,
  spaceId,
  onClose,
  onError,
  tr,
}: {
  editor: Editor;
  categories: RayState['spaces']['normal']['categories'];
  spaceId: SpaceId;
  onClose: () => void;
  onError: (message: string) => void;
  tr: Translator;
}) {
  const [confirm, confirmDialog] = useConfirm();
  const site = editor.site;
  const firstCategory = categories.find((item) => !item.isDefault) ?? categories[0];
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [categoryId, setCategoryId] = useState('');
  const [fetchedIcon, setFetchedIcon] = useState<Blob>();
  const [uploadedIcon, setUploadedIcon] = useState<File>();
  const [previewIconUrl, setPreviewIconUrl] = useState<string>();
  const [fetching, setFetching] = useState(false);
  useEffect(() => {
    if (!editor.open) return;
    setTitle(site?.title ?? '');
    setUrl(site?.url ?? '');
    setColor(site?.color ?? '#3b82f6');
    setCategoryId(site?.categoryId ?? firstCategory?.id ?? '');
    setFetchedIcon(undefined);
    setUploadedIcon(undefined);
    setFetching(false);
  }, [editor.open, firstCategory?.id, site]);
  useEffect(() => {
    const image = uploadedIcon ?? fetchedIcon;
    if (!image) {
      setPreviewIconUrl(undefined);
      return;
    }
    const objectUrl = URL.createObjectURL(image);
    setPreviewIconUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [fetchedIcon, uploadedIcon]);

  const autoFetch = async () => {
    if (!url.trim()) return onError(tr('请先输入网址'));
    setFetching(true);
    try {
      const metadata = await fetchSiteMetadata(url);
      setTitle(metadata.title);
      setFetchedIcon(await fetchSiteIcon(metadata.iconUrl, url));
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setFetching(false);
    }
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const image = uploadedIcon ?? fetchedIcon;
      const prepared = image ? await prepareImage(image, 'icon') : undefined;
      await dispatch(
        {
          type: 'save-site',
          spaceId,
          id: site?.id ?? crypto.randomUUID(),
          expected: site?.updatedAt,
          categoryId,
          site: {
            title,
            url,
            color,
            iconId: prepared?.id ?? site?.iconId,
          },
        },
        prepared ? new Map([[prepared.id, prepared.blob]]) : undefined,
      );
      onClose();
    } catch (error) {
      onError((error as Error).message);
    }
  };
  const initialTitle = site?.title ?? '';
  const initialUrl = site?.url ?? '';
  const initialColor = site?.color ?? '#3b82f6';
  const initialCategoryId = site?.categoryId ?? firstCategory?.id ?? '';
  const isDirty =
    title !== initialTitle ||
    url !== initialUrl ||
    color !== initialColor ||
    categoryId !== initialCategoryId ||
    Boolean(fetchedIcon || uploadedIcon);
  const requestClose = async () => {
    if (isDirty) {
      const ok = await confirm({
        title: tr('放弃未保存的更改？'),
        description: tr('当前所做的修改将不会被保存。'),
        confirmText: tr('放弃更改'),
        cancelText: tr('继续编辑'),
        variant: 'destructive',
      });
      if (!ok) return;
    }
    onClose();
  };
  return (
    <Dialog open={editor.open} onOpenChange={(open) => !open && void requestClose()}>
      <DialogContent variant="workspace" className="site-editor-workspace" closeLabel={tr('关闭')}>
        <form className="site-editor-form" onSubmit={submit}>
          <DialogHeader className="site-editor-header">
            <DialogTitle>{site ? tr('编辑网站') : tr('添加网站')}</DialogTitle>
            <DialogDescription>
              {tr('网站会保存到当前空间，可随时移动到其他分类。')}
            </DialogDescription>
          </DialogHeader>
          <div className="site-editor-scroll">
            <aside className="editor-preview" aria-hidden="true">
              <SiteIcon
                site={{
                  title: title.trim() || tr('添加网站'),
                  url,
                  color,
                  iconId: site?.iconId,
                }}
                previewUrl={previewIconUrl}
                size="preview"
              />
              <span className="editor-preview-copy">
                <strong>{title.trim() || tr('添加网站')}</strong>
                <small>{url.trim() || 'example.com'}</small>
              </span>
            </aside>
            <div className="editor-fields">
              <label>
                {tr('名称')}
                <Input
                  name="title"
                  value={title}
                  onChange={(event) => setTitle(event.currentTarget.value)}
                  required
                  maxLength={80}
                  autoFocus
                />
              </label>
              <label>
                {tr('网址')}
                <span className="editor-url-row">
                  <Input
                    name="url"
                    value={url}
                    onChange={(event) => setUrl(event.currentTarget.value)}
                    required
                    placeholder="example.com"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void autoFetch()}
                    disabled={fetching}
                  >
                    {fetching ? (
                      <LoaderCircle className="spin" size={15} />
                    ) : (
                      <Sparkles size={15} />
                    )}
                    {tr('自动获取')}
                  </Button>
                </span>
              </label>
              <label>
                {tr('分类')}
                <Select
                  name="categoryId"
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.currentTarget.value)}
                  required
                >
                  {categories.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </label>
              <div className="editor-appearance-fields">
                <label className="flex flex-col gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                  {tr('标识颜色')}
                  <div className="relative flex items-center gap-2.5 h-9 px-3 rounded-xl border border-black/10 dark:border-white/15 bg-black/[0.02] dark:bg-white/5 hover:bg-black/[0.04] dark:hover:bg-white/[0.08] transition-colors cursor-pointer">
                    <div className="relative w-5 h-5 rounded-full overflow-hidden shrink-0 shadow-2xs border border-black/10 dark:border-white/20">
                      <input
                        name="color"
                        type="color"
                        value={color}
                        onChange={(event) => setColor(event.currentTarget.value)}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full scale-150"
                      />
                      <div className="w-full h-full" style={{ backgroundColor: color }} />
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">
                      {color.toUpperCase()}
                    </span>
                  </div>
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                  {tr('自定义图标')}
                  <div className="relative flex items-center justify-between h-9 px-3 rounded-xl border border-dashed border-black/15 dark:border-white/20 bg-black/[0.02] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer overflow-hidden">
                    <span className="text-xs text-muted-foreground truncate">
                      {uploadedIcon ? uploadedIcon.name : tr('点击上传图片')}
                    </span>
                    <Upload size={14} className="text-muted-foreground shrink-0 ml-2" />
                    <input
                      name="icon"
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/x-icon,image/vnd.microsoft.icon,image/svg+xml,.ico,.svg"
                      onChange={(event) => setUploadedIcon(event.currentTarget.files?.[0])}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                  </div>
                </label>
              </div>
            </div>
          </div>
          <DialogFooter className="site-editor-footer">
            {site && (
              <Button
                type="button"
                variant="destructive"
                className="rounded-xl px-4 py-2 cursor-pointer mr-auto"
                onClick={async () => {
                  const ok = await confirm({
                    title: tr('确定删除网站？'),
                    description: site.title,
                    confirmText: tr('删除'),
                    cancelText: tr('取消'),
                    variant: 'destructive',
                  });
                  if (!ok) return;
                  void dispatch({ type: 'delete-site', spaceId, id: site.id })
                    .then(onClose)
                    .catch((error: Error) => onError(error.message));
                }}
              >
                <Trash2 size={15} />
                {tr('删除')}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={requestClose}
              className="rounded-xl px-4 py-2 cursor-pointer border-black/10 dark:border-white/15"
            >
              {tr('取消')}
            </Button>
            <Button
              type="submit"
              className="rounded-xl px-5 py-2 bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 font-medium cursor-pointer shadow-xs"
            >
              {tr('保存')}
            </Button>
          </DialogFooter>
        </form>
        {confirmDialog}
      </DialogContent>
    </Dialog>
  );
}

function byOrder(a: { order: number; id: string }, b: { order: number; id: string }) {
  return a.order - b.order || a.id.localeCompare(b.id);
}
