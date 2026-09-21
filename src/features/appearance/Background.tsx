import { useEffect, useState } from 'react';
import { useResourceUrl } from '@/hooks/useResourceUrl';
import type { SpaceSettings } from '@/storage/model';
import { DEFAULT_WALLPAPER_URL } from './wallpapers';

export function Background({ settings }: { settings: SpaceSettings }) {
  const image = useResourceUrl(settings.background === 'custom' ? settings.wallpaperId : undefined);
  const remoteImage = ['bing', 'unsplash', 'custom'].includes(settings.background)
    ? settings.onlineWallpaperUrl
    : undefined;
  const requestedImage =
    image ?? remoteImage ?? (settings.background === 'custom' ? DEFAULT_WALLPAPER_URL : undefined);
  const [loadedImage, setLoadedImage] = useState<string>();
  useEffect(() => {
    if (!requestedImage) {
      setLoadedImage(undefined);
      return;
    }
    let cancelled = false;
    const preload = new Image();
    preload.onload = () => {
      if (!cancelled) setLoadedImage(requestedImage);
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
        ...(settings.background === 'gradient'
          ? { backgroundImage: settings.gradient }
          : loadedImage
            ? { backgroundImage: `url("${loadedImage}")` }
            : {}),
      }}
    >
      <div style={{ background: `rgba(0,0,0,${settings.overlay})` }} />
    </div>
  );
}
