import { seedLargeNavigation } from '../storage/inspect';
import { addSite, expect, test } from '../fixtures';
import { settle, noHorizontalOverflow, openDesktopMenu } from '../helpers';
test('键盘和右键均可编辑网站，取消保留原值，保存与重载保留修改', async ({ newTab }) => {
  await addSite(newTab, '菜单网站', 'https://menu.example.test/path?q=1#fragment');
  const site = newTab.getByRole('link', { name: '菜单网站', exact: true });
  await site.focus();
  await site.press('Shift+F10');
  const menu = newTab.getByRole('menu');
  await expect(menu).toBeVisible();
  await menu.press('Escape');
  await expect(site).toBeFocused();
  await site.press('Shift+F10');
  await newTab.getByRole('menuitem', { name: '编辑网站', exact: true }).click();
  const editor = newTab.getByRole('dialog', { name: '编辑网站', exact: true });
  await expect(editor.getByLabel('网址', { exact: true })).toBeFocused();
  await editor.getByLabel('名称', { exact: true }).fill('取消的名字');
  await editor.getByRole('button', { name: '取消', exact: true }).click();
  await newTab
    .getByRole('alertdialog')
    .getByRole('button', { name: '放弃更改', exact: true })
    .click();
  await expect(site).toBeVisible();
  await site.click({ button: 'right' });
  await newTab.getByRole('menuitem', { name: '编辑网站', exact: true }).click();
  await editor.getByLabel('名称', { exact: true }).fill('更新的网站');
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor).not.toBeVisible();
  await newTab.reload();
  await expect(newTab.getByRole('link', { name: '更新的网站', exact: true })).toHaveAttribute(
    'href',
    'https://menu.example.test/path?q=1#fragment',
  );
});

