import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, Search, X } from 'lucide-react';
import { dispatch } from '@/storage/store';
import type { SpaceId, SpaceSettings } from '@/storage/model';
import { t } from '@/locales';
import { cn } from '@/lib/utils';

function SearchEngineIcon({ id, name }: { id: string; name: string }) {
  if (id === 'google') {
    return (
      <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
        />
        <path
          fill="#34A853"
          d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"
        />
        <path
          fill="#FBBC05"
          d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.16 0 9.97 0 12s.45 3.84 1.25 5.42l4.03-3.15z"
        />
        <path
          fill="#EA4335"
          d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
        />
      </svg>
    );
  }
  if (id === 'baidu') {
    return (
      <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="11" fill="#2932E1" />
        <path
          d="M12 15.2c-1.6 0-2.9-1.2-2.9-2.7 0-1.5 1.3-2.7 2.9-2.7s2.9 1.2 2.9 2.7c0 1.5-1.3 2.7-2.9 2.7zm-4.3-4c-.7 0-1.3-.8-1.3-1.8s.6-1.8 1.3-1.8 1.3.8 1.3 1.8-.6 1.8-1.3 1.8zm8.6 0c-.7 0-1.3-.8-1.3-1.8s.6-1.8 1.3-1.8 1.3.8 1.3 1.8-.6 1.8-1.3 1.8zM9.5 7c-.6 0-1.1-.7-1.1-1.6S8.9 3.8 9.5 3.8s1.1.7 1.1 1.6S10.1 7 9.5 7zm5 0c-.6 0-1.1-.7-1.1-1.6s.5-1.6 1.1-1.6 1.1.7 1.1 1.6-.5 1.6-1.1 1.6z"
          fill="#ffffff"
        />
      </svg>
    );
  }
  if (id === 'bing') {
    return (
      <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="#008373"
          d="M5 2.5v19l5.5-3.2 5 2.7 3.5-2.2v-7.2l-6-2.6-2.5 1.5v-8z"
        />
      </svg>
    );
  }
  return (
    <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold shadow-xs">
      {name.slice(0, 1)}
    </span>
  );
}

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
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

  return (
    <form
      className={cn(
        "relative flex items-center w-full max-w-[600px] h-[46px] mx-auto mb-5 px-3.5 rounded-full border border-white/45 bg-white/60 dark:bg-white/20 hover:bg-white/70 dark:hover:bg-white/25 backdrop-blur-2xl shadow-[0_12px_36px_rgba(0,0,0,0.2)] text-slate-900 dark:text-white transition-all duration-200 focus-within:border-white/70 focus-within:bg-white/85 dark:focus-within:bg-white/30 focus-within:shadow-[0_16px_44px_rgba(0,0,0,0.26)] focus-within:ring-2 focus-within:ring-white/30",
        menuOpen ? "z-50" : "z-20"
      )}
      onSubmit={search}
      role="search"
    >
      {/* 自定义毛玻璃引擎切换器（彻底消灭原生白底 select） */}
      <div
        ref={triggerRef}
        className="relative flex items-center gap-1.5 shrink-0 pl-0.5 pr-2.5 cursor-pointer select-none group"
        onClick={() => setMenuOpen((prev) => !prev)}
        aria-label={tr('切换搜索引擎')}
        title={tr('切换搜索引擎')}
      >
        <SearchEngineIcon id={currentEngine.id} name={currentEngine.name} />
        <span
          className={cn(
            'text-[10px] text-slate-600 dark:text-white/70 opacity-60 group-hover:opacity-100 transition-all duration-200',
            menuOpen && 'rotate-180 opacity-100',
          )}
        >
          ▾
        </span>

        {menuOpen && (
          <div
            ref={menuRef}
            className="absolute left-0 top-[calc(100%+10px)] z-50 min-w-[160px] p-1.5 rounded-2xl bg-white/98 dark:bg-neutral-900/98 backdrop-blur-3xl border border-black/[0.08] dark:border-white/15 shadow-[0_20px_50px_rgba(0,0,0,0.35),0_4px_12px_rgba(0,0,0,0.1)] animate-in fade-in-0 zoom-in-95 duration-150 flex flex-col gap-0.5 select-none"
            onClick={(e) => e.stopPropagation()}
          >
            {settings.searchEngines.map((engine) => {
              const isSelected = engine.id === settings.searchEngine;
              return (
                <button
                  key={engine.id}
                  type="button"
                  className={cn(
                    'flex items-center justify-between w-full px-3 py-2 rounded-xl text-xs transition-all duration-150 cursor-pointer',
                    isSelected
                      ? 'bg-black/5 dark:bg-white/10 font-medium text-slate-900 dark:text-white'
                      : 'text-slate-600 dark:text-neutral-300 hover:bg-black/5 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white',
                  )}
                  onClick={() => {
                    void dispatch({
                      type: 'settings',
                      spaceId,
                      patch: { searchEngine: engine.id as SpaceSettings['searchEngine'] },
                    }).catch((error) => onError(String(error.message)));
                    setMenuOpen(false);
                  }}
                >
                  <span className="flex items-center gap-2.5">
                    <SearchEngineIcon id={engine.id} name={engine.name} />
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
        aria-label={tr('搜索内容')}
        placeholder={tr('输入搜索内容')}
        className="flex-1 min-w-0 h-full bg-transparent border-0 outline-none text-[14px] text-slate-900 dark:text-white placeholder:text-slate-600 dark:placeholder:text-white/50 px-2 font-normal"
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
          className="flex items-center justify-center w-5 h-5 rounded-full text-slate-500 dark:text-white/60 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors mr-1 cursor-pointer"
        >
          <X size={13} />
        </button>
      )}

      <button
        type="submit"
        aria-label={tr('搜索')}
        className="flex items-center justify-center w-7 h-7 rounded-full text-slate-600 dark:text-white/70 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-all duration-150 active:scale-90 shrink-0 cursor-pointer"
      >
        <Search size={17} />
      </button>
    </form>
  );
}
