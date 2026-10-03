import { SyncBusyError, synchronizeAutomatically } from '@/sync/core/engine';

export default defineBackground(() => {
  const ensureSyncAlarm = () => void browser.alarms.create('raytab-sync', { periodInMinutes: 15 });
  browser.runtime.onInstalled.addListener(() => {
    console.info('RayTab is ready.');
    void browser.storage.local.remove('raytab-sync-lease').catch(() => {
      console.error('RayTab could not remove the obsolete sync lease.');
    });
    ensureSyncAlarm();
  });
  browser.runtime.onStartup.addListener(ensureSyncAlarm);
  browser.commands.onCommand.addListener((command) => {
    if (command === 'open-raytab')
      void browser.tabs.create({ url: browser.runtime.getURL('/newtab.html') });
  });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== 'raytab-sync') return;
    void synchronizeAutomatically().catch((error: unknown) => {
      if (error instanceof SyncBusyError) return;
      console.error('RayTab automatic sync failed. Check the sync status in settings.');
    });
  });
});
