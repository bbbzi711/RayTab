import { addSite, expect, test } from '../fixtures';
import { openSettings, failNextWrite, settle, noHorizontalOverflow } from '../helpers';
test('提交保存失败保留搜索引擎输入，重试仅新增一次', async ({ newTab }) => {
  const settings = await openSettings(newTab, '搜索与时钟');
  const disclosure = settings.getByRole('button', { name: /^(添加|编辑)搜索引擎$/ });
  await expect(settings.getByLabel('搜索引擎名称', { exact: true })).not.toBeVisible();
  await disclosure.click();
  const form = settings.getByRole('form', { name: '编辑搜索引擎', exact: true });
  await expect(form.getByLabel('搜索引擎名称', { exact: true })).toBeFocused();
  await form.getByLabel('搜索引擎名称', { exact: true }).fill('失败重试引擎');
  await form.getByLabel('搜索引擎地址', { exact: true }).fill('https://search.example.test/?q=%s');
  await disclosure.click();
  await settings.getByRole('button', { name: '图标与布局', exact: true }).click();
  await settings.getByRole('button', { name: '搜索与时钟', exact: true }).click();
  await disclosure.click();
  await expect(form.getByLabel('搜索引擎名称', { exact: true })).toHaveValue('失败重试引擎');
  await expect(form.getByLabel('搜索引擎地址', { exact: true })).toHaveValue(
    'https://search.example.test/?q=%s',
  );
  await failNextWrite(newTab);
  await form.getByRole('button', { name: '添加', exact: true }).click();
  await expect(form.getByRole('alert')).toBeVisible();
  await expect(form.getByLabel('搜索引擎名称', { exact: true })).toHaveValue('失败重试引擎');
  await expect(settings.getByRole('button', { name: '失败重试引擎', exact: true })).toHaveCount(0);
  await form.getByRole('button', { name: '添加', exact: true }).click();
  await expect(form).not.toBeVisible();
  await expect(disclosure).toBeFocused();
  await disclosure.click();
  await expect(form.getByLabel('搜索引擎名称', { exact: true })).toHaveValue('');
  await disclosure.click();
  await expect(settings.getByRole('button', { name: '失败重试引擎', exact: true })).toHaveCount(1);
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  await newTab.reload();
  const reloaded = await openSettings(newTab, '搜索与时钟');
  await expect(reloaded.getByRole('button', { name: '失败重试引擎', exact: true })).toHaveCount(1);
  await reloaded.getByRole('button', { name: '编辑 必应', exact: true }).click();
  const name = reloaded.getByLabel('搜索引擎名称', { exact: true });
  await expect(name).toBeFocused();
  await reloaded.getByRole('button', { name: '编辑 Google', exact: true }).click();
  await expect(name).toHaveValue('Google');
  await expect(name).toBeFocused();
  await reloaded
    .getByRole('form', { name: '编辑搜索引擎', exact: true })
    .getByRole('button', { name: '取消', exact: true })
    .click();
  await expect(reloaded.getByRole('button', { name: /^(添加|编辑)搜索引擎$/ })).toBeFocused();
});

test('即时保存失败不影响其他页面，重试后跨页更新且重载保留结果', async ({
  newTab,
  context,
  extensionId,
}) => {
  const settings = await openSettings(newTab, '图标与布局');
  const slider = settings.getByRole('slider', { name: '图标间距', exact: true });
  const before = await slider.getAttribute('aria-valuenow');
  const other = await context.newPage();
  await other.goto(`chrome-extension://${extensionId}/newtab.html`);
  const otherSettings = await openSettings(other, '图标与布局');
  const otherSlider = otherSettings.getByRole('slider', { name: '图标间距', exact: true });
  await failNextWrite(newTab);
  await slider.focus();
  await slider.press('ArrowRight');
  await expect(settings.getByRole('button', { name: '重试保存', exact: true })).toBeVisible();
  await expect(otherSlider).toHaveAttribute('aria-valuenow', before!);
  const preview = Number(await slider.getAttribute('aria-valuenow'));
  await settings.getByRole('button', { name: '重试保存', exact: true }).click();
  await expect(settings.getByRole('button', { name: '重试保存', exact: true })).not.toBeVisible();
  await expect(otherSlider).toHaveAttribute('aria-valuenow', String(preview));
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  await newTab.reload();
  const reloaded = await openSettings(newTab, '图标与布局');
  await expect(reloaded.getByRole('slider', { name: '图标间距', exact: true })).toHaveAttribute(
    'aria-valuenow',
    String(preview),
  );
});

