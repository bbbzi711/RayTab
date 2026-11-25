import { useEffect } from 'react';
import { listenForAutomaticSync } from './unlocked-page';

export function useUnlockedSync(unlocked: boolean) {
  useEffect(() => {
    if (!unlocked || typeof browser === 'undefined' || !browser.runtime?.id) return;
    let active = true;
    const sync = () => {
      void import('./core/engine')
        .then(async ({ synchronizeAutomatically, SyncBusyError }) => {
          if (!active) return;
          try {
            await synchronizeAutomatically({ afterUnlock: true });
          } catch (error) {
            if (!(error instanceof SyncBusyError)) throw error;
          }
        })
        .catch(() =>
          console.error('RayTab automatic sync failed. Check the sync status in settings.'),
        );
    };
    const stop = listenForAutomaticSync(sync);
    sync();
    return () => {
      active = false;
      stop();
    };
  }, [unlocked]);
}
