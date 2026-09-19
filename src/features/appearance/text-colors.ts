import type { SpaceSettings } from '@/storage/model';

export type HomeTextColors = SpaceSettings['textColors'];

const light: HomeTextColors = {
  clock: '#ffffff',
  date: '#ffffff',
  greeting: '#ffffff',
  search: '#ffffff',
  tabs: '#ffffff',
  cards: '#ffffff',
};

const dark: HomeTextColors = {
  clock: '#0f172a',
  date: '#334155',
  greeting: '#334155',
  search: '#1e293b',
  tabs: '#1e293b',
  cards: '#0f172a',
};

export function resolveHomeTextColors(settings: SpaceSettings): HomeTextColors {
  if (settings.textColorMode === 'light') return light;
  if (settings.textColorMode === 'dark') return dark;
  if (settings.textColorMode === 'custom') return settings.textColors;
  return estimatedBackgroundLuminance(settings) > 0.62 ? dark : light;
}

function estimatedBackgroundLuminance(settings: SpaceSettings) {
  if (settings.background === 'color') return hexLuminance(settings.solidColor);
  if (settings.background !== 'gradient') return 0;
  const colors = settings.gradient.match(/#[0-9a-f]{6}/gi);
  if (!colors?.length) return 0;
  return colors.reduce((sum, color) => sum + hexLuminance(color), 0) / colors.length;
}

function hexLuminance(color: string) {
  const channels = [1, 3, 5].map(
    (index) => Number.parseInt(color.slice(index, index + 2), 16) / 255,
  );
  const linear = channels.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
