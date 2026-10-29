import { addSite, expect, test } from '../fixtures';

// Brand colors are content: selecting a tile background must not recolor the artwork.
async function brandColor(link: import('@playwright/test').Locator) {
  return link.locator('.icon-artwork').evaluate((element) => {
    const graphic = element.querySelector('svg, img');
    if (!graphic) throw new Error('Expected brand artwork');
    return graphic instanceof SVGElement
      ? getComputedStyle(graphic).fill
      : graphic.getAttribute('src');
  });
}

test('品牌底色独立保存，重新打开和重载不改变图形颜色或产品身份', async ({ newTab, context }) => {
  await addSite(newTab, 'Gemini 产品', 'https://gemini.google.com/app');
  const gemini = newTab.getByRole('link', { name: 'Gemini 产品', exact: true });
  const google = newTab.getByRole('link', { name: 'Google', exact: true });
  expect(await brandColor(gemini)).not.toEqual(await brandColor(google));
  const youtube = newTab.getByRole('link', { name: 'YouTube', exact: true });
  const original = await brandColor(youtube);
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
  expect(await brandColor(youtube)).toBe(original);
  await youtube.click({ button: 'right' });
  await newTab.getByRole('menuitem', { name: '编辑网站', exact: true }).click();
  await expect(editor.getByRole('button', { name: '绿色', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
