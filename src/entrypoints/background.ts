import { loadSyncConfig, loadSyncStatus, synchronize } from '@/sync/core/engine';

export default defineBackground(() => {
  const ensureSyncAlarm = () => void browser.alarms.create('raytab-sync', { periodInMinutes: 15 });
  browser.runtime.onInstalled.addListener(() => {
    console.info('RayTab is ready.');
    ensureSyncAlarm();
  });
  browser.runtime.onStartup.addListener(ensureSyncAlarm);
  browser.commands.onCommand.addListener((command) => {
    if (command === 'open-raytab')
      void browser.tabs.create({ url: browser.runtime.getURL('/newtab.html') });
  });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== 'raytab-sync') return;
    void loadSyncConfig()
      .then(async (config) => {
        if (!config?.automatic) return;
        const status = await loadSyncStatus();
        if (status.nextRetryAt && Date.parse(status.nextRetryAt) > Date.now()) return;
        await synchronize('auto');
      })
      .catch(() => {});
  });
});
