import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import type { Page } from '@playwright/test';
import type { RayState } from '../src/storage/model';
import { addSite, expect, test } from './fixtures';

async function openSettings(page: Page, category: string) {
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '设置', exact: true });
  await dialog.getByRole('button', { name: category, exact: true }).click();
  return dialog;
}

async function failNextWrite(page: Page) {
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

async function storedState(page: Page) {
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

test('提交保存失败保留搜索引擎输入，重试仅新增一次', async ({ newTab }) => {
  const settings = await openSettings(newTab, '搜索与时钟');
  const disclosure = settings.locator('.search-engine-editor > summary');
  await expect(settings.getByLabel('搜索引擎名称', { exact: true })).not.toBeVisible();
  await disclosure.click();
  const form = settings.getByLabel('搜索引擎名称', { exact: true }).locator('xpath=ancestor::form');
  await form.getByLabel('搜索引擎名称', { exact: true }).fill('失败重试引擎');
  await form.getByLabel('搜索引擎地址', { exact: true }).fill('https://search.example.test/?q=%s');
  await disclosure.click();
  await settings.getByRole('button', { name: '图标与布局', exact: true }).click();
  await settings.getByRole('button', { name: '搜索与时钟', exact: true }).click();
  await disclosure.click();
  await expect(form.getByLabel('搜索引擎名称', { exact: true })).toHaveValue('失败重试引擎');
  await expect(form.getByLabel('搜索引擎地址', { exact: true })).toHaveValue(
    'https://search.example.test/?q=%s',
  );
  await failNextWrite(newTab);
  await form.getByRole('button', { name: '添加', exact: true }).click();
  await expect(form.getByRole('alert')).toBeVisible();
  await expect(form.getByLabel('搜索引擎名称', { exact: true })).toHaveValue('失败重试引擎');
  expect(
    (await storedState(newTab)).normalSettings.searchEngines.filter(
      (item) => item.name === '失败重试引擎',
    ),
  ).toHaveLength(0);
  await form.getByRole('button', { name: '添加', exact: true }).click();
  await expect(form.getByLabel('搜索引擎名称', { exact: true })).toHaveValue('');
  await expect(form).not.toBeVisible();
  await expect(disclosure).toBeFocused();
  expect(
    (await storedState(newTab)).normalSettings.searchEngines.filter(
      (item) => item.name === '失败重试引擎',
    ),
  ).toHaveLength(1);
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  await newTab.reload();
  const reloaded = await openSettings(newTab, '搜索与时钟');
  await expect(reloaded.getByRole('button', { name: '失败重试引擎', exact: true })).toHaveCount(1);
  await reloaded.getByRole('button', { name: '编辑 必应', exact: true }).click();
  const name = reloaded.getByLabel('搜索引擎名称', { exact: true });
  await expect(name).toBeFocused();
  await reloaded.getByRole('button', { name: '编辑 Google', exact: true }).click();
  await expect(name).toHaveValue('Google');
  await expect(name).toBeFocused();
  await reloaded
    .locator('.search-engine-editor')
    .getByRole('button', { name: '取消', exact: true })
    .click();
  await expect(reloaded.locator('.search-engine-editor > summary')).toBeFocused();
});

test('即时保存失败可重试最新滑块值，重载保留结果', async ({ newTab }) => {
  const settings = await openSettings(newTab, '图标与布局');
  const slider = settings.getByRole('slider', { name: '图标间距', exact: true });
  const before = (await storedState(newTab)).normalSettings.iconSpacing;
  await failNextWrite(newTab);
  await slider.focus();
  await slider.press('ArrowRight');
  await expect(settings.getByRole('button', { name: '重试保存', exact: true })).toBeVisible();
  expect((await storedState(newTab)).normalSettings.iconSpacing).toBe(before);
  const preview = Number(await slider.getAttribute('aria-valuenow'));
  await settings.getByRole('button', { name: '重试保存', exact: true }).click();
  await expect(settings.getByRole('button', { name: '重试保存', exact: true })).not.toBeVisible();
  expect((await storedState(newTab)).normalSettings.iconSpacing).toBe(preview);
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  await newTab.reload();
  const reloaded = await openSettings(newTab, '图标与布局');
  await expect(reloaded.getByRole('slider', { name: '图标间距', exact: true })).toHaveAttribute(
    'aria-valuenow',
    String(preview),
  );
});

test('私密偏好整体恢复需要确认，保留私密网站并在重载后跟随普通空间', async ({ newTab }) => {
  const normal = await openSettings(newTab, '图标与布局');
  const baseline = await normal
    .getByRole('slider', { name: '图标间距', exact: true })
    .getAttribute('aria-valuenow');
  await normal.getByRole('button', { name: '关闭', exact: true }).click();
  const normalSettings = (await storedState(newTab)).normalSettings;
  await newTab.getByRole('button', { name: '私密空间', exact: true }).click();
  await addSite(newTab, '恢复偏好保留的网站', 'https://private-preferences.example.test');
  const settings = await openSettings(newTab, '图标与布局');
  const slider = settings.getByRole('slider', { name: '图标间距', exact: true });
  await slider.focus();
  await slider.press('ArrowRight');
  await settings.getByRole('switch', { name: '显示网站标题', exact: true }).click();
  await expect
    .poll(async () => Object.keys((await storedState(newTab)).privateSettingOverrides))
    .toEqual(expect.arrayContaining(['iconSpacing', 'showSiteTitle']));
  const overrides = (await storedState(newTab)).privateSettingOverrides;
  await settings.getByRole('button', { name: '通用', exact: true }).click();
  const reset = settings.getByRole('button', { name: '恢复普通空间偏好', exact: true });
  await reset.click();
  const confirmation = newTab.getByRole('alertdialog', { name: '恢复普通空间偏好？', exact: true });
  await confirmation.getByRole('button', { name: '取消', exact: true }).click();
  expect((await storedState(newTab)).privateSettingOverrides).toEqual(overrides);
  await reset.click();
  await confirmation.getByRole('button', { name: '恢复普通空间偏好', exact: true }).click();
  await expect.poll(async () => (await storedState(newTab)).privateSettingOverrides).toEqual({});
  await expect(reset).toBeDisabled();
  expect((await storedState(newTab)).normalSettings).toEqual(normalSettings);
  await settings.getByRole('button', { name: '图标与布局', exact: true }).click();
  await expect(slider).toHaveAttribute('aria-valuenow', baseline ?? '');
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  await newTab.reload();
  await expect(newTab.getByRole('link', { name: '恢复偏好保留的网站', exact: true })).toBeVisible();
  const reloaded = await openSettings(newTab, '图标与布局');
  await expect(reloaded.getByRole('slider', { name: '图标间距', exact: true })).toHaveAttribute(
    'aria-valuenow',
    baseline ?? '',
  );
});

test('图标资源随备份导出和确认替换恢复，切换网站图标移除上传引用', async ({ newTab }, testInfo) => {
  await newTab.getByRole('button', { name: '添加网站', exact: true }).click();
  const editor = newTab.getByRole('dialog', { name: '添加网站', exact: true });
  await editor.getByLabel('名称', { exact: true }).fill('备份图标网站');
  await editor.getByLabel('网址', { exact: true }).fill('https://backup-icon.example.test');
  await editor.getByRole('radio', { name: '上传图片', exact: true }).click();
  const selectingIcon = newTab.waitForEvent('filechooser');
  await editor.getByRole('button', { name: '选择图片', exact: true }).click();
  await (
    await selectingIcon
  ).setFiles({
    name: 'backup.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="#2468ee"/></svg>',
    ),
  });
  await editor.getByRole('button', { name: '自动配色', exact: true }).click();
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor).not.toBeVisible();
  const site = newTab.getByRole('link', { name: '备份图标网站', exact: true });
  await expect(site.locator('img')).toBeVisible();
  const settings = await openSettings(newTab, '数据与备份');
  await settings.getByRole('button', { name: '导出备份', exact: true }).click();
  await settings.getByRole('combobox', { name: '导出范围', exact: true }).click();
  await newTab.getByRole('option', { name: '普通空间', exact: true }).click();
  const downloading = newTab.waitForEvent('download');
  await settings.getByRole('button', { name: '导出所选备份', exact: true }).click();
  const download = await downloading;
  const backupPath = testInfo.outputPath('normal-backup.json');
  await download.saveAs(backupPath);
  const serialized = await readFile(backupPath, 'utf8');
  expect(serialized).toContain('备份图标网站');
  expect(serialized).toContain('"source": "resource"');
  expect(serialized).toContain('"mode": "auto"');
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  await site.click({ button: 'right' });
  await newTab.getByRole('menuitem', { name: '删除', exact: true }).click();
  await newTab.getByRole('alertdialog').getByRole('button', { name: '删除', exact: true }).click();
  await expect(site).not.toBeVisible();
  const restore = await openSettings(newTab, '数据与备份');
  await restore.getByRole('button', { name: '恢复备份', exact: true }).click();
  await restore.getByLabel('备份文件', { exact: true }).setInputFiles(backupPath);
  await restore.getByRole('button', { name: '预览备份', exact: true }).click();
  await expect(restore.getByText('备份内容预览', { exact: true })).toBeVisible();
  await restore.getByRole('combobox', { name: '恢复方式', exact: true }).click();
  await newTab.getByRole('option', { name: '替换恢复', exact: true }).click();
  await restore.getByRole('button', { name: '替换恢复', exact: true }).click();
  await newTab
    .getByRole('alertdialog')
    .getByRole('button', { name: '替换恢复', exact: true })
    .click();
  await expect(restore.getByText('备份内容预览', { exact: true })).not.toBeVisible();
  await restore.getByRole('button', { name: '关闭', exact: true }).click();
  await newTab.reload();
  await expect(site.locator('img')).toBeVisible();
  await site.click({ button: 'right' });
  await newTab.getByRole('menuitem', { name: '编辑网站', exact: true }).click();
  const edit = newTab.getByRole('dialog', { name: '编辑网站', exact: true });
  await expect(edit.getByRole('button', { name: '自动配色', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await edit.getByRole('radio', { name: '网站图标', exact: true }).click();
  await edit.getByRole('button', { name: '保存', exact: true }).click();
  await expect(edit).not.toBeVisible();
  expect(
    (await storedState(newTab)).spaces.normal.sites.find((item) => item.title === '备份图标网站')
      ?.icon.source,
  ).toBe('auto');
});

test('设置表单在栏目间保留草稿，关闭时确认放弃', async ({ newTab }) => {
  const settings = await openSettings(newTab, '同步');
  await expect(settings.getByText('尚未设置同步', { exact: true })).toBeVisible();
  await expect(settings.getByLabel('文件地址', { exact: true })).not.toBeVisible();
  await settings.getByRole('button', { name: '配置同步', exact: true }).click();
  await settings
    .getByLabel('文件地址', { exact: true })
    .fill('https://dav.example.test/draft.json');
  await settings.getByRole('button', { name: '收起配置', exact: true }).click();
  await expect(settings.getByLabel('文件地址', { exact: true })).not.toBeVisible();
  await settings.getByRole('button', { name: '配置同步', exact: true }).click();
  await settings.getByRole('button', { name: '图标与布局', exact: true }).click();
  await settings.getByRole('button', { name: '同步', exact: true }).click();
  await expect(settings.getByLabel('文件地址', { exact: true })).toHaveValue(
    'https://dav.example.test/draft.json',
  );
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  const confirmation = newTab.getByRole('alertdialog');
  await confirmation.getByRole('button', { name: '继续编辑', exact: true }).click();
  await expect(settings).toBeVisible();
  await expect(settings.getByLabel('文件地址', { exact: true })).toHaveValue(
    'https://dav.example.test/draft.json',
  );
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  await newTab
    .getByRole('alertdialog')
    .getByRole('button', { name: '放弃更改', exact: true })
    .click();
  await expect(settings).not.toBeVisible();
});

test('语言设置立即更新产品文案并在 Popup 和重载后生效', async ({
  newTab,
  context,
  extensionId,
}) => {
  const settings = await openSettings(newTab, '通用');
  await settings.getByRole('combobox', { name: '语言', exact: true }).click();
  await newTab.getByRole('option', { name: 'English', exact: true }).click();
  await expect(newTab.getByRole('dialog', { name: 'Settings', exact: true })).toBeVisible();
  await newTab.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await newTab.reload();
  await expect(newTab.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.getByLabel('Name', { exact: true })).toBeVisible();
  await expect(popup.getByRole('button', { name: 'Add site', exact: true })).toBeVisible();
});

test('图标大小键盘调整保存，窄屏和亮暗主题没有横向溢出', async ({ newTab }) => {
  await addSite(newTab, '桌面预览验收', 'https://desktop-preview.example.test');
  const settings = await openSettings(newTab, '图标与布局');
  const viewport = newTab.viewportSize()!;
  const bounds = await settings.boundingBox();
  expect(bounds!.width).toBe(Math.min(840, viewport.width - 64));
  expect(bounds!.x + bounds!.width / 2).toBeCloseTo(viewport.width / 2, 0);
  await expect(settings.getByLabel('显示卡片背景', { exact: true })).toHaveCount(0);
  await expect(settings.getByRole('slider', { name: '背景不透明度', exact: true })).toHaveCount(0);
  const desktopIcon = newTab.locator('a[aria-label="桌面预览验收"] .site-icon-frame');
  const originalIconSize = (await desktopIcon.boundingBox())!.width;
  await newTab.screenshot({ path: 'artifacts/acceptance/settings-desktop.png', fullPage: true });
  const slider = settings.getByRole('slider', { name: '图标大小', exact: true });
  const original = await slider.getAttribute('aria-valuenow');
  await slider.focus();
  await slider.press('ArrowRight');
  await expect(slider).not.toHaveAttribute('aria-valuenow', original ?? '');
  await expect
    .poll(async () => (await desktopIcon.boundingBox())!.width)
    .toBeGreaterThan(originalIconSize);
  const saved = await slider.getAttribute('aria-valuenow');
  await settings.getByRole('button', { name: '壁纸与主题', exact: true }).click();
  for (const theme of ['明亮', '深色', '跟随系统']) {
    await settings.getByRole('combobox', { name: '主题', exact: true }).click();
    await newTab.getByRole('option', { name: theme, exact: true }).click();
    await expect
      .poll(() => newTab.evaluate(() => document.documentElement.dataset.theme))
      .toBe(theme === '明亮' ? 'light' : theme === '深色' ? 'dark' : 'system');
  }
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  await newTab.reload();
  const reloaded = await openSettings(newTab, '图标与布局');
  await expect(reloaded.getByRole('slider', { name: '图标大小', exact: true })).toHaveAttribute(
    'aria-valuenow',
    saved ?? '',
  );
  await newTab.setViewportSize({ width: 320, height: 640 });
  await newTab.screenshot({ path: 'artifacts/acceptance/settings-narrow.png' });
  expect(await newTab.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await expect(reloaded.getByRole('button', { name: '关闭', exact: true })).toBeVisible();
  await reloaded.getByRole('button', { name: '搜索与时钟', exact: true }).click();
  const category = reloaded.getByRole('button', { name: '搜索与时钟', exact: true });
  await expect(category).toHaveAttribute('aria-current', 'page');
  await expect(category).toBeFocused();
  const categoryBounds = await category.boundingBox();
  expect(categoryBounds!.x).toBeGreaterThanOrEqual(0);
  expect(categoryBounds!.x + categoryBounds!.width).toBeLessThanOrEqual(320);
  const categoryBar = reloaded.getByRole('navigation', { name: '设置分类', exact: true });
  const categoryBarBounds = await categoryBar.boundingBox();
  expect(categoryBarBounds!.height).toBeGreaterThanOrEqual(categoryBounds!.height);
  expect(categoryBounds!.y).toBeGreaterThanOrEqual(categoryBarBounds!.y);
  expect(categoryBounds!.y + categoryBounds!.height).toBeLessThanOrEqual(
    categoryBarBounds!.y + categoryBarBounds!.height,
  );
  await newTab.emulateMedia({ reducedMotion: 'reduce' });
  expect(
    await reloaded.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).animationDuration),
    ),
  ).toBeLessThanOrEqual(0.001);
});

test('网站仅右键或键盘打开精简菜单，编辑同时涵盖图标', async ({ newTab }) => {
  await addSite(newTab, '图标菜单测试', 'https://icons.example.test');
  const site = newTab.getByRole('link', { name: '图标菜单测试', exact: true });
  await site.hover();
  const card = site.locator('..');
  await expect(card.getByRole('button')).toHaveCount(0);
  await site.focus();
  await site.press('Shift+F10');
  await expect(newTab.getByRole('menuitem')).toHaveText(['编辑网站', '移动', '删除']);
  await expect(newTab.getByRole('menuitem', { name: '编辑网站', exact: true })).toBeVisible();
  await newTab.getByRole('menuitem', { name: '编辑网站', exact: true }).click();
  const editor = newTab.getByRole('dialog', { name: '编辑网站', exact: true });
  await expect(editor.getByRole('tab')).toHaveCount(0);
  await expect(editor.getByRole('radio')).toHaveCount(3);
  await expect.poll(async () => (await editor.boundingBox())?.width).toBe(600);
  await expect(editor.getByLabel('图标文字', { exact: true })).not.toBeVisible();
  await expect(editor.getByRole('button', { name: '删除', exact: true })).toHaveCount(0);
  await expect(editor.getByLabel('网址', { exact: true })).toBeFocused();
  await expect(editor.getByRole('complementary', { name: '图标预览', exact: true })).toBeInViewport(
    {
      ratio: 1,
    },
  );
  await expect(editor.getByLabel('名称', { exact: true })).not.toBeFocused();
  await expect(editor.getByRole('radio', { name: '上传图片', exact: true })).toBeInViewport({
    ratio: 1,
  });
  await expect(editor.getByRole('button', { name: '裁切图片', exact: true })).toHaveCount(0);
  await editor.getByRole('button', { name: '取消', exact: true }).click();
  await site.click({ button: 'right' });
  await expect(newTab.getByRole('menuitem', { name: '编辑网站', exact: true })).toBeVisible();
  await expect(newTab.getByRole('menuitem', { name: '复制网址', exact: true })).toHaveCount(0);
  await expect(newTab.getByRole('menuitem', { name: '更换图标', exact: true })).toHaveCount(0);
});

test('常用底色色板保留品牌原色，Gemini 使用独立图形，保存重载后保持选择', async ({ newTab }) => {
  await addSite(newTab, 'Google Gemini', 'https://gemini.google.com/app');
  const gemini = newTab.getByRole('link', { name: 'Google Gemini', exact: true });
  await expect(gemini.locator('img')).toBeVisible();
  await expect(gemini.locator('img')).toHaveAttribute('src', /\/assets\/gemini-[\w-]+\.svg$/);
  expect(
    await gemini.locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth),
  ).toBeGreaterThan(0);
  const youtube = newTab.getByRole('link', { name: 'YouTube', exact: true });
  await youtube.click({ button: 'right' });
  await newTab.getByRole('menuitem', { name: '编辑网站', exact: true }).click();
  const editor = newTab.getByRole('dialog', { name: '编辑网站', exact: true });
  const palette = editor.getByRole('group', { name: '图标底色', exact: true });
  await expect(palette.locator('.site-edit-color')).toHaveCount(10);
  for (const color of [
    '白色',
    '黑色',
    '蓝色',
    '青色',
    '绿色',
    '黄色',
    '橙色',
    '红色',
    '粉色',
    '紫色',
  ]) {
    await expect(palette.getByRole('button', { name: color, exact: true })).toBeVisible();
  }
  expect(
    await palette
      .getByRole('button', { name: '白色', exact: true })
      .evaluate((element) => getComputedStyle(element, '::before').borderWidth),
  ).toBe('1px');
  await palette.getByRole('button', { name: '绿色', exact: true }).click();
  await expect(editor.locator('.site-edit-preview svg')).toHaveAttribute('fill', '#ff0033');
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor).not.toBeVisible();
  await newTab.reload();
  await expect(youtube.locator('svg')).toHaveAttribute('fill', '#ff0033');
  await expect(youtube.locator('.site-icon-frame')).toHaveCSS(
    'background-color',
    'rgb(82, 196, 26)',
  );
  await youtube.click({ button: 'right' });
  await newTab.getByRole('menuitem', { name: '编辑网站', exact: true }).click();
  await expect(palette.getByRole('button', { name: '绿色', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await palette.getByRole('button', { name: '白色', exact: true }).click();
  await editor.screenshot({
    animations: 'disabled',
    path: 'artifacts/acceptance/common-icon-palette.png',
  });
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor).not.toBeVisible();
  await newTab.reload();
  await expect(youtube.locator('.site-icon-frame')).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  );
  await expect(youtube.locator('svg')).toHaveAttribute('fill', '#ff0033');
  await expect(gemini.locator('img')).toBeVisible();
  expect(
    await gemini.locator('img').evaluate((image: HTMLImageElement) => {
      const source = new URL(image.src);
      return source.protocol === location.protocol && source.host === location.host;
    }),
  ).toBe(true);
  await expect(
    newTab.getByRole('link', { name: '哔哩哔哩', exact: true }).locator('svg'),
  ).toHaveAttribute('fill', '#fb7299');
  await newTab.screenshot({
    animations: 'disabled',
    path: 'artifacts/acceptance/common-brand-icons.png',
  });
});

