import type { Page } from '@playwright/test';
import type { BackupDocument } from '../src/features/backup/backup';
import type { RayState } from '../src/storage/model';
import { expect, test } from './fixtures';

const icon = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="${color}"/></svg>`;

async function storedState(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('raytab-v11');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<RayState>((resolve, reject) => {
        const request = db.transaction('state').objectStore('state').get('current');
        request.onsuccess = () => resolve(request.result as RayState);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  });
}

async function settings(page: Page, category: string) {
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '设置', exact: true });
  await dialog.getByRole('button', { name: category, exact: true }).click();
  return dialog;
}

type ResourceEvidence = { reads: Record<string, number>; created: string[]; revoked: string[] };

async function evidence(page: Page) {
  return page.evaluate(() => {
    const scope = window as Window & { resourceEvidence?: ResourceEvidence };
    if (!scope.resourceEvidence) throw new Error('Resource evidence has not been installed');
    return scope.resourceEvidence;
  });
}

async function prepareResources(page: Page) {
  await page.evaluate(
    async ({ image, wallpaper }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('raytab-v11');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        const tx = db.transaction(['state', 'resources'], 'readwrite');
        const done = new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error);
          tx.onerror = () => reject(tx.error);
        });
        const state = await new Promise<RayState>((resolve, reject) => {
          const request = tx.objectStore('state').get('current');
          request.onsuccess = () => resolve(request.result as RayState);
          request.onerror = () => reject(request.error);
        });
        const site = state.spaces.normal.sites[0];
        state.spaces.normal.sites = ['共享图标一', '共享图标二'].map((title, index) => ({
          ...site,
          id: `shared-site-${index}`,
          title,
          url: `https://shared-${index}.example.test/`,
          icon: { source: 'resource', resourceId: 'shared-icon' },
          order: index,
        }));
        state.spaces.private.sites = [
          {
            ...site,
            id: 'private-resource-site',
            groupId: state.local.activeGroup.private,
            folderId: null,
            title: '私密图片网站',
            url: 'https://private-resource.example.test/',
            icon: { source: 'resource', resourceId: 'private-icon' },
            order: 0,
          },
        ];
        state.normalSettings.background = 'custom';
        state.normalSettings.wallpaperId = 'shared-wallpaper';
        state.normalSettings.onlineWallpaperUrl = undefined;
        state.revision++;
        tx.objectStore('resources').put(
          new Blob([image], { type: 'image/svg+xml' }),
          'shared-icon',
        );
        tx.objectStore('resources').put(
          new Blob([image], { type: 'image/svg+xml' }),
          'private-icon',
        );
        tx.objectStore('resources').put(
          new Blob([wallpaper], { type: 'image/svg+xml' }),
          'shared-wallpaper',
        );
        tx.objectStore('state').put(state, 'current');
        await done;
      } finally {
        db.close();
      }
    },
    { image: icon('#cc3344'), wallpaper: icon('#336699') },
  );
  await page.reload();
  await expect(
    page.getByRole('link', { name: '共享图标一', exact: true }).locator('img'),
  ).toBeVisible();
  await expect(page.locator('.page-background')).toHaveCSS('background-color', 'rgb(51, 102, 153)');
  await page.addInitScript(() => {
    const evidence: ResourceEvidence = { reads: {}, created: [], revoked: [] };
    Object.assign(window, { resourceEvidence: evidence });
    const get = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function (
      this: IDBObjectStore,
      ...args: Parameters<typeof get>
    ) {
      if (this.name === 'resources' && typeof args[0] === 'string')
        evidence.reads[args[0]] = (evidence.reads[args[0]] ?? 0) + 1;
      return Reflect.apply(get, this, args);
    };
    const create = URL.createObjectURL;
    URL.createObjectURL = (...args: Parameters<typeof create>) => {
      const url = Reflect.apply(create, URL, args);
      evidence.created.push(url);
      return url;
    };
    const revoke = URL.revokeObjectURL;
    URL.revokeObjectURL = (...args: Parameters<typeof revoke>) => {
      evidence.revoked.push(args[0]);
      return Reflect.apply(revoke, URL, args);
    };
  });
  await page.reload();
  await expect(
    page.getByRole('link', { name: '共享图标二', exact: true }).locator('img'),
  ).toBeVisible();
  await expect(page.locator('.page-background')).toHaveCSS('background-color', 'rgb(51, 102, 153)');
}

