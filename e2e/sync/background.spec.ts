import { addSite, expect, test } from '../fixtures';
import { openSettings } from '../helpers';
import { username, appPassword, webDavFixture } from './webdav-fixture';

test('后台终止后释放锁，闹钟冷启动可完成同步并保留本地网站', async ({
  newTab,
  context,
  background,
}) => {
  const remote = await webDavFixture();
  const protocol = await context.newCDPSession(newTab);
  try {
    await addSite(newTab, '后台恢复网站', 'https://background.example.test/keep?q=1#fragment');
    const settings = await openSettings(newTab, '同步');
    await settings.getByRole('button', { name: '配置同步', exact: true }).click();
    await settings.getByLabel('服务器地址', { exact: true }).fill(remote.url);
    await settings.getByLabel('用户名', { exact: true }).fill(username);
    await settings
      .getByRole('form', { name: '同步连接', exact: true })
      .getByLabel('密码', { exact: true })
      .fill(appPassword);
    await expect(settings.getByRole('switch', { name: '自动双向同步', exact: true })).toBeChecked();
    await settings.getByRole('button', { name: '保存连接', exact: true }).click();
    await expect(settings.getByText('已配置 WebDAV', { exact: true })).toBeVisible();
    await settings.getByRole('button', { name: '关闭', exact: true }).click();
    await background.evaluate(
      () =>
        new Promise<void>((acquired) => {
          void navigator.locks.request('raytab-sync', async () => {
            acquired();
            await new Promise<void>(() => {});
          });
        }),
    );
    expect(
      await newTab.evaluate(() =>
        navigator.locks.request('raytab-sync', { ifAvailable: true }, (lock) => Boolean(lock)),
      ),
    ).toBe(false);
    let stopped = false;
    let restarted = false;
    protocol.on('ServiceWorker.workerVersionUpdated', ({ versions }) => {
      if (
        stopped &&
        versions.some(
          (version) =>
            version.scriptURL === background.url() && version.runningStatus === 'running',
        )
      )
        restarted = true;
    });
    await protocol.send('ServiceWorker.enable');
    await protocol.send('ServiceWorker.stopAllWorkers');
    await expect
      .poll(() =>
        newTab.evaluate(() =>
          navigator.locks.request('raytab-sync', { ifAvailable: true }, (lock) => Boolean(lock)),
        ),
      )
      .toBe(true);
    stopped = true;
    await newTab.evaluate(async () => {
      const api = (globalThis as typeof globalThis & { chrome: typeof browser }).chrome;
      await api.alarms.create('raytab-sync', { when: Date.now() + 100 });
    });
    await expect.poll(() => restarted).toBe(true);
    await expect.poll(() => remote.content()).toContain('后台恢复网站');
    const savedStatus = () =>
      newTab.evaluate(async () => {
        const api = (globalThis as typeof globalThis & { chrome: typeof browser }).chrome;
        return (await api.storage.local.get('raytab-sync-status'))['raytab-sync-status'];
      });
    await expect
      .poll(savedStatus)
      .toMatchObject({ lastSuccess: expect.any(String), conflicts: [] });
    expect(await savedStatus()).not.toHaveProperty('lastError');
    await newTab.reload();
    await expect(newTab.getByRole('link', { name: '后台恢复网站', exact: true })).toHaveAttribute(
      'href',
      'https://background.example.test/keep?q=1#fragment',
    );
  } finally {
    await protocol.detach();
    await remote.close();
  }
});
