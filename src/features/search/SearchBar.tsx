import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { toast } from 'sonner';
import { ChevronDown, Search, X } from 'lucide-react';
import { selectEffectiveSettings, useRayTabStore } from '@/storage/store';
import { BROWSER_SEARCH_ENGINE, type SpaceId } from '@/storage/model';
import { searchWithBrowser } from './browser-search';
import { errorMessage } from '@/lib/errors';
import { getSearchEngineIcon } from '@/features/navigation/brandIcons';
import { Tooltip } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu';

const searchActionClass =
  'rounded-full text-[color:var(--home-search-color,var(--surface-muted))] hover:bg-[var(--search-action-hover)] hover:text-[color:var(--surface-text)]';

export function SearchBar({ spaceId }: { spaceId: SpaceId }) {
  const { t } = useTranslation();
  const settings = useRayTabStore(useShallow((store) => selectEffectiveSettings(store, spaceId)))!;
  const dispatch = useRayTabStore((store) => store.dispatch);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const focusSearchOnClose = useRef(false);
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
  const useBrowserEngine = settings.searchEngine === BROWSER_SEARCH_ENGINE;
  const engine =
    settings.searchEngines.find((item) => item.id === settings.searchEngine) ??
    settings.searchEngines[0];
  const search = async (event: FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    if (useBrowserEngine) {
      try {
        await searchWithBrowser(query.trim(), settings.openInNewTab);
      } catch (reason) {
        toast.error(errorMessage(reason));
      }
      return;
    }
    const url = engine.url.replace('%s', encodeURIComponent(query.trim()));
    if (settings.openInNewTab) window.open(url, '_blank', 'noopener,noreferrer');
    else window.location.assign(url);
  };
  return (
    <form className="search-shell" onSubmit={search} role="search">
      <DropdownMenu
        onOpenChange={(open) => {
          if (open) focusSearchOnClose.current = false;
        }}
      >
        <Tooltip content={t('messages.switchSearchEngine')} side="bottom">
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className={cn(searchActionClass, 'min-w-9 gap-1.25 px-1.5 has-[>svg]:px-1.5')}
              aria-label={t('messages.switchSearchEngine')}
            >
              {getSearchEngineIcon(
                useBrowserEngine ? BROWSER_SEARCH_ENGINE : engine.id,
                engine.name,
              )}
              <ChevronDown className="ui-icon-compact" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
        </Tooltip>
        <DropdownMenuContent
          align="start"
          // Align to the search shell, whose trigger is inset 11px horizontally and 6px vertically.
          alignOffset={-11}
          sideOffset={12}
          className="min-w-[min(192px,calc(100vw-16px))]"
          onCloseAutoFocus={(event) => {
            if (!focusSearchOnClose.current) return;
            event.preventDefault();
            focusSearchOnClose.current = false;
            inputRef.current?.focus();
          }}
        >
          <DropdownMenuRadioGroup
            value={settings.searchEngine}
            onValueChange={(value) => {
              void dispatch({ type: 'settings', spaceId, patch: { searchEngine: value } }).catch(
                (reason) => toast.error(errorMessage(reason)),
              );
            }}
          >
            <DropdownMenuRadioItem
              value={BROWSER_SEARCH_ENGINE}
              onSelect={() => {
                focusSearchOnClose.current = true;
              }}
            >
              {getSearchEngineIcon(BROWSER_SEARCH_ENGINE, '')}
              <span className="min-w-0 truncate">{t('messages.browserSearchEngine')}</span>
            </DropdownMenuRadioItem>
            {settings.searchEngines.map((item) => (
              <DropdownMenuRadioItem
                key={item.id}
                value={item.id}
                onSelect={() => {
                  focusSearchOnClose.current = true;
                }}
              >
                {getSearchEngineIcon(item.id, item.name)}
                <span className="min-w-0 truncate">{item.name}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Input
        ref={inputRef}
        name="q"
        aria-label={t('messages.searchQuery')}
        placeholder={t('messages.searchTheWeb')}
        className="h-full flex-1 rounded-none border-0 bg-transparent px-2.25 text-[color:var(--home-search-color,inherit)] placeholder:text-[color:color-mix(in_srgb,currentColor_58%,transparent)] focus-visible:ring-0"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        autoComplete="off"
      />
      {query.length > 0 && (
        <Tooltip content={t('messages.clear')} side="top">
          <Button
            type="button"
            aria-label={t('messages.clear')}
            variant="ghost"
            size="icon-sm"
            className={cn(searchActionClass, 'mr-0.5')}
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
          >
            <X className="ui-icon-compact" aria-hidden="true" />
          </Button>
        </Tooltip>
      )}
      <Tooltip content={t('messages.search')} side="bottom">
        <Button
          type="submit"
          aria-label={t('messages.search')}
          variant="ghost"
          size="icon"
          className={searchActionClass}
        >
          <Search className="ui-icon-action" aria-hidden="true" />
        </Button>
      </Tooltip>
    </form>
  );
}
