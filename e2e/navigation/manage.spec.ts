import type { RayState } from '../../src/storage/model';
import { addSite, expect, test } from '../fixtures';
import { settle, noHorizontalOverflow } from '../helpers';
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
  await newTab.mouse.click(1150, 680, { button: 'right' });
  await newTab.getByRole('menuitem', { name: '进入简洁模式', exact: true }).click();
  await newTab.mouse.click(1150, 680, { button: 'right' });
  await expect(newTab.getByRole('menuitem', { name: '壁纸与主题', exact: true })).toBeVisible();
  await newTab.getByRole('menuitem', { name: '壁纸与主题', exact: true }).click();
  const settings = newTab.getByRole('dialog', { name: '设置', exact: true });
  await expect(settings.getByRole('combobox', { name: '主题', exact: true })).toBeVisible();
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  const input = newTab.getByRole('search').locator('input');
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
  await noHorizontalOverflow(confirmation.locator('[data-slot="dialog-description"]'));

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
  await newTab
    .locator('.desktop-workspace')
    .click({ button: 'right', position: { x: 1100, y: 750 } });
  await newTab.getByRole('menuitem', { name: '整理', exact: true }).click();
  const selected = newTab.locator('.site-card-main').first();
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
  await newTab.mouse.move(1100, 750);
  await settle(newTab);
  await newTab.keyboard.press('Escape');
  await expect(newTab.getByRole('button', { name: '完成', exact: true })).not.toBeVisible();
});

test('千个网站与百个文件夹下搜索、打开文件夹和设置仍可操作', async ({ newTab }) => {
  await newTab.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('raytab-v11');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      // This isolated database contains the state created by the extension fixture.
      // Reload below also exercises the application's persisted-state validation.
      const state = await new Promise<RayState>((resolve, reject) => {
        const request = db.transaction('state').objectStore('state').get('current');
        request.onsuccess = () => resolve(request.result as RayState);
        request.onerror = () => reject(request.error);
      });
      const groupId = state.spaces.normal.groups[0].id;
      const template = state.spaces.normal.sites[0];
      state.spaces.normal.folders = Array.from({ length: 100 }, (_, index) => ({
        id: `stress-folder-${index}`,
        groupId,
        name: `批量文件夹 ${index}`,
        order: index,
        createdAt: 0,
        updatedAt: 0,
        changeId: `stress-folder-change-${index}`,
      }));
      state.spaces.normal.sites = Array.from({ length: 1000 }, (_, index) => ({
        ...template,
        id: `stress-site-${index}`,
        changeId: `stress-site-change-${index}`,
        folderId: index < 500 ? null : `stress-folder-${index % 100}`,
        title: `批量网站 ${index}`,
        url: `https://example.test/stress/${index}`,
        icon: { source: 'text', text: 'S' },
        order: index,
      }));
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('state', 'readwrite');
        transaction.objectStore('state').put(state, 'current');
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      db.close();
    }
  });
  await newTab.reload();
  await expect(newTab.locator('.site-card')).toHaveCount(600);
  const query = newTab.getByRole('textbox', { name: '搜索内容', exact: true });
  await query.fill('大量数据下的搜索草稿');
  await expect(query).toHaveValue('大量数据下的搜索草稿');
  await newTab.getByRole('button', { name: '批量文件夹 0', exact: true }).click();
  const folder = newTab.getByRole('dialog', { name: '批量文件夹 0', exact: true });
  await expect(folder.locator('.site-card')).toHaveCount(5);
  await folder.getByRole('button', { name: '关闭', exact: true }).click();
  await newTab.getByRole('button', { name: '设置', exact: true }).click();
  const settings = newTab.getByRole('dialog', { name: '设置', exact: true });
  await settings.getByRole('button', { name: '图标与布局', exact: true }).click();
  await settings.getByRole('switch', { name: '显示网站标题', exact: true }).click();
  await expect(
    settings.getByRole('switch', { name: '显示网站标题', exact: true }),
  ).not.toBeChecked();
  await expect(settings.locator('.settings-autosave')).toHaveText('已保存');
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(settings).not.toBeVisible();
  await expect(query).toHaveValue('大量数据下的搜索草稿');
  await newTab.reload();
  await expect(newTab.locator('.site-card')).toHaveCount(600);
  await newTab.getByRole('button', { name: '设置', exact: true }).click();
  await settings.getByRole('button', { name: '图标与布局', exact: true }).click();
  await expect(
    settings.getByRole('switch', { name: '显示网站标题', exact: true }),
  ).not.toBeChecked();
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
});
