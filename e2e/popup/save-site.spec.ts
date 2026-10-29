import { deferred, savedIcon } from '../helpers';
import type { BrowserContext, Page } from '@playwright/test';
import type { RayState } from '../../src/storage/model';
import { expect, test } from '../fixtures';

const mark =
  '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" rx="24" fill="#1677ff"/><circle cx="64" cy="64" r="28" fill="white"/></svg>';
const documentWithIcon =
  '<html><head><title>Popup icon fixture</title><link rel="icon" href="/mark.svg" sizes="any"></head></html>';

async function openPopup(context: BrowserContext, extensionId: string) {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.getByLabel('名称', { exact: true })).toBeVisible();
  return popup;
}

async function savedNavigation(page: Page, title: string) {
  return page.evaluate(async (title) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('raytab-v11');
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
  }, title);
}

test('Popup 获取未知网站图标，重复提交只保存一份，离线重载使用本地图片', async ({
  newTab,
  context,
  extensionId,
}) => {
  const domain = 'popup-icons-acceptance.com';
  const url = `https://${domain}/account?token=keep#profile`;
  const requests: string[] = [];
  const providerRequests: string[] = [];
  const iconRequested = deferred();
  const releaseIcon = deferred();
  await context.route(`https://${domain}/**`, async (route) => {
    requests.push(route.request().url());
    if (new URL(route.request().url()).pathname === '/mark.svg') {
      iconRequested.resolve();
      await releaseIcon.promise;
      return route.fulfill({ contentType: 'image/svg+xml', body: mark });
    }
    return route.fulfill({ contentType: 'text/html', body: documentWithIcon });
  });
  await context.route('https://favicon.vemetric.com/**', (route) => {
    providerRequests.push(route.request().url());
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ source: 'default', width: 0, height: 0, format: 'png' }),
    });
  });
  const popup = await openPopup(context, extensionId);
  await popup.getByLabel('名称', { exact: true }).fill('Popup 本地图标');
  await popup.getByLabel('网址', { exact: true }).fill(url);
  await popup.getByRole('button', { name: '添加网站', exact: true }).click();
  try {
    await iconRequested.promise;
    await expect(popup.getByLabel('网址', { exact: true })).toBeDisabled();
    await popup.locator('form').dispatchEvent('submit');
    expect((await savedNavigation(newTab, 'Popup 本地图标')).sites).toHaveLength(0);
  } finally {
    releaseIcon.resolve();
  }
  await expect(popup.locator('.popup-success')).toBeVisible();
  const saved = await savedNavigation(newTab, 'Popup 本地图标');
  expect(saved.sites).toHaveLength(1);
  expect(saved.sites[0]).toMatchObject({
    url,
    icon: { source: 'auto', resourceId: expect.any(String) },
  });
  expect(saved.resourceCount).toBe(1);
  expect(saved.referencedImagesExist).toBe(true);
  expect(providerRequests).toEqual([`https://favicon.vemetric.com/${domain}?response=json`]);
  const requestCount = requests.length;
  await context.setOffline(true);
  await newTab.reload();
  const image = newTab.getByRole('link', { name: 'Popup 本地图标', exact: true }).locator('img');
  await expect(image).toBeVisible();
  expect(
    await image.evaluate(async (image: HTMLImageElement) => {
      await image.decode();
      return { local: image.src.startsWith('blob:'), decoded: image.naturalWidth > 0 };
    }),
  ).toEqual({ local: true, decoded: true });
  expect(await savedIcon(newTab, 'Popup 本地图标')).toMatchObject({
    type: 'image/svg+xml',
    text: mark,
  });
  expect(requests).toHaveLength(requestCount);
  expect(providerRequests).toHaveLength(1);
});

