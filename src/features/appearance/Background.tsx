import { useEffect, useState } from 'react';
import { useResourceUrl } from '@/hooks/useResourceUrl';
import type { SpaceSettings } from '@/storage/model';
import { DEFAULT_WALLPAPER_URL, bingDailyUrl } from './wallpapers';
import { t } from '@/locales';
import { cn } from '@/lib/utils';

export function Background({
  settings,
  onError,
}: {
  settings: SpaceSettings;
  onError: (message: string) => void;
}) {
  const image = useResourceUrl(settings.background === 'custom' ? settings.wallpaperId : undefined);
  const requestedImage =
    settings.background === 'bing'
      ? bingDailyUrl
      : settings.background === 'unsplash'
        ? (settings.featuredPhotoUrl ?? DEFAULT_WALLPAPER_URL)
        : settings.background === 'custom'
          ? settings.wallpaperId
            ? image
            : (settings.onlineWallpaperUrl ?? DEFAULT_WALLPAPER_URL)
          : undefined;
  const [loadedImage, setLoadedImage] = useState<string>();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setLoadedImage(undefined);
    setIsReady(false);
    if (!requestedImage) return;
    let cancelled = false;
    const preload = new Image();
    preload.onload = () => {
      if (!cancelled) {
        setLoadedImage(requestedImage);
        requestAnimationFrame(() => {
          if (!cancelled) setIsReady(true);
        });
      }
    };
    preload.onerror = () => {
      if (!cancelled) onError(t(settings.language, '壁纸加载失败，请检查图片地址或网络。'));
    };
    preload.src = requestedImage;
    return () => {
      cancelled = true;
    };
  }, [requestedImage, settings.language, onError]);

  const isLegacyGreen = settings.solidColor === '#193540';
  const effectiveBgColor =
    settings.background === 'color'
      ? settings.solidColor
      : isLegacyGreen
        ? 'transparent'
        : settings.solidColor;

  return (
    <div
      className={`page-background background-${settings.background}`}
      aria-hidden="true"
      style={{
        backgroundColor: effectiveBgColor,
        ...(settings.background === 'gradient' ? { backgroundImage: settings.gradient } : {}),
      }}
    >
      {loadedImage && (
        <div
          className={cn('page-background-image', isReady && 'is-loaded')}
          style={{ backgroundImage: `url("${loadedImage}")` }}
        />
      )}
      <div
        className="page-background-overlay"
        style={{ backgroundColor: `rgba(0,0,0,${settings.overlay})` }}
      />
    </div>
  );
}
