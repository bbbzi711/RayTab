import { addSite, expect, test } from '../fixtures';
import { openSettings, settle, noHorizontalOverflow } from '../helpers';

for (const viewport of [
  { width: 320, height: 360 },
  { width: 768, height: 900 },
  { width: 1440, height: 900 },
]) {
  test(`设置可操作、布局即时预览并保存重载（${viewport.width}px）`, async ({ newTab }) => {
    await addSite(newTab, '布局网站', 'https://layout.example.test');
    await newTab.setViewportSize(viewport);
    const settings = await openSettings(newTab, '图标与布局');
    await settle(newTab);
    await noHorizontalOverflow(settings);
    await expect(settings.getByRole('button', { name: '关闭', exact: true })).toBeInViewport({
      ratio: 1,
    });
    const icon = newTab
      .getByRole('link', { name: '布局网站', exact: true, includeHidden: true })
      .locator('.site-icon-frame');
    const before = (await icon.boundingBox())!.width;
    const size = settings.getByRole('slider', { name: '图标大小', exact: true });
    const initial = Number(await size.getAttribute('aria-valuenow'));
    await size.focus();
    await size.press('ArrowRight');
    await expect.poll(async () => (await icon.boundingBox())!.width).toBeGreaterThan(before);
    const saved = Number(await size.getAttribute('aria-valuenow'));
    expect(saved).toBeGreaterThan(initial);
    await expect(settings.locator('.settings-autosave')).toHaveText('已保存');
    await settings.getByRole('button', { name: '关闭', exact: true }).click();
    await newTab.reload();
    const reopened = await openSettings(newTab, '图标与布局');
    await expect(reopened.getByRole('slider', { name: '图标大小', exact: true })).toHaveAttribute(
      'aria-valuenow',
      String(saved),
    );
    await reopened.getByRole('button', { name: '搜索与时钟', exact: true }).click();
    await expect(reopened.getByRole('button', { name: '搜索与时钟', exact: true })).toBeFocused();
    await reopened.getByRole('button', { name: '关闭', exact: true }).click();
    await expect(reopened).not.toBeVisible();
  });
}
