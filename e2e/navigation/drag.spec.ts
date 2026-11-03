import type { Locator, Page } from '@playwright/test';
import { addSite, expect, test } from '../fixtures';
import { openDesktopMenu, settle } from '../helpers';

async function drag(page: Page, source: Locator, target: Locator, horizontal = 0.5) {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('Drag source and target must be visible.');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2, { steps: 3 });
  await page.mouse.move(to.x + to.width * horizontal, to.y + to.height / 2, { steps: 20 });
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
  await target.click();
  await expect(target).toHaveAttribute('aria-pressed', 'true');
  await expect(site).toHaveAttribute('href', 'https://drag.example.test/path?q=keep#fragment');
  await newTab.reload();
  await expect(site).toHaveAttribute('href', 'https://drag.example.test/path?q=keep#fragment');
  await newTab.getByRole('button', { name: '主页', exact: true }).click();
  await expect(site).not.toBeVisible();
});

test('文件夹边缘排序与中心移入保持区别，重载后保留网址', async ({ newTab }) => {
  await addSite(newTab, '文件夹拖拽网站', 'https://folder-drag.example.test/path?q=keep#fragment');
  await openDesktopMenu(newTab);
  await newTab.getByRole('menuitem', { name: '新建文件夹', exact: true }).click();
  const naming = newTab.getByRole('dialog', { name: '新建文件夹', exact: true });
  await naming.getByLabel('名称', { exact: true }).fill('拖拽文件夹');
  await naming.getByRole('button', { name: '保存', exact: true }).click();
  await expect(naming).not.toBeVisible();
  const site = newTab.getByRole('link', { name: '文件夹拖拽网站', exact: true });
  const folder = newTab.getByRole('button', { name: '拖拽文件夹', exact: true });
  await drag(newTab, site, folder, 0.1);
  await expect(site).toBeVisible();
  const order = () =>
    newTab
      .getByTestId('site-navigation')
      .getByRole('link')
      .or(folder)
      .evaluateAll((items) => items.map((item) => item.getAttribute('aria-label')));
  await expect
    .poll(async () => {
      const names = await order();
      return names.indexOf('拖拽文件夹') - names.indexOf('文件夹拖拽网站');
    })
    .toBeLessThan(0);
  await folder.click();
  const empty = newTab.getByRole('dialog', { name: '拖拽文件夹', exact: true });
  await expect(empty.getByRole('link', { name: '文件夹拖拽网站', exact: true })).toHaveCount(0);
  await empty.getByRole('button', { name: '关闭', exact: true }).click();
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

async function addFolder(page: Page, title: string) {
  await openDesktopMenu(page);
  await page.getByRole('menuitem', { name: '新建文件夹', exact: true }).click();
  const naming = page.getByRole('dialog', { name: '新建文件夹', exact: true });
  await naming.getByLabel('名称', { exact: true }).fill(title);
  await naming.getByRole('button', { name: '保存', exact: true }).click();
  await expect(naming).not.toBeVisible();
  return page.getByRole('button', { name: title, exact: true });
}

test('键盘跨过文件夹进行排序，保留根目录位置且重载后顺序不变', async ({ newTab }) => {
  await addSite(newTab, '键盘排序网站', 'https://keyboard.example.test/keep');
  const folder = await addFolder(newTab, '键盘排序文件夹');
  const site = newTab.getByRole('link', { name: '键盘排序网站', exact: true });
  const order = () =>
    newTab
      .getByTestId('site-navigation')
      .getByRole('link')
      .or(folder)
      .evaluateAll((items) => items.map((item) => item.getAttribute('aria-label')));
  const before = await order();
  expect(before.indexOf('键盘排序网站')).toBeLessThan(before.indexOf('键盘排序文件夹'));
  await site.focus();
  const from = (await site.boundingBox())!;
  const to = (await folder.boundingBox())!;
  await site.press('Space');
  await settle(newTab);
  await site.press(to.y > from.y + from.height / 2 ? 'ArrowDown' : 'ArrowRight');
  await settle(newTab);
  await site.press('Space');
  await expect.poll(order).not.toEqual(before);
  const after = await order();
  expect(after.indexOf('键盘排序网站')).toBeGreaterThan(after.indexOf('键盘排序文件夹'));
  await folder.click();
  const contents = newTab.getByRole('dialog', { name: '键盘排序文件夹', exact: true });
  await expect(contents.getByRole('link', { name: '键盘排序网站', exact: true })).toHaveCount(0);
  await contents.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(contents).not.toBeVisible();
  await newTab.reload();
  expect(await order()).toEqual(after);
});

test('拖动文件夹只排序，不会嵌套到另一个文件夹中', async ({ newTab }) => {
  const first = await addFolder(newTab, '文件夹一');
  const second = await addFolder(newTab, '文件夹二');
  await drag(newTab, first, second);
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();
  await second.click();
  const contents = newTab.getByRole('dialog', { name: '文件夹二', exact: true });
  await expect(contents.getByRole('button', { name: '文件夹一', exact: true })).toHaveCount(0);
  await contents.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(contents).not.toBeVisible();
  await newTab.reload();
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();
});
