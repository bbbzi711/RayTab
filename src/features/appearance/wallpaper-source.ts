import type { SpaceSettings } from '@/storage/model';
import { DEFAULT_WALLPAPER_URL, bingDailyUrl } from './wallpapers';

export type WallpaperDisplay = {
  source: string;
  resourceId?: string;
  remoteUrl?: string;
  color: string;
  gradient?: string;
  overlay: number;
};

export function wallpaperDisplay(settings: SpaceSettings): WallpaperDisplay {
  const resourceId = settings.background === 'custom' ? settings.wallpaperId : undefined;
  const remoteUrl =
    settings.background === 'bing'
      ? bingDailyUrl
      : settings.background === 'unsplash'
        ? (settings.featuredPhotoUrl ?? DEFAULT_WALLPAPER_URL)
        : settings.background === 'custom' && !resourceId
          ? (settings.onlineWallpaperUrl ?? DEFAULT_WALLPAPER_URL)
          : undefined;
  return {
    source: resourceId ? `resource:${resourceId}` : (remoteUrl ?? settings.background),
    resourceId,
    remoteUrl,
    color: settings.solidColor,
    gradient: settings.background === 'gradient' ? settings.gradient : undefined,
    overlay: settings.overlay,
  };
}
