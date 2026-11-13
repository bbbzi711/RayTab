import type { Page } from '@playwright/test';

import { addSite, expect, test } from '../fixtures';
import { cacheInfo } from '../storage/inspect';
import { paintedArtwork } from '../artwork';
import { addGroup, encryptGroup, unlockGroup } from '../helpers';
import { RAY_DATABASE_NAME } from '../../src/storage/connection';

async function wallpaperSettings(page: Page, source: 'online' | 'local' = 'online') {
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const settings = page.getByRole('dialog', { name: '设置', exact: true });
  await settings.getByRole('tab', { name: '主题壁纸', exact: true }).click();
  await settings.getByRole('button', { name: '更换壁纸', exact: true }).click();
  await settings.getByRole('combobox', { name: '壁纸来源', exact: true }).click();
  await page.getByRole('option', { name: '自定义', exact: true }).click();
  await settings
    .getByRole('button', { name: source === 'online' ? '图片网址' : '上传图片', exact: true })
    .click();
  return settings;
}

test('在线壁纸缓存先于 React 显示，离线重载不请求图片，换图失败保留旧壁纸', async ({
  newTab,
  context,
}) => {
  const url = 'https://wallpaper-acceptance.example.test/current.svg';
  let requests = 0;
  await context.route(url, (route) => {
    requests++;
    return route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800"><rect width="1280" height="800" fill="#a4c9dc"/></svg>',
    });
  });
  const settings = await wallpaperSettings(newTab);
  await settings.getByLabel('在线壁纸地址', { exact: true }).fill(url);
  await settings.getByRole('button', { name: '使用在线壁纸', exact: true }).click();
  await expect
    .poll(() => cacheInfo(newTab))
    .toEqual({ source: url, color: '#a4c9dc', hasBlob: true });
  const overlay = Number(
    await settings
      .getByRole('slider', { name: '壁纸遮罩', exact: true })
      .getAttribute('aria-valuenow'),
  );
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  await newTab.addInitScript(() => {
    const evidence = { beforeReact: false, fullyVisible: false };
    Object.assign(window, { wallpaperStartupEvidence: evidence });
    const observer = new MutationObserver(() => {
      const image = document.querySelector<HTMLElement>('[data-testid="wallpaper-image"]');
      if (
        image &&
        getComputedStyle(image).backgroundImage !== 'none' &&
        !document.getElementById('root')?.childElementCount
      ) {
        evidence.beforeReact = true;
        evidence.fullyVisible =
          image.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) &&
          Number(getComputedStyle(image).opacity) >= 0.99;
      }
    });
    observer.observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['style'],
    });
  });
  await context.setOffline(true);
  await newTab.reload();
  await expect(newTab.getByRole('button', { name: '设置', exact: true })).toBeVisible();
  expect(await newTab.evaluate(() => Reflect.get(window, 'wallpaperStartupEvidence'))).toEqual({
    beforeReact: true,
    fullyVisible: true,
  });
  await expect(newTab.getByTestId('wallpaper')).toHaveCSS('background-color', 'rgb(164, 201, 220)');
  const visibleColor: [number, number, number] = [164, 201, 220];
  visibleColor.forEach((channel, index) => {
    visibleColor[index] = Math.round(channel * (1 - overlay));
  });
  // Observe what the user sees: a covering app layer must not hide the restored wallpaper.
  expect((await paintedArtwork(newTab.locator('body'), visibleColor)).coverage).toBeGreaterThan(
    0.25,
  );
  expect(requests).toBe(1);
  const previous = await newTab
    .getByTestId('wallpaper-image')
    .evaluate((element: HTMLElement) => getComputedStyle(element).backgroundImage);
  await context.setOffline(false);
  await context.route('https://wallpaper-acceptance.example.test/failure.svg', (route) =>
    route.abort(),
  );
  const edit = await wallpaperSettings(newTab);
  await edit
    .getByLabel('在线壁纸地址', { exact: true })
    .fill('https://wallpaper-acceptance.example.test/failure.svg');
  await edit.getByRole('button', { name: '使用在线壁纸', exact: true }).click();
  await expect(
    newTab.getByText('壁纸加载失败，请检查图片地址或网络。', { exact: true }),
  ).toBeVisible();
  expect(
    await newTab
      .getByTestId('wallpaper-image')
      .evaluate((element: HTMLElement) => getComputedStyle(element).backgroundImage),
  ).toBe(previous);
  expect(await cacheInfo(newTab)).toEqual({ source: url, color: '#a4c9dc', hasBlob: true });
  await edit.getByRole('button', { name: '关闭', exact: true }).click();
  await context.setOffline(true);
  await newTab.reload();
  await expect(newTab.getByRole('button', { name: '设置', exact: true })).toBeVisible();
  await expect(newTab.getByTestId('wallpaper')).toHaveCSS('background-color', 'rgb(164, 201, 220)');
  expect(await cacheInfo(newTab)).toEqual({ source: url, color: '#a4c9dc', hasBlob: true });
});

