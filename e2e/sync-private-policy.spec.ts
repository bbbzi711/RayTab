import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { z } from 'zod';
import { expect, test } from './fixtures';

const storedObjectSchema = z.record(z.string(), z.unknown());

test('受保护私密空间只允许手动同步，旧自动配置由后台暂停且不联网重试', async ({
  newTab,
  background,
}) => {
  let requests = 0;
  const server = createServer((_request, response) => {
    requests++;
    response.writeHead(404);
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/raytab.json`;
  const vaultPassword = 'private-policy-vault';
  const syncPassword = 'private-policy-sync-secret';
  try {
    await newTab.getByRole('button', { name: '设置', exact: true }).click();
    const settings = newTab.getByRole('dialog', { name: '设置', exact: true });
    await settings.getByRole('button', { name: '通用', exact: true }).click();
    await settings.getByText('设置密码保护', { exact: true }).click();
    await settings.getByLabel('密码', { exact: true }).fill(vaultPassword);
    await settings.getByRole('button', { name: '启用密码保护', exact: true }).click();
    await expect(settings.getByText(/私密空间已加密并锁定/)).toBeVisible();
    await settings.getByRole('button', { name: '关闭', exact: true }).click();
    await newTab.getByRole('button', { name: '私密空间', exact: true }).click();
    const unlock = newTab.getByRole('dialog', { name: '解锁私密空间', exact: true });
    await unlock.getByLabel('输入私密空间密码', { exact: true }).fill(vaultPassword);
    await unlock.getByRole('button', { name: '解锁', exact: true }).click();
    await expect(unlock).not.toBeVisible();

    await newTab.getByRole('button', { name: '设置', exact: true }).click();
    await settings.getByRole('button', { name: '同步', exact: true }).click();
    await settings.getByRole('button', { name: '配置同步', exact: true }).click();
    await settings.getByLabel('服务器地址', { exact: true }).fill(url);
    const automatic = settings.getByRole('switch', { name: '自动双向同步', exact: true });
    await expect(automatic).toBeChecked();
    await settings.getByRole('switch', { name: '同步私密空间', exact: true }).click();
    await settings.getByLabel('私密同步加密密码', { exact: true }).fill(syncPassword);
    await settings.getByRole('button', { name: '保存连接', exact: true }).click();
    await expect(settings.getByRole('alert')).toContainText(
      '受密码保护的私密空间需要解锁后手动同步',
    );
    expect(
      await background.evaluate(async () => {
        const api = (globalThis as typeof globalThis & { chrome: typeof browser }).chrome;
        return (await api.storage.local.get('raytab-sync-config'))['raytab-sync-config'];
      }),
    ).toBeUndefined();
    await expect(settings.getByLabel('私密同步加密密码', { exact: true })).toHaveValue(
      syncPassword,
    );
    await automatic.click();
    await settings.getByRole('button', { name: '保存连接', exact: true }).click();
    await expect(settings.getByText('已配置 WebDAV', { exact: true })).toBeVisible();
    const manualConfig = storedObjectSchema.parse(
      await background.evaluate(async () => {
        const api = (globalThis as typeof globalThis & { chrome: typeof browser }).chrome;
        return (await api.storage.local.get('raytab-sync-config'))['raytab-sync-config'];
      }),
    );
    expect(manualConfig).toMatchObject({ automatic: false, includePrivate: true });
    expect(JSON.stringify(manualConfig)).not.toContain(syncPassword);
    expect(requests).toBe(0);

    await newTab.reload();
    await newTab.getByRole('button', { name: '设置', exact: true }).click();
    await settings.getByRole('button', { name: '同步', exact: true }).click();
    await expect(settings.getByText('已配置 WebDAV', { exact: true })).toBeVisible();
    await settings.getByRole('button', { name: '编辑连接', exact: true }).click();
    await expect(automatic).not.toBeChecked();
    await expect(settings.getByRole('switch', { name: '同步私密空间', exact: true })).toBeChecked();
    await expect(settings.getByLabel('私密同步加密密码', { exact: true })).toHaveValue('');
    const persisted = await newTab.evaluate(async () => {
      const api = (globalThis as typeof globalThis & { chrome: typeof browser }).chrome;
      return {
        extension: await api.storage.local.get(null),
        startup: Object.values(localStorage).join('\n'),
      };
    });
    expect(persisted.extension['raytab-sync-config']).toMatchObject({
      automatic: false,
      includePrivate: true,
    });
    expect(JSON.stringify(persisted)).not.toContain(syncPassword);
    expect(JSON.stringify(persisted)).not.toContain(vaultPassword);

    // Existing installations can have enabled automatic sync before adding password protection.
    await background.evaluate(async (config) => {
      const api = (globalThis as typeof globalThis & { chrome: typeof browser }).chrome;
      await api.storage.local.set({ 'raytab-sync-config': { ...config, automatic: true } });
    }, manualConfig);
    const fireAlarm = () =>
      background.evaluate(async () => {
        const api = (globalThis as typeof globalThis & { chrome: typeof browser }).chrome;
        await new Promise<void>((resolve) => {
          const fired: Parameters<typeof api.alarms.onAlarm.addListener>[0] = (alarm) => {
            if (alarm.name !== 'raytab-sync') return;
            api.alarms.onAlarm.removeListener(fired);
            resolve();
          };
          api.alarms.onAlarm.addListener(fired);
          void api.alarms.create('raytab-sync', { when: Date.now() + 20 });
        });
      });
    const readStatus = () =>
      background.evaluate(async () => {
        const api = (globalThis as typeof globalThis & { chrome: typeof browser }).chrome;
        return (await api.storage.local.get('raytab-sync-status'))['raytab-sync-status'];
      });
    await fireAlarm();
    await expect.poll(readStatus).toMatchObject({ automaticPaused: 'protected-private' });
    const pausedStatus = storedObjectSchema.parse(await readStatus());
    expect(pausedStatus.retryCount).toBeUndefined();
    expect(pausedStatus.nextRetryAt).toBeUndefined();
    expect(pausedStatus.lastError).toBeUndefined();
    await fireAlarm();
    await expect
      .poll(() =>
        background.evaluate(() =>
          navigator.locks.request('raytab-sync', { ifAvailable: true }, (lock) => Boolean(lock)),
        ),
      )
      .toBe(true);
    expect(await readStatus()).toEqual(pausedStatus);
    expect(requests).toBe(0);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
