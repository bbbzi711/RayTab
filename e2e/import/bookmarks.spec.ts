import { expect, test } from '../fixtures';
import { openSettings, failNextWrite, storedState, noHorizontalOverflow } from '../helpers';
test('导入预览去重且栏目切换保留文件，保存失败重试后重载只导入一次', async ({ newTab }) => {
  const settings = await openSettings(newTab, '数据与备份');
  await expect(settings.getByRole('button', { name: '预览文件', exact: true })).not.toBeVisible();
  await expect(
    settings.getByRole('button', { name: '导出所选备份', exact: true }),
  ).not.toBeVisible();
  await expect(settings.getByRole('button', { name: '预览备份', exact: true })).not.toBeVisible();
  await settings.getByRole('button', { name: '导入书签', exact: true }).click();
  await expect(settings.getByRole('heading', { name: '导入书签', exact: true })).toBeFocused();
  const items = Array.from(
    { length: 58 },
    (_, index) =>
      `<DT><A HREF="https://bookmarks.example.test/${index}?keep=1#part">${index === 0 ? '这是一个用于检查超长网站名称对齐且不撑破面板的书签标题'.repeat(3) : `导入网站 ${index}`}</A>`,
  );
  await settings.getByLabel('书签 HTML 文件', { exact: true }).setInputFiles({
    name: 'layout-bookmarks.html',
    mimeType: 'text/html',
    buffer: Buffer.from(
      `<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p>${[...items, ...items.slice(0, 3)].join('\n')}</DL>`,
    ),
  });
  await settings.getByRole('button', { name: '预览文件', exact: true }).click();
  await expect(settings.getByText(/准备导入 58 个网站，已跳过 3 个重复网址/)).toBeVisible();
  await settings.getByRole('button', { name: '返回数据管理', exact: true }).click();
  await expect(settings.getByRole('button', { name: '导入书签', exact: true })).toBeFocused();
  await settings.getByRole('button', { name: '导出备份', exact: true }).click();
  await expect(settings.getByRole('heading', { name: '导出备份', exact: true })).toBeFocused();
  await expect(settings.getByRole('combobox', { name: '导出范围', exact: true })).toBeVisible();
  await expect(settings.getByText(/准备导入 58 个网站，已跳过 3 个重复网址/)).not.toBeVisible();
  await settings.getByRole('button', { name: '返回数据管理', exact: true }).click();
  await expect(settings.getByRole('button', { name: '导出备份', exact: true })).toBeFocused();
  await settings.getByRole('button', { name: '导入书签', exact: true }).click();
  await expect(settings.getByRole('heading', { name: '导入书签', exact: true })).toBeFocused();
  await expect(settings.getByText('layout-bookmarks.html', { exact: true })).toBeVisible();
  expect(
    await settings
      .getByLabel('书签 HTML 文件', { exact: true })
      .evaluate((input: HTMLInputElement) => input.files?.[0]?.name),
  ).toBe('layout-bookmarks.html');
  await expect(settings.getByText(/准备导入 58 个网站，已跳过 3 个重复网址/)).toBeVisible();
  const options = settings.locator('.data-preview-options');
  await newTab.setViewportSize({ width: 320, height: 640 });
  await noHorizontalOverflow(settings);
  await settings.getByRole('button', { name: '确认导入', exact: true }).scrollIntoViewIfNeeded();
  await failNextWrite(newTab);
  await settings.getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(settings.getByRole('alert')).toBeVisible();
  await expect(settings.getByText(/准备导入 58 个网站，已跳过 3 个重复网址/)).toBeVisible();
  await settings.getByRole('button', { name: '返回数据管理', exact: true }).click();
  await settings.getByRole('button', { name: '导入书签', exact: true }).click();
  await expect(settings.getByRole('alert')).toBeVisible();
  await settings.getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(settings.getByRole('button', { name: '确认导入', exact: true })).not.toBeVisible();
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  await newTab.reload();
  const imported = (await storedState(newTab)).spaces.normal.sites.filter((site) =>
    site.url.startsWith('https://bookmarks.example.test/'),
  );
  expect(imported).toHaveLength(58);
  expect(imported[0].url).toBe('https://bookmarks.example.test/0?keep=1#part');
});
