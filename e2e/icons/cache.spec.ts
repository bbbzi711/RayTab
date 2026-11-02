import { expect, test } from '../fixtures';
import { savedIcon } from '../helpers';

const mark =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect x="12" y="12" width="104" height="104" rx="24" fill="#1677ff"/><path d="M40 64h48M64 40v48" stroke="white" stroke-width="12"/></svg>';

test('官网 SVG 保存后离线重载，新标签页不重新请求图标', async ({ newTab, context }) => {
  const domain = 'github.com';
  const requests: string[] = [];
  const unexpected: string[] = [];
  newTab.on('request', (request) => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).hostname !== domain)
      unexpected.push(request.url());
  });
  await context.route(`https://${domain}/**`, (route) => {
    requests.push(route.request().url());
    return route.fulfill({
      contentType: route.request().url().endsWith('/mark.svg') ? 'image/svg+xml' : 'text/html',
      body: route.request().url().endsWith('/mark.svg')
        ? mark
        : '<title>官网图标</title><link rel="icon" href="/mark.svg" sizes="any">',
    });
  });

  await newTab.getByRole('button', { name: '添加网站', exact: true }).click();
  const editor = newTab.getByRole('dialog', { name: '添加网站', exact: true });
  await editor.getByLabel('名称', { exact: true }).fill('官网图标');
  await editor
    .getByLabel('网址', { exact: true })
    .fill(`https://${domain}/account?token=secret#profile`);
  await editor.getByLabel('名称', { exact: true }).click();
  await expect(editor.locator('.site-edit-preview img')).toBeVisible();
  await expect(editor.getByText('图标已获取，保存后可离线使用。', { exact: true })).toBeVisible();
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor).not.toBeVisible();
  const icon = newTab.getByRole('link', { name: '官网图标', exact: true }).locator('img');
  await expect(icon).toBeVisible();
  expect(unexpected).toEqual([]);
  const initialRequests = requests.length;
  expect(await savedIcon(newTab, '官网图标')).toMatchObject({
    type: 'image/svg+xml',
    text: mark,
  });

  await context.setOffline(true);
  await newTab.reload();
  await expect(
    newTab.getByRole('link', { name: '官网图标', exact: true }).locator('img'),
  ).toBeVisible();
  expect(
    await newTab
      .getByRole('link', { name: '官网图标', exact: true })
      .locator('img')
      .evaluate(
        (image: HTMLImageElement) =>
          image.src.startsWith('blob:') && image.complete && image.naturalWidth > 0,
      ),
  ).toBe(true);
  expect(requests).toHaveLength(initialRequests);
  expect(unexpected).toEqual([]);
  expect(await savedIcon(newTab, '官网图标')).toMatchObject({
    type: 'image/svg+xml',
    text: mark,
  });
});

test('网站图标重新获取失败保留已保存图片，重试保存与离线重载不丢失', async ({
  newTab,
  context,
}) => {
  const domain = 'retained-icon-acceptance.com';
  await context.route(`https://${domain}/**`, (route) =>
    route.fulfill({
      contentType: route.request().url().endsWith('/mark.svg') ? 'image/svg+xml' : 'text/html',
      body: route.request().url().endsWith('/mark.svg')
        ? mark
        : '<html><head><title>保留网站图片</title><link rel="icon" href="/mark.svg" sizes="any"></head></html>',
    }),
  );
  await newTab.getByRole('button', { name: '添加网站', exact: true }).click();
  const editor = newTab.getByRole('dialog', { name: '添加网站', exact: true });
  await editor.getByLabel('名称', { exact: true }).fill('保留网站图片');
  await editor.getByLabel('网址', { exact: true }).fill(`https://${domain}`);
  await editor.getByLabel('名称', { exact: true }).click();
  await expect(editor.locator('.site-edit-preview img')).toBeVisible();
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor).not.toBeVisible();
  const link = newTab.getByRole('link', { name: '保留网站图片', exact: true });
  await expect(link.locator('img')).toBeVisible();
  await context.route(`https://${domain}/**`, (route) => route.abort());
  await link.click({ button: 'right' });
  await newTab.getByRole('menuitem', { name: '编辑网站', exact: true }).click();
  const edit = newTab.getByRole('dialog', { name: '编辑网站', exact: true });
  await expect(edit.locator('.site-edit-preview img')).toBeVisible();
  await expect(edit.getByText('已保存图标，可离线使用。', { exact: true })).toBeVisible();
  await edit.getByLabel('网址', { exact: true }).fill(`https://${domain}/updated?q=keep#fragment`);
  await expect(edit.locator('.site-edit-preview img')).toBeVisible();
  await edit.getByRole('button', { name: '获取网站图标', exact: true }).click();
  await expect(edit.getByRole('alert')).toBeVisible();
  await expect(edit.locator('.site-edit-preview img')).toBeVisible();
  await edit.getByLabel('名称', { exact: true }).fill('保留网站图片已编辑');
  await edit.getByRole('button', { name: '保存', exact: true }).click();
  await expect(edit).not.toBeVisible();
  await context.setOffline(true);
  await newTab.reload();
  const reloaded = newTab.getByRole('link', { name: '保留网站图片已编辑', exact: true });
  await expect(reloaded.locator('img')).toBeVisible();
  await expect(reloaded).toHaveAttribute('href', `https://${domain}/updated?q=keep#fragment`);
});
