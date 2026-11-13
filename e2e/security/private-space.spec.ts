import { addSite, expect, test } from '../fixtures';
import { addGroup, encryptGroup, openSettings, unlockGroup } from '../helpers';
test('私密空间重载立即锁定并清除编辑草稿与普通缓存中的明文', async ({ newTab }) => {
  const group = '安全验收加密组';
  await addGroup(newTab, group);
  await encryptGroup(newTab, group, 'vault-e2e-only');
  const settings = await openSettings(newTab, '通用');
  await settings.getByRole('tab', { name: '云端同步', exact: true }).click();
  await settings.getByRole('button', { name: '配置同步', exact: true }).click();
  await expect(settings.getByRole('switch', { name: '同步私密空间', exact: true })).toBeDisabled();
  await expect(
    settings.getByRole('switch', { name: '同步私密空间', exact: true }),
  ).not.toBeChecked();
  await expect(
    settings.getByText('请先解锁私密空间，再修改或保存包含私密空间的同步配置。', { exact: true }),
  ).toBeVisible();
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  await unlockGroup(newTab, group, 'vault-e2e-only');
  await addSite(newTab, '私密验收网站', 'https://private.e2e.example.test');
  const search = newTab.getByRole('textbox', { name: '搜索内容', exact: true });
  await search.fill('私密搜索未提交内容');
  await newTab.getByRole('button', { name: '主页', exact: true }).click();
  await expect(search).toHaveValue('');
  expect(await newTab.evaluate(() => document.body.innerHTML)).not.toContain('私密搜索未提交内容');
  await unlockGroup(newTab, group, 'vault-e2e-only');
  const site = newTab.getByRole('link', { name: '私密验收网站', exact: true });
  await site.click({ button: 'right' });
  await newTab.getByRole('menuitem', { name: /^(编辑|编辑网站)$/ }).click();
  await newTab
    .getByRole('dialog', { name: '编辑网站', exact: true })
    .getByLabel('名称', { exact: true })
    .fill('私密未保存草稿');
  await newTab.reload();
  await expect(site).not.toBeVisible();
  expect(await newTab.evaluate(() => document.body.innerHTML)).not.toContain('私密未保存草稿');
  const cache = await newTab.evaluate(() =>
    Object.keys(localStorage)
      .map((key) => localStorage.getItem(key))
      .join('\n'),
  );
  expect(cache).not.toContain('private.e2e.example.test');
  expect(cache).not.toContain('私密验收网站');
  await newTab.getByRole('button', { name: group, exact: true }).click();
  await expect(newTab.getByLabel('输入私密分组密码', { exact: true })).toHaveValue('');
  await newTab.getByLabel('输入私密分组密码', { exact: true }).fill('wrong-password');
  await newTab.getByRole('dialog').getByRole('button', { name: '解锁', exact: true }).click();
  await expect(newTab.getByRole('alert').filter({ hasText: /密码错误/ })).toBeVisible();
});
