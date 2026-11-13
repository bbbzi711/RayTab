import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import { addSite, expect, test } from '../fixtures';
import { openSettings } from '../helpers';
import { fixtureTls } from './tls-fixture';
import { username, appPassword, webDavFixture } from './webdav-fixture';

for (const [method, status, scheme] of [
  ['GET', 301, 'https'],
  ['GET', 302, 'http'],
  ['PUT', 307, 'https'],
  ['PUT', 308, 'http'],
] as const) {
  test(`${method} ${status} 跳转到 ${scheme} 时不转发凭据或备份，保留本地数据和连接`, async ({
    newTab,
    background,
  }) => {
    let received = 0;
    const target =
      scheme === 'https'
        ? createHttpsServer(fixtureTls, (_req, res) => {
            received++;
            res.end('{}');
          })
        : createHttpServer((_req, res) => {
            received++;
            res.end('{}');
          });
    await new Promise<void>((resolve) => target.listen(0, '127.0.0.1', resolve));
    const destination = `${scheme}://127.0.0.1:${(target.address() as AddressInfo).port}/collect`;
    const events: string[] = [];
    const source = createHttpsServer(fixtureTls, (req, res) => {
      events.push(req.method ?? '');
      if (req.method === method) {
        res.writeHead(status, { Location: destination });
      } else res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => source.listen(0, '127.0.0.1', resolve));
    const url = `https://127.0.0.1:${(source.address() as AddressInfo).port}/backup.json`;
    try {
      await addSite(newTab, '保留的网站', 'https://keep.example.test/');
      const settings = await openSettings(newTab, '云端同步');
      await settings.getByRole('button', { name: '配置同步', exact: true }).click();
      await settings.getByLabel('服务器地址', { exact: true }).fill(url);
      await settings.getByLabel('用户名', { exact: true }).fill(username);
      await settings
        .getByRole('form', { name: '同步连接', exact: true })
        .getByLabel('密码', { exact: true })
        .fill(appPassword);
      await settings.getByRole('switch', { name: '自动双向同步', exact: true }).click();
      await settings.getByRole('button', { name: '保存连接', exact: true }).click();
      await settings.getByRole('button', { name: '双向同步', exact: true }).click();
      await expect(
        settings.getByRole('alert').filter({ hasText: '最终 HTTPS 地址' }).first(),
      ).toBeVisible();
      expect(received).toBe(0);
      expect(events).toEqual(method === 'GET' ? ['GET'] : ['GET', 'PUT']);
      const result = await background.evaluate(async () => {
        const api = (globalThis as typeof globalThis & { chrome: typeof browser }).chrome;
        const saved = await api.storage.local.get(['raytab-sync-status', 'raytab-sync-baseline']);
        return { status: saved['raytab-sync-status'], baseline: saved['raytab-sync-baseline'] };
      });
      expect(result.status).not.toHaveProperty('lastSuccess');
      expect(result.status).toMatchObject({ lastError: { code: 'errors.sync.redirectBlocked' } });
      expect(result.baseline).toBeUndefined();
      expect(JSON.stringify(result)).not.toContain(appPassword);
      await newTab.reload();
      await expect(newTab.getByRole('link', { name: '保留的网站', exact: true })).toBeVisible();
      const reloaded = await openSettings(newTab, '云端同步');
      await reloaded.getByRole('button', { name: '编辑连接', exact: true }).click();
      await expect(reloaded.getByLabel('服务器地址', { exact: true })).toHaveValue(url);
      await expect(reloaded.getByLabel('用户名', { exact: true })).toHaveValue(username);
    } finally {
      for (const server of [source, target]) {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
    }
  });
}

test('旧 HTTP 连接不会联网，仍能编辑为 HTTPS 并恢复同步', async ({ newTab, background }) => {
  let insecureRequests = 0;
  const oldServer = createHttpServer((_req, res) => {
    insecureRequests++;
    res.end('{}');
  });
  await new Promise<void>((resolve) => oldServer.listen(0, '127.0.0.1', resolve));
  const oldUrl = `http://127.0.0.1:${(oldServer.address() as AddressInfo).port}/backup.json`;
  const remote = await webDavFixture();
  try {
    await background.evaluate(
      async (config) => {
        const api = (globalThis as typeof globalThis & { chrome: typeof browser }).chrome;
        await api.storage.local.set({ 'raytab-sync-config': config });
      },
      {
        connection: { type: 'webdav', url: oldUrl, username, password: appPassword },
        automatic: false,
        includePrivate: false,
      },
    );
    await newTab.reload();
    const settings = await openSettings(newTab, '云端同步');
    await settings.getByRole('button', { name: '双向同步', exact: true }).click();
    await expect(
      settings.getByRole('alert').filter({ hasText: 'HTTPS 地址' }).first(),
    ).toBeVisible();
    expect(insecureRequests).toBe(0);
    await settings.getByRole('button', { name: '编辑连接', exact: true }).click();
    await expect(settings.getByLabel('服务器地址', { exact: true })).toHaveValue(oldUrl);
    await expect(settings.getByLabel('用户名', { exact: true })).toHaveValue(username);
    await settings.getByLabel('服务器地址', { exact: true }).fill(remote.url);
    await settings.getByRole('button', { name: '保存连接', exact: true }).click();
    await settings.getByRole('button', { name: '双向同步', exact: true }).click();
    await expect.poll(() => remote.content()).toBeTruthy();
    await expect(settings.getByText(/上次成功：/)).toBeVisible();
    expect(insecureRequests).toBe(0);
  } finally {
    await remote.close();
    oldServer.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      oldServer.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
