import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';
import { openSettings, settle } from '../helpers';

async function surfaces(page: Page) {
  await page.mouse.move(0, 0);
  await settle(page);
  return Promise.all(
    [
      page.getByRole('search', { includeHidden: true }),
      page.getByRole('tablist', { name: '设置分类', exact: true }),
      page.getByRole('toolbar', { name: '主题', exact: true }),
    ].map((element) =>
      element.evaluate((node) => {
        const style = getComputedStyle(node);
        return { background: style.backgroundColor, color: style.color, border: style.borderColor };
      }),
    ),
  );
}

test('跟随系统的搜索和设置与手动主题一致，系统切换及重载保持可用', async ({ newTab }) => {
  const settings = await openSettings(newTab, '主题壁纸');
  const theme = settings.getByRole('toolbar', { name: '主题', exact: true });
  const choose = async (label: string) => {
    const choice = theme.getByRole('button', { name: label, exact: true });
    await choice.click();
    await expect(choice).toHaveAttribute('aria-pressed', 'true');
    await expect(theme.locator('[aria-pressed="true"]')).toHaveCount(1);
  };

  await choose('明亮');
  const light = await surfaces(newTab);
  const lightChoice = theme.getByRole('button', { name: '明亮', exact: true });
  const darkChoice = theme.getByRole('button', { name: '深色', exact: true });
  await lightChoice.focus();
  await lightChoice.press('ArrowRight');
  await expect(darkChoice).toBeFocused();
  await expect(lightChoice).toHaveAttribute('aria-pressed', 'true');
  await darkChoice.press('Space');
  await expect(darkChoice).toHaveAttribute('aria-pressed', 'true');
  await darkChoice.press('Space');
  await expect(darkChoice).toHaveAttribute('aria-pressed', 'true');
  await expect(theme.locator('[aria-pressed="true"]')).toHaveCount(1);
  const dark = await surfaces(newTab);
  expect(dark).not.toEqual(light);
  await choose('跟随系统');
  await newTab.emulateMedia({ colorScheme: 'dark' });
  expect(await surfaces(newTab)).toEqual(dark);
  await newTab.emulateMedia({ colorScheme: 'light' });
  expect(await surfaces(newTab)).toEqual(light);
  const systemChoice = theme.getByRole('button', { name: '跟随系统', exact: true });
  await expect(systemChoice).toHaveAttribute('aria-pressed', 'true');
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  await newTab.reload();
  await openSettings(newTab, '主题壁纸');
  await expect(systemChoice).toBeEnabled();
  await expect(systemChoice).toHaveAttribute('aria-pressed', 'true');
  await expect(theme.locator('[aria-pressed="true"]')).toHaveCount(1);
});
