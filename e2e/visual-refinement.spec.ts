import type { Locator, Page } from '@playwright/test';
import { addSite, expect, test } from './fixtures';

async function openSettings(page: Page) {
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const settings = page.getByRole('dialog', { name: '设置', exact: true });
  await expect(settings).toBeVisible();
  // Coordinates are asserted after the existing entrance animation, not mid-translation.
  await settings.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
  return settings;
}

async function menuAppearance(menu: Locator) {
  return menu.evaluate((element) => {
    const style = getComputedStyle(element);
    const item = element.querySelector('[role="menuitem"]')!;
    const itemStyle = getComputedStyle(item);
    return {
      background: style.backgroundColor,
      radius: style.borderRadius,
      shadow: style.boxShadow,
      width: element.getBoundingClientRect().width,
      font: itemStyle.fontSize,
      rowHeight: item.getBoundingClientRect().height,
    };
  });
}

test('平板设置居中且边界完整，窄屏组件深链完整显示当前分类', async ({ newTab }) => {
  await newTab.locator('.widget-settings-wrap').first().hover();
  await expect(newTab.getByRole('button', { name: '搜索与时钟设置', exact: true })).toHaveCount(0);
  await newTab.setViewportSize({ width: 768, height: 900 });
  const settings = await openSettings(newTab);
  await expect.poll(async () => (await settings.boundingBox())?.width).toBe(704);
  const tabletBounds = (await settings.boundingBox())!;
  expect(tabletBounds.x).toBeCloseTo(32, 0);
  expect(tabletBounds.y + tabletBounds.height / 2).toBeCloseTo(450, 0);
  await expect(settings.getByRole('button', { name: '关闭', exact: true })).toBeInViewport({
    ratio: 1,
  });
  expect(await settings.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
    true,
  );
  await newTab.screenshot({ path: 'artifacts/acceptance/refined-settings-tablet.png' });
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  await newTab.setViewportSize({ width: 320, height: 640 });
  await newTab.locator('.widget-settings-wrap').first().click({ button: 'right' });
  await newTab.getByRole('menuitem', { name: '搜索与时钟设置', exact: true }).click();
  const narrow = newTab.getByRole('dialog', { name: '设置', exact: true });
  const active = narrow.getByRole('button', { name: '搜索与时钟', exact: true });
  await expect(active).toBeFocused();
  await expect(active).toBeInViewport({ ratio: 1 });
  const bounds = (await active.boundingBox())!;
  expect(bounds.height).toBeGreaterThanOrEqual(44);
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  await newTab.screenshot({ path: 'artifacts/acceptance/refined-settings-widget-deeplink.png' });
});

