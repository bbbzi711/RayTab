export const DEFAULT_WALLPAPER_URL =
  'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1920&q=80';

export const gradientPresets = [
  'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)',
  'linear-gradient(135deg, #1e1b4b 0%, #4338ca 50%, #c084fc 100%)',
  'linear-gradient(135deg, #0c4a6e 0%, #0284c7 50%, #38bdf8 100%)',
  'linear-gradient(135deg, #4c0519 0%, #be123c 50%, #fb923c 100%)',
] as const;

export const featuredPhotos = [
  DEFAULT_WALLPAPER_URL,
  'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1920&q=75',
  'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1920&q=75',
  'https://images.unsplash.com/photo-1511884642898-4c92249e20b6?auto=format&fit=crop&w=1920&q=75',
  'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1920&q=75',
  'https://images.unsplash.com/photo-1541701494587-cb58502866ab?auto=format&fit=crop&w=1920&q=75',
] as const;

export const bingDailyUrl =
  'https://bing.biturl.top/?resolution=1920&format=image&index=0&mkt=zh-CN';

export function nextFeaturedPhoto(current?: string) {
  const available = featuredPhotos.filter((url) => url !== current);
  return available[Math.floor(Math.random() * available.length)] ?? featuredPhotos[0];
}
