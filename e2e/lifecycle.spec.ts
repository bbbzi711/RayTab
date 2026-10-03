import { expect, test } from './fixtures';

test('终止后台释放原生锁，闹钟重新启动扩展后台', async ({ newTab, context, background }) => {
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
  const protocol = await context.newCDPSession(newTab);
  let stopped = false;
  let restarted = false;
  protocol.on('ServiceWorker.workerVersionUpdated', ({ versions }) => {
    if (
      stopped &&
      versions.some(
        (version) => version.scriptURL === background.url() && version.runningStatus === 'running',
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
  await protocol.detach();
});
