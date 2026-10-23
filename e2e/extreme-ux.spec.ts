import type { Locator, Page } from '@playwright/test';
import type { RayState } from '../src/storage/model';
import { addSite, expect, test } from './fixtures';

async function settle(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await Promise.allSettled(document.getAnimations().map((animation) => animation.finished));
  });
}

async function noHorizontalOverflow(element: Locator) {
  expect(await element.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
}

test('小窗口删除超长名称时确认文字完整换行，取消后保留网站', async ({ newTab }) => {
  const name = 'W'.repeat(80);
  await addSite(newTab, name, 'https://github.com/extreme');
  await newTab.setViewportSize({ width: 320, height: 360 });
  const site = newTab.getByRole('link', { name, exact: true });
  await site.click({ button: 'right' });
  await newTab.getByRole('menuitem', { name: '删除', exact: true }).click();
  const confirmation = newTab.getByRole('alertdialog');
  await settle(newTab);
  await expect(confirmation).toContainText(name);
  await noHorizontalOverflow(confirmation);
  await noHorizontalOverflow(confirmation.locator('[data-slot="dialog-description"]'));
  await newTab.screenshot({ path: 'artifacts/acceptance/ui-extremes/long-confirmation.png' });
  await confirmation.getByRole('button', { name: '取消', exact: true }).click();
  await expect(site).toBeVisible();
});

test('长分组名称的存入位置列表在窄屏内完整换行且可用键盘选择', async ({ newTab }) => {
  const name = 'W'.repeat(80);
  await newTab.getByRole('button', { name: '添加分组', exact: true }).click();
  const group = newTab.getByRole('dialog');
  await group.getByLabel('名称', { exact: true }).fill(name);
  await group.getByRole('button', { name: '保存', exact: true }).click();
  await expect(group).not.toBeVisible();
  await newTab.setViewportSize({ width: 320, height: 360 });
  await newTab.getByRole('button', { name: '添加网站', exact: true }).click();
  const editor = newTab.getByRole('dialog', { name: '添加网站', exact: true });
  await editor.getByLabel('存入位置', { exact: true }).click();
  const options = newTab.getByRole('listbox');
  await expect(options).toBeVisible();
  await noHorizontalOverflow(options);
  await noHorizontalOverflow(options.getByRole('option', { name, exact: true }));
  await newTab.screenshot({ path: 'artifacts/acceptance/ui-extremes/long-location.png' });
  await options.press('End');
  await options.press('Enter');
  await expect(editor.getByLabel('存入位置', { exact: true })).toHaveText(name);
  await editor.getByRole('button', { name: '取消', exact: true }).click();
});

test('Esc 只关闭最上层设置和菜单，保留底层整理选择', async ({ newTab }) => {
  await newTab
    .locator('.desktop-workspace')
    .click({ button: 'right', position: { x: 1100, y: 750 } });
  await newTab.getByRole('menuitem', { name: '整理', exact: true }).click();
  const selected = newTab.locator('.site-card-main').first();
  await selected.click();
  await expect(selected).toHaveAttribute('aria-pressed', 'true');
  await newTab.getByRole('button', { name: '设置', exact: true }).click();
  const settings = newTab.getByRole('dialog', { name: '设置', exact: true });
  await expect(settings).toBeVisible();
  await settings.press('Escape');
  await expect(settings).not.toBeVisible();
  await expect(selected).toHaveAttribute('aria-pressed', 'true');
  await expect(newTab.getByRole('button', { name: '完成', exact: true })).toBeVisible();
  await newTab.getByRole('button', { name: '切换搜索引擎', exact: true }).click();
  const menu = newTab.getByRole('menu');
  await menu.press('Escape');
  await expect(menu).not.toBeVisible();
  await expect(selected).toHaveAttribute('aria-pressed', 'true');
  await newTab.getByRole('button', { name: '完成', exact: true }).focus();
  await newTab.mouse.move(1100, 750);
  await settle(newTab);
  await newTab.keyboard.press('Escape');
  await expect(newTab.getByRole('button', { name: '完成', exact: true })).not.toBeVisible();
});

test('320×360 裁切和取消可滚动到达，返回编辑器保留草稿', async ({ newTab }) => {
  await newTab.setViewportSize({ width: 320, height: 360 });
  await newTab.getByRole('button', { name: '添加网站', exact: true }).click();
  const editor = newTab.getByRole('dialog', { name: '添加网站', exact: true });
  await editor.getByLabel('名称', { exact: true }).fill('小窗口裁切草稿');
  await editor.getByRole('radio', { name: '上传图片', exact: true }).click();
  await editor.locator('input[type="file"]').setInputFiles({
    name: 'crop-extreme.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="#1677ff"/><circle cx="80" cy="80" r="32" fill="white"/></svg>',
    ),
  });
  await editor.getByRole('button', { name: '裁切图片', exact: true }).click();
  const crop = newTab.getByRole('dialog', { name: '裁切图标', exact: true });
  await settle(newTab);
  await noHorizontalOverflow(crop);
  const zoom = crop.getByRole('slider', { name: '缩放', exact: true });
  await zoom.focus();
  await zoom.press('ArrowRight');
  await expect(zoom).toHaveAttribute('aria-valuenow', '1.05');
  await newTab.screenshot({ path: 'artifacts/acceptance/ui-extremes/crop-small.png' });
  await crop.getByRole('button', { name: '使用裁切结果', exact: true }).click();
  await expect(crop).not.toBeVisible();
  await expect(editor.getByLabel('名称', { exact: true })).toHaveValue('小窗口裁切草稿');
  await editor.getByRole('button', { name: '取消', exact: true }).click();
  const confirmation = newTab.getByRole('alertdialog');
  await confirmation.getByRole('button', { name: '继续编辑', exact: true }).click();
  await expect(editor.getByLabel('名称', { exact: true })).toHaveValue('小窗口裁切草稿');
});

