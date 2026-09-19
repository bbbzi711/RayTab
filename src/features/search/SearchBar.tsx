import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, Search } from 'lucide-react';
import { dispatch } from '@/storage/store';
import type { SpaceId, SpaceSettings } from '@/storage/model';
import { t } from '@/locales';

export function SearchBar({
  settings,
  spaceId,
  onError,
}: {
  settings: SpaceSettings;
  spaceId: SpaceId;
  onError: (message: string) => void;
}) {
  const tr = (text: string) => t(settings.language, text);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);
  function search(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    const engine =
      settings.searchEngines.find((item) => item.id === settings.searchEngine) ??
      settings.searchEngines[0];
    const url = engine.url.replace('%s', encodeURIComponent(query.trim()));
    if (settings.openInNewTab) window.open(url, '_blank', 'noopener,noreferrer');
    else window.location.assign(url);
  }
  return (
    <form className="search-bar" onSubmit={search} role="search">
      <Search size={19} aria-hidden="true" />
      <select
        aria-label={tr('搜索引擎')}
        value={settings.searchEngine}
        onChange={(e) =>
          void dispatch({
            type: 'settings',
            spaceId,
            patch: { searchEngine: e.target.value as SpaceSettings['searchEngine'] },
          }).catch((error) => onError(String(error.message)))
        }
      >
        {settings.searchEngines.map((engine) => (
          <option key={engine.id} value={engine.id}>
            {engine.name}
          </option>
        ))}
      </select>
      <input
        ref={inputRef}
        aria-label={tr('搜索内容')}
        placeholder={tr('搜索，让好奇心带路')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
      />
      <button type="submit" aria-label={tr('搜索')} className="search-submit">
        <ArrowUpRight size={22} />
      </button>
    </form>
  );
}
