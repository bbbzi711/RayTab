import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncBusyError, synchronizeAutomatically } from '../../src/sync/core/engine';

vi.mock('../../src/sync/core/engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/sync/core/engine')>()),
  synchronizeAutomatically: vi.fn(),
}));

describe('background synchronization', () => {
  const installed = vi.fn<(listener: () => void) => void>();
  const startup = vi.fn<(listener: () => void) => void>();
  const alarm = vi.fn<(listener: (alarm: { name: string }) => void) => void>();
  const createAlarm = vi.fn().mockResolvedValue(undefined);

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(synchronizeAutomatically).mockReset().mockResolvedValue(undefined);
    vi.stubGlobal('defineBackground', (main: () => void) => ({ main }));
    vi.stubGlobal('browser', {
      runtime: { onInstalled: { addListener: installed }, onStartup: { addListener: startup } },
      commands: { onCommand: { addListener: vi.fn() } },
      alarms: { create: createAlarm, onAlarm: { addListener: alarm } },
    });
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const entrypoint = await import('../../src/entrypoints/background');
    entrypoint.default.main();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('schedules synchronization on installation and startup', () => {
    for (const listener of [installed, startup]) {
      createAlarm.mockClear();
      listener.mock.calls[0][0]();
      expect(createAlarm).toHaveBeenCalledWith('raytab-sync', { periodInMinutes: 15 });
    }
  });

  it('uses the locked automatic sync entry only for the synchronization alarm', () => {
    alarm.mock.calls[0][0]({ name: 'another-alarm' });
    expect(synchronizeAutomatically).not.toHaveBeenCalled();
    alarm.mock.calls[0][0]({ name: 'raytab-sync' });
    expect(synchronizeAutomatically).toHaveBeenCalledOnce();
  });

  it('skips an occupied sync lock without treating contention as a sync failure', async () => {
    vi.mocked(synchronizeAutomatically).mockRejectedValueOnce(new SyncBusyError());
    alarm.mock.calls[0][0]({ name: 'raytab-sync' });
    await Promise.resolve();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('reports automatic sync failures without logging sensitive error details', async () => {
    vi.mocked(synchronizeAutomatically).mockRejectedValueOnce(new Error('sensitive-details'));
    alarm.mock.calls[0][0]({ name: 'raytab-sync' });
    await Promise.resolve();
    expect(console.error).toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('sensitive-details');
  });
});
