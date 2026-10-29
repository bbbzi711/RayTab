import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../fixtures';

async function settle(element: Locator) {
  await element.evaluate(async (node) => {
    await Promise.all(node.getAnimations().map((animation) => animation.finished));
  });
}

async function assertCenteredInViewport(element: Locator, page: Page) {
  await settle(element);
  const bounds = (await element.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(bounds.x + bounds.width / 2).toBeCloseTo(viewport.width / 2, 0);
  expect(viewport.height - bounds.y - bounds.height).toBeGreaterThanOrEqual(15);
  expect(bounds.y + bounds.height / 2).toBeCloseTo(viewport.height / 2, 0);
  await expect(element).toBeInViewport({ ratio: 1 });
}

async function assertNotificationPosition(notification: Locator, page: Page) {
  await expect(notification).toBeVisible();
  await settle(notification);
  const bounds = (await notification.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(bounds.x + bounds.width / 2).toBeCloseTo(viewport.width / 2, 0);
  expect(bounds.y).toBeGreaterThanOrEqual(15);
  expect(bounds.y).toBeLessThanOrEqual(25);
  await expect(notification).toBeInViewport({ ratio: 1 });
  // A bounding box alone passes even when a modal overlay paints above the toast.
  await expect
    .poll(() =>
      notification.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return node.contains(
          document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
        );
      }),
    )
    .toBe(true);
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 320, height: 640 },
])
  test(`同步通知和嵌套确认框的位置（${viewport.width}px）`, async ({ newTab }, testInfo) => {
    await newTab.setViewportSize(viewport);
    await newTab.getByRole('button', { name: '设置', exact: true }).click();
    const settings = newTab.getByRole('dialog', { name: '设置', exact: true });
    await settings.getByRole('button', { name: '同步', exact: true }).click();
    await settings.getByRole('button', { name: '配置同步', exact: true }).click();
    await settings.getByLabel('服务器地址', { exact: true }).fill('https://dav.example.test/');
    await settings.getByRole('switch', { name: '自动双向同步', exact: true }).click();
    await settings.getByRole('button', { name: '保存连接', exact: true }).click();
    const notification = newTab.locator('[data-sonner-toast]').filter({ hasText: '连接已保存' });
    await assertNotificationPosition(notification, newTab);
    await expect(newTab.locator('[data-sonner-toast]')).toHaveCount(1);
    await notification.click();
    await expect(settings).toBeVisible();

    await settings.locator('summary', { hasText: '高级操作' }).click();
    await settings.getByRole('button', { name: '清除连接', exact: true }).click();
    const confirmation = newTab.getByRole('alertdialog');
    await expect(confirmation).toBeVisible();
    await assertCenteredInViewport(confirmation, newTab);

    await confirmation.getByRole('button', { name: '取消', exact: true }).click();
    await expect(settings).toBeVisible();
    await expect(settings.getByRole('button', { name: '双向同步', exact: true })).toBeEnabled();
  });

test('Popup 操作通知保持在视口内，表单滚动后不偏移', async ({ context, extensionId }, testInfo) => {
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 350, height: 420 });
  await popup.emulateMedia({ colorScheme: 'dark' });
  await popup.addInitScript(() => {
    const api = (globalThis as typeof globalThis & { chrome: typeof browser }).chrome;
    api.tabs.create = () => Promise.reject(new Error('errors.invalidInput'));
  });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.getByRole('button', { name: '打开主页', exact: true }).click();
  const notification = popup.locator('[data-sonner-toast]').last();
  await assertNotificationPosition(notification, popup);
  await expect(popup.locator('[data-sonner-toaster]')).toHaveAttribute('data-sonner-theme', 'dark');
  await notification.hover();
  const bounds = (await notification.boundingBox())!;
  await popup.getByLabel('名称', { exact: true }).scrollIntoViewIfNeeded();
  await assertNotificationPosition(notification, popup);
  expect((await notification.boundingBox())!.y).toBeCloseTo(bounds.y, 0);
});
