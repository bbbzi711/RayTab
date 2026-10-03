import { addSite, expect, test } from './fixtures';

test('新标签页和 Popup 在真实扩展上下文启动', async ({ newTab, context, extensionId }) => {
  await expect(newTab.getByRole('search')).toBeVisible();
  await newTab.getByRole('button', { name: '设置', exact: true }).click();
  await expect(newTab.getByRole('dialog', { name: '设置', exact: true })).toBeVisible();

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.getByLabel('名称', { exact: true })).toBeVisible();
  await expect(popup.getByLabel('网址', { exact: true })).toBeVisible();
  await expect(popup.getByRole('button', { name: '添加网站', exact: true })).toBeVisible();
});

test('保存网站补全协议，并在重载后保留完整网址', async ({ newTab }) => {
  const title = '持久化测试网站';
  const url = 'example.test/path?q=raytab#section';
  await addSite(newTab, title, url);
  await expect(newTab.getByRole('link', { name: title, exact: true })).toHaveAttribute(
    'href',
    `https://${url}`,
  );

  await newTab.reload();
  await expect(newTab.getByRole('link', { name: title, exact: true })).toHaveAttribute(
    'href',
    `https://${url}`,
  );
  await expect(newTab.getByRole('button', { name: '进入首页', exact: true })).not.toBeVisible();
});

test('首页与 Popup 保存会刷新其他已打开的新标签页', async ({ newTab, context, extensionId }) => {
  const other = await context.newPage();
  await other.goto(`chrome-extension://${extensionId}/newtab.html`);
  await expect(other.getByRole('button', { name: '设置', exact: true })).toBeVisible();

  await addSite(newTab, '跨页首页网站', 'https://page.example.test');
  await expect(other.getByRole('link', { name: '跨页首页网站', exact: true })).toBeVisible();

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.getByLabel('名称', { exact: true }).fill('跨页 Popup 网站');
  await popup.getByLabel('网址', { exact: true }).fill('https://popup.example.test');
  await popup.getByRole('button', { name: '添加网站', exact: true }).click();
  await expect(
    popup.locator('.popup-success').getByText('已添加网站', { exact: true }),
  ).toBeVisible();
  await expect(newTab.getByRole('link', { name: '跨页 Popup 网站', exact: true })).toBeVisible();
  await expect(other.getByRole('link', { name: '跨页 Popup 网站', exact: true })).toBeVisible();
  await other.reload();
  await expect(other.getByRole('link', { name: '跨页 Popup 网站', exact: true })).toBeVisible();
});

test('网站右键菜单编辑与删除确认保持数据边界', async ({ newTab }) => {
  await addSite(newTab, '菜单测试网站', 'https://menu.example.test');
  const site = newTab.getByRole('link', { name: '菜单测试网站', exact: true });
  await site.click({ button: 'right' });
  await newTab.getByRole('menuitem', { name: /^(编辑|编辑网站)$/ }).click();
  const editor = newTab.getByRole('dialog', { name: '编辑网站', exact: true });
  await expect(editor.getByLabel('名称', { exact: true })).toHaveValue('菜单测试网站');
  await editor.getByRole('button', { name: '取消', exact: true }).click();

  await site.click({ button: 'right' });
  await newTab.getByRole('menuitem', { name: '删除', exact: true }).click();
  const confirmation = newTab.getByRole('alertdialog');
  await expect(confirmation).toContainText('菜单测试网站');
  await confirmation.getByRole('button', { name: '取消', exact: true }).click();
  await expect(site).toBeVisible();

  await site.click({ button: 'right' });
  await newTab.getByRole('menuitem', { name: '删除', exact: true }).click();
  await newTab.getByRole('alertdialog').getByRole('button', { name: '删除', exact: true }).click();
  await expect(site).not.toBeVisible();
  await newTab.reload();
  await expect(site).not.toBeVisible();
});

test('扩展页面与后台共享 Web Locks，关闭持锁页面后释放', async ({
  newTab,
  context,
  extensionId,
  background,
}) => {
  const contender = await context.newPage();
  await contender.goto(`chrome-extension://${extensionId}/newtab.html`);
  await expect(contender.getByRole('button', { name: '设置', exact: true })).toBeVisible();

  await newTab.evaluate(
    () =>
      new Promise<void>((acquired) => {
        void navigator.locks.request('raytab-sync', async () => {
          acquired();
          await new Promise<void>(() => {});
        });
      }),
  );
  const pageAcquired = await contender.evaluate(() =>
    navigator.locks.request('raytab-sync', { ifAvailable: true }, (lock) => Boolean(lock)),
  );
  const backgroundAcquired = await background.evaluate(() =>
    navigator.locks.request('raytab-sync', { ifAvailable: true }, (lock) => Boolean(lock)),
  );
  expect(pageAcquired).toBe(false);
  expect(backgroundAcquired).toBe(false);

  await newTab.close();
  await expect
    .poll(() =>
      background.evaluate(() =>
        navigator.locks.request('raytab-sync', { ifAvailable: true }, (lock) => Boolean(lock)),
      ),
    )
    .toBe(true);
});
