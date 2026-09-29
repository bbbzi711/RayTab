import { useEffect, useState, type FormEvent } from 'react';
import { Check, ExternalLink, Globe2, Plus, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { dispatch, useRayTab } from '@/storage/store';
import { t } from '@/locales';

export default function Popup() {
  const { state, error } = useRayTab();
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState('');
  const [page, setPage] = useState({ title: '', url: '' });

  useEffect(() => {
    if (!browser.tabs?.query) return;
    void browser.tabs
      .query({ active: true, currentWindow: true })
      .then(([tab]) => setPage({ title: tab?.title ?? '', url: tab?.url ?? '' }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (state?.normalSettings.theme) {
      document.documentElement.dataset.theme = state.normalSettings.theme;
    }
  }, [state?.normalSettings.theme]);

  if (!state) return <main className="popup-loading">{error ?? 'Opening…'}</main>;

  const language = state.normalSettings.language;
  const tr = (text: string) => t(language, text);
  const activeGroupId = state.local.activeGroup.normal;
  const groups = [...state.spaces.normal.groups].sort((a, b) => a.order - b.order);
  const folders = state.spaces.normal.folders;

  const domain = (() => {
    try {
      return page.url ? new URL(page.url).hostname : 'example.com';
    } catch {
      return 'example.com';
    }
  })();

  const initialLetter = (page.title.trim() || domain || 'R').charAt(0).toUpperCase();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const locationStr = String(data.get('location'));
    const { groupId, folderId } = JSON.parse(locationStr);

    try {
      await dispatch({
        type: 'save-site',
        spaceId: 'normal',
        id: crypto.randomUUID(),
        groupId,
        folderId,
        site: {
          title: String(data.get('title')).trim(),
          url: String(data.get('url')).trim(),
          color: '#3b82f6',
        },
      });
      setSaved(true);
      setMessage('');
    } catch (reason) {
      setMessage((reason as Error).message);
    }
  };

  const openRayTab = () => {
    if (browser.tabs?.create) {
      void browser.tabs.create({ url: browser.runtime.getURL('/newtab.html') });
    } else {
      window.open('/newtab.html', '_blank');
    }
    window.close();
  };

  return (
    <main className="popup-shell">
      <header className="popup-header">
        <div className="popup-header-brand">
          <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-gradient-to-br from-white/90 to-white/60 text-slate-900 font-bold text-xs shadow-xs select-none">
            R
          </div>
          <span>RayTab</span>
        </div>
        <span className="popup-header-badge">{tr('普通空间')}</span>
      </header>

      {saved ? (
        <div className="popup-success">
          <div className="popup-success-icon">
            <Check size={28} strokeWidth={2.5} />
          </div>
          <div className="flex flex-col gap-1">
            <strong className="text-sm font-semibold">{tr('已添加网站')}</strong>
            <small className="text-xs text-[var(--dialog-muted)]">{page.title.slice(0, 30)}</small>
          </div>
          <div className="flex gap-2 w-full mt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1 rounded-xl cursor-pointer"
              onClick={() => setSaved(false)}
            >
              {tr('继续添加')}
            </Button>
            <Button
              type="button"
              size="sm"
              className="flex-1 rounded-xl cursor-pointer bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-medium"
              onClick={openRayTab}
            >
              <ExternalLink size={14} />
              {tr('查看首页')}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="popup-preview">
            <div className="popup-preview-icon">{initialLetter}</div>
            <div className="popup-preview-text">
              <div className="popup-preview-title">{page.title || tr('当前标签页')}</div>
              <div className="popup-preview-url">{domain}</div>
            </div>
          </div>

          <form className="popup-form" onSubmit={submit}>
            <div className="popup-field">
              <label htmlFor="title">{tr('名称')}</label>
              <Input
                id="title"
                name="title"
                required
                maxLength={80}
                defaultValue={page.title}
                key={`title-${page.title}`}
                className="rounded-xl bg-[var(--dialog-control-surface)] border-[var(--dialog-inner-border)] text-xs h-9"
                autoFocus
              />
            </div>

            <div className="popup-field">
              <label htmlFor="url">{tr('网址')}</label>
              <Input
                id="url"
                name="url"
                required
                placeholder="https://example.com"
                defaultValue={page.url}
                key={`url-${page.url}`}
                className="rounded-xl bg-[var(--dialog-control-surface)] border-[var(--dialog-inner-border)] text-xs h-9"
              />
            </div>

            <div className="popup-field">
              <label htmlFor="location">{tr('存入位置')}</label>
              <select
                id="location"
                name="location"
                defaultValue={JSON.stringify({ groupId: activeGroupId, folderId: null })}
                className="popup-select"
              >
                {groups.map((group) => (
                  <optgroup key={group.id} label={group.name}>
                    <option value={JSON.stringify({ groupId: group.id, folderId: null })}>
                      {tr('直接平铺')}
                    </option>
                    {folders
                      .filter((f) => f.groupId === group.id)
                      .sort((a, b) => a.order - b.order)
                      .map((f) => (
                        <option
                          key={f.id}
                          value={JSON.stringify({ groupId: group.id, folderId: f.id })}
                        >
                          {f.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {message && (
              <p className="text-xs text-red-500 font-medium mt-1" role="alert">
                {tr(message)}
              </p>
            )}

            <div className="popup-footer-actions">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="rounded-xl text-xs cursor-pointer text-[var(--dialog-muted)] hover:text-[var(--dialog-text)]"
                onClick={openRayTab}
              >
                <Globe2 size={14} />
                {tr('打开主页')}
              </Button>
              <Button
                type="submit"
                size="sm"
                className="flex-1 rounded-xl cursor-pointer bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-medium shadow-xs"
              >
                <Plus size={15} />
                {tr('添加网站')}
              </Button>
            </div>
          </form>
        </>
      )}
    </main>
  );
}
