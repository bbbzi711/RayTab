import { expect, test } from '../fixtures';
import { savedIcon } from '../helpers';
import type { Locator } from '@playwright/test';

const ns = 'xmlns="http://www.w3.org/2000/svg"';
const mark = `<svg ${ns} viewBox="0 0 24 24"><path fill="#1677ff" d="M4 4h16v16H4z"/></svg>`;

async function visibleArtwork(link: Locator) {
  return link.locator('.icon-artwork img').evaluate(async (image: HTMLImageElement) => {
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0, 128, 128);
    const pixels = context.getImageData(0, 0, 128, 128).data;
    let left = 128,
      top = 128,
      right = -1,
      bottom = -1;
    for (let y = 0; y < 128; y++)
      for (let x = 0; x < 128; x++) {
        if (pixels[(y * 128 + x) * 4 + 3] <= 24) continue;
        left = Math.min(left, x);
        right = Math.max(right, x + 1);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y + 1);
      }
    if (right < 0) throw new Error('The icon has no visible pixels');
    const frame = image.closest('.site-icon-frame')!.getBoundingClientRect();
    const graphic = image.getBoundingClientRect();
    return {
      left: (graphic.left + (left / 128) * graphic.width - frame.left) / frame.width,
      right: (graphic.left + (right / 128) * graphic.width - frame.left) / frame.width,
      top: (graphic.top + (top / 128) * graphic.height - frame.top) / frame.height,
      bottom: (graphic.top + (bottom / 128) * graphic.height - frame.top) / frame.height,
    };
  });
}

test('真实解析网页与 Manifest，保留小 viewBox SVG 原文，忽略仅用于蒙版和单色的图片', async ({
  newTab,
  context,
}) => {
  const requests: string[] = [];
  await context.route('https://manifest.example.test/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    requests.push(path);
    if (path === '/')
      return route.fulfill({
        contentType: 'text/html',
        body: '<title>Manifest 网站</title><link rel="manifest" href="/app.webmanifest">',
      });
    if (path === '/app.webmanifest')
      return route.fulfill({
        json: {
          icons: [
            { src: '/mask.svg', sizes: 'any', purpose: 'maskable' },
            { src: '/mono.svg', sizes: 'any', purpose: 'monochrome' },
            { src: '/mark.svg', sizes: 'any', purpose: 'any maskable' },
          ],
        },
      });
    if (path === '/mark.svg')
      return route.fulfill({ contentType: 'image/svg+xml; charset=utf-8', body: mark });
    return route.fulfill({ status: 404 });
  });
  await newTab.getByRole('button', { name: '添加网站', exact: true }).click();
  const editor = newTab.getByRole('dialog', { name: '添加网站', exact: true });
  await editor.getByLabel('网址', { exact: true }).fill('https://manifest.example.test');
  await editor.getByRole('button', { name: '获取网站图标', exact: true }).click();
  await expect(editor.getByLabel('名称', { exact: true })).toHaveValue('Manifest 网站');
  await expect(editor.locator('.site-edit-preview img')).toBeVisible();
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor).not.toBeVisible();
  expect(await savedIcon(newTab, 'Manifest 网站')).toMatchObject({
    type: 'image/svg+xml',
    text: mark,
  });
  expect(requests).not.toContain('/mask.svg');
  expect(requests).not.toContain('/mono.svg');
  await context.setOffline(true);
  await newTab.reload();
  expect(await savedIcon(newTab, 'Manifest 网站')).toMatchObject({
    type: 'image/svg+xml',
    text: mark,
  });
  await expect(
    newTab.getByRole('link', { name: 'Manifest 网站', exact: true }).locator('img'),
  ).toBeVisible();
});

test('不能作为独立图片的 SVG 不进入资源库，使用安全图片且不请求外部引用', async ({
  newTab,
  context,
}) => {
  const rejected = [
    `<svg ${ns}><script>alert(1)</script></svg>`,
    `<svg ${ns} onload="alert(1)"><path d="M0 0h24v24H0z"/></svg>`,
    `<svg ${ns}><image href="data:image/png;base64,AA=="/></svg>`,
    `<svg ${ns}><foreignObject><div>HTML</div></foreignObject></svg>`,
    `<svg ${ns}><use href="https://external-image.example/leak.svg#x"/></svg>`,
    `<svg ${ns}><style>path{fill:url(https://external-image.example/leak.svg)}</style></svg>`,
    `<svg ${ns}><set attributeName="href" to="https://external-image.example/leak.svg"/></svg>`,
    `<svg ${ns}><path></svg>`,
  ];
  let external = 0;
  await context.route('https://external-image.example/**', (route) => {
    external++;
    return route.abort();
  });
  await context.route('https://invalid-vector.example.test/**', (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('.svg'))
      return route.fulfill({
        contentType: 'image/svg+xml',
        body: rejected[Number(pathname.match(/\d+/)![0])],
      });
    return route.fulfill({
      contentType: 'text/html',
      body: `<title>独立图片校验</title><link rel="icon" sizes="any" href="${pathname}.svg">`,
    });
  });
  await newTab.getByRole('button', { name: '添加网站', exact: true }).click();
  const editor = newTab.getByRole('dialog', { name: '添加网站', exact: true });
  await editor.getByLabel('名称', { exact: true }).fill('保留校验草稿');
  for (let index = 0; index < rejected.length; index++) {
    await editor
      .getByLabel('网址', { exact: true })
      .fill(`https://invalid-vector.example.test/case-${index}`);
    await editor.getByRole('button', { name: '获取网站图标', exact: true }).click();
    await expect(editor.getByRole('alert')).toBeVisible();
    await expect(editor.getByLabel('名称', { exact: true })).toHaveValue('保留校验草稿');
    await expect(editor.getByRole('button', { name: '保存', exact: true })).toBeEnabled();
  }
  expect(external).toBe(0);
  // A valid image is still selectable after failures, and its vector bytes survive saving.
  await editor.getByRole('radio', { name: '上传图片', exact: true }).click();
  await editor
    .locator('input[type=file]')
    .setInputFiles({ name: 'valid.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(mark) });
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor).not.toBeVisible();
  expect(await savedIcon(newTab, '保留校验草稿')).toMatchObject({
    type: 'image/svg+xml',
    text: mark,
  });
});

