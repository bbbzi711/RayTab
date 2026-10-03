import { openRayDatabase, type WallpaperCache } from '@/storage/connection';
import type { WallpaperDisplay } from './wallpaper-source';
import { bingDailyUrl } from './wallpapers';

let scope = 'normal';
let generation = 0;
let requestedSource: string | undefined;
let loaded: { source: string; url: string; cache: WallpaperCache } | undefined;
let pending: AbortController | undefined;
let pendingTask: Promise<void> | undefined;
let background: HTMLDivElement | undefined;
let imageLayer: HTMLDivElement;
let overlayLayer: HTMLDivElement;

export class WallpaperCacheError extends Error {}

function layers() {
  if (background) return background;
  background = document.createElement('div');
  background.className = 'page-background';
  background.setAttribute('aria-hidden', 'true');
  imageLayer = document.createElement('div');
  imageLayer.className = 'page-background-image';
  overlayLayer = document.createElement('div');
  overlayLayer.className = 'page-background-overlay';
  background.append(imageLayer, overlayLayer);
  document.body.prepend(background);
  window.addEventListener('pagehide', () => {
    pending?.abort();
    clearImage();
    requestedSource = undefined;
  });
  return background;
}

function clearImage() {
  if (loaded) URL.revokeObjectURL(loaded.url);
  loaded = undefined;
  if (imageLayer) imageLayer.style.backgroundImage = '';
}

function rememberColor(source: string, color: string) {
  try {
    const meta: unknown = JSON.parse(localStorage.getItem('raytab-startup-meta') || '{}');
    if (typeof meta !== 'object' || !meta || !('wallpaper' in meta)) return false;
    const display = meta.wallpaper;
    if (
      typeof display !== 'object' ||
      !display ||
      !('source' in display) ||
      display.source !== source
    )
      return false;
    localStorage.setItem(
      'raytab-startup-meta',
      JSON.stringify({ ...meta, wallpaper: { ...display, color } }),
    );
    return true;
  } catch {
    return false;
  }
}

async function saveCache(cache: WallpaperCache) {
  // Previews and private wallpapers never enter the startup cache.
  if (scope !== 'normal' || !rememberColor(cache.source, cache.color)) return;
  const db = await openRayDatabase();
  try {
    const saved = await db.get('wallpapers', 'current');
    if (
      saved?.source === cache.source &&
      saved.color === cache.color &&
      saved.fetchedAt === cache.fetchedAt &&
      Boolean(saved.blob) === Boolean(cache.blob)
    )
      return;
    if (scope === 'normal' && loaded?.source === cache.source)
      await db.put('wallpapers', cache, 'current');
  } finally {
    db.close();
  }
}

function decode(url: string, signal: AbortSignal) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const finish = (error?: Error) => {
      signal.removeEventListener('abort', abort);
      image.onload = image.onerror = null;
      if (error) reject(error);
      else resolve(image);
    };
    const abort = () => {
      image.src = '';
      finish(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
    image.onload = () => finish();
    image.onerror = () => finish(new Error('wallpaper-image'));
    if (signal.aborted) abort();
    else image.src = url;
  });
}

function averageColor(image: HTMLImageElement, fallback: string) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 8;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return fallback;
  ctx.drawImage(image, 0, 0, 8, 8);
  const pixels = ctx.getImageData(0, 0, 8, 8).data;
  const channels = [0, 0, 0];
  let weight = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3] / 255;
    weight += alpha;
    channels.forEach((_, channel) => {
      channels[channel] += pixels[i + channel] * alpha;
    });
  }
  return weight
    ? `#${channels
        .map((value) =>
          Math.round(value / weight)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')}`
    : fallback;
}

async function localImage(display: WallpaperDisplay, allowPrevious = false) {
  const db = await openRayDatabase();
  try {
    const cache = await db.get('wallpapers', 'current');
    const color = cache?.source === display.source ? cache.color : display.color;
    const blob = display.resourceId
      ? await db.get('resources', display.resourceId)
      : cache?.source === display.source
        ? cache.blob
        : undefined;
    return blob
      ? {
          source: display.source,
          color,
          blob,
          fetchedAt: cache?.source === display.source ? cache.fetchedAt : 0,
        }
      : allowPrevious && cache?.blob
        ? cache
        : undefined;
  } finally {
    db.close();
  }
}

