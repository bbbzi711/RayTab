import { fileURLToPath } from 'node:url';
import { chromium, type BrowserContextOptions, type LaunchOptions } from '@playwright/test';

export const extensionPath = fileURLToPath(new URL('../.output/chrome-mv3', import.meta.url));

type ExtensionBrowserOptions = Pick<LaunchOptions, 'headless'> &
  Pick<BrowserContextOptions, 'viewport' | 'locale'>;

export function launchExtensionContext(options: ExtensionBrowserOptions) {
  // macOS app registration aborts before Chromium can connect inside Codex Seatbelt.
  // Reject before spawning a process, rather than creating a system crash dialog.
  if (process.platform === 'darwin' && process.env.CODEX_SANDBOX === 'seatbelt') {
    throw new Error(
      '当前是 Codex 的 macOS Seatbelt 沙箱，Chromium 会在系统应用注册阶段崩溃。' +
        '已阻止浏览器启动；请通过批准的沙箱外命令，或在本机终端运行 pnpm run test:e2e。',
    );
  }

  // An empty profile path creates an isolated temporary profile, removed on close.
  return chromium.launchPersistentContext('', {
    channel: 'chromium',
    ...options,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
}