test('首次引导隔离键盘、适应小高度并在保存失败后允许重试', async ({
  page,
  extensionId,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await page.goto(`chrome-extension://${extensionId}/newtab.html`);
  const onboarding = page.getByRole('dialog', {
    name: '从常用网站开始，整理你的浏览入口',
    exact: true,
  });
  await expect(onboarding).toBeVisible();
  await expect(onboarding.getByRole('heading', { level: 1 })).toBeFocused();
  const geometry = await onboarding.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      scrollable: element.scrollHeight > element.clientHeight,
    };
  });
  expect(geometry.top).toBeGreaterThanOrEqual(15);
  expect(geometry.bottom).toBeLessThanOrEqual(465);
  expect(geometry.scrollable).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('onboarding-narrow-top.png') });
  for (const key of ['Shift+Tab', 'Tab', 'Tab', 'Shift+Tab']) {
    await page.keyboard.press(key);
    expect(await onboarding.evaluate((element) => element.contains(document.activeElement))).toBe(
      true,
    );
  }
  await page.keyboard.press('Escape');
  await page.mouse.click(2, 2);
  await expect(onboarding).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    let pending = true;
    IDBObjectStore.prototype.put = function (
      this: IDBObjectStore,
      ...args: Parameters<typeof put>
    ) {
      if (pending && this.name === 'state') {
        pending = false;
        throw new DOMException('Onboarding save fixture', 'QuotaExceededError');
      }
      return Reflect.apply(put, this, args);
    };
  });
  const finish = onboarding.getByRole('button', { name: '进入首页', exact: true });
  await finish.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('onboarding-narrow-action.png') });
  await finish.click();
  await expect(onboarding.getByRole('alert')).toBeVisible();
  expect((await storedState(page)).local.onboardingComplete).toBe(false);
  await expect(finish).toBeEnabled();
  await finish.click();
  await expect(onboarding).not.toBeVisible();
  await page.reload();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await storedState(page)).local.onboardingComplete).toBe(true);
});

