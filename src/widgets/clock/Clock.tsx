import { memo, useEffect, useState } from 'react';
import type { Language } from '@/locales';
import type { SpaceSettings } from '@/storage/model';

export const Clock = memo(function Clock({
  language,
  hour12,
  showDate = true,
  showLunar = true,
  showGreeting = true,
  customGreetings,
}: {
  language: Language;
  hour12: boolean;
  showDate?: boolean;
  showLunar?: boolean;
  showGreeting?: boolean;
  customGreetings?: SpaceSettings['customGreetings'];
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
  return (
    <section className="clock" aria-label={language === 'en' ? 'Clock' : '时钟'}>
      <time className="clock-time" dateTime={now.toISOString()}>
        {now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12 })}
      </time>
      {(showDate || showGreeting) && (
        <p className="clock-date">
          {showDate && (
            <span className="clock-date-value">
              {now.toLocaleDateString(locale, { month: 'long', day: 'numeric', weekday: 'long' })}
            </span>
          )}
          {showDate && showLunar && language === 'zh-CN' && <i>•</i>}
          {showDate && showLunar && language === 'zh-CN' && (
            <span className="clock-date-value">{formatLunar(now)}</span>
          )}
          {showDate && showGreeting && <i>•</i>}
          {showGreeting && (
            <span className="clock-greeting">{greeting(now, language, customGreetings)}</span>
          )}
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
