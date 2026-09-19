import { describe, expect, it } from 'vitest';
import { resolveHomeTextColors } from '../src/features/appearance/text-colors';
import { defaultSettings } from '../src/storage/model';

describe('home text colors', () => {
  it('supports white, dark and per-element custom colors', () => {
    expect(resolveHomeTextColors({ ...defaultSettings, textColorMode: 'light' }).clock).toBe(
      '#ffffff',
    );
    expect(resolveHomeTextColors({ ...defaultSettings, textColorMode: 'dark' }).clock).toBe(
      '#0f172a',
    );
    const custom = {
      ...defaultSettings.textColors,
      clock: '#123456',
      cards: '#abcdef',
    };
    expect(
      resolveHomeTextColors({ ...defaultSettings, textColorMode: 'custom', textColors: custom }),
    ).toEqual(custom);
  });

  it('chooses dark text for bright colors and white text for dark gradients', () => {
    expect(
      resolveHomeTextColors({
        ...defaultSettings,
        textColorMode: 'auto',
        background: 'color',
        solidColor: '#ffffff',
      }).clock,
    ).toBe('#0f172a');
    expect(
      resolveHomeTextColors({
        ...defaultSettings,
        textColorMode: 'auto',
        background: 'gradient',
        gradient: 'linear-gradient(#102020, #203030)',
      }).clock,
    ).toBe('#ffffff');
  });
});
