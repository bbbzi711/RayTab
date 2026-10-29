import { addSite, expect, test } from '../fixtures';
import { artworkSource } from '../artwork';

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
    const frame = newTab
      .getByRole('link', { name: app.title, exact: true })
      .last()
      .locator('.site-icon-frame');
    await expect(frame).toBeVisible();
    const source = await artworkSource(frame);
    expect(source.local, app.hostname).toBe(true);
    expect(source.vector || Math.min(source.width, source.height) >= 64, app.hostname).toBe(true);
  }
  await newTab.reload();
  for (const app of apps)
    await expect(
      newTab.getByRole('link', { name: app.title, exact: true }).last().locator('.site-icon-frame'),
    ).toBeVisible();

  await newTab.getByRole('link', { name: '贴吧', exact: true }).click({ button: 'right' });
  await newTab.getByRole('menuitem', { name: '编辑网站', exact: true }).click();
  const editor = newTab.getByRole('dialog', { name: '编辑网站', exact: true });
  expect((await artworkSource(editor.locator('.site-icon-frame'))).local).toBe(true);
  await editor.getByRole('button', { name: '获取网站图标', exact: true }).click();
  await expect(editor.getByRole('alert')).toHaveCount(0);

  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor).not.toBeVisible();
  await newTab.reload();
  await expect(
    newTab.getByRole('link', { name: '贴吧', exact: true }).locator('.site-icon-frame'),
  ).toBeVisible();
});
