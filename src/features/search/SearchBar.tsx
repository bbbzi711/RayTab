import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { dispatch } from '@/storage/store';
import type { SpaceId, SpaceSettings } from '@/storage/model';
import { t } from '@/locales';
import { cn } from '@/lib/utils';
import { getSearchEngineIcon } from '@/features/navigation/brandIcons';

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
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const engineRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      if (document.querySelector('[role="dialog"]')) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);

  // 点击外部自动关闭下拉菜单
  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const closeMenu = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      triggerRef.current?.focus();
    };
    window.addEventListener('keydown', closeMenu);
    return () => window.removeEventListener('keydown', closeMenu);
  }, [menuOpen]);

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

  const currentEngine =
    settings.searchEngines.find((item) => item.id === settings.searchEngine) ??
    settings.searchEngines[0];

  const focusEngine = (index: number) => {
    const count = settings.searchEngines.length;
    if (!count) return;
    engineRefs.current[(index + count) % count]?.focus();
  };

  return (
    <form
      className={cn('search-shell', menuOpen ? 'z-50' : 'z-20')}
      onSubmit={search}
      role="search"
    >
      {/* 自定义毛玻璃引擎切换器（彻底消灭原生白底 select） */}
      <div className="relative flex shrink-0">
        <button
          ref={triggerRef}
          type="button"
          className="search-engine-trigger"
          onClick={() => setMenuOpen((prev) => !prev)}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
            event.preventDefault();
            setMenuOpen(true);
            const selectedIndex = settings.searchEngines.findIndex(
              (engine) => engine.id === settings.searchEngine,
            );
            requestAnimationFrame(() =>
              focusEngine(
                event.key === 'ArrowUp' ? settings.searchEngines.length - 1 : selectedIndex,
              ),
            );
          }}
          aria-label={tr('切换搜索引擎')}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          title={tr('切换搜索引擎')}
        >
          {getSearchEngineIcon(currentEngine.id, currentEngine.name)}
          <ChevronDown
            size={13}
            aria-hidden="true"
            className={cn('search-engine-chevron', menuOpen && 'search-engine-chevron--open')}
          />
        </button>

        {menuOpen && (
          <div
            ref={menuRef}
            role="menu"
            className="search-engine-menu"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(event) => {
              const activeIndex = engineRefs.current.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              if (event.key === 'Escape') {
                event.preventDefault();
                setMenuOpen(false);
                triggerRef.current?.focus();
              } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                focusEngine(activeIndex + 1);
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                focusEngine(activeIndex - 1);
              } else if (event.key === 'Home') {
                event.preventDefault();
                focusEngine(0);
              } else if (event.key === 'End') {
                event.preventDefault();
                focusEngine(settings.searchEngines.length - 1);
              }
            }}
          >
            {settings.searchEngines.map((engine, index) => {
              const isSelected = engine.id === settings.searchEngine;
              return (
                <button
                  ref={(node) => {
                    engineRefs.current[index] = node;
                  }}
                  key={engine.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isSelected}
                  className={cn(
                    'search-engine-option',
                    isSelected && 'search-engine-option--selected',
                  )}
                  onClick={() => {
                    void dispatch({
                      type: 'settings',
                      spaceId,
                      patch: { searchEngine: engine.id as SpaceSettings['searchEngine'] },
                    }).catch((error) => onError(String(error.message)));
                    setMenuOpen(false);
                    requestAnimationFrame(() => triggerRef.current?.focus());
                  }}
                >
                  <span className="flex items-center gap-2.5">
                    {getSearchEngineIcon(engine.id, engine.name)}
                    <span>{engine.name}</span>
                  </span>
                  {isSelected && <Check size={14} className="text-blue-500 shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        name="q"
        aria-label={tr('搜索内容')}
        placeholder={tr('输入搜索内容')}
        className="search-input"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
      />

      {/* 一键清空按钮 */}
      {query.length > 0 && (
        <button
          type="button"
          aria-label={tr('清空')}
          onClick={() => {
            setQuery('');
            inputRef.current?.focus();
          }}
          className="search-action search-action--clear"
        >
          <X size={13} />
        </button>
      )}

      <button type="submit" aria-label={tr('搜索')} className="search-action">
        <Search size={17} />
      </button>
    </form>
  );
}