test('设置使用独立居中工作区，布局修改保存且不挤压桌面或改变简洁模式', async ({ newTab }) => {
  await newTab.setViewportSize({ width: 1440, height: 900 });
  for (const index of [1, 2, 3, 4]) {
    await addSite(newTab, `工作网站 ${index}`, `https://github.com/?preview=${index}`);
  }
  const settings = await openSettings(newTab);
  await expect.poll(async () => (await settings.boundingBox())?.width).toBe(840);
  const bounds = (await settings.boundingBox())!;
  expect(bounds.x + bounds.width / 2).toBeCloseTo(720, 0);
  expect(bounds.y + bounds.height / 2).toBeCloseTo(450, 0);
  expect(bounds.height).toBe(640);
  expect((await settings.locator('.settings-sidebar').boundingBox())?.width).toBeCloseTo(176, 2);
  await expect(settings.getByRole('button', { name: '通用', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(
    settings.locator('.settings-content').getByRole('combobox', { name: '语言', exact: true }),
  ).toBeVisible();
  await expect(
    settings.locator('.settings-sidebar').getByRole('combobox', { name: '语言', exact: true }),
  ).toHaveCount(0);
  expect(await settings.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe(
    'rgb(255, 255, 255)',
  );
  expect(
    await settings
      .locator('.settings-section')
      .first()
      .evaluate((node) => {
        const style = getComputedStyle(node);
        return { background: style.backgroundColor, radius: style.borderRadius };
      }),
  ).toEqual({ background: 'rgba(0, 0, 0, 0)', radius: '0px' });
  const desktop = newTab.locator('.desktop-workspace');
  await expect.poll(async () => (await desktop.boundingBox())?.width).toBe(1440);
  expect(await newTab.locator('.settings-live-preview').count()).toBe(0);
  const overlay = newTab.locator('[data-slot="dialog-overlay"]');
  expect(await overlay.evaluate((node) => getComputedStyle(node).backdropFilter)).toBe('blur(5px)');
  await settings.getByRole('button', { name: '图标与布局', exact: true }).click();
  const grid = newTab.locator('.site-grid').first();
  const columnCount = () =>
    grid.evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length);
  const before = await columnCount();
  expect(before).toBeGreaterThan(4);
  const columns = settings.getByRole('slider', { name: '每行最多', exact: true });
  await columns.focus();
  await columns.press('Home');
  await expect.poll(columnCount).toBe(4);
  const icon = grid.locator('.site-icon-frame').first();
  const beforeSize = (await icon.boundingBox())!.width;
  const size = settings.getByRole('slider', { name: '图标大小', exact: true });
  await size.focus();
  await size.press('End');
  await expect.poll(async () => (await icon.boundingBox())?.width).toBeGreaterThan(beforeSize);
  for (const name of ['图标大小', '图标间距', '每行最多', '图标圆角']) {
    const bounds = await settings.getByRole('slider', { name, exact: true }).boundingBox();
    expect(bounds!.y + bounds!.height).toBeLessThan(900);
  }
  await newTab.screenshot({ path: 'artifacts/acceptance/refined-settings-desktop.png' });
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  await expect.poll(async () => (await desktop.boundingBox())?.width).toBe(1440);
  await newTab.reload();
  const reloaded = await openSettings(newTab);
  await reloaded.getByRole('button', { name: '图标与布局', exact: true }).click();
  await expect(reloaded.getByRole('slider', { name: '每行最多', exact: true })).toHaveAttribute(
    'aria-valuenow',
    '4',
  );
  await reloaded.getByRole('button', { name: '关闭', exact: true }).click();
  await desktop.click({ button: 'right', position: { x: 1400, y: 850 } });
  await newTab.getByRole('menuitem', { name: '进入简洁模式', exact: true }).click();
  await desktop.click({ button: 'right', position: { x: 1400, y: 850 } });
  await newTab.getByRole('menuitem', { name: '全部设置', exact: true }).click();
  const focusSettings = newTab.getByRole('dialog', { name: '设置', exact: true });
  await expect(focusSettings).toBeVisible();
  // Radix also hides descendants; select the app-owned navigation region structurally.
  const navigationRegion = newTab
    .locator('.desktop-workspace > div > div')
    .filter({ has: newTab.locator('.site-grid') });
  await expect(navigationRegion).toHaveCount(1);
  const focusState = () =>
    navigationRegion.evaluate((region) => ({
      hidden: region.getAttribute('aria-hidden'),
      inert: region.hasAttribute('inert'),
      height: getComputedStyle(region).maxHeight,
      mode: document.documentElement.dataset.homeMode,
    }));
  await expect
    .poll(focusState)
    .toEqual({ hidden: 'true', inert: true, height: '0px', mode: 'focus' });
  await focusSettings.getByRole('button', { name: '关闭', exact: true }).click();
  await expect
    .poll(focusState)
    .toEqual({ hidden: 'true', inert: true, height: '0px', mode: 'focus' });
});

test('右键与键盘菜单使用同一主题，删除聚焦和Esc返回正确', async ({ newTab }) => {
  const site = newTab
    .locator('.site-card')
    .filter({ has: newTab.getByRole('link') })
    .first();
  const link = site.getByRole('link');
  await expect(site.getByRole('button')).toHaveCount(0);
  const menu = newTab.getByRole('menu');
  for (const theme of ['明亮', '深色']) {
    const settings = await openSettings(newTab);
    await settings.getByRole('button', { name: '壁纸与主题', exact: true }).click();
    await settings.getByRole('combobox', { name: '主题', exact: true }).click();
    await newTab.getByRole('option', { name: theme, exact: true }).click();
    await settings.getByRole('button', { name: '关闭', exact: true }).click();
    await site.hover();
    await link.focus();
    await link.press('Shift+F10');
    await expect(menu).toBeVisible();
    const dropdown = await menuAppearance(menu);
    await menu.press('End');
    const remove = menu.getByRole('menuitem', { name: '删除', exact: true });
    await expect(remove).toBeFocused();
    const dangerColor = await remove.evaluate((node) => getComputedStyle(node).color);
    const ordinaryColor = await menu
      .getByRole('menuitem')
      .first()
      .evaluate((node) => getComputedStyle(node).color);
    expect(dangerColor).not.toBe(ordinaryColor);
    await newTab.screenshot({ path: `artifacts/acceptance/refined-menu-${theme}.png` });
    await menu.press('Escape');
    await expect(link).toBeFocused();
    await site.getByRole('link').click({ button: 'right' });
    await expect(menu).toBeVisible();
    expect(await menuAppearance(menu)).toEqual(dropdown);
    await menu.getByRole('menuitem', { name: '删除', exact: true }).hover();
    expect(await remove.evaluate((node) => getComputedStyle(node).color)).toBe(dangerColor);
    await menu.press('Escape');
  }
});

test('现有图标可手动裁切透明边，保存及重载保留像素和底色', async ({ newTab }) => {
  await newTab.getByRole('button', { name: '添加网站', exact: true }).click();
  let editor = newTab.getByRole('dialog', { name: '添加网站', exact: true });
  await editor.getByLabel('名称', { exact: true }).fill('裁切图标网站');
  await editor.getByLabel('网址', { exact: true }).fill('https://crop.example.test');
  await editor.getByRole('radio', { name: '上传图片', exact: true }).click();
  await editor.locator('input[type="file"]').setInputFiles({
    name: 'transparent-edges.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect x="40" y="40" width="80" height="80" fill="#ef3434"/><circle cx="80" cy="80" r="8" fill="white"/></svg>',
    ),
  });
  await editor.getByRole('button', { name: '自动配色', exact: true }).click();
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor).not.toBeVisible();
  const site = newTab.getByRole('link', { name: '裁切图标网站', exact: true });
  await site.click({ button: 'right' });
  await newTab.getByRole('menuitem', { name: '编辑网站', exact: true }).click();
  editor = newTab.getByRole('dialog', { name: '编辑网站', exact: true });
  await expect(editor.getByLabel('网址', { exact: true })).toBeFocused();
  await editor.getByRole('button', { name: '裁切图片', exact: true }).click();
  const crop = newTab.getByRole('dialog', { name: '裁切图标', exact: true });
  const apply = crop.getByRole('button', { name: '使用裁切结果', exact: true });
  await expect(apply).toBeEnabled();
  await crop.getByRole('slider', { name: '缩放', exact: true }).focus();
  await crop.getByRole('slider', { name: '缩放', exact: true }).press('End');
  await newTab.screenshot({ path: 'artifacts/acceptance/refined-icon-crop.png' });
  await apply.click();
  await expect(crop).not.toBeVisible();
  await expect(editor.getByRole('button', { name: '自动配色', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await newTab.screenshot({ path: 'artifacts/acceptance/refined-icon-editor.png' });
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor).not.toBeVisible();
  await newTab.reload();
  await expect(site.locator('img')).toBeVisible();
  const pixels = await site.locator('img').evaluate(async (element: HTMLImageElement) => {
    await element.decode();
    const image = await createImageBitmap(await (await fetch(element.src)).blob());
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const corner = [...context.getImageData(2, 2, 1, 1).data];
    const center = [
      ...context.getImageData(Math.floor(image.width / 2), Math.floor(image.height / 2), 1, 1).data,
    ];
    image.close();
    return { width: canvas.width, height: canvas.height, corner, center };
  });
  expect(pixels.width).toBe(pixels.height);
  expect(pixels.corner[3]).toBe(255);
  expect(pixels.corner[0]).toBeGreaterThan(200);
  expect(pixels.corner[1]).toBeLessThan(80);
  expect(pixels.center.slice(0, 3).every((channel) => channel > 240)).toBe(true);
  expect(pixels.center[3]).toBe(255);
  expect(
    await site
      .locator('xpath=ancestor::article')
      .evaluate((node) => getComputedStyle(node).backgroundColor),
  ).toBe('rgba(0, 0, 0, 0)');
});
