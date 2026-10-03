import type { Page } from '@playwright/test';
import { addSite, expect, test } from './fixtures';
import regionalApps from '../scripts/app-brand-sources.json' with { type: 'json' };
import brandIndex from '../src/features/navigation/assets/brand-index.json' with { type: 'json' };

test('国内常用网站本地高清图标覆盖，贴吧编辑与保存离线可用', async ({ newTab, context }) => {
  test.setTimeout(60_000);
  const apps = regionalApps.map((app) => ({
    ...app,
    title: app.hostname === 'aliyundrive.com' ? `${app.title}旧域名` : app.title,
  }));
  await context.setOffline(true);
  for (const app of apps) {
    const asset = brandIndex.find((entry) => entry.hostname === app.hostname && entry.tile)!;
    await addSite(newTab, app.title, `https://${app.hostname}`);
    const image = newTab.getByRole('link', { name: app.title, exact: true }).last().locator('img');
    await expect(image).toBeVisible();
    expect(
      await image.evaluate(async (image: HTMLImageElement) => {
        await image.decode();
        return {
          width: image.naturalWidth,
          height: image.naturalHeight,
          local: image.src.startsWith(location.origin),
        };
      }),
    ).toEqual({ width: asset.width, height: asset.height, local: true });
  }
  await newTab.reload();
  for (const app of apps)
    await expect(
      newTab.getByRole('link', { name: app.title, exact: true }).last().locator('img'),
    ).toBeVisible();
  await newTab.screenshot({
    animations: 'disabled',
    path: 'artifacts/acceptance/regional-brand-icons.png',
    fullPage: true,
  });
  await newTab.getByRole('link', { name: '贴吧', exact: true }).click({ button: 'right' });
  await newTab.getByRole('menuitem', { name: '编辑网站', exact: true }).click();
  const editor = newTab.getByRole('dialog', { name: '编辑网站', exact: true });
  await expect(editor.locator('.site-edit-preview img')).toBeVisible();
  await expect(editor.locator('.site-edit-palette')).toHaveCount(0);
  await editor.getByRole('button', { name: '获取网站图标', exact: true }).click();
  await expect(editor.getByRole('alert')).toHaveCount(0);
  await newTab.screenshot({
    animations: 'disabled',
    path: 'artifacts/acceptance/tieba-editor.png',
  });
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor).not.toBeVisible();
  await newTab.reload();
  await expect(
    newTab.getByRole('link', { name: '贴吧', exact: true }).locator('img'),
  ).toBeVisible();
});

async function wallpaperSettings(page: Page) {
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const settings = page.getByRole('dialog', { name: '设置', exact: true });
  await settings.getByRole('button', { name: '壁纸与主题', exact: true }).click();
  return settings;
}

async function cacheInfo(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('raytab-v11');
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
  });
}