test('Popup 获取失败保留表单，可以重试或明确选择文字占位后添加', async ({
  newTab,
  context,
  extensionId,
}) => {
  let available = false;
  let publicRequests = 0;
  const url = 'https://popup-retry.example.test/path?q=keep#fragment';
  await context.route('https://popup-retry.example.test/**', (route) =>
    available
      ? route.fulfill({
          contentType: route.request().url().endsWith('/mark.svg') ? 'image/svg+xml' : 'text/html',
          body: route.request().url().endsWith('/mark.svg') ? mark : documentWithIcon,
        })
      : route.abort(),
  );
  await context.route('https://favicon.vemetric.com/**', (route) => {
    publicRequests++;
    return route.abort();
  });
  const popup = await openPopup(context, extensionId);
  await popup.getByLabel('名称', { exact: true }).fill('Popup 重试网站');
  await popup.getByLabel('网址', { exact: true }).fill(url);
  const location = await popup.getByLabel('存入位置', { exact: true }).inputValue();
  await popup.getByRole('button', { name: '添加网站', exact: true }).click();
  await expect(popup.getByRole('alert')).toContainText('未能获取网站图标');
  await expect(popup.getByLabel('名称', { exact: true })).toHaveValue('Popup 重试网站');
  await expect(popup.getByLabel('网址', { exact: true })).toHaveValue(url);
  await expect(popup.getByLabel('存入位置', { exact: true })).toHaveValue(location);
  expect((await savedNavigation(newTab, 'Popup 重试网站')).sites).toHaveLength(0);

  available = true;
  await popup.getByRole('button', { name: '添加网站', exact: true }).click();
  await expect(popup.locator('.popup-success')).toBeVisible();
  expect((await savedNavigation(newTab, 'Popup 重试网站')).sites).toHaveLength(1);

  await popup.getByRole('button', { name: '继续添加', exact: true }).click();
  available = false;
  await popup.getByLabel('名称', { exact: true }).fill('Popup 文字占位');
  await popup.getByLabel('网址', { exact: true }).fill(url);
  await popup.getByRole('button', { name: '添加网站', exact: true }).click();
  await expect(popup.getByRole('alert')).toContainText('未能获取网站图标');
  expect((await savedNavigation(newTab, 'Popup 文字占位')).sites).toHaveLength(0);
  await popup.getByRole('button', { name: '以文字占位图标添加', exact: true }).click();
  await expect(popup.locator('.popup-success')).toBeVisible();
  const fallback = await savedNavigation(newTab, 'Popup 文字占位');
  expect(fallback.sites).toHaveLength(1);
  expect(fallback.sites[0].icon).toEqual({ source: 'auto' });
  expect(fallback.resourceCount).toBe(1);
  expect(publicRequests).toBe(0);
  await newTab.reload();
  await expect(newTab.getByRole('link', { name: 'Popup 文字占位', exact: true })).toHaveAttribute(
    'href',
    url,
  );
});

test('Popup 状态写入失败回滚图标资源，离线重试使用草稿且只新增一次', async ({
  newTab,
  context,
  extensionId,
}) => {
  let requests = 0;
  const url = 'https://popup-write-failure.example.test';
  await context.route(`${url}/**`, (route) => {
    requests++;
    return route.fulfill({
      contentType: route.request().url().endsWith('/mark.svg') ? 'image/svg+xml' : 'text/html',
      body: route.request().url().endsWith('/mark.svg') ? mark : documentWithIcon,
    });
  });
  const popup = await openPopup(context, extensionId);
  await popup.getByLabel('名称', { exact: true }).fill('Popup 保存重试');
  await popup.getByLabel('网址', { exact: true }).fill(url);
  await popup.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (
      this: IDBObjectStore,
      ...args: Parameters<typeof original>
    ) {
      if (this.name === 'state' && args[1] === 'current') {
        IDBObjectStore.prototype.put = original;
        throw new DOMException('Popup injected state write failure', 'QuotaExceededError');
      }
      return Reflect.apply(original, this, args);
    };
  });
  await popup.getByRole('button', { name: '添加网站', exact: true }).click();
  await expect(popup.getByRole('alert')).toContainText('Popup injected state write failure');
  await expect(popup.getByLabel('名称', { exact: true })).toHaveValue('Popup 保存重试');
  await expect(popup.getByLabel('网址', { exact: true })).toHaveValue(url);
  const failed = await savedNavigation(newTab, 'Popup 保存重试');
  expect(failed.sites).toHaveLength(0);
  expect(failed.resourceCount).toBe(0);
  const requestCount = requests;
  await context.setOffline(true);
  await popup.getByRole('button', { name: '添加网站', exact: true }).click();
  await expect(popup.locator('.popup-success')).toBeVisible();
  const saved = await savedNavigation(newTab, 'Popup 保存重试');
  expect(saved.sites).toHaveLength(1);
  expect(saved.resourceCount).toBe(1);
  expect(saved.referencedImagesExist).toBe(true);
  expect(requests).toBe(requestCount);
  await newTab.reload();
  await expect(
    newTab.getByRole('link', { name: 'Popup 保存重试', exact: true }).locator('img'),
  ).toBeVisible();
});

test('Popup 收到 pagehide 后，晚到的图标结果不会新增网站或资源', async ({
  newTab,
  context,
  extensionId,
}) => {
  const url = 'https://popup-pagehide.example.test';
  const iconRequested = deferred();
  const releaseIcon = deferred();
  await context.route(`${url}/**`, async (route) => {
    if (route.request().url().endsWith('/mark.svg')) {
      iconRequested.resolve();
      await releaseIcon.promise;
      return route.fulfill({ contentType: 'image/svg+xml', body: mark });
    }
    return route.fulfill({ contentType: 'text/html', body: documentWithIcon });
  });
  const popup = await openPopup(context, extensionId);
  await popup.getByLabel('名称', { exact: true }).fill('Popup 已关闭请求');
  await popup.getByLabel('网址', { exact: true }).fill(url);
  await popup.getByRole('button', { name: '添加网站', exact: true }).click();
  try {
    await iconRequested.promise;
    await popup.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  } finally {
    releaseIcon.resolve();
  }
  await expect(popup.locator('.popup-form button[type="submit"]')).toBeEnabled();
  await expect(popup.locator('.popup-success')).toHaveCount(0);
  const saved = await savedNavigation(newTab, 'Popup 已关闭请求');
  expect(saved.sites).toHaveLength(0);
  expect(saved.resourceCount).toBe(0);
});
