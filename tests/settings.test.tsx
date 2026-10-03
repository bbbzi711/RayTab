import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createBackup } from '../src/features/backup/backup';
import { Clock } from '../src/widgets/clock/Clock';
import { createInitialState, effectiveSettings, rayStateSchema } from '../src/storage/model';
import { applyCommand } from '../src/storage/operations';
import { createRepository } from '../src/storage/database';

afterEach(() => vi.useRealTimers());

describe('home preferences', () => {
  it('renders date and the default greeting independently of the clock', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 29, 9, 30));
    const html = renderToStaticMarkup(
      <Clock
        language="en"
        hour12={false}
        showClock={false}
        showDate
        showLunar={false}
        showGreeting
      />,
    );
    expect(html).not.toContain('<time');
    expect(html).toContain('9/29');
    expect(html).toContain('早上好，开启新的一天');
    const hidden = renderToStaticMarkup(
      <Clock
        language="en"
        hour12={false}
        showClock
        showDate={false}
        showLunar={false}
        showGreeting={false}
      />,
    );
    expect(hidden).toContain('<time');
    expect(hidden).not.toContain('<p');
  });

  it('uses a valid private engine when its inherited engine list changes', async () => {
    const state = createInitialState();
    applyCommand(state, {
      type: 'settings',
      spaceId: 'private',
      patch: { searchEngine: 'google' },
    });
    applyCommand(state, {
      type: 'settings',
      spaceId: 'normal',
      patch: {
        searchEngines: state.normalSettings.searchEngines.filter((e) => e.id !== 'google'),
      },
    });
    expect(effectiveSettings(state, 'private').searchEngine).toBe('bing');
    expect(rayStateSchema.safeParse(state).success).toBe(true);
    const backup = await createBackup(state, new Map(), 'private');
    expect(backup.spaces.private).toMatchObject({
      protected: false,
      payload: { settings: { searchEngine: 'bing' } },
    });
  });

  it('allows a private engine list with a different default and resets the pair together', () => {
    const state = createInitialState();
    applyCommand(state, {
      type: 'settings',
      spaceId: 'private',
      patch: {
        searchEngines: [{ id: 'custom', name: 'Custom', url: 'https://example.com/?q=%s' }],
        searchEngine: 'custom',
      },
    });
    applyCommand(state, { type: 'reset-private-setting', keys: ['searchEngine'] });
    expect(effectiveSettings(state, 'private').searchEngine).toBe('custom');
    expect(rayStateSchema.safeParse(state).success).toBe(true);
    applyCommand(state, { type: 'reset-private-setting', keys: ['searchEngines'] });
    expect(effectiveSettings(state, 'private').searchEngine).toBe('bing');
    expect(state.privateSettingOverrides).toEqual({});
  });

  it('can unlock private settings after an inherited engine was deleted while locked', async () => {
    const repo = createRepository(crypto.randomUUID());
    await repo.update((state) =>
      applyCommand(state, {
        type: 'settings',
        spaceId: 'private',
        patch: { searchEngine: 'google' },
      }),
    );
    await repo.protectPrivate('settings-test-password');
    await repo.update((state) =>
      applyCommand(state, {
        type: 'settings',
        spaceId: 'normal',
        patch: {
          searchEngines: state.normalSettings.searchEngines.filter((e) => e.id !== 'google'),
        },
      }),
    );
    const state = await repo.unlockPrivate('settings-test-password');
    expect(effectiveSettings(state, 'private').searchEngine).toBe('bing');
    await repo.close();
  });

  it('restores the complete private icon size in one transaction without changing normal settings', async () => {
    const repo = createRepository(crypto.randomUUID());
    try {
      await repo.update((state) => {
        applyCommand(state, {
          type: 'settings',
          spaceId: 'normal',
          patch: { cardSize: 120, iconSizeRatio: 0.5 },
        });
        applyCommand(state, {
          type: 'settings',
          spaceId: 'private',
          patch: { cardSize: 150, iconSizeRatio: 0.6, iconSpacing: 32 },
        });
      });
      const before = await repo.read();
      expect(effectiveSettings(before, 'private').cardSize).toBe(150);
      expect(effectiveSettings(before, 'private').iconSizeRatio).toBe(0.6);
      const restored = await repo.update((state) =>
        applyCommand(state, {
          type: 'reset-private-setting',
          keys: ['cardSize', 'iconSizeRatio'],
        }),
      );
      expect(restored.revision).toBe(before.revision + 1);
      expect(restored.normalSettings).toEqual(before.normalSettings);
      expect(restored.privateSettingOverrides).toEqual({ iconSpacing: 32 });
      expect(effectiveSettings(restored, 'private')).toMatchObject({
        cardSize: 120,
        iconSizeRatio: 0.5,
        iconSpacing: 32,
      });
      const reloaded = await repo.read();
      expect(reloaded.privateSettingOverrides).toEqual({ iconSpacing: 32 });
      expect(reloaded.normalSettings).toEqual(before.normalSettings);
    } finally {
      await repo.close();
    }
  });
});