test('千个网站与百个文件夹下搜索、打开文件夹和设置仍可操作', async ({ newTab }) => {
  await newTab.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('raytab-v11');
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
  });
  await newTab.reload();
  await expect(newTab.locator('.site-card')).toHaveCount(600);
  const query = newTab.getByRole('textbox', { name: '搜索内容', exact: true });
  await query.fill('大量数据下的搜索草稿');
  await expect(query).toHaveValue('大量数据下的搜索草稿');
  await newTab.getByRole('button', { name: '批量文件夹 0', exact: true }).click();
  const folder = newTab.getByRole('dialog', { name: '批量文件夹 0', exact: true });
  await expect(folder.locator('.site-card')).toHaveCount(5);
  await folder.getByRole('button', { name: '关闭', exact: true }).click();
  await newTab.getByRole('button', { name: '设置', exact: true }).click();
  const settings = newTab.getByRole('dialog', { name: '设置', exact: true });
  await settings.getByRole('button', { name: '图标与布局', exact: true }).click();
  await settings.getByRole('switch', { name: '显示网站标题', exact: true }).click();
  await expect(
    settings.getByRole('switch', { name: '显示网站标题', exact: true }),
  ).not.toBeChecked();
  await expect(settings.getByRole('status')).toHaveText('已保存');
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(settings).not.toBeVisible();
  await expect(query).toHaveValue('大量数据下的搜索草稿');
  await newTab.reload();
  await expect(newTab.locator('.site-card')).toHaveCount(600);
});

test('英文设置在横向小窗口和320px内保留可达分类与关闭入口', async ({ newTab }) => {
  await newTab.setViewportSize({ width: 640, height: 360 });
  await newTab.getByRole('button', { name: '设置', exact: true }).click();
  const settings = newTab.getByRole('dialog');
  await settings.getByRole('combobox', { name: '语言', exact: true }).click();
  await newTab.getByRole('option', { name: 'English', exact: true }).click();
  await settings.getByRole('button', { name: 'Search and clock', exact: true }).click();
  for (const width of [640, 320]) {
    await newTab.setViewportSize({ width, height: 360 });
    await settle(newTab);
    const category = settings.getByRole('button', { name: 'Search and clock', exact: true });
    await expect(category).toBeInViewport({ ratio: 1 });
    expect((await category.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(settings.getByRole('button', { name: 'Close', exact: true })).toBeInViewport({
      ratio: 1,
    });
    await noHorizontalOverflow(settings);
    await newTab.screenshot({
      path: `artifacts/acceptance/ui-extremes/settings-english-${width}.png`,
    });
  }
  await settings.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(settings).not.toBeVisible();
});

test('小高度Popup可用滚轮到达底部操作，不丢失已填内容', async ({ context, extensionId }) => {
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 350, height: 300 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.getByLabel('名称', { exact: true }).fill('小高度Popup草稿');
  await popup.mouse.move(175, 240);
  await popup.mouse.wheel(0, 600);
  await expect
    .poll(() => popup.evaluate(() => document.scrollingElement?.scrollTop ?? 0))
    .toBeGreaterThan(0);
  await expect(popup.getByRole('button', { name: '添加网站', exact: true })).toBeInViewport({
    ratio: 1,
  });
  await noHorizontalOverflow(popup.locator('html'));
  await popup.screenshot({ path: 'artifacts/acceptance/ui-extremes/popup-small.png' });
  await popup.getByLabel('名称', { exact: true }).scrollIntoViewIfNeeded();
  await expect(popup.getByLabel('名称', { exact: true })).toHaveValue('小高度Popup草稿');
});