test('自动图标按可见图形统一大小与居中，完整底图和用户上传保留构图', async ({
  newTab,
  context,
}) => {
  const icons = [
    `<svg ${ns} width="128" height="128"><rect x="32" y="32" width="64" height="64" fill="#1677ff"/></svg>`,
    `<svg ${ns} width="256" height="256"><rect x="160" y="16" width="64" height="64" fill="#1677ff"/></svg>`,
    `<svg ${ns} width="128" height="128"><rect width="128" height="128" fill="#1677ff"/><circle cx="64" cy="64" r="24" fill="white"/></svg>`,
  ];
  await context.route('https://artwork.example.test/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const index = Number(path.match(/\d+/)?.[0] ?? 0);
    return route.fulfill({
      contentType: path.endsWith('.svg') ? 'image/svg+xml' : 'text/html',
      body: path.endsWith('.svg')
        ? icons[index]
        : `<link rel="icon" sizes="any" href="/mark-${index}.svg">`,
    });
  });
  for (let index = 0; index < icons.length; index++) {
    await newTab.getByRole('button', { name: '添加网站', exact: true }).click();
    const editor = newTab.getByRole('dialog', { name: '添加网站', exact: true });
    await editor.getByLabel('名称', { exact: true }).fill(`图形 ${index}`);
    await editor.getByLabel('网址', { exact: true }).fill(`https://artwork.example.test/${index}`);
    await editor.getByRole('button', { name: '获取网站图标', exact: true }).click();
    await expect(editor.locator('.site-edit-preview img')).toBeVisible();
    await editor.getByRole('button', { name: '保存', exact: true }).click();
    await expect(editor).not.toBeVisible();
  }
  const first = newTab.getByRole('link', { name: '图形 0', exact: true });
  const padded = newTab.getByRole('link', { name: '图形 1', exact: true });
  await expect
    .poll(async () => {
      const a = await visibleArtwork(first),
        b = await visibleArtwork(padded);
      return Math.abs(a.right - a.left - (b.right - b.left));
    })
    .toBeLessThan(0.03);
  for (const link of [first, padded]) {
    const bounds = await visibleArtwork(link);
    expect(bounds.left).toBeGreaterThan(0.08);
    expect(bounds.right).toBeLessThan(0.92);
    expect((bounds.left + bounds.right) / 2).toBeCloseTo(0.5, 1);
    expect((bounds.top + bounds.bottom) / 2).toBeCloseTo(0.5, 1);
  }
  const tile = await visibleArtwork(newTab.getByRole('link', { name: '图形 2', exact: true }));
  expect(tile.right - tile.left).toBeCloseTo(1, 1);
  await padded.click({ button: 'right' });
  await newTab.getByRole('menuitem', { name: '编辑网站', exact: true }).click();
  const editor = newTab.getByRole('dialog', { name: '编辑网站', exact: true });
  await editor.getByRole('button', { name: '裁切图片', exact: true }).click();
  const crop = newTab.getByRole('dialog', { name: '裁切图标', exact: true });
  await crop.getByRole('button', { name: '使用裁切结果', exact: true }).click();
  await expect(crop).not.toBeVisible();
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor).not.toBeVisible();
  await newTab.reload();
  const cropped = await visibleArtwork(padded);
  expect(cropped.right - cropped.left).toBeCloseTo(0.25, 1);
  expect(await savedIcon(newTab, '图形 1')).toMatchObject({
    icon: { source: 'auto', fit: 'original' },
  });
  await padded.click({ button: 'right' });
  await newTab.getByRole('menuitem', { name: '编辑网站', exact: true }).click();
  await editor.getByRole('radio', { name: '上传图片', exact: true }).click();
  await editor.locator('input[type=file]').setInputFiles({
    name: 'original.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(icons[1]),
  });
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor).not.toBeVisible();
  await context.setOffline(true);
  await newTab.reload();
  const original = await visibleArtwork(padded);
  expect(original.right - original.left).toBeCloseTo(0.25, 1);
  expect(await savedIcon(newTab, '图形 1')).toMatchObject({
    type: 'image/svg+xml',
    text: icons[1],
  });
});
