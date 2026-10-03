import { z } from 'zod';
import { displayWallpaper } from '@/features/appearance/wallpaper-renderer';

const wallpaperSchema = z.object({
  source: z.string().min(1).max(3000),
  resourceId: z.string().min(1).max(100).optional(),
  remoteUrl: z
    .url()
    .refine((value) => ['https:', 'http:'].includes(new URL(value).protocol))
    .optional(),
  color: z.string().regex(/^#[\da-f]{6}$/i),
  gradient: z.string().max(300).optional(),
  overlay: z.number().min(0).max(0.8),
});

export function applyStartupMeta() {
  if (typeof localStorage === 'undefined' || typeof document === 'undefined') return;
  try {
    const meta: unknown = JSON.parse(localStorage.getItem('raytab-startup-meta') || '{}');
    if (typeof meta !== 'object' || meta === null) return;
    if (
      'theme' in meta &&
      typeof meta.theme === 'string' &&
      ['system', 'light', 'dark'].includes(meta.theme)
    )
      document.documentElement.dataset.theme = meta.theme;
    if (
      'homeMode' in meta &&
      typeof meta.homeMode === 'string' &&
      ['focus', 'navigation'].includes(meta.homeMode)
    )
      document.documentElement.dataset.homeMode = meta.homeMode;
    if ('wallpaper' in meta) {
      const display = wallpaperSchema.safeParse(meta.wallpaper);
      if (display.success) {
        document.documentElement.style.backgroundColor = display.data.color;
        return display.data;
      }
    }
  } catch {
    // Optional display metadata never prevents loading the IndexedDB-backed app.
  }
}

export async function restoreStartupWallpaper() {
  const display = applyStartupMeta();
  if (!display) return;
  try {
    await displayWallpaper(display, 'normal', true);
  } catch {
    // Saved app settings will retry the actual image and report a load failure.
  }
}
