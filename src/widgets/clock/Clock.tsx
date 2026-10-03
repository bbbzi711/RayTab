import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { Language } from '@/locales';
import { cn } from '@/lib/utils';

export const Clock = memo(function Clock({
  language,
  hour12,
  showClock = true,
  showDate = true,
  showLunar = true,
  showGreeting = true,
  compact = false,
}: {
  language: Language;
  hour12: boolean;
  showClock?: boolean;
  showDate?: boolean;
  showLunar?: boolean;
  showGreeting?: boolean;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const locale = language === 'en' ? 'en-US' : 'zh-CN';
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: number;
    const tick = () => {
      setNow(new Date());
      timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000));
    };
    const resume = () => {
      if (!document.hidden) {
        clearTimeout(timer);
        tick();
      }
    };
    tick();
    document.addEventListener('visibilitychange', resume);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', resume);
    };
  }, []);

  const timeString = now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12 });

  const dateStr = now.toLocaleDateString(locale, {
    month: 'numeric',
    day: 'numeric',
    weekday: 'long',
  });

  return (
    <section
      className={cn(
        'flex flex-col items-center justify-center select-none text-center transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
        compact ? 'mb-0' : 'mb-6',
      )}
      aria-label={t('clock.label')}
    >
      {showClock && (
        <time
          className={cn(
            'tabular-nums drop-shadow-[0_2px_16px_rgba(0,0,0,0.35)] text-[var(--home-clock-color,#fff)] leading-none transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
            compact
              ? 'text-[47px]/[1.1] sm:text-[62px]/[1.1] mb-3 font-light tracking-tight'
              : 'text-[68px] sm:text-[76px] leading-[76px] mb-2 font-light tracking-tight',
          )}
          dateTime={now.toISOString()}
        >
          {timeString}
        </time>
      )}
      {(showDate || showLunar) && (
        <p
          className={cn(
            'flex items-center justify-center gap-2.5 font-normal text-[var(--home-date-color,#fff)] opacity-85 drop-shadow-[0_1px_6px_rgba(0,0,0,0.3)] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
            compact ? 'text-[11px] sm:text-[12px] opacity-75' : 'text-[13px] sm:text-[14px]',
          )}
        >
          {showDate && <span>{dateStr}</span>}
          {showLunar && <span>{formatLunar(now, language)}</span>}
        </p>
      )}
      {showGreeting && (
        <p className="mt-3 text-sm text-[var(--home-greeting-color,#fff)] drop-shadow-sm">
          {greeting(now, t)}
        </p>
      )}
    </section>
  );
});

function formatLunar(date: Date, language: Language) {
  try {
    return new Intl.DateTimeFormat(language === 'en' ? 'en-u-ca-chinese' : 'zh-CN-u-ca-chinese', {
      month: 'long',
      day: 'numeric',
    }).format(date);
  } catch {
    return '';
  }
}

function greeting(date: Date, t: TFunction) {
  const hour = date.getHours();
  const period =
    hour < 5
      ? 'night'
      : hour < 11
        ? 'morning'
        : hour < 14
          ? 'noon'
          : hour < 19
            ? 'afternoon'
            : 'evening';
  return t(`clock.${period}`);
}
