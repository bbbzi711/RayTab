import { createServer } from 'node:http';

import type { AddressInfo } from 'node:net';

import { expect, test } from '../fixtures';
import { readSiteImage } from '../helpers';
import { artworkSource } from '../artwork';
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
  const large = await png(1024);
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
    await expect(
      editor.getByRole('complementary', { name: '图标预览', exact: true }).locator('img'),
    ).toBeVisible();
    expect(requests).toEqual(
      expect.arrayContaining(['/', '/tiny.png', '/broken.png', '/touch.png']),
    );
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
          background: getComputedStyle(image.closest('[data-testid="site-icon"]')!).backgroundColor,
        };
      }),
    ).toMatchObject({ width: 512, background: 'rgb(255, 255, 255)' });
    expect(await readSiteImage(newTab, '高清测试')).toMatchObject({ type: 'image/png' });
    const savedBytes = await site
      .locator('img')
      .evaluate(async (image: HTMLImageElement) =>
        Array.from(new Uint8Array(await (await fetch(image.src)).arrayBuffer())),
      );
    expect(savedBytes.length).toBeLessThan(large.length);
    const pixels = await site.locator('img').evaluate(async (image: HTMLImageElement) => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      return {
        corner: [...context.getImageData(0, 0, 1, 1).data],
        center: [...context.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data],
      };
    });
    expect(pixels).toEqual({ corner: [0, 0, 0, 0], center: [34, 102, 221, 255] });
    await newTab.getByRole('button', { name: '添加网站', exact: true }).click();
    await editor
      .getByLabel('网址', { exact: true })
      .fill(`http://127.0.0.1:${(server.address() as AddressInfo).port}/vector-page`);
    await editor.getByRole('button', { name: '获取网站图标', exact: true }).click();
    await expect(editor.getByLabel('名称', { exact: true })).toHaveValue('矢量测试');
    await expect(
      editor.getByRole('complementary', { name: '图标预览', exact: true }).locator('img'),
    ).toBeVisible();
    await editor.getByRole('button', { name: '保存', exact: true }).click();
    await expect(editor).not.toBeVisible();
    await newTab.reload();
    const vector = newTab
      .getByRole('link', { name: '矢量测试', exact: true })
      .getByTestId('site-icon');
    await expect(vector).toBeVisible();
    expect(await artworkSource(vector)).toMatchObject({ vector: true, local: true });
    expect(await readSiteImage(newTab, '矢量测试')).toMatchObject({ type: 'image/svg+xml' });
    expect(requests).toContain('/mark.svg');
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('私密空间直接读取 PWA 高清图标，不向公共服务发送域名', async ({ newTab, context }) => {
  const directRequests: string[] = [];
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
  await expect(
    editor.getByRole('complementary', { name: '图标预览', exact: true }).locator('img'),
  ).toBeVisible();
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor).not.toBeVisible();
  expect(directRequests).toEqual(
    expect.arrayContaining(['/account', '/app.webmanifest', '/mark.svg']),
  );
});