test('公共图标服务在目标站不可达时取回原图，社区彩色素材与保存图标离线显示', async ({
  newTab,
  context,
}) => {
  const domain = 'icons-public-acceptance.com';
  const calls: string[] = [];
  await context.route(`https://${domain}/**`, (route) => route.abort());
  await context.route('https://favicon.vemetric.com/**', (route) => {
    calls.push(route.request().url());
    const metadata = new URL(route.request().url()).searchParams.has('response');
    return route.fulfill({
      contentType: metadata ? 'application/json' : 'image/svg+xml',
      body: metadata
        ? JSON.stringify({
            source: 'link-tag',
            width: 24,
            height: 24,
            format: 'svg',
            sourceUrl: `https://${domain}/mark.svg`,
          })
        : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#4285f4" d="M2 2h10v20H2z"/><path fill="#ea4335" d="M12 2h10v20H12z"/></svg>',
    });
  });
  await newTab.getByRole('button', { name: '添加网站', exact: true }).click();
  const editor = newTab.getByRole('dialog', { name: '添加网站', exact: true });
  await editor
    .getByLabel('网址', { exact: true })
    .fill(`https://${domain}/account?token=private#profile`);
  await editor.getByRole('button', { name: '获取网站图标', exact: true }).click();
  await expect(editor.locator('.site-edit-preview img')).toBeVisible();
  await editor.getByLabel('名称', { exact: true }).fill('公共服务原图');
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor).not.toBeVisible();
  expect(calls).toEqual([
    `https://favicon.vemetric.com/${domain}?response=json`,
    `https://favicon.vemetric.com/${domain}`,
  ]);
  await addSite(newTab, 'Figma', 'https://figma.com');
  await addSite(newTab, 'Claude', 'https://claude.ai');
  await addSite(newTab, 'ChatGPT', 'https://chatgpt.com');
  await addSite(newTab, 'TikTok', 'https://douyin.com');
  await addSite(newTab, 'YouTube Music', 'https://music.youtube.com');
  await context.setOffline(true);
  await newTab.reload();
  const saved = newTab.getByRole('link', { name: '公共服务原图', exact: true }).locator('img');
  await expect(saved).toBeVisible();
  expect(
    await saved.evaluate(async (image: HTMLImageElement) => {
      await image.decode();
      return image.naturalWidth;
    }),
  ).toBe(256);
  for (const name of ['Figma', 'Claude', 'ChatGPT', 'TikTok', 'YouTube Music']) {
    const icon = newTab.getByRole('link', { name, exact: true }).locator('img');
    await expect(icon).toBeVisible();
    expect(
      await icon.evaluate(async (image: HTMLImageElement) => {
        await image.decode();
        return new URL(image.src).pathname;
      }),
    ).toMatch(/^\/brand-icons\/[a-f\d]+\.svg$/);
  }
  expect(calls).toHaveLength(2);
  await expect(
    newTab.getByRole('link', { name: 'TikTok', exact: true }).locator('.site-icon-frame'),
  ).toHaveCSS('background-color', 'rgb(22, 24, 35)');
  await newTab.screenshot({
    path: 'artifacts/acceptance/community-offline-icons.png',
    animations: 'disabled',
  });
});

