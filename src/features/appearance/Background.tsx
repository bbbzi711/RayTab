import { useEffect, useState } from 'react';
import { useResourceUrl } from '@/hooks/useResourceUrl';
import type { SpaceSettings } from '@/storage/model';

export function Background({ settings }: { settings: SpaceSettings }) {
  const image = useResourceUrl(settings.background === 'custom' ? settings.wallpaperId : undefined);
  const remoteImage = ['bing', 'unsplash', 'custom'].includes(settings.background)
    ? settings.onlineWallpaperUrl
    : undefined;
  const requestedImage = image ?? remoteImage;
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
  return (
    <div
      className={`page-background background-${settings.background}`}
      aria-hidden="true"
      style={{
        backgroundColor: settings.solidColor,
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
