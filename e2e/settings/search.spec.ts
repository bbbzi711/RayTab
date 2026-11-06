import { expect, test } from '../fixtures';
import { failNextWrite, openSettings } from '../helpers';

test('首次默认搜索完整传递输入，并遵循新标签页和当前页偏好', async ({ newTab, context }) => {
  const input = '中文 空格 & + / ?';
  // Native search may prefetch the result document before Playwright attaches to its
  // new tab. Result-page assets are outside this extension flow; block them while
  // retaining the fixture's strict checks for requests made by the extension.
  await context.route(/^https?:/, (route) => {
    const pageUrl = new URL(route.request().frame().page().url());
    if (pageUrl.protocol === 'https:' && [...pageUrl.searchParams.values()].includes(input))
      return route.abort('blockedbyclient');
    return route.fallback();
  });
  // Serve only the submitted searches locally; the browser still resolves its real default provider.
  await context.route(
    (url) => [...url.searchParams.values()].includes(input),
    (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<title>Search result</title><p>Search result</p>',
      }),
  );
  await newTab.getByRole('button', { name: '切换搜索引擎', exact: true }).click();
  await expect(
    newTab.getByRole('menuitemradio', { name: '浏览器默认', exact: true }),
  ).toBeChecked();
  await newTab.keyboard.press('Escape');
  await newTab.getByRole('textbox', { name: '搜索内容', exact: true }).fill(input);
  const resultOpened = context.waitForEvent('page');
  await newTab.getByRole('button', { name: '搜索', exact: true }).click();
  const result = await resultOpened;
  await expect(result).toHaveURL(
    (url) => url.protocol === 'https:' && [...url.searchParams.values()].includes(input),
  );
  await expect(newTab.getByRole('textbox', { name: '搜索内容', exact: true })).toHaveValue(input);
  await result.close();

  const settings = await openSettings(newTab, '通用');
  await settings.getByRole('switch', { name: '在新标签页打开网站和搜索结果', exact: true }).click();
  await expect(settings.getByRole('status', { name: '自动保存', exact: true })).toHaveText(
    '已保存',
  );
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  await newTab.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(newTab).toHaveURL(
    (url) => url.protocol === 'https:' && [...url.searchParams.values()].includes(input),
  );
});

test('引擎选择保存失败保留原值，改选后跨页和重载保留，支持切回浏览器默认', async ({
  newTab,
  context,
  extensionId,
}) => {
  const other = await context.newPage();
  await other.goto(`chrome-extension://${extensionId}/newtab.html`);
  await failNextWrite(newTab);
  await newTab.getByRole('button', { name: '切换搜索引擎', exact: true }).click();
  await newTab.getByRole('menuitemradio', { name: 'Google', exact: true }).click();
  await expect(newTab.getByText(/E2E injected write failure/)).toBeVisible();
  await newTab.getByRole('button', { name: '切换搜索引擎', exact: true }).click();
  await expect(
    newTab.getByRole('menuitemradio', { name: '浏览器默认', exact: true }),
  ).toBeChecked();
  await newTab.getByRole('menuitemradio', { name: 'Google', exact: true }).click();
  const otherSettings = await openSettings(other, '搜索与时钟');
  await expect(otherSettings.getByRole('button', { name: 'Google', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await otherSettings.getByRole('button', { name: '关闭', exact: true }).click();
  await newTab.reload();
  await newTab.getByRole('button', { name: '切换搜索引擎', exact: true }).click();
  await expect(newTab.getByRole('menuitemradio', { name: 'Google', exact: true })).toBeChecked();
  await newTab.keyboard.press('Escape');
  await context.route('https://www.google.com/search?**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<title>Selected search</title>',
    }),
  );
  const input = '切换 & remembered';
  await newTab.getByRole('textbox', { name: '搜索内容', exact: true }).fill(input);
  const opened = context.waitForEvent('page');
  await newTab.getByRole('button', { name: '搜索', exact: true }).click();
  const result = await opened;
  await expect(result).toHaveURL(
    (url) => url.origin === 'https://www.google.com' && url.searchParams.get('q') === input,
  );
  await result.close();
  const settings = await openSettings(newTab, '搜索与时钟');
  await settings.getByRole('button', { name: '浏览器默认', exact: true }).click();
  await expect(settings.getByRole('button', { name: '浏览器默认', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await newTab.reload();
  await newTab.getByRole('button', { name: '切换搜索引擎', exact: true }).click();
  await expect(
    newTab.getByRole('menuitemradio', { name: '浏览器默认', exact: true }),
  ).toBeChecked();
});