test('私密空间直接读取 PWA 高清图标，不向公共服务发送域名', async ({ newTab, context }) => {
  let publicRequests = 0;
  const directRequests: string[] = [];
  await context.route('https://favicon.vemetric.com/**', (route) => {
    publicRequests++;
    return route.abort();
  });
  await context.route('https://private-icons-acceptance.com/**', (route) => {
    const pathname = new URL(route.request().url()).pathname;
    directRequests.push(pathname);
    if (pathname === '/app.webmanifest')
      return route.fulfill({
        contentType: 'application/manifest+json',
        body: JSON.stringify({
          icons: [
            { src: '/mark.svg', sizes: 'any', type: 'image/svg+xml' },
            { src: 'https://user:secret@other.example.com/icon.svg', sizes: 'any' },
          ],
        }),
      });
    if (pathname === '/mark.svg')
      return route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#4285f4"/></svg>',
      });
    return route.fulfill({
      contentType: 'text/html',
      body: '<html><head><title>本地 PWA 图标</title><link rel="manifest" href="/app.webmanifest"><link rel="icon" href="/favicon.ico" sizes="16x16"></head></html>',
    });
  });
  await newTab.getByRole('button', { name: '私密空间', exact: true }).click();
  await newTab.getByRole('button', { name: '添加网站', exact: true }).click();
  const editor = newTab.getByRole('dialog', { name: '添加网站', exact: true });
  await editor
    .getByLabel('网址', { exact: true })
    .fill('https://private-icons-acceptance.com/account?token=secret');
  await editor.getByRole('button', { name: '获取网站图标', exact: true }).click();
  await expect(editor.getByLabel('名称', { exact: true })).toHaveValue('本地 PWA 图标');
  await expect(editor.locator('.site-edit-preview img')).toBeVisible();
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor).not.toBeVisible();
  expect(directRequests).toEqual(['/account', '/app.webmanifest', '/mark.svg']);
  expect(publicRequests).toBe(0);
});

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
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  await newTab.addInitScript(() => {
    const evidence = { beforeReact: false, opacity: '', transition: '' };
    Object.assign(window, { wallpaperStartupEvidence: evidence });
    const observer = new MutationObserver(() => {
      const image = document.querySelector<HTMLElement>('.page-background-image');
      if (image?.style.backgroundImage && !document.getElementById('root')?.childElementCount) {
        evidence.beforeReact = true;
        evidence.opacity = getComputedStyle(image).opacity;
        evidence.transition = getComputedStyle(image).transitionDuration;
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
    opacity: '1',
    transition: '0s',
  });
  await expect(newTab.locator('.page-background')).toHaveCSS(
    'background-color',
    'rgb(164, 201, 220)',
  );
  await expect(newTab.locator('.app-shell')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  expect(requests).toBe(1);
  const previous = await newTab
    .locator('.page-background-image')
    .evaluate((element: HTMLElement) => element.style.backgroundImage);
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
      .locator('.page-background-image')
      .evaluate((element: HTMLElement) => element.style.backgroundImage),
  ).toBe(previous);
  expect(await cacheInfo(newTab)).toEqual({ source: url, color: '#a4c9dc', hasBlob: true });
  await edit.getByRole('button', { name: '关闭', exact: true }).click();
  await context.setOffline(true);
  await newTab.reload();
  await expect(newTab.getByRole('button', { name: '设置', exact: true })).toBeVisible();
  await expect(newTab.locator('.page-background')).toHaveCSS(
    'background-color',
    'rgb(164, 201, 220)',
  );
  expect(await cacheInfo(newTab)).toEqual({ source: url, color: '#a4c9dc', hasBlob: true });
  await newTab.screenshot({
    path: 'artifacts/acceptance/cached-wallpaper-startup.png',
    animations: 'disabled',
  });
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
  await expect(newTab.locator('.page-background')).toHaveCSS(
    'background-color',
    'rgb(164, 201, 220)',
  );
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
  await settings.getByRole('button', { name: '搜索与时钟', exact: true }).click();
  await settings.getByRole('switch', { name: '显示时钟', exact: true }).click();
  await expect
    .poll(() => cacheInfo(newTab))
    .toEqual({ source: url, color: '#a4c9dc', hasBlob: true });
});

test('上传壁纸只保存一份原图，私密壁纸不会写入普通启动缓存', async ({ newTab, context }) => {
  const settings = await wallpaperSettings(newTab);
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
  await newTab.getByRole('button', { name: '私密空间', exact: true }).click();
  await context.route('https://private-wallpaper.example.test/secret.svg', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800"><rect width="1280" height="800" fill="#e78f86"/></svg>',
    }),
  );
  const privateSettings = await wallpaperSettings(newTab);
  await privateSettings
    .getByLabel('在线壁纸地址', { exact: true })
    .fill('https://private-wallpaper.example.test/secret.svg');
  await privateSettings.getByRole('button', { name: '使用在线壁纸', exact: true }).click();
  await expect(newTab.locator('.page-background')).toHaveCSS(
    'background-color',
    'rgb(231, 143, 134)',
  );
  expect(await cacheInfo(newTab)).toEqual(normal);
  expect(await newTab.evaluate(() => localStorage.getItem('raytab-startup-meta'))).not.toContain(
    'private-wallpaper',
  );
  await privateSettings.getByRole('button', { name: '关闭', exact: true }).click();
  await newTab.getByRole('button', { name: '普通空间', exact: true }).click();
  await expect(newTab.locator('.page-background')).toHaveCSS(
    'background-color',
    `rgb(${normal!.color
      .match(/\w\w/g)!
      .map((channel) => parseInt(channel, 16))
      .join(', ')})`,
  );
});