test('壁纸显示成功但缓存写入失败时明确通知，重试后才算离线保存成功', async ({
  newTab,
  context,
}) => {
  const url = 'https://wallpaper-cache-failure.example.test/current.svg';
  await context.route(url, (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800"><rect width="1280" height="800" fill="#a4c9dc"/></svg>',
    }),
  );
  await newTab.evaluate((targetUrl) => {
    const put = IDBObjectStore.prototype.put;
    const fault = { blocked: true, attempts: 0 };
    Reflect.set(window, 'wallpaperCacheFault', fault);
    IDBObjectStore.prototype.put = function (
      this: IDBObjectStore,
      ...args: Parameters<typeof put>
    ) {
      const value: unknown = args[0];
      if (
        this.name === 'wallpapers' &&
        typeof value === 'object' &&
        value !== null &&
        'source' in value &&
        value.source === targetUrl
      ) {
        fault.attempts++;
        // A quota failure persists until storage becomes writable again. A single
        // rejected put can be retried by previews, focus refresh or another render.
        if (fault.blocked) throw new DOMException('Cache quota fixture', 'QuotaExceededError');
      }
      return Reflect.apply(put, this, args);
    };
  }, url);
  const settings = await wallpaperSettings(newTab);
  await settings.getByLabel('在线壁纸地址', { exact: true }).fill(url);
  await settings.getByRole('button', { name: '使用在线壁纸', exact: true }).click();
  await expect(newTab.getByTestId('wallpaper')).toHaveCSS('background-color', 'rgb(164, 201, 220)');
  await expect(
    newTab.getByText('壁纸已显示，但离线缓存保存失败，重开时可能需要联网。', { exact: true }),
  ).toBeVisible();
  expect((await cacheInfo(newTab))?.source).not.toBe(url);
  const attempts = () =>
    newTab.evaluate(() => {
      const fault: unknown = Reflect.get(window, 'wallpaperCacheFault');
      return fault && typeof fault === 'object' && 'attempts' in fault ? Number(fault.attempts) : 0;
    });
  const failedAttempts = await attempts();
  await newTab.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(attempts).toBeGreaterThan(failedAttempts);
  expect((await cacheInfo(newTab))?.source).not.toBe(url);
  await newTab.evaluate(() => {
    const fault: unknown = Reflect.get(window, 'wallpaperCacheFault');
    if (!fault || typeof fault !== 'object') throw new Error('Missing cache fault fixture');
    Reflect.set(fault, 'blocked', false);
  });
  await settings.getByRole('tab', { name: '时间日期', exact: true }).click();
  await settings.getByRole('switch', { name: '显示时钟', exact: true }).click();
  await expect
    .poll(() => cacheInfo(newTab))
    .toEqual({ source: url, color: '#a4c9dc', hasBlob: true });
});

test('全局壁纸跨普通和加密分组一致，上传只存一份且启动缓存不含私密网站', async ({
  newTab,
  context,
}) => {
  const settings = await wallpaperSettings(newTab, 'local');
  await settings.getByLabel('本地壁纸', { exact: true }).setInputFiles({
    name: 'wallpaper.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800"><rect width="1280" height="800" fill="#82b89b"/></svg>',
    ),
  });
  await settings.getByRole('button', { name: '使用本地壁纸', exact: true }).click();
  await expect
    .poll(() => cacheInfo(newTab))
    .toMatchObject({ color: expect.stringMatching(/^#[\da-f]{6}$/), hasBlob: false });
  const normal = await cacheInfo(newTab);
  expect(normal?.source).toMatch(/^resource:/);
  await expect(settings.getByLabel('本地壁纸', { exact: true })).toHaveValue('');
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  const group = '全局壁纸加密验收组';
  const password = 'global-wallpaper-password';
  await addGroup(newTab, group);
  await encryptGroup(newTab, group, password);
  await unlockGroup(newTab, group, password);
  await addSite(
    newTab,
    '壁纸不能泄漏的私密网站',
    'https://private-wallpaper-site.example.test/secret',
  );
  expect(await cacheInfo(newTab)).toEqual(normal);
  await context.route('https://global-wallpaper.example.test/shared.svg', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800"><rect width="1280" height="800" fill="#e78f86"/></svg>',
    }),
  );
  // The user explicitly selected global appearance, including changes made here.
  const sharedSettings = await wallpaperSettings(newTab);
  await sharedSettings
    .getByLabel('在线壁纸地址', { exact: true })
    .fill('https://global-wallpaper.example.test/shared.svg');
  await sharedSettings.getByRole('button', { name: '使用在线壁纸', exact: true }).click();
  await expect(newTab.getByTestId('wallpaper')).toHaveCSS('background-color', 'rgb(231, 143, 134)');
  await expect
    .poll(() => cacheInfo(newTab))
    .toMatchObject({
      source: 'https://global-wallpaper.example.test/shared.svg',
      hasBlob: true,
    });
  const globalCache = await cacheInfo(newTab);
  await sharedSettings.getByRole('button', { name: '关闭', exact: true }).click();
  await newTab.getByRole('button', { name: '主页', exact: true }).click();
  await expect(newTab.getByTestId('wallpaper')).toHaveCSS('background-color', 'rgb(231, 143, 134)');
  expect(await cacheInfo(newTab)).toEqual(globalCache);
  await newTab.reload();
  await expect(newTab.getByTestId('wallpaper')).toHaveCSS('background-color', 'rgb(231, 143, 134)');
  await expect(
    newTab.getByRole('link', { name: '壁纸不能泄漏的私密网站', exact: true }),
  ).not.toBeVisible();
  const startup = await newTab.evaluate(async (databaseName) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
        const request = db.transaction('wallpapers').objectStore('wallpapers').getAllKeys();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return { keys, local: Object.values(localStorage).join('\n') };
    } finally {
      db.close();
    }
  }, RAY_DATABASE_NAME);
  expect(startup.keys).toEqual(['current']);
  expect(startup.local).not.toContain('private-wallpaper-site');
  expect(startup.local).not.toContain('壁纸不能泄漏的私密网站');
  expect(startup.local).not.toContain(password);
  await unlockGroup(newTab, group, password);
  await expect(
    newTab.getByRole('link', { name: '壁纸不能泄漏的私密网站', exact: true }),
  ).toHaveAttribute('href', 'https://private-wallpaper-site.example.test/secret');
});
