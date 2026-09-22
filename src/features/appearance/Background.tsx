import { useEffect, useState } from 'react';
import { useResourceUrl } from '@/hooks/useResourceUrl';
import type { SpaceSettings } from '@/storage/model';
import { DEFAULT_WALLPAPER_URL } from './wallpapers';
import { cn } from '@/lib/utils';

export function Background({ settings }: { settings: SpaceSettings }) {
  const image = useResourceUrl(settings.background === 'custom' ? settings.wallpaperId : undefined);
  const remoteImage = ['bing', 'unsplash', 'custom'].includes(settings.background)
    ? settings.onlineWallpaperUrl
    : undefined;
  const requestedImage =
    image ?? remoteImage ?? (settings.background === 'custom' ? DEFAULT_WALLPAPER_URL : undefined);
  const [loadedImage, setLoadedImage] = useState<string>();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!requestedImage) {
      setLoadedImage(undefined);
      setIsReady(false);
      return;
    }
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
    preload.src = requestedImage;
    return () => {
      cancelled = true;
    };
  }, [requestedImage]);

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
      <div style={{ background: `rgba(0,0,0,${settings.overlay})` }} />
    </div>
  );
}
