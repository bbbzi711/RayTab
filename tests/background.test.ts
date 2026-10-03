import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncBusyError, synchronizeAutomatically } from '../src/sync/core/engine';

vi.mock('../src/sync/core/engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/sync/core/engine')>()),
  synchronizeAutomatically: vi.fn(),
}));

describe('background synchronization', () => {
  const installed = vi.fn<(listener: () => void) => void>();
  const alarm = vi.fn<(listener: (alarm: { name: string }) => void) => void>();
  const createAlarm = vi.fn().mockResolvedValue(undefined);
  let local: Record<string, unknown>;
  let remove: ReturnType<typeof vi.fn<(key: string) => Promise<void>>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(synchronizeAutomatically).mockReset().mockResolvedValue(undefined);
    local = {
      'raytab-sync-lease': { owner: 'old-page', expiresAt: 1 },
      'raytab-sync-config': { automatic: true },
      'raytab-sync-baseline': { document: 'saved-document', version: 'saved-etag' },
      'raytab-sync-status': { conflicts: ['saved-conflict'] },
    };
    remove = vi.fn(async (key: string) => {
      delete local[key];
    });
    vi.stubGlobal('defineBackground', (main: () => void) => ({ main }));
    vi.stubGlobal('browser', {
      storage: { local: { remove } },
      runtime: { onInstalled: { addListener: installed }, onStartup: { addListener: vi.fn() } },
      commands: { onCommand: { addListener: vi.fn() } },
      alarms: { create: createAlarm, onAlarm: { addListener: alarm } },
    });
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const entrypoint = await import('../src/entrypoints/background');
    entrypoint.default.main();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('removes only the obsolete lease when installed or upgraded', async () => {
    installed.mock.calls[0][0]();
    await Promise.resolve();
    expect(remove).toHaveBeenCalledExactlyOnceWith('raytab-sync-lease');
    expect(local).toEqual({
      'raytab-sync-config': { automatic: true },
      'raytab-sync-baseline': { document: 'saved-document', version: 'saved-etag' },
      'raytab-sync-status': { conflicts: ['saved-conflict'] },
    });
    expect(createAlarm).toHaveBeenCalledWith('raytab-sync', { periodInMinutes: 15 });
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
    expect(local['raytab-sync-status']).toEqual({ conflicts: ['saved-conflict'] });
  });

  it('reports automatic sync failures without logging sensitive error details', async () => {
    vi.mocked(synchronizeAutomatically).mockRejectedValueOnce(new Error('sensitive-details'));
    alarm.mock.calls[0][0]({ name: 'raytab-sync' });
    await Promise.resolve();
    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      'RayTab automatic sync failed. Check the sync status in settings.',
    );
  });

  it('reports upgrade cleanup failure while retaining current sync data', async () => {
    remove.mockRejectedValueOnce(new Error('unavailable'));
    installed.mock.calls[0][0]();
    await Promise.resolve();
    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      'RayTab could not remove the obsolete sync lease.',
    );
    expect(local['raytab-sync-baseline']).toEqual({
      document: 'saved-document',
      version: 'saved-etag',
    });
    expect(local['raytab-sync-status']).toEqual({ conflicts: ['saved-conflict'] });
  });
});
