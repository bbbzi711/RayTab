import { readFile } from 'node:fs/promises';

import { expect, test } from '../fixtures';
import { openSettings, storedState } from '../helpers';
test('图标资源随备份导出和确认替换恢复，切换网站图标移除上传引用', async ({ newTab }, testInfo) => {
  await newTab.getByRole('button', { name: '添加网站', exact: true }).click();
  const editor = newTab.getByRole('dialog', { name: '添加网站', exact: true });
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
  const settings = await openSettings(newTab, '数据与备份');
  await settings.getByRole('button', { name: '导出备份', exact: true }).click();
  await settings.getByRole('combobox', { name: '导出范围', exact: true }).click();
  await newTab.getByRole('option', { name: '普通空间', exact: true }).click();
  const downloading = newTab.waitForEvent('download');
  await settings.getByRole('button', { name: '导出所选备份', exact: true }).click();
  const download = await downloading;
  const backupPath = testInfo.outputPath('normal-backup.json');
  await download.saveAs(backupPath);
  const serialized = await readFile(backupPath, 'utf8');
  expect(serialized).toContain('备份图标网站');
  expect(serialized).toContain('"source": "resource"');
  expect(serialized).toContain('"mode": "auto"');
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  await site.click({ button: 'right' });
  await newTab.getByRole('menuitem', { name: '删除', exact: true }).click();
  await newTab.getByRole('alertdialog').getByRole('button', { name: '删除', exact: true }).click();
  await expect(site).not.toBeVisible();
  const restore = await openSettings(newTab, '数据与备份');
  await restore.getByRole('button', { name: '恢复备份', exact: true }).click();
  await restore.getByLabel('备份文件', { exact: true }).setInputFiles(backupPath);
  await restore.getByRole('button', { name: '预览备份', exact: true }).click();
  await expect(restore.getByText('备份内容预览', { exact: true })).toBeVisible();
  await restore.getByRole('combobox', { name: '恢复方式', exact: true }).click();
  await newTab.getByRole('option', { name: '替换恢复', exact: true }).click();
  await restore.getByRole('button', { name: '替换恢复', exact: true }).click();
  await newTab
    .getByRole('alertdialog')
    .getByRole('button', { name: '替换恢复', exact: true })
    .click();
  await expect(restore.getByText('备份内容预览', { exact: true })).not.toBeVisible();
  await restore.getByRole('button', { name: '关闭', exact: true }).click();
  await newTab.reload();
  await expect(site.locator('img')).toBeVisible();
  await site.click({ button: 'right' });
  await newTab.getByRole('menuitem', { name: '编辑网站', exact: true }).click();
  const edit = newTab.getByRole('dialog', { name: '编辑网站', exact: true });
  await expect(edit.getByRole('button', { name: '自动配色', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await edit.getByRole('radio', { name: '网站图标', exact: true }).click();
  await edit.getByRole('button', { name: '保存', exact: true }).click();
  await expect(edit).not.toBeVisible();
  expect(
    (await storedState(newTab)).spaces.normal.sites.find((item) => item.title === '备份图标网站')
      ?.icon.source,
  ).toBe('auto');
});
