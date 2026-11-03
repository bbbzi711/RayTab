import type { Page } from '@playwright/test';
import type { RayState } from '../../src/storage/model';
import { RAY_DATABASE_NAME } from '../../src/storage/connection';

export async function storedState(page: Page) {
  return page.evaluate(async (databaseName) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<RayState>((resolve, reject) => {
        const request = db.transaction('state', 'readonly').objectStore('state').get('current');
        request.onsuccess = () => resolve(request.result as RayState);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }, RAY_DATABASE_NAME);
}

export async function savedNavigation(page: Page, title: string) {
  return page.evaluate(
    async ({ title, databaseName }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        const tx = db.transaction(['state', 'resources'], 'readonly');
        const [state, resources] = await Promise.all([
          new Promise<RayState>((resolve, reject) => {
            const request = tx.objectStore('state').get('current');
            request.onsuccess = () => resolve(request.result as RayState);
            request.onerror = () => reject(request.error);
          }),
          new Promise<IDBValidKey[]>((resolve, reject) => {
            const request = tx.objectStore('resources').getAllKeys();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          }),
        ]);
        const sites = state.spaces.normal.sites.filter((site) => site.title === title);
        return {
          sites,
          resourceCount: resources.length,
          referencedImagesExist: sites.every(
            (site) =>
              !('resourceId' in site.icon) ||
              !site.icon.resourceId ||
              resources.includes(site.icon.resourceId),
          ),
        };
      } finally {
        db.close();
      }
    },
    { title, databaseName: RAY_DATABASE_NAME },
  );
}

export async function seedLargeNavigation(page: Page) {
  await page.evaluate(async (databaseName) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      // This isolated database contains the state created by the extension fixture.
      // Reload below also exercises the application's persisted-state validation.
      const state = await new Promise<RayState>((resolve, reject) => {
        const request = db.transaction('state').objectStore('state').get('current');
        request.onsuccess = () => resolve(request.result as RayState);
        request.onerror = () => reject(request.error);
      });
      const groupId = state.spaces.normal.groups[0].id;
      const template = state.spaces.normal.sites[0];
      state.spaces.normal.folders = Array.from({ length: 100 }, (_, index) => ({
        id: `stress-folder-${index}`,
        groupId,
        name: `批量文件夹 ${index}`,
        order: index,
        createdAt: 0,
        updatedAt: 0,
        changeId: `stress-folder-change-${index}`,
      }));
      state.spaces.normal.sites = Array.from({ length: 1000 }, (_, index) => ({
        ...template,
        id: `stress-site-${index}`,
        changeId: `stress-site-change-${index}`,
        folderId: index < 500 ? null : `stress-folder-${index % 100}`,
        title: `批量网站 ${index}`,
        url: `https://example.test/stress/${index}`,
        icon: { source: 'text', text: 'S' },
        order: index,
      }));
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('state', 'readwrite');
        transaction.objectStore('state').put(state, 'current');
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      db.close();
    }
  }, RAY_DATABASE_NAME);
}

export async function cacheInfo(page: Page) {
  return page.evaluate(async (databaseName) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<{ source: string; color: string; hasBlob: boolean } | undefined>(
        (resolve, reject) => {
          const request = db.transaction('wallpapers').objectStore('wallpapers').get('current');
          request.onsuccess = () =>
            resolve(
              request.result && {
                source: request.result.source,
                color: request.result.color,
                hasBlob: Boolean(request.result.blob),
              },
            );
          request.onerror = () => reject(request.error);
        },
      );
    } finally {
      db.close();
    }
  }, RAY_DATABASE_NAME);
}
