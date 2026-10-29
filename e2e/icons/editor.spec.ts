import { expect, test } from '../fixtures';
import {
  failNextWrite,
  storedState,
  settle,
  noHorizontalOverflow,
  deferred,
  savedIcon,
} from '../helpers';
test('上传图片无额外留白，文字图标和背景选择重载后保留', async ({ newTab }) => {
  await newTab.getByRole('button', { name: '添加网站', exact: true }).click();
  const editor = newTab.getByRole('dialog', { name: '添加网站', exact: true });
  await editor.getByLabel('名称', { exact: true }).fill('透明图标测试');
  await editor.getByLabel('网址', { exact: true }).fill('https://github.com/custom-icon');
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
  await expect(site).toContainText('🙂AB');
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

  await apply.click();
  await expect(crop).not.toBeVisible();
  await expect(editor.getByRole('button', { name: '自动配色', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

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

  await crop.getByRole('button', { name: '使用裁切结果', exact: true }).click();
  await expect(crop).not.toBeVisible();
  await expect(editor.getByLabel('名称', { exact: true })).toHaveValue('小窗口裁切草稿');
  await editor.getByRole('button', { name: '取消', exact: true }).click();
  const confirmation = newTab.getByRole('alertdialog');
  await confirmation.getByRole('button', { name: '继续编辑', exact: true }).click();
  await expect(editor.getByLabel('名称', { exact: true })).toHaveValue('小窗口裁切草稿');
});

test('迟到的网站图标不会覆盖用户后来选择的上传图片', async ({ newTab, context }) => {
  const waiting = deferred();
  const release = deferred();
  const original =
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><path fill="red" d="M0 0h64v64H0z"/></svg>';
  const selected = original.replace('red', 'blue');
  await context.route('https://late-icon.example.test/**', async (route) => {
    if (route.request().url().endsWith('.svg')) {
      waiting.resolve();
      await release.promise;
      await route.fulfill({ contentType: 'image/svg+xml', body: original });
    } else
      await route.fulfill({ contentType: 'text/html', body: '<link rel="icon" href="/slow.svg">' });
  });
  await newTab.getByRole('button', { name: '添加网站', exact: true }).click();
  const editor = newTab.getByRole('dialog', { name: '添加网站', exact: true });
  await editor.getByLabel('名称', { exact: true }).fill('图标选择竞争');
  await editor.getByLabel('网址', { exact: true }).fill('https://late-icon.example.test');
  await editor.getByLabel('名称', { exact: true }).click();
  await waiting.promise;
  await editor.getByRole('radio', { name: '上传图片', exact: true }).click();
  await editor.locator('input[type=file]').setInputFiles({
    name: 'selected.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(selected),
  });
  release.resolve();
  await expect(editor.getByRole('radio', { name: '上传图片', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor).not.toBeVisible();
  expect(await savedIcon(newTab, '图标选择竞争')).toMatchObject({
    type: 'image/svg+xml',
    text: selected,
    icon: { source: 'resource' },
  });
});
