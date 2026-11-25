import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useImperativeHandle,
  type ReactNode,
  type Ref,
} from 'react';
import { Check, SlidersHorizontal, Grid2X2, Palette, House, Layers3, Cloud, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { RayTabMark } from '@/components/ui/raytab-mark';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { selectEffectiveSettings, useRayTabStore } from '@/storage/store';
import { errorMessage } from '@/lib/errors';
import type { SpaceSettings } from '@/storage/model';
import { PasswordForm, SearchEngineSettings, type SaveSettings } from './SettingsForms';
import {
  RangeSetting,
  SettingsSection,
  SettingsSelect,
  ThemeSetting,
  Toggle,
  type DraftReporter,
} from './SettingsControls';
import { WallpaperSettings } from './WallpaperSettings';
import './settings.css';

const SyncSettings = lazy(() =>
  import('./SyncSettings').then((module) => ({ default: module.SyncSettings })),
);
const BookmarkImport = lazy(() =>
  import('./DataSettings').then((module) => ({ default: module.BookmarkImport })),
);

const settingsPartition = 'normal';
const tabs = ['general', 'icons', 'wallpaper', 'home', 'groups', 'sync'] as const;
const tabIcons = {
  general: SlidersHorizontal,
  icons: Grid2X2,
  wallpaper: Palette,
  home: House,
  groups: Layers3,
  sync: Cloud,
};
type SettingsTab = (typeof tabs)[number];

export type SettingsHandle = { canClose: () => Promise<boolean> };

export default function SettingsPanel({
  ref,
  onClose,
  onUnlockGroups,
  groupManagement,
  importGroupId,
}: {
  ref?: Ref<SettingsHandle>;
  onClose: () => void;
  onUnlockGroups: () => void;
  groupManagement: ReactNode;
  importGroupId?: string;
}) {
  const { t } = useTranslation();
  const settings = useRayTabStore(
    useShallow((store) => selectEffectiveSettings(store, settingsPartition)),
  )!;
  const savedSettings = useRayTabStore((store) => store.state?.normalSettings)!;
  const dispatch = useRayTabStore((store) => store.dispatch);
  const previewSettings = useRayTabStore((store) => store.previewSettings);
  const clearPreview = useRayTabStore((store) => store.clearSettingsPreview);
  const protectedPrivate = useRayTabStore((store) => store.state?.privateSecurity.protected);
  const privateLocked = useRayTabStore((store) => store.state?.privateSecurity.locked);
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [showBookmarkImport, setShowBookmarkImport] = useState(false);
  const [visited, setVisited] = useState<Set<SettingsTab>>(() => new Set(['general']));
  const [drafts, setDrafts] = useState<Record<string, { dirty: boolean; busy: boolean }>>({});
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [failedPatch, setFailedPatch] = useState<Partial<SpaceSettings>>({});
  const [hasSaved, setHasSaved] = useState(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const [confirm, confirmation] = useConfirm();
  const content = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Partial<Record<SettingsTab, HTMLButtonElement | null>>>({});
  const currentTab = useRef<SettingsTab>('general');
  const scrollPositions = useRef<Partial<Record<SettingsTab, number>>>({});
  const hasDraft = Object.values(drafts).some((draft) => draft.dirty);
  const busy = saving || Object.values(drafts).some((draft) => draft.busy);

  useEffect(() => {
    tabRefs.current.general?.focus({ preventScroll: true });
  }, []);

  const changeTab = useCallback((tab: SettingsTab) => {
    if (content.current) scrollPositions.current[currentTab.current] = content.current.scrollTop;
    currentTab.current = tab;
    setActiveTab(tab);
    setVisited((current) => new Set([...current, tab]));
  }, []);

  useLayoutEffect(() => {
    content.current?.scrollTo({ top: scrollPositions.current[activeTab] ?? 0 });
  }, [activeTab]);

  useEffect(
    () => () => {
      clearPreview(settingsPartition);
    },
    [clearPreview],
  );

  const report: DraftReporter = useCallback((id, dirty, busy) => {
    setDrafts((current) =>
      current[id]?.dirty === dirty && current[id]?.busy === busy
        ? current
        : { ...current, [id]: { dirty, busy } },
    );
  }, []);

  const persistSettings = useCallback(
    async (patch: Partial<SpaceSettings>, assets?: Map<string, Blob>, retryable = false) => {
      if (retryable || 'background' in patch) previewSettings(settingsPartition, patch);
      setSaving(true);
      const persist = () =>
        dispatch({ type: 'settings', spaceId: settingsPartition, patch }, assets);
      const operation = queue.current.then(persist, persist);
      queue.current = operation;
      try {
        await operation;
        clearPreview(settingsPartition, patch);
        setFailedPatch((current) =>
          Object.fromEntries(Object.entries(current).filter(([key]) => !(key in patch))),
        );
        setFailure(undefined);
        setHasSaved(true);
      } catch (reason) {
        setFailure(errorMessage(reason));
        setFailedPatch((current) =>
          retryable
            ? { ...current, ...patch }
            : Object.fromEntries(Object.entries(current).filter(([key]) => !(key in patch))),
        );
        throw reason;
      } finally {
        if (queue.current === operation) setSaving(false);
      }
    },
    [dispatch, previewSettings, clearPreview],
  );

  const save: SaveSettings = persistSettings;
  const update = (patch: Partial<SpaceSettings>) =>
    void persistSettings(patch, undefined, true).catch((reason: unknown) =>
      toast.error(errorMessage(reason)),
    );
  const preview = (patch: Partial<SpaceSettings>) => previewSettings(settingsPartition, patch);

  const canClose = async () => {
    if (busy) {
      toast.info(t('settings.waitForSave'));
      return false;
    }
    const unsavedPreview = useRayTabStore.getState().settingsPreview;
    if (hasDraft || unsavedPreview?.spaceId === settingsPartition) {
      if (
        !(await confirm({
          title: t('settings.discardTitle'),
          description: t('settings.discardDescription'),
          confirmText: t('settings.discard'),
          cancelText: t('settings.keepEditing'),
          variant: 'destructive',
        }))
      )
        return false;
    }
    clearPreview(settingsPartition);
    return true;
  };

  useImperativeHandle(ref, () => ({ canClose }));

  const numberRange = (
    key: 'maxCardsPerRow' | 'iconSpacing' | 'overlay' | 'iconRadius',
    min: number,
    max: number,
    step: number,
    format?: (value: number) => string,
  ) => (
    <RangeSetting
      label={t('settings.fields.' + key)}
      value={settings[key]}
      min={min}
      max={max}
      step={step}
      format={format}
      onPreview={(value) => preview({ [key]: value })}
      onCommit={(value) => update({ [key]: value })}
    />
  );

  const toggle = (
    key:
      | 'showSiteTitle'
      | 'showSearch'
      | 'showClock'
      | 'showDate'
      | 'showLunar'
      | 'showGreeting'
      | 'hour12'
      | 'openInNewTab',
  ) => (
    <Toggle
      label={t('settings.fields.' + key)}
      checked={settings[key]}
      onChange={(value) => update({ [key]: value })}
    />
  );

  const iconSizePatch = (size: number) => {
    const cardSize = Math.max(80, Math.min(160, Math.round((size * 2) / 5) * 5));
    return { cardSize, iconSizeRatio: Math.max(0.28, size / cardSize) };
  };

  const retry = () => {
    const pending = useRayTabStore.getState().settingsPreview;
    const patch = { ...failedPatch };
    if (pending?.spaceId === settingsPartition)
      for (const key of Object.keys(patch) as (keyof SpaceSettings)[])
        if (key in pending.patch) Object.assign(patch, { [key]: pending.patch[key] });
    void persistSettings(patch, undefined, true).catch((reason: unknown) =>
      toast.error(errorMessage(reason)),
    );
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const currentIndex = tabs.indexOf(activeTab);
    let nextIndex = -1;
    if (event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = tabs.length - 1;
    }
    if (nextIndex >= 0) {
      event.preventDefault();
      const nextTab = tabs[nextIndex];
      changeTab(nextTab);
      tabRefs.current[nextTab]?.focus();
    }
  };

  const panel = (tab: SettingsTab, children: ReactNode) =>
    visited.has(tab) && (
      <div
        key={tab}
        id={`settings-tabpanel-${tab}`}
        role="tabpanel"
        aria-labelledby={`settings-tab-${tab}`}
        className="settings-panel-content"
        hidden={activeTab !== tab}
        tabIndex={0}
      >
        {children}
      </div>
    );

  return (
    <div className="settings-panel-root relative flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="settings-header shrink-0">
        <div className="settings-brand" aria-label="RayTab">
          <span className="settings-brand-mark" aria-hidden="true">
            <RayTabMark className="size-4" />{' '}
          </span>
          <span>RayTab</span>
        </div>
        <div className="settings-heading">
          <h1 className="m-0 text-[15px] font-semibold leading-6">
            <span className="sr-only">{t('settings.title')} · </span>
            {t('settings.tabs.' + activeTab)}
          </h1>
          <div
            className="settings-autosave"
            role="status"
            aria-label={t('settings.saveStatus')}
            aria-live="polite"
            title={t('settings.autoSaveHelp')}
          >
            {!busy && !failure && !hasDraft && !Object.keys(failedPatch).length && (
              <Check className="size-3" aria-hidden="true" />
            )}
            <span>
              {t(
                busy
                  ? 'settings.saving'
                  : failure || Object.keys(failedPatch).length
                    ? 'settings.unsaved'
                    : hasDraft
                      ? 'settings.pendingChanges'
                      : hasSaved
                        ? 'settings.saved'
                        : 'settings.autoSave',
              )}
            </span>
            {Object.keys(failedPatch).length > 0 && (
              <Button type="button" variant="ghost" size="xs" disabled={saving} onClick={retry}>
                {t('settings.retry')}
              </Button>
            )}
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="settings-close"
          aria-label={t('settings.close')}
          onClick={onClose}
        >
          <X className="ui-icon-action" aria-hidden="true" />
        </Button>
      </header>

      <div className="settings-workspace grid min-h-0 min-w-0 flex-1">
        <nav
          className="settings-tabs-nav"
          role="tablist"
          aria-label={t('settings.categories')}
          aria-orientation="vertical"
          onKeyDown={handleTabKeyDown}
        >
          {tabs.map((tab) => {
            const Icon = tabIcons[tab];
            return (
              <Button
                key={tab}
                ref={(el) => {
                  tabRefs.current[tab] = el;
                }}
                role="tab"
                type="button"
                variant="tab"
                size="navigation"
                id={`settings-tab-${tab}`}
                aria-selected={activeTab === tab}
                aria-controls={`settings-tabpanel-${tab}`}
                tabIndex={activeTab === tab ? 0 : -1}
                className="settings-nav-tab min-w-0 w-full gap-1.5 px-1.5"
                onClick={() => changeTab(tab)}
                title={t('settings.tabs.' + tab)}
              >
                <Icon className="size-4" aria-hidden="true" />
                <span className="min-w-0 whitespace-normal text-left leading-4">
                  {t('settings.tabs.' + tab)}
                </span>
              </Button>
            );
          })}
        </nav>

        <div className="settings-content" ref={content}>
          {failure && Object.keys(failedPatch).length > 0 && (
            <p className="mb-3 wrap-anywhere text-xs leading-5 text-destructive" role="alert">
              {failure}
            </p>
          )}

          {panel(
            'general',
            <SettingsSection>
              <SettingsSelect
                label={t('settings.fields.language')}
                value={settings.language}
                options={[
                  ['zh-CN', '简体中文'],
                  ['en', 'English'],
                ]}
                onChange={(value) => update({ language: value as SpaceSettings['language'] })}
              />
              {toggle('openInNewTab')}
            </SettingsSection>,
          )}

          {panel(
            'icons',
            <>
              <SettingsSection title={t('settings.sections.iconAppearance')}>
                <RangeSetting
                  label={t('settings.iconSize')}
                  value={Math.round(settings.cardSize * settings.iconSizeRatio)}
                  min={22}
                  max={104}
                  step={1}
                  format={(value) => value + 'px'}
                  onPreview={(value) => preview(iconSizePatch(value))}
                  onCommit={(value) => update(iconSizePatch(value))}
                />
                {numberRange('iconRadius', 0, 50, 1, (value) => value + '%')}
                {toggle('showSiteTitle')}
              </SettingsSection>
              <SettingsSection title={t('settings.sections.layout')}>
                {numberRange('iconSpacing', 8, 48, 2, (value) => value + 'px')}
                {numberRange('maxCardsPerRow', 4, 12, 1)}
              </SettingsSection>
            </>,
          )}

          {panel(
            'wallpaper',
            <>
              <SettingsSection title={t('settings.theme')}>
                <ThemeSetting value={settings.theme} onChange={(theme) => update({ theme })} />
              </SettingsSection>
              <SettingsSection title={t('settings.sections.wallpaper')}>
                <WallpaperSettings
                  settings={settings}
                  savedUrl={savedSettings.onlineWallpaperUrl}
                  save={save}
                  report={report}
                  onUpdate={update}
                  onPreview={preview}
                />
                {numberRange('overlay', 0, 0.8, 0.05, (value) => Math.round(value * 100) + '%')}
              </SettingsSection>
            </>,
          )}

          {panel(
            'home',
            <>
              <SettingsSection title={t('settings.sections.search')}>
                {toggle('showSearch')}
              </SettingsSection>
              <SettingsSection title={t('settings.sections.clock')}>
                {toggle('showClock')}
                {toggle('hour12')}
                {toggle('showDate')}
                {toggle('showLunar')}
                {toggle('showGreeting')}
              </SettingsSection>
              <SettingsSection title={t('settings.manageSearchEngines')}>
                <SearchEngineSettings settings={savedSettings} save={save} report={report} />
              </SettingsSection>
            </>,
          )}

          {panel(
            'groups',
            <>
              <SettingsSection title={t('settings.sections.groups')}>
                {groupManagement}
                <Button
                  type="button"
                  variant="outline"
                  size="form-action"
                  disabled={busy}
                  aria-expanded={showBookmarkImport}
                  aria-controls="group-bookmark-import"
                  onClick={() => setShowBookmarkImport(!showBookmarkImport)}
                >
                  {t('settings.importBookmarks')}
                </Button>
                <fieldset
                  id="group-bookmark-import"
                  className="data-settings min-w-0 pt-3"
                  hidden={!showBookmarkImport}
                  disabled={Boolean(
                    drafts.sync?.busy ||
                    drafts['backup-restore']?.busy ||
                    drafts['backup-export']?.busy,
                  )}
                >
                  {(showBookmarkImport || drafts['bookmark-import']?.dirty) && (
                    <Suspense fallback={<p role="status">{t('settings.loading')}</p>}>
                      <BookmarkImport groupId={importGroupId} report={report} />
                    </Suspense>
                  )}
                </fieldset>
              </SettingsSection>
              <SettingsSection title={t('settings.sidebar')}>
                <SettingsSelect
                  triggerClassName="settings-group-sidebar-select"
                  label={t('settings.fields.sidebarMode')}
                  value={settings.sidebarMode}
                  options={(['always', 'auto', 'hidden'] as const).map(
                    (mode) => [mode, t('settings.sidebarModes.' + mode)] as const,
                  )}
                  onChange={(value) =>
                    update({ sidebarMode: value as SpaceSettings['sidebarMode'] })
                  }
                />
                {settings.sidebarMode === 'auto' && (
                  <p className="m-0 pb-2 text-xs leading-5 text-muted-foreground">
                    {t('settings.sidebarHelp')}
                  </p>
                )}
              </SettingsSection>
              {protectedPrivate && (
                <SettingsSection title={t('settings.groupPassword')}>
                  {privateLocked && (
                    <p className="wrap-anywhere text-xs leading-5 text-muted-foreground">
                      {t('settings.lockedHelp')}
                    </p>
                  )}
                  {privateLocked && (
                    <Button type="button" variant="outline" size="sm" onClick={onUnlockGroups}>
                      {t('navigation.unlockGroups')}
                    </Button>
                  )}
                  {!privateLocked && (
                    <>
                      <PasswordForm mode="change" report={report} />
                      <PasswordForm mode="remove" report={report} />
                    </>
                  )}
                </SettingsSection>
              )}
            </>,
          )}

          {panel(
            'sync',
            <Suspense fallback={<p role="status">{t('settings.loading')}</p>}>
              <SyncSettings
                report={report}
                localBusy={['bookmark-import', 'backup-export', 'backup-restore'].some(
                  (id) => drafts[id]?.busy,
                )}
              />
            </Suspense>,
          )}
        </div>
      </div>
      {confirmation}
    </div>
  );
}
