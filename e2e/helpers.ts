import type { Page, Locator } from '@playwright/test';
import { z } from 'zod';
import { expect } from './fixtures';

export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
export async function openSettings(page: Page, category: string) {
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '设置', exact: true });
  await dialog.getByRole('tab', { name: category, exact: true }).click();
  return dialog;
}

export async function addGroup(page: Page, name: string) {
  await page.getByRole('button', { name: '添加分组', exact: true }).click();
  const naming = page.getByRole('dialog', { name: '新建分组', exact: true });
  await naming.getByLabel('名称', { exact: true }).fill(name);
  await naming.getByRole('button', { name: '保存', exact: true }).click();
  await expect(naming).not.toBeVisible();
}

/** Encrypt an existing named group through the real shared-password UI. */
export async function encryptGroup(page: Page, name: string, password: string) {
  await page.getByRole('button', { name: '主页', exact: true }).click();
  const settings = await openSettings(page, '通用');
  const row = settings.getByRole('listitem').filter({ has: page.getByText(name, { exact: true }) });
  await row.getByRole('button', { name: '加密', exact: true }).click();
  const creating = page.getByRole('dialog', { name: '设置分组加密密码', exact: true });
  await creating.getByLabel('输入私密分组密码', { exact: true }).fill(password);
  await creating.getByRole('button', { name: '加密', exact: true }).click();
  await expect(creating).not.toBeVisible();
  await expect(row.getByRole('button', { name: '取消加密', exact: true })).toBeVisible();
  await expect(
    settings.getByText('加密分组已锁定。解锁后可以修改或移除共用密码。', { exact: true }),
  ).toBeVisible();
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
}

export async function unlockGroup(page: Page, name: string, password: string) {
  await page.getByRole('button', { name, exact: true }).click();
  const unlock = page.getByRole('dialog', { name: '解锁私密分组', exact: true });
  await unlock.getByLabel('输入私密分组密码', { exact: true }).fill(password);
  await unlock.getByRole('button', { name: '解锁', exact: true }).click();
  await expect(unlock).not.toBeVisible();
  await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
}

export async function openIconOptions(editor: Locator) {
  await editor.getByRole('button', { name: '图标与外观', exact: true }).click();
}

export async function openDesktopMenu(page: Page) {
  const workspace = page.getByTestId('desktop');
  const bounds = await workspace.boundingBox();
  if (!bounds) throw new Error('The desktop must be visible.');
  await workspace.click({
    button: 'right',
    position: { x: bounds.width - 12, y: bounds.height - 12 },
  });
}

export async function failNextWrite(page: Page) {
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    let pending = true;
    IDBDatabase.prototype.transaction = function (
      this: IDBDatabase,
      ...args: Parameters<typeof original>
    ) {
      if (pending && args[1] === 'readwrite') {
        pending = false;
        throw new DOMException('E2E injected write failure', 'QuotaExceededError');
      }
      return Reflect.apply(original, this, args);
    };
  });
}

export async function settle(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  // Replaced CSS transitions may become idle with a fresh, unresolved `finished`
  // promise. Poll live state instead; infinite loading indicators cannot settle.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document
            .getAnimations()
            .filter(
              (animation) =>
                (animation.pending || animation.playState === 'running') &&
                Number.isFinite(animation.effect?.getComputedTiming().endTime),
            ).length,
      ),
    )
    .toBe(0);
}
export async function noHorizontalOverflow(element: Locator) {
  expect(await element.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
}

/** Read the supported backup output, without depending on IndexedDB stores or records. */
export async function exportNormalBackup(page: Page) {
  const settings = await openSettings(page, '数据备份');
  await settings.getByRole('button', { name: '导出备份', exact: true }).click();
  await settings.getByRole('combobox', { name: '导出范围', exact: true }).click();
  await page.getByRole('option', { name: '普通空间', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await settings.getByRole('button', { name: '导出所选备份', exact: true }).click();
  const stream = await (await downloading).createReadStream();
  if (!stream) throw new Error('The backup download must be readable.');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const backup = parseNormalBackup(Buffer.concat(chunks).toString('utf8'));
  await settings.getByRole('button', { name: '关闭', exact: true }).click();
  return backup;
}

export function parseNormalBackup(text: string) {
  const document = z
    .object({
      format: z.literal('raytab-backup'),
      spaces: z.object({
        normal: z.object({
          data: z.object({
            sites: z.array(
              z.object({
                title: z.string(),
                url: z.string(),
                icon: z.object({ source: z.string(), resourceId: z.string().optional() }),
                iconBackground: z.object({ mode: z.string() }),
              }),
            ),
          }),
          resources: z.array(z.object({ id: z.string(), type: z.string(), data: z.string() })),
        }),
      }),
    })
    .parse(JSON.parse(text));
  return document.spaces.normal;
}

export async function readSiteImage(page: Page, title: string) {
  const backup = await exportNormalBackup(page);
  const site = backup.data.sites.find((item) => item.title === title);
  const id = site && 'resourceId' in site.icon ? site.icon.resourceId : undefined;
  const resource = backup.resources.find((item) => item.id === id);
  if (!resource) throw new Error(`The backup must include the displayed image for ${title}`);
  return { type: resource.type, text: Buffer.from(resource.data, 'base64').toString('utf8') };
}
