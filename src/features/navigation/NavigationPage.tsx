import { useEffect, useMemo, useState, type FormEvent } from 'react';
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
  ExternalLink,
  Globe2,
  Layers3,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getBrandIcon } from './brandIcons';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { dispatch } from '@/storage/store';
import { prepareImage } from '@/lib/images';
import { useResourceUrl } from '@/hooks/useResourceUrl';
import { effectiveSettings, type RayState, type Site, type SpaceId } from '@/storage/model';
import { t } from '@/locales';
import { fetchSiteIcon, fetchSiteMetadata } from './site-metadata';

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
  const orderedDesktops = useMemo(() => [...space.desktops].sort(byOrder), [space.desktops]);
  useEffect(() => {
    if (addRequested) setEditor({ open: true });
  }, [addRequested]);
  useEffect(() => {
    if (manageRequested) setManagerOpen(true);
  }, [manageRequested]);
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

  return (
    <section
      className="w-full flex flex-col items-center select-none"
      aria-label={tr('网站导航')}
      data-show-site-title={settings.showSiteTitle}
    >
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
                  'px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all duration-150',
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
              'flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs transition-all duration-150 border cursor-pointer select-none',
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
                  'flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs transition-all duration-150 border cursor-pointer select-none',
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
        tr={tr}
        onEdit={(site) => setEditor({ open: true, site })}
        onAdd={() => setEditor({ open: true })}
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
  onEdit,
  onAdd,
  tr,
}: {
  sites: Site[];
  spaceId: SpaceId;
  openInNewTab: boolean;
  showCardBackground: boolean;
  cardOpacity: number;
  showSiteTitle: boolean;
  onEdit: (site: Site) => void;
  onAdd: () => void;
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
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dropped}>
      <SortableContext
        items={sites.map((item) => `site:${item.id}`)}
        strategy={rectSortingStrategy}
      >
        <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(112px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(126px,1fr))] gap-3 sm:gap-5 w-full mx-auto px-2 py-4">
          {sites.map((site) => (
            <DraggableGridSite
              site={site}
              openInNewTab={openInNewTab}
              showCardBackground={showCardBackground}
              cardOpacity={cardOpacity}
              showSiteTitle={showSiteTitle}
              onEdit={onEdit}
              tr={tr}
              key={site.id}
            />
          ))}
          <button
            type="button"
            onClick={onAdd}
            aria-label={tr('添加网站')}
            className="group relative flex flex-col items-center justify-center p-3 rounded-2xl border-2 border-dashed border-white/20 hover:border-white/45 bg-white/[0.03] hover:bg-white/[0.08] transition-all duration-200 cursor-pointer min-h-[98px] text-white/60 hover:text-white"
          >
            <div className="w-11 h-11 rounded-2xl border border-white/15 bg-white/10 flex items-center justify-center mb-1.5 group-hover:scale-105 group-hover:bg-white/20 transition-all duration-200 shadow-sm">
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
  onEdit,
  tr,
}: {
  site: Site;
  openInNewTab: boolean;
  showCardBackground: boolean;
  cardOpacity: number;
  showSiteTitle: boolean;
  onEdit: (site: Site) => void;
  tr: Translator;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `site:${site.id}`,
  });
  return (
    <article
      ref={setNodeRef}
      className={cn(
        'group relative flex flex-col items-center p-2.5 rounded-2xl transition-all duration-200 select-none text-center',
        showCardBackground
          ? 'backdrop-blur-md shadow-sm border border-white/10 hover:border-white/25 hover:-translate-y-1'
          : 'hover:bg-white/10 hover:backdrop-blur-sm hover:-translate-y-1',
        isDragging && 'opacity-45 scale-95 z-50',
      )}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        transition,
        backgroundColor: showCardBackground ? `rgba(255, 255, 255, ${cardOpacity})` : undefined,
      }}
    >
      <a
        href={site.url}
        target={openInNewTab ? '_blank' : undefined}
        rel={openInNewTab ? 'noreferrer' : undefined}
        aria-label={`${tr('打开')} ${site.title}`}
        className="w-full flex flex-col items-center no-underline text-[var(--home-cards-color,#fff)]"
      >
        <SiteIcon site={site} />
        {showSiteTitle && (
          <div className="w-full mt-1.5 px-0.5 overflow-hidden">
            <span className="block text-xs font-medium truncate leading-tight drop-shadow-xs text-white/95">
              {site.title}
            </span>
          </div>
        )}
      </a>
      <button
        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/40 hover:bg-black/70 text-white/80 hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 backdrop-blur-sm z-10 cursor-pointer"
        aria-label={`${tr('编辑')} ${site.title}`}
        onClick={(e) => {
          e.stopPropagation();
          onEdit(site);
        }}
        {...listeners}
        {...attributes}
      >
        <MoreHorizontal size={14} />
      </button>
    </article>
  );
}

