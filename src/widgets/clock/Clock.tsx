import { memo, useEffect, useState } from 'react';
import type { Language } from '@/locales';
import type { SpaceSettings } from '@/storage/model';
import { cn } from '@/lib/utils';

export const Clock = memo(function Clock({
  language,
  hour12,
  showDate = true,
  showLunar = true,
  showGreeting = true,
  customGreetings,
  compact = false,
}: {
  language: Language;
  hour12: boolean;
  showDate?: boolean;
  showLunar?: boolean;
  showGreeting?: boolean;
  customGreetings?: SpaceSettings['customGreetings'];
  compact?: boolean;
}) {
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
    weekday: 'short',
  });
  // 转换形如 "9月20日 星期日"
  const formattedDate =
    language === 'zh-CN'
      ? `${now.getMonth() + 1}月${now.getDate()}日 ${now.toLocaleDateString('zh-CN', { weekday: 'long' })}`
      : dateStr;

  return (
    <section
      className={cn(
        'flex flex-col items-center justify-center select-none text-center transition-all duration-500 cubic-bezier(0.16, 1, 0.3, 1)',
        compact ? 'mb-3' : 'mb-6',
      )}
      aria-label={language === 'en' ? 'Clock' : '时钟'}
    >
      <time
        className={cn(
          'tabular-nums drop-shadow-[0_2px_16px_rgba(0,0,0,0.35)] text-[var(--home-clock-color,#fff)] leading-none transition-all duration-500 cubic-bezier(0.16, 1, 0.3, 1)',
          compact
            ? 'text-[38px] sm:text-[42px] mb-1 font-light tracking-tight'
            : 'text-[68px] sm:text-[76px] leading-[76px] mb-2 font-light tracking-tight',
        )}
        dateTime={now.toISOString()}
      >
        {timeString}
      </time>
      {showDate && (
        <p
          className={cn(
            'flex items-center justify-center gap-2.5 font-normal text-[var(--home-date-color,#fff)] opacity-85 drop-shadow-[0_1px_6px_rgba(0,0,0,0.3)] transition-all duration-500 cubic-bezier(0.16, 1, 0.3, 1)',
            compact ? 'text-[11px] opacity-75' : 'text-[13px] sm:text-[14px]',
          )}
        >
          <span>{formattedDate}</span>
          {showLunar && language === 'zh-CN' && <span>{formatLunar(now)}</span>}
        </p>
      )}
    </section>
  );
});

function formatLunar(date: Date) {
  try {
    return new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
      month: 'long',
      day: 'numeric',
    }).format(date);
  } catch {
    return '';
  }
}

function greeting(date: Date, language: Language, custom?: SpaceSettings['customGreetings']) {
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
  const choices = custom?.[period];
  if (choices?.length) {
    const day = Math.floor(date.getTime() / 86_400_000);
    return choices[day % choices.length];
  }
  if (language === 'en') {
    if (hour < 5) return 'It is late. Get some rest.';
    if (hour < 11) return 'Good morning.';
    if (hour < 14) return 'Have a good afternoon.';
    if (hour < 19) return 'Keep going.';
    return 'Good evening.';
  }
  if (hour < 5) return '夜深了，早点休息哦';
  if (hour < 11) return '早上好，开启新的一天';
  if (hour < 14) return '中午好，记得好好吃饭';
  if (hour < 19) return '下午好，继续加油';
  return '晚上好，放松一下吧';
}
