import { createServer } from 'node:http';

import type { AddressInfo } from 'node:net';

import { expect, test } from '../fixtures';
import { openSettings } from '../helpers';
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
    await settings.getByLabel('服务器地址', { exact: true }).fill(url);
    await settings.getByRole('button', { name: '保存连接', exact: true }).click();
    await expect(settings.getByText('已配置 WebDAV', { exact: true })).toBeVisible();
    await expect(settings.getByLabel('服务器地址', { exact: true })).not.toBeVisible();
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
