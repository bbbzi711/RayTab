import { useEffect } from 'react';
import { effectiveSettings, type SpaceSettings, type SpaceId } from '@/storage/model';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { selectResourceVersion, useRayTabStore } from '@/storage/store';
import { wallpaperDisplay } from './wallpaper-source';
import { displayWallpaper, WallpaperCacheError } from './wallpaper-renderer';

export function Background({ settings, spaceId }: { settings: SpaceSettings; spaceId: SpaceId }) {
  const { t } = useTranslation();
  const { source, resourceId, remoteUrl, color, gradient, overlay } = wallpaperDisplay(settings);
  const resourceVersion = useRayTabStore((store) => selectResourceVersion(store, resourceId));
  const savedSource = useRayTabStore((store) =>
    store.state ? wallpaperDisplay(effectiveSettings(store.state, spaceId)).source : '',
  );
  useEffect(() => {
    let active = true;
    let rendering = false;
    let retryCache = false;
    const render = () => {
      if (!active || rendering) return;
      rendering = true;
      void displayWallpaper(
        { source, resourceId, remoteUrl, color, gradient, overlay },
        spaceId,
        false,
        resourceVersion,
      )
        .then(() => {
          retryCache = false;
        })
        .catch((reason: unknown) => {
          retryCache = reason instanceof WallpaperCacheError;
          if (active)
            toast.error(
              t(
                retryCache
                  ? 'messages.wallpaperCacheCouldNotSave'
                  : 'messages.wallpaperCouldNotLoadCheckTheImageUrlOrYourConnection',
              ),
              { id: 'wallpaper-load' },
            );
        })
        .finally(() => {
          rendering = false;
        });
    };
    const stopRetry = useRayTabStore.subscribe((current, previous) => {
      if (retryCache && current.state !== previous.state) render();
    });
    // Focus also refreshes the daily wallpaper and retries a failed request or cache write.
    window.addEventListener('focus', render);
    render();
    return () => {
      active = false;
      stopRetry();
      window.removeEventListener('focus', render);
    };
  }, [
    source,
    resourceId,
    remoteUrl,
    color,
    gradient,
    overlay,
    spaceId,
    resourceVersion,
    savedSource,
    t,
  ]);
  return null;
}
