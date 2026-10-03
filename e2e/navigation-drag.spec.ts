import type { Locator, Page } from '@playwright/test';
import { addSite, expect, test } from './fixtures';

async function drag(page: Page, source: Locator, target: Locator) {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('Drag source and target must be visible.');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2, { steps: 3 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 });
  await page.mouse.up();
}

test('真实指针跨组拖动保留网址，重载后位置正确', async ({ newTab }) => {
  await addSite(newTab, '跨组拖拽网站', 'https://drag.example.test/path?q=keep#fragment');
  await newTab.getByRole('button', { name: '添加分组', exact: true }).click();
  const naming = newTab.getByRole('dialog', { name: '新建分组', exact: true });
  await naming.getByLabel('名称', { exact: true }).fill('拖拽目标组');
  await naming.getByRole('button', { name: '保存', exact: true }).click();
  await expect(naming).not.toBeVisible();
  await newTab.getByRole('button', { name: '主页', exact: true }).click();
  const site = newTab.getByRole('link', { name: '跨组拖拽网站', exact: true });
  const target = newTab.getByRole('button', { name: '拖拽目标组', exact: true });
  await drag(newTab, site, target);
  await expect(site).not.toBeVisible();
  // Reload verifies the saved move before navigating and ends the pointer gesture's click suppression.
  await newTab.reload();
  await target.press('Enter');
  await expect(target).toHaveAttribute('aria-pressed', 'true');
  await expect(site).toHaveAttribute('href', 'https://drag.example.test/path?q=keep#fragment');
  await newTab.reload();
  await expect(site).toHaveAttribute('href', 'https://drag.example.test/path?q=keep#fragment');
  await newTab.getByRole('button', { name: '主页', exact: true }).click();
  await expect(site).not.toBeVisible();
});

test('真实指针移入文件夹，文件夹内保持原网址', async ({ newTab }) => {
  await addSite(newTab, '文件夹拖拽网站', 'https://folder-drag.example.test/path?q=keep#fragment');
  await newTab.mouse.click(1150, 680, { button: 'right' });
  await newTab.getByRole('menuitem', { name: '新建文件夹', exact: true }).click();
  const naming = newTab.getByRole('dialog', { name: '新建文件夹', exact: true });
  await naming.getByLabel('名称', { exact: true }).fill('拖拽文件夹');
  await naming.getByRole('button', { name: '保存', exact: true }).click();
  await expect(naming).not.toBeVisible();
  const site = newTab.getByRole('link', { name: '文件夹拖拽网站', exact: true });
  const folder = newTab.getByRole('button', { name: '拖拽文件夹', exact: true });
  await drag(newTab, site, folder);
  await expect(site).not.toBeVisible();
  await folder.click();
  const contents = newTab.getByRole('dialog', { name: '拖拽文件夹', exact: true });
  await expect(contents.getByRole('link', { name: '文件夹拖拽网站', exact: true })).toHaveAttribute(
    'href',
    'https://folder-drag.example.test/path?q=keep#fragment',
  );
  await newTab.reload();
  await expect(newTab.getByRole('link', { name: '文件夹拖拽网站', exact: true })).toHaveAttribute(
    'href',
    'https://folder-drag.example.test/path?q=keep#fragment',
  );
});
