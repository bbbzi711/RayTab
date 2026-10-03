import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { toast, Toaster } from 'sonner';
import { errorMessage, storedErrorMessage } from '@/lib/errors';
import type { SettingsTarget } from '@/features/settings/settings-target';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu';
import { NavigationMenuItems, type NavigationAction } from '@/features/navigation/NavigationMenu';
import { WidgetSettingsMenu } from '@/features/navigation/WidgetSettingsMenu';
import { useShallow } from 'zustand/react/shallow';
import { LayoutGrid, LockKeyhole, PanelLeft, Settings, ShieldCheck, Sun } from 'lucide-react';
import { Background } from '@/features/appearance/Background';
import { NavigationPage, type NavigationHandle } from '@/features/navigation/NavigationPage';
import { SearchBar } from '@/features/search/SearchBar';
import { type SpaceId } from '@/storage/model';
import { selectEffectiveSettings, startRayTabStore, useRayTabStore } from '@/storage/store';
import { Clock } from '@/widgets/clock/Clock';
import { Onboarding } from '@/features/onboarding/Onboarding';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import i18n from '@/locales';
import { resolveHomeTextColors } from '@/features/appearance/text-colors';
import SettingsPanel from '@/features/settings/SettingsPanel';
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip';

const unlockSchema = z.object({ password: z.string().min(1, 'navigation.passwordRequired') });

