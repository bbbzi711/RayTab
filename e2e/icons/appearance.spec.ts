import { openIconOptions } from '../helpers';
import { expect, test } from '../fixtures';
import { paintedArtwork } from '../artwork';

test('官网图标的底色独立保存，重新打开和离线重载不改变原图颜色', async ({ newTab, context }) => {
  const mark =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" fill="#1677ff"/></svg>';
  await context.route('https://gemini.google.com/**', (route) =>
    route.fulfill({
      contentType: route.request().url().endsWith('.svg') ? 'image/svg+xml' : 'text/html',
      body: route.request().url().endsWith('.svg') ? mark : '<link rel="icon" href="/mark.svg">',
    }),
  );
  await newTab.getByRole('button', { name: '添加网站', exact: true }).click();
  const add = newTab.getByRole('dialog', { name: '添加网站', exact: true });
  await openIconOptions(add);
  await add.getByLabel('名称', { exact: true }).fill('Gemini 产品');
  await add.getByLabel('网址', { exact: true }).fill('https://gemini.google.com/app');
  await add.getByRole('button', { name: '获取网站图标', exact: true }).click();
  await expect(
    add.getByRole('complementary', { name: '图标预览', exact: true }).locator('img'),
  ).toBeVisible();
  await add.getByRole('button', { name: '保存', exact: true }).click();
  await expect(add).not.toBeVisible();
  const site = newTab.getByRole('link', { name: 'Gemini 产品', exact: true });
  const original = (await paintedArtwork(site.getByTestId('site-icon'))).dominant;
  expect(original).toBeDefined();
  await site.click({ button: 'right' });
  await newTab.getByRole('menuitem', { name: '编辑网站', exact: true }).click();
  const editor = newTab.getByRole('dialog', { name: '编辑网站', exact: true });
  await openIconOptions(editor);
  await editor
    .getByRole('group', { name: '图标底色', exact: true })
    .getByRole('button', { name: '绿色', exact: true })
    .click();
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor).not.toBeVisible();
  await context.setOffline(true);
  await newTab.reload();
  expect((await paintedArtwork(site.getByTestId('site-icon'))).dominant).toBe(original);
  await site.click({ button: 'right' });
  await newTab.getByRole('menuitem', { name: '编辑网站', exact: true }).click();
  await openIconOptions(editor);
  await expect(editor.getByRole('button', { name: '绿色', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
