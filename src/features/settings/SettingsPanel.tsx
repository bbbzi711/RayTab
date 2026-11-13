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
import {
  Check,
  SlidersHorizontal,
  Grid2X2,
  Palette,
  Search,
  Clock3,
  PanelLeft,
  Cloud,
  Database,
  X,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { RayTabMark } from '@/components/ui/raytab-mark';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { selectEffectiveSettings, useRayTabStore } from '@/storage/store';
import { errorMessage } from '@/lib/errors';
import { effectiveSettings, type SpaceId, type SpaceSettings } from '@/storage/model';
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

const DataSettings = lazy(() =>
  import('./DataSettings').then((module) => ({ default: module.DataSettings })),
);
const SyncSettings = lazy(() =>
  import('./SyncSettings').then((module) => ({ default: module.SyncSettings })),
);

const tabs = [
  'general',
  'icons',
  'wallpaper',
  'search',
  'clock',
  'sidebar',
  'sync',
  'data',
] as const;
const tabIcons = {
  general: SlidersHorizontal,
  icons: Grid2X2,
  wallpaper: Palette,
  search: Search,
  clock: Clock3,
  sidebar: PanelLeft,
  sync: Cloud,
  data: Database,
};
type SettingsTab = (typeof tabs)[number];

export type SettingsHandle = { canClose: () => Promise<boolean> };

export default function SettingsPanel({
  spaceId,
  ref,
  onClose,
  onUnlockGroups,
  groupManagement,
  importSpaceId,
  importGroupId,
}: {
  spaceId: SpaceId;
  ref?: Ref<SettingsHandle>;
  onClose: () => void;
  onUnlockGroups: () => void;
  groupManagement: ReactNode;
  importSpaceId: SpaceId;
  importGroupId?: string;
}) {
  const { t } = useTranslation();
  const settings = useRayTabStore(useShallow((store) => selectEffectiveSettings(store, spaceId)))!;
  const savedSettings = useRayTabStore(
    useShallow((store) => store.state && effectiveSettings(store.state, spaceId)),
  )!;
  const dispatch = useRayTabStore((store) => store.dispatch);
  const previewSettings = useRayTabStore((store) => store.previewSettings);
  const clearPreview = useRayTabStore((store) => store.clearSettingsPreview);
  const protectedPrivate = useRayTabStore((store) => store.state?.privateSecurity.protected);
  const privateLocked = useRayTabStore((store) => store.state?.privateSecurity.locked);
  const privateOverrideCount = useRayTabStore(
    (store) => Object.keys(store.state?.privateSettingOverrides ?? {}).length,
  );
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [visited, setVisited] = useState<Set<SettingsTab>>(() => new Set(['general']));
  const [drafts, setDrafts] = useState<Record<string, { dirty: boolean; busy: boolean }>>({});
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [failedPatch, setFailedPatch] = useState<Partial<SpaceSettings>>({});
  const [hasSaved, setHasSaved] = useState(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const [confirm, confirmation] = useConfirm();
  const content = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<SettingsTab, HTMLButtonElement | null>>({
    general: null,
    icons: null,
    wallpaper: null,
    search: null,
    clock: null,
    sidebar: null,
    sync: null,
    data: null,
  });
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
      clearPreview(spaceId);
    },
    [spaceId, clearPreview],
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
      if (retryable || 'background' in patch) previewSettings(spaceId, patch);
      setSaving(true);
      const persist = () => dispatch({ type: 'settings', spaceId, patch }, assets);
      const operation = queue.current.then(persist, persist);
      queue.current = operation;
      try {
        await operation;
        clearPreview(spaceId, patch);
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
    [spaceId, dispatch, previewSettings, clearPreview],
  );

  const save: SaveSettings = persistSettings;
  const update = (patch: Partial<SpaceSettings>) =>
    void persistSettings(patch, undefined, true).catch((reason: unknown) =>
      toast.error(errorMessage(reason)),
    );
  const preview = (patch: Partial<SpaceSettings>) => previewSettings(spaceId, patch);

  const canClose = async () => {
    if (busy) {
      toast.info(t('settings.waitForSave'));
      return false;
    }
    const unsavedPreview = useRayTabStore.getState().settingsPreview;
    if (hasDraft || unsavedPreview?.spaceId === spaceId) {
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
    clearPreview(spaceId);
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
    if (pending?.spaceId === spaceId)
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

  const resetPrivatePreferences = async () => {
    if (busy || hasDraft) return;
    if (
      !(await confirm({
        title: t('settings.resetPrivateTitle'),
        description: t('settings.resetPrivateDescription'),
        confirmText: t('settings.followNormal'),
        variant: 'destructive',
      }))
    )
      return;
    const overrides = useRayTabStore.getState().state?.privateSettingOverrides;
    if (!overrides || !Object.keys(overrides).length) return;
    setSaving(true);
    const reset = () =>
      dispatch({
        type: 'reset-private-setting',
        keys: Object.keys(overrides) as (keyof SpaceSettings)[],
      });
    const operation = queue.current.then(reset, reset);
    queue.current = operation;
    try {
      await operation;
      clearPreview(spaceId);
      setFailedPatch({});
      setFailure(undefined);
      setHasSaved(true);
    } catch (reason) {
      setFailure(errorMessage(reason));
      toast.error(errorMessage(reason));
    } finally {
      if (queue.current === operation) setSaving(false);
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
          <p className="m-0 text-[11px] leading-[18px] text-muted-foreground">
            {t('settings.categoryDescriptions.' + activeTab)}
          </p>
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
                className="settings-nav-tab min-w-0 w-full"
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
            <>
              <SettingsSection title={t('settings.sections.general')}>
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
              </SettingsSection>
              {spaceId === 'private' && (
                <SettingsSection title={t('settings.privateInheritance')}>
                  <p className="m-0 py-1 text-xs leading-5 text-muted-foreground">
                    {t('settings.privateInheritanceHelp', { count: privateOverrideCount })}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="form-action"
                    disabled={busy || hasDraft || privateOverrideCount === 0}
                    onClick={() => void resetPrivatePreferences()}
                  >
                    {t('settings.followNormal')}
                  </Button>
                </SettingsSection>
              )}
              <SettingsSection title={t('settings.sections.groups')}>
                {groupManagement}
              </SettingsSection>
              <SettingsSection title={t('settings.groupPassword')}>
                <p className="wrap-anywhere text-xs leading-5 text-muted-foreground">
                  {t(
                    protectedPrivate
                      ? privateLocked
                        ? 'settings.lockedHelp'
                        : 'settings.unlockedHelp'
                      : 'settings.protectionHelp',
                  )}
                </p>
                {protectedPrivate && privateLocked && (
                  <Button type="button" variant="outline" size="sm" onClick={onUnlockGroups}>
                    {t('navigation.unlockGroups')}
                  </Button>
                )}
                {protectedPrivate && !privateLocked && (
                  <details className="settings-advanced">
                    <summary>{t('settings.managePassword')}</summary>
                    <div>
                      <PasswordForm mode="change" report={report} />
                      <PasswordForm mode="remove" report={report} />
                    </div>
                  </details>
                )}
              </SettingsSection>
            </>,
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
            'search',
            <SettingsSection title={t('settings.sections.search')}>
              {toggle('showSearch')}
              <div className="settings-panel-content" hidden={!settings.showSearch}>
                <SearchEngineSettings settings={savedSettings} save={save} report={report} />
              </div>
            </SettingsSection>,
          )}

          {panel(
            'clock',
            <SettingsSection title={t('settings.sections.clock')}>
              {toggle('showClock')}
              <div className="settings-panel-content" hidden={!settings.showClock}>
                {toggle('hour12')}
              </div>
              {toggle('showDate')}
              {toggle('showLunar')}
              {toggle('showGreeting')}
            </SettingsSection>,
          )}

          {panel(
            'sidebar',
            <SettingsSection title={t('settings.sidebar')}>
              <SettingsSelect
                label={t('settings.fields.sidebarMode')}
                value={settings.sidebarMode}
                options={(['always', 'auto', 'hidden'] as const).map(
                  (mode) => [mode, t('settings.sidebarModes.' + mode)] as const,
                )}
                onChange={(value) => update({ sidebarMode: value as SpaceSettings['sidebarMode'] })}
              />
              <p className="m-0 pb-2 text-xs leading-5 text-muted-foreground">
                {t('settings.sidebarHelp')}
              </p>
            </SettingsSection>,
          )}

          {panel(
            'sync',
            <SettingsSection title={t('settings.sections.syncActions')}>
              <Suspense fallback={<p role="status">{t('settings.loading')}</p>}>
                <SyncSettings report={report} />
              </Suspense>
            </SettingsSection>,
          )}

          {panel(
            'data',
            <SettingsSection title={t('settings.sections.backup')}>
              <Suspense fallback={<p role="status">{t('settings.loading')}</p>}>
                <DataSettings spaceId={importSpaceId} groupId={importGroupId} report={report} />
              </Suspense>
            </SettingsSection>,
          )}

          {hasDraft && (
            <p className="mt-6 wrap-anywhere text-xs leading-5 text-muted-foreground" role="status">
              {t('settings.draftHelp')}
            </p>
          )}
        </div>
      </div>
      {confirmation}
    </div>
  );
}
