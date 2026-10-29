import { describe, expect, it } from 'vitest';
import { resolveHomeTextColors } from '../../src/features/appearance/text-colors';
import { defaultSettings } from '../../src/storage/model';

// Contrast is a reading requirement; the theme may choose any color that meets it.
function luminance(channels: number[]) {
  const linear = channels
    .map((value) => value / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
function assertReadable(colors: ReturnType<typeof resolveHomeTextColors>, background: number[]) {
  for (const role of ['clock', 'date', 'greeting', 'search', 'tabs', 'cards'] as const) {
    expect(colors[role]).toMatch(/^#[\da-f]{6}$/i);
    const foreground = [1, 3, 5].map((offset) =>
      Number.parseInt(colors[role].slice(offset, offset + 2), 16),
    );
    const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    expect((values[0] + 0.05) / (values[1] + 0.05), role).toBeGreaterThanOrEqual(4.5);
  }
}

describe('home text readability', () => {
  it('keeps every home text role readable over the default dark image backdrop', () => {
    assertReadable(resolveHomeTextColors(defaultSettings), [16, 24, 41]);
  });
  it('keeps text readable over bright solid colors and dark gradients', () => {
    assertReadable(
      resolveHomeTextColors({
        ...defaultSettings,
        background: 'color',
        solidColor: '#ffffff',
        overlay: 0,
      }),
      [255, 255, 255],
    );
    assertReadable(
      resolveHomeTextColors({
        ...defaultSettings,
        background: 'gradient',
        gradient: 'linear-gradient(#102020, #203030)',
        overlay: 0,
      }),
      [32, 48, 48],
    );
  });
  it('accounts for a dark overlay when choosing text for a bright source', () => {
    assertReadable(
      resolveHomeTextColors({
        ...defaultSettings,
        background: 'color',
        solidColor: '#ffffff',
        overlay: 0.8,
      }),
      [51, 51, 51],
    );
  });
});