export function displayWallpaper(
  display: WallpaperDisplay,
  nextScope = 'normal',
  localOnly = false,
) {
  const task = renderWallpaper(display, nextScope, localOnly);
  if (pending && requestedSource === display.source) pendingTask = task;
  return task;
}

async function renderWallpaper(display: WallpaperDisplay, nextScope: string, localOnly: boolean) {
  const layer = layers();
  if (scope !== nextScope) {
    clearImage();
    requestedSource = undefined;
  }
  scope = nextScope;
  const color =
    display.resourceId || display.remoteUrl
      ? (loaded?.cache.color ?? display.color)
      : display.color;
  layer.style.backgroundColor = color;
  layer.style.backgroundImage = display.gradient ?? '';
  document.documentElement.style.backgroundColor = color;
  overlayLayer.style.backgroundColor = `rgba(0,0,0,${display.overlay})`;
  if (!display.resourceId && !display.remoteUrl) {
    generation++;
    pending?.abort();
    clearImage();
    requestedSource = undefined;
    return;
  }
  if (requestedSource === display.source && pending && !pending.signal.aborted) return pendingTask;
  if (
    !display.resourceId &&
    loaded?.source === display.source &&
    (display.remoteUrl !== bingDailyUrl ||
      new Date(loaded.cache.fetchedAt).toDateString() === new Date().toDateString())
  ) {
    layer.style.backgroundColor = loaded.cache.color;
    document.documentElement.style.backgroundColor = loaded.cache.color;
    try {
      await saveCache(loaded.cache);
    } catch {
      throw new WallpaperCacheError('wallpaper-cache');
    }
    return;
  }
  const request = ++generation;
  pending?.abort();
  const controller = new AbortController();
  pending = controller;
  requestedSource = display.source;
  let candidate: string | undefined;
  try {
    let cache = nextScope === 'normal' ? await localImage(display, localOnly) : undefined;
    if (
      cache &&
      !localOnly &&
      display.remoteUrl === bingDailyUrl &&
      new Date(cache.fetchedAt).toDateString() !== new Date().toDateString()
    )
      cache = undefined;
    if (!cache && localOnly) return;
    if (!cache) {
      let blob: Blob | undefined;
      if (display.resourceId) {
        // Private resources are read through the unlocked repository session only.
        const { repository } = await import('@/storage/repository');
        blob = await repository.resource(display.resourceId);
      } else if (display.remoteUrl) {
        const response = await fetch(display.remoteUrl, {
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
        });
        if (!response.ok) throw new Error(`wallpaper-http:${response.status}`);
        blob = await response.blob();
      }
      if (!blob || !blob.size || blob.size > 20 * 1024 * 1024)
        throw new Error('wallpaper-resource');
      cache = { source: display.source, color: display.color, blob, fetchedAt: Date.now() };
    }
    if (request !== generation || controller.signal.aborted) return;
    candidate = URL.createObjectURL(cache.blob!);
    const image = await decode(candidate, controller.signal);
    if (request !== generation || controller.signal.aborted) return;
    cache.color = averageColor(image, cache.color);
    const previous = loaded;
    loaded = {
      source: cache.source,
      url: candidate,
      cache: { ...cache, blob: cache.source.startsWith('resource:') ? undefined : cache.blob },
    };
    candidate = undefined;
    imageLayer.style.backgroundImage = `url("${loaded.url}")`;
    layer.style.backgroundColor = cache.color;
    document.documentElement.style.backgroundColor = cache.color;
    // Uploaded wallpapers already live in resources: cache their color, never duplicate the image.
    if (previous) requestAnimationFrame(() => URL.revokeObjectURL(previous.url));
    if (!localOnly) {
      try {
        await saveCache(loaded.cache);
      } catch {
        throw new WallpaperCacheError('wallpaper-cache');
      }
    }
  } catch (error) {
    if (request === generation && !controller.signal.aborted) throw error;
  } finally {
    if (candidate) URL.revokeObjectURL(candidate);
    if (pending === controller) {
      pending = undefined;
      pendingTask = undefined;
      requestedSource = undefined;
    }
  }
}
