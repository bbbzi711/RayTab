import { readFile } from 'node:fs/promises';
import type { Locator, Page } from '@playwright/test';

import { expect, test } from '../fixtures';
import {
  addGroup,
  encryptGroup,
  unlockGroup,
  openSettings,
  exportNormalBackup,
  parseNormalBackup,
  expectIconOptions,
} from '../helpers';

async function previewBackup(page: Page, settings: Locator, path: string) {
  await settings.getByRole('button', { name: '恢复备份', exact: true }).click();
  await settings.getByRole('combobox', { name: '恢复来源', exact: true }).click();
  await page.getByRole('option', { name: '本地文件', exact: true }).click();
  await settings.getByLabel('备份文件', { exact: true }).setInputFiles(path);
  await settings.getByRole('button', { name: '预览备份', exact: true }).click();
  await expect(settings.getByText('备份内容预览', { exact: true })).toBeVisible();
}

test('图标资源随备份导出和确认替换恢复，切换网站图标移除上传引用', async ({
  newTab,
  context,
}, testInfo) => {
  await context.route('https://backup-icon.example.test/**', (route) => route.abort());
  await newTab.getByRole('button', { name: '添加网站', exact: true }).click();
  const editor = newTab.getByRole('dialog', { name: '添加网站', exact: true });
  await expectIconOptions(editor);
  await editor.getByLabel('名称', { exact: true }).fill('备份图标网站');
  await editor.getByLabel('网址', { exact: true }).fill('https://backup-icon.example.test');
  await editor.getByRole('radio', { name: '上传图片', exact: true }).click();
  const selectingIcon = newTab.waitForEvent('filechooser');
  await editor.getByRole('button', { name: '选择图片', exact: true }).click();
  await (
    await selectingIcon
  ).setFiles({
    name: 'backup.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="#2468ee"/></svg>',
    ),
  });
  await editor.getByRole('button', { name: '自动配色', exact: true }).click();
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor).not.toBeVisible();
  const site = newTab.getByRole('link', { name: '备份图标网站', exact: true });
  await expect(site.locator('img')).toBeVisible();
  const settings = await openSettings(newTab, '同步与备份');
  await settings.getByRole('button', { name: '导出到本地', exact: true }).click();
  const downloading = newTab.waitForEvent('download');
  await settings.getByRole('button', { name: '导出所选备份', exact: true }).click();
  const download = await downloading;
  const backupPath = testInfo.outputPath('normal-backup.json');
  await download.saveAs(backupPath);
  const serialized = await readFile(backupPath, 'utf8');
  const uploaded = parseNormalBackup(serialized).data.sites.find(
    (item) => item.title === '备份图标网站',
  );
  expect(uploaded).toMatchObject({
    icon: { source: 'resource', resourceId: expect.any(String) },
    iconBackground: { mode: 'auto' },
  });
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  await site.click({ button: 'right' });
  await newTab.getByRole('menuitem', { name: '删除', exact: true }).click();
  await newTab.getByRole('alertdialog').getByRole('button', { name: '删除', exact: true }).click();
  await expect(site).not.toBeVisible();
  const restore = await openSettings(newTab, '同步与备份');
  await previewBackup(newTab, restore, backupPath);
  await restore.getByRole('combobox', { name: '恢复方式', exact: true }).click();
  await newTab.getByRole('option', { name: '替换恢复', exact: true }).click();
  await restore.getByRole('button', { name: '替换恢复', exact: true }).click();
  await newTab
    .getByRole('alertdialog')
    .getByRole('button', { name: '替换恢复', exact: true })
    .click();
  await expect(restore.getByText('备份内容预览', { exact: true })).not.toBeVisible();
  await restore.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(restore).not.toBeVisible();
  await expect(newTab.getByRole('alertdialog')).not.toBeVisible();
  await newTab.reload();
  await expect(site.locator('img')).toBeVisible();
  await site.click({ button: 'right' });
  await newTab.getByRole('menuitem', { name: '编辑网站', exact: true }).click();
  const edit = newTab.getByRole('dialog', { name: '编辑网站', exact: true });
  await expectIconOptions(edit);
  await expect(edit.getByRole('button', { name: '自动配色', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await edit.getByRole('radio', { name: '网站图标', exact: true }).click();
  await edit.getByRole('button', { name: '保存', exact: true }).click();
  await expect(edit).not.toBeVisible();
  await newTab.reload();
  await site.click({ button: 'right' });
  await newTab.getByRole('menuitem', { name: '编辑网站', exact: true }).click();
  await expectIconOptions(edit);
  await expect(edit.getByRole('radio', { name: '网站图标', exact: true })).toBeChecked();
  await edit.getByRole('button', { name: '取消', exact: true }).click();
  expect((await exportNormalBackup(newTab)).resources.map((resource) => resource.id)).not.toContain(
    uploaded!.icon.resourceId,
  );
});

test('加密备份的未完成预览会提示，密码失败可重试，恢复成功后直接关闭', async ({
  newTab,
}, testInfo) => {
  const group = '恢复草稿验收分组';
  const password = 'fixture-unlock';
  const backupPassword = 'fixture-backup';
  await addGroup(newTab, group);
  await encryptGroup(newTab, group, password);
  await unlockGroup(newTab, group, password);
  const settings = await openSettings(newTab, '同步与备份');
  await settings.getByRole('button', { name: '导出到本地', exact: true }).click();
  await settings.getByLabel('加密分组备份密码', { exact: true }).fill(backupPassword);
  const downloading = newTab.waitForEvent('download');
  await settings.getByRole('button', { name: '导出所选备份', exact: true }).click();
  const path = testInfo.outputPath('encrypted.json');
  await (await downloading).saveAs(path);

  await previewBackup(newTab, settings, path);
  const file = settings.getByLabel('备份文件', { exact: true });
  const decryption = settings.getByLabel('备份解密密码', { exact: true });
  await decryption.fill('wrong-test-password');
  const restore = settings.getByRole('button', { name: '合并恢复', exact: true });
  await restore.click();
  await expect(settings.getByRole('alert')).toContainText('密码错误');
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  const discard = newTab.getByRole('alertdialog', { name: '放弃未保存的更改？' });
  await discard.getByRole('button', { name: '继续编辑', exact: true }).click();
  await expect(decryption).toHaveValue('wrong-test-password');
  await expect(file).toHaveValue(/encrypted\.json$/);
  await decryption.fill(backupPassword);
  await restore.click();
  await expect(newTab.getByText('已恢复备份', { exact: true })).toBeVisible();
  await expect(file).toHaveValue('');
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(settings).not.toBeVisible();
  await expect(discard).not.toBeVisible();
});

test('恢复完成后其他未保存的连接草稿仍保留并触发关闭确认', async ({ newTab }, testInfo) => {
  const settings = await openSettings(newTab, '同步与备份');
  await settings.getByRole('button', { name: '导出到本地', exact: true }).click();
  const downloading = newTab.waitForEvent('download');
  await settings.getByRole('button', { name: '导出所选备份', exact: true }).click();
  const path = testInfo.outputPath('ordinary.json');
  await (await downloading).saveAs(path);
  await settings.getByRole('button', { name: '连接云端', exact: true }).click();
  const address = settings.getByLabel('服务器地址', { exact: true });
  await address.fill('https://draft.example.test/');
  await previewBackup(newTab, settings, path);
  await settings.getByRole('button', { name: '合并恢复', exact: true }).click();
  await expect(newTab.getByText('已恢复备份', { exact: true })).toBeVisible();
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  const discard = newTab.getByRole('alertdialog', { name: '放弃未保存的更改？' });
  await discard.getByRole('button', { name: '继续编辑', exact: true }).click();
  await expect(address).toHaveValue('https://draft.example.test/');
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  await discard.getByRole('button', { name: '放弃更改', exact: true }).click();
  await expect(settings).not.toBeVisible();
});
