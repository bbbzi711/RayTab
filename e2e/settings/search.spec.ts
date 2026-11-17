import { createServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import { expect, test as base } from '../fixtures';
import { failNextWrite, openSettings } from '../helpers';
import { fixtureTls } from '../sync/tls-fixture';

const test = base.extend({
  extensionArgs: async ({}, use) => {
    const server = createServer(fixtureTls, (request, response) => {
      const url = new URL(request.url ?? '', 'https://localhost');
      if (url.pathname !== '/search' || !url.searchParams.has('q')) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { 'Content-Type': 'text/html' }).end('<title>Search result</title>');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const { port } = server.address() as AddressInfo;
      // Browser-owned navigations can start before Playwright attaches to the new tab.
      await use([
        '--no-proxy-server',
        `--host-resolver-rules=MAP www.google.com 127.0.0.1:${port}, MAP www.bing.com 127.0.0.1:${port}`,
      ]);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  },
});

test.beforeEach(async ({ context }) => {
  await context.route('https://www.google.com/search?**', (route) => route.continue());
  await context.route('https://www.bing.com/search?**', (route) => route.continue());
});

test('真实 Chrome 新标签页初次选中默认，使用浏览器引擎并遵循打开位置偏好', async ({
  newTab,
  context,
}) => {
  await newTab.goto('chrome://newtab/');
  const capability = await newTab.evaluate(async () => {
    const api = (globalThis as typeof globalThis & { chrome: typeof browser }).chrome;
    return {
      manifest: api.runtime.getManifest().permissions?.includes('search'),
      granted: await api.permissions.contains({ permissions: ['search'] }),
      query: typeof api.search?.query,
    };
  });
  expect(capability).toEqual({ manifest: true, granted: true, query: 'function' });
  const input = '中文 空格 & + / ?';
  await newTab.getByRole('button', { name: '切换搜索引擎', exact: true }).click();
  await expect(newTab.getByRole('menuitemradio', { name: '默认', exact: true })).toBeChecked();
  await expect(newTab.getByRole('menuitemradio')).toHaveText([
    '默认',
    '必应',
    'Google',
    '百度',
    'DuckDuckGo',
  ]);
  await newTab.keyboard.press('Escape');
  await newTab.getByRole('textbox', { name: '搜索内容', exact: true }).fill(input);
  const resultOpened = context.waitForEvent('page');
  await newTab.getByRole('button', { name: '搜索', exact: true }).click();
  const result = await resultOpened;
  await expect(result).toHaveURL(
    (url) => url.origin === 'https://www.google.com' && url.searchParams.get('q') === input,
  );
  await expect(result).toHaveTitle('Search result');
  await expect(newTab.getByRole('textbox', { name: '搜索内容', exact: true })).toHaveValue('');
  await result.close();

  const settings = await openSettings(newTab, '通用');
  await settings.getByRole('switch', { name: '在新标签页打开网站和搜索结果', exact: true }).click();
  await expect(settings.getByRole('status', { name: '保存状态', exact: true })).toHaveText(
    '已保存',
  );
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  const query = newTab.getByRole('textbox', { name: '搜索内容', exact: true });
  await query.fill(input);
  await query.press('Enter');
  await expect(newTab).toHaveURL(
    (url) => url.origin === 'https://www.google.com' && url.searchParams.get('q') === input,
  );
  await expect(newTab).toHaveTitle('Search result');
});

test('自定义引擎保存失败保留默认，改选后跨页和重载保留，支持切回默认', async ({
  newTab,
  context,
  extensionId,
}) => {
  const name = '自定义查询';
  const settings = await openSettings(newTab, '首页组件');
  const form = settings.getByRole('form', { name: '编辑搜索引擎', exact: true });
  await form.getByLabel('搜索引擎名称', { exact: true }).fill(name);
  await form
    .getByLabel('搜索引擎地址', { exact: true })
    .fill('https://www.bing.com/search?q=%s&source=raytab-custom');
  await form.getByRole('button', { name: '添加', exact: true }).click();
  await expect(settings.getByRole('button', { name: `编辑 ${name}`, exact: true })).toBeVisible();
  await settings.getByRole('button', { name: '关闭', exact: true }).click();

  const other = await context.newPage();
  await other.goto(`chrome-extension://${extensionId}/newtab.html`);
  await failNextWrite(newTab);
  await newTab.getByRole('button', { name: '切换搜索引擎', exact: true }).click();
  await newTab.getByRole('menuitemradio', { name, exact: true }).click();
  await expect(newTab.getByText(/E2E injected write failure/)).toBeVisible();
  await newTab.getByRole('button', { name: '切换搜索引擎', exact: true }).click();
  await expect(newTab.getByRole('menuitemradio', { name: '默认', exact: true })).toBeChecked();
  await newTab.getByRole('menuitemradio', { name, exact: true }).click();
  await other.getByRole('button', { name: '切换搜索引擎', exact: true }).click();
  await expect(other.getByRole('menuitemradio', { name, exact: true })).toBeChecked();
  await other.keyboard.press('Escape');
  await newTab.reload();
  await newTab.getByRole('button', { name: '切换搜索引擎', exact: true }).click();
  await expect(newTab.getByRole('menuitemradio', { name, exact: true })).toBeChecked();
  await newTab.keyboard.press('Escape');
  const input = '切换 & remembered';
  await newTab.getByRole('textbox', { name: '搜索内容', exact: true }).fill(input);
  const opened = context.waitForEvent('page');
  await newTab.getByRole('button', { name: '搜索', exact: true }).click();
  const result = await opened;
  await expect(result).toHaveURL(
    (url) =>
      url.origin === 'https://www.bing.com' &&
      url.searchParams.get('q') === input &&
      url.searchParams.get('source') === 'raytab-custom',
  );
  await expect(result).toHaveTitle('Search result');
  await expect(newTab.getByRole('textbox', { name: '搜索内容', exact: true })).toHaveValue('');
  expect(await result.evaluate(() => [document.referrer, window.opener === null])).toEqual([
    '',
    true,
  ]);
  await result.close();
  await newTab.getByRole('button', { name: '切换搜索引擎', exact: true }).click();
  await newTab.getByRole('menuitemradio', { name: '默认', exact: true }).click();
  await newTab.getByRole('button', { name: '切换搜索引擎', exact: true }).click();
  await expect(newTab.getByRole('menuitemradio', { name: '默认', exact: true })).toBeChecked();
  await newTab.reload();
  await newTab.getByRole('button', { name: '切换搜索引擎', exact: true }).click();
  await expect(newTab.getByRole('menuitemradio', { name: '默认', exact: true })).toBeChecked();
});

test('扩展仍使用旧清单时，默认搜索提示重载并保留输入', async ({ newTab }) => {
  await newTab.evaluate(() => {
    const api = (globalThis as typeof globalThis & { chrome: typeof browser }).chrome;
    const manifest = api.runtime.getManifest();
    delete manifest.permissions;
    api.runtime.getManifest = () => manifest;
    Object.defineProperty(api.search, 'query', { value: undefined });
  });
  const query = newTab.getByRole('textbox', { name: '搜索内容', exact: true });
  await query.fill('待重试的默认搜索');
  await query.press('Enter');
  await expect(
    newTab.getByText('请在 chrome://extensions 重新加载 RayTab 扩展，再打开新标签页。', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(query).toHaveValue('待重试的默认搜索');
});

test('搜索失败保留关键词，延迟成功也保留后来输入的内容', async ({ newTab, context }) => {
  await newTab.getByRole('button', { name: '切换搜索引擎', exact: true }).click();
  await newTab.getByRole('menuitemradio', { name: 'Google', exact: true }).click();
  await newTab.getByRole('button', { name: '切换搜索引擎', exact: true }).click();
  await expect(newTab.getByRole('menuitemradio', { name: 'Google', exact: true })).toBeChecked();
  await newTab.keyboard.press('Escape');
  await newTab.evaluate(() => {
    const api = (globalThis as typeof globalThis & { chrome: typeof browser }).chrome;
    const createTab = api.tabs.create.bind(api.tabs);
    let failOnce = true;
    api.tabs.create = async (properties) => {
      if (failOnce) {
        failOnce = false;
        throw new Error('E2E search tab failure');
      }
      await new Promise<void>((resolve) => {
        window.addEventListener('finish-test-search', () => resolve(), { once: true });
      });
      return createTab(properties);
    };
  });

  const query = newTab.getByRole('textbox', { name: '搜索内容', exact: true });
  const text = '待重试的关键词';
  await query.fill(text);
  await query.press('Enter');
  await expect(newTab.getByText(/E2E search tab failure/)).toBeVisible();
  await expect(query).toHaveValue(text);

  const opened = context.waitForEvent('page');
  await query.press('Enter');
  await query.fill('新输入的关键词');
  await newTab.evaluate(() => window.dispatchEvent(new Event('finish-test-search')));
  const result = await opened;
  await expect(result).toHaveURL((url) => url.searchParams.get('q') === text);
  await expect(result).toHaveTitle('Search result');
  await expect(query).toHaveValue('新输入的关键词');
  await result.close();
});