test('私密偏好整体恢复需要确认，保留私密网站并在重载后跟随普通空间', async ({ newTab }) => {
  const normal = await openSettings(newTab, '图标与布局');
  const baseline = await normal
    .getByRole('slider', { name: '图标间距', exact: true })
    .getAttribute('aria-valuenow');
  await normal.getByRole('button', { name: '关闭', exact: true }).click();

  await newTab.getByRole('button', { name: '私密空间', exact: true }).click();
  await addSite(newTab, '恢复偏好保留的网站', 'https://private-preferences.example.test');
  const settings = await openSettings(newTab, '图标与布局');
  const slider = settings.getByRole('slider', { name: '图标间距', exact: true });
  await slider.focus();
  await slider.press('ArrowRight');
  await settings.getByRole('switch', { name: '显示网站标题', exact: true }).click();
  await expect(settings.getByRole('status', { name: '自动保存', exact: true })).toHaveText(
    '已保存',
  );
  const privateSpacing = await slider.getAttribute('aria-valuenow');
  await expect(
    settings.getByRole('switch', { name: '显示网站标题', exact: true }),
  ).not.toBeChecked();
  await settings.getByRole('button', { name: '通用', exact: true }).click();
  const reset = settings.getByRole('button', { name: '恢复普通空间偏好', exact: true });
  await reset.click();
  const confirmation = newTab.getByRole('alertdialog', { name: '恢复普通空间偏好？', exact: true });
  await confirmation.getByRole('button', { name: '取消', exact: true }).click();
  await settings.getByRole('button', { name: '图标与布局', exact: true }).click();
  await expect(slider).toHaveAttribute('aria-valuenow', privateSpacing!);
  await expect(
    settings.getByRole('switch', { name: '显示网站标题', exact: true }),
  ).not.toBeChecked();
  await settings.getByRole('button', { name: '通用', exact: true }).click();
  await reset.click();
  await confirmation.getByRole('button', { name: '恢复普通空间偏好', exact: true }).click();
  await expect(reset).toBeDisabled();
  await settings.getByRole('button', { name: '图标与布局', exact: true }).click();
  await expect(slider).toHaveAttribute('aria-valuenow', baseline ?? '');
  await expect(settings.getByRole('switch', { name: '显示网站标题', exact: true })).toBeChecked();
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  await newTab.reload();
  await expect(newTab.getByRole('link', { name: '恢复偏好保留的网站', exact: true })).toBeVisible();
  const reloaded = await openSettings(newTab, '图标与布局');
  await expect(reloaded.getByRole('slider', { name: '图标间距', exact: true })).toHaveAttribute(
    'aria-valuenow',
    baseline ?? '',
  );
  await reloaded.getByRole('button', { name: '关闭', exact: true }).click();
  await newTab.getByRole('button', { name: '普通空间', exact: true }).click();
  const ordinary = await openSettings(newTab, '图标与布局');
  await expect(ordinary.getByRole('slider', { name: '图标间距', exact: true })).toHaveAttribute(
    'aria-valuenow',
    baseline!,
  );
  await expect(ordinary.getByRole('switch', { name: '显示网站标题', exact: true })).toBeChecked();
});

test('设置表单在栏目间保留草稿，关闭时确认放弃', async ({ newTab }) => {
  const settings = await openSettings(newTab, '同步');
  await expect(settings.getByText('尚未设置同步', { exact: true })).toBeVisible();
  await expect(settings.getByLabel('服务器地址', { exact: true })).not.toBeVisible();
  await settings.getByRole('button', { name: '配置同步', exact: true }).click();
  await settings
    .getByLabel('服务器地址', { exact: true })
    .fill('https://dav.example.test/draft.json');
  await settings.getByRole('button', { name: '收起配置', exact: true }).click();
  await expect(settings.getByLabel('服务器地址', { exact: true })).not.toBeVisible();
  await settings.getByRole('button', { name: '配置同步', exact: true }).click();
  await settings.getByRole('button', { name: '图标与布局', exact: true }).click();
  await settings.getByRole('button', { name: '同步', exact: true }).click();
  await expect(settings.getByLabel('服务器地址', { exact: true })).toHaveValue(
    'https://dav.example.test/draft.json',
  );
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  const confirmation = newTab.getByRole('alertdialog');
  await confirmation.getByRole('button', { name: '继续编辑', exact: true }).click();
  await expect(settings).toBeVisible();
  await expect(settings.getByLabel('服务器地址', { exact: true })).toHaveValue(
    'https://dav.example.test/draft.json',
  );
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  await newTab
    .getByRole('alertdialog')
    .getByRole('button', { name: '放弃更改', exact: true })
    .click();
  await expect(settings).not.toBeVisible();
});

test('语言设置立即更新产品文案并在 Popup 和重载后生效', async ({
  newTab,
  context,
  extensionId,
}) => {
  const settings = await openSettings(newTab, '通用');
  await settings.getByRole('combobox', { name: '语言', exact: true }).click();
  await newTab.getByRole('option', { name: 'English', exact: true }).click();
  await expect(newTab.getByRole('dialog', { name: 'Settings', exact: true })).toBeVisible();
  await newTab.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await newTab.reload();
  await expect(newTab.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.getByLabel('Name', { exact: true })).toBeVisible();
  await expect(popup.getByRole('button', { name: 'Add site', exact: true })).toBeVisible();
});

test('英文设置在横向小窗口和320px内保留可达分类与关闭入口', async ({ newTab }) => {
  await newTab.setViewportSize({ width: 640, height: 360 });
  await newTab.getByRole('button', { name: '设置', exact: true }).click();
  const settings = newTab.getByRole('dialog');
  await settings.getByRole('combobox', { name: '语言', exact: true }).click();
  await newTab.getByRole('option', { name: 'English', exact: true }).click();
  await settings.getByRole('button', { name: 'Search and clock', exact: true }).click();
  for (const width of [640, 320]) {
    await newTab.setViewportSize({ width, height: 360 });
    await settle(newTab);
    const category = settings.getByRole('button', { name: 'Search and clock', exact: true });
    await expect(category).toBeInViewport({ ratio: 1 });
    expect((await category.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(settings.getByRole('button', { name: 'Close', exact: true })).toBeInViewport({
      ratio: 1,
    });
    await noHorizontalOverflow(settings);
  }
  await settings.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(settings).not.toBeVisible();
});
