import { addSite, expect, test } from '../fixtures';

import regionalApps from '../../scripts/app-brand-sources.json' with { type: 'json' };

test('国内常用网站本地高清图标覆盖，贴吧编辑与保存离线可用', async ({ newTab, context }) => {
  test.setTimeout(60_000);
  const apps = regionalApps.map((app) => ({
    ...app,
    title: app.hostname === 'aliyundrive.com' ? `${app.title}旧域名` : app.title,
  }));
  await context.setOffline(true);
  for (const app of apps) {
    await addSite(newTab, app.title, `https://${app.hostname}`);
    const image = newTab
      .getByRole('link', { name: app.title, exact: true })
      .last()
      .locator('.icon-artwork');
    await expect(image).toBeVisible();
    expect(
      await image.evaluate(async (element) => {
        const image = element.querySelector('img');
        if (image) await image.decode();
        return {
          present: Boolean(image || element.querySelector('svg path')),
          local: !image || image.src.startsWith(location.origin),
          clear: !image || Math.min(image.naturalWidth, image.naturalHeight) >= 64,
        };
      }),
    ).toEqual({ present: true, local: true, clear: true });
  }
  await newTab.reload();
  for (const app of apps)
    await expect(
      newTab.getByRole('link', { name: app.title, exact: true }).last().locator('.icon-artwork'),
    ).toBeVisible();

  await newTab.getByRole('link', { name: '贴吧', exact: true }).click({ button: 'right' });
  await newTab.getByRole('menuitem', { name: '编辑网站', exact: true }).click();
  const editor = newTab.getByRole('dialog', { name: '编辑网站', exact: true });
  await expect(editor.locator('.site-edit-preview img')).toBeVisible();
  await expect(editor.locator('.site-edit-palette')).toHaveCount(0);
  await editor.getByRole('button', { name: '获取网站图标', exact: true }).click();
  await expect(editor.getByRole('alert')).toHaveCount(0);

  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor).not.toBeVisible();
  await newTab.reload();
  await expect(
    newTab.getByRole('link', { name: '贴吧', exact: true }).locator('img'),
  ).toBeVisible();
});
