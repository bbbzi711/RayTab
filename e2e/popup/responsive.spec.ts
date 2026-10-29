import { expect, test } from '../fixtures';
import { settle, noHorizontalOverflow } from '../helpers';
test('Popup 首屏表单和主操作完整可达，明暗主题均无横向溢出', async ({ context, extensionId }) => {
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 350, height: 420 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  for (const name of ['名称', '网址', '存入位置']) {
    await expect(popup.getByLabel(name, { exact: true })).toBeInViewport({ ratio: 1 });
  }
  for (const name of ['打开主页', '添加网站']) {
    await expect(popup.getByRole('button', { name, exact: true })).toBeInViewport({ ratio: 1 });
  }
  const noHorizontalOverflow = () =>
    popup.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  expect(await noHorizontalOverflow()).toBe(true);
  await settle(popup);

  await popup.emulateMedia({ colorScheme: 'dark' });
  await settle(popup);
  expect(await noHorizontalOverflow()).toBe(true);
});

test('小高度Popup可用滚轮到达底部操作，不丢失已填内容', async ({ context, extensionId }) => {
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 350, height: 300 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.getByLabel('名称', { exact: true }).fill('小高度Popup草稿');
  await popup.mouse.move(175, 240);
  await popup.mouse.wheel(0, 600);
  await expect
    .poll(() => popup.evaluate(() => document.scrollingElement?.scrollTop ?? 0))
    .toBeGreaterThan(0);
  await expect(popup.getByRole('button', { name: '添加网站', exact: true })).toBeInViewport({
    ratio: 1,
  });
  await noHorizontalOverflow(popup.locator('html'));

  await popup.getByLabel('名称', { exact: true }).scrollIntoViewIfNeeded();
  await expect(popup.getByLabel('名称', { exact: true })).toHaveValue('小高度Popup草稿');
});
