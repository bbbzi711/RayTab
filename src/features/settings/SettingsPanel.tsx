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
import { Cloud, Database, Grid2X2, Palette, SlidersHorizontal, Clock3 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { selectEffectiveSettings, useRayTabStore } from '@/storage/store';
import { errorMessage } from '@/lib/errors';
import { gradientPresets, nextFeaturedPhoto } from '@/features/appearance/wallpapers';
import { effectiveSettings, type SpaceId, type SpaceSettings } from '@/storage/model';
import {
  LocalWallpaperForm,
  PasswordForm,
  SearchEngineSettings,
  WallpaperForm,
  type SaveSettings,
} from './SettingsForms';
import {
  RangeSetting,
  SettingsSection,
  SettingsSelect,
  Toggle,
  type DraftReporter,
} from './SettingsControls';
import { SettingsPreview } from './SettingsPreview';
import './settings.css';

const DataSettings = lazy(() =>
  import('./DataSettings').then((module) => ({ default: module.DataSettings })),
);
const SyncSettings = lazy(() =>
  import('./SyncSettings').then((module) => ({ default: module.SyncSettings })),
);

const tabs = [
  ['general', SlidersHorizontal],
  ['icons', Grid2X2],
  ['appearance', Palette],
  ['widgets', Clock3],
  ['sync', Cloud],
  ['data', Database],
] as const;
type SettingsTab = (typeof tabs)[number][0];

export type SettingsHandle = { canClose: () => Promise<boolean> };

export default function SettingsPanel({
  spaceId,
  ref,
  onUnlockGroups,
  groupManagement,
  importSpaceId,
  importGroupId,
}: {
  spaceId: SpaceId;
  ref?: Ref<SettingsHandle>;
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
  const category = useRef<HTMLButtonElement>(null);
  const language = useRef<HTMLButtonElement>(null);
  const currentTab = useRef<SettingsTab>('general');
  const scrollPositions = useRef<Partial<Record<SettingsTab, number>>>({});
  const hasDraft = Object.values(drafts).some((draft) => draft.dirty);
  const busy = saving || Object.values(drafts).some((draft) => draft.busy);

  const changeTab = useCallback((tab: SettingsTab) => {
    if (content.current) scrollPositions.current[currentTab.current] = content.current.scrollTop;
    currentTab.current = tab;
    setActiveTab(tab);
    setVisited((current) => new Set([...current, tab]));
  }, []);
  useLayoutEffect(() => {
    content.current?.scrollTo({ top: scrollPositions.current[activeTab] ?? 0 });
  }, [activeTab]);
  useEffect(() => {
    const revealCategory = () =>
      category.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
    revealCategory();
    window.addEventListener('resize', revealCategory);
    return () => window.removeEventListener('resize', revealCategory);
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
  useEffect(() => {
    language.current?.focus({ preventScroll: true });
  }, []);
  const showPreview = activeTab === 'icons' || activeTab === 'appearance';
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

  return (
    <section aria-labelledby="raytab-settings-title" className="flex min-h-0 flex-1 flex-col">
      <h1 id="raytab-settings-title" className="sr-only">
        {t('settings.title')}
      </h1>
      <div className="settings-layout">
        <aside className="settings-sidebar">
          <div className="settings-brand">
            <div className="settings-brand-copy">
              <span className="settings-brand-name">{t('settings.title')}</span>
            </div>
          </div>
          <nav className="settings-tabs" aria-label={t('settings.categories')}>
            {tabs.map(([tab, Icon]) => (
              <Button
                type="button"
                variant="ghost"
                key={tab}
                ref={activeTab === tab ? category : undefined}
                aria-current={activeTab === tab ? 'page' : undefined}
                className="min-h-10 justify-start gap-2.5 px-3 aria-[current=page]:bg-accent aria-[current=page]:font-semibold aria-[current=page]:text-[var(--preferences-accent)] max-[760px]:min-h-11"
                title={t('settings.tabs.' + tab)}
                onClick={() => changeTab(tab)}
              >
                <Icon className="ui-icon-action" aria-hidden="true" />
                <span>{t('settings.tabs.' + tab)}</span>
              </Button>
            ))}
          </nav>
        </aside>
        <div className="settings-main">
          <header className="settings-workspace-header">
            <div className="settings-header-line">
              <h2 className="text-xl font-semibold tracking-tight max-[420px]:mr-auto [@media(max-height:480px)]:text-lg">
                {t('settings.tabs.' + activeTab)}
              </h2>
              <div
                className="settings-autosave"
                role="status"
                aria-label={t('settings.saveStatus')}
                aria-live="polite"
                title={t('settings.autoSaveHelp')}
              >
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
            <p className="text-xs leading-5 text-muted-foreground">
              {t('settings.categoryDescriptions.' + activeTab)}
            </p>
            {failure && Object.keys(failedPatch).length > 0 && (
              <p className="wrap-anywhere text-xs leading-5 text-destructive" role="alert">
                {failure}
              </p>
            )}
          </header>
          <div
            className={
              showPreview ? 'settings-content settings-content--with-preview' : 'settings-content'
            }
            ref={content}
          >
            {showPreview && <SettingsPreview settings={settings} spaceId={spaceId} />}
            <div className="settings-fields">
              {visited.has('general') && (
                <div className="settings-panel-content" hidden={activeTab !== 'general'}>
                  <SettingsSection title={t('settings.sections.preferences')}>
                    <SettingsSelect
                      label={t('settings.fields.language')}
                      value={settings.language}
                      options={[
                        ['zh-CN', '简体中文'],
                        ['en', 'English'],
                      ]}
                      onChange={(value) => update({ language: value as SpaceSettings['language'] })}
                      triggerRef={language}
                    />
                    {toggle('openInNewTab')}
                  </SettingsSection>
                  <SettingsSection title={t('navigation.manageGroups')}>
                    {groupManagement}
                  </SettingsSection>
                  <SettingsSection title={t('settings.privateProtection')}>
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
                </div>
              )}
              {visited.has('icons') && (
                <div className="settings-panel-content" hidden={activeTab !== 'icons'}>
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
                    {numberRange('maxCardsPerRow', 4, 12, 1)}
                    {numberRange('iconSpacing', 8, 48, 2, (value) => value + 'px')}
                  </SettingsSection>
                </div>
              )}
              {visited.has('appearance') && (
                <div className="settings-panel-content" hidden={activeTab !== 'appearance'}>
                  <SettingsSection title={t('settings.fields.theme')}>
                    <SettingsSelect
                      label={t('settings.fields.theme')}
                      value={settings.theme}
                      options={['system', 'light', 'dark'].map(
                        (value) => [value, t('settings.themes.' + value)] as const,
                      )}
                      onChange={(value) => update({ theme: value as SpaceSettings['theme'] })}
                    />
                  </SettingsSection>
                  <SettingsSection title={t('settings.sections.wallpaper')}>
                    <SettingsSelect
                      label={t('settings.wallpaperSource')}
                      value={settings.background}
                      options={['gradient', 'bing', 'unsplash', 'custom', 'color'].map(
                        (value) => [value, t('settings.backgrounds.' + value)] as const,
                      )}
                      onChange={(value) =>
                        update({ background: value as SpaceSettings['background'] })
                      }
                    />
                    {settings.background === 'gradient' && (
                      <>
                        <div className="gradient-options" aria-label={t('settings.gradient')}>
                          {gradientPresets.map((gradient, index) => (
                            <button
                              type="button"
                              key={gradient}
                              style={{ backgroundImage: gradient }}
                              aria-label={t('settings.gradientNamed', { number: index + 1 })}
                              aria-pressed={settings.gradient === gradient}
                              onClick={() => update({ gradient })}
                            />
                          ))}
                        </div>
                      </>
                    )}
                    {settings.background === 'unsplash' && (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            update({
                              featuredPhotoUrl: nextFeaturedPhoto(settings.featuredPhotoUrl),
                            })
                          }
                        >
                          {t('settings.nextPhoto')}
                        </Button>
                      </>
                    )}
                    {settings.background === 'color' && (
                      <div className="setting-row">
                        <div>
                          <label htmlFor="settings-solid-color">
                            {t('settings.fields.solidColor')}
                          </label>
                        </div>
                        <input
                          id="settings-solid-color"
                          className="settings-color-input"
                          type="color"
                          value={settings.solidColor}
                          onChange={(event) => preview({ solidColor: event.target.value })}
                          onBlur={(event) => update({ solidColor: event.target.value })}
                        />
                      </div>
                    )}
                    {numberRange('overlay', 0, 0.8, 0.05, (value) => Math.round(value * 100) + '%')}
                    <div
                      className="settings-panel-content settings-form grid min-w-0 gap-3.5 text-sm"
                      hidden={settings.background !== 'custom'}
                    >
                      <LocalWallpaperForm save={save} report={report} />
                      <WallpaperForm
                        url={savedSettings.onlineWallpaperUrl}
                        save={save}
                        report={report}
                      />
                    </div>
                  </SettingsSection>
                </div>
              )}
              {visited.has('widgets') && (
                <div className="settings-panel-content" hidden={activeTab !== 'widgets'}>
                  <SettingsSection title={t('settings.search')}>
                    {toggle('showSearch')}
                    <div className="settings-panel-content" hidden={!settings.showSearch}>
                      <SearchEngineSettings settings={savedSettings} save={save} report={report} />
                    </div>
                  </SettingsSection>
                  <SettingsSection title={t('settings.sections.clock')}>
                    {toggle('showClock')}
                    <div className="settings-panel-content" hidden={!settings.showClock}>
                      {toggle('hour12')}
                    </div>
                    {toggle('showDate')}
                    {toggle('showLunar')}
                  </SettingsSection>
                  <SettingsSection title={t('settings.sections.greetings')}>
                    {toggle('showGreeting')}
                  </SettingsSection>
                </div>
              )}
              {visited.has('sync') && (
                <div className="settings-panel-content" hidden={activeTab !== 'sync'}>
                  <Suspense fallback={<p role="status">{t('settings.loading')}</p>}>
                    <SyncSettings report={report} />
                  </Suspense>
                </div>
              )}
              {visited.has('data') && (
                <div className="settings-panel-content" hidden={activeTab !== 'data'}>
                  <Suspense fallback={<p role="status">{t('settings.loading')}</p>}>
                    <DataSettings spaceId={importSpaceId} groupId={importGroupId} report={report} />
                  </Suspense>
                </div>
              )}
              {hasDraft && (
                <p
                  className="mt-6 wrap-anywhere text-xs leading-5 text-muted-foreground"
                  role="status"
                >
                  {t('settings.draftHelp')}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
      {confirmation}
    </section>
  );
}
