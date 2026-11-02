import { readFile } from 'node:fs/promises';
import type { FullConfig } from '@playwright/test';
import { extensionPath, launchExtensionContext } from './browser';

export default async function globalSetup(config: FullConfig) {
  const manifest: unknown = JSON.parse(await readFile(`${extensionPath}/manifest.json`, 'utf8'));
  if (
    !manifest ||
    typeof manifest !== 'object' ||
    !('manifest_version' in manifest) ||
    manifest.manifest_version !== 3
  ) {
    throw new Error('先运行 pnpm run build，端到端测试需要 Chrome MV3 扩展构建。');
  }

  const { headless, viewport, locale } = config.projects[0].use;
  try {
    const context = await launchExtensionContext({ headless, viewport, locale });
    try {
      const worker =
        context.serviceWorkers().find((item) => item.url().startsWith('chrome-extension://')) ??
        (await context.waitForEvent('serviceworker', {
          predicate: (item) => item.url().startsWith('chrome-extension://'),
          timeout: config.projects[0].timeout,
        }));
      await worker.evaluate(() => true);
    } finally {
      await context.close();
    }
  } catch (cause) {
    throw new Error('浏览器启动预检失败，整轮扩展测试已停止，不会继续逐个用例启动浏览器。', {
      cause,
    });
  }
}
