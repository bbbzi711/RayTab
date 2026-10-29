import { addSite, expect, test } from '../fixtures';
import { paintedArtwork } from '../artwork';

test('品牌底色独立保存，重新打开和重载不改变图形颜色或产品身份', async ({ newTab, context }) => {
  await addSite(newTab, 'Gemini 产品', 'https://gemini.google.com/app');
  const gemini = newTab.getByRole('link', { name: 'Gemini 产品', exact: true });
  const google = newTab.getByRole('link', { name: 'Google', exact: true });
  expect((await paintedArtwork(gemini.locator('.site-icon-frame'))).palette).not.toEqual(
    (await paintedArtwork(google.locator('.site-icon-frame'))).palette,
  );
  const youtube = newTab.getByRole('link', { name: 'YouTube', exact: true });
  const original = (await paintedArtwork(youtube.locator('.site-icon-frame'))).dominant;
  expect(original).toBeDefined();
  await youtube.click({ button: 'right' });
  await newTab.getByRole('menuitem', { name: '编辑网站', exact: true }).click();
  const editor = newTab.getByRole('dialog', { name: '编辑网站', exact: true });
  await editor
    .getByRole('group', { name: '图标底色', exact: true })
    .getByRole('button', { name: '绿色', exact: true })
    .click();
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor).not.toBeVisible();
  await context.setOffline(true);
  await newTab.reload();
  expect((await paintedArtwork(youtube.locator('.site-icon-frame'))).dominant).toBe(original);
  await youtube.click({ button: 'right' });
  await newTab.getByRole('menuitem', { name: '编辑网站', exact: true }).click();
  await expect(editor.getByRole('button', { name: '绿色', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
