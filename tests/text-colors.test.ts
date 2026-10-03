import { describe, expect, it } from 'vitest';
import { resolveHomeTextColors } from '../src/features/appearance/text-colors';
import { defaultSettings } from '../src/storage/model';

describe('home text colors', () => {
  it('uses high contrast light text on image backgrounds', () => {
    expect(resolveHomeTextColors(defaultSettings)).toEqual({
      clock: '#ffffff',
      date: '#ffffff',
      greeting: '#ffffff',
      search: '#ffffff',
      tabs: '#ffffff',
      cards: '#ffffff',
    });
  });

  it('chooses dark text for bright colors and white text for dark gradients', () => {
    expect(
      resolveHomeTextColors({
        ...defaultSettings,
        background: 'color',
        solidColor: '#ffffff',
      }).clock,
    ).toBe('#0f172a');
    expect(
      resolveHomeTextColors({
        ...defaultSettings,
        background: 'gradient',
        gradient: 'linear-gradient(#102020, #203030)',
      }).clock,
    ).toBe('#ffffff');
  });
  it('takes the dark overlay into account on bright backgrounds', () => {
    expect(
      resolveHomeTextColors({
        ...defaultSettings,
        background: 'color',
        solidColor: '#ffffff',
        overlay: 0.8,
      }).clock,
    ).toBe('#ffffff');
  });
});
