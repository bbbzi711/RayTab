import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Page, Worker } from '@playwright/test';
import { z } from 'zod';
import { expect, test } from './fixtures';

const username = 'webdav-fixture-user';
const appPassword = 'webdav-fixture-app-password';
const syncStateSchema = z.object({
  configured: z.boolean(),
  status: z
    .object({
      lastSuccess: z.string().optional(),
      lastError: z
        .object({
          code: z.string(),
          values: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
        })
        .optional(),
    })
    .optional(),
});

async function syncState(background: Worker) {
  return syncStateSchema.parse(
    await background.evaluate(async () => {
      const api = (globalThis as typeof globalThis & { chrome: typeof browser }).chrome;
      const saved = await api.storage.local.get(['raytab-sync-config', 'raytab-sync-status']);
      // Return only configuration existence and status from this test's isolated profile.
      return {
        configured: saved['raytab-sync-config'] !== undefined,
        status: saved['raytab-sync-status'],
      };
    }),
  );
}

async function openSync(page: Page) {
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const settings = page.getByRole('dialog', { name: '设置', exact: true });
  await settings.getByRole('button', { name: '同步', exact: true }).click();
  return settings;
}

async function webDavFixture(failure?: 401 | 403) {
  const events: {
    method: string;
    path: string;
    status: number;
    ifMatch?: string;
    ifNoneMatch?: string;
  }[] = [];
  let content: string | undefined;
  let version = 0;
  const authorization = `Basic ${Buffer.from(`${username}:${appPassword}`).toString('base64')}`;
  const server = createServer(async (request, response) => {
    const method = request.method ?? '';
    const path = request.url ?? '';
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader(
      'Access-Control-Allow-Headers',
      'Authorization, Content-Type, If-Match, If-None-Match',
    );
    response.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS, PROPFIND');
    response.setHeader('Access-Control-Expose-Headers', 'ETag');
    const send = (status: number, body = '') => {
      events.push({
        method,
        path,
        status,
        ifMatch: request.headers['if-match'],
        ifNoneMatch: request.headers['if-none-match'],
      });
      response.writeHead(status);
      response.end(body);
    };
    if (method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }
    if (request.headers.authorization !== authorization) {
      send(401);
      return;
    }
    if (path === '/dav/' || path === '/') {
      send(method === 'PROPFIND' ? 207 : 403);
      return;
    }
    if (path !== '/dav/raytab.json') {
      send(404);
      return;
    }
    if (failure) {
      send(failure);
      return;
    }
    const etag = `"${version}"`;
    if (method === 'GET') {
      if (content !== undefined) {
        response.setHeader('Content-Type', 'application/json');
        response.setHeader('ETag', etag);
      }
      send(content === undefined ? 404 : 200, content);
      return;
    }
    if (method === 'PUT') {
      if (
        (content === undefined && request.headers['if-none-match'] !== '*') ||
        (content !== undefined && request.headers['if-match'] !== etag)
      ) {
        send(412);
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const created = content === undefined;
      content = Buffer.concat(chunks).toString('utf8');
      response.setHeader('ETag', `"${++version}"`);
      send(created ? 201 : 200);
      return;
    }
    send(405);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    origin,
    url: `${origin}/dav/raytab.json`,
    events,
    content: () => content,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}

for (const addressType of ['nutstore', 'nutstore-no-slash', 'directory', 'file'] as const)
  test(`WebDAV ${addressType} 地址首次创建文件及重载后双向同步成功，错误地址保留草稿`, async ({
    newTab,
    background,
    context,
  }) => {
    const remote = await webDavFixture();
    try {
      if (addressType.startsWith('nutstore'))
        await context.route('https://dav.jianguoyun.com/**', async (route) => {
          const requestUrl = new URL(route.request().url());
          const response = await route.fetch({ url: remote.origin + requestUrl.pathname });
          await route.fulfill({ response });
        });
      const serverAddress =
        addressType === 'nutstore'
          ? 'https://dav.jianguoyun.com/dav/'
          : addressType === 'nutstore-no-slash'
            ? 'https://dav.jianguoyun.com/dav'
            : addressType === 'directory'
              ? remote.origin + '/dav/'
              : remote.url;
      const settings = await openSync(newTab);
      await settings.getByRole('button', { name: '配置同步', exact: true }).click();
      const address = settings.getByLabel('服务器地址', { exact: true });
      const account = settings.getByLabel('用户名', { exact: true });
      const password = settings
        .locator('.sync-connection-editor')
        .getByLabel('密码', { exact: true });
      await account.fill(username);
      await password.fill(appPassword);
      await settings.getByRole('switch', { name: '自动双向同步', exact: true }).click();
      for (const invalidAddress of ['file:///backup.json', 'https://dav.jianguoyun.com/tab']) {
        await address.fill(invalidAddress);
        await settings.getByRole('button', { name: '保存连接', exact: true }).click();
        await expect(address).toHaveAttribute('aria-invalid', 'true');
        await expect(
          settings.getByRole('alert').filter({ hasText: /请输入.*WebDAV 服务器地址/ }),
        ).toBeVisible();
        await expect(address).toHaveValue(invalidAddress);
        await expect(account).toHaveValue(username);
        expect(await password.evaluate((input: HTMLInputElement) => input.value.length)).toBe(
          appPassword.length,
        );
        expect((await syncState(background)).configured).toBe(false);
        await expect(settings.getByRole('button', { name: '双向同步', exact: true })).toHaveCount(
          0,
        );
        expect(remote.events).toEqual([]);
      }
      await address.fill(serverAddress);
      await settings.getByRole('button', { name: '保存连接', exact: true }).click();
      await expect(settings.getByText('已配置 WebDAV', { exact: true })).toBeVisible();
      expect((await syncState(background)).configured).toBe(true);
      expect(remote.events).toEqual([]);
      await settings.getByRole('button', { name: '双向同步', exact: true }).click();
      await expect.poll(async () => (await syncState(background)).status?.lastSuccess).toBeTruthy();
      await expect(settings.getByRole('button', { name: '双向同步', exact: true })).toBeEnabled();
      expect(remote.events.map(({ method, path, status }) => ({ method, path, status }))).toEqual([
        { method: 'GET', path: '/dav/raytab.json', status: 404 },
        { method: 'PUT', path: '/dav/raytab.json', status: 201 },
      ]);
      expect(remote.events[1].ifNoneMatch).toBe('*');
      expect(remote.events[1].ifMatch).toBeUndefined();
      expect(
        z
          .object({ format: z.literal('raytab-backup'), version: z.literal(3) })
          .parse(JSON.parse(remote.content() ?? '')),
      ).toEqual({ format: 'raytab-backup', version: 3 });

      await newTab.reload();
      const reloaded = await openSync(newTab);
      await expect(reloaded.getByText('已配置 WebDAV', { exact: true })).toBeVisible();
      await expect(reloaded.getByText(/上次成功：/)).toBeVisible();
      await reloaded.getByRole('button', { name: '编辑连接', exact: true }).click();
      await expect(reloaded.getByLabel('服务器地址', { exact: true })).toHaveValue(serverAddress);
      await expect(
        reloaded.getByRole('switch', { name: '自动双向同步', exact: true }),
      ).not.toBeChecked();
      await reloaded.getByRole('button', { name: '收起配置', exact: true }).click();
      await reloaded.getByRole('button', { name: '双向同步', exact: true }).click();
      await expect.poll(() => remote.events.length).toBe(4);
      await expect(reloaded.getByRole('button', { name: '双向同步', exact: true })).toBeEnabled();
      const saved = await syncState(background);
      expect(saved.status?.lastSuccess).toBeTruthy();
      expect(saved.status?.lastError).toBeUndefined();
      expect(
        remote.events.slice(2).map(({ method, path, status }) => ({ method, path, status })),
      ).toEqual([
        { method: 'GET', path: '/dav/raytab.json', status: 200 },
        { method: 'PUT', path: '/dav/raytab.json', status: 200 },
      ]);
      expect(remote.events[3].ifMatch).toBe('"1"');
      expect(remote.events[3].ifNoneMatch).toBeUndefined();
      await expect(reloaded.getByRole('alert')).toHaveCount(0);
    } finally {
      await remote.close();
    }
  });

for (const status of [401, 403] as const)
  test(`WebDAV HTTP ${status} 显示 GET 与对应错误，不写文件也不记录同步成功`, async ({
    newTab,
    background,
  }) => {
    const remote = await webDavFixture(status);
    try {
      const settings = await openSync(newTab);
      await settings.getByRole('button', { name: '配置同步', exact: true }).click();
      await settings.getByLabel('服务器地址', { exact: true }).fill(remote.url);
      await settings.getByLabel('用户名', { exact: true }).fill(username);
      await settings
        .locator('.sync-connection-editor')
        .getByLabel('密码', { exact: true })
        .fill(appPassword);
      await settings.getByRole('switch', { name: '自动双向同步', exact: true }).click();
      await settings.getByRole('button', { name: '保存连接', exact: true }).click();
      await expect(settings.getByText('已配置 WebDAV', { exact: true })).toBeVisible();
      await settings.getByRole('button', { name: '双向同步', exact: true }).click();
      const error = settings
        .getByRole('alert')
        .filter({ hasText: `HTTP ${status}，GET` })
        .first();
      await expect(error).toBeVisible();
      await expect(error).toContainText(status === 401 ? '认证被拒绝' : '服务器禁止此操作');
      await expect(settings.getByRole('button', { name: '双向同步', exact: true })).toBeEnabled();
      const saved = await syncState(background);
      expect(saved.status?.lastError).toEqual({
        code: status === 401 ? 'errors.sync.unauthorized' : 'errors.sync.forbidden',
        values: { status, method: 'GET' },
      });
      expect(saved.status?.lastSuccess).toBeUndefined();
      await expect(settings.getByText('尚未完成首次同步', { exact: true })).toBeVisible();
      await expect(newTab.getByText('同步已完成', { exact: true })).toHaveCount(0);
      expect(remote.events.map(({ method, path, status }) => ({ method, path, status }))).toEqual([
        { method: 'GET', path: '/dav/raytab.json', status },
      ]);
      expect(remote.content()).toBeUndefined();
    } finally {
      await remote.close();
    }
  });
