import type { Page, Locator } from '@playwright/test';
import type { RayState } from '../src/storage/model';
import { expect } from './fixtures';

export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
export async function openSettings(page: Page, category: string) {
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '设置', exact: true });
  await dialog.getByRole('button', { name: category, exact: true }).click();
  return dialog;
}

export async function failNextWrite(page: Page) {
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    let pending = true;
    IDBDatabase.prototype.transaction = function (
      this: IDBDatabase,
      ...args: Parameters<typeof original>
    ) {
      if (pending && args[1] === 'readwrite') {
        pending = false;
        throw new DOMException('E2E injected write failure', 'QuotaExceededError');
      }
      return Reflect.apply(original, this, args);
    };
  });
}

export async function storedState(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('raytab-v11');
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
  });
}

export async function settle(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await Promise.allSettled(document.getAnimations().map((animation) => animation.finished));
  });
}
export async function noHorizontalOverflow(element: Locator) {
  expect(await element.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
}

export async function savedIcon(page: Page, title: string) {
  return page.evaluate(async (title) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('raytab-v11');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const state = await new Promise<RayState>((resolve, reject) => {
        const request = db.transaction('state').objectStore('state').get('current');
        request.onsuccess = () => resolve(request.result as RayState);
        request.onerror = () => reject(request.error);
      });
      const site = state.spaces.normal.sites.find((item) => item.title === title);
      if (!site || !('resourceId' in site.icon) || !site.icon.resourceId)
        throw new Error(`Expected a saved image for ${title}`);
      const resourceId = site.icon.resourceId;
      const blob = await new Promise<Blob>((resolve, reject) => {
        const request = db.transaction('resources').objectStore('resources').get(resourceId);
        request.onsuccess = () =>
          request.result ? resolve(request.result) : reject(new Error('Missing saved icon'));
        request.onerror = () => reject(request.error);
      });
      return { icon: site.icon, type: blob.type, text: await blob.text() };
    } finally {
      db.close();
    }
  }, title);
}
