import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../fixtures';
import { noHorizontalOverflow, settle } from '../helpers';

async function assertNotificationUsable(notification: Locator, page: Page) {
  await expect(notification).toBeVisible();
  await settle(page);
  await expect(notification).toBeInViewport({ ratio: 1 });
  await noHorizontalOverflow(notification);
  const bounds = (await notification.boundingBox())!;
  // Notifications belong in the upper area, without fixing the theme's padding or coordinates.
  expect(bounds.y + bounds.height).toBeLessThan(page.viewportSize()!.height / 3);
  await expect
    .poll(() =>
      notification.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return [0.25, 0.5, 0.75].every((x) =>
          node.contains(
            document.elementFromPoint(rect.x + rect.width * x, rect.y + rect.height / 2),
          ),
        );
      }),
    )
    .toBe(true);
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 320, height: 640 },
]) {
  test(`设置中的通知可读且不阻挡操作，嵌套确认可取消（${viewport.width}px）`, async ({
    newTab,
  }) => {
    await newTab.setViewportSize(viewport);
    await newTab.getByRole('button', { name: '设置', exact: true }).click();
    const settings = newTab.getByRole('dialog', { name: '设置', exact: true });
    await settings.getByRole('button', { name: '同步', exact: true }).click();
    await settings.getByRole('button', { name: '配置同步', exact: true }).click();
    await settings.getByLabel('服务器地址', { exact: true }).fill('https://dav.example.test/');
    await settings.getByRole('switch', { name: '自动双向同步', exact: true }).click();
    await settings.getByRole('button', { name: '保存连接', exact: true }).click();
    const notification = newTab.locator('[data-sonner-toast]').filter({ hasText: '连接已保存' });
    await expect(notification).toHaveCount(1);
    await assertNotificationUsable(notification, newTab);
    await settings.getByRole('button', { name: '双向同步', exact: true }).click({ trial: true });
    await settings.locator('summary', { hasText: '高级操作' }).click();
    await settings.getByRole('button', { name: '清除连接', exact: true }).click();
    const confirmation = newTab.getByRole('alertdialog');
    await expect(confirmation).toBeInViewport({ ratio: 1 });
    await noHorizontalOverflow(confirmation);
    await expect
      .poll(() => confirmation.evaluate((node) => node.contains(document.activeElement)))
      .toBe(true);
    await confirmation.getByRole('button', { name: '取消', exact: true }).click();
    await expect(confirmation).not.toBeVisible();
    await expect(settings).toBeVisible();
    await expect(settings.getByRole('button', { name: '双向同步', exact: true })).toBeEnabled();
  });
}

test('Popup 失败通知在滚动后仍可读，表单和主操作保持可用', async ({ context, extensionId }) => {
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 350, height: 420 });
  await popup.emulateMedia({ colorScheme: 'dark' });
  await popup.addInitScript(() => {
    const api = (globalThis as typeof globalThis & { chrome: typeof browser }).chrome;
    api.tabs.create = () => Promise.reject(new Error('errors.invalidInput'));
  });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.getByLabel('名称', { exact: true }).fill('失败后保留的草稿');
  await popup.getByRole('button', { name: '打开主页', exact: true }).click();
  const notification = popup.locator('[data-sonner-toast]').last();
  await notification.hover();
  await assertNotificationUsable(notification, popup);
  await popup.getByLabel('名称', { exact: true }).scrollIntoViewIfNeeded();
  await assertNotificationUsable(notification, popup);
  await expect(popup.getByLabel('名称', { exact: true })).toHaveValue('失败后保留的草稿');
  await popup.getByRole('button', { name: '添加网站', exact: true }).click({ trial: true });
});
