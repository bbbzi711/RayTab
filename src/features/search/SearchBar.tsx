import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { toast } from 'sonner';
import { ChevronDown, Search, X } from 'lucide-react';
import { selectEffectiveSettings, useRayTabStore } from '@/storage/store';
import type { SpaceId } from '@/storage/model';
import { errorMessage } from '@/lib/errors';
import { getSearchEngineIcon } from '@/features/navigation/brandIcons';
import { Tooltip } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu';

export function SearchBar({ spaceId }: { spaceId: SpaceId }) {
  const { t } = useTranslation();
  const settings = useRayTabStore(useShallow((store) => selectEffectiveSettings(store, spaceId)))!;
  const dispatch = useRayTabStore((store) => store.dispatch);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (
        (event.target as HTMLElement | null)?.matches(
          'input, textarea, select, [contenteditable="true"]',
        )
      )
        return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);
  const engine =
    settings.searchEngines.find((item) => item.id === settings.searchEngine) ??
    settings.searchEngines[0];
  const search = (event: FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    const url = engine.url.replace('%s', encodeURIComponent(query.trim()));
    if (settings.openInNewTab) window.open(url, '_blank', 'noopener,noreferrer');
    else window.location.assign(url);
  };
  return (
    <form className="search-shell" onSubmit={search} role="search">
      <DropdownMenu>
        <Tooltip content={t('messages.switchSearchEngine')} side="bottom">
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="search-engine-trigger"
              aria-label={t('messages.switchSearchEngine')}
            >
              {getSearchEngineIcon(engine.id, engine.name)}
              <ChevronDown size={13} aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
        </Tooltip>
        <DropdownMenuContent align="start" className="min-w-48">
          <DropdownMenuRadioGroup
            value={settings.searchEngine}
            onValueChange={(value) => {
              void dispatch({ type: 'settings', spaceId, patch: { searchEngine: value } }).catch(
                (reason) => toast.error(errorMessage(reason)),
              );
            }}
          >
            {settings.searchEngines.map((item) => (
              <DropdownMenuRadioItem key={item.id} value={item.id}>
                {getSearchEngineIcon(item.id, item.name)}
                <span>{item.name}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={inputRef}
        name="q"
        aria-label={t('messages.searchQuery')}
        placeholder={t('messages.searchTheWeb')}
        className="search-input"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        autoComplete="off"
      />
      {query.length > 0 && (
        <Tooltip content={t('messages.clear')} side="top">
          <button
            type="button"
            aria-label={t('messages.clear')}
            className="search-action search-action--clear"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
          >
            <X size={13} />
          </button>
        </Tooltip>
      )}
      <Tooltip content={t('messages.search')} side="bottom">
        <button type="submit" aria-label={t('messages.search')} className="search-action">
          <Search size={17} />
        </button>
      </Tooltip>
    </form>
  );
}