test('共享资源和上传壁纸在普通保存时保持 URL，跨页同 ID 恢复更新图片字节', async ({
  newTab,
  context,
  extensionId,
}) => {
  await prepareResources(newTab);
  const first = newTab.getByRole('link', { name: '共享图标一', exact: true }).locator('img');
  const second = newTab.getByRole('link', { name: '共享图标二', exact: true }).locator('img');
  const original = await first.getAttribute('src');
  expect(await second.getAttribute('src')).toBe(original);
  const wallpaper = await newTab
    .locator('.page-background-image')
    .evaluate((element: HTMLElement) => element.style.backgroundImage);
  const baseline = await evidence(newTab);
  expect(baseline.reads['shared-icon']).toBe(1);
  expect(baseline.reads['shared-wallpaper']).toBe(1);
  const widgets = await settings(newTab, '搜索与时钟');
  await widgets.getByRole('switch', { name: '显示时钟', exact: true }).click();
  await expect.poll(async () => (await storedState(newTab)).normalSettings.showClock).toBe(false);
  await newTab.evaluate(() => window.dispatchEvent(new Event('focus')));
  await widgets.getByRole('button', { name: '关闭', exact: true }).click();
  expect(await first.getAttribute('src')).toBe(original);
  expect(await second.getAttribute('src')).toBe(original);
  expect(
    await newTab
      .locator('.page-background-image')
      .evaluate((element: HTMLElement) => element.style.backgroundImage),
  ).toBe(wallpaper);
  expect(await evidence(newTab)).toEqual(baseline);

  const state = await storedState(newTab);
  const document: BackupDocument = {
    format: 'raytab-backup',
    version: 3,
    createdAt: new Date().toISOString(),
    spaces: {
      normal: {
        data: state.spaces.normal,
        settings: state.normalSettings,
        resources: [
          {
            id: 'shared-icon',
            type: 'image/svg+xml',
            data: Buffer.from(icon('#22aa66')).toString('base64'),
          },
          {
            id: 'shared-wallpaper',
            type: 'image/svg+xml',
            data: Buffer.from(icon('#448855')).toString('base64'),
          },
        ],
      },
    },
  };
  const other = await context.newPage();
  await other.goto(`chrome-extension://${extensionId}/newtab.html`);
  const restore = await settings(other, '数据与备份');
  await restore.getByRole('button', { name: '恢复备份', exact: true }).click();
  await restore.getByLabel('备份文件', { exact: true }).setInputFiles({
    name: 'same-id-new-bytes.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(document)),
  });
  await restore.getByRole('button', { name: '预览备份', exact: true }).click();
  await restore.getByRole('combobox', { name: '恢复方式', exact: true }).click();
  await other.getByRole('option', { name: '替换恢复', exact: true }).click();
  await restore.getByRole('button', { name: '替换恢复', exact: true }).click();
  await other
    .getByRole('alertdialog')
    .getByRole('button', { name: '替换恢复', exact: true })
    .click();
  await expect(restore.getByText('备份内容预览', { exact: true })).not.toBeVisible();
  await expect(first).not.toHaveAttribute('src', original!);
  expect(await second.getAttribute('src')).toBe(await first.getAttribute('src'));
  expect(
    await first.evaluate(async (element: HTMLImageElement) => (await fetch(element.src)).text()),
  ).toBe(icon('#22aa66'));
  await expect(newTab.locator('.page-background')).toHaveCSS(
    'background-color',
    'rgb(68, 136, 85)',
  );
  await newTab.reload();
  await expect(first).toBeVisible();
  expect(
    await first.evaluate(async (element: HTMLImageElement) => (await fetch(element.src)).text()),
  ).toBe(icon('#22aa66'));
  await expect(newTab.locator('.page-background')).toHaveCSS(
    'background-color',
    'rgb(68, 136, 85)',
  );
});

test('私密空间锁定后释放共享缓存中的图片 URL', async ({ newTab }) => {
  await prepareResources(newTab);
  const general = await settings(newTab, '通用');
  await general.getByText('设置密码保护', { exact: true }).click();
  await general.getByLabel('密码', { exact: true }).fill('private-resource-test');
  await general.getByRole('button', { name: '启用密码保护', exact: true }).click();
  await expect(general.getByText(/私密空间已加密并锁定/)).toBeVisible();
  await general.getByRole('button', { name: '关闭', exact: true }).click();
  await newTab.getByRole('button', { name: '私密空间', exact: true }).click();
  const unlock = newTab.getByRole('dialog', { name: '解锁私密空间', exact: true });
  await unlock.getByLabel('输入私密空间密码', { exact: true }).fill('private-resource-test');
  await unlock.getByRole('button', { name: '解锁', exact: true }).click();
  const image = newTab.getByRole('link', { name: '私密图片网站', exact: true }).locator('img');
  await expect(image).toBeVisible();
  const url = await image.getAttribute('src');
  expect(url).toMatch(/^blob:/);
  await newTab.getByRole('button', { name: '普通空间', exact: true }).click();
  await expect(image).not.toBeVisible();
  await expect
    .poll(async () => (await evidence(newTab)).revoked.filter((entry) => entry === url).length)
    .toBe(1);
  expect(
    await newTab.evaluate(async (target) => {
      try {
        await fetch(target!);
        return true;
      } catch {
        return false;
      }
    }, url),
  ).toBe(false);
  await newTab.getByRole('button', { name: '私密空间', exact: true }).click();
  await expect(unlock).toBeVisible();
  await expect(unlock.getByLabel('输入私密空间密码', { exact: true })).toHaveValue('');
});
