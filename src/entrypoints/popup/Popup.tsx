import { useEffect, useState, type FormEvent } from 'react';
import { Check, Plus, Sun } from 'lucide-react';
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
  if (!state) return <main className="popup-loading">{error ?? 'Opening…'}</main>;
  const language = state.normalSettings.language;
  const tr = (text: string) => t(language, text);
  const desktopId = state.local.activeDesktop.normal;
  const categories = state.spaces.normal.categories.filter((item) => item.desktopId === desktopId);
  const preferred = categories.find((item) => !item.isDefault) ?? categories[0];
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await dispatch({
        type: 'save-site',
        spaceId: 'normal',
        id: crypto.randomUUID(),
        categoryId: String(data.get('categoryId')),
        site: { title: String(data.get('title')), url: String(data.get('url')), color: '#4f7c68' },
      });
      setSaved(true);
      setMessage('');
    } catch (reason) {
      setMessage((reason as Error).message);
    }
  };
  return (
    <main className="popup-shell">
      <header>
        <span>
          <Sun size={17} />
          RayTab
        </span>
        <small>{tr('快速添加到普通空间')}</small>
      </header>
      {saved ? (
        <div className="popup-success">
          <Check size={26} />
          <strong>{tr('已添加')}</strong>
          <button onClick={() => setSaved(false)}>{tr('继续添加')}</button>
        </div>
      ) : (
        <form onSubmit={submit}>
          <label>
            {tr('名称')}
            <input
              name="title"
              required
              maxLength={80}
              defaultValue={page.title}
              key={`title-${page.title}`}
              autoFocus
            />
          </label>
          <label>
            {tr('网址')}
            <input
              name="url"
              required
              placeholder="example.com"
              defaultValue={page.url}
              key={`url-${page.url}`}
            />
          </label>
          <label>
            {tr('分类')}
            <select name="categoryId" defaultValue={preferred.id}>
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          {message && <p role="alert">{tr(message)}</p>}
          <button type="submit">
            <Plus size={16} />
            {tr('添加网站')}
          </button>
        </form>
      )}
    </main>
  );
}
