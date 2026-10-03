import { useEffect } from 'react';
import type { SpaceSettings, SpaceId } from '@/storage/model';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useRayTabStore } from '@/storage/store';
import { wallpaperDisplay } from './wallpaper-source';
import { displayWallpaper, WallpaperCacheError } from './wallpaper-renderer';

export function Background({ settings, spaceId }: { settings: SpaceSettings; spaceId: SpaceId }) {
  const { t } = useTranslation();
  const resourceVersion = useRayTabStore((store) => store.resourceVersion);
  useEffect(() => {
    let active = true;
    void displayWallpaper(wallpaperDisplay(settings), spaceId).catch((reason: unknown) => {
      if (active)
        toast.error(
          t(
            reason instanceof WallpaperCacheError
              ? 'messages.wallpaperCacheCouldNotSave'
              : 'messages.wallpaperCouldNotLoadCheckTheImageUrlOrYourConnection',
          ),
          { id: 'wallpaper-load' },
        );
    });
    return () => {
      active = false;
    };
  }, [settings, spaceId, resourceVersion, t]);
  return null;
}
