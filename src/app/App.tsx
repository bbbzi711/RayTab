import { lazy, Suspense, useState, type FormEvent } from 'react';
import {
  Globe2,
  Grid2X2,
  LayoutGrid,
  LockKeyhole,
  Minimize2,
  MoreHorizontal,
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

const SettingsPanel = lazy(() => import('@/features/settings/SettingsPanel'));

export default function App() {
  const { state, error } = useRayTab();
  const [notice, setNotice] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [addRequested, setAddRequested] = useState(0);
  const [manageRequested, setManageRequested] = useState(0);
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
        <button
          className="flex items-center justify-center w-8 h-8 rounded-xl bg-black/20 hover:bg-black/35 text-white/80 hover:text-white backdrop-blur-xl border border-white/15 shadow-sm transition-all duration-200 cursor-pointer active:scale-95"
          aria-label={homeMode === 'focus' ? tr('展开导航') : tr('进入简洁模式')}
          title={homeMode === 'focus' ? tr('展开导航') : tr('进入简洁模式')}
          onClick={() =>
            void dispatch({
              type: 'set-home-mode',
              mode: homeMode === 'focus' ? 'navigation' : 'focus',
            }).catch((reason: Error) => setNotice(reason.message))
          }
        >
          {homeMode === 'focus' ? <LayoutGrid size={16} /> : <Minimize2 size={16} />}
        </button>
      </div>

      {/* 左侧贴边极简侧边栏（导航模式滑入，简洁模式滑出） */}
      <aside
        className={cn(
          'fixed left-0 top-0 bottom-0 w-[52px] sm:w-14 flex flex-col items-center py-3.5 z-30 bg-black/25 hover:bg-black/35 backdrop-blur-2xl border-r border-white/10 transition-all duration-500 cubic-bezier(0.16, 1, 0.3, 1) select-none',
          homeMode === 'focus' ? '-translate-x-full opacity-0 pointer-events-none' : 'translate-x-0 opacity-100',
        )}
        aria-label={tr('空间')}
      >
        <div
          className="w-8 h-8 rounded-xl bg-gradient-to-br from-white/90 to-white/60 text-slate-900 font-bold text-xs flex items-center justify-center shadow-md select-none mb-4"
          aria-label="RayTab"
          title="RayTab"
        >
          R
        </div>
        <nav className="flex flex-col gap-2.5" aria-label={tr('空间')}>
          <button
            className={cn(
              'relative flex flex-col items-center justify-center w-10 h-11 rounded-xl transition-all duration-150 cursor-pointer',
              spaceId === 'normal'
                ? 'bg-white/25 text-white shadow-xs font-semibold'
                : 'text-white/75 hover:text-white hover:bg-white/15',
            )}
            aria-label={tr('普通空间')}
            aria-pressed={spaceId === 'normal'}
            title={tr('普通空间')}
            onClick={() => switchSpace('normal')}
          >
            <Globe2 size={16} />
            <span className="text-[10px] font-medium leading-none mt-1">普通</span>
          </button>
          <button
            className={cn(
              'relative flex flex-col items-center justify-center w-10 h-11 rounded-xl transition-all duration-150 cursor-pointer',
              spaceId === 'private'
                ? 'bg-purple-500/35 text-purple-100 border border-purple-400/40 shadow-xs font-semibold'
                : 'text-white/75 hover:text-white hover:bg-white/15',
            )}
            aria-label={tr('私密空间')}
            aria-pressed={spaceId === 'private'}
            title={tr('私密空间')}
            onClick={() => switchSpace('private')}
          >
            <LockKeyhole size={15} />
            <span className="text-[10px] font-medium leading-none mt-1">私密</span>
          </button>
        </nav>
        <div className="flex flex-col gap-2 mt-auto">
          <button
            className="flex flex-col items-center justify-center w-10 h-11 rounded-xl text-white/75 hover:text-white hover:bg-white/15 transition-all duration-150 cursor-pointer"
            aria-label={tr('添加网站')}
            title={tr('添加网站')}
            onClick={() => setAddRequested((value) => value + 1)}
          >
            <Plus size={16} />
            <span className="text-[10px] font-medium leading-none mt-1">添加</span>
          </button>
          <button
            className="flex flex-col items-center justify-center w-10 h-11 rounded-xl text-white/75 hover:text-white hover:bg-white/15 transition-all duration-150 cursor-pointer"
            aria-label={tr('管理')}
            title={tr('管理')}
            onClick={() => setManageRequested((value) => value + 1)}
          >
            <MoreHorizontal size={16} />
            <span className="text-[10px] font-medium leading-none mt-1">管理</span>
          </button>
          <button
            className="flex flex-col items-center justify-center w-10 h-11 rounded-xl text-white/75 hover:text-white hover:bg-white/15 transition-all duration-150 cursor-pointer"
            aria-label={tr('打开设置')}
            title={tr('打开设置')}
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={15} />
            <span className="text-[10px] font-medium leading-none mt-1">设置</span>
          </button>
        </div>
      </aside>

      {/* 主工作区（时钟、搜索框与卡片网格持久渲染，位置与缩放通过 CSS 动画平滑过渡） */}
      <div
        className={cn(
          'relative w-full min-h-screen flex flex-col items-center justify-between pb-8 transition-all duration-500 cubic-bezier(0.16, 1, 0.3, 1)',
          homeMode === 'focus'
            ? 'pt-[16vh] sm:pt-[18vh] px-4'
            : 'pt-5 sm:pt-6 pl-14 sm:pl-16 pr-4 sm:pr-8',
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
          「要始终记得自己是一个可以不断生长的人，始终对生活、生命有敬畏，有期待，有相信，有开创。」
        </footer>
      </div>

      {(notice || error) && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-neutral-900/90 text-white text-xs backdrop-blur-xl border border-white/20 shadow-2xl max-w-[calc(100vw-32px)]"
          role="alert"
        >
          <span>{tr(notice || error || '')}</span>
          <button
            className="w-5 h-5 rounded-lg flex items-center justify-center hover:bg-white/15 text-white/70 hover:text-white text-sm transition-colors cursor-pointer"
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
        <Suspense
          fallback={
            <div role="status" className="notice">
              {tr('正在打开设置…')}
            </div>
          }
        >
          <SettingsPanel
            state={state}
            spaceId={spaceId}
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            onError={setNotice}
          />
        </Suspense>
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
        <DialogContent className="vault-dialog" closeLabel={tr('关闭')}>
          <form className="form-stack" onSubmit={unlock}>
            <div className="vault-mark" aria-hidden="true">
              <ShieldCheck size={28} />
            </div>
            <DialogHeader>
              <DialogTitle>{tr('解锁私密空间')}</DialogTitle>
              <DialogDescription>
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
            />
            <Button type="submit">{tr('解锁')}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
