import { lazy, Suspense, useState, type FormEvent } from 'react';
import {
  Globe2,
  Grid2X2,
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
      <button
        className="home-mode-toggle"
        aria-label={homeMode === 'focus' ? tr('展开导航') : tr('进入简洁模式')}
        title={homeMode === 'focus' ? tr('展开导航') : tr('进入简洁模式')}
        onClick={() =>
          void dispatch({
            type: 'set-home-mode',
            mode: homeMode === 'focus' ? 'navigation' : 'focus',
          }).catch((reason: Error) => setNotice(reason.message))
        }
      >
        {homeMode === 'focus' ? <Grid2X2 size={20} /> : <Minimize2 size={20} />}
      </button>
      <div className={`home-frame home-frame-${homeMode}`}>
        {homeMode === 'navigation' && (
          <aside className="app-sidebar" aria-label={tr('空间')}>
            <div className="sidebar-brand" aria-label="RayTab" title="RayTab">
              R
            </div>
            <nav className="sidebar-spaces" aria-label={tr('空间')}>
              <button
                className={spaceId === 'normal' ? 'active' : ''}
                aria-label={tr('普通空间')}
                aria-pressed={spaceId === 'normal'}
                title={tr('普通空间')}
                onClick={() => switchSpace('normal')}
              >
                <Globe2 size={19} />
              </button>
              <button
                className={spaceId === 'private' ? 'active' : ''}
                aria-label={tr('私密空间')}
                aria-pressed={spaceId === 'private'}
                title={tr('私密空间')}
                onClick={() => switchSpace('private')}
              >
                <LockKeyhole size={18} />
              </button>
            </nav>
            <div className="sidebar-actions">
              <button
                aria-label={tr('添加网站')}
                title={tr('添加网站')}
                onClick={() => setAddRequested((value) => value + 1)}
              >
                <Plus size={20} />
              </button>
              <button
                aria-label={tr('管理')}
                title={tr('管理')}
                onClick={() => setManageRequested((value) => value + 1)}
              >
                <MoreHorizontal size={20} />
              </button>
              <button
                aria-label={tr('打开设置')}
                title={tr('打开设置')}
                onClick={() => setSettingsOpen(true)}
              >
                <Settings size={19} />
              </button>
            </div>
          </aside>
        )}
        <div className="page-content">
          {settings.showClock && (
            <Clock
              language={settings.language}
              hour12={settings.hour12}
              showDate={settings.showDate}
              showLunar={settings.showLunar}
              showGreeting={settings.showGreeting}
              customGreetings={settings.customGreetings}
            />
          )}
          {settings.showSearch && (
            <SearchBar settings={settings} spaceId={spaceId} onError={setNotice} />
          )}
          {homeMode === 'navigation' && (
            <NavigationPage
              state={state}
              spaceId={spaceId}
              addRequested={addRequested}
              manageRequested={manageRequested}
              onError={setNotice}
            />
          )}
        </div>
      </div>
      {(notice || error) && (
        <div className="notice" role="alert">
          {tr(notice || error || '')}
          <button
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
