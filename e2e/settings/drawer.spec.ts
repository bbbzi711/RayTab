import { expect, test } from '../fixtures';
import { openSettings, settle } from '../helpers';

test('设置抽屉覆盖首页且不改变几何位置，关闭按钮、Esc 和外部点击均恢复焦点', async ({ newTab }) => {
  await newTab.setViewportSize({ width: 1440, height: 900 });
  await settle(newTab);
  const trigger = newTab.getByRole('button', { name: '设置', exact: true });
  const drawer = newTab.getByRole('dialog', { name: '设置', exact: true });
  const elements = [
    newTab.getByRole('region', { name: '时钟', exact: true, includeHidden: true }),
    newTab.getByRole('search', { includeHidden: true }),
    newTab.getByTestId('site-navigation'),
  ];
  const geometry = () => Promise.all(elements.map((element) => element.boundingBox()));
  const before = await geometry();
  expect(before.every(Boolean)).toBe(true);

  for (const method of ['button', 'escape', 'outside']) {
    await openSettings(newTab, '通用');
    await settle(newTab);
    expect(await drawer.boundingBox()).toEqual({ x: 990, y: 0, width: 450, height: 900 });
    expect(await geometry()).toEqual(before);
    const overlay = newTab.locator('[data-slot="dialog-overlay"]');
    await expect(overlay).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(overlay).toHaveCSS('backdrop-filter', 'none');

    if (method === 'button')
      await drawer.getByRole('button', { name: '关闭', exact: true }).click();
    else if (method === 'escape') await newTab.keyboard.press('Escape');
    else await newTab.mouse.click(200, 700);
    await expect(drawer).not.toBeVisible();
    await settle(newTab);
    expect(await geometry()).toEqual(before);
    await expect(trigger).toBeFocused();
  }
});

test('设置抽屉保持键盘焦点，嵌套选择及输入法 Escape 不误关闭', async ({ newTab }) => {
  const drawer = await openSettings(newTab, '通用');
  await settle(newTab);
  const general = drawer.getByRole('tab', { name: '通用', exact: true });
  await expect(general).toBeFocused();
  await general.press('ArrowUp');
  await expect(drawer.getByRole('tab', { name: '数据备份', exact: true })).toBeFocused();
  await newTab.keyboard.press('Home');
  await expect(general).toBeFocused();

  for (const key of ['Tab', 'Shift+Tab']) {
    for (let index = 0; index < 16; index += 1) {
      await newTab.keyboard.press(key);
      await expect
        .poll(() => drawer.evaluate((node) => node.contains(document.activeElement)))
        .toBe(true);
    }
  }

  const language = drawer.getByRole('combobox', { name: '语言', exact: true });
  await language.click();
  await expect(newTab.getByRole('listbox')).toBeVisible();
  await newTab.keyboard.press('Escape');
  await expect(newTab.getByRole('listbox')).not.toBeVisible();
  await expect(drawer).toBeVisible();
  await expect(language).toBeFocused();
  await language.dispatchEvent('keydown', { key: 'Escape', code: 'Escape', isComposing: true });
  await settle(newTab);
  await expect(drawer).toBeVisible();
  await expect(language).toBeFocused();
  await language.press('Escape');
  await expect(drawer).not.toBeVisible();
  await expect(newTab.getByRole('button', { name: '设置', exact: true })).toBeFocused();
});
