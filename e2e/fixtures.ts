import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  chromium,
  test as base,
  type BrowserContext,
  type Page,
  type Worker,
} from '@playwright/test';

const extensionPath = fileURLToPath(new URL('../.output/chrome-mv3', import.meta.url));

export const test = base.extend<{
  context: BrowserContext;
  background: Worker;
  extensionId: string;
  newTab: Page;
}>({
  context: async ({ headless, viewport, locale }, use, testInfo) => {
    const manifest: unknown = JSON.parse(await readFile(`${extensionPath}/manifest.json`, 'utf8'));
    if (
      !manifest ||
      typeof manifest !== 'object' ||
      !('manifest_version' in manifest) ||
      manifest.manifest_version !== 3
    ) {
      throw new Error('先运行 pnpm run build，端到端测试需要 Chrome MV3 扩展构建。');
    }

    // An empty profile path makes Playwright create and remove an isolated temporary profile.
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless,
      viewport,
      locale,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    // Keep the default remote wallpaper deterministic and avoid an external
    // service dependency in extension acceptance tests.
    await context.route('https://images.unsplash.com/**', (route) =>
      route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800"><defs><linearGradient id="wallpaper" x2="1" y2="1"><stop stop-color="#101829"/><stop offset="1" stop-color="#253c60"/></linearGradient></defs><rect width="1280" height="800" fill="url(#wallpaper)"/></svg>',
      }),
    );
    // Public catalog contents are tested explicitly; other flows must not
    // depend on changing upstream data or network availability.
    await context.route('https://api.svgl.app/**', (route) =>
      route.fulfill({ contentType: 'application/json', body: '[]' }),
    );
    const cspViolations: string[] = [];
    const watchCsp = (page: Page) =>
      page.on('console', (message) => {
        if (message.type() === 'error' && /Content Security Policy/i.test(message.text()))
          cspViolations.push(message.text());
      });
    context.pages().forEach(watchCsp);
    context.on('page', watchCsp);
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    try {
      await use(context);
      base.expect(cspViolations, 'The production extension must satisfy its CSP.').toEqual([]);
    } finally {
      try {
        if (testInfo.status !== testInfo.expectedStatus || cspViolations.length > 0) {
          for (const [index, page] of context.pages().entries()) {
            if (page.isClosed() || !page.url().startsWith('chrome-extension://')) continue;
            const path = testInfo.outputPath(`extension-page-${index}.png`);
            await page.screenshot({ path, fullPage: true });
            await testInfo.attach(`extension-page-${index}`, { path, contentType: 'image/png' });
          }
          const path = testInfo.outputPath('trace.zip');
          await context.tracing.stop({ path });
          await testInfo.attach('trace', { path, contentType: 'application/zip' });
        } else {
          await context.tracing.stop();
        }
      } finally {
        await context.close();
      }
    }
  },
  background: async ({ context }, use) => {
    const worker =
      context.serviceWorkers().find((item) => item.url().startsWith('chrome-extension://')) ??
      (await context.waitForEvent('serviceworker', {
        predicate: (item) => item.url().startsWith('chrome-extension://'),
      }));
    await use(worker);
  },
  extensionId: async ({ background }, use) => {
    await use(new URL(background.url()).hostname);
  },
  newTab: async ({ page, extensionId }, use) => {
    await page.goto(`chrome-extension://${extensionId}/newtab.html`);
    await page.getByRole('button', { name: '进入首页', exact: true }).click();
    await base.expect(page.locator('.site-grid')).toBeVisible();
    await base.expect(page.getByRole('button', { name: '设置', exact: true })).toBeVisible();
    await use(page);
  },
});

export const expect = test.expect;

export async function addSite(page: Page, title: string, url: string) {
  await page.getByRole('button', { name: '添加网站', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '添加网站', exact: true });
  await editor.getByLabel('名称', { exact: true }).fill(title);
  await editor.getByLabel(/^网址/).fill(url);
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor).not.toBeVisible();
  await expect(page.getByRole('link', { name: title, exact: true })).toBeVisible();
}
