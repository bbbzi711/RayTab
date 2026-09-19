export const gradientPresets = [
  'linear-gradient(135deg, #163c3b 0%, #6b755f 52%, #9b795e 100%)',
  'linear-gradient(135deg, #172554 0%, #4338ca 52%, #c084fc 100%)',
  'linear-gradient(135deg, #064e3b 0%, #0f766e 50%, #67e8f9 100%)',
  'linear-gradient(135deg, #7c2d12 0%, #be123c 48%, #fbbf24 100%)',
] as const;

export const featuredPhotos = [
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
