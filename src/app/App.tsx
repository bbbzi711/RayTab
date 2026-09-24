import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Globe2,
  Grid2X2,
  LayoutGrid,
  LockKeyhole,
  Minimize2,
  MoreHorizontal,
  PanelLeft,
  Pin,
  PinOff,
  Plus,
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
  const [addRequested, setAddRequested] = useState(0);
  const [manageRequested, setManageRequested] = useState(0);
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
  if (!state)
    return (
      <main className="loading">
        <Sun size={32} />
        <h1>RayTab</h1>
        <p>{error ?? '正在打开你的空间…'}</p>
        {error && <button onClick={() => void refresh()}>重试</button>}
      </main>
    );

  const spaceId = state.local.activeSpace;
  const homeMode = state.local.homeMode;
  const settings = effectiveSettings(state, spaceId);
  const textColors = resolveHomeTextColors(settings);
  const tr = (text: string) => t(settings.language, text);
  const sidebarMode = settings.sidebarMode ?? 'always';
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const [isSidebarPinnedOpen, setIsSidebarPinnedOpen] = useState(false);
  const hoverLeaveTimerRef = useRef<number | null>(null);

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
    (sidebarMode === 'always' || isSidebarHovered || isSidebarPinnedOpen);

  useEffect(() => {
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
            '--home-search-color': textColors.search,
            '--home-tabs-color': textColors.tabs,
            '--home-cards-color': textColors.cards,
          } as React.CSSProperties
        }
      >
        <Background settings={settings} />

        {/* 右上角模式切换（带柔和磨砂底色与动态图标） */}
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

        {/* 边缘悬停滑出热区与微光指示条（学习 iTab 的边缘悬停呼出体验） */}
        {homeMode === 'navigation' && sidebarMode !== 'always' && (
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

        {/* 左侧贴边极简侧边栏（支持常驻显示、自动隐藏与完全隐藏） */}
        <aside
          onMouseEnter={handleMouseEnterSidebar}
          onMouseLeave={handleMouseLeaveSidebar}
          className={cn(
            'fixed left-2.5 right-2.5 bottom-2.5 h-[60px] flex flex-row items-center px-2 py-2 z-30 bg-black/30 hover:bg-black/40 backdrop-blur-2xl border border-white/15 rounded-2xl transition-all duration-500 cubic-bezier(0.16, 1, 0.3, 1) select-none sm:left-0 sm:right-auto sm:top-0 sm:bottom-0 sm:h-auto sm:w-14 sm:flex-col sm:px-0 sm:py-3.5 sm:rounded-none sm:border-y-0 sm:border-l-0 sm:border-r sm:border-white/10',
            !isSidebarVisible
              ? 'translate-y-24 opacity-0 pointer-events-none sm:translate-y-0 sm:-translate-x-full'
              : 'translate-y-0 opacity-100 sm:translate-x-0 shadow-2xl',
          )}
          aria-label={tr('空间')}
          aria-hidden={!isSidebarVisible}
          inert={!isSidebarVisible}
        >
          <div
            className="hidden sm:flex w-8 h-8 rounded-xl bg-gradient-to-br from-white/90 to-white/60 text-slate-900 font-bold text-xs items-center justify-center shadow-md select-none mb-4"
            aria-label="RayTab"
            title="RayTab"
          >
            R
          </div>
          <nav className="flex gap-2 sm:flex-col sm:gap-2.5" aria-label={tr('空间')}>
            <Tooltip content={tr('普通空间')} side="right">
              <button
                className={cn(
                  'relative flex flex-col items-center justify-center w-10 h-11 rounded-xl transition-all duration-150 cursor-pointer',
                  spaceId === 'normal'
                    ? 'bg-white/25 text-white shadow-xs font-semibold'
                    : 'text-white/75 hover:text-white hover:bg-white/15',
                )}
                aria-label={tr('普通空间')}
                aria-pressed={spaceId === 'normal'}
                onClick={() => switchSpace('normal')}
              >
                <Globe2 size={16} />
                <span className="text-[10px] font-medium leading-none mt-1">{tr('普通')}</span>
              </button>
            </Tooltip>
            <Tooltip content={tr('私密空间')} side="right">
              <button
                className={cn(
                  'relative flex flex-col items-center justify-center w-10 h-11 rounded-xl transition-all duration-150 cursor-pointer',
                  spaceId === 'private'
                    ? 'bg-purple-500/35 text-purple-100 border border-purple-400/40 shadow-xs font-semibold'
                    : 'text-white/75 hover:text-white hover:bg-white/15',
                )}
                aria-label={tr('私密空间')}
                aria-pressed={spaceId === 'private'}
                onClick={() => switchSpace('private')}
              >
                <LockKeyhole size={15} />
                <span className="text-[10px] font-medium leading-none mt-1">{tr('私密')}</span>
              </button>
            </Tooltip>
          </nav>
          <div className="flex gap-2 ml-auto pl-2 border-l border-white/15 sm:flex-col sm:mt-auto sm:ml-0 sm:pl-0 sm:border-l-0">
            <Tooltip content={tr('添加网站')} side="right">
              <button
                className="flex flex-col items-center justify-center w-10 h-11 rounded-xl text-white/75 hover:text-white hover:bg-white/15 transition-all duration-150 cursor-pointer"
                aria-label={tr('添加网站')}
                onClick={() => setAddRequested((value) => value + 1)}
              >
                <Plus size={16} />
                <span className="text-[10px] font-medium leading-none mt-1">{tr('添加')}</span>
              </button>
            </Tooltip>
            <Tooltip content={tr('管理')} side="right">
              <button
                className="flex flex-col items-center justify-center w-10 h-11 rounded-xl text-white/75 hover:text-white hover:bg-white/15 transition-all duration-150 cursor-pointer"
                aria-label={tr('管理')}
                onClick={() => setManageRequested((value) => value + 1)}
              >
                <MoreHorizontal size={16} />
                <span className="text-[10px] font-medium leading-none mt-1">{tr('管理')}</span>
              </button>
            </Tooltip>
            <Tooltip
              content={sidebarMode === 'always' ? tr('自动隐藏侧边栏') : tr('固定侧边栏')}
              side="right"
            >
              <button
                className="flex flex-col items-center justify-center w-10 h-11 rounded-xl text-white/75 hover:text-white hover:bg-white/15 transition-all duration-150 cursor-pointer"
                aria-label={sidebarMode === 'always' ? tr('自动隐藏侧边栏') : tr('固定侧边栏')}
                onClick={() => {
                  const nextMode = sidebarMode === 'always' ? 'auto' : 'always';
                  void dispatch({
                    type: 'settings',
                    spaceId,
                    patch: { sidebarMode: nextMode },
                  }).catch((reason: Error) => setNotice(reason.message));
                }}
              >
                {sidebarMode === 'always' ? <PinOff size={15} /> : <Pin size={15} />}
                <span className="text-[10px] font-medium leading-none mt-1">
                  {sidebarMode === 'always' ? tr('自动') : tr('固定')}
                </span>
              </button>
            </Tooltip>
            <Tooltip content={tr('打开设置')} side="right">
              <button
                className="flex flex-col items-center justify-center w-10 h-11 rounded-xl text-white/75 hover:text-white hover:bg-white/15 transition-all duration-150 cursor-pointer"
                aria-label={tr('打开设置')}
                onClick={() => {
                  setSettingsOpen(true);
                  setIsSidebarPinnedOpen(false);
                }}
              >
                <Settings size={15} />
                <span className="text-[10px] font-medium leading-none mt-1">{tr('设置')}</span>
              </button>
            </Tooltip>
          </div>
        </aside>

        {/* 主工作区（时钟、搜索框与卡片网格持久渲染，位置与缩放通过 CSS 动画平滑过渡） */}
        <div
          onClick={() => {
            if (isSidebarPinnedOpen) setIsSidebarPinnedOpen(false);
          }}
          className={cn(
            'relative w-full min-h-screen flex flex-col items-center justify-between transition-all duration-500 cubic-bezier(0.16, 1, 0.3, 1)',
            homeMode === 'focus'
              ? 'pt-[16vh] sm:pt-[18vh] px-4 pb-8'
              : 'pt-5 px-4 pb-24 sm:pt-6 sm:px-16 sm:pb-8',
          )}
        >
          <div className="w-full max-w-6xl mx-auto flex flex-col items-center transition-all duration-500">
            {settings.showClock && (
              <Clock
                language={settings.language}
                hour12={settings.hour12}
                showDate={settings.showDate}
                showLunar={settings.showLunar}
                showGreeting={false}
                compact={homeMode === 'navigation'}
              />
            )}
            {settings.showSearch && (
              <div className="relative z-30 w-full flex justify-center">
                <SearchBar settings={settings} spaceId={spaceId} onError={setNotice} />
              </div>
            )}

            {/* 导航卡片区域（在简洁模式下平滑淡出，在导航模式下展开） */}
            <div
              className={cn(
                'relative z-10 w-full transition-all duration-500 cubic-bezier(0.16, 1, 0.3, 1)',
                homeMode === 'focus'
                  ? 'opacity-0 max-h-0 pointer-events-none overflow-hidden translate-y-6 scale-[0.98]'
                  : 'opacity-100 max-h-[10000px] translate-y-0 scale-100',
              )}
              aria-hidden={homeMode === 'focus'}
              inert={homeMode === 'focus'}
            >
              <NavigationPage
                state={state}
                spaceId={spaceId}
                addRequested={addRequested}
                manageRequested={manageRequested}
                onError={setNotice}
              />
            </div>
          </div>

          {/* 底部名言金句 */}
          <footer
            className={cn(
              'text-center text-[12px] text-white/55 font-normal tracking-wider drop-shadow-[0_1px_4px_rgba(0,0,0,0.3)] px-4 select-none transition-all duration-500',
              homeMode === 'focus' ? 'mt-auto pt-8' : 'mt-6 pb-2',
            )}
          >
            {tr(
              '「要始终记得自己是一个可以不断生长的人，始终对生活、生命有敬畏，有期待，有相信，有开创。」',
            )}
          </footer>
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