function SiteIcon({ site }: { site: Site }) {
  const url = useResourceUrl(site.iconId);
  const [fallbackFailed, setFallbackFailed] = useState(false);
  useEffect(() => setFallbackFailed(false), [site.url]);
  const brandIcon = getBrandIcon(site.url, site.title);

  return (
    <span
      className="w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-bold shadow-[0_6px_20px_rgba(0,0,0,0.22)] ring-1 ring-white/20 transition-all duration-200 group-hover:scale-105 group-hover:shadow-[0_10px_28px_rgba(0,0,0,0.32)] overflow-hidden"
      style={{ background: site.color, color: readableTextColor(site.color) }}
    >
      {url && !fallbackFailed ? (
        <img
          src={url}
          alt={site.title}
          className="w-full h-full object-cover"
          onError={() => setFallbackFailed(true)}
        />
      ) : brandIcon ? (
        brandIcon
      ) : (
        site.title.slice(0, 1).toUpperCase()
      )}
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
      <DialogContent className="manager-dialog" closeLabel={tr('关闭')}>
        <DialogHeader>
          <DialogTitle>{tr('管理导航')}</DialogTitle>
          <DialogDescription>
            {tr('桌面保存不同场景，分类用于整理当前桌面的网站。')}
          </DialogDescription>
        </DialogHeader>
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
              {orderedDesktops.map((desktop, index) => (
                <div key={desktop.id}>
                  <button
                    className={desktop.id === activeDesktopId ? 'active' : ''}
                    aria-label={`${tr('选择')} ${desktop.name}`}
                    onClick={() =>
                      void run({ type: 'select-desktop', spaceId, desktopId: desktop.id })
                    }
                  >
                    {tr('选择')}
                  </button>
                  <Input
                    aria-label={`${tr('桌面名称')} ${desktop.name}`}
                    defaultValue={desktop.name}
                    maxLength={80}
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
                  {space.desktops.length > 1 && desktop.id !== activeDesktopId && (
                    <button
                      aria-label={`${tr('删除桌面')} ${desktop.name}`}
                      onClick={() =>
                        void run({
                          type: 'delete-desktop',
                          spaceId,
                          id: desktop.id,
                          destinationDesktopId: activeDesktopId,
                        })
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <form className="manager-add flex gap-2 mt-2" onSubmit={addDesktop}>
              <Input name="name" placeholder={tr('新桌面名称')} required maxLength={80} className="rounded-xl border-black/10 dark:border-white/15 bg-black/[0.02] dark:bg-white/5" />
              <Button type="submit" size="sm" className="rounded-xl px-3.5 bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 font-medium cursor-pointer shadow-xs shrink-0">
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
                  <div key={category.id}>
                    <span>
                      <i style={{ background: category.color }} />
                      {category.isDefault && <small>{tr('默认')}</small>}
                    </span>
                    {category.isDefault ? (
                      <span>{category.name}</span>
                    ) : (
                      <>
                        <Input
                          aria-label={`${tr('分类名称')} ${category.name}`}
                          defaultValue={category.name}
                          maxLength={80}
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
                        <select
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
                        </select>
                        <label className="manager-toggle">
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
                          />
                          {tr('全部中显示')}
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
                      </>
                    )}
                    {!category.isDefault && (
                      <button
                        aria-label={`${tr('删除分类')} ${category.name}`}
                        onClick={() =>
                          void run({ type: 'delete-category', spaceId, id: category.id })
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                ))}
            </div>
            <form className="manager-add flex items-center gap-2 mt-2" onSubmit={addCategory}>
              <div className="flex items-center justify-center w-8 h-8 rounded-xl border border-black/10 dark:border-white/15 bg-black/[0.02] dark:bg-white/5 shrink-0 overflow-hidden">
                <input name="color" type="color" defaultValue="#3b82f6" aria-label={tr('分类颜色')} className="w-9 h-9 -m-1 border-0 cursor-pointer p-0 bg-transparent" />
              </div>
              <Input name="name" placeholder={tr('新分类名称')} required maxLength={80} className="rounded-xl border-black/10 dark:border-white/15 bg-black/[0.02] dark:bg-white/5" />
              <Button type="submit" size="sm" className="rounded-xl px-3.5 bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 font-medium cursor-pointer shadow-xs shrink-0">
                <Plus size={15} />
                {tr('新增')}
              </Button>
            </form>
          </section>
        </div>
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
  const site = editor.site;
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [fetchedIcon, setFetchedIcon] = useState<Blob>();
  const [fetching, setFetching] = useState(false);
  useEffect(() => {
    if (!editor.open) return;
    setTitle(site?.title ?? '');
    setUrl(site?.url ?? '');
    setFetchedIcon(undefined);
    setFetching(false);
  }, [editor.open, site]);

  const autoFetch = async () => {
    if (!url.trim()) return onError(tr('请先输入网址'));
    setFetching(true);
    try {
      const metadata = await fetchSiteMetadata(url);
      setTitle(metadata.title);
      setFetchedIcon(await fetchSiteIcon(metadata.iconUrl));
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setFetching(false);
    }
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const icon = data.get('icon');
      const image = icon instanceof File && icon.size ? icon : fetchedIcon;
      const prepared = image ? await prepareImage(image, 'icon') : undefined;
      await dispatch(
        {
          type: 'save-site',
          spaceId,
          id: site?.id ?? crypto.randomUUID(),
          expected: site?.updatedAt,
          categoryId: String(data.get('categoryId')),
          site: {
            title,
            url,
            color: String(data.get('color')),
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
  const firstCategory = categories.find((item) => !item.isDefault) ?? categories[0];
  return (
    <Dialog open={editor.open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="editor-dialog" closeLabel={tr('关闭')}>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{site ? tr('编辑网站') : tr('添加网站')}</DialogTitle>
            <DialogDescription>
              {tr('网站会保存到当前空间，可随时移动到其他分类。')}
            </DialogDescription>
          </DialogHeader>
          <div className="editor-layout">
            <aside className="editor-preview" aria-hidden="true">
              <span
                className="editor-preview-icon"
                style={{ background: site?.color ?? '#4f7c68' }}
              >
                {title.trim().slice(0, 1).toUpperCase() || <Globe2 size={28} />}
              </span>
              <strong>{title.trim() || tr('添加网站')}</strong>
              <small>{url.trim() || 'example.com'}</small>
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
                <select
                  name="categoryId"
                  defaultValue={site?.categoryId ?? firstCategory?.id}
                  required
                >
                  {categories.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                  {tr('标识颜色')}
                  <div className="flex items-center gap-2 h-9 px-2 rounded-xl border border-black/10 dark:border-white/15 bg-black/[0.02] dark:bg-white/5">
                    <input
                      name="color"
                      type="color"
                      defaultValue={site?.color ?? '#3b82f6'}
                      className="w-6 h-6 rounded-lg border-0 cursor-pointer bg-transparent p-0"
                    />
                    <span className="text-[11px] text-slate-500 font-mono">自定义颜色</span>
                  </div>
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                  {tr('自定义图标')}
                  <div className="relative flex items-center h-9 px-2.5 rounded-xl border border-dashed border-black/15 dark:border-white/20 bg-black/[0.02] dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer overflow-hidden">
                    <span className="text-[11px] text-slate-500 truncate">{tr('点击上传图片')}</span>
                    <input
                      name="icon"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                  </div>
                </label>
              </div>
            </div>
          </div>
          <DialogFooter className="mt-6 flex items-center justify-end gap-2.5">
            {site && (
              <Button
                type="button"
                variant="destructive"
                className="rounded-xl px-4 py-2 cursor-pointer mr-auto"
                onClick={() =>
                  void dispatch({ type: 'delete-site', spaceId, id: site.id })
                    .then(onClose)
                    .catch((error: Error) => onError(error.message))
                }
              >
                <Trash2 size={15} />
                {tr('删除')}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
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
      </DialogContent>
    </Dialog>
  );
}

function byOrder(a: { order: number; id: string }, b: { order: number; id: string }) {
  return a.order - b.order || a.id.localeCompare(b.id);
}

function readableTextColor(color: string) {
  const hex = color.match(/^#([\da-f]{6})$/i)?.[1];
  if (!hex) return '#ffffff';
  const [red, green, blue] = [0, 2, 4].map((index) =>
    Number.parseInt(hex.slice(index, index + 2), 16),
  );
  return red * 0.299 + green * 0.587 + blue * 0.114 > 168 ? '#243b34' : '#ffffff';
}