test('自动图标跳过低清和损坏候选，矢量与实色底板保存后保留', async ({ newTab }) => {
  const png = async (size: number) =>
    Buffer.from(
      await newTab.evaluate((size) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const context = canvas.getContext('2d')!;
        context.fillStyle = '#2266dd';
        context.fillRect(size / 4, size / 4, size / 2, size / 2);
        return canvas.toDataURL('image/png').split(',')[1];
      }, size),
      'base64',
    );
  const tiny = await png(16);
  const large = await png(192);
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(request.url!);
    response.setHeader('Access-Control-Allow-Origin', '*');
    if (request.url === '/vector-page') {
      response.setHeader('Content-Type', 'text/html');
      response.end(
        '<title>矢量测试</title><link rel="icon" type="image/svg+xml" href="/mark.svg"><link rel="apple-touch-icon" sizes="192x192" href="/touch.png">',
      );
    } else if (request.url === '/mark.svg') {
      response.setHeader('Content-Type', 'image/svg+xml');
      response.end(
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="#2266dd"/></svg>',
      );
    } else if (request.url === '/') {
      response.setHeader('Content-Type', 'text/html');
      response.end(
        '<title>高清测试</title><link rel="icon" sizes="512x512" href="/tiny.png"><link rel="icon" sizes="256x256" href="/broken.png"><link rel="apple-touch-icon" sizes="192x192" href="/touch.png">',
      );
    } else {
      response.setHeader('Content-Type', 'image/png');
      response.end(
        request.url === '/tiny.png'
          ? tiny
          : request.url === '/touch.png'
            ? large
            : Buffer.from('broken'),
      );
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await newTab.getByRole('button', { name: '添加网站', exact: true }).click();
    const editor = newTab.getByRole('dialog', { name: '添加网站', exact: true });
    await editor
      .getByLabel('网址', { exact: true })
      .fill(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`);
    await editor.getByRole('button', { name: '获取网站图标', exact: true }).click();
    await expect(editor.getByLabel('名称', { exact: true })).toHaveValue('高清测试');
    await expect(editor.locator('.site-edit-preview img')).toBeVisible();
    expect(requests.filter((url) => url !== '/favicon.ico')).toEqual([
      '/',
      '/tiny.png',
      '/broken.png',
      '/touch.png',
    ]);
    await expect(editor.getByRole('button', { name: '透明', exact: true })).toHaveCount(0);
    await editor.getByRole('button', { name: '保存', exact: true }).click();
    await expect(editor).not.toBeVisible();
    await newTab.reload();
    const site = newTab.getByRole('link', { name: '高清测试', exact: true });
    await expect(site.locator('img')).toBeVisible();
    expect(
      await site.locator('img').evaluate(async (image: HTMLImageElement) => {
        await image.decode();
        return {
          width: image.naturalWidth,
          background: getComputedStyle(image.closest('.site-icon-frame')!).backgroundColor,
        };
      }),
    ).toEqual({ width: 192, background: 'rgb(255, 255, 255)' });
    await newTab.getByRole('button', { name: '添加网站', exact: true }).click();
    await editor
      .getByLabel('网址', { exact: true })
      .fill(`http://127.0.0.1:${(server.address() as AddressInfo).port}/vector-page`);
    await editor.getByRole('button', { name: '获取网站图标', exact: true }).click();
    await expect(editor.getByLabel('名称', { exact: true })).toHaveValue('矢量测试');
    await expect(editor.locator('.site-edit-preview img')).toBeVisible();
    await editor.getByRole('button', { name: '保存', exact: true }).click();
    await expect(editor).not.toBeVisible();
    await newTab.reload();
    const vector = newTab.getByRole('link', { name: '矢量测试', exact: true }).locator('img');
    await expect(vector).toBeVisible();
    expect(
      await vector.evaluate(async (image: HTMLImageElement) => {
        await image.decode();
        return image.naturalWidth;
      }),
    ).toBe(256);
    expect(requests).toContain('/mark.svg');
    await addSite(newTab, '清晰 Google', 'https://www.google.com');
    const google = newTab.getByRole('link', { name: '清晰 Google', exact: true });
    await expect(google.locator('svg')).toHaveCount(1);
    await expect(google.locator('img')).toHaveCount(0);
    await google.click({ button: 'right' });
    await newTab.getByRole('menuitem', { name: '编辑网站', exact: true }).click();
    const edit = newTab.getByRole('dialog', { name: '编辑网站', exact: true });
    await expect(edit.getByRole('combobox', { name: '存入位置', exact: true })).toHaveText('主页');
    await expect(edit.locator('.site-edit-preview svg')).toHaveCount(1);
    await expect(edit.getByRole('button', { name: '裁切图片', exact: true })).toHaveCount(0);
    await newTab.screenshot({
      animations: 'disabled',
      path: 'artifacts/acceptance/crisp-google-editor.png',
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('原生互斥拒绝配置变更，释放后真实后台可以继续同步', async ({
  newTab,
  context,
  extensionId,
  background,
}) => {
  test.setTimeout(60_000);
  let content: string | undefined;
  let version = 0;
  let holdRead = false;
  let pendingRead: (() => void) | undefined;
  let readCount = 0;
  const server = createServer(async (request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('ETag', String(version));
    if (request.method === 'GET') {
      readCount++;
      if (holdRead)
        await new Promise<void>((release) => {
          pendingRead = release;
        });
      response.writeHead(content ? 200 : 404);
      response.end(content ?? '');
      return;
    }
    if (request.method === 'PUT') {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      content = Buffer.concat(chunks).toString('utf8');
      version++;
      response.setHeader('ETag', String(version));
      response.writeHead(200);
      response.end();
      return;
    }
    response.writeHead(405);
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/raytab.json`;
  try {
    const settings = await openSettings(newTab, '同步');
    await settings.getByRole('button', { name: '配置同步', exact: true }).click();
    await settings.getByLabel('文件地址', { exact: true }).fill(url);
    await settings.getByRole('button', { name: '保存连接', exact: true }).click();
    await expect(settings.getByText('已配置 WebDAV', { exact: true })).toBeVisible();
    await expect(settings.getByLabel('文件地址', { exact: true })).not.toBeVisible();
    await expect(settings.getByRole('button', { name: '双向同步', exact: true })).toBeEnabled();
    const contender = await context.newPage();
    await contender.goto(`chrome-extension://${extensionId}/newtab.html`);
    const otherSettings = await openSettings(contender, '同步');
    await otherSettings.getByRole('button', { name: '编辑连接', exact: true }).click();
    holdRead = true;
    await settings.getByRole('button', { name: '双向同步', exact: true }).click();
    await expect.poll(() => Boolean(pendingRead)).toBe(true);
    await otherSettings.getByRole('button', { name: '保存连接', exact: true }).click();
    await expect(
      otherSettings.getByRole('alert').filter({ hasText: /正在.*同步|正在.*处理同步/ }),
    ).toBeVisible();
    const canAcquire = await background.evaluate(() =>
      navigator.locks.request('raytab-sync', { ifAvailable: true }, (lock) => Boolean(lock)),
    );
    expect(canAcquire).toBe(false);
    pendingRead?.();
    holdRead = false;
    await expect(settings.getByRole('button', { name: '双向同步', exact: true })).toBeEnabled();
    expect(content).toBeDefined();
    await expect
      .poll(() =>
        background.evaluate(() =>
          navigator.locks.request('raytab-sync', { ifAvailable: true }, (lock) => Boolean(lock)),
        ),
      )
      .toBe(true);
    const readsBefore = readCount;
    await background.evaluate(async () => {
      const api = (globalThis as typeof globalThis & { chrome: typeof browser }).chrome;
      await api.alarms.create('raytab-sync', { when: Date.now() + 20 });
    });
    await expect.poll(() => readCount, { timeout: 15_000 }).toBeGreaterThan(readsBefore);
  } finally {
    pendingRead?.();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('上传图片无额外留白，文字图标和背景选择重载后保留', async ({ newTab }) => {
  await newTab.getByRole('button', { name: '添加网站', exact: true }).click();
  const editor = newTab.getByRole('dialog', { name: '添加网站', exact: true });
  await editor.getByLabel('名称', { exact: true }).fill('透明图标测试');
  await editor.getByLabel('网址', { exact: true }).fill('https://transparent.example.test');
  await editor.getByRole('radio', { name: '上传图片', exact: true }).click();
  await editor.locator('input[type=file]').setInputFiles({
    name: 'transparent.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect x="24" y="24" width="80" height="80" fill="#ff3355"/></svg>',
    ),
  });
  await editor.getByRole('button', { name: '自动配色', exact: true }).click();
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  const site = newTab.getByRole('link', { name: '透明图标测试', exact: true });
  const image = site.locator('img');
  await expect(image).toBeVisible();
  const computed = await image.evaluate((element) => ({
    padding: getComputedStyle(element).padding,
    fit: getComputedStyle(element).objectFit,
  }));
  expect(computed.padding).toBe('0px');
  expect(computed.fit).toBe('contain');
  await site.click({ button: 'right' });
  await newTab.getByRole('menuitem', { name: '编辑网站', exact: true }).click();
  const edit = newTab.getByRole('dialog', { name: '编辑网站', exact: true });
  await edit.getByRole('radio', { name: '文字图标', exact: true }).click();
  await edit.getByLabel('图标文字', { exact: true }).fill('🙂AB');
  await edit.getByRole('button', { name: '保存', exact: true }).click();
  await expect(edit).not.toBeVisible();
  await newTab.reload();
  await site.click({ button: 'right' });
  await newTab.getByRole('menuitem', { name: '编辑网站', exact: true }).click();
  const reloaded = newTab.getByRole('dialog', { name: '编辑网站', exact: true });
  await expect(reloaded.getByRole('radio', { name: '文字图标', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(reloaded.getByLabel('图标文字', { exact: true })).toHaveValue('🙂AB');
  await expect(reloaded.getByRole('button', { name: '自动配色', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('三种图标切换保留各自草稿，网站图片保存失败可重试并离线重载', async ({ newTab, context }) => {
  await context.route('https://icons-switch.example.test/**', (route) => {
    const image = /\.(svg|ico)$/.test(new URL(route.request().url()).pathname);
    return route.fulfill({
      headers: { 'Access-Control-Allow-Origin': '*' },
      contentType: image ? 'image/svg+xml' : 'text/html',
      body: image
        ? '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="#22aa55"/></svg>'
        : '<html><head><title>网站图片测试</title><link rel="icon" href="/mark.svg"></head></html>',
    });
  });
  await newTab.getByRole('button', { name: '添加网站', exact: true }).click();
  const editor = newTab.getByRole('dialog', { name: '添加网站', exact: true });
  await editor.getByLabel('名称', { exact: true }).fill('三种图标测试');
  await editor
    .getByLabel('网址', { exact: true })
    .fill('https://icons-switch.example.test/Keep?q=1#A');
  await editor.getByRole('button', { name: '获取网站图标', exact: true }).click();
  await expect(editor.getByRole('button', { name: '裁切图片', exact: true })).toBeVisible();
  const website = editor.getByRole('radio', { name: '网站图标', exact: true });
  const uploaded = editor.getByRole('radio', { name: '上传图片', exact: true });
  const preview = editor.getByRole('complementary', { name: '图标预览', exact: true });
  const imageData = () =>
    preview
      .locator('img')
      .evaluate(async (image: HTMLImageElement) => (await fetch(image.src)).text());
  await expect(preview.locator('img')).toBeVisible();
  const websiteImage = await imageData();
  await uploaded.click();
  await editor.locator('input[type=file]').setInputFiles({
    name: 'upload.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="#2255ee"/></svg>',
    ),
  });
  await expect(uploaded).toHaveAttribute('aria-checked', 'true');
  await expect(preview.locator('img')).toBeVisible();
  const uploadedImage = await imageData();
  expect(websiteImage).not.toBe(uploadedImage);
  await editor.getByRole('radio', { name: '文字图标', exact: true }).click();
  await editor.getByLabel('图标文字', { exact: true }).fill('自定🙂');
  await website.click();
  await expect.poll(imageData).toBe(websiteImage);
  await uploaded.click();
  await expect.poll(imageData).toBe(uploadedImage);
  await editor.getByRole('radio', { name: '文字图标', exact: true }).click();
  await expect(editor.getByLabel('图标文字', { exact: true })).toHaveValue('自定🙂');
  await website.click();
  await failNextWrite(newTab);
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor.getByRole('alert')).toBeVisible();
  await expect(website).toHaveAttribute('aria-checked', 'true');
  await expect(preview.locator('img')).toBeVisible();
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor).not.toBeVisible();
  const saved = (await storedState(newTab)).spaces.normal.sites.find(
    (site) => site.title === '三种图标测试',
  )!;
  expect(saved.icon).toMatchObject({ source: 'auto', resourceId: expect.any(String) });
  expect(saved.icon).not.toHaveProperty('display');
  await context.unroute('https://icons-switch.example.test/**');
  await context.route('https://icons-switch.example.test/**', (route) => route.abort());
  await newTab.reload();
  const site = newTab.getByRole('link', { name: '三种图标测试', exact: true });
  await expect(site).toHaveAttribute('href', 'https://icons-switch.example.test/Keep?q=1#A');
  await expect(site.locator('img')).toBeVisible();
  const color = await site.locator('img').evaluate(async (image: HTMLImageElement) => {
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const drawing = canvas.getContext('2d')!;
    drawing.drawImage(image, 0, 0, 1, 1);
    return [...drawing.getImageData(0, 0, 1, 1).data];
  });
  // Saved images use WebP quality 0.88; allow its one-step colour quantization.
  for (const [channel, expected] of [34, 170, 85].entries()) {
    expect(Math.abs(color[channel] - expected)).toBeLessThanOrEqual(2);
  }
  expect(color[3]).toBe(255);
});

test('私密空间重载立即锁定并清除编辑草稿与普通缓存中的明文', async ({ newTab }) => {
  const settings = await openSettings(newTab, '通用');
  await settings.getByText('设置密码保护', { exact: true }).click();
  await settings.getByLabel('密码', { exact: true }).fill('vault-e2e-only');
  await settings.getByRole('button', { name: '启用密码保护', exact: true }).click();
  await expect(settings.getByText(/私密空间已加密并锁定/)).toBeVisible();
  await settings.getByRole('button', { name: '同步', exact: true }).click();
  await settings.getByRole('button', { name: '配置同步', exact: true }).click();
  await expect(settings.getByRole('switch', { name: '同步私密空间', exact: true })).toBeDisabled();
  await expect(
    settings.getByRole('switch', { name: '同步私密空间', exact: true }),
  ).not.toBeChecked();
  await expect(
    settings.getByText('请先解锁私密空间，再修改或保存包含私密空间的同步配置。', { exact: true }),
  ).toBeVisible();
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  await newTab.getByRole('button', { name: '私密空间', exact: true }).click();
  const unlock = newTab.getByRole('dialog', { name: '解锁私密空间', exact: true });
  await unlock.getByLabel('输入私密空间密码', { exact: true }).fill('vault-e2e-only');
  await unlock.getByRole('button', { name: '解锁', exact: true }).click();
  await expect(unlock).not.toBeVisible();
  await addSite(newTab, '私密验收网站', 'https://private.e2e.example.test');
  const search = newTab.getByRole('search').locator('input');
  await search.fill('私密搜索未提交内容');
  await newTab.getByRole('button', { name: '普通空间', exact: true }).click();
  await expect(search).toHaveValue('');
  expect(await newTab.evaluate(() => document.body.innerHTML)).not.toContain('私密搜索未提交内容');
  await newTab.getByRole('button', { name: '私密空间', exact: true }).click();
  const unlockAgain = newTab.getByRole('dialog', { name: '解锁私密空间', exact: true });
  await unlockAgain.getByLabel('输入私密空间密码', { exact: true }).fill('vault-e2e-only');
  await unlockAgain.getByRole('button', { name: '解锁', exact: true }).click();
  await expect(unlockAgain).not.toBeVisible();
  const site = newTab.getByRole('link', { name: '私密验收网站', exact: true });
  await site.click({ button: 'right' });
  await newTab.getByRole('menuitem', { name: /^(编辑|编辑网站)$/ }).click();
  await newTab
    .getByRole('dialog', { name: '编辑网站', exact: true })
    .getByLabel('名称', { exact: true })
    .fill('私密未保存草稿');
  await newTab.reload();
  await expect(site).not.toBeVisible();
  expect(await newTab.evaluate(() => document.body.innerHTML)).not.toContain('私密未保存草稿');
  const cache = await newTab.evaluate(() =>
    Object.keys(localStorage)
      .map((key) => localStorage.getItem(key))
      .join('\n'),
  );
  expect(cache).not.toContain('private.e2e.example.test');
  expect(cache).not.toContain('私密验收网站');
  await newTab.getByRole('button', { name: '私密空间', exact: true }).click();
  await expect(newTab.getByLabel('输入私密空间密码', { exact: true })).toHaveValue('');
  await newTab.getByLabel('输入私密空间密码', { exact: true }).fill('wrong-password');
  await newTab.getByRole('dialog').getByRole('button', { name: '解锁', exact: true }).click();
  await expect(newTab.getByRole('alert').filter({ hasText: /密码错误/ })).toBeVisible();
});

test('导入整理控件对齐，预览无内层滚动，失败重试和重载不重复导入', async ({ newTab }) => {
  const settings = await openSettings(newTab, '数据与备份');
  await expect(settings.locator('.data-task-list button')).toHaveCount(3);
  await expect(settings.getByRole('button', { name: '预览文件', exact: true })).not.toBeVisible();
  await expect(
    settings.getByRole('button', { name: '导出所选备份', exact: true }),
  ).not.toBeVisible();
  await expect(settings.getByRole('button', { name: '预览备份', exact: true })).not.toBeVisible();
  await settings.getByRole('button', { name: '导入书签', exact: true }).click();
  await expect(settings.getByRole('heading', { name: '导入书签', exact: true })).toBeFocused();
  const items = Array.from(
    { length: 58 },
    (_, index) =>
      `<DT><A HREF="https://bookmarks.example.test/${index}?keep=1#part">${index === 0 ? '这是一个用于检查超长网站名称对齐且不撑破面板的书签标题'.repeat(3) : `导入网站 ${index}`}</A>`,
  );
  await settings.getByLabel('书签 HTML 文件', { exact: true }).setInputFiles({
    name: 'layout-bookmarks.html',
    mimeType: 'text/html',
    buffer: Buffer.from(
      `<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p>${[...items, ...items.slice(0, 3)].join('\n')}</DL>`,
    ),
  });
  await settings.getByRole('button', { name: '预览文件', exact: true }).click();
  await expect(settings.getByText(/准备导入 58 个网站，已跳过 3 个重复网址/)).toBeVisible();
  await settings.getByRole('button', { name: '返回数据管理', exact: true }).click();
  await expect(settings.getByRole('button', { name: '导入书签', exact: true })).toBeFocused();
  await settings.getByRole('button', { name: '导出备份', exact: true }).click();
  await expect(settings.getByRole('heading', { name: '导出备份', exact: true })).toBeFocused();
  await expect(settings.getByRole('combobox', { name: '导出范围', exact: true })).toBeVisible();
  await expect(settings.getByText(/准备导入 58 个网站，已跳过 3 个重复网址/)).not.toBeVisible();
  await settings.getByRole('button', { name: '返回数据管理', exact: true }).click();
  await expect(settings.getByRole('button', { name: '导出备份', exact: true })).toBeFocused();
  await settings.getByRole('button', { name: '导入书签', exact: true }).click();
  await expect(settings.getByRole('heading', { name: '导入书签', exact: true })).toBeFocused();
  await expect(settings.getByText('layout-bookmarks.html', { exact: true })).toBeVisible();
  expect(
    await settings
      .getByLabel('书签 HTML 文件', { exact: true })
      .evaluate((input: HTMLInputElement) => input.files?.[0]?.name),
  ).toBe('layout-bookmarks.html');
  await expect(settings.getByText(/准备导入 58 个网站，已跳过 3 个重复网址/)).toBeVisible();
  const options = settings.locator('.data-preview-options');
  const checkAlignment = async () => {
    const bounds = await options.getByRole('combobox').evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect();
        return { x: box.x, width: box.width };
      }),
    );
    expect(bounds).toHaveLength(3);
    expect(
      Math.max(...bounds.map((item) => item.x)) - Math.min(...bounds.map((item) => item.x)),
    ).toBeLessThan(1);
    expect(
      Math.max(...bounds.map((item) => item.width)) - Math.min(...bounds.map((item) => item.width)),
    ).toBeLessThan(1);
    expect(
      await settings
        .locator('.settings-bookmark-preview')
        .evaluate((element) => element.scrollHeight <= element.clientHeight),
    ).toBe(true);
    expect(await settings.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    expect(await settings.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(
      true,
    );
  };
  await checkAlignment();
  await options.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await expect(settings.locator('.settings-workspace-header')).toBeInViewport({ ratio: 1 });
  await expect(settings.getByRole('button', { name: '关闭', exact: true })).toBeInViewport({
    ratio: 1,
  });
  await newTab.screenshot({ path: 'artifacts/acceptance/import-layout-desktop.png' });
  await newTab.setViewportSize({ width: 320, height: 640 });
  await checkAlignment();
  await options.scrollIntoViewIfNeeded();
  await expect(settings.locator('.settings-workspace-header')).toBeInViewport({ ratio: 1 });
  await expect(settings.locator('.settings-tabs button.active')).toBeInViewport({ ratio: 1 });
  await newTab.screenshot({ path: 'artifacts/acceptance/import-layout-narrow.png' });
  await failNextWrite(newTab);
  await settings.getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(settings.getByRole('alert')).toBeVisible();
  await expect(settings.getByText(/准备导入 58 个网站，已跳过 3 个重复网址/)).toBeVisible();
  await settings.getByRole('button', { name: '返回数据管理', exact: true }).click();
  await settings.getByRole('button', { name: '导入书签', exact: true }).click();
  await expect(settings.getByRole('alert')).toBeVisible();
  await settings.getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(settings.getByRole('button', { name: '确认导入', exact: true })).not.toBeVisible();
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  await newTab.reload();
  const imported = (await storedState(newTab)).spaces.normal.sites.filter((site) =>
    site.url.startsWith('https://bookmarks.example.test/'),
  );
  expect(imported).toHaveLength(58);
  expect(imported[0].url).toBe('https://bookmarks.example.test/0?keep=1#part');
});

test('简洁模式桌面空白可打开设置，搜索输入保留原生右键行为', async ({ newTab }) => {
  await newTab.mouse.click(1150, 680, { button: 'right' });
  await newTab.getByRole('menuitem', { name: '进入简洁模式', exact: true }).click();
  await newTab.mouse.click(1150, 680, { button: 'right' });
  await expect(newTab.getByRole('menuitem', { name: '壁纸与主题', exact: true })).toBeVisible();
  await newTab.getByRole('menuitem', { name: '壁纸与主题', exact: true }).click();
  const settings = newTab.getByRole('dialog', { name: '设置', exact: true });
  await expect(settings.getByRole('combobox', { name: '主题', exact: true })).toBeVisible();
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  const input = newTab.getByRole('search').locator('input');
  const prevented = await input.evaluate((element) => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(false);
});
