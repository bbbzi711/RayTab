import { fileURLToPath } from 'node:url';
import { chromium, type BrowserContextOptions, type LaunchOptions } from '@playwright/test';
import { fixtureSpki } from './sync/tls-fixture.ts';

export const extensionPath = fileURLToPath(new URL('../.output/chrome-mv3', import.meta.url));

type ExtensionBrowserOptions = Pick<LaunchOptions, 'headless'> &
  Pick<BrowserContextOptions, 'viewport' | 'locale'>;

export async function launchExtensionContext(options: ExtensionBrowserOptions) {
  // macOS app registration aborts before Chromium can connect inside Codex Seatbelt.
  // Reject before spawning a process, rather than creating a system crash dialog.
  if (process.platform === 'darwin' && process.env.CODEX_SANDBOX === 'seatbelt') {
    throw new Error(
      '当前是 Codex 的 macOS Seatbelt 沙箱，Chromium 会在系统应用注册阶段崩溃。' +
        '已阻止浏览器启动；请通过批准的沙箱外命令，或在本机终端运行 pnpm run test:e2e。',
    );
  }

  const executablePath = process.env.RAYTAB_E2E_BROWSER_EXECUTABLE;
  // An empty profile path creates an isolated temporary profile, removed on close.
  const context = await chromium.launchPersistentContext('', {
    ...(executablePath ? { executablePath } : { channel: 'chromium' }),
    ...options,
    ignoreDefaultArgs: executablePath ? ['--disable-extensions'] : undefined,
    args: [
      ...(executablePath
        ? ['--enable-unsafe-extension-debugging']
        : [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]),
      `--ignore-certificate-errors-spki-list=${fixtureSpki}`,
    ],
  });
  if (executablePath) {
    try {
      // Branded Chrome no longer supports --load-extension. CDP loads the same
      // production build in this isolated automation profile, without store installation.
      const browser = context.browser();
      if (!browser) throw new Error('正式浏览器验证需要浏览器级 CDP 会话。');
      const session = await browser.newBrowserCDPSession();
      await session.send('Extensions.loadUnpacked', { path: extensionPath });
      await session.detach();
    } catch (error) {
      await context.close();
      throw error;
    }
  }
  return context;
}
