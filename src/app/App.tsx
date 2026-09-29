import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  LayoutGrid,
  LockKeyhole,
  Minimize2,
  PanelLeft,
  Settings,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import { Background } from '@/features/appearance/Background';
import { NavigationPage } from '@/features/navigation/NavigationPage';
import { SearchBar } from '@/features/search/SearchBar';
import { effectiveSettings, type SpaceId } from '@/storage/model';
import { dispatch, refresh, useRayTab } from '@/storage/store';
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
import { privateVault } from '@/storage/store';
import { t } from '@/locales';
import { resolveHomeTextColors } from '@/features/appearance/text-colors';
import SettingsPanel from '@/features/settings/SettingsPanel';
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip';

export default function App() {
  const { state, error } = useRayTab();
  const [notice, setNotice] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const rootTheme = state ? effectiveSettings(state, state.local.activeSpace).theme : undefined;
  const rootHomeMode = state?.local.homeMode;
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
  const spaceId = state?.local.activeSpace;
  const homeMode = state?.local.homeMode;
  const sidebarMode = state
    ? (effectiveSettings(state, state.local.activeSpace).sidebarMode ?? 'always')
    : undefined;
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
    homeMode === 'navigation' &&
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
            }).catch((reason: Error) => setNotice(reason.message));
          } else {
            setIsSidebarPinnedOpen((prev) => !prev);
          }
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [homeMode, sidebarMode, spaceId]);
  if (!state || !spaceId)
    return (
      <main className="loading">
        <Sun size={32} />
        <h1>RayTab</h1>
        <p>{error ?? '正在打开你的空间…'}</p>
        {error && <button onClick={() => void refresh()}>重试</button>}
      </main>
    );

  const settings = effectiveSettings(state, state.local.activeSpace);
  const textColors = resolveHomeTextColors(settings);
  const tr = (text: string) => t(settings.language, text);
  const switchSpace = (next: SpaceId) => {
    if (next === 'private' && state.privateSecurity.protected && state.privateSecurity.locked) {
      setUnlockOpen(true);
      return;
    }
    void dispatch({ type: 'switch-space', spaceId: next })
      .then(() =>
        next === 'normal' && state.privateSecurity.protected && !state.privateSecurity.locked
          ? privateVault.lock()
          : undefined,
      )
      .catch((reason: Error) => setNotice(reason.message));
  };
  const unlock = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await privateVault.unlock(String(new FormData(event.currentTarget).get('password')));
      await dispatch({ type: 'switch-space', spaceId: 'private' });
      setUnlockOpen(false);
    } catch (reason) {
      setNotice((reason as Error).message);
    }
  };
  return (
    <TooltipProvider delayDuration={200}>
      <main
        className="app-shell"
        data-theme={settings.theme}
        style={
          {
            '--home-clock-color': textColors.clock,
            '--home-date-color': textColors.date,
            '--home-greeting-color': textColors.greeting,
            '--home-search-color':
              settings.textColorMode === 'auto' ? undefined : textColors.search,
            '--home-tabs-color': textColors.tabs,
            '--home-cards-color': textColors.cards,
          } as React.CSSProperties
        }
      >
        <Background key={spaceId} settings={settings} onError={setNotice} />

        {/* 右上角模式切换 */}
        <div className="fixed top-4 right-4 z-40">
          <Tooltip content={homeMode === 'focus' ? tr('展开导航') : tr('进入简洁模式')} side="left">
            <button
              className="flex items-center justify-center w-11 h-11 rounded-2xl bg-black/25 hover:bg-black/40 text-white/85 hover:text-white backdrop-blur-xl border border-white/20 shadow-sm transition-[color,background-color,transform] duration-200 cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
              aria-label={homeMode === 'focus' ? tr('展开导航') : tr('进入简洁模式')}
              onClick={() =>
                void dispatch({
                  type: 'set-home-mode',
                  mode: homeMode === 'focus' ? 'navigation' : 'focus',
                }).catch((reason: Error) => setNotice(reason.message))
              }
            >
              {homeMode === 'focus' ? <LayoutGrid size={16} /> : <Minimize2 size={16} />}
            </button>
          </Tooltip>
        </div>

        {/* 边缘悬停滑出热区与微光指示条 */}
        {homeMode === 'navigation' && sidebarMode === 'auto' && (
          <div
            className="fixed left-0 top-0 bottom-0 w-3.5 z-40 flex items-center group pointer-events-auto cursor-pointer select-none"
            onMouseEnter={handleMouseEnterSidebar}
            onMouseLeave={handleMouseLeaveSidebar}
            onClick={() => setIsSidebarPinnedOpen((prev) => !prev)}
            aria-label={isSidebarVisible ? tr('收起侧边栏') : tr('展开侧边栏')}
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
        {homeMode === 'navigation' && sidebarMode === 'hidden' && !isSidebarVisible && (
          <Tooltip content={tr('展开侧边栏')} side="right">
            <button
              className="fixed left-3 bottom-3 z-40 w-9 h-9 rounded-xl bg-black/40 hover:bg-black/60 text-white/80 hover:text-white border border-white/15 backdrop-blur-xl flex items-center justify-center transition-all duration-200 shadow-lg cursor-pointer"
              onClick={() => setIsSidebarPinnedOpen(true)}
              aria-label={tr('展开侧边栏')}
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
          aria-label={tr('分组栏')}
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
            aria-label={tr('分组导航')}
            className="flex-1 w-full min-h-0 flex flex-col gap-[7px] items-center overflow-y-auto no-scrollbar px-1 sm:px-2"
          />

          <div className="flex flex-col gap-[3px] shrink-0 w-full px-1 sm:px-2 mt-auto pt-2">
            <Tooltip
              content={tr(spaceId === 'normal' ? '切换私密空间' : '切换普通空间')}
              side="right"
            >
              <button
                className="relative flex flex-col items-center justify-center w-full min-h-[50px] sm:min-h-[54px] rounded-xl text-white/75 hover:text-white hover:bg-white/15 transition-all duration-150 cursor-pointer"
                onClick={() => switchSpace(spaceId === 'normal' ? 'private' : 'normal')}
              >
                <LockKeyhole size={19} strokeWidth={1.6} />
                <span className="text-[11px] font-medium leading-none mt-[5px]">
                  {tr(spaceId === 'normal' ? '私密空间' : '普通空间')}
                </span>
              </button>
            </Tooltip>
            <Tooltip content={tr('设置')} side="right">
              <button
                className="flex flex-col items-center justify-center w-full min-h-[50px] sm:min-h-[54px] rounded-xl text-white/75 hover:text-white hover:bg-white/15 transition-all duration-150 cursor-pointer"
                aria-label={tr('设置')}
                onClick={() => {
                  setSettingsOpen(true);
                  setIsSidebarPinnedOpen(false);
                }}
              >
                <Settings size={19} strokeWidth={1.6} />
                <span className="text-[11px] font-medium leading-none mt-[5px]">{tr('设置')}</span>
              </button>
            </Tooltip>
          </div>
        </aside>

        {/* 主工作区 */}
        <div
          onClick={(event) => {
            if (isSidebarPinnedOpen && event.currentTarget.contains(event.target as Node))
              setIsSidebarPinnedOpen(false);
          }}
          className={cn(
            'relative w-full min-h-screen flex flex-col items-center transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
            homeMode === 'focus'
              ? 'pt-[118px] px-4 pb-8'
              : 'pt-[70px] sm:pt-[57px] px-[68px] sm:px-[92px] pb-[88px]',
          )}
        >
          <div className="w-full mx-auto flex flex-col transition-all duration-500">
            {(settings.showClock ||
              settings.showDate ||
              settings.showLunar ||
              settings.showGreeting) && (
              <Clock
                language={settings.language}
                hour12={settings.hour12}
                showClock={settings.showClock}
                showDate={settings.showDate}
                showLunar={settings.showLunar}
                showGreeting={settings.showGreeting}
                customGreetings={settings.customGreetings}
                compact={homeMode === 'navigation'}
              />
            )}
            {settings.showSearch && (
              <div className="relative z-30 w-full flex justify-center mt-[29px]">
                <SearchBar settings={settings} spaceId={spaceId} onError={setNotice} />
              </div>
            )}

            {/* 导航卡片区域 */}
            <div
              className={cn(
                'relative z-10 w-full transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
                homeMode === 'focus'
                  ? 'opacity-0 max-h-0 pointer-events-none overflow-hidden translate-y-6 scale-[0.98]'
                  : 'opacity-100 max-h-[10000px] translate-y-0 scale-100 mt-[51px]',
              )}
              aria-hidden={homeMode === 'focus'}
              inert={homeMode === 'focus'}
            >
              <NavigationPage
                state={state}
                spaceId={spaceId}
                onError={setNotice}
                groupsPortal={groupsPortalNode}
                onOpenSettings={() => setSettingsOpen(true)}
              />
            </div>
          </div>
        </div>

        {(notice || error) && (
          <div
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-neutral-900/90 text-white text-xs backdrop-blur-xl border border-white/20 shadow-2xl max-w-[calc(100vw-32px)]"
            role="alert"
          >
            <span>{tr(notice || error || '')}</span>
            <button
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/15 text-white/70 hover:text-white text-sm transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
              onClick={() => {
                setNotice('');
                if (error) void refresh();
              }}
              aria-label={error ? tr('重试读取') : tr('关闭提示')}
            >
              {error ? tr('重试') : '×'}
            </button>
          </div>
        )}
        {settingsOpen && (
          <SettingsPanel
            state={state}
            spaceId={spaceId}
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            onError={setNotice}
          />
        )}
        {!state.local.onboardingComplete && (
          <Onboarding
            language={settings.language}
            onFinish={() =>
              void dispatch({ type: 'complete-onboarding' }).catch((reason: Error) =>
                setNotice(reason.message),
              )
            }
          />
        )}
        <Dialog open={unlockOpen} onOpenChange={setUnlockOpen}>
          <DialogContent className="vault-dialog rounded-3xl" closeLabel={tr('关闭')}>
            <form className="form-stack" onSubmit={unlock}>
              <div className="vault-mark shadow-xs mx-auto" aria-hidden="true">
                <ShieldCheck size={28} />
              </div>
              <DialogHeader className="text-center">
                <DialogTitle className="text-lg font-bold">{tr('解锁私密空间')}</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
                  {tr('密码只用于当前标签页，刷新或返回普通空间后会重新锁定。')}
                </DialogDescription>
              </DialogHeader>
              <Input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                autoFocus
                placeholder={tr('输入私密空间密码')}
                className="h-10 text-center rounded-xl border-black/10 dark:border-white/15 bg-black/[0.02] dark:bg-white/5 tracking-widest placeholder:tracking-normal"
              />
              <Button
                type="submit"
                className="h-10 w-full rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 font-medium cursor-pointer shadow-xs transition-all"
              >
                {tr('解锁')}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </main>
    </TooltipProvider>
  );
}
