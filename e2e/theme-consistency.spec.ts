import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

async function settleTheme(page: Page) {
  await page.mouse.move(0, 0);
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await Promise.allSettled(document.getAnimations().map((animation) => animation.finished));
  });
}

async function surfaces(page: Page) {
  await settleTheme(page);
  return page.evaluate(() =>
    ['.search-shell', '.settings-sidebar', '.settings-select-trigger'].map((selector) => {
      const element = document.querySelector(selector)!;
      const style = getComputedStyle(element);
      return {
        background: style.backgroundColor,
        color: style.color,
        border: style.borderColor,
      };
    }),
  );
}

test('跟随系统的搜索和设置与手动主题一致，系统切换及重载保持可用', async ({ newTab }) => {
  await newTab.getByRole('button', { name: '设置', exact: true }).click();
  const settings = newTab.getByRole('dialog', { name: '设置', exact: true });
  await settings.getByRole('button', { name: '壁纸与主题', exact: true }).click();
  const theme = settings.getByRole('combobox', { name: '主题', exact: true });
  const choose = async (label: string, value: string) => {
    await theme.click();
    await newTab.getByRole('option', { name: label, exact: true }).click();
    await expect
      .poll(() => newTab.evaluate(() => document.documentElement.dataset.theme))
      .toBe(value);
  };

  await choose('明亮', 'light');
  const light = await surfaces(newTab);
  await choose('深色', 'dark');
  const dark = await surfaces(newTab);
  expect(dark).not.toEqual(light);
  await choose('跟随系统', 'system');
  await newTab.emulateMedia({ colorScheme: 'dark' });
  expect(await surfaces(newTab)).toEqual(dark);
  await newTab.emulateMedia({ colorScheme: 'light' });
  expect(await surfaces(newTab)).toEqual(light);
  await expect(theme).toHaveText('跟随系统');
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  await newTab.reload();
  await expect
    .poll(() => newTab.evaluate(() => document.documentElement.dataset.theme))
    .toBe('system');
  await newTab.getByRole('button', { name: '设置', exact: true }).click();
  await settings.getByRole('button', { name: '壁纸与主题', exact: true }).click();
  await expect(theme).toBeEnabled();
  await expect(theme).toHaveText('跟随系统');
});