export default function App() {
  const { t } = useTranslation();
  const unlockForm = useForm<z.infer<typeof unlockSchema>>({
    resolver: zodResolver(unlockSchema),
    defaultValues: { password: '' },
  });
  const navigationRef = useRef<NavigationHandle>(null);
  const [settingsTarget, setSettingsTarget] = useState<SettingsTarget>();
  const error = useRayTabStore((store) => store.error);
  const spaceId = useRayTabStore((store) => store.state?.local.activeSpace);
  const homeMode = useRayTabStore((store) => store.state?.local.homeMode);
  const onboardingComplete = useRayTabStore((store) => store.state?.local.onboardingComplete);
  const protectedPrivate = useRayTabStore((store) => store.state?.privateSecurity.protected);
  const privateLocked = useRayTabStore((store) => store.state?.privateSecurity.locked);
  const settings = useRayTabStore(useShallow((store) => selectEffectiveSettings(store)));
  const dispatch = useRayTabStore((store) => store.dispatch);
  const refresh = useRayTabStore((store) => store.refresh);
  const lockPrivate = useRayTabStore((store) => store.lockPrivate);
  const unlockPrivate = useRayTabStore((store) => store.unlockPrivate);
  useEffect(startRayTabStore, []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const navigationVisible = homeMode === 'navigation';
  const [unlockOpen, setUnlockOpen] = useState(false);
  const openSettings = (target?: SettingsTarget) => {
    setSettingsTarget(target);
    setSettingsOpen(true);
  };
  useEffect(() => {
    void i18n.changeLanguage(settings?.language ?? 'zh-CN');
  }, [settings?.language]);
  useEffect(() => {
    const clearPassword = () => unlockForm.reset({ password: '' });
    window.addEventListener('pagehide', clearPassword);
    return () => window.removeEventListener('pagehide', clearPassword);
  }, [unlockForm.reset]);
  const rootTheme = settings?.theme;
  const rootHomeMode = homeMode;
  useEffect(() => {
    // 确保首帧完成初始绘制后移除 preload，恢复后续正常的平滑交互动效
    const raf = requestAnimationFrame(() => {
      document.documentElement.classList.remove('preload');
    });
    return () => cancelAnimationFrame(raf);
  }, []);
  useEffect(() => {
    if (!rootTheme || !rootHomeMode) return;
    document.documentElement.dataset.theme = rootTheme;
    document.documentElement.dataset.homeMode = rootHomeMode;
  }, [rootHomeMode, rootTheme]);
  const sidebarMode = settings?.sidebarMode;
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const [isSidebarPinnedOpen, setIsSidebarPinnedOpen] = useState(false);
  const hoverLeaveTimerRef = useRef<number | null>(null);

  const [groupsPortalNode, setGroupsPortalNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setIsSidebarHovered(false);
    setIsSidebarPinnedOpen(false);
    if (hoverLeaveTimerRef.current) window.clearTimeout(hoverLeaveTimerRef.current);
    return () => {
      if (hoverLeaveTimerRef.current) window.clearTimeout(hoverLeaveTimerRef.current);
    };
  }, [sidebarMode, spaceId, homeMode]);

  const handleMouseEnterSidebar = () => {
    if (hoverLeaveTimerRef.current) {
      window.clearTimeout(hoverLeaveTimerRef.current);
      hoverLeaveTimerRef.current = null;
    }
    setIsSidebarHovered(true);
  };

  const handleMouseLeaveSidebar = () => {
    if (hoverLeaveTimerRef.current) {
      window.clearTimeout(hoverLeaveTimerRef.current);
    }
    hoverLeaveTimerRef.current = window.setTimeout(() => {
      setIsSidebarHovered(false);
    }, 280);
  };

  const isSidebarVisible =
    navigationVisible &&
    (sidebarMode === 'always' ||
      (sidebarMode === 'auto' && isSidebarHovered) ||
      isSidebarPinnedOpen);

  useEffect(() => {
    if (!spaceId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        if (homeMode === 'navigation') {
          if (sidebarMode === 'always') {
            void dispatch({
              type: 'settings',
              spaceId,
              patch: { sidebarMode: 'auto' },
            }).catch((reason) => toast.error(errorMessage(reason)));
          } else {
            setIsSidebarPinnedOpen((prev) => !prev);
          }
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dispatch, homeMode, sidebarMode, spaceId]);
  if (!settings || !spaceId)
    return (
      <main className="loading">
        <Sun size={32} />
        <h1>RayTab</h1>
        <p>{error ? storedErrorMessage(error) : t('messages.openingYourSpace')}</p>
        {error && <button onClick={() => void refresh()}>{t('messages.retry')}</button>}
      </main>
    );

  const textColors = resolveHomeTextColors(settings);
  const switchSpace = (next: SpaceId) => {
    if (next === 'private' && protectedPrivate && privateLocked) {
      setUnlockOpen(true);
      return;
    }
    void dispatch({ type: 'switch-space', spaceId: next })
      .then(() =>
        next === 'normal' && protectedPrivate && !privateLocked ? lockPrivate() : undefined,
      )
      .catch((reason) => toast.error(errorMessage(reason)));
  };
  const unlock = unlockForm.handleSubmit(async ({ password }) => {
    try {
      await unlockPrivate(password);
      await dispatch({ type: 'switch-space', spaceId: 'private' });
      unlockForm.reset({ password: '' });
      setUnlockOpen(false);
    } catch (reason) {
      unlockForm.setError('root', { message: errorMessage(reason) });
    }
  });
  const desktopActions: NavigationAction[] = [
    { id: 'add-site', label: t('messages.addSite'), run: () => navigationRef.current?.addSite() },
    {
      id: 'add-folder',
      label: t('messages.newFolder'),
      run: () => navigationRef.current?.addFolder(),
    },
    {
      id: 'organize',
      label: t('messages.organize'),
      run: async () => {
        try {
          await dispatch({ type: 'set-home-mode', mode: 'navigation' });
          navigationRef.current?.organize();
        } catch (reason) {
          toast.error(errorMessage(reason));
        }
      },
    },
    {
      id: 'icons',
      label: t('navigation.iconSettings'),
      separator: true,
      run: () => openSettings('icons'),
    },
    {
      id: 'appearance',
      label: t('navigation.appearanceSettings'),
      run: () => openSettings('appearance'),
    },
    {
      id: 'mode',
      label: t(homeMode === 'focus' ? 'messages.openNavigation' : 'messages.enterFocusMode'),
      run: () =>
        dispatch({
          type: 'set-home-mode',
          mode: homeMode === 'focus' ? 'navigation' : 'focus',
        }).catch((reason) => toast.error(errorMessage(reason))),
    },
    { id: 'settings', label: t('navigation.allSettings'), run: () => openSettings() },
  ];
  return (
    <TooltipProvider delayDuration={200}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <main
            className="app-shell"
            onContextMenuCapture={(event) => {
              const target = event.target as HTMLElement;
              if (
                target.closest(
                  'input, textarea, select, [contenteditable="true"], [data-desktop-control]',
                ) ||
                (target.closest('[role="dialog"]') && !target.closest('[data-navigation-object]'))
              )
                event.stopPropagation();
            }}
            data-theme={settings.theme}
            style={
              {
                '--home-clock-color': textColors.clock,
                '--home-date-color': textColors.date,
                '--home-greeting-color': textColors.greeting,
                '--home-tabs-color': textColors.tabs,
                '--home-cards-color': textColors.cards,
              } as React.CSSProperties
            }
          >
            <Background key={spaceId} settings={settings} spaceId={spaceId} />

            {homeMode === 'focus' && (
              <div className="fixed top-4 right-4 z-40" data-desktop-control>
                <Tooltip content={t('messages.openNavigation')} side="left">
                  <button
                    className="flex items-center justify-center w-11 h-11 rounded-2xl bg-black/25 hover:bg-black/40 text-white/85 hover:text-white backdrop-blur-xl border border-white/20 shadow-sm transition-[color,background-color,transform] duration-200 cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                    aria-label={t('messages.openNavigation')}
                    onClick={() =>
                      void dispatch({
                        type: 'set-home-mode',
                        mode: 'navigation',
                      }).catch((reason) => toast.error(errorMessage(reason)))
                    }
                  >
                    <LayoutGrid size={16} />
                  </button>
                </Tooltip>
              </div>
            )}

            {/* 边缘悬停滑出热区与微光指示条 */}
            {navigationVisible && sidebarMode === 'auto' && (
              <div
                className="fixed left-0 top-0 bottom-0 w-3.5 z-40 flex items-center group pointer-events-auto cursor-pointer select-none"
                onMouseEnter={handleMouseEnterSidebar}
                onMouseLeave={handleMouseLeaveSidebar}
                onClick={() => setIsSidebarPinnedOpen((prev) => !prev)}
                aria-label={
                  isSidebarVisible ? t('messages.collapseSidebar') : t('messages.expandSidebar')
                }
              >
                <div
                  className={cn(
                    'w-1 h-16 rounded-full bg-white/20 group-hover:bg-white/70 group-hover:w-1.5 transition-all duration-300 ml-0.5 shadow-xs backdrop-blur-md',
                    isSidebarVisible
                      ? 'opacity-0 pointer-events-none'
                      : 'opacity-70 group-hover:opacity-100',
                  )}
                />
              </div>
            )}

            {/* 完全隐藏模式下的快捷悬浮唤出按钮 */}
            {navigationVisible && sidebarMode === 'hidden' && !isSidebarVisible && (
              <Tooltip content={t('messages.expandSidebar')} side="right">
                <button
                  className="fixed left-3 bottom-3 z-40 w-9 h-9 rounded-xl bg-black/40 hover:bg-black/60 text-white/80 hover:text-white border border-white/15 backdrop-blur-xl flex items-center justify-center transition-all duration-200 shadow-lg cursor-pointer"
                  onClick={() => setIsSidebarPinnedOpen(true)}
                  aria-label={t('messages.expandSidebar')}
                >
                  <PanelLeft size={16} />
                </button>
              </Tooltip>
            )}

            {/* 左侧贴边极简侧边栏 */}
            <aside
              onMouseEnter={handleMouseEnterSidebar}
              onMouseLeave={handleMouseLeaveSidebar}
              className={cn(
                'fixed left-0 top-0 bottom-0 z-30 flex flex-col items-center py-4 sm:py-[22px] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] select-none',
                'w-[56px] sm:w-[76px]',
                'bg-black/20 hover:bg-black/30 border-r border-white/10 backdrop-blur-2xl',
                !isSidebarVisible
                  ? '-translate-x-full opacity-0 pointer-events-none'
                  : 'translate-x-0 opacity-100 shadow-2xl',
              )}
              aria-label={t('messages.groupsSidebar')}
              aria-hidden={!isSidebarVisible}
              inert={!isSidebarVisible}
            >
              <div
                className="text-[21px] tracking-[-2px] font-medium leading-[32px] text-white/90 mb-[18px] shrink-0"
                aria-label="RayTab"
              >
                R.
              </div>

              {/* Groups Portal */}
              <div
                ref={setGroupsPortalNode}
                role="navigation"
                aria-label={t('messages.groupNavigation')}
                className="flex-1 w-full min-h-0 flex flex-col gap-[7px] items-center overflow-y-auto no-scrollbar px-1 sm:px-2"
              />

              <div className="flex flex-col gap-[3px] shrink-0 w-full px-1 sm:px-2 mt-auto pt-2">
                <Tooltip
                  content={t(
                    spaceId === 'normal'
                      ? 'messages.switchToPrivateSpace'
                      : 'messages.switchToPersonalSpace',
                  )}
                  side="right"
                >
                  <button
                    className="relative flex flex-col items-center justify-center w-full min-h-[50px] sm:min-h-[54px] rounded-xl text-white/75 hover:text-white hover:bg-white/15 transition-all duration-150 cursor-pointer"
                    data-desktop-control
                    onClick={() => switchSpace(spaceId === 'normal' ? 'private' : 'normal')}
                  >
                    <LockKeyhole size={19} strokeWidth={1.6} />
                    <span className="text-[11px] font-medium leading-none mt-[5px]">
                      {t(spaceId === 'normal' ? 'messages.privateSpace' : 'messages.personalSpace')}
                    </span>
                  </button>
                </Tooltip>
                <Tooltip content={t('messages.settings')} side="right">
                  <button
                    className="flex flex-col items-center justify-center w-full min-h-[50px] sm:min-h-[54px] rounded-xl text-white/75 hover:text-white hover:bg-white/15 transition-all duration-150 cursor-pointer"
                    aria-label={t('messages.settings')}
                    data-desktop-control
                    onClick={() => {
                      openSettings();
                      setIsSidebarPinnedOpen(false);
                    }}
                  >
                    <Settings size={19} strokeWidth={1.6} />
                    <span className="text-[11px] font-medium leading-none mt-[5px]">
                      {t('messages.settings')}
                    </span>
                  </button>
                </Tooltip>
              </div>
            </aside>

            {/* 主工作区 */}
            <div
              data-sidebar-visible={isSidebarVisible || undefined}
              onClick={(event) => {
                if (isSidebarPinnedOpen && event.currentTarget.contains(event.target as Node))
                  setIsSidebarPinnedOpen(false);
              }}
              className={cn(
                'desktop-workspace relative w-full min-h-screen flex flex-col items-center transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
                !navigationVisible
                  ? 'pt-[118px] px-4 pb-8'
                  : 'pt-[70px] sm:pt-[57px] px-[68px] sm:px-[92px] pb-[88px]',
              )}
            >
              <div className="w-full mx-auto flex flex-col transition-all duration-500">
                {(settings.showClock ||
                  settings.showDate ||
                  settings.showLunar ||
                  settings.showGreeting) && (
                  <WidgetSettingsMenu onSettings={() => openSettings('widgets')}>
                    <Clock
                      language={settings.language}
                      hour12={settings.hour12}
                      showClock={settings.showClock}
                      showDate={settings.showDate}
                      showLunar={settings.showLunar}
                      showGreeting={settings.showGreeting}
                      compact={navigationVisible}
                    />
                  </WidgetSettingsMenu>
                )}
                {settings.showSearch && (
                  <div className="relative z-30 w-full flex justify-center mt-[29px]">
                    <WidgetSettingsMenu onSettings={() => openSettings('widgets')}>
                      <SearchBar key={spaceId} spaceId={spaceId} />
                    </WidgetSettingsMenu>
                  </div>
                )}

                {/* 导航卡片区域 */}
                <div
                  className={cn(
                    'relative z-10 w-full transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
                    !navigationVisible
                      ? 'opacity-0 max-h-0 pointer-events-none overflow-hidden translate-y-6 scale-[0.98]'
                      : 'opacity-100 max-h-[10000px] translate-y-0 scale-100 mt-[51px]',
                  )}
                  aria-hidden={!navigationVisible}
                  inert={!navigationVisible}
                >
                  <NavigationPage
                    key={spaceId}
                    spaceId={spaceId}
                    ref={navigationRef}
                    groupsPortal={groupsPortalNode}
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="load-error" role="alert">
                <span>{storedErrorMessage(error)}</span>
                <Button type="button" onClick={() => void refresh()}>
                  {t('messages.retry')}
                </Button>
              </div>
            )}
            {settingsOpen && (
              <SettingsPanel
                key={spaceId}
                spaceId={spaceId}
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                target={settingsTarget}
              />
            )}
            {!onboardingComplete && (
              <Onboarding
                onFinish={() =>
                  void dispatch({ type: 'complete-onboarding' }).catch((reason) =>
                    toast.error(errorMessage(reason)),
                  )
                }
              />
            )}
            <Dialog
              open={unlockOpen}
              onOpenChange={(open) => {
                if (unlockForm.formState.isSubmitting) return;
                setUnlockOpen(open);
                if (!open) unlockForm.reset({ password: '' });
              }}
            >
              <DialogContent
                className="vault-dialog rounded-3xl"
                closeLabel={t('messages.close')}
                showCloseButton={!unlockForm.formState.isSubmitting}
              >
                <form className="form-stack" onSubmit={unlock} noValidate>
                  <div className="vault-mark shadow-xs mx-auto" aria-hidden="true">
                    <ShieldCheck size={28} />
                  </div>
                  <DialogHeader className="text-center">
                    <DialogTitle className="text-lg font-bold">
                      {t('messages.unlockPrivateSpace')}
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
                      {t('messages.thePasswordIsUsedOnlyInThisTabRefreshingOrReturningTo')}
                    </DialogDescription>
                  </DialogHeader>
                  <Input
                    {...unlockForm.register('password')}
                    aria-label={t('messages.privateSpacePassword')}
                    aria-invalid={Boolean(unlockForm.formState.errors.password)}
                    disabled={unlockForm.formState.isSubmitting}
                    type="password"
                    autoComplete="current-password"
                    autoFocus
                    placeholder={t('messages.privateSpacePassword')}
                    className="h-10 text-center rounded-xl border-black/10 dark:border-white/15 bg-black/[0.02] dark:bg-white/5 tracking-widest placeholder:tracking-normal"
                  />
                  {unlockForm.formState.errors.password && (
                    <p className="form-error" role="alert">
                      {t('navigation.passwordRequired')}
                    </p>
                  )}
                  {unlockForm.formState.errors.root && (
                    <p className="form-error" role="alert">
                      {unlockForm.formState.errors.root.message}
                    </p>
                  )}
                  <Button
                    type="submit"
                    disabled={unlockForm.formState.isSubmitting}
                    className="h-10 w-full rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 font-medium cursor-pointer shadow-xs transition-all"
                  >
                    {t('messages.unlock')}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </main>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <NavigationMenuItems actions={desktopActions} />
        </ContextMenuContent>
      </ContextMenu>
      <Toaster theme={settings.theme} richColors position="bottom-center" />
    </TooltipProvider>
  );
}