test('简洁模式桌面空白可打开设置，搜索输入保留原生右键行为', async ({ newTab }) => {
  await openDesktopMenu(newTab);
  await newTab.getByRole('menuitem', { name: '进入简洁模式', exact: true }).click();
  await openDesktopMenu(newTab);
  await newTab.getByRole('menuitem', { name: '设置', exact: true }).click();
  const settings = newTab.getByRole('dialog', { name: '设置', exact: true });
  await settings.getByRole('button', { name: '壁纸与主题', exact: true }).click();
  await expect(settings.getByRole('combobox', { name: '主题', exact: true })).toBeVisible();
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  const input = newTab.getByRole('textbox', { name: '搜索内容', exact: true });
  const prevented = await input.evaluate((element) => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(false);
});

test('小窗口删除超长名称时确认文字完整换行，取消后保留网站', async ({ newTab }) => {
  const name = 'W'.repeat(80);
  await addSite(newTab, name, 'https://github.com/extreme');
  await newTab.setViewportSize({ width: 320, height: 360 });
  const site = newTab.getByRole('link', { name, exact: true });
  await site.click({ button: 'right' });
  await newTab.getByRole('menuitem', { name: '删除', exact: true }).click();
  const confirmation = newTab.getByRole('alertdialog');
  await settle(newTab);
  await expect(confirmation).toContainText(name);
  await noHorizontalOverflow(confirmation);
  await noHorizontalOverflow(confirmation.getByText(name));

  await confirmation.getByRole('button', { name: '取消', exact: true }).click();
  await expect(site).toBeVisible();
});

test('长分组名称的存入位置列表在窄屏内完整换行且可用键盘选择', async ({ newTab }) => {
  const name = 'W'.repeat(80);
  await newTab.getByRole('button', { name: '添加分组', exact: true }).click();
  const group = newTab.getByRole('dialog');
  await group.getByLabel('名称', { exact: true }).fill(name);
  await group.getByRole('button', { name: '保存', exact: true }).click();
  await expect(group).not.toBeVisible();
  await newTab.setViewportSize({ width: 320, height: 360 });
  await newTab.getByRole('button', { name: '添加网站', exact: true }).click();
  const editor = newTab.getByRole('dialog', { name: '添加网站', exact: true });
  const location = editor.getByLabel('存入位置', { exact: true });
  await location.click();
  const options = newTab.getByRole('listbox');
  const lastOption = options.getByRole('option', { name, exact: true });
  await expect(options).toBeVisible();
  await noHorizontalOverflow(options);
  await noHorizontalOverflow(lastOption);

  await newTab.keyboard.press('Home');
  await expect(options.getByRole('option').first()).toBeFocused();
  await newTab.keyboard.press('End');
  await expect(lastOption).toBeFocused();
  await newTab.keyboard.press('Enter');
  await expect(options).not.toBeVisible();
  await expect(location).toHaveText(name);
  await expect(location).toBeFocused();
  await editor.getByRole('button', { name: '取消', exact: true }).click();
});

test('Esc 只关闭最上层设置和菜单，保留底层整理选择', async ({ newTab }) => {
  await addSite(newTab, '整理选择网站', 'https://selection.example.test');
  await openDesktopMenu(newTab);
  await newTab.getByRole('menuitem', { name: '整理', exact: true }).click();
  const selected = newTab.getByRole('button', { name: '整理选择网站', exact: true });
  await selected.click();
  await expect(selected).toHaveAttribute('aria-pressed', 'true');
  await newTab.getByRole('button', { name: '设置', exact: true }).click();
  const settings = newTab.getByRole('dialog', { name: '设置', exact: true });
  await expect(settings).toBeVisible();
  await settings.press('Escape');
  await expect(settings).not.toBeVisible();
  await expect(selected).toHaveAttribute('aria-pressed', 'true');
  await expect(newTab.getByRole('button', { name: '完成', exact: true })).toBeVisible();
  await newTab.getByRole('button', { name: '切换搜索引擎', exact: true }).click();
  const menu = newTab.getByRole('menu');
  await menu.press('Escape');
  await expect(menu).not.toBeVisible();
  await expect(selected).toHaveAttribute('aria-pressed', 'true');
  await newTab.getByRole('button', { name: '完成', exact: true }).focus();
  await settle(newTab);
  await newTab.keyboard.press('Escape');
  await expect(newTab.getByRole('button', { name: '完成', exact: true })).not.toBeVisible();
});

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 320, height: 360 },
]) {
  test(`大量网站下独立滚动、末尾编辑、搜索和设置均可用（${viewport.width}px）`, async ({
    newTab,
  }) => {
    await newTab.setViewportSize(viewport);
    await seedLargeNavigation(newTab);
    await newTab.reload();
    await expect(newTab.getByRole('link', { name: '批量网站 0', exact: true })).toBeVisible();
    const query = newTab.getByRole('textbox', { name: '搜索内容', exact: true });
    await query.fill('大量数据下的搜索草稿');
    const clock = newTab.getByRole('region', { name: '时钟', exact: true });
    const searchBefore = (await query.boundingBox())!;
    const clockBefore = (await clock.boundingBox())!;
    const navigation = newTab.getByTestId('site-navigation');
    await navigation.hover();
    await newTab.mouse.wheel(0, 100_000);
    const last = newTab.getByRole('link', { name: '批量网站 499', exact: true });
    // The add-site tile follows the last website. Center the website within the
    // scroll region instead of requiring it to align with the absolute bottom.
    const lastBounds = (await last.boundingBox())!;
    const navigationBounds = (await navigation.boundingBox())!;
    await newTab.mouse.wheel(
      0,
      lastBounds.y + lastBounds.height / 2 - navigationBounds.y - navigationBounds.height / 2,
    );
    await expect(last).toBeInViewport({ ratio: 1 });
    expect(Math.abs((await query.boundingBox())!.y - searchBefore.y)).toBeLessThan(1);
    expect(Math.abs((await clock.boundingBox())!.y - clockBefore.y)).toBeLessThan(1);
    expect(await newTab.evaluate(() => document.scrollingElement?.scrollTop)).toBe(0);
    await expect(query).toBeInViewport({ ratio: 1 });
    await expect(query).toHaveValue('大量数据下的搜索草稿');
    await last.click({ button: 'right' });
    await newTab.getByRole('menuitem', { name: '编辑网站', exact: true }).click();
    const editor = newTab.getByRole('dialog', { name: '编辑网站', exact: true });
    await editor.getByLabel('名称', { exact: true }).fill('末尾网站已编辑');
    await editor.getByRole('button', { name: '保存', exact: true }).click();
    await expect(editor).not.toBeVisible();
    await navigation.hover();
    await newTab.mouse.wheel(0, -100_000);
    await newTab.getByRole('button', { name: '批量文件夹 0', exact: true }).click();
    const folder = newTab.getByRole('dialog', { name: '批量文件夹 0', exact: true });
    await expect(folder.getByRole('link', { name: '批量网站 500', exact: true })).toBeVisible();
    await expect(folder.getByRole('link', { name: '批量网站 900', exact: true })).toHaveAttribute(
      'href',
      'https://example.test/stress/900',
    );
    await folder.getByRole('button', { name: '关闭', exact: true }).click();
    await newTab.getByRole('button', { name: '设置', exact: true }).click();
    const settings = newTab.getByRole('dialog', { name: '设置', exact: true });
    await settings.getByRole('button', { name: '图标与布局', exact: true }).click();
    await settings.getByRole('switch', { name: '显示网站标题', exact: true }).click();
    await expect(
      settings.getByRole('switch', { name: '显示网站标题', exact: true }),
    ).not.toBeChecked();
    await expect(settings.getByRole('status', { name: '保存状态', exact: true })).toHaveText(
      '已保存',
    );
    await settings.getByRole('button', { name: '关闭', exact: true }).click();
    await expect(settings).not.toBeVisible();
    await expect(query).toHaveValue('大量数据下的搜索草稿');
    await newTab.reload();
    await expect(newTab.getByRole('link', { name: '末尾网站已编辑', exact: true })).toHaveAttribute(
      'href',
      'https://example.test/stress/499',
    );
    await newTab.getByRole('button', { name: '设置', exact: true }).click();
    await settings.getByRole('button', { name: '图标与布局', exact: true }).click();
    await expect(
      settings.getByRole('switch', { name: '显示网站标题', exact: true }),
    ).not.toBeChecked();
    await settings.getByRole('button', { name: '关闭', exact: true }).click();
  });
}
